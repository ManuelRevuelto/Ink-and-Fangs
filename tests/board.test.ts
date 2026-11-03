import { describe, expect, it } from 'vitest';
import { BOARD, LAIRS, nextCurrents, otherVertex, vertexTowardCenter } from '../src/data/board';

describe('tablero', () => {
  it('tiene 9 zonas con los valores de visibilidad correctos', () => {
    expect(BOARD.zones).toHaveLength(9);
    expect(BOARD.zones.map((z) => z.value)).toEqual([5, 4, 5, 4, 2, 4, 5, 4, 5]);
  });

  it('tiene 24 casillas de corriente y 16 cruces', () => {
    expect(BOARD.currents).toHaveLength(24);
    expect(BOARD.vertices).toHaveLength(16);
  });

  it('tiene 4 guaridas, una en cada zona de roca', () => {
    expect(LAIRS).toHaveLength(4);
    expect(new Set(LAIRS.map((id) => BOARD.currents[id].zones[0])).size).toBe(4);
    for (const id of LAIRS) {
      const c = BOARD.currents[id];
      expect(c.zones).toHaveLength(1);
      expect(BOARD.zones[c.zones[0]].kind).toBe('roca');
    }
  });

  it('las casillas interiores tocan 2 zonas y las exteriores 1', () => {
    const interior = BOARD.currents.filter((c) => c.zones.length === 2);
    const exterior = BOARD.currents.filter((c) => c.zones.length === 1);
    expect(interior).toHaveLength(12);
    expect(exterior).toHaveLength(12);
  });

  it('la zona expuesta es adyacente a las 4 de algas', () => {
    expect(BOARD.zones[4].adjacentZones.sort()).toEqual([1, 3, 5, 7]);
  });

  it('desde un cruce de esquina solo se puede girar a una casilla', () => {
    const lair = LAIRS[0];
    const [a, b] = BOARD.currents[lair].vertices;
    const corner = BOARD.vertices[a].edges.length === 2 ? a : b;
    expect(nextCurrents(lair, corner)).toHaveLength(1);
  });

  it('al empezar en una guarida, el tiburón mira hacia el interior', () => {
    for (const lair of LAIRS) {
      const v = vertexTowardCenter(lair);
      expect(BOARD.vertices[v].edges.length).toBe(3); // cruce de borde, no de esquina
      expect(otherVertex(lair, v)).not.toBe(v);
    }
  });
});
