import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupStoreHarness, type StoreHarness } from '../helpers/storeHarness';
import { makeProject, makeTrack, makeClip } from '../helpers/fixtures';
import { drawSingleClipToContext, type Canvas2DContext } from '../../src/components/CanvasPreviewStage';
import type { TimelineClip } from '../../src/types/project';

/**
 * Migración de scripts/verify_keyframes_stage3.ts (FASE 11 · Etapa 3: pipeline visual del canvas).
 *
 * Se mantiene el enfoque del original: llamar a drawSingleClipToContext de PRODUCCIÓN con un
 * contexto 2D mínimo que solo registra las llamadas (no es un DOM simulado). Se añade la
 * comprobación de las transformaciones realmente aplicadas al contexto.
 *
 * Cobertura que NO se puede trasladar a Node sin DOM (documentada, no simulada):
 * - Píxeles resultantes de drawImage/fillText, carga de <video>/<img>, HiDPI y fuentes.
 * - Gizmo interactivo y arrastre real (eventos de ratón sobre CanvasPreviewStage).
 * - renderProjectFrameToCanvas con medios reales.
 * Propuesta: verificación nativa/de integración (WebKitGTK/Tauri) con capturas del canvas.
 */

interface RecordingContext {
  calls: string[];
  globalAlpha: number;
  [k: string]: unknown;
}

function createRecordingContext(): RecordingContext & Canvas2DContext {
  const calls: string[] = [];
  const ctx: RecordingContext = {
    calls,
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    textAlign: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
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
    drawImage: () => calls.push('drawImage'),
    fillText: () => {},
    strokeText: () => {},
    measureText: () => ({ width: 100 }),
  };
  return ctx as unknown as RecordingContext & Canvas2DContext;
}

const W = 1920;
const H = 1080;

const animatedClip: TimelineClip = makeClip({
  id: 'anim_clip_1',
  type: 'video',
  name: 'Animated Clip Test',
  startTime: 2.0,
  duration: 6.0,
  transform: { x: 0, y: 0, scale: 1.0, rotation: 0, opacity: 1.0, flipX: false },
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
});

function close(actual: number, expected: number, eps = 0.1, msg = '') {
  assert.ok(Math.abs(actual - expected) <= eps, `esperado ${expected}, obtenido ${actual}. ${msg}`);
}

describe('canvas · evaluación visual de keyframes (drawSingleClipToContext)', () => {
  test('t=2.0 s (offset 0): posición (0,0), escala 1, rotación 0', () => {
    const ctx = createRecordingContext();
    const box = drawSingleClipToContext(ctx, W, H, animatedClip, undefined, 1, 0, 1, 2.0);
    assert.ok(box);
    close(box!.centerX, W / 2);
    close(box!.centerY, H / 2);
    close(box!.rotation, 0);
    close(box!.width, 400);
    assert.ok(ctx.calls.includes(`translate(${W / 2},${H / 2})`));
    assert.equal(ctx.calls.filter((c) => c === 'save').length, ctx.calls.filter((c) => c === 'restore').length);
  });

  test('t=4.0 s (offset 2): x=200, escala 2, rotación 90°', () => {
    const ctx = createRecordingContext();
    const box = drawSingleClipToContext(ctx, W, H, animatedClip, undefined, 1, 0, 1, 4.0);
    assert.ok(box);
    close(box!.centerX, W / 2 + 200);
    close(box!.width, 800);
    close(box!.rotation, 90);
    // Efecto sobre el contexto: se aplicó la misma transformación.
    assert.ok(ctx.calls.includes(`translate(${W / 2 + 200},${H / 2})`), ctx.calls.join('|'));
    assert.ok(ctx.calls.includes(`rotate(${Math.PI / 2})`), ctx.calls.join('|'));
    assert.ok(ctx.calls.includes('scale(2,2)'), ctx.calls.join('|'));
  });

  test('t=6.0 s (offset 4): x=400, escala se mantiene en 2, rotación 180°', () => {
    const box = drawSingleClipToContext(createRecordingContext(), W, H, animatedClip, undefined, 1, 0, 1, 6.0);
    assert.ok(box);
    close(box!.centerX, W / 2 + 400);
    close(box!.width, 800);
    close(box!.rotation, 180);
  });

  test('t=8.0 s (opacity 0): el clip se descarta y no se toca el contexto', () => {
    const ctx = createRecordingContext();
    const box = drawSingleClipToContext(ctx, W, H, animatedClip, undefined, 1, 0, 1, 8.0);
    assert.equal(box, null);
    assert.equal(ctx.calls.length, 0, 'no debe haber save/translate/draw para un clip invisible');
  });
});

describe('store · auto-keyframing en updateClipTransformLive', () => {
  let h: StoreHarness;
  before(async () => {
    h = await setupStoreHarness();
    await h.loadProject(
      makeProject({
        id: 'proj_stage3_autokf',
        name: 'Auto-Keyframing Test',
        tracks: [makeTrack()],
        clips: [animatedClip],
      }),
      { playheadTime: 4.0 }
    );
  });
  after(async () => {
    await h?.close();
  });

  test('con keyframes en x, arrastrar el gizmo inserta/actualiza el keyframe en el cabezal', () => {
    h.useProjectStore.getState().updateClipTransformLive('anim_clip_1', { x: 350 });
    const clip = h.useProjectStore.getState().currentProject!.clips[0];
    const kf = clip.keyframes?.x?.find((k) => Math.abs(k.timeOffset - 2.0) < 0.04);
    assert.ok(kf, 'keyframe registrado en offset 2.0 s');
    assert.equal(kf!.value, 350);
    assert.equal(clip.keyframes!.x!.length, 3, 'se inserta, no reemplaza los extremos');
  });

  test('una propiedad sin keyframes (flipX) actualiza el valor estático base', () => {
    h.useProjectStore.getState().updateClipTransformLive('anim_clip_1', { flipX: true });
    const clip = h.useProjectStore.getState().currentProject!.clips[0];
    assert.equal(clip.transform.flipX, true);
  });
});
