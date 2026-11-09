// createGame(config) -> a fresh, fully JSON-serializable GameState.
import { PHASES, LOCATION_IDS, RULES } from './constants.js';
import { normalizeSeed, shuffle } from './rng.js';
import { RULESETS, DANGER_DECK } from './constants.js';
import { assert } from './errors.js';
import { LOCATIONS } from '../content/locations.js';
import { SURVIVORS } from '../content/survivors.js';
import { SECRET_OBJECTIVES, EXILE_OBJECTIVES } from '../content/objectives.js';
import { SCENARIOS_BY_ID } from '../content/scenarios.js';
import { CRISES } from '../content/crises.js';
import { CROSSROADS } from '../content/crossroads.js';

export const STATE_VERSION = 1;

/**
 * @param {object} config
 * @param {{name: string, isAI?: boolean}[]} config.players  2–5 seats
 * @param {string} [config.scenarioId='beacon']
 * @param {'maybe'|'always'|'never'} [config.betrayer='maybe']
 * @param {number|string} [config.seed]
 */
export function createGame(config) {
  const players = config.players ?? [];
  assert(players.length >= RULES.MIN_PLAYERS && players.length <= RULES.MAX_PLAYERS, 'badPlayerCount');
  const scenario = SCENARIOS_BY_ID[config.scenarioId ?? 'beacon'];
  assert(scenario, 'noSuchScenario', config.scenarioId);
  const betrayerMode = config.betrayer ?? 'maybe';

  const s = {
    version: STATE_VERSION,
    rng: normalizeSeed(config.seed),
    config: { playerCount: players.length, scenarioId: scenario.id, betrayer: betrayerMode, rules: RULESETS.includes(config.rules) ? config.rules : 'classic' },
    phase: PHASES.DRAFT,
    round: 1,
    scenario: { id: scenario.id, rounds: scenario.rounds, deposited: 0 },
    morale: scenario.morale,
    maxMorale: 10,
    food: scenario.startFood,
    waste: 0,
    starvation: 0,
    helpless: scenario.helpless,
    totalKills: 0,
    players: [],
    survivors: {},
    survivorDeck: [],
    locations: {},
    cards: {},
    crisis: null,
    crisisDeck: [],
    crisisDiscard: [],
    crossroadsDeck: [],
    crossroadsDiscard: [],
    exileDeck: [],
    pendingCrossroads: null,
    vote: null,
    requests: [],
    nextRequestId: 1,
    leaderId: null,
    activePlayerId: null,
    turnsTaken: 0,
    lastExposure: null,
    reports: { colony: null, crossroads: null, vote: null },
    log: [],
    result: null,
  };

  // Item decks: one card instance per copy, keyed by a unique uid.
  let uid = 0;
  for (const locId of LOCATION_IDS) {
    const def = LOCATIONS[locId];
    const deck = [];
    if (def.deck) {
      for (const [itemId, copies] of Object.entries(def.deck)) {
        for (let i = 0; i < copies; i++) {
          const id = `c${uid++}`;
          s.cards[id] = itemId;
          deck.push(id);
        }
      }
    }
    s.locations[locId] = { zombies: 0, barricades: 0, deck: def.deck ? shuffle(s, deck) : null };
  }

  s.crisisDeck = shuffle(s, CRISES.map((c) => c.id));
  s.crossroadsDeck = shuffle(s, CROSSROADS.map((c) => c.id));
  s.exileDeck = shuffle(s, EXILE_OBJECTIVES.map((o) => o.id));

  // Secret objectives. 'maybe': n loyal + 1 betrayer shuffled, deal n (betrayer may be left out).
  const loyal = shuffle(s, SECRET_OBJECTIVES.filter((o) => o.kind === 'loyal').map((o) => o.id));
  const betrayers = shuffle(s, SECRET_OBJECTIVES.filter((o) => o.kind === 'betrayer').map((o) => o.id));
  const n = players.length;
  let pool;
  if (betrayerMode === 'never') pool = loyal.slice(0, n);
  else if (betrayerMode === 'always') pool = [...loyal.slice(0, n - 1), betrayers[0]];
  else pool = [...loyal.slice(0, n), betrayers[0]];
  pool = shuffle(s, pool);

  // Survivor draft options.
  const survivorPool = shuffle(s, SURVIVORS.map((sv) => sv.id));
  players.forEach((cfg, i) => {
    s.players.push({
      id: `p${i}`,
      name: cfg.name || `Player ${i + 1}`,
      isAI: !!cfg.isAI,
      survivors: [],
      fallen: [],
      draftOptions: survivorPool.splice(0, RULES.DRAFT_OPTIONS),
      drafted: false,
      hand: [],
      dice: [],
      objectiveId: pool[i],
      exiled: false,
      kills: 0,
      abilityUsed: {},
      usedCards: [],   // permanent cards (weapons) already used this turn
      pick: null,      // blueprint search: { locationId, uids } until one card is put back
      lastVoteRound: 0,
    });
  });
  s.survivorDeck = survivorPool;
  // Step 23: the danger deck (shuffled last, so classic games keep their exact seeds).
  if (s.config.rules === 'frostbound') {
    const deck = Object.entries(DANGER_DECK).flatMap(([kind, n]) => Array(n).fill(kind));
    s.danger = { deck: shuffle(s, deck), discard: [] };
    for (const p of s.players) { p.energy = 0; p.regenPenalty = 0; p.lastSearch = null; }
  }
  return s;
}
