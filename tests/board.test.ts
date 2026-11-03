import { describe, expect, it } from 'vitest';
import { BOARD, LAIRS, nextCurrents } from '../src/data/board';

describe('tablero', () => {
  it('tiene 9 zonas con los valores de visibilidad correctos', () => {
    expect(BOARD.zones).toHaveLength(9);
    expect(BOARD.zones.map((z) => z.value)).toEqual([5, 4, 5, 4, 2, 4, 5, 4, 5]);
  });

  it('tiene 20 casillas de corriente y 12 cruces en uso', () => {
    expect(BOARD.currents).toHaveLength(20);
    expect(BOARD.vertices.filter((v) => v.edges.length > 0)).toHaveLength(12);
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
    expect(exterior).toHaveLength(8); // 4 de algas + 4 guaridas
  });

  it('la zona expuesta es adyacente a las 4 de algas', () => {
    expect(BOARD.zones[4].adjacentZones.sort()).toEqual([1, 3, 5, 7]);
  });

  it('las rocas solo tienen la guarida como casilla exterior', () => {
    for (const z of BOARD.zones.filter((zz) => zz.kind === 'roca')) {
      const outer = BOARD.currents.filter((c) => c.zones.length === 1 && c.zones[0] === z.id);
      expect(outer).toHaveLength(1);
      expect(outer[0].isLair).toBe(true);
    }
  });

  it('desde una guarida se puede salir por los dos lados, con 2 caminos en cada uno', () => {
    for (const lair of LAIRS) {
      for (const v of BOARD.currents[lair].vertices) expect(nextCurrents(lair, v)).toHaveLength(2);
    }
  });
});
