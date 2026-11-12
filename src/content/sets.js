// GAME-1: item sets. A survivor who carries or wears 2+ pieces of a set gets its small bonus; the whole set gives
// the full bonus too. Pieces in the stockpile do not count. Bonuses use the existing effect hooks only:
//   atk (melee ATK), searchAp / moveAp / barricadeAp (AP cost change), hpSaved (HP saved per fight),
//   pack (backpack slots), coldProof (storms cost nothing extra), regen (AP after a night's sleep).
// Totals from sets are capped (SET_CAPS) so no set beats a tier-3 weapon on its own.

export const SETS = [
  { id: 'police', items: ['riot-baton', 'riot-vest', 'glock-19'], bonus2: { atk: 3 }, bonusFull: { hpSaved: 1, barricadeAp: -3 } },
  { id: 'soldier', items: ['mosin-nagant', 'ammo', 'field-manual'], bonus2: { atk: 2 }, bonusFull: { barricadeAp: -4 } },
  { id: 'medic', items: ['first-aid-kit', 'antibiotics', 'bandage'], bonus2: { regen: 5 }, bonusFull: { hpSaved: 1 } },
  { id: 'hunter', items: ['hunting-bow', 'snow-suit'], bonus2: { atk: 2, moveAp: -2 }, bonusFull: {} },
  { id: 'winter', items: ['padded-parka', 'winter-boots'], bonus2: { moveAp: -2, coldProof: true }, bonusFull: {} },
  { id: 'scout', items: ['flashlight', 'city-map', 'big-backpack'], bonus2: { searchAp: -2 }, bonusFull: { moveAp: -2 } },
  { id: 'mechanic', items: ['tool-kit', 'socket-set', 'crowbar'], bonus2: { barricadeAp: -2 }, bonusFull: { searchAp: -3 } },
  { id: 'firefighter', items: ['fire-axe', 'jerry-can'], bonus2: { atk: 3, hpSaved: 1 }, bonusFull: {} },
  { id: 'chef', items: ['winter-cookbook', 'kitchen-knife', 'coffee'], bonus2: { regen: 5 }, bonusFull: { atk: 2 } },
  { id: 'farmer', items: ['sled', 'rice-sack'], bonus2: { pack: 1, moveAp: -1 }, bonusFull: {} },
  { id: 'smuggler', items: ['remington-870', 'painkillers', 'chocolate'], bonus2: { searchAp: -2 }, bonusFull: { pack: 1 } },
  { id: 'scavenger', items: ['scrap-plate', 'motor-junk'], bonus2: { searchAp: -2, hpSaved: 1 }, bonusFull: {} },
];
export const SETS_BY_ID = Object.fromEntries(SETS.map((x) => [x.id, x]));
/** The set an item belongs to (each item is in one set at most). */
export const SET_OF = Object.fromEntries(SETS.flatMap((x) => x.items.map((i) => [i, x.id])));
/** Caps on the totals from all sets together. */
export const SET_CAPS = { atk: 6, searchAp: -5, moveAp: -4, barricadeAp: -5, hpSaved: 2, pack: 2, regen: 10 };
