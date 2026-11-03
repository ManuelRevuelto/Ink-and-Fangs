import type { GameEvent } from '../engine/types';

/**
 * Efectos de sonido PROVISIONALES generados con WebAudio (sin ficheros de audio).
 * Si más adelante quieres sonidos reales, basta con cambiar las funciones de `SOUNDS`.
 */
export type SoundName =
  | 'dice'
  | 'reveal'
  | 'hide'
  | 'swap'
  | 'shuffle'
  | 'current'
  | 'swim'
  | 'search'
  | 'attack'
  | 'eat'
  | 'newBlock'
  | 'click'
  | 'win'
  | 'lose';

const MUTE_KEY = 'inkfangs.mute';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
}

function audio(): AudioContext | null {
  if (muted || typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Un tono con envolvente (y deslizamiento opcional de frecuencia). */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; delay?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.15, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Ruido filtrado (agua, dados, remolinos). */
function noise(dur: number, opts: { freq?: number; q?: number; gain?: number; delay?: number; sweepTo?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 800, t0);
  if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur);
  filter.Q.value = opts.q ?? 1;
  const g = a.createGain();
  g.gain.setValueAtTime(opts.gain ?? 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

const SOUNDS: Record<SoundName, () => void> = {
  dice: () => [0, 0.07, 0.13, 0.22].forEach((d) => noise(0.05, { freq: 2500, q: 2, gain: 0.25, delay: d })),
  reveal: () => tone(520, 0.18, { type: 'triangle', to: 780 }),
  hide: () => tone(700, 0.2, { type: 'triangle', to: 380, gain: 0.12 }),
  swap: () => {
    tone(440, 0.12, { type: 'square', gain: 0.05 });
    tone(660, 0.12, { type: 'square', gain: 0.05, delay: 0.1 });
  },
  shuffle: () => noise(0.6, { freq: 300, sweepTo: 2000, q: 3, gain: 0.18 }),
  current: () => noise(0.45, { freq: 500, sweepTo: 200, q: 2, gain: 0.2 }),
  swim: () => noise(0.25, { freq: 400, sweepTo: 900, q: 1.5, gain: 0.12 }),
  search: () => tone(880, 0.25, { type: 'sine', to: 1320, gain: 0.1 }),
  attack: () => {
    tone(120, 0.35, { type: 'sawtooth', to: 50, gain: 0.25 });
    noise(0.2, { freq: 200, gain: 0.3 });
  },
  eat: () => [0, 0.09, 0.18].forEach((d, i) => tone(400 + i * 150, 0.1, { type: 'square', gain: 0.06, delay: d })),
  newBlock: () => tone(990, 0.3, { type: 'sine', to: 1480, gain: 0.08 }),
  click: () => tone(1200, 0.04, { type: 'square', gain: 0.03 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', delay: i * 0.12, gain: 0.15 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', delay: i * 0.15, gain: 0.07 })),
};

export function play(name: SoundName) {
  try {
    SOUNDS[name]();
  } catch {
    /* el audio nunca debe romper el juego */
  }
}

export function soundForEvent(ev: GameEvent): SoundName {
  switch (ev.k) {
    case 'reveal':
      return 'reveal';
    case 'hide':
      return 'hide';
    case 'swap':
      return 'swap';
    case 'shuffle':
      return 'shuffle';
    case 'newBlock':
      return 'newBlock';
    case 'eat':
      return 'eat';
    case 'currents':
    case 'currentsRemoved':
      return 'current';
    case 'move':
    case 'teleport':
      return 'swim';
    case 'search':
      return ev.mode === 'atacar' ? 'attack' : 'search';
    case 'roll':
      return 'dice';
  }
}
