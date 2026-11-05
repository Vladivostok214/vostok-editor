import type { ProjectData, TimelineClip, Track } from '../../src/types/project';

/**
 * Fixtures sintéticos y mínimos de ProjectData. No derivan de proyectos reales y
 * no referencian rutas fuera del sandbox: los assets usan rutas relativas al
 * sandbox que el llamador debe resolver (resolveInside) si necesita archivos.
 */

export function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track_v1',
    name: 'Video 1',
    type: 'video',
    muted: false,
    locked: false,
    hidden: false,
    ...overrides,
  } as Track;
}

export function makeClip(overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip_1',
    trackId: 'track_v1',
    type: 'text',
    name: 'Clip de prueba',
    startTime: 0,
    duration: 5,
    sourceStart: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    overlapTransition: 'crossfade',
    ...overrides,
  } as TimelineClip;
}

export function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'proj_fixture_basic',
    name: 'Proyecto de prueba',
    updatedAt: '2026-01-01T00:00:00.000Z',
    aspectRatio: '16:9',
    fps: 30,
    inPoint: null,
    outPoint: null,
    assets: [],
    tracks: [makeTrack()],
    clips: [makeClip()],
    ...overrides,
  } as ProjectData;
}
