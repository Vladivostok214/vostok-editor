import React, { useMemo } from 'react';
import { Film, Image as ImageIcon, Music, Layers } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import type { MediaAsset } from '../types/project';

function formatDuration(sec: number): string {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Capa superpuesta (position: fixed) para el arrastre en la línea de tiempo:
 *  - Fantasma con la forma real del clip (ancho = duración × zoom) mientras se arrastra desde la biblioteca.
 *  - Si se arrastran múltiples medios, muestra una previsualización en pila con la duración acumulada total.
 *  - Marcador punteado sobre la pista destino, o línea cian si se creará una pista nueva.
 */
export const AssetDragLayer: React.FC = () => {
  const assetDrag = useProjectStore((s) => s.assetDrag);
  const dropIndicator = useProjectStore((s) => s.dropIndicator);
  const zoom = useProjectStore((s) => s.timelineZoom);
  const currentProject = useProjectStore((s) => s.currentProject);

  const draggedAssets = useMemo(() => {
    if (!assetDrag || !currentProject) return [];
    if (assetDrag.assetIds && assetDrag.assetIds.length > 1) {
      return assetDrag.assetIds
        .map((id) => currentProject.assets.find((a) => a.id === id))
        .filter((a): a is MediaAsset => Boolean(a));
    }
    const single = currentProject.assets.find((a) => a.id === assetDrag.assetId);
    return single ? [single] : [];
  }, [assetDrag, currentProject]);

  if (!assetDrag && !dropIndicator) return null;

  const isMulti = draggedAssets.length > 1;
  const primaryAsset = draggedAssets[0];
  const type = primaryAsset?.type;
  const totalDuration = draggedAssets.reduce((sum, a) => sum + (a.duration || 4), 0);
  const ghostWidth = primaryAsset ? Math.min(900, Math.max(120, totalDuration * zoom)) : 0;

  const ghostColors =
    type === 'audio'
      ? 'bg-[#10382b]/95 border-emerald-400/70'
      : type === 'image'
      ? 'bg-[#32265e]/95 border-violet-400/70'
      : 'bg-[#1b3a73]/95 border-blue-400/70';

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]">
      {/* Marcador de destino */}
      {dropIndicator &&
        (dropIndicator.kind === 'new-track' ? (
          <>
            <div
              style={{
                left: dropIndicator.rect.left,
                top: dropIndicator.rect.top,
                width: dropIndicator.rect.width,
                height: dropIndicator.rect.height,
              }}
              className="absolute rounded-full bg-[#00d4e5] shadow-[0_0_10px_rgba(0,212,229,0.8)]"
            />
            <div
              style={{
                left: dropIndicator.rect.left + 6,
                top: dropIndicator.rect.top - 9,
              }}
              className="absolute px-1.5 py-px rounded bg-[#00d4e5] text-[#0d0e11] text-[9px] font-semibold leading-tight"
            >
              Nueva pista
            </div>
          </>
        ) : (
          <div
            style={{
              left: dropIndicator.rect.left,
              top: dropIndicator.rect.top,
              width: dropIndicator.rect.width,
              height: dropIndicator.rect.height,
            }}
            className="absolute rounded-lg border-2 border-dashed border-[#00d4e5] bg-[#00d4e5]/20"
          />
        ))}

      {/* Fantasma del clip o conjunto de clips arrastrados */}
      {assetDrag && primaryAsset && (
        <>
          {/* Capa inferior en perspectiva para indicar múltiples archivos */}
          {isMulti && (
            <div
              style={{
                left: assetDrag.clientX + 5,
                top: assetDrag.clientY - 43,
                width: ghostWidth,
              }}
              className="absolute h-8 rounded-lg border border-[#00d4e5]/40 bg-[#0d1624]/90 shadow-md"
            />
          )}

          <div
            style={{
              left: assetDrag.clientX,
              top: assetDrag.clientY - 38,
              width: ghostWidth,
            }}
            className={`absolute h-8 rounded-lg border px-2 flex items-center gap-1.5 text-[10px] text-white font-medium shadow-xl shadow-black/60 ${ghostColors}`}
          >
            <span className="shrink-0 w-4 h-4 rounded bg-black/45 flex items-center justify-center">
              {isMulti ? (
                <Layers className="w-2.5 h-2.5 text-[#00d4e5]" />
              ) : type === 'audio' ? (
                <Music className="w-2.5 h-2.5" />
              ) : type === 'image' ? (
                <ImageIcon className="w-2.5 h-2.5" />
              ) : (
                <Film className="w-2.5 h-2.5" />
              )}
            </span>
            <span className="truncate">
              {isMulti ? `${draggedAssets.length} archivos seleccionados` : primaryAsset.name}
            </span>
            {isMulti && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#00d4e5] text-[#0d0e11] font-bold text-[9px]">
                ×{draggedAssets.length}
              </span>
            )}
            <span className="shrink-0 font-mono text-[9px] text-gray-200 ml-auto">
              {formatDuration(totalDuration)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};
