// UI-2: plain answers for the UI — the next-step line, why an action can't be done, and whether
// anything useful is left this turn. Ids and numbers only (the UI words them), so the Godot port
// can be checked against these exactly (golden steps carry a `ux` snapshot).
import { tryReduce } from './reducer.js';
import * as act from './actions.js';
import { BUILD_STEP } from './constants.js';
import { actionCost, nextLevel, packSize, aliveSurvivors, foodNeeded, crisisDef, crisisRequirement, crisisScore, siegeForecast, baseLevel, survivorDef } from './selectors.js';
import { RECIPES } from '../content/items.js';
import { BUILDING_IDS } from '../content/buildings.js';

const KIND = { ATTACK: 'attack', SEARCH: 'search', BARRICADE: 'barricade', LURE: 'lure' };

/** AP an action takes (null when it has no AP price). */
export function apNeed(s, a) {
  const id = a.survivorId;
  if (!id || !s.survivors[id]) return null;
  if (a.type === 'MOVE') return actionCost(s, id, 'move', a.toLocation);
  if (KIND[a.type]) return actionCost(s, id, KIND[a.type]);
  if (a.type === 'BUILD') {
    const nx = nextLevel(s, a.buildingId);
    return nx ? Math.min(BUILD_STEP, nx.ap - (nx.started ? nx.spent : 0)) : null;
  }
  if (a.type === 'CRAFT') {
    const r = RECIPES[a.recipeId];
    return r ? Math.max(1, r.ap - 3 * (baseLevel(s, 'workshop') - 1)) : null;
  }
  return null;
}

/** null when the action is legal, else { key, params }: the engine's reason, with numbers where they help. */
export function whyDisabled(s, a) {
  const r = tryReduce(s, a);
  if (r.ok) return null;
  if (r.error === 'notEnoughEnergy') {
    const need = apNeed(s, a);
    if (need != null) return { key: 'ux.energy', params: { need, have: s.survivors[a.survivorId].ap } };
  }
  if (r.error === 'packFull') {
    const who = a.toSurvivorId ?? a.survivorId;
    if (who && s.survivors[who]) return { key: 'ux.packFull', params: { n: packSize(s, who) } };
  }
  return { key: `err.${r.error}`, params: {} };
}

/** Buildings the colony can work on, in panel order. */
const buildIds = (s) => (s.scenario.id === 'crawler' ? ['crawler', ...BUILDING_IDS] : [...BUILDING_IDS]);

/**
 * The first useful thing the team can still do this turn (moves don't count):
 * { survivorId, kind: attack | search | heal | barricade (colony, when the night attack gets in) | build, locationId, buildingId? } or null.
 */
export function usefulActionLeft(s) {
  if (s.phase !== 'turn') return null;
  for (const id of s.team.survivors) {
    const sv = s.survivors[id];
    if (!sv?.alive) continue;
    const at = sv.location;
    const out = (kind, extra = {}) => ({ survivorId: id, kind, locationId: at, ...extra });
    if ((s.locations[at]?.zombies ?? 0) > 0 && tryReduce(s, act.attack(id)).ok) return out('attack');
    if (at !== 'colony' && tryReduce(s, act.search(id)).ok) return out('search');
    if (survivorDef(id).ability.type === 'healer') {
      const patient = s.team.survivors.find((o) => s.survivors[o]?.alive && s.survivors[o].location === at && (s.survivors[o].wounds > 0 || s.survivors[o].frostbite));
      if (patient && tryReduce(s, act.useAbility(id, patient)).ok) return out('heal', { targetId: patient });
    }
    if (at === 'colony' && siegeForecast(s).hits > 0 && tryReduce(s, act.barricade(id)).ok) return out('barricade');
    if (at === 'colony') {
      const bid = buildIds(s).find((b) => tryReduce(s, act.build(b, id)).ok);
      if (bid) return out('build', { buildingId: bid });
    }
  }
  return null;
}

/** The next-step line: [{ key, params }] — AP left, the useful thing to do, and the most urgent worry. */
export function nextHint(s) {
  if (s.phase !== 'turn') return [];
  const parts = [{ key: 'nh.ap', params: { n: aliveSurvivors(s).reduce((n, sv) => n + (sv.ap ?? 0), 0) } }];
  const u = usefulActionLeft(s);
  if (u) {
    const params = { sv: u.survivorId, place: u.locationId };
    if (u.buildingId) params.bld = u.buildingId;
    parts.push({ key: `nh.${u.kind}`, params });
  } else parts.push({ key: 'nh.end', params: {} });
  const need = foodNeeded(s);
  const req = crisisDef(s) ? crisisRequirement(s) : 0;
  const siege = siegeForecast(s);
  if (s.food < need) parts.push({ key: 'nh.food', params: { have: s.food, need } });
  else if (req && crisisScore(s) < req) parts.push({ key: 'nh.crisis', params: { k: crisisScore(s), n: req } });
  else if (siege.hits > 0) parts.push({ key: 'nh.siege', params: { n: siege.hits } });
  return parts;
}

/** Everything above for one state (the golden-step parity snapshot). */
export function uxSnapshot(s) {
  const why = [];
  for (const id of s.team?.survivors ?? []) {
    if (!s.survivors[id]?.alive) continue;
    for (const a of [act.attack(id), act.search(id), act.barricade(id), act.move(id, 'colony'), act.build('wall', id)]) why.push(whyDisabled(s, a));
  }
  return { hint: nextHint(s), useful: usefulActionLeft(s), why };
}
