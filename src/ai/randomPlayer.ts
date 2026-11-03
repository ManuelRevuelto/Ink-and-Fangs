import { BOARD, LAIRS } from '../data/board';
import { CONF_COLORS } from '../data/confrontation';
import { octoCard, type OctoPile } from '../data/octopusCards';
import { SHARK_CARD_BY_ID } from '../data/sharkCards';
import { legalPaths } from '../engine/movement';
import type { Action, EffectParams, LearnPick } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';

/**
 * Jugador aleatorio: propone muchas acciones candidatas (posiblemente ilegales) a partir de SU vista.
 * Quien lo use debe probar las candidatas en orden hasta que el motor acepte una.
 * Sirve para probar el motor a fondo y como base para la IA «Fácil».
 */
export type Rand = () => number;

const pick = <T>(r: Rand, arr: T[]): T => arr[Math.floor(r() * arr.length)];
const sample = <T>(r: Rand, arr: T[], n: number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function randomCandidates(v: PlayerView, r: Rand, tries = 40): Action[] {
  const out: Action[] = [];
  const zones = range(9);
  const hidden = zones.filter((z) => v.spaces[z].block && !v.spaces[z].revealed);
  const revealed = zones.filter((z) => v.spaces[z].block && v.spaces[z].revealed);
  const withCurrent = range(BOARD.currents.length).filter((c) => v.currents[c]);

  // ---- Decisiones pendientes ----
  const p = v.pending;
  if (p) {
    if (p.type === 'enfrentamiento') {
      const own = v.me === 'pulpo' ? v.pulpo.confrontation : v.tiburon.confrontation;
      for (const c of sample(r, own.length ? own : CONF_COLORS, 3)) out.push({ type: 'enfrentar', color: c });
    } else if (p.type === 'comida') {
      const cards = [...v.pulpo.deck, ...v.pulpo.discard].filter((c) => c !== HIDDEN);
      for (let i = 0; i < 5; i++) out.push({ type: 'resolverComida', card: cards.length ? pick(r, cards) : undefined, picks: randomPicks(v, r, 3) });
      out.push({ type: 'resolverComida', picks: [] });
    } else if (p.type === 'observador') {
      out.push({ type: 'observador', use: r() < 0.5 }, { type: 'observador', use: false });
    } else {
      for (let i = 0; i < tries; i++) {
        const lair = pick(r, LAIRS);
        out.push(
          p.type === 'trampa'
            ? { type: 'resolverTrampa', zones: sample(r, revealed, 2), currents: sample(r, withCurrent, 2), lair }
            : { type: 'resolverHuida', zones: sample(r, hidden, Math.floor(r() * 3)), currents: sample(r, withCurrent, 1), lair },
        );
        out.push(p.type === 'trampa' ? { type: 'resolverTrampa', lair } : { type: 'resolverHuida', lair });
      }
    }
    return out;
  }

  // ---- Pulpo ----
  if (v.me === 'pulpo') {
    const P = v.pulpo;
    if (P.actionsUsed >= 2) return [{ type: 'finTurno' }];
    for (let i = 0; i < tries; i++) {
      const roll = r();
      if (roll < 0.15 && P.hand.length < P.handSize) out.push({ type: 'robar' });
      else if (roll < 0.3 && P.hand.length) {
        out.push({ type: 'descartarOcultar', card: pick(r, P.hand), hide: revealed.length ? pick(r, revealed) : undefined });
      } else if (P.hand.length) {
        const card = pick(r, P.hand);
        const def = octoCard(card);
        const pay = sample(r, hidden, Math.max(0, def.cost - (r() < 0.3 ? 1 : 0)));
        const params: EffectParams = {};
        const e = def.effect;
        if (e.kind === 'swap') params.swaps = range(e.n).map(() => [pick(r, zones), pick(r, zones)] as [number, number]);
        if (e.kind === 'shuffle') params.zones = sample(r, zones, e.n);
        if (e.kind === 'hide') params.zones = sample(r, zones, 1 + Math.floor(r() * e.n));
        if (e.kind === 'learn') params.picks = randomPicks(v, r, e.n);
        out.push({ type: 'jugar', card, pay, params });
      }
    }
    out.push({ type: 'robar' });
    if (P.hand.length) out.push({ type: 'descartarOcultar', card: P.hand[0] });
    return out;
  }

  // ---- Tiburón ----
  const T = v.tiburon;
  for (const card of T.cards) {
    if (r() < 0.3) {
      const dice = T.pool.map((d) => d.id);
      out.push({
        type: 'usarCarta',
        card,
        params: { dice: sample(r, dice, 1 + Math.floor(r() * 2)), source: pick(r, dice), target: pick(r, dice), returnIdx: [0, 1], pick: pick(r, ['azul', 'amarillo', 'rojo'] as const) },
      });
    }
  }
  if (T.stored && r() < 0.5) out.push({ type: 'recuperarDado' });

  switch (v.phase) {
    case 'tiburon-robar':
      out.push({ type: 'tirar' });
      break;
    case 'tiburon-tirado': {
      const blue = T.pool.filter((d) => d.color === 'azul');
      const free = range(BOARD.currents.length).filter((c) => !v.currents[c] && c !== T.current);
      for (let i = 0; i < 5; i++) {
        const dice = sample(r, blue, Math.floor(r() * (blue.length + 1)));
        const spots = sample(r, free, dice.length);
        out.push({ type: 'corrientes', placements: dice.map((d, k) => ({ die: d.id, current: spots[k] })) });
      }
      out.push({ type: 'corrientes', placements: [] });
      break;
    }
    case 'tiburon-mover': {
      const paths = legalPaths(v);
      out.push({ type: 'mover', path: paths.length ? pick(r, paths) : [] });
      break;
    }
    case 'tiburon-buscar': {
      const adj = BOARD.currents[T.current].zones;
      const usable = T.pool.filter((d) => d.color !== 'azul');
      for (let i = 0; i < 8; i++) {
        const dice = sample(r, usable, Math.min(adj.length, Math.floor(r() * (usable.length + 1))));
        const zs = sample(r, adj, dice.length);
        out.push({ type: 'buscarAtacar', placements: dice.map((d, k) => ({ die: d.id, zone: zs[k] })) });
      }
      out.push({ type: 'buscarAtacar', placements: [] });
      break;
    }
    case 'tiburon-energia': {
      const total = T.energy.reduce((n, d) => n + d.value, 0);
      const slots = range(T.market.length).filter((i) => T.market[i] && SHARK_CARD_BY_ID[T.market[i]!].cost <= total);
      for (const s of sample(r, slots, slots.length)) out.push({ type: 'energia', buy: [s] });
      out.push({ type: 'energia', buy: [] });
      break;
    }
  }
  return out;
}

function randomPicks(v: PlayerView, r: Rand, n: number): LearnPick[] {
  const piles = (Object.keys(v.pulpo.piles) as OctoPile[]).filter((k) => v.pulpo.piles[k].length);
  const replaceable = range(9).filter((z) => {
    const id = v.spaces[z].block;
    if (!id || id === HIDDEN || !v.spaces[z].revealed) return false;
    const k = v.blocks[id]?.kind;
    return k !== 'pulpo' && k !== 'comida';
  });
  return range(1 + Math.floor(r() * n)).map(() =>
    r() < 0.6 || v.pulpo.supply.length === 0
      ? { kind: 'card', pile: pick(r, piles.length ? piles : ['aprender']), replace: replaceable.length ? pick(r, replaceable) : undefined }
      : { kind: 'block', block: pick(r, v.pulpo.supply), replace: replaceable.length ? pick(r, replaceable) : 0 },
  );
}
