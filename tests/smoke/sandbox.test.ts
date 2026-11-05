import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  requireSandbox,
  resolveInside,
  createSandbox,
  destroySandbox,
  sandboxEnv,
  snapshotTree,
  SANDBOX_ROOT_ENV,
  SANDBOX_MARKER_FILE,
  REAL_BACKEND_PORT,
} from '../helpers/sandbox';
import { networkAudit } from '../helpers/network';
import { startTestBackend, type TestBackend } from '../helpers/backend';
import { makeProject } from '../helpers/fixtures';
import { TEST_DATA_DIR_ENV, TEST_CACHE_DIR_ENV } from '../../server/storageConfig';

const REAL_DATA = path.join(os.homedir(), '.local', 'share', 'video-editor');
const REAL_CACHE = path.join(os.tmpdir(), 'video-editor-cache');

describe('sandbox: configuración segura', () => {
  test('falla si falta la configuración', () => {
    assert.throws(() => requireSandbox({}), /no configurado/);
    assert.throws(() => requireSandbox({ [SANDBOX_ROOT_ENV]: '/tmp' }), /no configurado/);
  });

  test('rechaza rutas relativas, datos reales, HOME y directorios sin marcador', () => {
    const sb = requireSandbox();
    const base = sandboxEnv(sb);
    assert.throws(() => requireSandbox({ ...base, [TEST_DATA_DIR_ENV]: 'relativa' }), /absolutas/);
    assert.throws(() => requireSandbox({ ...base, [SANDBOX_ROOT_ENV]: os.homedir() }));
    assert.throws(() => requireSandbox({ ...base, [SANDBOX_ROOT_ENV]: os.tmpdir() }));
    if (fs.existsSync(REAL_DATA)) {
      assert.throws(() => requireSandbox({ ...base, [SANDBOX_ROOT_ENV]: REAL_DATA, [TEST_DATA_DIR_ENV]: path.join(REAL_DATA, 'projects') }));
    }
    // Directorio con el prefijo correcto pero sin marcador: se rechaza.
    const fake = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'video-editor-test-'));
    try {
      fs.mkdirSync(path.join(fake, 'data'));
      fs.mkdirSync(path.join(fake, 'cache'));
      assert.throws(
        () =>
          requireSandbox({
            [SANDBOX_ROOT_ENV]: fake,
            [TEST_DATA_DIR_ENV]: path.join(fake, 'data'),
            [TEST_CACHE_DIR_ENV]: path.join(fake, 'cache'),
          }),
        /marcador/
      );
    } finally {
      fs.rmSync(fake, { recursive: true, force: true });
    }
  });

  test('el sandbox activo es temporal, exclusivo y distinto de las rutas reales', () => {
    const sb = requireSandbox();
    assert.ok(sb.root.startsWith(fs.realpathSync(os.tmpdir())));
    assert.notEqual(sb.dataDir, REAL_DATA);
    assert.notEqual(sb.cacheDir, REAL_CACHE);
    assert.ok(fs.existsSync(path.join(sb.root, SANDBOX_MARKER_FILE)));
  });

  test('createSandbox/destroySandbox solo eliminan su propio directorio', () => {
    const sb = createSandbox();
    assert.ok(fs.existsSync(sb.dataDir));
    destroySandbox(sb);
    assert.equal(fs.existsSync(sb.root), false);
    // Sandbox forjado: sin marcador válido no se elimina nada.
    const forged = { ...createSandbox() };
    try {
      assert.throws(() => destroySandbox({ ...forged, token: 'a'.repeat(32) }));
      assert.ok(fs.existsSync(forged.root));
    } finally {
      destroySandbox(forged);
    }
  });
});

describe('sandbox: traversal y enlaces simbólicos', () => {
  let outside: string;
  before(() => {
    // Directorio sintético fuera del sandbox, solo para comprobar que no se escapa a él.
    outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'video-editor-test-outside-'));
  });
  after(() => fs.rmSync(outside, { recursive: true, force: true }));

  test('resolveInside rechaza ../, rutas absolutas y bytes nulos', () => {
    const sb = requireSandbox();
    assert.equal(resolveInside(sb.root, 'data/ok.json'), path.join(sb.root, 'data', 'ok.json'));
    assert.throws(() => resolveInside(sb.root, '../fuera'), /traversal/);
    assert.throws(() => resolveInside(sb.root, 'data/../../fuera'), /traversal/);
    assert.throws(() => resolveInside(sb.root, '/etc/passwd'), /absoluta/);
    assert.throws(() => resolveInside(sb.root, 'a\0b'), /nulo/);
  });

  test('resolveInside rechaza symlinks que escapan (archivo, directorio y ancestro)', () => {
    const sb = requireSandbox();
    const linkDir = path.join(sb.root, 'link_dir');
    const linkFile = path.join(sb.root, 'link_file');
    fs.writeFileSync(path.join(outside, 'x.txt'), 'x');
    fs.symlinkSync(outside, linkDir);
    fs.symlinkSync(path.join(outside, 'x.txt'), linkFile);
    try {
      assert.throws(() => resolveInside(sb.root, 'link_dir'), /enlace simbólico/);
      assert.throws(() => resolveInside(sb.root, 'link_file'), /enlace simbólico/);
      assert.throws(() => resolveInside(sb.root, 'link_dir/nuevo/archivo.txt'), /enlace simbólico/);
    } finally {
      fs.unlinkSync(linkDir);
      fs.unlinkSync(linkFile);
    }
  });

  test('requireSandbox rechaza data/cache convertidos en symlink hacia fuera', () => {
    const sb = requireSandbox();
    const base = sandboxEnv(sb);
    const link = path.join(sb.root, 'link_data');
    fs.symlinkSync(outside, link);
    try {
      assert.throws(() => requireSandbox({ ...base, [TEST_DATA_DIR_ENV]: link }));
    } finally {
      fs.unlinkSync(link);
    }
  });
});

describe('backend de prueba aislado', () => {
  let backend: TestBackend;
  let realBefore: string;
  let cacheBefore: string;

  before(async () => {
    realBefore = snapshotTree(REAL_DATA);
    cacheBefore = snapshotTree(REAL_CACHE);
    backend = await startTestBackend();
  });
  after(async () => {
    await backend?.close();
  });

  test('usa un puerto efímero distinto del backend real y rutas del sandbox', async () => {
    assert.notEqual(backend.port, REAL_BACKEND_PORT);
    const res = await fetch(`${backend.origin}/api/system/status`);
    const body = (await res.json()) as { paths: { projectsDir: string; tempCacheDir: string } };
    assert.equal(body.paths.projectsDir, path.join(backend.sandbox.dataDir, 'projects'));
    assert.equal(body.paths.tempCacheDir, backend.sandbox.cacheDir);
  });

  test('guardar un proyecto fixture escribe solo dentro del sandbox', async () => {
    const project = makeProject({ id: 'proj_smoke_1' });
    const res = await fetch(`${backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    assert.equal(res.status, 200);
    const file = resolveInside(backend.sandbox.dataDir, 'projects/proj_smoke_1/project.json');
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8'));
    assert.equal(onDisk.id, 'proj_smoke_1');
    assert.equal(onDisk.name, project.name);
  });

  test('un id con traversal se sanea y no crea nada fuera de projects/', async () => {
    const before = fs.readdirSync(backend.sandbox.root).sort();
    const res = await fetch(`${backend.origin}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeProject({ id: '../escape' })),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { project: { id: string } };
    assert.equal(body.project.id, 'escape');
    assert.deepEqual(fs.readdirSync(backend.sandbox.root).sort(), before);
    assert.ok(fs.existsSync(path.join(backend.sandbox.dataDir, 'projects', 'escape', 'project.json')));
  });

  test('conexiones a otros puertos (incluido el real 45173) fallan de inmediato', async () => {
    const attempt = (port: number) =>
      new Promise<string>((resolve) => {
        try {
          const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, () => resolve('conectó'));
          req.on('error', (e) => resolve(`error:${e.message}`));
        } catch (e) {
          resolve(`throw:${(e as Error).message}`);
        }
      });
    for (const port of [REAL_BACKEND_PORT, 80, backend.port + 1]) {
      const outcome = await attempt(port);
      assert.match(outcome, /bloqueada/, `puerto ${port}: ${outcome}`);
    }
    assert.ok(networkAudit.some((e) => e.kind === 'connect-blocked' && e.target.endsWith(`:${REAL_BACKEND_PORT}`)));
  });

  test('fetch a destinos no autorizados se rechaza sin conectar', async () => {
    await assert.rejects(fetch('http://127.0.0.1:9/x'), /bloqueado/);
    await assert.rejects(fetch('http://localhost:' + backend.port + '/api/system/status'), /bloqueado/);
    await assert.rejects(fetch('https://example.com/'), /bloqueado/);
    await assert.rejects(fetch('/api/projects'), /bloqueado/);
    await assert.rejects(fetch(new Request('http://192.168.0.1/')), /bloqueado/);
  });

  test('los datos y la caché reales permanecen intactos', () => {
    assert.equal(snapshotTree(REAL_DATA), realBefore);
    assert.equal(snapshotTree(REAL_CACHE), cacheBefore);
  });
});

/*
 * Limitaciones documentadas (no se prueban a propósito):
 * - Endpoints que aceptan rutas arbitrarias del cliente (/api/fs/browse, /api/fs/mkdir,
 *   /api/media/probe|waveform|check-status|relink, /api/media/import-*) no se ejecutan:
 *   no hay garantía de aislamiento hasta F01/F02 y podrían leer/escribir fuera del sandbox.
 * - /api/system/clear-cache solo borra el caché del sandbox, pero se omite hasta tener
 *   un test específico que lo requiera.
 */
