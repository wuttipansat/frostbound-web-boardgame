// Tiny i18n: t(key, params) for UI strings and c(kind, id, field) for content text.
import en from './en.js';
import th from './th.js';
import contentTh from './content.th.js';
import { LOCATIONS } from '../content/locations.js';
import { ITEMS } from '../content/items.js';
import { SURVIVORS_BY_ID } from '../content/survivors.js';
import { SCENARIOS_BY_ID } from '../content/scenarios.js';
import { CRISES_BY_ID } from '../content/crises.js';
import { CROSSROADS_BY_ID } from '../content/crossroads.js';

const DICTS = { en, th };
const CONTENT_OVERRIDES = { th: contentTh };
const SOURCES = {
  locations: LOCATIONS,
  items: ITEMS,
  survivors: SURVIVORS_BY_ID,
  scenarios: SCENARIOS_BY_ID,
  crises: CRISES_BY_ID,
  crossroads: CROSSROADS_BY_ID,
};

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'th', label: 'ไทย' },
];

let lang = 'en';
const listeners = new Set();

export function getLang() { return lang; }

export function setLang(next) {
  if (!DICTS[next] || next === lang) return;
  lang = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Translate a UI key, interpolating {placeholders}. Falls back to English, then to the key. */
export function t(key, params = {}) {
  const s = DICTS[lang][key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
}

/** Localized content text, e.g. c('locations', 'police', 'name'). */
export function c(kind, id, field) {
  const o = CONTENT_OVERRIDES[lang]?.[kind]?.[id]?.[field];
  if (o != null) return o;
  return SOURCES[kind]?.[id]?.[field] ?? id;
}

/** Localized label of a crossroads choice (choices are objects in English, strings in overrides). */
export function crossChoice(cardId, i) {
  const o = CONTENT_OVERRIDES[lang]?.crossroads?.[cardId]?.choices?.[i];
  return o ?? CROSSROADS_BY_ID[cardId]?.choices[i]?.label ?? '';
}

/** Signed delta, e.g. +2 / −1. */
export function signed(n) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

export function hasKey(key, language = lang) {
  return key in DICTS[language];
}

export { en as EN_STRINGS, th as TH_STRINGS };
