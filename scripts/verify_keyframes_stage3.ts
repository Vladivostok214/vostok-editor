import { drawSingleClipToContext } from '../src/components/CanvasPreviewStage';
import { useProjectStore } from '../src/store/useProjectStore';
import type { TimelineClip, ProjectData } from '../src/types/project';

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

// Mock 2D Canvas Context for Node testing
function createMockCanvasContext() {
  const calls: string[] = [];
  return {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate(${x},${y})`),
    rotate: (rad: number) => calls.push(`rotate(${rad})`),
    scale: (sx: number, sy: number) => calls.push(`scale(${sx},${sy})`),
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    drawImage: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 100 }),
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    textAlign: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    calls,
  } as any;
}

async function runKeyframeStage3Tests() {
  console.log('🧪 Iniciando verificación de FASE 11 - ETAPA 3 (Pipeline Visual en Canvas y Gizmo)...\n');

  const animatedClip: TimelineClip = {
    id: 'anim_clip_1',
    trackId: 'track_v1',
    type: 'video',
    name: 'Animated Clip Test',
    startTime: 2.0, // Inicia en segundo 2.0
    duration: 6.0,  // Termina en segundo 8.0 (timeOffset 0..6s)
    sourceStart: 0,
    transform: { x: 0, y: 0, scale: 1.0, rotation: 0, opacity: 1.0, flipX: false },
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    overlapTransition: 'crossfade',
    keyframes: {
      x: [
        { id: 'kf_x1', timeOffset: 0.0, value: 0, interpolation: 'linear' },
        { id: 'kf_x2', timeOffset: 4.0, value: 400, interpolation: 'linear' },
      ],
      scale: [
        { id: 'kf_s1', timeOffset: 0.0, value: 1.0, interpolation: 'linear' },
        { id: 'kf_s2', timeOffset: 2.0, value: 2.0, interpolation: 'linear' },
      ],
      rotation: [
        { id: 'kf_r1', timeOffset: 0.0, value: 0, interpolation: 'linear' },
        { id: 'kf_r2', timeOffset: 4.0, value: 180, interpolation: 'linear' },
      ],
      opacity: [
        { id: 'kf_o1', timeOffset: 4.0, value: 1.0, interpolation: 'linear' },
        { id: 'kf_o2', timeOffset: 6.0, value: 0.0, interpolation: 'linear' },
      ],
    },
  };

  const canvasWidth = 1920;
  const canvasHeight = 1080;

  // Test 1: Frame evaluation at t = 2.0s (timeOffset = 0s)
  console.log('1. Verificando evaluación visual en t = 2.0s (timeOffset = 0.0s)...');
  const ctx1 = createMockCanvasContext();
  const box1 = drawSingleClipToContext(
    ctx1,
    canvasWidth,
    canvasHeight,
    animatedClip,
    undefined,
    1,
    0,
    1,
    2.0 // exact startTime
  );

  assert(box1 !== null, 'box1 drawn');
  assertClose(box1!.centerX, canvasWidth / 2 + 0, 0.1, 'centerX at t=2.0s');
  assertClose(box1!.centerY, canvasHeight / 2 + 0, 0.1, 'centerY at t=2.0s');
  assertClose(box1!.rotation, 0, 0.1, 'rotation at t=2.0s');
  // Base width = 400 * scale 1.0 = 400
  assertClose(box1!.width, 400, 0.1, 'width at t=2.0s (scale 1.0)');
  console.log('   ✓ Frame t=2.0s: Posición=(0, 0), Escala=1.0, Rotación=0°');

  // Test 2: Frame evaluation at t = 4.0s (timeOffset = 2.0s)
  console.log('\n2. Verificando evaluación visual en t = 4.0s (timeOffset = 2.0s - punto medio)...');
  const ctx2 = createMockCanvasContext();
  const box2 = drawSingleClipToContext(
    ctx2,
    canvasWidth,
    canvasHeight,
    animatedClip,
    undefined,
    1,
    0,
    1,
    4.0 // 2s into clip
  );

  assert(box2 !== null, 'box2 drawn');
  // x: midpoint between 0 and 400 is 200 -> centerX = 1920/2 + 200 = 1160
  assertClose(box2!.centerX, canvasWidth / 2 + 200, 0.1, 'centerX at t=4.0s');
  // scale at timeOffset 2.0s is 2.0 -> width = 400 * 2.0 = 800
  assertClose(box2!.width, 800, 0.1, 'width at t=4.0s (scale 2.0)');
  // rotation at timeOffset 2.0s is midpoint between 0 and 180 = 90 deg
  assertClose(box2!.rotation, 90, 0.1, 'rotation at t=4.0s (90 deg)');
  console.log('   ✓ Frame t=4.0s: Posición X=200, Escala=2.0, Rotación=90°');

  // Test 3: Frame evaluation at t = 6.0s (timeOffset = 4.0s)
  console.log('\n3. Verificando evaluación visual en t = 6.0s (timeOffset = 4.0s)...');
  const ctx3 = createMockCanvasContext();
  const box3 = drawSingleClipToContext(
    ctx3,
    canvasWidth,
    canvasHeight,
    animatedClip,
    undefined,
    1,
    0,
    1,
    6.0 // 4s into clip
  );

  assert(box3 !== null, 'box3 drawn');
  assertClose(box3!.centerX, canvasWidth / 2 + 400, 0.1, 'centerX at t=6.0s');
  // scale after 2.0s remains at last keyframe (2.0)
  assertClose(box3!.width, 800, 0.1, 'width remains at 2.0 scale');
  assertClose(box3!.rotation, 180, 0.1, 'rotation reached 180 deg');
  console.log('   ✓ Frame t=6.0s: Posición X=400, Escala=2.0, Rotación=180°');

  // Test 4: Opacity culling at t = 8.0s (timeOffset = 6.0s, opacity = 0.0)
  console.log('\n4. Verificando culling visual cuando opacity = 0.0...');
  const ctx4 = createMockCanvasContext();
  const box4 = drawSingleClipToContext(
    ctx4,
    canvasWidth,
    canvasHeight,
    animatedClip,
    undefined,
    1,
    0,
    1,
    8.0 // opacity is 0.0
  );
  assert(box4 === null, 'clip with finalAlpha <= 0.005 is correctly culled');
  console.log('   ✓ Culling de opacidad nula verificado.');

  // Test 5: Auto-keyframing in updateClipTransformLive
  console.log('\n5. Verificando Auto-Keyframing inteligente durante arrastre...');
  const testProject: ProjectData = {
    id: 'test_auto_kf_proj',
    name: 'Auto-Keyframing Test',
    updatedAt: new Date().toISOString(),
    aspectRatio: '16:9',
    fps: 30,
    assets: [],
    tracks: [{ id: 'track_v1', name: 'Video 1', type: 'video', muted: false, locked: false, hidden: false }],
    clips: [animatedClip],
  };

  useProjectStore.setState({
    currentProject: testProject,
    playheadTime: 4.0, // Exactly at timeOffset = 2.0s
  });

  const store = useProjectStore.getState();

  // The clip has keyframes on 'x'. Let's drag gizmo X to 350:
  store.updateClipTransformLive('anim_clip_1', { x: 350 });

  let updatedClip = useProjectStore.getState().currentProject?.clips[0];
  assert(updatedClip !== undefined, 'clip exists');
  // Keyframe on x at timeOffset 2.0s should have been updated/inserted:
  const kfAt2 = updatedClip!.keyframes?.x?.find((k) => Math.abs(k.timeOffset - 2.0) < 0.04);
  assert(kfAt2 !== undefined, 'auto-keyframe was recorded at playhead time (2.0s)');
  assert(kfAt2!.value === 350, 'keyframe value is 350');
  console.log('   ✓ Auto-keyframe insertado automáticamente en playhead (timeOffset=2.0s) con valor 350.');

  // The clip does NOT have keyframes on 'flipX' or a static property without keyframes:
  store.updateClipTransformLive('anim_clip_1', { flipX: true });
  updatedClip = useProjectStore.getState().currentProject?.clips[0];
  assert(updatedClip!.transform.flipX === true, 'static property updated directly in transform');
  console.log('   ✓ Propiedad sin keyframes actualiza valor estático base.');

  console.log('\n✅ TODAS LAS PRUEBAS DE LA ETAPA 3 PASARON CON ÉXITO.');
}

runKeyframeStage3Tests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
