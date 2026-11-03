import type { Block } from '../engine/types';

/**
 * Gráficos definitivos (opcionales).
 * Si existe `public/assets/<nombre>.png`, se usa en lugar del gráfico provisional (emoji o color).
 * Lista de nombres y tamaños recomendados: docs/graficos.md
 */
export const ASSET_KEYS = [
  // Bloques
  'pulpo',
  'concha',
  'conchaDoble',
  'trampa',
  'cangrejo',
  'langosta',
  'caracol',
  'abulon',
  'oculto', // dorso de los bloques ocultos
  // Tablero
  'tiburon',
  'roca',
  'algas',
  'expuesta',
  'fondo', // fondo de todo el tablero (detrás del círculo)
] as const;

export type AssetKey = (typeof ASSET_KEYS)[number];

const images: Partial<Record<AssetKey, HTMLImageElement>> = {};

export function loadAssets(onLoad: () => void) {
  if (typeof Image === 'undefined') return;
  for (const key of ASSET_KEYS) {
    const img = new Image();
    img.onload = () => {
      images[key] = img;
      onLoad();
    };
    img.src = `${import.meta.env.BASE_URL}assets/${key}.png`;
  }
}

export const asset = (key: AssetKey): HTMLImageElement | undefined => images[key];

export function blockAssetKey(b: Block): AssetKey {
  return b.kind === 'comida' ? b.food! : b.kind;
}
