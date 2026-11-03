import { tryAction } from '../engine';
import type { GameState, Role } from '../engine/types';
import { viewFor } from '../engine/view';
import { randomCandidates } from './randomPlayer';

/**
 * Punto de entrada de la IA. De momento juega al azar (Fase 3); en la Fase 4 se sustituye por
 * IAs de verdad para cada papel. La IA solo mira su propia vista: nunca hace trampa.
 */
export function aiAct(state: GameState, role: Role, rand: () => number = Math.random): GameState {
  const view = viewFor(state, role);
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const action of randomCandidates(view, rand)) {
      const res = tryAction(state, role, action);
      if (res.ok) return res.state;
    }
  }
  throw new Error(`La IA (${role}) no encuentra ninguna acción válida`);
}
