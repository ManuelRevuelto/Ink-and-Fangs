import { defineConfig, type Plugin } from 'vite';
import type { Server } from 'node:http';

/**
 * En desarrollo, el servidor de salas online se engancha al propio servidor de Vite (ruta /ws),
 * así `npm run dev` sirve el juego y las salas a la vez.
 * Se carga con el cargador de módulos de Vite para poder importar el motor del juego (TypeScript).
 */
function onlineRooms(): Plugin {
  return {
    name: 'ink-and-fangs-salas',
    async configureServer(server) {
      const { GameServer } = (await server.ssrLoadModule('/server/rooms.ts')) as typeof import('./server/rooms');
      if (server.httpServer) new GameServer().attach(server.httpServer as Server);
    },
  };
}

export default defineConfig({
  plugins: [onlineRooms()],
});
