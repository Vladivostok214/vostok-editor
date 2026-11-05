import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireSandbox, resolveInside } from '../helpers/sandbox';

const execFileAsync = promisify(execFile);

/**
 * Migración de scripts/verify_phase12.ts (FASE 12 · Formas de onda HD).
 *
 * Cambio principal: importa extractWaveformPeaks de PRODUCCIÓN
 * (server/mediaBackendPlugin.ts) en vez de copiar el algoritmo.
 *
 * Cobertura NO trasladada: el cálculo de corte temporal (computeSliceIndices) es una
 * réplica de lógica inline de src/components/AudioWaveformCanvas.tsx que no está
 * exportada; probarla aquí solo verificaría la copia. Ver test.skip al final.
 */

async function tone(out: string, seconds: number, freq: number, extra: string[] = []) {
  await execFileAsync('ffmpeg', ['-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`, ...extra, '-c:a', 'pcm_s16le', out, '-y']);
}

describe('FASE 12 · extractWaveformPeaks (producción) con audio real', () => {
  let extractWaveformPeaks: (file: string, n?: number) => Promise<number[]>;
  let f3: string;
  let f10: string;
  let fMod: string;

  before(async () => {
    const sb = requireSandbox();
    const work = resolveInside(sb.root, 'work/phase12');
    fs.mkdirSync(work, { recursive: true });
    ({ extractWaveformPeaks } = await import('../../server/mediaBackendPlugin'));
    f3 = path.join(work, 'tone_3s.wav');
    f10 = path.join(work, 'tone_10s.wav');
    fMod = path.join(work, 'mod_10s.wav');
    await tone(f3, 3, 440);
    await tone(f10, 10, 880);
    await tone(fMod, 10, 440, ['-af', "volume='sin(t)':eval=frame"]);
  });

  test('densidad: 50 picos/s devuelve la cantidad solicitada (150 y 500)', async () => {
    const p3 = await extractWaveformPeaks(f3, Math.max(120, Math.round(3 * 50)));
    const p10 = await extractWaveformPeaks(f10, Math.max(120, Math.round(10 * 50)));
    assert.equal(p3.length, 150);
    assert.equal(p10.length, 500);
  });

  test('normalización en [0.06, 1] y sin recurrir al fallback plano', async () => {
    const p = await extractWaveformPeaks(f3, 150);
    assert.ok(Math.min(...p) >= 0.059, `min=${Math.min(...p)}`);
    assert.ok(Math.max(...p) <= 1.001, `max=${Math.max(...p)}`);
    // Un tono constante normalizado alcanza 1.0; el fallback de error es 0.25 plano.
    assert.equal(Math.max(...p), 1, 'el máximo normalizado debe ser 1.0 (no el fallback 0.25)');
  });

  test('detecta modulación de amplitud real (min ≤ 0.1, max ≥ 0.9)', async () => {
    const p = await extractWaveformPeaks(fMod, 500);
    assert.ok(Math.min(...p) <= 0.1, `min=${Math.min(...p)}`);
    assert.ok(Math.max(...p) >= 0.9, `max=${Math.max(...p)}`);
  });

  test('un archivo inexistente devuelve el fallback documentado (0.25 plano), no lanza', async () => {
    const sb = requireSandbox();
    const missing = resolveInside(sb.root, 'work/phase12/no_existe.wav');
    const p = await extractWaveformPeaks(missing, 120);
    assert.equal(p.length, 120);
    assert.ok(p.every((v) => v === 0.25));
  });

  test.skip('corte temporal sourceStart/clipDuration (lógica inline de AudioWaveformCanvas, no exportada)', () => {
    // El original verificaba una réplica: [2s,6s] de 10s → índices 100..300 de 500 y clamp
    // al final [8s+5s] → 400..500. Sin exportar la lógica de producción solo se probaría la copia.
    // Pendiente: verificación de integración/nativa o extracción mínima autorizada en otra fase.
  });
});
