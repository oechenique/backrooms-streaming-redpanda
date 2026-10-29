import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// El juego manda los eventos a /api/events; Vite los pasa al collector (docker compose) sin CORS.
// Sin X-Forwarded-For (xfwd: false): el collector no ve la IP del jugador.
const collector = {
  '/api': {
    target: process.env.COLLECTOR_URL ?? 'http://localhost:8000',
    changeOrigin: true,
    xfwd: false,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  root: 'game',
  // .env en la raíz del repo (con root: 'game', Vite lo buscaría en game/). Ahí va VITE_COLLECTOR_URL.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2020' },
  server: { host: true, proxy: collector },
  preview: { proxy: collector },
  test: { root: '.', include: ['world/**/*.test.ts', 'game/**/*.test.ts', 'dashboard/**/*.test.ts'] },
});
