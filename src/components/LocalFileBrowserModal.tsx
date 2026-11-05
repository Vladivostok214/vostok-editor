import React, { useEffect, useState } from 'react';
import { apiUrl } from '../config/api';
import {
  Folder,
  FolderPlus,
  FileVideo,
  Music,
  Image as ImageIcon,
  ArrowUp,
  Check,
  X,
  HardDrive,
  Search,
} from 'lucide-react';
import type { FsBrowseResponse } from '../types/project';

interface LocalFileBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'files' | 'directory';
  initialDir?: string;
  onImportPaths?: (paths: string[]) => Promise<void>;
  onSelectDirectory?: (dirPath: string) => void;
  title?: string;
  confirmLabel?: string;
  singleSelection?: boolean;
}

function formatBytes(bytes = 0): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const LocalFileBrowserModal: React.FC<LocalFileBrowserModalProps> = ({
  isOpen,
  onClose,
  mode = 'files',
  initialDir,
  onImportPaths,
  onSelectDirectory,
  title,
  confirmLabel,
  singleSelection = false,
}) => {
  const [browseData, setBrowseData] = useState<FsBrowseResponse | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [customPathInput, setCustomPathInput] = useState('');
  const [filterText, setFilterText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado para crear carpeta nueva
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingLoading, setCreatingLoading] = useState(false);

  const loadDirectory = async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = dirPath
        ? apiUrl(`/api/fs/browse?dir=${encodeURIComponent(dirPath)}`)
        : apiUrl('/api/fs/browse');
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir la carpeta');
      setBrowseData(data);
      setCustomPathInput(data.currentDir);
    } catch (err: any) {
      setError(err?.message || 'Error leyendo directorio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedPaths([]);
      setFilterText('');
      setIsCreatingFolder(false);
      setNewFolderName('');
      loadDirectory(initialDir);
    }
  }, [isOpen, initialDir]);

  if (!isOpen) return null;

  const toggleFileSelection = (filePath: string) => {
    if (singleSelection) {
      setSelectedPaths((prev) => (prev.includes(filePath) ? [] : [filePath]));
      return;
    }
    setSelectedPaths((prev) =>
      prev.includes(filePath) ? prev.filter((p) => p !== filePath) : [...prev, filePath]
    );
  };

  const handleImportConfirmed = async () => {
    if (selectedPaths.length === 0 || !onImportPaths) return;
    await onImportPaths(selectedPaths);
    onClose();
  };

  const handleSelectCurrentDir = () => {
    if (!browseData?.currentDir || !onSelectDirectory) return;
    onSelectDirectory(browseData.currentDir);
    onClose();
  };

  const handleCreateNewFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed || !browseData?.currentDir) return;

    setCreatingLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/fs/mkdir'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentDir: browseData.currentDir,
          folderName: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la carpeta');

      setIsCreatingFolder(false);
      setNewFolderName('');
      // Entrar automáticamente a la carpeta recién creada
      await loadDirectory(data.createdPath);
    } catch (err: any) {
      setError(err?.message || 'Error al crear la carpeta');
    } finally {
      setCreatingLoading(false);
    }
  };

  const filteredDirs = (browseData?.directories || []).filter((d) =>
    d.name.toLowerCase().includes(filterText.toLowerCase())
  );
  const filteredFiles = (browseData?.files || []).filter((f) =>
    f.name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-4xl h-[560px] rounded-2xl bg-[#202124] border border-[#32343a] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#2c2d32] bg-[#18191c] flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#00d4e5]" />
            {title || (mode === 'directory' ? 'Seleccionar carpeta de destino' : 'Cargar archivos')}
          </h3>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder((prev) => !prev);
                setNewFolderName('');
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
                isCreatingFolder
                  ? 'bg-[#00d4e5]/15 border-[#00d4e5] text-[#00d4e5]'
                  : 'bg-[#25262b] hover:bg-[#2f3037] border-[#32343a] text-gray-200'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#00d4e5]" />
              Nueva carpeta
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="px-4 py-2.5 border-b border-[#2c2d32] bg-[#1c1d21] flex items-center gap-2">
          <button
            type="button"
            onClick={() => browseData?.parentDir && loadDirectory(browseData.parentDir)}
            className="px-2.5 py-1.5 rounded-lg bg-[#25262b] hover:bg-[#2f3037] border border-[#32343a] text-xs text-gray-200 flex items-center gap-1"
            title="Subir carpeta"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            Subir
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadDirectory(customPathInput);
            }}
            className="flex-1 flex gap-1.5"
          >
            <input
              type="text"
              value={customPathInput}
              onChange={(e) => setCustomPathInput(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#141517] border border-[#32343a] text-xs font-mono text-gray-200 focus:outline-none focus:border-[#00d4e5]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#25262b] hover:bg-[#2f3037] border border-[#32343a] text-xs text-[#00d4e5] font-medium"
            >
              Ir
            </button>
          </form>

          <div className="relative w-48">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={mode === 'directory' ? 'Buscar carpeta...' : 'Buscar archivo...'}
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-[#141517] border border-[#32343a] text-xs text-gray-200 focus:outline-none focus:border-[#00d4e5]"
            />
          </div>
        </div>

        {/* Inline New Folder Creation Bar */}
        {isCreatingFolder && (
          <form
            onSubmit={handleCreateNewFolder}
            className="px-4 py-2.5 border-b border-[#2c2d32] bg-[#25262b] flex items-center gap-2"
          >
            <FolderPlus className="w-4 h-4 text-[#00d4e5] shrink-0" />
            <span className="text-xs text-gray-300 font-medium shrink-0">
              Nombre de la nueva carpeta:
            </span>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Ej. Exportaciones Finales"
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#141517] border border-[#32343a] text-xs text-white focus:outline-none focus:border-[#00d4e5]"
            />
            <button
              type="submit"
              disabled={!newFolderName.trim() || creatingLoading}
              className="px-3.5 py-1.5 rounded-lg bg-[#00d4e5] hover:bg-[#19e3f3] text-[#141517] font-semibold text-xs disabled:opacity-40 transition"
            >
              {creatingLoading ? 'Creando...' : 'Crear y abrir'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5"
            >
              Cancelar
            </button>
          </form>
        )}

        {/* Body: Sidebar Shortcuts + Directory/File List */}
        <div className="flex-1 flex min-h-0">
          {/* Left Shortcuts */}
          <div className="w-52 border-r border-[#2c2d32] bg-[#18191c] p-3 space-y-1 overflow-y-auto">
            <div className="text-[11px] font-medium text-gray-500 px-2 pb-1">
              Ubicaciones
            </div>
            {(browseData?.shortcuts || [])
              .filter((sc) => (mode === 'directory' ? !sc.label.includes('Caché') : true))
              .map((sc) => {
                const active = browseData?.currentDir === sc.path;
                return (
                  <button
                    key={sc.path}
                    onClick={() => loadDirectory(sc.path)}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-left text-xs flex items-center gap-2 transition truncate ${
                      active
                        ? 'bg-[#00d4e5]/15 text-[#00d4e5] font-semibold border border-[#00d4e5]/30'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 text-[#00d4e5] shrink-0" />
                    <span className="truncate">{sc.label}</span>
                  </button>
                );
              })}
          </div>

          {/* Right Content */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                {error}
              </div>
            )}

            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                Cargando carpeta...
              </div>
            ) : (
              <>
                {/* Subdirectories */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-gray-400">
                    Carpetas ({filteredDirs.length})
                  </div>
                  {filteredDirs.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-[#32343a] text-center text-xs text-gray-500">
                      No hay subcarpetas dentro de esta ubicación.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {filteredDirs.map((dir) => (
                        <button
                          key={dir.path}
                          onClick={() => loadDirectory(dir.path)}
                          className="p-2.5 rounded-lg bg-[#25262b] hover:bg-[#2f3037] border border-[#32343a] hover:border-[#00d4e5]/50 text-left flex items-center gap-2 text-xs text-gray-200 transition truncate"
                        >
                          <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="truncate">{dir.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Media Files (Shown in 'files' mode, or as reference in 'directory' mode if any exist) */}
                {mode === 'files' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-400">
                        Archivos multimedia ({filteredFiles.length})
                      </span>
                      {filteredFiles.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPaths(
                              selectedPaths.length === filteredFiles.length
                                ? []
                                : filteredFiles.map((f) => f.path)
                            )
                          }
                          className="text-[11px] text-[#00d4e5] hover:underline"
                        >
                          {selectedPaths.length === filteredFiles.length
                            ? 'Deseleccionar todos'
                            : 'Seleccionar todos'}
                        </button>
                      )}
                    </div>

                    {filteredFiles.length === 0 ? (
                      <div className="p-8 rounded-xl border border-dashed border-[#32343a] text-center text-xs text-gray-500">
                        No hay archivos de video, audio o imagen en esta carpeta.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filteredFiles.map((file) => {
                          const isChecked = selectedPaths.includes(file.path);
                          return (
                            <div
                              key={file.path}
                              onClick={() => toggleFileSelection(file.path)}
                              onDoubleClick={async () => {
                                if (!onImportPaths) return;
                                await onImportPaths([file.path]);
                                onClose();
                              }}
                              className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between gap-2 transition ${
                                isChecked
                                  ? 'bg-[#00d4e5]/15 border-[#00d4e5] text-white'
                                  : 'bg-[#25262b] border-[#32343a] hover:border-gray-500 text-gray-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-[#18191c] border border-[#32343a] flex items-center justify-center shrink-0">
                                  {file.mediaType === 'video' ? (
                                    <FileVideo className="w-4 h-4 text-[#00d4e5]" />
                                  ) : file.mediaType === 'audio' ? (
                                    <Music className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <ImageIcon className="w-4 h-4 text-purple-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{file.name}</p>
                                  <p className="text-[10px] text-gray-400 font-mono">
                                    {file.ext.toUpperCase()} · {formatBytes(file.sizeBytes)}
                                  </p>
                                </div>
                              </div>

                              <div
                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                  isChecked
                                    ? 'bg-[#00d4e5] border-[#00d4e5] text-[#141517]'
                                    : 'border-gray-600'
                                }`}
                              >
                                {isChecked && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2c2d32] bg-[#18191c] flex items-center justify-between gap-4">
          {mode === 'directory' ? (
            <>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs text-gray-400 shrink-0">Carpeta actual:</span>
                <span className="text-xs font-mono text-[#00d4e5] truncate">
                  {browseData?.currentDir}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!browseData?.currentDir}
                  onClick={handleSelectCurrentDir}
                  className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-[#00d4e5] hover:bg-[#19e3f3] text-[#141517] disabled:opacity-40 transition"
                >
                  Seleccionar esta carpeta
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-gray-400">
                {singleSelection
                  ? selectedPaths.length > 0
                    ? '1 archivo seleccionado · Doble clic para confirmar al instante'
                    : 'Selecciona el archivo para re-vincular'
                  : `${selectedPaths.length} seleccionado(s) · Doble clic para cargar al instante`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg text-xs text-gray-300 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={selectedPaths.length === 0}
                  onClick={handleImportConfirmed}
                  className="px-5 py-1.5 rounded-lg text-xs font-semibold bg-[#00d4e5] hover:bg-[#19e3f3] text-[#141517] disabled:opacity-40 transition"
                >
                  {confirmLabel
                    ? selectedPaths.length > 0
                      ? `${confirmLabel} (${selectedPaths.length})`
                      : confirmLabel
                    : `Cargar (${selectedPaths.length})`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
