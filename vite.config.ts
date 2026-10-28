import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: 'game',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2020' },
  server: { host: true },
  test: { root: '.', include: ['world/**/*.test.ts'] },
});
