// Which text describes an item's effect: [i18n key, params] for the full line and the short card label.
import { c } from '../i18n/index.js';

function effect(item) {
  if (item.blueprint) return ['blueprint', { place: c('locations', item.blueprint, 'name') }];
  if (item.passive) return [item.passive, { n: item.value }];
  const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
  if (item.type === 'weapon') return item.gun ? ['gun', { n: item.value, ammo: item.gun.ammo, p: Math.round(item.gun.spawn * 100) }] : ['weapon', { n: item.atk ?? 0 }];
  if (item.type === 'armor') {
    if (item.moveMod) return ['armorMove', { mod: signed(item.moveMod) }];
    return ['armor', { n: item.value }];
  }
  if (item.type === 'survivor') return ['recruit', { n: 1 }];
  if (item.type === 'junk') return [item.wild ? 'junkWild' : 'junk', { n: item.value * 12 }];
  return [item.type, { n: item.value }];
}

export const itemPlay = (item) => { const [k, p] = effect(item); return [`itemPlay.${k}`, p]; };
export const itemShort = (item) => { const [k, p] = effect(item); return [`itemShort.${k}`, p]; };
