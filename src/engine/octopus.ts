import { BOARD } from '../data/board';
import { FOOD_NAMES, octoCard, type FoodId, type OctoEffect } from '../data/octopusCards';
import {
  assertDistinct,
  blockAt,
  checkZone,
  emit,
  endGame,
  isHiddenAt,
  isRevealedAt,
  log,
  newBlock,
  octopusZone,
  payValue,
  zoneOf,
} from './helpers';
import { shuffleInPlace } from './rng';
import type { EffectParams, GameState, LearnPick, OctopusAction } from './types';
import { fail } from './types';

const ACTIONS_PER_TURN = 2;
const FOOD_TO_WIN = 4;

// ---------------- Cartas ----------------

export function drawCards(s: GameState, n: number) {
  const p = s.pulpo;
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      if (p.discard.length === 0) return;
      p.deck = shuffleInPlace(s, p.discard);
      p.discard = [];
    }
    p.hand.push(p.deck.shift()!);
  }
}

export function drawToHandSize(s: GameState) {
  drawCards(s, Math.max(0, s.pulpo.handSize - s.pulpo.hand.length));
}

function takeFromHand(s: GameState, card: string) {
  const i = s.pulpo.hand.indexOf(card);
  if (i < 0) fail(`No tienes la carta ${card} en la mano`);
  s.pulpo.hand.splice(i, 1);
}

// ---------------- Bloques ----------------

/** Oculta las zonas indicadas (deben estar reveladas). */
export function hideZones(s: GameState, zones: number[], max: number, opts: { min?: number; exclude?: number[] } = {}) {
  assertDistinct(zones, 'zonas');
  if (zones.length > max) fail(`Solo puedes ocultar ${max} bloque(s)`);
  if (zones.length < (opts.min ?? 0)) fail(`Debes ocultar al menos ${opts.min} bloque(s)`);
  for (const z of zones) {
    checkZone(z);
    if (!isRevealedAt(s, z)) fail(`El bloque de la zona ${z} no está revelado`);
    if (opts.exclude?.includes(z)) fail(`El bloque de la zona ${z} no se puede ocultar con este efecto`);
  }
  for (const z of zones) s.spaces[z].revealed = false;
  emit(s, { k: 'hide', zones: [...zones] });
}

export function hideAll(s: GameState) {
  const zones = s.spaces.map((sp, z) => (sp.block && sp.revealed ? z : -1)).filter((z) => z >= 0);
  for (const sp of s.spaces) if (sp.block) sp.revealed = false;
  emit(s, { k: 'hide', zones });
}

/** Baraja los bloques de las zonas indicadas y los recoloca al azar en esas mismas zonas, ocultos. */
export function shuffleZones(s: GameState, zones: number[]) {
  const blocks = zones.map((z) => s.spaces[z].block!);
  shuffleInPlace(s, blocks);
  zones.forEach((z, i) => (s.spaces[z] = { block: blocks[i], revealed: false }));
  log(s, `El pulpo baraja ${zones.length} bloques.`);
  emit(s, { k: 'shuffle', zones: [...zones] });
}

function swapZones(s: GameState, a: number, b: number) {
  [s.spaces[a], s.spaces[b]] = [s.spaces[b], s.spaces[a]];
  emit(s, { k: 'swap', a, b });
}

/** Un bloque revelado que puede cambiarse por uno nuevo (ni el pulpo ni la comida). */
function checkReplaceable(s: GameState, zone: number | undefined): number {
  if (zone === undefined) fail('Debes indicar qué bloque revelado del tablero cambias');
  checkZone(zone);
  const b = blockAt(s, zone);
  if (!b || !s.spaces[zone].revealed) fail(`El bloque de la zona ${zone} debe estar revelado`);
  if (b.kind === 'pulpo' || b.kind === 'comida') fail('No puedes retirar el pulpo ni la comida');
  return zone;
}

function placeNewBlock(s: GameState, blockId: string, zone: number) {
  s.pulpo.aside.push(s.spaces[zone].block!);
  s.spaces[zone] = { block: blockId, revealed: true };
  emit(s, { k: 'newBlock', zone });
}

// ---------------- Efectos ----------------

function learn(s: GameState, picks: LearnPick[] | undefined, max: number, toHand: boolean) {
  if (!picks || picks.length === 0) fail('Elige qué aprendes');
  if (picks.length > max) fail(`Solo puedes aprender ${max}`);
  const p = s.pulpo;
  for (const pick of picks) {
    if (pick.kind === 'card') {
      const pile = p.piles[pick.pile];
      if (!pile || pile.length === 0) fail(`El montón «${pick.pile}» está vacío`);
      const card = pile.shift()!;
      const def = octoCard(card);
      if (def.effect.kind === 'eat') {
        const food = def.effect.food;
        const foodBlock = Object.values(s.blocks).find((b) => b.kind === 'comida' && b.food === food)!;
        placeNewBlock(s, foodBlock.id, checkReplaceable(s, pick.replace));
        p.discard.push(card);
        log(s, `El pulpo aprende «${def.name}» y pone en juego: ${FOOD_NAMES[food]}.`);
      } else {
        (toHand ? p.hand : p.discard).push(card);
        log(s, `El pulpo aprende «${def.name}».`);
      }
    } else {
      const i = p.supply.indexOf(pick.block);
      if (i < 0) fail('Ese bloque no está disponible');
      const zone = checkReplaceable(s, pick.replace);
      p.supply.splice(i, 1);
      placeNewBlock(s, pick.block, zone);
      log(s, `El pulpo consigue un bloque nuevo.`);
    }
  }
}

function areAdjacent(a: number, b: number) {
  return BOARD.zones[a].adjacentZones.includes(b);
}

function applyEffect(s: GameState, effect: OctoEffect, params: EffectParams = {}) {
  switch (effect.kind) {
    case 'learn':
      return learn(s, params.picks, effect.n, !!effect.toHand);

    case 'swap': {
      const swaps = params.swaps ?? [];
      if (swaps.length < 1 || swaps.length > effect.n) fail(`Debes hacer entre 1 y ${effect.n} intercambio(s)`);
      for (const [a, b] of swaps) {
        checkZone(a);
        checkZone(b);
        if (a === b) fail('Elige dos bloques distintos');
        if (!s.spaces[a].block || !s.spaces[b].block) fail('Solo se intercambian bloques');
        if (!effect.anyDistance && !areAdjacent(a, b)) fail('Los bloques deben ser ortogonalmente adyacentes');
        if (effect.hiddenOnly && (!isHiddenAt(s, a) || !isHiddenAt(s, b))) fail('Ambos bloques deben estar ocultos');
        swapZones(s, a, b);
      }
      log(s, `El pulpo intercambia bloques (${swaps.length}).`);
      return;
    }

    case 'shuffle': {
      const zones = params.zones ?? [];
      assertDistinct(zones, 'zonas');
      if (zones.length !== effect.n) fail(`Debes barajar exactamente ${effect.n} bloques`);
      const EXPOSED = BOARD.zones.findIndex((z) => z.kind === 'expuesta');
      if (effect.includeExposed) {
        if (!zones.includes(EXPOSED)) fail('Debes incluir el bloque de la zona expuesta');
        if (s.spaces[EXPOSED].block) s.spaces[EXPOSED].revealed = false;
      }
      for (const z of zones) {
        checkZone(z);
        if (!isHiddenAt(s, z)) fail(`Solo se barajan bloques ocultos (zona ${z})`);
      }
      return shuffleZones(s, zones);
    }

    case 'hide': {
      hideZones(s, params.zones ?? [], effect.n, { min: 1 });
      if (effect.draw) drawCards(s, effect.draw);
      log(s, 'El pulpo oculta bloques.');
      return;
    }

    case 'hideZoneKind': {
      const zones = BOARD.zones.filter((z) => z.kind === effect.zoneKind && isRevealedAt(s, z.id)).map((z) => z.id);
      if (zones.length === 0) fail('No hay bloques revelados que ocultar ahí');
      hideZones(s, zones, zones.length);
      log(s, 'El pulpo oculta bloques.');
      return;
    }

    case 'eat':
      return eat(s, effect.food);
  }
}

function eat(s: GameState, food: FoodId) {
  const fz = zoneOf(s, (b) => b.kind === 'comida' && b.food === food);
  if (fz < 0) fail(`${FOOD_NAMES[food]} no está en el tablero (apréndela primero)`);
  const pz = octopusZone(s);
  if (!areAdjacent(fz, pz)) fail('El pulpo debe estar ortogonalmente adyacente a la comida');
  if (!s.spaces[pz].revealed) emit(s, { k: 'reveal', zones: [pz], octo: pz });
  s.spaces[pz].revealed = true;
  emit(s, { k: 'eat', zone: fz });
  const shell = newBlock(s, { kind: 'concha' });
  s.spaces[fz] = { block: shell, revealed: true };
  s.pulpo.foodTrack.push(food);
  log(s, `🐙 ¡El pulpo se come: ${FOOD_NAMES[food]}! (${s.pulpo.foodTrack.length}/${FOOD_TO_WIN})`);
  if (s.pulpo.foodTrack.length >= FOOD_TO_WIN) endGame(s, 'pulpo', 'se ha comido toda la comida');
  else triggerFoodPower(s, food);
}

/**
 * El poder de la comida se activa SOLO al comérsela (no gasta acción).
 * Cangrejo y langosta se aplican al momento; caracol y abulón piden una elección al pulpo.
 */
function triggerFoodPower(s: GameState, food: FoodId) {
  const p = s.pulpo;
  switch (food) {
    case 'cangrejo':
      p.handSize = 5;
      drawToHandSize(s);
      return foodPowerDone(s, food, 'su mano pasa a 5 cartas');
    case 'langosta':
      hideAll(s);
      return foodPowerDone(s, food, 'oculta todos sus bloques');
    case 'caracol':
      if (p.deck.length + p.discard.length === 0) return foodPowerDone(s, food, 'no hay cartas que buscar');
      s.pending = { type: 'comida', role: 'pulpo', food };
      return;
    case 'abulon':
      s.pending = { type: 'comida', role: 'pulpo', food };
      return;
  }
}

function foodPowerDone(s: GameState, food: FoodId, what: string) {
  s.pulpo.foodUsed.push(food);
  log(s, `✨ Poder de ${FOOD_NAMES[food]}: ${what}.`);
}

/** Respuesta del pulpo al poder del caracol (qué carta busca) o del abulón (qué aprende, hasta 3). */
export function resolveFoodPower(s: GameState, params: { card?: string; picks?: LearnPick[] }) {
  const pend = s.pending;
  if (pend?.type !== 'comida') fail('No hay ningún poder de comida pendiente');
  const p = s.pulpo;
  if (pend.food === 'caracol') {
    const card = params.card;
    if (!card) fail('Elige la carta que buscas');
    let i = p.deck.indexOf(card);
    if (i >= 0) {
      p.deck.splice(i, 1);
      shuffleInPlace(s, p.deck);
    } else {
      i = p.discard.indexOf(card);
      if (i < 0) fail('Esa carta no está en tu mazo ni en tu descarte');
      p.discard.splice(i, 1);
    }
    p.hand.push(card);
    foodPowerDone(s, 'caracol', `busca «${octoCard(card).name}» y la pone en su mano`);
  } else {
    const picks = params.picks ?? [];
    if (picks.length) learn(s, picks, 3, false);
    foodPowerDone(s, 'abulon', picks.length ? `aprende ${picks.length} gratis` : 'no aprende nada');
  }
  s.pending = null;
}

// ---------------- Pago ----------------

function pay(s: GameState, cost: number, zones: number[]) {
  assertDistinct(zones, 'bloques');
  let total = 0;
  let minVal = Infinity;
  for (const z of zones) {
    checkZone(z);
    if (!isHiddenAt(s, z)) fail(`Para pagar debes revelar bloques ocultos (zona ${z})`);
    const v = payValue(blockAt(s, z)!);
    total += v;
    minVal = Math.min(minVal, v);
  }
  if (total < cost) fail(`El coste es ${cost}: debes revelar más bloques`);
  if (zones.length > 0 && total - minVal >= cost) fail(`El coste es ${cost}: estás revelando bloques de más`);
  for (const z of zones) s.spaces[z].revealed = true;
  const octo = zones.find((z) => blockAt(s, z)?.kind === 'pulpo');
  emit(s, { k: 'reveal', zones: [...zones], ...(octo !== undefined ? { octo } : {}) });
}

// ---------------- Acciones ----------------

function useAction(s: GameState) {
  if (s.pulpo.actionsUsed >= ACTIONS_PER_TURN) fail('Ya has hecho tus 2 acciones: termina el turno');
  s.pulpo.actionsUsed++;
}

export function octopusAction(s: GameState, a: OctopusAction) {
  const p = s.pulpo;
  switch (a.type) {
    case 'jugar': {
      useAction(s);
      const def = octoCard(a.card);
      if (!def) fail('Carta desconocida');
      takeFromHand(s, a.card);
      pay(s, def.cost, a.pay);
      log(s, `El pulpo juega «${def.name}».`);
      applyEffect(s, def.effect, a.params);
      // Las cartas de comer se gastan para siempre: salen de la partida en vez de ir al descarte.
      if (def.effect.kind === 'eat') p.removed.push(a.card);
      else p.played.push(a.card);
      return;
    }
    case 'robar': {
      if (p.hand.length >= p.handSize) fail('Ya tienes la mano completa');
      useAction(s);
      drawToHandSize(s);
      log(s, 'El pulpo roba cartas.');
      return;
    }
    case 'descartarOcultar': {
      if (p.hand.length === 0) fail('No tienes cartas: debes robar');
      useAction(s);
      takeFromHand(s, a.card);
      p.discard.push(a.card);
      if (a.hide !== undefined) hideZones(s, [a.hide], 1);
      log(s, `El pulpo descarta una carta${a.hide !== undefined ? ' y oculta un bloque' : ''}.`);
      return;
    }
    case 'finTurno': {
      if (p.actionsUsed < ACTIONS_PER_TURN) fail('Debes hacer 2 acciones antes de terminar');
      p.discard.push(...p.played);
      p.played = [];
      return;
    }
  }
}
