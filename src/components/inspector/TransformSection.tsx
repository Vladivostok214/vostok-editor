import React from 'react';
import { FlipHorizontal, RotateCcw } from 'lucide-react';
import type { TimelineClip } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { evaluatePropertyAtTime } from '../../lib/keyframeEngine';
import { KeyframeControlGroup } from './KeyframeControlGroup';

interface TransformSectionProps {
  clip: TimelineClip;
}

export const TransformSection: React.FC<TransformSectionProps> = ({ clip }) => {
  const playheadTime = useProjectStore((s) => s.playheadTime);
  const updateClipTransformLive = useProjectStore((s) => s.updateClipTransformLive);
  const resetClipTransform = useProjectStore((s) => s.resetClipTransform);
  const flipClipHorizontal = useProjectStore((s) => s.flipClipHorizontal);
  const persistCurrentProject = useProjectStore((s) => s.persistCurrentProject);

  const tf = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, flipX: false };
  const timeOffset = Math.max(0, Math.min(clip.duration, Number((playheadTime - clip.startTime).toFixed(3))));

  // Animated values evaluated at current playhead time
  const currentOpacity = evaluatePropertyAtTime(clip.keyframes?.opacity, tf.opacity, timeOffset);
  const currentScale = evaluatePropertyAtTime(clip.keyframes?.scale, tf.scale, timeOffset);
  const currentX = evaluatePropertyAtTime(clip.keyframes?.x, tf.x, timeOffset);
  const currentY = evaluatePropertyAtTime(clip.keyframes?.y, tf.y, timeOffset);
  const currentRotation = evaluatePropertyAtTime(clip.keyframes?.rotation, tf.rotation, timeOffset);

  return (
    <div className="space-y-3 pt-3 border-t border-white/[0.06]">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
          Transformación
        </label>
        <button
          type="button"
          onClick={() => resetClipTransform(clip.id)}
          title="Restablecer posición, escala y rotación"
          className="text-gray-400 hover:text-white transition p-0.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Opacity Slider + % Box */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-300 font-medium">Opacidad</label>
          <KeyframeControlGroup
            clip={clip}
            property="opacity"
            currentValue={currentOpacity}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(currentOpacity * 100)}
            onChange={(e) => {
              updateClipTransformLive(clip.id, {
                opacity: Math.max(0, Math.min(1, Number(e.target.value) / 100)),
              });
              persistCurrentProject();
            }}
            className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
          />
          <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
            {Math.round(currentOpacity * 100)} %
          </div>
        </div>
      </div>

      {/* Scale Slider + % Box */}
      <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-300 font-medium">Escala</label>
          <KeyframeControlGroup
            clip={clip}
            property="scale"
            currentValue={currentScale}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={15}
            max={300}
            value={Math.round(currentScale * 100)}
            onChange={(e) => {
              updateClipTransformLive(clip.id, {
                scale: Math.max(0.15, Number(e.target.value) / 100),
              });
              persistCurrentProject();
            }}
            className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
          />
          <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
            {Math.round(currentScale * 100)} %
          </div>
        </div>
      </div>

      {/* Position X & Y */}
      <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-300 font-medium block">Posición</label>
          <KeyframeControlGroup
            clip={clip}
            property={['x', 'y']}
            currentValue={[currentX, currentY]}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1">
            <span className="text-gray-400 mr-2 font-mono text-xs">X</span>
            <input
              type="number"
              value={Math.round(currentX)}
              onChange={(e) => {
                updateClipTransformLive(clip.id, {
                  x: Number(e.target.value) || 0,
                });
                persistCurrentProject();
              }}
              className="w-full bg-transparent text-right font-mono text-white text-xs focus:outline-none"
            />
          </div>
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1">
            <span className="text-gray-400 mr-2 font-mono text-xs">Y</span>
            <input
              type="number"
              value={Math.round(currentY)}
              onChange={(e) => {
                updateClipTransformLive(clip.id, {
                  y: Number(e.target.value) || 0,
                });
                persistCurrentProject();
              }}
              className="w-full bg-transparent text-right font-mono text-white text-xs focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-300 font-medium block">Rotación</label>
          <KeyframeControlGroup
            clip={clip}
            property="rotation"
            currentValue={currentRotation}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            min={-180}
            max={180}
            value={Math.round(currentRotation)}
            onChange={(e) => {
              updateClipTransformLive(clip.id, {
                rotation: Number(e.target.value) || 0,
              });
              persistCurrentProject();
            }}
            className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
          />
          <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
            {Math.round(currentRotation)}°
          </div>
        </div>
      </div>

      {/* Flip Horizontal Toggle Switch */}
      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between">
        <span className="text-xs text-gray-200 font-medium flex items-center gap-1.5">
          <FlipHorizontal className="w-3.5 h-3.5 text-gray-400" />
          Espejo horizontal
        </span>
        <button
          type="button"
          onClick={() => flipClipHorizontal(clip.id)}
          className={`w-9 h-5 rounded-full transition p-0.5 flex items-center ${
            tf.flipX ? 'bg-[#00d4e5] justify-end' : 'bg-[#363840] justify-start'
          }`}
        >
          <div className="w-4 h-4 rounded-full bg-white shadow" />
        </button>
      </div>
    </div>
  );
};
export default TransformSection;
