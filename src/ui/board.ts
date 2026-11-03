import { BOARD, GRID } from '../data/board';
import type { FoodId } from '../data/octopusCards';
import type { Block, Die } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';
import type { AskSpec, Pick } from './ask';

/**
 * Tablero en Canvas con gráficos PROVISIONALES (formas + emojis).
 * Para poner gráficos definitivos basta con cambiar las funciones draw* de este fichero.
 */
export const CELL = 170;
export const MARGIN = 50;
export const SIZE = GRID * CELL + MARGIN * 2;
const CUR = 30; // lado de una casilla de corriente
const BLOCK_W = 70;
const BLOCK_H = 80;

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

const px = (i: number) => MARGIN + i * CELL;

export function currentCenter(id: number): [number, number] {
  const [a, b] = BOARD.currents[id].vertices.map((v) => BOARD.vertices[v]);
  return [(px(a.col) + px(b.col)) / 2, (px(a.row) + px(b.row)) / 2];
}

const blockRect = (zone: number): [number, number] => {
  const z = BOARD.zones[zone];
  return [px(z.col) + CELL / 2 - BLOCK_W / 2, px(z.row) + CELL / 2 - BLOCK_H / 2 + 10];
};

/** Qué hay bajo el ratón: primero las casillas de corriente, luego las zonas. */
export function hitTest(x: number, y: number): Pick | null {
  for (const c of BOARD.currents) {
    const [cx, cy] = currentCenter(c.id);
    if (Math.abs(x - cx) <= CUR / 2 + 4 && Math.abs(y - cy) <= CUR / 2 + 4) return { kind: 'current', id: c.id };
  }
  for (const z of BOARD.zones) {
    if (x >= px(z.col) && x < px(z.col) + CELL && y >= px(z.row) && y < px(z.row) + CELL) return { kind: 'zone', id: z.id };
  }
  return null;
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

export function drawBoard(ctx: CanvasRenderingContext2D, v: PlayerView, spec: AskSpec | null, hover: Pick | null) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#0e3140';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sel = (arr: number[] | undefined, id: number) => !!arr?.includes(id);
  const preview = new Set(spec?.previewRevealed ?? []);

  // --- Zonas y bloques ---
  for (const z of BOARD.zones) {
    const x = px(z.col);
    const y = px(z.row);
    ctx.fillStyle = C[z.kind];
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${z.value}+`, x + 30, y + 26);
    ctx.font = '12px system-ui';
    ctx.fillText(z.kind === 'roca' ? 'Rocas' : z.kind === 'algas' ? 'Algas' : 'Expuesta', x + 30, y + 50);

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
        ctx.fillText(icon, bx + BLOCK_W / 2, by + 32);
        ctx.fillStyle = '#333';
        ctx.font = '11px system-ui';
        ctx.fillText(label, bx + BLOCK_W / 2, by + 64);
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
          ctx.fillText(blockIcon(block).icon, bx + BLOCK_W / 2, by + 32);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#9cc7d6';
          ctx.font = '11px system-ui';
          ctx.fillText('oculto', bx + BLOCK_W / 2, by + 64);
        } else {
          ctx.fillStyle = '#9cc7d6';
          ctx.font = 'bold 30px system-ui';
          ctx.fillText('?', bx + BLOCK_W / 2, by + BLOCK_H / 2);
        }
      }
    }

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
    const [a, b] = c.vertices.map((id) => BOARD.vertices[id]);
    ctx.beginPath();
    ctx.moveTo(px(a.col), px(a.row));
    ctx.lineTo(px(b.col), px(b.row));
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

  drawShark(ctx, v);
}

function drawShark(ctx: CanvasRenderingContext2D, v: PlayerView) {
  const { current, facing } = v.tiburon;
  const [cx, cy] = currentCenter(current);
  if (facing !== null) {
    const fv = BOARD.vertices[facing];
    const dx = px(fv.col) - cx;
    const dy = px(fv.row) - cy;
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
