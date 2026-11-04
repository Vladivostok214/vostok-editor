import { useProjectStore } from '../src/store/useProjectStore';
import {
  findKeyframeAtTime,
  findClosestKeyframe,
  evaluatePropertyAtTime,
} from '../src/lib/keyframeEngine';
import type { TimelineClip, ProjectData, Keyframe } from '../src/types/project';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertClose(actual: number, expected: number, eps = 0.01, msg = '') {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg}`);
  }
}

async function runKeyframeStage5Tests() {
  console.log('🧪 Iniciando verificación de FASE 11 - ETAPA 5 (UI en Inspector: KeyframeControlGroup)...\n');

  const testClip: TimelineClip = {
    id: 'inspector_test_clip',
    trackId: 'track_v1',
    type: 'video',
    name: 'Inspector Clip Test',
    startTime: 2.0, // Clip va de 2.0s a 12.0s
    duration: 10.0,
    sourceStart: 0,
    transform: { x: 50, y: -30, scale: 1.0, rotation: 0, opacity: 1.0, flipX: false },
    volume: 0.8,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    overlapTransition: 'crossfade',
    keyframes: {
      scale: [
        { id: 'kf_s1', timeOffset: 1.0, value: 1.2, interpolation: 'linear' },
        { id: 'kf_s2', timeOffset: 5.0, value: 2.0, interpolation: 'ease-in-out' },
      ],
      x: [
        { id: 'kf_x1', timeOffset: 3.0, value: 150, interpolation: 'linear' },
      ],
      y: [
        { id: 'kf_y1', timeOffset: 3.0, value: 80, interpolation: 'linear' },
      ],
    },
  };

  const project: ProjectData = {
    id: 'proj_inspector_test',
    name: 'Inspector Test Project',
    updatedAt: new Date().toISOString(),
    aspectRatio: '16:9',
    fps: 30,
    assets: [],
    tracks: [{ id: 'track_v1', name: 'Video 1', type: 'video', muted: false, locked: false, hidden: false }],
    clips: [testClip],
  };

  useProjectStore.setState({
    currentProject: project,
    playheadTime: 3.0, // playheadTime = 3.0s -> timeOffset = 1.0s (exact at kf_s1)
  });

  const store = useProjectStore.getState();

  // Test 1: Keyframe active state detection in Inspector
  console.log('1. Verificando detección de estado activo (Rombo ◆ vs ◇)...');
  const clip = store.currentProject!.clips[0];
  const timeOffset = store.playheadTime - clip.startTime; // 3.0 - 2.0 = 1.0s

  const activeScaleKf = findKeyframeAtTime(clip.keyframes?.scale, timeOffset, 0.033);
  assert(activeScaleKf !== undefined && activeScaleKf.id === 'kf_s1', 'scale has active keyframe at playhead (1.0s)');

  const activeOpacityKf = findKeyframeAtTime(clip.keyframes?.opacity, timeOffset, 0.033);
  assert(activeOpacityKf === undefined, 'opacity has no keyframe at playhead');
  console.log('   ✓ Estado de rombo: Scale=Activo (◆), Opacity=Inactivo (◇)');

  // Test 2: Navigation (‹ / ›) jumps
  console.log('\n2. Verificando navegación de keyframe (botones ‹ y ›)...');
  // At timeOffset 1.0s on scale:
  const prevKf = findClosestKeyframe(clip.keyframes?.scale, timeOffset, 'prev', 0.033);
  assert(prevKf === undefined, 'no previous keyframe before 1.0s');

  const nextKf = findClosestKeyframe(clip.keyframes?.scale, timeOffset, 'next', 0.033);
  assert(nextKf !== undefined && nextKf.id === 'kf_s2', 'next keyframe is kf_s2 at 5.0s');

  // Jump to next keyframe:
  const targetPlayhead = clip.startTime + nextKf!.timeOffset; // 2.0 + 5.0 = 7.0s
  store.setPlayheadTime(targetPlayhead);
  assertClose(useProjectStore.getState().playheadTime, 7.0, 0.001, 'playhead jumped to 7.0s');
  console.log('   ✓ Salto › posicionó el cabezal en 7.00s (timeOffset=5.0s).');

  // Test 3: Toggling keyframe on/off via Inspector action
  console.log('\n3. Verificando conmutación de rombo (añadir y quitar)...');
  // At playhead 7.0s (timeOffset 5.0s), scale has kf_s2. Clicking removes it:
  await store.removeClipKeyframe(clip.id, 'scale', 'kf_s2');
  let currentClip = useProjectStore.getState().currentProject!.clips[0];
  assert(currentClip.keyframes?.scale?.length === 1, 'kf_s2 removed, 1 keyframe remains');

  // Now at 7.0s (timeOffset 5.0s), opacity has no keyframe. Clicking adds it:
  await store.setClipKeyframe(clip.id, 'opacity', 5.0, 0.75);
  currentClip = useProjectStore.getState().currentProject!.clips[0];
  assert(currentClip.keyframes?.opacity?.length === 1, 'opacity keyframe added');
  assertClose(currentClip.keyframes!.opacity![0].value, 0.75, 0.001, 'opacity value is 0.75');
  console.log('   ✓ Rombo eliminó keyframe existente y añadió nuevo keyframe.');

  // Test 4: Dual property keyframe control for Position (X, Y)
  console.log('\n4. Verificando control de keyframe dual para Posición (X y Y)...');
  // Clip has keyframes at timeOffset 3.0s (playhead = 5.0s) for both X and Y
  store.setPlayheadTime(5.0); // timeOffset = 3.0s
  const curOffset = 5.0 - clip.startTime; // 3.0s

  const kfX = findKeyframeAtTime(currentClip.keyframes?.x, curOffset, 0.033);
  const kfY = findKeyframeAtTime(currentClip.keyframes?.y, curOffset, 0.033);
  assert(kfX !== undefined && kfY !== undefined, 'both X and Y keyframes active at 3.0s');

  // Remove dual keyframe:
  await store.removeClipKeyframe(clip.id, 'x', kfX!.id);
  await store.removeClipKeyframe(clip.id, 'y', kfY!.id);
  currentClip = useProjectStore.getState().currentProject!.clips[0];
  assert(currentClip.keyframes?.x === undefined, 'X keyframes cleared');
  assert(currentClip.keyframes?.y === undefined, 'Y keyframes cleared');

  // Add dual keyframe at playhead 5.0s:
  await store.setClipKeyframe(clip.id, 'x', 3.0, 220);
  await store.setClipKeyframe(clip.id, 'y', 3.0, -110);
  currentClip = useProjectStore.getState().currentProject!.clips[0];
  assert(currentClip.keyframes?.x?.length === 1 && currentClip.keyframes!.x![0].value === 220, 'dual X added');
  assert(currentClip.keyframes?.y?.length === 1 && currentClip.keyframes!.y![0].value === -110, 'dual Y added');
  console.log('   ✓ Control dual de posición X/Y validado.');

  // Test 5: Audio Volume Inspector keyframing
  console.log('\n5. Verificando control de volumen con keyframes en AudioInspector...');
  assert(currentClip.keyframes?.volume === undefined, 'no volume keyframes initially');

  // Evaluate volume at current playhead:
  const evalVol = evaluatePropertyAtTime(currentClip.keyframes?.volume, currentClip.volume, curOffset);
  assertClose(evalVol, 0.8, 0.001, 'initial evaluated volume is 0.8');

  // Add keyframe on volume at 3.0s with 0.5:
  await store.setClipKeyframe(clip.id, 'volume', 3.0, 0.5);
  currentClip = useProjectStore.getState().currentProject!.clips[0];
  assert(currentClip.keyframes?.volume?.length === 1, 'volume keyframe added');
  assertClose(currentClip.keyframes!.volume![0].value, 0.5, 0.001, 'volume keyframe value is 0.5');
  console.log('   ✓ Keyframe de volumen en AudioInspector validado.');

  console.log('\n✅ TODAS LAS PRUEBAS DE LA ETAPA 5 PASARON CON ÉXITO.');
}

runKeyframeStage5Tests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
