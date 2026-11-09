// Data-driven effect interpreter shared by crossroads choices and crisis outcomes.
// ctx = { focusSurvivorId, reason } — focus is optional (crisis effects have none).
import { ENERGY } from '../constants.js';
import { OUTSIDE_LOCATIONS } from '../constants.js';
import { pick } from '../rng.js';
import { itemOf, focusSurvivor, energyMax } from '../selectors.js';
import {
  changeMorale, changeFood, recruitSurvivor, drawItems, discardCard, addZombies,
  removeZombies, addBarricades, woundSurvivor, healSurvivor, log, gainEnergy,
} from './helpers.js';

function focus(s, ctx) {
  const sv = ctx.focusSurvivorId && s.survivors[ctx.focusSurvivorId];
  if (sv?.alive) return sv;
  return focusSurvivor(s);
}

function resolveWhere(s, ctx, where) {
  if (where === 'here') return focus(s, ctx)?.location ?? 'colony';
  return where;
}

const EFFECTS = {
  morale: (s, ctx, e) => changeMorale(s, e.delta, ctx.reason),
  food: (s, ctx, e) => changeFood(s, e.delta, ctx.reason),
  // A newcomer joins the team (a full team: they find shelter elsewhere, hope still helps).
  recruit: (s, ctx) => { if (!recruitSurvivor(s)) changeMorale(s, 1, ctx.reason); },
  starvation: (s, _ctx, e) => { s.starvation += e.delta; },
  spawn: (s, ctx, e) => addZombies(s, resolveWhere(s, ctx, e.where), e.n, ctx.reason),
  removeZombies: (s, ctx, e) => {
    const loc = resolveWhere(s, ctx, e.where);
    const n = removeZombies(s, loc, e.n);
    if (n) log(s, 'zombiesLeave', { locationId: loc, n });
  },
  barricade: (s, ctx, e) => addBarricades(s, resolveWhere(s, ctx, e.where), e.n),
  drawItem: (s, ctx, e) => {
    let from = resolveWhere(s, ctx, e.from);
    if (from === 'any' || !s.locations[from]?.deck?.length) {
      const stocked = OUTSIDE_LOCATIONS.filter((l) => s.locations[l].deck.length);
      if (!stocked.length) return;
      from = pick(s, stocked);
    }
    drawItems(s, from, e.n);
  },
  discard: (s, ctx, e) => {
    for (let i = 0; i < e.n; i++) {
      const uid = s.team.hand.find((u) => !e.item || itemOf(s, u).type === e.item);
      if (!uid) break;
      discardCard(s, uid);
      log(s, 'discard', { card: s.cards[uid] });
    }
  },
  wound: (s, ctx) => { const sv = focus(s, ctx); if (sv) woundSurvivor(s, sv.id, 'crossroads'); },
  heal: (s, ctx) => { const sv = focus(s, ctx); if (sv) healSurvivor(s, sv.id); },
  // Team energy (crossroads): delta can be negative; capped by the pool.
  energy: (s, _ctx, e) => gainEnergy(s, e.delta ?? ENERGY.CARD, energyMax(s)),
  moveHome: (s, ctx) => {
    const sv = focus(s, ctx);
    if (!sv || sv.location === 'colony') return;
    const from = sv.location;
    sv.location = 'colony';
    log(s, 'move', { survivorId: sv.id, from, to: 'colony', safe: true });
  },
};

export function applyEffects(s, effects, ctx = {}) {
  for (const e of effects) {
    const fn = EFFECTS[e.type];
    if (!fn) throw new Error(`Unknown effect type: ${e.type}`);
    fn(s, ctx, e);
  }
}

export const EFFECT_TYPES = Object.keys(EFFECTS);
