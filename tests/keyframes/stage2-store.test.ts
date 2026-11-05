import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupStoreHarness, type StoreHarness } from '../helpers/storeHarness';
import { makeProject, makeTrack, makeClip } from '../helpers/fixtures';
import type { TimelineClip } from '../../src/types/project';

/**
 * Migración de scripts/verify_keyframes_stage2.ts (FASE 11 · Etapa 2: acciones del store y Undo/Redo).
 *
 * Mejoras sobre el original:
 * - El store persiste contra un backend temporal en el sandbox (antes: sin aislamiento).
 * - Además del estado en memoria se verifica el project.json realmente guardado.
 * - Usa fixtures válidos (makeProject/makeClip) en vez de objetos ad hoc.
 */

const CLIP_ID = 'test_clip_1';
const clipOf = (h: StoreHarness): TimelineClip =>
  h.useProjectStore.getState().currentProject!.clips.find((c) => c.id === CLIP_ID)!;
const diskClip = (h: StoreHarness): TimelineClip => h.readPersisted().clips.find((c) => c.id === CLIP_ID)!;

describe('store · keyframes y undo/redo', () => {
  let h: StoreHarness;

  before(async () => {
    h = await setupStoreHarness();
    await h.loadProject(
      makeProject({
        id: 'proj_stage2_keyframes',
        name: 'Proyecto Test Keyframes',
        tracks: [makeTrack({ id: 'track_video_1', name: 'Pista Video 1' })],
        clips: [
          makeClip({
            id: CLIP_ID,
            trackId: 'track_video_1',
            type: 'video',
            name: 'Video Clip Test',
            duration: 10,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false },
          }),
        ],
      })
    );
  });
  after(async () => {
    await h?.close();
  });

  test('inserción en varias propiedades (setClipKeyframe) y persistencia en disco', async () => {
    const s = h.useProjectStore.getState();
    await s.setClipKeyframe(CLIP_ID, 'scale', 0.0, 1.0, 'linear');
    await s.setClipKeyframe(CLIP_ID, 'scale', 4.0, 2.5, 'ease-in-out');
    await s.setClipKeyframe(CLIP_ID, 'opacity', 2.0, 0.5, 'ease-in');
    assert.equal(h.useProjectStore.getState().errorMessage, null);

    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes?.scale?.length, 2);
      assert.equal(clip.keyframes!.scale![0].timeOffset, 0.0);
      assert.equal(clip.keyframes!.scale![0].value, 1.0);
      assert.equal(clip.keyframes!.scale![1].timeOffset, 4.0);
      assert.equal(clip.keyframes!.scale![1].value, 2.5);
      assert.equal(clip.keyframes!.scale![1].interpolation, 'ease-in-out');
      assert.equal(clip.keyframes!.opacity?.length, 1);
    }
  });

  test('ordenamiento cronológico automático', async () => {
    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'scale', 2.0, 1.8, 'linear');
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.deepEqual(clip.keyframes!.scale!.map((k) => k.timeOffset), [0.0, 2.0, 4.0]);
    }
  });

  test('actualización in-place dentro de la tolerancia de 33 ms', async () => {
    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'scale', 2.01, 2.0, 'ease-out');
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes!.scale!.length, 3, 'no crea duplicado');
      assert.equal(clip.keyframes!.scale![1].value, 2.0);
      assert.equal(clip.keyframes!.scale![1].interpolation, 'ease-out');
    }
  });

  test('clamping del tiempo a la duración del clip (0..10 s)', async () => {
    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'scale', 15.0, 3.0);
    const list = diskClip(h).keyframes!.scale!;
    assert.equal(list[list.length - 1].timeOffset, 10.0);
  });

  test('eliminación de un keyframe por id (removeClipKeyframe)', async () => {
    const before = clipOf(h).keyframes!.scale!;
    const target = before[1];
    await h.useProjectStore.getState().removeClipKeyframe(CLIP_ID, 'scale', target.id);
    // Se fija además el recuento previo (4) para que "3" signifique realmente "uno menos".
    assert.equal(before.length, 4);
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes!.scale!.length, 3);
      assert.equal(clip.keyframes!.scale!.some((k) => k.id === target.id), false);
    }
  });

  test('limpieza parcial y total (clearClipKeyframes)', async () => {
    await h.useProjectStore.getState().clearClipKeyframes(CLIP_ID, 'opacity');
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes?.opacity, undefined);
      assert.notEqual(clip.keyframes?.scale, undefined);
    }
    await h.useProjectStore.getState().clearClipKeyframes(CLIP_ID);
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes, undefined);
    }
  });

  test('undo/redo sincronizados con el estado y con el disco', async () => {
    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'volume', 1.5, 0.8);
    assert.equal(diskClip(h).keyframes?.volume?.length, 1);

    await h.useProjectStore.getState().undo();
    assert.equal(clipOf(h).keyframes, undefined, 'undo revierte en memoria');
    assert.equal(diskClip(h).keyframes, undefined, 'undo revierte en disco');

    await h.useProjectStore.getState().redo();
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes?.volume?.length, 1);
      assert.equal(clip.keyframes!.volume![0].value, 0.8);
    }
  });
});
