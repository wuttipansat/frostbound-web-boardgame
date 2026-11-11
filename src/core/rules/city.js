// MAP-1: growing the city when a map is read at the colony.
import { growMap } from '../map.js';
import { stockPlace } from '../state.js';
import { random } from '../rng.js';
import { log } from './helpers.js';

export function growCity(s) {
  const fresh = [];
  const added = growMap(s, (type, block) => {
    let id = type;
    for (let k = 2; s.locations[id]; k++) id = `${type}-${k}`;
    // Further out is more dangerous: a few zombies may already be there.
    s.locations[id] = stockPlace(s, id, type, 'm', Math.floor(random(s) * (s.map.stage - 1))); // the new stage: 0 … stage−2 zombies
    fresh.push(id);
    return id;
  });
  s.map.pending = false;
  s.map.searchesSinceMap = 0;
  log(s, 'mapGrown', { stage: s.map.stage, blocks: added.length, places: fresh });
}
