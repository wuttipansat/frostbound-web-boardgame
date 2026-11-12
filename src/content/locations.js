// Board locations. Deck composition maps item definition ids -> copies.
// `survivorSlots: null` means unlimited.

export const LOCATIONS = {
  colony: {
    id: 'colony',
    name: 'The Colony',
    blurb: 'A fenced compound around a stubborn campfire. Four gates, never enough boards.',
    survivorSlots: null,
    zombieSlots: 12, // 4 entrances x 3 slots
    entrances: 4,
    deck: null,
  },
  police: {
    id: 'police',
    name: 'Police Station',
    blurb: 'Precinct 9. The evidence locker still hums on a backup battery.',
    survivorSlots: 3,
    zombieSlots: 6,
    deck: {
      ammo: 2, crowbar: 1, scrap: 4, wood: 1, 'engine-part': 1,
      'glock-19': 2, 'riot-baton': 2, 'remington-870': 1, 'mosin-nagant': 1, 'first-aid-pouch': 2,
      'zip-ties': 2, 'canned-beans': 3, 'jerry-can': 1, bedpan: 1, 'blueprint-police': 1, 'riot-vest': 1,
    },
  },
  grocery: {
    id: 'grocery',
    name: 'Grocery Store',
    blurb: 'FreshCo Market. The freezers stopped mattering weeks ago.',
    survivorSlots: 4,
    zombieSlots: 6,
    deck: {
      coffee: 1, chocolate: 1, 'kitchen-knife': 1, cloth: 3,
      'canned-beans': 4, 'beef-jerky': 3, 'rice-sack': 2, 'first-aid-pouch': 1, 'jerry-can': 1,
      'duct-tape': 1, bedpan: 2, 'blueprint-grocery': 1, 'winter-cookbook': 1, 'padded-parka': 1,
    },
  },
  school: {
    id: 'school',
    name: 'School',
    blurb: 'Larkspur Elementary. Crayon drawings still cover the gym doors.',
    survivorSlots: 4,
    zombieSlots: 6,
    deck: {
      'baseball-bat': 1, cloth: 2, wood: 4, 'big-backpack': 1, 'heater-part': 1,
      'canned-beans': 2, 'beef-jerky': 1, 'jerry-can': 1, 'first-aid-pouch': 2, 'duct-tape': 2,
      'riot-baton': 1, bedpan: 1, 'stranger-with-child': 2, 'lone-wanderer': 1, 'blueprint-school': 1, 'winter-boots': 1, 'padded-parka': 1,
    },
  },
  hospital: {
    id: 'hospital',
    name: 'Hospital',
    blurb: 'St. Aurelia General. The lobby lights flicker in a slow heartbeat.',
    survivorSlots: 3,
    zombieSlots: 6,
    deck: {
      bandage: 2, 'first-aid-kit': 1, painkillers: 1, cloth: 3, 'heater-part': 1,
      'first-aid-pouch': 4, antibiotics: 2, 'canned-beans': 1, 'rice-sack': 1, 'jerry-can': 1,
      'zip-ties': 1, 'duct-tape': 1, bedpan: 1, 'stranger-with-child': 1, 'blueprint-hospital': 1, 'fire-axe': 1,
    },
  },
  library: {
    id: 'library',
    name: 'Library',
    blurb: 'Ashgrove Public Library. Paper burns; knowledge keeps you alive.',
    survivorSlots: 3,
    zombieSlots: 6,
    deck: {
      'city-map': 1, 'hunting-bow': 1, wood: 4, 'snow-suit': 1, 'heater-part': 1, 'engine-part': 2, flashlight: 1,
      'duct-tape': 2, 'zip-ties': 2, 'socket-set': 1, 'field-manual': 1, 'blueprint-library': 1, 'jerry-can': 2,
      'canned-beans': 1, 'rice-sack': 1, 'first-aid-pouch': 1, bedpan: 1, 'stranger-with-child': 1, 'survival-guide': 1,
    },
  },
  gas: {
    id: 'gas',
    name: 'Gas Station',
    blurb: 'Northstar Fuel & Snacks. The pumps are dry, the tanks underneath are not.',
    survivorSlots: 3,
    zombieSlots: 6,
    deck: {
      'tool-kit': 1, sled: 1, scrap: 4, 'scrap-plate': 1,
      'jerry-can': 6, 'beef-jerky': 1, 'socket-set': 1, 'riot-baton': 1, 'motor-junk': 2,
      'duct-tape': 1, 'zip-ties': 1, 'blueprint-gas': 1, 'canned-beans': 1, 'winter-boots': 1, 'fire-axe': 1,
    },
  },
  // MAP-1: places that turn up as the city grows (stage 2+).
  warehouse: {
    id: 'warehouse', name: 'Warehouse', blurb: 'Bay doors frozen half open. Pallets under drifts of snow.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { scrap: 4, wood: 3, 'tool-kit': 1, 'jerry-can': 2, 'canned-beans': 2, 'rice-sack': 1, 'zip-ties': 2, 'duct-tape': 2, 'engine-part': 1, crowbar: 1 },
  },
  motel: {
    id: 'motel', name: 'Motel', blurb: 'Pine Rest Motel. Every room key is still on its hook but one.',
    survivorSlots: 4, zombieSlots: 6,
    deck: { cloth: 4, 'canned-beans': 2, 'beef-jerky': 2, coffee: 1, bandage: 1, 'first-aid-pouch': 2, 'lone-wanderer': 1, 'padded-parka': 1, 'kitchen-knife': 1, bedpan: 1 },
  },
  apartment: {
    id: 'apartment', name: 'Apartment Block', blurb: 'Six floors of locked doors and somebody else\'s groceries.',
    survivorSlots: 4, zombieSlots: 6,
    deck: { 'canned-beans': 3, 'rice-sack': 2, chocolate: 1, cloth: 2, wood: 2, 'first-aid-pouch': 2, painkillers: 1, 'stranger-with-child': 1, 'baseball-bat': 1, 'heater-part': 1, 'winter-boots': 1 },
  },
  church: {
    id: 'church', name: 'Church', blurb: 'St. Bride\'s. The bell rope is frozen stiff; the crypt is dry.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { 'canned-beans': 3, 'rice-sack': 2, cloth: 2, bandage: 1, 'first-aid-kit': 1, 'lone-wanderer': 1, 'stranger-with-child': 1, wood: 3, 'survival-guide': 1 },
  },
  farmhouse: {
    id: 'farmhouse', name: 'Farmhouse', blurb: 'A red barn sunk in snow. The root cellar was never found.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { 'rice-sack': 3, 'canned-beans': 2, 'beef-jerky': 2, wood: 4, 'hunting-bow': 1, 'jerry-can': 2, sled: 1, 'fire-axe': 1, 'engine-part': 1 },
  },
  // MAP-6: tiered places (bigger, richer and more dangerous further in) and resource areas.
  mall: {
    id: 'mall', name: 'Shopping Mall', blurb: 'Northgate Mall. The escalators froze mid-step; the food court did not.',
    survivorSlots: 4, zombieSlots: 6,
    deck: { cloth: 4, 'padded-parka': 2, 'winter-boots': 2, 'snow-suit': 1, 'canned-beans': 3, chocolate: 2, coffee: 2, 'big-backpack': 1, flashlight: 1, 'kitchen-knife': 1, 'baseball-bat': 1, 'first-aid-pouch': 2, painkillers: 1, 'lone-wanderer': 1, 'duct-tape': 1 },
  },
  hardware: {
    id: 'hardware', name: 'Hardware Store', blurb: 'Brandt & Sons Hardware. Nails by the pound, if you can find the scale.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { 'tool-kit': 1, 'socket-set': 1, 'duct-tape': 3, 'zip-ties': 3, scrap: 3, wood: 3, 'fire-axe': 1, crowbar: 1, flashlight: 1, 'jerry-can': 1, 'heater-part': 1, 'canned-beans': 1 },
  },
  military: {
    id: 'military', name: 'Army Base', blurb: 'Camp Halden. The quarantine line held for nine days.',
    survivorSlots: 4, zombieSlots: 6,
    deck: { ammo: 4, 'remington-870': 1, 'mosin-nagant': 1, 'glock-19': 2, 'riot-vest': 1, 'first-aid-kit': 2, 'field-manual': 1, 'canned-beans': 3, 'beef-jerky': 2, 'jerry-can': 2, 'engine-part': 1, 'snow-suit': 1, 'big-backpack': 1, scrap: 2 },
  },
  factory: {
    id: 'factory', name: 'Factory', blurb: 'Keller Machine Works. The night shift never clocked out.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { scrap: 6, 'motor-junk': 2, 'engine-part': 2, 'heater-part': 1, 'tool-kit': 1, 'socket-set': 1, 'jerry-can': 2, wood: 2, 'scrap-plate': 1, 'duct-tape': 1, 'zip-ties': 1, 'canned-beans': 1 },
  },
  forest: {
    id: 'forest', name: 'Pine Woods', blurb: 'A logging track into the pines. Somebody left the woodpile neat.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { wood: 8, 'fire-axe': 1, 'hunting-bow': 1, 'beef-jerky': 1, sled: 1, 'lone-wanderer': 1, cloth: 1, 'canned-beans': 1 },
  },
  scrapyard: {
    id: 'scrapyard', name: 'Scrapyard', blurb: 'Wrecks stacked three high. The crane still has a car in its jaws.',
    survivorSlots: 3, zombieSlots: 6,
    deck: { scrap: 7, 'motor-junk': 2, 'engine-part': 1, 'scrap-plate': 1, 'jerry-can': 2, crowbar: 1, 'socket-set': 1, wood: 1, 'canned-beans': 1 },
  },
};

/**
 * GAME-1: small search spots — a house, a car, a container on the map. No barricades, few survivors, a short deck
 * (2–4 cards drawn from these weights when the spot is made), cheaper to search, a smaller zombie chance. A spot
 * that has been searched out stays empty.
 */
export const SPOT_TYPES = {
  'spot-house': {
    id: 'spot-house', name: 'Abandoned House', blurb: 'Curtains drawn, door unlocked. Someone left in a hurry.', survivorSlots: 2, zombieSlots: 2, spot: true,
    deck: { 'canned-beans': 3, cloth: 3, bandage: 2, chocolate: 2, coffee: 1, 'kitchen-knife': 1, 'padded-parka': 1, painkillers: 1, 'winter-boots': 1, flashlight: 1 },
  },
  'spot-car': {
    id: 'spot-car', name: 'Abandoned Car', blurb: 'Keys in the ignition, battery long dead.', survivorSlots: 2, zombieSlots: 2, spot: true,
    deck: { scrap: 3, 'jerry-can': 3, 'duct-tape': 1, crowbar: 1, 'socket-set': 1, chocolate: 1, 'city-map': 1, 'motor-junk': 1 },
  },
  'spot-container': {
    id: 'spot-container', name: 'Shipping Container', blurb: 'The seal is cut. Pallets inside, frost on the walls.', survivorSlots: 2, zombieSlots: 2, spot: true,
    deck: { scrap: 3, wood: 3, 'zip-ties': 1, 'tool-kit': 1, cloth: 1, 'rice-sack': 1 },
  },
};
Object.assign(LOCATIONS, SPOT_TYPES);
/** GAME-1 balance knobs for spots. */
export const SPOT_RULES = { CARDS: [2, 4], AP_SHARE: 0.6, SPAWN: 0.05, START: ['1,1', '-1,1', '0,1'], PER_GROWTH: [2, 4] };

/**
 * MAP-6: where a place type may stand and from which stage: tier 1 from the start, tier 2 from stage 2, tier 3 from
 * stage 3. Zones: core/zones.js.
 */
export const PLACE_RULES = {
  grocery: { tier: 1, zones: ['residential', 'commercial', 'outskirts'] },
  gas: { tier: 1, zones: ['outskirts', 'residential', 'industrial'] },     // on a main road at the edge of town
  farmhouse: { tier: 1, zones: ['outskirts'] },
  church: { tier: 1, zones: ['residential', 'outskirts'] },
  motel: { tier: 1, zones: ['outskirts', 'residential', 'industrial'] },   // by the highway
  apartment: { tier: 1, zones: ['residential', 'commercial'] },
  warehouse: { tier: 1, zones: ['industrial'] },
  forest: { tier: 1, zones: ['outskirts'] },
  scrapyard: { tier: 1, zones: ['industrial', 'outskirts'] },
  school: { tier: 2, zones: ['residential', 'outskirts'] },
  library: { tier: 2, zones: ['commercial', 'residential'] },
  police: { tier: 2, zones: ['commercial', 'residential'] },
  hospital: { tier: 2, zones: ['commercial', 'residential'] },
  mall: { tier: 2, zones: ['commercial'] },
  hardware: { tier: 2, zones: ['residential', 'commercial', 'industrial'] },
  military: { tier: 3, zones: ['outskirts', 'industrial'] },
  factory: { tier: 3, zones: ['industrial'] },
};
/** First stage a tier can turn up in. */
export const TIER_STAGE = { 1: 1, 2: 2, 3: 3 };

/** MAP-6: what a place is a good source of: food, wood, metal (from its deck). */
export function yieldsOf(type, items) {
  const deck = LOCATIONS[type]?.deck ?? {};
  let food = 0; let wood = 0; let metal = 0;
  for (const [id, n] of Object.entries(deck)) {
    if (items[id]?.type === 'food' || items[id]?.counts === 'food') food += n;
    if (id === 'wood') wood += n;
    if (id === 'scrap' || id === 'motor-junk' || id === 'scrap-plate') metal += n;
  }
  return { food: food >= 5, wood: wood >= 4, metal: metal >= 5 };
}

/** MAP-1: place types for new blocks: [type, weight at stage 2, extra weight per stage]. */
export const PLACE_TABLE = [
  ['grocery', 2, 0], ['school', 1, 0], ['gas', 2, 0], ['library', 1, 0], ['police', 1, 0.5], ['hospital', 1, 0.5],
  ['warehouse', 3, 0.5], ['motel', 2, 0.5], ['apartment', 3, 1], ['church', 1, 0.5], ['farmhouse', 1, 1],
  ['mall', 1, 0.5], ['hardware', 2, 0], ['military', 1, 0.5], ['factory', 1, 0.5], ['forest', 2, 0.5], ['scrapyard', 2, 0.5],
];
/** Blocks without a place. */
export const FILLER_KINDS = ['plaza', 'parking', 'containers', 'park', 'ruins', 'rail', 'shops'];
