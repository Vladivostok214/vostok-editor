import { create } from 'zustand';
import { apiUrl } from '../config/api';
import type {
  AspectRatio,
  MediaAsset,
  ProjectData,
  SystemStatus,
  TextConfig,
  TimelineClip,
  Track,
  TrackType,
  TransitionType,
  AnimatableProperty,
  InterpolationType,
  Keyframe,
} from '../types/project';
import { insertOrUpdateKeyframe, removeKeyframeById } from '../lib/keyframeEngine';

const MAX_HISTORY_STEPS = 50;

interface ProjectStore {
  view: 'home' | 'editor';
  projects: ProjectData[];
  currentProject: ProjectData | null;
  pastProjects: ProjectData[];
  futureProjects: ProjectData[];

  // Timeline & Playback State
  playheadTime: number;
  isPlaying: boolean;
  timelineZoom: number; // pixels per second (default 65)
  selectedAssetId: string | null;
  selectedAssetIds: string[];
  selectedClipId: string | null;
  selectedClipIds: string[];
  clipboardClips: TimelineClip[];

  // UI Layout & Floating Panels State (Phase 5)
  isFullscreenPreview: boolean;
  isTimelineCollapsed: boolean;
  isLeftDrawerOpen: boolean;
  isInspectorOpen: boolean;
  isFileBrowserOpen: boolean;
  isMainTrackMagnetic: boolean;

  // Media Offline & Relink (Fase 13)
  offlineAssetIds: string[];
  isRelinkModalOpen: boolean;
  relinkTargetAssetId: string | null;

  systemStatus: SystemStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  errorMessage: string | null;

  fetchSystemStatus: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  createNewProject: (name: string, aspectRatio: AspectRatio, fps?: number) => Promise<void>;
  openProject: (project: ProjectData) => void;
  closeProjectToHome: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // Selection & Playhead
  selectAsset: (assetId: string | null, mode?: 'replace' | 'toggle' | 'add') => void;
  setSelectedAssetIds: (ids: string[], primaryId?: string | null) => void;
  selectAllAssets: (tab?: 'media' | 'audio' | 'all') => void;
  clearAssetSelection: () => void;
  selectClip: (clipId: string | null, mode?: 'replace' | 'toggle' | 'add') => void;
  setSelectedClipIds: (ids: string[], primaryId?: string | null) => void;
  selectAllClips: () => void;
  clearClipSelection: () => void;
  setPlayheadTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setTimelineZoom: (zoom: number) => void;

  // UI Layout Actions
  setIsFullscreenPreview: (val: boolean) => void;
  toggleTimelineCollapsed: () => void;
  setIsLeftDrawerOpen: (val: boolean) => void;
  toggleLeftDrawer: () => void;
  setIsInspectorOpen: (val: boolean) => void;
  setIsFileBrowserOpen: (val: boolean) => void;
  toggleMainTrackMagnetic: () => Promise<void>;

  // Arrastre de medios desde la biblioteca e indicador de destino en la línea de tiempo
  assetDrag: AssetDragState | null;
  dropIndicator: DropIndicator | null;
  setAssetDrag: (drag: AssetDragState | null) => void;
  setDropIndicator: (indicator: DropIndicator | null) => void;

  // Undo / Redo History
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  pushUndoSnapshot: () => void;
  persistCurrentProject: () => Promise<void>;
  commitProjectUpdate: (updater: (current: ProjectData) => ProjectData) => Promise<ProjectData | null>;

  // Project & Library Mutations
  updateProjectMeta: (patch: Partial<Pick<ProjectData, 'name' | 'aspectRatio' | 'fps' | 'inPoint' | 'outPoint'>>) => Promise<void>;
  setInPointAtPlayhead: (customTime?: number) => Promise<void>;
  setOutPointAtPlayhead: (customTime?: number) => Promise<void>;
  clearInOutPoints: () => Promise<void>;
  updateInOutLive: (patch: { inPoint?: number | null; outPoint?: number | null }) => void;
  probeLocalFiles: (filePaths: string[]) => Promise<MediaAsset[]>;
  importDroppedFiles: (files: FileList | File[]) => Promise<MediaAsset[]>;
  removeAssetFromLibrary: (assetId?: string) => Promise<void>;
  removeSelectedAssetsFromLibrary: () => Promise<void>;
  updateAssetWaveform: (assetId: string, waveform: number[]) => void;

  // Media Offline & Relink Actions (Fase 13)
  checkProjectMediaStatus: (autoOpenModal?: boolean) => Promise<string[]>;
  relinkAsset: (assetId: string, newFilePath: string, autoScanSiblings?: boolean) => Promise<{ autoRelinkedCount: number }>;
  openRelinkModal: (assetId?: string | null) => void;
  closeRelinkModal: () => void;

  // Track Management
  addTrack: (type: TrackType) => Promise<Track | null>;
  toggleTrackFlag: (trackId: string, flag: 'muted' | 'locked' | 'hidden') => Promise<void>;
  removeTrack: (trackId: string) => Promise<void>;

  // Timeline Clip Operations
  addAssetToTimeline: (
    assetId: string,
    options?: { trackId?: string; startTime?: number; createNewTrack?: boolean; insertAtIndex?: number }
  ) => Promise<void>;
  addAssetsToTimeline: (
    assetIds: string[],
    options?: { trackId?: string; startTime?: number; createNewTrack?: boolean; insertAtIndex?: number }
  ) => Promise<void>;
  addTextTemplateToProject: (
    templateName: string,
    config: TextConfig,
    startTime?: number,
    initialTransform?: Partial<TimelineClip['transform']>
  ) => Promise<TimelineClip | null>;
  moveClipLive: (clipId: string, newStartTime: number, targetTrackId?: string) => void;
  moveSelectedClipsLive: (
    initialStarts: Record<string, number>,
    deltaSeconds: number,
    primaryClipId?: string,
    targetTrackIdForPrimary?: string
  ) => void;
  moveClipToNewTrack: (clipId: string, newStartTime: number, insertIndex: number) => void;
  trimClipLive: (clipId: string, edge: 'left' | 'right', deltaSeconds: number) => void;
  splitClipAtPlayhead: (clipId?: string) => Promise<void>;
  duplicateClip: (clipId?: string) => Promise<void>;
  rotateClip90: (clipId?: string) => Promise<void>;
  flipClipHorizontal: (clipId?: string) => Promise<void>;
  copySelectedClip: (clipId?: string) => void;
  cutSelectedClip: (clipId?: string) => Promise<void>;
  pasteClipboardAtPlayhead: () => Promise<void>;
  toggleClipLinkGroup: (clipId?: string) => Promise<void>;
  setClipOverlapTransition: (clipId: string, transition: TransitionType) => Promise<void>;

  updateClip: (clipId: string, patch: Partial<TimelineClip>) => Promise<void>;
  updateClipTransformLive: (clipId: string, transformPatch: Partial<TimelineClip['transform']>) => void;
  resetClipTransform: (clipId: string) => Promise<void>;
  updateClipTextConfig: (clipId: string, textPatch: Partial<TextConfig>) => Promise<void>;
  setClipKeyframe: (
    clipId: string,
    property: AnimatableProperty,
    timeOffset: number,
    value: number,
    interpolation?: InterpolationType
  ) => Promise<void>;
  removeClipKeyframe: (
    clipId: string,
    property: AnimatableProperty,
    keyframeId: string
  ) => Promise<void>;
  clearClipKeyframes: (
    clipId: string,
    property?: AnimatableProperty
  ) => Promise<void>;
  removeClip: (clipId?: string) => Promise<void>;
  removeSelectedClips: () => Promise<void>;

  generateSampleMedia: (kind?: 'video' | 'audio' | 'image' | 'pack') => Promise<MediaAsset[]>;
  clearEphemeralCache: () => Promise<void>;
  clearError: () => void;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cloneProject(proj: ProjectData): ProjectData {
  return JSON.parse(JSON.stringify(proj));
}

function sortTracksByPriority(tracks: Track[]): Track[] {
  const order: Record<TrackType, number> = { text: 0, video: 1, audio: 2 };
  return [...tracks].sort((a, b) => order[a.type] - order[b.type]);
}

const TRACK_TYPE_ORDER: Record<TrackType, number> = { text: 0, video: 1, audio: 2 };

/**
 * Rango de índices válidos (en el arreglo de pistas) donde se puede insertar una pista
 * nueva del tipo dado sin romper la jerarquía texto > video > audio.
 */
export function getTrackZoneBounds(tracks: Track[], type: TrackType): { lo: number; hi: number } {
  const lo = tracks.filter((t) => TRACK_TYPE_ORDER[t.type] < TRACK_TYPE_ORDER[type]).length;
  const count = tracks.filter((t) => t.type === type).length;
  return { lo, hi: lo + count };
}

/** Crea una pista nueva con numeración secuencial limpia para su tipo. */
function buildNewTrack(tracks: Track[], type: TrackType): Track {
  const existingNums = tracks
    .filter((t) => t.type === type)
    .map((t) => {
      const match = t.name.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    });
  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  const label = type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : 'Texto';
  return {
    id: createId(`track_${type}`),
    name: `Pista ${label} ${nextNum}`,
    type,
    muted: false,
    locked: false,
    hidden: false,
  };
}

export function getMainVideoTrack(tracks: Track[]): Track | undefined {
  return (
    tracks.find((t) => t.type === 'video' && (t.name === 'Pista Video 1' || t.name === 'Pista Video')) ||
    tracks.slice().reverse().find((t) => t.type === 'video') ||
    tracks.find((t) => t.type === 'video')
  );
}

/**
 * Checks whether the interval [startTime, startTime + duration] collides with
 * any clip currently residing on the given track.
 */
export function isRangeCollidingWithTrack(
  clips: TimelineClip[],
  trackId: string,
  startTime: number,
  duration: number,
  ignoreClipId?: string
): boolean {
  const eps = 0.02; // Margen de tolerancia de 20ms para permitir clips contiguos
  const rangeStart = startTime + eps;
  const rangeEnd = startTime + duration - eps;

  return clips.some((c) => {
    if (c.trackId !== trackId || (ignoreClipId && c.id === ignoreClipId)) return false;
    const clipStart = c.startTime;
    const clipEnd = c.startTime + c.duration;
    return clipStart < rangeEnd && clipEnd > rangeStart;
  });
}

/**
 * Asignación inteligente de pista libre sin colisiones para cualquier tipo de medio.
 * Si la pista preferida está libre en [startTime, startTime + duration], la utiliza.
 * Si está ocupada, busca otra pista desbloqueada del mismo tipo que esté libre.
 * Si todas están ocupadas, crea una pista automáticamente respetando la jerarquía de capas:
 *   - Texto: se inserta arriba del todo (capa superior visual)
 *   - Video: se inserta sobre otras pistas de video (capa superior / overlay / PiP)
 *   - Audio: se añade abajo (Pista Audio 1, 2, 3...)
 */
export function findOrCreateAvailableTrack(
  tracks: Track[],
  clips: TimelineClip[],
  type: TrackType,
  startTime: number,
  duration: number,
  preferredTrackId?: string
): { track: Track; updatedTracks: Track[] } {
  // 1. Si se indicó una pista preferida y está libre de colisión en ese tramo
  if (preferredTrackId) {
    const pref = tracks.find((t) => t.id === preferredTrackId);
    if (pref && pref.type === type && !pref.locked) {
      if (!isRangeCollidingWithTrack(clips, pref.id, startTime, duration)) {
        return { track: pref, updatedTracks: tracks };
      }
    }
  }

  // 2. Buscar en pistas existentes desbloqueadas del mismo tipo
  const candidateTracks = tracks.filter((t) => t.type === type && !t.locked);
  for (const cand of candidateTracks) {
    if (!isRangeCollidingWithTrack(clips, cand.id, startTime, duration)) {
      return { track: cand, updatedTracks: tracks };
    }
  }

  // 3. Si todas están ocupadas, auto-crear una pista nueva con número secuencial limpio
  const existingNums = tracks
    .filter((t) => t.type === type)
    .map((t) => {
      const match = t.name.match(/\d+$/);
      return match ? parseInt(match[0], 10) : 0;
    });
  const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  const label = type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : 'Texto';

  const newTrack: Track = {
    id: createId(`track_${type}`),
    name: `Pista ${label} ${nextNum}`,
    type,
    muted: false,
    locked: false,
    hidden: false,
  };

  const nextTracks = [...tracks];
  if (type === 'text') {
    nextTracks.unshift(newTrack);
  } else if (type === 'video') {
    const firstVideoIdx = nextTracks.findIndex((t) => t.type === 'video');
    if (firstVideoIdx !== -1) {
      nextTracks.splice(firstVideoIdx, 0, newTrack);
    } else {
      nextTracks.push(newTrack);
    }
  } else {
    nextTracks.push(newTrack);
  }

  const sortedTracks = sortTracksByPriority(nextTracks);
  return { track: newTrack, updatedTracks: sortedTracks };
}

function pruneEmptyTracks(tracks: Track[], clips: TimelineClip[]): Track[] {
  const usedTrackIds = new Set(clips.map((c) => c.trackId));
  return tracks.filter((t) => usedTrackIds.has(t.id));
}

/**
 * Packs clips on the Main Video Track sequentially starting at 00:00 without gaps
 * when `isMainTrackMagnetic` is enabled, keeping linked audio clips synchronized.
 */
export function packMainTrackClips(
  tracks: Track[],
  clips: TimelineClip[],
  isMagnetic: boolean
): TimelineClip[] {
  if (!isMagnetic) return clips;
  const mainVideoTrack = getMainVideoTrack(tracks);
  if (!mainVideoTrack) return clips;

  const mainClips = clips
    .filter((c) => c.trackId === mainVideoTrack.id)
    .sort((a, b) => a.startTime - b.startTime);

  if (mainClips.length === 0) return clips;

  const newStartByClipId = new Map<string, number>();
  const newStartByGroupId = new Map<string, number>();

  let cursor = 0;
  for (const mc of mainClips) {
    const packedStart = Number(cursor.toFixed(2));
    newStartByClipId.set(mc.id, packedStart);
    if (mc.linkGroupId) {
      newStartByGroupId.set(mc.linkGroupId, packedStart);
    }
    cursor = Number((packedStart + mc.duration).toFixed(2));
  }

  return clips.map((c) => {
    if (newStartByClipId.has(c.id)) {
      return { ...c, startTime: newStartByClipId.get(c.id)! };
    }
    if (c.linkGroupId && newStartByGroupId.has(c.linkGroupId)) {
      return { ...c, startTime: newStartByGroupId.get(c.linkGroupId)! };
    }
    return c;
  });
}

let latestSaveRevision = 0;
let pendingSaveChain: Promise<unknown> = Promise.resolve();

async function persistProjectToDisk(project: ProjectData): Promise<ProjectData> {
  const res = await fetch(apiUrl('/api/projects'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error('Error autoguardando proyecto en disco');
  const data = await res.json();
  return data.project || project;
}

function enqueueProjectSave(project: ProjectData): { revision: number; promise: Promise<ProjectData> } {
  const revision = ++latestSaveRevision;
  const run = pendingSaveChain
    .catch(() => {})
    .then(() => persistProjectToDisk(project));
  pendingSaveChain = run;
  return { revision, promise: run };
}

export interface DropIndicator {
  kind: 'track' | 'new-track';
  /** Rectángulo en coordenadas de ventana (position: fixed) */
  rect: { left: number; top: number; width: number; height: number };
}

export interface AssetDragState {
  assetId: string;
  assetIds?: string[];
  clientX: number;
  clientY: number;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  view: 'home',
  projects: [],
  currentProject: null,
  pastProjects: [],
  futureProjects: [],

  playheadTime: 0,
  isPlaying: false,
  timelineZoom: 65,
  selectedAssetId: null,
  selectedAssetIds: [],
  selectedClipId: null,
  selectedClipIds: [],
  clipboardClips: [],

  isFullscreenPreview: false,
  isTimelineCollapsed: false,
  isLeftDrawerOpen: false,
  isInspectorOpen: false,
  isFileBrowserOpen: false,
  isMainTrackMagnetic: true,

  offlineAssetIds: [],
  isRelinkModalOpen: false,
  relinkTargetAssetId: null,

  assetDrag: null,
  dropIndicator: null,
  setAssetDrag: (drag) => set({ assetDrag: drag }),
  setDropIndicator: (indicator) => {
    const prev = get().dropIndicator;
    if (prev === indicator) return;
    if (
      prev &&
      indicator &&
      prev.kind === indicator.kind &&
      prev.rect.left === indicator.rect.left &&
      prev.rect.top === indicator.rect.top &&
      prev.rect.width === indicator.rect.width &&
      prev.rect.height === indicator.rect.height
    ) {
      return;
    }
    set({ dropIndicator: indicator });
  },

  systemStatus: null,
  isLoading: false,
  isSaving: false,
  lastSavedAt: null,
  errorMessage: null,

  fetchSystemStatus: async () => {
    try {
      const res = await fetch(apiUrl('/api/system/status'));
      if (!res.ok) throw new Error('Error consultando estado del sistema');
      const data: SystemStatus = await res.json();
      set({ systemStatus: data });
    } catch (err: any) {
      set({ errorMessage: err?.message || 'Error conectando con el servidor multimedia local' });
    }
  },

  fetchProjects: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch(apiUrl('/api/projects'));
      if (!res.ok) throw new Error('Error listando proyectos');
      const data = await res.json();
      set({ projects: data.projects || [], isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, errorMessage: err?.message || 'Error al cargar proyectos recientes' });
    }
  },

  createNewProject: async (name, aspectRatio, fps = 30) => {
    set({ isSaving: true, errorMessage: null });
    const newProject: ProjectData = {
      id: createId('proj'),
      name: name.trim() || 'Proyecto sin título',
      updatedAt: new Date().toISOString(),
      aspectRatio,
      fps,
      inPoint: null,
      outPoint: null,
      assets: [],
      tracks: [],
      clips: [],
    };

    const { revision, promise } = enqueueProjectSave(newProject);

    try {
      const saved = await promise;
      if (revision !== latestSaveRevision) return;
      const currentList = get().projects.filter((p) => p.id !== saved.id);
      set({
        currentProject: saved,
        pastProjects: [],
        futureProjects: [],
        playheadTime: 0,
        isPlaying: false,
        selectedAssetId: null,
        selectedAssetIds: [],
        selectedClipId: null,
        selectedClipIds: [],
        isFullscreenPreview: false,
        isTimelineCollapsed: false,
        isLeftDrawerOpen: false,
        isInspectorOpen: false,
        offlineAssetIds: [],
        isRelinkModalOpen: false,
        relinkTargetAssetId: null,
        projects: [saved, ...currentList],
        view: 'editor',
        isSaving: false,
        lastSavedAt: saved.updatedAt,
      });
      await get().fetchSystemStatus();
    } catch (err: any) {
      if (revision === latestSaveRevision) {
        set({ isSaving: false, errorMessage: err?.message || 'Error creando proyecto' });
      }
    }
  },

  openProject: (project) => {
    latestSaveRevision++;
    const cleanedTracks =
      project.clips.length === 0 ? [] : pruneEmptyTracks(project.tracks, project.clips);
    const normalizedProject = {
      ...project,
      tracks: cleanedTracks.length > 0 || project.clips.length === 0 ? cleanedTracks : project.tracks,
    };
    set({
      currentProject: normalizedProject,
      pastProjects: [],
      futureProjects: [],
      playheadTime: 0,
      isPlaying: false,
      selectedAssetId: null,
      selectedAssetIds: [],
      selectedClipId: null,
      selectedClipIds: [],
      isFullscreenPreview: false,
      isTimelineCollapsed: false,
      isLeftDrawerOpen: normalizedProject.assets.length > 0,
      isInspectorOpen: false,
      offlineAssetIds: [],
      isRelinkModalOpen: false,
      relinkTargetAssetId: null,
      view: 'editor',
      isSaving: false,
      lastSavedAt: project.updatedAt,
      errorMessage: null,
    });
    // Verificación asíncrona no bloqueante de medios al abrir (auto-abre RelinkModal si hay archivos faltantes)
    void get().checkProjectMediaStatus(true);
  },

  closeProjectToHome: async () => {
    latestSaveRevision++;
    set({
      view: 'home',
      isPlaying: false,
      isFullscreenPreview: false,
      pastProjects: [],
      futureProjects: [],
      offlineAssetIds: [],
      isRelinkModalOpen: false,
      relinkTargetAssetId: null,
      isSaving: false,
    });
    await get().fetchProjects();
    await get().fetchSystemStatus();
  },

  deleteProject: async (id) => {
    // Defensa preventiva en frontend: no emitir solicitudes destructivas con IDs vacíos o inválidos
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id.trim())) {
      set({ errorMessage: 'Identificador de proyecto inválido para eliminación' });
      return;
    }

    const cleanId = id.trim();
    try {
      const res = await fetch(apiUrl(`/api/projects/${encodeURIComponent(cleanId)}`), {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'No se pudo eliminar el proyecto');
      }
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== cleanId),
        currentProject: state.currentProject?.id === cleanId ? null : state.currentProject,
      }));
      await get().fetchSystemStatus();
    } catch (err: any) {
      set({ errorMessage: err?.message || 'Error al eliminar el proyecto' });
    }
  },

  selectAsset: (assetId, mode = 'replace') => {
    if (!assetId) {
      set({
        selectedAssetId: null,
        selectedAssetIds: [],
      });
      return;
    }

    if (mode === 'toggle') {
      const current = get().selectedAssetIds;
      if (current.includes(assetId)) {
        const next = current.filter((id) => id !== assetId);
        set({
          selectedAssetIds: next,
          selectedAssetId: next.length > 0 ? next[next.length - 1] : null,
          selectedClipId: null,
          selectedClipIds: [],
          isInspectorOpen: false,
        });
      } else {
        const next = [...current, assetId];
        set({
          selectedAssetIds: next,
          selectedAssetId: assetId,
          selectedClipId: null,
          selectedClipIds: [],
          isInspectorOpen: false,
        });
      }
      return;
    }

    if (mode === 'add') {
      const current = get().selectedAssetIds;
      if (!current.includes(assetId)) {
        set({
          selectedAssetIds: [...current, assetId],
          selectedAssetId: assetId,
          selectedClipId: null,
          selectedClipIds: [],
          isInspectorOpen: false,
        });
      }
      return;
    }

    // Default 'replace' mode
    set({
      selectedAssetId: assetId,
      selectedAssetIds: [assetId],
      selectedClipId: null,
      selectedClipIds: [],
      isInspectorOpen: false,
    });
  },

  setSelectedAssetIds: (ids, primaryId) => {
    if (ids.length === 0) {
      set({
        selectedAssetIds: [],
        selectedAssetId: null,
      });
      return;
    }

    const effectivePrimary =
      primaryId && ids.includes(primaryId)
        ? primaryId
        : ids[ids.length - 1];

    set({
      selectedAssetIds: ids,
      selectedAssetId: effectivePrimary,
      selectedClipId: null,
      selectedClipIds: [],
      isInspectorOpen: false,
    });
  },

  selectAllAssets: (tab = 'all') => {
    const proj = get().currentProject;
    if (!proj || proj.assets.length === 0) return;
    const filtered = proj.assets.filter((a) => {
      if (tab === 'audio') return a.type === 'audio';
      if (tab === 'media') return a.type !== 'audio';
      return true;
    });
    const ids = filtered.map((a) => a.id);
    set({
      selectedAssetIds: ids,
      selectedAssetId: ids[0] || null,
      selectedClipId: null,
      selectedClipIds: [],
      isInspectorOpen: false,
    });
  },

  clearAssetSelection: () => {
    set({
      selectedAssetId: null,
      selectedAssetIds: [],
    });
  },

  selectClip: (clipId, mode = 'replace') => {
    if (!clipId) {
      set({
        selectedClipId: null,
        selectedClipIds: [],
        isInspectorOpen: false,
      });
      return;
    }

    if (mode === 'toggle') {
      const current = get().selectedClipIds;
      if (current.includes(clipId)) {
        const next = current.filter((id) => id !== clipId);
        set({
          selectedClipIds: next,
          selectedClipId: next.length > 0 ? next[next.length - 1] : null,
          isInspectorOpen: next.length > 0,
        });
      } else {
        const next = [...current, clipId];
        set({
          selectedClipIds: next,
          selectedClipId: clipId,
          selectedAssetId: null,
          selectedAssetIds: [],
          isInspectorOpen: true,
        });
      }
      return;
    }

    if (mode === 'add') {
      const current = get().selectedClipIds;
      if (!current.includes(clipId)) {
        const next = [...current, clipId];
        set({
          selectedClipIds: next,
          selectedClipId: clipId,
          selectedAssetId: null,
          selectedAssetIds: [],
          isInspectorOpen: true,
        });
      }
      return;
    }

    // Default 'replace' mode
    set({
      selectedClipId: clipId,
      selectedClipIds: [clipId],
      selectedAssetId: null,
      selectedAssetIds: [],
      isInspectorOpen: true,
    });
  },

  setSelectedClipIds: (ids, primaryId) => {
    if (ids.length === 0) {
      set({
        selectedClipIds: [],
        selectedClipId: null,
        isInspectorOpen: false,
      });
      return;
    }

    const effectivePrimary =
      primaryId && ids.includes(primaryId)
        ? primaryId
        : ids[ids.length - 1];

    set({
      selectedClipIds: ids,
      selectedClipId: effectivePrimary,
      selectedAssetId: null,
      selectedAssetIds: [],
      isInspectorOpen: true,
    });
  },

  selectAllClips: () => {
    const current = get().currentProject;
    if (!current || current.clips.length === 0) return;
    const allIds = current.clips.map((c) => c.id);
    set({
      selectedClipIds: allIds,
      selectedClipId: allIds[0] || null,
      selectedAssetId: null,
      selectedAssetIds: [],
      isInspectorOpen: true,
    });
  },

  clearClipSelection: () => {
    set({
      selectedClipIds: [],
      selectedClipId: null,
      isInspectorOpen: false,
    });
  },

  setPlayheadTime: (time) => {
    set({ playheadTime: Math.max(0, Number(time.toFixed(3))) });
  },

  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  togglePlay: () => {
    const { currentProject, isPlaying } = get();
    if (!currentProject || currentProject.clips.length === 0) return;
    set({ isPlaying: !isPlaying });
  },

  setTimelineZoom: (zoom) => {
    set({ timelineZoom: Math.max(20, Math.min(220, Math.round(zoom))) });
  },

  setIsFullscreenPreview: (val) => {
    set({ isFullscreenPreview: val });
  },

  toggleTimelineCollapsed: () => {
    set((state) => ({ isTimelineCollapsed: !state.isTimelineCollapsed }));
  },

  setIsLeftDrawerOpen: (val) => {
    set({ isLeftDrawerOpen: val });
  },

  toggleLeftDrawer: () => {
    set((state) => ({ isLeftDrawerOpen: !state.isLeftDrawerOpen }));
  },

  setIsInspectorOpen: (val) => {
    set({ isInspectorOpen: val });
  },

  setIsFileBrowserOpen: (val) => {
    set({ isFileBrowserOpen: val });
  },

  openRelinkModal: (assetId = null) => {
    set({ isRelinkModalOpen: true, relinkTargetAssetId: assetId ?? null });
  },

  closeRelinkModal: () => {
    set({ isRelinkModalOpen: false, relinkTargetAssetId: null });
  },

  toggleMainTrackMagnetic: async () => {
    const nextVal = !get().isMainTrackMagnetic;
    set({ isMainTrackMagnetic: nextVal });
    if (nextVal && get().currentProject) {
      await get().commitProjectUpdate((proj) => ({
        ...proj,
        clips: packMainTrackClips(proj.tracks, proj.clips, true),
      }));
    }
  },

  pushUndoSnapshot: () => {
    const current = get().currentProject;
    if (!current) return;
    const snapshot = cloneProject(current);
    const nextPast = [...get().pastProjects, snapshot].slice(-MAX_HISTORY_STEPS);
    set({ pastProjects: nextPast, futureProjects: [] });
  },

  persistCurrentProject: async () => {
    const current = get().currentProject;
    if (!current) return;
    const updated = { ...cloneProject(current), updatedAt: new Date().toISOString() };
    set({ currentProject: updated, isSaving: true });
    const { revision, promise } = enqueueProjectSave(updated);
    try {
      const saved = await promise;
      set((state) => {
        const isLatest = revision === latestSaveRevision;
        const isSameProject = state.currentProject?.id === saved.id;
        return {
          currentProject:
            isLatest && isSameProject && state.currentProject
              ? {
                  ...state.currentProject,
                  updatedAt: saved.updatedAt,
                  diskSizeBytes: saved.diskSizeBytes,
                }
              : state.currentProject,
          projects: [saved, ...state.projects.filter((p) => p.id !== saved.id)],
          isSaving: isLatest ? false : state.isSaving,
          lastSavedAt: isSameProject ? saved.updatedAt : state.lastSavedAt,
        };
      });
    } catch (err: any) {
      if (revision === latestSaveRevision) {
        set({ isSaving: false, errorMessage: err?.message || 'Error autoguardando proyecto' });
      }
    }
  },

  commitProjectUpdate: async (updater) => {
    const current = get().currentProject;
    if (!current) return null;

    const snapshot = cloneProject(current);
    const updatedDraft = updater(cloneProject(current));
    updatedDraft.updatedAt = new Date().toISOString();

    const nextPast = [...get().pastProjects, snapshot].slice(-MAX_HISTORY_STEPS);

    set({
      currentProject: updatedDraft,
      pastProjects: nextPast,
      futureProjects: [],
      isSaving: true,
    });

    const { revision, promise } = enqueueProjectSave(updatedDraft);

    try {
      const saved = await promise;
      set((state) => {
        const isLatest = revision === latestSaveRevision;
        const isSameProject = state.currentProject?.id === saved.id;
        return {
          currentProject:
            isLatest && isSameProject && state.currentProject
              ? {
                  ...state.currentProject,
                  updatedAt: saved.updatedAt,
                  diskSizeBytes: saved.diskSizeBytes,
                }
              : state.currentProject,
          projects: [saved, ...state.projects.filter((p) => p.id !== saved.id)],
          isSaving: isLatest ? false : state.isSaving,
          lastSavedAt: isSameProject ? saved.updatedAt : state.lastSavedAt,
        };
      });
      return saved;
    } catch (err: any) {
      if (revision === latestSaveRevision) {
        set({ isSaving: false, errorMessage: err?.message || 'Error en autoguardado' });
      }
      return updatedDraft;
    }
  },

  undo: async () => {
    const { currentProject, pastProjects, futureProjects } = get();
    if (!currentProject || pastProjects.length === 0) return;

    const previous = pastProjects[pastProjects.length - 1];
    const remainingPast = pastProjects.slice(0, -1);
    const nextFuture = [cloneProject(currentProject), ...futureProjects].slice(0, MAX_HISTORY_STEPS);

    set({
      currentProject: previous,
      pastProjects: remainingPast,
      futureProjects: nextFuture,
      isSaving: true,
    });

    const { revision, promise } = enqueueProjectSave(previous);

    try {
      const saved = await promise;
      set((state) => {
        const isLatest = revision === latestSaveRevision;
        const isSameProject = state.currentProject?.id === saved.id;
        return {
          currentProject:
            isLatest && isSameProject && state.currentProject
              ? {
                  ...state.currentProject,
                  updatedAt: saved.updatedAt,
                  diskSizeBytes: saved.diskSizeBytes,
                }
              : state.currentProject,
          projects: [saved, ...state.projects.filter((p) => p.id !== saved.id)],
          isSaving: isLatest ? false : state.isSaving,
          lastSavedAt: isSameProject ? saved.updatedAt : state.lastSavedAt,
        };
      });
    } catch (err: any) {
      if (revision === latestSaveRevision) {
        set({ isSaving: false, errorMessage: err?.message || 'Error al deshacer (Undo)' });
      }
    }
  },

  redo: async () => {
    const { currentProject, pastProjects, futureProjects } = get();
    if (!currentProject || futureProjects.length === 0) return;

    const next = futureProjects[0];
    const remainingFuture = futureProjects.slice(1);
    const nextPast = [...pastProjects, cloneProject(currentProject)].slice(-MAX_HISTORY_STEPS);

    set({
      currentProject: next,
      pastProjects: nextPast,
      futureProjects: remainingFuture,
      isSaving: true,
    });

    const { revision, promise } = enqueueProjectSave(next);

    try {
      const saved = await promise;
      set((state) => {
        const isLatest = revision === latestSaveRevision;
        const isSameProject = state.currentProject?.id === saved.id;
        return {
          currentProject:
            isLatest && isSameProject && state.currentProject
              ? {
                  ...state.currentProject,
                  updatedAt: saved.updatedAt,
                  diskSizeBytes: saved.diskSizeBytes,
                }
              : state.currentProject,
          projects: [saved, ...state.projects.filter((p) => p.id !== saved.id)],
          isSaving: isLatest ? false : state.isSaving,
          lastSavedAt: isSameProject ? saved.updatedAt : state.lastSavedAt,
        };
      });
    } catch (err: any) {
      if (revision === latestSaveRevision) {
        set({ isSaving: false, errorMessage: err?.message || 'Error al rehacer (Redo)' });
      }
    }
  },

  updateProjectMeta: async (patch) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      ...patch,
    }));
  },

  setInPointAtPlayhead: async (customTime) => {
    const time = typeof customTime === 'number' ? customTime : get().playheadTime;
    const clamped = Math.max(0, Number(time.toFixed(2)));
    await get().commitProjectUpdate((proj) => {
      const nextOut =
        typeof proj.outPoint === 'number' && proj.outPoint <= clamped + 0.1
          ? null
          : proj.outPoint ?? null;
      return {
        ...proj,
        inPoint: clamped,
        outPoint: nextOut,
      };
    });
  },

  setOutPointAtPlayhead: async (customTime) => {
    const time = typeof customTime === 'number' ? customTime : get().playheadTime;
    const clamped = Math.max(0.1, Number(time.toFixed(2)));
    await get().commitProjectUpdate((proj) => {
      const nextIn =
        typeof proj.inPoint === 'number' && proj.inPoint >= clamped - 0.1
          ? 0
          : proj.inPoint ?? null;
      return {
        ...proj,
        inPoint: nextIn,
        outPoint: clamped,
      };
    });
  },

  clearInOutPoints: async () => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      inPoint: null,
      outPoint: null,
    }));
  },

  updateInOutLive: (patch) => {
    const current = get().currentProject;
    if (!current) return;
    set({
      currentProject: {
        ...current,
        ...patch,
      },
    });
  },

  probeLocalFiles: async (filePaths) => {
    const current = get().currentProject;
    if (!current || filePaths.length === 0) return [];
    set({ isLoading: true, errorMessage: null });

    try {
      const res = await fetch(apiUrl('/api/media/probe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: filePaths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error inspeccionando archivos con FFprobe');

      const rawList: any[] = data.assets || (data.asset ? [data.asset] : []);
      const newAssets: MediaAsset[] = rawList.map((item) => ({
        id: createId('asset'),
        ...item,
      }));

      await get().commitProjectUpdate((proj) => {
        const incomingPaths = new Set(newAssets.map((a) => a.path));
        return {
          ...proj,
          assets: [...newAssets, ...proj.assets.filter((a) => !incomingPaths.has(a.path))],
        };
      });

      if (newAssets[0]) {
        set({
          selectedAssetId: newAssets[0].id,
          selectedAssetIds: newAssets.map((a) => a.id),
          selectedClipId: null,
          selectedClipIds: [],
          isLeftDrawerOpen: true,
        });
      }
      set({ isLoading: false });
      await get().fetchSystemStatus();
      return newAssets;
    } catch (err: any) {
      set({ isLoading: false, errorMessage: err?.message || 'No se pudieron importar los archivos' });
      return [];
    }
  },

  importDroppedFiles: async (fileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) return [];
    set({ isLoading: true, errorMessage: null });

    try {
      const imported: MediaAsset[] = [];
      for (const file of files) {
        const anyFile = file as any;
        if (anyFile.path && typeof anyFile.path === 'string') {
          const probed = await get().probeLocalFiles([anyFile.path]);
          imported.push(...probed);
        } else {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || '');
              const commaIndex = result.indexOf(',');
              resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const res = await fetch(apiUrl('/api/media/import-buffer'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, base64Data }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `Error importando ${file.name}`);

          const newAsset: MediaAsset = {
            id: createId('asset'),
            ...data.asset,
          };
          imported.push(newAsset);
        }
      }

      if (imported.length > 0) {
        await get().commitProjectUpdate((proj) => {
          const incomingPaths = new Set(imported.map((a) => a.path));
          return {
            ...proj,
            assets: [...imported, ...proj.assets.filter((a) => !incomingPaths.has(a.path))],
          };
        });
        set({
          selectedAssetId: imported[0].id,
          selectedAssetIds: imported.map((a) => a.id),
          selectedClipId: null,
          selectedClipIds: [],
          isLeftDrawerOpen: true,
        });
      }

      set({ isLoading: false });
      await get().fetchSystemStatus();
      return imported;
    } catch (err: any) {
      set({ isLoading: false, errorMessage: err?.message || 'Error importando archivos arrastrados' });
      return [];
    }
  },

  removeAssetFromLibrary: async (assetId) => {
    const isMagnetic = get().isMainTrackMagnetic;
    const selectedIds = get().selectedAssetIds;

    let targetIds: string[];
    if (assetId) {
      if (selectedIds.includes(assetId) && selectedIds.length > 1) {
        targetIds = selectedIds;
      } else {
        targetIds = [assetId];
      }
    } else {
      targetIds = selectedIds.length > 0 ? selectedIds : (get().selectedAssetId ? [get().selectedAssetId!] : []);
    }

    if (targetIds.length === 0) return;
    const targetSet = new Set(targetIds);

    await get().commitProjectUpdate((proj) => {
      const remainingClips = proj.clips.filter((c) => !c.assetId || !targetSet.has(c.assetId));
      const remainingTracks = pruneEmptyTracks(proj.tracks, remainingClips);
      return {
        ...proj,
        assets: proj.assets.filter((a) => !targetSet.has(a.id)),
        clips: packMainTrackClips(remainingTracks, remainingClips, isMagnetic),
        tracks: remainingTracks,
      };
    });

    const currentSelected = get().selectedAssetIds.filter((id) => !targetSet.has(id));
    const currentPrimary =
      get().selectedAssetId && targetSet.has(get().selectedAssetId!)
        ? currentSelected[currentSelected.length - 1] || null
        : get().selectedAssetId;

    set({
      selectedAssetIds: currentSelected,
      selectedAssetId: currentPrimary,
    });
  },

  removeSelectedAssetsFromLibrary: async () => {
    await get().removeAssetFromLibrary();
  },

  updateAssetWaveform: (assetId, waveform) => {
    const proj = get().currentProject;
    if (!proj) return;
    set({
      currentProject: {
        ...proj,
        assets: proj.assets.map((a) => (a.id === assetId ? { ...a, waveform } : a)),
      },
    });
  },

  checkProjectMediaStatus: async (autoOpenModal = false) => {
    const current = get().currentProject;
    if (!current || !current.assets || current.assets.length === 0) {
      set({ offlineAssetIds: [] });
      return [];
    }

    try {
      const payload = {
        assets: current.assets.map((a) => ({ id: a.id, path: a.path })),
      };
      const res = await fetch(apiUrl('/api/media/check-status'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return get().offlineAssetIds;
      }

      const data = await res.json();
      const statusMap = data.status || {};
      const missingIds = current.assets
        .filter((a) => statusMap[a.id]?.exists === false)
        .map((a) => a.id);

      set({ offlineAssetIds: missingIds });

      if (autoOpenModal && missingIds.length > 0) {
        set({ isRelinkModalOpen: true, relinkTargetAssetId: null });
      }

      return missingIds;
    } catch {
      return get().offlineAssetIds;
    }
  },

  relinkAsset: async (assetId: string, newFilePath: string, autoScanSiblings = true) => {
    const current = get().currentProject;
    if (!current) return { autoRelinkedCount: 0 };

    const targetAsset = current.assets.find((a) => a.id === assetId);
    if (!targetAsset) return { autoRelinkedCount: 0 };

    set({ isLoading: true, errorMessage: null });

    try {
      // 1. Re-inspección y re-vinculación del archivo principal
      const res = await fetch(apiUrl('/api/media/relink'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, newPath: newFilePath }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo re-vincular el archivo seleccionado');
      }

      const updatedAsset: MediaAsset = {
        ...targetAsset,
        ...data.asset,
        id: assetId, // Preserva estrictamente el mismo ID del asset para no afectar ningún clip
      };

      const relinkedMap = new Map<string, MediaAsset>();
      relinkedMap.set(assetId, updatedAsset);

      // 2. Búsqueda automática en cascada de hermanos en la misma carpeta
      const targetDir = newFilePath.substring(0, newFilePath.lastIndexOf('/'));
      const otherOffline = current.assets.filter(
        (a) => a.id !== assetId && get().offlineAssetIds.includes(a.id)
      );

      if (autoScanSiblings && otherOffline.length > 0 && targetDir) {
        const candidateAssets = otherOffline.map((a) => ({
          id: a.id,
          name: a.name,
          path: `${targetDir}/${a.name}`,
        }));

        try {
          const checkRes = await fetch(apiUrl('/api/media/check-status'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assets: candidateAssets.map((c) => ({ id: c.id, path: c.path })),
            }),
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const existingSiblings = candidateAssets.filter(
              (c) => checkData.status?.[c.id]?.exists === true
            );

            // Re-vincular cada hermano encontrado en paralelo
            await Promise.all(
              existingSiblings.map(async (sibling) => {
                try {
                  const sRes = await fetch(apiUrl('/api/media/relink'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assetId: sibling.id, newPath: sibling.path }),
                  });
                  if (sRes.ok) {
                    const sData = await sRes.json();
                    const origAsset = current.assets.find((a) => a.id === sibling.id);
                    if (origAsset) {
                      relinkedMap.set(sibling.id, {
                        ...origAsset,
                        ...sData.asset,
                        id: sibling.id,
                      });
                    }
                  }
                } catch {
                  // Fallback silencioso en caso de fallo individual
                }
              })
            );
          }
        } catch {
          // Fallback silencioso en auto-escaneo de hermanos
        }
      }

      // 3. Aplicar mutación atómica a los assets del proyecto
      await get().commitProjectUpdate((proj) => {
        const nextAssets = proj.assets.map((a) => relinkedMap.get(a.id) || a);
        return {
          ...proj,
          assets: nextAssets,
        };
      });

      // 4. Actualizar estado reactivo de offlineAssetIds
      const resolvedIds = new Set(relinkedMap.keys());
      const remainingOffline = get().offlineAssetIds.filter((id) => !resolvedIds.has(id));

      set({
        offlineAssetIds: remainingOffline,
        isRelinkModalOpen: remainingOffline.length > 0 ? get().isRelinkModalOpen : false,
        relinkTargetAssetId: null,
        isLoading: false,
      });

      await get().persistCurrentProject();

      return { autoRelinkedCount: relinkedMap.size - 1 };
    } catch (err: any) {
      set({ isLoading: false, errorMessage: err?.message || 'Error al re-vincular archivo' });
      throw err;
    }
  },

  addTrack: async (type) => {
    let created: Track | null = null;
    await get().commitProjectUpdate((proj) => {
      const countOfType = proj.tracks.filter((t) => t.type === type).length + 1;
      const label = type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : 'Texto';
      created = {
        id: createId(`track_${type}`),
        name: `Pista ${label} ${countOfType}`,
        type,
        muted: false,
        locked: false,
        hidden: false,
      };
      const tracks = sortTracksByPriority([...proj.tracks, created]);
      return { ...proj, tracks };
    });
    return created;
  },

  toggleTrackFlag: async (trackId, flag) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      tracks: proj.tracks.map((t) => (t.id === trackId ? { ...t, [flag]: !t[flag] } : t)),
    }));
  },

  removeTrack: async (trackId) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      tracks: proj.tracks.filter((t) => t.id !== trackId),
      clips: proj.clips.filter((c) => c.trackId !== trackId),
    }));
  },

  addAssetToTimeline: async (assetId, options) => {
    const selectedAssetIds = get().selectedAssetIds;
    if (selectedAssetIds.includes(assetId) && selectedAssetIds.length > 1) {
      await get().addAssetsToTimeline(selectedAssetIds, options);
      return;
    }

    const current = get().currentProject;
    if (!current) return;
    const asset = current.assets.find((a) => a.id === assetId);
    if (!asset) return;

    const isMagnetic = get().isMainTrackMagnetic;
    let createdMainClipId: string | null = null;

    await get().commitProjectUpdate((proj) => {
      let tracks: Track[] = [...proj.tracks];
      const desiredTrackType: TrackType = asset.type === 'image' ? 'video' : asset.type;
      const duration = asset.duration || 4;

      // Tiempo de inicio: si se pasa explícitamente se respeta; sino el cabezal actual
      let startTime =
        typeof options?.startTime === 'number'
          ? Math.max(0, Number(options.startTime.toFixed(2)))
          : Number(get().playheadTime.toFixed(2));

      // Si el proyecto no tiene clips y no se indicó tiempo, comenzar en 0
      if (proj.clips.length === 0 && options?.startTime === undefined) {
        startTime = 0;
      }

      let targetTrack: Track;
      if (options?.createNewTrack || typeof options?.insertAtIndex === 'number') {
        targetTrack = buildNewTrack(tracks, desiredTrackType);
        if (typeof options?.insertAtIndex === 'number') {
          // Inserción en una posición exacta (entre dos pistas), respetando la zona del tipo
          const bounds = getTrackZoneBounds(tracks, desiredTrackType);
          const at = Math.max(bounds.lo, Math.min(bounds.hi, options.insertAtIndex));
          tracks.splice(at, 0, targetTrack);
        } else if (desiredTrackType === 'video') {
          const firstVideoIdx = tracks.findIndex((t) => t.type === 'video');
          if (firstVideoIdx !== -1) {
            tracks.splice(firstVideoIdx, 0, targetTrack);
          } else {
            tracks.push(targetTrack);
          }
        } else {
          tracks.push(targetTrack);
        }
        tracks = sortTracksByPriority(tracks);
      } else {
        const res = findOrCreateAvailableTrack(
          tracks,
          proj.clips,
          desiredTrackType,
          startTime,
          duration,
          options?.trackId
        );
        targetTrack = res.track;
        tracks = res.updatedTracks;
      }

      const linkGroupId = asset.type === 'video' && asset.hasAudio ? createId('link') : undefined;
      const newClips: TimelineClip[] = [];

      const mainClip: TimelineClip = {
        id: createId('clip'),
        assetId: asset.id,
        trackId: targetTrack.id,
        type: asset.type,
        name: asset.name,
        startTime,
        duration,
        sourceStart: 0,
        maxDuration: asset.type === 'image' ? undefined : asset.duration,
        linkGroupId,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        overlapTransition: 'crossfade',
      };
      createdMainClipId = mainClip.id;
      newClips.push(mainClip);

      // Si el video tiene audio, asignar pista de audio sin colisiones
      if (asset.type === 'video' && asset.hasAudio && linkGroupId) {
        const audioRes = findOrCreateAvailableTrack(
          tracks,
          proj.clips,
          'audio',
          startTime,
          duration
        );
        const audioTrack = audioRes.track;
        tracks = audioRes.updatedTracks;

        const linkedAudioClip: TimelineClip = {
          id: createId('clip_aud'),
          assetId: asset.id,
          trackId: audioTrack.id,
          type: 'audio',
          name: `${asset.name} (Audio)`,
          startTime,
          duration,
          sourceStart: 0,
          maxDuration: asset.duration,
          linkGroupId,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
          overlapTransition: 'crossfade',
        };
        newClips.push(linkedAudioClip);
      }

      const finalTracks = sortTracksByPriority(tracks);
      const combinedClips = [...proj.clips, ...newClips];

      return {
        ...proj,
        tracks: finalTracks,
        clips: packMainTrackClips(finalTracks, combinedClips, isMagnetic),
      };
    });

    if (createdMainClipId) {
      set({
        selectedClipId: createdMainClipId,
        selectedClipIds: [createdMainClipId],
        selectedAssetId: null,
        selectedAssetIds: [],
        isInspectorOpen: true,
      });
    }
  },

  addAssetsToTimeline: async (assetIds, options) => {
    const current = get().currentProject;
    if (!current || assetIds.length === 0) return;

    const assetsToInsert = assetIds
      .map((id) => current.assets.find((a) => a.id === id))
      .filter((a): a is MediaAsset => Boolean(a));

    if (assetsToInsert.length === 0) return;

    if (assetsToInsert.length === 1) {
      await get().addAssetToTimeline(assetsToInsert[0].id, options);
      return;
    }

    const isMagnetic = get().isMainTrackMagnetic;
    const createdMainClipIds: string[] = [];

    await get().commitProjectUpdate((proj) => {
      let tracks: Track[] = [...proj.tracks];
      let currentClips: TimelineClip[] = [...proj.clips];

      let baseStartTime =
        typeof options?.startTime === 'number'
          ? Math.max(0, Number(options.startTime.toFixed(2)))
          : Number(get().playheadTime.toFixed(2));

      if (proj.clips.length === 0 && options?.startTime === undefined) {
        baseStartTime = 0;
      }

      let currentTime = baseStartTime;
      let sharedNewTrack: Track | null = null;

      if (options?.createNewTrack || typeof options?.insertAtIndex === 'number') {
        const firstDesiredType: TrackType =
          assetsToInsert[0].type === 'image' ? 'video' : assetsToInsert[0].type;
        sharedNewTrack = buildNewTrack(tracks, firstDesiredType);
        if (typeof options?.insertAtIndex === 'number') {
          const bounds = getTrackZoneBounds(tracks, firstDesiredType);
          const at = Math.max(bounds.lo, Math.min(bounds.hi, options.insertAtIndex));
          tracks.splice(at, 0, sharedNewTrack);
        } else if (firstDesiredType === 'video') {
          const firstVideoIdx = tracks.findIndex((t) => t.type === 'video');
          if (firstVideoIdx !== -1) {
            tracks.splice(firstVideoIdx, 0, sharedNewTrack);
          } else {
            tracks.push(sharedNewTrack);
          }
        } else {
          tracks.push(sharedNewTrack);
        }
        tracks = sortTracksByPriority(tracks);
      }

      for (const asset of assetsToInsert) {
        const desiredTrackType: TrackType = asset.type === 'image' ? 'video' : asset.type;
        const duration = asset.duration || 4;
        let targetTrack: Track;

        if (
          sharedNewTrack &&
          (sharedNewTrack.type === desiredTrackType ||
            (sharedNewTrack.type === 'video' && asset.type === 'image'))
        ) {
          targetTrack = sharedNewTrack;
        } else {
          const res = findOrCreateAvailableTrack(
            tracks,
            currentClips,
            desiredTrackType,
            currentTime,
            duration,
            options?.trackId
          );
          targetTrack = res.track;
          tracks = res.updatedTracks;
        }

        const linkGroupId =
          asset.type === 'video' && asset.hasAudio ? createId('link') : undefined;

        const mainClip: TimelineClip = {
          id: createId('clip'),
          assetId: asset.id,
          trackId: targetTrack.id,
          type: asset.type,
          name: asset.name,
          startTime: currentTime,
          duration,
          sourceStart: 0,
          maxDuration: asset.type === 'image' ? undefined : asset.duration,
          linkGroupId,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
          overlapTransition: 'crossfade',
        };
        createdMainClipIds.push(mainClip.id);
        currentClips.push(mainClip);

        if (asset.type === 'video' && asset.hasAudio && linkGroupId) {
          const audioRes = findOrCreateAvailableTrack(
            tracks,
            currentClips,
            'audio',
            currentTime,
            duration
          );
          const audioTrack = audioRes.track;
          tracks = audioRes.updatedTracks;

          const linkedAudioClip: TimelineClip = {
            id: createId('clip_aud'),
            assetId: asset.id,
            trackId: audioTrack.id,
            type: 'audio',
            name: `${asset.name} (Audio)`,
            startTime: currentTime,
            duration,
            sourceStart: 0,
            maxDuration: asset.duration,
            linkGroupId,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
            volume: 1,
            muted: false,
            fadeIn: 0,
            fadeOut: 0,
            overlapTransition: 'crossfade',
          };
          currentClips.push(linkedAudioClip);
        }

        currentTime = Number((currentTime + duration).toFixed(2));
      }

      const finalTracks = sortTracksByPriority(tracks);
      return {
        ...proj,
        tracks: finalTracks,
        clips: packMainTrackClips(finalTracks, currentClips, isMagnetic),
      };
    });

    if (createdMainClipIds.length > 0) {
      set({
        selectedClipId: createdMainClipIds[0],
        selectedClipIds: createdMainClipIds,
        selectedAssetId: null,
        selectedAssetIds: [],
        isInspectorOpen: true,
      });
    }
  },

  addTextTemplateToProject: async (templateName, config, customStartTime, initialTransform) => {
    let createdClip: TimelineClip | null = null;
    await get().commitProjectUpdate((proj) => {
      let tracks = [...proj.tracks];
      const duration = 4;
      const startTime =
        typeof customStartTime === 'number'
          ? Math.max(0, Number(customStartTime.toFixed(2)))
          : Number(get().playheadTime.toFixed(2));

      // Asignación inteligente sin colisión para texto:
      // Si la pista actual está ocupada en [startTime, startTime + duration],
      // busca otra pista de texto libre o crea automáticamente una nueva pista arriba.
      const res = findOrCreateAvailableTrack(
        tracks,
        proj.clips,
        'text',
        startTime,
        duration
      );
      const textTrack = res.track;
      tracks = res.updatedTracks;

      createdClip = {
        id: createId('clip_txt'),
        trackId: textTrack.id,
        type: 'text',
        name: templateName,
        startTime,
        duration,
        sourceStart: 0,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false, ...initialTransform },
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        overlapTransition: 'crossfade',
        textConfig: { ...config },
      };

      const finalTracks = sortTracksByPriority(tracks);
      return {
        ...proj,
        tracks: finalTracks,
        clips: [...proj.clips, createdClip],
      };
    });

    if (createdClip) {
      set({
        selectedClipId: (createdClip as TimelineClip).id,
        selectedClipIds: [(createdClip as TimelineClip).id],
        selectedAssetId: null,
        selectedAssetIds: [],
        isInspectorOpen: true,
      });
    }
    return createdClip;
  },

  moveClipLive: (clipId, newStartTime, targetTrackId) => {
    const current = get().currentProject;
    if (!current) return;
    const targetClip = current.clips.find((c) => c.id === clipId);
    if (!targetClip) return;

    const currentTrack = current.tracks.find((t) => t.id === targetClip.trackId);
    if (currentTrack?.locked) return;

    const clampedStart = Math.max(0, Number(newStartTime.toFixed(2)));
    const delta = clampedStart - targetClip.startTime;
    const groupId = targetClip.linkGroupId;

    const updatedClips = current.clips.map((c) => {
      if (c.id === clipId) {
        let nextTrackId = c.trackId;
        if (targetTrackId) {
          const destTrack = current.tracks.find((t) => t.id === targetTrackId);
          const expectedTrackType: TrackType =
            c.type === 'image' ? 'video' : c.type === 'text' ? 'text' : c.type;
          if (destTrack && destTrack.type === expectedTrackType && !destTrack.locked) {
            nextTrackId = destTrack.id;
          }
        }
        return {
          ...c,
          trackId: nextTrackId,
          startTime: clampedStart,
        };
      }
      if (groupId && c.linkGroupId === groupId) {
        return {
          ...c,
          startTime: Math.max(0, Number((c.startTime + delta).toFixed(2))),
        };
      }
      return c;
    });

    const finalClips = packMainTrackClips(
      current.tracks,
      updatedClips,
      get().isMainTrackMagnetic
    );

    set({
      currentProject: {
        ...current,
        clips: finalClips,
      },
    });
  },

  moveSelectedClipsLive: (
    initialStarts,
    deltaSeconds,
    primaryClipId,
    targetTrackIdForPrimary
  ) => {
    const current = get().currentProject;
    if (!current) return;

    const startValues = Object.values(initialStarts);
    const minStart = startValues.length > 0 ? Math.min(...startValues) : 0;
    const safeDelta = Number(Math.max(-minStart, deltaSeconds).toFixed(2));

    const updatedClips = current.clips.map((c) => {
      const baseStart = initialStarts[c.id];
      if (baseStart === undefined) return c;

      let nextTrackId = c.trackId;
      if (primaryClipId && c.id === primaryClipId && targetTrackIdForPrimary) {
        const destTrack = current.tracks.find((t) => t.id === targetTrackIdForPrimary);
        const expectedTrackType: TrackType =
          c.type === 'image' ? 'video' : c.type === 'text' ? 'text' : c.type;
        if (destTrack && destTrack.type === expectedTrackType && !destTrack.locked) {
          nextTrackId = destTrack.id;
        }
      }

      return {
        ...c,
        trackId: nextTrackId,
        startTime: Math.max(0, Number((baseStart + safeDelta).toFixed(2))),
      };
    });

    const finalClips = packMainTrackClips(
      current.tracks,
      updatedClips,
      get().isMainTrackMagnetic
    );

    set({
      currentProject: {
        ...current,
        clips: finalClips,
      },
    });
  },

  moveClipToNewTrack: (clipId, newStartTime, insertIndex) => {
    const current = get().currentProject;
    if (!current) return;
    const targetClip = current.clips.find((c) => c.id === clipId);
    if (!targetClip) return;

    const currentTrack = current.tracks.find((t) => t.id === targetClip.trackId);
    if (currentTrack?.locked) return;

    const trackType: TrackType =
      targetClip.type === 'image' ? 'video' : targetClip.type === 'text' ? 'text' : targetClip.type;

    const newTrack = buildNewTrack(current.tracks, trackType);
    const bounds = getTrackZoneBounds(current.tracks, trackType);
    const at = Math.max(bounds.lo, Math.min(bounds.hi, insertIndex));
    const withNew = [...current.tracks];
    withNew.splice(at, 0, newTrack);
    const sortedTracks = sortTracksByPriority(withNew);

    const clampedStart = Math.max(0, Number(newStartTime.toFixed(2)));
    const delta = clampedStart - targetClip.startTime;
    const groupId = targetClip.linkGroupId;

    const movedClips = current.clips.map((c) => {
      if (c.id === clipId) {
        return { ...c, trackId: newTrack.id, startTime: clampedStart };
      }
      if (groupId && c.linkGroupId === groupId) {
        return { ...c, startTime: Math.max(0, Number((c.startTime + delta).toFixed(2))) };
      }
      return c;
    });

    // La pista de origen puede haber quedado vacía: se elimina igual que al borrar clips
    const finalTracks = pruneEmptyTracks(sortedTracks, movedClips);
    const finalClips = packMainTrackClips(finalTracks, movedClips, get().isMainTrackMagnetic);

    set({
      currentProject: {
        ...current,
        tracks: finalTracks,
        clips: finalClips,
      },
    });
  },

  trimClipLive: (clipId, edge, deltaSeconds) => {
    const current = get().currentProject;
    if (!current) return;
    const targetClip = current.clips.find((c) => c.id === clipId);
    if (!targetClip) return;

    const currentTrack = current.tracks.find((t) => t.id === targetClip.trackId);
    if (currentTrack?.locked) return;

    const minDuration = 0.4;
    const groupId = targetClip.linkGroupId;
    const mainVideoTrack = getMainVideoTrack(current.tracks);
    const isOnMagneticMain =
      get().isMainTrackMagnetic &&
      mainVideoTrack &&
      (targetClip.trackId === mainVideoTrack.id ||
        (groupId &&
          current.clips.some(
            (c) => c.linkGroupId === groupId && c.trackId === mainVideoTrack.id
          )));

    const isStaticMedia = targetClip.type === 'image' || targetClip.type === 'text';
    const effectiveMaxDuration = isStaticMedia ? undefined : targetClip.maxDuration;

    let newStartTime = targetClip.startTime;
    let newDuration = targetClip.duration;
    let newSourceStart = targetClip.sourceStart;

    if (edge === 'left') {
      const maxLeftMove = targetClip.duration - minDuration;
      // Para medios con duración finita (video/audio), no se puede retroceder antes del inicio del archivo original (sourceStart = 0).
      // Para medios estáticos (imagen/texto), no existe sourceStart: se puede expandir hacia la izquierda
      // hasta llegar al inicio del timeline (startTime = 0), a menos que esté en pista magnética.
      const minLeftMove = effectiveMaxDuration
        ? -targetClip.sourceStart
        : isOnMagneticMain
        ? 0
        : -targetClip.startTime;

      const clampedDelta = Math.max(
        isOnMagneticMain ? minLeftMove : Math.max(-targetClip.startTime, minLeftMove),
        Math.min(maxLeftMove, deltaSeconds)
      );
      newStartTime = isOnMagneticMain
        ? targetClip.startTime
        : Number((targetClip.startTime + clampedDelta).toFixed(2));
      newDuration = Number((targetClip.duration - clampedDelta).toFixed(2));
      newSourceStart = isStaticMedia
        ? 0
        : Math.max(0, Number((targetClip.sourceStart + clampedDelta).toFixed(2)));
    } else {
      // Para medios estáticos o sin maxDuration, se permite alargar libremente hasta 86400s (24 horas)
      const maxAllowedDuration = effectiveMaxDuration
        ? Math.max(minDuration, effectiveMaxDuration - targetClip.sourceStart)
        : 86400;
      newDuration = Math.max(
        minDuration,
        Math.min(maxAllowedDuration, Number((targetClip.duration + deltaSeconds).toFixed(2)))
      );
    }

    const updatedClips = current.clips.map((c) => {
      if (c.id === clipId || (groupId && c.linkGroupId === groupId)) {
        return {
          ...c,
          startTime: newStartTime,
          duration: newDuration,
          sourceStart: newSourceStart,
        };
      }
      return c;
    });

    const finalClips = packMainTrackClips(
      current.tracks,
      updatedClips,
      get().isMainTrackMagnetic
    );

    set({
      currentProject: {
        ...current,
        clips: finalClips,
      },
    });
  },

  splitClipAtPlayhead: async (explicitClipId) => {
    const { currentProject, selectedClipId, playheadTime } = get();
    if (!currentProject) return;

    const targetId = explicitClipId || selectedClipId;
    let targetClip = currentProject.clips.find((c) => c.id === targetId);

    if (
      !targetClip ||
      playheadTime <= targetClip.startTime + 0.15 ||
      playheadTime >= targetClip.startTime + targetClip.duration - 0.15
    ) {
      targetClip = currentProject.clips.find(
        (c) => playheadTime > c.startTime + 0.15 && playheadTime < c.startTime + c.duration - 0.15
      );
    }

    if (!targetClip) {
      set({
        errorMessage:
          'Coloca la aguja (Playhead) dentro de un clip para poder dividirlo con Dividir (Ctrl+B / S).',
      });
      return;
    }

    const splitOffset = Number((playheadTime - targetClip.startTime).toFixed(2));
    if (splitOffset <= 0.15 || splitOffset >= targetClip.duration - 0.15) return;

    const oldGroupId = targetClip.linkGroupId;
    const newRightGroupId = oldGroupId ? createId('link') : undefined;
    let newlySelectedId: string | null = null;

    await get().commitProjectUpdate((proj) => {
      const nextClips: TimelineClip[] = [];

      for (const clip of proj.clips) {
        const shouldSplit =
          clip.id === targetClip!.id || (oldGroupId && clip.linkGroupId === oldGroupId);

        if (!shouldSplit) {
          nextClips.push(clip);
          continue;
        }

        const localOffset = Number((playheadTime - clip.startTime).toFixed(2));
        if (localOffset <= 0.1 || localOffset >= clip.duration - 0.1) {
          nextClips.push(clip);
          continue;
        }

        const leftClip: TimelineClip = {
          ...clip,
          duration: localOffset,
          fadeOut: 0,
        };

        const rightClip: TimelineClip = {
          ...clip,
          id: createId(clip.type === 'audio' ? 'clip_aud' : 'clip'),
          startTime: Number(playheadTime.toFixed(2)),
          duration: Number((clip.duration - localOffset).toFixed(2)),
          sourceStart:
            clip.type === 'image' || clip.type === 'text'
              ? 0
              : Number((clip.sourceStart + localOffset).toFixed(2)),
          linkGroupId: newRightGroupId,
          fadeIn: 0,
        };

        if (clip.id === targetClip!.id) {
          newlySelectedId = rightClip.id;
        }

        nextClips.push(leftClip, rightClip);
      }

      return {
        ...proj,
        clips: nextClips,
      };
    });

    if (newlySelectedId) {
      set({ selectedClipId: newlySelectedId, isInspectorOpen: true });
    }
  },

  duplicateClip: async (explicitClipId) => {
    const { currentProject, selectedClipIds, selectedClipId, isMainTrackMagnetic } = get();
    if (!currentProject) return;

    const targetIds = new Set<string>();
    if (explicitClipId) {
      targetIds.add(explicitClipId);
    } else if (selectedClipIds.length > 0) {
      selectedClipIds.forEach((id) => targetIds.add(id));
    } else if (selectedClipId) {
      targetIds.add(selectedClipId);
    }
    if (targetIds.size === 0) return;

    // Include linked group peers
    const linkGroups = new Set<string>();
    currentProject.clips.forEach((c) => {
      if (targetIds.has(c.id) && c.linkGroupId) {
        linkGroups.add(c.linkGroupId);
      }
    });

    const sourceClips = currentProject.clips.filter(
      (c) => targetIds.has(c.id) || (c.linkGroupId && linkGroups.has(c.linkGroupId))
    );
    if (sourceClips.length === 0) return;

    const maxEnd = Math.max(...sourceClips.map((c) => c.startTime + c.duration));
    const minStart = Math.min(...sourceClips.map((c) => c.startTime));
    const span = Math.max(0.1, maxEnd - minStart);
    const createdIds: string[] = [];
    let firstDuplicatedId: string | null = null;

    // Map old linkGroupId to new linkGroupId
    const groupMap = new Map<string, string>();
    sourceClips.forEach((c) => {
      if (c.linkGroupId && !groupMap.has(c.linkGroupId)) {
        groupMap.set(c.linkGroupId, createId('link'));
      }
    });

    await get().commitProjectUpdate((proj) => {
      const clones: TimelineClip[] = sourceClips.map((c) => {
        const newId = createId(c.type === 'audio' ? 'clip_aud' : 'clip');
        createdIds.push(newId);
        if (!firstDuplicatedId) firstDuplicatedId = newId;
        const newLinkGroupId = c.linkGroupId ? groupMap.get(c.linkGroupId) : undefined;
        return {
          ...JSON.parse(JSON.stringify(c)),
          id: newId,
          startTime: Number((c.startTime + span).toFixed(2)),
          linkGroupId: newLinkGroupId,
        };
      });

      const combined = [...proj.clips, ...clones];
      return {
        ...proj,
        clips: packMainTrackClips(proj.tracks, combined, isMainTrackMagnetic),
      };
    });

    if (createdIds.length > 0) {
      set({
        selectedClipIds: createdIds,
        selectedClipId: firstDuplicatedId,
        selectedAssetId: null,
        selectedAssetIds: [],
        isInspectorOpen: true,
      });
    }
  },

  rotateClip90: async (explicitClipId) => {
    const { currentProject, selectedClipId } = get();
    const targetId = explicitClipId || selectedClipId;
    if (!currentProject || !targetId) return;

    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((c) =>
        c.id === targetId
          ? {
              ...c,
              transform: {
                ...c.transform,
                rotation: ((c.transform.rotation || 0) + 90) % 360,
              },
            }
          : c
      ),
    }));
  },

  flipClipHorizontal: async (explicitClipId) => {
    const { currentProject, selectedClipId } = get();
    const targetId = explicitClipId || selectedClipId;
    if (!currentProject || !targetId) return;

    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((c) =>
        c.id === targetId
          ? {
              ...c,
              transform: {
                ...c.transform,
                flipX: !c.transform.flipX,
              },
            }
          : c
      ),
    }));
  },

  copySelectedClip: (explicitClipId) => {
    const { currentProject, selectedClipIds, selectedClipId } = get();
    if (!currentProject) return;

    const targetIds = new Set<string>();
    if (explicitClipId) {
      targetIds.add(explicitClipId);
    } else if (selectedClipIds.length > 0) {
      selectedClipIds.forEach((id) => targetIds.add(id));
    } else if (selectedClipId) {
      targetIds.add(selectedClipId);
    }
    if (targetIds.size === 0) return;

    const linkGroups = new Set<string>();
    currentProject.clips.forEach((c) => {
      if (targetIds.has(c.id) && c.linkGroupId) {
        linkGroups.add(c.linkGroupId);
      }
    });

    const toCopy = currentProject.clips
      .filter((c) => targetIds.has(c.id) || (c.linkGroupId && linkGroups.has(c.linkGroupId)))
      .map((c) => JSON.parse(JSON.stringify(c)));

    set({ clipboardClips: toCopy });
  },

  cutSelectedClip: async (explicitClipId) => {
    const { selectedClipIds, selectedClipId } = get();
    const targetId = explicitClipId || selectedClipId;
    if (!targetId && selectedClipIds.length === 0) return;
    get().copySelectedClip(explicitClipId);
    await get().removeClip(explicitClipId);
  },

  pasteClipboardAtPlayhead: async () => {
    const { currentProject, clipboardClips, playheadTime, isMainTrackMagnetic } = get();
    if (!currentProject || clipboardClips.length === 0) return;

    const newGroupId = clipboardClips.length > 1 ? createId('link') : undefined;
    const pastedCreatedIds: string[] = [];

    await get().commitProjectUpdate((proj) => {
      const tracks = [...proj.tracks];
      const minStart = Math.min(...clipboardClips.map((c) => c.startTime));
      const pasted: TimelineClip[] = clipboardClips.map((c) => {
        const offset = c.startTime - minStart;
        const newId = createId('clip');
        pastedCreatedIds.push(newId);

        let destTrack = tracks.find((t) => t.id === c.trackId);
        if (!destTrack) {
          const desiredType: TrackType =
            c.type === 'image' ? 'video' : c.type === 'text' ? 'text' : c.type;
          destTrack = tracks.find((t) => t.type === desiredType);
          if (!destTrack) {
            destTrack = {
              id: createId(`track_${desiredType}`),
              name: `Pista ${desiredType === 'video' ? 'Video' : desiredType === 'audio' ? 'Audio' : 'Texto'} 1`,
              type: desiredType,
              muted: false,
              locked: false,
              hidden: false,
            };
            tracks.push(destTrack);
          }
        }

        return {
          ...JSON.parse(JSON.stringify(c)),
          id: newId,
          trackId: destTrack.id,
          startTime: Number((playheadTime + offset).toFixed(2)),
          linkGroupId: newGroupId,
        };
      });

      const finalTracks = sortTracksByPriority(tracks);
      const combined = [...proj.clips, ...pasted];
      return {
        ...proj,
        tracks: finalTracks,
        clips: packMainTrackClips(finalTracks, combined, isMainTrackMagnetic),
      };
    });

    if (pastedCreatedIds.length > 0) {
      set({
        selectedClipIds: pastedCreatedIds,
        selectedClipId: pastedCreatedIds[0],
        selectedAssetId: null,
        selectedAssetIds: [],
        isInspectorOpen: true,
      });
    }
  },

  toggleClipLinkGroup: async (explicitClipId) => {
    const { currentProject, selectedClipId } = get();
    const targetId = explicitClipId || selectedClipId;
    if (!currentProject || !targetId) return;

    const target = currentProject.clips.find((c) => c.id === targetId);
    if (!target) return;

    await get().commitProjectUpdate((proj) => {
      if (target.linkGroupId) {
        const groupToClear = target.linkGroupId;
        return {
          ...proj,
          clips: proj.clips.map((c) =>
            c.linkGroupId === groupToClear ? { ...c, linkGroupId: undefined } : c
          ),
        };
      } else {
        const counterpart = proj.clips.find(
          (c) =>
            c.id !== target.id &&
            !c.linkGroupId &&
            c.assetId &&
            c.assetId === target.assetId &&
            c.type !== target.type &&
            Math.abs(c.startTime - target.startTime) < 1.0
        );
        if (!counterpart) return proj;
        const newLink = createId('link');
        return {
          ...proj,
          clips: proj.clips.map((c) =>
            c.id === target.id || c.id === counterpart.id ? { ...c, linkGroupId: newLink } : c
          ),
        };
      }
    });
  },

  setClipOverlapTransition: async (clipId, transition) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((c) =>
        c.id === clipId ? { ...c, overlapTransition: transition } : c
      ),
    }));
  },

  updateClip: async (clipId, patch) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    }));
  },

  updateClipTransformLive: (clipId, transformPatch) => {
    const current = get().currentProject;
    if (!current) return;
    const playheadTime = get().playheadTime;

    set({
      currentProject: {
        ...current,
        clips: current.clips.map((c) => {
          if (c.id !== clipId) return c;

          const nextTransform = {
            ...c.transform,
            ...transformPatch,
          };

          // Auto-keyframing: si el clip ya tiene keyframes definidos para la propiedad transformada,
          // actualiza o inserta el keyframe en la posición temporal del cabezal
          if (c.keyframes && Object.keys(c.keyframes).length > 0) {
            const timeOffset = Math.max(
              0,
              Math.min(c.duration, Number((playheadTime - c.startTime).toFixed(3)))
            );
            const nextKeyframes = { ...c.keyframes };
            let hasKeyframeUpdate = false;

            const animProps: (keyof typeof transformPatch & AnimatableProperty)[] = [
              'x',
              'y',
              'scale',
              'rotation',
              'opacity',
            ];

            for (const prop of animProps) {
              if (
                transformPatch[prop] !== undefined &&
                nextKeyframes[prop] &&
                nextKeyframes[prop]!.length > 0
              ) {
                const val = Number((transformPatch[prop] as number).toFixed(3));
                const existing = nextKeyframes[prop]!;
                const newKf: Keyframe = {
                  id: createId('kf'),
                  timeOffset,
                  value: val,
                  interpolation: 'linear',
                };
                nextKeyframes[prop] = insertOrUpdateKeyframe(existing, newKf, 0.033);
                hasKeyframeUpdate = true;
              }
            }

            if (hasKeyframeUpdate) {
              return {
                ...c,
                transform: nextTransform,
                keyframes: nextKeyframes,
              };
            }
          }

          return {
            ...c,
            transform: nextTransform,
          };
        }),
      },
    });
  },

  resetClipTransform: async (clipId) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((c) =>
        c.id === clipId
          ? {
              ...c,
              transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
            }
          : c
      ),
    }));
  },

  updateClipTextConfig: async (clipId, textPatch) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((c) => {
        if (c.id !== clipId || !c.textConfig) return c;
        return {
          ...c,
          name: textPatch.content ? textPatch.content.slice(0, 28) : c.name,
          textConfig: {
            ...c.textConfig,
            ...textPatch,
          },
        };
      }),
    }));
  },

  setClipKeyframe: async (clipId, property, timeOffset, value, interpolation = 'linear') => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((clip) => {
        if (clip.id !== clipId) return clip;

        const clampedOffset = Math.max(0, Math.min(clip.duration, Number(timeOffset.toFixed(3))));
        const existingKeyframes = clip.keyframes?.[property] || [];

        const newKf: Keyframe = {
          id: createId('kf'),
          timeOffset: clampedOffset,
          value: Number(value.toFixed(3)),
          interpolation,
        };

        const updatedTrackKeyframes = insertOrUpdateKeyframe(existingKeyframes, newKf, 0.033);

        return {
          ...clip,
          keyframes: {
            ...(clip.keyframes || {}),
            [property]: updatedTrackKeyframes,
          },
        };
      }),
    }));
  },

  removeClipKeyframe: async (clipId, property, keyframeId) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((clip) => {
        if (clip.id !== clipId || !clip.keyframes?.[property]) return clip;

        const remaining = removeKeyframeById(clip.keyframes[property], keyframeId);
        const nextKeyframes = { ...clip.keyframes };

        if (remaining.length === 0) {
          delete nextKeyframes[property];
        } else {
          nextKeyframes[property] = remaining;
        }

        return {
          ...clip,
          keyframes: Object.keys(nextKeyframes).length > 0 ? nextKeyframes : undefined,
        };
      }),
    }));
  },

  clearClipKeyframes: async (clipId, property) => {
    await get().commitProjectUpdate((proj) => ({
      ...proj,
      clips: proj.clips.map((clip) => {
        if (clip.id !== clipId || !clip.keyframes) return clip;

        if (!property) {
          const { keyframes: _removed, ...rest } = clip;
          return rest as TimelineClip;
        }

        const nextKeyframes = { ...clip.keyframes };
        delete nextKeyframes[property];

        return {
          ...clip,
          keyframes: Object.keys(nextKeyframes).length > 0 ? nextKeyframes : undefined,
        };
      }),
    }));
  },

  removeSelectedClips: async () => {
    await get().removeClip();
  },

  removeClip: async (clipId) => {
    const isMagnetic = get().isMainTrackMagnetic;
    const { selectedClipIds, selectedClipId } = get();
    const idsToDelete = new Set<string>();

    if (clipId) {
      if (selectedClipIds.includes(clipId) && selectedClipIds.length > 1) {
        selectedClipIds.forEach((id) => idsToDelete.add(id));
      } else {
        idsToDelete.add(clipId);
      }
    } else if (selectedClipIds.length > 0) {
      selectedClipIds.forEach((id) => idsToDelete.add(id));
    } else if (selectedClipId) {
      idsToDelete.add(selectedClipId);
    }

    if (idsToDelete.size === 0) return;

    await get().commitProjectUpdate((proj) => {
      const linkGroupsToDelete = new Set<string>();
      proj.clips.forEach((c) => {
        if (idsToDelete.has(c.id) && c.linkGroupId) {
          linkGroupsToDelete.add(c.linkGroupId);
        }
      });

      const remainingClips = proj.clips.filter((c) => {
        if (idsToDelete.has(c.id)) return false;
        if (c.linkGroupId && linkGroupsToDelete.has(c.linkGroupId)) return false;
        return true;
      });

      const remainingTracks = pruneEmptyTracks(proj.tracks, remainingClips);
      return {
        ...proj,
        clips: packMainTrackClips(remainingTracks, remainingClips, isMagnetic),
        tracks: remainingTracks,
      };
    });

    set({
      selectedClipIds: [],
      selectedClipId: null,
      isInspectorOpen: false,
    });
  },

  generateSampleMedia: async (kind = 'pack') => {
    const current = get().currentProject;
    if (!current) return [];
    set({ isLoading: true, errorMessage: null });

    try {
      const res = await fetch(apiUrl('/api/media/generate-sample'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando medios de prueba con FFmpeg');

      const rawList: any[] = data.assets || (data.asset ? [data.asset] : []);
      const newAssets: MediaAsset[] = rawList.map((item) => ({
        id: createId('asset'),
        ...item,
      }));

      await get().commitProjectUpdate((proj) => {
        const incomingPaths = new Set(newAssets.map((a) => a.path));
        return {
          ...proj,
          assets: [...newAssets, ...proj.assets.filter((a) => !incomingPaths.has(a.path))],
        };
      });

      if (newAssets[0]) {
        set({
          selectedAssetId: newAssets[0].id,
          selectedAssetIds: newAssets.map((a) => a.id),
          selectedClipId: null,
          selectedClipIds: [],
          isLeftDrawerOpen: true,
        });
      }
      set({ isLoading: false });
      await get().fetchSystemStatus();
      return newAssets;
    } catch (err: any) {
      set({ isLoading: false, errorMessage: err?.message || 'Error generando medios demo' });
      return [];
    }
  },

  clearEphemeralCache: async () => {
    try {
      await fetch(apiUrl('/api/system/clear-cache'), { method: 'POST' });
      await get().fetchSystemStatus();
    } catch (err: any) {
      set({ errorMessage: err?.message || 'No se pudo limpiar la caché temporal' });
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
