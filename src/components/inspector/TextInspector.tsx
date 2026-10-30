import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import type { TimelineClip } from '../../types/project';
import { useProjectStore } from '../../store/useProjectStore';
import { TransformSection } from './TransformSection';

const VARIABLE_FONTS = [
  'TikTok Sans Variable',
  'Montserrat',
  'Inter',
  'Poppins',
  'Roboto',
  'Oswald',
  'Playfair Display',
  'Space Grotesk',
  'Fira Code',
  'Cinzel',
];

interface TextInspectorProps {
  clip: TimelineClip;
}

export const TextInspector: React.FC<TextInspectorProps> = ({ clip }) => {
  const updateClipTextConfig = useProjectStore((s) => s.updateClipTextConfig);

  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [fontDropdownPos, setFontDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [sizeDropdownPos, setSizeDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const fontDropdownRef = useRef<HTMLDivElement | null>(null);
  const sizeDropdownRef = useRef<HTMLDivElement | null>(null);
  const fontMenuFloatingRef = useRef<HTMLDivElement | null>(null);
  const sizeMenuFloatingRef = useRef<HTMLDivElement | null>(null);
  const originalFontRef = useRef<string | null>(null);
  const originalSizeRef = useRef<number | null>(null);

  // Cerrar dropdowns flotantes al hacer clic afuera
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedInsideFont =
        (fontDropdownRef.current && fontDropdownRef.current.contains(target)) ||
        (fontMenuFloatingRef.current && fontMenuFloatingRef.current.contains(target));

      if (!clickedInsideFont && isFontDropdownOpen) {
        if (originalFontRef.current) {
          updateClipTextConfig(clip.id, { fontFamily: originalFontRef.current });
          originalFontRef.current = null;
        }
        setIsFontDropdownOpen(false);
      }

      const clickedInsideSize =
        (sizeDropdownRef.current && sizeDropdownRef.current.contains(target)) ||
        (sizeMenuFloatingRef.current && sizeMenuFloatingRef.current.contains(target));

      if (!clickedInsideSize && isSizeDropdownOpen) {
        if (originalSizeRef.current) {
          updateClipTextConfig(clip.id, { fontSize: originalSizeRef.current });
          originalSizeRef.current = null;
        }
        setIsSizeDropdownOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [isFontDropdownOpen, isSizeDropdownOpen, clip.id, updateClipTextConfig]);

  const textCfg = clip.textConfig;
  if (!textCfg) return null;

  return (
    <div className="space-y-4">
      {/* 1. Caja de Contenido de Texto */}
      <div className="space-y-1">
        <textarea
          rows={3}
          value={textCfg.content}
          onChange={(e) => updateClipTextConfig(clip.id, { content: e.target.value })}
          placeholder="Agregar título"
          className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.08] focus:border-[#00d4e5]/80 text-xs text-white placeholder-gray-500 focus:outline-none resize-none transition shadow-inner"
        />
      </div>

      {/* 2. Selector de Fuente Personalizado con Hover Preview */}
      <div className="space-y-1.5" ref={fontDropdownRef}>
        <label className="text-[11px] font-semibold text-gray-400 block">Fuente</label>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              if (!isFontDropdownOpen) {
                originalFontRef.current = textCfg.fontFamily || 'Montserrat';
                const rect = e.currentTarget.getBoundingClientRect();
                setFontDropdownPos({
                  top: rect.bottom + 6,
                  left: rect.left,
                  width: rect.width,
                });
              } else {
                if (originalFontRef.current) {
                  updateClipTextConfig(clip.id, { fontFamily: originalFontRef.current });
                  originalFontRef.current = null;
                }
              }
              setIsFontDropdownOpen(!isFontDropdownOpen);
              setIsSizeDropdownOpen(false);
            }}
            className="w-full pl-3 pr-3 py-2 rounded-xl bg-black/35 hover:bg-black/50 border border-white/[0.08] hover:border-white/[0.18] text-xs font-medium text-white flex items-center justify-between transition cursor-pointer text-left"
          >
            <span
              style={{ fontFamily: textCfg.fontFamily || 'Montserrat' }}
              className="truncate pr-2"
            >
              {textCfg.fontFamily || 'Montserrat'}
            </span>
            <ChevronRight
              className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
                isFontDropdownOpen ? '-rotate-90' : 'rotate-90'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 3. Barra de Formato Clásico (Una sola fila perfecta con Tamaño Compacto) */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-gray-400 block">Formato</label>
        <div className="flex items-center gap-1.5 flex-nowrap">
          {/* Desplegable de Tamaño de Fuente */}
          <div className="relative shrink-0" ref={sizeDropdownRef}>
            <button
              type="button"
              onClick={(e) => {
                if (!isSizeDropdownOpen) {
                  originalSizeRef.current = textCfg.fontSize ?? 16;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setSizeDropdownPos({
                    top: rect.bottom + 6,
                    left: rect.left,
                  });
                } else {
                  if (originalSizeRef.current) {
                    updateClipTextConfig(clip.id, { fontSize: originalSizeRef.current });
                    originalSizeRef.current = null;
                  }
                }
                setIsSizeDropdownOpen(!isSizeDropdownOpen);
                setIsFontDropdownOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/[0.18] text-xs font-mono text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>{textCfg.fontSize ?? 16}</span>
              <ChevronRight
                className={`w-3 h-3 text-gray-400 transition-transform ${
                  isSizeDropdownOpen ? '-rotate-90' : 'rotate-90'
                }`}
              />
            </button>
          </div>

          {/* Negrita (B) */}
          <button
            type="button"
            onClick={() => {
              const nextBold = !textCfg.bold;
              updateClipTextConfig(clip.id, {
                bold: nextBold,
                fontWeight: nextBold ? 700 : 400,
              });
            }}
            title="Negrita (B)"
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition ${
              textCfg.bold
                ? 'bg-[#00d4e5]/20 border-[#00d4e5] text-[#00d4e5]'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <Bold className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          {/* Cursiva (I) */}
          <button
            type="button"
            onClick={() =>
              updateClipTextConfig(clip.id, {
                italic: !textCfg.italic,
              })
            }
            title="Cursiva (I)"
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition ${
              textCfg.italic
                ? 'bg-[#00d4e5]/20 border-[#00d4e5] text-[#00d4e5]'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <Italic className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          {/* Subrayado (U) */}
          <button
            type="button"
            onClick={() =>
              updateClipTextConfig(clip.id, {
                underline: !textCfg.underline,
              })
            }
            title="Subrayado (U)"
            className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition ${
              textCfg.underline
                ? 'bg-[#00d4e5]/20 border-[#00d4e5] text-[#00d4e5]'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <Underline className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>

          {/* Alineación (Izq / Centro / Der) */}
          <button
            type="button"
            onClick={() => {
              const cur = textCfg.align || 'center';
              const next = cur === 'center' ? 'left' : cur === 'left' ? 'right' : 'center';
              updateClipTextConfig(clip.id, { align: next });
            }}
            title={`Alineación: ${textCfg.align || 'center'}`}
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:text-white hover:bg-white/[0.08] flex items-center justify-center shrink-0 transition"
          >
            {textCfg.align === 'left' ? (
              <AlignLeft className="w-3.5 h-3.5" />
            ) : textCfg.align === 'right' ? (
              <AlignRight className="w-3.5 h-3.5" />
            ) : (
              <AlignCenter className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Mayúsculas (Aa) */}
          <button
            type="button"
            onClick={() =>
              updateClipTextConfig(clip.id, {
                uppercase: !textCfg.uppercase,
              })
            }
            title="Alternar MAYÚSCULAS (Aa)"
            className={`px-2 h-7 rounded-lg border flex items-center justify-center text-[11px] font-bold font-mono shrink-0 transition ${
              textCfg.uppercase
                ? 'bg-[#00d4e5]/20 border-[#00d4e5] text-[#00d4e5]'
                : 'bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            Aa
          </button>
        </div>
      </div>

      {/* 4. Tipografía Avanzada (Ejes de Fuentes Variables: Grosor, Espaciado, Interlineado) */}
      <div className="space-y-3 pt-2 border-t border-white/[0.06]">
        <label className="text-[11px] font-semibold text-gray-400 block">
          Tipografía y espaciado
        </label>

        {/* Grosor / Peso continuo (100 - 900) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 font-medium">Grosor</span>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={100}
              max={900}
              step={10}
              value={textCfg.bold ? Math.max(700, textCfg.fontWeight || 700) : (textCfg.fontWeight || 400)}
              onChange={(e) => {
                const val = Number(e.target.value);
                updateClipTextConfig(clip.id, {
                  fontWeight: val,
                  bold: val >= 700,
                });
              }}
              className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
            />
            <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
              {textCfg.bold ? Math.max(700, textCfg.fontWeight || 700) : (textCfg.fontWeight || 400)}
            </div>
          </div>
        </div>

        {/* Espaciado entre letras (Kerning / Tracking: -4px a +24px) */}
        <div className="space-y-1.5 pt-1.5 border-t border-white/[0.04]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 font-medium">Espaciado</span>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={-4}
              max={24}
              step={1}
              value={Math.round(textCfg.letterSpacing ?? 0)}
              onChange={(e) => {
                updateClipTextConfig(clip.id, {
                  letterSpacing: Math.round(Number(e.target.value)),
                });
              }}
              className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
            />
            <div className="w-16 px-1.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs whitespace-nowrap shrink-0">
              {Math.round(textCfg.letterSpacing ?? 0) > 0
                ? `+${Math.round(textCfg.letterSpacing ?? 0)}`
                : Math.round(textCfg.letterSpacing ?? 0)}{' '}
              px
            </div>
          </div>
        </div>

        {/* Interlineado (0.8x a 2.2x) */}
        <div className="space-y-1.5 pt-1.5 border-t border-white/[0.04]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 font-medium">Interlineado</span>
          </div>
          <div className="flex items-center gap-2.5">
            <input
              type="range"
              min={0.8}
              max={2.2}
              step={0.05}
              value={textCfg.lineHeightMultiplier ?? 1.25}
              onChange={(e) => {
                updateClipTextConfig(clip.id, {
                  lineHeightMultiplier: Number(e.target.value),
                });
              }}
              className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
            />
            <div className="w-16 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-center font-mono text-gray-100 text-xs">
              {(textCfg.lineHeightMultiplier ?? 1.25).toFixed(2)}x
            </div>
          </div>
        </div>
      </div>

      {/* 5. Sección Estilo: Color, Trazo, Fondo */}
      <div className="space-y-2 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-gray-400 block">Estilo</label>
        </div>

        {/* Color */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.07] transition">
          <span className="text-xs text-gray-200 font-medium">Color</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-400">
              {textCfg.color || '#ffffff'}
            </span>
            <div className="relative w-6 h-6 rounded-md overflow-hidden border border-white/20">
              <input
                type="color"
                value={textCfg.color || '#ffffff'}
                onChange={(e) => updateClipTextConfig(clip.id, { color: e.target.value })}
                className="absolute -inset-2 w-10 h-10 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Trazo / Borde (Stroke) */}
        <div className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.07] transition space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-200 font-medium">Trazo</span>
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6 rounded-md overflow-hidden border border-white/20">
                <input
                  type="color"
                  value={textCfg.strokeColor || '#000000'}
                  onChange={(e) =>
                    updateClipTextConfig(clip.id, {
                      strokeColor: e.target.value,
                      strokeWidth: textCfg.strokeWidth || 4,
                    })
                  }
                  className="absolute -inset-2 w-10 h-10 cursor-pointer"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  updateClipTextConfig(clip.id, {
                    strokeColor: textCfg.strokeColor ? '' : '#000000',
                    strokeWidth: textCfg.strokeColor ? 0 : 4,
                  })
                }
                className={`text-[10px] px-2 py-0.5 rounded transition ${
                  textCfg.strokeColor
                    ? 'bg-[#00d4e5]/20 text-[#00d4e5]'
                    : 'bg-white/5 text-gray-400'
                }`}
              >
                {textCfg.strokeColor ? 'Activo' : 'Sin trazo'}
              </button>
            </div>
          </div>

          {textCfg.strokeColor && (
            <div className="flex items-center gap-2 pt-1.5 border-t border-white/[0.06]">
              <span className="text-[10px] text-gray-400">Grosor</span>
              <input
                type="range"
                min={1}
                max={16}
                value={textCfg.strokeWidth || 4}
                onChange={(e) =>
                  updateClipTextConfig(clip.id, {
                    strokeWidth: Number(e.target.value) || 4,
                  })
                }
                className="flex-1 h-1 accent-[#00d4e5] bg-[#32343a] rounded-lg cursor-pointer"
              />
              <span className="text-[10px] font-mono text-gray-300 w-6 text-right">
                {textCfg.strokeWidth || 4}px
              </span>
            </div>
          )}
        </div>

        {/* Fondo de Texto */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.07] transition">
          <span className="text-xs text-gray-200 font-medium">Fondo</span>
          <div className="flex items-center gap-2">
            <div className="relative w-6 h-6 rounded-md overflow-hidden border border-white/20">
              <input
                type="color"
                value={
                  textCfg.backgroundColor === 'transparent' || !textCfg.backgroundColor
                    ? '#000000'
                    : textCfg.backgroundColor
                }
                onChange={(e) =>
                  updateClipTextConfig(clip.id, {
                    backgroundColor: e.target.value,
                  })
                }
                className="absolute -inset-2 w-10 h-10 cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                updateClipTextConfig(clip.id, {
                  backgroundColor:
                    textCfg.backgroundColor && textCfg.backgroundColor !== 'transparent'
                      ? 'transparent'
                      : '#141517cc',
                })
              }
              className={`text-[10px] px-2 py-0.5 rounded transition ${
                textCfg.backgroundColor && textCfg.backgroundColor !== 'transparent'
                  ? 'bg-[#00d4e5]/20 text-[#00d4e5]'
                  : 'bg-white/5 text-gray-400'
              }`}
            >
              {textCfg.backgroundColor && textCfg.backgroundColor !== 'transparent'
                ? 'Con fondo'
                : 'Transparente'}
            </button>
          </div>
        </div>
      </div>

      {/* 5. Sección Opacidad y Transformación en vista directa */}
      <TransformSection clip={clip} />

      {/* Portal Flotante Global para Menú de Fuentes montado en document.body */}
      {isFontDropdownOpen && fontDropdownPos && createPortal(
        <div
          ref={fontMenuFloatingRef}
          style={{
            position: 'fixed',
            top: fontDropdownPos.top,
            left: fontDropdownPos.left,
            width: fontDropdownPos.width,
            maxHeight: '320px',
            zIndex: 99999,
          }}
          onMouseLeave={() => {
            if (originalFontRef.current) {
              updateClipTextConfig(clip.id, { fontFamily: originalFontRef.current });
            }
          }}
          className="overflow-y-auto rounded-2xl bg-[#0f1015]/95 backdrop-blur-3xl border border-white/[0.12] shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-white/20"
        >
          {VARIABLE_FONTS.map((font) => {
            const isCurrent =
              (originalFontRef.current || textCfg.fontFamily || 'Montserrat') === font;
            return (
              <div
                key={font}
                onMouseEnter={() => {
                  updateClipTextConfig(clip.id, { fontFamily: font });
                }}
                onClick={() => {
                  originalFontRef.current = font;
                  updateClipTextConfig(clip.id, { fontFamily: font });
                  setIsFontDropdownOpen(false);
                }}
                className={`px-3 py-2 rounded-xl cursor-pointer text-xs flex items-center justify-between transition ${
                  isCurrent
                    ? 'bg-[#00d4e5]/20 text-[#00d4e5] font-semibold'
                    : 'text-gray-200 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <span style={{ fontFamily: font }} className="truncate text-[13px]">
                  {font}
                </span>
                {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[#00d4e5]" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}

      {/* Portal Flotante Global para Menú de Tamaño montado en document.body */}
      {isSizeDropdownOpen && sizeDropdownPos && createPortal(
        <div
          ref={sizeMenuFloatingRef}
          style={{
            position: 'fixed',
            top: sizeDropdownPos.top,
            left: sizeDropdownPos.left,
            width: '84px',
            maxHeight: '260px',
            zIndex: 99999,
          }}
          onMouseLeave={() => {
            if (originalSizeRef.current) {
              updateClipTextConfig(clip.id, { fontSize: originalSizeRef.current });
            }
          }}
          className="overflow-y-auto rounded-xl bg-[#0f1015]/95 backdrop-blur-3xl border border-white/[0.12] shadow-[0_20px_50px_rgba(0,0,0,0.9)] p-1 space-y-0.5 scrollbar-none"
        >
          {[5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((s) => (
            <div
              key={s}
              onMouseEnter={() => {
                updateClipTextConfig(clip.id, { fontSize: s });
              }}
              onClick={() => {
                originalSizeRef.current = s;
                updateClipTextConfig(clip.id, { fontSize: s });
                setIsSizeDropdownOpen(false);
              }}
              className={`px-2 py-1.5 rounded-lg text-xs font-mono cursor-pointer text-center transition ${
                (originalSizeRef.current || textCfg.fontSize) === s
                  ? 'bg-[#00d4e5]/20 text-[#00d4e5] font-bold'
                  : 'text-gray-300 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              {s}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
