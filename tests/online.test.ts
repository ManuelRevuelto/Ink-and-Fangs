import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GameServer } from '../server/rooms';
import { octopusDecide } from '../src/ai/octopusAI';
import { sharkDecide } from '../src/ai/sharkAI';
import { LAIRS } from '../src/data/board';
import { actors, HIDDEN, type PlayerView, type Role } from '../src/engine';
import type { Action } from '../src/engine/types';
import type { ClientMsg, ServerMsg } from '../src/net/protocol';

/** Cliente de prueba: guarda todos los mensajes y permite esperar el siguiente que cumpla algo. */
class TestClient {
  ws: WebSocket;
  inbox: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  view: PlayerView | null = null;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      this.inbox.push(m);
      if (m.t === 'state') this.view = m.view;
      const i = this.waiters.findIndex((w) => w.pred(m));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
    });
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => boolean, ms = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(timer), resolve(m as T)) });
    });
  }
}

let http: Server;
let rooms: GameServer;
let url = '';

beforeAll(async () => {
  http = createServer();
  rooms = new GameServer();
  rooms.attach(http);
  await new Promise<void>((r) => http.listen(0, r));
  url = `ws://localhost:${(http.address() as AddressInfo).port}/ws`;
});

afterAll(() => {
  rooms.close();
  http.close();
});

async function openRoom(creatorRole: Role) {
  const a = new TestClient(url);
  await a.open();
  a.send({ t: 'create', role: creatorRole });
  const created = await a.waitFor<Extract<ServerMsg, { t: 'joined' }>>((m) => m.t === 'joined');
  const b = new TestClient(url);
  await b.open();
  b.send({ t: 'join', code: created.code.toLowerCase() }); // el código no distingue mayúsculas
  await b.waitFor((m) => m.t === 'joined');
  const clients: Record<Role, TestClient> = creatorRole === 'pulpo' ? { pulpo: a, tiburon: b } : { pulpo: b, tiburon: a };
  return { code: created.code, clients };
}

describe('modo online', () => {
  it('no se puede entrar en una sala que no existe ni en una llena', async () => {
    const c = new TestClient(url);
    await c.open();
    c.send({ t: 'join', code: 'ZZZZ' });
    const err = await c.waitFor<Extract<ServerMsg, { t: 'error' }>>((m) => m.t === 'error');
    expect(err.msg).toMatch(/no existe/i);

    const { code } = await openRoom('tiburon');
    c.send({ t: 'join', code });
    const full = await c.waitFor<Extract<ServerMsg, { t: 'error' }>>((m) => m.t === 'error');
    expect(full.msg).toMatch(/llena/i);
  });

  it('dos jugadores juegan una partida completa a través del servidor sin ver lo oculto del rival', async () => {
    const { clients } = await openRoom('pulpo');
    await clients.pulpo.waitFor((m) => m.t === 'setup');
    clients.pulpo.send({ t: 'lair', lair: LAIRS[2] });
    await Promise.all([clients.pulpo.waitFor((m) => m.t === 'state'), clients.tiburon.waitFor((m) => m.t === 'state')]);

    const brains: Record<Role, (v: PlayerView) => Action[]> = {
      pulpo: (v) => octopusDecide(v),
      tiburon: (v) => [sharkDecide(v)],
    };

    /** Espera a que un cliente tenga al menos el estado más reciente (mismo nº de líneas de registro). */
    const syncWith = async (c: TestClient, latest: PlayerView) => {
      while (c.view!.log.length < latest.log.length) await c.waitFor((m) => m.t === 'state');
    };

    let latest = clients.pulpo.view!;
    let steps = 0;
    while (!latest.winner && steps < 3000) {
      steps++;
      const role: Role = actors(latest)[0];
      const client = clients[role];
      await syncWith(client, latest);
      await syncWith(clients.tiburon, latest);
      const myView = client.view!;
      // Lo que recibe el tiburón nunca muestra los bloques ocultos.
      const shark = clients.tiburon.view!;
      shark.spaces.forEach((sp) => {
        if (sp.block && !sp.revealed) expect(sp.block).toBe(HIDDEN);
      });
      expect(shark.pulpo.hand.every((c) => c === HIDDEN)).toBe(true);

      let done = false;
      for (const action of brains[role](myView)) {
        const answer = client.waitFor((m) => (m.t === 'state' && m.cause === 'you') || m.t === 'error');
        client.send({ t: 'action', action });
        const res = await answer;
        if (res.t === 'state') {
          latest = res.view;
          done = true;
          break;
        }
      }
      expect(done).toBe(true);
    }
    await syncWith(clients.pulpo, latest);
    await syncWith(clients.tiburon, latest);
    expect(latest.winner).not.toBeNull();
    expect(clients.pulpo.view!.winner).toBe(latest.winner);
    expect(clients.tiburon.view!.winner).toBe(latest.winner);
  }, 60_000);

  it('si un jugador se desconecta, el rival se entera y puede volver con su token', async () => {
    const { code, clients } = await openRoom('pulpo');
    await clients.pulpo.waitFor((m) => m.t === 'setup');
    clients.pulpo.send({ t: 'lair', lair: LAIRS[0] });
    await clients.tiburon.waitFor((m) => m.t === 'state');
    const token = clients.tiburon.inbox.find((m): m is Extract<ServerMsg, { t: 'joined' }> => m.t === 'joined')!.token;

    const gone = clients.pulpo.waitFor<Extract<ServerMsg, { t: 'opponent' }>>((m) => m.t === 'opponent');
    clients.tiburon.ws.close();
    expect((await gone).connected).toBe(false);

    const back = new TestClient(url);
    await back.open();
    const returned = clients.pulpo.waitFor<Extract<ServerMsg, { t: 'opponent' }>>((m) => m.t === 'opponent');
    back.send({ t: 'rejoin', code, token });
    const sync = await back.waitFor<Extract<ServerMsg, { t: 'state' }>>((m) => m.t === 'state');
    expect(sync.cause).toBe('sync');
    expect((await returned).connected).toBe(true);
  });
});
