// Top bar (morale, round, food, waste, crisis, goal, turn) and the log panel — drawn icons, no emoji.
import { journalEntries, daySummary } from '../journal.js';
import { h, mount, TYPE_REP } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { formatLog, describeEffects } from '../../i18n/format.js';
import {
  foodNeeded, crisisDef, crisisRequirement, scenarioProgress, scenarioTarget,
} from '../../core/selectors.js';
import { RULES } from '../../core/constants.js';
import { counter } from '../ticker.js';
import { checklistView } from './help.js';
import { PHASES } from '../../core/constants.js';

export function renderTopbar(el, ctx) {
  const { state: s, ui, art } = ctx;
  const crisis = crisisDef(s);
  const need = foodNeeded(s);

  // A gauge: icon, label, value. `c` is a counter() result; while it is fresh the icon pulses.
  const block = (cls, tip, ico, label, cnt, ...body) => h('div', {
    class: `stat-block ${cls}${cnt?.live ? ' pulse' : ''}`, tip, tabindex: '0', role: 'group', 'aria-label': label,
    style: cnt?.live ? { animationDelay: `${-Math.round(cnt.age)}ms` } : {},
  }, icon(ico, 'stat-ico'), h('span', { class: 'lbl' }, label), cnt?.num ?? null, cnt?.tag ?? null, body);

  const lastRound = s.round === s.scenario.rounds;
  const wasteLeft = RULES.WASTE_PER_MORALE - (s.waste % RULES.WASTE_PER_MORALE);
  const cMorale = counter('morale', s.morale);
  const morale = block(`morale${s.morale <= 3 ? ' critical' : ''}`, t('tip.morale'), 'morale', t('hud.morale'), cMorale,
    h('div', { class: 'meter' }, Array.from({ length: s.maxMorale }, (_, i) => h('i', { class: i < s.morale ? (s.morale <= 3 ? 'on low' : 'on') : '' }))));
  const round = block(`round${lastRound ? ' critical' : ''}`, t('tip.round'), 'round', t('hud.round'),
    counter('round', s.round, { text: (v) => `${v}/${s.scenario.rounds}` }),
    h('div', { class: 'track' }, Array.from({ length: s.scenario.rounds }, (_, i) => h('i', { class: i + 1 < s.round ? 'past' : i + 1 === s.round ? 'now' : '' }))));
  const food = block(`food${s.food < need ? ' critical' : ''}`, t('tip.food'), 'food', t('hud.food'), counter('food', s.food),
    h('small', {}, t('hud.foodNeed', { n: need })),
    s.starvation ? h('small', { class: 'bad' }, t('hud.starvation', { n: s.starvation })) : null);
  const waste = block(`waste${wasteLeft <= 2 ? ' critical' : ''}`, t('tip.waste'), 'waste', t('hud.waste'), counter('waste', s.waste, { goodWhen: 'down' }),
    h('div', { class: 'mini-bar' }, h('i', { style: { width: `${((s.waste % RULES.WASTE_PER_MORALE) / RULES.WASTE_PER_MORALE) * 100}%` } })));
  const helpless = block('helpless', t('tip.helpless'), 'person', t('hud.helplessShort'), counter('helpless', s.helpless));

  const crisisChip = crisis ? h('button', {
    class: `stat-block crisis${ui.crisisOpen ? ' open' : ''}`, tip: t('tip.crisis'),
    onclick: (ev) => { ev.stopPropagation(); ctx.set({ crisisOpen: !ui.crisisOpen }); },
    'aria-expanded': ui.crisisOpen ? 'true' : 'false',
  },
  art.item(TYPE_REP[crisis.item], 's', { cls: 'crisis-art', alt: t(`item.${crisis.item}`) }),
  h('span', { class: 'lbl' }, t('hud.crisis')),
  h('b', {}, c('crises', crisis.id, 'name')),
  h('small', {}, t('hud.crisisShort', { n: crisisRequirement(s), item: t(`item.${crisis.item}`), k: s.crisis.contributions.length }))) : null;

  const goal = block('goal', t('tip.goal', { text: c('scenarios', s.scenario.id, 'goalText') }), 'goal', t('hud.goal'),
    counter('goal', scenarioProgress(s), { text: (v) => `${v}/${scenarioTarget(s)}` }));

  mount(el,
    h('div', { class: 'brand-mini' }, 'FROSTBOUND'),
    morale, food, waste, helpless, round, goal, crisisChip,
    h('div', { class: 'spacer' }),
    h('button', { class: 'icon-btn rules-btn', tip: t('hud.rules'), 'aria-label': t('hud.rules'), onclick: () => ctx.set({ modal: 'rules' }) }, '?'),
    h('button', { class: `icon-btn${ui.logOpen ? ' on' : ''}`, tip: t('hud.log'), 'aria-label': t('hud.log'), onclick: () => ctx.set({ logOpen: !ui.logOpen }) }, icon('log')),
    h('button', { class: 'icon-btn', tip: t('hud.settings'), 'aria-label': t('hud.settings'), onclick: () => ctx.set({ modal: 'settings' }) }, icon('settings')));

  if (crisis && ui.crisisOpen) {
    el.append(h('div', { class: 'popover crisis-pop panel', role: 'dialog', onclick: (ev) => ev.stopPropagation() },
      h('div', { class: 'pop-head' },
        art.item(TYPE_REP[crisis.item], 'l', { cls: 'pop-art', alt: '' }),
        h('div', {}, h('h3', {}, c('crises', crisis.id, 'name')), h('p', {}, c('crises', crisis.id, 'text')))),
      h('p', { class: 'need' }, t('hud.crisisNeed', { n: crisisRequirement(s), item: t(`item.${crisis.item}`) })),
      h('p', { class: 'fail' }, icon('crisis'), ` ${describeEffects(crisis.fail)}`),
      h('p', { class: 'muted' }, icon('person'), ` ${t('hud.helpless', { n: s.helpless })}`),
      h('h4', {}, t('check.title')),
      checklistView(s)));
  }
}

// ---------------------------------------------------------------- step 13: floating action feed

const FEED_MS = 6000;
const FEED_MAX = 3;
const feed = { last: null, first: null, items: [] }; // items: { e, at }

/** Track entries as they arrive (client side), so the feed can fade them after a few seconds. */
function trackFeed(s, now) {
  const first = s.log[0] ? JSON.stringify(s.log[0]) : null;
  if (feed.first !== null && first !== feed.first && s.log.length < 200) { feed.items = []; feed.last = null; } // a new game
  feed.first = first;
  if (feed.last === null) { feed.last = s.log.length ? JSON.stringify(s.log.at(-1)) : ''; return; } // first sight: no flood
  let i = s.log.length - 1;
  while (i >= 0 && JSON.stringify(s.log[i]) !== feed.last) i--;
  for (let k = i + 1; k < s.log.length; k++) feed.items.push({ e: s.log[k], at: now });
  feed.last = s.log.length ? JSON.stringify(s.log.at(-1)) : '';
  feed.items = feed.items.filter((x) => now - x.at < FEED_MS).slice(-12);
}

function feedLine(e, s, ctx, { age = null } = {}) {
  const text = formatLog(e, s);
  if (!text) return null;
  const cls = e.k === 'roundStart' ? 'round' : e.k === 'turnStart' ? 'turn'
    : ['death', 'overrun', 'infectionSpreads'].includes(e.k) ? 'bad' : e.k === 'exposure' && e.face !== 'blank' ? 'warn' : '';
  return h('li', {
    class: `feed-item ${cls}`,
    style: age != null ? { animationDelay: `${-Math.round(age)}ms` } : {},
  },
  e.survivorId && s.survivors[e.survivorId] ? ctx.art.portrait(e.survivorId, 's', { cls: `log-face${e.k === 'death' ? ' dead' : ''}` }) : null,
  h('span', { class: 'txt' }, text));
}

/**
 * Top-centre feed: the last few actions fade in and out; hovering, focusing or pinning (log button)
 * opens the history.
 */
export function renderLog(el, ctx) {
  const { state: s, ui } = ctx;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  trackFeed(s, now);
  el.classList.remove('hidden');
  el.classList.toggle('pinned', !!ui.logOpen);
  el.tabIndex = 0;
  el.setAttribute('aria-label', t('hud.log'));
  const recent = feed.items.slice(-FEED_MAX).reverse()
    .map((x) => feedLine(x.e, s, ctx, { age: now - x.at })).filter(Boolean);
  const history = [];
  for (let i = s.log.length - 1; i >= 0 && history.length < 40; i--) {
    const li = feedLine(s.log[i], s, ctx);
    if (li) history.push(li);
  }
  const journal = ui.logTab === 'journal';
  const tab = (id, label) => h('button', { class: `feed-tab${(ui.logTab ?? 'log') === id ? ' on' : ''}`, role: 'tab', 'aria-selected': (ui.logTab ?? 'log') === id ? 'true' : 'false', onclick: () => ctx.set({ logTab: id }) }, label);
  mount(el,
    h('ol', { class: 'feed-recent' }, recent),
    h('div', { class: 'feed-history' },
      h('div', { class: 'feed-head' }, h('span', { class: 'feed-tabs', role: 'tablist' }, tab('log', t('jr.tabLog')), tab('journal', t('jr.tab'))),
        h('button', { class: `icon-btn pin${ui.logOpen ? ' on' : ''}`, tip: t('tip.logPin'), 'aria-label': t('tip.logPin'), 'aria-pressed': ui.logOpen ? 'true' : 'false', onclick: () => ctx.set({ logOpen: !ui.logOpen }) }, icon('log'))),
      journal ? journalView(s) : h('ol', {}, history)));
}

/** Step 21: the diary — newest day first, each with its one-line summary. */
function journalView(s) {
  const entries = journalEntries(s);
  const days = [];
  for (let r = s.round; r >= 1; r--) {
    const lines = entries.filter((j) => j.round === r);
    if (!lines.length && r === s.round) continue;
    days.push(h('li', { class: 'jr-day' },
      h('b', {}, daySummary(s, r)),
      lines.length ? h('ul', {}, lines.map((j) => h('li', { class: `jr-line w${Math.min(5, j.weight)}` }, t(`jr.${j.key}`, j.params)))) : null));
  }
  return days.length ? h('ol', { class: 'journal' }, days) : h('p', { class: 'muted small jr-empty' }, t('jr.empty'));
}

// ---------------------------------------------------------------- step 11: phase banner

const PHASE_STEPS = ['draft', 'crossroads', 'turn', 'colony'];

/** Where the round is: Draft → (Crossroads) → Your turn → Colony phase. */
export function renderPhase(el, ctx) {
  const s = ctx.state;
  const now = s.phase === PHASES.GAME_OVER ? null : s.phase;
  const who = s.phase === PHASES.DRAFT ? t('phase.draftWho')
    : s.phase === PHASES.GAME_OVER ? t('phase.over')
      : s.phase === PHASES.CROSSROADS ? t('phase.crossroadsWho') : ''; // the step list already says "Your turn"
  mount(el,
    h('span', { class: 'phase-round' }, t('phase.round', { n: s.round, total: s.scenario.rounds })),
    h('ol', { class: 'phase-steps' }, PHASE_STEPS.map((k) => h('li', { class: k === now ? 'now' : '' }, t(`phase.${k}`)))),
    who ? h('span', { class: 'phase-who' }, who) : null,
    // Step 15: while a move plays out.
    ctx.watching ? h('span', { class: 'skip-hint' }, t('scene.skip')) : null);
}

