import React, { useLayoutEffect, useRef, useState } from 'react';
import { X, Sliders, Volume2, Sparkles, Type as TypeIcon } from 'lucide-react';
import type { TimelineClip } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { TextInspector } from './TextInspector';
import { VideoInspector } from './VideoInspector';
import { AudioInspector } from './AudioInspector';

interface InspectorPanelProps {
  clip: TimelineClip;
  onClose: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ clip, onClose }) => {
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);

  // Pestaña activa interna sólo relevante para clips de vídeo
  const [videoTab, setVideoTab] = useState<'basic' | 'audio' | 'transitions'>('basic');

  // Cuerpo con scroll: siempre debe mostrarse arriba al cambiar de clip, tipo o pestaña
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);

  // useLayoutEffect corre antes del pintado, así no hay ningún frame con el scroll anterior
  useLayoutEffect(() => {
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = 0;
    }
  }, [clip.id, clip.type, videoTab]);

  const getTitle = () => {
    if (clip.type === 'text') return 'Texto';
    if (clip.type === 'audio') return 'Audio';
    if (videoTab === 'basic') return 'Básico';
    if (videoTab === 'audio') return 'Audio';
    return 'Transición';
  };

  const isText = clip.type === 'text';
  const isAudio = clip.type === 'audio';
  const isVideoOrImage = clip.type === 'video' || clip.type === 'image';

  return (
    <div className="absolute right-2.5 top-2.5 bottom-2.5 flex items-stretch z-30 gap-1.5">
      {/* Tarjeta Flotante Glassmorphic Principal */}
      <aside className="w-80 bg-[#0d0e12] border border-white/[0.08] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
        {/* Cabecera de la tarjeta con título contextual y botón cerrar */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-white tracking-wide truncate">
              {getTitle()}
            </span>
            {selectedClipIds.length > 1 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4e5]/15 text-[#00d4e5] font-medium border border-[#00d4e5]/30 shrink-0">
                {selectedClipIds.length} clips
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar panel de propiedades"
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo del Inspector con scroll suave e independiente */}
        <div ref={scrollBodyRef} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-white/15">
          {isText && <TextInspector clip={clip} />}
          {isAudio && <AudioInspector clip={clip} />}
          {isVideoOrImage && <VideoInspector clip={clip} activeTab={videoTab} />}
        </div>
      </aside>

      {/* Barra lateral de pestañas (Rail): SÓLO se muestra cuando es VÍDEO para evitar conflictos en texto */}
      {isVideoOrImage && (
        <div className="w-14 bg-[#0d0e12] border border-white/[0.08] rounded-2xl py-2.5 px-1 flex flex-col items-center gap-2 shrink-0 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          <button
            type="button"
            onClick={() => setVideoTab('basic')}
            className={`w-full py-2 rounded-xl flex flex-col items-center gap-1 transition ${
              videoTab === 'basic'
                ? 'bg-white/[0.12] text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[10px]">Básico</span>
          </button>

          {clip.type !== 'image' && (
            <button
              type="button"
              onClick={() => setVideoTab('audio')}
              className={`w-full py-2 rounded-xl flex flex-col items-center gap-1 transition ${
                videoTab === 'audio'
                  ? 'bg-white/[0.12] text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span className="text-[10px]">Audio</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setVideoTab('transitions')}
            className={`w-full py-2 rounded-xl flex flex-col items-center gap-1 transition ${
              videoTab === 'transitions'
                ? 'bg-white/[0.12] text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px]">Transición</span>
          </button>
        </div>
      )}
    </div>
  );
};
