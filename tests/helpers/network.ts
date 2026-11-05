import net from 'node:net';
import { REAL_BACKEND_PORT } from './sandbox';

/**
 * Guardas de red para pruebas.
 *
 * 1. Capa de conexión (net.Socket.prototype.connect): solo se permite conectar a
 *    loopback en los puertos autorizados explícitamente (el backend temporal).
 *    Cualquier otro destino, incluido el puerto real 45173, falla de inmediato.
 * 2. Capa fetch: el store usa la URL de producción (http://127.0.0.1:45173 en
 *    Node, sin window). Esa petición se reescribe al backend temporal y nunca se
 *    conecta al puerto real. Cualquier otro origen se rechaza.
 */

export interface NetworkAuditEntry {
  kind: 'connect-allowed' | 'connect-blocked' | 'fetch-rewritten' | 'fetch-allowed' | 'fetch-blocked';
  target: string;
  requested?: string;
}

const PRODUCTION_ORIGIN = `http://127.0.0.1:${REAL_BACKEND_PORT}`;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

const allowedPorts = new Set<number>();
export const networkAudit: NetworkAuditEntry[] = [];

let connectGuardInstalled = false;
let originalConnect: typeof net.Socket.prototype.connect | null = null;
let originalFetch: typeof globalThis.fetch | null = null;
let allowedOrigin: string | null = null;

function extractConnectTarget(args: unknown[]): { host?: string; port?: number; path?: string } {
  let first: unknown = args[0];
  // net.connect() pasa un array "normalizado" [options, cb].
  if (Array.isArray(first)) first = first[0];
  if (first && typeof first === 'object') {
    const o = first as { port?: unknown; host?: unknown; path?: unknown };
    return {
      host: typeof o.host === 'string' ? o.host : undefined,
      port: o.port !== undefined ? Number(o.port) : undefined,
      path: typeof o.path === 'string' ? o.path : undefined,
    };
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return { port: Number(first), host: typeof args[1] === 'string' ? (args[1] as string) : undefined };
  }
  if (typeof first === 'string') return { path: first };
  return {};
}

function installConnectGuard(): void {
  if (connectGuardInstalled) return;
  originalConnect = net.Socket.prototype.connect;
  const guarded = function (this: net.Socket, ...args: unknown[]) {
    const t = extractConnectTarget(args);
    const desc = t.path ? `unix:${t.path}` : `${t.host ?? 'localhost'}:${t.port}`;
    const host = t.host ?? 'localhost';
    const allowed =
      !t.path && t.port !== undefined && allowedPorts.has(t.port) && LOOPBACK_HOSTS.has(host);
    if (!allowed) {
      networkAudit.push({ kind: 'connect-blocked', target: desc });
      throw new Error(`[sandbox] Conexión bloqueada hacia ${desc}: destino no autorizado en pruebas.`);
    }
    networkAudit.push({ kind: 'connect-allowed', target: desc });
    return (originalConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  };
  net.Socket.prototype.connect = guarded as unknown as typeof net.Socket.prototype.connect;
  connectGuardInstalled = true;
}

function requestToString(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === 'object' && 'url' in input) return String((input as { url: unknown }).url);
  return String(input);
}

/** Instala las guardas y autoriza únicamente el backend temporal indicado. */
export function installNetworkGuard(testBackendPort: number): string {
  if (testBackendPort === REAL_BACKEND_PORT) {
    throw new Error('El backend de prueba no puede usar el puerto del backend real.');
  }
  installConnectGuard();
  allowedPorts.clear();
  allowedPorts.add(testBackendPort);
  allowedOrigin = `http://127.0.0.1:${testBackendPort}`;

  if (!originalFetch) originalFetch = globalThis.fetch;
  const baseFetch = originalFetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const requested = requestToString(input);
    let url: URL;
    try {
      url = new URL(requested);
    } catch {
      networkAudit.push({ kind: 'fetch-blocked', target: requested });
      throw new Error(`[sandbox] fetch bloqueado: URL no absoluta o inválida (${requested}).`);
    }
    if (url.origin === PRODUCTION_ORIGIN) {
      const rewritten = `${allowedOrigin}${url.pathname}${url.search}`;
      networkAudit.push({ kind: 'fetch-rewritten', requested, target: rewritten });
      return baseFetch(rewritten, init);
    }
    if (url.origin === allowedOrigin) {
      networkAudit.push({ kind: 'fetch-allowed', target: requested });
      return baseFetch(requested, init);
    }
    networkAudit.push({ kind: 'fetch-blocked', target: requested });
    throw new Error(`[sandbox] fetch bloqueado hacia ${url.origin}: destino no autorizado en pruebas.`);
  }) as typeof globalThis.fetch;

  return allowedOrigin;
}

export function uninstallNetworkGuard(): void {
  if (originalFetch) globalThis.fetch = originalFetch;
  originalFetch = null;
  if (connectGuardInstalled && originalConnect) {
    net.Socket.prototype.connect = originalConnect;
  }
  connectGuardInstalled = false;
  originalConnect = null;
  allowedPorts.clear();
  allowedOrigin = null;
}
