// createGame(config) -> a fresh, fully JSON-serializable GameState.
import { PHASES, LOCATION_IDS, RULES } from './constants.js';
import { normalizeSeed, shuffle } from './rng.js';
import { DANGER_DECK } from './constants.js';
import { assert } from './errors.js';
import { LOCATIONS } from '../content/locations.js';
import { SURVIVORS } from '../content/survivors.js';
import { SCENARIOS_BY_ID } from '../content/scenarios.js';
import { CRISES } from '../content/crises.js';
import { CROSSROADS } from '../content/crossroads.js';

export const STATE_VERSION = 3; // 3: solo game (s.team, no players / votes / objectives)

/**
 * A solo game: one player controls the whole team of survivors.
 * @param {object} [config]
 * @param {string} [config.scenarioId='beacon']
 * @param {number|string} [config.seed]
 */
export function createGame(config = {}) {
  const scenario = SCENARIOS_BY_ID[config.scenarioId ?? 'beacon'];
  assert(scenario, 'noSuchScenario', config.scenarioId);

  const s = {
    version: STATE_VERSION,
    rng: normalizeSeed(config.seed),
    config: { scenarioId: scenario.id },
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
    team: null,
    survivors: {},
    survivorDeck: [],
    locations: {},
    cards: {},
    crisis: null,
    crisisDeck: [],
    crisisDiscard: [],
    crossroadsDeck: [],
    crossroadsDiscard: [],
    pendingCrossroads: null,
    lastExposure: null,
    reports: { colony: null, crossroads: null },
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

  // The survivors on offer at the start.
  const survivorPool = shuffle(s, SURVIVORS.map((sv) => sv.id));
  s.team = {
    survivors: [],
    fallen: [],
    draftOptions: survivorPool.splice(0, RULES.DRAFT_OPTIONS),
    drafted: false,
    hand: [],
    energy: 0,       // the survivor's energy (set when the draft ends)
    regenPenalty: 0, // a frost card: lower regen next turn
    fresh: true,     // the first turn starts full
    gear: { weapon: null, armor: null, book: null }, // equipped item uids
    kills: 0,
    abilityUsed: {},
    usedCards: [],
    pick: null,      // blueprint search: { locationId, uids } until one card is put back
  };
  s.survivorDeck = survivorPool;
  // The shared danger deck.
  const deck = Object.entries(DANGER_DECK).flatMap(([kind, n]) => Array(n).fill(kind));
  s.danger = { deck: shuffle(s, deck), discard: [] };
  return s;
}
