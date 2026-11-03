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
import type { GameEvent } from '../engine/types';
import { nextAction, resetTentative, UiError } from './flows';
import { pickFromEvent, renderLog, renderOctopusPanel, renderPromptBar, renderSharkPanel } from './panels';
import type { Pick } from './ask';

type Mode = { kind: 'local' } | { kind: 'ai'; human: Role; level: Difficulty };

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
  const levelText = mode.kind === 'ai' ? ` · Máquina: ${DIFFICULTY_NAMES[mode.level]}` : ' · 2 jugadores';
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

export async function showMenu() {
  gameToken++;
  state = null;
  const el = overlay(`
    <h1>Ink and Fangs</h1>
    <p>El pulpo se esconde. El tiburón caza.</p>
    <div class="menu">
      <button class="primary" data-value="local">👥 2 jugadores (mismo ordenador)</button>
      <button data-value="ai-pulpo">🤖 Contra la máquina: juego con el pulpo</button>
      <button data-value="ai-tiburon">🤖 Contra la máquina: juego con el tiburón</button>
    </div>
    <p><button data-value="help">📖 ¿Cómo se juega?</button></p>
    <p class="small">La máquina razona con los dos: el tiburón deduce dónde estás y el pulpo intenta despistarte.</p>`);
  const choice = await waitButton(el);
  hideOverlay();
  if (choice === 'help') {
    showHelp();
    return showMenu();
  }
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
    const iLost = mode.kind === 'ai' && state.winner !== mode.human;
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
  showMenu();
}
