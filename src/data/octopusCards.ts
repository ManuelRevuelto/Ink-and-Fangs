import type { ZoneKind } from './board';

export type FoodId = 'cangrejo' | 'langosta' | 'caracol' | 'abulon';
export type OctoPile = 'aprender' | 'comer' | 'ocultar' | 'moverse';

export type OctoEffect =
  | { kind: 'learn'; n: number; toHand?: boolean }
  | { kind: 'swap'; n: number; anyDistance?: boolean; hiddenOnly?: boolean }
  | { kind: 'shuffle'; n: number; includeExposed?: boolean }
  | { kind: 'hide'; n: number; draw?: number }
  | { kind: 'hideZoneKind'; zoneKind: ZoneKind }
  | { kind: 'eat'; food: FoodId };

export interface OctoCardDef {
  key: string;
  name: string;
  pile: OctoPile; // tipo/color de la carta
  cost: number;
  starter: boolean; // símbolo de alga
  copies: number;
  effect: OctoEffect;
  text: string;
}

export const FOOD_NAMES: Record<FoodId, string> = {
  cangrejo: 'Cangrejo de roca roja',
  langosta: 'Langosta',
  caracol: 'Caracol marino',
  abulon: 'Abulón',
};

export const OCTO_CARDS: OctoCardDef[] = [
  // ---- Iniciales ----
  { key: 'aprendizaje-rapido', name: 'Aprendizaje rápido', pile: 'aprender', cost: 1, starter: true, copies: 1, effect: { kind: 'learn', n: 1 }, text: 'Aprender 1' },
  { key: 'observar', name: 'Observar', pile: 'aprender', cost: 1, starter: true, copies: 1, effect: { kind: 'learn', n: 1 }, text: 'Aprender 1' },
  { key: 'deslizarse', name: 'Deslizarse', pile: 'moverse', cost: 1, starter: true, copies: 2, effect: { kind: 'swap', n: 1 }, text: 'Intercambiar 2 bloques adyacentes' },
  { key: 'remolino', name: 'Remolino', pile: 'moverse', cost: 2, starter: true, copies: 1, effect: { kind: 'shuffle', n: 2 }, text: 'Barajar 2 bloques ocultos' },
  { key: 'camuflaje', name: 'Camuflaje', pile: 'ocultar', cost: 0, starter: true, copies: 2, effect: { kind: 'hide', n: 1 }, text: 'Ocultar 1 bloque' },

  // ---- Comer ----
  { key: 'comer-cangrejo', name: 'Comer cangrejo', pile: 'comer', cost: 0, starter: false, copies: 1, effect: { kind: 'eat', food: 'cangrejo' }, text: 'Comer el cangrejo de roca roja' },
  { key: 'comer-langosta', name: 'Comer langosta', pile: 'comer', cost: 0, starter: false, copies: 1, effect: { kind: 'eat', food: 'langosta' }, text: 'Comer la langosta' },
  { key: 'comer-caracol', name: 'Comer caracol', pile: 'comer', cost: 0, starter: false, copies: 1, effect: { kind: 'eat', food: 'caracol' }, text: 'Comer el caracol marino' },
  { key: 'comer-abulon', name: 'Comer abulón', pile: 'comer', cost: 0, starter: false, copies: 1, effect: { kind: 'eat', food: 'abulon' }, text: 'Comer el abulón' },

  // ---- Aprender ----
  { key: 'sentidos-agudos', name: 'Sentidos agudos', pile: 'aprender', cost: 2, starter: false, copies: 1, effect: { kind: 'learn', n: 2, toHand: true }, text: 'Aprender 2. Las cartas van a la mano (las de Comer no)' },
  { key: 'memoria-tentaculo', name: 'Memoria de tentáculo', pile: 'aprender', cost: 2, starter: false, copies: 1, effect: { kind: 'learn', n: 2 }, text: 'Aprender 2' },
  { key: 'genio-arrecife', name: 'Genio del arrecife', pile: 'aprender', cost: 3, starter: false, copies: 1, effect: { kind: 'learn', n: 3 }, text: 'Aprender 3' },

  // ---- Esconderse ----
  { key: 'mimetismo', name: 'Mimetismo', pile: 'ocultar', cost: 0, starter: false, copies: 1, effect: { kind: 'hide', n: 2 }, text: 'Ocultar 2 bloques' },
  { key: 'cambio-color', name: 'Cambio de color', pile: 'ocultar', cost: 0, starter: false, copies: 1, effect: { kind: 'hide', n: 1, draw: 1 }, text: 'Ocultar 1 bloque y robar 1 carta' },
  { key: 'sombra-algas', name: 'Sombra de las algas', pile: 'ocultar', cost: 0, starter: false, copies: 1, effect: { kind: 'hideZoneKind', zoneKind: 'algas' }, text: 'Ocultar todos los bloques de las zonas de algas' },

  // ---- Moverse ----
  { key: 'arriesgarse', name: 'Arriesgarse', pile: 'moverse', cost: 1, starter: false, copies: 1, effect: { kind: 'shuffle', n: 2, includeExposed: true }, text: 'Barajar el bloque de la zona expuesta y 1 bloque oculto más' },
  { key: 'nube-tinta', name: 'Nube de tinta', pile: 'moverse', cost: 2, starter: false, copies: 1, effect: { kind: 'shuffle', n: 3 }, text: 'Barajar 3 bloques ocultos' },
  { key: 'evasion-repentina', name: 'Evasión repentina', pile: 'moverse', cost: 2, starter: false, copies: 1, effect: { kind: 'swap', n: 2 }, text: 'Hacer 2 intercambios (se puede repetir bloque)' },
  { key: 'huida-rocas', name: 'Huida a las rocas', pile: 'moverse', cost: 3, starter: false, copies: 1, effect: { kind: 'swap', n: 1, anyDistance: true, hiddenOnly: true }, text: 'Intercambiar 2 bloques ocultos cualesquiera' },
];

export const OCTO_CARD_BY_KEY: Record<string, OctoCardDef> = Object.fromEntries(OCTO_CARDS.map((c) => [c.key, c]));

/** Las instancias de carta se identifican como "clave#n". */
export const cardKey = (instanceId: string) => instanceId.split('#')[0];
export const octoCard = (instanceId: string) => OCTO_CARD_BY_KEY[cardKey(instanceId)];

export function expandOctoCards(filter: (c: OctoCardDef) => boolean): string[] {
  return OCTO_CARDS.filter(filter).flatMap((c) => Array.from({ length: c.copies }, (_, i) => `${c.key}#${i + 1}`));
}
