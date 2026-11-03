import type { IncomingMessage, Server } from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { LAIRS } from '../src/data/board';
import { newGame, tryAction, viewFor, type GameState, type Role } from '../src/engine';
import { CODE_ALPHABET, normalizeCode, WS_PATH, type ClientMsg, type ServerMsg } from '../src/net/protocol';

/**
 * Servidor de salas online. El estado REAL de cada partida solo vive aquí:
 * los jugadores mandan acciones y reciben su vista (viewFor), así que nadie ve lo oculto del rival.
 */

interface Player {
  token: string;
  ws: WebSocket | null;
}

interface Room {
  code: string;
  seed: number;
  players: Partial<Record<Role, Player>>;
  state: GameState | null; // null mientras se prepara
  lastActive: number;
}

const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // salas inactivas: 3 horas
const other = (r: Role): Role => (r === 'pulpo' ? 'tiburon' : 'pulpo');

export class GameServer {
  readonly rooms = new Map<string, Room>();
  private wss = new WebSocketServer({ noServer: true });
  private cleanup: ReturnType<typeof setInterval>;

  constructor() {
    this.wss.on('connection', (ws) => this.onConnection(ws));
    this.cleanup = setInterval(() => this.purge(), 10 * 60 * 1000);
    this.cleanup.unref?.();
  }

  /** Engancha el servidor de salas a un servidor HTTP (solo atiende la ruta /ws). */
  attach(server: Server) {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!req.url?.startsWith(WS_PATH)) return; // otras rutas (p. ej. la recarga de Vite) no son nuestras
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    });
  }

  close() {
    clearInterval(this.cleanup);
    for (const ws of this.wss.clients) ws.terminate();
    this.wss.close();
  }

  // ---------------- Conexiones ----------------

  private onConnection(ws: WebSocket) {
    let me: { room: Room; role: Role } | null = null;

    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return send(ws, { t: 'error', msg: 'Mensaje no válido' });
      }
      try {
        me = this.handle(ws, msg, me);
      } catch (e) {
        send(ws, { t: 'error', msg: e instanceof Error ? e.message : 'Error inesperado' });
      }
    });

    ws.on('close', () => {
      if (!me) return;
      const p = me.room.players[me.role];
      if (p?.ws === ws) p.ws = null;
      this.sendTo(me.room, other(me.role), { t: 'opponent', connected: false });
    });
  }

  private handle(ws: WebSocket, msg: ClientMsg, me: { room: Room; role: Role } | null): { room: Room; role: Role } | null {
    switch (msg.t) {
      case 'create': {
        const room = this.newRoom();
        const role: Role = msg.role === 'azar' ? (randomInt(2) ? 'pulpo' : 'tiburon') : msg.role;
        const token = this.seat(room, role, ws);
        send(ws, { t: 'joined', code: room.code, role, token, waitingOpponent: true });
        return { room, role };
      }
      case 'join': {
        const room = this.rooms.get(normalizeCode(msg.code));
        if (!room) throw new Error('No existe ninguna sala con ese código');
        const free = (['pulpo', 'tiburon'] as Role[]).find((r) => !room.players[r]);
        if (!free) throw new Error('Esa sala ya está llena');
        const token = this.seat(room, free, ws);
        send(ws, { t: 'joined', code: room.code, role: free, token, waitingOpponent: false });
        this.startSetup(room);
        return { room, role: free };
      }
      case 'rejoin': {
        const room = this.rooms.get(normalizeCode(msg.code));
        const role = room && (['pulpo', 'tiburon'] as Role[]).find((r) => room.players[r]?.token === msg.token);
        if (!room || !role) throw new Error('No se ha podido volver a la sala');
        const p = room.players[role]!;
        if (p.ws && p.ws !== ws) p.ws.close();
        p.ws = ws;
        room.lastActive = Date.now();
        const rival = room.players[other(role)];
        send(ws, { t: 'joined', code: room.code, role, token: p.token, waitingOpponent: !rival });
        if (rival) send(ws, { t: 'opponent', connected: !!rival.ws });
        this.sendTo(room, other(role), { t: 'opponent', connected: true });
        if (room.state) send(ws, { t: 'state', view: viewFor(room.state, role), cause: 'sync' });
        else if (rival) this.sendSetup(room, role);
        return { room, role };
      }
      case 'lair': {
        if (!me) throw new Error('No estás en ninguna sala');
        const { room, role } = me;
        if (room.state) throw new Error('La partida ya ha empezado');
        if (role !== 'pulpo') throw new Error('La guarida la elige el pulpo');
        if (!LAIRS.includes(msg.lair)) throw new Error('Esa casilla no es una guarida');
        room.state = newGame({ seed: room.seed, sharkLair: msg.lair });
        room.lastActive = Date.now();
        for (const r of ['pulpo', 'tiburon'] as Role[]) this.sendTo(room, r, { t: 'state', view: viewFor(room.state, r), cause: 'sync' });
        return me;
      }
      case 'action': {
        if (!me) throw new Error('No estás en ninguna sala');
        const { room, role } = me;
        if (!room.state) throw new Error('La partida aún no ha empezado');
        const res = tryAction(room.state, role, msg.action);
        if (!res.ok) {
          send(ws, { t: 'error', msg: res.error });
          return me;
        }
        room.state = res.state;
        room.lastActive = Date.now();
        send(ws, { t: 'state', view: viewFor(room.state, role), cause: 'you' });
        this.sendTo(room, other(role), { t: 'state', view: viewFor(room.state, other(role)), cause: 'opponent' });
        return me;
      }
    }
  }

  // ---------------- Salas ----------------

  private newRoom(): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = { code, seed: randomInt(2 ** 31), players: {}, state: null, lastActive: Date.now() };
    this.rooms.set(code, room);
    return room;
  }

  private seat(room: Room, role: Role, ws: WebSocket): string {
    const token = randomBytes(16).toString('hex');
    room.players[role] = { token, ws };
    room.lastActive = Date.now();
    return token;
  }

  private startSetup(room: Room) {
    this.sendTo(room, 'pulpo', { t: 'opponent', connected: true });
    this.sendTo(room, 'tiburon', { t: 'opponent', connected: true });
    this.sendSetup(room, 'pulpo');
    this.sendSetup(room, 'tiburon');
  }

  private sendSetup(room: Room, role: Role) {
    if (role === 'pulpo') {
      // El tablero de la vista previa es el mismo que tendrá la partida (misma semilla).
      this.sendTo(room, 'pulpo', { t: 'setup', preview: viewFor(newGame({ seed: room.seed }), 'pulpo') });
    } else this.sendTo(room, 'tiburon', { t: 'waitSetup' });
  }

  private sendTo(room: Room, role: Role, msg: ServerMsg) {
    const ws = room.players[role]?.ws;
    if (ws) send(ws, msg);
  }

  private purge() {
    const now = Date.now();
    for (const [code, room] of this.rooms) if (now - room.lastActive > ROOM_TTL_MS) this.rooms.delete(code);
  }
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
