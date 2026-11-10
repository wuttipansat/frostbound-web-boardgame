// Pure helpers that work out which UI actions are available. Legality always comes from the
// rules engine itself (tryReduce), so the UI can never offer an illegal move or hide a legal one.
import * as act from '../core/actions.js';
import { tryReduce } from '../core/reducer.js';
import { survivorDef, itemOf, scenarioDef, actionCost, fightPreview } from '../core/selectors.js';
import { gearSlot } from '../content/items.js';
import { LOCATION_IDS } from '../core/constants.js';

const check = (state, action) => {
  const r = tryReduce(state, action);
  return { action, ok: r.ok, error: r.ok ? null : r.error };
};

/**
 * Energy actions + ability for one survivor. Each option: { id, action, ok, error, cost }.
 * Legality (including "not enough energy") comes from the engine.
 */
export function survivorOptions(state, survivorId, { lureTo = null } = {}) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return [];
  const def = survivorDef(survivorId);
  const out = [];
  const add = (id, action) => out.push({ id, cost: actionCost(state, survivorId, id), ...check(state, action) });
  add('attack', act.attack(survivorId));
  out[out.length - 1].fight = fightPreview(state, survivorId);
  add('search', act.search(survivorId));
  add('barricade', act.barricade(survivorId));
  add('lure', act.lure(survivorId, lureTo ?? LOCATION_IDS.find((l) => l !== sv.location)));
  if (def.ability.type === 'healer') {
    const patients = Object.values(state.survivors)
      .filter((o) => o.alive && o.location === sv.location && (o.wounds > 0 || o.frostbite));
    const target = patients[0];
    const action = act.useAbility(survivorId, target?.id ?? survivorId);
    out.push({ id: 'ability', cost: 0, ...(target ? check(state, action) : { action, ok: false, error: 'notWounded' }) });
  }
  // Rest: a nap now (skips the day), or tonight's guard duty (toggle).
  out.push({ id: 'nap', cost: null, ...check(state, act.nap(survivorId)) });
  out.push({ id: sv.rest === 'guard' ? 'unguard' : 'guard', cost: null,
    ...check(state, act.setRest(survivorId, sv.rest === 'guard' ? 'sleep' : 'guard')) });
  return out;
}

/** Move option for a survivor to a location (with or without a fuel card). */
export function moveOption(state, survivorId, to, useFuel = false) {
  const fuel = useFuel ? state.stockpile.find((u) => itemOf(state, u).type === 'fuel') : undefined;
  return { to, fuel: fuel ?? null, ...check(state, act.move(survivorId, to, fuel)) };
}

export function hasFuel(state) {
  return state.stockpile.some((u) => itemOf(state, u).type === 'fuel');
}

/**
 * What can be done with a card: equip (gear), play (some need a target survivor), contribute, deposit.
 */
export function cardOptions(state, uid, { survivorId = null } = {}) {
  const item = itemOf(state, uid);
  const out = [];
  if (gearSlot(item)) { /* equipped on a chosen survivor: cardTargets */ } else if (item.type !== 'fuel') {
    const opts = {};
    if (['medicine', 'tools'].includes(item.type)) opts.targetSurvivorId = survivorId;
    out.push({ id: 'play', ...check(state, act.playCard(uid, opts)) });
  }
  out.push({ id: 'contribute', ...check(state, act.contribute(uid)) });
  if (scenarioDef(state).goal.type === 'deposit') out.push({ id: 'deposit', ...check(state, act.deposit(uid)) });
  return out;
}

export function endTurnOption(state) {
  return check(state, act.endTurn());
}

// ---------------------------------------------------------------- step 8: explicit targets & board hints

const TARGETED = ['consumable', 'medicine'];

/** Does playing this card need the player to choose a survivor? */
export function cardNeeds(state, uid) {
  const item = itemOf(state, uid);
  return TARGETED.includes(item.type) || gearSlot(item) ? 'survivor' : null;
}

/** Every survivor the card could be played on, with legality and the action to dispatch. */
export function cardTargets(state, uid) {
  if (cardNeeds(state, uid) !== 'survivor') return [];
  const gear = !!gearSlot(itemOf(state, uid));
  return state.team.survivors
    .filter((id) => state.survivors[id]?.alive)
    .map((survivorId) => ({ survivorId, ...check(state, gear ? act.equip(uid, survivorId) : act.playCard(uid, { targetSurvivorId: survivorId })) }));
}

/** Hand-over targets for an item: other survivors at the same place, plus the stockpile from a backpack at the colony. */
export function giveTargets(state, uid) {
  const out = state.team.survivors.filter((id) => state.survivors[id]?.alive)
    .map((survivorId) => ({ survivorId, ...check(state, act.give(uid, survivorId)) }))
    .filter((x) => x.ok);
  const home = check(state, act.give(uid, null));
  if (home.ok) out.push({ survivorId: null, ...home });
  return out;
}

/** Every item the team has: the stockpile first, then each backpack. */
export function allItems(state) {
  return [...state.stockpile, ...state.team.survivors.flatMap((id) => (state.survivors[id]?.alive ? state.survivors[id].pack ?? [] : []))];
}

/** Where a survivor could lure zombies to. */
export function lureTargets(state, survivorId) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return [];
  return LOCATION_IDS.filter((l) => l !== sv.location).map((to) => ({ to, ...check(state, act.lure(survivorId, to)) }));
}

/** Board hint for a selected survivor: each location -> 'ok' | 'full' | 'blocked' (no entry for its own location). */
export function moveTargets(state, survivorId) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return {};
  const out = {};
  for (const to of LOCATION_IDS) {
    if (to === sv.location) continue;
    const r = moveOption(state, survivorId, to);
    out[to] = r.ok ? 'ok' : r.error === 'locationFull' ? 'full' : 'blocked';
  }
  return out;
}

/** Survivors who can still do something this turn (move, an energy action, or their ability). */
export function actingSurvivors(state) {
  if (state.phase !== 'turn') return [];
  return state.team.survivors.filter((id) => {
    const sv = state.survivors[id];
    if (!sv?.alive) return false;
    if (Object.values(moveTargets(state, id)).includes('ok')) return true;
    return survivorOptions(state, id).some((o) => o.ok && !['nap', 'guard', 'unguard'].includes(o.id));
  });
}

/** Can the player's survivor still afford an action or a move? */
export function hasEnergyLeft(state) {
  return actingSurvivors(state).length > 0;
}

/** Ask before ending a turn while something can still be done (unless the player opted out this game). */
export function shouldConfirmEndTurn(state, { skip = false } = {}) {
  return !skip && hasEnergyLeft(state);
}

// ---------------------------------------------------------------- step 11: card availability

/**
 * Can this card do anything right now (play on some target, add to the crisis, deposit)?
 * { ok, reason } — reason is the first error key when nothing is legal. Passive books are "ok"
 * as long as they can still be contributed or deposited; otherwise their reason is passiveItem.
 */
export function cardUsable(state, uid) {
  const need = cardNeeds(state, uid);
  const plays = need === 'survivor' ? cardTargets(state, uid) : [];
  const opts = cardOptions(state, uid);
  const all = [...plays, ...opts];
  if (all.some((o) => o.ok)) return { ok: true, reason: null };
  return { ok: false, reason: (plays[0] ?? opts[0])?.error ?? 'unplayable' };
}
