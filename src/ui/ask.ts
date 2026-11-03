import type { FoodId, OctoPile } from '../data/octopusCards';

/**
 * Interacción guiada: el juego «pregunta» algo (qué zona, qué dado, qué botón…), resalta lo que se
 * puede pulsar y espera. Los flujos se escriben como funciones async:
 *
 *   const z = await ask({ prompt: 'Elige un bloque', zones: [0, 3, 4] });
 */
export type Pick =
  | { kind: 'zone'; id: number }
  | { kind: 'current'; id: number }
  | { kind: 'die'; id: number }
  | { kind: 'card'; id: string }
  | { kind: 'market'; slot: number }
  | { kind: 'pile'; pile: OctoPile }
  | { kind: 'supply'; id: string }
  | { kind: 'food'; food: FoodId }
  | { kind: 'button'; value: string };

export interface Button {
  label: string;
  value: string;
  primary?: boolean;
  color?: string;
}

export interface AskSpec {
  prompt: string;
  zones?: number[];
  currents?: number[];
  dice?: number[];
  cards?: string[];
  market?: number[];
  piles?: OctoPile[];
  supply?: string[];
  foods?: FoodId[];
  buttons?: Button[];
  // Marcas visuales (no seleccionables)
  selectedZones?: number[];
  selectedCurrents?: number[];
  selectedDice?: number[];
  selectedMarket?: number[];
  selectedCard?: string;
  previewRevealed?: number[];
  tentativeCurrents?: { current: number; die: number }[];
  tentativeZones?: { zone: number; die: number }[];
}

export class Cancel extends Error {}

export const CANCEL: Button = { label: 'Cancelar', value: '__cancel' };

let current: { spec: AskSpec; resolve: (p: Pick) => void } | null = null;
let listener: (spec: AskSpec | null) => void = () => {};

export function onAskChange(fn: (spec: AskSpec | null) => void) {
  listener = fn;
}

export const currentSpec = () => current?.spec ?? null;

export function ask(spec: AskSpec): Promise<Pick> {
  return new Promise((resolve) => {
    current = { spec, resolve };
    listener(spec);
  }).then((p) => {
    const pick = p as Pick;
    if (pick.kind === 'button' && pick.value === CANCEL.value) throw new Cancel();
    return pick;
  });
}

function allowed(spec: AskSpec, p: Pick): boolean {
  switch (p.kind) {
    case 'zone':
      return !!spec.zones?.includes(p.id);
    case 'current':
      return !!spec.currents?.includes(p.id);
    case 'die':
      return !!spec.dice?.includes(p.id);
    case 'card':
      return !!spec.cards?.includes(p.id);
    case 'market':
      return !!spec.market?.includes(p.slot);
    case 'pile':
      return !!spec.piles?.includes(p.pile);
    case 'supply':
      return !!spec.supply?.includes(p.id);
    case 'food':
      return !!spec.foods?.includes(p.food);
    case 'button':
      return !!spec.buttons?.some((b) => b.value === p.value);
  }
}

/** Lo llama la interfaz cuando el usuario pulsa algo. Se ignora si no está permitido ahora. */
export function offer(p: Pick): boolean {
  if (!current || !allowed(current.spec, p)) return false;
  const { resolve } = current;
  current = null;
  listener(null);
  resolve(p);
  return true;
}

export function isAllowed(p: Pick): boolean {
  return !!current && allowed(current.spec, p);
}

/** Atajo: preguntar solo con botones. */
export async function choose(prompt: string, buttons: Button[]): Promise<string> {
  const p = await ask({ prompt, buttons });
  return (p as { value: string }).value;
}
