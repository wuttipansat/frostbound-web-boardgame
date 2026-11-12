// createGame(config) -> a fresh, fully JSON-serializable GameState.
import { PHASES, RULES, DIFFICULTY } from './constants.js';
import { newMap, mapPlaces, addSpots } from './map.js';
import { random, normalizeSeed, shuffle } from './rng.js';
import { assert } from './errors.js';
import { LOCATIONS, SPOT_RULES, PLACE_RULES, SEARCH_BATCHES } from '../content/locations.js';
import { ITEMS } from '../content/items.js';
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
    map: { ...newMap(!!config.fullTown), look: normalizeSeed(config.seed) }, // MAP-1: the city grows a stage per map found (fullTown: the old six places); look seeds its scenery (MAP-3 E)
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
  for (const locId of mapPlaces(s.map)) s.locations[locId] = stockPlace(s, locId, locId, 'c');
  // GAME-1: a few search spots near the colony (new games only; the old six-place town has none).
  if (!config.fullTown) addSpots(s, SPOT_RULES.START, SPOT_RULES.START.length, (type, block, i, rand) => makeSpot(s, type, rand));

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
/** GAME-1: a search spot: a new location with a short deck (2–4 cards by weight). Returns its id. */
export function makeSpot(s, type, rand) {
  let id = type; for (let k = 2; s.locations[id]; k++) id = `${type}-${k}`;
  const weights = Object.entries(LOCATIONS[type].deck);
  const total = weights.reduce((a, [, w]) => a + w, 0);
  const [lo, hi] = SPOT_RULES.CARDS; const n = lo + Math.floor(rand() * (hi - lo + 1));
  const deck = [];
  for (let k = 0; k < n; k++) {
    let r = rand() * total; const itemId = (weights.find(([, w]) => (r -= w) < 0) ?? weights[0])[0];
    const uid = `s${id}.${k}`; s.cards[uid] = itemId; deck.push(uid);
  }
  s.locations[id] = { zombies: 0, barricades: 0, deck, type, batches: [deck.length] }; // GAME-1: one find, all at once
  return id;
}

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
  // GAME-1: a place holds 6–15 finds by its size (tier 1: 6–8, tier 2: 9–11, tier 3: 12–15), each 2–4 items; its deck
  // is topped up with common items from its own table so the finds average 3 items.
  let batches = null;
  if (def.deck) {
    const [lo, hi] = SEARCH_BATCHES[PLACE_RULES[type]?.tier ?? 1];
    let b = lo + Math.floor(random(s) * (hi - lo + 1));
    b = Math.max(b, Math.ceil(deck.length / 4));
    const common = Object.entries(def.deck).filter(([itemId]) => !RARE.includes(itemId) && !itemId.startsWith('blueprint-') && ITEMS[itemId]?.type !== 'survivor');
    const total = common.reduce((a, [, w]) => a + w, 0);
    while (common.length && deck.length < b * 3) {
      let r = random(s) * total; const itemId = (common.find(([, w]) => (r -= w) < 0) ?? common[0])[0];
      const uid = prefix === 'c' ? `c${Object.keys(s.cards).length}` : `${prefix}${id}.${n++}`;
      s.cards[uid] = itemId; deck.push(uid);
    }
    batches = Array(b).fill(2); let left = deck.length - 2 * b;
    for (let guard = 0; left > 0 && guard < 1000; guard++) { const k = Math.floor(random(s) * b); if (batches[k] < 4) { batches[k]++; left--; } }
    if (left > 0) batches[batches.length - 1] += left;
  }
  // The crawler's rare parts lie deep: somewhere in the lower half of their pile (decks are drawn from the end).
  const pile = def.deck ? shuffle(s, deck) : null;
  if (pile) {
    for (const uid of pile.filter((u) => RARE.includes(s.cards[u]))) {
      pile.splice(pile.indexOf(uid), 1);
      pile.splice(Math.floor(random(s) * (pile.length / 2)), 0, uid);
    }
  }
  const loc = { zombies, barricades: 0, deck: pile, batches };
  if (type !== id) loc.type = type;
  return loc;
}
