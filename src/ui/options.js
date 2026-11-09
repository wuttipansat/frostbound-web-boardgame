// Pure helpers that work out which UI actions are available. Legality always comes from the
// rules engine itself (tryReduce), so the UI can never offer an illegal move or hide a legal one.
import * as act from '../core/actions.js';
import { tryReduce } from '../core/reducer.js';
import { getPlayer, survivorDef, itemOf, scenarioDef, isFrostbound, actionCost } from '../core/selectors.js';
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

/** Lowest unused die with value >= min (keeps high dice for harder actions). Respects a preferred index. */
export function pickDie(state, playerId, min = 1, preferred = null) {
  const dice = getPlayer(state, playerId).dice;
  if (preferred != null && dice[preferred] && !dice[preferred].used) return preferred;
  let best = null;
  dice.forEach((d, i) => {
    if (!d.used && d.v >= min && (best == null || d.v < dice[best].v)) best = i;
  });
  return best;
}

/**
 * Die actions + ability for one survivor. Each option: { id, action, ok, error, min, die }.
 * `dieIndex` forces a specific die; otherwise the cheapest sufficient die is used.
 */
export function survivorOptions(state, playerId, survivorId, { dieIndex = null, lureTo = null } = {}) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return [];
  const def = survivorDef(survivorId);
  const out = [];
  const fb = isFrostbound(state);
  const dieAction = (id, min, make) => {
    if (fb) {
      // Frostbound: no dice, an energy cost (the engine checks it; the error says why).
      const action = make(0);
      out.push({ id, min: 0, die: null, cost: actionCost(state, survivorId, id), ...check(state, action) });
      return;
    }
    const die = pickDie(state, playerId, min, dieIndex);
    const action = make(die ?? 0);
    const res = die == null ? { action, ok: false, error: min > 1 ? 'dieTooLow' : 'noSuchDie' } : check(state, action);
    out.push({ id, min, die, ...res });
  };
  dieAction('attack', def.attack, (d) => act.attack(playerId, survivorId, d));
  dieAction('search', def.search, (d) => act.search(playerId, survivorId, d));
  dieAction('barricade', 1, (d) => act.barricade(playerId, survivorId, d));
  dieAction('clean', 1, (d) => act.clean(playerId, survivorId, d));
  const lureTarget = lureTo ?? LOCATION_IDS.find((l) => l !== sv.location);
  dieAction('lure', 1, (d) => act.lure(playerId, survivorId, d, lureTarget));
  if (def.ability.type === 'healer') {
    const patients = Object.values(state.survivors)
      .filter((o) => o.alive && o.location === sv.location && (o.wounds > 0 || o.frostbite));
    const target = patients[0];
    const action = act.useAbility(playerId, survivorId, target?.id ?? survivorId);
    out.push({ id: 'ability', min: 0, die: null, ...(target ? check(state, action) : { action, ok: false, error: 'notWounded' }) });
  }
  // Frostbound: right after a search, "search deeper" (free: one more card, then a danger card).
  const ls = fb ? getPlayer(state, playerId).lastSearch : null;
  if (ls && ls.survivorId === survivorId && ls.locationId === sv.location) {
    out.push({ id: 'deeper', min: 0, die: null, cost: 0, ...check(state, act.searchDeeper(playerId, survivorId)) });
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
 * What can be done with a card: play (needs a target survivor or die for some types), contribute, deposit.
 */
export function cardOptions(state, playerId, uid, { survivorId = null, dieIndex = null } = {}) {
  const item = itemOf(state, uid);
  const out = [];
  if (item.type !== 'fuel' && item.type !== 'book') {
    const opts = {};
    if (['medicine', 'tools', 'weapon'].includes(item.type)) opts.targetSurvivorId = survivorId;
    if (item.type === 'junk') opts.dieIndex = pickDie(state, playerId, 1, dieIndex) ?? 0;
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

const TARGETED = ['medicine', 'tools', 'weapon'];

/** Does playing this card need the player to choose something (a survivor, or a die for junk)? */
export function cardNeeds(state, uid) {
  const item = itemOf(state, uid);
  const type = item.type;
  if (type === 'weapon' && item.range === 'any') return 'location';
  if (TARGETED.includes(type)) return 'survivor';
  if (type === 'junk') return 'die';
  return null;
}

/** Every survivor the card could be played on, with legality and the action to dispatch. */
export function cardTargets(state, playerId, uid) {
  if (cardNeeds(state, uid) !== 'survivor') return [];
  return getPlayer(state, playerId).survivors
    .filter((id) => state.survivors[id]?.alive)
    .map((survivorId) => ({ survivorId, ...check(state, act.playCard(playerId, uid, { targetSurvivorId: survivorId })) }));
}

/** Locations a long gun can shoot into (any location, legal where there are zombies). */
export function cardLocations(state, playerId, uid) {
  if (cardNeeds(state, uid) !== 'location') return [];
  return LOCATION_IDS.map((to) => ({ to, zombies: state.locations[to].zombies, ...check(state, act.playCard(playerId, uid, { targetLocation: to })) }));
}

/** The reroll action for a junk card and the chosen dice (one, or two for stronger junk). */
export function junkAction(playerId, uid, picked) {
  return act.playCard(playerId, uid, { dieIndex: picked[0], ...(picked.length > 1 ? { dieIndex2: picked[1] } : {}) });
}

/** Dice a junk card can reroll. */
export function cardDice(state, playerId, uid) {
  if (cardNeeds(state, uid) !== 'die') return [];
  return getPlayer(state, playerId).dice.map((d, dieIndex) => ({ dieIndex, value: d.v, ...check(state, act.playCard(playerId, uid, { dieIndex })) }));
}

/** Where a survivor could lure zombies to (with the die that would be used). */
export function lureTargets(state, playerId, survivorId, dieIndex = null) {
  const sv = state.survivors[survivorId];
  if (!sv?.alive) return [];
  const die = pickDie(state, playerId, 1, dieIndex);
  return LOCATION_IDS.filter((l) => l !== sv.location).map((to) => ({
    to, die, ...(die == null ? { ok: false, error: 'noSuchDie', action: null } : check(state, act.lure(playerId, survivorId, die, to))),
  }));
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
    if ((!sv.moved || isFrostbound(state)) && Object.values(moveTargets(state, playerId, id)).includes('ok')) return true;
    return survivorOptions(state, playerId, id).some((o) => o.ok);
  });
}

export function unusedDice(state, playerId) {
  return getPlayer(state, playerId).dice.filter((d) => !d.used).length;
}

/** Frostbound: can any of the player's survivors still afford an action (or move)? */
export function hasEnergyLeft(state, playerId) {
  if (!isFrostbound(state)) return false;
  return actingSurvivors(state, playerId).length > 0;
}

/** Ask before ending a turn while dice are still unused (unless the player opted out this game). */
export function shouldConfirmEndTurn(state, playerId, { skip = false } = {}) {
  if (skip) return false;
  return isFrostbound(state) ? hasEnergyLeft(state, playerId) : unusedDice(state, playerId) > 0;
}

// ---------------------------------------------------------------- step 11: card availability

/**
 * Can this card do anything right now (play on some target, add to the crisis, deposit)?
 * { ok, reason } — reason is the first error key when nothing is legal. Passive books are "ok"
 * as long as they can still be contributed or deposited; otherwise their reason is passiveItem.
 */
export function cardUsable(state, playerId, uid) {
  const need = cardNeeds(state, uid);
  const plays = need === 'survivor' ? cardTargets(state, playerId, uid)
    : need === 'location' ? cardLocations(state, playerId, uid)
      : need === 'die' ? cardDice(state, playerId, uid)
        : [];
  const opts = cardOptions(state, playerId, uid);
  const all = [...plays, ...opts];
  if (all.some((o) => o.ok)) return { ok: true, reason: null };
  return { ok: false, reason: (plays[0] ?? opts[0])?.error ?? 'unplayable' };
}
