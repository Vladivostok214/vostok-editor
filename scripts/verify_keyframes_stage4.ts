import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  evaluatePropertyAtTime,
  buildFFmpegVolumeExpression,
} from '../src/lib/keyframeEngine';
import type { Keyframe } from '../src/types/project';

const execFileAsync = promisify(execFile);

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

async function extractPeaks(filePath: string, samplesCount = 60): Promise<number[]> {
  const { stdout } = await execFileAsync('ffmpeg', [
    '-i', filePath,
    '-vn',
    '-ac', '1',
    '-ar', '1000',
    '-f', 's16le',
    'pipe:1',
  ], { encoding: 'buffer', maxBuffer: 35 * 1024 * 1024 });

  const totalSamples = Math.floor(stdout.length / 2);
  const peaks: number[] = [];
  let maxPeak = 0.01;
  const step = totalSamples / samplesCount;

  for (let i = 0; i < samplesCount; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(totalSamples, Math.max(start + 1, Math.floor((i + 1) * step)));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const sample = Math.abs(stdout.readInt16LE(j * 2)) / 32768;
      if (sample > peak) peak = sample;
    }
    const val = end > start ? peak : 0.05;
    if (val > maxPeak) maxPeak = val;
    peaks.push(val);
  }

  return peaks.map((p) => Number((p / maxPeak).toFixed(3)));
}

async function runKeyframeStage4Tests() {
  console.log('🧪 Iniciando verificación de FASE 11 - ETAPA 4 (Pipeline de Audio y FFmpeg)...\n');

  const testDir = '/tmp/vostok_phase11_stage4';
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const sourceAudio = path.join(testDir, 'source_tone_6s.wav');
  const exportedAudio = path.join(testDir, 'keyframed_export_6s.wav');

  // Test 1: Live playback audio evaluation simulation
  console.log('1. Verificando evaluación de volumen en tiempo real (Live Web Audio)...');
  const volumeKeyframes: Keyframe[] = [
    { id: 'v1', timeOffset: 1.0, value: 0.2, interpolation: 'linear' },
    { id: 'v2', timeOffset: 3.0, value: 1.0, interpolation: 'ease-in-out' },
    { id: 'v3', timeOffset: 5.0, value: 0.1, interpolation: 'linear' },
  ];

  const baseVol0 = evaluatePropertyAtTime(volumeKeyframes, 1.0, 0.5); // Before first -> 0.2
  assertClose(baseVol0, 0.2, 0.001, 'volume before first keyframe');

  const baseVolMid = evaluatePropertyAtTime(volumeKeyframes, 1.0, 2.0); // Midpoint between 0.2 and 1.0 -> 0.6
  assertClose(baseVolMid, 0.6, 0.001, 'volume at linear midpoint');

  const baseVolPeak = evaluatePropertyAtTime(volumeKeyframes, 1.0, 3.0); // Peak -> 1.0
  assertClose(baseVolPeak, 1.0, 0.001, 'volume at peak keyframe');

  const baseVolEnd = evaluatePropertyAtTime(volumeKeyframes, 1.0, 5.5); // After last -> 0.1
  assertClose(baseVolEnd, 0.1, 0.001, 'volume after last keyframe');
  console.log('   ✓ Simulación de volumen en vivo para Web Audio validada.');

  // Test 2: Filter generation with buildFFmpegVolumeExpression
  console.log('\n2. Verificando generación de expresiones matemáticas de volumen para FFmpeg...');
  const nullFilter = buildFFmpegVolumeExpression(undefined);
  assert(nullFilter === null, 'undefined keyframes returns null');

  const singleFilter = buildFFmpegVolumeExpression([{ id: 'v1', timeOffset: 0, value: 0.75 }]);
  assert(singleFilter === 'volume=0.750', 'single keyframe returns constant volume');

  const multiFilter = buildFFmpegVolumeExpression(volumeKeyframes);
  assert(multiFilter !== null, 'multi-keyframe returns filter');
  assert(multiFilter!.startsWith("volume=eval=frame:volume='if(isnan(t)"), 'expression starts with NaN guard');
  assert(multiFilter!.includes('ease-in-out') === false, 'ease-in-out expanded into polynomial');
  assert(multiFilter!.includes('pow('), 'contains SmoothStep power terms');
  console.log('   ✓ Filtro generado:', multiFilter);

  // Test 3: Real FFmpeg processing with keyframed volume filter
  console.log('\n3. Ejecutando renderizado de audio real con FFmpeg...');
  // Generate a clean 6s sine wave
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=6',
    '-c:a', 'pcm_s16le',
    sourceAudio,
    '-y',
  ]);

  // Apply the generated volume filter
  await execFileAsync('ffmpeg', [
    '-i', sourceAudio,
    '-af', multiFilter!.replace(/^volume=/, 'volume='),
    exportedAudio,
    '-y',
  ]);

  assert(fs.existsSync(exportedAudio), 'exported audio file exists');
  console.log('   ✓ FFmpeg procesó el filtro dinámico sin errores.');

  // Test 4: Peak analysis on exported audio
  console.log('\n4. Verificando perfil acústico de la exportación...');
  const peaks = await extractPeaks(exportedAudio, 60);

  // At 0.5s (~index 5), volume should be ~0.2
  assertClose(peaks[5], 0.2, 0.08, 'start peak ~ 0.2');

  // At 3.0s (~index 30), volume should peak at 1.0
  assertClose(peaks[30], 1.0, 0.05, 'center peak ~ 1.0');

  // At 5.5s (~index 55), volume should be ~0.1
  assertClose(peaks[55], 0.1, 0.08, 'end peak ~ 0.1');

  const chars = '  ▂▃▄▅▆▇█';
  const asciiWave = peaks.map((p) => chars[Math.min(chars.length - 1, Math.floor(p * (chars.length - 1)))]).join('');
  console.log('   ✓ Curva acústica real verificada:\n   ' + asciiWave);

  // Cleanup
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n✅ TODAS LAS PRUEBAS DE LA ETAPA 4 PASARON CON ÉXITO.');
}

runKeyframeStage4Tests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
