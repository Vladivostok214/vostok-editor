import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AnimatableProperty, TimelineClip } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { findKeyframeAtTime, findClosestKeyframe } from '../../lib/keyframeEngine';

export interface KeyframeControlGroupProps {
  clip: TimelineClip;
  property: AnimatableProperty | [AnimatableProperty, AnimatableProperty];
  currentValue: number | [number, number];
  className?: string;
}

export const KeyframeControlGroup: React.FC<KeyframeControlGroupProps> = ({
  clip,
  property,
  currentValue,
  className = '',
}) => {
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const setPlayheadTime = useProjectStore((s) => s.setPlayheadTime);
  const setClipKeyframe = useProjectStore((s) => s.setClipKeyframe);
  const removeClipKeyframe = useProjectStore((s) => s.removeClipKeyframe);

  const isDual = Array.isArray(property);
  const prop1 = isDual ? property[0] : property;
  const prop2 = isDual ? property[1] : undefined;

  const val1 = isDual ? (currentValue as [number, number])[0] : (currentValue as number);
  const val2 = isDual ? (currentValue as [number, number])[1] : undefined;

  const kfs1 = clip.keyframes?.[prop1] || [];
  const kfs2 = prop2 && clip.keyframes?.[prop2] ? clip.keyframes[prop2]! : [];

  const timeOffset = Math.max(0, Math.min(clip.duration, Number((playheadTime - clip.startTime).toFixed(3))));
  const isPlayheadWithinClip =
    playheadTime >= clip.startTime - 0.033 && playheadTime <= clip.startTime + clip.duration + 0.033;

  // Keyframe activo en la posición actual del cabezal
  const activeKf1 = findKeyframeAtTime(kfs1, timeOffset, 0.033);
  const activeKf2 = prop2 ? findKeyframeAtTime(kfs2, timeOffset, 0.033) : undefined;
  const hasActiveKeyframe = isDual ? Boolean(activeKf1 || activeKf2) : Boolean(activeKf1);

  // Búsqueda de keyframe anterior
  const prevKf1 = findClosestKeyframe(kfs1, timeOffset, 'prev', 0.033);
  const prevKf2 = prop2 ? findClosestKeyframe(kfs2, timeOffset, 'prev', 0.033) : undefined;
  const prevCandidates = [prevKf1?.timeOffset, prevKf2?.timeOffset].filter(
    (t): t is number => typeof t === 'number'
  );
  const prevTimeOffset = prevCandidates.length > 0 ? Math.max(...prevCandidates) : undefined;
  const hasPrev = prevTimeOffset !== undefined;

  // Búsqueda de keyframe siguiente
  const nextKf1 = findClosestKeyframe(kfs1, timeOffset, 'next', 0.033);
  const nextKf2 = prop2 ? findClosestKeyframe(kfs2, timeOffset, 'next', 0.033) : undefined;
  const nextCandidates = [nextKf1?.timeOffset, nextKf2?.timeOffset].filter(
    (t): t is number => typeof t === 'number'
  );
  const nextTimeOffset = nextCandidates.length > 0 ? Math.min(...nextCandidates) : undefined;
  const hasNext = nextTimeOffset !== undefined;

  // Navegar al keyframe anterior
  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (prevTimeOffset === undefined) return;
    setPlayheadTime(Number((clip.startTime + prevTimeOffset).toFixed(3)));
  };

  // Navegar al keyframe siguiente
  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nextTimeOffset === undefined) return;
    setPlayheadTime(Number((clip.startTime + nextTimeOffset).toFixed(3)));
  };

  // Conmutar / Añadir / Eliminar keyframe
  const handleToggleKeyframe = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Si el cabezal está fuera del clip, mover primero el cabezal al inicio del clip
    if (!isPlayheadWithinClip) {
      setPlayheadTime(clip.startTime);
    }

    if (hasActiveKeyframe) {
      // Eliminar keyframe(s) existente(s) en este instante
      if (activeKf1) {
        await removeClipKeyframe(clip.id, prop1, activeKf1.id);
      }
      if (prop2 && activeKf2) {
        await removeClipKeyframe(clip.id, prop2, activeKf2.id);
      }
    } else {
      // Añadir nuevo keyframe con el valor actual
      await setClipKeyframe(clip.id, prop1, timeOffset, val1);
      if (prop2 && val2 !== undefined) {
        await setClipKeyframe(clip.id, prop2, timeOffset, val2);
      }
    }
  };

  return (
    <div className={`flex items-center gap-0.5 select-none ${className}`}>
      {/* Botón Ir al Keyframe Anterior */}
      <button
        type="button"
        onClick={handlePrev}
        disabled={!hasPrev}
        title={hasPrev ? `Ir al keyframe anterior (${(clip.startTime + prevTimeOffset!).toFixed(2)}s)` : 'No hay keyframe anterior'}
        className={`p-0.5 rounded transition ${
          hasPrev
            ? 'text-gray-400 hover:text-white hover:bg-white/[0.08]'
            : 'text-gray-600/40 cursor-not-allowed opacity-40'
        }`}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Botón Rombo de Keyframe (◇ / ◆) */}
      <button
        type="button"
        onClick={handleToggleKeyframe}
        title={
          hasActiveKeyframe
            ? `Eliminar fotograma clave en ${(clip.startTime + timeOffset).toFixed(2)}s`
            : `Añadir fotograma clave en ${(clip.startTime + timeOffset).toFixed(2)}s`
        }
        className="p-1 rounded hover:bg-white/[0.08] transition flex items-center justify-center group"
      >
        {hasActiveKeyframe ? (
          // Rombo activo relleno en cian brillante
          <div className="w-2.5 h-2.5 rotate-45 bg-[#00d4e5] border border-white shadow-[0_0_6px_#00d4e5] transition-transform group-hover:scale-125" />
        ) : (
          // Rombo inactivo contorno
          <div className="w-2.5 h-2.5 rotate-45 border border-gray-400 group-hover:border-white transition-colors" />
        )}
      </button>

      {/* Botón Ir al Siguiente Keyframe */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!hasNext}
        title={hasNext ? `Ir al siguiente keyframe (${(clip.startTime + nextTimeOffset!).toFixed(2)}s)` : 'No hay keyframe siguiente'}
        className={`p-0.5 rounded transition ${
          hasNext
            ? 'text-gray-400 hover:text-white hover:bg-white/[0.08]'
            : 'text-gray-600/40 cursor-not-allowed opacity-40'
        }`}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
