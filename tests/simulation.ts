import { randomCandidates } from '../src/ai/randomPlayer';
import { actors, tryAction, viewFor, type GameState, type Role } from '../src/engine';
import { TOTAL_DICE } from '../src/data/sharkCards';

export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cuenta todos los dados del tiburón estén donde estén (deben ser siempre 35). */
export function countDice(s: GameState): number {
  const t = s.tiburon;
  const bag = t.bag.azul + t.bag.amarillo + t.bag.rojo;
  const supply = t.supply.azul + t.supply.amarillo + t.supply.rojo;
  const pendingDie = s.pending && 'die' in s.pending ? 1 : 0;
  return (
    bag + supply + t.drawn.length + t.pool.length + t.energy.length + t.hunger.length + t.growth.flat().length +
    t.growthQueue.length + (t.stored ? 1 : 0) + s.currents.filter(Boolean).length + s.queue.length + pendingDie
  );
}

export const TOTAL = TOTAL_DICE.azul + TOTAL_DICE.amarillo + TOTAL_DICE.rojo;

/** Juega una partida con jugadores aleatorios. Devuelve el estado final y nº de pasos. */
export function playRandomGame(s: GameState, seed: number, maxSteps = 5000, check?: (s: GameState) => void) {
  const r = mulberry(seed);
  let steps = 0;
  while (!s.winner && steps < maxSteps) {
    const role: Role = actors(s)[0];
    const candidates = randomCandidates(viewFor(s, role), r);
    let moved = false;
    for (const a of candidates) {
      const res = tryAction(s, role, a);
      if (res.ok) {
        s = res.state;
        moved = true;
        break;
      }
    }
    if (!moved) throw new Error(`Atascado: ${role} en fase ${s.phase}, pendiente ${JSON.stringify(s.pending)}`);
    check?.(s);
    steps++;
  }
  return { state: s, steps };
}
