import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { requireSandbox, resolveInside, snapshotTree } from '../helpers/sandbox';
import { startTestBackend, type TestBackend } from '../helpers/backend';
import { makeProject } from '../helpers/fixtures';
import { networkAudit } from '../helpers/network';

/**
 * Pruebas de seguridad para F01: Eliminación de proyectos y protección de la raíz PROJECTS_DIR.
 *
 * Verifica que ninguna solicitud (ID vacío, espacios, caracteres extraños, path traversal,
 * enlaces simbólicos o rutas absolutas) pueda eliminar o alterar la raíz de proyectos ni
 * proyectos vecinos, y que la eliminación válida actúe con precisión quirúrgica.
 */

describe('F01 · Seguridad en DELETE /api/projects/:id y protección de PROJECTS_DIR', () => {
  let backend: TestBackend;
  let projectsDir: string;
  let useProjectStore: typeof import('../../src/store/useProjectStore').useProjectStore;

  // Proyectos fixtures para las pruebas
  const PROJ_A = 'proj_test_alpha';
  const PROJ_B = 'proj_test_beta_neighbor';

  before(async () => {
    backend = await startTestBackend();
    projectsDir = path.join(backend.sandbox.dataDir, 'projects');
    fs.mkdirSync(projectsDir, { recursive: true });

    // Crear dos proyectos en el backend temporal
    await fetch(`${backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProject({ id: PROJ_A, name: 'Proyecto Alpha' })),
    });
    await fetch(`${backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProject({ id: PROJ_B, name: 'Proyecto Beta Vecino' })),
    });

    // Cargar el store de Zustand para probar defensas de cliente
    ({ useProjectStore } = await import('../../src/store/useProjectStore'));
  });

  after(async () => {
    await backend?.close();
  });

  test('demostración de la vulnerabilidad anterior: resolver con ID vacío apuntaba a la raíz', () => {
    // Demostración segura pura (cálculo de rutas de Node, sin I/O destructivo):
    // El código vulnerable hacía: path.join(PROJECTS_DIR, rawId.replace(/[^a-zA-Z0-9_-]/g, ''))
    const vulnerableResolve = (id: string) => path.join(projectsDir, id.replace(/[^a-zA-Z0-9_-]/g, ''));
    assert.equal(vulnerableResolve(''), projectsDir, 'ID vacío resolvía a la raíz');
    assert.equal(vulnerableResolve('   '), projectsDir, 'Espacios resolvían a la raíz');
    assert.equal(vulnerableResolve('$$$'), projectsDir, 'Caracteres extraños resolvían a la raíz');
  });

  test('ID vacío (DELETE /api/projects y DELETE /api/projects/): rechaza con 400 y protege la raíz', async () => {
    const rootSnapshotBefore = snapshotTree(projectsDir);

    const res1 = await fetch(`${backend.origin}/api/projects`, { method: 'DELETE' });
    assert.equal(res1.status, 400);
    const body1 = await res1.json();
    assert.match(body1.error, /inválido o ausente/);

    const res2 = await fetch(`${backend.origin}/api/projects/`, { method: 'DELETE' });
    assert.equal(res2.status, 400);
    const body2 = await res2.json();
    assert.match(body2.error, /inválido o ausente/);

    // La raíz projects/ y su contenido permanecen idénticos
    assert.ok(fs.existsSync(projectsDir), 'projects/ no fue eliminada');
    assert.equal(snapshotTree(projectsDir), rootSnapshotBefore);
  });

  test('Espacios, caracteres especiales y URL mal codificada: rechaza con 400', async () => {
    const rootSnapshotBefore = snapshotTree(projectsDir);

    const badIds = ['%20%20', '$$$###', '@project!', '%FF%FF'];
    for (const bad of badIds) {
      const res = await fetch(`${backend.origin}/api/projects/${bad}`, { method: 'DELETE' });
      assert.equal(res.status, 400, `caso ${bad} debió responder 400`);
      const body = await res.json();
      assert.ok(body.error);
    }

    assert.equal(snapshotTree(projectsDir), rootSnapshotBefore);
  });

  test('Path Traversal simple y codificado: no escapa y es neutralizado', async () => {
    const rootSnapshotBefore = snapshotTree(projectsDir);

    // Los patrones de traversal que contienen barras o secuencias relativas
    // (p. ej. %2F..%2F o ..%2F..) son normalizados por el parser WHATWG URL (new URL)
    // o procesados por el backend. En todos los casos deben ser neutralizados con 400 o 404
    // sin que jamás alcancen la ejecución destructiva en disco.
    const traversalCases = [
      '..',
      '%2E%2E',
      '..%2F..',
      '..%2F',
      'proj_test_alpha%2F..%2Fproj_test_beta_neighbor',
      '%2E',
      '.',
    ];
    for (const t of traversalCases) {
      const res = await fetch(`${backend.origin}/api/projects/${t}`, { method: 'DELETE' });
      assert.ok(
        res.status === 400 || res.status === 404,
        `traversal ${t} debió responder 400 o 404 (obtenido ${res.status})`
      );
    }

    assert.equal(snapshotTree(projectsDir), rootSnapshotBefore);
  });

  test('Rutas absolutas o con barras: rechaza con 400', async () => {
    const rootSnapshotBefore = snapshotTree(projectsDir);

    const absoluteCases = ['%2Fetc%2Fpasswd', '%2Ftmp', 'sub%2Ffolder'];
    for (const abs of absoluteCases) {
      const res = await fetch(`${backend.origin}/api/projects/${abs}`, { method: 'DELETE' });
      assert.equal(res.status, 400);
    }

    assert.equal(snapshotTree(projectsDir), rootSnapshotBefore);
  });

  test('Proyecto inexistente: devuelve 404 explícito y no altera el disco', async () => {
    const rootSnapshotBefore = snapshotTree(projectsDir);

    const res = await fetch(`${backend.origin}/api/projects/proj_inexistente_999`, { method: 'DELETE' });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /no encontrado/);

    assert.equal(snapshotTree(projectsDir), rootSnapshotBefore);
  });

  test('Directorio de proyecto que es un enlace simbólico: rechaza con 400 sin seguir el enlace', async () => {
    // Crear un directorio objetivo fuera de projects/ (dentro de sandbox)
    const outsideTarget = resolveInside(backend.sandbox.root, 'outside_target');
    fs.mkdirSync(outsideTarget, { recursive: true });
    fs.writeFileSync(path.join(outsideTarget, 'secret.txt'), 'contenido sensible');

    // Crear un symlink dentro de projects/ apuntando a outsideTarget
    const symlinkProj = path.join(projectsDir, 'proj_symlink');
    fs.symlinkSync(outsideTarget, symlinkProj);

    try {
      const res = await fetch(`${backend.origin}/api/projects/proj_symlink`, { method: 'DELETE' });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error, /enlace simbólico/);

      // El objetivo externo no debe haber sido eliminado ni afectado
      assert.ok(fs.existsSync(outsideTarget));
      assert.ok(fs.existsSync(path.join(outsideTarget, 'secret.txt')));
    } finally {
      if (fs.existsSync(symlinkProj)) fs.unlinkSync(symlinkProj);
      if (fs.existsSync(outsideTarget)) fs.rmSync(outsideTarget, { recursive: true, force: true });
    }
  });

  test('Eliminación válida de proyecto: elimina solo el objetivo y preserva proyectos vecinos', async () => {
    const targetFolder = resolveInside(projectsDir, PROJ_A);
    const neighborFolder = resolveInside(projectsDir, PROJ_B);

    assert.ok(fs.existsSync(targetFolder), 'alpha debe existir antes de borrar');
    assert.ok(fs.existsSync(neighborFolder), 'beta debe existir antes de borrar');

    const neighborSnapshotBefore = snapshotTree(neighborFolder);

    const res = await fetch(`${backend.origin}/api/projects/${PROJ_A}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, deletedId: PROJ_A });

    // 1. El proyecto objetivo ya no existe
    assert.equal(fs.existsSync(targetFolder), false, 'alpha fue eliminado correctamente');

    // 2. El proyecto vecino no fue tocado en lo más mínimo
    assert.ok(fs.existsSync(neighborFolder), 'beta vecino sigue existiendo');
    assert.equal(snapshotTree(neighborFolder), neighborSnapshotBefore, 'el contenido del vecino está intacto');

    // 3. La raíz projects/ sigue existiendo
    assert.ok(fs.existsSync(projectsDir), 'projects/ raíz sigue viva');
  });

  test('Defensa en Zustand frontend: deleteProject rechaza IDs inválidos sin emitir peticiones HTTP', async () => {
    const store = useProjectStore.getState();
    const networkCountBefore = networkAudit.length;

    // Probar varios IDs inválidos
    const invalidIds = ['', '   ', 'proj/bad', '..', '$$$'];
    for (const invalid of invalidIds) {
      await store.deleteProject(invalid);
      assert.equal(
        useProjectStore.getState().errorMessage,
        'Identificador de proyecto inválido para eliminación'
      );
    }

    // Ninguna petición HTTP debió haberse emitido
    assert.equal(networkAudit.length, networkCountBefore, 'no se enviaron peticiones a la red');
  });
});
