import { BOARD } from '../data/board';
import { HUNGER_LIMIT } from '../data/sharkCards';
import type { DieColor } from '../data/sharkCards';
import { nextInt, rollD6 } from './rng';
import type { Block, Die, GameState, Role } from './types';
import { fail } from './types';

export function log(s: GameState, msg: string) {
  s.log.push(msg);
}

export function endGame(s: GameState, winner: Role, reason: string) {
  if (s.winner) return;
  s.winner = winner;
  s.winReason = reason;
  s.phase = 'fin';
  s.pending = null;
  s.queue = [];
  log(s, `🏁 Gana el ${winner === 'pulpo' ? 'pulpo' : 'tiburón'}: ${reason}`);
}

export const isOver = (s: GameState) => s.winner !== null;

export function blockAt(s: GameState, zone: number): Block | null {
  const id = s.spaces[zone]?.block;
  return id ? s.blocks[id] : null;
}

export function checkZone(zone: number) {
  if (!Number.isInteger(zone) || zone < 0 || zone >= BOARD.zones.length) fail(`Zona inválida: ${zone}`);
}

export const isHiddenAt = (s: GameState, zone: number) => !!s.spaces[zone].block && !s.spaces[zone].revealed;
export const isRevealedAt = (s: GameState, zone: number) => !!s.spaces[zone].block && s.spaces[zone].revealed;

export function zoneOf(s: GameState, pred: (b: Block) => boolean): number {
  return s.spaces.findIndex((sp) => sp.block !== null && pred(s.blocks[sp.block]));
}

export const octopusZone = (s: GameState) => zoneOf(s, (b) => b.kind === 'pulpo');

/** Valor de un bloque al pagar el coste de una carta. */
export const payValue = (b: Block) => (b.kind === 'conchaDoble' ? 2 : 1);

export function newBlock(s: GameState, data: Omit<Block, 'id'>): string {
  const id = `b${s.nextBlockId++}`;
  s.blocks[id] = { id, ...data };
  return id;
}

export function newDie(s: GameState, color: DieColor, value?: number): Die {
  return { id: s.nextDieId++, color, value: value ?? rollD6(s) };
}

export const bagTotal = (s: GameState) => s.tiburon.bag.azul + s.tiburon.bag.amarillo + s.tiburon.bag.rojo;

/** Saca un dado al azar de la bolsa del tiburón (null si está vacía). */
export function drawFromBag(s: GameState): DieColor | null {
  const total = bagTotal(s);
  if (total === 0) return null;
  let r = nextInt(s, total);
  for (const c of ['azul', 'amarillo', 'rojo'] as DieColor[]) {
    if (r < s.tiburon.bag[c]) {
      s.tiburon.bag[c]--;
      return c;
    }
    r -= s.tiburon.bag[c];
  }
  return null;
}

export function toBag(s: GameState, die: Die | DieColor) {
  const color = typeof die === 'string' ? die : die.color;
  s.tiburon.bag[color]++;
}

/** Coloca un dado en la escala de hambre. Si se llena, el tiburón se agota y gana el pulpo. */
export function toHunger(s: GameState, die: Die) {
  s.tiburon.hunger.push(die);
  log(s, `El tiburón tiene más hambre (${s.tiburon.hunger.length}/${HUNGER_LIMIT}).`);
  if (s.tiburon.hunger.length >= HUNGER_LIMIT) endGame(s, 'pulpo', 'el tiburón se ha agotado');
}

export function takeFromPool(s: GameState, dieId: number): Die {
  const i = s.tiburon.pool.findIndex((d) => d.id === dieId);
  if (i < 0) fail(`El dado ${dieId} no está en tu reserva`);
  return s.tiburon.pool.splice(i, 1)[0];
}

export function poolDie(s: GameState, dieId: number): Die {
  const d = s.tiburon.pool.find((x) => x.id === dieId);
  if (!d) fail(`El dado ${dieId} no está en tu reserva`);
  return d;
}

export function assertDistinct(arr: number[], what: string) {
  if (new Set(arr).size !== arr.length) fail(`No puedes repetir ${what}`);
}
