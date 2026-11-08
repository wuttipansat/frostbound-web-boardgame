// Step 18: help for new players — the next-move hint bar, the "this round" checklist, and the quick rules.
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { botAction } from '../../ai/simpleBot.js';
import { getPlayer, itemOf, survivorDef, foodNeeded, crisisDef, crisisRequirement } from '../../core/selectors.js';
import { LOCATIONS } from '../../content/locations.js';
import { RULES } from '../../core/constants.js';

const fixedRandom = () => 0.5;
let cache = { state: null, viewer: null, hint: null };

/** The move the (cooperative) bot logic would make for this player, as text + a reason + where to point. */
export function suggestion(s, viewer) {
  if (cache.state === s && cache.viewer === viewer) return cache.hint;
  let hint = null;
  try {
    const a = botAction(s, viewer, { random: fixedRandom, cooperative: true });
    hint = a ? describe(s, viewer, a) : null;
  } catch { hint = null; } // an online view lacks hidden data: no hint rather than a wrong one
  cache = { state: s, viewer, hint };
  return hint;
}

function describe(s, me, a) {
  const p = getPlayer(s, me);
  const sv = a.survivorId ? survivorDef(a.survivorId).name : '';
  const at = a.survivorId ? s.survivors[a.survivorId]?.location : null;
  const place = (id) => c('locations', id, 'name');
  const die = a.dieIndex != null ? p.dice[a.dieIndex]?.v : null;
  const card = a.cardUid ? c('items', itemOf(s, a.cardUid).id, 'name') : '';
  const crisis = crisisDef(s);
  const crisisWhy = crisis ? t('why.crisis', { n: crisisRequirement(s), item: t(`item.${crisis.item}`), k: s.crisis.contributions.length }) : '';
  const loc = (id) => s.locations[id];
  switch (a.type) {
    case 'MOVE': return { text: t('hint.move', { sv, place: place(a.toLocation) }), why: loc(a.toLocation).zombies ? t('why.zombies', { n: loc(a.toLocation).zombies }) : '', point: { survivor: a.survivorId, location: a.toLocation, move: true } };
    case 'ATTACK': return { text: t('hint.attack', { sv, place: place(at), v: die }), why: t('why.zombies', { n: loc(at).zombies }), point: { survivor: a.survivorId, die: a.dieIndex } };
    case 'SEARCH': return { text: t('hint.search', { sv, place: place(at), v: die }), why: s.food < foodNeeded(s) ? t('why.food', { have: s.food, need: foodNeeded(s) }) : t('why.cards', { n: loc(at).deckCount ?? loc(at).deck?.length ?? 0 }), point: { survivor: a.survivorId, die: a.dieIndex } };
    case 'BARRICADE': return { text: t('hint.barricade', { sv, place: place(at) }), why: t('why.dice'), point: { survivor: a.survivorId, die: a.dieIndex } };
    case 'CLEAN': return { text: t('hint.clean', { sv }), why: t('why.waste', { n: s.waste }), point: { survivor: a.survivorId, die: a.dieIndex } };
    case 'LURE': return { text: t('hint.lure', { sv, place: place(a.toLocation) }), why: t('why.zombies', { n: loc(at).zombies }), point: { survivor: a.survivorId, die: a.dieIndex } };
    case 'USE_ABILITY': return { text: t('hint.ability', { sv }), why: '', point: { survivor: a.survivorId } };
    case 'PLAY_CARD': return { text: t('hint.play', { card }), why: itemOf(s, a.cardUid).type === 'food' && s.food < foodNeeded(s) ? t('why.food', { have: s.food, need: foodNeeded(s) }) : '', point: { card: a.cardUid } };
    case 'CONTRIBUTE': return { text: t('hint.contribute', { card }), why: crisisWhy, point: { card: a.cardUid } };
    case 'DEPOSIT': return { text: t('hint.deposit', { card }), why: '', point: { card: a.cardUid } };
    case 'END_TURN': return { text: t('hint.end'), why: '', point: { end: true } };
    default: return null;
  }
}

/** Floating bar with the suggested next move; "Show me" points at the place, survivor, die or card. */
export function renderHint(el, ctx) {
  const { state: s, ui } = ctx;
  const hint = s && ctx.canAct && ui.hints !== false && !ctx.watching && !ui.selCard ? suggestion(s, ctx.viewer) : null;
  el.classList.toggle('hidden', !hint);
  if (!hint) { mount(el); el.dataset.key = ''; return; }
  const key = `${hint.text}|${hint.why}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const show = () => {
    const pt = hint.point;
    if (pt.end) { const b = document.querySelector('#pp-actions .btn.end-turn'); b?.classList.remove('nudge'); void b?.offsetWidth; b?.classList.add('nudge'); b?.focus(); return; }
    if (pt.card) { ctx.set({ selCard: pt.card }); return; }
    if (pt.move) { ctx.selectSurvivor(pt.survivor); ctx.selectLocation(pt.location); ctx.set({ movePick: pt.location }); return; }
    if (pt.survivor) { ctx.selectSurvivor(pt.survivor); if (pt.die != null) ctx.set({ selDie: pt.die }); }
  };
  mount(el,
    h('span', { class: 'hint-ico', 'aria-hidden': 'true' }, icon('star')),
    h('span', { class: 'hint-body' }, h('small', {}, t('hint.label')), h('b', {}, hint.text), hint.why ? h('span', { class: 'why' }, hint.why) : null),
    h('button', { class: 'btn small-btn', onclick: show }, t('hint.show')),
    h('button', { class: 'close', 'aria-label': t('act.close'), tip: t('settings.hints'), onclick: () => ctx.setHints(false) }, icon('close')));
}

/** "This round" in plain words: food, crisis, colony. */
export function roundChecklist(s) {
  const need = foodNeeded(s);
  const crisis = crisisDef(s);
  const req = crisis ? crisisRequirement(s) : 0;
  const k = s.crisis?.contributions?.length ?? 0;
  const z = s.locations.colony?.zombies ?? 0;
  const zMax = LOCATIONS.colony?.zombieSlots ?? 12;
  const wasteLeft = RULES.WASTE_PER_MORALE - (s.waste % RULES.WASTE_PER_MORALE);
  return [
    { key: 'food', ok: s.food >= need, text: t('check.food', { have: s.food, need }) },
    crisis ? { key: 'crisis', ok: k >= req, text: t('check.crisis', { k, n: req }) } : null,
    { key: 'colony', ok: z < zMax - 2 && wasteLeft > 2, text: t('check.colony', { z, w: s.waste }) },
  ].filter(Boolean);
}

export function checklistView(s, { onlyBad = false } = {}) {
  const rows = roundChecklist(s).filter((r) => !onlyBad || !r.ok);
  if (!rows.length) return null;
  return h('ul', { class: 'checklist' }, rows.map((r) => h('li', { class: r.ok ? 'ok' : 'bad', dataset: { check: r.key } },
    icon(r.ok ? 'check' : 'exposure'), h('span', {}, r.text))));
}

const RULE_CARDS = [['turn', 'hand'], ['dice', 'dice'], ['move', 'snowflake'], ['cards', 'lock'], ['crisis', 'crisis'], ['morale', 'morale'], ['secret', 'star'], ['vote', 'vote']];

/** Quick rules: eight small cards. Opening them does not pause the game. */
export function rulesModal(ctx) {
  return h('div', { class: 'backdrop rules', onclick: (ev) => { if (ev.target === ev.currentTarget) ctx.set({ modal: null }); } },
    h('div', { class: 'dialog panel rules-dialog', role: 'dialog', 'aria-label': t('rules.title') },
      h('button', { class: 'close', 'aria-label': t('act.close'), onclick: () => ctx.set({ modal: null }) }, icon('close')),
      h('h2', {}, t('rules.title')),
      h('div', { class: 'rule-cards' }, RULE_CARDS.map(([id, ico]) => h('section', { class: 'rule-card', dataset: { rule: id } },
        h('h3', {}, icon(ico), t(`rules.${id}.title`)),
        h('p', {}, t(`rules.${id}.text`)),
        h('p', { class: 'ex' }, t(`rules.${id}.ex`)))))));
}
