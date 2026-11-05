import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { requireSandbox, REAL_BACKEND_PORT, type Sandbox } from './sandbox';
import { installNetworkGuard, uninstallNetworkGuard } from './network';

export interface TestBackend {
  origin: string;
  port: number;
  sandbox: Sandbox;
  close(): Promise<void>;
}

/**
 * Levanta el backend de producción (handleMediaBackendRequest) en un puerto
 * efímero de 127.0.0.1, con sus directorios dentro del sandbox, e instala las
 * guardas de red. El módulo de producción se importa dinámicamente DESPUÉS de
 * validar el sandbox, para que sus rutas se calculen con las variables de entorno
 * ya establecidas. Si el módulo no apunta al sandbox, aborta.
 */
export async function startTestBackend(): Promise<TestBackend> {
  const sandbox = requireSandbox();
  const { handleMediaBackendRequest, ensureDirectories } = await import('../../server/mediaBackendPlugin');
  ensureDirectories();

  const server = http.createServer((req, res) => {
    void handleMediaBackendRequest(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Not Found: ${req.url}` }));
    });
  });

  let port = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    port = (server.address() as AddressInfo).port;
    if (port !== REAL_BACKEND_PORT) break;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (port === 0 || port === REAL_BACKEND_PORT) {
    throw new Error('No se obtuvo un puerto efímero distinto del puerto del backend real.');
  }

  const origin = installNetworkGuard(port);

  // Comprobación de aislamiento: el backend debe reportar rutas dentro del sandbox.
  const res = await fetch(`${origin}/api/system/status`);
  const status = (await res.json()) as { paths: { projectsDir: string; tempCacheDir: string; exportsDir?: string } };
  const expectedProjects = path.join(sandbox.dataDir, 'projects');
  if (
    status.paths.projectsDir !== expectedProjects ||
    status.paths.tempCacheDir !== sandbox.cacheDir ||
    (status.paths.exportsDir && status.paths.exportsDir !== path.join(sandbox.dataDir, 'exports'))
  ) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    uninstallNetworkGuard();
    throw new Error(`El backend no está aislado en el sandbox: ${JSON.stringify(status.paths)}`);
  }

  return {
    origin,
    port,
    sandbox,
    close: async () => {
      uninstallNetworkGuard();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
