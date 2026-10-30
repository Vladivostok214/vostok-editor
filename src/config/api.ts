/**
 * Configuración centralizada de endpoints de API para Vostok Editor
 * Compatible con modo desarrollo (Vite) y modo producción (Tauri nativo / AppImage / .deb)
 */

export const BACKEND_PORT = 45173;

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:${BACKEND_PORT}`;
  }

  // Si estamos dentro de la ventana de Tauri (escritorio nativo)
  const isTauri =
    (window as any).__TAURI_INTERNALS__ !== undefined ||
    window.location.protocol === 'tauri:' ||
    window.location.hostname === 'tauri.localhost';

  if (isTauri) {
    return `http://127.0.0.1:${BACKEND_PORT}`;
  }

  // Si estamos en navegador estándar conectado al dev server de Vite (puerto 5173)
  return '';
}

export function apiUrl(path: string): string {
  if (!path) return '';
  // Si ya es una URL completa (http:// o https:// o blob:), no modificar
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }

  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
