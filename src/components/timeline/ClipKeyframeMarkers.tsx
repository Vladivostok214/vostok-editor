import React, { useMemo } from 'react';
import type { AnimatableProperty, TimelineClip } from '../../types/project';

export interface KeyframeCluster {
  timeOffset: number;
  properties: { property: AnimatableProperty; value: number }[];
}

export interface ClipKeyframeMarkersProps {
  clip: TimelineClip;
  timelineZoom: number;
  playheadTime: number;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string) => void;
  className?: string;
}

/**
 * Agrupa los keyframes de un clip que coinciden en el mismo tiempo (con tolerancia de 33ms)
 * para renderizar un único rombo limpio que represente todas las propiedades animadas en ese instante.
 */
export function getAggregatedClipKeyframes(clip: TimelineClip): KeyframeCluster[] {
  if (!clip.keyframes) return [];
  const map = new Map<number, { property: AnimatableProperty; value: number }[]>();

  (Object.keys(clip.keyframes) as AnimatableProperty[]).forEach((prop) => {
    // En clips de audio, el volumen se representa exclusivamente en VolumeRubberBand (curva de envolvente)
    if (clip.type === 'audio' && prop === 'volume') return;

    const list = clip.keyframes?.[prop];
    if (!list || list.length === 0) return;

    list.forEach((kf) => {
      // Redondear a 3 decimales
      const t = Number(kf.timeOffset.toFixed(3));
      // Buscar si ya existe un cluster dentro de la tolerancia de 33ms
      let foundKey: number | null = null;
      for (const existingTime of map.keys()) {
        if (Math.abs(existingTime - t) <= 0.033) {
          foundKey = existingTime;
          break;
        }
      }

      const targetKey = foundKey !== null ? foundKey : t;
      if (!map.has(targetKey)) {
        map.set(targetKey, []);
      }
      map.get(targetKey)!.push({ property: prop, value: kf.value });
    });
  });

  const clusters: KeyframeCluster[] = [];
  map.forEach((properties, timeOffset) => {
    clusters.push({ timeOffset, properties });
  });

  return clusters.sort((a, b) => a.timeOffset - b.timeOffset);
}

export const ClipKeyframeMarkers: React.FC<ClipKeyframeMarkersProps> = ({
  clip,
  timelineZoom,
  playheadTime,
  onSeek,
  onSelectClip,
  className = '',
}) => {
  const clusters = useMemo(() => getAggregatedClipKeyframes(clip), [clip.keyframes]);

  if (clusters.length === 0) {
    return null;
  }

  const clipWidthPx = clip.duration * timelineZoom;

  return (
    <div
      data-keyframe-markers-strip="true"
      className={`absolute left-0 right-0 bottom-1 h-3 pointer-events-none z-20 overflow-visible flex items-center ${className}`}
    >
      {clusters.map((cluster) => {
        // Posición horizontal en píxeles, con límite de margen para bordes redondeados
        const rawLeft = cluster.timeOffset * timelineZoom;
        const boundedLeft = Math.max(5, Math.min(clipWidthPx - 5, rawLeft));

        // Determinar si el cabezal de reproducción está situado en este keyframe
        const keyframeGlobalTime = clip.startTime + cluster.timeOffset;
        const isActive = Math.abs(playheadTime - keyframeGlobalTime) < 0.04;

        // Construir tooltip descriptivo
        const summary = cluster.properties
          .map((p) => {
            const formattedVal =
              p.property === 'opacity' || p.property === 'volume'
                ? `${Math.round(p.value * 100)}%`
                : p.property === 'rotation'
                ? `${Math.round(p.value)}°`
                : p.property === 'scale'
                ? `${p.value.toFixed(2)}x`
                : `${Math.round(p.value)}px`;
            return `${p.property}: ${formattedVal}`;
          })
          .join(', ');

        const tooltip = `Keyframe en ${(clip.startTime + cluster.timeOffset).toFixed(2)}s (${summary}) · Clic para saltar`;

        return (
          <div
            key={`kf_${cluster.timeOffset}`}
            data-keyframe-marker="true"
            data-keyframe-time={cluster.timeOffset}
            data-keyframe-active={isActive ? 'true' : 'false'}
            role="button"
            tabIndex={0}
            title={tooltip}
            onMouseDown={(e) => {
              // Evitar que el clic en el rombo inicie el arrastre del clip en el timeline
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectClip(clip.id);
              onSeek(Number((clip.startTime + cluster.timeOffset).toFixed(3)));
            }}
            style={{
              left: `${boundedLeft}px`,
            }}
            className={`absolute -translate-x-1/2 w-2.5 h-2.5 rotate-45 cursor-pointer pointer-events-auto transition-transform ${
              isActive
                ? 'bg-white border-2 border-[#00d4e5] ring-2 ring-[#00d4e5]/80 shadow-[0_0_8px_#00d4e5] scale-125 z-30'
                : 'bg-[#00d4e5] border border-black/80 hover:bg-white hover:scale-125 hover:shadow-[0_0_6px_#00d4e5] z-20'
            }`}
          />
        );
      })}
    </div>
  );
};
