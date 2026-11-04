import type { Keyframe, InterpolationType } from '../types/project';

/**
 * Normaliza un factor u en [0, 1] aplicando la curva de interpolación especificada.
 */
export function interpolateFactor(u: number, type: InterpolationType = 'linear'): number {
  const clampedU = Math.max(0, Math.min(1, u));

  switch (type) {
    case 'ease-in-out':
      // SmoothStep (cúbica Hermite): 3u^2 - 2u^3
      return clampedU * clampedU * (3 - 2 * clampedU);

    case 'ease-in':
      // Aceleración cuadrática
      return clampedU * clampedU;

    case 'ease-out':
      // Desaceleración cuadrática: 1 - (1 - u)^2
      return 1 - (1 - clampedU) * (1 - clampedU);

    case 'hold':
      // Mantiene el valor inicial hasta el instante exacto del siguiente keyframe
      return clampedU >= 1 ? 1 : 0;

    case 'linear':
    default:
      return clampedU;
  }
}

/**
 * Interpola un valor numérico entre v0 y v1 en el factor u aplicando la curva dada.
 */
export function interpolateValue(
  v0: number,
  v1: number,
  u: number,
  type: InterpolationType = 'linear'
): number {
  const factor = interpolateFactor(u, type);
  return v0 + (v1 - v0) * factor;
}

/**
 * Evalúa el valor de una propiedad en un instante `timeOffset` relativo al clip.
 * Función pura de cálculo ultra-rápido (< 1 microsegundo, 0 asignaciones de memoria).
 *
 * @param keyframes Lista ordenada de keyframes para la propiedad.
 * @param staticValue Valor estático por defecto si no existen keyframes.
 * @param timeOffset Tiempo relativo en segundos (0 <= timeOffset <= clip.duration).
 */
export function evaluatePropertyAtTime(
  keyframes: Keyframe[] | undefined,
  staticValue: number,
  timeOffset: number
): number {
  if (!keyframes || keyframes.length === 0) {
    return staticValue;
  }

  const len = keyframes.length;

  // Un solo keyframe -> valor constante en todo el clip
  if (len === 1) {
    return keyframes[0].value;
  }

  // Antes o exactamente en el primer keyframe -> valor del primer keyframe
  if (timeOffset <= keyframes[0].timeOffset) {
    return keyframes[0].value;
  }

  // Después o exactamente en el último keyframe -> valor del último keyframe
  const lastKf = keyframes[len - 1];
  if (timeOffset >= lastKf.timeOffset) {
    return lastKf.value;
  }

  // Para listas cortas (<= 16 keyframes, el 99% de los casos en NLE): búsqueda lineal directa
  if (len <= 16) {
    for (let i = 0; i < len - 1; i++) {
      const prev = keyframes[i];
      const next = keyframes[i + 1];
      if (timeOffset >= prev.timeOffset && timeOffset <= next.timeOffset) {
        const segDuration = next.timeOffset - prev.timeOffset;
        if (segDuration <= 0.0001) return prev.value;
        const u = (timeOffset - prev.timeOffset) / segDuration;
        return interpolateValue(prev.value, next.value, u, prev.interpolation);
      }
    }
    return lastKf.value;
  }

  // Para listas largas (> 16 keyframes): búsqueda binaria O(log N)
  let low = 0;
  let high = len - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (keyframes[mid].timeOffset <= timeOffset) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const prevIdx = Math.max(0, high);
  const nextIdx = Math.min(len - 1, low);

  const prev = keyframes[prevIdx];
  const next = keyframes[nextIdx];

  if (prevIdx === nextIdx) return prev.value;

  const segDuration = next.timeOffset - prev.timeOffset;
  if (segDuration <= 0.0001) return prev.value;

  const u = (timeOffset - prev.timeOffset) / segDuration;
  return interpolateValue(prev.value, next.value, u, prev.interpolation);
}

/**
 * Busca si existe un keyframe en un tiempo dado dentro de una tolerancia (por defecto 33ms ~ 1 fotograma a 30fps).
 */
export function findKeyframeAtTime(
  keyframes: Keyframe[] | undefined,
  timeOffset: number,
  tolerance = 0.033
): Keyframe | undefined {
  if (!keyframes || keyframes.length === 0) return undefined;
  return keyframes.find((k) => Math.abs(k.timeOffset - timeOffset) <= tolerance);
}

/**
 * Busca el keyframe más próximo anterior o siguiente respecto al tiempo dado para navegación rápida.
 */
export function findClosestKeyframe(
  keyframes: Keyframe[] | undefined,
  timeOffset: number,
  direction: 'prev' | 'next',
  tolerance = 0.033
): Keyframe | undefined {
  if (!keyframes || keyframes.length === 0) return undefined;

  if (direction === 'prev') {
    // El mayor timeOffset que sea estrictamente menor que (timeOffset - tolerance)
    let best: Keyframe | undefined;
    for (const k of keyframes) {
      if (k.timeOffset < timeOffset - tolerance) {
        if (!best || k.timeOffset > best.timeOffset) {
          best = k;
        }
      }
    }
    return best;
  } else {
    // El menor timeOffset que sea estrictamente mayor que (timeOffset + tolerance)
    let best: Keyframe | undefined;
    for (const k of keyframes) {
      if (k.timeOffset > timeOffset + tolerance) {
        if (!best || k.timeOffset < best.timeOffset) {
          best = k;
        }
      }
    }
    return best;
  }
}

/**
 * Retorna una copia ordenada ascendentemente de la lista de keyframes por `timeOffset`.
 */
export function sortKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.timeOffset - b.timeOffset);
}

/**
 * Inserta o actualiza un keyframe respetando la tolerancia de tiempo (evita duplicados microscópicos).
 */
export function insertOrUpdateKeyframe(
  keyframes: Keyframe[] | undefined,
  newKf: Keyframe,
  tolerance = 0.033
): Keyframe[] {
  const current = keyframes ? [...keyframes] : [];
  const existingIdx = current.findIndex((k) => Math.abs(k.timeOffset - newKf.timeOffset) <= tolerance);

  if (existingIdx >= 0) {
    // Actualizar valor e interpolación en el keyframe existente
    current[existingIdx] = {
      ...current[existingIdx],
      value: newKf.value,
      interpolation: newKf.interpolation || current[existingIdx].interpolation,
      timeOffset: newKf.timeOffset, // Ajusta al tiempo exacto
    };
    return sortKeyframes(current);
  }

  current.push(newKf);
  return sortKeyframes(current);
}

/**
 * Elimina un keyframe por su ID único.
 */
export function removeKeyframeById(
  keyframes: Keyframe[] | undefined,
  keyframeId: string
): Keyframe[] {
  if (!keyframes) return [];
  return keyframes.filter((k) => k.id !== keyframeId);
}

/**
 * Genera la expresión del filtro de volumen de FFmpeg (eval=frame) para automatización por keyframes.
 * Retorna null si no hay keyframes o solo hay valores constantes para usar el filtro estándar.
 */
export function buildFFmpegVolumeExpression(
  keyframes: Keyframe[] | undefined,
  defaultVolume = 1.0
): string | null {
  if (!keyframes || keyframes.length === 0) return null;
  if (keyframes.length === 1) {
    return `volume=${keyframes[0].value.toFixed(3)}`;
  }

  const sorted = sortKeyframes(keyframes);
  const n = sorted.length;
  const first = sorted[0];
  const last = sorted[n - 1];

  let expr = `${last.value.toFixed(3)}`;

  for (let i = n - 2; i >= 0; i--) {
    const kPrev = sorted[i];
    const kNext = sorted[i + 1];
    const dur = kNext.timeOffset - kPrev.timeOffset;
    const v0 = kPrev.value;
    const v1 = kNext.value;
    const interp = kPrev.interpolation || 'linear';

    let segExpr = '';
    if (dur <= 0.0001) {
      segExpr = `${v0.toFixed(3)}`;
    } else if (interp === 'hold') {
      segExpr = `${v0.toFixed(3)}`;
    } else if (interp === 'ease-in-out') {
      const u = `((t-${kPrev.timeOffset.toFixed(3)})/${dur.toFixed(3)})`;
      segExpr = `${v0.toFixed(3)}+${(v1 - v0).toFixed(3)}*(pow(${u},2)*(3-2*${u}))`;
    } else if (interp === 'ease-in') {
      const u = `((t-${kPrev.timeOffset.toFixed(3)})/${dur.toFixed(3)})`;
      segExpr = `${v0.toFixed(3)}+${(v1 - v0).toFixed(3)}*pow(${u},2)`;
    } else if (interp === 'ease-out') {
      const u = `((t-${kPrev.timeOffset.toFixed(3)})/${dur.toFixed(3)})`;
      segExpr = `${v0.toFixed(3)}+${(v1 - v0).toFixed(3)}*(1-pow(1-${u},2))`;
    } else {
      // linear
      segExpr = `${v0.toFixed(3)}+${(v1 - v0).toFixed(3)}*((t-${kPrev.timeOffset.toFixed(3)})/${dur.toFixed(3)})`;
    }

    expr = `if(lt(t,${kNext.timeOffset.toFixed(3)}),${segExpr},${expr})`;
  }

  // Prepend checks for isnan(t) and t < first.timeOffset
  expr = `if(isnan(t),${first.value.toFixed(3)},if(lt(t,${first.timeOffset.toFixed(3)}),${first.value.toFixed(3)},${expr}))`;
  return `volume=eval=frame:volume='${expr}'`;
}
