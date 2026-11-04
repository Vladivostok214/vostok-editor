import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Film,
  Check,
  X,
  FolderOpen,
  Cpu,
  ChevronDown,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { apiUrl } from '../config/api';
import {
  getResolutionForRatio,
  renderProjectFrameToCanvas,
} from './CanvasPreviewStage';
import type { CanvasDrawableSource } from './CanvasPreviewStage';
import { LocalFileBrowserModal } from './LocalFileBrowserModal';
import type { MediaAsset, TimelineClip } from '../types/project';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatBytes(bytes = 0): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Decodificador secuencial de fotogramas de video impulsado por FFmpeg (`image2pipe`).
 * Elimina por completo el "seek penalty" del elemento `<video>` de HTML5:
 * lee el flujo MJPEG continuo en orden secuencial sin re-decodificar GOPs.
 */
class SequentialVideoFrameReader {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private eof = false;
  public currentBitmap: ImageBitmap | null = null;
  public currentFrameIndex = -1;

  public async start(
    filePath: string,
    sourceStartSec: number,
    durationSec: number,
    fps: number,
    maxWidth: number,
    maxHeight: number
  ): Promise<void> {
    const params = new URLSearchParams({
      path: filePath,
      start: sourceStartSec.toFixed(3),
      duration: (durationSec + 0.25).toFixed(3),
      fps: String(fps),
      width: String(maxWidth),
      height: String(maxHeight),
    });
    const res = await fetch(apiUrl(`/api/export/decode-clip-frames?${params.toString()}`));
    if (!res.ok || !res.body) {
      throw new Error(`No se pudo iniciar la decodificación secuencial de ${filePath}`);
    }
    this.reader = res.body.getReader();
  }

  private appendChunk(chunk: Uint8Array) {
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer, 0);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }

  private tryExtractNextJpeg(): Uint8Array | null {
    const buf = this.buffer;
    const len = buf.length;
    if (len < 4) return null;

    let soi = -1;
    for (let i = 0; i < len - 1; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd8) {
        soi = i;
        break;
      }
    }
    if (soi === -1) {
      this.buffer = new Uint8Array(0);
      return null;
    }

    let eoi = -1;
    for (let i = soi + 2; i < len - 1; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd9) {
        eoi = i + 2;
        break;
      }
    }
    if (eoi === -1) {
      if (soi > 0) {
        this.buffer = buf.slice(soi);
      }
      return null;
    }

    const jpegBytes = buf.slice(soi, eoi);
    this.buffer = buf.slice(eoi);
    return jpegBytes;
  }

  private async readNextBitmap(): Promise<ImageBitmap | null> {
    while (true) {
      const jpegBytes = this.tryExtractNextJpeg();
      if (jpegBytes) {
        const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
        return await createImageBitmap(blob);
      }
      if (this.eof || !this.reader) {
        return null;
      }
      const { done, value } = await this.reader.read();
      if (done) {
        this.eof = true;
      } else if (value) {
        this.appendChunk(value);
      }
    }
  }

  public async advanceToFrame(targetFrameIndex: number): Promise<ImageBitmap | null> {
    if (targetFrameIndex <= this.currentFrameIndex && this.currentBitmap) {
      return this.currentBitmap;
    }

    while (this.currentFrameIndex < targetFrameIndex) {
      const nextBmp = await this.readNextBitmap();
      if (!nextBmp) {
        break;
      }
      if (this.currentBitmap) {
        this.currentBitmap.close();
      }
      this.currentBitmap = nextBmp;
      this.currentFrameIndex++;
    }

    return this.currentBitmap;
  }

  public async close(): Promise<void> {
    if (this.currentBitmap) {
      this.currentBitmap.close();
      this.currentBitmap = null;
    }
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // ignore cancel error
      }
      this.reader = null;
    }
  }
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { currentProject, systemStatus, fetchSystemStatus } = useProjectStore();

  const [fileName, setFileName] = useState(
    currentProject ? `${currentProject.name}.mp4` : 'mi_video.mp4'
  );
  const [outputDir, setOutputDir] = useState<string>(
    systemStatus?.paths.exportsDir || ''
  );
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

  const [qualityScale, setQualityScale] = useState<1 | 0.6667>(1);
  const [rangeMode, setRangeMode] = useState<'inout' | 'full'>('inout');
  const [useGpu, setUseGpu] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [exportResult, setExportResult] = useState<{
    outputPath: string;
    fileName: string;
    sizeBytes: number;
    encoder?: string;
    downloadUrl: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cancelRequestedRef = useRef(false);
  const activeExportIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && currentProject) {
      setFileName(`${currentProject.name}.mp4`);
      setExportResult(null);
      setErrorMsg(null);
      setProgressPct(0);
      setIsExporting(false);
      cancelRequestedRef.current = false;
      activeExportIdRef.current = null;
      if (!outputDir && systemStatus?.paths.exportsDir) {
        setOutputDir(systemStatus.paths.exportsDir);
      }
    }
  }, [isOpen, currentProject?.id, systemStatus?.paths.exportsDir]);

  if (!isOpen || !currentProject) return null;

  const fullTimelineDuration = Math.max(
    1,
    Number(
      currentProject.clips
        .reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
        .toFixed(2)
    )
  );

  const hasCustomRange =
    typeof currentProject.inPoint === 'number' || typeof currentProject.outPoint === 'number';
  const useCustomRange = hasCustomRange && rangeMode === 'inout';
  const exportStartSec = useCustomRange ? Math.max(0, Number(currentProject.inPoint ?? 0)) : 0;
  const exportEndSec = useCustomRange
    ? Math.max(exportStartSec + 0.2, Number(currentProject.outPoint ?? fullTimelineDuration))
    : fullTimelineDuration;
  const totalDuration = Number(Math.max(0.2, exportEndSec - exportStartSec).toFixed(2));

  const { width: outW, height: outH } = getResolutionForRatio(
    currentProject.aspectRatio,
    qualityScale
  );

  const finalW = outW % 2 === 0 ? outW : outW + 1;
  const finalH = outH % 2 === 0 ? outH : outH + 1;

  const handleCancelExport = async () => {
    cancelRequestedRef.current = true;
    const currentExpId = activeExportIdRef.current;
    if (currentExpId) {
      try {
        await fetch(apiUrl('/api/export/cancel'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exportId: currentExpId }),
        });
      } catch {
        // ignore cancel error
      }
      activeExportIdRef.current = null;
    }
    setIsExporting(false);
    setProgressPct(0);
  };

  const handleOpenFolder = async (targetPath: string) => {
    try {
      await fetch(apiUrl('/api/fs/open-folder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: targetPath }),
      });
    } catch {
      // ignore error
    }
  };

  const handleStartExport = async () => {
    if (currentProject.clips.length === 0) {
      setErrorMsg('Agrega al menos un clip o texto a la línea de tiempo antes de exportar.');
      return;
    }

    cancelRequestedRef.current = false;
    activeExportIdRef.current = null;
    setIsExporting(true);
    setIsFolderPickerOpen(false);
    setProgressPct(0);
    setErrorMsg(null);
    setExportResult(null);

    const activeVideoReaders = new Map<
      string,
      {
        reader: SequentialVideoFrameReader;
        visibleStart: number;
      }
    >();

    try {
      const fps = currentProject.fps || 30;
      const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));

      const batchSize = 8;
      const canvasPool: {
        encodeToJpegBuffer: () => Promise<ArrayBuffer>;
        ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      }[] = [];

      for (let i = 0; i < batchSize; i++) {
        if (typeof OffscreenCanvas !== 'undefined') {
          const oc = new OffscreenCanvas(finalW, finalH);
          const octx = oc.getContext('2d');
          if (!octx) throw new Error('No se pudo inicializar OffscreenCanvas 2D');
          canvasPool.push({
            ctx: octx,
            encodeToJpegBuffer: async () => {
              const blob = await oc.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
              return await blob.arrayBuffer();
            },
          });
        } else {
          const hc = document.createElement('canvas');
          hc.width = finalW;
          hc.height = finalH;
          const hctx = hc.getContext('2d');
          if (!hctx) throw new Error('No se pudo inicializar Canvas 2D');
          canvasPool.push({
            ctx: hctx,
            encodeToJpegBuffer: () =>
              new Promise<ArrayBuffer>((resolve, reject) => {
                hc.toBlob(
                  (b) =>
                    b
                      ? b.arrayBuffer().then(resolve).catch(reject)
                      : reject(new Error('toBlob error')),
                  'image/jpeg',
                  0.92
                );
              }),
          });
        }
      }

      const mediaMap = new Map<string, CanvasDrawableSource>();

      for (const clip of currentProject.clips) {
        if (cancelRequestedRef.current) break;
        if (!clip.assetId || clip.type !== 'image') continue;
        const asset: MediaAsset | undefined = currentProject.assets.find(
          (a) => a.id === clip.assetId
        );
        if (!asset) continue;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = asset.url;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        mediaMap.set(clip.id, img);
      }

      if (cancelRequestedRef.current) return;

      const startRes = await fetch(apiUrl('/api/export/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fps, useGpu }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'No se pudo iniciar la exportación');
      const exportId = startData.exportId;
      activeExportIdRef.current = exportId;

      let pendingJpegPromises: Promise<ArrayBuffer>[] = [];

      const ensureVideoReaderForClip = async (clip: TimelineClip) => {
        let entry = activeVideoReaders.get(clip.id);
        if (entry) return entry;

        const asset = currentProject.assets.find((a) => a.id === clip.assetId);
        if (!asset || !asset.path) return null;

        const clipEnd = clip.startTime + clip.duration;
        const visibleStart = Math.max(exportStartSec, clip.startTime);
        const visibleEnd = Math.min(exportEndSec, clipEnd);
        const cutFromLeft = Math.max(0, visibleStart - clip.startTime);
        const sourceStart = Math.max(0, clip.sourceStart + cutFromLeft);
        const visibleDuration = Math.max(0.1, visibleEnd - visibleStart);

        const reader = new SequentialVideoFrameReader();
        await reader.start(asset.path, sourceStart, visibleDuration, fps, finalW, finalH);
        entry = { reader, visibleStart };
        activeVideoReaders.set(clip.id, entry);
        return entry;
      };

      for (let f = 0; f < totalFrames; f++) {
        if (cancelRequestedRef.current) break;

        const timeSec = exportStartSec + f / fps;
        const slotIndex = pendingJpegPromises.length;
        const poolItem = canvasPool[slotIndex];

        for (const clip of currentProject.clips) {
          if (clip.type !== 'video') continue;
          const clipEnd = clip.startTime + clip.duration;

          if (timeSec >= clip.startTime && timeSec <= clipEnd) {
            const entry = await ensureVideoReaderForClip(clip);
            if (entry) {
              const localFrameIdx = Math.max(
                0,
                Math.floor((timeSec - entry.visibleStart) * fps + 0.0001)
              );
              const bmp = await entry.reader.advanceToFrame(localFrameIdx);
              if (bmp) {
                mediaMap.set(clip.id, bmp);
              }
            }
          } else if (timeSec > clipEnd) {
            const finishedEntry = activeVideoReaders.get(clip.id);
            if (finishedEntry) {
              await finishedEntry.reader.close();
              activeVideoReaders.delete(clip.id);
              mediaMap.delete(clip.id);
            }
          }
        }

        renderProjectFrameToCanvas(
          poolItem.ctx,
          finalW,
          finalH,
          currentProject,
          timeSec,
          mediaMap
        );

        pendingJpegPromises.push(poolItem.encodeToJpegBuffer());

        if (pendingJpegPromises.length >= batchSize || f === totalFrames - 1) {
          const encodedBuffers = await Promise.all(pendingJpegPromises);
          const countInBatch = encodedBuffers.length;
          pendingJpegPromises = [];

          if (cancelRequestedRef.current) break;

          const totalBytes = encodedBuffers.reduce((acc, b) => acc + b.byteLength, 0);
          const combinedPayload = new Uint8Array(totalBytes);
          let offset = 0;
          for (const buf of encodedBuffers) {
            combinedPayload.set(new Uint8Array(buf), offset);
            offset += buf.byteLength;
          }

          const batchRes = await fetch(
            apiUrl(`/api/export/frames?exportId=${encodeURIComponent(exportId)}&count=${countInBatch}`),
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: combinedPayload,
            }
          );
          if (!batchRes.ok) {
            if (cancelRequestedRef.current) break;
            throw new Error('Error enviando lote binario al pipe de FFmpeg');
          }

          setProgressPct(Math.round(((f + 1) / totalFrames) * 92));
        }
      }

      for (const [, entry] of activeVideoReaders) {
        await entry.reader.close();
      }
      activeVideoReaders.clear();

      if (cancelRequestedRef.current) return;

      const audioClipsPayload = currentProject.clips
        .filter((c) => {
          const track = currentProject.tracks.find((t) => t.id === c.trackId);
          const clipEnd = c.startTime + c.duration;
          return (
            c.type === 'audio' &&
            !c.muted &&
            !track?.muted &&
            c.assetId &&
            clipEnd > exportStartSec &&
            c.startTime < exportEndSec
          );
        })
        .map((c) => {
          const asset = currentProject.assets.find((a) => a.id === c.assetId);
          const clipEnd = c.startTime + c.duration;
          const visibleStart = Math.max(exportStartSec, c.startTime);
          const visibleEnd = Math.min(exportEndSec, clipEnd);
          const cutFromLeft = Math.max(0, visibleStart - c.startTime);
          const segDuration = Math.max(0.05, visibleEnd - visibleStart);
          const keyframes = c.keyframes?.volume
            ? {
                volume: c.keyframes.volume
                  .map((k) => ({
                    ...k,
                    timeOffset: Number((k.timeOffset - cutFromLeft).toFixed(3)),
                  }))
                  .filter((k) => k.timeOffset >= -0.05 && k.timeOffset <= segDuration + 0.05)
                  .map((k) => ({
                    ...k,
                    timeOffset: Math.max(0, Math.min(segDuration, k.timeOffset)),
                  })),
              }
            : undefined;

          return {
            path: asset?.path,
            startTime: Number((visibleStart - exportStartSec).toFixed(3)),
            duration: Number(segDuration.toFixed(3)),
            sourceStart: Number((c.sourceStart + cutFromLeft).toFixed(3)),
            volume: c.volume,
            fadeIn: cutFromLeft > 0.05 ? 0 : c.fadeIn,
            fadeOut: visibleEnd < clipEnd - 0.05 ? 0 : c.fadeOut,
            keyframes,
          };
        })
        .filter((item) => Boolean(item.path));

      const finRes = await fetch(apiUrl('/api/export/finalize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exportId,
          fileName,
          outputDir,
          useGpu,
          fps,
          totalDuration,
          audioClips: audioClipsPayload,
        }),
      });
      const finData = await finRes.json();
      if (!finRes.ok) throw new Error(finData.error || 'Error al finalizar el archivo MP4');

      activeExportIdRef.current = null;
      setProgressPct(100);
      setExportResult(finData);
      await fetchSystemStatus();
    } catch (err: any) {
      for (const [, entry] of activeVideoReaders) {
        await entry.reader.close();
      }
      activeVideoReaders.clear();
      if (!cancelRequestedRef.current) {
        setErrorMsg(err?.message || 'Error durante la exportación');
      }
    } finally {
      if (!cancelRequestedRef.current) {
        setIsExporting(false);
      }
    }
  };

  // Parámetros geométricos para el anillo circular estilo WeTransfer
  const ringRadius = 64;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const clampedPct = Math.max(0, Math.min(100, progressPct));
  const strokeDashoffset =
    ringCircumference - (Math.max(4, clampedPct) / 100) * ringCircumference;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 select-none">
        {isExporting ? (
          /* ESTADO 2: VISTA CIRCULAR MINIMALISTA ESTILO WETRANSFER */
          <div className="w-full max-w-[320px] rounded-3xl bg-[#202124] border border-[#32343a] shadow-2xl overflow-hidden flex flex-col items-center pt-9 pb-6 px-6 text-center transition-all">
            {/* Anillo Circular con Porcentaje */}
            <div className="relative w-40 h-40 flex items-center justify-center mb-5">
              <svg
                className="w-full h-full -rotate-90"
                viewBox="0 0 160 160"
              >
                {/* Pista circular de fondo */}
                <circle
                  cx="80"
                  cy="80"
                  r={ringRadius}
                  fill="none"
                  stroke="#2c2d32"
                  strokeWidth="7"
                />
                {/* Arco de progreso activo */}
                <circle
                  cx="80"
                  cy="80"
                  r={ringRadius}
                  fill="none"
                  stroke="#00d4e5"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-[stroke-dashoffset] duration-300 ease-out"
                />
              </svg>

              {/* Número de porcentaje estático en el centro */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-start text-white font-semibold tracking-tight">
                  <span className="text-4xl font-mono leading-none">{clampedPct}</span>
                  <span className="text-sm text-gray-400 font-semibold mt-0.5 ml-0.5">%</span>
                </div>
              </div>
            </div>

            {/* Texto minimalista (sin contador de fotogramas) */}
            <h4 className="text-base font-bold text-white mb-1">Exportando...</h4>
            <p className="text-xs text-[#00d4e5] font-medium truncate max-w-full px-2">
              {fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`}
            </p>

            {/* Separador y botón píldora Cancelar */}
            <div className="w-full border-t border-[#2c2d32] mt-7 pt-5 flex justify-center">
              <button
                type="button"
                onClick={handleCancelExport}
                className="px-8 py-2 rounded-full border border-[#3a3c44] hover:border-[#00d4e5] text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : exportResult ? (
          /* ESTADO 3: VISTA FINAL CIRCULAR "¡EXPORTADO CON ÉXITO!" + ABRIR CARPETA */
          <div className="w-full max-w-[320px] rounded-3xl bg-[#202124] border border-[#32343a] shadow-2xl overflow-hidden flex flex-col items-center pt-9 pb-6 px-6 text-center transition-all">
            {/* Círculo completado 100% con Check */}
            <div className="relative w-36 h-36 flex items-center justify-center mb-5">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r={ringRadius}
                  fill="rgba(0, 212, 229, 0.08)"
                  stroke="#00d4e5"
                  strokeWidth="7"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-[#00d4e5]/20 flex items-center justify-center text-[#00d4e5]">
                  <Check className="w-9 h-9 stroke-[2.75]" />
                </div>
              </div>
            </div>

            <h4 className="text-base font-bold text-white mb-1">¡Exportado con éxito!</h4>
            <p
              title={exportResult.fileName}
              className="text-xs text-[#00d4e5] font-medium truncate max-w-full px-2"
            >
              {exportResult.fileName}
            </p>
            <p className="text-[11px] text-gray-400 font-mono mt-1">
              {formatBytes(exportResult.sizeBytes)}
            </p>

            {/* Botones de acción finales */}
            <div className="w-full border-t border-[#2c2d32] mt-7 pt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => handleOpenFolder(exportResult.outputPath)}
                className="w-full py-2.5 px-5 rounded-full bg-[#00d4e5] hover:bg-[#19e3f3] text-[#141517] font-semibold text-xs flex items-center justify-center gap-2 shadow transition"
              >
                <FolderOpen className="w-4 h-4" />
                Abrir carpeta
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 px-5 rounded-full border border-[#3a3c44] hover:border-gray-500 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          /* ESTADO 1: FORMULARIO DE CONFIGURACIÓN DE EXPORTACIÓN */
          <div className="w-full max-w-lg rounded-2xl bg-[#202124] border border-[#32343a] shadow-2xl p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#2c2d32] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#00d4e5]/15 border border-[#00d4e5]/40 flex items-center justify-center text-[#00d4e5]">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Exportar video (.mp4)</h3>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Options */}
            <div className="space-y-3.5 text-xs">
              {/* File Name */}
              <div className="space-y-1.5">
                <label className="text-gray-300 font-medium">Nombre del archivo</label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#18191c] border border-[#32343a] text-xs text-white font-mono focus:outline-none focus:border-[#00d4e5]"
                />
              </div>

              {/* Save Destination Directory ("Guardar en") */}
              <div className="space-y-1.5">
                <label className="text-gray-300 font-medium">Guardar en</label>
                <div className="flex items-center gap-2">
                  <div
                    title={outputDir}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#18191c] border border-[#32343a] text-gray-300 font-mono truncate"
                  >
                    {outputDir || 'Carpeta de exportaciones'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(true)}
                    className="px-3 py-2 rounded-xl bg-[#2a2b30] hover:bg-[#32343a] border border-[#363840] text-gray-200 font-medium flex items-center gap-1.5 shrink-0 transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#00d4e5]" />
                    Cambiar...
                  </button>
                </div>
              </div>

              {/* Resolution & Format/Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-gray-300 font-medium">Resolución</label>
                  <div className="relative">
                    <select
                      value={qualityScale}
                      onChange={(e) => setQualityScale(Number(e.target.value) as 1 | 0.6667)}
                      className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl bg-[#18191c] border border-[#32343a] text-xs text-white focus:outline-none focus:border-[#00d4e5] cursor-pointer"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value={1} className="bg-[#18191c] text-white">
                        1080p Full HD ({finalW}×{finalH})
                      </option>
                      <option value={0.6667} className="bg-[#18191c] text-white">
                        720p HD Rápido
                      </option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-gray-300 font-medium">Formato y duración</label>
                  <div className="px-3 py-2 rounded-xl bg-[#18191c] border border-[#32343a] text-gray-300 font-mono">
                    {currentProject.aspectRatio} · {currentProject.fps} FPS · {totalDuration}s
                  </div>
                </div>
              </div>

              {/* Coherent Range Selection (Only when In / Out points exist) */}
              {hasCustomRange && (
                <div className="space-y-1.5">
                  <label className="text-gray-300 font-medium">Rango a exportar</label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#18191c] border border-[#32343a]">
                    <button
                      type="button"
                      onClick={() => setRangeMode('inout')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                        rangeMode === 'inout'
                          ? 'bg-[#2a2b30] text-white border border-[#00d4e5]/60 shadow-xs'
                          : 'text-gray-400 hover:text-gray-200 border border-transparent'
                      }`}
                    >
                      Duración seleccionada
                    </button>
                    <button
                      type="button"
                      onClick={() => setRangeMode('full')}
                      className={`py-1.5 px-3 rounded-lg text-xs font-medium transition ${
                        rangeMode === 'full'
                          ? 'bg-[#2a2b30] text-white border border-[#00d4e5]/60 shadow-xs'
                          : 'text-gray-400 hover:text-gray-200 border border-transparent'
                      }`}
                    >
                      Proyecto completo
                    </button>
                  </div>
                </div>
              )}

              {/* Hardware GPU Acceleration Option (Active by default) */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#18191c] border border-[#32343a]">
                <div className="flex items-center gap-2 text-gray-300">
                  <Cpu className="w-3.5 h-3.5 text-[#00d4e5]" />
                  <span>Aceleración por hardware GPU (VAAPI)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUseGpu((prev) => !prev)}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                    useGpu ? 'bg-[#00d4e5]' : 'bg-[#32343a]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-[#141517] transition-transform ${
                      useGpu ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200">
                  {errorMsg}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2c2d32]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-gray-300 hover:bg-white/5"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleStartExport}
                className="px-5 py-2 rounded-xl bg-[#00d4e5] hover:bg-[#19e3f3] text-[#0d0e11] font-semibold text-xs flex items-center gap-1.5 shadow transition"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Local File Browser Modal in Directory Selection Mode */}
      <LocalFileBrowserModal
        isOpen={isFolderPickerOpen}
        onClose={() => setIsFolderPickerOpen(false)}
        mode="directory"
        initialDir={outputDir || systemStatus?.paths.exportsDir}
        onSelectDirectory={(selectedDir) => setOutputDir(selectedDir)}
      />
    </>
  );
};
