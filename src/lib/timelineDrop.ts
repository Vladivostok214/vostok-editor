import type React from 'react';
import type { MediaAsset, TimelineClip, Track, TrackType } from '../types/project';
import {
  findOrCreateAvailableTrack,
  getMainVideoTrack,
  getTrackZoneBounds,
  useProjectStore,
} from '../store/useProjectStore';
import type { DropIndicator } from '../store/useProjectStore';

/** Alto de la regla de tiempo sticky que cubre la parte superior del área de pistas */
const RULER_HEIGHT = 28;
/** Distancia en px desde el borde de una fila que cuenta como "borde entre pistas" */
const ASSET_EDGE_PX = 10;
const CLIP_EDGE_PX = 6;
/** Movimiento mínimo (px) para considerar que empezó un arrastre desde la biblioteca */
const DRAG_THRESHOLD_PX = 5;

export type DraggableMediaType = 'video' | 'audio' | 'image' | 'text';

export interface DropTarget {
  kind: 'track' | 'new-track';
  /** Tiempo (s) señalado por el cursor */
  startTime: number;
  /** Opciones a pasar a `addAssetToTimeline` / `moveClipToNewTrack` al soltar */
  commit: { trackId?: string; insertAtIndex?: number };
  indicator: DropIndicator;
}

interface ComputeParams {
  clientX: number;
  clientY: number;
  tracks: Track[];
  clips: TimelineClip[];
  mediaType: DraggableMediaType;
  duration: number;
  zoom: number;
  isMagnetic: boolean;
  /** Clip que se está moviendo (se ignora al evaluar colisiones y el magnetismo) */
  ignoreClipId?: string;
  /**
   * `true` para mover clips existentes: solo interesan los bordes entre pistas
   * (la colocación sobre una pista usa la lógica de movimiento en vivo).
   */
  edgeOnly?: boolean;
  /** Para clips existentes: id de su pista actual (evita inserciones sin efecto) */
  sourceTrackId?: string;
}

function toTrackType(type: DraggableMediaType): TrackType {
  return type === 'image' ? 'video' : type;
}

/** Posición Y (ventana) de la línea de inserción para el índice dado */
function boundaryY(rects: DOMRect[], insertIndex: number): number {
  if (insertIndex <= 0) return rects[0].top - 4;
  if (insertIndex >= rects.length) return rects[rects.length - 1].bottom + 4;
  return (rects[insertIndex - 1].bottom + rects[insertIndex].top) / 2;
}

/**
 * Calcula, a partir de la posición del cursor, dónde caería un medio o clip en la línea de tiempo:
 *  - sobre una pista existente (marcador punteado con la forma del clip), o
 *  - entre dos pistas (línea cian que indica la creación de una pista nueva).
 */
export function computeDropTarget(p: ComputeParams): DropTarget | null {
  const scrollEl = document.querySelector('[data-timeline-scroll]') as HTMLElement | null;
  if (!scrollEl) return null;
  const sRect = scrollEl.getBoundingClientRect();
  const { clientX, clientY } = p;
  if (clientX < sRect.left || clientX > sRect.right || clientY < sRect.top || clientY > sRect.bottom) {
    return null;
  }

  const rows = Array.from(scrollEl.querySelectorAll('[data-track-id]')) as HTMLElement[];
  if (rows.length === 0 || rows.length !== p.tracks.length) return null;
  const rects = rows.map((r) => r.getBoundingClientRect());
  const lastRect = rects[rects.length - 1];

  const laneEl = rows[0].querySelector('[data-track-lane]') as HTMLElement | null;
  if (!laneEl) return null;
  const laneRect = laneEl.getBoundingClientRect();
  const rawTime = Math.max(0, Number(((clientX - laneRect.left) / p.zoom).toFixed(2)));

  const trackType = toTrackType(p.mediaType);
  const bounds = getTrackZoneBounds(p.tracks, trackType);
  const edgePx = p.edgeOnly ? CLIP_EDGE_PX : ASSET_EDGE_PX;

  // 1) ¿En qué fila o hueco está el cursor?
  const rowIdx = rects.findIndex((r) => clientY >= r.top && clientY <= r.bottom);
  let insertIndex: number | null = null;
  let isOutside = false;

  if (rowIdx === -1) {
    if (clientY < rects[0].top) {
      // Bajo la regla (sticky) no hay zona de inserción
      if (clientY <= sRect.top + RULER_HEIGHT) return null;
      insertIndex = 0;
      isOutside = true;
    } else if (clientY > lastRect.bottom) {
      insertIndex = rects.length;
      isOutside = true;
    } else {
      insertIndex = rects.findIndex((r) => clientY < r.top);
    }
  } else {
    const r = rects[rowIdx];
    const edge = Math.min(edgePx, r.height * 0.28);
    if (clientY - r.top < edge) insertIndex = rowIdx;
    else if (r.bottom - clientY < edge) insertIndex = rowIdx + 1;
  }

  const makeNewTrackTarget = (index: number): DropTarget => {
    const y = boundaryY(rects, index);
    return {
      kind: 'new-track',
      startTime: rawTime,
      commit: { insertAtIndex: index },
      indicator: {
        kind: 'new-track',
        rect: {
          left: laneRect.left,
          top: y - 1.5,
          width: Math.max(0, sRect.right - laneRect.left - 16),
          height: 3,
        },
      },
    };
  };

  // 2) Borde entre pistas → pista nueva (solo dentro de la zona de su tipo)
  if (insertIndex !== null) {
    let idx = insertIndex;
    let valid = idx >= bounds.lo && idx <= bounds.hi;
    if (!valid && isOutside) {
      idx = Math.max(bounds.lo, Math.min(bounds.hi, idx));
      valid = true;
    }
    if (valid) {
      // Evita inserciones sin efecto junto a la pista de origen si solo tiene este clip
      if (p.sourceTrackId) {
        const srcIdx = p.tracks.findIndex((t) => t.id === p.sourceTrackId);
        const srcOnlyThis =
          p.clips.filter((c) => c.trackId === p.sourceTrackId && c.id !== p.ignoreClipId).length === 0;
        if (srcOnlyThis && (idx === srcIdx || idx === srcIdx + 1)) {
          return null;
        }
      }
      return makeNewTrackTarget(idx);
    }
  }

  if (p.edgeOnly) return null;

  // 3) Sobre una pista: se replica la lógica del store para mostrar el destino real
  let hoveredIdx = rowIdx;
  if (hoveredIdx === -1) {
    let best = 0;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
      const d = Math.min(Math.abs(clientY - r.top), Math.abs(clientY - r.bottom));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    hoveredIdx = best;
  }
  const hoveredTrack = p.tracks[hoveredIdx];
  const clipsForCollision = p.ignoreClipId ? p.clips.filter((c) => c.id !== p.ignoreClipId) : p.clips;
  const res = findOrCreateAvailableTrack(
    p.tracks,
    clipsForCollision,
    trackType,
    rawTime,
    p.duration,
    hoveredTrack.id
  );

  const resolvedIdx = p.tracks.findIndex((t) => t.id === res.track.id);
  if (resolvedIdx === -1) {
    // Todas las pistas del tipo están ocupadas: el store creará una pista nueva
    const newIdx = res.updatedTracks.findIndex((t) => t.id === res.track.id);
    const target = makeNewTrackTarget(Math.max(0, Math.min(rects.length, newIdx)));
    target.commit = { trackId: hoveredTrack.id };
    return target;
  }

  // Magnetismo de la pista principal: el clip queda pegado tras los anteriores
  let displayStart = rawTime;
  const mainTrack = getMainVideoTrack(p.tracks);
  if (p.isMagnetic && mainTrack && mainTrack.id === res.track.id) {
    displayStart = clipsForCollision
      .filter((c) => c.trackId === mainTrack.id && c.startTime <= rawTime)
      .reduce((sum, c) => sum + c.duration, 0);
  }

  const rr = rects[resolvedIdx];
  return {
    kind: 'track',
    startTime: rawTime,
    commit: { trackId: res.track.id },
    indicator: {
      kind: 'track',
      rect: {
        left: laneRect.left + displayStart * p.zoom,
        top: rr.top + 2,
        width: Math.max(20, p.duration * p.zoom),
        height: rr.height - 4,
      },
    },
  };
}

/**
 * Inicia el arrastre de un medio de la biblioteca con eventos de mouse
 * (en lugar de HTML5 drag-and-drop, que en WebKitGTK/Tauri no es fiable).
 */
export function beginAssetDrag(e: React.MouseEvent, assetId: string, customAssetIds?: string[]) {
  if (e.button !== 0) return;
  const store = useProjectStore;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;

  const st = store.getState();
  const selectedAssetIds = st.selectedAssetIds || [];
  const dragAssetIds =
    customAssetIds && customAssetIds.length > 0
      ? customAssetIds
      : selectedAssetIds.includes(assetId) && selectedAssetIds.length > 1
      ? selectedAssetIds
      : [assetId];

  const resolveTarget = (clientX: number, clientY: number): DropTarget | null => {
    const currState = store.getState();
    const proj = currState.currentProject;
    if (!proj) return null;
    const targetAssets = dragAssetIds
      .map((id) => proj.assets.find((a) => a.id === id))
      .filter((a): a is MediaAsset => Boolean(a));
    if (targetAssets.length === 0) return null;

    const totalDuration = targetAssets.reduce((sum, a) => sum + (a.duration || 4), 0);
    const hasVideo = targetAssets.some((a) => a.type === 'video');
    const hasImage = targetAssets.some((a) => a.type === 'image');
    const mediaType: DraggableMediaType = hasVideo ? 'video' : hasImage ? 'image' : targetAssets[0].type;

    return computeDropTarget({
      clientX,
      clientY,
      tracks: proj.tracks,
      clips: proj.clips,
      mediaType,
      duration: totalDuration,
      zoom: currState.timelineZoom,
      isMagnetic: currState.isMainTrackMagnetic,
    });
  };

  const cleanup = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    store.getState().setAssetDrag(null);
    store.getState().setDropIndicator(null);
  };

  const onMove = (ev: MouseEvent) => {
    if (!dragging) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }
    store.getState().setAssetDrag({
      assetId,
      assetIds: dragAssetIds,
      clientX: ev.clientX,
      clientY: ev.clientY,
    });
    const target = resolveTarget(ev.clientX, ev.clientY);
    store.getState().setDropIndicator(target ? target.indicator : null);
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      dragging = false;
      cleanup();
    }
  };

  const onUp = (ev: MouseEvent) => {
    const wasDragging = dragging;
    cleanup();
    if (!wasDragging) return;

    const currState = store.getState();
    const proj = currState.currentProject;
    if (!proj) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);

    if (dragAssetIds.length > 1) {
      // Soltado de múltiples medios seleccionados
      if (el?.closest('[data-preview-stage]')) {
        void currState.addAssetsToTimeline(dragAssetIds);
        return;
      }

      if (proj.clips.length === 0 && el?.closest('[data-timeline-scroll]')) {
        void currState.addAssetsToTimeline(dragAssetIds, { startTime: 0 });
        return;
      }

      const target = resolveTarget(ev.clientX, ev.clientY);
      if (!target) return;
      void currState.addAssetsToTimeline(dragAssetIds, {
        startTime: target.startTime,
        ...target.commit,
      });
      return;
    }

    // Soltado de un único medio
    // Soltado sobre la vista previa: se agrega en la posición del cabezal
    if (el?.closest('[data-preview-stage]')) {
      void currState.addAssetToTimeline(assetId);
      return;
    }

    // Proyecto vacío: cualquier soltado sobre la línea de tiempo lo agrega al inicio
    if (proj.clips.length === 0) {
      if (el?.closest('[data-timeline-scroll]')) {
        void currState.addAssetToTimeline(assetId, { startTime: 0 });
      }
      return;
    }

    const target = resolveTarget(ev.clientX, ev.clientY);
    if (!target) return;
    void currState.addAssetToTimeline(assetId, { startTime: target.startTime, ...target.commit });
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
}
