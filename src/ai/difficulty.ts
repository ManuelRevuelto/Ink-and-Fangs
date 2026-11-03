import type { Action, Role } from '../engine/types';
import type { PlayerView } from '../engine/view';
import { octopusDecide, OCTO_NORMAL, type OctoParams } from './octopusAI';
import { randomCandidates } from './randomPlayer';
import { sharkDecide, SHARK_NORMAL, type SharkParams } from './sharkAI';

/**
 * Niveles de dificultad de la máquina.
 * - Fácil: se equivoca a menudo (a veces hace una jugada al azar) y el tiburón tiene mala memoria.
 * - Normal: la IA tal cual.
 * - Difícil: parámetros ajustados con torneos para ganar más (ver docs/decisiones.md).
 */
export type Difficulty = 'facil' | 'normal' | 'dificil';

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' };

type Brain = (v: PlayerView) => Action | Action[];

interface Level {
  shark: SharkParams;
  octo: OctoParams;
  mistakes: number; // probabilidad de hacer una jugada al azar
}

export const LEVELS: Record<Difficulty, Level> = {
  facil: {
    shark: { ...SHARK_NORMAL, memory: 8, winScale: 9 },
    octo: { ...OCTO_NORMAL, payInfo: 2, shuffle: 25 },
    mistakes: 0.35,
  },
  normal: { shark: SHARK_NORMAL, octo: OCTO_NORMAL, mistakes: 0 },
  // Ajustado con torneos de 200 partidas contra el nivel Normal:
  // tiburón 45.5% → 63.5% · pulpo 50% → 56.5%.
  dificil: {
    shark: { ...SHARK_NORMAL, hungerSlope: 0.8, winScale: 16 },
    octo: { ...OCTO_NORMAL, payInfo: 20 },
    mistakes: 0,
  },
};

/** Añade errores: con probabilidad `p`, prueba primero jugadas al azar. */
function withMistakes(brain: Brain, p: number): Brain {
  if (p <= 0) return brain;
  return (v) => {
    const decided = brain(v);
    const list = Array.isArray(decided) ? decided : [decided];
    // En las decisiones pendientes (trampas, enfrentamiento…) no se fuerzan errores.
    if (v.pending || Math.random() >= p) return list;
    return [...randomCandidates(v, Math.random, 8), ...list];
  };
}

export function brainsFor(level: Difficulty): Record<Role, Brain> {
  const L = LEVELS[level];
  return {
    tiburon: withMistakes((v) => sharkDecide(v, L.shark), L.mistakes),
    pulpo: withMistakes((v) => octopusDecide(v, L.octo), L.mistakes),
  };
}
