/**
 * Aleatoriedad determinista (mulberry32). El estado de la semilla vive dentro del GameState,
 * así una partida se puede reproducir exactamente y el motor sigue siendo puro.
 */
export interface RngHolder {
  rng: number;
}

export function nextFloat(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) | 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const nextInt = (h: RngHolder, maxExclusive: number) => Math.floor(nextFloat(h) * maxExclusive);

export const rollD6 = (h: RngHolder) => nextInt(h, 6) + 1;

export function shuffleInPlace<T>(h: RngHolder, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(h, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
