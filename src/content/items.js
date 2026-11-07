// Item card definitions. Every location deck is built from these.
// type: food | medicine | fuel | tools | weapon | junk
// value: for food = food tokens added when played; other types use it as flavour/strength.

export const ITEMS = {
  // FOOD
  'canned-beans':    { id: 'canned-beans', type: 'food', value: 1, name: 'Canned Beans', text: 'Dented, but sealed.' },
  'frozen-venison':  { id: 'frozen-venison', type: 'food', value: 2, name: 'Frozen Venison', text: 'Someone hung it up and never came back.' },
  'rice-sack':       { id: 'rice-sack', type: 'food', value: 2, name: 'Sack of Rice', text: 'Heavy enough to stop a door.' },
  'beef-jerky':      { id: 'beef-jerky', type: 'food', value: 1, name: 'Gas-Station Jerky', text: 'Smoked, salted, eternal.' },
  'cafeteria-tray':  { id: 'cafeteria-tray', type: 'food', value: 1, name: 'Cafeteria Leftovers', text: 'Tater tots, frozen solid.' },

  // MEDICINE
  'first-aid-pouch': { id: 'first-aid-pouch', type: 'medicine', value: 1, name: 'First-Aid Pouch', text: 'Gauze, tape, and hope.' },
  'antibiotics':     { id: 'antibiotics', type: 'medicine', value: 1, name: 'Antibiotics', text: 'Finish the whole course.' },
  'cough-syrup':     { id: 'cough-syrup', type: 'medicine', value: 1, name: 'Cherry Cough Syrup', text: 'Tastes like summer.' },
  'saline-bags':     { id: 'saline-bags', type: 'medicine', value: 1, name: 'Saline Bags', text: 'Keep them from freezing.' },
  'herbal-guide':    { id: 'herbal-guide', type: 'medicine', value: 1, name: 'Field Herbal Guide', text: 'Pine-needle tea fixes more than you think.' },

  // FUEL
  'jerry-can':          { id: 'jerry-can', type: 'fuel', value: 1, name: 'Jerry Can', text: 'Half full. Sloshes loudly.' },
  'lamp-oil':           { id: 'lamp-oil', type: 'fuel', value: 1, name: 'Lamp Oil', text: 'Burns slow and warm.' },
  'space-heater-fuel':  { id: 'space-heater-fuel', type: 'fuel', value: 1, name: 'Heater Canister', text: 'From the janitor closet.' },
  'oxygen-tank':        { id: 'oxygen-tank', type: 'fuel', value: 1, name: 'Oxygen Tank', text: 'Handle with extreme care.' },
  'candle-box':         { id: 'candle-box', type: 'fuel', value: 1, name: 'Box of Candles', text: 'Unscented. Practical.' },
  'flare':              { id: 'flare', type: 'fuel', value: 1, name: 'Signal Flare', text: 'Red light, loud hiss.' },
  'road-flare-kit':     { id: 'road-flare-kit', type: 'fuel', value: 1, name: 'Road Flare Kit', text: 'Six sticks of daylight.' },

  // TOOLS
  'zip-ties':       { id: 'zip-ties', type: 'tools', value: 1, name: 'Bundle of Zip Ties', text: 'Holds a fence together.' },
  'duct-tape':      { id: 'duct-tape', type: 'tools', value: 1, name: 'Duct Tape', text: 'The other half of civilization.' },
  'repair-manual':  { id: 'repair-manual', type: 'tools', value: 1, name: 'Repair Manual', text: 'Chapter 7: Hinges.' },
  'socket-set':     { id: 'socket-set', type: 'tools', value: 1, name: 'Socket Set', text: 'One socket missing, naturally.' },
  'surgical-saw':   { id: 'surgical-saw', type: 'tools', value: 1, name: 'Bone Saw', text: 'Cuts lumber fine too.' },
  'old-almanac':    { id: 'old-almanac', type: 'tools', value: 1, name: 'Farmer\'s Almanac', text: 'Predicted this winter. Nobody read it.' },

  // WEAPONS
  'service-pistol': { id: 'service-pistol', type: 'weapon', value: 1, name: 'Service Pistol', text: 'Loud. Draws attention.' },
  'riot-baton':     { id: 'riot-baton', type: 'weapon', value: 1, name: 'Riot Baton', text: 'Reliable, quiet, cold to hold.' },
  'pump-shotgun':   { id: 'pump-shotgun', type: 'weapon', value: 1, name: 'Pump Shotgun', text: 'Two shells left. Make them count.' },
  'box-cutter':     { id: 'box-cutter', type: 'weapon', value: 1, name: 'Box Cutter', text: 'Better than nothing.' },
  'hockey-stick':   { id: 'hockey-stick', type: 'weapon', value: 1, name: 'Hockey Stick', text: 'Taped blade, team colours.' },
  'tire-iron':      { id: 'tire-iron', type: 'weapon', value: 1, name: 'Tire Iron', text: 'Heavy end first.' },
  'letter-opener':  { id: 'letter-opener', type: 'weapon', value: 1, name: 'Brass Letter Opener', text: 'Overdue fines: settled.' },

  // JUNK
  'lost-and-found': { id: 'lost-and-found', type: 'junk', value: 0, name: 'Lost & Found Box', text: 'Mittens. Single mittens.' },
  'shopping-cart':  { id: 'shopping-cart', type: 'junk', value: 0, name: 'Wobbly Shopping Cart', text: 'Left front wheel has opinions.' },
  'board-games':    { id: 'board-games', type: 'junk', value: 0, name: 'Stack of Board Games', text: 'Missing pieces, all of them.' },
  'bedpan':         { id: 'bedpan', type: 'junk', value: 0, name: 'Steel Bedpan', text: 'Unused. Probably.' },
  'paperback-pile': { id: 'paperback-pile', type: 'junk', value: 0, name: 'Paperback Pile', text: 'Romance novels and one tax guide.' },
  'motor-junk':     { id: 'motor-junk', type: 'junk', value: 0, name: 'Motor Odds & Ends', text: 'Springs, gaskets, mystery bolts.' },
};

export const ITEM_PLAY_TEXT = {
  food: 'Add its food value to the colony supply.',
  medicine: 'Heal 1 wound (or cure frostbite) on one of your survivors.',
  fuel: 'Move one of your survivors without rolling exposure.',
  tools: 'Add 1 barricade where one of your survivors stands.',
  weapon: 'Kill 1 zombie where one of your survivors stands (no exposure).',
  junk: 'Reroll one of your unused action dice.',
};
