import { WS_PATH, type ClientMsg, type ServerMsg } from './protocol';

/**
 * Conexión con el servidor de salas.
 * - `waitFor(pred)`: espera el próximo mensaje que cumpla la condición.
 * - `onMessage`: ve TODOS los mensajes (para actualizar la pantalla).
 * - Si se corta, se reconecta solo y vuelve a la sala con su token.
 */
export class OnlineConnection {
  private ws: WebSocket | null = null;
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  private closedByUs = false;
  private rejoin: { code: string; token: string } | null = null;
  onMessage: (m: ServerMsg) => void = () => {};
  onConnectionChange: (connected: boolean) => void = () => {};

  constructor(private url = defaultUrl()) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.onConnectionChange(true);
        if (this.rejoin) this.send({ t: 'rejoin', ...this.rejoin });
        resolve();
      };
      ws.onerror = () => reject(new Error('No se ha podido conectar con el servidor'));
      ws.onmessage = (e) => this.receive(JSON.parse(String(e.data)) as ServerMsg);
      ws.onclose = () => {
        if (this.closedByUs || this.ws !== ws) return;
        this.onConnectionChange(false);
        this.retry(1);
      };
    });
  }

  private retry(attempt: number) {
    if (this.closedByUs || attempt > 30) return;
    setTimeout(() => this.connect().catch(() => this.retry(attempt + 1)), Math.min(5000, 500 * attempt));
  }

  private receive(m: ServerMsg) {
    if (m.t === 'joined') this.rejoin = { code: m.code, token: m.token };
    this.onMessage(m);
    const i = this.waiters.findIndex((w) => w.pred(m));
    if (i >= 0) this.waiters.splice(i, 1)[0].resolve(m);
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => boolean): Promise<T> {
    return new Promise((resolve) => this.waiters.push({ pred, resolve: resolve as (m: ServerMsg) => void }));
  }

  close() {
    this.closedByUs = true;
    this.waiters = [];
    this.ws?.close();
  }
}

function defaultUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${WS_PATH}`;
}
