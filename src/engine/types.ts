import type { ConfColor } from '../data/confrontation';
import type { FoodId, OctoPile } from '../data/octopusCards';
import type { DieColor } from '../data/sharkCards';

export type Role = 'pulpo' | 'tiburon';

export type BlockKind = 'pulpo' | 'concha' | 'conchaDoble' | 'trampa' | 'comida';
export type TrapId = 'ocultar2' | 'quitar1' | 'quitar2' | 'guarida';

export interface Block {
  id: string;
  kind: BlockKind;
  food?: FoodId;
  trap?: TrapId;
}

export interface Space {
  block: string | null;
  revealed: boolean;
}

export interface Die {
  id: number;
  color: DieColor;
  value: number;
}

export type DiceCount = Record<DieColor, number>;

export interface OctopusState {
  hand: string[];
  deck: string[]; // índice 0 = carta de arriba
  discard: string[];
  removed: string[]; // fuera del juego
  piles: Record<OctoPile, string[]>; // montones para aprender (índice 0 = arriba, boca arriba)
  handSize: number;
  supply: string[]; // bloques disponibles para aprender (ids)
  aside: string[]; // bloques retirados del tablero
  foodTrack: FoodId[];
  foodUsed: FoodId[];
  actionsUsed: number;
  played: string[]; // cartas jugadas este turno
  confrontation: ConfColor[];
}

export interface SharkState {
  current: number; // casilla de corriente que ocupa
  facing: number | null; // cruce hacia el que mira (null = puede elegir)
  bag: DiceCount;
  supply: DiceCount; // reserva fuera de la bolsa
  drawn: DieColor[]; // dados sacados sin tirar todavía
  pool: Die[]; // dados tirados este turno
  energy: Die[];
  hunger: Die[];
  growth: Die[][]; // dados en cada ficha de crecimiento
  growthFlipped: boolean[];
  growthQueue: Die[]; // dados usados este turno que irán a crecimiento
  deck: string[];
  market: (string | null)[];
  cards: string[]; // cartas compradas sin usar
  stored: Die | null; // dado guardado con Vigilante
  storedCard: string | null;
  storedTurn: number;
  rerollsUsed: number;
  marketRefreshed: boolean;
  extraMove: boolean; // Rápido activado
  confrontation: ConfColor[];
}

export type Phase =
  | 'pulpo'
  | 'tiburon-robar' // dados sacados, sin tirar
  | 'tiburon-tirado' // colocar corrientes / usar cartas
  | 'tiburon-mover'
  | 'tiburon-buscar'
  | 'tiburon-energia'
  | 'fin';

export interface ResolveItem {
  die: Die;
  zone: number;
  mode: 'buscar' | 'atacar';
}

export type Pending =
  | { type: 'trampa'; role: 'pulpo'; trap: TrapId; zone: number }
  | { type: 'observador'; role: 'tiburon'; trap: TrapId; zone: number }
  | { type: 'enfrentamiento'; role: 'ambos'; die: Die; choices: Partial<Record<Role, ConfColor>> }
  | { type: 'huida'; role: 'pulpo'; color: 'amarillo' | 'rojo'; die: Die };

export interface GameState {
  rng: number;
  nextDieId: number;
  nextBlockId: number;
  turn: number;
  active: Role;
  phase: Phase;
  pending: Pending | null;
  queue: ResolveItem[];
  spaces: Space[]; // uno por zona
  blocks: Record<string, Block>;
  currents: (Die | null)[]; // dado de corriente en cada casilla
  pulpo: OctopusState;
  tiburon: SharkState;
  winner: Role | null;
  winReason: string | null;
  log: string[];
}

// ---------------- Acciones ----------------

export type LearnPick =
  | { kind: 'card'; pile: OctoPile; replace?: number } // replace: zona del bloque revelado a cambiar (solo comer)
  | { kind: 'block'; block: string; replace: number };

export interface EffectParams {
  swaps?: [number, number][];
  zones?: number[]; // barajar / ocultar
  picks?: LearnPick[];
  card?: string; // caracol: carta a buscar
}

export type OctopusAction =
  | { type: 'jugar'; card: string; pay: number[]; params?: EffectParams }
  | { type: 'robar' }
  | { type: 'descartarOcultar'; card: string; hide?: number }
  | { type: 'comida'; food: FoodId; params?: EffectParams }
  | { type: 'finTurno' };

export interface SharkCardParams {
  dice?: number[]; // ids de dados
  target?: number;
  source?: number;
  pick?: DieColor;
  returnIdx?: number[];
}

export type SharkAction =
  | { type: 'tirar' }
  | { type: 'usarCarta'; card: string; params?: SharkCardParams }
  | { type: 'repetirTirada'; dice: number[] }
  | { type: 'recuperarDado' }
  | { type: 'corrientes'; placements: { die: number; current: number }[] }
  | { type: 'mover'; path: number[]; facing?: number }
  | { type: 'buscarAtacar'; placements: { die: number; zone: number }[] }
  | { type: 'renovar'; die: number; slot: number }
  | { type: 'energia'; buy: number[]; hungerDie?: number };

export type PendingAction =
  | { type: 'resolverTrampa'; zones?: number[]; currents?: number[]; lair?: number }
  | { type: 'observador'; use: boolean; card?: string }
  | { type: 'enfrentar'; color: ConfColor }
  | { type: 'resolverHuida'; zones?: number[]; lair?: number; currents?: number[] };

export type Action = OctopusAction | SharkAction | PendingAction;

export class GameError extends Error {}

export function fail(msg: string): never {
  throw new GameError(msg);
}
