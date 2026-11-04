import React, { useEffect, useRef, memo } from 'react';

export interface AudioWaveformCanvasProps {
  /** Array of normalized audio peaks in [0.0, 1.0] */
  waveform?: number[];
  /** Total asset duration in seconds */
  assetDuration: number;
  /** Start time of the clip within the asset (in seconds) */
  sourceStart: number;
  /** Effective duration of the clip in the timeline (in seconds) */
  clipDuration: number;
  /** Rendered width of the clip in CSS pixels (clipDuration * timelineZoom) */
  width: number;
  /** Rendered height of the canvas in CSS pixels */
  height?: number;
  /** Primary wave color */
  color?: string;
  /** Secondary wave color for vertical gradient */
  secondaryColor?: string;
  /** Whether to draw mirrored waveform (centered) or bottom-aligned */
  mirrored?: boolean;
  /** Bar width in CSS pixels (default: 2) */
  barWidth?: number;
  /** Gap between bars in CSS pixels (default: 1) */
  barGap?: number;
  /** Additional CSS class names */
  className?: string;
}

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = memo(
  ({
    waveform,
    assetDuration,
    sourceStart,
    clipDuration,
    width,
    height = 28,
    color = '#10b981',
    secondaryColor = '#059669',
    mirrored = true,
    barWidth = 2,
    barGap = 1,
    className = '',
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const displayWidth = Math.max(1, Math.round(width));
      const displayHeight = Math.max(1, Math.round(height));

      // Handle Retina / HiDPI screens for razor-sharp rendering in WebKitGTK / desktop
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      canvas.width = Math.floor(displayWidth * dpr);
      canvas.height = Math.floor(displayHeight * dpr);
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // If no waveform data or duration is invalid, draw a subtle neutral center baseline
      if (!waveform || waveform.length === 0 || assetDuration <= 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        const cy = mirrored ? Math.round(displayHeight / 2) : displayHeight - 2;
        ctx.fillRect(0, cy, displayWidth, 1);
        ctx.restore();
        return;
      }

      // Calculate time-slice indices within the asset waveform
      const totalPeaks = waveform.length;
      const safeAssetDuration = Math.max(0.01, assetDuration);
      const safeSourceStart = Math.max(0, sourceStart);
      const safeClipDuration = Math.max(0.01, clipDuration);

      const startRatio = Math.max(0, Math.min(1, safeSourceStart / safeAssetDuration));
      const endRatio = Math.max(0, Math.min(1, (safeSourceStart + safeClipDuration) / safeAssetDuration));

      const startIndex = Math.min(totalPeaks - 1, Math.max(0, Math.floor(startRatio * totalPeaks)));
      const endIndex = Math.min(totalPeaks, Math.max(startIndex + 1, Math.ceil(endRatio * totalPeaks)));
      const visibleSlice = waveform.slice(startIndex, endIndex);
      const sliceLength = visibleSlice.length;

      if (sliceLength === 0) {
        ctx.restore();
        return;
      }

      // Subtle center axis baseline
      const centerY = mirrored ? displayHeight / 2 : displayHeight;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      if (mirrored) {
        ctx.fillRect(0, Math.round(centerY), displayWidth, 1);
      }

      // Gradient for professional NLE aesthetics
      const gradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, secondaryColor);
      ctx.fillStyle = gradient;

      const pitch = barWidth + barGap;
      const barCount = Math.max(1, Math.floor(displayWidth / pitch));
      const maxAmplitude = mirrored ? (displayHeight / 2) * 0.92 : displayHeight * 0.92;

      for (let b = 0; b < barCount; b++) {
        const x = b * pitch;
        if (x >= displayWidth) break;

        // Map bar index to visible slice index range
        const pStart = Math.floor((b / barCount) * sliceLength);
        const pEnd = Math.max(pStart + 1, Math.floor(((b + 1) / barCount) * sliceLength));

        let maxVal = 0;
        for (let k = pStart; k < pEnd && k < sliceLength; k++) {
          if (visibleSlice[k] > maxVal) {
            maxVal = visibleSlice[k];
          }
        }

        // Clamp peak amplitude
        const amp = Math.max(1.5, maxVal * maxAmplitude);

        if (mirrored) {
          const top = centerY - amp;
          const h = amp * 2;
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, top, barWidth, h, 1);
            ctx.fill();
          } else {
            ctx.fillRect(x, top, barWidth, h);
          }
        } else {
          const top = displayHeight - amp;
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, top, barWidth, amp, 1);
            ctx.fill();
          } else {
            ctx.fillRect(x, top, barWidth, amp);
          }
        }
      }

      ctx.restore();
    }, [
      waveform,
      assetDuration,
      sourceStart,
      clipDuration,
      width,
      height,
      color,
      secondaryColor,
      mirrored,
      barWidth,
      barGap,
    ]);

    return (
      <canvas
        ref={canvasRef}
        className={`pointer-events-none select-none ${className}`}
        style={{
          width: `${Math.max(1, Math.round(width))}px`,
          height: `${Math.max(1, Math.round(height))}px`,
        }}
      />
    );
  }
);

AudioWaveformCanvas.displayName = 'AudioWaveformCanvas';
export default AudioWaveformCanvas;
