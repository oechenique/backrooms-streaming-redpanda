import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';

// El mapa de los perdidos. Lee el Gold liviano que exporta el consumer en data/gold, servido en /gold/ (solo los
// .json: Bronze y Silver no salen de la máquina).
const here = fileURLToPath(new URL('.', import.meta.url));
const goldDir = resolve(here, '../data/gold');

const serveGold: Connect.NextHandleFunction = (req, res, next) => {
  const path = decodeURIComponent((req.url ?? '').split('?')[0]);
  if (!path.startsWith('/gold/')) return next();
  const file = resolve(goldDir, '.' + path.slice('/gold'.length));
  const notFound = () => {
    res.statusCode = 404;
    res.end();
  };
  if (!file.startsWith(goldDir + sep) || !file.endsWith('.json')) return notFound();
  readFile(file).then((body) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(body);
  }, notFound);
};

const gold = (): Plugin => ({
  name: 'gold',
  configureServer: (server) => void server.middlewares.use(serveGold),
  configurePreviewServer: (server) => void server.middlewares.use(serveGold),
});

export default defineConfig({
  root: here,
  plugins: [gold()],
  build: { outDir: resolve(here, '../dist-dashboard'), emptyOutDir: true, target: 'es2020' },
  server: { host: true, port: 5174 },
  preview: { port: 4174 },
});
