#!/usr/bin/env node
/**
 * Runner de pruebas: esbuild + node:test, con sandbox exclusivo por ejecución.
 *
 *   npm test                 # corre tests/**\/*.test.ts
 *   npm test -- --keep       # conserva el sandbox para inspección
 *   npm test -- <filtro>     # solo archivos cuya ruta contenga <filtro>
 *
 * Requisitos: Node >= 22 (node:test), esbuild (devDependency) y ffmpeg/ffprobe
 * solo para pruebas que los usen.
 *
 * Seguridad: crea un directorio temporal nuevo (mkdtemp), exporta
 * VIDEO_EDITOR_TEST_DATA_DIR/VIDEO_EDITOR_TEST_CACHE_DIR antes de lanzar los tests
 * y comprueba que ~/.local/share/video-editor y <tmp>/video-editor-cache no cambian.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const filters = args.filter((a) => !a.startsWith('--'));

function findTests(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(full));
    else if (entry.name.endsWith('.test.ts')) out.push(full);
  }
  return out.sort();
}

const esbuildCommon = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['vite'],
  sourcemap: 'inline',
  logLevel: 'warning',
  absWorkingDir: repoRoot,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
};

// 1. Compilar el helper de sandbox a un directorio temporal propio y usar su
//    createSandbox() (misma implementación que usan los tests).
const bootstrapDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'video-editor-bootstrap-'));
let sandbox;
let sandboxMod;
let exitCode = 1;
const protectedDirs = [
  path.join(os.homedir(), '.local', 'share', 'video-editor'),
  path.join(os.tmpdir(), 'video-editor-cache'),
];
try {
  await build({
    ...esbuildCommon,
    entryPoints: [path.join(repoRoot, 'tests/helpers/sandbox.ts')],
    outfile: path.join(bootstrapDir, 'sandbox.mjs'),
  });
  sandboxMod = await import(pathToFileURL(path.join(bootstrapDir, 'sandbox.mjs')).href);
  sandbox = sandboxMod.createSandbox();

  const allTests = findTests(path.join(repoRoot, 'tests')).filter(
    (f) => filters.length === 0 || filters.some((s) => f.includes(s))
  );
  if (allTests.length === 0) {
    console.error('No se encontraron pruebas.');
    process.exit(1);
  }

  // 2. Compilar los tests dentro del sandbox.
  const buildDir = path.join(sandbox.root, 'build');
  // Además de los tests se compila el módulo del backend (sin ejecutarlo) para que los
  // tests de aislamiento puedan importarlo en procesos hijos controlados.
  await build({
    ...esbuildCommon,
    entryPoints: [...allTests, path.join(repoRoot, 'server/mediaBackendPlugin.ts')],
    outdir: buildDir,
    outbase: repoRoot,
    outExtension: { '.js': '.mjs' },
  });
  const built = allTests.map((f) => path.join(buildDir, path.relative(repoRoot, f).replace(/\.ts$/, '.mjs')));

  // 3. Huella de ubicaciones reales antes de ejecutar.
  const before = protectedDirs.map((d) => sandboxMod.snapshotTree(d));

  // 4. Ejecutar con el entorno de aislamiento ya establecido.
  const env = { ...process.env, ...sandboxMod.sandboxEnv(sandbox) };
  console.log(`[tests] sandbox: ${sandbox.root}`);
  const res = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', '--enable-source-maps', ...built],
    { stdio: 'inherit', env, cwd: repoRoot }
  );
  exitCode = res.status ?? 1;

  // 5. Verificar que lo real no cambió.
  const after = protectedDirs.map((d) => sandboxMod.snapshotTree(d));
  protectedDirs.forEach((d, i) => {
    if (before[i] !== after[i]) {
      console.error(`[tests] ERROR: cambió una ubicación real: ${d}`);
      exitCode = 1;
    }
  });
} catch (err) {
  console.error('[tests] Error del runner:', err);
  exitCode = 1;
} finally {
  if (sandbox && sandboxMod) {
    if (keep) console.log(`[tests] sandbox conservado: ${sandbox.root}`);
    else {
      try {
        sandboxMod.destroySandbox(sandbox);
      } catch (e) {
        console.error('[tests] No se pudo eliminar el sandbox:', e.message);
      }
    }
  }
  fs.rmSync(bootstrapDir, { recursive: true, force: true });
}
process.exit(exitCode);
