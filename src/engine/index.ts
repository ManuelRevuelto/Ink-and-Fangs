import { octopusAction } from './octopus';
import { pendingAction, sharkAction, startSharkTurn } from './shark';
import type { Action, GameState, OctopusAction, PendingAction, Role, SharkAction } from './types';
import { fail, GameError } from './types';

export * from './types';
export { newGame } from './setup';
export { viewFor, HIDDEN } from './view';
export type { PlayerView } from './view';
export { legalPaths } from './movement';

const PENDING_TYPES = new Set(['resolverTrampa', 'observador', 'enfrentar', 'resolverHuida', 'resolverComida']);
const OCTOPUS_TYPES = new Set(['jugar', 'robar', 'descartarOcultar', 'finTurno']);

/** Quién debe decidir ahora. */
export function actors(s: GameState): Role[] {
  if (s.winner) return [];
  const p = s.pending;
  if (!p) return [s.active];
  if (p.role !== 'ambos') return [p.role];
  return (['pulpo', 'tiburon'] as Role[]).filter((r) => !p.choices[r]);
}

/**
 * Aplica una acción y devuelve el NUEVO estado (el original no se modifica).
 * Lanza GameError si la acción no es legal.
 */
export function applyAction(state: GameState, role: Role, action: Action): GameState {
  const s = structuredClone(state);
  if (s.winner) fail('La partida ha terminado');
  if (!actors(s).includes(role)) fail('No es tu turno');

  if (s.pending) {
    if (!PENDING_TYPES.has(action.type)) fail('Primero hay que resolver la decisión pendiente');
    pendingAction(s, role, action as PendingAction);
  } else if (role === 'pulpo') {
    if (!OCTOPUS_TYPES.has(action.type)) fail('Esa acción no es del pulpo');
    octopusAction(s, action as OctopusAction);
    if (action.type === 'finTurno' && !s.winner) startSharkTurn(s);
  } else {
    if (PENDING_TYPES.has(action.type) || OCTOPUS_TYPES.has(action.type)) fail('Esa acción no es del tiburón');
    sharkAction(s, action as SharkAction);
  }
  return s;
}

export type TryResult = { ok: true; state: GameState } | { ok: false; error: string };

/** Como applyAction, pero devuelve el error en vez de lanzarlo. */
export function tryAction(state: GameState, role: Role, action: Action): TryResult {
  try {
    return { ok: true, state: applyAction(state, role, action) };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message };
    throw e;
  }
}
