import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Smartphone,
  Square,
  X,
  Clock,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import type { AspectRatio, ProjectData } from '../types/project';

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMin < 2) return 'Reciente';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    if (diffHrs < 24) return `Hace ${diffHrs} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} d`;

    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return 'Reciente';
  }
}

function getProjectDurationFormatted(project: ProjectData): string {
  if (!project.clips || project.clips.length === 0) return '00:00';
  const maxSec = project.clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
  if (maxSec <= 0) return '00:00';
  const mins = Math.floor(maxSec / 60);
  const secs = Math.floor(maxSec % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getProjectThumbnail(project: ProjectData): string | null {
  if (project.assets && project.assets.length > 0) {
    const firstWithThumb = project.assets.find((a) => a.thumbnail);
    if (firstWithThumb?.thumbnail) return firstWithThumb.thumbnail;
  }
  return null;
}

export const HomeView: React.FC = () => {
  const {
    projects,
    isLoading,
    createNewProject,
    openProject,
    deleteProject,
  } = useProjectStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>('16:9');
  const [selectedFps, setSelectedFps] = useState<number>(30);
  const [projectToDelete, setProjectToDelete] = useState<ProjectData | null>(null);

  const carouselRef = useRef<HTMLDivElement>(null);

  const handleOpenCreateModal = (presetRatio?: AspectRatio) => {
    if (presetRatio) setSelectedRatio(presetRatio);
    setNewProjectName(`Proyecto ${projects.length + 1}`);
    setIsModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createNewProject(
      newProjectName || `Proyecto ${projects.length + 1}`,
      selectedRatio,
      selectedFps
    );
    setIsModalOpen(false);
  };

  const confirmDelete = async () => {
    if (projectToDelete) {
      await deleteProject(projectToDelete.id);
      setProjectToDelete(null);
    }
  };

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (!carouselRef.current) return;
    const distance = 270;
    carouselRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  // Convertir la rueda del ratón en desplazamiento horizontal continuo y suave
  const handleWheelScroll = (e: React.WheelEvent) => {
    if (!carouselRef.current) return;
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    carouselRef.current.scrollBy({
      left: delta * 1.5,
      behavior: 'auto',
    });
  };

  return (
    <div className="relative h-screen w-screen bg-[#090a0d] text-gray-100 flex items-center justify-center select-none overflow-hidden font-sans">
      {/* Fondo cinematográfico con luces ambientales de elevación */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 w-[650px] h-[350px] bg-[#00d4e5]/[0.03] rounded-full blur-[150px]" />
        <div className="absolute -bottom-40 right-1/4 w-[650px] h-[400px] bg-cyan-800/[0.02] rounded-full blur-[170px]" />
      </div>

      {/* Contenedor Principal: 100vh exacto, sin scroll vertical en la ventana */}
      <div className="relative z-10 w-full h-full max-w-[1440px] mx-auto px-6 md:px-10 py-6 md:py-8 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 overflow-hidden">
        
        {/* ============================================================== */}
        {/* NIVEL 1: COLUMNA IZQUIERDA (Panel Esbelto Elevado con Relieve) */}
        {/* ============================================================== */}
        <div className="w-full md:w-[240px] shrink-0 flex flex-col justify-between h-[475px] p-5 rounded-3xl bg-[#14161b]/90 backdrop-blur-2xl border border-white/[0.08] shadow-[0_16px_45px_rgba(0,0,0,0.65)]">
          {/* Logo Centrado con Resplandor */}
          <div className="flex flex-col items-center justify-center pt-2">
            <div className="relative group cursor-default flex items-center justify-center w-full">
              <img
                src="/brand/vostok-logo-transparent.png"
                alt="VOSTOK EDITOR"
                className="w-38 h-auto object-contain drop-shadow-[0_8px_24px_rgba(0,212,229,0.15)] transition duration-500 group-hover:drop-shadow-[0_12px_32px_rgba(0,212,229,0.28)]"
              />
            </div>
          </div>

          {/* Bloque de Acciones: Botón Nuevo Proyecto + 3 Formatos Directos */}
          <div className="space-y-2.5 w-full">
            {/* Botón Principal Nuevo Proyecto */}
            <button
              type="button"
              onClick={() => handleOpenCreateModal('16:9')}
              className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#00d4e5] to-[#00b4c4] hover:from-[#1ce2f2] hover:to-[#00c5d6] text-[#090a0d] font-bold text-xs p-3 transition-all duration-300 shadow-[0_6px_22px_rgba(0,212,229,0.25)] hover:shadow-[0_8px_28px_rgba(0,212,229,0.38)] flex items-center justify-between active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-black/15 flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[2.75]" />
                </div>
                <span>Nuevo proyecto</span>
              </div>
              <span className="text-[10px] font-mono opacity-75 font-semibold bg-black/10 px-1.5 py-0.5 rounded">
                Ctrl+N
              </span>
            </button>

            {/* Accesos Rápidos: 16:9 Horizontal, 9:16 Vertical y 1:1 Cuadrado */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleOpenCreateModal('16:9')}
                className="w-full group px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-[#00d4e5]/50 transition-all duration-200 text-left flex items-center justify-between backdrop-blur-md"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.04] text-gray-400 group-hover:text-[#00d4e5] flex items-center justify-center transition">
                    <Monitor className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-white transition">
                    16:9 Horizontal
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 font-mono">1920×1080</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenCreateModal('9:16')}
                className="w-full group px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-[#00d4e5]/50 transition-all duration-200 text-left flex items-center justify-between backdrop-blur-md"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.04] text-gray-400 group-hover:text-[#00d4e5] flex items-center justify-center transition">
                    <Smartphone className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-white transition">
                    9:16 Vertical
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 font-mono">1080×1920</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenCreateModal('1:1')}
                className="w-full group px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-[#00d4e5]/50 transition-all duration-200 text-left flex items-center justify-between backdrop-blur-md"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-white/[0.04] text-gray-400 group-hover:text-[#00d4e5] flex items-center justify-center transition">
                    <Square className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-medium text-gray-200 group-hover:text-white transition">
                    1:1 Cuadrado
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 font-mono">1080×1080</span>
              </button>
            </div>
          </div>

          {/* Pie de versión discreto */}
          <div className="hidden md:flex items-center justify-between text-[10px] text-gray-400 font-mono px-1 pt-2 border-t border-white/[0.06]">
            <span>Linux x86_64</span>
            <span className="text-[#00d4e5]/80">v0.1.0 Beta</span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* NIVEL 2: COLUMNA DERECHA (Galería Panorámica en Carrusel)      */}
        {/* ============================================================== */}
        <div className="flex-1 w-full min-w-0 flex flex-col justify-between h-[475px]">
          {/* Cabecera de Proyectos + Flechas */}
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                Proyectos recientes
              </h3>
              {projects.length > 0 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-400 border border-white/[0.06]">
                  {projects.length}
                </span>
              )}
            </div>

            {/* Flechas de navegación del carrusel */}
            {projects.length > 4 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollCarousel('left')}
                  title="Anterior"
                  className="w-7 h-7 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-gray-400 hover:text-white border border-white/[0.06] flex items-center justify-center transition active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollCarousel('right')}
                  title="Siguiente"
                  className="w-7 h-7 rounded-full bg-white/[0.03] hover:bg-white/[0.08] text-gray-400 hover:text-white border border-white/[0.06] flex items-center justify-center transition active:scale-95"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Contenedor del Carrusel en 2 Filas con Fade Out a la derecha */}
          {isLoading ? (
            <div className="w-full flex-1 rounded-3xl border border-white/[0.06] bg-[#14161b]/60 backdrop-blur-md flex items-center justify-center text-xs text-gray-400">
              Cargando proyectos...
            </div>
          ) : projects.length === 0 ? (
            <div className="w-full flex-1 rounded-3xl border border-dashed border-white/[0.08] bg-[#14161b]/30 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 space-y-3">
              <FolderOpen className="w-10 h-10 text-gray-600 stroke-[1.25]" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium text-gray-300">Aún no tienes proyectos</p>
                <p className="text-xs text-gray-400">
                  Crea uno a la izquierda para empezar a editar
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative w-full flex-1 overflow-hidden p-1"
              style={{
                WebkitMaskImage: 'linear-gradient(to right, black 0%, black 90%, transparent 100%)',
                maskImage: 'linear-gradient(to right, black 0%, black 90%, transparent 100%)',
              }}
            >
              <div
                ref={carouselRef}
                onWheel={handleWheelScroll}
                className="h-full grid grid-rows-2 grid-flow-col auto-cols-[235px] lg:auto-cols-[250px] gap-3 overflow-x-auto overflow-y-hidden p-1.5 scroll-smooth scrollbar-none overscroll-none"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {projects.map((proj) => {
                  const thumb = getProjectThumbnail(proj);
                  const duration = getProjectDurationFormatted(proj);

                  return (
                    <div
                      key={proj.id}
                      onClick={() => openProject(proj)}
                      className="group relative cursor-pointer rounded-2xl bg-[#16181f]/85 hover:bg-[#1c1e27] backdrop-blur-xl border border-white/[0.07] hover:border-[#00d4e5]/60 transition-all duration-300 shadow-[0_6px_22px_rgba(0,0,0,0.45)] hover:shadow-[0_10px_28px_rgba(0,212,229,0.14)] flex flex-col overflow-hidden h-[205px]"
                    >
                      {/* Miniatura Panorámica (Plano de Contraste Profundo) */}
                      <div className="relative w-full h-[155px] bg-[#0c0d10] overflow-hidden flex items-center justify-center">
                        {thumb ? (
                          <>
                            <img
                              src={thumb}
                              alt={proj.name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-85 group-hover:opacity-100"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d10] via-transparent to-transparent opacity-85" />
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-white/[0.02] to-transparent">
                            <img
                              src="/brand/vostok-icon.png"
                              alt="Vostok"
                              className="w-8 h-8 object-contain opacity-20 group-hover:opacity-35 transition-opacity"
                            />
                          </div>
                        )}

                        {/* Botón de Eliminar en Hover */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(proj);
                          }}
                          title="Eliminar proyecto"
                          className="absolute top-2 right-2 p-1.5 rounded-xl bg-black/60 hover:bg-rose-500/80 backdrop-blur-md text-gray-400 hover:text-white border border-white/[0.08] opacity-0 group-hover:opacity-100 transition-all duration-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Base de Metadatos: Nivel de Elevación Distinguible */}
                      <div className="p-3 flex-1 flex flex-col justify-between bg-[#191b22]/90 border-t border-white/[0.04]">
                        <div className="flex items-center justify-between gap-1.5">
                          <h4 className="font-semibold text-xs text-gray-100 group-hover:text-[#00d4e5] transition truncate">
                            {proj.name}
                          </h4>
                          <span className="text-[9px] font-mono text-gray-400 shrink-0">
                            {proj.aspectRatio}
                          </span>
                        </div>

                        {/* Fila Inferior: Tiempo Relativo a la izq · Duración del video a la der */}
                        <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                          <span>{formatRelativeTime(proj.updatedAt)}</span>
                          <span className="text-gray-300 font-semibold">{duration}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Modal: Nuevo Proyecto (Glassmorphism) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-3xl bg-[#141519]/90 backdrop-blur-2xl border border-white/[0.09] shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-7 space-y-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white tracking-tight">Nuevo proyecto</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Nombre</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-[#00d4e5] text-sm text-white focus:outline-none transition"
                placeholder="Nombre del proyecto"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-300">Relación de aspecto</label>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { ratio: '16:9', label: 'Horizontal', sub: '16:9' },
                    { ratio: '9:16', label: 'Vertical', sub: '9:16' },
                    { ratio: '1:1', label: 'Cuadrado', sub: '1:1' },
                  ] as const
                ).map((item) => {
                  const active = selectedRatio === item.ratio;
                  return (
                    <button
                      type="button"
                      key={item.ratio}
                      onClick={() => setSelectedRatio(item.ratio)}
                      className={`py-3 px-2 rounded-2xl border transition flex flex-col items-center justify-center gap-1 ${
                        active
                          ? 'bg-[#00d4e5]/15 border-[#00d4e5] text-[#00d4e5]'
                          : 'bg-white/[0.02] border-white/[0.06] text-gray-400 hover:border-white/[0.15]'
                      }`}
                    >
                      <span className="text-xs font-semibold">{item.label}</span>
                      <span className="text-[10px] font-mono opacity-60">{item.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-300">Fotogramas por segundo (FPS)</label>
              <div className="flex gap-2">
                {[24, 30, 60].map((fps) => (
                  <button
                    type="button"
                    key={fps}
                    onClick={() => setSelectedFps(fps)}
                    className={`flex-1 py-2 rounded-xl text-xs font-mono border transition ${
                      selectedFps === fps
                        ? 'bg-[#00d4e5]/15 border-[#00d4e5] text-[#00d4e5] font-bold'
                        : 'bg-white/[0.02] border-white/[0.06] text-gray-400 hover:border-white/[0.15]'
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 hover:bg-white/5 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#00d4e5] hover:bg-[#19e3f3] text-[#0d0e11] shadow-lg shadow-[#00d4e5]/20 transition"
              >
                Crear proyecto
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Confirmar Eliminación (Glassmorphism) */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#141519]/95 backdrop-blur-2xl border border-white/[0.09] shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">¿Eliminar proyecto?</h4>
              <p className="text-xs text-gray-400 mt-1">
                Se eliminará permanentemente{' '}
                <strong className="text-gray-200">"{projectToDelete.name}"</strong> y sus metadatos.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 hover:bg-white/5 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
