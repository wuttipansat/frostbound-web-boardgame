// 20 original survivors.
// influence: unique; higher = more leadership (first player, tie-breaks, overrun victim is LOWEST influence).
// attack / search: an action die must roll >= this value.
// ability.type is interpreted by the rules engine (see src/core/rules/*).
// accent: colour accent used by the voxel renderer.

export const SURVIVORS = [
  { id: 'maren-holt', name: 'Maren Holt', occupation: 'Ice-Road Trucker', influence: 62, attack: 3, search: 4,
    ability: { type: 'noMoveExposure' }, abilityText: 'Knows every back road: moving never rolls exposure.', accent: '#d9822b' },
  { id: 'osei-vance', name: 'Dr. Osei Vance', occupation: 'ER Surgeon', influence: 70, attack: 5, search: 3,
    ability: { type: 'healer' }, abilityText: 'Once per turn (free): heal 1 wound or frostbite on a survivor at the same location.', accent: '#e8eef2' },
  { id: 'pim-arunrat', name: 'Pim Arunrat', occupation: 'Street-Food Cook', influence: 38, attack: 4, search: 3,
    ability: { type: 'foodSaver' }, abilityText: 'While Pim is in the colony, it needs 1 less food each round.', accent: '#f2b33d' },
  { id: 'ilse-brandt', name: 'Ilse Brandt', occupation: 'Retired Sniper', influence: 55, attack: 2, search: 5,
    ability: { type: 'noAttackExposure' }, abilityText: 'Shoots from a distance: attacking never rolls exposure.', accent: '#6b7f4a' },
  { id: 'teodor-rusu', name: 'Teodor "Tank" Rusu', occupation: 'Nightclub Bouncer', influence: 41, attack: 2, search: 5,
    ability: { type: 'killTwo' }, abilityText: 'Each successful attack kills 2 zombies.', accent: '#3a3f4b' },
  { id: 'nia-calloway', name: 'Nia Calloway', occupation: 'Locksmith', influence: 33, attack: 4, search: 3,
    ability: { type: 'barricadeTwo' }, abilityText: 'Each barricade action places 2 barricades.', accent: '#b0b7c0' },
  { id: 'wren-okafor', name: 'Wren Okafor', occupation: 'Night-Shift Janitor', influence: 24, attack: 4, search: 3,
    ability: { type: 'cleanFive' }, abilityText: 'Cleaning removes 5 waste instead of 3.', accent: '#2f8f83' },
  { id: 'lio-fontaine', name: 'Lio Fontaine', occupation: 'Rodeo Clown', influence: 29, attack: 3, search: 4,
    ability: { type: 'lureTwo' }, abilityText: 'Each lure action moves up to 2 zombies.', accent: '#d64545' },
  { id: 'hattie-moss', name: 'Hattie Moss', occupation: 'Grocery Clerk', influence: 30, attack: 5, search: 2,
    ability: { type: 'doubleSearch', location: 'grocery' }, abilityText: 'Draws 2 cards when searching the Grocery Store.', accent: '#7fbf4d' },
  { id: 'rafael-quist', name: 'Rafael Quist', occupation: 'Pharmacy Technician', influence: 36, attack: 5, search: 2,
    ability: { type: 'doubleSearch', location: 'hospital' }, abilityText: 'Draws 2 cards when searching the Hospital.', accent: '#5aa9e6' },
  { id: 'agnes-pell', name: 'Agnes Pell', occupation: 'Head Librarian', influence: 58, attack: 6, search: 2,
    ability: { type: 'doubleSearch', location: 'library' }, abilityText: 'Draws 2 cards when searching the Library.', accent: '#8a5a9e' },
  { id: 'corwin-daly', name: 'Corwin Daly', occupation: 'Patrol Officer', influence: 47, attack: 3, search: 3,
    ability: { type: 'doubleSearch', location: 'police' }, abilityText: 'Draws 2 cards when searching the Police Station.', accent: '#2b4c8c' },
  { id: 'juno-barrera', name: 'Juno Barrera', occupation: 'Pit-Stop Mechanic', influence: 27, attack: 4, search: 3,
    ability: { type: 'doubleSearch', location: 'gas' }, abilityText: 'Draws 2 cards when searching the Gas Station.', accent: '#e0c341' },
  { id: 'kanya-srisuk', name: 'Kanya Srisuk', occupation: 'Kindergarten Teacher', influence: 52, attack: 5, search: 3,
    ability: { type: 'inspire' }, abilityText: 'When a crisis is averted while Kanya lives, gain +1 morale.', accent: '#f28fb1' },
  { id: 'bo-lindqvist', name: 'Bo Lindqvist', occupation: 'Ice Diver', influence: 22, attack: 3, search: 4,
    ability: { type: 'ignoreFrostbite' }, abilityText: 'Frostbite results count as blank for Bo.', accent: '#1f6f9f' },
  { id: 'ezra-kade', name: 'Ezra Kade', occupation: 'Card Sharp', influence: 19, attack: 4, search: 4,
    ability: { type: 'luckyExposure' }, abilityText: 'Rolls the exposure die twice and keeps the better result.', accent: '#a83279' },
  { id: 'greta-vos', name: 'Greta Vos', occupation: 'Ex-Boxer', influence: 26, attack: 2, search: 5,
    ability: { type: 'stoic' }, abilityText: 'Survives until 4 wounds instead of 3.', accent: '#c0392b' },
  { id: 'silas-thorn', name: 'Silas Thorn', occupation: 'Hunting Guide', influence: 44, attack: 3, search: 3,
    ability: { type: 'quiet' }, abilityText: 'One fewer zombie spawns at Silas\'s location (outside the colony).', accent: '#7a5c3a' },
  { id: 'dot-ferreira', name: 'Dot Ferreira', occupation: 'Bike Courier', influence: 15, attack: 4, search: 3,
    ability: { type: 'extraDie' }, abilityText: 'Dot\'s player rolls 1 extra action die each round.', accent: '#39c16c' },
  { id: 'ambrose-lark', name: 'Ambrose Lark', occupation: 'Scrap Sculptor', influence: 34, attack: 4, search: 3,
    ability: { type: 'tinkerer' }, abilityText: 'Junk that Ambrose\'s player contributes to a crisis counts as a matching item.', accent: '#9c8f7a' },
];

export const SURVIVORS_BY_ID = Object.fromEntries(SURVIVORS.map((s) => [s.id, s]));
