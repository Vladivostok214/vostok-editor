import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupStoreHarness, type StoreHarness } from '../helpers/storeHarness';
import { makeProject, makeTrack, makeClip } from '../helpers/fixtures';
import { resolveInside } from '../helpers/sandbox';
import {
  drawSingleClipToContext,
  renderProjectFrameToCanvas,
  getCanvasResolutionScale,
  type Canvas2DContext,
} from '../../src/components/CanvasPreviewStage';
import {
  TRANSITION_OPTIONS,
  normalizeTransitionType,
} from '../../src/components/inspector/VideoInspector';
import { extractNextImageFrameFromBuffer } from '../../src/components/ExportModal';
import { isAlphaPixelFormat } from '../../server/mediaBackendPlugin';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TransitionType } from '../../src/types/project';

const execFileAsync = promisify(execFile);

interface RecordedCall {
  op: string;
  args: any[];
}

function createSpyContext() {
  const calls: RecordedCall[] = [];
  const ctx: any = {
    calls,
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    textAlign: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    letterSpacing: '0px',
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    translate: (x: number, y: number) => calls.push({ op: 'translate', args: [x, y] }),
    rotate: (rad: number) => calls.push({ op: 'rotate', args: [rad] }),
    scale: (sx: number, sy: number) => calls.push({ op: 'scale', args: [sx, sy] }),
    clearRect: () => {},
    fillRect: (x: number, y: number, w: number, h: number) =>
      calls.push({ op: 'fillRect', args: [x, y, w, h] }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    rect: (x: number, y: number, w: number, h: number) =>
      calls.push({ op: 'rect', args: [x, y, w, h] }),
    roundRect: (x: number, y: number, w: number, h: number, r: any) =>
      calls.push({ op: 'roundRect', args: [x, y, w, h, r] }),
    fill: () => calls.push({ op: 'fill', args: [] }),
    stroke: () => calls.push({ op: 'stroke', args: [] }),
    clip: () => calls.push({ op: 'clip', args: [] }),
    drawImage: (...args: any[]) => calls.push({ op: 'drawImage', args }),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ op: 'fillText', args: [text, x, y, ctx.font] }),
    strokeText: (text: string, x: number, y: number) =>
      calls.push({ op: 'strokeText', args: [text, x, y, ctx.font] }),
    measureText: (text: string) => {
      // Aproximación proporcional al tamaño de fuente actual en px
      const m = String(ctx.font).match(/(\d+)px/);
      const fontPx = m ? Number(m[1]) : 16;
      return { width: text.length * fontPx * 0.55 };
    },
  };
  return ctx as Canvas2DContext & { calls: RecordedCall[]; font: string };
}

describe('Fase 15 · Blindaje práctico de persistencia, fidelidad visual y exportación', () => {
  let h: StoreHarness;

  before(async () => {
    h = await setupStoreHarness();
  });

  after(async () => {
    await h?.close();
  });

  test('F16: POST /api/projects realiza escritura atómica limpia sin dejar archivos .tmp residuales', async () => {
    const projId = 'proj_atomic_save_test';
    const proj = makeProject({ id: projId, name: 'Proyecto Atómico Inicial' });

    const res1 = await fetch(`${h.backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj),
    });
    assert.equal(res1.status, 200);

    const projDir = resolveInside(h.backend.sandbox.dataDir, `projects/${projId}`);
    const entriesAfterFirst = fs.readdirSync(projDir);
    assert.deepEqual(entriesAfterFirst, ['project.json'], 'No deben quedar archivos .tmp tras guardar');

    // Segunda escritura consecutiva actualizando el nombre y agregando clips
    const updatedProj = {
      ...proj,
      name: 'Proyecto Atómico v2',
      clips: [makeClip({ id: 'c_atom_1', name: 'Clip 1' })],
    };
    const res2 = await fetch(`${h.backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProj),
    });
    assert.equal(res2.status, 200);

    const entriesAfterSecond = fs.readdirSync(projDir);
    assert.deepEqual(entriesAfterSecond, ['project.json'], 'Solo debe existir project.json');

    const persisted = h.readPersisted(projId);
    assert.equal(persisted.name, 'Proyecto Atómico v2');
    assert.equal(persisted.clips.length, 1);
  });

  test('F03: Ediciones rápidas concurrentes en el store no son pisadas por respuestas anteriores y persisten en orden', async () => {
    const projId = 'proj_concurrent_saves';
    const initial = makeProject({
      id: projId,
      name: 'Versión 0',
      tracks: [makeTrack({ id: 't_v1', type: 'video' })],
      clips: [makeClip({ id: 'clip_1', trackId: 't_v1', name: 'Inicial', duration: 4 })],
    });
    await h.loadProject(initial);

    const store = h.useProjectStore.getState();

    // Disparar dos actualizaciones seguidas sin esperar a la primera antes de lanzar la segunda
    const p1 = store.updateProjectMeta({ name: 'Edición Intermedia A' });
    const p2 = store.updateProjectMeta({ name: 'Edición Final B' });

    await Promise.all([p1, p2]);

    const finalState = h.useProjectStore.getState().currentProject!;
    assert.equal(finalState.name, 'Edición Final B', 'El estado en memoria debe conservar la edición B');

    const onDisk = h.readPersisted(projId);
    assert.equal(onDisk.name, 'Edición Final B', 'El archivo en disco debe reflejar la edición final B');
  });

  test('F07: Catálogo de transiciones unificado entre VideoInspector y CanvasPreviewStage (incluyendo migración legacy)', () => {
    const project = makeProject({
      id: 'proj_transitions_f07',
      aspectRatio: '16:9',
      tracks: [makeTrack({ id: 't_v1', type: 'video' })],
      clips: [
        makeClip({
          id: 'clip_a',
          trackId: 't_v1',
          type: 'video',
          startTime: 0,
          duration: 5,
        }),
        makeClip({
          id: 'clip_b',
          trackId: 't_v1',
          type: 'video',
          startTime: 3, // Solapamiento entre 3s y 5s (duración 2s)
          duration: 5,
        }),
      ],
    });

    const mediaElements = new Map<string, any>([
      ['clip_a', { width: 1920, height: 1080 }],
      ['clip_b', { width: 1920, height: 1080 }],
    ]);

    // 1. Verificar todas las opciones actuales de TRANSITION_OPTIONS durante el solapamiento (t=3.5s, p=0.25)
    for (const opt of TRANSITION_OPTIONS) {
      project.clips[1].overlapTransition = opt.id;
      const ctx = createSpyContext();
      const boxes = renderProjectFrameToCanvas(ctx, 1920, 1080, project, 3.5, mediaElements);
      assert.ok(
        boxes.length >= 1,
        `La transición '${opt.id}' (${opt.label}) debe dibujar al menos 1 clip en el solapamiento`
      );
      const drawCalls = ctx.calls.filter((c) => c.op === 'drawImage');
      assert.ok(drawCalls.length >= 1, `La transición '${opt.id}' debe invocar drawImage`);
    }

    // 2. Verificar que los identificadores legacy ('dipToBlack', 'slideLeft', 'wipe') se normalizan y dibujan
    const legacyIds = ['dipToBlack', 'slideLeft', 'wipe', 'unknown_transition'];
    for (const legacyId of legacyIds) {
      const normalized = normalizeTransitionType(legacyId);
      assert.ok(
        TRANSITION_OPTIONS.some((o) => o.id === normalized),
        `El ID legacy '${legacyId}' se normaliza a un TransitionType válido ('${normalized}')`
      );
      project.clips[1].overlapTransition = legacyId as TransitionType;
      const ctx = createSpyContext();
      const boxes = renderProjectFrameToCanvas(ctx, 1920, 1080, project, 4.2, mediaElements);
      assert.ok(boxes.length >= 1, `El ID legacy '${legacyId}' no debe dejar la pista en blanco`);
    }
  });

  test('F18: Escalado proporcional entre 1080p y 720p conserva posiciones relativas y tamaños de texto', () => {
    const textClip = makeClip({
      id: 'clip_txt_scale',
      trackId: 't_txt',
      type: 'text',
      startTime: 0,
      duration: 5,
      transform: {
        x: 300,
        y: -150,
        scale: 1,
        rotation: 0,
        opacity: 1,
        flipX: false,
      },
      textConfig: {
        content: 'TÍTULO DE PRUEBA',
        fontFamily: 'TikTok Sans Variable',
        fontSize: 16, // 16 * 9.5 = 152px en 1080p -> ~101px en 720p
        fontWeight: 800,
        color: '#ffffff',
        backgroundColor: '#000000',
        bold: true,
        italic: false,
        strokeColor: '#00d4e5',
        strokeWidth: 6,
      },
    });

    const project = makeProject({
      id: 'proj_scale_f18',
      aspectRatio: '16:9',
      tracks: [makeTrack({ id: 't_txt', type: 'text' })],
      clips: [textClip],
    });

    const ctx1080 = createSpyContext();
    const boxes1080 = renderProjectFrameToCanvas(ctx1080, 1920, 1080, project, 1.0, new Map());
    assert.equal(boxes1080.length, 1);

    const ctx720 = createSpyContext();
    const boxes720 = renderProjectFrameToCanvas(ctx720, 1280, 720, project, 1.0, new Map());
    assert.equal(boxes720.length, 1);

    const b1080 = boxes1080[0];
    const b720 = boxes720[0];

    // Posición normalizada respecto al lienzo debe ser idéntica
    assert.ok(
      Math.abs(b1080.centerX / 1920 - b720.centerX / 1280) < 0.001,
      `Posición X normalizada coincide: ${b1080.centerX / 1920} vs ${b720.centerX / 1280}`
    );
    assert.ok(
      Math.abs(b1080.centerY / 1080 - b720.centerY / 720) < 0.001,
      `Posición Y normalizada coincide: ${b1080.centerY / 1080} vs ${b720.centerY / 720}`
    );

    // Tamaño relativo de la caja de texto respecto al ancho del lienzo debe coincidir
    const relW1080 = b1080.width / 1920;
    const relW720 = b720.width / 1280;
    assert.ok(
      Math.abs(relW1080 - relW720) < 0.01,
      `Ancho relativo de texto coincide en 1080p y 720p: ${relW1080} vs ${relW720}`
    );

    assert.equal(getCanvasResolutionScale(1920, 1080, '16:9'), 1);
    assert.ok(Math.abs(getCanvasResolutionScale(1280, 720, '16:9') - 2 / 3) < 0.0001);
  });

  test('F12: /api/export/finalize devuelve error HTTP 500 explícito si falla la mezcla de audio (nunca éxito silencioso mudo)', async () => {
    // 1. Iniciar una sesión de exportación
    const startRes = await fetch(`${h.backend.origin}/api/export/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fps: 30, useGpu: false }),
    });
    assert.equal(startRes.status, 200);
    const { exportId } = await startRes.json();

    // 2. Crear un archivo corrupto que existe en disco pero NO es un archivo de audio válido para FFmpeg
    const corruptedAudioPath = path.join(h.backend.sandbox.root, 'corrupted_audio.mp3');
    fs.writeFileSync(corruptedAudioPath, 'NOT_A_VALID_AUDIO_STREAM_BYTES_0000', 'utf-8');

    // 3. Llamar a finalize pidiendo mezclar este clip de audio corrupto
    const finRes = await fetch(`${h.backend.origin}/api/export/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exportId,
        fileName: 'test_audio_fail.mp4',
        useGpu: false,
        fps: 30,
        totalDuration: 1,
        audioClips: [
          {
            path: corruptedAudioPath,
            startTime: 0,
            duration: 1,
            sourceStart: 0,
            volume: 1,
            fadeIn: 0,
            fadeOut: 0,
          },
        ],
      }),
    });

    // Debe fallar con 500 e informar del error, jamás devolver 200 OK silencioso
    assert.equal(finRes.status, 500, 'Debe devolver HTTP 500 ante fallo de mezcla/codificación');
    const finBody = await finRes.json();
    assert.ok(finBody.error, 'Debe incluir mensaje de error explícito');
  });

  test('Canal Alpha en Exportación: detecta ProRes 4444 (yuva444p12le) y emite frames PNG RGBA transparentes', async () => {
    // 1. Verificar detección de formatos de píxel con canal Alpha
    assert.equal(isAlphaPixelFormat('yuva444p12le'), true);
    assert.equal(isAlphaPixelFormat('yuva420p'), true);
    assert.equal(isAlphaPixelFormat('rgba'), true);
    assert.equal(isAlphaPixelFormat('bgra'), true);
    assert.equal(isAlphaPixelFormat('yuv420p'), false);
    assert.equal(isAlphaPixelFormat('nv12'), false);

    // 2. Generar un video sintético corto (.mov ProRes 4444 con canal Alpha transparente) en el sandbox
    const alphaVideoPath = path.join(h.backend.sandbox.root, 'alpha_test_prores4444.mov');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=red@0.0:s=160x160:r=10:d=0.3,format=yuva444p10le',
      '-c:v', 'prores_ks',
      '-profile:v', '4444',
      '-pix_fmt', 'yuva444p10le',
      alphaVideoPath,
    ]);

    // 3. Solicitar decodificación al endpoint /api/export/decode-clip-frames
    const params = new URLSearchParams({
      path: alphaVideoPath,
      start: '0',
      duration: '0.2',
      fps: '10',
      width: '160',
      height: '160',
    });
    const res = await fetch(`${h.backend.origin}/api/export/decode-clip-frames?${params.toString()}`);
    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get('x-frame-mime'),
      'image/png',
      'El endpoint debe anunciar image/png para videos con canal Alpha'
    );

    const rawBytes = new Uint8Array(await res.arrayBuffer());
    assert.ok(rawBytes.length > 24, 'El flujo debe contener bytes PNG');

    // 4. Extraer el primer y segundo fotograma con el parser de producción extractNextImageFrameFromBuffer
    const first = extractNextImageFrameFromBuffer(rawBytes, 'image/png');
    assert.ok(first, 'Se debe extraer el primer fotograma PNG completo');
    // Firma PNG: 89 50 4E 47
    assert.equal(first!.frame[0], 0x89);
    assert.equal(first!.frame[1], 0x50);
    assert.equal(first!.frame[2], 0x4e);
    assert.equal(first!.frame[3], 0x47);
    // Color type de PNG en IHDR (offset 25): 6 = RGBA (Truecolor with alpha)
    assert.equal(first!.frame[25], 6, 'El PNG generado debe ser tipo 6 (RGBA con canal Alpha)');

    const second = extractNextImageFrameFromBuffer(first!.remaining, 'image/png');
    assert.ok(second, 'Se debe extraer el segundo fotograma PNG del stream continuo');
    assert.equal(second!.frame[25], 6);
  });
});
