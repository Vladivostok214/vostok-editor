import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { requireSandbox, createSandbox, sandboxEnv, destroySandbox, snapshotTree, type Sandbox } from '../helpers/sandbox';
import { TEST_MODE_ENV } from '../../server/storageConfig';

/**
 * Protección del modo de pruebas: el backend no puede inicializar almacenamiento
 * sin un sandbox válido. Cada caso corre en un proceso hijo aislado con HOME y
 * TMPDIR apuntando a un directorio sintético dentro del sandbox, de modo que,
 * aunque la protección fallara, las rutas "de producción" resolverían ahí y
 * nunca al HOME real. El fallo debe ocurrir al importar, antes de cualquier
 * operación de filesystem.
 */

const CHILD_SCRIPT = `
const mod = process.env.VIDEO_EDITOR_TEST_PLUGIN_URL;
try {
  const m = await import(mod);
  if (process.env.VIDEO_EDITOR_TEST_CALL_ENSURE === '1') m.ensureDirectories();
  console.log('IMPORT_OK');
} catch (e) {
  console.log('IMPORT_FAILED: ' + e.message);
  process.exit(3);
}
`;

describe('modo de pruebas: backend sin sandbox válido', () => {
  let active: Sandbox;
  let pluginUrl: string;
  let fakeHome: string;
  let fakeTmp: string;

  before(() => {
    active = requireSandbox();
    const bundle = path.join(active.root, 'build', 'server', 'mediaBackendPlugin.mjs');
    assert.ok(fs.existsSync(bundle), 'el runner debe compilar el módulo del backend');
    pluginUrl = pathToFileURL(bundle).href;
    fakeHome = path.join(active.root, 'fake-home');
    fakeTmp = path.join(active.root, 'fake-tmp');
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.mkdirSync(fakeTmp, { recursive: true });
  });

  function runChild(extraEnv: Record<string, string>) {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: fakeHome,
      TMPDIR: fakeTmp,
      VIDEO_EDITOR_TEST_PLUGIN_URL: pluginUrl,
      ...extraEnv,
    };
    const res = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD_SCRIPT], { env, encoding: 'utf-8' });
    return { status: res.status, out: `${res.stdout}${res.stderr}` };
  }

  test('TEST_MODE sin variables de sandbox: falla al importar y no toca el filesystem', () => {
    const homeBefore = snapshotTree(fakeHome);
    const tmpBefore = snapshotTree(fakeTmp);
    const r = runChild({ [TEST_MODE_ENV]: '1', VIDEO_EDITOR_TEST_CALL_ENSURE: '1' });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /IMPORT_FAILED: Sandbox de pruebas no configurado/);
    assert.doesNotMatch(r.out, /IMPORT_OK/);
    assert.equal(snapshotTree(fakeHome), homeBefore, 'no debe crear rutas de producción');
    assert.equal(snapshotTree(fakeTmp), tmpBefore, 'no debe crear caché de producción');
    assert.equal(fs.existsSync(path.join(fakeHome, '.local')), false);
  });

  test('TEST_MODE con sandbox incompleto (solo datos): se rechaza', () => {
    const env = sandboxEnv(active);
    const r = runChild({ [TEST_MODE_ENV]: '1', VIDEO_EDITOR_TEST_DATA_DIR: env.VIDEO_EDITOR_TEST_DATA_DIR });
    assert.equal(r.status, 3, r.out);
    assert.match(r.out, /IMPORT_FAILED/);
    assert.equal(fs.existsSync(path.join(fakeHome, '.local')), false);
  });

  test('TEST_MODE con directorios sin marcador o fuera de un sandbox: se rechaza', () => {
    // Directorio con prefijo correcto pero creado sin marcador, dentro del sandbox activo.
    const fakeRoot = path.join(active.root, 'video-editor-test-nomarker');
    fs.mkdirSync(path.join(fakeRoot, 'data'), { recursive: true });
    fs.mkdirSync(path.join(fakeRoot, 'cache'), { recursive: true });
    const withoutMarker = runChild({
      [TEST_MODE_ENV]: '1',
      VIDEO_EDITOR_TEST_SANDBOX_ROOT: fakeRoot,
      VIDEO_EDITOR_TEST_DATA_DIR: path.join(fakeRoot, 'data'),
      VIDEO_EDITOR_TEST_CACHE_DIR: path.join(fakeRoot, 'cache'),
    });
    assert.equal(withoutMarker.status, 3, withoutMarker.out);
    assert.match(withoutMarker.out, /IMPORT_FAILED/);

    // Raíz que no es hija directa del tmp del proceso hijo (el sandbox activo no está en fakeTmp).
    const outside = runChild({ [TEST_MODE_ENV]: '1', ...sandboxEnv(active) });
    assert.equal(outside.status, 3, outside.out);
    assert.match(outside.out, /directorio temporal creado por createSandbox/);
    assert.equal(fs.existsSync(path.join(fakeHome, '.local')), false);
  });

  test('TEST_MODE con sandbox válido: el backend importa y usa solo el sandbox', () => {
    const sb = createSandbox();
    try {
      const r = runChild({ ...sandboxEnv(sb), TMPDIR: path.dirname(sb.root), VIDEO_EDITOR_TEST_CALL_ENSURE: '1' });
      assert.equal(r.status, 0, r.out);
      assert.match(r.out, /IMPORT_OK/);
      assert.ok(fs.existsSync(path.join(sb.dataDir, 'projects')));
      assert.equal(fs.existsSync(path.join(fakeHome, '.local')), false);
    } finally {
      destroySandbox(sb);
    }
  });

  test('fuera del modo de pruebas el comportamiento normal se conserva (HOME sintético)', () => {
    const r = runChild({ VIDEO_EDITOR_TEST_CALL_ENSURE: '1' });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /IMPORT_OK/);
    const projects = path.join(fakeHome, '.local', 'share', 'video-editor', 'projects');
    assert.ok(fs.existsSync(projects), 'rutas por defecto relativas a HOME');
    assert.ok(fs.existsSync(path.join(fakeTmp, 'video-editor-cache')));
  });
});
