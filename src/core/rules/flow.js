// Game flow (solo): pick survivors -> rounds (crisis, one turn w/ crossroads, energy) -> colony phase -> end checks.
import { PHASES, OUTSIDE_LOCATIONS, RULES } from '../constants.js';
import { shuffle, pick } from '../rng.js';
import { assert } from '../errors.js';
import { CROSSROADS_BY_ID } from '../../content/crossroads.js';
import { CRISES_BY_ID } from '../../content/crises.js';
import {
  aliveSurvivors, foodNeeded, colonyPopulation, crisisRequirement, itemOf, scenarioDef, scenarioTarget,
  focusSurvivor, teamHasAbility, energyMax, energyRegen, spawnForecast,
} from '../selectors.js';
import {
  log, changeMorale, drawFromDeck, addZombies, woundSurvivor, newSurvivor, drawItems,
} from './helpers.js';
import { applyEffects } from './effects.js';
import { evaluate, focusFilterFor } from './conditions.js';

// ---------------------------------------------------------------- draft

/** Pick the starting survivor(s) from the options on offer. */
export function draftPick(s, { survivorIds }) {
  assert(s.phase === PHASES.DRAFT, 'wrongPhase', s.phase);
  const t = s.team;
  assert(!t.drafted, 'alreadyDrafted');
  assert(Array.isArray(survivorIds) && survivorIds.length === RULES.TEAM_START
    && new Set(survivorIds).size === survivorIds.length, 'badDraft');
  assert(survivorIds.every((id) => t.draftOptions.includes(id)), 'notInDraftOptions');
  t.survivors = survivorIds.slice();
  t.drafted = true;
  finishDraft(s);
}

export function finishDraft(s) {
  const t = s.team;
  for (const id of t.survivors) s.survivors[id] = newSurvivor(id, 'colony');
  // Unpicked options go back into the survivor deck.
  s.survivorDeck.push(...t.draftOptions.filter((id) => !t.survivors.includes(id)));
  t.draftOptions = [];
  s.survivorDeck = shuffle(s, s.survivorDeck);
  log(s, 'draftDone', { survivorIds: t.survivors.slice() });
  t.energy = energyMax(s); // the team starts full
  // A few scavenged items from random locations.
  for (let i = 0; i < RULES.STARTING_HAND; i++) {
    const stocked = OUTSIDE_LOCATIONS.filter((l) => s.locations[l].deck.length);
    if (stocked.length) drawItems(s, pick(s, stocked), 1);
  }
  startRound(s);
}

// ---------------------------------------------------------------- round

export function startRound(s) {
  const crisisId = drawFromDeck(s, 'crisisDeck', 'crisisDiscard');
  s.time = 'dawn';
  s.crisis = { id: crisisId, contributions: [] };
  log(s, 'roundStart', { day: s.day, crisisId });
  beginTurn(s);
}

export function beginTurn(s) {
  const p = s.team;
  for (const sv of aliveSurvivors(s)) sv.moved = false;
  p.abilityUsed = {};
  p.usedCards = [];
  p.pick = null;
  // Regain energy (carry-over stays, capped by the pool).
  // The first turn of the game starts full, so it gets nothing extra.
  const max = energyMax(s);
  if (p.fresh) p.fresh = false;
  else p.energy = Math.min(max, p.energy + energyRegen(s));
  p.energy = Math.min(p.energy, max);
  log(s, 'energy', { value: p.energy, max });
  s.pendingCrossroads = null;

  const cardId = drawFromDeck(s, 'crossroadsDeck', 'crossroadsDiscard');
  const card = CROSSROADS_BY_ID[cardId];
  const triggered = card && evaluate(s, card.trigger);
  log(s, 'turnStart', {});
  if (triggered) {
    const focusSv = focusSurvivor(s, focusFilterFor(card.trigger)) ?? focusSurvivor(s);
    s.pendingCrossroads = { cardId, focusSurvivorId: focusSv?.id ?? null };
    s.phase = PHASES.CROSSROADS; // still dawn
    log(s, 'crossroadsTriggered', { cardId });
  } else {
    if (cardId) s.crossroadsDiscard.push(cardId);
    s.phase = PHASES.TURN;
    s.time = 'day';
  }
}

/** The player picks one of the two choices on a triggered crossroads card. */
export function resolveCrossroads(s, { choice }) {
  assert(s.phase === PHASES.CROSSROADS && s.pendingCrossroads, 'wrongPhase', s.phase);
  const pending = s.pendingCrossroads;
  const card = CROSSROADS_BY_ID[pending.cardId];
  assert(choice === 0 || choice === 1, 'badChoice');
  log(s, 'crossroadsChoice', { cardId: card.id, choice });
  s.reports.crossroads = { cardId: card.id, choice };
  s.pendingCrossroads = null;
  s.crossroadsDiscard.push(card.id);
  s.phase = PHASES.TURN;
  s.time = 'day';
  applyEffects(s, card.choices[choice].effects, { focusSurvivorId: pending.focusSurvivorId, reason: 'crossroads' });
}

export function endTurn(s) {
  log(s, 'turnEnd', {});
  colonyPhase(s);
}

// ---------------------------------------------------------------- colony phase

export function colonyPhase(s) {
  const report = { day: s.day };
  s.phase = PHASES.COLONY;
  s.time = 'dusk';

  // 1. Food
  const need = foodNeeded(s);
  report.population = colonyPopulation(s);
  report.foodNeeded = need;
  if (s.food >= need) {
    s.food -= need;
    report.fed = true;
    // A full meal lets the colony recover from one starvation token.
    if (s.starvation > 0) s.starvation -= 1;
    log(s, 'fed', { need, value: s.food });
  } else {
    s.food = 0;
    s.starvation += 1;
    report.fed = false;
    log(s, 'starvation', { need, tokens: s.starvation });
    changeMorale(s, -s.starvation, 'starvation');
  }
  report.starvation = s.starvation;

  // 3. Crisis
  report.crisis = resolveCrisis(s);

  // 4. Zombie spawns
  s.time = 'night';
  report.spawns = spawnZombies(s);

  // 5. Frostbite: the campfire cures it; out in the cold it bites deeper.
  for (const sv of Object.values(s.survivors)) {
    if (!sv.alive || !sv.frostbite) continue;
    if (sv.location === 'colony') sv.frostbite = false;
    else woundSurvivor(s, sv.id, 'frostbite');
  }

  s.reports.colony = report;
  if (s.morale <= 0) return endGame(s, 'moraleCollapse');

  // 6. Main objective, then round tracker.
  if (checkScenarioGoal(s)) return endGame(s, 'objectiveComplete');
  s.day += 1;
  if (s.day > s.scenario.days) return endGame(s, 'timeOut');
  startRound(s);
}

export function resolveCrisis(s) {
  const crisis = CRISES_BY_ID[s.crisis.id];
  const required = crisisRequirement(s);
  const revealed = shuffle(s, s.crisis.contributions);
  let score = 0;
  const cards = revealed.map((uid) => {
    const item = itemOf(s, uid);
    let delta = -1;
    if (item.type === crisis.item || item.wild) delta = 1;
    else if (item.type === 'junk' && teamHasAbility(s, 'tinkerer')) delta = 1;
    score += delta;
    return { card: s.cards[uid], type: item.type, delta };
  });
  const success = score >= required;
  const result = { crisisId: crisis.id, required, score, success, cards };
  log(s, 'crisisResolved', { crisisId: crisis.id, required, score, success });
  if (success) {
    let bonus = score >= required + 2 ? 1 : 0;
    if (teamHasAbility(s, 'inspire')) bonus += 1;
    if (bonus) changeMorale(s, bonus, 'crisisAverted');
  } else {
    applyEffects(s, crisis.fail, { reason: 'crisisFailed' });
  }
  s.crisisDiscard.push(s.crisis.id);
  s.crisis = null;
  return result;
}

export function spawnZombies(s) {
  // The same numbers the threat forecast shows (selectors.spawnForecast).
  const spawns = spawnForecast(s);
  for (const [loc, n] of Object.entries(spawns)) addZombies(s, loc, n, 'colonyPhase');
  return spawns;
}

export function checkScenarioGoal(s) {
  const goal = scenarioDef(s).goal;
  const target = scenarioTarget(s);
  switch (goal.type) {
    case 'deposit': return s.scenario.deposited >= target;
    case 'stockpile': return s.food >= target && s.locations.colony.zombies <= goal.maxColonyZombies;
    case 'kills': return s.totalKills >= target;
    default: return false;
  }
}

// ---------------------------------------------------------------- end of game

export function endGame(s, reason) {
  const won = reason === 'objectiveComplete';
  s.phase = PHASES.GAME_OVER;
  s.pendingCrossroads = null;
  s.result = { reason, won };
  log(s, 'gameOver', { reason, won });
}

/** Called by the reducer after every action: morale can collapse mid-turn. */
export function checkImmediateEnd(s) {
  if (s.phase !== PHASES.GAME_OVER && s.phase !== PHASES.DRAFT && s.morale <= 0) {
    endGame(s, 'moraleCollapse');
  }
}

