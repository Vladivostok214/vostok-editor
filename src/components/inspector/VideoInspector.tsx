import React from 'react';
import { Sparkles } from 'lucide-react';
import type { TimelineClip } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { TransformSection } from './TransformSection';
import { AudioInspector } from './AudioInspector';

interface VideoInspectorProps {
  clip: TimelineClip;
  activeTab: 'basic' | 'audio' | 'transitions';
}

const TRANSITION_OPTIONS = [
  { id: 'crossfade', label: 'Disolución (Crossfade)', desc: 'Fundido suave y continuo' },
  { id: 'dipToBlack', label: 'Fundido a negro', desc: 'Atenuación a negro y apertura' },
  { id: 'slideLeft', label: 'Deslizar a la izquierda', desc: 'Entrada dinámica lateral' },
  { id: 'wipe', label: 'Barrido (Wipe)', desc: 'Corte diagonal progresivo' },
  { id: 'zoom', label: 'Zoom dinámico', desc: 'Transición con escala acelerada' },
];

export const VideoInspector: React.FC<VideoInspectorProps> = ({ clip, activeTab }) => {
  const currentProject = useProjectStore((s) => s.currentProject);
  const setClipOverlapTransition = useProjectStore((s) => s.setClipOverlapTransition);

  // Detectar si el clip tiene un cruce activo en el proyecto
  const activeOverlap = React.useMemo(() => {
    if (!currentProject) return null;
    const sameTrackClips = currentProject.clips
      .filter((c) => c.trackId === clip.trackId)
      .sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sameTrackClips.length - 1; i++) {
      const a = sameTrackClips[i];
      const b = sameTrackClips[i + 1];
      if (b.startTime < a.startTime + a.duration) {
        const dur = Number((a.startTime + a.duration - b.startTime).toFixed(2));
        if (a.id === clip.id || b.id === clip.id) {
          return { clipA: a, clipB: b, duration: dur };
        }
      }
    }
    return null;
  }, [currentProject, clip]);

  if (activeTab === 'audio') {
    return <AudioInspector clip={clip} />;
  }

  if (activeTab === 'transitions') {
    return (
      <div className="space-y-3">
        {activeOverlap && (
          <div className="px-2.5 py-1.5 rounded-lg bg-[#00d4e5]/15 border border-[#00d4e5]/40 text-[#00d4e5] text-[11px] flex items-center justify-between">
            <span>Cruce activo detectado</span>
            <span className="font-mono font-bold">{activeOverlap.duration}s</span>
          </div>
        )}

        <div className="space-y-1.5">
          {TRANSITION_OPTIONS.map((opt) => {
            const currentVal = activeOverlap
              ? activeOverlap.clipB.overlapTransition
              : clip.overlapTransition;
            const active = currentVal === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const targetId = activeOverlap ? activeOverlap.clipB.id : clip.id;
                  setClipOverlapTransition(targetId, opt.id as any);
                }}
                className={`w-full p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                  active
                    ? 'bg-[#00d4e5]/15 border-[#00d4e5] text-[#00d4e5]'
                    : 'bg-white/[0.04] border-white/[0.08] text-gray-200 hover:bg-white/[0.08] hover:border-white/[0.15]'
                }`}
              >
                <div>
                  <div className="font-semibold text-xs">{opt.label}</div>
                  <div className="text-[10px] text-gray-400">{opt.desc}</div>
                </div>
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // TAB: BÁSICO (Transform & Opacity)
  return <TransformSection clip={clip} />;
};
