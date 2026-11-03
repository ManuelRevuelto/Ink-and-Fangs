import { HIDDEN, type PlayerView } from '../engine/view';

/**
 * Deducción del tiburón: probabilidad de que el pulpo esté en cada zona.
 *
 * Se reconstruye desde cero con el historial de eventos públicos (lo mismo que vería un jugador
 * con buena memoria) y se contrasta con lo que hay revelado ahora mismo:
 * - Revelar un bloque que no es el pulpo → esa zona pasa a 0.
 * - Ver al pulpo → toda la probabilidad en esa zona.
 * - Intercambio → las probabilidades viajan con los bloques.
 * - Barajar → la probabilidad total de esas zonas se reparte por igual entre ellas.
 * - Bloque nuevo o concha tras comer → esa zona pasa a 0 (nunca es el pulpo).
 */
export function octopusBelief(v: PlayerView, memory = Infinity): number[] {
  let w = Array(9).fill(1);
  const onlyAt = (z: number) => (w = w.map((_, i) => (i === z ? 1 : 0)));

  // Con memoria limitada (nivel Fácil) solo se recuerdan los últimos eventos.
  const events = Number.isFinite(memory) ? v.events.slice(-memory) : v.events;
  for (const ev of events) {
    switch (ev.k) {
      case 'reveal':
        if (ev.octo !== undefined) onlyAt(ev.octo);
        else ev.zones.forEach((z) => (w[z] = 0));
        break;
      case 'search':
        if (ev.octo) onlyAt(ev.zone);
        else w[ev.zone] = 0;
        break;
      case 'swap':
        [w[ev.a], w[ev.b]] = [w[ev.b], w[ev.a]];
        break;
      case 'shuffle': {
        const total = ev.zones.reduce((n, z) => n + w[z], 0);
        ev.zones.forEach((z) => (w[z] = total / ev.zones.length));
        break;
      }
      case 'newBlock':
      case 'eat':
        w[ev.zone] = 0;
        break;
    }
    w = normalize(w);
  }

  // Contraste con lo que se ve ahora mismo.
  v.spaces.forEach((sp, z) => {
    if (!sp.block || !sp.revealed || sp.block === HIDDEN) return;
    if (v.blocks[sp.block]?.kind === 'pulpo') onlyAt(z);
    else w[z] = 0;
  });
  w = normalize(w);
  if (w.every((x) => x === 0)) {
    // Algo no cuadra (no debería pasar): reparto uniforme entre los ocultos.
    w = v.spaces.map((sp) => (sp.block && !sp.revealed ? 1 : 0));
    w = normalize(w);
  }
  return w;
}

function normalize(w: number[]): number[] {
  const total = w.reduce((a, b) => a + b, 0);
  return total > 0 ? w.map((x) => x / total) : w;
}
