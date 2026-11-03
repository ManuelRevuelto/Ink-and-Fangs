import type { GameState, Role } from './types';

/** Marcador para lo que el jugador no puede ver. */
export const HIDDEN = '?';

export type PlayerView = GameState & { me: Role };

/**
 * Lo que ve un jugador. La interfaz y la IA SOLO deben trabajar con esto, nunca con el estado real.
 * - El tiburón no ve los bloques ocultos, la mano ni el mazo del pulpo.
 * - Nadie ve el orden de los mazos, la semilla aleatoria ni la carta de enfrentamiento del rival.
 */
export function viewFor(state: GameState, me: Role): PlayerView {
  const v = structuredClone(state) as PlayerView;
  v.me = me;
  v.rng = 0;
  v.tiburon.deck = v.tiburon.deck.map(() => HIDDEN);
  v.pulpo.deck = v.pulpo.deck.map(() => HIDDEN);
  // De los montones para aprender solo se ve la carta de arriba.
  for (const pile of Object.values(v.pulpo.piles)) pile.forEach((_, i) => i > 0 && (pile[i] = HIDDEN));

  if (me === 'tiburon') {
    v.pulpo.hand = v.pulpo.hand.map(() => HIDDEN);
    v.spaces.forEach((sp) => {
      if (sp.block && !sp.revealed) {
        delete v.blocks[sp.block];
        sp.block = HIDDEN;
      }
    });
  }

  // La carta de enfrentamiento del rival no se ve hasta que ambos han elegido.
  const p = v.pending;
  const other: Role = me === 'pulpo' ? 'tiburon' : 'pulpo';
  if (p?.type === 'enfrentamiento' && p.choices[other]) p.choices[other] = HIDDEN as never;
  return v;
}
