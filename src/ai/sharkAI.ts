import { BOARD } from '../data/board';
import { ENERGY_SLOTS, HUNGER_LIMIT, SHARK_CARD_BY_ID, type SharkCardKey } from '../data/sharkCards';
import { legalPaths } from '../engine/movement';
import { rerollsAllowed } from '../engine/shark';
import type { Action, Die } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';
import { octopusBelief } from './belief';

/**
 * IA del tiburón (nivel «Normal»).
 * Solo usa su vista: deduce dónde está el pulpo (belief.ts) y elige la posición desde la que
 * mejor puede buscar o atacar, cuidando el hambre.
 */

type Strike = { die: number; zone: number };

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function ownedCard(v: PlayerView, key: SharkCardKey): string | undefined {
  return v.tiburon.cards.find((c) => SHARK_CARD_BY_ID[c].key === key);
}

/** Probabilidad de ganar el enfrentamiento si el ataque da con el pulpo. */
function winChance(v: PlayerView) {
  const left = v.pulpo.confrontation.length;
  return left <= 1 ? 1 : 1 / left;
}

/** Coste de subir 1 en la escala de hambre (crece al acercarse al límite). */
function hungerCost(v: PlayerView, extra = 0) {
  const h = v.tiburon.hunger.length + extra;
  if (h >= HUNGER_LIMIT - 1) return 1000; // el siguiente dado nos agota
  return 1.5 + h * 1.2;
}

function isOctopusRevealed(v: PlayerView, z: number) {
  const sp = v.spaces[z];
  return sp.revealed && sp.block !== null && sp.block !== HIDDEN && v.blocks[sp.block]?.kind === 'pulpo';
}

/** Mejor combinación de búsquedas/ataques desde una casilla con los dados dados. */
function planStrikes(v: PlayerView, P: number[], edge: number, dice: Die[]): { value: number; strikes: Strike[] } {
  const zones = BOARD.currents[edge].zones;
  const usable = dice.filter((d) => d.color !== 'azul');
  let best = { value: 0, strikes: [] as Strike[] };

  const valueOf = (d: Die, z: number): number | null => {
    const sp = v.spaces[z];
    if (!sp.block || d.value < BOARD.zones[z].value) return null;
    const octoVisible = isOctopusRevealed(v, z);
    if (d.color === 'amarillo') return sp.revealed ? null : 1 + 4 * P[z];
    if (sp.revealed && !octoVisible) return null;
    const p = octoVisible ? 1 : P[z];
    const autoWin = v.pulpo.confrontation.length <= 1;
    if (v.tiburon.hunger.length >= HUNGER_LIMIT - 1 && !(p === 1 && autoWin)) return null;
    const value = p * (12 * winChance(v) + 4) - hungerCost(v);
    return value > 0 ? value : null;
  };

  const rec = (i: number, used: Set<number>, acc: Strike[], value: number) => {
    if (value > best.value) best = { value, strikes: [...acc] };
    if (i >= zones.length) return;
    rec(i + 1, used, acc, value); // nada en esta zona
    for (const d of usable) {
      if (used.has(d.id)) continue;
      const val = valueOf(d, zones[i]);
      if (val === null) continue;
      used.add(d.id);
      acc.push({ die: d.id, zone: zones[i] });
      rec(i + 1, used, acc, value + val);
      acc.pop();
      used.delete(d.id);
    }
  };
  rec(0, new Set(), [], 0);
  // Primero las búsquedas: si revelan al pulpo, el ataque de después ya va sobre seguro.
  const color = (s: Strike) => dice.find((d) => d.id === s.die)!.color;
  best.strikes.sort((a, b) => (color(a) === 'amarillo' ? -1 : 0) - (color(b) === 'amarillo' ? -1 : 0));
  return best;
}

/** Valor de terminar el movimiento en `edge`: lo que se puede hacer ahora + cercanía al pulpo. */
function positionScore(v: PlayerView, P: number[], edge: number, dice: Die[]) {
  const zones = BOARD.currents[edge].zones;
  const near = zones.reduce((n, z) => n + P[z], 0);
  return planStrikes(v, P, edge, dice).value + 2 * near;
}

function bestPath(v: PlayerView, P: number[]): { path: number[]; score: number } {
  const paths = legalPaths(v);
  if (!paths.length) return { path: [], score: positionScore(v, P, v.tiburon.current, v.tiburon.pool) };
  let best = { path: paths[0], score: -Infinity };
  for (const p of paths) {
    // El primer dado de corriente por el que se nada va al crecimiento: pequeño premio.
    const swims = p.some((e) => v.currents[e]) ? 0.4 : 0;
    const score = positionScore(v, P, p[p.length - 1], v.tiburon.pool) + swims - p.length * 0.01;
    if (score > best.score) best = { path: p, score };
  }
  return best;
}

function withView(v: PlayerView, mutate: (c: PlayerView) => void): PlayerView {
  const c = structuredClone(v);
  mutate(c);
  return c;
}

// ---------------- Decisión principal ----------------

export function sharkDecide(v: PlayerView): Action {
  const T = v.tiburon;
  const P = octopusBelief(v);

  if (v.pending) {
    if (v.pending.type === 'observador') return { type: 'observador', use: true };
    if (v.pending.type === 'enfrentamiento') {
      const opts = T.confrontation;
      return { type: 'enfrentar', color: opts[Math.floor(Math.random() * opts.length)] };
    }
  }

  const hostile = ownedCard(v, 'hostil');
  if (hostile && v.pulpo.confrontation.length > 1 && v.phase !== 'fin') return { type: 'usarCarta', card: hostile };

  switch (v.phase) {
    case 'tiburon-robar':
      return { type: 'tirar' };

    case 'tiburon-tirado': {
      if (T.stored && T.storedTurn !== v.turn) return { type: 'recuperarDado' };
      const hungry = ownedCard(v, 'hambriento');
      if (hungry && v.tiburon.bag.azul + v.tiburon.bag.amarillo + v.tiburon.bag.rojo > 0) return { type: 'usarCarta', card: hungry };
      const reroll = rerollChoice(v);
      if (reroll) return reroll;
      return { type: 'corrientes', placements: planCurrents(v, P) };
    }

    case 'tiburon-mover': {
      const base = bestPath(v, P);
      const fast = ownedCard(v, 'rapido');
      if (fast && !T.extraMove && bestPath(withView(v, (c) => (c.tiburon.extraMove = true)), P).score > base.score + 1.5) {
        return { type: 'usarCarta', card: fast };
      }
      const agile = ownedCard(v, 'agil');
      if (agile && T.facing !== null) {
        const [a, b] = BOARD.currents[T.current].vertices;
        const flipped = withView(v, (c) => (c.tiburon.facing = T.facing === a ? b : a));
        if (bestPath(flipped, P).score > base.score + 1.5) return { type: 'usarCarta', card: agile };
      }
      return { type: 'mover', path: base.path };
    }

    case 'tiburon-buscar':
      return { type: 'buscarAtacar', placements: planStrikes(v, P, T.current, T.pool).strikes };

    case 'tiburon-energia':
      return energyDecision(v);
  }
  return { type: 'tirar' }; // no debería llegar aquí
}

/** Repite tirada (por crecimiento o con «Implacable») los dados de búsqueda/ataque más bajos. */
function rerollChoice(v: PlayerView): Action | null {
  const low = v.tiburon.pool.filter((d) => d.color !== 'azul' && d.value <= 3).sort((a, b) => a.value - b.value);
  if (!low.length) return null;
  if (rerollsAllowed(v) - v.tiburon.rerollsUsed > 0) return { type: 'repetirTirada', dice: [low[0].id] };
  const relentless = ownedCard(v, 'implacable');
  if (relentless) return { type: 'usarCarta', card: relentless, params: { dice: low.slice(0, 2).map((d) => d.id) } };
  return null;
}

/** Decide dónde poner corrientes: la que más mejore la mejor posición alcanzable. */
function planCurrents(v: PlayerView, P: number[]): { die: number; current: number }[] {
  const T = v.tiburon;
  const blue = T.pool.filter((d) => d.color === 'azul');
  const free = range(BOARD.currents.length).filter((c) => !v.currents[c] && c !== T.current);
  const placements: { die: number; current: number }[] = [];
  let view = withView(v, (c) => (c.phase = 'tiburon-mover'));
  let bestScore = bestPath(view, P).score;

  for (const d of blue) {
    let choice: { current: number; score: number; view: PlayerView } | null = null;
    for (const c of free) {
      if (placements.some((p) => p.current === c)) continue;
      const tryView = withView(view, (x) => {
        x.currents[c] = d;
        x.tiburon.pool = x.tiburon.pool.filter((p) => p.id !== d.id);
      });
      const score = bestPath(tryView, P).score;
      if (!choice || score > choice.score) choice = { current: c, score, view: tryView };
    }
    // Un dado que no se usa acaba en la energía, y con 3 hay que gastarla (= hambre).
    // Por eso se colocan corrientes salvo que la energía tenga hueco de sobra.
    const unusedAfter = T.energy.length + T.pool.length - placements.length - 1;
    const energyPressure = unusedAfter >= ENERGY_SLOTS - 1;
    if (choice && (choice.score > bestScore + 0.3 || energyPressure || choice.score >= bestScore - 0.5)) {
      placements.push({ die: d.id, current: choice.current });
      bestScore = choice.score;
      view = choice.view;
    }
  }
  return placements;
}

/** Valor de una carta del mercado para el tiburón. */
function cardValue(id: string): number {
  const c = SHARK_CARD_BY_ID[id];
  const dice = c.dice.reduce((n, d) => n + (d === 'rojo' ? 3 : d === 'amarillo' ? 1.2 : 0.6), 0);
  const effect: Partial<Record<SharkCardKey, number>> = { hambriento: 1.5, observador: 1, rapido: 1, hostil: 2, implacable: 1, agil: 0.5 };
  return dice + (effect[c.key] ?? 0.3);
}

function energyDecision(v: PlayerView): Action {
  const T = v.tiburon;
  const sum = T.energy.reduce((n, d) => n + d.value, 0);
  const must = T.energy.length >= ENERGY_SLOTS;
  const slots = range(T.market.length).filter((s) => T.market[s]);

  let best = { value: 0, buy: [] as number[] };
  for (let mask = 1; mask < 1 << slots.length; mask++) {
    const buy = slots.filter((_, i) => mask & (1 << i));
    const cost = buy.reduce((n, s) => n + SHARK_CARD_BY_ID[T.market[s]!].cost, 0);
    if (cost > sum) continue;
    const value = buy.reduce((n, s) => n + cardValue(T.market[s]!), 0);
    if (value > best.value) best = { value, buy };
  }
  // Gastar cuesta hambre: solo merece la pena si lo que se compra lo compensa (o si es obligatorio).
  const reds = best.buy.reduce((n, s) => n + SHARK_CARD_BY_ID[T.market[s]!].dice.filter((d) => d === 'rojo').length, 0);
  const redsOwned = T.bag.rojo + T.pool.filter((d) => d.color === 'rojo').length;
  const worth = reds > 0 && (redsOwned < 3 || best.value > hungerCost(v) * 1.5) && T.hunger.length < 4;
  const hungerDie = [...T.energy].sort((a, b) => a.value - b.value)[0]?.id;
  if (must || (worth && T.hunger.length < HUNGER_LIMIT - 2)) return { type: 'energia', buy: best.buy, hungerDie };
  return { type: 'energia', buy: [] };
}
