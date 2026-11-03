import { BOARD, GRID } from './data/board';

// Vista provisional del tablero (Fase 0). Se sustituirá por src/ui en la Fase 3.
const CELL = 160;
const MARGIN = 40;
const SIZE = GRID * CELL + MARGIN * 2;

const ZONE_COLORS = { roca: '#5b5f66', algas: '#2f7a4f', expuesta: '#3fa7c9' } as const;

const canvas = document.getElementById('board') as HTMLCanvasElement;
canvas.width = SIZE;
canvas.height = SIZE;
const ctx = canvas.getContext('2d')!;

const vx = (col: number) => MARGIN + col * CELL;

for (const z of BOARD.zones) {
  ctx.fillStyle = ZONE_COLORS[z.kind];
  ctx.fillRect(vx(z.col), vx(z.row), CELL, CELL);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 28px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${z.value}+`, vx(z.col) + CELL / 2, vx(z.row) + 28);
  // hueco del bloque
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(vx(z.col) + CELL / 2 - 22, vx(z.row) + CELL / 2 - 12, 44, 56);
}

ctx.strokeStyle = '#cfe8f0';
ctx.lineWidth = 2;
for (const c of BOARD.currents) {
  const [a, b] = c.vertices.map((v) => BOARD.vertices[v]);
  ctx.beginPath();
  ctx.moveTo(vx(a.col), vx(a.row));
  ctx.lineTo(vx(b.col), vx(b.row));
  ctx.stroke();
  const mx = (vx(a.col) + vx(b.col)) / 2;
  const my = (vx(a.row) + vx(b.row)) / 2;
  ctx.fillStyle = c.isLair ? '#c0392b' : '#1f6fb2';
  ctx.fillRect(mx - 12, my - 12, 24, 24);
  ctx.strokeRect(mx - 12, my - 12, 24, 24);
}
