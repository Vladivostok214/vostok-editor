import { useProjectStore } from '../src/store/useProjectStore';
import type { ProjectData, TimelineClip } from '../src/types/project';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runKeyframeStage2Tests() {
  console.log('🧪 Iniciando verificación de FASE 11 - ETAPA 2 (Acciones Zustand y Undo/Redo)...\n');

  const testClip: TimelineClip = {
    id: 'test_clip_1',
    trackId: 'track_video_1',
    type: 'video',
    name: 'Video Clip Test',
    startTime: 0,
    duration: 10,
    sourceStart: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    overlapTransition: 'crossfade',
  };

  const initialProject: ProjectData = {
    id: 'test_proj_keyframe',
    name: 'Proyecto Test Keyframes',
    updatedAt: new Date().toISOString(),
    aspectRatio: '16:9',
    fps: 30,
    assets: [],
    tracks: [{ id: 'track_video_1', name: 'Pista Video 1', type: 'video', muted: false, locked: false, hidden: false }],
    clips: [testClip],
  };

  // Mock initial state in Zustand
  useProjectStore.setState({
    currentProject: initialProject,
    pastProjects: [],
    futureProjects: [],
  });

  const store = useProjectStore.getState();

  // Test 1: Insert keyframes across multiple properties
  console.log('1. Verificando inserción de keyframes (setClipKeyframe)...');
  await store.setClipKeyframe('test_clip_1', 'scale', 0.0, 1.0, 'linear');
  await store.setClipKeyframe('test_clip_1', 'scale', 4.0, 2.5, 'ease-in-out');
  await store.setClipKeyframe('test_clip_1', 'opacity', 2.0, 0.5, 'ease-in');

  let clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(!!clip?.keyframes?.scale, 'clip has scale keyframes');
  assert(clip!.keyframes!.scale!.length === 2, 'scale has 2 keyframes');
  assert(clip!.keyframes!.scale![0].timeOffset === 0.0 && clip!.keyframes!.scale![0].value === 1.0, 'first scale kf');
  assert(clip!.keyframes!.scale![1].timeOffset === 4.0 && clip!.keyframes!.scale![1].value === 2.5, 'second scale kf');
  assert(clip!.keyframes!.scale![1].interpolation === 'ease-in-out', 'interpolation ease-in-out preserved');
  assert(clip!.keyframes!.opacity?.length === 1, 'opacity has 1 keyframe');
  console.log('   ✓ Inserción múltiple de propiedades validada.');

  // Test 2: Chronological ordering on insert
  console.log('\n2. Verificando ordenamiento cronológico automático...');
  // Insert at 2.0s between 0.0s and 4.0s
  await store.setClipKeyframe('test_clip_1', 'scale', 2.0, 1.8, 'linear');

  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes!.scale!.length === 3, 'scale now has 3 keyframes');
  assert(clip!.keyframes!.scale![0].timeOffset === 0.0, 'order 0: 0.0s');
  assert(clip!.keyframes!.scale![1].timeOffset === 2.0, 'order 1: 2.0s');
  assert(clip!.keyframes!.scale![2].timeOffset === 4.0, 'order 2: 4.0s');
  console.log('   ✓ Ordenamiento cronológico garantizado.');

  // Test 3: Tolerance update (no accidental duplicate keyframe within 33ms)
  console.log('\n3. Verificando actualización in-place con tolerancia de tiempo (33ms)...');
  // Update at 2.01s (difference is 10ms < 33ms tolerance)
  await store.setClipKeyframe('test_clip_1', 'scale', 2.01, 2.0, 'ease-out');

  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes!.scale!.length === 3, 'did not create duplicate keyframe');
  assert(clip!.keyframes!.scale![1].value === 2.0, 'value was updated to 2.0');
  assert(clip!.keyframes!.scale![1].interpolation === 'ease-out', 'interpolation updated to ease-out');
  console.log('   ✓ Deduplicación por tolerancia funcional.');

  // Test 4: Clamping of timeOffset to clip duration (0 to 10s)
  console.log('\n4. Verificando clamping a los límites del clip (0s a 10s)...');
  await store.setClipKeyframe('test_clip_1', 'scale', 15.0, 3.0); // Exceeds duration of 10s
  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  const clampedKf = clip!.keyframes!.scale![clip!.keyframes!.scale!.length - 1];
  assert(clampedKf.timeOffset === 10.0, 'timeOffset clamped to clip duration 10.0s');
  console.log('   ✓ Clamping de tiempo verificado.');

  // Test 5: Remove keyframe by ID
  console.log('\n5. Verificando eliminación de keyframe individual (removeClipKeyframe)...');
  const kfToRemove = clip!.keyframes!.scale![1]; // The one at 2.01s
  await store.removeClipKeyframe('test_clip_1', 'scale', kfToRemove.id);

  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes!.scale!.length === 3, 'scale count decreased by 1');
  assert(!clip!.keyframes!.scale!.some((k) => k.id === kfToRemove.id), 'keyframe was removed');
  console.log('   ✓ Eliminación de keyframe individual validada.');

  // Test 6: Clear keyframes for single property and all properties
  console.log('\n6. Verificando limpieza de keyframes (clearClipKeyframes)...');
  await store.clearClipKeyframes('test_clip_1', 'opacity');
  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes?.opacity === undefined, 'opacity track cleared');
  assert(clip!.keyframes?.scale !== undefined, 'scale track preserved');

  await store.clearClipKeyframes('test_clip_1');
  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes === undefined, 'all keyframes cleared and property removed');
  console.log('   ✓ Limpieza parcial y total de keyframes validada.');

  // Test 7: Undo and Redo integration
  console.log('\n7. Verificando integración con pila de Deshacer (Undo) y Rehacer (Redo)...');
  // At this point, keyframes are empty.
  // Add a new keyframe:
  await store.setClipKeyframe('test_clip_1', 'volume', 1.5, 0.8);
  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes?.volume?.length === 1, 'volume keyframe added');

  // Trigger Undo
  await store.undo();
  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes === undefined, 'undo reverted keyframe addition');

  // Trigger Redo
  await store.redo();
  clip = useProjectStore.getState().currentProject?.clips.find((c) => c.id === 'test_clip_1');
  assert(clip!.keyframes?.volume?.length === 1, 'redo restored volume keyframe');
  assert(clip!.keyframes!.volume![0].value === 0.8, 'restored value is correct');
  console.log('   ✓ Pila Undo/Redo sincronizada al 100% con los keyframes.');

  console.log('\n✅ TODAS LAS PRUEBAS DE LA ETAPA 2 PASARON CON ÉXITO.');
}

runKeyframeStage2Tests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
