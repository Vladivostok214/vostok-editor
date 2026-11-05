import React from 'react';
import { Sparkles } from 'lucide-react';
import type { TimelineClip, TransitionType } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { TransformSection } from './TransformSection';
import { AudioInspector } from './AudioInspector';

interface VideoInspectorProps {
  clip: TimelineClip;
  activeTab: 'basic' | 'audio' | 'transitions';
}

export const TRANSITION_OPTIONS: {
  id: TransitionType;
  label: string;
  desc: string;
}[] = [
  { id: 'crossfade', label: 'Disolución (Crossfade)', desc: 'Fundido suave y continuo' },
  { id: 'fade-black', label: 'Fundido a negro', desc: 'Atenuación a negro y apertura' },
  { id: 'slide-left', label: 'Deslizar a la izquierda', desc: 'Entrada dinámica lateral' },
  { id: 'wipe-left', label: 'Barrido izquierda (Wipe)', desc: 'Corte progresivo hacia la izquierda' },
  { id: 'wipe-right', label: 'Barrido derecha (Wipe)', desc: 'Corte progresivo hacia la derecha' },
  { id: 'zoom', label: 'Zoom dinámico', desc: 'Transición con escala acelerada' },
];

export function normalizeTransitionType(raw?: string): TransitionType {
  switch (raw) {
    case 'crossfade':
    case 'fade-black':
    case 'slide-left':
    case 'wipe-left':
    case 'wipe-right':
    case 'zoom':
      return raw;
    case 'dipToBlack':
      return 'fade-black';
    case 'slideLeft':
      return 'slide-left';
    case 'wipe':
      return 'wipe-left';
    default:
      return 'crossfade';
  }
}

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

  // Resolver clip de audio vinculado cuando se abre la pestaña de audio de un clip de video
  const linkedAudioClip = React.useMemo(() => {
    if (!currentProject || clip.type !== 'video') return clip;
    if (clip.linkGroupId) {
      const peer = currentProject.clips.find(
        (c) => c.id !== clip.id && c.type === 'audio' && c.linkGroupId === clip.linkGroupId
      );
      if (peer) return peer;
    }
    return clip;
  }, [currentProject, clip]);

  if (activeTab === 'audio') {
    return <AudioInspector clip={linkedAudioClip} />;
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
            const rawVal = activeOverlap
              ? activeOverlap.clipB.overlapTransition
              : clip.overlapTransition;
            const currentVal = normalizeTransitionType(rawVal);
            const active = currentVal === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const targetId = activeOverlap ? activeOverlap.clipB.id : clip.id;
                  setClipOverlapTransition(targetId, opt.id);
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
