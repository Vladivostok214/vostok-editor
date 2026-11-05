import React, { useState } from 'react';
import {
  Link,
  AlertTriangle,
  CheckCircle2,
  FileVideo,
  Music,
  Image as ImageIcon,
  X,
  FolderOpen,
  FolderSearch,
  RefreshCw,
  Check,
} from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { LocalFileBrowserModal } from './LocalFileBrowserModal';
import type { MediaAsset } from '../types/project';

function formatDuration(seconds = 0): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getDirectoryPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash > 0) {
    return filePath.slice(0, lastSlash);
  }
  return undefined;
}

export const RelinkModal: React.FC = () => {
  const currentProject = useProjectStore((s) => s.currentProject);
  const offlineAssetIds = useProjectStore((s) => s.offlineAssetIds);
  const isRelinkModalOpen = useProjectStore((s) => s.isRelinkModalOpen);
  const relinkTargetAssetId = useProjectStore((s) => s.relinkTargetAssetId);
  const closeRelinkModal = useProjectStore((s) => s.closeRelinkModal);
  const relinkAsset = useProjectStore((s) => s.relinkAsset);
  const checkProjectMediaStatus = useProjectStore((s) => s.checkProjectMediaStatus);

  const [autoScanSiblings, setAutoScanSiblings] = useState(true);
  const [browsingAsset, setBrowsingAsset] = useState<MediaAsset | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  if (!isRelinkModalOpen || !currentProject) return null;

  // Lista de assets desconectados
  const offlineAssets = currentProject.assets.filter((a) =>
    offlineAssetIds.includes(a.id)
  );

  // Ordenar para colocar el asset seleccionado arriba si existe
  const sortedOfflineAssets = [...offlineAssets].sort((a, b) => {
    if (a.id === relinkTargetAssetId) return -1;
    if (b.id === relinkTargetAssetId) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelectFileForRelink = async (paths: string[]) => {
    if (!browsingAsset || paths.length === 0) return;
    const selectedPath = paths[0];
    const targetAsset = browsingAsset;
    setBrowsingAsset(null);
    setIsProcessing(true);
    setFeedback(null);

    try {
      const { autoRelinkedCount } = await relinkAsset(targetAsset.id, selectedPath, autoScanSiblings);
      const extraMsg =
        autoRelinkedCount > 0
          ? ` (Se re-vincularon ${autoRelinkedCount} archivo(s) adicional(es) en la misma carpeta)`
          : '';
      setFeedback({
        type: 'success',
        message: `"${targetAsset.name}" re-vinculado con éxito.${extraMsg}`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'No se pudo re-vincular el archivo seleccionado.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getMediaIcon = (type: MediaAsset['type']) => {
    switch (type) {
      case 'video':
        return <FileVideo className="w-4 h-4 text-[#00d4e5]" />;
      case 'audio':
        return <Music className="w-4 h-4 text-emerald-400" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-amber-400" />;
      default:
        return <FileVideo className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 select-none">
        <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-[#1e1f23] border border-[#32343a] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#2c2d32] bg-[#18191c] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Link className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Re-vincular Archivos Multimedia</h3>
                  {offlineAssets.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                      {offlineAssets.length} faltante{offlineAssets.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Localiza los archivos en tu equipo para restaurar la previsualización y exportación.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closeRelinkModal}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Opciones y ayuda rápida */}
          <div className="px-5 py-2.5 bg-[#141517] border-b border-[#28292d] flex items-center justify-between gap-4 text-xs shrink-0">
            <label className="flex items-center gap-2 cursor-pointer text-gray-300 hover:text-white transition">
              <input
                type="checkbox"
                checked={autoScanSiblings}
                onChange={(e) => setAutoScanSiblings(e.target.checked)}
                className="w-4 h-4 rounded border-[#3a3c44] bg-[#25262b] text-[#00d4e5] focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="flex items-center gap-1.5 font-medium">
                <FolderSearch className="w-3.5 h-3.5 text-[#00d4e5]" />
                Buscar automáticamente otros archivos faltantes en la misma carpeta
              </span>
            </label>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => checkProjectMediaStatus(false)}
              className="px-2.5 py-1 rounded-lg text-[11px] text-gray-400 hover:text-gray-200 hover:bg-white/5 flex items-center gap-1.5 transition shrink-0"
              title="Volver a verificar el estado de los archivos"
            >
              <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
              Re-escanear
            </button>
          </div>

          {/* Banner de Feedback si existe */}
          {feedback && (
            <div
              className={`px-5 py-2.5 text-xs flex items-center justify-between border-b ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-950/30 border-red-500/30 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span className="truncate">{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-xs opacity-70 hover:opacity-100 ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Contenido / Lista de archivos */}
          <div className="flex-1 overflow-y-auto p-5 space-y-2.5 min-h-[220px]">
            {sortedOfflineAssets.length === 0 ? (
              /* ESTADO: TODOS VINCULADOS */
              <div className="h-full flex flex-col items-center justify-center py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
                  <Check className="w-7 h-7 text-emerald-400 stroke-[2.5]" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  ¡Todos los archivos están vinculados!
                </h4>
                <p className="text-xs text-gray-400 max-w-sm mb-5">
                  No se detectaron medios desconectados en este proyecto. Todo el material está listo para editar y exportar.
                </p>
                <button
                  type="button"
                  onClick={closeRelinkModal}
                  className="px-6 py-2 rounded-xl bg-[#00d4e5] hover:bg-[#19e3f3] text-[#141517] text-xs font-semibold shadow-lg shadow-[#00d4e5]/10 transition"
                >
                  Continuar editando
                </button>
              </div>
            ) : (
              /* LISTA DE ARCHIVOS DESCONECTADOS */
              sortedOfflineAssets.map((asset) => {
                const isTarget = asset.id === relinkTargetAssetId;
                return (
                  <div
                    key={asset.id}
                    className={`p-3 rounded-xl border transition flex items-center justify-between gap-4 ${
                      isTarget
                        ? 'bg-[#261f22] border-red-500/50 ring-1 ring-red-500/30'
                        : 'bg-[#24252a] hover:bg-[#282a30] border-[#32343a]'
                    }`}
                  >
                    {/* Info del medio */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-[#191a1d] border border-[#32343a] flex items-center justify-center shrink-0">
                        {getMediaIcon(asset.type)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-white truncate" title={asset.name}>
                            {asset.name}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-black/40 text-gray-400 border border-white/5">
                            {asset.type}
                          </span>
                          {asset.duration ? (
                            <span className="text-[10px] font-mono text-gray-400">
                              {formatDuration(asset.duration)}
                            </span>
                          ) : null}
                        </div>

                        <div
                          className="text-[11px] font-mono text-gray-400 truncate mt-0.5"
                          title={asset.path}
                        >
                          {asset.path || 'Ruta no registrada'}
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        Desconectado
                      </span>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => setBrowsingAsset(asset)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#00d4e5] hover:bg-[#19e3f3] text-[#141517] flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Localizar...
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[#2c2d32] bg-[#18191c] flex items-center justify-between shrink-0">
            <span className="text-xs text-gray-400">
              {offlineAssets.length > 0
                ? `${offlineAssets.length} archivo(s) restante(s)`
                : 'Todo en orden'}
            </span>
            <button
              type="button"
              onClick={closeRelinkModal}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Explorador interno VOSTOK montado para seleccionar el nuevo archivo */}
      {browsingAsset && (
        <LocalFileBrowserModal
          isOpen={Boolean(browsingAsset)}
          onClose={() => setBrowsingAsset(null)}
          mode="files"
          initialDir={getDirectoryPath(browsingAsset.path)}
          title={`Localizar archivo: ${browsingAsset.name}`}
          confirmLabel="Re-vincular este archivo"
          singleSelection={true}
          onImportPaths={handleSelectFileForRelink}
        />
      )}
    </>
  );
};
