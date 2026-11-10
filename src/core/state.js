// createGame(config) -> a fresh, fully JSON-serializable GameState.
import { PHASES, LOCATION_IDS, RULES, DIFFICULTY } from './constants.js';
import { newMap } from './map.js';
import { random, normalizeSeed, shuffle } from './rng.js';
import { assert } from './errors.js';
import { LOCATIONS } from '../content/locations.js';
import { SURVIVORS } from '../content/survivors.js';
import { SCENARIOS_BY_ID } from '../content/scenarios.js';
import { CRISES } from '../content/crises.js';
import { CROSSROADS } from '../content/crossroads.js';

export const STATE_VERSION = 4; // 4: solo, no waste, no danger deck

/**
 * A solo game: one player controls the whole team of survivors.
 * @param {object} [config]
 * @param {string} [config.scenarioId='beacon']
 * @param {number|string} [config.seed]
 */
const RARE = ['engine-part', 'heater-part'];

export function createGame(config = {}) {
  const scenario = SCENARIOS_BY_ID[config.scenarioId ?? 'beacon'];
  assert(scenario, 'noSuchScenario', config.scenarioId);

  const s = {
    version: STATE_VERSION,
    rng: normalizeSeed(config.seed),
    config: { scenarioId: scenario.id, difficulty: config.difficulty ?? 'normal' },
    difficulty: DIFFICULTY[config.difficulty] ? config.difficulty : 'normal',
    phase: PHASES.DRAFT,
    day: 1,
    time: 'dawn', // dawn | day | dusk | night
    map: newMap(), // MAP-1: the city grows a stage per map found
    scenario: { id: scenario.id, days: config.days ?? scenario.days, deposited: 0 }, // 0 = endless winter
    morale: Math.min(10, scenario.morale + (DIFFICULTY[config.difficulty]?.morale ?? 0)),
    maxMorale: 10,
    food: Math.max(0, scenario.startFood + (DIFFICULTY[config.difficulty]?.food ?? 0)),
    stats: { kills: 0, searches: 0, builds: 0, crafts: 0, missions: 0 },
    bonds: {},     // 'a|b' -> nights spent at the same place (max 5)
    mission: null, // { id, stat, target, base, until }
    starvation: 0,
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
    reports: { colony: null, crossroads: null },
    log: [],
    result: null,
  };

  // Item decks: one card instance per copy, keyed by a unique uid.
  for (const locId of LOCATION_IDS) s.locations[locId] = stockPlace(s, locId, locId, 'c');

  s.crisisDeck = shuffle(s, CRISES.map((c) => c.id));
  s.crossroadsDeck = shuffle(s, CROSSROADS.map((c) => c.id));

  // The survivors on offer at the start.
  const survivorPool = shuffle(s, SURVIVORS.map((sv) => sv.id));
  s.team = {
    survivors: [],
    fallen: [],
    draftOptions: survivorPool.splice(0, RULES.DRAFT_OPTIONS),
    drafted: false,
    kills: 0,
    abilityUsed: {},
    usedCards: [],
    pick: null,      // blueprint search: { locationId, uids } until one card is put back
  };
  s.base = { crawler: 0, dorm: 0, wall: 0, greenhouse: 0, workshop: 0, infirmary: 0, radio: 0 };
  s.building = {}; // AP already put into the next level: { [buildingId]: n } (materials paid)
  s.stockpile = []; // items at the colony (they count only once carried home)
  s.searches = {};  // searches per location today (each extra one raises the zombie chance)
  s.survivorDeck = survivorPool;
  return s;
}

/** A fresh place of `type`: zombies, barricades and its shuffled item pile (uids prefixed so they stay unique). */
export function stockPlace(s, id, type, prefix, zombies = 0) {
  const def = LOCATIONS[type];
  const deck = [];
  let n = 0;
  if (def.deck) {
    for (const [itemId, copies] of Object.entries(def.deck)) {
      for (let i = 0; i < copies; i++) {
        const uid = prefix === 'c' ? `c${Object.keys(s.cards).length}` : `${prefix}${id}.${n++}`;
        s.cards[uid] = itemId;
        deck.push(uid);
      }
    }
  }
  // The crawler's rare parts lie deep: somewhere in the lower half of their pile (decks are drawn from the end).
  const pile = def.deck ? shuffle(s, deck) : null;
  if (pile) {
    for (const uid of pile.filter((u) => RARE.includes(s.cards[u]))) {
      pile.splice(pile.indexOf(uid), 1);
      pile.splice(Math.floor(random(s) * (pile.length / 2)), 0, uid);
    }
  }
  const loc = { zombies, barricades: 0, deck: pile };
  if (type !== id) loc.type = type;
  return loc;
}
