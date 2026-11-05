import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireSandbox, resolveInside } from '../helpers/sandbox';
import { evaluatePropertyAtTime, buildFFmpegVolumeExpression } from '../../src/lib/keyframeEngine';
import type { Keyframe } from '../../src/types/project';

const execFileAsync = promisify(execFile);

/**
 * Migración de scripts/verify_keyframes_stage4.ts (FASE 11 · Etapa 4).
 *
 * Cambios frente al original:
 * - Usa extractWaveformPeaks de PRODUCCIÓN (server/mediaBackendPlugin.ts) en lugar de
 *   una copia local que ya había divergido (no aplicaba el clamp [0.06, 1]).
 * - Trabaja en el sandbox (antes: /tmp/vostok_phase11_stage4 fijo).
 * - Comprueba el efecto final: el WAV renderizado por FFmpeg con el filtro generado
 *   por producción tiene la envolvente de volumen esperada.
 */

const volumeKeyframes: Keyframe[] = [
  { id: 'v1', timeOffset: 1.0, value: 0.2, interpolation: 'linear' },
  { id: 'v2', timeOffset: 3.0, value: 1.0, interpolation: 'ease-in-out' },
  { id: 'v3', timeOffset: 5.0, value: 0.1, interpolation: 'linear' },
];

function close(actual: number, expected: number, eps: number, msg = '') {
  assert.ok(Math.abs(actual - expected) <= eps, `esperado ${expected}±${eps}, obtenido ${actual}. ${msg}`);
}

describe('audio keyframes · evaluación en vivo', () => {
  test('evaluatePropertyAtTime sobre volumen (Web Audio): antes, medio, pico, después', () => {
    close(evaluatePropertyAtTime(volumeKeyframes, 1.0, 0.5), 0.2, 0.001, 'antes del primero');
    close(evaluatePropertyAtTime(volumeKeyframes, 1.0, 2.0), 0.6, 0.001, 'punto medio lineal');
    close(evaluatePropertyAtTime(volumeKeyframes, 1.0, 3.0), 1.0, 0.001, 'pico');
    close(evaluatePropertyAtTime(volumeKeyframes, 1.0, 5.5), 0.1, 0.001, 'después del último');
  });
});

describe('audio keyframes · expresión FFmpeg', () => {
  test('buildFFmpegVolumeExpression: undefined, constante y multi-keyframe', () => {
    assert.equal(buildFFmpegVolumeExpression(undefined), null);
    assert.equal(buildFFmpegVolumeExpression([{ id: 'v1', timeOffset: 0, value: 0.75 }]), 'volume=0.750');
    const multi = buildFFmpegVolumeExpression(volumeKeyframes);
    assert.ok(multi);
    assert.ok(multi!.startsWith("volume=eval=frame:volume='if(isnan(t)"), 'guarda NaN');
    assert.equal(multi!.includes('ease-in-out'), false, 'ease-in-out expandido a polinomio');
    assert.ok(multi!.includes('pow('), 'términos SmoothStep');
  });
});

describe('audio keyframes · renderizado real con FFmpeg (sandbox)', () => {
  let work: string;
  let extractWaveformPeaks: (file: string, n?: number) => Promise<number[]>;

  before(async () => {
    const sb = requireSandbox();
    work = resolveInside(sb.root, 'work/stage4');
    fs.mkdirSync(work, { recursive: true });
    // Importar producción DESPUÉS de validar el sandbox.
    ({ extractWaveformPeaks } = await import('../../server/mediaBackendPlugin'));
  });

  test('el audio exportado con el filtro de producción sigue la envolvente de volumen', async () => {
    const source = path.join(work, 'source_tone_6s.wav');
    const exported = path.join(work, 'keyframed_export_6s.wav');
    await execFileAsync('ffmpeg', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'pcm_s16le', source, '-y']);
    const filter = buildFFmpegVolumeExpression(volumeKeyframes)!;
    await execFileAsync('ffmpeg', ['-i', source, '-af', filter, exported, '-y']);
    assert.ok(fs.statSync(exported).size > 0, 'el archivo exportado existe y no está vacío');

    const peaks = await extractWaveformPeaks(exported, 60);
    assert.equal(peaks.length, 60);
    // Detecta el fallback de producción (0.25 plano) que ocultaría un fallo de FFmpeg.
    assert.notEqual(new Set(peaks).size, 1, 'los picos no pueden ser el fallback plano');
    close(peaks[5], 0.2, 0.08, 'pico al inicio (~0.5s)');
    close(peaks[30], 1.0, 0.05, 'pico central (~3.0s)');
    close(peaks[55], 0.1, 0.08, 'pico final (~5.5s)');
  });
});
