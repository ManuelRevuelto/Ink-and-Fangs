import { describe, expect, it } from 'vitest';
import { applyAction, legalPaths, newGame, tryAction, viewFor, HIDDEN, type GameState } from '../src/engine';
import { BOARD, LAIRS } from '../src/data/board';
import { octopusZone } from '../src/engine/helpers';
import { countDice, playRandomGame, TOTAL } from './simulation';

const die = (id: number, color: 'azul' | 'amarillo' | 'rojo', value: number) => ({ id, color, value });

/** Una casilla interior y el cruce al que mira, desde el que salen 2 caminos. */
function interiorStart() {
  const edge = BOARD.currents.find((c) => c.zones.length === 2)!;
  const via = edge.vertices.find((v) => BOARD.vertices[v].edges.length >= 3)!;
  return { edge: edge.id, via };
}

/** Pone el estado en la fase de movimiento del tiburón con la configuración indicada. */
function sharkAt(s: GameState, current: number, facing: number) {
  s.active = 'tiburon';
  s.phase = 'tiburon-mover';
  s.tiburon.current = current;
  s.tiburon.facing = facing;
  s.tiburon.pool = [];
}

describe('preparación', () => {
  it('coloca 9 bloques ocultos, mano de 4 con «Aprendizaje rápido» y tiburón en guarida', () => {
    const s = newGame({ seed: 1 });
    expect(s.spaces.every((sp) => sp.block && !sp.revealed)).toBe(true);
    expect(s.pulpo.hand).toHaveLength(4);
    expect(s.pulpo.hand[0]).toBe('aprendizaje-rapido#1');
    expect(LAIRS).toContain(s.tiburon.current);
    expect(countDice(s)).toBe(TOTAL);
    expect(s.tiburon.market).toHaveLength(4);
  });

  it('es determinista con la misma semilla', () => {
    expect(newGame({ seed: 42 })).toEqual(newGame({ seed: 42 }));
  });
});

describe('pulpo', () => {
  it('debe pagar el coste exacto revelando bloques ocultos', () => {
    const s = newGame({ seed: 3 });
    s.pulpo.hand = ['deslizarse#1'];
    // sin pagar → error
    expect(tryAction(s, 'pulpo', { type: 'jugar', card: 'deslizarse#1', pay: [], params: { swaps: [[0, 1]] } }).ok).toBe(false);
    // pagando de más → error
    expect(tryAction(s, 'pulpo', { type: 'jugar', card: 'deslizarse#1', pay: [4, 5], params: { swaps: [[0, 1]] } }).ok).toBe(false);
    const res = tryAction(s, 'pulpo', { type: 'jugar', card: 'deslizarse#1', pay: [4], params: { swaps: [[0, 1]] } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.spaces[4].revealed).toBe(true);
      expect(res.state.spaces[0].block).toBe(s.spaces[1].block);
    }
  });

  it('la concha doble paga 2', () => {
    const s = newGame({ seed: 3 });
    const dz = 2;
    const dbl = Object.values(s.blocks).find((b) => b.kind === 'conchaDoble')!;
    s.spaces[dz].block = dbl.id;
    s.pulpo.hand = ['remolino#1'];
    const res = tryAction(s, 'pulpo', { type: 'jugar', card: 'remolino#1', pay: [dz], params: { zones: [0, 8] } });
    expect(res.ok).toBe(true);
  });

  it('no permite intercambiar en diagonal', () => {
    const s = newGame({ seed: 3 });
    s.pulpo.hand = ['deslizarse#1'];
    expect(tryAction(s, 'pulpo', { type: 'jugar', card: 'deslizarse#1', pay: [4], params: { swaps: [[0, 4]] } }).ok).toBe(false);
  });

  it('hace 2 acciones y luego empieza el turno del tiburón', () => {
    let s = newGame({ seed: 5 });
    s = applyAction(s, 'pulpo', { type: 'descartarOcultar', card: s.pulpo.hand[1] });
    expect(tryAction(s, 'pulpo', { type: 'finTurno' }).ok).toBe(false);
    s = applyAction(s, 'pulpo', { type: 'robar' });
    s = applyAction(s, 'pulpo', { type: 'finTurno' });
    expect(s.active).toBe('tiburon');
    expect(s.phase).toBe('tiburon-robar');
    expect(s.tiburon.drawn).toHaveLength(2);
  });

  it('gana al comerse la cuarta comida', () => {
    const s = newGame({ seed: 7 });
    const food = Object.values(s.blocks).find((b) => b.kind === 'comida' && b.food === 'abulon')!;
    const pz = octopusZone(s);
    const fz = BOARD.zones[pz].adjacentZones[0];
    s.spaces[fz] = { block: food.id, revealed: false };
    s.pulpo.foodTrack = ['cangrejo', 'langosta', 'caracol'];
    s.pulpo.hand = ['comer-abulon#1'];
    const after = applyAction(s, 'pulpo', { type: 'jugar', card: 'comer-abulon#1', pay: [] });
    expect(after.winner).toBe('pulpo');
  });
});

describe('movimiento del tiburón', () => {
  it('sin corrientes, avanza a una casilla contigua sin dar la vuelta', () => {
    const s = newGame({ seed: 1 });
    const { edge, via } = interiorStart();
    sharkAt(s, edge, via);
    const paths = legalPaths(s);
    expect(paths.every((p) => p.length === 1)).toBe(true);
    expect(paths.map((p) => p[0]).sort()).toEqual(BOARD.vertices[via].edges.filter((e) => e !== edge).sort());
  });

  it('nada por una cadena de corrientes descendente y no puede subir', () => {
    const s = newGame({ seed: 1 });
    const { edge, via } = interiorStart();
    sharkAt(s, edge, via);
    const [a] = BOARD.vertices[via].edges.filter((e) => e !== edge);
    s.currents[a] = die(100, 'azul', 5);
    let paths = legalPaths(s);
    expect(paths.some((p) => p.length === 1 && p[0] === a)).toBe(false); // no puede parar en la corriente
    expect(paths.some((p) => p[0] === a && p.length === 2)).toBe(true);
    // Siguiente corriente mayor: esa rama se corta
    const far = BOARD.currents[a].vertices.find((v) => v !== via)!;
    const nexts = BOARD.vertices[far].edges.filter((e) => e !== a);
    nexts.forEach((e) => (s.currents[e] = die(200 + e, 'azul', 6)));
    paths = legalPaths(s);
    expect(paths.some((p) => p[0] === a)).toBe(false);
    // Con corrientes menores sí puede encadenar
    nexts.forEach((e) => (s.currents[e] = die(200 + e, 'azul', 3)));
    paths = legalPaths(s);
    expect(paths.some((p) => p[0] === a && p.length === 3)).toBe(true);
  });

  it('al moverse por corrientes, el primer dado va al crecimiento', () => {
    let s = newGame({ seed: 1 });
    const { edge, via } = interiorStart();
    sharkAt(s, edge, via);
    const [a] = BOARD.vertices[via].edges.filter((e) => e !== edge);
    s.currents[a] = die(100, 'azul', 4);
    const path = legalPaths(s).find((p) => p[0] === a)!;
    s = applyAction(s, 'tiburon', { type: 'mover', path });
    expect(s.currents[a]).toBeNull();
    expect(s.tiburon.growthQueue.map((d) => d.id)).toEqual([100]);
    expect(s.phase).toBe('tiburon-buscar');
  });
});

describe('búsqueda, ataque y enfrentamiento', () => {
  function readyToSearch(seed: number) {
    const s = newGame({ seed });
    const lair = LAIRS.find((l) => BOARD.currents[l].zones[0] === 0)!; // toca solo la zona 0 (roca, 5+)
    sharkAt(s, lair, BOARD.currents[lair].vertices[0]);
    s.phase = 'tiburon-buscar';
    return s;
  }

  it('exige un dado igual o mayor que el valor de la zona', () => {
    const s = readyToSearch(1);
    s.tiburon.pool = [die(100, 'amarillo', 4), die(101, 'amarillo', 5)];
    expect(tryAction(s, 'tiburon', { type: 'buscarAtacar', placements: [{ die: 100, zone: 0 }] }).ok).toBe(false);
    const res = tryAction(s, 'tiburon', { type: 'buscarAtacar', placements: [{ die: 101, zone: 0 }] });
    expect(res.ok).toBe(true);
  });

  it('atacar al pulpo inicia un enfrentamiento; si el tiburón acierta el color, gana', () => {
    let s = readyToSearch(2);
    const pz = octopusZone(s);
    [s.spaces[0], s.spaces[pz]] = [s.spaces[pz], s.spaces[0]];
    s.tiburon.pool = [die(100, 'rojo', 6)];
    s = applyAction(s, 'tiburon', { type: 'buscarAtacar', placements: [{ die: 100, zone: 0 }] });
    expect(s.pending?.type).toBe('enfrentamiento');
    // El tiburón no ve la elección del pulpo
    s = applyAction(s, 'pulpo', { type: 'enfrentar', color: 'gris' });
    expect((viewFor(s, 'tiburon').pending as { choices: Record<string, string> }).choices.pulpo).toBe(HIDDEN);
    s = applyAction(s, 'tiburon', { type: 'enfrentar', color: 'gris' });
    expect(s.winner).toBe('tiburon');
  });

  it('si el pulpo escapa, se descartan las cartas y el dado rojo va al hambre', () => {
    let s = readyToSearch(2);
    const pz = octopusZone(s);
    [s.spaces[0], s.spaces[pz]] = [s.spaces[pz], s.spaces[0]];
    s.tiburon.pool = [die(100, 'rojo', 6)];
    s = applyAction(s, 'tiburon', { type: 'buscarAtacar', placements: [{ die: 100, zone: 0 }] });
    s = applyAction(s, 'pulpo', { type: 'enfrentar', color: 'gris' });
    s = applyAction(s, 'tiburon', { type: 'enfrentar', color: 'rojo' });
    expect(s.winner).toBeNull();
    expect(s.pulpo.confrontation).toEqual(['amarillo', 'rojo']);
    expect(s.tiburon.confrontation).toEqual(['amarillo', 'rojo']);
    expect(s.tiburon.hunger).toHaveLength(1);
    expect(s.spaces.every((sp) => !sp.revealed)).toBe(true);
    expect(s.phase).toBe('tiburon-energia');
  });

  it('el séptimo dado de hambre hace ganar al pulpo', () => {
    let s = readyToSearch(4);
    s.tiburon.hunger = Array.from({ length: 6 }, (_, i) => die(300 + i, 'rojo', 1));
    const target = s.spaces[0].block!;
    if (s.blocks[target].kind === 'pulpo') return; // caso raro según la semilla
    s.tiburon.pool = [die(100, 'rojo', 6)];
    s = applyAction(s, 'tiburon', { type: 'buscarAtacar', placements: [{ die: 100, zone: 0 }] });
    expect(s.winner).toBe('pulpo');
  });
});

describe('información oculta', () => {
  it('el tiburón no ve bloques ocultos ni la mano del pulpo', () => {
    const s = newGame({ seed: 9 });
    const v = viewFor(s, 'tiburon');
    expect(v.spaces.every((sp) => sp.block === HIDDEN)).toBe(true);
    expect(v.pulpo.hand.every((c) => c === HIDDEN)).toBe(true);
    expect(Object.values(v.blocks).some((b) => b.kind === 'pulpo')).toBe(false);
    expect(v.rng).toBe(0);
  });
});

describe('simulación con jugadores aleatorios', () => {
  it('300 partidas terminan sin errores ni dados perdidos', () => {
    const wins = { pulpo: 0, tiburon: 0, sinTerminar: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const { state } = playRandomGame(newGame({ seed }), seed, 4000, (s) => {
        if (!s.winner) expect(countDice(s)).toBe(TOTAL);
        expect(s.spaces.every((sp) => sp.block)).toBe(true);
        expect(octopusZone(s)).toBeGreaterThanOrEqual(0);
      });
      if (state.winner) wins[state.winner]++;
      else wins.sinTerminar++;
    }
    console.log('Resultados (aleatorio contra aleatorio):', wins);
    expect(wins.pulpo + wins.tiburon).toBeGreaterThan(250);
  }, 60_000);
});

describe('cartas de comer', () => {
  it('al usarse salen de la partida y no vuelven al mazo', () => {
    let s = newGame({ seed: 7 });
    const food = Object.values(s.blocks).find((b) => b.kind === 'comida' && b.food === 'langosta')!;
    const pz = octopusZone(s);
    const fz = BOARD.zones[pz].adjacentZones[0];
    s.spaces[fz] = { block: food.id, revealed: false };
    s.pulpo.hand = ['comer-langosta#1', 'camuflaje#1'];
    s = applyAction(s, 'pulpo', { type: 'jugar', card: 'comer-langosta#1', pay: [] });
    s = applyAction(s, 'pulpo', { type: 'descartarOcultar', card: 'camuflaje#1' });
    s = applyAction(s, 'pulpo', { type: 'finTurno' });
    expect(s.pulpo.removed).toContain('comer-langosta#1');
    expect([...s.pulpo.discard, ...s.pulpo.deck, ...s.pulpo.hand]).not.toContain('comer-langosta#1');
  });
});

describe('poder de la comida (automático al comer)', () => {
  /** Partida con la comida indicada junto al pulpo y su carta de comer en la mano. */
  function readyToEat(food: 'cangrejo' | 'langosta' | 'caracol' | 'abulon') {
    const s = newGame({ seed: 11 });
    const block = Object.values(s.blocks).find((b) => b.kind === 'comida' && b.food === food)!;
    const pz = octopusZone(s);
    const fz = BOARD.zones[pz].adjacentZones[0];
    s.spaces[fz] = { block: block.id, revealed: false };
    s.pulpo.hand = [`comer-${food}#1`, 'camuflaje#1'];
    return applyAction(s, 'pulpo', { type: 'jugar', card: `comer-${food}#1`, pay: [] });
  }

  it('comer gasta 1 acción (no el turno entero)', () => {
    const s = readyToEat('cangrejo');
    expect(s.pulpo.actionsUsed).toBe(1);
    expect(tryAction(s, 'pulpo', { type: 'descartarOcultar', card: 'camuflaje#1' }).ok).toBe(true);
  });

  it('cangrejo: la mano pasa a 5 y se roba al momento, sin pedir nada', () => {
    const s = readyToEat('cangrejo');
    expect(s.pending).toBeNull();
    expect(s.pulpo.handSize).toBe(5);
    // Roba hasta 5 (o hasta quedarse sin cartas en el mazo y el descarte).
    const left = s.pulpo.deck.length + s.pulpo.discard.length;
    expect(s.pulpo.hand.length === 5 || left === 0).toBe(true);
    expect(s.pulpo.hand.length).toBeGreaterThan(1);
    expect(s.pulpo.foodUsed).toContain('cangrejo');
  });

  it('langosta: se ocultan todos los bloques al momento (también el pulpo)', () => {
    const s = readyToEat('langosta');
    expect(s.pending).toBeNull();
    expect(s.spaces.every((sp) => !sp.revealed)).toBe(true);
  });

  it('caracol: pide elegir una carta del mazo o descarte y la lleva a la mano', () => {
    let s = readyToEat('caracol');
    expect(s.pending).toEqual({ type: 'comida', role: 'pulpo', food: 'caracol' });
    expect(tryAction(s, 'pulpo', { type: 'robar' }).ok).toBe(false); // primero hay que resolver el poder
    const wanted = s.pulpo.deck[0];
    s = applyAction(s, 'pulpo', { type: 'resolverComida', card: wanted });
    expect(s.pending).toBeNull();
    expect(s.pulpo.hand).toContain(wanted);
    expect(s.pulpo.foodUsed).toContain('caracol');
  });

  it('abulón: pide qué aprender (hasta 3, o nada)', () => {
    let s = readyToEat('abulon');
    expect(s.pending?.type).toBe('comida');
    const before = s.pulpo.discard.length;
    s = applyAction(s, 'pulpo', { type: 'resolverComida', picks: [{ kind: 'card', pile: 'moverse' }, { kind: 'card', pile: 'ocultar' }] });
    expect(s.pending).toBeNull();
    expect(s.pulpo.discard.length).toBe(before + 2);
    expect(tryAction(readyToEat('abulon'), 'pulpo', { type: 'resolverComida', picks: [] }).ok).toBe(true);
  });
});
