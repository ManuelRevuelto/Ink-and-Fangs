import { tryAction } from '../engine';
import type { Action, GameState, Role } from '../engine/types';
import { viewFor, type PlayerView } from '../engine/view';
import { randomCandidates } from './randomPlayer';
import { sharkDecide } from './sharkAI';

/**
 * Punto de entrada de la IA. La IA solo mira su propia vista: nunca hace trampa.
 * - Tiburón: IA de verdad (sharkAI.ts).
 * - Pulpo: de momento juega al azar (su IA llega después).
 * Si la IA propone algo ilegal, se recurre al jugador aleatorio para no bloquear la partida.
 */
export type Brain = (v: PlayerView) => Action;

export const BRAINS: Record<Role, Brain | null> = {
  tiburon: sharkDecide,
  pulpo: null,
};

/** Últimos fallos de la IA (útil para depurar en los tests). */
export const aiErrors: string[] = [];

export function aiAct(state: GameState, role: Role, rand: () => number = Math.random, brains = BRAINS): GameState {
  const view = viewFor(state, role);
  const brain = brains[role];
  if (brain) {
    const action = brain(view);
    const res = tryAction(state, role, action);
    if (res.ok) return res.state;
    aiErrors.push(`${role} en ${state.phase}: ${res.error} — ${JSON.stringify(action)}`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const action of randomCandidates(view, rand)) {
      const res = tryAction(state, role, action);
      if (res.ok) return res.state;
    }
  }
  throw new Error(`La IA (${role}) no encuentra ninguna acción válida`);
}
