// MAP-1: growing the city when a map is read at the colony.
import { growMap } from '../map.js';
import { stockPlace } from '../state.js';
import { random } from '../rng.js';
import { zoneOf } from '../zones.js';
import { log } from './helpers.js';

export function growCity(s) {
  const fresh = [];
  const added = growMap(s, (type, block) => {
    let id = type;
    for (let k = 2; s.locations[id]; k++) id = `${type}-${k}`;
    // Further out is more dangerous: a few zombies may already be there.
    const downtown = zoneOf(...block.split(',').map(Number), s.map.look ?? 0) === 'commercial' ? 1 : 0; // MAP-6: one more downtown
    s.locations[id] = stockPlace(s, id, type, 'm', Math.floor(random(s) * (s.map.stage - 1)) + downtown); // the new stage: 0 … stage−2 zombies
    fresh.push(id);
    return id;
  });
  s.map.pending = false;
  s.map.searchesSinceMap = 0;
  log(s, 'mapGrown', { stage: s.map.stage, blocks: added.length, places: fresh });
}
