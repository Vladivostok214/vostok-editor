import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  TEST_DATA_DIR_ENV,
  TEST_CACHE_DIR_ENV,
  TEST_MODE_ENV,
  SANDBOX_ROOT_ENV,
  SANDBOX_MARKER_FILE,
  SANDBOX_PREFIX,
  validateSandboxEnv,
} from '../../server/storageConfig';

export { SANDBOX_ROOT_ENV, SANDBOX_MARKER_FILE, SANDBOX_PREFIX };

/**
 * Sandbox exclusivo para una ejecución de pruebas.
 *
 * Lo crea el runner (scripts/run-tests.mjs) con createSandbox() ANTES de lanzar
 * los tests y exporta su ubicación por variables de entorno, de modo que los
 * módulos de producción calculen sus rutas dentro de él al importarse.
 * Los tests llaman a requireSandbox(): si falta la configuración o es
 * sospechosa, lanzan error y la prueba falla sin tocar nada.
 */

/** Puerto del backend real de la aplicación: ninguna prueba puede conectarse a él. */
export const REAL_BACKEND_PORT = 45173;

export interface Sandbox {
  root: string;
  dataDir: string;
  cacheDir: string;
  token: string;
}

function realTmp(): string {
  return fs.realpathSync(os.tmpdir());
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Crea un directorio temporal nuevo (mkdtemp) con subdirectorios de datos y caché. */
export function createSandbox(): Sandbox {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(realTmp(), SANDBOX_PREFIX)));
  const token = crypto.randomBytes(16).toString('hex');
  const dataDir = path.join(root, 'data');
  const cacheDir = path.join(root, 'cache');
  fs.mkdirSync(dataDir);
  fs.mkdirSync(cacheDir);
  fs.writeFileSync(path.join(root, SANDBOX_MARKER_FILE), token, { mode: 0o600 });
  return { root, dataDir, cacheDir, token };
}

export function sandboxEnv(sb: Sandbox): Record<string, string> {
  return {
    [TEST_MODE_ENV]: '1',
    [SANDBOX_ROOT_ENV]: sb.root,
    [TEST_DATA_DIR_ENV]: sb.dataDir,
    [TEST_CACHE_DIR_ENV]: sb.cacheDir,
  };
}

/** Elimina únicamente un sandbox propio (verifica prefijo, ubicación y marcador). */
export function destroySandbox(sb: Sandbox): void {
  const active = requireSandbox({ ...sandboxEnv(sb) });
  if (active.token !== sb.token) throw new Error('Marcador de sandbox no coincide; no se elimina nada.');
  fs.rmSync(sb.root, { recursive: true, force: true });
}

/**
 * Valida la configuración de aislamiento del entorno y devuelve el sandbox activo.
 * Lanza error si falta algo o si apunta fuera de un sandbox creado por createSandbox().
 */
export function requireSandbox(env: NodeJS.ProcessEnv = process.env): Sandbox {
  return validateSandboxEnv(env);
}

/**
 * Resuelve una ruta relativa dentro de `base` garantizando que no escapa por
 * traversal (..), rutas absolutas ni enlaces simbólicos existentes.
 */
export function resolveInside(base: string, relative: string): string {
  if (relative.includes('\0')) throw new Error('Ruta con byte nulo.');
  if (path.isAbsolute(relative)) throw new Error(`Ruta absoluta no permitida: ${relative}`);
  const realBase = fs.realpathSync(base);
  const target = path.resolve(realBase, relative);
  if (target !== realBase && !isInside(target, realBase)) {
    throw new Error(`La ruta escapa del directorio base (traversal): ${relative}`);
  }
  // Resolver symlinks del ancestro existente más cercano.
  let probe = target;
  const pending: string[] = [];
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    pending.unshift(path.basename(probe));
    probe = parent;
  }
  const realProbe = fs.existsSync(probe) ? fs.realpathSync(probe) : probe;
  const finalPath = path.join(realProbe, ...pending);
  if (finalPath !== realBase && !isInside(finalPath, realBase)) {
    throw new Error(`La ruta escapa del directorio base (enlace simbólico): ${relative}`);
  }
  return finalPath;
}

/** Huella de solo lectura de un árbol (rutas, tipos, tamaños y mtimes). No sigue enlaces. */
export function snapshotTree(dir: string): string {
  const lines: string[] = [];
  const walk = (current: string) => {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(current);
    } catch {
      lines.push(`${current}|missing`);
      return;
    }
    lines.push(`${current}|${st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : 'f'}|${st.size}|${st.mtimeMs}`);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name));
    }
  };
  walk(dir);
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}
