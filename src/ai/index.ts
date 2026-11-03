import { tryAction } from '../engine';
import type { Action, GameState, Role } from '../engine/types';
import { viewFor, type PlayerView } from '../engine/view';
import { octopusDecide } from './octopusAI';
import { randomCandidates } from './randomPlayer';
import { sharkDecide } from './sharkAI';

/**
 * Punto de entrada de la IA. La IA solo mira su propia vista: nunca hace trampa.
 * Un «cerebro» devuelve una acción o una lista ordenada de mejor a peor (se usa la primera legal).
 * Si ninguna es legal, se recurre al jugador aleatorio para no bloquear la partida.
 */
export type Brain = (v: PlayerView) => Action | Action[];

export const BRAINS: Record<Role, Brain | null> = {
  tiburon: sharkDecide,
  pulpo: octopusDecide,
};

/** Últimos fallos de la IA (útil para depurar en los tests). */
export const aiErrors: string[] = [];

export function aiAct(state: GameState, role: Role, rand: () => number = Math.random, brains = BRAINS): GameState {
  const view = viewFor(state, role);
  const brain = brains[role];
  if (brain) {
    const decided = brain(view);
    const actions = Array.isArray(decided) ? decided : [decided];
    let firstError = '';
    for (const action of actions) {
      const res = tryAction(state, role, action);
      if (res.ok) return res.state;
      firstError ||= `${res.error} — ${JSON.stringify(action)}`;
    }
    aiErrors.push(`${role} en ${state.phase}: ${firstError || 'sin propuestas'}`);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const action of randomCandidates(view, rand)) {
      const res = tryAction(state, role, action);
      if (res.ok) return res.state;
    }
  }
  throw new Error(`La IA (${role}) no encuentra ninguna acción válida`);
}
