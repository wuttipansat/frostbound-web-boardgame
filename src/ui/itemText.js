// Which text describes an item's effect: [i18n key, params] for the full line and the short card label.
import { c } from '../i18n/index.js';

function effect(item) {
  if (item.blueprint) return ['blueprint', { place: c('locations', item.blueprint, 'name') }];
  if (item.passive) return [item.passive, { n: item.value }];
  if (item.type === 'weapon' && item.range === 'any') return ['sniper', { n: item.value }];
  if (item.type === 'survivor') return [item.helpless ? 'recruitHelpless' : 'recruit', { n: item.helpless ?? 0 }];
  if (item.type === 'junk' && item.wild) return ['junkWild', { n: item.value }];
  return [item.type, { n: item.value }];
}

export const itemPlay = (item) => { const [k, p] = effect(item); return [`itemPlay.${k}`, p]; };
export const itemShort = (item) => { const [k, p] = effect(item); return [`itemShort.${k}`, p]; };
