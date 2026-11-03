import { BOARD, LAIRS, nextCurrents } from '../data/board';
import { octoCard, type FoodId, type OctoPile } from '../data/octopusCards';
import { payValue } from '../engine/helpers';
import type { Action, Block, EffectParams, LearnPick } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';
import { octopusBelief } from './belief';

/**
 * IA del pulpo (nivel «Normal»).
 * Calcula lo mismo que deduce el tiburón (la deducción solo usa información pública) y juega para
 * mantener esa certeza baja, comer cuando puede y frenar al tiburón con trampas.
 * Devuelve una lista de acciones ordenadas de mejor a peor: se usa la primera que sea legal.
 */

type Scored = { score: number; action: Action };

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const ZONES = range(9);

/** Valor de tener cada carta (para aprender y para decidir cuál descartar). */
const CARD_VALUE: Record<string, number> = {
  'nube-tinta': 7,
  mimetismo: 5,
  'genio-arrecife': 5,
  'evasion-repentina': 4,
  'cambio-color': 4,
  arriesgarse: 4,
  'sentidos-agudos': 4,
  'memoria-tentaculo': 4,
  remolino: 4,
  'huida-rocas': 3,
  'sombra-algas': 3,
  'aprendizaje-rapido': 2,
  observar: 2,
  deslizarse: 2,
  camuflaje: 2,
};
const cardValue = (id: string) => {
  const def = octoCard(id);
  return def.effect.kind === 'eat' ? 9 : (CARD_VALUE[def.key] ?? 2);
};

// ---------------- Lectura del tablero ----------------

interface Ctx {
  v: PlayerView;
  P: number[]; // lo que cree el tiburón
  pz: number; // zona del pulpo
  block: (z: number) => Block | null;
  hidden: (z: number) => boolean;
  revealed: (z: number) => boolean;
  danger: number; // 0..1+: lo cerca que está el tiburón de cazarnos
}

/** Distancia (en casillas) desde el tiburón hasta poder actuar sobre cada zona. */
function sharkReach(v: PlayerView): number[] {
  const dist = new Map<number, number>([[v.tiburon.current, 0]]);
  const queue = [v.tiburon.current];
  while (queue.length) {
    const e = queue.shift()!;
    for (const vx of BOARD.currents[e].vertices) {
      for (const n of nextCurrents(e, vx)) {
        if (!dist.has(n)) {
          dist.set(n, dist.get(e)! + 1);
          queue.push(n);
        }
      }
    }
  }
  return ZONES.map((z) =>
    Math.min(...BOARD.currents.filter((c) => c.zones.includes(z)).map((c) => dist.get(c.id) ?? 99)),
  );
}

function context(v: PlayerView): Ctx {
  const block = (z: number) => {
    const id = v.spaces[z].block;
    return id && id !== HIDDEN ? v.blocks[id] : null;
  };
  const pz = ZONES.find((z) => block(z)?.kind === 'pulpo')!;
  const P = octopusBelief(v);
  const reach = sharkReach(v)[pz];
  const proximity = reach <= 1 ? 1 : reach === 2 ? 0.6 : 0.3;
  const visible = v.spaces[pz].revealed;
  return {
    v,
    P,
    pz,
    block,
    hidden: (z) => !!v.spaces[z].block && !v.spaces[z].revealed,
    revealed: (z) => !!v.spaces[z].block && v.spaces[z].revealed,
    danger: visible ? 1.5 : P[pz] * proximity,
  };
}

const adjacent = (a: number, b: number) => BOARD.zones[a].adjacentZones.includes(b);

/**
 * Elige qué bloques ocultos revelar para pagar `cost`: primero los que el tiburón ya sabe que no
 * son el pulpo (no le dan información). Nunca revela al pulpo.
 */
function choosePayment(c: Ctx, cost: number, exclude: number[]): { zones: number[]; info: number } | null {
  if (cost === 0) return { zones: [], info: 0 };
  const cands = ZONES.filter((z) => c.hidden(z) && z !== c.pz && !exclude.includes(z)).sort((a, b) => c.P[a] - c.P[b]);
  const dbl = cands.find((z) => c.block(z)?.kind === 'conchaDoble');
  const zones: number[] = [];
  let paid = 0;
  if (dbl !== undefined && cost >= 2) {
    zones.push(dbl);
    paid = 2;
  }
  for (const z of cands) {
    if (paid >= cost) break;
    if (zones.includes(z) || payValue(c.block(z)!) === 2) continue;
    zones.push(z);
    paid++;
  }
  if (paid < cost && dbl !== undefined && zones.length === 0) {
    zones.push(dbl);
    paid = 2;
  }
  if (paid < cost) return null;
  // Coste de información: revelar algo que el tiburón no tenía descartado le ayuda.
  const info = zones.reduce((n, z) => n + 0.4 + 12 * c.P[z], 0);
  return { zones, info };
}

/** Bloques revelados que se pueden cambiar por uno nuevo (ni el pulpo ni la comida). */
function replaceable(c: Ctx, used: number[]) {
  return ZONES.filter((z) => {
    const b = c.block(z);
    return c.revealed(z) && b && b.kind !== 'pulpo' && b.kind !== 'comida' && !used.includes(z);
  });
}

function foodZones(c: Ctx): number[] {
  return ZONES.filter((z) => c.block(z)?.kind === 'comida');
}

// ---------------- Planes para cada efecto ----------------

function planLearn(c: Ctx, n: number, toHand: boolean): { picks: LearnPick[]; value: number } | null {
  const P = c.v.pulpo;
  const options: { pick: LearnPick; value: number; pile?: OctoPile; replace?: boolean }[] = [];
  for (const pile of Object.keys(P.piles) as OctoPile[]) {
    const top = P.piles[pile][0];
    if (!top || top === HIDDEN) continue;
    if (pile === 'comer') options.push({ pick: { kind: 'card', pile }, value: 9, pile, replace: true });
    else options.push({ pick: { kind: 'card', pile }, value: cardValue(top) * (toHand ? 1.2 : 1), pile });
  }
  for (const id of P.supply) {
    const b = c.v.blocks[id];
    const value = b.kind === 'trampa' ? 5 : b.kind === 'conchaDoble' ? 3 : 0.5;
    options.push({ pick: { kind: 'block', block: id, replace: -1 }, value, replace: true });
  }
  options.sort((a, b) => b.value - a.value);

  const picks: LearnPick[] = [];
  const usedReplace: number[] = [];
  const usedPiles: string[] = [];
  let value = 0;
  for (const o of options) {
    if (picks.length >= n) break;
    if (o.pile && usedPiles.includes(o.pile)) continue;
    let pick = o.pick;
    if (o.replace) {
      const free = replaceable(c, usedReplace);
      if (!free.length) continue;
      // La comida, junto al pulpo (para poder comérsela); las trampas, en cualquier sitio.
      const isFood = o.pile === 'comer';
      const z = (isFood ? free.find((zz) => adjacent(zz, c.pz)) : undefined) ?? free[0];
      usedReplace.push(z);
      pick = pick.kind === 'card' ? { ...pick, replace: z } : { ...pick, replace: z };
    }
    if (o.pile) usedPiles.push(o.pile);
    picks.push(pick);
    value += o.value;
  }
  return picks.length ? { picks, value } : null;
}

function hideTargets(c: Ctx, exclude: number[] = []): number[] {
  const rev = ZONES.filter((z) => c.revealed(z) && !exclude.includes(z));
  const prio = (z: number) => (z === c.pz ? 0 : c.block(z)?.kind === 'trampa' ? 1 : 2);
  return rev.sort((a, b) => prio(a) - prio(b));
}

const hideValue = (c: Ctx, zones: number[]) =>
  zones.reduce((n, z) => n + (z === c.pz ? 45 : c.block(z)?.kind === 'trampa' ? 4 : 1.2), 0);

/** Intercambio que deja al pulpo junto a una comida que está en el tablero. */
function swapTowardFood(c: Ctx, anyDistance: boolean, hiddenOnly: boolean): [number, number] | null {
  const foods = foodZones(c);
  if (!foods.length || foods.some((f) => adjacent(f, c.pz))) return null;
  if (hiddenOnly && !c.hidden(c.pz)) return null;
  const targets = anyDistance ? ZONES.filter((z) => z !== c.pz) : BOARD.zones[c.pz].adjacentZones;
  for (const t of targets) {
    if (!c.v.spaces[t].block || foods.includes(t)) continue;
    if (hiddenOnly && !c.hidden(t)) continue;
    if (foods.some((f) => adjacent(f, t))) return [c.pz, t];
  }
  return null;
}

// ---------------- Candidatas ----------------

function cardCandidates(c: Ctx, card: string): Scored[] {
  const def = octoCard(card);
  const e = def.effect;
  const out: Scored[] = [];
  const play = (score: number, exclude: number[], params?: EffectParams) => {
    const pay = choosePayment(c, def.cost, exclude);
    if (pay) out.push({ score: score - pay.info, action: { type: 'jugar', card, pay: pay.zones, params } });
  };

  switch (e.kind) {
    case 'eat': {
      const fz = ZONES.find((z) => c.block(z)?.kind === 'comida' && c.block(z)?.food === e.food);
      if (fz !== undefined && adjacent(fz, c.pz)) play(c.v.pulpo.foodTrack.length === 3 ? 1000 : 60 - c.danger * 10, []);
      break;
    }
    case 'shuffle': {
      if (!c.hidden(c.pz)) break;
      const EXPOSED = BOARD.zones.findIndex((z) => z.kind === 'expuesta');
      const base = e.includeExposed ? [...new Set([EXPOSED, c.pz])] : [c.pz];
      const others = ZONES.filter((z) => c.hidden(z) && !base.includes(z)).sort((a, b) => c.P[a] - c.P[b]);
      const zones = [...base, ...others].slice(0, e.n);
      if (zones.length !== e.n || (e.includeExposed && !c.v.spaces[EXPOSED].block)) break;
      const newP = zones.reduce((n, z) => n + c.P[z], 0) / zones.length;
      const gain = Math.max(0, c.P[c.pz] - newP);
      play(gain * 60 * Math.min(1, c.danger * 2 + 0.2), zones, { zones });
      break;
    }
    case 'swap': {
      const sw = swapTowardFood(c, !!e.anyDistance, !!e.hiddenOnly);
      const hasEat = c.v.pulpo.hand.some((h) => octoCard(h).effect.kind === 'eat');
      if (sw) play(hasEat ? 25 : 12, sw, { swaps: [sw] });
      break;
    }
    case 'hide': {
      const zones = hideTargets(c).slice(0, e.n);
      if (zones.length) play(hideValue(c, zones) + (e.draw ? 2 : 0), [], { zones });
      break;
    }
    case 'hideZoneKind': {
      const zones = BOARD.zones.filter((z) => z.kind === e.zoneKind && c.revealed(z.id)).map((z) => z.id);
      if (zones.length) play(hideValue(c, zones), []);
      break;
    }
    case 'learn': {
      // Se calcula el plan después del pago (el pago revela bloques, que luego se pueden cambiar).
      const pay = choosePayment(c, def.cost, []);
      if (!pay) break;
      const after: Ctx = { ...c, revealed: (z) => c.revealed(z) || pay.zones.includes(z) };
      const plan = planLearn(after, e.n, !!e.toHand);
      if (plan) out.push({ score: plan.value * 1.4 - pay.info, action: { type: 'jugar', card, pay: pay.zones, params: { picks: plan.picks } } });
      break;
    }
  }
  return out;
}

function foodCandidates(c: Ctx): Scored[] {
  const P = c.v.pulpo;
  return P.foodTrack
    .filter((f) => !P.foodUsed.includes(f))
    .flatMap((food: FoodId): Scored[] => {
      switch (food) {
        case 'cangrejo':
        case 'langosta':
          return [{ score: 80, action: { type: 'comida', food } }];
        case 'caracol': {
          const all = [...P.deck, ...P.discard].filter((x) => x !== HIDDEN);
          const best = all.sort((a, b) => cardValue(b) - cardValue(a))[0];
          return best ? [{ score: 80, action: { type: 'comida', food, params: { card: best } } }] : [];
        }
        case 'abulon': {
          const plan = planLearn(c, 3, false);
          return plan ? [{ score: 80, action: { type: 'comida', food, params: { picks: plan.picks } } }] : [];
        }
      }
    });
}

export function octopusDecide(v: PlayerView): Action[] {
  const c = context(v);
  if (v.pending) return pendingDecision(c);

  const P = v.pulpo;
  const out: Scored[] = [...foodCandidates(c)];

  if (P.actionsUsed >= 2) {
    out.push({ score: 0, action: { type: 'finTurno' } });
  } else {
    for (const card of P.hand) out.push(...cardCandidates(c, card));
    const missing = P.handSize - P.hand.length;
    if (missing > 0) out.push({ score: P.hand.length === 0 ? 100 : missing * 3, action: { type: 'robar' } });
    if (P.hand.length) {
      const worst = [...P.hand].sort((a, b) => cardValue(a) - cardValue(b))[0];
      const target = hideTargets(c)[0];
      const score = (target !== undefined ? hideValue(c, [target]) : 0) - cardValue(worst) * 0.5;
      out.push({ score, action: { type: 'descartarOcultar', card: worst, hide: target } });
    }
  }
  return out.sort((a, b) => b.score - a.score).map((s) => s.action);
}

// ---------------- Decisiones pendientes ----------------

/** Guarida más lejos del pulpo. */
function farLair(c: Ctx): number {
  const free = LAIRS.filter((l) => !c.v.currents[l]);
  const pool = free.length ? free : LAIRS;
  const dist = (l: number) => {
    const z = BOARD.currents[l].zones[0];
    return Math.abs(BOARD.zones[z].row - BOARD.zones[c.pz].row) + Math.abs(BOARD.zones[z].col - BOARD.zones[c.pz].col);
  };
  return [...pool].sort((a, b) => dist(b) - dist(a))[0];
}

/** Corrientes más útiles para el tiburón (las más cercanas a él). */
function currentsToRemove(c: Ctx, n: number): number[] {
  const withDie = range(BOARD.currents.length).filter((i) => c.v.currents[i]);
  const reach = new Map<number, number>();
  const [sx, sy] = BOARD.currents[c.v.tiburon.current].vertices;
  for (const i of withDie) {
    const [a, b] = BOARD.currents[i].vertices;
    reach.set(i, [a, b].includes(sx) || [a, b].includes(sy) ? 0 : 1);
  }
  return withDie.sort((a, b) => reach.get(a)! - reach.get(b)!).slice(0, n);
}

function pendingDecision(c: Ctx): Action[] {
  const p = c.v.pending!;
  switch (p.type) {
    case 'enfrentamiento': {
      // Sin información sobre el rival, lo mejor es elegir al azar.
      const mine = c.v.pulpo.confrontation;
      return [{ type: 'enfrentar', color: mine[Math.floor(Math.random() * mine.length)] }];
    }
    case 'trampa':
      switch (p.trap) {
        case 'ocultar2':
          return [{ type: 'resolverTrampa', zones: hideTargets(c, [p.zone]).slice(0, 2) }, { type: 'resolverTrampa', zones: [] }];
        case 'quitar1':
          return [{ type: 'resolverTrampa', currents: currentsToRemove(c, 1) }];
        case 'quitar2':
          return [{ type: 'resolverTrampa', currents: currentsToRemove(c, 2) }];
        case 'guarida':
          return [{ type: 'resolverTrampa', lair: farLair(c) }];
      }
      break;
    case 'huida': {
      if (p.color === 'amarillo') {
        const others = ZONES.filter((z) => z !== c.pz && c.hidden(z)).sort((a, b) => c.P[a] - c.P[b]).slice(0, 2);
        return [{ type: 'resolverHuida', zones: others }, { type: 'resolverHuida', zones: [] }];
      }
      return [{ type: 'resolverHuida', lair: farLair(c), currents: currentsToRemove(c, 1) }, { type: 'resolverHuida', lair: farLair(c) }];
    }
  }
  return [];
}
