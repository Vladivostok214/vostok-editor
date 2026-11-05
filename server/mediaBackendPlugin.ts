import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execSync, spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildFFmpegVolumeExpression } from '../src/lib/keyframeEngine';
import { resolveStorageDirs } from './storageConfig';

const execFileAsync = promisify(execFile);

interface ActiveExportJob {
  exportId: string;
  jobDir: string;
  tempVideoOnlyPath: string;
  fps: number;
  useGpu: boolean;
  encoder: 'h264_vaapi' | 'libx264';
  ffmpegProc: ChildProcessWithoutNullStreams | null;
  ffmpegPromise: Promise<void> | null;
  pipeFailed: boolean;
  writtenFrames: number;
}

const activeExportJobs = new Map<string, ActiveExportJob>();

const STORAGE = resolveStorageDirs();
const APP_DATA_DIR = STORAGE.appDataDir;
const PROJECTS_DIR = path.join(APP_DATA_DIR, 'projects');
const EXPORTS_DIR = path.join(APP_DATA_DIR, 'exports');
const TEMP_CACHE_DIR = STORAGE.tempCacheDir;
const HOME_DIR = STORAGE.homeDir;

const SUPPORTED_VIDEO_EXTS = ['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v'];
const SUPPORTED_AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
const SUPPORTED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'];
const ALL_SUPPORTED_EXTS = new Set([
  ...SUPPORTED_VIDEO_EXTS,
  ...SUPPORTED_AUDIO_EXTS,
  ...SUPPORTED_IMAGE_EXTS,
]);

export function ensureDirectories() {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  fs.mkdirSync(TEMP_CACHE_DIR, { recursive: true });
}

function getDirectorySize(dirPath: string): { bytes: number; files: number } {
  if (!fs.existsSync(dirPath)) return { bytes: 0, files: 0 };
  let totalBytes = 0;
  let totalFiles = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = getDirectorySize(fullPath);
      totalBytes += sub.bytes;
      totalFiles += sub.files;
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      totalBytes += stat.size;
      totalFiles += 1;
    }
  }
  return { bytes: totalBytes, files: totalFiles };
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function readRawBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function getFfmpegVersion(): Promise<{ ffmpeg: string; ffprobe: string; available: boolean }> {
  try {
    const [{ stdout: ffOut }, { stdout: fpOut }] = await Promise.all([
      execFileAsync('ffmpeg', ['-version']),
      execFileAsync('ffprobe', ['-version']),
    ]);
    return {
      ffmpeg: ffOut.split('\n')[0] || 'ffmpeg available',
      ffprobe: fpOut.split('\n')[0] || 'ffprobe available',
      available: true,
    };
  } catch {
    return { ffmpeg: 'No detectado', ffprobe: 'No detectado', available: false };
  }
}

export async function extractWaveformPeaks(filePath: string, samplesCount = 120): Promise<number[]> {
  return new Promise((resolve) => {
    const proc = execFile(
      'ffmpeg',
      [
        '-i', filePath,
        '-vn',
        '-ac', '1',
        '-ar', '1000',
        '-f', 's16le',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 35 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || stdout.length < 4) {
          resolve(Array.from({ length: samplesCount }, () => 0.25));
          return;
        }
        const totalSamples = Math.floor(stdout.length / 2);
        if (totalSamples <= 0) {
          resolve(Array.from({ length: samplesCount }, () => 0.25));
          return;
        }

        const peaks: number[] = [];
        let maxPeak = 0.01;
        const step = totalSamples / samplesCount;

        for (let i = 0; i < samplesCount; i++) {
          const start = Math.floor(i * step);
          const end = Math.min(totalSamples, Math.max(start + 1, Math.floor((i + 1) * step)));
          let peak = 0;
          for (let j = start; j < end; j++) {
            const sample = Math.abs(stdout.readInt16LE(j * 2)) / 32768;
            if (sample > peak) peak = sample;
          }
          const val = (end > start) ? peak : 0.05;
          if (val > maxPeak) maxPeak = val;
          peaks.push(val);
        }

        resolve(peaks.map((p) => Math.max(0.06, Math.min(1, Number((p / maxPeak).toFixed(3))))));
      }
    );
    proc.stdin?.end();
  });
}

async function generateThumbnailDataUrl(filePath: string, seekTime = 0.5): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'ffmpeg',
      [
        '-ss', String(Math.max(0, seekTime)),
        '-i', filePath,
        '-frames:v', '1',
        '-vf', 'scale=240:-1',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 5 * 1024 * 1024 }
    );
    if (stdout && stdout.length > 0) {
      return `data:image/jpeg;base64,${stdout.toString('base64')}`;
    }
  } catch {
    // Fallback if seek fails
  }
  return undefined;
}

const ALPHA_PIX_FMT_PATTERN = /^(yuva|rgba|bgra|argb|abgr|gbra|ya\d|pal8)/i;

export function isAlphaPixelFormat(pixFmt?: string): boolean {
  if (!pixFmt || typeof pixFmt !== 'string') return false;
  return ALPHA_PIX_FMT_PATTERN.test(pixFmt.trim());
}

async function detectVideoHasAlpha(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=pix_fmt,codec_name,profile',
      '-of', 'json',
      filePath,
    ]);
    const info = JSON.parse(stdout);
    const stream = info?.streams?.[0];
    if (!stream) return false;
    if (isAlphaPixelFormat(stream.pix_fmt)) return true;
    if (String(stream.profile || '').includes('4444')) return true;
    return false;
  } catch {
    return false;
  }
}

async function probeMediaFile(filePath: string) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const info = JSON.parse(stdout);
  const streams: any[] = info.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  let type: 'video' | 'audio' | 'image' = 'video';
  if (SUPPORTED_IMAGE_EXTS.includes(ext)) {
    type = 'image';
  } else if (SUPPORTED_AUDIO_EXTS.includes(ext) || (!videoStream && audioStream)) {
    type = 'audio';
  }

  const rawDuration = Number(info.format?.duration || videoStream?.duration || audioStream?.duration || 0);
  const duration = type === 'image' ? 5 : Math.max(0.5, Number(rawDuration.toFixed(2)));
  const width = videoStream?.width ? Number(videoStream.width) : undefined;
  const height = videoStream?.height ? Number(videoStream.height) : undefined;
  const hasAudio = Boolean(audioStream);

  let waveform: number[] | undefined;
  if (type === 'audio' || (type === 'video' && hasAudio)) {
    // 50 picos por segundo: resolución de 20ms para renderizado continuo NLE
    const targetSamples = Math.max(120, Math.min(15000, Math.round(duration * 50)));
    waveform = await extractWaveformPeaks(filePath, targetSamples);
  }

  let thumbnail: string | undefined;
  if (type === 'video' || type === 'image') {
    thumbnail = await generateThumbnailDataUrl(filePath, type === 'video' ? Math.min(1, duration / 3) : 0);
  }

  return {
    name: path.basename(filePath),
    path: filePath,
    url: `/api/media/stream?path=${encodeURIComponent(filePath)}`,
    type,
    duration,
    width,
    height,
    hasAudio,
    fileSize: stat.size,
    waveform,
    thumbnail,
  };
}

function getCommonShortcuts() {
  const home = HOME_DIR;
  const candidates = [
    { label: 'Carpeta Personal', path: home },
    { label: 'Videos', path: path.join(home, 'Vídeos') },
    { label: 'Videos', path: path.join(home, 'Videos') },
    { label: 'Música', path: path.join(home, 'Música') },
    { label: 'Music', path: path.join(home, 'Music') },
    { label: 'Imágenes', path: path.join(home, 'Imágenes') },
    { label: 'Pictures', path: path.join(home, 'Pictures') },
    { label: 'Descargas', path: path.join(home, 'Descargas') },
    { label: 'Downloads', path: path.join(home, 'Downloads') },
    { label: 'Documentos', path: path.join(home, 'Documentos') },
    { label: 'Exportaciones', path: EXPORTS_DIR },
    { label: 'Caché Demo (/tmp)', path: TEMP_CACHE_DIR },
  ];
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.path)) return false;
    if (fs.existsSync(c.path)) {
      seen.add(c.path);
      return true;
    }
    return false;
  });
}

export async function handleMediaBackendRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next?: () => void
): Promise<void> {
  if (!req.url?.startsWith('/api/')) {
    if (next) return next();
    res.statusCode = 404;
    res.end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Frame-Mime');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  try {
    // 1. System & Cache Status
          if (pathname === '/api/system/status' && req.method === 'GET') {
            ensureDirectories();
            const ffStatus = await getFfmpegVersion();
            const cacheStats = getDirectorySize(TEMP_CACHE_DIR);
            const projectsStats = getDirectorySize(PROJECTS_DIR);
            return sendJson(res, 200, {
              os: `${os.type()} ${os.release()} (${os.arch()})`,
              ffmpeg: ffStatus,
              paths: {
                projectsDir: PROJECTS_DIR,
                tempCacheDir: TEMP_CACHE_DIR,
                exportsDir: EXPORTS_DIR,
              },
              storage: {
                cacheBytes: cacheStats.bytes,
                cacheFiles: cacheStats.files,
                projectsBytes: projectsStats.bytes,
              },
            });
          }

          // 2. Clear Ephemeral Cache
          if (pathname === '/api/system/clear-cache' && req.method === 'POST') {
            if (fs.existsSync(TEMP_CACHE_DIR)) {
              fs.rmSync(TEMP_CACHE_DIR, { recursive: true, force: true });
            }
            fs.mkdirSync(TEMP_CACHE_DIR, { recursive: true });
            const cacheStats = getDirectorySize(TEMP_CACHE_DIR);
            return sendJson(res, 200, {
              ok: true,
              cacheBytes: cacheStats.bytes,
              cacheFiles: cacheStats.files,
            });
          }

          // 2.1. List Available Variable Fonts
          if (pathname === '/api/system/fonts' && req.method === 'GET') {
            const variableFonts = [
              'TikTok Sans Variable',
              'Montserrat',
              'Inter',
              'Poppins',
              'Roboto',
              'Oswald',
              'Playfair Display',
              'Space Grotesk',
              'Fira Code',
              'Cinzel',
            ];
            return sendJson(res, 200, { fonts: variableFonts });
          }

          // 3. Browse Local Linux File System
          if (pathname === '/api/fs/browse' && req.method === 'GET') {
            ensureDirectories();
            const requestedDir = parsedUrl.searchParams.get('dir') || HOME_DIR;
            const resolvedDir = path.resolve(requestedDir);

            if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
              return sendJson(res, 404, { error: `El directorio no existe: ${resolvedDir}` });
            }

            const rawEntries = fs.readdirSync(resolvedDir, { withFileTypes: true });
            const directories: { name: string; path: string }[] = [];
            const files: {
              name: string;
              path: string;
              ext: string;
              mediaType: 'video' | 'audio' | 'image';
              sizeBytes: number;
            }[] = [];

            for (const entry of rawEntries) {
              if (entry.name.startsWith('.')) continue;
              const fullPath = path.join(resolvedDir, entry.name);
              try {
                if (entry.isDirectory()) {
                  directories.push({ name: entry.name, path: fullPath });
                } else if (entry.isFile()) {
                  const ext = path.extname(entry.name).toLowerCase();
                  if (ALL_SUPPORTED_EXTS.has(ext)) {
                    const stat = fs.statSync(fullPath);
                    const mediaType = SUPPORTED_IMAGE_EXTS.includes(ext)
                      ? 'image'
                      : SUPPORTED_AUDIO_EXTS.includes(ext)
                      ? 'audio'
                      : 'video';
                    files.push({
                      name: entry.name,
                      path: fullPath,
                      ext,
                      mediaType,
                      sizeBytes: stat.size,
                    });
                  }
                }
              } catch {
                // Ignore restricted files
              }
            }

            directories.sort((a, b) => a.name.localeCompare(b.name));
            files.sort((a, b) => a.name.localeCompare(b.name));

            return sendJson(res, 200, {
              currentDir: resolvedDir,
              parentDir: path.dirname(resolvedDir),
              shortcuts: getCommonShortcuts(),
              directories,
              files,
            });
          }

          // 3b. Create New Folder in Local Linux File System
          if (pathname === '/api/fs/mkdir' && req.method === 'POST') {
            ensureDirectories();
            const body = await readJsonBody(req);
            const { parentDir: rawParentDir, folderName } = body;

            const cleanName = String(folderName || '')
              .replace(/[\/\\?%*:|"<>]/g, '')
              .trim();
            if (!cleanName) {
              return sendJson(res, 400, { error: 'Nombre de carpeta inválido' });
            }

            const baseDir = path.resolve(String(rawParentDir || HOME_DIR));
            if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
              return sendJson(res, 404, { error: 'La carpeta contenedora no existe' });
            }

            const newFolderPath = path.join(baseDir, cleanName);
            if (!fs.existsSync(newFolderPath)) {
              fs.mkdirSync(newFolderPath, { recursive: true });
            }

            return sendJson(res, 200, {
              ok: true,
              createdPath: newFolderPath,
            });
          }

          // 4. List All Projects
          if (pathname === '/api/projects' && req.method === 'GET') {
            ensureDirectories();
            const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
            const projects: any[] = [];

            for (const entry of entries) {
              if (entry.isDirectory()) {
                const projFile = path.join(PROJECTS_DIR, entry.name, 'project.json');
                if (fs.existsSync(projFile)) {
                  try {
                    const raw = fs.readFileSync(projFile, 'utf-8');
                    const data = JSON.parse(raw);
                    const stat = fs.statSync(projFile);
                    projects.push({
                      ...data,
                      diskSizeBytes: stat.size,
                    });
                  } catch {
                    // Ignore corrupted project file
                  }
                }
              }
            }

            projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
            return sendJson(res, 200, { projects, projectsDir: PROJECTS_DIR });
          }

          // 5. Create or Save Project (Escritura atómica y validación de ID)
          if (pathname === '/api/projects' && req.method === 'POST') {
            ensureDirectories();
            const body = await readJsonBody(req);
            if (!body || typeof body !== 'object' || !body.id) {
              return sendJson(res, 400, { error: 'Project ID is required' });
            }
            const safeId = String(body.id).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeId || !/^[a-zA-Z0-9_-]{1,128}$/.test(safeId)) {
              return sendJson(res, 400, { error: 'Identificador de proyecto inválido' });
            }
            const projFolder = path.join(PROJECTS_DIR, safeId);
            fs.mkdirSync(projFolder, { recursive: true });

            const updatedProject = {
              ...body,
              id: safeId,
              name: typeof body.name === 'string' && body.name.trim() ? body.name : 'Proyecto sin título',
              aspectRatio: body.aspectRatio === '9:16' || body.aspectRatio === '1:1' ? body.aspectRatio : '16:9',
              fps: typeof body.fps === 'number' && body.fps > 0 ? body.fps : 30,
              assets: Array.isArray(body.assets) ? body.assets : [],
              tracks: Array.isArray(body.tracks) ? body.tracks : [],
              clips: Array.isArray(body.clips) ? body.clips : [],
              updatedAt: new Date().toISOString(),
            };
            const projFile = path.join(projFolder, 'project.json');
            const tmpFile = path.join(
              projFolder,
              `project.json.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`
            );
            const serialized = JSON.stringify(updatedProject, null, 2);
            try {
              fs.writeFileSync(tmpFile, serialized, 'utf-8');
              fs.renameSync(tmpFile, projFile);
            } catch (writeErr) {
              if (fs.existsSync(tmpFile)) {
                try {
                  fs.unlinkSync(tmpFile);
                } catch {
                  // ignore cleanup error
                }
              }
              throw writeErr;
            }
            const stat = fs.statSync(projFile);

            return sendJson(res, 200, {
              project: {
                ...updatedProject,
                diskSizeBytes: stat.size,
              },
            });
          }

          // 6. Delete Project (Protegido contra F01)
          if ((pathname === '/api/projects' || pathname.startsWith('/api/projects/')) && req.method === 'DELETE') {
            ensureDirectories();

            // Extraer el identificador posterior a /api/projects/
            const rawId = pathname.startsWith('/api/projects/')
              ? pathname.slice('/api/projects/'.length)
              : '';

            // Decodificación de URL para evaluar el ID real solicitado
            let decodedId: string;
            try {
              decodedId = decodeURIComponent(rawId);
            } catch {
              return sendJson(res, 400, { error: 'Identificador de proyecto mal codificado' });
            }

            // Validación estricta del ID: no vacío, alfanumérico + guión/guión bajo, sin traversal ni separadores
            if (!decodedId || !/^[a-zA-Z0-9_-]{1,128}$/.test(decodedId)) {
              return sendJson(res, 400, { error: 'Identificador de proyecto inválido o ausente' });
            }

            const canonicalProjectsDir = path.resolve(PROJECTS_DIR);
            const projFolder = path.resolve(canonicalProjectsDir, decodedId);

            // Comprobar contención estricta: debe ser hijo directo y jamás PROJECTS_DIR
            if (path.dirname(projFolder) !== canonicalProjectsDir || projFolder === canonicalProjectsDir) {
              return sendJson(res, 400, { error: 'Ruta de proyecto no autorizada' });
            }

            // Comprobar existencia y tipo mediante lstat (no sigue enlaces simbólicos)
            let stat: fs.Stats;
            try {
              stat = fs.lstatSync(projFolder);
            } catch (err: any) {
              if (err?.code === 'ENOENT') {
                return sendJson(res, 404, { error: `Proyecto no encontrado: ${decodedId}` });
              }
              throw err;
            }

            // Rechazar enlaces simbólicos como directorio de proyecto
            if (stat.isSymbolicLink()) {
              return sendJson(res, 400, { error: 'El proyecto no puede ser un enlace simbólico' });
            }

            if (!stat.isDirectory()) {
              return sendJson(res, 400, { error: 'La ruta del proyecto no es un directorio válido' });
            }

            fs.rmSync(projFolder, { recursive: true, force: true });
            return sendJson(res, 200, { ok: true, deletedId: decodedId });
          }

          // 7. Probe Single or Multiple Local Files
          if (pathname === '/api/media/probe' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const pathsToProbe: string[] = Array.isArray(body.paths)
              ? body.paths
              : body.path
              ? [body.path]
              : [];

            if (pathsToProbe.length === 0) {
              return sendJson(res, 400, { error: 'No se proporcionaron rutas de archivo' });
            }

            const assets = [];
            for (const filePath of pathsToProbe) {
              if (!fs.existsSync(filePath)) {
                throw new Error(`El archivo no existe en la ruta: ${filePath}`);
              }
              const metadata = await probeMediaFile(filePath);
              assets.push(metadata);
            }

            return sendJson(res, 200, {
              asset: assets[0],
              assets,
            });
          }

          // 7b. On-demand High-Definition Waveform Extraction
          if (pathname === '/api/media/waveform' && req.method === 'GET') {
            const filePath = parsedUrl.searchParams.get('path');
            const durationParam = Number(parsedUrl.searchParams.get('duration') || 0);
            if (!filePath || !fs.existsSync(filePath)) {
              return sendJson(res, 400, { error: 'Ruta de archivo inválida o inexistente' });
            }
            const samplesParam = Number(parsedUrl.searchParams.get('samples') || 0);
            const targetSamples = samplesParam > 0
              ? samplesParam
              : Math.max(120, Math.min(15000, Math.round(durationParam * 50) || 500));
            const peaks = await extractWaveformPeaks(filePath, targetSamples);
            return sendJson(res, 200, { waveform: peaks });
          }

          // 7c. Batch Media Assets Existence Status Check (Non-blocking)
          if (pathname === '/api/media/check-status' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const assetsToCheck: { id: string; path: string }[] = Array.isArray(body.assets)
              ? body.assets
              : [];
            const pathsToCheck: string[] = Array.isArray(body.paths)
              ? body.paths
              : [];

            const status: Record<string, { exists: boolean; sizeBytes?: number; mtimeMs?: number }> = {};

            await Promise.all([
              ...assetsToCheck.map(async (item) => {
                if (!item || !item.id || !item.path) return;
                try {
                  const stat = await fs.promises.stat(item.path);
                  status[item.id] = {
                    exists: stat.isFile(),
                    sizeBytes: stat.size,
                    mtimeMs: stat.mtimeMs,
                  };
                } catch {
                  status[item.id] = { exists: false };
                }
              }),
              ...pathsToCheck.map(async (p) => {
                if (!p || typeof p !== 'string') return;
                try {
                  const stat = await fs.promises.stat(p);
                  status[p] = {
                    exists: stat.isFile(),
                    sizeBytes: stat.size,
                    mtimeMs: stat.mtimeMs,
                  };
                } catch {
                  status[p] = { exists: false };
                }
              }),
            ]);

            return sendJson(res, 200, { status });
          }

          // 7d. Re-probe & Relink Media Asset
          if (pathname === '/api/media/relink' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const { assetId, newPath } = body;
            if (!newPath || typeof newPath !== 'string') {
              return sendJson(res, 400, { error: 'No se proporcionó la nueva ruta del archivo' });
            }

            try {
              const stat = await fs.promises.stat(newPath);
              if (!stat.isFile()) {
                return sendJson(res, 400, { error: 'La ruta indicada no es un archivo válido' });
              }
            } catch {
              return sendJson(res, 404, { error: `El archivo no existe en la ruta: ${newPath}` });
            }

            const metadata = await probeMediaFile(newPath);
            return sendJson(res, 200, {
              assetId: assetId || undefined,
              asset: metadata,
            });
          }

          // 8. Upload Drop Fallback into Ephemeral Cache
          if (pathname === '/api/media/import-buffer' && req.method === 'POST') {
            ensureDirectories();
            const body = await readJsonBody(req);
            const { fileName, base64Data } = body;
            if (!fileName || !base64Data) {
              return sendJson(res, 400, { error: 'Datos de archivo incompletos' });
            }
            const safeName = `${Date.now()}_${path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const targetPath = path.join(TEMP_CACHE_DIR, safeName);
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(targetPath, buffer);
            const metadata = await probeMediaFile(targetPath);
            return sendJson(res, 200, { asset: metadata });
          }

          // 9. Generate Sample Media Pack (Video + Audio + Image)
          if (pathname === '/api/media/generate-sample' && req.method === 'POST') {
            ensureDirectories();
            const body = await readJsonBody(req).catch(() => ({}));
            const sampleKind: 'video' | 'audio' | 'image' | 'pack' = body?.kind || 'pack';
            const generatedPaths: string[] = [];

            if (sampleKind === 'video' || sampleKind === 'pack') {
              const sampleVideoPath = path.join(TEMP_CACHE_DIR, 'clip_demo_1080p.mp4');
              if (!fs.existsSync(sampleVideoPath)) {
                await execFileAsync('ffmpeg', [
                  '-y',
                  '-f', 'lavfi',
                  '-i', 'testsrc2=size=1280x720:rate=30:duration=6',
                  '-f', 'lavfi',
                  '-i', 'sine=frequency=440:sample_rate=44100:duration=6',
                  '-c:v', 'libx264',
                  '-pix_fmt', 'yuv420p',
                  '-preset', 'ultrafast',
                  '-g', '15',
                  '-c:a', 'aac',
                  '-b:a', '128k',
                  sampleVideoPath,
                ]);
              }
              generatedPaths.push(sampleVideoPath);
            }

            if (sampleKind === 'audio' || sampleKind === 'pack') {
              const sampleAudioPath = path.join(TEMP_CACHE_DIR, 'musica_ambiente_demo.wav');
              if (!fs.existsSync(sampleAudioPath)) {
                await execFileAsync('ffmpeg', [
                  '-y',
                  '-f', 'lavfi',
                  '-i', 'aevalsrc=0.3*sin(2*PI*220*t)+0.2*sin(2*PI*440*t)+0.1*sin(2*PI*660*t):s=44100:d=8',
                  sampleAudioPath,
                ]);
              }
              generatedPaths.push(sampleAudioPath);
            }

            if (sampleKind === 'image' || sampleKind === 'pack') {
              const sampleImagePath = path.join(TEMP_CACHE_DIR, 'fondo_gradiente_demo.png');
              if (!fs.existsSync(sampleImagePath)) {
                await execFileAsync('ffmpeg', [
                  '-y',
                  '-f', 'lavfi',
                  '-i', 'color=c=#0ea5e9:s=1280x720:d=1',
                  '-frames:v', '1',
                  sampleImagePath,
                ]);
              }
              generatedPaths.push(sampleImagePath);
            }

            const assets = [];
            for (const p of generatedPaths) {
              assets.push(await probeMediaFile(p));
            }
            return sendJson(res, 200, { asset: assets[0], assets });
          }

          // 10. Export Pipeline:
          //     - /api/export/decode-clip-frames: Decodificación secuencial nativa por FFmpeg (Cero seek penalty de HTML5 <video>)
          //     - /api/export/start: Inicia sesión + proceso FFmpeg por Pipe (stdin -> image2pipe -> GPU VAAPI)
          //     - /api/export/frames: Envía lotes de fotogramas directo al pipe de la GPU
          //     - /api/export/finalize: Cierra el pipe de video y mezcla las pistas de audio en segundos
          if (pathname === '/api/export/decode-clip-frames' && req.method === 'GET') {
            const filePath = parsedUrl.searchParams.get('path');
            const startSec = Math.max(0, Number(parsedUrl.searchParams.get('start') || 0));
            const durationSec = Math.max(0.1, Number(parsedUrl.searchParams.get('duration') || 1));
            const fps = Math.max(1, Number(parsedUrl.searchParams.get('fps') || 30));
            const maxW = Math.max(160, Number(parsedUrl.searchParams.get('width') || 1920));
            const maxH = Math.max(160, Number(parsedUrl.searchParams.get('height') || 1080));

            if (!filePath || !fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end('Source video not found');
              return;
            }

            // Detectar si el video de origen posee canal Alpha (p. ej. ProRes 4444 yuva444p12le, WebM VP9 alpha, RGBA)
            const hasAlpha = await detectVideoHasAlpha(filePath);
            const frameMime = hasAlpha ? 'image/png' : 'image/jpeg';

            res.writeHead(200, {
              'Content-Type': 'application/octet-stream',
              'Cache-Control': 'no-store',
              'X-Frame-Mime': frameMime,
              'Access-Control-Expose-Headers': 'X-Frame-Mime',
            });

            // Decodificación lineal pura multi-hilo con FFmpeg:
            // - Si el video tiene canal Alpha -> emite flujo PNG con formato rgba para conservar transparencia 100% intacta.
            // - Si el video es opaco estándar -> emite flujo MJPEG continuo de alta velocidad.
            const scaleFilter = `fps=${fps},scale='min(${maxW},iw)':'min(${maxH},ih)':force_original_aspect_ratio=decrease`;
            const ffArgs = hasAlpha
              ? [
                  '-hide_banner',
                  '-loglevel', 'error',
                  '-threads', '0',
                  '-ss', startSec.toFixed(3),
                  '-t', durationSec.toFixed(3),
                  '-i', filePath,
                  '-vf', `${scaleFilter},format=rgba`,
                  '-f', 'image2pipe',
                  '-vcodec', 'png',
                  '-compression_level', '1',
                  'pipe:1',
                ]
              : [
                  '-hide_banner',
                  '-loglevel', 'error',
                  '-threads', '0',
                  '-ss', startSec.toFixed(3),
                  '-t', durationSec.toFixed(3),
                  '-i', filePath,
                  '-vf', scaleFilter,
                  '-f', 'image2pipe',
                  '-vcodec', 'mjpeg',
                  '-q:v', '2',
                  'pipe:1',
                ];

            const ffProc = spawn('ffmpeg', ffArgs);
            ffProc.stdout.pipe(res);
            req.on('close', () => {
              if (!ffProc.killed) {
                ffProc.kill('SIGTERM');
              }
            });
            return;
          }

          if (pathname === '/api/export/start' && req.method === 'POST') {
            ensureDirectories();
            const body = await readJsonBody(req);
            const fps = Number(body.fps || 30);
            const useGpu = body.useGpu !== false;
            const exportId = `exp_${Date.now().toString(36)}`;
            const jobDir = path.join(TEMP_CACHE_DIR, exportId);
            fs.mkdirSync(jobDir, { recursive: true });

            const tempVideoOnlyPath = path.join(jobDir, 'video_pipe.mp4');
            const vaapiDevicePath = '/dev/dri/renderD128';
            const canTryVaapi = useGpu && fs.existsSync(vaapiDevicePath);

            // Iniciar proceso FFmpeg en vivo conectado por Pipe (stdin) para codificar en paralelo mientras el Canvas dibuja
            const pipeArgs: string[] = ['-y'];
            if (canTryVaapi) {
              pipeArgs.push('-vaapi_device', vaapiDevicePath);
            }
            pipeArgs.push(
              '-f', 'image2pipe',
              '-vcodec', 'mjpeg',
              '-framerate', String(fps),
              '-i', 'pipe:0'
            );

            if (canTryVaapi) {
              pipeArgs.push(
                '-vf', 'scale=in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,format=nv12,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hwupload',
                '-c:v', 'h264_vaapi',
                '-profile:v', 'high',
                '-qp', '20',
                '-colorspace', 'bt709',
                '-color_primaries', 'bt709',
                '-color_trc', 'bt709',
                '-color_range', 'tv',
                tempVideoOnlyPath
              );
            } else {
              pipeArgs.push(
                '-vf', 'scale=in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
                '-c:v', 'libx264',
                '-profile:v', 'high',
                '-pix_fmt', 'yuv420p',
                '-colorspace', 'bt709',
                '-color_primaries', 'bt709',
                '-color_trc', 'bt709',
                '-color_range', 'tv',
                '-preset', 'fast',
                '-crf', '20',
                tempVideoOnlyPath
              );
            }

            const ffProc = spawn('ffmpeg', pipeArgs);
            const jobState: ActiveExportJob = {
              exportId,
              jobDir,
              tempVideoOnlyPath,
              fps,
              useGpu,
              encoder: canTryVaapi ? 'h264_vaapi' : 'libx264',
              ffmpegProc: ffProc,
              ffmpegPromise: null,
              pipeFailed: false,
              writtenFrames: 0,
            };

            jobState.ffmpegPromise = new Promise<void>((resolve) => {
              ffProc.on('error', () => {
                jobState.pipeFailed = true;
                resolve();
              });
              ffProc.on('close', (code) => {
                if (code !== 0) {
                  jobState.pipeFailed = true;
                }
                resolve();
              });
            });

            ffProc.stdin.on('error', () => {
              jobState.pipeFailed = true;
            });

            activeExportJobs.set(exportId, jobState);

            return sendJson(res, 200, {
              exportId,
              jobDir,
              fps,
              encoder: jobState.encoder,
            });
          }

          if (pathname === '/api/export/frames' && req.method === 'POST') {
            const contentType = String(req.headers['content-type'] || '');

            // Ruta ultra-rápida binaria (application/octet-stream): cero Base64, cero JSON.parse
            if (contentType.includes('application/octet-stream')) {
              const rawId = parsedUrl.searchParams.get('exportId') || '';
              const frameCount = Number(parsedUrl.searchParams.get('count') || 1);
              const safeId = String(rawId).replace(/[^a-zA-Z0-9_-]/g, '');
              if (!safeId) {
                return sendJson(res, 400, { error: 'exportId requerido' });
              }

              const rawBuf = await readRawBuffer(req);
              const jobState = activeExportJobs.get(safeId);

              if (
                jobState &&
                jobState.ffmpegProc &&
                !jobState.pipeFailed &&
                jobState.ffmpegProc.stdin.writable
              ) {
                const canContinue = jobState.ffmpegProc.stdin.write(rawBuf);
                if (!canContinue) {
                  await new Promise<void>((resolve) =>
                    jobState.ffmpegProc!.stdin.once('drain', resolve)
                  );
                }
                jobState.writtenFrames += frameCount;
              }
              return sendJson(res, 200, { ok: true, written: frameCount });
            }

            const body = await readJsonBody(req);
            const { exportId, frames } = body;
            if (!exportId || !Array.isArray(frames)) {
              return sendJson(res, 400, { error: 'Parámetros de frames inválidos' });
            }
            const safeId = String(exportId).replace(/[^a-zA-Z0-9_-]/g, '');
            const jobDir = path.join(TEMP_CACHE_DIR, safeId);
            if (!fs.existsSync(jobDir)) {
              fs.mkdirSync(jobDir, { recursive: true });
            }

            const jobState = activeExportJobs.get(safeId);

            for (const frame of frames) {
              const idx = Number(frame.index);
              const rawBase64 = String(frame.dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
              const buf = Buffer.from(rawBase64, 'base64');

              if (jobState && jobState.ffmpegProc && !jobState.pipeFailed && jobState.ffmpegProc.stdin.writable) {
                const canContinue = jobState.ffmpegProc.stdin.write(buf);
                if (!canContinue) {
                  await new Promise<void>((resolve) => jobState.ffmpegProc!.stdin.once('drain', resolve));
                }
                jobState.writtenFrames++;
              } else {
                // Respaldo en disco únicamente si el pipe no estuviera activo
                const padded = String(idx).padStart(6, '0');
                const framePath = path.join(jobDir, `frame_${padded}.jpg`);
                fs.writeFileSync(framePath, buf);
              }
            }

            return sendJson(res, 200, { ok: true, written: frames.length });
          }

          if (pathname === '/api/export/finalize' && req.method === 'POST') {
            ensureDirectories();
            const body = await readJsonBody(req);
            const {
              exportId,
              fileName,
              outputDir,
              useGpu = true,
              fps = 30,
              totalDuration = 5,
              audioClips = [],
            } = body;
            const safeId = String(exportId).replace(/[^a-zA-Z0-9_-]/g, '');
            const jobDir = path.join(TEMP_CACHE_DIR, safeId);

            if (!fs.existsSync(jobDir)) {
              return sendJson(res, 404, { error: 'Sesión de exportación no encontrada' });
            }

            // Determinar y validar carpeta de destino elegida por el usuario
            let targetDir = EXPORTS_DIR;
            if (typeof outputDir === 'string' && outputDir.trim().length > 0) {
              const resolvedTarget = path.resolve(outputDir.trim());
              if (!fs.existsSync(resolvedTarget)) {
                fs.mkdirSync(resolvedTarget, { recursive: true });
              }
              if (fs.statSync(resolvedTarget).isDirectory()) {
                targetDir = resolvedTarget;
              }
            }

            // Limpiar el nombre respetando espacios, acentos y caracteres válidos en Linux
            const cleanBaseName =
              String(fileName || 'video_exportado')
                .replace(/\.mp4$/i, '')
                .replace(/[\/\\?%*:|"<>]/g, '')
                .trim() || 'video_exportado';

            // Numeración secuencial (1), (2) si el archivo ya existe para nunca sobrescribir ni agregar letras aleatorias
            let outputPath = path.join(targetDir, `${cleanBaseName}.mp4`);
            let counter = 1;
            while (fs.existsSync(outputPath)) {
              outputPath = path.join(targetDir, `${cleanBaseName} (${counter}).mp4`);
              counter++;
            }

            const validAudioClips = (audioClips as any[]).filter(
              (ac) =>
                ac.path &&
                fs.existsSync(ac.path) &&
                ac.duration > 0.05 &&
                (ac.volume > 0 || (ac.keyframes?.volume && ac.keyframes.volume.length > 0))
            );

            // Construir cadenas de filtros de audio si existen clips de audio activos
            const audioFilterParts: string[] = [];
            const mixLabels: string[] = [];

            if (validAudioClips.length > 0) {
              validAudioClips.forEach((ac, idx) => {
                const inputIndex = idx + 1;
                const srcStart = Math.max(0, Number(ac.sourceStart || 0));
                const dur = Math.max(0.1, Number(ac.duration || 1));
                const vol = Math.max(0, Number(ac.volume ?? 1));
                const fadeIn = Math.max(0, Number(ac.fadeIn || 0));
                const fadeOut = Math.max(0, Number(ac.fadeOut || 0));
                const delayMs = Math.max(0, Math.round(Number(ac.startTime || 0) * 1000));

                let volumeFilter = `volume=${vol.toFixed(2)}`;
                if (ac.keyframes?.volume && Array.isArray(ac.keyframes.volume) && ac.keyframes.volume.length > 0) {
                  const exprFilter = buildFFmpegVolumeExpression(ac.keyframes.volume, vol);
                  if (exprFilter) {
                    volumeFilter = exprFilter;
                  }
                }

                let chain = `[${inputIndex}:a]atrim=start=${srcStart.toFixed(3)}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,${volumeFilter}`;
                if (fadeIn > 0.05 && fadeIn < dur) {
                  chain += `,afade=t=in:st=0:d=${fadeIn.toFixed(2)}`;
                }
                if (fadeOut > 0.05 && fadeOut < dur) {
                  const stOut = Math.max(0, dur - fadeOut);
                  chain += `,afade=t=out:st=${stOut.toFixed(2)}:d=${fadeOut.toFixed(2)}`;
                }
                chain += `,adelay=${delayMs}|${delayMs}[a${idx}]`;
                audioFilterParts.push(chain);
                mixLabels.push(`[a${idx}]`);
              });

              audioFilterParts.push(
                `${mixLabels.join('')}amix=inputs=${validAudioClips.length}:duration=longest:dropout_transition=0,apad,atrim=0:${Number(totalDuration).toFixed(2)}[aout]`
              );
            }

            const jobState = activeExportJobs.get(safeId);
            activeExportJobs.delete(safeId);

            let usedEncoder: 'h264_vaapi' | 'libx264' = jobState?.encoder || 'h264_vaapi';
            let pipeSucceeded = false;

            if (jobState && jobState.ffmpegProc) {
              try {
                jobState.ffmpegProc.stdin.end();
                if (jobState.ffmpegPromise) {
                  await jobState.ffmpegPromise;
                }
                if (
                  !jobState.pipeFailed &&
                  fs.existsSync(jobState.tempVideoOnlyPath) &&
                  fs.statSync(jobState.tempVideoOnlyPath).size > 0
                ) {
                  pipeSucceeded = true;
                }
              } catch {
                pipeSucceeded = false;
              }
            }

            if (pipeSucceeded && jobState) {
              // El video ya fue codificado en paralelo por la GPU mientras el Canvas pintaba.
              // Si no hay audio, solo movemos el MP4 final con +faststart; si hay audio, hacemos `-c:v copy` (instantáneo) y mezclamos el audio.
              if (validAudioClips.length === 0) {
                await execFileAsync('ffmpeg', [
                  '-y',
                  '-i', jobState.tempVideoOnlyPath,
                  '-c:v', 'copy',
                  '-movflags', '+faststart',
                  outputPath,
                ]);
              } else {
                const muxArgs: string[] = ['-y', '-i', jobState.tempVideoOnlyPath];
                for (const ac of validAudioClips) {
                  muxArgs.push('-i', ac.path);
                }
                muxArgs.push(
                  '-filter_complex', audioFilterParts.join(';'),
                  '-map', '0:v:0',
                  '-map', '[aout]',
                  '-c:v', 'copy',
                  '-c:a', 'aac',
                  '-b:a', '192k',
                  '-ar', '48000',
                  '-ac', '2',
                  '-movflags', '+faststart',
                  '-shortest',
                  outputPath
                );
                try {
                  await execFileAsync('ffmpeg', muxArgs);
                } catch (muxErr: any) {
                  // F12: No silenciar errores de mezcla devolviendo un MP4 mudo como éxito
                  fs.rmSync(jobDir, { recursive: true, force: true });
                  if (fs.existsSync(outputPath)) {
                    try {
                      fs.unlinkSync(outputPath);
                    } catch {
                      // ignore cleanup error
                    }
                  }
                  const detail = muxErr?.stderr || muxErr?.message || 'Fallo en el filtro de audio de FFmpeg';
                  return sendJson(res, 500, {
                    error: `Error al mezclar el audio durante la exportación: ${String(detail).slice(-300)}`,
                  });
                }
              }
            } else {
              // Fallback tradicional si el pipe no se usó
              const vaapiDevicePath = '/dev/dri/renderD128';
              const canTryVaapi = Boolean(useGpu) && fs.existsSync(vaapiDevicePath);

              const buildFfmpegArgs = (hwAccel: boolean, withAudio: boolean): string[] => {
                const args: string[] = ['-y'];
                if (hwAccel) {
                  args.push('-vaapi_device', vaapiDevicePath);
                }
                args.push('-framerate', String(fps), '-i', path.join(jobDir, 'frame_%06d.jpg'));

                const videoFilter = hwAccel
                  ? 'scale=in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,format=nv12,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,hwupload'
                  : 'scale=in_color_matrix=bt601:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv';

                if (withAudio && validAudioClips.length > 0) {
                  for (const ac of validAudioClips) {
                    args.push('-i', ac.path);
                  }
                  const fullFilterComplex = [`[0:v]${videoFilter}[vout]`, ...audioFilterParts].join(';');
                  args.push('-filter_complex', fullFilterComplex, '-map', '[vout]', '-map', '[aout]');
                } else {
                  args.push('-vf', videoFilter);
                }

                if (hwAccel) {
                  args.push(
                    '-c:v', 'h264_vaapi',
                    '-profile:v', 'high',
                    '-qp', '20',
                    '-colorspace', 'bt709',
                    '-color_primaries', 'bt709',
                    '-color_trc', 'bt709',
                    '-color_range', 'tv'
                  );
                } else {
                  args.push(
                    '-c:v', 'libx264',
                    '-profile:v', 'high',
                    '-pix_fmt', 'yuv420p',
                    '-colorspace', 'bt709',
                    '-color_primaries', 'bt709',
                    '-color_trc', 'bt709',
                    '-color_range', 'tv',
                    '-preset', 'fast',
                    '-crf', '20'
                  );
                }

                if (withAudio && validAudioClips.length > 0) {
                  args.push(
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-ar', '48000',
                    '-ac', '2',
                    '-movflags', '+faststart',
                    '-shortest',
                    outputPath
                  );
                } else {
                  args.push('-movflags', '+faststart', outputPath);
                }

                return args;
              };

              usedEncoder = canTryVaapi ? 'h264_vaapi' : 'libx264';

              try {
                await execFileAsync('ffmpeg', buildFfmpegArgs(canTryVaapi, validAudioClips.length > 0));
              } catch (firstErr: any) {
                if (canTryVaapi) {
                  usedEncoder = 'libx264';
                  try {
                    await execFileAsync('ffmpeg', buildFfmpegArgs(false, validAudioClips.length > 0));
                  } catch (cpuErr: any) {
                    fs.rmSync(jobDir, { recursive: true, force: true });
                    const detail = cpuErr?.stderr || cpuErr?.message || 'Error en codificación/mezcla FFmpeg';
                    return sendJson(res, 500, {
                      error: `Error al finalizar el video/audio con FFmpeg: ${String(detail).slice(-300)}`,
                    });
                  }
                } else {
                  fs.rmSync(jobDir, { recursive: true, force: true });
                  const detail = firstErr?.stderr || firstErr?.message || 'Error en codificación/mezcla FFmpeg';
                  return sendJson(res, 500, {
                    error: `Error al finalizar el video/audio con FFmpeg: ${String(detail).slice(-300)}`,
                  });
                }
              }
            }

            // Autolimpia frames temporales de la exportación inmediatamente (Cero basura en caché)
            fs.rmSync(jobDir, { recursive: true, force: true });

            const stat = fs.statSync(outputPath);
            return sendJson(res, 200, {
              ok: true,
              outputPath,
              fileName: path.basename(outputPath),
              sizeBytes: stat.size,
              encoder: usedEncoder,
              downloadUrl: `/api/media/stream?path=${encodeURIComponent(outputPath)}&download=1`,
            });
          }

          if (pathname === '/api/export/cancel' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const safeId = String(body.exportId || '').replace(/[^a-zA-Z0-9_-]/g, '');
            if (safeId) {
              const jobState = activeExportJobs.get(safeId);
              activeExportJobs.delete(safeId);
              if (jobState?.ffmpegProc && !jobState.ffmpegProc.killed) {
                try {
                  jobState.ffmpegProc.stdin.destroy();
                  jobState.ffmpegProc.kill('SIGKILL');
                } catch {
                  // ignore kill error
                }
              }
              const jobDir = path.join(TEMP_CACHE_DIR, safeId);
              if (fs.existsSync(jobDir)) {
                fs.rmSync(jobDir, { recursive: true, force: true });
              }
            }
            return sendJson(res, 200, { ok: true });
          }

          if (pathname === '/api/fs/open-folder' && req.method === 'POST') {
            const body = await readJsonBody(req);
            const targetPath = String(body.path || '').trim();
            if (!targetPath || !fs.existsSync(targetPath)) {
              return sendJson(res, 404, { error: 'Archivo o carpeta no encontrada' });
            }

            const stat = fs.statSync(targetPath);
            const folderPath = stat.isDirectory() ? targetPath : path.dirname(targetPath);

            try {
              if (!stat.isDirectory() && fs.existsSync('/usr/bin/nautilus')) {
                const child = spawn('nautilus', ['--select', targetPath], {
                  detached: true,
                  stdio: 'ignore',
                });
                child.unref();
              } else {
                const child = spawn('xdg-open', [folderPath], {
                  detached: true,
                  stdio: 'ignore',
                });
                child.unref();
              }
              return sendJson(res, 200, { ok: true, opened: folderPath });
            } catch (err: any) {
              return sendJson(res, 500, { error: err?.message || 'No se pudo abrir la carpeta' });
            }
          }

          // 11. Stream Local Media with HTTP Range Support & Download Header
          if (pathname === '/api/media/stream' && req.method === 'GET') {
            const filePath = parsedUrl.searchParams.get('path');
            const isDownload = parsedUrl.searchParams.get('download') === '1';
            if (!filePath || !fs.existsSync(filePath)) {
              res.statusCode = 404;
              res.end('File not found');
              return;
            }

            const stat = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.mp4': 'video/mp4',
              '.webm': 'video/webm',
              '.mkv': 'video/x-matroska',
              '.mov': 'video/quicktime',
              '.avi': 'video/x-msvideo',
              '.m4v': 'video/mp4',
              '.mp3': 'audio/mpeg',
              '.wav': 'audio/wav',
              '.ogg': 'audio/ogg',
              '.flac': 'audio/flac',
              '.m4a': 'audio/mp4',
              '.aac': 'audio/aac',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.webp': 'image/webp',
              '.gif': 'image/gif',
              '.svg': 'image/svg+xml',
              '.bmp': 'image/bmp',
            };
            const contentType = mimeMap[ext] || 'application/octet-stream';
            const range = req.headers.range;

            if (isDownload) {
              res.setHeader(
                'Content-Disposition',
                `attachment; filename="${path.basename(filePath)}"`
              );
            }

            if (range && !isDownload) {
              const parts = range.replace(/bytes=/, '').split('-');
              const start = parseInt(parts[0], 10);
              const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
              const chunksize = end - start + 1;
              const file = fs.createReadStream(filePath, { start, end });
              res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
              });
              file.pipe(res);
              return;
            } else {
              res.writeHead(200, {
                'Content-Length': stat.size,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
              });
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }

          return sendJson(res, 404, { error: `Endpoint no encontrado: ${pathname}` });
        } catch (error: any) {
          console.error('[MediaBackend Error]:', error);
          return sendJson(res, 500, { error: error?.message || 'Error interno en el servidor multimedia' });
        }
}

export function mediaBackendPlugin(): Plugin {
  ensureDirectories();

  return {
    name: 'linux-video-editor-backend',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        handleMediaBackendRequest(req, res, next);
      });
    },
  };
}
