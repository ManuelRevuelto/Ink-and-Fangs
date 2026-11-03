import { it } from 'vitest';
import { aiAct, aiErrors, BRAINS, type Brain } from '../src/ai';
import { actors, newGame, type GameState, type Role } from '../src/engine';
import { mulberry } from '../tests/simulation';

/**
 * TORNEO IA contra IA: mide el equilibrio del juego.
 * Úsalo después de cambiar cartas o reglas:   npm run torneo
 * (Para más partidas: PARTIDAS=1000 npm run torneo)
 */
const N = Number(process.env.PARTIDAS ?? 300);

function play(seed: number, brains: Record<Role, Brain | null>): GameState {
  let s = newGame({ seed });
  const r = mulberry(seed);
  for (let i = 0; i < 8000 && !s.winner; i++) s = aiAct(s, actors(s)[0], r, brains);
  return s;
}

function report(title: string, brains: Record<Role, Brain | null>) {
  aiErrors.length = 0;
  const reasons: Record<string, number> = {};
  const wins = { pulpo: 0, tiburon: 0, sinTerminar: 0 };
  let turns = 0, food = 0, hunger = 0, growth = 0, cards = 0;
  for (let seed = 1; seed <= N; seed++) {
    const s = play(seed, brains);
    if (s.winner) wins[s.winner]++;
    else wins.sinTerminar++;
    const reason = s.winReason ?? 'sin terminar';
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    turns += s.turn;
    food += s.pulpo.foodTrack.length;
    hunger += s.tiburon.hunger.length;
    growth += s.tiburon.growthFlipped.filter(Boolean).length;
    cards += s.log.filter((l) => l.startsWith('El tiburón consigue')).length;
  }
  const pct = (n: number) => `${((100 * n) / N).toFixed(1)}%`;
  console.log(`\n=== ${title} (${N} partidas) ===`);
  console.log(`  🐙 Pulpo gana:   ${pct(wins.pulpo)}`);
  console.log(`  🦈 Tiburón gana: ${pct(wins.tiburon)}`);
  if (wins.sinTerminar) console.log(`  ⏳ Sin terminar: ${pct(wins.sinTerminar)}`);
  console.log('  Cómo terminan:');
  for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`    - ${r}: ${pct(n)}`);
  console.log('  Medias por partida:');
  console.log(`    turnos ${(turns / N).toFixed(1)} · comida ${(food / N).toFixed(2)}/4 · hambre ${(hunger / N).toFixed(2)}/7` +
    ` · fichas de crecimiento ${(growth / N).toFixed(2)}/4 · cartas compradas ${(cards / N).toFixed(1)}`);
  if (aiErrors.length) console.log(`  ⚠️ Acciones ilegales propuestas por la IA: ${aiErrors.length} (ej.: ${aiErrors[0]})`);
}

it('torneo', () => {
  report('IA contra IA', BRAINS);
  report('Pulpo IA contra tiburón al azar', { pulpo: BRAINS.pulpo, tiburon: null });
  report('Tiburón IA contra pulpo al azar', { pulpo: null, tiburon: BRAINS.tiburon });
});
