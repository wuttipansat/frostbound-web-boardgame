// Pure helpers that work out which UI actions are available. Legality always comes from the
// rules engine itself (tryReduce), so the UI can never offer an illegal move or hide a legal one.
import * as act from '../core/actions.js';
import { tryReduce } from '../core/reducer.js';
import { getPlayer, survivorDef, itemOf, scenarioDef, actionCost } from '../core/selectors.js';
import { gearSlot } from '../content/items.js';
import { LOCATION_IDS } from '../core/constants.js';

const check = (state, action) => {
  try {
    const r = tryReduce(state, action);
    return { action, ok: r.ok, error: r.ok ? null : r.error };
  } catch {
    // Online, the UI only holds a player's view (hidden cards, placeholder decks). A simulated move that
    // trips over hidden data is not known to be illegal: offer it and let the server decide.
    return { action, ok: true, error: null };
  }
};

/**
 * Energy actions + ability for one survivor. Each option: { id, action, ok, error, cost }.
 * Legality (including "not enough energy") comes from the engine.
 */
export function survivorOptions(state, playerId, survivorId, { lureTo = null } = {}) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return [];
  const def = survivorDef(survivorId);
  const out = [];
  const add = (id, action) => out.push({ id, cost: actionCost(state, survivorId, id), ...check(state, action) });
  add('attack', act.attack(playerId, survivorId));
  add('search', act.search(playerId, survivorId));
  add('barricade', act.barricade(playerId, survivorId));
  add('clean', act.clean(playerId, survivorId));
  add('lure', act.lure(playerId, survivorId, lureTo ?? LOCATION_IDS.find((l) => l !== sv.location)));
  if (def.ability.type === 'healer') {
    const patients = Object.values(state.survivors)
      .filter((o) => o.alive && o.location === sv.location && (o.wounds > 0 || o.frostbite));
    const target = patients[0];
    const action = act.useAbility(playerId, survivorId, target?.id ?? survivorId);
    out.push({ id: 'ability', cost: 0, ...(target ? check(state, action) : { action, ok: false, error: 'notWounded' }) });
  }
  // Right after a search: "search deeper" (free: one more card, then a danger card).
  const ls = getPlayer(state, playerId).lastSearch;
  if (ls && ls.survivorId === survivorId && ls.locationId === sv.location) {
    out.push({ id: 'deeper', cost: 0, ...check(state, act.searchDeeper(playerId, survivorId)) });
  }
  return out;
}

/** Move option for a survivor to a location (with or without a fuel card). */
export function moveOption(state, playerId, survivorId, to, useFuel = false) {
  const fuel = useFuel ? getPlayer(state, playerId).hand.find((u) => itemOf(state, u).type === 'fuel') : undefined;
  return { to, fuel: fuel ?? null, ...check(state, act.move(playerId, survivorId, to, fuel)) };
}

export function hasFuel(state, playerId) {
  return getPlayer(state, playerId).hand.some((u) => itemOf(state, u).type === 'fuel');
}

/**
 * What can be done with a card: equip (gear), play (some need a target survivor), contribute, deposit.
 */
export function cardOptions(state, playerId, uid, { survivorId = null } = {}) {
  const item = itemOf(state, uid);
  const out = [];
  if (gearSlot(item)) out.push({ id: 'equip', ...check(state, act.equip(playerId, uid)) });
  else if (item.type !== 'fuel') {
    const opts = {};
    if (['medicine', 'tools'].includes(item.type)) opts.targetSurvivorId = survivorId;
    out.push({ id: 'play', ...check(state, act.playCard(playerId, uid, opts)) });
  }
  out.push({ id: 'contribute', ...check(state, act.contribute(playerId, uid)) });
  if (scenarioDef(state).goal.type === 'deposit') out.push({ id: 'deposit', ...check(state, act.deposit(playerId, uid)) });
  return out;
}

export function endTurnOption(state, playerId) {
  return check(state, act.endTurn(playerId));
}

/** Players this player may call an exile vote on right now (empty if a vote can't be called). */
export function voteTargets(state, playerId) {
  return state.players
    .filter((p) => p.id !== playerId)
    .filter((p) => tryReduce(state, act.callVote(playerId, p.id)).ok)
    .map((p) => p.id);
}

// ---------------------------------------------------------------- step 8: explicit targets & board hints

const TARGETED = ['medicine', 'tools'];

/** Does playing this card need the player to choose a survivor? */
export function cardNeeds(state, uid) {
  return TARGETED.includes(itemOf(state, uid).type) ? 'survivor' : null;
}

/** Every survivor the card could be played on, with legality and the action to dispatch. */
export function cardTargets(state, playerId, uid) {
  if (cardNeeds(state, uid) !== 'survivor') return [];
  return getPlayer(state, playerId).survivors
    .filter((id) => state.survivors[id]?.alive)
    .map((survivorId) => ({ survivorId, ...check(state, act.playCard(playerId, uid, { targetSurvivorId: survivorId })) }));
}

/** Where a survivor could lure zombies to. */
export function lureTargets(state, playerId, survivorId) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return [];
  return LOCATION_IDS.filter((l) => l !== sv.location).map((to) => ({ to, ...check(state, act.lure(playerId, survivorId, to)) }));
}

/** Board hint for a selected survivor: each location -> 'ok' | 'full' | 'blocked' (no entry for its own location). */
export function moveTargets(state, playerId, survivorId) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive || sv.owner !== playerId) return {};
  const out = {};
  for (const to of LOCATION_IDS) {
    if (to === sv.location) continue;
    const r = moveOption(state, playerId, survivorId, to);
    out[to] = r.ok ? 'ok' : r.error === 'locationFull' ? 'full' : 'blocked';
  }
  return out;
}

/** Survivors of the player who can still do something this turn (move, a die action, or their ability). */
export function actingSurvivors(state, playerId) {
  if (state.phase !== 'turn' || state.activePlayerId !== playerId) return [];
  return getPlayer(state, playerId).survivors.filter((id) => {
    const sv = state.survivors[id];
    if (!sv?.alive) return false;
    if (Object.values(moveTargets(state, playerId, id)).includes('ok')) return true;
    return survivorOptions(state, playerId, id).some((o) => o.ok);
  });
}

/** Can the player's survivor still afford an action or a move? */
export function hasEnergyLeft(state, playerId) {
  return actingSurvivors(state, playerId).length > 0;
}

/** Ask before ending a turn while something can still be done (unless the player opted out this game). */
export function shouldConfirmEndTurn(state, playerId, { skip = false } = {}) {
  return !skip && hasEnergyLeft(state, playerId);
}

// ---------------------------------------------------------------- step 11: card availability

/**
 * Can this card do anything right now (play on some target, add to the crisis, deposit)?
 * { ok, reason } — reason is the first error key when nothing is legal. Passive books are "ok"
 * as long as they can still be contributed or deposited; otherwise their reason is passiveItem.
 */
export function cardUsable(state, playerId, uid) {
  const need = cardNeeds(state, uid);
  const plays = need === 'survivor' ? cardTargets(state, playerId, uid) : [];
  const opts = cardOptions(state, playerId, uid);
  const all = [...plays, ...opts];
  if (all.some((o) => o.ok)) return { ok: true, reason: null };
  return { ok: false, reason: (plays[0] ?? opts[0])?.error ?? 'unplayable' };
}
