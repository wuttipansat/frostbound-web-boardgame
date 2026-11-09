// Base upgrades: 3 levels each. A level needs materials (taken from the stockpile when work starts)
// and AP from survivors at the colony; the AP put in carries over from day to day.
const L = (needs, ap) => Object.freeze({ needs, ap });

export const BUILDINGS = Object.freeze({
  dorm:       { id: 'dorm', name: 'Dorm', effect: '+2 beds per level',
    levels: [L({ wood: 2 }, 20), L({ wood: 3, cloth: 1 }, 30), L({ wood: 3, cloth: 2, scrap: 1 }, 40)] },
  wall:       { id: 'wall', name: 'Wall', effect: 'Stops 1 zombie at the colony every night per level',
    levels: [L({ wood: 2, scrap: 1 }, 25), L({ wood: 2, scrap: 2 }, 35), L({ wood: 2, scrap: 3 }, 45)] },
  greenhouse: { id: 'greenhouse', name: 'Greenhouse', effect: '+1 food every dawn per level',
    levels: [L({ wood: 2, cloth: 1 }, 25), L({ wood: 2, cloth: 2 }, 35), L({ wood: 3, cloth: 2, scrap: 1 }, 45)] },
  workshop:   { id: 'workshop', name: 'Workshop', effect: 'Crafting needs it; levels 2–3: crafting costs 3 / 6 AP less',
    levels: [L({ wood: 1, scrap: 1 }, 15), L({ wood: 1, scrap: 2 }, 30), L({ wood: 2, scrap: 3 }, 40)] },
  infirmary:  { id: 'infirmary', name: 'Infirmary', effect: '+5 HP per level at night for everyone at the colony',
    levels: [L({ wood: 1, cloth: 2 }, 20), L({ wood: 1, cloth: 3 }, 30), L({ wood: 1, cloth: 3, scrap: 1 }, 40)] },
  radio:      { id: 'radio', name: 'Radio Tower', effect: '10% per level each dawn: a newcomer finds the colony',
    levels: [L({ scrap: 2 }, 25), L({ scrap: 2, wood: 1, cloth: 1 }, 35), L({ scrap: 3, cloth: 1 }, 45)] },
});
export const BUILDING_IDS = Object.freeze(Object.keys(BUILDINGS));

/** The main goal: the snow crawler, built like an upgrade in 4 stages (rare parts: engine / heater). */
export const CRAWLER = Object.freeze({
  id: 'crawler', name: 'Snow Crawler',
  stages: ['frame', 'engine', 'heater', 'fuel'],
  levels: [
    L({ scrap: 3, wood: 2 }, 100),
    L({ 'engine-part': 2, scrap: 1 }, 100),
    L({ 'heater-part': 2, cloth: 2 }, 100),
    L({ 'jerry-can': 3 }, 50),
  ],
});
