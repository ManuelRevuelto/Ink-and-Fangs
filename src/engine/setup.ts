import { BOARD, LAIRS, vertexTowardCenter } from '../data/board';
import { CONF_COLORS } from '../data/confrontation';
import { expandOctoCards, type FoodId, type OctoPile } from '../data/octopusCards';
import { INITIAL_BAG, MARKET_SIZE, SHARK_CARDS, TOTAL_DICE } from '../data/sharkCards';
import { GROWTH_TILES } from '../data/growthTiles';
import { log, newBlock } from './helpers';
import { nextInt, shuffleInPlace } from './rng';
import type { GameState, TrapId } from './types';

export interface NewGameOptions {
  seed?: number;
  /** Guarida inicial del tiburón (la elige el pulpo). Si se omite, se elige al azar. */
  sharkLair?: number;
}

const FOODS: FoodId[] = ['cangrejo', 'langosta', 'caracol', 'abulon'];
const TRAPS: TrapId[] = ['ocultar2', 'quitar1', 'quitar2', 'guarida'];
const PILES: OctoPile[] = ['aprender', 'comer', 'ocultar', 'moverse'];

export function newGame(opts: NewGameOptions = {}): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const s: GameState = {
    rng: seed,
    nextDieId: 1,
    nextBlockId: 1,
    turn: 1,
    active: 'pulpo',
    phase: 'pulpo',
    pending: null,
    queue: [],
    spaces: BOARD.zones.map(() => ({ block: null, revealed: false })),
    blocks: {},
    currents: BOARD.currents.map(() => null),
    pulpo: {
      hand: [],
      deck: [],
      discard: [],
      removed: [],
      piles: { aprender: [], comer: [], ocultar: [], moverse: [] },
      handSize: 4,
      supply: [],
      aside: [],
      foodTrack: [],
      foodUsed: [],
      actionsUsed: 0,
      played: [],
      confrontation: [...CONF_COLORS],
    },
    tiburon: {
      current: 0,
      facing: null,
      bag: { ...INITIAL_BAG },
      supply: {
        azul: TOTAL_DICE.azul - INITIAL_BAG.azul,
        amarillo: TOTAL_DICE.amarillo - INITIAL_BAG.amarillo,
        rojo: TOTAL_DICE.rojo - INITIAL_BAG.rojo,
      },
      drawn: [],
      pool: [],
      energy: [],
      hunger: [],
      growth: GROWTH_TILES.map(() => []),
      growthFlipped: GROWTH_TILES.map(() => false),
      growthQueue: [],
      deck: [],
      market: [],
      cards: [],
      stored: null,
      storedCard: null,
      storedTurn: 0,
      rerollsUsed: 0,
      marketRefreshed: false,
      extraMove: false,
      confrontation: [...CONF_COLORS],
    },
    winner: null,
    winReason: null,
    log: [],
  };

  // --- Tiburón: mazo y mercado ---
  const sharkDeck = shuffleInPlace(s, SHARK_CARDS.map((c) => c.id));
  s.tiburon.market = sharkDeck.splice(0, MARKET_SIZE);
  s.tiburon.deck = sharkDeck;

  // --- Pulpo: montones de aprendizaje ---
  for (const pile of PILES) {
    s.pulpo.piles[pile] = shuffleInPlace(s, expandOctoCards((c) => !c.starter && c.pile === pile));
  }

  // --- Bloques ---
  const pulpoId = newBlock(s, { kind: 'pulpo' });
  for (const food of FOODS) newBlock(s, { kind: 'comida', food }); // van con su carta «Comer»
  const traps = TRAPS.map((trap) => newBlock(s, { kind: 'trampa', trap }));
  const doubleShell = newBlock(s, { kind: 'conchaDoble' });
  const shells = Array.from({ length: 8 }, () => newBlock(s, { kind: 'concha' }));

  const bagTrap = traps.splice(nextInt(s, traps.length), 1)[0];
  const bag = shuffleInPlace(s, [pulpoId, bagTrap, ...shells.slice(0, 7)]);
  bag.forEach((id, zone) => (s.spaces[zone] = { block: id, revealed: false }));
  s.pulpo.supply = [shells[7], doubleShell, ...traps];

  // --- Pulpo: mazo inicial y mano ---
  const starters = expandOctoCards((c) => c.starter);
  const quick = starters.find((c) => c.startsWith('aprendizaje-rapido'))!;
  s.pulpo.deck = shuffleInPlace(s, starters.filter((c) => c !== quick));
  s.pulpo.hand = [quick, ...s.pulpo.deck.splice(0, 3)];

  // --- Tiburón en su guarida ---
  const lair = opts.sharkLair ?? LAIRS[nextInt(s, LAIRS.length)];
  if (!LAIRS.includes(lair)) throw new Error(`La casilla ${lair} no es una guarida`);
  s.tiburon.current = lair;
  s.tiburon.facing = vertexTowardCenter(lair);

  log(s, 'Comienza la partida. Juega el pulpo.');
  return s;
}
