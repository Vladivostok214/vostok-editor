import http from 'node:http';
import { ensureDirectories, handleMediaBackendRequest } from './mediaBackendPlugin';

const PORT = parseInt(process.env.VOSTOK_BACKEND_PORT || process.env.PORT || '45173', 10);
const HOST = '127.0.0.1';

ensureDirectories();

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', service: 'vostok-backend' }));
  }

  handleMediaBackendRequest(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Not Found: ${req.url}` }));
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[Vostok Backend] Servidor multimedia activo en http://${HOST}:${PORT}`);
});

function shutdown() {
  console.log('[Vostok Backend] Apagando servidor...');
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Auto-cierre si el proceso padre (Tauri) finaliza o cierra la tubería stdin
process.stdin.resume();
process.stdin.on('end', () => {
  console.log('[Vostok Backend] Tubería stdin cerrada por el proceso padre. Saliendo...');
  process.exit(0);
});
process.stdin.on('close', () => {
  process.exit(0);
});
