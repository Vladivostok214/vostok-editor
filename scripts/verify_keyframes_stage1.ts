import {
  interpolateFactor,
  interpolateValue,
  evaluatePropertyAtTime,
  findKeyframeAtTime,
  findClosestKeyframe,
  sortKeyframes,
  insertOrUpdateKeyframe,
  removeKeyframeById,
} from '../src/lib/keyframeEngine';
import type { Keyframe } from '../src/types/project';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertClose(actual: number, expected: number, eps = 0.001, msg = '') {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`Assertion failed: expected ${expected}, got ${actual}. ${msg}`);
  }
}

function runKeyframeStage1Tests() {
  console.log('🧪 Iniciando verificación de FASE 11 - ETAPA 1 (Tipos y Motor de Keyframes)...\n');

  // Test 1: Easing factors
  console.log('1. Verificando curvas de interpolación pura...');
  assertClose(interpolateFactor(0, 'linear'), 0, 0.0001, 'linear 0');
  assertClose(interpolateFactor(0.5, 'linear'), 0.5, 0.0001, 'linear 0.5');
  assertClose(interpolateFactor(1, 'linear'), 1, 0.0001, 'linear 1');

  // Clamping
  assertClose(interpolateFactor(-0.5, 'linear'), 0, 0.0001, 'clamp min');
  assertClose(interpolateFactor(1.5, 'linear'), 1, 0.0001, 'clamp max');

  // Ease-in-out (Smoothstep: 3u^2 - 2u^3)
  assertClose(interpolateFactor(0, 'ease-in-out'), 0, 0.0001, 'ease-in-out 0');
  assertClose(interpolateFactor(0.5, 'ease-in-out'), 0.5, 0.0001, 'ease-in-out 0.5');
  assertClose(interpolateFactor(1, 'ease-in-out'), 1, 0.0001, 'ease-in-out 1');
  assertClose(interpolateFactor(0.25, 'ease-in-out'), 0.15625, 0.0001, 'ease-in-out 0.25');
  assertClose(interpolateFactor(0.75, 'ease-in-out'), 0.84375, 0.0001, 'ease-in-out 0.75');

  // Ease-in (u^2)
  assertClose(interpolateFactor(0.5, 'ease-in'), 0.25, 0.0001, 'ease-in 0.5');

  // Ease-out (1 - (1-u)^2)
  assertClose(interpolateFactor(0.5, 'ease-out'), 0.75, 0.0001, 'ease-out 0.5');

  // Hold
  assertClose(interpolateFactor(0, 'hold'), 0, 0.0001, 'hold 0');
  assertClose(interpolateFactor(0.999, 'hold'), 0, 0.0001, 'hold 0.999');
  assertClose(interpolateFactor(1, 'hold'), 1, 0.0001, 'hold 1');
  console.log('   ✓ Todas las curvas matemáticas calculadas correctamente.');

  // Test 2: Value interpolation
  console.log('\n2. Verificando interpolación numérica entre extremos...');
  assertClose(interpolateValue(10, 50, 0.5, 'linear'), 30, 0.0001, 'linear lerp 10->50');
  assertClose(interpolateValue(0, 100, 0.5, 'ease-in'), 25, 0.0001, 'ease-in lerp 0->100');
  assertClose(interpolateValue(0, 100, 0.5, 'ease-out'), 75, 0.0001, 'ease-out lerp 0->100');
  console.log('   ✓ Interpolación de valores correcta.');

  // Test 3: evaluatePropertyAtTime edge cases
  console.log('\n3. Verificando casos límite de evaluatePropertyAtTime...');
  // No keyframes
  assert(evaluatePropertyAtTime(undefined, 42, 5) === 42, 'undefined keyframes');
  assert(evaluatePropertyAtTime([], 42, 5) === 42, 'empty keyframes');

  // Single keyframe
  const singleKf: Keyframe[] = [{ id: 'k1', timeOffset: 2.0, value: 85 }];
  assert(evaluatePropertyAtTime(singleKf, 42, 0) === 85, 'single kf at t=0');
  assert(evaluatePropertyAtTime(singleKf, 42, 2.0) === 85, 'single kf at t=2');
  assert(evaluatePropertyAtTime(singleKf, 42, 10.0) === 85, 'single kf at t=10');

  // Two keyframes (linear)
  const twoKf: Keyframe[] = [
    { id: 'k1', timeOffset: 1.0, value: 10, interpolation: 'linear' },
    { id: 'k2', timeOffset: 3.0, value: 50, interpolation: 'linear' },
  ];
  assert(evaluatePropertyAtTime(twoKf, 0, 0) === 10, 'before first kf');
  assert(evaluatePropertyAtTime(twoKf, 0, 1.0) === 10, 'at first kf');
  assertClose(evaluatePropertyAtTime(twoKf, 0, 2.0), 30, 0.0001, 'midpoint t=2');
  assert(evaluatePropertyAtTime(twoKf, 0, 3.0) === 50, 'at second kf');
  assert(evaluatePropertyAtTime(twoKf, 0, 5.0) === 50, 'after second kf');

  // Two keyframes with hold
  const holdKf: Keyframe[] = [
    { id: 'k1', timeOffset: 1.0, value: 10, interpolation: 'hold' },
    { id: 'k2', timeOffset: 3.0, value: 50, interpolation: 'linear' },
  ];
  assert(evaluatePropertyAtTime(holdKf, 0, 2.9) === 10, 'hold until end of segment');
  assert(evaluatePropertyAtTime(holdKf, 0, 3.0) === 50, 'hold transitions at next kf');
  console.log('   ✓ Casos límite y comportamiento de bordes verificados.');

  // Test 4: Long list binary search
  console.log('\n4. Verificando búsqueda binaria para listas largas (>16 keyframes)...');
  const longKfs: Keyframe[] = [];
  for (let i = 0; i < 30; i++) {
    longKfs.push({
      id: `kf_${i}`,
      timeOffset: i * 0.5, // 0.0, 0.5, 1.0 ... 14.5s
      value: i * 10,       // 0, 10, 20 ... 290
      interpolation: 'linear',
    });
  }

  // Test at exact point
  assert(evaluatePropertyAtTime(longKfs, 0, 5.0) === 100, 'long list exact t=5.0');
  // Test between points: t=5.25 -> midpoint between 100 (t=5.0) and 110 (t=5.5) -> 105
  assertClose(evaluatePropertyAtTime(longKfs, 0, 5.25), 105, 0.001, 'long list binary search t=5.25');
  console.log('   ✓ Búsqueda binaria O(log N) validada con 30 keyframes.');

  // Test 5: Keyframe search and navigation
  console.log('\n5. Verificando búsqueda por tiempo y navegación rápida (‹ / ›)...');
  const navKfs: Keyframe[] = [
    { id: 'k1', timeOffset: 1.0, value: 10 },
    { id: 'k2', timeOffset: 2.5, value: 25 },
    { id: 'k3', timeOffset: 4.0, value: 40 },
  ];

  // findKeyframeAtTime
  assert(findKeyframeAtTime(navKfs, 1.0) !== undefined, 'exact find');
  assert(findKeyframeAtTime(navKfs, 1.02) !== undefined, 'find within tolerance');
  assert(findKeyframeAtTime(navKfs, 1.1) === undefined, 'not found outside tolerance');

  // findClosestKeyframe
  const prevFrom3 = findClosestKeyframe(navKfs, 3.0, 'prev');
  assert(prevFrom3?.id === 'k2', 'closest prev from 3.0 is k2 (2.5s)');

  const nextFrom3 = findClosestKeyframe(navKfs, 3.0, 'next');
  assert(nextFrom3?.id === 'k3', 'closest next from 3.0 is k3 (4.0s)');

  // At k2 (2.5s):
  const prevFrom25 = findClosestKeyframe(navKfs, 2.5, 'prev');
  assert(prevFrom25?.id === 'k1', 'closest prev from 2.5s is k1 (1.0s)');

  const nextFrom25 = findClosestKeyframe(navKfs, 2.5, 'next');
  assert(nextFrom25?.id === 'k3', 'closest next from 2.5s is k3 (4.0s)');

  // Beyond extremes
  assert(findClosestKeyframe(navKfs, 0.5, 'prev') === undefined, 'no prev before first');
  assert(findClosestKeyframe(navKfs, 5.0, 'next') === undefined, 'no next after last');
  console.log('   ✓ Navegación anterior/siguiente de keyframes verificada.');

  // Test 6: Ingestion and deduplication
  console.log('\n6. Verificando inserción, deduplicación con tolerancia y eliminación...');
  let list: Keyframe[] = [];

  // Insert k1 at 1.0s
  list = insertOrUpdateKeyframe(list, { id: 'a', timeOffset: 1.0, value: 100 });
  assert(list.length === 1 && list[0].value === 100, 'first insert');

  // Insert k2 at 3.0s
  list = insertOrUpdateKeyframe(list, { id: 'b', timeOffset: 3.0, value: 300 });
  assert(list.length === 2 && list[1].timeOffset === 3.0, 'second insert');

  // Insert k3 at 2.0s -> check sorted insertion
  list = insertOrUpdateKeyframe(list, { id: 'c', timeOffset: 2.0, value: 200 });
  assert(list.length === 3 && list[1].id === 'c' && list[1].timeOffset === 2.0, 'sorted insert');

  // Update existing keyframe at 2.01s (within tolerance of 0.033s)
  list = insertOrUpdateKeyframe(list, { id: 'd', timeOffset: 2.01, value: 250 });
  assert(list.length === 3, 'deduplication did not increase array size');
  assert(list[1].value === 250, 'value was updated in place');

  // Remove by ID
  list = removeKeyframeById(list, 'c');
  assert(list.length === 2, 'remove by ID');
  assert(list.find((k) => k.id === 'c') === undefined, 'removed keyframe is gone');
  console.log('   ✓ Inserción ordenada, deduplicación y borrado validados.');

  console.log('\n✅ TODAS LAS PRUEBAS DE LA ETAPA 1 PASARON CON ÉXITO.');
}

runKeyframeStage1Tests();
