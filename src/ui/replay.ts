import { facingAfter, sharedVertex } from '../engine/movement';
import type { GameEvent } from '../engine/types';
import type { Fx } from './board';

/**
 * Convierte los eventos del motor en pasos de animación (lo que hizo la máquina o el rival).
 * Cada paso dura `ms` y genera un Fx para un instante t ∈ [0, 1].
 */
export interface AnimStep {
  caption: string;
  ms: number;
  fx: (t: number) => Fx;
}

const COLORS = {
  reveal: '#ff9f43',
  hide: '#b06ad9',
  swap: '#48dbfb',
  shuffle: '#ff6bcb',
  newBlock: '#5cff8a',
  eat: '#feca57',
  current: '#54a0ff',
  search: '#ffd54a',
  attack: '#ff4d4d',
  shark: '#ff8a80',
};

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const still = (fx: Omit<Fx, 'pulse'>) => (t: number) => ({ ...fx, pulse: t * 2 });

export function stepsFor(ev: GameEvent): AnimStep[] {
  switch (ev.k) {
    case 'reveal':
      return [{ caption: `👁 Se revela${ev.zones.length > 1 ? 'n' : ''} ${n(ev.zones.length, 'bloque', 'bloques')}`, ms: 1000, fx: still({ zones: ev.zones, color: COLORS.reveal, icon: '👁' }) }];
    case 'hide':
      return [{ caption: `🙈 Se oculta${ev.zones.length > 1 ? 'n' : ''} ${n(ev.zones.length, 'bloque', 'bloques')}`, ms: 1000, fx: still({ zones: ev.zones, color: COLORS.hide, icon: '🙈' }) }];
    case 'swap':
      return [{ caption: '🔄 El pulpo intercambia estos 2 bloques', ms: 1300, fx: still({ zones: [ev.a, ev.b], link: [ev.a, ev.b], color: COLORS.swap }) }];
    case 'shuffle':
      return [{ caption: `🔀 El pulpo baraja estos ${ev.zones.length} bloques`, ms: 1400, fx: still({ zones: ev.zones, color: COLORS.shuffle, icon: '🔀' }) }];
    case 'newBlock':
      return [{ caption: '✨ Entra un bloque nuevo al tablero', ms: 1000, fx: still({ zones: [ev.zone], color: COLORS.newBlock, icon: '✨' }) }];
    case 'eat':
      return [{ caption: '🍽 ¡El pulpo se come la comida!', ms: 1300, fx: still({ zones: [ev.zone], color: COLORS.eat, icon: '🍽' }) }];
    case 'currents':
      return [{ caption: `🌊 El tiburón coloca ${n(ev.currents.length, 'corriente', 'corrientes')}`, ms: 1000, fx: still({ currents: ev.currents, color: COLORS.current }) }];
    case 'currentsRemoved':
      return [{ caption: `🌊 Se retira${ev.currents.length > 1 ? 'n' : ''} ${n(ev.currents.length, 'corriente', 'corrientes')}`, ms: 1000, fx: still({ currents: ev.currents, color: COLORS.hide }) }];
    case 'move': {
      const via = sharedVertex(ev.from, ev.path[0]);
      const start: AnimStep = {
        caption: '🦈 El tiburón nada…',
        ms: 300,
        fx: still({ shark: { current: ev.from, facing: ev.fromFacing }, trail: [ev.from], color: COLORS.shark }),
      };
      return [
        start,
        ...ev.path.map((edge, i) => ({
          caption: `🦈 El tiburón nada (${i + 1}/${ev.path.length})`,
          ms: 380,
          fx: still({
            shark: { current: edge, facing: facingAfter(ev.path.slice(0, i + 1), via) },
            trail: [ev.from, ...ev.path.slice(0, i + 1)],
            color: COLORS.shark,
          }),
        })),
      ];
    }
    case 'teleport':
      return [
        { caption: '🦈 ¡El tiburón vuelve a una guarida!', ms: 500, fx: still({ shark: { current: ev.from, facing: null }, currents: [ev.from], color: COLORS.shark }) },
        { caption: '🦈 ¡El tiburón vuelve a una guarida!', ms: 800, fx: still({ shark: { current: ev.to, facing: null }, currents: [ev.to], color: COLORS.shark }) },
      ];
    case 'search':
      return ev.mode === 'buscar'
        ? [{ caption: '🔍 El tiburón busca aquí', ms: 1100, fx: still({ zones: [ev.zone], color: COLORS.search, icon: '🔍' }) }]
        : [{ caption: '🦷 ¡El tiburón ataca aquí!', ms: 1200, fx: still({ zones: [ev.zone], color: COLORS.attack, icon: '🦷' }) }];
  }
}
