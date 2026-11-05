import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupStoreHarness, type StoreHarness } from '../helpers/storeHarness';
import { makeProject, makeTrack, makeClip } from '../helpers/fixtures';
import { getAggregatedClipKeyframes, ClipKeyframeMarkers } from '../../src/components/timeline/ClipKeyframeMarkers';
import { computeVolumeY, buildVolumePath } from '../../src/components/timeline/VolumeRubberBand';
import { evaluatePropertyAtTime } from '../../src/lib/keyframeEngine';
import type { TimelineClip } from '../../src/types/project';

/**
 * Migración de scripts/verify_keyframes_stage6.ts (FASE 11 · Etapa 6: UI de timeline).
 *
 * Cambios clave frente al original:
 * - Los "límites de píxeles" y la "proximidad del cabezal" eran FÓRMULAS COPIADAS en el
 *   script. Ahora se verifican renderizando el componente real ClipKeyframeMarkers con
 *   react-dom/server (renderToStaticMarkup: sin DOM, sin dependencias nuevas) y leyendo
 *   left/data-keyframe-active del HTML producido.
 * - La parte 6 llamaba setClipKeyframe SIN proyecto inicializado (la acción era un no-op) y
 *   solo comprobaba el cabezal. Ahora se inicializa un proyecto y se verifica el keyframe
 *   en memoria y en el project.json persistido; el no-op sin proyecto queda documentado.
 */

const mockClip: TimelineClip = makeClip({
  id: 'clip_stage6_test',
  type: 'video',
  name: 'Video_Stage6.mp4',
  startTime: 5.0,
  duration: 10.0,
  keyframes: {
    x: [{ id: 'kf_x1', timeOffset: 2.0, value: 120, interpolation: 'linear' }],
    y: [{ id: 'kf_y1', timeOffset: 2.01, value: -60, interpolation: 'linear' }],
    opacity: [{ id: 'kf_op1', timeOffset: 2.0, value: 0.5, interpolation: 'linear' }],
    scale: [{ id: 'kf_sc1', timeOffset: 6.5, value: 1.5, interpolation: 'ease-in-out' }],
  },
});

describe('timeline · agrupación de keyframes (getAggregatedClipKeyframes)', () => {
  test('agrupa keyframes simultáneos (tolerancia 33 ms) y conserva las propiedades', () => {
    const clusters = getAggregatedClipKeyframes(mockClip);
    assert.equal(clusters.length, 2);
    assert.ok(Math.abs(clusters[0].timeOffset - 2.0) <= 0.033);
    assert.deepEqual(clusters[0].properties.map((p) => p.property).sort(), ['opacity', 'x', 'y']);
    assert.equal(clusters[1].properties.length, 1);
    assert.equal(clusters[1].properties[0].property, 'scale');
  });

  test('los clips de audio no generan rombos de volumen (los dibuja VolumeRubberBand)', () => {
    const audio: TimelineClip = {
      ...mockClip,
      id: 'audio_stage6_test',
      type: 'audio',
      keyframes: { volume: [{ id: 'kf_v1', timeOffset: 3.0, value: 0.8, interpolation: 'linear' }] },
    };
    assert.equal(getAggregatedClipKeyframes(audio).length, 0);
  });
});

describe('timeline · ClipKeyframeMarkers renderizado real (SSR, sin DOM)', () => {
  function render(clip: TimelineClip, zoom: number, playheadTime: number) {
    const html = renderToStaticMarkup(
      React.createElement(ClipKeyframeMarkers, {
        clip,
        timelineZoom: zoom,
        playheadTime,
        onSeek: () => {},
        onSelectClip: () => {},
      })
    );
    const markers = [...html.matchAll(/data-keyframe-time="([^"]+)" data-keyframe-active="(true|false)"[^>]*style="left:([\d.]+)px"/g)].map(
      (m) => ({ time: Number(m[1]), active: m[2] === 'true', left: Number(m[3]) })
    );
    return { html, markers };
  }

  test('límites de píxeles: 0 s → 5 px, duración → ancho−5 px, 2 s → 200 px (zoom 100)', () => {
    const clip: TimelineClip = {
      ...mockClip,
      keyframes: {
        x: [{ id: 'a', timeOffset: 0.0, value: 0 }],
        y: [{ id: 'b', timeOffset: 2.0, value: 0 }],
        opacity: [{ id: 'c', timeOffset: 10.0, value: 1 }],
      },
    };
    const { markers } = render(clip, 100, 0);
    assert.deepEqual(markers.map((m) => m.left), [5, 200, 995]);
  });

  test('keyframe activo con el cabezal dentro de ±40 ms; inactivo fuera', () => {
    const activeAt = (playhead: number) => {
      const { markers } = render(mockClip, 100, playhead);
      return markers.find((m) => Math.abs(m.time - 2.0) <= 0.033)!.active;
    };
    assert.equal(activeAt(7.0), true);
    assert.equal(activeAt(6.98), true);
    assert.equal(activeAt(7.02), true);
    assert.equal(activeAt(6.9), false);
    assert.equal(activeAt(7.1), false);
  });

  test('sin keyframes no renderiza la tira de marcadores', () => {
    const { html } = render({ ...mockClip, keyframes: undefined }, 100, 0);
    assert.equal(html, '');
  });
});

describe('timeline · envolvente de volumen (VolumeRubberBand)', () => {
  test('computeVolumeY: 0 → abajo, 1 → centro, 2 → arriba (alto 28)', () => {
    assert.equal(computeVolumeY(0.0, 28), 24.0);
    assert.equal(computeVolumeY(1.0, 28), 14.0);
    assert.equal(computeVolumeY(2.0, 28), 4.0);
  });

  test('buildVolumePath: sin keyframes, lineal y ease-in-out', () => {
    const base = buildVolumePath([], 10.0, 1.0, 500, 28, 50);
    assert.equal(base.pathD, 'M 0 14 L 500 14');
    assert.ok(base.areaD.includes('L 500 28 L 0 28 Z'));

    const linear = buildVolumePath(
      [
        { id: 'v1', timeOffset: 2.0, value: 0.0, interpolation: 'linear' },
        { id: 'v2', timeOffset: 6.0, value: 1.0, interpolation: 'linear' },
      ],
      10.0, 1.0, 500, 28, 50
    );
    assert.ok(linear.pathD.startsWith('M 0 24 L 100.0 24'));
    assert.ok(linear.pathD.includes('L 300.0 14'));
    assert.ok(linear.pathD.endsWith('L 500.0 14'));

    const ease = buildVolumePath(
      [
        { id: 'v3', timeOffset: 1.0, value: 0.0, interpolation: 'ease-in-out' },
        { id: 'v4', timeOffset: 4.0, value: 2.0, interpolation: 'ease-in-out' },
      ],
      10.0, 1.0, 500, 28, 50
    );
    assert.ok((ease.pathD.match(/L /g) || []).length >= 8);
  });
});

describe('timeline · interacción con el store', () => {
  let h: StoreHarness;
  before(async () => {
    h = await setupStoreHarness();
  });
  after(async () => {
    await h?.close();
  });

  test('sin proyecto cargado, setClipKeyframe no cambia nada (comportamiento actual documentado)', async () => {
    h.useProjectStore.setState({ currentProject: null, pastProjects: [], futureProjects: [] });
    await h.useProjectStore.getState().setClipKeyframe('inexistente', 'volume', 3.5, 0.75);
    assert.equal(h.useProjectStore.getState().currentProject, null);
    assert.equal(h.useProjectStore.getState().pastProjects.length, 0);
  });

  test('con proyecto: el keyframe de volumen se guarda (memoria y disco) y el cabezal salta a él', async () => {
    await h.loadProject(
      makeProject({
        id: 'proj_stage6_timeline',
        tracks: [makeTrack()],
        clips: [{ ...mockClip, keyframes: undefined }],
      })
    );
    await h.useProjectStore.getState().setClipKeyframe(mockClip.id, 'volume', 3.5, 0.75);

    for (const clip of [h.useProjectStore.getState().currentProject!.clips[0], h.readPersisted().clips[0]]) {
      assert.equal(clip.keyframes?.volume?.length, 1);
      assert.equal(clip.keyframes!.volume![0].timeOffset, 3.5);
      assert.equal(clip.keyframes!.volume![0].value, 0.75);
    }
    h.useProjectStore.getState().setPlayheadTime(mockClip.startTime + 3.5);
    assert.ok(Math.abs(h.useProjectStore.getState().playheadTime - 8.5) < 0.001);
  });
});

describe('timeline · doble clic en la envolvente (valor adoptado)', () => {
  test('sin keyframes adopta el volumen base (1.0), jamás el tiempo (9.34)', () => {
    assert.equal(evaluatePropertyAtTime([], 1.0, 9.34), 1.0);
  });

  test('con curva previa 0→10 s (0.2→1.0), en 5.0 s vale 0.6', () => {
    const curve = [
      { id: 'k1', timeOffset: 0.0, value: 0.2, interpolation: 'linear' as const },
      { id: 'k2', timeOffset: 10.0, value: 1.0, interpolation: 'linear' as const },
    ];
    assert.ok(Math.abs(evaluatePropertyAtTime(curve, 1.0, 5.0) - 0.6) < 0.001);
  });

  test.skip('el manejador real de doble clic de VolumeRubberBand (evento DOM)', () => {
    // El original solo verificaba el cálculo con evaluatePropertyAtTime. El manejador de
    // eventos requiere DOM/integración; queda como cobertura pendiente (verificación nativa).
  });
});
