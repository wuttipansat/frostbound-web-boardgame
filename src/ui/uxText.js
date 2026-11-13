// UI-2: words for the core answers in src/core/ux.js (the next-step line, reasons, likely loot).
import { t, c } from '../i18n/index.js';
import { nextHint, whyDisabled } from '../core/ux.js';
import { survivorDef, locDef } from '../core/selectors.js';
import { ITEMS } from '../content/items.js';

const firstName = (id) => (survivorDef(id)?.name ?? id).split(' ')[0];

/** One { key, params } part in words (ids become names). */
export function uxText(part) {
  const p = { ...part.params };
  if (p.sv) p.sv = firstName(p.sv);
  if (p.place) p.place = c('locations', p.place, 'name');
  if (p.bld) p.bld = t(`bld.${p.bld}`);
  return t(part.key, p);
}

/** "12 AP left · Mara can search the pharmacy · food 2/3 for tonight" */
export const nextHintText = (s) => nextHint(s).map(uxText).join(' · ');

/** Why this action can't be done, with numbers ("Needs 12 AP, has 8."); '' when it can. */
export function whyText(s, action) {
  const w = action ? whyDisabled(s, action) : null;
  return w ? uxText(w) : '';
}

/** The item types a place's finds come from, most common first (from its deck list, not what is left). */
export function likelyLoot(s, locationId, n = 3) {
  const deck = locDef(s, locationId)?.deck;
  if (!deck) return [];
  const byType = {};
  for (const [id, k] of Object.entries(deck)) {
    const type = ITEMS[id]?.type;
    if (type) byType[type] = (byType[type] ?? 0) + k;
  }
  return Object.entries(byType).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([type]) => type);
}
