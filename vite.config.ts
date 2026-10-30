import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mediaBackendPlugin } from './server/mediaBackendPlugin';

export default defineConfig({
  plugins: [react(), mediaBackendPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
