import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Resolución de los directorios de almacenamiento del backend.
 *
 * Por defecto conserva las rutas históricas (~/.local/share/video-editor y
 * <tmp>/video-editor-cache). Para pruebas aisladas se pueden redirigir con
 * VIDEO_EDITOR_TEST_DATA_DIR y VIDEO_EDITOR_TEST_CACHE_DIR. Ambas deben
 * definirse a la vez, antes de importar los módulos del servidor, porque las
 * rutas se calculan una sola vez al cargarlos.
 */

export const TEST_DATA_DIR_ENV = 'VIDEO_EDITOR_TEST_DATA_DIR';
export const TEST_CACHE_DIR_ENV = 'VIDEO_EDITOR_TEST_CACHE_DIR';
/** Lo define únicamente el runner de pruebas: identifica que el proceso corre bajo tests. */
export const TEST_MODE_ENV = 'VIDEO_EDITOR_TEST_MODE';
export const SANDBOX_ROOT_ENV = 'VIDEO_EDITOR_TEST_SANDBOX_ROOT';
export const SANDBOX_MARKER_FILE = '.video-editor-test-sandbox';
export const SANDBOX_PREFIX = 'video-editor-test-';

export interface ValidatedSandbox {
  root: string;
  dataDir: string;
  cacheDir: string;
  token: string;
}

function insideStrict(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Valida (solo lecturas) que el entorno describe un sandbox creado por el runner:
 * raíz temporal con prefijo y marcador, sin symlinks, con data/cache dentro y distintos.
 * Lanza error si falta o es sospechoso algo.
 */
export function validateSandboxEnv(env: NodeJS.ProcessEnv = process.env): ValidatedSandbox {
  const rawRoot = env[SANDBOX_ROOT_ENV];
  const rawData = env[TEST_DATA_DIR_ENV];
  const rawCache = env[TEST_CACHE_DIR_ENV];
  if (!rawRoot || !rawData || !rawCache) {
    throw new Error(
      `Sandbox de pruebas no configurado (${SANDBOX_ROOT_ENV}, ${TEST_DATA_DIR_ENV}, ${TEST_CACHE_DIR_ENV}). ` +
        'Ejecuta las pruebas con "npm test"; no importes módulos de producción sin sandbox.'
    );
  }
  for (const p of [rawRoot, rawData, rawCache]) {
    if (!path.isAbsolute(p)) throw new Error('Las rutas del sandbox deben ser absolutas.');
  }

  let realRoot: string;
  let realTmp: string;
  try {
    realRoot = fs.realpathSync(rawRoot);
    realTmp = fs.realpathSync(os.tmpdir());
  } catch {
    throw new Error('El directorio raíz del sandbox no existe.');
  }
  if (realRoot !== path.resolve(rawRoot)) {
    throw new Error('La raíz del sandbox no puede contener enlaces simbólicos.');
  }
  if (!insideStrict(realRoot, realTmp) || !path.basename(realRoot).startsWith(SANDBOX_PREFIX)) {
    throw new Error('La raíz del sandbox debe ser un directorio temporal creado por createSandbox().');
  }

  let token: string;
  try {
    token = fs.readFileSync(path.join(realRoot, SANDBOX_MARKER_FILE), 'utf-8');
  } catch {
    throw new Error('Falta el marcador del sandbox; se rechaza el directorio.');
  }
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error('Marcador de sandbox inválido.');

  let data: string;
  let cache: string;
  try {
    data = fs.realpathSync(rawData);
    cache = fs.realpathSync(rawCache);
  } catch {
    throw new Error('Los directorios de datos/caché del sandbox no existen.');
  }
  if (data !== path.resolve(rawData) || cache !== path.resolve(rawCache)) {
    throw new Error('Los directorios de datos/caché del sandbox no pueden ser enlaces simbólicos.');
  }
  if (!insideStrict(data, realRoot) || !insideStrict(cache, realRoot) || data === cache) {
    throw new Error('Los directorios de datos y caché deben estar dentro del sandbox y ser distintos.');
  }
  return { root: realRoot, dataDir: data, cacheDir: cache, token };
}

export interface StorageDirs {
  appDataDir: string;
  tempCacheDir: string;
  /** Carpeta que sustituye al HOME en atajos y exploración por defecto. */
  homeDir: string;
  isolated: boolean;
}

/** Resuelve symlinks del ancestro existente más cercano para comparar rutas reales. */
function canonical(p: string): string {
  const resolved = path.resolve(p);
  const pending: string[] = [];
  let current = resolved;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return resolved;
    pending.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...pending);
}

function isSameOrInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolveStorageDirs(env: NodeJS.ProcessEnv = process.env): StorageDirs {
  // Modo de pruebas: se exige un sandbox válido ANTES de calcular o usar cualquier ruta.
  // Nunca se recurre en silencio a las rutas de producción.
  if (env[TEST_MODE_ENV] === '1') {
    validateSandboxEnv(env);
  }

  const homeDir = os.homedir();
  const defaultData = path.join(homeDir, '.local', 'share', 'video-editor');
  const defaultCache = path.join(os.tmpdir(), 'video-editor-cache');

  const rawData = env[TEST_DATA_DIR_ENV];
  const rawCache = env[TEST_CACHE_DIR_ENV];
  const hasData = rawData !== undefined && rawData !== '';
  const hasCache = rawCache !== undefined && rawCache !== '';

  if (!hasData && !hasCache) {
    return { appDataDir: defaultData, tempCacheDir: defaultCache, homeDir, isolated: false };
  }

  if (!hasData || !hasCache) {
    throw new Error(
      `Configuración de aislamiento incompleta: ${TEST_DATA_DIR_ENV} y ${TEST_CACHE_DIR_ENV} deben definirse juntas.`
    );
  }
  if (!path.isAbsolute(rawData!) || !path.isAbsolute(rawCache!)) {
    throw new Error('Los directorios de aislamiento deben ser rutas absolutas.');
  }

  const data = canonical(rawData!);
  const cache = canonical(rawCache!);

  if (isSameOrInside(data, cache) || isSameOrInside(cache, data)) {
    throw new Error('El directorio de datos y el de caché de pruebas no pueden coincidir ni anidarse.');
  }

  // Ningún directorio de prueba puede ser, contener o estar dentro de ubicaciones personales/reales.
  const protectedPaths = [
    canonical(homeDir),
    canonical(defaultData),
    canonical(defaultCache),
    canonical(os.tmpdir()),
    path.parse(data).root,
  ];
  for (const dir of [data, cache]) {
    for (const prot of protectedPaths) {
      const insideProtectedStore = prot === canonical(defaultData) || prot === canonical(defaultCache);
      if (
        dir === prot ||
        isSameOrInside(prot, dir) ||
        (insideProtectedStore && isSameOrInside(dir, prot))
      ) {
        throw new Error(`Directorio de aislamiento no permitido (coincide con ubicación real o personal): ${dir}`);
      }
    }
  }

  return { appDataDir: data, tempCacheDir: cache, homeDir: data, isolated: true };
}
