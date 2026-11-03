/**
 * Tablero: bosque de algas REDONDO dividido en 3×3 zonas.
 * (Topológicamente es una cuadrícula; el borde exterior se dibuja como un círculo.)
 *
 *      ╭──G──+──□──+──G──╮      Zonas (fila, columna):
 *      │  5  □  4  □  5  │        roca (5) en las «esquinas»
 *      +──□──+──□──+──□──+        algas (4) en los lados
 *      □  4  □  2  □  4  □        expuesta (2) en el centro
 *      +──□──+──□──+──□──+
 *      │  5  □  4  □  5  │      □ = casilla de corriente (borde de zona)
 *      ╰──G──+──□──+──G──╯      G = guarida: el borde exterior de cada roca es UN solo arco
 *                               + = cruce (vértice) donde el tiburón elige dirección
 *
 * Las zonas de roca no tienen otras casillas exteriores: su guarida une los dos caminos
 * laterales, así que el cruce de la esquina no existe (queda sin casillas).
 *
 * El tiburón ocupa una casilla de corriente y mira hacia uno de sus dos cruces.
 * Al moverse atraviesa ese cruce y entra en otra casilla que salga de él.
 */

export const GRID = 3;

export type ZoneKind = 'roca' | 'algas' | 'expuesta';

export interface Zone {
  id: number; // 0..8, fila * 3 + columna (también es el índice del espacio de bloque)
  row: number;
  col: number;
  kind: ZoneKind;
  value: number; // valor mínimo del dado para buscar/atacar
  adjacentZones: number[]; // adyacencia ortogonal (para comer, intercambiar…)
}

export interface Vertex {
  id: number;
  row: number; // 0..3
  col: number; // 0..3
  edges: number[]; // casillas de corriente que salen de este cruce
}

export interface CurrentSpace {
  id: number;
  orientation: 'h' | 'v' | 'arco'; // 'arco' = guarida exterior de una roca
  vertices: [number, number]; // los dos cruces en sus extremos
  zones: number[]; // 1 o 2 zonas adyacentes (donde se puede buscar/atacar)
  isLair: boolean; // guarida del tiburón
}

const ZONE_VALUES: Record<ZoneKind, number> = { roca: 5, algas: 4, expuesta: 2 };

function zoneKind(row: number, col: number): ZoneKind {
  const edgeR = row === 0 || row === GRID - 1;
  const edgeC = col === 0 || col === GRID - 1;
  if (edgeR && edgeC) return 'roca';
  if (edgeR || edgeC) return 'algas';
  return 'expuesta';
}

const zoneId = (r: number, c: number) => r * GRID + c;
const vertexId = (r: number, c: number) => r * (GRID + 1) + c;
const inGrid = (r: number, c: number) => r >= 0 && r < GRID && c >= 0 && c < GRID;

const isCornerZone = (z: number) => zoneKind(Math.floor(z / GRID), z % GRID) === 'roca';

function buildBoard() {
  const zones: Zone[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const kind = zoneKind(r, c);
      const adjacentZones = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ]
        .filter(([rr, cc]) => inGrid(rr, cc))
        .map(([rr, cc]) => zoneId(rr, cc));
      zones.push({ id: zoneId(r, c), row: r, col: c, kind, value: ZONE_VALUES[kind], adjacentZones });
    }
  }

  const vertices: Vertex[] = [];
  for (let r = 0; r <= GRID; r++) {
    for (let c = 0; c <= GRID; c++) vertices.push({ id: vertexId(r, c), row: r, col: c, edges: [] });
  }

  const currents: CurrentSpace[] = [];
  const addCurrent = (orientation: CurrentSpace['orientation'], v: [number, number], zs: number[]) => {
    // Los bordes exteriores de las rocas se sustituyen por su guarida (ver más abajo).
    if (orientation !== 'arco' && zs.length === 1 && isCornerZone(zs[0])) return;
    const id = currents.length;
    currents.push({ id, orientation, vertices: v, zones: zs, isLair: orientation === 'arco' });
    vertices[v[0]].edges.push(id);
    vertices[v[1]].edges.push(id);
  };

  // Bordes horizontales: fila de vértices i, entre columnas c y c+1.
  for (let i = 0; i <= GRID; i++) {
    for (let c = 0; c < GRID; c++) {
      const zs = [
        [i - 1, c],
        [i, c],
      ]
        .filter(([r, cc]) => inGrid(r, cc))
        .map(([r, cc]) => zoneId(r, cc));
      addCurrent('h', [vertexId(i, c), vertexId(i, c + 1)], zs);
    }
  }
  // Bordes verticales: columna de vértices j, entre filas r y r+1.
  for (let r = 0; r < GRID; r++) {
    for (let j = 0; j <= GRID; j++) {
      const zs = [
        [r, j - 1],
        [r, j],
      ]
        .filter(([rr, c]) => inGrid(rr, c))
        .map(([rr, c]) => zoneId(rr, c));
      addCurrent('v', [vertexId(r, j), vertexId(r + 1, j)], zs);
    }
  }

  // Guaridas: un arco por cada roca que une los dos cruces exteriores no esquineros.
  for (const z of zones.filter((zz) => zz.kind === 'roca')) {
    const cr = z.row === 0 ? 0 : GRID; // fila del cruce de la esquina
    const cc = z.col === 0 ? 0 : GRID;
    const alongRow = vertexId(cr, cc === 0 ? 1 : GRID - 1);
    const alongCol = vertexId(cr === 0 ? 1 : GRID - 1, cc);
    addCurrent('arco', [alongRow, alongCol], [z.id]);
  }

  return { zones, vertices, currents };
}

export const BOARD = buildBoard();

/** Guaridas del tiburón (casillas de corriente exteriores de las zonas de roca). */
export const LAIRS = BOARD.currents.filter((c) => c.isLair).map((c) => c.id);

/** El cruce de una casilla más cercano al centro del tablero (hacia donde mira el tiburón al empezar). */
export function vertexTowardCenter(currentId: number): number {
  const center = GRID / 2;
  const dist = (v: number) => {
    const { row, col } = BOARD.vertices[v];
    return Math.abs(row - center) + Math.abs(col - center);
  };
  const [a, b] = BOARD.currents[currentId].vertices;
  return dist(a) <= dist(b) ? a : b;
}

/** El otro extremo de una casilla de corriente. */
export function otherVertex(currentId: number, vertex: number): number {
  const [a, b] = BOARD.currents[currentId].vertices;
  return a === vertex ? b : a;
}

/** Casillas a las que se puede pasar atravesando `vertex`, sin dar la vuelta (no 180°). */
export function nextCurrents(fromCurrent: number, vertex: number): number[] {
  return BOARD.vertices[vertex].edges.filter((e) => e !== fromCurrent);
}
