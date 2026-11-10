// Item card definitions. Every location deck is built from these.
// type: food | medicine | fuel | tools | weapon | armor | junk | survivor | book | gadget | consumable | material
// counts: a crisis also accepts this item as that type (bandage → medicine, coffee → food, wood → tools).
// tier: 1 common (white), 2 uncommon (blue), 3 rare (gold). Higher tiers are stronger and scarcer.
// value: food tokens / wounds healed / barricades / zombies killed per attack / energy (junk: × 12).
// Gear (weapon, armor, book) is EQUIPPED to a slot (free action) and changes its wearer's personal stats:
//   weapon: melee adds ATK (atk); a gun kills `value` zombies per shot without HP loss, uses ammo, may draw a zombie;
//   armor:  value = HP saved per fight; boots: moveMod (move cost);
//   book:   blueprint (search a place: draw 1 more, put 1 back) | foodSaver | barricadePlus | regenPlus.

export const GEAR_SLOTS = Object.freeze({ weapon: 'weapon', armor: 'armor', book: 'book', gadget: 'tool' });
export const PERMANENT_TYPES = Object.freeze(['weapon', 'armor', 'book', 'gadget']);
export const isPermanent = (item) => PERMANENT_TYPES.includes(item.type);
export const gearSlot = (item) => GEAR_SLOTS[item?.type] ?? null;

const bp = (loc, name) => ({ id: `blueprint-${loc}`, type: 'book', tier: 1, value: 0, blueprint: loc, name, text: 'Every aisle, every back door.' });

export const ITEMS = {
  // FOOD
  'canned-beans':    { id: 'canned-beans', type: 'food', tier: 1, value: 1, name: 'Canned Beans', text: 'Dented, but sealed.' },
  'beef-jerky':      { id: 'beef-jerky', type: 'food', tier: 1, value: 1, name: 'Gas-Station Jerky', text: 'Smoked, salted, eternal.' },
  'rice-sack':       { id: 'rice-sack', type: 'food', tier: 2, value: 2, name: 'Sack of Rice', text: 'Heavy enough to stop a door.' },
  // MEDICINE (value = wounds/frostbite healed)
  'first-aid-pouch': { id: 'first-aid-pouch', type: 'medicine', tier: 1, value: 1, name: 'First-Aid Pouch', text: 'Gauze, tape, and hope.' },
  antibiotics:       { id: 'antibiotics', type: 'medicine', tier: 2, value: 2, name: 'Antibiotics', text: 'Finish the whole course.' },
  // FUEL
  'jerry-can':       { id: 'jerry-can', type: 'fuel', tier: 1, value: 1, name: 'Jerry Can', text: 'Half full. Sloshes loudly.' },
  // TOOLS (value = barricades)
  'duct-tape':       { id: 'duct-tape', type: 'tools', tier: 1, value: 1, name: 'Duct Tape', text: 'The other half of civilization.' },
  'zip-ties':        { id: 'zip-ties', type: 'tools', tier: 1, value: 1, name: 'Bundle of Zip Ties', text: 'Holds a fence together.' },
  'socket-set':      { id: 'socket-set', type: 'tools', tier: 2, value: 2, name: 'Socket Set', text: 'One socket missing, naturally.' },
  // WEAPONS (equip; value = zombies killed per attack, attackMod = energy cost change)
  'riot-baton':      { id: 'riot-baton', type: 'weapon', tier: 1, value: 1, atk: 8, name: 'Riot Baton', text: 'Reliable, quiet, cold to hold.' },
  'glock-19':        { id: 'glock-19', type: 'weapon', tier: 1, value: 1, gun: { spawn: 0.4, ammo: 6 }, name: 'Glock 19', text: 'Fifteen rounds, if you count carefully.' },
  'remington-870':   { id: 'remington-870', type: 'weapon', tier: 2, value: 2, gun: { spawn: 0.5, ammo: 4 }, name: 'Remington 870', text: 'Pump, aim, pray.' },
  'fire-axe':        { id: 'fire-axe', type: 'weapon', tier: 2, value: 1, atk: 18, name: 'Fire Axe', text: 'Red paint, sharp edge, heavy swing.' },
  'mosin-nagant':    { id: 'mosin-nagant', type: 'weapon', tier: 3, value: 1, gun: { spawn: 0.15, ammo: 5 }, name: 'Mosin-Nagant', text: 'Built for winters worse than this.' },
  // ARMOR (equip)
  'padded-parka':    { id: 'padded-parka', type: 'armor', tier: 1, value: 2, name: 'Padded Parka', text: 'Goose down and a fur hood.' },
  'winter-boots':    { id: 'winter-boots', type: 'armor', tier: 1, value: 0, moveMod: -5, name: 'Winter Boots', text: 'Laced tight, dry inside.' },
  'riot-vest':       { id: 'riot-vest', type: 'armor', tier: 2, value: 3, name: 'Riot Vest', text: 'Kevlar plates. Teeth do not get through.' },
  // JUNK (value × 12 energy)
  bedpan:            { id: 'bedpan', type: 'junk', tier: 1, value: 1, name: 'Steel Bedpan', text: 'Unused. Probably.' },
  'motor-junk':      { id: 'motor-junk', type: 'junk', tier: 2, value: 2, wild: true, name: 'Motor Odds & Ends', text: 'Springs, gaskets, mystery bolts.' },
  // SURVIVORS (recruit someone to your group)
  'stranger-with-child': { id: 'stranger-with-child', type: 'survivor', tier: 1, value: 1, name: 'Stranger with a Child', text: 'She can fight. He cannot.' },
  'lone-wanderer':   { id: 'lone-wanderer', type: 'survivor', tier: 2, value: 1, name: 'Lone Wanderer', text: 'Travels light, asks nothing.' },
  // BOOKS (equip; passive while equipped)
  'blueprint-police':   bp('police', 'Police Station Blueprint'),
  'blueprint-grocery':  bp('grocery', 'Grocery Store Blueprint'),
  'blueprint-school':   bp('school', 'School Blueprint'),
  'blueprint-hospital': bp('hospital', 'Hospital Blueprint'),
  'blueprint-library':  bp('library', 'Library Blueprint'),
  'blueprint-gas':      bp('gas', 'Gas Station Blueprint'),
  'winter-cookbook': { id: 'winter-cookbook', type: 'book', tier: 2, value: 1, passive: 'foodSaver', name: 'Winter Pantry Cookbook', text: 'Forty ways to stretch a can.' },
  'field-manual':    { id: 'field-manual', type: 'book', tier: 2, value: 1, passive: 'barricadePlus', name: 'Barricade Field Manual', text: 'Chapter 3: brace, then nail.' },
  // MELEE WEAPONS (atk adds to ATK; the bow is silent)
  'kitchen-knife':   { id: 'kitchen-knife', type: 'weapon', tier: 1, value: 1, atk: 6, name: 'Kitchen Knife', text: 'Short reach, sure grip.' },
  crowbar:           { id: 'crowbar', type: 'weapon', tier: 1, value: 1, atk: 8, name: 'Crowbar', text: 'Opens doors and arguments.' },
  'baseball-bat':    { id: 'baseball-bat', type: 'weapon', tier: 1, value: 1, atk: 10, name: 'Baseball Bat', text: 'Signed by nobody famous.' },
  'hunting-bow':     { id: 'hunting-bow', type: 'weapon', tier: 2, value: 1, atk: 12, name: 'Hunting Bow', text: 'Silent. Arrows come back, mostly.' },
  // ARMOR (value = HP saved per fight)
  'scrap-plate':     { id: 'scrap-plate', type: 'armor', tier: 3, value: 5, name: 'Scrap Plate Armor', text: 'Car doors and leather straps.' },
  'snow-suit':       { id: 'snow-suit', type: 'armor', tier: 2, value: 1, coldProof: true, name: 'Snow Suit', text: 'Storms cost nothing extra.' },
  // GADGETS (tool slot)
  flashlight:        { id: 'flashlight', type: 'gadget', tier: 1, value: 0, searchMod: -5, name: 'Flashlight', text: 'Searching costs 5 less AP.' },
  'city-map':        { id: 'city-map', type: 'gadget', tier: 1, value: 0, walkMod: -3, name: 'Shortcut Map', text: 'Walking costs 3 less AP.' },
  'city-map-piece':  { id: 'city-map-piece', type: 'map', tier: 3, value: 0, growMap: true, name: 'City Map', text: 'Use it at the colony: the city grows one stage.' },
  'big-backpack':    { id: 'big-backpack', type: 'gadget', tier: 2, value: 0, pack: 2, name: 'Big Backpack', text: '+2 backpack slots.' },
  sled:              { id: 'sled', type: 'gadget', tier: 2, value: 0, pack: 3, walkMod: 2, name: 'Sled', text: '+3 slots, walking costs 2 more.' },
  'tool-kit':        { id: 'tool-kit', type: 'gadget', tier: 2, value: 0, barricadeMod: -5, name: 'Tool Kit', text: 'Barricades cost 5 less AP.' },
  // CONSUMABLES (used on a survivor at the same place)
  bandage:           { id: 'bandage', type: 'consumable', counts: 'medicine', tier: 1, value: 0, use: { hp: 15 }, name: 'Bandage', text: '+15 HP.' },
  'first-aid-kit':   { id: 'first-aid-kit', type: 'consumable', counts: 'medicine', tier: 2, value: 0, use: { hp: 35 }, name: 'First-Aid Kit', text: '+35 HP.' },
  painkillers:       { id: 'painkillers', type: 'consumable', counts: 'medicine', tier: 1, value: 0, use: { hp: 10, ap: 10 }, name: 'Painkillers', text: '+10 HP, +10 AP.' },
  coffee:            { id: 'coffee', type: 'consumable', counts: 'food', tier: 1, value: 0, use: { ap: 20 }, name: 'Instant Coffee', text: '+20 AP.' },
  chocolate:         { id: 'chocolate', type: 'consumable', counts: 'food', tier: 1, value: 0, use: { ap: 10, hp: 5 }, name: 'Chocolate Bar', text: '+10 AP, +5 HP.' },
  ammo:              { id: 'ammo', type: 'consumable', counts: 'weapon', tier: 1, value: 0, use: { ammo: 6 }, name: 'Box of Ammo', text: '+6 rounds for a gun.' },
  firebomb:          { id: 'firebomb', type: 'consumable', counts: 'weapon', tier: 2, value: 0, use: { burn: 3 }, name: 'Firebomb', text: 'Kills up to 3 zombies here.' },
  // MATERIALS (crafting now; base upgrades and the snow crawler later)
  wood:              { id: 'wood', type: 'material', counts: 'tools', tier: 1, value: 1, name: 'Planks', text: 'Pulled off a fence.' },
  scrap:             { id: 'scrap', type: 'material', counts: 'tools', tier: 1, value: 1, name: 'Scrap Metal', text: 'Sharp edges, good weight.' },
  cloth:             { id: 'cloth', type: 'material', counts: 'medicine', tier: 1, value: 1, name: 'Cloth', text: 'Curtains, sheets, flags.' },
  'engine-part':     { id: 'engine-part', type: 'material', tier: 3, value: 1, name: 'Engine Part', text: 'For the snow crawler.' },
  'heater-part':     { id: 'heater-part', type: 'material', tier: 3, value: 1, name: 'Heater Part', text: 'For the snow crawler.' },
  'survival-guide':  { id: 'survival-guide', type: 'book', tier: 2, value: 10, passive: 'regenPlus', name: 'Winter Survival Guide', text: 'Rest smart, eat warm, move at dawn.' },
};

/** Crafting at the colony: materials (item ids, from the stockpile) + AP → an item into the stockpile. */
export const RECIPES = {
  bandage:       { needs: { cloth: 1 }, ap: 5, makes: 'bandage' },
  firebomb:      { needs: { 'jerry-can': 1, cloth: 1 }, ap: 5, makes: 'firebomb' },
  'baseball-bat': { needs: { wood: 2 }, ap: 10, makes: 'baseball-bat' },
  'scrap-plate': { needs: { scrap: 2, cloth: 1 }, ap: 15, makes: 'scrap-plate' },
  sled:          { needs: { wood: 2, scrap: 1 }, ap: 15, makes: 'sled' },
  barricade:     { needs: { wood: 1, scrap: 1 }, ap: 5, makes: 'socket-set' },
};
