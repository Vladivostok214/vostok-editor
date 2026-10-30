export type AspectRatio = '16:9' | '9:16' | '1:1';
export type TrackType = 'video' | 'audio' | 'text';
export type TransitionType = 'crossfade' | 'fade-black' | 'wipe-left' | 'wipe-right' | 'slide-left' | 'zoom';

export interface MediaAsset {
  id: string;
  name: string;
  path: string;          // Ruta en el sistema de archivos local en Linux
  url: string;           // URL de streaming local sin duplicar archivo
  type: 'video' | 'audio' | 'image';
  duration: number;      // Duración en segundos
  width?: number;
  height?: number;
  hasAudio?: boolean;
  fileSize?: number;
  waveform?: number[];   // Picos normalizados (0..1) para dibujar la onda de audio
  thumbnail?: string;    // Miniatura ligera en dataURL
}

export interface TextConfig {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;   // 100..900
  letterSpacing?: number; // en px (-5 a 30)
  lineHeightMultiplier?: number; // multiplicador (0.8 a 2.5)
  color: string;
  backgroundColor: string;
  bold: boolean;
  italic: boolean;
  underline?: boolean;
  uppercase?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  align?: 'left' | 'center' | 'right';
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
}

export interface TimelineClip {
  id: string;
  assetId?: string;      // Referencia al MediaAsset (opcional en clips de texto)
  trackId: string;
  type: 'video' | 'audio' | 'image' | 'text';
  name: string;
  startTime: number;     // Inicio en el timeline (segundos)
  duration: number;      // Duración activa en el timeline (segundos)
  sourceStart: number;   // Punto de inicio dentro del archivo original (trim in)
  maxDuration?: number;  // Duración máxima del archivo original
  linkGroupId?: string;  // ID compartido entre el clip de video y su clip de audio

  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    opacity: number;
    flipX?: boolean;
  };

  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  overlapTransition: TransitionType;

  textConfig?: TextConfig;
}

export interface ProjectData {
  id: string;
  name: string;
  updatedAt: string;
  aspectRatio: AspectRatio;
  fps: number;
  inPoint?: number | null;
  outPoint?: number | null;
  assets: MediaAsset[];
  tracks: Track[];
  clips: TimelineClip[];
  diskSizeBytes?: number;
}

export interface SystemStatus {
  os: string;
  ffmpeg: {
    ffmpeg: string;
    ffprobe: string;
    available: boolean;
  };
  paths: {
    projectsDir: string;
    tempCacheDir: string;
    exportsDir?: string;
  };
  storage: {
    cacheBytes: number;
    cacheFiles: number;
    projectsBytes: number;
  };
}

export interface FsBrowseResponse {
  currentDir: string;
  parentDir: string;
  shortcuts: { label: string; path: string }[];
  directories: { name: string; path: string }[];
  files: {
    name: string;
    path: string;
    ext: string;
    mediaType: 'video' | 'audio' | 'image';
    sizeBytes: number;
  }[];
}
