// Pure helpers that work out which UI actions are available. Legality always comes from the
// rules engine itself (tryReduce), so the UI can never offer an illegal move or hide a legal one.
import * as act from '../core/actions.js';
import { tryReduce } from '../core/reducer.js';
import { getPlayer, survivorDef, itemOf, scenarioDef } from '../core/selectors.js';
import { LOCATION_IDS } from '../core/constants.js';

const check = (state, action) => {
  const r = tryReduce(state, action);
  return { action, ok: r.ok, error: r.ok ? null : r.error };
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
  const dieAction = (id, min, make) => {
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
  if (item.type !== 'fuel') {
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
  const type = itemOf(state, uid).type;
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
    if (!sv.moved && Object.values(moveTargets(state, playerId, id)).includes('ok')) return true;
    return survivorOptions(state, playerId, id).some((o) => o.ok);
  });
}

export function unusedDice(state, playerId) {
  return getPlayer(state, playerId).dice.filter((d) => !d.used).length;
}

/** Ask before ending a turn while dice are still unused (unless the player opted out this game). */
export function shouldConfirmEndTurn(state, playerId, { skip = false } = {}) {
  return !skip && unusedDice(state, playerId) > 0;
}
