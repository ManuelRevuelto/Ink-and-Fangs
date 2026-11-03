import { BOARD, GRID } from '../data/board';
import type { FoodId } from '../data/octopusCards';
import type { Block, Die } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';
import type { AskSpec, Pick } from './ask';

/**
 * Tablero en Canvas con gráficos PROVISIONALES (formas + emojis).
 * Para poner gráficos definitivos basta con cambiar las funciones draw* de este fichero.
 */
export const SIZE = 640;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 285; // radio del tablero
const H = 98; // mitad del lado de la zona expuesta (centro)
const CUR = 30; // lado de una casilla de corriente
const BLOCK_W = 64;
const BLOCK_H = 72;

const C = {
  roca: '#4d5560',
  algas: '#2d6e4a',
  expuesta: '#3c93b0',
  line: '#a9d6e5',
  current: '#1d4e89',
  lair: '#8e2b2b',
  blockBack: '#183a4a',
  blockFace: '#efe3c6',
  highlight: '#ffd54a',
  selected: '#5cff8a',
  dieBlue: '#2f80ed',
  dieYellow: '#f2c94c',
  dieRed: '#eb5757',
};

export const FOOD_ICON: Record<FoodId, string> = { cangrejo: '🦀', langosta: '🦞', caracol: '🐌', abulon: '🦪' };
const TRAP_LABEL = { ocultar2: 'Ocultar 2', quitar1: '−1 corriente', quitar2: '−2 corrientes', guarida: '→ guarida' } as const;

export function blockIcon(b: Block): { icon: string; label: string } {
  switch (b.kind) {
    case 'pulpo':
      return { icon: '🐙', label: 'Pulpo' };
    case 'concha':
      return { icon: '🐚', label: 'Concha' };
    case 'conchaDoble':
      return { icon: '🐚🐚', label: 'Doble' };
    case 'trampa':
      return { icon: '🪤', label: TRAP_LABEL[b.trap!] };
    case 'comida':
      return { icon: FOOD_ICON[b.food!], label: 'Comida' };
  }
}

export const dieColor = (d: { color: Die['color'] }) =>
  d.color === 'azul' ? C.dieBlue : d.color === 'amarillo' ? C.dieYellow : C.dieRed;

// ---------------- Geometría del tablero redondo ----------------
// La lógica sigue siendo una cuadrícula 3×3; aquí solo cambia dónde se dibuja cada cruce:
// los 4 cruces interiores forman el cuadrado central y los 12 exteriores van sobre el círculo.

const isOuterVertex = (row: number, col: number) => row === 0 || col === 0 || row === GRID || col === GRID;

const VERTEX_POS: [number, number][] = BOARD.vertices.map(({ row, col }) => {
  const u = col - GRID / 2; // -1.5, -0.5, 0.5, 1.5
  const w = row - GRID / 2;
  if (!isOuterVertex(row, col)) return [CX + u * 2 * H, CY + w * 2 * H];
  if (Math.abs(u) === Math.abs(w)) return [CX + (Math.sign(u) * R) / Math.SQRT2, CY + (Math.sign(w) * R) / Math.SQRT2];
  const side = Math.sqrt(R * R - H * H);
  return Math.abs(w) > Math.abs(u) ? [CX + u * 2 * H, CY + Math.sign(w) * side] : [CX + Math.sign(u) * side, CY + w * 2 * H];
});

const vertexPos = (id: number) => VERTEX_POS[id];
const angleOf = ([x, y]: [number, number]) => Math.atan2(y - CY, x - CX);

/** Ángulos de inicio/fin del arco exterior más corto entre dos cruces del círculo. */
function arcAngles(a: number, b: number): [number, number, boolean] {
  const a1 = angleOf(vertexPos(a));
  let a2 = angleOf(vertexPos(b));
  while (a2 - a1 > Math.PI) a2 -= 2 * Math.PI;
  while (a2 - a1 < -Math.PI) a2 += 2 * Math.PI;
  return [a1, a2, a2 < a1];
}

const isOuterEdge = (id: number) => BOARD.currents[id].zones.length === 1;

export function currentCenter(id: number): [number, number] {
  const [a, b] = BOARD.currents[id].vertices;
  if (isOuterEdge(id)) {
    const [a1, a2] = arcAngles(a, b);
    const m = (a1 + a2) / 2;
    return [CX + R * Math.cos(m), CY + R * Math.sin(m)];
  }
  const [pa, pb] = [vertexPos(a), vertexPos(b)];
  return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
}

/** Cruces de una zona en orden (sentido horario). */
function zoneVertices(zone: number): number[] {
  const { row, col } = BOARD.zones[zone];
  const v = (r: number, c: number) => r * (GRID + 1) + c;
  // El cruce de la esquina de las rocas no existe (su borde exterior es un solo arco-guarida).
  return [v(row, col), v(row, col + 1), v(row + 1, col + 1), v(row + 1, col)].filter((id) => BOARD.vertices[id].edges.length > 0);
}

const edgeBetween = (a: number, b: number) =>
  BOARD.currents.find((c) => c.vertices.includes(a) && c.vertices.includes(b))!.id;

/** Contorno de la zona como puntos (los arcos exteriores se muestrean). */
function zoneOutline(zone: number): [number, number][] {
  const vs = zoneVertices(zone);
  const pts: [number, number][] = [];
  vs.forEach((a, i) => {
    const b = vs[(i + 1) % vs.length];
    pts.push(vertexPos(a));
    if (isOuterEdge(edgeBetween(a, b))) {
      const [a1, a2] = arcAngles(a, b);
      for (let k = 1; k < 12; k++) {
        const ang = a1 + ((a2 - a1) * k) / 12;
        pts.push([CX + R * Math.cos(ang), CY + R * Math.sin(ang)]);
      }
    }
  });
  return pts;
}

const ZONE_OUTLINES = BOARD.zones.map((z) => zoneOutline(z.id));

/** Dónde va el bloque de cada zona (centro de la zona, un poco hacia dentro en las rocas). */
const BLOCK_CENTER: [number, number][] = BOARD.zones.map((z) => {
  const vs = zoneVertices(z.id).map(vertexPos);
  const mx = vs.reduce((n, p) => n + p[0], 0) / vs.length;
  const my = vs.reduce((n, p) => n + p[1], 0) / vs.length;
  const k = z.kind === 'roca' ? 0.9 : 1;
  return [CX + (mx - CX) * k, CY + (my - CY) * k];
});

const blockRect = (zone: number): [number, number] => {
  const [x, y] = BLOCK_CENTER[zone];
  return [x - BLOCK_W / 2, y - BLOCK_H / 2];
};

function pointInPolygon(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Qué hay bajo el ratón: primero las casillas de corriente, luego las zonas. */
export function hitTest(x: number, y: number): Pick | null {
  for (const c of BOARD.currents) {
    const [cx, cy] = currentCenter(c.id);
    if (Math.abs(x - cx) <= CUR / 2 + 4 && Math.abs(y - cy) <= CUR / 2 + 4) return { kind: 'current', id: c.id };
  }
  for (const z of BOARD.zones) {
    if (pointInPolygon(x, y, ZONE_OUTLINES[z.id])) return { kind: 'zone', id: z.id };
  }
  return null;
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawDie(ctx: CanvasRenderingContext2D, d: Die, cx: number, cy: number, size: number) {
  ctx.fillStyle = dieColor(d);
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 5);
  ctx.fill();
  ctx.fillStyle = d.color === 'amarillo' ? '#222' : '#fff';
  ctx.font = `bold ${Math.round(size * 0.6)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(d.value), cx, cy + 1);
}

/** Capa de efectos para animar lo que acaba de pasar (turno de la máquina o del rival). */
export interface Fx {
  zones?: number[];
  currents?: number[];
  color: string;
  icon?: string;
  link?: [number, number]; // flecha doble entre dos zonas (intercambio)
  trail?: number[]; // casillas recorridas por el tiburón
  shark?: { current: number; facing: number | null };
  pulse: number; // 0..1 para el parpadeo
}

const zoneCenter = (zone: number): [number, number] => {
  const [bx, by] = blockRect(zone);
  return [bx + BLOCK_W / 2, by + BLOCK_H / 2];
};

function drawFx(ctx: CanvasRenderingContext2D, fx: Fx) {
  const alpha = 0.55 + 0.45 * Math.sin(fx.pulse * Math.PI * 2);
  ctx.save();
  ctx.globalAlpha = Math.max(0.3, alpha);
  ctx.strokeStyle = fx.color;
  ctx.shadowColor = fx.color;
  ctx.shadowBlur = 18;
  for (const t of fx.trail ?? []) {
    const [cx, cy] = currentCenter(t);
    ctx.lineWidth = 4;
    roundRect(ctx, cx - CUR / 2 - 6, cy - CUR / 2 - 6, CUR + 12, CUR + 12, 8);
    ctx.stroke();
  }
  for (const z of fx.zones ?? []) {
    const [bx, by] = blockRect(z);
    ctx.lineWidth = 7;
    roundRect(ctx, bx - 9, by - 9, BLOCK_W + 18, BLOCK_H + 18, 12);
    ctx.stroke();
  }
  for (const c of fx.currents ?? []) {
    const [cx, cy] = currentCenter(c);
    ctx.lineWidth = 6;
    roundRect(ctx, cx - CUR / 2 - 8, cy - CUR / 2 - 8, CUR + 16, CUR + 16, 8);
    ctx.stroke();
  }
  if (fx.link) {
    const [x1, y1] = zoneCenter(fx.link[0]);
    const [x2, y2] = zoneCenter(fx.link[1]);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    for (const [ax, ay, bx2, by2] of [[x1, y1, x2, y2], [x2, y2, x1, y1]]) {
      const ang = Math.atan2(by2 - ay, bx2 - ax);
      ctx.beginPath();
      ctx.moveTo(bx2, by2);
      ctx.lineTo(bx2 - 18 * Math.cos(ang - 0.45), by2 - 18 * Math.sin(ang - 0.45));
      ctx.lineTo(bx2 - 18 * Math.cos(ang + 0.45), by2 - 18 * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fillStyle = fx.color;
      ctx.fill();
    }
  }
  ctx.restore();
  if (fx.icon) {
    ctx.font = '26px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const z of fx.zones ?? []) {
      const [bx, by] = blockRect(z);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(bx + BLOCK_W / 2, by + BLOCK_H / 2, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(fx.icon, bx + BLOCK_W / 2, by + BLOCK_H / 2 + 1);
    }
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, v: PlayerView, spec: AskSpec | null, hover: Pick | null, fx: Fx | null = null) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#0b2733';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Halo de agua alrededor del bosque de algas
  ctx.beginPath();
  ctx.arc(CX, CY, R + 22, 0, Math.PI * 2);
  ctx.fillStyle = '#0e3a4d';
  ctx.fill();

  const sel = (arr: number[] | undefined, id: number) => !!arr?.includes(id);
  const preview = new Set(spec?.previewRevealed ?? []);

  // --- Zonas y bloques ---
  for (const z of BOARD.zones) {
    tracePolygon(ctx, ZONE_OUTLINES[z.id]);
    ctx.fillStyle = C[z.kind];
    ctx.fill();

    const sp = v.spaces[z.id];
    const [bx, by] = blockRect(z.id);
    if (sp.block) {
      const revealed = sp.revealed || preview.has(z.id);
      const block = sp.block !== HIDDEN ? v.blocks[sp.block] : null;
      if (revealed && block) {
        ctx.fillStyle = C.blockFace;
        roundRect(ctx, bx, by, BLOCK_W, BLOCK_H, 8);
        ctx.fill();
        const { icon, label } = blockIcon(block);
        ctx.font = '30px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, bx + BLOCK_W / 2, by + 29);
        ctx.fillStyle = '#333';
        ctx.font = '11px system-ui';
        ctx.fillText(label, bx + BLOCK_W / 2, by + 58);
      } else {
        ctx.fillStyle = C.blockBack;
        roundRect(ctx, bx, by, BLOCK_W, BLOCK_H, 8);
        ctx.fill();
        ctx.strokeStyle = '#4b8aa3';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (block) {
          // El pulpo ve qué hay debajo, en tenue.
          ctx.globalAlpha = 0.55;
          ctx.font = '26px system-ui';
          ctx.fillText(blockIcon(block).icon, bx + BLOCK_W / 2, by + 29);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#9cc7d6';
          ctx.font = '11px system-ui';
          ctx.fillText('oculto', bx + BLOCK_W / 2, by + 58);
        } else {
          ctx.fillStyle = '#9cc7d6';
          ctx.font = 'bold 30px system-ui';
          ctx.fillText('?', bx + BLOCK_W / 2, by + BLOCK_H / 2);
        }
      }
    }

    // Valor de visibilidad de la zona: en la esquina del bloque que mira hacia fuera del tablero
    const [ox, oy] = BLOCK_CENTER[z.id];
    const sx = Math.abs(ox - CX) < 1 ? 0 : Math.sign(ox - CX);
    // En las rocas va al lateral, para no tapar la guarida de la diagonal.
    const sy = Math.abs(oy - CY) < 1 || z.kind === 'roca' ? 0 : Math.sign(oy - CY);
    const badgeX = sx === 0 && sy === 0 ? bx - 4 : sx < 0 ? bx - 4 : sx > 0 ? bx + BLOCK_W + 4 : bx + BLOCK_W / 2;
    const badgeY = sx === 0 && sy === 0 ? by - 4 : sy < 0 ? by - 4 : sy > 0 ? by + BLOCK_H + 4 : by + BLOCK_H / 2;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${z.value}+`, badgeX, badgeY + 1);

    // Resaltados
    const selectable = sel(spec?.zones, z.id);
    if (selectable || sel(spec?.selectedZones, z.id)) {
      ctx.strokeStyle = sel(spec?.selectedZones, z.id) ? C.selected : C.highlight;
      ctx.lineWidth = hover?.kind === 'zone' && hover.id === z.id && selectable ? 6 : 4;
      roundRect(ctx, bx - 6, by - 6, BLOCK_W + 12, BLOCK_H + 12, 10);
      ctx.stroke();
    }
    const tz = spec?.tentativeZones?.find((t) => t.zone === z.id);
    if (tz) {
      const d = v.tiburon.pool.find((p) => p.id === tz.die);
      if (d) drawDie(ctx, d, bx + BLOCK_W, by, 26);
    }
  }

  // --- Rutas y casillas de corriente ---
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  for (const c of BOARD.currents) {
    const [a, b] = c.vertices;
    ctx.beginPath();
    if (isOuterEdge(c.id)) {
      const [a1, a2, ccw] = arcAngles(a, b);
      ctx.arc(CX, CY, R, a1, a2, ccw);
    } else {
      ctx.moveTo(...vertexPos(a));
      ctx.lineTo(...vertexPos(b));
    }
    ctx.stroke();
  }
  for (const c of BOARD.currents) {
    const [cx, cy] = currentCenter(c.id);
    ctx.fillStyle = c.isLair ? C.lair : C.current;
    roundRect(ctx, cx - CUR / 2, cy - CUR / 2, CUR, CUR, 4);
    ctx.fill();
    ctx.strokeStyle = '#cfe8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const die = v.currents[c.id];
    const tentative = spec?.tentativeCurrents?.find((t) => t.current === c.id);
    const tDie = tentative && v.tiburon.pool.find((d) => d.id === tentative.die);
    if (die) drawDie(ctx, die, cx, cy, CUR - 4);
    else if (tDie) {
      ctx.globalAlpha = 0.7;
      drawDie(ctx, tDie, cx, cy, CUR - 4);
      ctx.globalAlpha = 1;
    }
    const selectable = sel(spec?.currents, c.id);
    if (selectable || sel(spec?.selectedCurrents, c.id)) {
      ctx.strokeStyle = sel(spec?.selectedCurrents, c.id) ? C.selected : C.highlight;
      ctx.lineWidth = hover?.kind === 'current' && hover.id === c.id && selectable ? 5 : 3;
      roundRect(ctx, cx - CUR / 2 - 5, cy - CUR / 2 - 5, CUR + 10, CUR + 10, 6);
      ctx.stroke();
    }
  }

  if (fx) drawFx(ctx, fx);
  drawShark(ctx, fx?.shark ?? v.tiburon);
}

function drawShark(ctx: CanvasRenderingContext2D, pos: { current: number; facing: number | null }) {
  const { current, facing } = pos;
  const [cx, cy] = currentCenter(current);
  if (facing !== null) {
    const [fx, fy] = vertexPos(facing);
    const dx = fx - cx;
    const dy = fy - cy;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    ctx.strokeStyle = '#ff8a80';
    ctx.fillStyle = '#ff8a80';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + ux * 18, cy + uy * 18);
    ctx.lineTo(cx + ux * 42, cy + uy * 42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + ux * 50, cy + uy * 50);
    ctx.lineTo(cx + ux * 38 - uy * 8, cy + uy * 38 + ux * 8);
    ctx.lineTo(cx + ux * 38 + uy * 8, cy + uy * 38 - ux * 8);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.font = '26px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🦈', cx, cy + 1);
}
