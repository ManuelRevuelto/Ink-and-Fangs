import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { GameServer } from './rooms';

/**
 * Servidor de producción: sirve el juego ya construido (carpeta dist/) y las salas online (/ws)
 * en el mismo puerto. Uso: npm run build && npm start
 */
const PORT = Number(process.env.PORT ?? 8787);
const DIST = resolve(process.cwd(), 'dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  // Evita salir de dist/ con rutas como /../../
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Falta construir el juego: ejecuta «npm run build».');
    return;
  }
  const cache = file.includes(`${join(DIST, 'assets')}`) && !file.endsWith('.png') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cache });
  createReadStream(file).pipe(res);
});

new GameServer().attach(server);
server.listen(PORT, () => console.log(`🐙🦈 Ink and Fangs escuchando en http://localhost:${PORT}`));
