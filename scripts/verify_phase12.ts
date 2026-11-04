import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

// Helper to generate test audio with FFmpeg
async function generateTestTone(outputPath: string, duration = 3, freq = 440) {
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', `sine=frequency=${freq}:duration=${duration}`,
    '-c:a', 'pcm_s16le',
    outputPath,
    '-y',
  ]);
}

// Logic copied from server/mediaBackendPlugin.ts
async function extractWaveformPeaks(filePath: string, samplesCount = 120): Promise<number[]> {
  return new Promise((resolve) => {
    const proc = execFile(
      'ffmpeg',
      [
        '-i', filePath,
        '-vn',
        '-ac', '1',
        '-ar', '1000',
        '-f', 's16le',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 35 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || stdout.length < 4) {
          resolve(Array.from({ length: samplesCount }, () => 0.25));
          return;
        }
        const totalSamples = Math.floor(stdout.length / 2);
        if (totalSamples <= 0) {
          resolve(Array.from({ length: samplesCount }, () => 0.25));
          return;
        }

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
          const val = (end > start) ? peak : 0.05;
          if (val > maxPeak) maxPeak = val;
          peaks.push(val);
        }

        resolve(peaks.map((p) => Math.max(0.06, Math.min(1, Number((p / maxPeak).toFixed(3))))));
      }
    );
    proc.stdin?.end();
  });
}

// Simulation of AudioWaveformCanvas time-window slicing
function computeSliceIndices(
  totalPeaks: number,
  assetDuration: number,
  sourceStart: number,
  clipDuration: number
) {
  const safeAssetDuration = Math.max(0.01, assetDuration);
  const safeSourceStart = Math.max(0, sourceStart);
  const safeClipDuration = Math.max(0.01, clipDuration);

  const startRatio = Math.max(0, Math.min(1, safeSourceStart / safeAssetDuration));
  const endRatio = Math.max(0, Math.min(1, (safeSourceStart + safeClipDuration) / safeAssetDuration));

  const startIndex = Math.min(totalPeaks - 1, Math.max(0, Math.floor(startRatio * totalPeaks)));
  const endIndex = Math.min(totalPeaks, Math.max(startIndex + 1, Math.ceil(endRatio * totalPeaks)));

  return { startIndex, endIndex };
}

async function runTests() {
  console.log('🧪 Iniciando verificación rigurosa de FASE 12 (Formas de Onda HD)...\n');

  const testDir = '/tmp/vostok_phase12_test';
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const testFile3s = path.join(testDir, 'tone_3s.wav');
  const testFile10s = path.join(testDir, 'tone_10s.wav');
  const testFileMod = path.join(testDir, 'mod_10s.wav');

  // Test 1: Generate test audio files
  console.log('1. Generando archivos de audio de prueba con FFmpeg...');
  await generateTestTone(testFile3s, 3, 440);
  await generateTestTone(testFile10s, 10, 880);
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:duration=10',
    '-af', "volume='sin(t)':eval=frame",
    testFileMod,
    '-y',
  ]);
  console.log('   ✓ Archivos generados correctamente en', testDir);

  // Test 2: Verify high-density peak calculation
  console.log('\n2. Verificando densidad de picos temporales (50 picos/segundo)...');
  const targetSamples3s = Math.max(120, Math.round(3 * 50)); // 150
  const targetSamples10s = Math.max(120, Math.round(10 * 50)); // 500

  const peaks3s = await extractWaveformPeaks(testFile3s, targetSamples3s);
  const peaks10s = await extractWaveformPeaks(testFile10s, targetSamples10s);

  if (peaks3s.length !== 150) throw new Error(`Esperado 150 picos para 3s, obtenido ${peaks3s.length}`);
  if (peaks10s.length !== 500) throw new Error(`Esperado 500 picos para 10s, obtenido ${peaks10s.length}`);
  console.log(`   ✓ 3s: ${peaks3s.length} picos (esperado 150)`);
  console.log(`   ✓ 10s: ${peaks10s.length} picos (esperado 500)`);

  // Test 3: Normalization bounds
  console.log('\n3. Verificando rangos de normalización [0.06, 1.0]...');
  const min3s = Math.min(...peaks3s);
  const max3s = Math.max(...peaks3s);
  if (min3s < 0.059 || max3s > 1.001) throw new Error(`Límites inválidos: min=${min3s}, max=${max3s}`);
  console.log(`   ✓ Rango verificado: min=${min3s}, max=${max3s}`);

  // Test 4: Variable amplitude detection
  console.log('\n4. Verificando detección de modulación de amplitud (dinámica real)...');
  const peaksMod = await extractWaveformPeaks(testFileMod, 500);
  const minMod = Math.min(...peaksMod);
  const maxMod = Math.max(...peaksMod);
  if (minMod > 0.1 || maxMod < 0.9) throw new Error('Fallo detectando modulación dinámica');
  console.log(`   ✓ Dinámica detectada correctamente: min=${minMod}, max=${maxMod}`);

  // Test 5: Mathematical trimming & window slicing
  console.log('\n5. Verificando corte temporal (sourceStart y clipDuration)...');
  // Clip of 4s starting at 2s of a 10s asset:
  const slice1 = computeSliceIndices(500, 10, 2, 4);
  // Expected: start ~ 100, end ~ 300
  if (slice1.startIndex !== 100 || slice1.endIndex !== 300) {
    throw new Error(`Índices de corte incorrectos: ${JSON.stringify(slice1)}`);
  }
  console.log(`   ✓ Corte [2s a 6s]: startIndex=${slice1.startIndex}, endIndex=${slice1.endIndex} (200 picos visibles)`);

  // Edge cases
  const sliceClamped = computeSliceIndices(500, 10, 8, 5); // Exceeds duration
  if (sliceClamped.startIndex !== 400 || sliceClamped.endIndex !== 500) {
    throw new Error(`Clamp al final incorrecto: ${JSON.stringify(sliceClamped)}`);
  }
  console.log(`   ✓ Clamp al final [8s + 5s en 10s]: startIndex=${sliceClamped.startIndex}, endIndex=${sliceClamped.endIndex}`);

  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('\n✅ TODAS LAS PRUEBAS DE LA FASE 12 PASARON CON ÉXITO.');
}

runTests().catch((err) => {
  console.error('\n❌ ERROR EN PRUEBAS:', err);
  process.exit(1);
});
