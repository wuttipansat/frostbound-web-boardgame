// Data-driven effect interpreter shared by crossroads choices and crisis outcomes.
// ctx = { playerId, focusSurvivorId } — both optional (crisis effects have no player).
import { ENERGY } from '../constants.js';
import { OUTSIDE_LOCATIONS } from '../constants.js';
import { pick } from '../rng.js';
import { getPlayer, itemOf, focusSurvivor, energyMax } from '../selectors.js';
import {
  changeMorale, changeFood, changeWaste, changeHelpless, drawItems, wasteCard, addZombies,
  removeZombies, addBarricades, woundSurvivor, healSurvivor, rollExposure, log, gainEnergy,
} from './helpers.js';

function focus(s, ctx) {
  const sv = ctx.focusSurvivorId && s.survivors[ctx.focusSurvivorId];
  if (sv?.alive) return sv;
  return ctx.playerId ? focusSurvivor(s, ctx.playerId) : null;
}

function resolveWhere(s, ctx, where) {
  if (where === 'here') return focus(s, ctx)?.location ?? 'colony';
  return where;
}

const EFFECTS = {
  morale: (s, ctx, e) => changeMorale(s, e.delta, ctx.reason),
  food: (s, ctx, e) => changeFood(s, e.delta, ctx.reason),
  waste: (s, ctx, e) => changeWaste(s, e.delta, ctx.reason),
  helpless: (s, ctx, e) => changeHelpless(s, e.delta, ctx.reason),
  starvation: (s, _ctx, e) => { s.starvation += e.delta; },
  spawn: (s, ctx, e) => addZombies(s, resolveWhere(s, ctx, e.where), e.n, ctx.reason),
  removeZombies: (s, ctx, e) => {
    const loc = resolveWhere(s, ctx, e.where);
    const n = removeZombies(s, loc, e.n);
    if (n) log(s, 'zombiesLeave', { locationId: loc, n });
  },
  barricade: (s, ctx, e) => addBarricades(s, resolveWhere(s, ctx, e.where), e.n),
  drawItem: (s, ctx, e) => {
    if (!ctx.playerId) return;
    let from = resolveWhere(s, ctx, e.from);
    if (from === 'any' || !s.locations[from]?.deck?.length) {
      const stocked = OUTSIDE_LOCATIONS.filter((l) => s.locations[l].deck.length);
      if (!stocked.length) return;
      from = pick(s, stocked);
    }
    drawItems(s, ctx.playerId, from, e.n);
  },
  discard: (s, ctx, e) => {
    if (!ctx.playerId) return;
    const p = getPlayer(s, ctx.playerId);
    for (let i = 0; i < e.n; i++) {
      const uid = p.hand.find((u) => !e.item || itemOf(s, u).type === e.item);
      if (!uid) break;
      wasteCard(s, p.id, uid);
      log(s, 'discard', { playerId: p.id, card: s.cards[uid] });
    }
  },
  wound: (s, ctx) => { const sv = focus(s, ctx); if (sv) woundSurvivor(s, sv.id, 'crossroads'); },
  heal: (s, ctx) => { const sv = focus(s, ctx); if (sv) healSurvivor(s, sv.id); },
  exposure: (s, ctx) => { const sv = focus(s, ctx); if (sv) rollExposure(s, sv.id, 'crossroads'); },
  // Energy for the acting player (crossroads): delta can be negative; capped by their pool.
  energy: (s, ctx, e) => { if (ctx.playerId) gainEnergy(s, ctx.playerId, e.delta ?? ENERGY.CARD, energyMax(s, ctx.playerId)); },
  moveHome: (s, ctx) => {
    const sv = focus(s, ctx);
    if (!sv || getPlayer(s, sv.owner).exiled || sv.location === 'colony') return;
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
