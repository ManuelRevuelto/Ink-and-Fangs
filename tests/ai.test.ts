import { describe, expect, it } from 'vitest';
import { aiAct, aiErrors, BRAINS } from '../src/ai';
import { octopusBelief } from '../src/ai/belief';
import { actors, applyAction, newGame, viewFor, type GameState, type Role } from '../src/engine';
import { mulberry } from './simulation';

/** Partida completa entre IAs (los cerebros null juegan al azar). */
function playAI(seed: number, brains = BRAINS, maxSteps = 5000): GameState {
  let s = newGame({ seed });
  const r = mulberry(seed);
  for (let i = 0; i < maxSteps && !s.winner; i++) {
    const role: Role = actors(s)[0];
    s = aiAct(s, role, r, brains);
  }
  return s;
}

describe('deducción del tiburón', () => {
  it('al principio el pulpo puede estar en cualquiera de las 9 zonas', () => {
    const P = octopusBelief(viewFor(newGame({ seed: 1 }), 'tiburon'));
    P.forEach((p) => expect(p).toBeCloseTo(1 / 9));
  });

  it('si ve al pulpo y luego se intercambia, la certeza viaja con el bloque', () => {
    let s = newGame({ seed: 2 });
    const pz = s.spaces.findIndex((sp) => s.blocks[sp.block!].kind === 'pulpo');
    s.pulpo.hand = ['deslizarse#1', 'camuflaje#1'];
    const other = [1, 3, 5, 7].includes(pz) ? 4 : pz === 4 ? 1 : pz === 0 ? 1 : pz === 2 ? 1 : 7;
    // Paga revelando al pulpo, lo intercambia con un vecino y luego lo oculta.
    s = applyAction(s, 'pulpo', { type: 'jugar', card: 'deslizarse#1', pay: [pz], params: { swaps: [[pz, other]] } });
    s = applyAction(s, 'pulpo', { type: 'jugar', card: 'camuflaje#1', pay: [], params: { zones: [other] } });
    const P = octopusBelief(viewFor(s, 'tiburon'));
    expect(P[other]).toBeCloseTo(1);
  });

  it('barajar reparte la probabilidad entre los bloques barajados', () => {
    let s = newGame({ seed: 4 });
    s.pulpo.hand = ['remolino#1'];
    s = applyAction(s, 'pulpo', { type: 'jugar', card: 'remolino#1', pay: [0, 1], params: { zones: [2, 3] } });
    const P = octopusBelief(viewFor(s, 'tiburon'));
    const shown = [0, 1].some((z) => s.blocks[s.spaces[z].block!].kind === 'pulpo');
    if (!shown) {
      expect(P[0]).toBe(0);
      expect(P[2]).toBeCloseTo(P[3]);
    }
  });
});

describe('IAs del tiburón y del pulpo', () => {
  it('juegan partidas completas entre ellas sin proponer acciones ilegales', () => {
    aiErrors.length = 0;
    for (let seed = 1; seed <= 60; seed++) playAI(seed);
    expect(aiErrors.slice(0, 5)).toEqual([]);
  }, 120_000);

  it('gana mucho más que un tiburón aleatorio contra un pulpo aleatorio', () => {
    const N = 150;
    let smart = 0;
    let dumb = 0;
    for (let seed = 1; seed <= N; seed++) {
      if (playAI(seed, { pulpo: null, tiburon: BRAINS.tiburon }).winner === 'tiburon') smart++;
      if (playAI(seed, { tiburon: null, pulpo: null }).winner === 'tiburon') dumb++;
    }
    console.log(`Tiburón IA vs pulpo aleatorio: ${smart}/${N} · Tiburón aleatorio: ${dumb}/${N}`);
    expect(smart).toBeGreaterThan(dumb + N * 0.2);
  }, 300_000);

  it('el pulpo IA se defiende mucho mejor que un pulpo aleatorio', () => {
    const N = 120;
    let vsSmart = 0;
    let vsDumb = 0;
    for (let seed = 1; seed <= N; seed++) {
      if (playAI(seed).winner === 'tiburon') vsSmart++;
      if (playAI(seed, { pulpo: null, tiburon: BRAINS.tiburon }).winner === 'tiburon') vsDumb++;
    }
    console.log(`Tiburón IA gana contra pulpo IA: ${vsSmart}/${N} · contra pulpo aleatorio: ${vsDumb}/${N}`);
    expect(vsSmart).toBeLessThan(vsDumb - N * 0.15);
  }, 300_000);
});

describe('niveles de dificultad', () => {
  it('el tiburón gana más cuanto más difícil es (contra el pulpo Normal)', async () => {
    const { brainsFor } = await import('../src/ai/difficulty');
    const N = 100;
    const rate = (level: 'facil' | 'normal' | 'dificil') => {
      const brains = { tiburon: brainsFor(level).tiburon, pulpo: brainsFor('normal').pulpo };
      let w = 0;
      for (let seed = 500; seed < 500 + N; seed++) if (playAI(seed, brains).winner === 'tiburon') w++;
      return w;
    };
    const [f, n, d] = [rate('facil'), rate('normal'), rate('dificil')];
    console.log(`Tiburón vs pulpo Normal — Fácil ${f}/${N} · Normal ${n}/${N} · Difícil ${d}/${N}`);
    expect(f).toBeLessThan(n);
    expect(d).toBeGreaterThan(n);
  }, 600_000);
});

describe('juego limpio de la IA', () => {
  it('el tiburón no hace trampa: mover al pulpo a escondidas no cambia lo que ve ni lo que decide', async () => {
    const { sharkDecide } = await import('../src/ai/sharkAI');
    const { octopusZone } = await import('../src/engine/helpers');
    let checks = 0;
    for (let seed = 1; seed <= 25; seed++) {
      let s = newGame({ seed });
      const r = mulberry(seed);
      for (let i = 0; i < 4000 && !s.winner; i++) {
        const role: Role = actors(s)[0];
        const pz = octopusZone(s);
        if (role === 'tiburon' && !s.pending && !s.spaces[pz].revealed) {
          for (let z = 0; z < 9; z++) {
            if (z === pz || !s.spaces[z].block || s.spaces[z].revealed) continue;
            const alt: GameState = structuredClone(s);
            [alt.spaces[pz], alt.spaces[z]] = [alt.spaces[z], alt.spaces[pz]];
            const v1 = viewFor(s, 'tiburon');
            const v2 = viewFor(alt, 'tiburon');
            expect(JSON.stringify(v2)).toBe(JSON.stringify(v1));
            expect(sharkDecide(v2)).toEqual(sharkDecide(v1));
            checks++;
          }
        }
        s = aiAct(s, role, r);
      }
    }
    expect(checks).toBeGreaterThan(1000);
  }, 300_000);
});
