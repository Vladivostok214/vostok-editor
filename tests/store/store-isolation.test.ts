import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotTree, resolveInside, REAL_BACKEND_PORT } from '../helpers/sandbox';
import { networkAudit } from '../helpers/network';
import { startTestBackend, type TestBackend } from '../helpers/backend';

const REAL_DATA = path.join(os.homedir(), '.local', 'share', 'video-editor');
const REAL_CACHE = path.join(os.tmpdir(), 'video-editor-cache');

describe('store: aislamiento HTTP', () => {
  let backend: TestBackend;
  let realBefore: string;
  let cacheBefore: string;
  // El store se importa DESPUÉS de arrancar el backend (y con las guardas instaladas).
  let useProjectStore: typeof import('../../src/store/useProjectStore').useProjectStore;

  before(async () => {
    realBefore = snapshotTree(REAL_DATA);
    cacheBefore = snapshotTree(REAL_CACHE);
    backend = await startTestBackend();
    ({ useProjectStore } = await import('../../src/store/useProjectStore'));
    networkAudit.length = 0;
  });
  after(async () => {
    await backend?.close();
  });

  test('createNewProject envía la petición al backend temporal y persiste en el sandbox', async () => {
    await useProjectStore.getState().createNewProject('Proyecto aislado', '16:9', 30);
    const state = useProjectStore.getState();
    assert.equal(state.errorMessage, null, `errorMessage: ${state.errorMessage}`);
    assert.ok(state.currentProject, 'currentProject debe existir');
    const id = state.currentProject!.id;

    // El efecto final está en disco, dentro del sandbox.
    const file = resolveInside(backend.sandbox.dataDir, `projects/${id}/project.json`);
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.equal(onDisk.name, 'Proyecto aislado');
    assert.equal(onDisk.fps, 30);

    // Toda petición del store fue reescrita al backend temporal; ninguna conexión al puerto real.
    const rewritten = networkAudit.filter((e) => e.kind === 'fetch-rewritten');
    assert.ok(rewritten.length >= 2, 'se esperaban POST /api/projects y GET /api/system/status');
    assert.ok(rewritten.every((e) => e.target.startsWith(backend.origin)));
    assert.ok(rewritten.some((e) => e.requested?.includes(`:${REAL_BACKEND_PORT}/api/projects`)));
    assert.equal(networkAudit.filter((e) => e.kind === 'fetch-blocked').length, 0);
    assert.equal(
      networkAudit.filter((e) => (e.kind === 'connect-allowed' || e.kind === 'connect-blocked') && e.target.endsWith(`:${REAL_BACKEND_PORT}`)).length,
      0
    );
    assert.ok(networkAudit.filter((e) => e.kind === 'connect-allowed').every((e) => e.target.endsWith(`:${backend.port}`)));
  });

  test('fetchProjects lista el proyecto del sandbox', async () => {
    await useProjectStore.getState().fetchProjects();
    const { projects, currentProject } = useProjectStore.getState();
    assert.ok(projects.some((p) => p.id === currentProject!.id));
  });

  test('deleteProject elimina solo la carpeta del sandbox', async () => {
    const id = useProjectStore.getState().currentProject!.id;
    const dir = resolveInside(backend.sandbox.dataDir, `projects/${id}`);
    assert.ok(fs.existsSync(dir));
    await useProjectStore.getState().deleteProject(id);
    assert.equal(fs.existsSync(dir), false);
  });

  test('un fetch hacia un destino no autorizado (otro puerto) se rechaza', async () => {
    // Nota: el store no permite cambiar su base de URL sin tocar producción, así que
    // se comprueba la guarda de fetch/red que protege a todas sus peticiones.
    await assert.rejects(fetch(`http://127.0.0.1:${REAL_BACKEND_PORT + 1}/api/projects`), /bloqueado/);
    assert.ok(networkAudit.some((e) => e.kind === 'fetch-blocked'));
  });

  test('los proyectos y la caché reales permanecen intactos', () => {
    assert.equal(snapshotTree(REAL_DATA), realBefore);
    assert.equal(snapshotTree(REAL_CACHE), cacheBefore);
  });
});
