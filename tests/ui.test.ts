// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { currentSpec, offer, type Pick } from '../src/ui/ask';
import { mulberry } from './simulation';

/**
 * Prueba de humo de la interfaz: monta la página en un DOM simulado y juega en modo
 * 2 jugadores pulsando opciones permitidas al azar, como haría una persona.
 */

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeAll(() => {
  const html = readFileSync('index.html', 'utf-8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script'));
  // jsdom no tiene Canvas: un contexto falso que acepta cualquier llamada.
  const noop = new Proxy(() => {}, { get: () => noop, apply: () => undefined, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => noop) as never;
  HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 610, height: 610 }) as DOMRect;
});

function options(r: () => number): Pick | null {
  const s = currentSpec();
  if (!s) return null;
  const all: Pick[] = [
    ...(s.zones ?? []).map((id) => ({ kind: 'zone', id }) as Pick),
    ...(s.currents ?? []).map((id) => ({ kind: 'current', id }) as Pick),
    ...(s.dice ?? []).map((id) => ({ kind: 'die', id }) as Pick),
    ...(s.cards ?? []).map((id) => ({ kind: 'card', id }) as Pick),
    ...(s.market ?? []).map((slot) => ({ kind: 'market', slot }) as Pick),
    ...(s.piles ?? []).map((pile) => ({ kind: 'pile', pile }) as Pick),
    ...(s.supply ?? []).map((id) => ({ kind: 'supply', id }) as Pick),
    ...(s.foods ?? []).map((food) => ({ kind: 'food', food }) as Pick),
    ...(s.buttons ?? []).map((b) => ({ kind: 'button', value: b.value }) as Pick),
  ];
  // Favorece avanzar: el botón principal a menudo, cancelar casi nunca.
  const primary = s.buttons?.find((b) => b.primary);
  if (primary && r() < 0.35) return { kind: 'button', value: primary.value };
  const pool = all.filter((p) => !(p.kind === 'button' && p.value === '__cancel') || r() < 0.05);
  return pool.length ? pool[Math.floor(r() * pool.length)] : null;
}

describe('interfaz', () => {
  it('se puede jugar una partida a 2 jugadores pulsando opciones', async () => {
    const { initApp, setAnimationSpeed } = await import('../src/ui/app');
    setAnimationSpeed(0);
    initApp();
    await flush();
    const r = mulberry(7);
    const overlay = document.getElementById('overlay')!;

    let steps = 0;
    for (; steps < 3000; steps++) {
      await flush();
      if (!overlay.classList.contains('hidden')) {
        const text = overlay.textContent ?? '';
        if (/¡Gana/.test(text)) break;
        const btn = overlay.querySelector<HTMLButtonElement>('button[data-value="local"], button[data-value="ok"]');
        btn?.click();
        continue;
      }
      const p = options(r);
      if (p) offer(p);
    }
    await flush();
    const log = document.getElementById('log')!.textContent ?? '';
    const won = /¡Gana/.test(overlay.textContent ?? '');
    console.log(`UI: ${steps} pasos, ${won ? 'partida terminada' : 'partida en curso'}`);
    expect(log).toMatch(/Turno \d+: juega el pulpo/);
    expect(document.getElementById('pulpo-panel')!.innerHTML).toContain('Pulpo');
  }, 60_000);
});
