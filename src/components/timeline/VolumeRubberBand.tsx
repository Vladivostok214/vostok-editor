import React, { useMemo, useRef } from 'react';
import type { Keyframe, TimelineClip } from '../../types/project';
import { evaluatePropertyAtTime } from '../../lib/keyframeEngine';
import { useProjectStore } from '../../store/useProjectStore';

export interface VolumeRubberBandProps {
  clip: TimelineClip;
  widthPx: number;
  heightPx?: number;
  timelineZoom: number;
  playheadTime: number;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string) => void;
  className?: string;
}

/**
 * Mapea el volumen (rango estándar 0.0 a 2.0) a la coordenada Y del SVG.
 * 0.0 (silencio) -> borde inferior (con margen)
 * 1.0 (ganancia unitaria 100%) -> centro exacto
 * 2.0 (boost +6dB) -> borde superior (con margen)
 */
export function computeVolumeY(volume: number, height: number): number {
  const safeVol = Math.max(0, Math.min(2, volume));
  const pad = 4;
  const usableHeight = Math.max(2, height - pad * 2);
  // Con safeVol = 0 -> ratio 0 -> usableHeight -> bottom
  // Con safeVol = 1 -> ratio 0.5 -> center
  // Con safeVol = 2 -> ratio 1 -> top
  const ratio = safeVol / 2;
  return Number((height - (pad + ratio * usableHeight)).toFixed(1));
}

/**
 * Genera las rutas SVG (línea de envolvente y polígono de área de sombreado)
 * evaluando con exactitud las curvas matemáticas de interpolación.
 */
export function buildVolumePath(
  keyframes: Keyframe[],
  clipDuration: number,
  defaultVolume: number,
  widthPx: number,
  heightPx: number,
  timelineZoom: number
): { pathD: string; areaD: string } {
  const safeWidth = Math.max(10, widthPx);

  if (!keyframes || keyframes.length === 0) {
    const y = computeVolumeY(defaultVolume, heightPx);
    const pathD = `M 0 ${y} L ${safeWidth} ${y}`;
    const areaD = `M 0 ${y} L ${safeWidth} ${y} L ${safeWidth} ${heightPx} L 0 ${heightPx} Z`;
    return { pathD, areaD };
  }

  const sorted = [...keyframes].sort((a, b) => a.timeOffset - b.timeOffset);
  const firstKf = sorted[0];
  const firstY = computeVolumeY(firstKf.value, heightPx);
  const firstX = Math.max(0, Math.min(safeWidth, firstKf.timeOffset * timelineZoom));

  let d = `M 0 ${firstY} L ${firstX.toFixed(1)} ${firstY}`;

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    const currY = computeVolumeY(curr.value, heightPx);
    const nextY = computeVolumeY(next.value, heightPx);
    const nextX = Math.max(0, Math.min(safeWidth, next.timeOffset * timelineZoom));

    if (curr.interpolation === 'hold') {
      d += ` L ${nextX.toFixed(1)} ${currY} L ${nextX.toFixed(1)} ${nextY}`;
    } else if (
      curr.interpolation === 'ease-in-out' ||
      curr.interpolation === 'ease-in' ||
      curr.interpolation === 'ease-out'
    ) {
      // Muestrear puntos intermedios para una curva Bezier/SmoothStep matemáticamente idéntica
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        const t = curr.timeOffset + (next.timeOffset - curr.timeOffset) * (s / steps);
        const v = evaluatePropertyAtTime(sorted, defaultVolume, t);
        const sampleX = Math.max(0, Math.min(safeWidth, t * timelineZoom));
        const sampleY = computeVolumeY(v, heightPx);
        d += ` L ${sampleX.toFixed(1)} ${sampleY}`;
      }
    } else {
      // Interpolación lineal directa
      d += ` L ${nextX.toFixed(1)} ${nextY}`;
    }
  }

  // Tramo final desde el último keyframe hasta el fin del clip
  const lastKf = sorted[sorted.length - 1];
  const lastY = computeVolumeY(lastKf.value, heightPx);
  d += ` L ${safeWidth.toFixed(1)} ${lastY}`;

  const areaD = `${d} L ${safeWidth.toFixed(1)} ${heightPx} L 0 ${heightPx} Z`;
  return { pathD: d, areaD };
}

export const VolumeRubberBand: React.FC<VolumeRubberBandProps> = ({
  clip,
  widthPx,
  heightPx = 28,
  timelineZoom,
  playheadTime,
  onSeek,
  onSelectClip,
  className = '',
}) => {
  const containerRef = useRef<SVGSVGElement>(null);
  const setClipKeyframe = useProjectStore((s) => s.setClipKeyframe);

  const rawKeyframes = clip.keyframes?.volume || [];
  const defaultVolume = clip.volume ?? 1.0;

  const { pathD, areaD } = useMemo(
    () => buildVolumePath(rawKeyframes, clip.duration, defaultVolume, widthPx, heightPx, timelineZoom),
    [rawKeyframes, clip.duration, defaultVolume, widthPx, heightPx, timelineZoom]
  );

  const sortedKeyframes = useMemo(
    () => [...rawKeyframes].sort((a, b) => a.timeOffset - b.timeOffset),
    [rawKeyframes]
  );

  const hasKeyframes = rawKeyframes.length > 0;

  // Doble clic en la envolvente añade un keyframe en el punto y valor exactos
  const handleDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const timeOffset = Math.max(0, Math.min(clip.duration, clickX / timelineZoom));
    const currentVal = evaluatePropertyAtTime(rawKeyframes, defaultVolume, timeOffset);

    setClipKeyframe(clip.id, 'volume', Number(timeOffset.toFixed(3)), Number(currentVal.toFixed(3)));
    onSelectClip(clip.id);
    onSeek(Number((clip.startTime + timeOffset).toFixed(3)));
  };

  return (
    <div
      title={
        hasKeyframes
          ? 'Envolvente de Volumen animada (Doble clic para añadir keyframe)'
          : `Volumen: ${Math.round(defaultVolume * 100)}% (Doble clic para animar)`
      }
      style={{
        width: `${Math.max(10, Math.round(widthPx))}px`,
        height: `${heightPx}px`,
      }}
      className={`absolute inset-0 pointer-events-auto select-none overflow-visible ${className}`}
    >
      <svg
        ref={containerRef}
        data-volume-rubber-band="true"
        onDoubleClick={handleDoubleClick}
        style={{
          width: '100%',
          height: '100%',
        }}
        className="overflow-visible"
      >
      <defs>
        <linearGradient id={`volGradient_${clip.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d4e5" stopOpacity={hasKeyframes ? '0.28' : '0.10'} />
          <stop offset="100%" stopColor="#00d4e5" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Área sombreada bajo la curva */}
      <path d={areaD} fill={`url(#volGradient_${clip.id})`} className="pointer-events-none" />

      {/* Línea de envolvente (Rubber-Band) */}
      <path
        d={pathD}
        fill="none"
        stroke={hasKeyframes ? '#00d4e5' : 'rgba(255, 255, 255, 0.35)'}
        strokeWidth={hasKeyframes ? 1.5 : 1}
        strokeDasharray={hasKeyframes ? undefined : '3 3'}
        className="pointer-events-none transition-colors"
        style={{
          filter: hasKeyframes ? 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75))' : undefined,
        }}
      />

      {/* Nodos de Keyframe sobre la línea */}
      {sortedKeyframes.map((kf) => {
        const kfX = Math.max(5, Math.min(widthPx - 5, kf.timeOffset * timelineZoom));
        const kfY = computeVolumeY(kf.value, heightPx);
        const isActive = Math.abs(playheadTime - (clip.startTime + kf.timeOffset)) < 0.04;

        return (
          <g
            key={kf.id}
            data-volume-keyframe-node="true"
            data-keyframe-time={kf.timeOffset}
            transform={`translate(${kfX.toFixed(1)}, ${kfY.toFixed(1)})`}
            className="cursor-pointer"
            onMouseDown={(e) => {
              // Prevenir arrastre del clip
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectClip(clip.id);
              onSeek(Number((clip.startTime + kf.timeOffset).toFixed(3)));
            }}
          >
            {/* Rombo del keyframe de volumen montado en la envolvente */}
            <rect
              x="-4.5"
              y="-4.5"
              width="9"
              height="9"
              transform="rotate(45)"
              fill={isActive ? '#ffffff' : '#00d4e5'}
              stroke={isActive ? '#00d4e5' : '#141517'}
              strokeWidth={isActive ? '2' : '1.5'}
              className="transition-transform hover:scale-125"
              style={{
                filter: isActive
                  ? 'drop-shadow(0 0 6px #00d4e5)'
                  : 'drop-shadow(0 0 3px rgba(0, 212, 229, 0.5))',
              }}
            >
              <title>{`Volumen: ${Math.round(kf.value * 100)}% en ${kf.timeOffset.toFixed(2)}s (${kf.interpolation || 'linear'}) · Clic para saltar`}</title>
            </rect>
          </g>
        );
      })}
      </svg>
    </div>
  );
};
