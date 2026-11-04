import React, { useEffect, useRef, useState } from 'react';
import {
  Scissors,
  Copy,
  ClipboardPaste,
  Trash2,
  Link2,
  Unlink2,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Play,
  Pause,
  Sparkles,
  Film,
  RotateCw,
  FlipHorizontal,
  Maximize2,
  PanelBottomClose,
  PanelBottomOpen,
  Magnet,
  Music,
  Image as ImageIcon,
  Type as TypeIcon,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { apiUrl } from '../config/api';
import { computeDropTarget } from '../lib/timelineDrop';
import type { DropTarget } from '../lib/timelineDrop';
import type { TimelineClip, Track } from '../types/project';
import { AudioWaveformCanvas } from './AudioWaveformCanvas';
import { ClipKeyframeMarkers } from './timeline/ClipKeyframeMarkers';
import { VolumeRubberBand } from './timeline/VolumeRubberBand';

const TRACK_HEADER_WIDTH = 84;

export function formatTimecode(sec: number, fps = 30): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * fps);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

function formatRulerTime(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface OverlapZone {
  id: string;
  trackId: string;
  clipA: TimelineClip;
  clipB: TimelineClip;
  startTime: number;
  endTime: number;
  duration: number;
}

export function computeTrackOverlaps(trackClips: TimelineClip[]): OverlapZone[] {
  const sorted = [...trackClips].sort((a, b) => a.startTime - b.startTime);
  const overlaps: OverlapZone[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const clipA = sorted[i];
    const clipB = sorted[i + 1];
    const endA = clipA.startTime + clipA.duration;
    if (clipB.startTime < endA - 0.02) {
      const startOverlap = clipB.startTime;
      const endOverlap = Math.min(endA, clipB.startTime + clipB.duration);
      const duration = Number((endOverlap - startOverlap).toFixed(2));
      if (duration > 0.02) {
        overlaps.push({
          id: `ov_${clipA.id}_${clipB.id}`,
          trackId: clipA.trackId,
          clipA,
          clipB,
          startTime: startOverlap,
          endTime: endOverlap,
          duration,
        });
      }
    }
  }
  return overlaps;
}

interface ContextMenuState {
  clipId: string;
  x: number;
  y: number;
}

export const TimelinePanel: React.FC<{ heightPx?: number }> = ({ heightPx = 270 }) => {
  const {
    currentProject,
    playheadTime,
    isPlaying,
    timelineZoom,
    selectedClipId,
    selectedClipIds,
    clipboardClips,
    isTimelineCollapsed,
    isMainTrackMagnetic,
    selectClip,
    setSelectedClipIds,
    selectAllClips,
    clearClipSelection,
    setPlayheadTime,
    togglePlay,
    setTimelineZoom,
    setIsFullscreenPreview,
    toggleTimelineCollapsed,
    toggleMainTrackMagnetic,
    setIsFileBrowserOpen,
    pushUndoSnapshot,
    persistCurrentProject,
    setInPointAtPlayhead,
    setOutPointAtPlayhead,
    clearInOutPoints,
    updateInOutLive,
    toggleTrackFlag,
    addAssetToTimeline,
    importDroppedFiles,
    moveClipLive,
    moveSelectedClipsLive,
    moveClipToNewTrack,
    trimClipLive,
    splitClipAtPlayhead,
    duplicateClip,
    rotateClip90,
    flipClipHorizontal,
    copySelectedClip,
    cutSelectedClip,
    pasteClipboardAtPlayhead,
    toggleClipLinkGroup,
    removeClip,
    removeSelectedClips,
  } = useProjectStore();

  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const collapsedBarRef = useRef<HTMLDivElement | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // Close context menu on any outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleGlobalClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  // Upgrade legacy/missing waveforms in the background
  useEffect(() => {
    if (!currentProject) return;
    const assetsToUpgrade = currentProject.assets.filter(
      (a) =>
        (a.type === 'audio' || a.hasAudio) &&
        (!a.waveform || a.waveform.length <= 100) &&
        a.path
    );
    if (assetsToUpgrade.length === 0) return;

    let isMounted = true;
    assetsToUpgrade.forEach(async (asset) => {
      try {
        const res = await fetch(
          apiUrl(`/api/media/waveform?path=${encodeURIComponent(asset.path)}&duration=${asset.duration || 0}`)
        );
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.waveform && Array.isArray(data.waveform)) {
          useProjectStore.getState().updateAssetWaveform(asset.id, data.waveform);
        }
      } catch {
        // Ignore background upgrade errors
      }
    });

    return () => {
      isMounted = false;
    };
  }, [currentProject?.assets]);

  // Improvement 4: Ctrl + Mouse Wheel Zoom centered at cursor position
  useEffect(() => {
    const container = timelineScrollRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const state = useProjectStore.getState();
      if (!state.currentProject || state.currentProject.clips.length === 0) return;

      const oldZoom = state.timelineZoom;
      const rect = container.getBoundingClientRect();
      const mouseXInTracks = Math.max(0, e.clientX - rect.left - TRACK_HEADER_WIDTH);
      const timeAtCursor = (container.scrollLeft + mouseXInTracks) / oldZoom;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const nextZoom = Math.max(20, Math.min(220, Math.round(oldZoom * zoomFactor)));
      if (nextZoom === oldZoom) return;

      state.setTimelineZoom(nextZoom);

      requestAnimationFrame(() => {
        if (timelineScrollRef.current) {
          const newScrollLeft = Math.max(0, timeAtCursor * nextZoom - mouseXInTracks);
          timelineScrollRef.current.scrollLeft = newScrollLeft;
        }
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [isTimelineCollapsed]);

  if (!currentProject) return null;

  const isEmptyProject = currentProject.clips.length === 0;
  const selectedClip = currentProject.clips.find((c) => c.id === selectedClipId) || null;
  const projectDuration = currentProject.clips.reduce(
    (max, c) => Math.max(max, c.startTime + c.duration),
    0
  );
  const maxClipEnd = Math.max(12, projectDuration);
  const totalTimelineSeconds = Math.max(24, Math.ceil(maxClipEnd + 10));
  const timelineWidthPx = totalTimelineSeconds * timelineZoom;

  const convertClientXToSeconds = (clientX: number): number => {
    const scrollContainer = timelineScrollRef.current;
    if (!scrollContainer) return 0;
    const rect = scrollContainer.getBoundingClientRect();
    const headerOffset = isEmptyProject ? 24 : TRACK_HEADER_WIDTH;
    const offsetX = clientX - rect.left + scrollContainer.scrollLeft - headerOffset;
    return Math.max(0, Number((offsetX / timelineZoom).toFixed(2)));
  };

  // Scrubbing on ruler click & drag
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setPlayheadTime(convertClientXToSeconds(e.clientX));

    const onMouseMove = (moveEvt: MouseEvent) => {
      setPlayheadTime(convertClientXToSeconds(moveEvt.clientX));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Scrubbing on Collapsed Bottom Progress Bar (`Ctrl + .` mode)
  const handleCollapsedBarMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEmptyProject) return;
    const bar = collapsedBarRef.current;
    if (!bar) return;

    const updateFromClientX = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      setPlayheadTime(ratio * Math.max(0.5, projectDuration));
    };

    updateFromClientX(e.clientX);
    const onMove = (ev: MouseEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Dragging In or Out Marker on Ruler
  const handleInOutMarkerDrag = (e: React.MouseEvent, which: 'in' | 'out') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    pushUndoSnapshot();

    const onMouseMove = (moveEvt: MouseEvent) => {
      const sec = convertClientXToSeconds(moveEvt.clientX);
      if (which === 'in') {
        const maxIn =
          typeof currentProject.outPoint === 'number'
            ? Math.max(0, currentProject.outPoint - 0.2)
            : totalTimelineSeconds;
        updateInOutLive({ inPoint: Math.min(maxIn, Math.max(0, sec)) });
      } else {
        const minOut =
          typeof currentProject.inPoint === 'number'
            ? currentProject.inPoint + 0.2
            : 0.2;
        updateInOutLive({ outPoint: Math.max(minOut, sec) });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      persistCurrentProject();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Marquee Rubber-Band Box Selection on Timeline Canvas
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only primary mouse button (left-click)
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('[data-clip-id]') ||
      target.closest('[data-trim-handle]') ||
      target.closest('[data-track-header]') ||
      target.closest('[data-timeline-ruler]') ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return;
    }

    setContextMenu(null);

    const container = timelineScrollRef.current;
    if (!container) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const cRectInitial = container.getBoundingClientRect();
    const anchorContentX = startClientX - cRectInitial.left + container.scrollLeft;
    const anchorContentY = startClientY - cRectInitial.top + container.scrollTop;

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const initialSelectedIds = isModifier ? [...useProjectStore.getState().selectedClipIds] : [];
    let lastSelection = [...initialSelectedIds];

    let isMarquee = false;
    let autoScrollRaf: number | null = null;
    let marqueeRaf: number | null = null;
    let lastClientX = startClientX;
    let lastClientY = startClientY;

    const stopAutoScroll = () => {
      if (autoScrollRaf !== null) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
    };

    const scheduleFrame = () => {
      if (marqueeRaf !== null) return;
      marqueeRaf = requestAnimationFrame(() => {
        marqueeRaf = null;
        updateSelection(lastClientX, lastClientY);
      });
    };

    const performAutoScroll = () => {
      if (!container || !isMarquee) return;
      const cRect = container.getBoundingClientRect();
      const margin = 35;
      const scrollSpeed = 12;

      let dx = 0;
      let dy = 0;

      if (lastClientX > cRect.right - margin) {
        dx = scrollSpeed;
      } else if (lastClientX < cRect.left + margin) {
        dx = -scrollSpeed;
      }

      if (lastClientY > cRect.bottom - margin) {
        dy = scrollSpeed;
      } else if (lastClientY < cRect.top + margin) {
        dy = -scrollSpeed;
      }

      if (dx !== 0 || dy !== 0) {
        container.scrollBy(dx, dy);
        scheduleFrame();
      }

      autoScrollRaf = requestAnimationFrame(performAutoScroll);
    };

    const updateSelection = (currentClientX: number, currentClientY: number) => {
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      // Current cursor position in container scroll space
      const currentX = currentClientX - cRect.left + scrollLeft;
      const currentY = currentClientY - cRect.top + scrollTop;

      // Origin anchor remains fixed at the exact content position where the click began
      const minX = Math.min(anchorContentX, currentX);
      const maxX = Math.max(anchorContentX, currentX);
      const minY = Math.min(anchorContentY, currentY);
      const maxY = Math.max(anchorContentY, currentY);

      setMarqueeBox({
        left: minX,
        top: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      });

      const clipElements = container.querySelectorAll<HTMLElement>('[data-clip-id]');
      const intersectedIds = new Set<string>();

      clipElements.forEach((el) => {
        const clipRect = el.getBoundingClientRect();
        const clipX1 = clipRect.left - cRect.left + scrollLeft;
        const clipX2 = clipX1 + clipRect.width;
        const clipY1 = clipRect.top - cRect.top + scrollTop;
        const clipY2 = clipY1 + clipRect.height;

        if (minX <= clipX2 && maxX >= clipX1 && minY <= clipY2 && maxY >= clipY1) {
          const id = el.getAttribute('data-clip-id');
          if (id) intersectedIds.add(id);
        }
      });

      const finalSelection = isModifier
        ? Array.from(new Set([...initialSelectedIds, ...intersectedIds]))
        : Array.from(intersectedIds);

      if (
        finalSelection.length !== lastSelection.length ||
        finalSelection.some((id, idx) => id !== lastSelection[idx])
      ) {
        lastSelection = finalSelection;
        useProjectStore.getState().setSelectedClipIds(finalSelection);
      }
    };

    const onMouseMove = (moveEvt: MouseEvent) => {
      lastClientX = moveEvt.clientX;
      lastClientY = moveEvt.clientY;

      if (!isMarquee) {
        const dist = Math.hypot(moveEvt.clientX - startClientX, moveEvt.clientY - startClientY);
        if (dist >= 4) {
          isMarquee = true;
          performAutoScroll();
        }
      }

      if (isMarquee) {
        scheduleFrame();
      }
    };

    const onMouseUp = (upEvt: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      stopAutoScroll();
      if (marqueeRaf !== null) {
        cancelAnimationFrame(marqueeRaf);
        marqueeRaf = null;
      }
      setMarqueeBox(null);

      if (!isMarquee) {
        if (!isModifier) {
          useProjectStore.getState().clearClipSelection();
          setPlayheadTime(convertClientXToSeconds(upEvt.clientX));
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Dragging a Clip body (supports multi-clip drag)
  const handleClipDragStart = (e: React.MouseEvent, clip: TimelineClip) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setContextMenu(null);

    const isModifier = e.shiftKey || e.ctrlKey || e.metaKey;
    const isAlreadySelected = selectedClipIds.includes(clip.id);

    if (isModifier) {
      selectClip(clip.id, 'toggle');
      return;
    }

    if (!isAlreadySelected) {
      selectClip(clip.id, 'replace');
    } else {
      setSelectedClipIds(selectedClipIds, clip.id);
    }

    const track = currentProject.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;

    pushUndoSnapshot();
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const initialStartTime = clip.startTime;
    let moved = false;
    let lastNextStart = clip.startTime;
    let pendingNewTrack: DropTarget | null = null;

    // Capture state for multi-clip moving
    const stClips = useProjectStore.getState().currentProject?.clips || [];
    const activeSelectedIds = useProjectStore.getState().selectedClipIds;
    const effectiveSelection = activeSelectedIds.includes(clip.id)
      ? activeSelectedIds
      : [clip.id];

    // Find minStartTime across all selected clips and their linked peers
    const linkedGroupIds = new Set<string>();
    stClips.forEach((c) => {
      if (effectiveSelection.includes(c.id) && c.linkGroupId) {
        linkedGroupIds.add(c.linkGroupId);
      }
    });
    const clipsToMove = stClips.filter(
      (c) => effectiveSelection.includes(c.id) || (c.linkGroupId && linkedGroupIds.has(c.linkGroupId))
    );
    const initialStarts: Record<string, number> = {};
    clipsToMove.forEach((c) => {
      initialStarts[c.id] = c.startTime;
    });
    const minStart = clipsToMove.length > 0 ? Math.min(...clipsToMove.map((c) => c.startTime)) : 0;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dist = Math.hypot(moveEvt.clientX - startMouseX, moveEvt.clientY - startMouseY);
      if (dist > 3) {
        moved = true;
      }
      if (!moved) return;

      const deltaPx = moveEvt.clientX - startMouseX;
      const deltaSec = deltaPx / timelineZoom;
      const clampedDelta = Math.max(-minStart, deltaSec);
      const nextStart = Math.max(0, initialStartTime + clampedDelta);
      lastNextStart = nextStart;

      // Only allow new track insertion if dragging a single clip
      pendingNewTrack = null;
      if (effectiveSelection.length === 1 && Math.abs(moveEvt.clientY - startMouseY) > 8) {
        const st = useProjectStore.getState();
        const proj = st.currentProject;
        if (proj) {
          pendingNewTrack = computeDropTarget({
            clientX: moveEvt.clientX,
            clientY: moveEvt.clientY,
            tracks: proj.tracks,
            clips: proj.clips,
            mediaType: clip.type,
            duration: clip.duration,
            zoom: timelineZoom,
            isMagnetic: st.isMainTrackMagnetic,
            ignoreClipId: clip.id,
            edgeOnly: true,
            sourceTrackId: clip.trackId,
          });
        }
      }
      useProjectStore.getState().setDropIndicator(pendingNewTrack ? pendingNewTrack.indicator : null);

      let hoveredTrackId: string | undefined;
      if (!pendingNewTrack) {
        const elUnderMouse = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
        const trackRowEl = elUnderMouse?.closest('[data-track-id]') as HTMLElement | null;
        hoveredTrackId = trackRowEl?.getAttribute('data-track-id') || undefined;
      }

      moveSelectedClipsLive(initialStarts, clampedDelta, clip.id, hoveredTrackId);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const target = pendingNewTrack as DropTarget | null;
      useProjectStore.getState().setDropIndicator(null);
      if (moved) {
        if (target && typeof target.commit.insertAtIndex === 'number') {
          moveClipToNewTrack(clip.id, lastNextStart, target.commit.insertAtIndex);
        }
        persistCurrentProject();
      } else {
        if (isAlreadySelected && effectiveSelection.length > 1) {
          selectClip(clip.id, 'replace');
        }
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Trimming Left or Right Edge of a Clip
  const handleClipTrimStart = (
    e: React.MouseEvent,
    clip: TimelineClip,
    edge: 'left' | 'right'
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setContextMenu(null);
    selectClip(clip.id);

    const track = currentProject.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;

    pushUndoSnapshot();
    let prevMouseX = e.clientX;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const deltaPx = moveEvt.clientX - prevMouseX;
      prevMouseX = moveEvt.clientX;
      const deltaSec = deltaPx / timelineZoom;
      trimClipLive(clip.id, edge, deltaSec);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      persistCurrentProject();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Handling Drop of Media Asset or OS File onto Track or Empty Timeline Dropzone
  const handleDropAssetOnTrack = async (
    e: React.DragEvent,
    track?: Track,
    createNewTrack = false
  ) => {
    e.preventDefault();
    setDragOverTrackId(null);

    const assetId = e.dataTransfer.getData('application/x-video-editor-asset');
    if (assetId) {
      const dropTime = isEmptyProject ? 0 : convertClientXToSeconds(e.clientX);
      await addAssetToTimeline(assetId, {
        trackId: track?.id,
        startTime: dropTime,
        createNewTrack,
      });
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const imported = await importDroppedFiles(e.dataTransfer.files);
      if (imported.length > 0) {
        await addAssetToTimeline(imported[0].id, {
          trackId: track?.id,
          startTime: isEmptyProject ? 0 : convertClientXToSeconds(e.clientX),
          createNewTrack,
        });
      }
    }
  };

  // Open Right-Click Context Menu on Clip (Stage 4)
  const handleClipContextMenu = (e: React.MouseEvent, clip: TimelineClip) => {
    e.preventDefault();
    e.stopPropagation();

    const activeSelectedIds = useProjectStore.getState().selectedClipIds;
    if (!activeSelectedIds.includes(clip.id)) {
      selectClip(clip.id, 'replace');
    }

    const menuW = 260;
    const menuH = 290;
    const clampedX = Math.max(12, Math.min(window.innerWidth - menuW - 12, e.clientX));
    const clampedY = Math.max(12, Math.min(window.innerHeight - menuH - 12, e.clientY));

    setContextMenu({
      clipId: clip.id,
      x: clampedX,
      y: clampedY,
    });
  };

  // Ruler Marks
  const rulerStepSec = timelineZoom >= 95 ? 2 : timelineZoom >= 50 ? 3 : 10;
  const rulerTicks: number[] = [];
  for (let s = 0; s <= totalTimelineSeconds; s += rulerStepSec) {
    rulerTicks.push(s);
  }

  const hasIn = typeof currentProject.inPoint === 'number';
  const hasOut = typeof currentProject.outPoint === 'number';
  const effectiveIn = hasIn ? (currentProject.inPoint as number) : 0;
  const effectiveOut = hasOut ? (currentProject.outPoint as number) : maxClipEnd;

  const contextClip = contextMenu
    ? currentProject.clips.find((c) => c.id === contextMenu.clipId) || null
    : null;

  const progressRatio =
    projectDuration > 0 ? Math.max(0, Math.min(100, (playheadTime / projectDuration) * 100)) : 0;

  return (
    <section
      style={{ height: isTimelineCollapsed ? 'auto' : `${heightPx}px` }}
      className="bg-[#141517] flex flex-col shrink-0 select-none relative"
    >
      {/* Barra de herramientas de acciones de la línea de tiempo */}
      <div className="h-11 border-y border-[#26272b] bg-[#18191c] px-4 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Contextual Clip Editing Tools */}
        <div className="flex items-center gap-1 min-w-[260px]">
          <button
            type="button"
            disabled={isEmptyProject}
            onClick={() => splitClipAtPlayhead()}
            title="Dividir (Ctrl+B / S)"
            className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 disabled:opacity-30 transition"
          >
            <Scissors className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={!selectedClip && selectedClipIds.length === 0}
            onClick={() => removeClip()}
            title={
              selectedClipIds.length > 1
                ? `Eliminar (${selectedClipIds.length} clips seleccionados - Tecla Supr / Retroceso)`
                : 'Eliminar clip (Tecla Supr / Retroceso)'
            }
            className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 hover:text-rose-400 disabled:opacity-30 transition relative"
          >
            <Trash2 className="w-4 h-4" />
            {selectedClipIds.length > 1 && (
              <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center leading-none shadow">
                {selectedClipIds.length}
              </span>
            )}
          </button>

          {/* Contextual tools that appear when a clip is selected */}
          {selectedClip && (
            <>
              <div className="h-4 w-[1px] bg-[#2c2d32] mx-1" />

              {selectedClip.type !== 'audio' && (
                <>
                  <button
                    type="button"
                    onClick={() => rotateClip90(selectedClip.id)}
                    title="Rotar 90°"
                    className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 transition"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => flipClipHorizontal(selectedClip.id)}
                    title="Voltear horizontalmente (Espejo)"
                    className={`p-1.5 rounded-lg hover:bg-white/10 transition ${
                      selectedClip.transform.flipX ? 'text-[#00d4e5]' : 'text-gray-200'
                    }`}
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => duplicateClip()}
                title={
                  selectedClipIds.length > 1
                    ? `Duplicar (${selectedClipIds.length} clips seleccionados - Ctrl+D)`
                    : 'Duplicar clip (Ctrl+D)'
                }
                className="p-1.5 rounded-lg text-gray-200 hover:bg-white/10 transition relative"
              >
                <Copy className="w-4 h-4" />
                {selectedClipIds.length > 1 && (
                  <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] rounded-full bg-[#00d4e5] text-[9px] font-bold text-[#141517] flex items-center justify-center leading-none shadow">
                    {selectedClipIds.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleClipLinkGroup(selectedClip.id)}
                title="Audio independiente / Vincular audio (Ctrl+L)"
                className={`p-1.5 rounded-lg hover:bg-white/10 transition ${
                  selectedClip.linkGroupId ? 'text-[#00d4e5]' : 'text-gray-300'
                }`}
              >
                {selectedClip.linkGroupId ? (
                  <Unlink2 className="w-4 h-4" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
              </button>
            </>
          )}

          {/* Compact In/Out Range Pill when project has clips */}
          {!isEmptyProject && (
            <div className="flex items-center gap-0.5 ml-2 bg-[#202124] px-1.5 py-0.5 rounded-lg border border-[#2c2d32]">
              <button
                type="button"
                onClick={() => setInPointAtPlayhead()}
                title="Marcar Entrada (I)"
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                  hasIn ? 'bg-[#00d4e5]/20 text-[#00d4e5] font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                [I{hasIn ? ` ${effectiveIn.toFixed(1)}s` : ''}
              </button>
              <button
                type="button"
                onClick={() => setOutPointAtPlayhead()}
                title="Marcar Salida (O)"
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                  hasOut ? 'bg-[#00d4e5]/20 text-[#00d4e5] font-semibold' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {hasOut ? `${effectiveOut.toFixed(1)}s ` : ''}O]
              </button>
              {(hasIn || hasOut) && (
                <button
                  type="button"
                  onClick={clearInOutPoints}
                  title="Limpiar rango I/O (Alt+X)"
                  className="px-1 text-[10px] text-rose-400 hover:text-rose-300"
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>

        {/* Centro: Botón circular de reproducción y código de tiempo (`00:00:00 | 00:25:00`) */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isEmptyProject}
            onClick={togglePlay}
            title="Reproducir / Pausar (Espacio)"
            className="w-7 h-7 rounded-full bg-white hover:bg-gray-200 text-[#141517] flex items-center justify-center disabled:opacity-30 transition shadow"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          <div
            className={`text-xs font-mono tracking-tight flex items-center gap-1.5 ${
              isEmptyProject ? 'opacity-40' : ''
            }`}
          >
            <span className="text-gray-100 font-semibold">
              {formatTimecode(playheadTime, currentProject.fps)}
            </span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-500">
              {formatTimecode(projectDuration, currentProject.fps)}
            </span>
          </div>
        </div>

        {/* Right: Magnetic Main Track Toggle, Zoom Slider, Fullscreen `[ ]`, Collapse Timeline `Ctrl+.` */}
        <div className="flex items-center justify-end gap-2 min-w-[260px]">
          <button
            type="button"
            onClick={toggleMainTrackMagnetic}
            title={
              isMainTrackMagnetic
                ? 'Pista principal magnética activa (Sin huecos en pista principal)'
                : 'Pista principal magnética desactivada (Posición libre en pista principal)'
            }
            className={`p-1.5 rounded-lg transition ${
              isMainTrackMagnetic
                ? 'bg-[#00d4e5]/15 text-[#00d4e5] border border-[#00d4e5]/40'
                : 'text-gray-400 hover:text-white hover:bg-white/10 border border-transparent'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            disabled={isEmptyProject || isTimelineCollapsed}
            onClick={() => setTimelineZoom(timelineZoom - 15)}
            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 transition"
            title="Alejar línea de tiempo (Ctrl + Rueda abajo)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <input
            type="range"
            disabled={isEmptyProject || isTimelineCollapsed}
            min={20}
            max={220}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(Number(e.target.value))}
            className="w-24 h-1 accent-[#00d4e5] bg-[#2c2d32] rounded-lg cursor-pointer disabled:opacity-30"
          />

          <button
            type="button"
            disabled={isEmptyProject || isTimelineCollapsed}
            onClick={() => setTimelineZoom(timelineZoom + 15)}
            className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white disabled:opacity-30 transition"
            title="Acercar línea de tiempo (Ctrl + Rueda arriba)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-3.5 w-[1px] bg-[#2c2d32] mx-0.5" />

          {/* Stage 5: Fullscreen Preview Button `[ ]` */}
          <button
            type="button"
            disabled={isEmptyProject}
            onClick={() => setIsFullscreenPreview(true)}
            title="Pantalla completa"
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 transition"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Stage 3: Collapse / Expand Timeline Button (`Ctrl + .`) */}
          <button
            type="button"
            onClick={toggleTimelineCollapsed}
            title={
              isTimelineCollapsed
                ? 'Mostrar línea de tiempo (Ctrl+.)'
                : 'Ocultar línea de tiempo (Ctrl+.)'
            }
            className={`p-1.5 rounded-lg transition ${
              isTimelineCollapsed
                ? 'bg-[#00d4e5]/15 text-[#00d4e5]'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            {isTimelineCollapsed ? (
              <PanelBottomOpen className="w-4 h-4" />
            ) : (
              <PanelBottomClose className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Stage 3: Collapsed Timeline Mode (`Ctrl + .`) */}
      {isTimelineCollapsed ? (
        <div
          ref={collapsedBarRef}
          onMouseDown={handleCollapsedBarMouseDown}
          className="h-6 bg-[#141517] px-4 flex items-center cursor-ew-resize relative"
        >
          <div className="w-full h-1 bg-[#2c2d32] rounded-full relative">
            <div
              style={{ width: `${progressRatio}%` }}
              className="absolute left-0 top-0 bottom-0 bg-[#00d4e5] rounded-full"
            />
            <div
              style={{ left: `${progressRatio}%` }}
              className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-2.5 h-4 rounded-[3px] bg-[#141517] border-2 border-white shadow"
            />
          </div>
        </div>
      ) : (
        /* Expanded Multi-Track Timeline Area */
        <div
          ref={timelineScrollRef}
          data-timeline-scroll
          onMouseDown={handleTimelineMouseDown}
          className="flex-1 overflow-auto relative bg-[#141517]"
        >
          <div
            className="relative min-h-full flex flex-col"
            style={{
              width: isEmptyProject ? '100%' : `${TRACK_HEADER_WIDTH + timelineWidthPx}px`,
            }}
          >
            {/* Rubber-band Marquee Selection Box */}
            {marqueeBox && (
              <div
                style={{
                  position: 'absolute',
                  left: `${marqueeBox.left}px`,
                  top: `${marqueeBox.top}px`,
                  width: `${marqueeBox.width}px`,
                  height: `${marqueeBox.height}px`,
                  pointerEvents: 'none',
                  zIndex: 45,
                }}
                className="bg-[#00d4e5]/15 border border-[#00d4e5] rounded pointer-events-none"
              />
            )}

            {/* Top Time Ruler */}
            <div
              data-timeline-ruler="true"
              style={{ transform: 'translateZ(0)' }}
              className="sticky top-0 z-[35] h-7 bg-[#141517] border-b border-[#222328] flex items-center shrink-0 isolate"
            >
              <div
                style={{ width: `${isEmptyProject ? 24 : TRACK_HEADER_WIDTH}px` }}
                className="sticky left-0 z-[40] h-full bg-[#141517] shrink-0"
              />

              <div
                onMouseDown={handleRulerMouseDown}
                className="relative flex-1 h-full cursor-ew-resize"
              >
                {/* Active In/Out Range Highlight Band */}
                {!isEmptyProject && (hasIn || hasOut) && (
                  <div
                    style={{
                      left: `${effectiveIn * timelineZoom}px`,
                      width: `${Math.max(4, (effectiveOut - effectiveIn) * timelineZoom)}px`,
                    }}
                    className="absolute top-0 bottom-0 bg-[#00d4e5]/15 border-y border-[#00d4e5]/70 pointer-events-none"
                  />
                )}

                {/* Draggable In Point Handle [I */}
                {!isEmptyProject && hasIn && (
                  <div
                    onMouseDown={(e) => handleInOutMarkerDrag(e, 'in')}
                    title={`Punto de Entrada (I): ${effectiveIn.toFixed(2)}s`}
                    style={{ left: `${effectiveIn * timelineZoom}px` }}
                    className="absolute top-0 bottom-0 w-3 -ml-1.5 z-30 cursor-ew-resize flex flex-col items-center"
                  >
                    <div className="px-1 rounded-b bg-[#00d4e5] text-[#141517] text-[9px] font-bold font-mono leading-tight">
                      I
                    </div>
                    <div className="flex-1 w-[1.5px] bg-[#00d4e5]" />
                  </div>
                )}

                {/* Draggable Out Point Handle O] */}
                {!isEmptyProject && hasOut && (
                  <div
                    onMouseDown={(e) => handleInOutMarkerDrag(e, 'out')}
                    title={`Punto de Salida (O): ${effectiveOut.toFixed(2)}s`}
                    style={{ left: `${effectiveOut * timelineZoom}px` }}
                    className="absolute top-0 bottom-0 w-3 -ml-1.5 z-30 cursor-ew-resize flex flex-col items-center"
                  >
                    <div className="px-1 rounded-b bg-[#00d4e5] text-[#141517] text-[9px] font-bold font-mono leading-tight">
                      O
                    </div>
                    <div className="flex-1 w-[1.5px] bg-[#00d4e5]" />
                  </div>
                )}

                {rulerTicks.map((sec) => (
                  <div
                    key={sec}
                    style={{ left: `${sec * timelineZoom}px` }}
                    className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                  >
                    <div className="h-2 w-[1px] bg-[#2e3036]" />
                    <span className="text-[10px] font-mono text-gray-500 pl-1.5">
                      {formatRulerTime(sec)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage 2: Empty Project Timeline State */}
            {isEmptyProject ? (
              <div className="flex-1 flex items-center justify-center px-8 py-6">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTrackId('__empty_drop__');
                  }}
                  onDragLeave={() => setDragOverTrackId(null)}
                  onDrop={(e) => handleDropAssetOnTrack(e, undefined, false)}
                  onClick={() => setIsFileBrowserOpen(true)}
                  className={`w-full max-w-5xl h-16 rounded-xl flex items-center justify-center gap-2.5 text-xs cursor-pointer transition ${
                    dragOverTrackId === '__empty_drop__'
                      ? 'bg-[#00d4e5]/15 border border-dashed border-[#00d4e5] text-[#00d4e5]'
                      : 'bg-[#202124] hover:bg-[#25262b] border border-[#2a2b30] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Film className="w-4 h-4 opacity-80" />
                  <span>Arrastra y suelta archivos multimedia aquí</span>
                </div>
              </div>
            ) : (
              /* Active Multi-Track Lanes */
              <div className="flex-1 py-3 space-y-1.5 relative">
                {currentProject.tracks.map((track) => {
                  const trackClips = currentProject.clips.filter((c) => c.trackId === track.id);
                  const overlaps = computeTrackOverlaps(trackClips);
                  const isDragTarget = dragOverTrackId === track.id;
                  const isTextTrack = track.type === 'text';

                  return (
                    <div
                      key={track.id}
                      data-track-id={track.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverTrackId(track.id);
                      }}
                      onDragLeave={() => setDragOverTrackId(null)}
                      onDrop={(e) => handleDropAssetOnTrack(e, track, false)}
                      className={`${
                        isTextTrack ? 'h-9' : 'h-12'
                      } flex items-center relative transition ${
                        isDragTarget ? 'bg-[#00d4e5]/10' : ''
                      }`}
                    >
                      {/* Minimalist Left Track Icon Header */}
                      <div
                        data-track-header="true"
                        style={{ width: `${TRACK_HEADER_WIDTH}px` }}
                        onClick={(e) => e.stopPropagation()}
                        className="sticky left-0 z-30 h-full bg-[#141517] px-2.5 flex items-center justify-between shrink-0"
                      >
                        <div className="flex items-center gap-1">
                          {track.type !== 'text' && (
                            <button
                              type="button"
                              onClick={() => toggleTrackFlag(track.id, 'muted')}
                              title={track.muted ? 'Activar sonido de pista' : 'Silenciar pista'}
                              className={`p-1 rounded transition ${
                                track.muted
                                  ? 'text-rose-400 bg-rose-500/15'
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                              }`}
                            >
                              {track.muted ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {track.type !== 'audio' && (
                            <button
                              type="button"
                              onClick={() => toggleTrackFlag(track.id, 'hidden')}
                              title={track.hidden ? 'Mostrar pista' : 'Ocultar pista'}
                              className={`p-1 rounded transition ${
                                track.hidden
                                  ? 'text-amber-400 bg-amber-500/15'
                                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                              }`}
                            >
                              {track.hidden ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => toggleTrackFlag(track.id, 'locked')}
                            title={track.locked ? 'Desbloquear pista' : 'Bloquear pista'}
                            className={`p-1 rounded transition ${
                              track.locked
                                ? 'text-[#00d4e5] bg-[#00d4e5]/15'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                          >
                            {track.locked ? (
                              <Lock className="w-3 h-3" />
                            ) : (
                              <Unlock className="w-3 h-3 opacity-60" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Track Lane Container */}
                      <div
                        data-track-lane="true"
                        className="relative flex-1 h-full rounded-lg bg-[#202124]/85 mr-4"
                      >
                        {/* Clips in this Track */}
                        {trackClips.map((clip) => {
                          const leftPx = clip.startTime * timelineZoom;
                          const widthPx = Math.max(20, clip.duration * timelineZoom);
                          const isMultiSelected = selectedClipIds.includes(clip.id);
                          const isPrimarySelected = selectedClipId === clip.id;
                          const isSelected = isMultiSelected || isPrimarySelected;
                          const isLinkedPeer =
                            !isSelected &&
                            selectedClip?.linkGroupId &&
                            clip.linkGroupId === selectedClip.linkGroupId;
                          const asset = currentProject.assets.find((a) => a.id === clip.assetId);

                          return (
                            <div
                              key={clip.id}
                              data-clip-id={clip.id}
                              title={`${clip.type === 'text' && clip.textConfig ? clip.textConfig.content : clip.name} · ${formatTimecode(clip.duration, currentProject.fps)}`}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => handleClipDragStart(e, clip)}
                              onContextMenu={(e) => handleClipContextMenu(e, clip)}
                              style={{
                                left: `${leftPx}px`,
                                width: `${widthPx}px`,
                                ...(clip.type === 'video' && asset?.thumbnail
                                  ? {
                                      backgroundImage: `url(${asset.thumbnail})`,
                                      backgroundRepeat: 'repeat-x',
                                      backgroundSize: 'auto 100%',
                                    }
                                  : {}),
                              }}
                              className={`group absolute top-0.5 bottom-0.5 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing select-none flex flex-col justify-between transition-shadow ${
                                isSelected
                                  ? 'ring-2 ring-[#00d4e5] border border-[#00d4e5] z-20 shadow-lg shadow-[#00d4e5]/20'
                                  : isLinkedPeer
                                  ? 'ring-1 ring-[#00d4e5]/70 border border-[#00d4e5]/70 z-10'
                                  : `border hover:brightness-125 ${
                                      clip.type === 'audio'
                                        ? 'border-emerald-400/30'
                                        : clip.type === 'image'
                                        ? 'border-violet-400/35'
                                        : clip.type === 'text'
                                        ? 'border-pink-300/30'
                                        : 'border-blue-400/35'
                                    }`
                              } ${
                                clip.type === 'text'
                                  ? 'bg-[#d6457a]'
                                  : clip.type === 'audio'
                                  ? 'bg-[#10382b]'
                                  : clip.type === 'image'
                                  ? 'bg-[#32265e]'
                                  : 'bg-[#1b3a73]'
                              }`}
                            >
                              {clip.type === 'video' && asset?.thumbnail && (
                                <div className="absolute inset-0 bg-[#0b1b3a]/35 pointer-events-none" />
                              )}

                              {/* Left Trim Handle (`|`) */}
                              <div
                                data-trim-handle="true"
                                onMouseDown={(e) => handleClipTrimStart(e, clip, 'left')}
                                title="Arrastrar para recortar inicio"
                                className={`absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-20 flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#00d4e5] text-[#141517]'
                                    : 'bg-black/30 opacity-0 group-hover:opacity-100 hover:bg-[#00d4e5]'
                                }`}
                              >
                                <div className="w-[2px] h-3.5 bg-current rounded-full" />
                              </div>

                              {/* Right Trim Handle (`|`) */}
                              <div
                                data-trim-handle="true"
                                onMouseDown={(e) => handleClipTrimStart(e, clip, 'right')}
                                title="Arrastrar para recortar final"
                                className={`absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize z-20 flex items-center justify-center transition ${
                                  isSelected
                                    ? 'bg-[#00d4e5] text-[#141517]'
                                    : 'bg-black/30 opacity-0 group-hover:opacity-100 hover:bg-[#00d4e5]'
                                }`}
                              >
                                <div className="w-[2px] h-3.5 bg-current rounded-full" />
                              </div>

                              {/* Ícono de tipo (siempre visible) + etiqueta (solo hover, selección o texto) */}
                              <div className="px-2.5 pt-1 flex items-center gap-1 z-10 pointer-events-none min-w-0">
                                <div className="shrink-0 w-4 h-4 rounded bg-black/55 flex items-center justify-center text-white/90">
                                  {clip.type === 'video' ? (
                                    <Film className="w-2.5 h-2.5" />
                                  ) : clip.type === 'audio' ? (
                                    <Music className="w-2.5 h-2.5" />
                                  ) : clip.type === 'image' ? (
                                    <ImageIcon className="w-2.5 h-2.5" />
                                  ) : (
                                    <TypeIcon className="w-2.5 h-2.5" />
                                  )}
                                </div>
                                <div
                                  className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-black/55 text-[10px] text-white font-medium min-w-0 transition-opacity duration-150 ${
                                    isSelected || clip.type === 'text'
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100'
                                  }`}
                                >
                                  {clip.linkGroupId && (
                                    <Link2 className="w-2.5 h-2.5 text-[#00d4e5] shrink-0" />
                                  )}
                                  <span className="truncate">
                                    {clip.type === 'text' && clip.textConfig
                                      ? clip.textConfig.content
                                      : clip.name}
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-300 shrink-0">
                                    {formatTimecode(clip.duration, currentProject.fps)}
                                  </span>
                                </div>
                              </div>

                              {/* High-Definition Audio Waveform inside Audio Clip */}
                              {clip.type === 'audio' && (
                                <div className="absolute left-0 right-0 bottom-1 top-4 pointer-events-none z-0 flex items-center overflow-hidden">
                                  <AudioWaveformCanvas
                                    waveform={asset?.waveform}
                                    assetDuration={asset?.duration || clip.duration}
                                    sourceStart={clip.sourceStart || 0}
                                    clipDuration={clip.duration}
                                    width={Math.max(10, widthPx)}
                                    height={28}
                                    color="#10b981"
                                    secondaryColor="#059669"
                                    mirrored={true}
                                    className="w-full h-full opacity-90"
                                  />
                                </div>
                              )}

                              {/* Volume Rubber-Band Envelope (Curva interactiva de volumen montada en la forma de onda) */}
                              {clip.type === 'audio' && (
                                <div className="absolute left-0 right-0 bottom-1 top-4 z-10 overflow-visible pointer-events-none">
                                  <VolumeRubberBand
                                    clip={clip}
                                    widthPx={widthPx}
                                    heightPx={28}
                                    timelineZoom={timelineZoom}
                                    playheadTime={playheadTime}
                                    onSeek={(t) => setPlayheadTime(t)}
                                    onSelectClip={(id) => selectClip(id)}
                                  />
                                </div>
                              )}

                              {/* Timeline Keyframe Markers Strip (Rombos ◆ en el cuerpo del clip para video/imagen/texto) */}
                              {clip.type !== 'audio' && (
                                <ClipKeyframeMarkers
                                  clip={clip}
                                  timelineZoom={timelineZoom}
                                  playheadTime={playheadTime}
                                  onSeek={(t) => setPlayheadTime(t)}
                                  onSelectClip={(id) => selectClip(id)}
                                />
                              )}
                            </div>
                          );
                        })}

                        {/* Overlap Crossfade / Transition Zones */}
                        {overlaps.map((ov) => {
                          const leftPx = ov.startTime * timelineZoom;
                          const widthPx = Math.max(14, ov.duration * timelineZoom);
                          const isOvSelected = selectedClipId === ov.clipB.id;

                          return (
                            <div
                              key={ov.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectClip(ov.clipB.id);
                              }}
                              title={`Transición (${ov.clipB.overlapTransition}) · ${ov.duration}s`}
                              style={{
                                left: `${leftPx}px`,
                                width: `${widthPx}px`,
                              }}
                              className={`absolute top-0.5 bottom-0.5 z-[25] rounded-md border cursor-pointer flex items-center justify-center overflow-hidden transition ${
                                isOvSelected
                                  ? 'border-[#00d4e5] bg-[#00d4e5]/25'
                                  : 'border-amber-400/80 bg-amber-500/15 hover:bg-amber-400/25'
                              }`}
                            >
                              <span className="px-1 py-0.5 rounded bg-black/75 text-[9px] font-mono text-amber-200 flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                                {ov.duration}s
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Drop Zone at Bottom to Auto-Create a New Track */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverTrackId('__new_track__');
                  }}
                  onDragLeave={() => setDragOverTrackId(null)}
                  onDrop={(e) => handleDropAssetOnTrack(e, undefined, true)}
                  className={`h-7 mx-4 rounded-lg flex items-center justify-center text-xs transition ${
                    dragOverTrackId === '__new_track__'
                      ? 'border border-dashed border-[#00d4e5] bg-[#00d4e5]/15 text-[#00d4e5]'
                      : 'text-transparent'
                  }`}
                >
                  + Soltar aquí para crear pista adicional
                </div>
              </div>
            )}

            {/* Línea blanca con cabezal en cápsula a través de todas las pistas */}
            {!isEmptyProject && (
              <div
                style={{ left: `${TRACK_HEADER_WIDTH + playheadTime * timelineZoom}px` }}
                className="absolute top-0 bottom-0 w-[1.5px] bg-white z-[45] pointer-events-none"
              >
                <div className="w-2.5 h-3.5 -ml-[4px] rounded-[3px] bg-[#141517] border-[1.5px] border-white shadow" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage 4: Floating Right-Click Context Menu on Clip */}
      {contextMenu && contextClip && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          className="fixed z-50 w-64 rounded-xl bg-[#202124] border border-[#32343a] shadow-2xl py-1.5 text-xs text-gray-200 select-none"
        >
          <button
            type="button"
            onClick={() => {
              splitClipAtPlayhead(contextClip.id);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              <Scissors className="w-3.5 h-3.5 text-gray-300" />
              Dividir
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">B</kbd>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              copySelectedClip(contextClip.id);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              <Copy className="w-3.5 h-3.5 text-gray-300" />
              {selectedClipIds.length > 1
                ? `Copiar (${selectedClipIds.length} clips)`
                : 'Copiar'}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">C</kbd>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              cutSelectedClip(contextClip.id);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              <Scissors className="w-3.5 h-3.5 text-gray-300" />
              {selectedClipIds.length > 1
                ? `Cortar (${selectedClipIds.length} clips)`
                : 'Cortar'}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">X</kbd>
            </span>
          </button>

          <button
            type="button"
            disabled={clipboardClips.length === 0}
            onClick={() => {
              pasteClipboardAtPlayhead();
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-white/10 disabled:opacity-35 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              <ClipboardPaste className="w-3.5 h-3.5 text-gray-300" />
              Pegar
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">V</kbd>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              duplicateClip();
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              <Copy className="w-3.5 h-3.5 text-gray-300" />
              {selectedClipIds.length > 1
                ? `Duplicar (${selectedClipIds.length} clips)`
                : 'Duplicar'}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">D</kbd>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              removeClip();
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-rose-500/15 text-rose-300 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              <Trash2 className="w-3.5 h-3.5" />
              {selectedClipIds.length > 1
                ? `Eliminar (${selectedClipIds.length} clips)`
                : 'Eliminar'}
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32] text-[10px] font-mono text-gray-400">
              Supr / Backspace
            </kbd>
          </button>

          <div className="my-1 border-t border-[#2e3036]" />

          <button
            type="button"
            onClick={() => {
              toggleClipLinkGroup(contextClip.id);
              setContextMenu(null);
            }}
            className="w-full px-3.5 py-2 hover:bg-white/10 flex items-center justify-between transition"
          >
            <span className="flex items-center gap-2.5">
              {contextClip.linkGroupId ? (
                <>
                  <Unlink2 className="w-3.5 h-3.5 text-[#00d4e5]" />
                  <span>Audio independiente</span>
                </>
              ) : (
                <>
                  <Link2 className="w-3.5 h-3.5 text-gray-300" />
                  <span>Vincular audio</span>
                </>
              )}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400">
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[#2c2d32]">L</kbd>
            </span>
          </button>
        </div>
      )}
    </section>
  );
};
