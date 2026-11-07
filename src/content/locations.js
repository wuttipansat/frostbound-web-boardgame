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
    zombieSlots: 3,
    deck: {
      'service-pistol': 3, 'riot-baton': 3, 'pump-shotgun': 2, 'first-aid-pouch': 2,
      'zip-ties': 2, 'canned-beans': 1, 'flare': 1, 'lost-and-found': 2,
    },
  },
  grocery: {
    id: 'grocery',
    name: 'Grocery Store',
    blurb: 'FreshCo Market. The freezers stopped mattering weeks ago.',
    survivorSlots: 4,
    zombieSlots: 3,
    deck: {
      'canned-beans': 4, 'frozen-venison': 2, 'rice-sack': 3, 'cough-syrup': 1,
      'lamp-oil': 1, 'box-cutter': 2, 'shopping-cart': 3,
    },
  },
  school: {
    id: 'school',
    name: 'School',
    blurb: 'Larkspur Elementary. Crayon drawings still cover the gym doors.',
    survivorSlots: 4,
    zombieSlots: 3,
    deck: {
      'cafeteria-tray': 3, 'canned-beans': 2, 'first-aid-pouch': 2, 'duct-tape': 2,
      'hockey-stick': 2, 'board-games': 2, 'space-heater-fuel': 1, 'rice-sack': 1,
    },
  },
  hospital: {
    id: 'hospital',
    name: 'Hospital',
    blurb: 'St. Aurelia General. The lobby lights flicker in a slow heartbeat.',
    survivorSlots: 3,
    zombieSlots: 3,
    deck: {
      'antibiotics': 3, 'first-aid-pouch': 3, 'cough-syrup': 2, 'surgical-saw': 1,
      'oxygen-tank': 1, 'saline-bags': 2, 'bedpan': 2, 'canned-beans': 1,
    },
  },
  library: {
    id: 'library',
    name: 'Library',
    blurb: 'Ashgrove Public Library. Paper burns; knowledge keeps you alive.',
    survivorSlots: 3,
    zombieSlots: 3,
    deck: {
      'old-almanac': 3, 'repair-manual': 3, 'herbal-guide': 2, 'paperback-pile': 3,
      'candle-box': 2, 'letter-opener': 1, 'canned-beans': 1,
    },
  },
  gas: {
    id: 'gas',
    name: 'Gas Station',
    blurb: 'Northstar Fuel & Snacks. The pumps are dry, the tanks underneath are not.',
    survivorSlots: 3,
    zombieSlots: 3,
    deck: {
      'jerry-can': 4, 'lamp-oil': 2, 'tire-iron': 2, 'socket-set': 2,
      'beef-jerky': 2, 'road-flare-kit': 1, 'motor-junk': 2,
    },
  },
};
