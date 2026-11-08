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
      'glock-19': 2, 'riot-baton': 2, 'remington-870': 1, 'mosin-nagant': 1, 'first-aid-pouch': 2,
      'zip-ties': 2, 'canned-beans': 3, 'jerry-can': 1, bedpan: 1, 'blueprint-police': 1,
    },
  },
  grocery: {
    id: 'grocery',
    name: 'Grocery Store',
    blurb: 'FreshCo Market. The freezers stopped mattering weeks ago.',
    survivorSlots: 4,
    zombieSlots: 3,
    deck: {
      'canned-beans': 4, 'beef-jerky': 3, 'rice-sack': 2, 'first-aid-pouch': 1, 'jerry-can': 1,
      'duct-tape': 1, bedpan: 2, 'blueprint-grocery': 1, 'winter-cookbook': 1,
    },
  },
  school: {
    id: 'school',
    name: 'School',
    blurb: 'Larkspur Elementary. Crayon drawings still cover the gym doors.',
    survivorSlots: 4,
    zombieSlots: 3,
    deck: {
      'canned-beans': 2, 'beef-jerky': 1, 'jerry-can': 1, 'first-aid-pouch': 2, 'duct-tape': 2,
      'riot-baton': 1, bedpan: 2, 'stranger-with-child': 2, 'lone-wanderer': 1, 'blueprint-school': 1,
    },
  },
  hospital: {
    id: 'hospital',
    name: 'Hospital',
    blurb: 'St. Aurelia General. The lobby lights flicker in a slow heartbeat.',
    survivorSlots: 3,
    zombieSlots: 3,
    deck: {
      'first-aid-pouch': 4, antibiotics: 2, 'canned-beans': 1, 'rice-sack': 1, 'jerry-can': 1,
      'zip-ties': 1, 'duct-tape': 1, bedpan: 2, 'stranger-with-child': 1, 'blueprint-hospital': 1,
    },
  },
  library: {
    id: 'library',
    name: 'Library',
    blurb: 'Ashgrove Public Library. Paper burns; knowledge keeps you alive.',
    survivorSlots: 3,
    zombieSlots: 3,
    deck: {
      'duct-tape': 2, 'zip-ties': 2, 'socket-set': 1, 'field-manual': 1, 'blueprint-library': 1, 'jerry-can': 2,
      'canned-beans': 1, 'rice-sack': 1, 'first-aid-pouch': 1, bedpan: 2, 'stranger-with-child': 1,
    },
  },
  gas: {
    id: 'gas',
    name: 'Gas Station',
    blurb: 'Northstar Fuel & Snacks. The pumps are dry, the tanks underneath are not.',
    survivorSlots: 3,
    zombieSlots: 3,
    deck: {
      'jerry-can': 6, 'beef-jerky': 1, 'socket-set': 1, 'riot-baton': 1, 'motor-junk': 2,
      'duct-tape': 1, 'zip-ties': 1, 'blueprint-gas': 1, 'canned-beans': 1,
    },
  },
};
