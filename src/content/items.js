// Item card definitions. Every location deck is built from these.
// type: food | medicine | fuel | tools | weapon | junk | survivor | book
// tier: 1 common (white), 2 uncommon (blue), 3 rare (gold). Higher tiers are stronger and scarcer.
// value: food tokens / wounds healed / barricades / zombies killed / dice rerolled.
// Weapons and books are permanent: they stay in hand. A weapon can be used once per turn;
// books work passively while held.

export const PERMANENT_TYPES = Object.freeze(['weapon', 'book']);
export const isPermanent = (item) => PERMANENT_TYPES.includes(item.type);

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
  // WEAPONS (permanent; value = zombies killed per use)
  'riot-baton':      { id: 'riot-baton', type: 'weapon', tier: 1, value: 1, name: 'Riot Baton', text: 'Reliable, quiet, cold to hold.' },
  'glock-19':        { id: 'glock-19', type: 'weapon', tier: 1, value: 1, name: 'Glock 19', text: 'Fifteen rounds, if you count carefully.' },
  'remington-870':   { id: 'remington-870', type: 'weapon', tier: 2, value: 2, name: 'Remington 870', text: 'Pump, aim, pray.' },
  'mosin-nagant':    { id: 'mosin-nagant', type: 'weapon', tier: 3, value: 1, range: 'any', name: 'Mosin-Nagant', text: 'Built for winters worse than this.' },
  // JUNK (value = dice rerolled)
  bedpan:            { id: 'bedpan', type: 'junk', tier: 1, value: 1, name: 'Steel Bedpan', text: 'Unused. Probably.' },
  'motor-junk':      { id: 'motor-junk', type: 'junk', tier: 2, value: 2, wild: true, name: 'Motor Odds & Ends', text: 'Springs, gaskets, mystery bolts.' },
  // SURVIVORS (recruit someone to your group)
  'stranger-with-child': { id: 'stranger-with-child', type: 'survivor', tier: 1, value: 1, helpless: 1, name: 'Stranger with a Child', text: 'She can fight. He cannot.' },
  'lone-wanderer':   { id: 'lone-wanderer', type: 'survivor', tier: 2, value: 1, name: 'Lone Wanderer', text: 'Travels light, asks nothing.' },
  // BOOKS (permanent, passive while held)
  'blueprint-police':   bp('police', 'Police Station Blueprint'),
  'blueprint-grocery':  bp('grocery', 'Grocery Store Blueprint'),
  'blueprint-school':   bp('school', 'School Blueprint'),
  'blueprint-hospital': bp('hospital', 'Hospital Blueprint'),
  'blueprint-library':  bp('library', 'Library Blueprint'),
  'blueprint-gas':      bp('gas', 'Gas Station Blueprint'),
  'winter-cookbook': { id: 'winter-cookbook', type: 'book', tier: 2, value: 1, passive: 'foodSaver', name: 'Winter Pantry Cookbook', text: 'Forty ways to stretch a can.' },
  'field-manual':    { id: 'field-manual', type: 'book', tier: 2, value: 1, passive: 'barricadePlus', name: 'Barricade Field Manual', text: 'Chapter 3: brace, then nail.' },
};
