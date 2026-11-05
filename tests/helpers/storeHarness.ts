import fs from 'node:fs';
import { requireSandbox, resolveInside } from './sandbox';
import { startTestBackend, type TestBackend } from './backend';
import type { ProjectData } from '../../src/types/project';

/**
 * Arnés para pruebas del store de Zustand con el backend temporal.
 *
 * - Arranca el backend aislado (con guardas de red) ANTES de importar el store.
 * - Guarda el proyecto fixture en el sandbox (POST real al backend de producción).
 * - Carga el proyecto en el store con el estado de historial limpio.
 * - Permite leer el project.json realmente persistido para verificar efectos finales.
 */

export type StoreHook = typeof import('../../src/store/useProjectStore').useProjectStore;

export interface StoreHarness {
  backend: TestBackend;
  useProjectStore: StoreHook;
  /** Lee el proyecto tal como quedó en disco (dentro del sandbox). */
  readPersisted(id?: string): ProjectData;
  loadProject(project: ProjectData, extraState?: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

export async function setupStoreHarness(): Promise<StoreHarness> {
  requireSandbox();
  const backend = await startTestBackend();
  const { useProjectStore } = await import('../../src/store/useProjectStore');

  const readPersisted = (id?: string): ProjectData => {
    const projectId = id ?? useProjectStore.getState().currentProject?.id;
    if (!projectId) throw new Error('No hay proyecto actual para leer de disco.');
    const file = resolveInside(backend.sandbox.dataDir, `projects/${projectId}/project.json`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as ProjectData;
  };

  const loadProject = async (project: ProjectData, extraState: Record<string, unknown> = {}) => {
    const res = await fetch(`${backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw new Error(`No se pudo guardar el fixture: HTTP ${res.status}`);
    useProjectStore.setState({
      currentProject: project,
      pastProjects: [],
      futureProjects: [],
      errorMessage: null,
      ...extraState,
    });
  };

  return { backend, useProjectStore, readPersisted, loadProject, close: () => backend.close() };
}
