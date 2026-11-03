import { aiAct } from '../ai';
import { brainsFor, DIFFICULTY_NAMES, type Difficulty } from '../ai/difficulty';
import { LAIRS } from '../data/board';
import { actors, newGame, tryAction, viewFor, type GameState, type Role } from '../engine';
import { ask, Cancel, currentSpec, offer, onAskChange } from './ask';
import { drawBoard, hitTest, SIZE, type Fx } from './board';
import { stepsFor } from './replay';
import { isMuted, play, setMuted, soundForEvent } from './sound';
import { HELP_HTML } from './help';
import { loadAssets } from './assets';
import { OnlineConnection } from '../net/client';
import { normalizeCode, type RoleChoice, type ServerMsg } from '../net/protocol';
import type { PlayerView } from '../engine/view';
import type { GameEvent } from '../engine/types';
import { nextAction, resetTentative, UiError } from './flows';
import { pickFromEvent, renderLog, renderOctopusPanel, renderPromptBar, renderSharkPanel } from './panels';
import type { Pick } from './ask';

type Mode =
  | { kind: 'local' }
  | { kind: 'ai'; human: Role; level: Difficulty }
  | { kind: 'online'; me: Role; code: string; conn: OnlineConnection };

const ROLE_NAME: Record<Role, string> = { pulpo: '🐙 Pulpo', tiburon: '🦈 Tiburón' };
const AI_DELAY_MS = 450;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let state: GameState | null = null;
let mode: Mode = { kind: 'local' };
let viewer: Role = 'pulpo';
let error: string | null = null;
let waiting: string | null = null;
let hover: Pick | null = null;
let gameToken = 0;
let fx: Fx | null = null;
let animating = false;
let skipAnim = false;
let animSpeed = 1; // 0 = sin animaciones (tests)
let seen: Record<Role, number> = { pulpo: 0, tiburon: 0 }; // eventos ya vistos por cada jugador
const rolledDice = new Set<number>(); // dados ya mostrados (los nuevos se animan al aparecer)
let opponentConnected = true; // online
let connectionLost = false; // online

/** Velocidad de las animaciones (0 las desactiva). */
export function setAnimationSpeed(speed: number) {
  animSpeed = speed;
}

const isAI = (r: Role) => mode.kind === 'ai' && mode.human !== r;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------- Render ----------------

function renderBoard() {
  if (!state) return;
  const ctx = $<HTMLCanvasElement>('board').getContext('2d')!;
  drawBoard(ctx, viewFor(state, viewer), animating ? null : currentSpec(), hover, fx);
}

function render() {
  if (!state) return;
  const v = viewFor(state, viewer);
  const spec = animating ? null : currentSpec();
  renderBoard();
  $('pulpo-panel').innerHTML = renderOctopusPanel(v, spec);
  $('tiburon-panel').innerHTML = renderSharkPanel(v, spec);
  $('prompt-bar').innerHTML =
    renderPromptBar(spec, error, waiting) + (animating ? '<button id="skip-anim">⏩ Saltar animación</button>' : '');
  $('log').innerHTML = renderLog(v);
  markRollingDice();
  const levelText =
    mode.kind === 'ai' ? ` · Máquina: ${DIFFICULTY_NAMES[mode.level]}` : mode.kind === 'online' ? ` · 🌐 Online, sala ${mode.code}` : ' · 2 jugadores';
  $('viewer').textContent = `Estás viendo como: ${ROLE_NAME[viewer]}${levelText}`;
}

// ---------------- Animaciones ----------------

/** Los dados que aparecen por primera vez en el panel «ruedan». */
function markRollingDice() {
  document.querySelectorAll<HTMLElement>('#tiburon-panel .die[data-pick]').forEach((el) => {
    const id = JSON.parse(el.dataset.pick!).id as number;
    if (rolledDice.has(id)) return;
    rolledDice.add(id);
    if (animSpeed > 0) el.classList.add('rolling');
  });
}

/** Reproduce en el tablero los eventos que `role` aún no ha visto (lo que hizo el rival). */
async function replayFor(role: Role, token: number) {
  if (!state) return;
  const events = state.events.slice(seen[role]);
  seen[role] = state.events.length;
  await animateEvents(events, token, 1);
}

/** Anima una lista de eventos con sonido. speed > 1 = más rápido (para tus propias acciones). */
async function animateEvents(events: GameEvent[], token: number, speed: number) {
  if (!events.length || animSpeed === 0) return;
  animating = true;
  skipAnim = false;
  const prevWaiting = waiting;
  for (const ev of events) {
    if (skipAnim || token !== gameToken) break;
    play(soundForEvent(ev));
    for (const step of stepsFor(ev)) {
      if (skipAnim || token !== gameToken) break;
      waiting = step.caption;
      render();
      const ms = step.ms / (animSpeed * speed);
      const start = performance.now();
      while (!skipAnim && token === gameToken) {
        const t = (performance.now() - start) / ms;
        if (t >= 1) break;
        fx = step.fx(t);
        renderBoard();
        await sleep(33);
      }
    }
  }
  fx = null;
  animating = false;
  waiting = prevWaiting;
  render();
}

// ---------------- Pantallas ----------------

/** Ayuda: va en su propia capa para poder abrirla en cualquier momento sin romper la partida. */
export function showHelp() {
  const el = $('help');
  el.innerHTML = `<div class="overlay-box help-box">${HELP_HTML}<button class="primary" id="help-close">Entendido</button></div>`;
  el.classList.remove('hidden');
  $('help-close').addEventListener('click', () => el.classList.add('hidden'), { once: true });
}

function overlay(html: string): HTMLElement {
  const el = $('overlay');
  el.innerHTML = `<div class="overlay-box">${html}</div>`;
  el.classList.remove('hidden');
  return el;
}

const hideOverlay = () => $('overlay').classList.add('hidden');

function waitButton(el: HTMLElement, selector = 'button'): Promise<string> {
  return new Promise((resolve) => {
    el.querySelectorAll<HTMLButtonElement>(selector).forEach((b) =>
      b.addEventListener('click', () => resolve(b.dataset.value ?? ''), { once: true }),
    );
  });
}

async function passScreen(role: Role) {
  const el = overlay(`
    <h1>${ROLE_NAME[role]}</h1>
    <p>Pasa el ordenador al jugador del <b>${role === 'pulpo' ? 'pulpo' : 'tiburón'}</b>.<br/>
    El otro jugador no debe mirar la pantalla.</p>
    <button class="primary" data-value="ok">Estoy listo</button>`);
  await waitButton(el);
  hideOverlay();
}

export async function showMenu(): Promise<void> {
  gameToken++;
  state = null;
  if (mode.kind === 'online') mode.conn.close();
  mode = { kind: 'local' };
  const el = overlay(`
    <h1>Ink and Fangs</h1>
    <p>El pulpo se esconde. El tiburón caza.</p>
    <div class="menu">
      <button class="primary" data-value="local">👥 2 jugadores (mismo ordenador)</button>
      <button data-value="ai-pulpo">🤖 Contra la máquina: juego con el pulpo</button>
      <button data-value="ai-tiburon">🤖 Contra la máquina: juego con el tiburón</button>
      <button data-value="online-create">🌐 Online: crear una sala</button>
      <button data-value="online-join">🌐 Online: unirme a una sala</button>
    </div>
    <p><button data-value="help">📖 ¿Cómo se juega?</button></p>
    <p class="small">La máquina razona con los dos: el tiburón deduce dónde estás y el pulpo intenta despistarte.</p>`);
  const choice = await waitButton(el);
  hideOverlay();
  if (choice === 'help') {
    showHelp();
    return showMenu();
  }
  if (choice === 'online-create') return onlineCreate();
  if (choice === 'online-join') return onlineJoin();
  if (choice === 'local') mode = { kind: 'local' };
  else {
    const human: Role = choice === 'ai-pulpo' ? 'pulpo' : 'tiburon';
    const rival = human === 'pulpo' ? '🦈 tiburón' : '🐙 pulpo';
    const lv = overlay(`
      <h1>¿Qué nivel tiene el ${rival}?</h1>
      <div class="menu">
        <button data-value="facil">🟢 Fácil — se equivoca a menudo</button>
        <button class="primary" data-value="normal">🟡 Normal</button>
        <button data-value="dificil">🔴 Difícil — afinado para ganar</button>
      </div>`);
    const level = (await waitButton(lv)) as Difficulty;
    hideOverlay();
    mode = { kind: 'ai', human, level };
  }
  startGame();
}

async function startGame() {
  const token = ++gameToken;
  const seed = Math.floor(Math.random() * 2 ** 31);
  resetTentative();
  rolledDice.clear();
  error = null;
  seen = { pulpo: 0, tiburon: 0 };

  // El pulpo elige la guarida inicial del tiburón.
  let sharkLair: number | undefined;
  if (!isAI('pulpo')) {
    state = newGame({ seed });
    viewer = 'pulpo';
    if (mode.kind === 'local') await passScreen('pulpo');
    render();
    const p = await ask({ prompt: 'Preparación: elige la guarida donde empieza el tiburón (casillas rojas).', currents: LAIRS });
    if (p.kind === 'current') sharkLair = p.id;
  }
  state = newGame({ seed, sharkLair });
  viewer = mode.kind === 'ai' ? mode.human : 'pulpo';
  seen = { pulpo: state.events.length, tiburon: state.events.length };
  render();
  await gameLoop(token);
}

async function gameLoop(token: number) {
  while (state && !state.winner && token === gameToken) {
    const role = actors(state)[0];
    if (isAI(role)) {
      waiting = `${ROLE_NAME[role]} (máquina) está pensando…`;
      render();
      await sleep(AI_DELAY_MS);
      if (token !== gameToken) return;
      state = aiAct(state, role, Math.random, brainsFor(mode.kind === 'ai' ? mode.level : 'normal'));
      if (mode.kind === 'ai') await replayFor(mode.human, token);
      continue;
    }
    if (mode.kind === 'local' && viewer !== role) {
      viewer = role;
      $('game').classList.add('curtain');
      await passScreen(role);
      $('game').classList.remove('curtain');
      await replayFor(role, token); // resumen de lo que hizo el rival
    }
    viewer = role;
    waiting = null;
    render();
    try {
      const action = await nextAction(viewFor(state, role));
      if (token !== gameToken) return;
      const res = tryAction(state, role, action);
      if (res.ok) {
        const before = state.events.length;
        state = res.state;
        seen[role] = state.events.length;
        error = null;
        // Tus propias acciones se animan rápido, para ver qué ha cambiado.
        await animateEvents(state.events.slice(before), token, 2.5);
      } else error = res.error;
    } catch (e) {
      if (e instanceof Cancel) error = null;
      else if (e instanceof UiError) error = e.message;
      else throw e;
    }
  }
  if (state?.winner && token === gameToken) {
    waiting = null;
    render();
    const iLost = (mode.kind === 'ai' && state.winner !== mode.human) || (mode.kind === 'online' && state.winner !== mode.me);
    if (animSpeed > 0) play(iLost ? 'lose' : 'win');
    const el = overlay(`
      <h1>${state.winner === 'pulpo' ? '🐙 ¡Gana el pulpo!' : '🦈 ¡Gana el tiburón!'}</h1>
      <p>${state.winReason ?? ''}</p>
      <button class="primary" data-value="menu">Volver al menú</button>
      <button data-value="look">Ver el tablero</button>`);
    const c = await waitButton(el);
    hideOverlay();
    if (c === 'menu') showMenu();
    else {
      viewer = 'pulpo'; // al final se muestra todo
      render();
    }
  }
}

// ---------------- Online ----------------

const ROLE_TEXT: Record<Role, string> = { pulpo: 'el 🐙 pulpo', tiburon: 'el 🦈 tiburón' };

/** Conecta con el servidor; si falla, avisa y vuelve al menú. */
async function connectOnline(): Promise<OnlineConnection | null> {
  const conn = new OnlineConnection();
  try {
    overlay('<h1>🌐 Conectando…</h1>');
    await conn.connect();
    return conn;
  } catch {
    const el = overlay(`<h1>😕 Sin conexión</h1><p>No se ha podido conectar con el servidor de salas.</p>
      <button class="primary" data-value="ok">Volver al menú</button>`);
    await waitButton(el);
    showMenu();
    return null;
  }
}

/** Espera un mensaje del servidor o que el usuario pulse un botón de la capa actual. */
function messageOrButton<T extends ServerMsg>(conn: OnlineConnection, pred: (m: ServerMsg) => boolean): Promise<T | 'cancel'> {
  return Promise.race([conn.waitFor<T>(pred), waitButton($('overlay')).then(() => 'cancel' as const)]);
}

async function onlineCreate(): Promise<void> {
  const el = overlay(`
    <h1>🌐 Crear una sala</h1>
    <p>¿Con quién quieres jugar?</p>
    <div class="menu">
      <button data-value="pulpo">🐙 Con el pulpo</button>
      <button data-value="tiburon">🦈 Con el tiburón</button>
      <button class="primary" data-value="azar">🎲 Al azar</button>
      <button data-value="back">Volver</button>
    </div>`);
  const role = await waitButton(el);
  if (role === 'back') return showMenu();
  const conn = await connectOnline();
  if (!conn) return;
  conn.send({ t: 'create', role: role as RoleChoice });
  const joined = await conn.waitFor<Extract<ServerMsg, { t: 'joined' }>>((m) => m.t === 'joined');
  const link = `${location.origin}${location.pathname}?sala=${joined.code}`;
  overlay(`
    <h1>Sala <span class="room-code">${joined.code}</span></h1>
    <p>Juegas con ${ROLE_TEXT[joined.role]}.</p>
    <p>Pásale a tu rival este código o este enlace:</p>
    <p><input class="room-link" readonly value="${link}" onclick="this.select()" /></p>
    <p>⏳ Esperando a que se una…</p>
    <button data-value="cancel">Cancelar</button>`);
  const next = await messageOrButton(conn, (m) => m.t === 'setup' || m.t === 'waitSetup');
  if (next === 'cancel') {
    conn.close();
    return showMenu();
  }
  hideOverlay();
  await onlineGame(conn, joined.role, joined.code, next);
}

async function onlineJoin(presetCode?: string): Promise<void> {
  let code = presetCode ? normalizeCode(presetCode) : '';
  let problem = '';
  for (;;) {
    if (!code) {
      const el = overlay(`
        <h1>🌐 Unirme a una sala</h1>
        ${problem ? `<p class="error">⚠️ ${problem}</p>` : ''}
        <p>Escribe el código de 4 letras que te ha pasado tu rival:</p>
        <p><input id="room-input" class="room-input" maxlength="4" autocomplete="off" placeholder="ABCD" /></p>
        <div class="menu"><button class="primary" data-value="join">Entrar</button><button data-value="back">Volver</button></div>`);
      const input = el.querySelector<HTMLInputElement>('#room-input')!;
      input.focus();
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') el.querySelector<HTMLButtonElement>('[data-value="join"]')!.click();
      });
      const b = await waitButton(el);
      if (b === 'back') return showMenu();
      code = normalizeCode(input.value);
      if (code.length !== 4) {
        problem = 'El código tiene 4 letras';
        code = '';
        continue;
      }
    }
    const conn = await connectOnline();
    if (!conn) return;
    conn.send({ t: 'join', code });
    const res = await conn.waitFor<Extract<ServerMsg, { t: 'joined' } | { t: 'error' }>>((m) => m.t === 'joined' || m.t === 'error');
    if (res.t === 'error') {
      conn.close();
      problem = res.msg;
      code = '';
      continue;
    }
    const next = await conn.waitFor<ServerMsg>((m) => m.t === 'setup' || m.t === 'waitSetup');
    hideOverlay();
    return onlineGame(conn, res.role, res.code, next);
  }
}

async function onlineGame(conn: OnlineConnection, me: Role, code: string, setup: ServerMsg) {
  const token = ++gameToken;
  mode = { kind: 'online', me, code, conn };
  viewer = me;
  resetTentative();
  rolledDice.clear();
  error = null;
  opponentConnected = true;
  connectionLost = false;

  conn.onMessage = (m) => {
    if (token !== gameToken) return;
    if (m.t === 'state') state = m.view as GameState;
    else if (m.t === 'opponent') opponentConnected = m.connected;
    else if (m.t === 'error') error = m.msg;
    if (state && !animating) render();
  };
  conn.onConnectionChange = (ok) => {
    connectionLost = !ok;
    if (state) render();
  };

  // Preparación: el pulpo elige la guarida del tiburón.
  const started = conn.waitFor((m) => m.t === 'state');
  if (setup.t === 'setup') {
    state = setup.preview as GameState;
    render();
    const p = await ask({ prompt: 'Preparación: elige la guarida donde empieza el tiburón (casillas rojas).', currents: LAIRS });
    if (p.kind === 'current') conn.send({ t: 'lair', lair: p.id });
  } else {
    overlay(`<h1>🦈 ¡Rival encontrado!</h1><p>El pulpo está colocando al tiburón en su guarida…</p>`);
  }
  await started;
  hideOverlay();
  if (token !== gameToken || !state) return;
  seen[me] = (state as PlayerView).events.length;
  render();
  await onlineLoop(conn, me, token);
}

function onlineWaitingText(): string {
  if (connectionLost) return '📡 Conexión perdida. Reconectando…';
  if (!opponentConnected) return '⚠️ Tu rival se ha desconectado. Esperando a que vuelva…';
  return '⏳ Turno de tu rival…';
}

async function onlineLoop(conn: OnlineConnection, me: Role, token: number) {
  while (state && !state.winner && token === gameToken) {
    await replayFor(me, token); // lo que hizo el rival
    if (token !== gameToken || !state || state.winner) break;
    if (!actors(state).includes(me)) {
      waiting = onlineWaitingText();
      render();
      await conn.waitFor((m) => m.t === 'state' || m.t === 'opponent');
      continue;
    }
    waiting = null;
    render();
    try {
      const action = await nextAction(viewFor(state, me));
      if (token !== gameToken) return;
      const answer = conn.waitFor<ServerMsg>((m) => (m.t === 'state' && (m.cause === 'you' || m.cause === 'sync')) || m.t === 'error');
      conn.send({ t: 'action', action });
      const res = await answer;
      if (res.t === 'error') error = res.msg;
      else {
        error = null;
        const mine = state.events.slice(seen[me]);
        seen[me] = state.events.length;
        await animateEvents(mine, token, 2.5);
      }
    } catch (e) {
      if (e instanceof Cancel) error = null;
      else if (e instanceof UiError) error = e.message;
      else throw e;
    }
  }
  if (token === gameToken) await gameLoop(token); // muestra el final de la partida
}

// ---------------- Eventos ----------------

export function initApp() {
  const canvas = $<HTMLCanvasElement>('board');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const toBoard = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return hitTest(((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height);
  };
  canvas.addEventListener('mousemove', (e) => {
    const h = toBoard(e);
    if (JSON.stringify(h) !== JSON.stringify(hover)) {
      hover = h;
      render();
    }
  });
  canvas.addEventListener('click', (e) => {
    const p = toBoard(e);
    if (p) offer(p);
  });
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#skip-anim')) {
      skipAnim = true;
      return;
    }
    if ((e.target as HTMLElement).closest('#board')) return;
    const p = pickFromEvent(e);
    if (p && offer(p) && animSpeed > 0) play('click');
  });
  $('menu-btn').addEventListener('click', () => showMenu());
  const muteBtn = $('mute-btn');
  const paintMute = () => (muteBtn.textContent = isMuted() ? '🔇' : '🔊');
  paintMute();
  muteBtn.addEventListener('click', () => {
    setMuted(!isMuted());
    paintMute();
  });
  $('help-btn').addEventListener('click', () => showHelp());
  onAskChange(() => render());
  loadAssets(() => render()); // tus gráficos definitivos, si están en public/assets/
  // Enlace de invitación: ?sala=ABCD entra directamente en la sala.
  const invite = new URLSearchParams(location.search).get('sala');
  if (invite) {
    history.replaceState(null, '', location.pathname);
    void onlineJoin(invite);
  } else showMenu();
}
