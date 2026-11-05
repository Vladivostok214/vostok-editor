import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupStoreHarness, type StoreHarness } from '../helpers/storeHarness';
import { makeProject, makeTrack, makeClip } from '../helpers/fixtures';
import { findKeyframeAtTime, findClosestKeyframe, evaluatePropertyAtTime } from '../../src/lib/keyframeEngine';
import type { TimelineClip } from '../../src/types/project';

/**
 * Migración de scripts/verify_keyframes_stage5.ts (FASE 11 · Etapa 5: controles del Inspector).
 *
 * El original combinaba funciones de producción (motor de keyframes y acciones del store)
 * con lógica de "simulación de clic" escrita en el propio script. Aquí se conservan las
 * llamadas a producción y se añade la verificación del project.json persistido.
 * Los componentes del Inspector (React) no se renderizan: ver nota al final.
 */

const CLIP_ID = 'inspector_test_clip';
const clipOf = (h: StoreHarness): TimelineClip => h.useProjectStore.getState().currentProject!.clips[0];
const diskClip = (h: StoreHarness): TimelineClip => h.readPersisted().clips[0];

describe('inspector · keyframes (acciones de store + motor)', () => {
  let h: StoreHarness;

  before(async () => {
    h = await setupStoreHarness();
    await h.loadProject(
      makeProject({
        id: 'proj_stage5_inspector',
        name: 'Inspector Test Project',
        tracks: [makeTrack()],
        clips: [
          makeClip({
            id: CLIP_ID,
            type: 'video',
            name: 'Inspector Clip Test',
            startTime: 2.0,
            duration: 10.0,
            transform: { x: 50, y: -30, scale: 1.0, rotation: 0, opacity: 1.0, flipX: false },
            volume: 0.8,
            keyframes: {
              scale: [
                { id: 'kf_s1', timeOffset: 1.0, value: 1.2, interpolation: 'linear' },
                { id: 'kf_s2', timeOffset: 5.0, value: 2.0, interpolation: 'ease-in-out' },
              ],
              x: [{ id: 'kf_x1', timeOffset: 3.0, value: 150, interpolation: 'linear' }],
              y: [{ id: 'kf_y1', timeOffset: 3.0, value: 80, interpolation: 'linear' }],
            },
          }),
        ],
      }),
      { playheadTime: 3.0 }
    );
  });
  after(async () => {
    await h?.close();
  });

  test('detección de keyframe activo en el cabezal (rombo ◆/◇)', () => {
    const clip = clipOf(h);
    const timeOffset = h.useProjectStore.getState().playheadTime - clip.startTime;
    assert.equal(timeOffset, 1.0);
    assert.equal(findKeyframeAtTime(clip.keyframes?.scale, timeOffset, 0.033)?.id, 'kf_s1');
    assert.equal(findKeyframeAtTime(clip.keyframes?.opacity, timeOffset, 0.033), undefined);
  });

  test('navegación ‹ / › y salto del cabezal (setPlayheadTime)', () => {
    const clip = clipOf(h);
    const timeOffset = h.useProjectStore.getState().playheadTime - clip.startTime;
    assert.equal(findClosestKeyframe(clip.keyframes?.scale, timeOffset, 'prev', 0.033), undefined);
    const next = findClosestKeyframe(clip.keyframes?.scale, timeOffset, 'next', 0.033);
    assert.equal(next?.id, 'kf_s2');
    h.useProjectStore.getState().setPlayheadTime(clip.startTime + next!.timeOffset);
    assert.ok(Math.abs(h.useProjectStore.getState().playheadTime - 7.0) < 0.001);
  });

  test('conmutación de rombo: quitar kf_s2 y añadir opacity (estado y disco)', async () => {
    await h.useProjectStore.getState().removeClipKeyframe(CLIP_ID, 'scale', 'kf_s2');
    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'opacity', 5.0, 0.75);
    for (const clip of [clipOf(h), diskClip(h)]) {
      assert.equal(clip.keyframes?.scale?.length, 1);
      assert.equal(clip.keyframes?.opacity?.length, 1);
      assert.ok(Math.abs(clip.keyframes!.opacity![0].value - 0.75) < 0.001);
    }
  });

  test('control dual de posición X/Y: quitar y volver a añadir', async () => {
    h.useProjectStore.getState().setPlayheadTime(5.0);
    const clip = clipOf(h);
    const curOffset = 5.0 - clip.startTime;
    const kfX = findKeyframeAtTime(clip.keyframes?.x, curOffset, 0.033);
    const kfY = findKeyframeAtTime(clip.keyframes?.y, curOffset, 0.033);
    assert.ok(kfX && kfY, 'X e Y activos en 3.0 s');

    await h.useProjectStore.getState().removeClipKeyframe(CLIP_ID, 'x', kfX!.id);
    await h.useProjectStore.getState().removeClipKeyframe(CLIP_ID, 'y', kfY!.id);
    for (const c of [clipOf(h), diskClip(h)]) {
      assert.equal(c.keyframes?.x, undefined);
      assert.equal(c.keyframes?.y, undefined);
    }

    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'x', 3.0, 220);
    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'y', 3.0, -110);
    for (const c of [clipOf(h), diskClip(h)]) {
      assert.equal(c.keyframes?.x?.length, 1);
      assert.equal(c.keyframes!.x![0].value, 220);
      assert.equal(c.keyframes?.y?.length, 1);
      assert.equal(c.keyframes!.y![0].value, -110);
    }
  });

  test('volumen con keyframes (AudioInspector): base 0.8 y keyframe en 3.0 s con 0.5', async () => {
    const clip = clipOf(h);
    assert.equal(clip.keyframes?.volume, undefined);
    const curOffset = 5.0 - clip.startTime;
    assert.ok(Math.abs(evaluatePropertyAtTime(clip.keyframes?.volume, clip.volume, curOffset) - 0.8) < 0.001);

    await h.useProjectStore.getState().setClipKeyframe(CLIP_ID, 'volume', 3.0, 0.5);
    for (const c of [clipOf(h), diskClip(h)]) {
      assert.equal(c.keyframes?.volume?.length, 1);
      assert.ok(Math.abs(c.keyframes!.volume![0].value - 0.5) < 0.001);
    }
    // Efecto: con el keyframe, la evaluación en ese instante ya no es el valor base.
    assert.ok(Math.abs(evaluatePropertyAtTime(clipOf(h).keyframes?.volume, clip.volume, curOffset) - 0.5) < 0.001);
  });
});

/*
 * No trasladado: los componentes React del Inspector (KeyframeControlGroup, AudioInspector)
 * no se renderizan; el original tampoco lo hacía (simulaba el clic con llamadas al store).
 * Cubrirlos requiere un entorno DOM/integración, fuera del alcance de esta migración.
 */
