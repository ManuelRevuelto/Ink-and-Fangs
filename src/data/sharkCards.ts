export type DieColor = 'azul' | 'amarillo' | 'rojo';

export type SharkCardKey =
  | 'agresivo'
  | 'agil'
  | 'atrevido'
  | 'hostil'
  | 'hambriento'
  | 'observador'
  | 'reactivo'
  | 'implacable'
  | 'despiadado'
  | 'rapido'
  | 'vigilante';

export interface SharkCardDef {
  id: string; // instancia única
  key: SharkCardKey;
  name: string;
  cost: number;
  dice: DieColor[];
  when: string;
  text: string;
}

type Def = Omit<SharkCardDef, 'id'>;

const DEFS: (Def & { copies?: Partial<Pick<Def, 'cost' | 'dice'>>[] })[] = [
  { key: 'agresivo', name: 'Agresivo', cost: 7, dice: ['rojo', 'rojo'], when: '—', text: 'Sin efecto: solo da dados rojos',
    copies: [{}, {}, { cost: 5, dice: ['rojo'] }] },
  { key: 'agil', name: 'Ágil', cost: 3, dice: ['azul'], when: 'Antes de moverte', text: 'Gira 180° antes de moverte', copies: [{}, {}] },
  { key: 'atrevido', name: 'Atrevido', cost: 5, dice: ['rojo'], when: 'Antes de moverte', text: 'Pasa otro dado de tu reserva al hambre y convierte un dado rojo en un 6' },
  { key: 'hostil', name: 'Hostil', cost: 8, dice: ['rojo'], when: 'Tu turno', text: 'Descarta al azar 1 carta de enfrentamiento del pulpo y su pareja' },
  { key: 'hambriento', name: 'Hambriento', cost: 4, dice: ['amarillo'], when: 'Tras tirar', text: 'Saca y tira 1 dado extra', copies: [{}, {}, {}] },
  { key: 'observador', name: 'Observador', cost: 3, dice: ['amarillo'], when: 'Al revelar una trampa', text: 'Ignora el efecto de una trampa', copies: [{}, {}] },
  { key: 'reactivo', name: 'Reactivo', cost: 3, dice: ['azul'], when: 'Antes de tirar', text: 'Devuelve 2 dados a la bolsa y elige 1 mirando dentro', copies: [{}, {}] },
  { key: 'implacable', name: 'Implacable', cost: 5, dice: ['azul', 'amarillo'], when: 'Antes de moverte', text: 'Vuelve a tirar 1 o 2 dados', copies: [{}, {}] },
  { key: 'despiadado', name: 'Despiadado', cost: 6, dice: ['rojo'], when: 'Antes de moverte', text: 'Suma a un dado el valor de otro (máx. 6); el otro vuelve a la bolsa' },
  { key: 'rapido', name: 'Rápido', cost: 2, dice: ['azul'], when: 'Al moverte', text: 'Muévete 1 casilla extra', copies: [{}, {}] },
  { key: 'vigilante', name: 'Vigilante', cost: 6, dice: ['rojo'], when: 'Tras tirar', text: 'Guarda 1 dado para usarlo en un turno posterior' },
];

export const SHARK_CARDS: SharkCardDef[] = DEFS.flatMap(({ copies, ...def }) =>
  (copies ?? [{}]).map((over, i) => ({ ...def, ...over, id: `${def.key}#${i + 1}` })),
);

export const SHARK_CARD_BY_ID: Record<string, SharkCardDef> = Object.fromEntries(SHARK_CARDS.map((c) => [c.id, c]));

/** Dados iniciales en la bolsa del tiburón y total de dados del juego. */
export const INITIAL_BAG: Record<DieColor, number> = { azul: 7, amarillo: 3, rojo: 1 };
export const TOTAL_DICE: Record<DieColor, number> = { azul: 15, amarillo: 10, rojo: 10 };

export const HUNGER_LIMIT = 7;
export const ENERGY_SLOTS = 3;
export const MARKET_SIZE = 4;
