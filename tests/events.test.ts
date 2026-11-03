import { describe, expect, it } from 'vitest';
import { applyAction, newGame } from '../src/engine';
import { stepsFor } from '../src/ui/replay';
import { playRandomGame } from './simulation';

describe('eventos visuales', () => {
  it('pagar y barajar generan eventos de revelar y barajar', () => {
    const s = newGame({ seed: 3 });
    s.pulpo.hand = ['remolino#1'];
    const after = applyAction(s, 'pulpo', { type: 'jugar', card: 'remolino#1', pay: [0, 1], params: { zones: [2, 3] } });
    expect(after.events).toEqual([
      { k: 'reveal', zones: [0, 1] },
      { k: 'shuffle', zones: [2, 3] },
    ]);
  });

  it('el intercambio indica las dos zonas', () => {
    const s = newGame({ seed: 3 });
    s.pulpo.hand = ['deslizarse#1'];
    const after = applyAction(s, 'pulpo', { type: 'jugar', card: 'deslizarse#1', pay: [4], params: { swaps: [[0, 1]] } });
    expect(after.events.at(-1)).toEqual({ k: 'swap', a: 0, b: 1 });
  });

  it('todos los eventos de partidas reales se pueden animar y no revelan qué bloque es', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = playRandomGame(newGame({ seed }), seed);
      for (const ev of state.events) {
        kinds.add(ev.k);
        expect(JSON.stringify(ev)).not.toMatch(/pulpo|trampa|comida|concha|"b\d+"/);
        const steps = stepsFor(ev);
        expect(steps.length).toBeGreaterThan(0);
        steps.forEach((st) => st.fx(0.5));
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  }, 60_000);
});
