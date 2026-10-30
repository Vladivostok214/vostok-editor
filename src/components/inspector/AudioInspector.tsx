import React from 'react';
import { Unlink2, Link2 } from 'lucide-react';
import type { TimelineClip } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';

interface AudioInspectorProps {
  clip: TimelineClip;
}

export const AudioInspector: React.FC<AudioInspectorProps> = ({ clip }) => {
  const updateClip = useProjectStore((s) => s.updateClip);
  const toggleClipLinkGroup = useProjectStore((s) => s.toggleClipLinkGroup);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-gray-300 font-medium block">Volumen</label>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={150}
            value={Math.round(clip.volume * 100)}
            onChange={(e) =>
              updateClip(clip.id, {
                volume: Number(e.target.value) / 100,
              })
            }
            className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
          />
          <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
            {Math.round(clip.volume * 100)} %
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
        <label className="text-gray-300 font-medium block">Fundido de entrada (Fade In)</label>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={Math.min(5, clip.duration / 2)}
            step={0.1}
            value={clip.fadeIn}
            onChange={(e) => updateClip(clip.id, { fadeIn: Number(e.target.value) })}
            className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
          />
          <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
            {clip.fadeIn.toFixed(1)}s
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
        <label className="text-gray-300 font-medium block">Fundido de salida (Fade Out)</label>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={Math.min(5, clip.duration / 2)}
            step={0.1}
            value={clip.fadeOut}
            onChange={(e) => updateClip(clip.id, { fadeOut: Number(e.target.value) })}
            className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
          />
          <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
            {clip.fadeOut.toFixed(1)}s
          </div>
        </div>
      </div>

      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-gray-200 font-medium text-xs">Audio vinculado</span>
        <button
          type="button"
          onClick={() => toggleClipLinkGroup(clip.id)}
          className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-[#34363d] border border-[#363840] text-xs text-[#00d4e5] flex items-center gap-1.5 transition"
        >
          {clip.linkGroupId ? (
            <>
              <Unlink2 className="w-3.5 h-3.5" /> Separar
            </>
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5" /> Vincular
            </>
          )}
        </button>
      </div>
    </div>
  );
};
