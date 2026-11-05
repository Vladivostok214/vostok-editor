import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  interpolateFactor,
  interpolateValue,
  evaluatePropertyAtTime,
  findKeyframeAtTime,
  findClosestKeyframe,
  sortKeyframes,
  insertOrUpdateKeyframe,
  removeKeyframeById,
} from '../../src/lib/keyframeEngine';
import type { Keyframe } from '../../src/types/project';

/**
 * Migración de scripts/verify_keyframes_stage1.ts (FASE 11 · Etapa 1).
 * Todo se prueba contra funciones reales de producción (src/lib/keyframeEngine.ts);
 * el script original ya lo hacía, solo cambia el runner y el tipo de aserción.
 */

function close(actual: number, expected: number, eps = 0.0001, msg = '') {
  assert.ok(Math.abs(actual - expected) <= eps, `esperado ${expected}, obtenido ${actual}. ${msg}`);
}

describe('keyframeEngine · curvas e interpolación', () => {
  test('interpolateFactor: lineal, clamping, ease-in-out, ease-in, ease-out, hold', () => {
    close(interpolateFactor(0, 'linear'), 0);
    close(interpolateFactor(0.5, 'linear'), 0.5);
    close(interpolateFactor(1, 'linear'), 1);
    close(interpolateFactor(-0.5, 'linear'), 0, 0.0001, 'clamp min');
    close(interpolateFactor(1.5, 'linear'), 1, 0.0001, 'clamp max');

    close(interpolateFactor(0, 'ease-in-out'), 0);
    close(interpolateFactor(0.5, 'ease-in-out'), 0.5);
    close(interpolateFactor(1, 'ease-in-out'), 1);
    close(interpolateFactor(0.25, 'ease-in-out'), 0.15625);
    close(interpolateFactor(0.75, 'ease-in-out'), 0.84375);

    close(interpolateFactor(0.5, 'ease-in'), 0.25);
    close(interpolateFactor(0.5, 'ease-out'), 0.75);

    close(interpolateFactor(0, 'hold'), 0);
    close(interpolateFactor(0.999, 'hold'), 0);
    close(interpolateFactor(1, 'hold'), 1);
  });

  test('interpolateValue entre extremos', () => {
    close(interpolateValue(10, 50, 0.5, 'linear'), 30);
    close(interpolateValue(0, 100, 0.5, 'ease-in'), 25);
    close(interpolateValue(0, 100, 0.5, 'ease-out'), 75);
  });
});

describe('keyframeEngine · evaluatePropertyAtTime', () => {
  test('sin keyframes devuelve el valor base', () => {
    assert.equal(evaluatePropertyAtTime(undefined, 42, 5), 42);
    assert.equal(evaluatePropertyAtTime([], 42, 5), 42);
  });

  test('un solo keyframe es constante', () => {
    const single: Keyframe[] = [{ id: 'k1', timeOffset: 2.0, value: 85 }];
    for (const t of [0, 2, 10]) assert.equal(evaluatePropertyAtTime(single, 42, t), 85);
  });

  test('dos keyframes lineales: bordes y punto medio', () => {
    const two: Keyframe[] = [
      { id: 'k1', timeOffset: 1.0, value: 10, interpolation: 'linear' },
      { id: 'k2', timeOffset: 3.0, value: 50, interpolation: 'linear' },
    ];
    assert.equal(evaluatePropertyAtTime(two, 0, 0), 10);
    assert.equal(evaluatePropertyAtTime(two, 0, 1.0), 10);
    close(evaluatePropertyAtTime(two, 0, 2.0), 30);
    assert.equal(evaluatePropertyAtTime(two, 0, 3.0), 50);
    assert.equal(evaluatePropertyAtTime(two, 0, 5.0), 50);
  });

  test('hold mantiene el valor hasta el siguiente keyframe', () => {
    const hold: Keyframe[] = [
      { id: 'k1', timeOffset: 1.0, value: 10, interpolation: 'hold' },
      { id: 'k2', timeOffset: 3.0, value: 50, interpolation: 'linear' },
    ];
    assert.equal(evaluatePropertyAtTime(hold, 0, 2.9), 10);
    assert.equal(evaluatePropertyAtTime(hold, 0, 3.0), 50);
  });

  test('listas largas (30 keyframes): punto exacto e interpolado', () => {
    const long: Keyframe[] = Array.from({ length: 30 }, (_, i) => ({
      id: `kf_${i}`,
      timeOffset: i * 0.5,
      value: i * 10,
      interpolation: 'linear' as const,
    }));
    assert.equal(evaluatePropertyAtTime(long, 0, 5.0), 100);
    close(evaluatePropertyAtTime(long, 0, 5.25), 105, 0.001);
    // Nota: el contrato de producción exige una lista ordenada ("Lista ordenada de keyframes"),
    // por eso no se prueba la evaluación sobre listas desordenadas.
  });
});

describe('keyframeEngine · búsqueda, inserción y borrado', () => {
  const nav: Keyframe[] = [
    { id: 'k1', timeOffset: 1.0, value: 10 },
    { id: 'k2', timeOffset: 2.5, value: 25 },
    { id: 'k3', timeOffset: 4.0, value: 40 },
  ];

  test('findKeyframeAtTime respeta la tolerancia', () => {
    assert.notEqual(findKeyframeAtTime(nav, 1.0), undefined);
    assert.notEqual(findKeyframeAtTime(nav, 1.02), undefined);
    assert.equal(findKeyframeAtTime(nav, 1.1), undefined);
  });

  test('findClosestKeyframe prev/next y extremos', () => {
    assert.equal(findClosestKeyframe(nav, 3.0, 'prev')?.id, 'k2');
    assert.equal(findClosestKeyframe(nav, 3.0, 'next')?.id, 'k3');
    assert.equal(findClosestKeyframe(nav, 2.5, 'prev')?.id, 'k1');
    assert.equal(findClosestKeyframe(nav, 2.5, 'next')?.id, 'k3');
    assert.equal(findClosestKeyframe(nav, 0.5, 'prev'), undefined);
    assert.equal(findClosestKeyframe(nav, 5.0, 'next'), undefined);
  });

  test('sortKeyframes ordena sin mutar la entrada (cobertura adicional)', () => {
    const input: Keyframe[] = [
      { id: 'b', timeOffset: 2, value: 1 },
      { id: 'a', timeOffset: 1, value: 1 },
    ];
    assert.deepEqual(sortKeyframes(input).map((k) => k.id), ['a', 'b']);
    assert.deepEqual(input.map((k) => k.id), ['b', 'a']);
  });

  test('inserción ordenada, deduplicación con tolerancia y borrado por id', () => {
    let list: Keyframe[] = [];
    list = insertOrUpdateKeyframe(list, { id: 'a', timeOffset: 1.0, value: 100 });
    assert.equal(list.length, 1);
    assert.equal(list[0].value, 100);

    list = insertOrUpdateKeyframe(list, { id: 'b', timeOffset: 3.0, value: 300 });
    assert.equal(list.length, 2);
    assert.equal(list[1].timeOffset, 3.0);

    list = insertOrUpdateKeyframe(list, { id: 'c', timeOffset: 2.0, value: 200 });
    assert.equal(list.length, 3);
    assert.equal(list[1].id, 'c');
    assert.equal(list[1].timeOffset, 2.0);

    list = insertOrUpdateKeyframe(list, { id: 'd', timeOffset: 2.01, value: 250 });
    assert.equal(list.length, 3, 'la deduplicación no aumenta el tamaño');
    assert.equal(list[1].value, 250, 'se actualiza en el sitio');

    list = removeKeyframeById(list, 'c');
    assert.equal(list.length, 2);
    assert.equal(list.find((k) => k.id === 'c'), undefined);
  });
});
