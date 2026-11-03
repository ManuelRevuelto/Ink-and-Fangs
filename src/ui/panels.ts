import { OCTO_CONFRONTATION, SHARK_CONFRONTATION } from '../data/confrontation';
import { GROWTH_TILES, DICE_PER_TILE } from '../data/growthTiles';
import { FOOD_NAMES, octoCard, type FoodId, type OctoPile } from '../data/octopusCards';
import { HUNGER_LIMIT, ENERGY_SLOTS, SHARK_CARD_BY_ID } from '../data/sharkCards';
import type { Die } from '../engine/types';
import { HIDDEN, type PlayerView } from '../engine/view';
import { isAllowed, type AskSpec, type Pick } from './ask';
import { blockIcon, dieColor, FOOD_ICON } from './board';

/** Paneles HTML laterales (información de cada jugador) y barra inferior (instrucciones y botones). */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pickAttr = (p: Pick) => `data-pick='${esc(JSON.stringify(p))}'`;
const cls = (p: Pick, selected = false) => `${isAllowed(p) ? 'clickable' : ''} ${selected ? 'selected' : ''}`;

const PILE_LABEL: Record<OctoPile, string> = { aprender: 'Aprender', comer: 'Comer', ocultar: 'Esconderse', moverse: 'Moverse' };

function dieHtml(d: Die, spec: AskSpec | null, extraClass = '') {
  const p: Pick = { kind: 'die', id: d.id };
  const selected = !!spec?.selectedDice?.includes(d.id);
  const fg = d.color === 'amarillo' ? '#222' : '#fff';
  return `<span class="die ${cls(p, selected)} ${extraClass}" ${pickAttr(p)} style="background:${dieColor(d)};color:${fg}">${d.value}</span>`;
}

const colorDot = (color: Die['color'], n = 1) =>
  Array.from({ length: n }, () => `<span class="die small" style="background:${dieColor({ color })}"></span>`).join('');

function octoCardHtml(id: string, spec: AskSpec | null, pick: Pick | null) {
  if (id === HIDDEN) return `<div class="card back">🐙</div>`;
  const def = octoCard(id);
  const p = pick ?? { kind: 'card', id };
  const selected = spec?.selectedCard === id;
  return `<div class="card pile-${def.pile} ${cls(p, selected)}" ${pickAttr(p)}>
    <div class="card-head"><span>${esc(def.name)}</span><span class="cost">${def.cost}</span></div>
    <div class="card-text">${esc(def.text)}</div>
    ${def.starter ? '<div class="card-foot">🌿</div>' : ''}
  </div>`;
}

export function renderOctopusPanel(v: PlayerView, spec: AskSpec | null): string {
  const P = v.pulpo;
  const foods = (['cangrejo', 'langosta', 'caracol', 'abulon'] as FoodId[]).map((_, i) => {
    const f = P.foodTrack[i];
    if (!f) return `<span class="slot">·</span>`;
    // El poder de cada comida se aplica solo al comérsela: aquí solo se muestra lo que lleva comido.
    return `<span class="slot food" title="${FOOD_NAMES[f]} (comida)">${FOOD_ICON[f]}</span>`;
  });
  const piles = (Object.keys(P.piles) as OctoPile[]).map((pile) => {
    const top = P.piles[pile][0];
    const p: Pick = { kind: 'pile', pile };
    return `<div class="pile">
      <div class="pile-label">${PILE_LABEL[pile]} (${P.piles[pile].length})</div>
      ${top ? octoCardHtml(top, spec, p) : '<div class="card empty">vacío</div>'}
    </div>`;
  });
  const supply = P.supply.map((id) => {
    const b = v.blocks[id];
    const p: Pick = { kind: 'supply', id };
    const { icon, label } = blockIcon(b);
    return `<span class="chip ${cls(p)}" ${pickAttr(p)} title="${esc(label)}">${icon} <small>${esc(label)}</small></span>`;
  });
  return `
    <h2>🐙 Pulpo ${v.active === 'pulpo' && !v.winner ? '<span class="turn">turno</span>' : ''}</h2>
    <div class="row">Acciones: <b>${P.actionsUsed}/2</b> · Mano máx.: <b>${P.handSize}</b></div>
    <div class="row">Comida: ${foods.join('')}</div>
    <h3>Mano (${P.hand.length})</h3>
    <div class="cards">${P.hand.map((c) => octoCardHtml(c, spec, null)).join('') || '<i>vacía</i>'}</div>
    <div class="row small">Mazo: ${P.deck.length} · Descarte: ${P.discard.length}${P.played.length ? ` · Jugadas: ${P.played.length}` : ''}${P.removed.length ? ` · Fuera de la partida: ${P.removed.length}` : ''}</div>
    <h3>Aprender</h3>
    <div class="piles">${piles.join('')}</div>
    <div class="row">Bloques: ${supply.join(' ') || '<i>ninguno</i>'}</div>
    <div class="row small">Enfrentamiento: ${P.confrontation.map((c) => `<span class="conf conf-${c}">${OCTO_CONFRONTATION[c].name}</span>`).join(' ')}</div>
  `;
}

export function renderSharkPanel(v: PlayerView, spec: AskSpec | null): string {
  const T = v.tiburon;
  const hunger = Array.from({ length: HUNGER_LIMIT }, (_, i) => {
    const d = T.hunger[i];
    return d ? dieHtml(d, null, 'small') : `<span class="slot ${i === HUNGER_LIMIT - 1 ? 'last' : ''}">${i + 1}</span>`;
  });
  const growth = GROWTH_TILES.map((t, i) => {
    const flipped = T.growthFlipped[i];
    const dice = T.growth[i].map((d) => dieHtml(d, null, 'small')).join('');
    return `<div class="tile ${flipped ? 'flipped' : ''}" title="${esc(t.text)}">
      <b>${esc(t.name)}</b> ${flipped ? '✔' : `${dice}${'<span class="slot mini"></span>'.repeat(DICE_PER_TILE - T.growth[i].length)}`}
      <div class="small">${esc(t.text)}</div></div>`;
  });
  const market = T.market.map((id, slot) => {
    if (!id || id === HIDDEN) return `<div class="card empty">—</div>`;
    const c = SHARK_CARD_BY_ID[id];
    const p: Pick = { kind: 'market', slot };
    const selected = !!spec?.selectedMarket?.includes(slot);
    return `<div class="card shark ${cls(p, selected)}" ${pickAttr(p)}>
      <div class="card-head"><span>${esc(c.name)}</span><span class="cost">${c.cost}</span></div>
      <div class="card-text">${esc(c.text)}</div>
      <div class="card-foot">${c.dice.map((d) => colorDot(d)).join('')} <small>${esc(c.when)}</small></div></div>`;
  });
  const owned = T.cards.map((id) => {
    const c = SHARK_CARD_BY_ID[id];
    const p: Pick = { kind: 'card', id };
    return `<div class="card shark ${cls(p)}" ${pickAttr(p)}>
      <div class="card-head"><span>${esc(c.name)}</span></div>
      <div class="card-text">${esc(c.text)}</div><div class="card-foot"><small>${esc(c.when)}</small></div></div>`;
  });
  const bag = (['azul', 'amarillo', 'rojo'] as const).map((c) => `${colorDot(c)}×${T.bag[c]}`).join(' ');
  const supply = (['azul', 'amarillo', 'rojo'] as const).map((c) => `${colorDot(c)}×${T.supply[c]}`).join(' ');
  const energySum = T.energy.reduce((n, d) => n + d.value, 0);
  return `
    <h2>🦈 Tiburón ${v.active === 'tiburon' && !v.winner ? '<span class="turn">turno</span>' : ''}</h2>
    <div class="row">Hambre: ${hunger.join('')}</div>
    ${T.drawn.length ? `<div class="row">Sacados (sin tirar): ${T.drawn.map((c) => colorDot(c)).join('')}</div>` : ''}
    <div class="row">Reserva: ${T.pool.map((d) => dieHtml(d, spec)).join('') || '<i>—</i>'}</div>
    <div class="row">Energía (${T.energy.length}/${ENERGY_SLOTS}, suma ${energySum}): ${T.energy.map((d) => dieHtml(d, spec)).join('') || '<i>—</i>'}</div>
    ${T.stored ? `<div class="row">Guardado (Vigilante): ${dieHtml(T.stored, null)}</div>` : ''}
    <div class="row small">Bolsa: ${bag}</div>
    <div class="row small">Fuera de la bolsa: ${supply}</div>
    <h3>Crecimiento</h3>
    <div class="tiles">${growth.join('')}</div>
    <h3>Mis cartas</h3>
    <div class="cards">${owned.join('') || '<i>ninguna</i>'}</div>
    <h3>Mercado (mazo: ${T.deck.length})</h3>
    <div class="cards">${market.join('')}</div>
    <div class="row small">Enfrentamiento: ${T.confrontation.map((c) => `<span class="conf conf-${c}">${SHARK_CONFRONTATION[c].name}</span>`).join(' ')}</div>
  `;
}

export function renderPromptBar(spec: AskSpec | null, error: string | null, waiting: string | null): string {
  const buttons = (spec?.buttons ?? [])
    .map((b) => {
      const p: Pick = { kind: 'button', value: b.value };
      const style = b.color ? `style="background:${b.color}"` : '';
      return `<button class="${b.primary ? 'primary' : ''}" ${style} ${pickAttr(p)}>${esc(b.label)}</button>`;
    })
    .join('');
  return `
    <div class="prompt">${esc(spec?.prompt ?? waiting ?? '')}</div>
    <div class="buttons">${buttons}</div>
    ${error ? `<div class="error">⚠️ ${esc(error)}</div>` : ''}
  `;
}

export function renderLog(v: PlayerView): string {
  return v.log
    .slice(-14)
    .map((l) => `<div>${esc(l)}</div>`)
    .join('');
}

/** Lee el Pick de un elemento pulsado (o de su padre más cercano). */
export function pickFromEvent(e: Event): Pick | null {
  const el = (e.target as HTMLElement).closest('[data-pick]') as HTMLElement | null;
  if (!el) return null;
  return JSON.parse(el.dataset.pick!) as Pick;
}
