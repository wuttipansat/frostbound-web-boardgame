// Game flow: draft -> rounds (crisis, turns w/ crossroads, energy) -> colony phase -> end checks.
import { PHASES, OUTSIDE_LOCATIONS, RULES } from '../constants.js';
import { shuffle, pick } from '../rng.js';
import { CROSSROADS_BY_ID } from '../../content/crossroads.js';
import { CRISES_BY_ID } from '../../content/crises.js';
import {
  getPlayer, nextPlayer, survivorDef, survivorsAt, aliveSurvivorsOf, foodNeeded,
  colonyPopulation, crisisRequirement, itemOf, scenarioDef, scenarioTarget, objectiveDef,
  focusSurvivor, playerHasAbility, energyMax, energyRegen, spawnForecast,
} from '../selectors.js';
import {
  log, changeMorale, drawFromDeck, addZombies, woundSurvivor, newSurvivor, drawItems, addDangerCard,
} from './helpers.js';
import { DANGER_ESCALATION } from '../constants.js';
import { applyEffects } from './effects.js';
import { evaluate, focusFilterFor } from './conditions.js';

// ---------------------------------------------------------------- draft

export function finishDraft(s) {
  for (const p of s.players) {
    for (const id of p.survivors) s.survivors[id] = newSurvivor(id, p.id, 'colony');
    // Unpicked options go back into the survivor deck.
    s.survivorDeck.push(...p.draftOptions.filter((id) => !p.survivors.includes(id)));
    p.draftOptions = [];
  }
  s.survivorDeck = shuffle(s, s.survivorDeck);
  // First player: whoever controls the most influential survivor.
  let best = null;
  for (const p of s.players) {
    for (const id of p.survivors) {
      const inf = survivorDef(id).influence;
      if (!best || inf > best.inf) best = { inf, pid: p.id };
    }
  }
  s.leaderId = best.pid;
  log(s, 'draftDone', { leaderId: s.leaderId });
  for (const p of s.players) p.energy = energyMax(s, p.id); // everyone starts full
  // Everyone starts with a few scavenged items from random locations.
  for (const p of s.players) {
    for (let i = 0; i < RULES.STARTING_HAND; i++) {
      const stocked = OUTSIDE_LOCATIONS.filter((l) => s.locations[l].deck.length);
      if (stocked.length) drawItems(s, p.id, pick(s, stocked), 1);
    }
  }
  startRound(s);
}

// ---------------------------------------------------------------- round

export function startRound(s) {
  s.turnsTaken = 0;
  s.requests = [];
  const crisisId = drawFromDeck(s, 'crisisDeck', 'crisisDiscard');
  s.crisis = { id: crisisId, contributions: [] };
  log(s, 'roundStart', { round: s.round, crisisId, leaderId: s.leaderId });
  s.activePlayerId = s.leaderId;
  beginTurn(s);
}

export function beginTurn(s) {
  const p = getPlayer(s, s.activePlayerId);
  for (const sv of aliveSurvivorsOf(s, p.id)) sv.moved = false;
  p.abilityUsed = {};
  p.usedCards = [];
  p.pick = null;
  // Regain energy (carry-over stays, capped by the survivor's pool); a frost card's penalty applies once.
  // The first turn of the game starts full, so it gets nothing extra.
  const max = energyMax(s, p.id);
  if (p.fresh) p.fresh = false;
  else p.energy = Math.min(max, p.energy + energyRegen(s, p.id));
  p.energy = Math.min(p.energy, max);
  p.regenPenalty = 0;
  log(s, 'energy', { playerId: p.id, value: p.energy, max });
  s.pendingCrossroads = null;

  const reader = nextPlayer(s, p.id);
  const cardId = drawFromDeck(s, 'crossroadsDeck', 'crossroadsDiscard');
  const card = CROSSROADS_BY_ID[cardId];
  const triggered = card && evaluate(s, p.id, card.trigger);
  log(s, 'turnStart', { playerId: p.id });
  if (triggered) {
    const focusSv = focusSurvivor(s, p.id, focusFilterFor(card.trigger)) ?? focusSurvivor(s, p.id);
    s.pendingCrossroads = {
      cardId, activePlayerId: p.id, readerId: reader.id, focusSurvivorId: focusSv?.id ?? null,
    };
    s.phase = PHASES.CROSSROADS;
    log(s, 'crossroadsTriggered', { cardId, playerId: p.id, readerId: reader.id });
  } else {
    if (cardId) s.crossroadsDiscard.push(cardId);
    s.phase = PHASES.TURN;
  }
}

export function endTurn(s) {
  log(s, 'turnEnd', { playerId: s.activePlayerId });
  s.turnsTaken += 1;
  if (s.turnsTaken >= s.players.length) {
    colonyPhase(s);
    return;
  }
  s.activePlayerId = nextPlayer(s, s.activePlayerId).id;
  beginTurn(s);
}

// ---------------------------------------------------------------- colony phase

export function colonyPhase(s) {
  const report = { round: s.round };
  s.phase = PHASES.COLONY;

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

  // 2. Waste
  const wasteLoss = Math.floor(s.waste / RULES.WASTE_PER_MORALE);
  report.wasteLoss = wasteLoss;
  if (wasteLoss) changeMorale(s, -wasteLoss, 'waste');

  // 3. Crisis
  report.crisis = resolveCrisis(s);

  // 4. Zombie spawns
  report.spawns = spawnZombies(s);

  // 5. Frostbite: the campfire cures it; out in the cold it bites deeper.
  for (const sv of Object.values(s.survivors)) {
    if (!sv.alive || !sv.frostbite) continue;
    if (sv.location === 'colony') sv.frostbite = false;
    else woundSurvivor(s, sv.id, 'frostbite');
  }

  // 6. Frostbound: the danger deck gets meaner as the winter goes on.
  if (DANGER_ESCALATION[s.round]) addDangerCard(s, DANGER_ESCALATION[s.round], 'winter');

  s.reports.colony = report;
  if (s.morale <= 0) return endGame(s, 'moraleCollapse');

  // 6. Main objective, then round tracker.
  if (checkScenarioGoal(s)) return endGame(s, 'objectiveComplete');
  s.round += 1;
  if (s.round > s.scenario.rounds) return endGame(s, 'timeOut');

  s.leaderId = nextPlayer(s, s.leaderId).id;
  startRound(s);
}

export function resolveCrisis(s) {
  const crisis = CRISES_BY_ID[s.crisis.id];
  const required = crisisRequirement(s);
  const revealed = shuffle(s, s.crisis.contributions);
  let score = 0;
  const cards = revealed.map(({ uid, playerId }) => {
    const item = itemOf(s, uid);
    let delta = -1;
    if (item.type === crisis.item || item.wild) delta = 1;
    else if (item.type === 'junk' && playerHasAbility(s, playerId, 'tinkerer')) delta = 1;
    score += delta;
    return { card: s.cards[uid], type: item.type, delta };
  });
  s.waste += revealed.length;
  const success = score >= required;
  const result = { crisisId: crisis.id, required, score, success, cards };
  log(s, 'crisisResolved', { crisisId: crisis.id, required, score, success });
  if (success) {
    let bonus = score >= required + 2 ? 1 : 0;
    if (s.players.some((p) => playerHasAbility(s, p.id, 'inspire'))) bonus += 1;
    if (bonus) changeMorale(s, bonus, 'crisisAverted');
  } else {
    applyEffects(s, crisis.fail, { reason: 'crisisFailed' });
    addDangerCard(s, 'scratch', 'crisisFailed');
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
  const colonyFell = reason !== 'objectiveComplete';
  const outcomes = s.players.map((p) => {
    const obj = objectiveDef(p.objectiveId);
    const met = evaluate(s, p.id, obj.condition);
    const won = obj.kind === 'betrayer' ? colonyFell && met : !colonyFell && met;
    return { playerId: p.id, objectiveId: obj.id, kind: obj.kind, objectiveMet: met, won };
  });
  s.phase = PHASES.GAME_OVER;
  s.pendingCrossroads = null;
  s.vote = null;
  s.result = { reason, winners: outcomes.filter((o) => o.won).map((o) => o.playerId), outcomes };
  log(s, 'gameOver', { reason, winners: s.result.winners });
}

/** Called by the reducer after every action: morale can collapse mid-turn. */
export function checkImmediateEnd(s) {
  if (s.phase !== PHASES.GAME_OVER && s.phase !== PHASES.DRAFT && s.morale <= 0) {
    endGame(s, 'moraleCollapse');
  }
}

