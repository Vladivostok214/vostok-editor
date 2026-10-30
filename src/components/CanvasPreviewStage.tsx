import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCw,
  Plus,
  Monitor,
  Smartphone,
  Square,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { apiUrl } from '../config/api';
import { computeTrackOverlaps } from './TimelinePanel';
import type { AspectRatio, MediaAsset, ProjectData, TimelineClip } from '../types/project';

export function getResolutionForRatio(
  ratio: AspectRatio,
  scaleFactor = 1
): { width: number; height: number } {
  const base =
    ratio === '9:16'
      ? { width: 1080, height: 1920 }
      : ratio === '1:1'
      ? { width: 1080, height: 1080 }
      : { width: 1920, height: 1080 };
  return {
    width: Math.round(base.width * scaleFactor),
    height: Math.round(base.height * scaleFactor),
  };
}

export interface ClipVisualBox {
  clip: TimelineClip;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotation: number;
}

export function computeClipIndividualFadeAlpha(clip: TimelineClip, time: number): number {
  const elapsed = time - clip.startTime;
  const remaining = clip.startTime + clip.duration - time;
  if (elapsed < 0 || remaining < 0) return 0;

  let alpha = 1;
  if (clip.fadeIn > 0.02 && elapsed < clip.fadeIn) {
    alpha = Math.min(alpha, Math.max(0, elapsed / clip.fadeIn));
  }
  if (clip.fadeOut > 0.02 && remaining < clip.fadeOut) {
    alpha = Math.min(alpha, Math.max(0, remaining / clip.fadeOut));
  }
  return alpha;
}

export type CanvasDrawableSource = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;
export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawSingleClipToContext(
  ctx: Canvas2DContext,
  canvasWidth: number,
  canvasHeight: number,
  clip: TimelineClip,
  mediaSource: CanvasDrawableSource | undefined,
  extraAlpha = 1,
  extraOffsetX = 0,
  extraScale = 1
): ClipVisualBox | null {
  const tf = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false };
  const finalAlpha = Math.max(0, Math.min(1, tf.opacity * extraAlpha));
  if (finalAlpha <= 0.005) return null;

  const centerX = canvasWidth / 2 + tf.x + extraOffsetX;
  const centerY = canvasHeight / 2 + tf.y;
  const totalScale = Math.max(0.05, tf.scale * extraScale);
  const rad = (tf.rotation * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = finalAlpha;
  ctx.translate(centerX, centerY);
  ctx.rotate(rad);
  ctx.scale(tf.flipX ? -totalScale : totalScale, totalScale);

  let baseWidth = 400;
  let baseHeight = 220;

  if (clip.type === 'text' && clip.textConfig) {
    const cfg = clip.textConfig;
    const rawSize = cfg.fontSize ?? 16;
    // Escala normalizada de video (5 a 32): factor 9.5 para resolución Full HD 1080p nativa
    const renderedFontSize = rawSize <= 32 ? Math.round(rawSize * 9.5) : rawSize;

    const weight = cfg.bold ? Math.max(700, cfg.fontWeight || 700) : (cfg.fontWeight || 400);
    const fontStyle = `${cfg.italic ? 'italic ' : ''}${weight} ${renderedFontSize}px "${cfg.fontFamily || 'TikTok Sans Variable'}", sans-serif`;
    ctx.font = fontStyle;
    ctx.textBaseline = 'middle';
    ctx.textAlign = (cfg.align as CanvasTextAlign) || 'center';

    // Soporte para espaciado entre letras (Kerning) en Canvas 2D
    if ('letterSpacing' in ctx) {
      (ctx as any).letterSpacing = `${cfg.letterSpacing || 0}px`;
    }

    const rawContent = cfg.content || '';
    const finalContent = cfg.uppercase ? rawContent.toUpperCase() : rawContent;
    const lines = finalContent.split('\n');
    const lineHeight = renderedFontSize * (cfg.lineHeightMultiplier || 1.25);
    let maxLineW = 120;
    const lineWidths: number[] = [];
    for (const line of lines) {
      const m = ctx.measureText(line);
      const w = m.width;
      lineWidths.push(w);
      if (w > maxLineW) maxLineW = w;
    }

    baseWidth = maxLineW + 48;
    baseHeight = lines.length * lineHeight + 28;

    if (cfg.backgroundColor && cfg.backgroundColor !== 'transparent') {
      ctx.fillStyle = cfg.backgroundColor;
      ctx.beginPath();
      ctx.roundRect(-baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight, 14);
      ctx.fill();
    }

    const hasStroke = cfg.strokeColor && cfg.strokeColor !== 'transparent' && (cfg.strokeWidth || 0) > 0;
    const strokeW = cfg.strokeWidth || 4;

    lines.forEach((line, idx) => {
      const yOffset = (idx - (lines.length - 1) / 2) * lineHeight;
      let xOffset = 0;
      if (cfg.align === 'left') {
        xOffset = -maxLineW / 2;
      } else if (cfg.align === 'right') {
        xOffset = maxLineW / 2;
      }

      // Dibujar Trazo / Borde exterior si está activo
      if (hasStroke) {
        ctx.save();
        ctx.strokeStyle = cfg.strokeColor!;
        ctx.lineWidth = strokeW;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(line, xOffset, yOffset);
        ctx.restore();
      }

      // Relleno principal nítido sin halo ni sombra espuria
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = cfg.color || '#ffffff';
      ctx.fillText(line, xOffset, yOffset);

      // Subrayado
      if (cfg.underline) {
        const lineW = lineWidths[idx] || maxLineW;
        let lineX = xOffset - lineW / 2;
        if (cfg.align === 'left') lineX = xOffset;
        if (cfg.align === 'right') lineX = xOffset - lineW;

        const lineY = yOffset + cfg.fontSize * 0.55;
        ctx.save();
        ctx.strokeStyle = cfg.color || '#ffffff';
        ctx.lineWidth = Math.max(2, cfg.fontSize * 0.08);
        ctx.beginPath();
        ctx.moveTo(lineX, lineY);
        ctx.lineTo(lineX + lineW, lineY);
        ctx.stroke();
        ctx.restore();
      }
    });
  } else if (mediaSource) {
    const srcW =
      mediaSource instanceof HTMLVideoElement
        ? mediaSource.videoWidth || 1280
        : mediaSource instanceof HTMLImageElement
        ? mediaSource.naturalWidth || 1280
        : mediaSource.width || 1280;
    const srcH =
      mediaSource instanceof HTMLVideoElement
        ? mediaSource.videoHeight || 720
        : mediaSource instanceof HTMLImageElement
        ? mediaSource.naturalHeight || 720
        : mediaSource.height || 720;

    const fitScale = Math.min(canvasWidth / srcW, canvasHeight / srcH);
    baseWidth = srcW * fitScale;
    baseHeight = srcH * fitScale;

    try {
      if (mediaSource instanceof HTMLVideoElement) {
        if (mediaSource.readyState >= 2 && mediaSource.videoWidth > 0 && mediaSource.videoHeight > 0) {
          ctx.drawImage(mediaSource, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
        }
      } else {
        ctx.drawImage(mediaSource, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
      }
    } catch {
      // Ignore if media frame is not decoded yet
    }
  }

  ctx.restore();

  return {
    clip,
    centerX,
    centerY,
    width: baseWidth * totalScale,
    height: baseHeight * totalScale,
    rotation: tf.rotation,
  };
}

export function renderProjectFrameToCanvas(
  ctx: Canvas2DContext,
  canvasWidth: number,
  canvasHeight: number,
  project: ProjectData,
  time: number,
  mediaElements: Map<string, CanvasDrawableSource>
): ClipVisualBox[] {
  ctx.save();
  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();

  const drawnBoxes: ClipVisualBox[] = [];
  const orderedTracks = [...project.tracks].reverse();

  for (const track of orderedTracks) {
    if (track.hidden || track.type === 'audio') continue;

    const trackClips = project.clips.filter((c) => c.trackId === track.id);
    const activeClips = trackClips
      .filter((c) => time >= c.startTime && time <= c.startTime + c.duration)
      .sort((a, b) => a.startTime - b.startTime);

    if (activeClips.length === 0) continue;

    const overlaps = computeTrackOverlaps(trackClips);
    const activeOverlap = overlaps.find((ov) => time >= ov.startTime && time <= ov.endTime);

    if (activeOverlap) {
      const { clipA, clipB, startTime, duration } = activeOverlap;
      const p = Math.max(0, Math.min(1, (time - startTime) / Math.max(0.05, duration)));
      const transition = clipB.overlapTransition || 'crossfade';
      const srcA = mediaElements.get(clipA.id);
      const srcB = mediaElements.get(clipB.id);

      if (transition === 'crossfade') {
        const b1 = drawSingleClipToContext(ctx, canvasWidth, canvasHeight, clipA, srcA, 1 - p);
        const b2 = drawSingleClipToContext(ctx, canvasWidth, canvasHeight, clipB, srcB, p);
        if (b1) drawnBoxes.push(b1);
        if (b2) drawnBoxes.push(b2);
      } else if (transition === 'fade-black') {
        if (p < 0.5) {
          const alphaA = 1 - p * 2;
          const b1 = drawSingleClipToContext(ctx, canvasWidth, canvasHeight, clipA, srcA, alphaA);
          if (b1) drawnBoxes.push(b1);
        } else {
          const alphaB = (p - 0.5) * 2;
          const b2 = drawSingleClipToContext(ctx, canvasWidth, canvasHeight, clipB, srcB, alphaB);
          if (b2) drawnBoxes.push(b2);
        }
      } else if (transition === 'wipe-left' || transition === 'wipe-right') {
        const b1 = drawSingleClipToContext(ctx, canvasWidth, canvasHeight, clipA, srcA, 1);
        if (b1) drawnBoxes.push(b1);

        ctx.save();
        ctx.beginPath();
        if (transition === 'wipe-left') {
          ctx.rect(canvasWidth * (1 - p), 0, canvasWidth * p, canvasHeight);
        } else {
          ctx.rect(0, 0, canvasWidth * p, canvasHeight);
        }
        ctx.clip();
        const b2 = drawSingleClipToContext(ctx, canvasWidth, canvasHeight, clipB, srcB, 1);
        ctx.restore();
        if (b2) drawnBoxes.push(b2);
      } else if (transition === 'slide-left') {
        const b1 = drawSingleClipToContext(
          ctx,
          canvasWidth,
          canvasHeight,
          clipA,
          srcA,
          1,
          -p * canvasWidth
        );
        const b2 = drawSingleClipToContext(
          ctx,
          canvasWidth,
          canvasHeight,
          clipB,
          srcB,
          1,
          (1 - p) * canvasWidth
        );
        if (b1) drawnBoxes.push(b1);
        if (b2) drawnBoxes.push(b2);
      } else if (transition === 'zoom') {
        const b1 = drawSingleClipToContext(
          ctx,
          canvasWidth,
          canvasHeight,
          clipA,
          srcA,
          1 - p,
          0,
          1 + p * 0.45
        );
        const b2 = drawSingleClipToContext(
          ctx,
          canvasWidth,
          canvasHeight,
          clipB,
          srcB,
          p,
          0,
          0.65 + p * 0.35
        );
        if (b1) drawnBoxes.push(b1);
        if (b2) drawnBoxes.push(b2);
      }
    } else {
      for (const clip of activeClips) {
        const fadeAlpha = computeClipIndividualFadeAlpha(clip, time);
        const src = mediaElements.get(clip.id);
        const box = drawSingleClipToContext(
          ctx,
          canvasWidth,
          canvasHeight,
          clip,
          src,
          fadeAlpha
        );
        if (box) drawnBoxes.push(box);
      }
    }
  }

  return drawnBoxes;
}

export const CanvasPreviewStage: React.FC = () => {
  const {
    currentProject,
    playheadTime,
    isPlaying,
    selectedClipId,
    isFullscreenPreview,
    selectClip,
    pushUndoSnapshot,
    persistCurrentProject,
    updateProjectMeta,
    updateClipTransformLive,
    setIsFileBrowserOpen,
    importDroppedFiles,
    addAssetToTimeline,
  } = useProjectStore();

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoPoolContainerRef = useRef<HTMLDivElement | null>(null);
  const mediaElementsRef = useRef<Map<string, HTMLVideoElement | HTMLImageElement>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastBoxesRef = useRef<ClipVisualBox[]>([]);

  const [snapGuideX, setSnapGuideX] = useState(false);
  const [snapGuideY, setSnapGuideY] = useState(false);
  const [isRatioMenuOpen, setIsRatioMenuOpen] = useState(false);
  const [isDraggingOverStage, setIsDraggingOverStage] = useState(false);
  const [availableSize, setAvailableSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360,
  });
  const [, setTickRender] = useState(0);

  // Measure available stage area dynamically so aspect ratio is 100% preserved
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 20 && height > 20) {
          setAvailableSize({ width, height });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 1. Maintain HTMLVideoElement, HTMLImageElement and HTMLAudioElement pool per clip
  useEffect(() => {
    if (!currentProject) return;
    const currentClipIds = new Set(currentProject.clips.map((c) => c.id));

    for (const [id, el] of mediaElementsRef.current.entries()) {
      if (!currentClipIds.has(id)) {
        if (el instanceof HTMLVideoElement) {
          el.pause();
          el.removeAttribute('src');
          el.load();
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }
        mediaElementsRef.current.delete(id);
      }
    }
    for (const [id, el] of audioElementsRef.current.entries()) {
      if (!currentClipIds.has(id)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        audioElementsRef.current.delete(id);
      }
    }

    for (const clip of currentProject.clips) {
      if (!clip.assetId) continue;
      const asset: MediaAsset | undefined = currentProject.assets.find(
        (a) => a.id === clip.assetId
      );
      if (!asset) continue;

      if (clip.type === 'video' && !mediaElementsRef.current.has(clip.id)) {
        const vid = document.createElement('video');
        vid.src = apiUrl(asset.url);
        vid.preload = 'auto';
        vid.muted = true;
        vid.playsInline = true;
        vid.crossOrigin = 'anonymous';
        vid.style.position = 'absolute';
        vid.style.width = '1px';
        vid.style.height = '1px';
        vid.style.opacity = '0.001';
        vid.style.pointerEvents = 'none';

        const onFrameReady = () => setTickRender((n) => n + 1);
        vid.addEventListener('loadeddata', onFrameReady);
        vid.addEventListener('canplay', onFrameReady);
        vid.addEventListener('seeked', onFrameReady);
        vid.addEventListener('timeupdate', onFrameReady);
        vid.addEventListener('loadedmetadata', () => {
          if (vid.currentTime === 0) {
            vid.currentTime = 0.001;
          }
          setTickRender((n) => n + 1);
        });

        if (videoPoolContainerRef.current) {
          videoPoolContainerRef.current.appendChild(vid);
        }
        mediaElementsRef.current.set(clip.id, vid);
      } else if (clip.type === 'image' && !mediaElementsRef.current.has(clip.id)) {
        const img = new Image();
        img.src = apiUrl(asset.url);
        img.crossOrigin = 'anonymous';
        img.onload = () => setTickRender((n) => n + 1);
        mediaElementsRef.current.set(clip.id, img);
      } else if (clip.type === 'audio' && !audioElementsRef.current.has(clip.id)) {
        const aud = new Audio(apiUrl(asset.url));
        aud.preload = 'auto';
        audioElementsRef.current.set(clip.id, aud);
      }
    }
  }, [currentProject]);

  // 2. Sync Video & Audio Elements with Playhead Time, Volume & Crossfades
  useEffect(() => {
    if (!currentProject) return;

    for (const clip of currentProject.clips) {
      const track = currentProject.tracks.find((t) => t.id === clip.trackId);
      const isActive =
        playheadTime >= clip.startTime && playheadTime <= clip.startTime + clip.duration;
      const targetMediaTime = Math.max(
        0,
        clip.sourceStart + (playheadTime - clip.startTime)
      );

      if (clip.type === 'video') {
        const vid = mediaElementsRef.current.get(clip.id) as HTMLVideoElement | undefined;
        if (!vid) continue;

        if (isActive && !track?.hidden) {
          if (Math.abs(vid.currentTime - targetMediaTime) > (isPlaying ? 0.28 : 0.04)) {
            vid.currentTime = targetMediaTime;
          }
          if (isPlaying && vid.paused) {
            vid.play().catch(() => {});
          } else if (!isPlaying && !vid.paused) {
            vid.pause();
          }
        } else {
          if (!vid.paused) vid.pause();
        }
      }

      if (clip.type === 'audio') {
        const aud = audioElementsRef.current.get(clip.id);
        if (!aud) continue;

        if (isActive && !track?.muted && !clip.muted) {
          const trackClips = currentProject.clips.filter((c) => c.trackId === clip.trackId);
          const overlaps = computeTrackOverlaps(trackClips);
          const activeOv = overlaps.find(
            (ov) => playheadTime >= ov.startTime && playheadTime <= ov.endTime
          );

          let ovFactor = 1;
          if (activeOv) {
            const p = Math.max(
              0,
              Math.min(1, (playheadTime - activeOv.startTime) / Math.max(0.05, activeOv.duration))
            );
            if (activeOv.clipA.id === clip.id) ovFactor = 1 - p;
            if (activeOv.clipB.id === clip.id) ovFactor = p;
          }

          const fadeFactor = computeClipIndividualFadeAlpha(clip, playheadTime);
          aud.volume = Math.max(0, Math.min(1, clip.volume * fadeFactor * ovFactor));

          if (Math.abs(aud.currentTime - targetMediaTime) > (isPlaying ? 0.28 : 0.06)) {
            aud.currentTime = targetMediaTime;
          }
          if (isPlaying && aud.paused) {
            aud.play().catch(() => {});
          } else if (!isPlaying && !aud.paused) {
            aud.pause();
          }
        } else {
          if (!aud.paused) aud.pause();
        }
      }
    }
  }, [currentProject, playheadTime, isPlaying]);

  // 3. Draw Composite Frame onto <canvas>
  useEffect(() => {
    if (!currentProject || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const boxes = renderProjectFrameToCanvas(
      ctx,
      canvas.width,
      canvas.height,
      currentProject,
      playheadTime,
      mediaElementsRef.current
    );
    lastBoxesRef.current = boxes;
  });

  if (!currentProject) return null;

  const { width: canvasW, height: canvasH } = getResolutionForRatio(
    currentProject.aspectRatio,
    1
  );

  const padW = Math.max(80, availableSize.width - (isFullscreenPreview ? 48 : 36));
  const padH = Math.max(80, availableSize.height - (isFullscreenPreview ? 48 : 36));
  const fitFactor = Math.min(padW / canvasW, padH / canvasH);
  const displayW = Math.max(60, Math.floor(canvasW * fitFactor));
  const displayH = Math.max(60, Math.floor(canvasH * fitFactor));
  const coordRatioX = canvasW / displayW;
  const coordRatioY = canvasH / displayH;

  const isEmptyProject = currentProject.clips.length === 0;

  const selectedBox =
    !isFullscreenPreview
      ? lastBoxesRef.current.find((b) => b.clip.id === selectedClipId) || null
      : null;

  // Click on canvas to select topmost visual clip under cursor, or deselect if clicking empty area
  const handleStageMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.button !== 0 || isFullscreenPreview) return;
    setIsRatioMenuOpen(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * coordRatioX;
    const clickY = (e.clientY - rect.top) * coordRatioY;

    const reversedBoxes = [...lastBoxesRef.current].reverse();
    for (const box of reversedBoxes) {
      const halfW = box.width / 2;
      const halfH = box.height / 2;
      if (
        clickX >= box.centerX - halfW &&
        clickX <= box.centerX + halfW &&
        clickY >= box.centerY - halfH &&
        clickY <= box.centerY + halfH
      ) {
        selectClip(box.clip.id);
        startGizmoMove(e, box.clip);
        return;
      }
    }

    // Clicked on empty canvas area -> deselect clip and close inspector
    selectClip(null);
  };

  // Dragging to Move (X, Y) with Magnetic Center Guides
  const startGizmoMove = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    pushUndoSnapshot();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const initX = clip.transform.x;
    const initY = clip.transform.y;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dx = (moveEvt.clientX - startMouseX) * coordRatioX;
      const dy = (moveEvt.clientY - startMouseY) * coordRatioY;
      let nextX = Math.round(initX + dx);
      let nextY = Math.round(initY + dy);

      if (Math.abs(nextX) < 18) {
        nextX = 0;
        setSnapGuideX(true);
      } else {
        setSnapGuideX(false);
      }

      if (Math.abs(nextY) < 18) {
        nextY = 0;
        setSnapGuideY(true);
      } else {
        setSnapGuideY(false);
      }

      updateClipTransformLive(clip.id, { x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      setSnapGuideX(false);
      setSnapGuideY(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      persistCurrentProject();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Corner Resize (Scale)
  const startGizmoScale = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    pushUndoSnapshot();

    const startMouseY = e.clientY;
    const initScale = clip.transform.scale;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dy = startMouseY - moveEvt.clientY;
      const nextScale = Math.max(0.15, Math.min(4, Number((initScale + dy * 0.006).toFixed(2))));
      updateClipTransformLive(clip.id, { scale: nextScale });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      persistCurrentProject();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Tirador inferior de rotación continua
  const startGizmoRotate = (
    e: React.MouseEvent,
    clip: TimelineClip,
    boxCenterScreenX: number,
    boxCenterScreenY: number
  ) => {
    e.stopPropagation();
    pushUndoSnapshot();

    const onMouseMove = (moveEvt: MouseEvent) => {
      const angleRad = Math.atan2(
        moveEvt.clientY - boxCenterScreenY,
        moveEvt.clientX - boxCenterScreenX
      );
      let deg = Math.round((angleRad * 180) / Math.PI - 90);
      if (deg < 0) deg += 360;
      if (Math.abs(deg) < 5 || Math.abs(deg - 360) < 5) deg = 0;
      updateClipTransformLive(clip.id, { rotation: deg });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      persistCurrentProject();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverStage(false);

    const draggedAssetId = e.dataTransfer.getData('application/x-video-editor-asset');
    if (draggedAssetId) {
      await addAssetToTimeline(draggedAssetId);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const imported = await importDroppedFiles(e.dataTransfer.files);
      if (imported.length > 0 && currentProject.clips.length === 0) {
        await addAssetToTimeline(imported[0].id, { startTime: 0 });
      }
    }
  };

  return (
    <div
      ref={wrapperRef}
      onMouseDown={(e) => {
        if (e.button === 0) {
          selectClip(null);
          setIsRatioMenuOpen(false);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOverStage(true);
      }}
      onDragLeave={() => setIsDraggingOverStage(false)}
      onDrop={handleStageDrop}
      className="flex-1 w-full h-full min-h-0 flex items-center justify-center relative overflow-hidden"
    >
      {/* Botón flotante superior de relación de aspecto (`[ ] Relación` / `16:9`) */}
      {!isFullscreenPreview && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-3 left-3 z-30"
        >
          <button
            type="button"
            onClick={() => setIsRatioMenuOpen((v) => !v)}
            title="Cambiar relación de aspecto del proyecto"
            className="w-14 py-2 rounded-xl bg-[#25262b]/95 hover:bg-[#2f3037] border border-[#32343a] text-gray-200 flex flex-col items-center justify-center gap-1 shadow-lg transition"
          >
            {currentProject.aspectRatio === '9:16' ? (
              <Smartphone className="w-4 h-4 text-gray-300" />
            ) : currentProject.aspectRatio === '1:1' ? (
              <Square className="w-4 h-4 text-gray-300" />
            ) : (
              <Monitor className="w-4 h-4 text-gray-300" />
            )}
            <span className="text-[11px] font-medium leading-none">
              {isEmptyProject ? 'Relación' : currentProject.aspectRatio}
            </span>
          </button>

          {isRatioMenuOpen && (
            <div className="mt-1.5 w-36 rounded-xl bg-[#202124] border border-[#32343a] shadow-2xl py-1.5 z-40">
              {(
                [
                  { ratio: '16:9', label: '16:9 Horizontal', icon: Monitor },
                  { ratio: '9:16', label: '9:16 Vertical', icon: Smartphone },
                  { ratio: '1:1', label: '1:1 Cuadrado', icon: Square },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = currentProject.aspectRatio === item.ratio;
                return (
                  <button
                    key={item.ratio}
                    type="button"
                    onClick={() => {
                      updateProjectMeta({ aspectRatio: item.ratio });
                      setIsRatioMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-xs flex items-center gap-2.5 transition ${
                      active
                        ? 'bg-[#00d4e5]/15 text-[#00d4e5] font-semibold'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stage 2: Empty Project Central Upload Dropzone */}
      {isEmptyProject && !isFullscreenPreview ? (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setIsFileBrowserOpen(true)}
          className={`flex flex-col items-center justify-center p-10 rounded-2xl cursor-pointer transition group ${
            isDraggingOverStage
              ? 'bg-[#00d4e5]/10 ring-2 ring-[#00d4e5]'
              : 'hover:bg-white/[0.02]'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-[#00d4e5] group-hover:bg-[#19e3f3] text-[#141517] flex items-center justify-center shadow-lg shadow-[#00d4e5]/25 group-hover:scale-105 transition mb-4">
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </div>
          <p className="text-sm font-semibold text-gray-100 mb-1">
            Haz clic para cargar
          </p>
          <p className="text-xs text-gray-400">
            O arrastra y suelta el archivo aquí
          </p>
        </div>
      ) : (
        /* Active Video Canvas Stage */
        <div
          onMouseDown={handleStageMouseDown}
          style={{ width: `${displayW}px`, height: `${displayH}px` }}
          className={`relative shrink-0 bg-[#0a0a0c] shadow-2xl select-none ${
            isDraggingOverStage ? 'ring-2 ring-[#00d4e5]' : ''
          }`}
        >
          {/* Unified Rendering Canvas */}
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            className="w-full h-full block pointer-events-none"
          />

          {/* Magnetic Center Snap Guides */}
          {snapGuideX && (
            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-[#00d4e5] z-30 pointer-events-none" />
          )}
          {snapGuideY && (
            <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-[#00d4e5] z-30 pointer-events-none" />
          )}

          {/* Clean Interactive Transformation Gizmo Overlay (Cyan Frame + 4 White Corners + Bottom Rotate Handle) */}
          {selectedBox && (
            <div
              onMouseDown={(e) => startGizmoMove(e, selectedBox.clip)}
              style={{
                left: `${selectedBox.centerX / coordRatioX}px`,
                top: `${selectedBox.centerY / coordRatioY}px`,
                width: `${Math.max(36, selectedBox.width / coordRatioX)}px`,
                height: `${Math.max(24, selectedBox.height / coordRatioY)}px`,
                transform: `translate(-50%, -50%) rotate(${selectedBox.rotation}deg)`,
              }}
              className="absolute border-[1.5px] border-[#00d4e5] cursor-move z-20"
            >
              {/* 4 White Circular Corner Scale Handles */}
              {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
                <div
                  key={corner}
                  onMouseDown={(e) => startGizmoScale(e, selectedBox.clip)}
                  title="Arrastrar esquina para escalar tamaño"
                  className={`absolute w-3 h-3 rounded-full bg-white border border-[#00d4e5] shadow-md cursor-nwse-resize ${
                    corner === 'top-left'
                      ? '-top-1.5 -left-1.5'
                      : corner === 'top-right'
                      ? '-top-1.5 -right-1.5'
                      : corner === 'bottom-left'
                      ? '-bottom-1.5 -left-1.5'
                      : '-bottom-1.5 -right-1.5'
                  }`}
                />
              ))}

              {/* Tirador inferior de rotación circular bajo el centro del marco */}
              <div
                onMouseDown={(e) => {
                  const parentRect = e.currentTarget.parentElement?.getBoundingClientRect();
                  if (!parentRect) return;
                  startGizmoRotate(
                    e,
                    selectedBox.clip,
                    parentRect.left + parentRect.width / 2,
                    parentRect.top + parentRect.height / 2
                  );
                }}
                title="Arrastrar para rotar"
                className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white text-[#141517] border border-[#32343a] flex items-center justify-center cursor-grab shadow-lg hover:scale-110 transition"
              >
                <RotateCw className="w-3 h-3 stroke-[2.5]" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden DOM video elements pool required by WebKitGTK to decode video frames reliably */}
      <div
        ref={videoPoolContainerRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: -9999,
          left: -9999,
          width: '1px',
          height: '1px',
          opacity: 0.001,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};
