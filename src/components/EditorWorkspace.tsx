import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Cloud,
  HardDrive,
  Sparkles,
  FileVideo,
  Music,
  Image as ImageIcon,
  Sliders,
  RefreshCw,
  Undo2,
  Redo2,
  Type as TypeIcon,
  Plus,
  Trash2,
  Link2,
  Unlink2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Volume2,
  Upload,
  RotateCcw,
  CloudUpload,
  ChevronLeft,
  ChevronRight,
  X,
  Keyboard,
  Play,
  Pause,
  Minimize2,
  FlipHorizontal,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { LocalFileBrowserModal } from './LocalFileBrowserModal';
import {
  TimelinePanel,
  computeTrackOverlaps,
  formatTimecode,
} from './TimelinePanel';
import { CanvasPreviewStage } from './CanvasPreviewStage';
import { InspectorPanel } from './inspector/InspectorPanel';
import { ExportModal } from './ExportModal';
import type { TextConfig, TransitionType } from '../types/project';

function formatBytes(bytes = 0): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatAssetDurationBadge(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const TRANSITION_OPTIONS: { id: TransitionType; label: string; desc: string }[] = [
  { id: 'crossfade', label: 'Fundido Cruzado', desc: 'Disolvencia suave entre clips' },
  { id: 'fade-black', label: 'Fundido a Negro', desc: 'Pasa por negro en el cruce' },
  { id: 'wipe-left', label: 'Barrido Izquierda', desc: 'Cortina hacia la izquierda' },
  { id: 'wipe-right', label: 'Barrido Derecha', desc: 'Cortina hacia la derecha' },
  { id: 'slide-left', label: 'Deslizamiento', desc: 'Empuje lateral continuo' },
  { id: 'zoom', label: 'Zoom Cruzado', desc: 'Transición dinámica con escala' },
];

export const EditorWorkspace: React.FC = () => {
  const {
    currentProject,
    pastProjects,
    futureProjects,
    playheadTime,
    isPlaying,
    selectedAssetId,
    selectedClipId,
    isFullscreenPreview,
    isTimelineCollapsed,
    isLeftDrawerOpen,
    isInspectorOpen,
    isFileBrowserOpen,
    systemStatus,
    isSaving,
    errorMessage,
    closeProjectToHome,
    selectAsset,
    selectClip,
    setPlayheadTime,
    setIsPlaying,
    togglePlay,
    setIsFullscreenPreview,
    toggleTimelineCollapsed,
    setIsLeftDrawerOpen,
    toggleLeftDrawer,
    setIsInspectorOpen,
    setIsFileBrowserOpen,
    undo,
    redo,
    updateProjectMeta,
    setInPointAtPlayhead,
    setOutPointAtPlayhead,
    clearInOutPoints,
    probeLocalFiles,
    importDroppedFiles,
    removeAssetFromLibrary,
    addAssetToTimeline,
    addTextTemplateToProject,
    splitClipAtPlayhead,
    duplicateClip,
    flipClipHorizontal,
    copySelectedClip,
    cutSelectedClip,
    pasteClipboardAtPlayhead,
    toggleClipLinkGroup,
    setClipOverlapTransition,
    updateClip,
    updateClipTransformLive,
    resetClipTransform,
    persistCurrentProject,
    updateClipTextConfig,
    removeClip,
    clearEphemeralCache,
    clearError,
  } = useProjectStore();

  const [leftTab, setLeftTab] = useState<'media' | 'audio' | 'text' | 'transitions'>('media');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isDraggingOverDrawer, setIsDraggingOverDrawer] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(255);
  const fullscreenScrubRef = useRef<HTMLDivElement | null>(null);

  const startResizeTimeline = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const initH = timelineHeight;
    const onMove = (ev: MouseEvent) => {
      setTimelineHeight(Math.max(165, Math.min(500, initH - (ev.clientY - startY))));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Playback loop advancing playheadTime in real time (respecting Out Point if active)
  useEffect(() => {
    if (!isPlaying || !currentProject) return;
    const clipsEnd = Math.max(
      0.5,
      currentProject.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
    );
    const stopPoint =
      typeof currentProject.outPoint === 'number' && currentProject.outPoint > 0.1
        ? currentProject.outPoint
        : clipsEnd;
    const restartPoint =
      typeof currentProject.inPoint === 'number' && currentProject.inPoint < stopPoint
        ? currentProject.inPoint
        : 0;

    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const next = useProjectStore.getState().playheadTime + dt;
      if (next >= stopPoint) {
        setPlayheadTime(restartPoint);
        setIsPlaying(false);
        return;
      }
      setPlayheadTime(next);
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentProject, setPlayheadTime, setIsPlaying]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (isFullscreenPreview) {
          e.preventDefault();
          setIsFullscreenPreview(false);
          return;
        }
        if (isShortcutsModalOpen) {
          setIsShortcutsModalOpen(false);
          return;
        }
      }

      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }

      // Ctrl + / -> Mostrar/ocultar el panel de materiales
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        toggleLeftDrawer();
        return;
      }

      // Ctrl + . -> Mostrar/ocultar línea de tiempo
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        toggleTimelineCollapsed();
        return;
      }

      // I -> Mark In Point
      if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setInPointAtPlayhead();
        return;
      }

      // O -> Mark Out Point
      if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOutPointAtPlayhead();
        return;
      }

      // Alt+X -> Clear In/Out Points
      if (e.altKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        clearInOutPoints();
        return;
      }

      // S or Ctrl+B -> Dividir
      if (
        (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b')
      ) {
        e.preventDefault();
        splitClipAtPlayhead();
        return;
      }

      // Ctrl+D -> Duplicar clip
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateClip();
        return;
      }

      // Ctrl+L -> Separar / Vincular audio
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleClipLinkGroup();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelectedClip();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutSelectedClip();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboardAtPlayhead();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          removeClip(selectedClipId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFullscreenPreview,
    isShortcutsModalOpen,
    setIsFullscreenPreview,
    togglePlay,
    toggleLeftDrawer,
    toggleTimelineCollapsed,
    setInPointAtPlayhead,
    setOutPointAtPlayhead,
    clearInOutPoints,
    splitClipAtPlayhead,
    duplicateClip,
    toggleClipLinkGroup,
    copySelectedClip,
    cutSelectedClip,
    pasteClipboardAtPlayhead,
    undo,
    redo,
    selectedClipId,
    removeClip,
  ]);

  if (!currentProject) return null;

  const isEmptyProject = currentProject.clips.length === 0;
  const projectDuration = currentProject.clips.reduce(
    (max, c) => Math.max(max, c.startTime + c.duration),
    0
  );
  const selectedClip =
    currentProject.clips.find((c) => c.id === selectedClipId) || null;

  const selectedClipTrackClips = selectedClip
    ? currentProject.clips.filter((c) => c.trackId === selectedClip.trackId)
    : [];
  const selectedTrackOverlaps = computeTrackOverlaps(selectedClipTrackClips);
  const activeOverlapForSelectedClip = selectedClip
    ? selectedTrackOverlaps.find(
        (ov) => ov.clipB.id === selectedClip.id || ov.clipA.id === selectedClip.id
      ) || null
    : null;

  const usedAssetIds = new Set(currentProject.clips.map((c) => c.assetId).filter(Boolean));

  const visibleAssets = currentProject.assets.filter((a) =>
    leftTab === 'audio' ? a.type === 'audio' : true
  );

  const handleDropOnDrawer = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverDrawer(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await importDroppedFiles(e.dataTransfer.files);
    }
  };

  // Fullscreen Bottom Scrubbing Handler (Stage 5)
  const handleFullscreenScrubMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEmptyProject) return;
    const bar = fullscreenScrubRef.current;
    if (!bar) return;

    const updateFromX = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      setPlayheadTime(ratio * Math.max(0.5, projectDuration));
    };

    updateFromX(e.clientX);
    const onMove = (ev: MouseEvent) => updateFromX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const fullscreenProgressPct =
    projectDuration > 0 ? Math.max(0, Math.min(100, (playheadTime / projectDuration) * 100)) : 0;

  return (
    <div className="h-screen w-screen bg-[#141517] text-gray-100 flex select-none overflow-hidden">
      {/* Improvement 1: Full-Height (100vh) Left Icon Rail (Hidden in Fullscreen) */}
      {!isFullscreenPreview && (
        <nav className="w-16 h-full bg-[#141517] border-r border-[#26272b] flex flex-col items-center justify-between py-2.5 shrink-0 z-30">
          <div className="flex flex-col items-center gap-2 w-full px-1.5">
            {/* Top-Left App Brand / Back to Home Button */}
            <button
              type="button"
              onClick={closeProjectToHome}
              title="Volver a proyectos (VOSTOK EDITOR)"
              className="w-10 h-10 mb-1 rounded-xl bg-white/[0.04] hover:bg-[#282a30] border border-[#2e3036] hover:border-[#00d4e5]/50 p-2 text-gray-200 hover:text-white flex items-center justify-center transition group shadow-sm"
            >
              <img
                src="/brand/vostok-icon.png"
                alt="Vostok"
                className="w-full h-full object-contain group-hover:scale-105 transition-transform"
              />
            </button>

            {(
              [
                { id: 'media', label: 'Multimedia', icon: CloudUpload },
                { id: 'audio', label: 'Audio', icon: Music },
                { id: 'text', label: 'Texto', icon: TypeIcon },
                { id: 'transitions', label: 'Transición', icon: Sparkles },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = isLeftDrawerOpen && leftTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (leftTab === item.id && isLeftDrawerOpen) {
                      setIsLeftDrawerOpen(false);
                    } else {
                      setLeftTab(item.id);
                      setIsLeftDrawerOpen(true);
                    }
                  }}
                  className={`w-full py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition ${
                    active
                      ? 'bg-[#25262b] text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[10px] font-medium truncate max-w-[54px]">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom-Left Keyboard Shortcuts Icon Button */}
          <button
            type="button"
            onClick={() => setIsShortcutsModalOpen(true)}
            title="Atajos de teclado"
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        </nav>
      )}

      {/* Full-Height Collapsible Left Media/Text Drawer (`Ctrl + /`) */}
      {!isFullscreenPreview && isLeftDrawerOpen && (
        <aside
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOverDrawer(true);
          }}
          onDragLeave={() => setIsDraggingOverDrawer(false)}
          onDrop={handleDropOnDrawer}
          className={`w-72 h-full bg-[#18191c] border-r border-[#26272b] flex flex-col min-h-0 shrink-0 relative z-20 transition ${
            isDraggingOverDrawer ? 'ring-2 ring-[#00d4e5]' : ''
          }`}
        >
          {/* Drawer Header (aligned with top header height) */}
          <div className="h-12 px-4 border-b border-[#26272b] flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-gray-100">
              {leftTab === 'media'
                ? 'Cargas'
                : leftTab === 'audio'
                ? 'Audio'
                : leftTab === 'text'
                ? 'Texto y Títulos'
                : 'Transiciones'}
            </span>
            <span className="text-[11px] text-gray-500">
              {leftTab === 'media' || leftTab === 'audio'
                ? `${visibleAssets.length}`
                : ''}
            </span>
          </div>

          {/* Drawer Body */}
          {leftTab === 'media' || leftTab === 'audio' ? (
            <div className="flex-1 overflow-y-auto p-3">
              {/* 2-Column Thumbnail Grid with `[☁️ Cargar]` as First Card */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* First Card: Cargar */}
                <button
                  type="button"
                  onClick={() => setIsFileBrowserOpen(true)}
                  className="h-24 rounded-xl bg-[#25262b] hover:bg-[#2e3036] border border-[#32343a] flex flex-col items-center justify-center gap-1.5 text-gray-200 transition group"
                >
                  <CloudUpload className="w-5 h-5 text-gray-300 group-hover:text-[#00d4e5] transition" />
                  <span className="text-xs font-medium">Cargar</span>
                </button>

                {/* Imported Media Asset Cards */}
                {visibleAssets.map((asset) => {
                  const isSelected = selectedAssetId === asset.id;
                  const isAddedToTimeline = usedAssetIds.has(asset.id);

                  return (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-video-editor-asset', asset.id);
                      }}
                      onClick={() => selectAsset(asset.id)}
                      onDoubleClick={() => addAssetToTimeline(asset.id, { startTime: playheadTime })}
                      title={`${asset.name} — Arrastra a la línea de tiempo o haz clic en +`}
                      className={`h-24 rounded-xl overflow-hidden bg-white/[0.04] border relative group cursor-grab active:cursor-grabbing transition ${
                        isSelected
                          ? 'border-[#00d4e5] ring-1 ring-[#00d4e5]'
                          : 'border-[#2c2d32] hover:border-gray-500'
                      }`}
                    >
                      {asset.thumbnail ? (
                        <img
                          src={asset.thumbnail}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-[#1c1d21] p-2">
                          {asset.type === 'audio' ? (
                            <Music className="w-5 h-5 text-[#00d4e5] mb-1" />
                          ) : asset.type === 'image' ? (
                            <ImageIcon className="w-5 h-5 text-purple-400 mb-1" />
                          ) : (
                            <FileVideo className="w-5 h-5 text-[#00d4e5] mb-1" />
                          )}
                          <span className="text-[10px] text-gray-300 truncate max-w-full px-1">
                            {asset.name}
                          </span>
                        </div>
                      )}

                      {/* Top-Left Badge: `Agregado` when used on timeline */}
                      {isAddedToTimeline && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-medium text-gray-200 backdrop-blur-xs">
                          Agregado
                        </span>
                      )}

                      {/* Bottom-Left Badge: Duration `00:25` */}
                      <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-gray-100 backdrop-blur-xs">
                        {formatAssetDurationBadge(asset.duration)}
                      </span>

                      {/* Hover Quick Actions: Remove & Add (`+`) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAssetFromLibrary(asset.id);
                        }}
                        title="Quitar de cargas"
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/70 text-gray-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addAssetToTimeline(asset.id, { startTime: playheadTime });
                        }}
                        title="Agregar a la línea de tiempo"
                        className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-lg bg-[#00d4e5] text-[#141517] flex items-center justify-center opacity-0 group-hover:opacity-100 shadow transition hover:scale-105"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : leftTab === 'text' ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {/* Opción 1: Título */}
              <button
                type="button"
                onClick={() =>
                  addTextTemplateToProject(
                    'Título',
                    {
                      content: 'TÍTULO',
                      fontFamily: 'TikTok Sans Variable',
                      fontSize: 16,
                      fontWeight: 800,
                      color: '#ffffff',
                      backgroundColor: 'transparent',
                      bold: true,
                      italic: false,
                      align: 'center',
                    },
                    playheadTime,
                    { x: 0, y: 0 }
                  )
                }
                className="w-full h-14 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#00d4e5]/60 px-4 flex items-center justify-between group transition shadow-sm cursor-pointer"
              >
                <span className="text-sm font-semibold tracking-wide text-white">
                  Título
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#00d4e5]/15 text-[#00d4e5] group-hover:bg-[#00d4e5] group-hover:text-[#141517] flex items-center justify-center transition shadow-sm">
                  <Plus className="w-4 h-4 stroke-[3]" />
                </div>
              </button>

              {/* Opción 2: Texto de cuerpo */}
              <button
                type="button"
                onClick={() =>
                  addTextTemplateToProject(
                    'Texto de cuerpo',
                    {
                      content: 'Texto de cuerpo',
                      fontFamily: 'TikTok Sans Variable',
                      fontSize: 8,
                      fontWeight: 400,
                      color: '#ffffff',
                      backgroundColor: 'transparent',
                      bold: false,
                      italic: false,
                      align: 'center',
                    },
                    playheadTime,
                    { x: 0, y: 110 }
                  )
                }
                className="w-full h-14 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#00d4e5]/60 px-4 flex items-center justify-between group transition shadow-sm cursor-pointer"
              >
                <span className="text-sm font-medium tracking-wide text-gray-200 group-hover:text-white transition">
                  Texto de cuerpo
                </span>
                <div className="w-7 h-7 rounded-lg bg-[#00d4e5]/15 text-[#00d4e5] group-hover:bg-[#00d4e5] group-hover:text-[#141517] flex items-center justify-center transition shadow-sm">
                  <Plus className="w-4 h-4 stroke-[3]" />
                </div>
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <p className="text-[11px] text-gray-400 mb-2">
                Solapa dos clips en la misma pista para crear un cruce y elige el estilo de transición:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TRANSITION_OPTIONS.map((opt) => {
                  const currentTr = activeOverlapForSelectedClip
                    ? activeOverlapForSelectedClip.clipB.overlapTransition
                    : selectedClip?.overlapTransition;
                  const isActive = currentTr === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!selectedClip}
                      onClick={() => {
                        if (!selectedClip) return;
                        const targetId = activeOverlapForSelectedClip
                          ? activeOverlapForSelectedClip.clipB.id
                          : selectedClip.id;
                        setClipOverlapTransition(targetId, opt.id);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-20 disabled:opacity-40 ${
                        isActive
                          ? 'bg-[#00d4e5]/15 border-[#00d4e5] text-[#00d4e5]'
                          : 'bg-[#25262b] border-[#32343a] text-gray-200 hover:border-gray-500'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-[#00d4e5]" />
                      <div>
                        <div className="text-xs font-semibold leading-tight">{opt.label}</div>
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">{opt.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Right Main Column: Top Header + Center Preview/Inspector + Bottom Timeline */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative">
        {/* Top Navbar (Hidden in Fullscreen Preview Mode) */}
        {!isFullscreenPreview && (
          <header className="h-12 border-b border-[#26272b] bg-[#141517] px-4 flex items-center justify-between shrink-0">
            {/* Left: Cloud Saved Status + Project Name */}
            <div className="flex items-center gap-2 text-gray-300">
              <Cloud
                className={`w-3.5 h-3.5 ${
                  isSaving ? 'text-amber-400 animate-pulse' : 'text-gray-400'
                }`}
              />
              <input
                type="text"
                value={currentProject.name}
                onChange={(e) => updateProjectMeta({ name: e.target.value })}
                className="bg-transparent hover:bg-white/[0.04] focus:bg-white/[0.04] px-2 py-1 rounded-lg text-xs font-semibold text-gray-100 focus:outline-none border border-transparent focus:border-[#00d4e5]/60 transition w-48"
              />
            </div>

            {/* Center: Undo / Redo Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={pastProjects.length === 0}
                title="Deshacer (Ctrl+Z)"
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-25 transition"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={futureProjects.length === 0}
                title="Rehacer (Ctrl+Y)"
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-25 transition"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Derecha: Estado de almacenamiento en caché y botón principal de Exportar */}
            <div className="flex items-center gap-2.5">
              {systemStatus && systemStatus.storage.cacheBytes > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-[#2c2d32] flex items-center gap-2 text-xs">
                  <HardDrive className="w-3.5 h-3.5 text-[#00d4e5]" />
                  <span className="font-mono text-gray-300">
                    {formatBytes(systemStatus.storage.cacheBytes)}
                  </span>
                  <button
                    onClick={clearEphemeralCache}
                    className="text-gray-400 hover:text-rose-400 transition"
                    title="Limpiar caché temporal"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={isEmptyProject}
                onClick={() => {
                  setIsPlaying(false);
                  setIsExportModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#3b82f6] disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 shadow transition"
              >
                <Upload className="w-3.5 h-3.5" />
                Exportar
              </button>
            </div>
          </header>
        )}

        {/* Error Banner */}
        {errorMessage && !isFullscreenPreview && (
          <div className="bg-rose-500/20 border-b border-rose-500/40 px-4 py-2 text-xs text-rose-200 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={clearError} className="underline font-semibold">
              Cerrar
            </button>
          </div>
        )}

        {/* Middle Preview Area: Collapse Handle + Center Stage + Floating Right Inspector */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Collapse / Expand Handle `<` / `>` on the Left Edge of Preview Stage (`Ctrl + /`) */}
          {!isFullscreenPreview && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 z-30 flex items-center">
              <button
                type="button"
                onClick={toggleLeftDrawer}
                title="Mostrar/ocultar el panel de materiales (Ctrl+/)"
                className="-ml-[1px] w-3.5 h-11 rounded-r-lg bg-[#25262b] hover:bg-[#32343a] border border-l-0 border-[#32343a] text-gray-300 flex items-center justify-center shadow transition"
              >
                {isLeftDrawerOpen ? (
                  <ChevronLeft className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            </div>
          )}

          {/* Center Stage: Unified Real-Time Canvas Compositor + Interactive Gizmo */}
          <main
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                selectClip(null);
              }
            }}
            className="flex-1 min-w-0 min-h-0 bg-[#18191c] flex flex-col items-center justify-center relative overflow-hidden"
          >
            <CanvasPreviewStage />
          </main>

          {/* Stage 3: Floating Right Inspector Card (Modular Contextual Component) */}
          {!isFullscreenPreview && selectedClip && isInspectorOpen && (
            <InspectorPanel
              clip={selectedClip}
              onClose={() => setIsInspectorOpen(false)}
            />
          )}
        </div>

        {/* Stage 5: Fullscreen Preview Bottom Bar */}
        {isFullscreenPreview ? (
          <div className="bg-[#141517] shrink-0 select-none">
            {/* Full-Width Interactive Cyan Scrub Bar with Circular White Thumb */}
            <div
              ref={fullscreenScrubRef}
              onMouseDown={handleFullscreenScrubMouseDown}
              className="w-full h-3 flex items-center cursor-pointer group"
            >
              <div className="w-full h-1 group-hover:h-1.5 bg-[#32343a] relative transition-all">
                <div
                  style={{ width: `${fullscreenProgressPct}%` }}
                  className="absolute left-0 top-0 bottom-0 bg-[#00d4e5]"
                />
                <div
                  style={{ left: `${fullscreenProgressPct}%` }}
                  className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3.5 h-3.5 rounded-full bg-white shadow-lg"
                />
              </div>
            </div>

            {/* Bottom Controls Strip */}
            <div className="h-12 px-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-7 h-7 rounded-full bg-white hover:bg-gray-200 text-[#141517] flex items-center justify-center shadow transition"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>

                <div className="text-xs font-mono flex items-center gap-1.5">
                  <span className="text-white font-semibold">
                    {formatTimecode(playheadTime, currentProject.fps)}
                  </span>
                  <span className="text-gray-600">|</span>
                  <span className="text-gray-400">
                    {formatTimecode(projectDuration, currentProject.fps)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFullscreenPreview(false)}
                title="Salir de pantalla completa (Esc)"
                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Horizontal Resizer Handle above Timeline (when expanded) */}
            {!isTimelineCollapsed && (
              <div
                onMouseDown={startResizeTimeline}
                title="Arrastrar arriba/abajo para cambiar altura de la línea de tiempo"
                className="h-1 bg-[#141517] hover:bg-[#00d4e5]/60 active:bg-[#00d4e5] cursor-row-resize transition shrink-0"
              />
            )}

            {/* Bottom Multi-Track Timeline Panel */}
            <TimelinePanel heightPx={timelineHeight} />
          </>
        )}
      </div>

      {/* Local File Browser Modal */}
      <LocalFileBrowserModal
        isOpen={isFileBrowserOpen}
        onClose={() => setIsFileBrowserOpen(false)}
        onImportPaths={async (paths) => {
          const added = await probeLocalFiles(paths);
          if (added.length > 0 && currentProject.clips.length === 0) {
            await addAssetToTimeline(added[0].id, { startTime: 0 });
          }
        }}
      />

      {/* FFmpeg MP4 Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

      {/* Keyboard Shortcuts Modal (Triggered from Bottom-Left Keyboard Icon) */}
      {isShortcutsModalOpen && (
        <div
          onClick={() => setIsShortcutsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white/[0.04] border border-[#32343a] shadow-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-[#2e3036] pb-3">
              <span className="font-semibold text-sm text-white flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-[#00d4e5]" />
                Atajos de teclado
              </span>
              <button
                type="button"
                onClick={() => setIsShortcutsModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-gray-300">
              {[
                { label: 'Reproducir / Pausar', keys: 'Espacio' },
                { label: 'Dividir clip en la aguja', keys: 'Ctrl + B / S' },
                { label: 'Duplicar clip seleccionado', keys: 'Ctrl + D' },
                { label: 'Copiar / Cortar / Pegar', keys: 'Ctrl + C / X / V' },
                { label: 'Audio independiente / Vincular', keys: 'Ctrl + L' },
                { label: 'Zoom en línea de tiempo (bajo cursor)', keys: 'Ctrl + Rueda' },
                { label: 'Marcar Entrada / Salida', keys: 'I / O' },
                { label: 'Limpiar rango I/O', keys: 'Alt + X' },
                { label: 'Mostrar/ocultar panel de materiales', keys: 'Ctrl + /' },
                { label: 'Mostrar/ocultar línea de tiempo', keys: 'Ctrl + .' },
                { label: 'Deshacer / Rehacer', keys: 'Ctrl + Z / Y' },
                { label: 'Eliminar clip seleccionado', keys: 'Retroceso / Supr' },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-1 border-b border-[#2a2b30]/60"
                >
                  <span>{row.label}</span>
                  <kbd className="px-2 py-0.5 rounded bg-[#2c2d32] font-mono text-[11px] text-[#00d4e5]">
                    {row.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};