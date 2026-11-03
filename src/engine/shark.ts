import { BOARD, LAIRS, otherVertex } from '../data/board';
import { GROWTH_TILES, BASE_DRAW, DICE_PER_TILE } from '../data/growthTiles';
import { ENERGY_SLOTS, SHARK_CARD_BY_ID } from '../data/sharkCards';
import { CONF_COLORS, OCTO_CONFRONTATION, SHARK_CONFRONTATION } from '../data/confrontation';
import {
  assertDistinct,
  blockAt,
  drawFromBag,
  endGame,
  isHiddenAt,
  log,
  newDie,
  octopusZone,
  poolDie,
  takeFromPool,
  toBag,
  toHunger,
} from './helpers';
import { facingAfter, legalPaths, sharedVertex } from './movement';
import { hideAll, hideZones, shuffleZones } from './octopus';
import { nextInt, rollD6 } from './rng';
import type { Die, GameState, PendingAction, Phase, Role, SharkAction, TrapId } from './types';
import { fail } from './types';

const TRAP_NAMES: Record<TrapId, string> = {
  ocultar2: 'Ocultar 2 bloques',
  quitar1: 'Retirar 1 corriente',
  quitar2: 'Retirar 2 corrientes',
  guarida: 'Tiburón a la guarida',
};

// ---------------- Inicio de turno ----------------

export const rerollsAllowed = (s: GameState) =>
  GROWTH_TILES.reduce((n, t, i) => n + (s.tiburon.growthFlipped[i] ? t.rerolls : 0), 0);

export const diceToDraw = (s: GameState) =>
  BASE_DRAW + GROWTH_TILES.reduce((n, t, i) => n + (s.tiburon.growthFlipped[i] ? t.extraDraw : 0), 0);

export function startSharkTurn(s: GameState) {
  const t = s.tiburon;
  s.active = 'tiburon';
  t.rerollsUsed = 0;
  t.marketRefreshed = false;
  t.extraMove = false;
  t.growthQueue = [];
  t.drawn = [];
  for (let i = 0; i < diceToDraw(s); i++) {
    const c = drawFromBag(s);
    if (c) t.drawn.push(c);
  }
  s.phase = 'tiburon-robar';
  log(s, `Turno del tiburón: saca ${t.drawn.length} dados.`);
}

function endSharkTurn(s: GameState) {
  s.turn++;
  s.active = 'pulpo';
  s.phase = 'pulpo';
  s.pulpo.actionsUsed = 0;
  s.pulpo.played = [];
  log(s, `Turno ${s.turn}: juega el pulpo.`);
}

// ---------------- Acciones del tiburón ----------------

function requirePhase(s: GameState, ...phases: Phase[]) {
  if (!phases.includes(s.phase)) fail('No puedes hacer eso en esta fase');
}

export function sharkAction(s: GameState, a: SharkAction) {
  const t = s.tiburon;
  switch (a.type) {
    case 'tirar': {
      requirePhase(s, 'tiburon-robar');
      t.pool = t.drawn.map((c) => newDie(s, c));
      t.drawn = [];
      s.phase = 'tiburon-tirado';
      log(s, `El tiburón tira: ${t.pool.map((d) => `${d.color} ${d.value}`).join(', ')}.`);
      return;
    }
    case 'usarCarta':
      return useSharkCard(s, a.card, a.params ?? {});
    case 'repetirTirada': {
      requirePhase(s, 'tiburon-tirado', 'tiburon-mover');
      assertDistinct(a.dice, 'dados');
      if (a.dice.length === 0) fail('Elige qué dados repetir');
      if (t.rerollsUsed + a.dice.length > rerollsAllowed(s)) fail('No te quedan repeticiones de tirada');
      for (const id of a.dice) poolDie(s, id).value = rollD6(s);
      t.rerollsUsed += a.dice.length;
      log(s, 'El tiburón repite tirada.');
      return;
    }
    case 'recuperarDado': {
      requirePhase(s, 'tiburon-tirado', 'tiburon-mover');
      if (!t.stored || t.storedTurn === s.turn) fail('No tienes ningún dado guardado de un turno anterior');
      t.pool.push(t.stored);
      t.stored = null;
      t.storedCard = null;
      log(s, 'El tiburón recupera el dado guardado con «Vigilante».');
      return;
    }
    case 'corrientes': {
      requirePhase(s, 'tiburon-tirado');
      assertDistinct(a.placements.map((p) => p.current), 'casillas');
      for (const { die, current } of a.placements) {
        const d = poolDie(s, die);
        if (d.color !== 'azul') fail('Solo los dados azules son corrientes');
        if (!BOARD.currents[current]) fail('Casilla inválida');
        if (s.currents[current] || current === t.current) fail('Esa casilla de corriente no está libre');
      }
      for (const { die, current } of a.placements) s.currents[current] = takeFromPool(s, die);
      if (a.placements.length) log(s, `El tiburón coloca ${a.placements.length} corriente(s).`);
      s.phase = 'tiburon-mover';
      return;
    }
    case 'mover': {
      requirePhase(s, 'tiburon-tirado', 'tiburon-mover');
      const paths = legalPaths(s);
      const key = a.path.join(',');
      if (paths.length === 0) {
        if (a.path.length) fail('No hay ningún movimiento posible');
        log(s, 'El tiburón no puede moverse.');
      } else {
        if (!paths.some((p) => p.join(',') === key)) fail('Ese recorrido no es legal');
        const via = sharedVertex(t.current, a.path[0]);
        const firstCurrent = a.path.find((e) => s.currents[e]);
        if (firstCurrent !== undefined) {
          t.growthQueue.push(s.currents[firstCurrent]!);
          s.currents[firstCurrent] = null;
        }
        t.facing = facingAfter(a.path, via);
        t.current = a.path[a.path.length - 1];
        log(s, `El tiburón nada ${a.path.length} casilla(s).`);
      }
      s.phase = 'tiburon-buscar';
      return;
    }
    case 'buscarAtacar': {
      requirePhase(s, 'tiburon-buscar');
      const adj = BOARD.currents[t.current].zones;
      assertDistinct(a.placements.map((p) => p.zone), 'zonas');
      for (const { die, zone } of a.placements) {
        const d = poolDie(s, die);
        if (!adj.includes(zone)) fail('Solo puedes buscar o atacar en zonas adyacentes al tiburón');
        if (d.value < BOARD.zones[zone].value) fail(`Necesitas un ${BOARD.zones[zone].value} o más en esa zona`);
        if (d.color === 'amarillo') {
          if (!isHiddenAt(s, zone)) fail('Solo puedes buscar en bloques ocultos');
        } else if (d.color === 'rojo') {
          const b = blockAt(s, zone);
          if (!b || (!isHiddenAt(s, zone) && b.kind !== 'pulpo')) fail('Solo puedes atacar bloques ocultos o al pulpo');
        } else fail('Para buscar usa dados amarillos y para atacar, rojos');
      }
      for (const { die, zone } of a.placements) {
        const d = takeFromPool(s, die);
        s.queue.push({ die: d, zone, mode: d.color === 'amarillo' ? 'buscar' : 'atacar' });
      }
      processQueue(s);
      return;
    }
    case 'renovar':
      requirePhase(s, 'tiburon-energia');
      return refreshMarket(s, a.die, a.slot);
    case 'energia':
      requirePhase(s, 'tiburon-energia');
      return spendEnergy(s, a);
  }
}

// ---------------- Cartas del tiburón ----------------

function useSharkCard(s: GameState, card: string, params: NonNullable<Extract<SharkAction, { type: 'usarCarta' }>['params']>) {
  const t = s.tiburon;
  if (!t.cards.includes(card)) fail('No tienes esa carta');
  const def = SHARK_CARD_BY_ID[card];
  const consume = () => {
    t.cards.splice(t.cards.indexOf(card), 1);
    log(s, `El tiburón usa «${def.name}».`);
  };
  const beforeMove = () => requirePhase(s, 'tiburon-tirado', 'tiburon-mover');

  switch (def.key) {
    case 'agresivo':
    case 'observador':
      fail('Esta carta no se usa así');
    case 'agil':
      beforeMove();
      if (t.facing !== null) t.facing = otherVertex(t.current, t.facing);
      return consume();
    case 'atrevido': {
      beforeMove();
      const { source, target } = params;
      if (source === undefined || target === undefined || source === target) fail('Elige el dado para el hambre y el dado rojo');
      if (poolDie(s, target).color !== 'rojo') fail('El dado que se convierte en 6 debe ser rojo');
      consume();
      toHunger(s, takeFromPool(s, source));
      poolDie(s, target).value = 6;
      return;
    }
    case 'hostil': {
      if (s.active !== 'tiburon' || s.phase === 'fin') fail('Solo en tu turno');
      const p = s.pulpo.confrontation;
      if (p.length === 0) fail('El pulpo no tiene cartas de enfrentamiento');
      consume();
      const color = p.splice(nextInt(s, p.length), 1)[0];
      t.confrontation = t.confrontation.filter((c) => c !== color);
      log(s, `Se descarta el enfrentamiento «${OCTO_CONFRONTATION[color].name}».`);
      return;
    }
    case 'hambriento': {
      requirePhase(s, 'tiburon-tirado');
      const c = drawFromBag(s);
      if (!c) fail('La bolsa está vacía');
      consume();
      t.pool.push(newDie(s, c));
      return;
    }
    case 'reactivo': {
      requirePhase(s, 'tiburon-robar');
      const idx = params.returnIdx ?? [];
      if (idx.length !== 2 || idx[0] === idx[1] || idx.some((i) => !t.drawn[i])) fail('Elige 2 dados sacados para devolver');
      const pick = params.pick;
      const returned = idx.map((i) => t.drawn[i]);
      const bagAfter = { ...t.bag };
      returned.forEach((c) => bagAfter[c]++);
      if (!pick || bagAfter[pick] === 0) fail('Elige un color que haya en la bolsa');
      consume();
      t.drawn = t.drawn.filter((_, i) => !idx.includes(i));
      returned.forEach((c) => toBag(s, c));
      t.bag[pick]--;
      t.drawn.push(pick);
      return;
    }
    case 'implacable': {
      beforeMove();
      const dice = params.dice ?? [];
      assertDistinct(dice, 'dados');
      if (dice.length < 1 || dice.length > 2) fail('Elige 1 o 2 dados');
      dice.forEach((id) => poolDie(s, id));
      consume();
      for (const id of dice) poolDie(s, id).value = rollD6(s);
      return;
    }
    case 'despiadado': {
      beforeMove();
      const { source, target } = params;
      if (source === undefined || target === undefined || source === target) fail('Elige dos dados distintos');
      const tgt = poolDie(s, target);
      const src = poolDie(s, source);
      consume();
      tgt.value = Math.min(6, tgt.value + src.value);
      toBag(s, takeFromPool(s, source));
      return;
    }
    case 'rapido':
      beforeMove();
      t.extraMove = true;
      return consume();
    case 'vigilante': {
      requirePhase(s, 'tiburon-tirado');
      if (t.stored) fail('Ya tienes un dado guardado');
      const id = params.dice?.[0];
      if (id === undefined) fail('Elige el dado que guardas');
      const d = takeFromPool(s, id);
      consume();
      t.stored = d;
      t.storedCard = card;
      t.storedTurn = s.turn;
      return;
    }
  }
}

// ---------------- Búsqueda, ataque, trampas y enfrentamiento ----------------

/** Resuelve los dados de búsqueda/ataque en orden, parando si hace falta una decisión. */
export function processQueue(s: GameState) {
  while (s.queue.length && !s.pending && !s.winner) {
    const { die, zone, mode } = s.queue.shift()!;
    const b = blockAt(s, zone);
    if (!b) {
      if (mode === 'buscar') s.tiburon.growthQueue.push(die);
      else toHunger(s, die);
      continue;
    }
    const wasHidden = !s.spaces[zone].revealed;
    s.spaces[zone].revealed = true;
    const what = b.kind === 'trampa' ? `una trampa (${TRAP_NAMES[b.trap!]})` : b.kind === 'conchaDoble' ? 'una concha doble' : b.kind === 'comida' ? 'comida' : b.kind === 'pulpo' ? '¡EL PULPO!' : 'una concha';
    if (mode === 'buscar') {
      s.tiburon.growthQueue.push(die);
      log(s, `🔍 El tiburón busca en la zona ${zone}: ${what}.`);
      if (b.kind === 'trampa' && wasHidden) triggerTrap(s, b.trap!, zone);
    } else {
      log(s, `🦈 El tiburón ataca la zona ${zone}: ${what}.`);
      if (b.kind === 'pulpo') {
        startConfrontation(s, die);
      } else {
        toHunger(s, die);
        if (b.kind === 'trampa' && wasHidden && !s.winner) triggerTrap(s, b.trap!, zone);
      }
    }
  }
  if (!s.pending && !s.winner && s.queue.length === 0 && s.phase === 'tiburon-buscar') finishSearch(s);
}

function trapHasEffect(s: GameState, trap: TrapId, zone: number) {
  switch (trap) {
    case 'ocultar2':
      return s.spaces.some((sp, z) => z !== zone && sp.block && sp.revealed);
    case 'quitar1':
    case 'quitar2':
      return s.currents.some(Boolean);
    case 'guarida':
      return true;
  }
}

function triggerTrap(s: GameState, trap: TrapId, zone: number) {
  if (!trapHasEffect(s, trap, zone)) return;
  if (s.tiburon.cards.some((c) => SHARK_CARD_BY_ID[c].key === 'observador')) {
    s.pending = { type: 'observador', role: 'tiburon', trap, zone };
  } else {
    s.pending = { type: 'trampa', role: 'pulpo', trap, zone };
  }
}

function sendSharkToLair(s: GameState, lair: number | undefined) {
  if (lair === undefined || !LAIRS.includes(lair)) fail('Elige una guarida');
  const freeLairs = LAIRS.filter((l) => !s.currents[l]);
  if (freeLairs.length > 0 && !freeLairs.includes(lair)) fail('Esa guarida tiene una corriente');
  if (s.currents[lair]) {
    toBag(s, s.currents[lair]!);
    s.currents[lair] = null;
  }
  s.tiburon.current = lair;
  s.tiburon.facing = null; // colocado a 90°: puede elegir dirección
  log(s, 'El tiburón vuelve a una guarida.');
}

function removeCurrents(s: GameState, list: number[] | undefined, max: number) {
  const cs = list ?? [];
  assertDistinct(cs, 'corrientes');
  if (cs.length > max) fail(`Solo puedes retirar ${max} corriente(s)`);
  for (const c of cs) if (!s.currents[c]) fail('Ahí no hay ninguna corriente');
  for (const c of cs) {
    toBag(s, s.currents[c]!);
    s.currents[c] = null;
  }
  if (cs.length) log(s, `El pulpo retira ${cs.length} corriente(s).`);
}

function startConfrontation(s: GameState, die: Die) {
  if (s.pulpo.confrontation.length <= 1) {
    endGame(s, 'tiburon', 'ha atrapado al pulpo en el enfrentamiento final');
    return;
  }
  log(s, '⚔️ ¡Enfrentamiento! Ambos eligen una carta en secreto.');
  s.pending = { type: 'enfrentamiento', role: 'ambos', die, choices: {} };
}

/** Respuesta a una decisión pendiente (trampa, Observador, enfrentamiento, huida). */
export function pendingAction(s: GameState, role: Role, a: PendingAction) {
  const pend = s.pending!;
  if (pend.role !== 'ambos' && pend.role !== role) fail('Ahora decide el otro jugador');

  switch (a.type) {
    case 'observador': {
      if (pend.type !== 'observador') fail('No hay ninguna trampa que ignorar');
      if (a.use) {
        const card = a.card ?? s.tiburon.cards.find((c) => SHARK_CARD_BY_ID[c].key === 'observador');
        if (!card || SHARK_CARD_BY_ID[card]?.key !== 'observador' || !s.tiburon.cards.includes(card)) fail('No tienes «Observador»');
        s.tiburon.cards.splice(s.tiburon.cards.indexOf(card), 1);
        log(s, 'El tiburón usa «Observador» e ignora la trampa.');
        s.pending = null;
      } else {
        s.pending = { type: 'trampa', role: 'pulpo', trap: pend.trap, zone: pend.zone };
      }
      break;
    }
    case 'resolverTrampa': {
      if (pend.type !== 'trampa') fail('No hay ninguna trampa que resolver');
      switch (pend.trap) {
        case 'ocultar2':
          hideZones(s, a.zones ?? [], 2, { exclude: [pend.zone] });
          break;
        case 'quitar1':
          removeCurrents(s, a.currents, 1);
          break;
        case 'quitar2':
          removeCurrents(s, a.currents, 2);
          break;
        case 'guarida':
          sendSharkToLair(s, a.lair);
          break;
      }
      log(s, `🪤 Trampa: ${TRAP_NAMES[pend.trap]}.`);
      s.pending = null;
      break;
    }
    case 'enfrentar': {
      if (pend.type !== 'enfrentamiento') fail('No hay ningún enfrentamiento');
      if (pend.choices[role]) fail('Ya has elegido');
      const own = role === 'pulpo' ? s.pulpo.confrontation : s.tiburon.confrontation;
      if (!CONF_COLORS.includes(a.color) || !own.includes(a.color)) fail('No tienes esa carta de enfrentamiento');
      pend.choices[role] = a.color;
      const { pulpo, tiburon } = pend.choices;
      if (!pulpo || !tiburon) return; // falta el otro jugador
      log(s, `El pulpo elige «${OCTO_CONFRONTATION[pulpo].name}» y el tiburón «${SHARK_CONFRONTATION[tiburon].name}».`);
      if (pulpo === tiburon) {
        endGame(s, 'tiburon', 'ha atrapado al pulpo');
        return;
      }
      s.pulpo.confrontation = s.pulpo.confrontation.filter((c) => c !== pulpo);
      s.tiburon.confrontation = s.tiburon.confrontation.filter((c) => c !== pulpo);
      log(s, `¡El pulpo escapa con «${OCTO_CONFRONTATION[pulpo].name}»!`);
      if (pulpo === 'gris') {
        hideAll(s);
        s.pending = null;
        toHunger(s, pend.die);
      } else {
        s.pending = { type: 'huida', role: 'pulpo', color: pulpo, die: pend.die };
      }
      break;
    }
    case 'resolverHuida': {
      if (pend.type !== 'huida') fail('No hay ninguna huida que resolver');
      if (pend.color === 'amarillo') {
        const others = a.zones ?? [];
        assertDistinct(others, 'zonas');
        if (others.length > 2) fail('Puedes barajar hasta 2 bloques más');
        const pz = octopusZone(s);
        for (const z of others) if (z === pz || !isHiddenAt(s, z)) fail('Elige bloques ocultos distintos del pulpo');
        s.spaces[pz].revealed = false;
        shuffleZones(s, [pz, ...others]);
      } else {
        sendSharkToLair(s, a.lair);
        removeCurrents(s, a.currents, 1);
      }
      s.pending = null;
      toHunger(s, pend.die);
      break;
    }
  }
  processQueue(s);
}

// ---------------- Crecimiento y energía ----------------

function finishSearch(s: GameState) {
  const t = s.tiburon;
  for (const die of t.growthQueue) {
    const i = t.growth.findIndex((g, k) => !t.growthFlipped[k] && g.length < DICE_PER_TILE);
    if (i < 0) {
      toBag(s, die);
      continue;
    }
    t.growth[i].push(die);
    if (t.growth[i].length === DICE_PER_TILE) {
      t.growth[i].forEach((d) => toBag(s, d));
      t.growth[i] = [];
      t.growthFlipped[i] = true;
      log(s, `📈 El tiburón crece: «${GROWTH_TILES[i].name}» (${GROWTH_TILES[i].text}).`);
    }
  }
  t.growthQueue = [];
  for (const d of t.pool) {
    if (t.energy.length < ENERGY_SLOTS) t.energy.push(d);
    else toBag(s, d);
  }
  t.pool = [];
  s.phase = 'tiburon-energia';
}

function energyDieOf(s: GameState, id: number): Die {
  const d = s.tiburon.energy.find((x) => x.id === id);
  if (!d) fail('Ese dado no está en tu energía almacenada');
  return d;
}

/** Una vez por turno: baja 1 un dado de energía para cambiar una carta del mercado. */
function refreshMarket(s: GameState, dieId: number, slot: number) {
  const t = s.tiburon;
  if (t.marketRefreshed) fail('Solo puedes renovar el mercado una vez por turno');
  const d = energyDieOf(s, dieId);
  if (d.value <= 1) fail('Un dado no puede bajar de 1');
  if (!t.market[slot]) fail('No hay carta en ese hueco');
  if (t.deck.length === 0) fail('No quedan cartas en el mazo');
  d.value--;
  t.market[slot] = t.deck.shift()!;
  t.marketRefreshed = true;
  log(s, 'El tiburón renueva una carta del mercado.');
}

function spendEnergy(s: GameState, a: Extract<SharkAction, { type: 'energia' }>) {
  const t = s.tiburon;
  const energyDie = (id: number) => energyDieOf(s, id);

  assertDistinct(a.buy, 'cartas');
  const total = t.energy.reduce((n, d) => n + d.value, 0);
  const cards = a.buy.map((slot) => {
    const id = t.market[slot];
    if (!id) fail('No hay carta en ese hueco');
    return SHARK_CARD_BY_ID[id];
  });
  const cost = cards.reduce((n, c) => n + c.cost, 0);
  if (cost > total) fail(`Necesitas ${cost} de energía y tienes ${total}`);

  const mustSpend = t.energy.length >= ENERGY_SLOTS;
  if (mustSpend && cards.length === 0) {
    const affordable = t.market.some((id) => id && SHARK_CARD_BY_ID[id].cost <= total);
    if (affordable) fail('Tienes 3 dados de energía: debes gastarla en alguna carta');
  }

  if (cards.length > 0 || mustSpend) {
    for (const slot of a.buy) {
      const card = SHARK_CARD_BY_ID[t.market[slot]!];
      t.cards.push(card.id);
      for (const c of card.dice) {
        if (t.supply[c] > 0) {
          t.supply[c]--;
          t.bag[c]++;
        }
      }
      t.market[slot] = t.deck.shift() ?? null;
      log(s, `El tiburón consigue «${card.name}».`);
    }
    const hungerId = a.hungerDie ?? [...t.energy].sort((x, y) => x.value - y.value)[0]?.id;
    const hd = energyDie(hungerId!);
    t.energy.filter((d) => d !== hd).forEach((d) => toBag(s, d));
    t.energy = [];
    toHunger(s, hd);
  }
  if (!s.winner) endSharkTurn(s);
}
