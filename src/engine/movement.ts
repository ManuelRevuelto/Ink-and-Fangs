import { BOARD, nextCurrents, otherVertex } from '../data/board';
import type { GameState } from './types';

/**
 * Movimiento del tiburón.
 * - Debe moverse; normalmente a la siguiente casilla vacía.
 * - No puede girar 180° ni terminar sobre una corriente.
 * - Si entra en una corriente, nada a través de ella (y de las siguientes) hasta una casilla vacía.
 *   La primera corriente siempre se puede usar; después, cada dado debe ser menor que el anterior.
 * - Con «Rápido» puede dar 1 paso normal extra antes o después.
 */

/** Vértice compartido por dos casillas consecutivas. */
export function sharedVertex(a: number, b: number): number {
  const [a1, a2] = BOARD.currents[a].vertices;
  const vb = BOARD.currents[b].vertices;
  return vb.includes(a1) ? a1 : a2;
}

/** Recorridos normales (sin paso extra) saliendo de `from` a través de `via`. */
function normalPaths(s: GameState, from: number, via: number, origin: number): number[][] {
  const out: number[][] = [];
  const walk = (edge: number, entry: number, path: number[], lastValue: number | null) => {
    const die = s.currents[edge];
    if (!die) {
      if (edge !== origin) out.push(path);
      return;
    }
    if (lastValue !== null && die.value >= lastValue) return;
    const far = otherVertex(edge, entry);
    for (const next of nextCurrents(edge, far)) walk(next, far, [...path, next], die.value);
  };
  for (const e of nextCurrents(from, via)) walk(e, via, [e], null);
  return out;
}

/** Todos los recorridos legales del tiburón este turno. */
export function legalPaths(s: GameState): number[][] {
  const { current, facing, extraMove } = s.tiburon;
  const vias = facing === null ? [...BOARD.currents[current].vertices] : [facing];
  const result = new Map<string, number[]>();
  const add = (p: number[]) => result.set(p.join(','), p);

  for (const via of vias) {
    const base = normalPaths(s, current, via, current);
    base.forEach(add);
    if (!extraMove) continue;
    // Paso extra antes: a una casilla vacía contigua, y desde ahí movimiento normal.
    for (const e of nextCurrents(current, via)) {
      if (s.currents[e]) continue;
      for (const p of normalPaths(s, e, otherVertex(e, via), current)) add([e, ...p]);
    }
    // Paso extra después.
    for (const p of base) {
      const last = p[p.length - 1];
      const entry = p.length > 1 ? sharedVertex(p[p.length - 2], last) : via;
      for (const e of nextCurrents(last, otherVertex(last, entry))) {
        if (!s.currents[e] && e !== current) add([...p, e]);
      }
    }
  }
  return [...result.values()];
}

/** Cruce hacia el que mira el tiburón al terminar un recorrido. */
export function facingAfter(path: number[], via: number): number {
  const last = path[path.length - 1];
  const entry = path.length > 1 ? sharedVertex(path[path.length - 2], last) : via;
  return otherVertex(last, entry);
}
