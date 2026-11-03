import { BOARD, LAIRS } from '../data/board';
import { OCTO_CONFRONTATION, SHARK_CONFRONTATION } from '../data/confrontation';
import { FOOD_NAMES, octoCard, type FoodId, type OctoPile } from '../data/octopusCards';
import { ENERGY_SLOTS, SHARK_CARD_BY_ID } from '../data/sharkCards';
import { payValue } from '../engine/helpers';
import { legalPaths } from '../engine/movement';
import { rerollsAllowed } from '../engine/shark';
import type { Action, LearnPick, Pending } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';
import { ask, choose, CANCEL, type Button } from './ask';

/** Error de interfaz: se muestra al jugador y se vuelve a empezar el paso. */
export class UiError extends Error {}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const ZONES = range(9);
const DONE = (label = 'Confirmar'): Button => ({ label, value: 'done', primary: true });

/** Devuelve la siguiente acción del jugador humano `v.me`. */
export async function nextAction(v: PlayerView): Promise<Action> {
  if (v.pending) return pendingFlow(v, v.pending);
  if (v.me === 'pulpo') return octopusFlow(v);
  return sharkFlow(v);
}

// =====================================================================
// PULPO
// =====================================================================

function blockOf(v: PlayerView, z: number) {
  const id = v.spaces[z].block;
  return id && id !== HIDDEN ? v.blocks[id] : null;
}

async function octopusFlow(v: PlayerView): Promise<Action> {
  const P = v.pulpo;
  const foods = P.foodTrack.filter((f) => !P.foodUsed.includes(f));
  const done = P.actionsUsed >= 2;
  const buttons: Button[] = [];
  if (done) buttons.push({ label: 'Terminar turno', value: 'fin', primary: true });
  else if (P.hand.length < P.handSize) buttons.push({ label: `Robar hasta ${P.handSize} cartas`, value: 'robar' });

  const prompt = done
    ? 'Has hecho tus 2 acciones. Puedes usar el poder de una comida o terminar el turno.'
    : `Acción ${P.actionsUsed + 1} de 2: pulsa una carta de tu mano${buttons.length ? ' o roba' : ''}.${foods.length ? ' También puedes usar una comida.' : ''}`;
  const p = await ask({ prompt, cards: done ? [] : P.hand, foods, buttons });

  if (p.kind === 'button') return p.value === 'fin' ? { type: 'finTurno' } : { type: 'robar' };
  if (p.kind === 'food') return foodFlow(v, p.food);
  if (p.kind !== 'card') throw new UiError('Selección inesperada');

  const card = p.id;
  const def = octoCard(card);
  const what = await ask({
    prompt: `«${def.name}» (coste ${def.cost}): ${def.text}`,
    selectedCard: card,
    buttons: [
      { label: 'Jugar la carta', value: 'jugar', primary: true },
      { label: 'Descartar y ocultar 1 bloque', value: 'descartar' },
      CANCEL,
    ],
  });
  if (what.kind === 'button' && what.value === 'descartar') return discardFlow(v, card);
  return playFlow(v, card);
}

async function discardFlow(v: PlayerView, card: string): Promise<Action> {
  const revealed = ZONES.filter((z) => v.spaces[z].block && v.spaces[z].revealed);
  if (!revealed.length) return { type: 'descartarOcultar', card };
  const p = await ask({
    prompt: 'Elige un bloque revelado para ocultarlo.',
    zones: revealed,
    selectedCard: card,
    buttons: [{ label: 'No ocultar ninguno', value: 'none' }, CANCEL],
  });
  return { type: 'descartarOcultar', card, hide: p.kind === 'zone' ? p.id : undefined };
}

async function playFlow(v: PlayerView, card: string): Promise<Action> {
  const def = octoCard(card);
  const pay: number[] = [];
  let paid = 0;
  while (paid < def.cost) {
    const remaining = def.cost - paid;
    const options = ZONES.filter((z) => {
      const b = blockOf(v, z);
      if (!b || v.spaces[z].revealed || pay.includes(z)) return false;
      // La concha doble vale 2: solo sirve si no te pasas (o si es el único bloque que revelas).
      return payValue(b) === 1 || remaining >= 2 || pay.length === 0;
    });
    if (!options.length) throw new UiError('No tienes bloques ocultos suficientes para pagar esa carta');
    const p = await ask({
      prompt: `«${def.name}» cuesta ${def.cost}: revela ${remaining} más pulsando tus bloques ocultos (la concha doble vale 2).`,
      zones: options,
      selectedZones: pay,
      selectedCard: card,
      buttons: [CANCEL],
    });
    if (p.kind !== 'zone') continue;
    pay.push(p.id);
    paid += payValue(blockOf(v, p.id)!);
  }

  const rev = new Set(pay);
  const isRevealed = (z: number) => !!v.spaces[z].block && (v.spaces[z].revealed || rev.has(z));
  const isHidden = (z: number) => !!v.spaces[z].block && !isRevealed(z);
  const base = { prompt: '', previewRevealed: pay, selectedCard: card };
  const e = def.effect;

  switch (e.kind) {
    case 'swap': {
      const swaps: [number, number][] = [];
      for (let i = 0; i < e.n; i++) {
        const candA = ZONES.filter((z) => v.spaces[z].block && (!e.hiddenOnly || isHidden(z)));
        const a = await ask({
          ...base,
          prompt: `Intercambio ${i + 1} de ${e.n}: elige el primer bloque.`,
          zones: candA,
          buttons: [...(i > 0 ? [DONE('Terminar')] : []), CANCEL],
        });
        if (a.kind !== 'zone') break;
        const candB = e.anyDistance
          ? candA.filter((z) => z !== a.id)
          : BOARD.zones[a.id].adjacentZones.filter((z) => v.spaces[z].block && (!e.hiddenOnly || isHidden(z)));
        const b = await ask({
          ...base,
          prompt: `Elige el bloque con el que se intercambia${e.anyDistance ? '' : ' (adyacente)'}.`,
          zones: candB,
          selectedZones: [a.id],
          buttons: [CANCEL],
        });
        if (b.kind === 'zone') swaps.push([a.id, b.id]);
      }
      return { type: 'jugar', card, pay, params: { swaps } };
    }
    case 'shuffle': {
      const EXPOSED = BOARD.zones.findIndex((z) => z.kind === 'expuesta');
      const zones = e.includeExposed ? [EXPOSED] : [];
      while (zones.length < e.n) {
        const cand = ZONES.filter((z) => isHidden(z) && !zones.includes(z));
        if (!cand.length) throw new UiError('No hay bloques ocultos suficientes para barajar');
        const p = await ask({ ...base, prompt: `Elige ${e.n - zones.length} bloque(s) oculto(s) más para barajar.`, zones: cand, selectedZones: zones, buttons: [CANCEL] });
        if (p.kind === 'zone') zones.push(p.id);
      }
      return { type: 'jugar', card, pay, params: { zones } };
    }
    case 'hide': {
      const zones = await pickUpTo(v, base, e.n, ZONES.filter(isRevealed), `Elige hasta ${e.n} bloque(s) revelado(s) para ocultar.`, 1);
      return { type: 'jugar', card, pay, params: { zones } };
    }
    case 'learn': {
      const picks = await learnFlow(v, e.n, isRevealed, base);
      return { type: 'jugar', card, pay, params: { picks } };
    }
    case 'hideZoneKind':
    case 'eat':
      return { type: 'jugar', card, pay };
  }
}

/** Selecciona hasta `max` zonas de `cand` (mínimo `min`). */
async function pickUpTo(v: PlayerView, base: object, max: number, cand: number[], prompt: string, min = 0): Promise<number[]> {
  void v;
  if (cand.length === 0 && min > 0) throw new UiError('No hay bloques válidos para este efecto');
  const zones: number[] = [];
  while (zones.length < max) {
    const options = cand.filter((z) => !zones.includes(z));
    if (!options.length) break;
    const p = await ask({
      ...base,
      prompt: `${prompt} (${zones.length}/${max})`,
      zones: options,
      selectedZones: zones,
      buttons: [...(zones.length >= min ? [DONE()] : []), CANCEL],
    });
    if (p.kind !== 'zone') break;
    zones.push(p.id);
  }
  return zones;
}

async function learnFlow(v: PlayerView, n: number, isRevealed: (z: number) => boolean, base: object): Promise<LearnPick[]> {
  const P = v.pulpo;
  const picks: LearnPick[] = [];
  const taken: Record<string, number> = {};
  const usedSupply: string[] = [];
  const usedReplace: number[] = [];

  const chooseReplace = async (): Promise<number> => {
    const cand = ZONES.filter((z) => {
      const b = blockOf(v, z);
      return isRevealed(z) && b && b.kind !== 'pulpo' && b.kind !== 'comida' && !usedReplace.includes(z);
    });
    if (!cand.length) throw new UiError('Necesitas un bloque revelado (que no sea el pulpo ni comida) para cambiarlo por el nuevo');
    const p = await ask({ ...base, prompt: 'El bloque nuevo entra revelado: elige qué bloque revelado del tablero sustituye.', zones: cand, buttons: [CANCEL] });
    if (p.kind !== 'zone') throw new UiError('Selección inesperada');
    usedReplace.push(p.id);
    return p.id;
  };

  while (picks.length < n) {
    const piles = (Object.keys(P.piles) as OctoPile[]).filter((k) => P.piles[k].length > (taken[k] ?? 0));
    const p = await ask({
      ...base,
      prompt: `Aprender (${picks.length + 1} de ${n}): pulsa un montón para coger su carta de arriba, o un bloque disponible.`,
      piles,
      supply: P.supply.filter((id) => !usedSupply.includes(id)),
      buttons: [...(picks.length ? [DONE('Terminar de aprender')] : []), CANCEL],
    });
    if (p.kind === 'button') break;
    if (p.kind === 'pile') {
      const needsFood = p.pile === 'comer';
      const pick: LearnPick = { kind: 'card', pile: p.pile, replace: needsFood ? await chooseReplace() : undefined };
      taken[p.pile] = (taken[p.pile] ?? 0) + 1;
      picks.push(pick);
    } else if (p.kind === 'supply') {
      usedSupply.push(p.id);
      picks.push({ kind: 'block', block: p.id, replace: await chooseReplace() });
    }
  }
  return picks;
}

async function foodFlow(v: PlayerView, food: FoodId): Promise<Action> {
  const name = FOOD_NAMES[food];
  if (food === 'caracol') {
    const cards = [...new Set([...v.pulpo.deck, ...v.pulpo.discard])];
    if (!cards.length) throw new UiError('No hay cartas en tu mazo ni en tu descarte');
    const card = await choose(`${name}: elige una carta de tu mazo o descarte para llevarla a la mano.`, [
      ...cards.map((c) => ({ label: octoCard(c).name, value: c })),
      CANCEL,
    ]);
    return { type: 'comida', food, params: { card } };
  }
  if (food === 'abulon') {
    const isRevealed = (z: number) => !!v.spaces[z].block && v.spaces[z].revealed;
    const picks = await learnFlow(v, 3, isRevealed, { prompt: '' });
    return { type: 'comida', food, params: { picks } };
  }
  const text = food === 'cangrejo' ? 'Tu mano pasa a 5 cartas y robas hasta completarla.' : 'Ocultas todos tus bloques revelados.';
  await choose(`${name}: ${text}`, [{ label: 'Usar', value: 'ok', primary: true }, CANCEL]);
  return { type: 'comida', food };
}

// =====================================================================
// TIBURÓN
// =====================================================================

// Colocaciones provisionales (aún no enviadas al motor), para poder deshacerlas.
let tentCurrents: { current: number; die: number }[] = [];
let tentSearch: { zone: number; die: number }[] = [];
let energyBuy: number[] = [];
let energyHungerDie: number | null = null;

export function resetTentative() {
  tentCurrents = [];
  tentSearch = [];
  energyBuy = [];
  energyHungerDie = null;
}

function usableCards(v: PlayerView): string[] {
  const T = v.tiburon;
  return T.cards.filter((id) => {
    const key = SHARK_CARD_BY_ID[id].key;
    switch (v.phase) {
      case 'tiburon-robar':
        return (key === 'reactivo' && T.drawn.length >= 2) || key === 'hostil';
      case 'tiburon-tirado':
        return ['hambriento', 'agil', 'atrevido', 'implacable', 'despiadado', 'hostil'].includes(key) ||
          (key === 'vigilante' && !T.stored) || (key === 'rapido' && !T.extraMove);
      case 'tiburon-mover':
        return ['agil', 'atrevido', 'implacable', 'despiadado', 'hostil'].includes(key) || (key === 'rapido' && !T.extraMove);
      default:
        return key === 'hostil';
    }
  });
}

function extraButtons(v: PlayerView): Button[] {
  const T = v.tiburon;
  const out: Button[] = [];
  const left = rerollsAllowed(v) - T.rerollsUsed;
  if (left > 0 && T.pool.length) out.push({ label: `Repetir tirada (${left})`, value: 'reroll' });
  if (T.stored && T.storedTurn !== v.turn) out.push({ label: 'Recuperar dado guardado', value: 'stored' });
  return out;
}

async function handleExtra(v: PlayerView, value: string): Promise<Action | null> {
  if (value === 'stored') return { type: 'recuperarDado' };
  if (value === 'reroll') {
    const p = await ask({ prompt: '¿Qué dado vuelves a tirar?', dice: v.tiburon.pool.map((d) => d.id), buttons: [CANCEL] });
    if (p.kind === 'die') return { type: 'repetirTirada', dice: [p.id] };
  }
  return null;
}

async function sharkFlow(v: PlayerView): Promise<Action> {
  const T = v.tiburon;
  const cards = usableCards(v);

  // Selección genérica que puede ser una carta o un botón extra
  const handleCommon = async (p: Awaited<ReturnType<typeof ask>>): Promise<Action | null> => {
    if (p.kind === 'card') return sharkCardFlow(v, p.id);
    if (p.kind === 'button') return handleExtra(v, p.value);
    return null;
  };

  switch (v.phase) {
    case 'tiburon-robar': {
      const p = await ask({
        prompt: `Has sacado ${T.drawn.length} dado(s) de la bolsa. Tíralos (o usa una carta antes).`,
        cards,
        buttons: [{ label: '🎲 Tirar dados', value: 'tirar', primary: true }],
      });
      if (p.kind === 'button' && p.value === 'tirar') return { type: 'tirar' };
      return (await handleCommon(p)) ?? sharkFlow(v);
    }

    case 'tiburon-tirado': {
      const poolIds = new Set(T.pool.map((d) => d.id));
      tentCurrents = tentCurrents.filter((t) => poolIds.has(t.die) && !v.currents[t.current]);
      const blue = T.pool.filter((d) => d.color === 'azul' && !tentCurrents.some((t) => t.die === d.id));
      const p = await ask({
        prompt: blue.length
          ? 'Corrientes: pulsa un dado azul y después una casilla libre. Cuando termines, pulsa «A moverse».'
          : 'Usa cartas si quieres y pulsa «A moverse».',
        dice: blue.map((d) => d.id),
        cards,
        tentativeCurrents: tentCurrents,
        buttons: [
          { label: 'A moverse ➜', value: 'go', primary: true },
          ...(tentCurrents.length ? [{ label: 'Quitar corrientes', value: 'undo' }] : []),
          ...extraButtons(v),
        ],
      });
      if (p.kind === 'die') {
        const free = range(BOARD.currents.length).filter((c) => !v.currents[c] && c !== T.current && !tentCurrents.some((t) => t.current === c));
        const c = await ask({ prompt: '¿En qué casilla pones la corriente?', currents: free, selectedDice: [p.id], tentativeCurrents: tentCurrents, buttons: [CANCEL] });
        if (c.kind === 'current') tentCurrents.push({ current: c.id, die: p.id });
        return sharkFlow(v);
      }
      if (p.kind === 'button' && p.value === 'go') {
        const placements = tentCurrents.map((t) => ({ die: t.die, current: t.current }));
        tentCurrents = [];
        return { type: 'corrientes', placements };
      }
      if (p.kind === 'button' && p.value === 'undo') {
        tentCurrents = [];
        return sharkFlow(v);
      }
      return (await handleCommon(p)) ?? sharkFlow(v);
    }

    case 'tiburon-mover': {
      const paths = legalPaths(v);
      const dests = [...new Set(paths.map((p) => p[p.length - 1]))];
      const p = await ask({
        prompt: paths.length ? 'Muévete: pulsa la casilla de destino (resaltada).' : 'No tienes ningún movimiento posible.',
        currents: dests,
        cards,
        buttons: [...(paths.length ? [] : [{ label: 'Quedarse', value: 'stay', primary: true }]), ...extraButtons(v)],
      });
      if (p.kind === 'current') {
        const options = paths.filter((path) => path[path.length - 1] === p.id);
        if (options.length === 1) return { type: 'mover', path: options[0] };
        const chosen = await choose('Hay varias rutas hasta ahí. ¿Cuál sigues?', [
          ...options.map((path, i) => ({ label: `Ruta ${i + 1}: ${path.length} casillas (${path.join(' → ')})`, value: String(i) })),
          CANCEL,
        ]);
        return { type: 'mover', path: options[Number(chosen)] };
      }
      if (p.kind === 'button' && p.value === 'stay') return { type: 'mover', path: [] };
      return (await handleCommon(p)) ?? sharkFlow(v);
    }

    case 'tiburon-buscar': {
      const adj = BOARD.currents[T.current].zones;
      const poolIds = new Set(T.pool.map((d) => d.id));
      tentSearch = tentSearch.filter((t) => poolIds.has(t.die));
      const usable = T.pool.filter((d) => d.color !== 'azul' && !tentSearch.some((t) => t.die === d.id));
      const p = await ask({
        prompt: 'Busca (dado amarillo) o ataca (dado rojo): pulsa un dado y luego una zona junto al tiburón. Después confirma.',
        dice: usable.map((d) => d.id),
        cards,
        tentativeZones: tentSearch,
        selectedZones: tentSearch.map((t) => t.zone),
        buttons: [
          { label: tentSearch.length ? 'Confirmar' : 'No buscar ni atacar', value: 'go', primary: true },
          ...(tentSearch.length ? [{ label: 'Deshacer', value: 'undo' }] : []),
        ],
      });
      if (p.kind === 'die') {
        const d = T.pool.find((x) => x.id === p.id)!;
        const zones = adj.filter((z) => {
          if (tentSearch.some((t) => t.zone === z) || d.value < BOARD.zones[z].value) return false;
          const sp = v.spaces[z];
          if (!sp.block) return false;
          if (!sp.revealed) return true;
          return d.color === 'rojo' && blockOf(v, z)?.kind === 'pulpo';
        });
        if (!zones.length) throw new UiError(`Con un ${d.value} no puedes ${d.color === 'rojo' ? 'atacar' : 'buscar'} en ninguna zona adyacente`);
        const z = await ask({ prompt: `¿Dónde ${d.color === 'rojo' ? 'atacas' : 'buscas'}?`, zones, selectedDice: [d.id], tentativeZones: tentSearch, buttons: [CANCEL] });
        if (z.kind === 'zone') tentSearch.push({ zone: z.id, die: d.id });
        return sharkFlow(v);
      }
      if (p.kind === 'button' && p.value === 'go') {
        const placements = tentSearch.map((t) => ({ die: t.die, zone: t.zone }));
        tentSearch = [];
        return { type: 'buscarAtacar', placements };
      }
      if (p.kind === 'button' && p.value === 'undo') {
        tentSearch = [];
        return sharkFlow(v);
      }
      return (await handleCommon(p)) ?? sharkFlow(v);
    }

    case 'tiburon-energia':
      return energyFlow(v, cards);
  }
  throw new UiError('Fase desconocida');
}

async function energyFlow(v: PlayerView, cards: string[]): Promise<Action> {
  const T = v.tiburon;
  const sum = T.energy.reduce((n, d) => n + d.value, 0);
  const cost = (slot: number) => SHARK_CARD_BY_ID[T.market[slot]!].cost;
  energyBuy = energyBuy.filter((s) => T.market[s]);
  if (energyHungerDie !== null && !T.energy.some((d) => d.id === energyHungerDie)) energyHungerDie = null;
  const spent = energyBuy.reduce((n, s) => n + cost(s), 0);
  const toggle = range(T.market.length).filter((s) => T.market[s] && (energyBuy.includes(s) || cost(s) <= sum - spent));
  const anyAffordable = range(T.market.length).some((s) => T.market[s] && cost(s) <= sum);
  const must = T.energy.length >= ENERGY_SLOTS;
  const lowest = [...T.energy].sort((a, b) => a.value - b.value)[0];
  const hungerDie = energyHungerDie ?? lowest?.id ?? null;

  const buttons: Button[] = [];
  if (energyBuy.length) buttons.push({ label: `Comprar (${spent}) y terminar`, value: 'buy', primary: true });
  if (!must || !anyAffordable) buttons.push({ label: must ? 'Gastar sin comprar (obligatorio)' : 'Terminar sin gastar', value: 'skip', primary: !energyBuy.length });
  if (!T.marketRefreshed && T.energy.some((d) => d.value > 1) && T.deck.length) buttons.push({ label: 'Renovar una carta (−1 a un dado)', value: 'refresh' });

  const p = await ask({
    prompt:
      `Energía almacenada: ${sum} puntos. Pulsa cartas del mercado para comprarlas.` +
      (energyBuy.length ? ' Pulsa un dado de energía para elegir cuál va al hambre.' : '') +
      (must ? ' Tienes 3 dados: estás obligado a gastar.' : ''),
    market: toggle,
    selectedMarket: energyBuy,
    dice: energyBuy.length ? T.energy.map((d) => d.id) : [],
    selectedDice: energyBuy.length && hungerDie !== null ? [hungerDie] : [],
    cards,
    buttons,
  });
  if (p.kind === 'market') {
    energyBuy = energyBuy.includes(p.slot) ? energyBuy.filter((s) => s !== p.slot) : [...energyBuy, p.slot];
    return energyFlow(v, cards);
  }
  if (p.kind === 'die') {
    energyHungerDie = p.id;
    return energyFlow(v, cards);
  }
  if (p.kind === 'card') return sharkCardFlow(v, p.id);
  if (p.kind === 'button' && p.value === 'refresh') {
    const d = await ask({ prompt: 'Elige el dado de energía que baja 1.', dice: T.energy.filter((x) => x.value > 1).map((x) => x.id), buttons: [CANCEL] });
    const s = await ask({ prompt: '¿Qué carta del mercado cambias?', market: range(T.market.length).filter((i) => T.market[i]), selectedDice: d.kind === 'die' ? [d.id] : [], buttons: [CANCEL] });
    if (d.kind === 'die' && s.kind === 'market') return { type: 'renovar', die: d.id, slot: s.slot };
    return energyFlow(v, cards);
  }
  const buy = p.kind === 'button' && p.value === 'buy' ? energyBuy : [];
  energyBuy = [];
  energyHungerDie = null;
  return { type: 'energia', buy, hungerDie: hungerDie ?? undefined };
}

async function sharkCardFlow(v: PlayerView, card: string): Promise<Action> {
  const T = v.tiburon;
  const def = SHARK_CARD_BY_ID[card];
  const ids = T.pool.map((d) => d.id);
  await choose(`«${def.name}»: ${def.text}`, [{ label: 'Usar', value: 'ok', primary: true }, CANCEL]);
  const dieAsk = async (prompt: string, dice: number[], selected: number[] = []) => {
    if (!dice.length) throw new UiError('No tienes dados adecuados para esta carta');
    const p = await ask({ prompt, dice, selectedDice: selected, buttons: [CANCEL] });
    if (p.kind !== 'die') throw new UiError('Selección inesperada');
    return p.id;
  };
  switch (def.key) {
    case 'vigilante':
      return { type: 'usarCarta', card, params: { dice: [await dieAsk('¿Qué dado guardas para otro turno?', ids)] } };
    case 'implacable': {
      const a = await dieAsk('Elige el primer dado que vuelves a tirar.', ids);
      const rest = ids.filter((i) => i !== a);
      if (!rest.length) return { type: 'usarCarta', card, params: { dice: [a] } };
      const p = await ask({ prompt: '¿Otro dado más?', dice: rest, selectedDice: [a], buttons: [{ label: 'Solo ese', value: 'one', primary: true }, CANCEL] });
      return { type: 'usarCarta', card, params: { dice: p.kind === 'die' ? [a, p.id] : [a] } };
    }
    case 'despiadado': {
      const target = await dieAsk('Elige el dado que aumenta.', ids);
      const source = await dieAsk('Elige el dado cuyo valor se suma (volverá a la bolsa).', ids.filter((i) => i !== target), [target]);
      return { type: 'usarCarta', card, params: { target, source } };
    }
    case 'atrevido': {
      const target = await dieAsk('Elige el dado rojo que pasa a 6.', T.pool.filter((d) => d.color === 'rojo').map((d) => d.id));
      const source = await dieAsk('Elige otro dado que va a la escala de hambre.', ids.filter((i) => i !== target), [target]);
      return { type: 'usarCarta', card, params: { target, source } };
    }
    case 'reactivo': {
      const opts = T.drawn.map((c, i) => ({ label: `${c} (${i + 1})`, value: String(i) }));
      const a = Number(await choose('Elige el primer dado sacado que devuelves.', [...opts, CANCEL]));
      const b = Number(await choose('Elige el segundo dado que devuelves.', [...opts.filter((o) => o.value !== String(a)), CANCEL]));
      const pick = (await choose('¿Qué color coges de la bolsa?', [
        { label: 'Azul (corriente)', value: 'azul', color: '#2f80ed' },
        { label: 'Amarillo (búsqueda)', value: 'amarillo', color: '#b8901c' },
        { label: 'Rojo (ataque)', value: 'rojo', color: '#eb5757' },
        CANCEL,
      ])) as 'azul' | 'amarillo' | 'rojo';
      return { type: 'usarCarta', card, params: { returnIdx: [a, b], pick } };
    }
    default:
      return { type: 'usarCarta', card };
  }
}

// =====================================================================
// DECISIONES PENDIENTES
// =====================================================================

async function pendingFlow(v: PlayerView, p: Pending): Promise<Action> {
  const withCurrent = range(BOARD.currents.length).filter((c) => v.currents[c]);
  const pickCurrents = async (max: number, prompt: string) => {
    const out: number[] = [];
    while (out.length < max) {
      const opts = withCurrent.filter((c) => !out.includes(c));
      if (!opts.length) break;
      const r = await ask({ prompt: `${prompt} (${out.length}/${max})`, currents: opts, selectedCurrents: out, buttons: [DONE(out.length ? 'Confirmar' : 'No retirar ninguna')] });
      if (r.kind !== 'current') break;
      out.push(r.id);
    }
    return out;
  };
  const pickLair = async (prompt: string) => {
    const free = LAIRS.filter((l) => !v.currents[l]);
    const r = await ask({ prompt, currents: free.length ? free : LAIRS });
    if (r.kind !== 'current') throw new UiError('Selección inesperada');
    return r.id;
  };

  switch (p.type) {
    case 'observador': {
      const use = await choose(`¡Has revelado una trampa! ¿Usas «Observador» para ignorarla?`, [
        { label: 'Sí, ignorarla', value: 'yes', primary: true },
        { label: 'No', value: 'no' },
      ]);
      return { type: 'observador', use: use === 'yes' };
    }
    case 'trampa': {
      switch (p.trap) {
        case 'ocultar2': {
          const cand = ZONES.filter((z) => z !== p.zone && v.spaces[z].block && v.spaces[z].revealed);
          const zones = await pickUpTo(v, {}, 2, cand, '¡Trampa! Puedes ocultar hasta 2 bloques');
          return { type: 'resolverTrampa', zones };
        }
        case 'quitar1':
        case 'quitar2': {
          const n = p.trap === 'quitar1' ? 1 : 2;
          return { type: 'resolverTrampa', currents: await pickCurrents(n, `¡Trampa! Retira hasta ${n} corriente(s) del tiburón`) };
        }
        case 'guarida':
          return { type: 'resolverTrampa', lair: await pickLair('¡Trampa! Elige a qué guarida mandas al tiburón.') };
      }
      break;
    }
    case 'enfrentamiento': {
      const mine = v.me === 'pulpo' ? v.pulpo.confrontation : v.tiburon.confrontation;
      const names = v.me === 'pulpo' ? OCTO_CONFRONTATION : SHARK_CONFRONTATION;
      const colors = { amarillo: '#b8901c', rojo: '#c0392b', gris: '#6c757d' };
      const prompt = v.me === 'pulpo'
        ? '⚔️ ¡El tiburón te ha atrapado! Elige en secreto tu estrategia de huida.'
        : '⚔️ ¡Has atacado al pulpo! Elige en secreto qué estrategia contrarrestas.';
      const color = await choose(prompt, mine.map((c) => ({ label: `${names[c].name} — ${names[c].text}`, value: c, color: colors[c] })));
      return { type: 'enfrentar', color: color as 'amarillo' | 'rojo' | 'gris' };
    }
    case 'huida': {
      if (p.color === 'amarillo') {
        const pz = ZONES.find((z) => blockOf(v, z)?.kind === 'pulpo');
        const cand = ZONES.filter((z) => z !== pz && v.spaces[z].block && !v.spaces[z].revealed);
        const zones = await pickUpTo(v, {}, 2, cand, 'Huida: elige hasta 2 bloques ocultos para barajarlos con el pulpo');
        return { type: 'resolverHuida', zones };
      }
      const lair = await pickLair('Lucha: elige a qué guarida mandas al tiburón.');
      const currents = await pickCurrents(1, 'Lucha: retira 1 corriente');
      return { type: 'resolverHuida', lair, currents };
    }
  }
  throw new UiError('Decisión desconocida');
}
