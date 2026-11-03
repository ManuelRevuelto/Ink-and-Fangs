/** Fichas de crecimiento del tiburón: 3 dados cada una, se activan de izquierda a derecha. */
export interface GrowthTileDef {
  name: string;
  text: string;
  rerolls: number; // repeticiones de tirada extra por turno
  extraDraw: number; // dados extra al robar
}

export const GROWTH_TILES: GrowthTileDef[] = [
  { name: 'Instinto', text: 'Una vez por turno, puedes volver a tirar 1 dado', rerolls: 1, extraDraw: 0 },
  { name: 'Voracidad', text: 'Robas 3 dados en lugar de 2', rerolls: 0, extraDraw: 1 },
  { name: 'Olfato', text: 'Una repetición de tirada más por turno', rerolls: 1, extraDraw: 0 },
  { name: 'Depredador', text: 'Robas 4 dados en lugar de 3', rerolls: 0, extraDraw: 1 },
];

export const DICE_PER_TILE = 3;
export const BASE_DRAW = 2;
