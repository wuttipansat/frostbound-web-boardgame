// Top bar (morale, day, food, team, crisis, goal) and the log panel — drawn icons, no emoji.
import { journalEntries, daySummary } from '../journal.js';
import { h, mount, TYPE_REP } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { formatLog, describeEffects } from '../../i18n/format.js';
import {
  foodNeeded, foodDays, isStorm, season, siegeForecast, missionStatus, crisisDef, crisisRequirement, crisisScore, scenarioProgress, scenarioTarget,
} from '../../core/selectors.js';
import { counter } from '../ticker.js';
import { RULES } from '../../core/constants.js';
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

  const lastRound = !!s.scenario.days && s.day === s.scenario.days;
  const cMorale = counter('morale', s.morale);
  const morale = block(`morale${s.morale <= 3 ? ' critical' : ''}`, t('tip.morale'), 'morale', t('hud.morale'), cMorale,
    h('div', { class: 'meter' }, Array.from({ length: s.maxMorale }, (_, i) => h('i', { class: i < s.morale ? (s.morale <= 3 ? 'on low' : 'on') : '' }))));
  // Calendar: day n / 40, the time of day, and how much of the winter has passed.
  const round = block(`round calendar${lastRound ? ' critical' : ''}`, t('tip.day'), 'round', t('hud.day'),
    counter('round', s.day, { text: (v) => (s.scenario.days ? `${v}/${s.scenario.days}` : `${v}`) }),
    h('small', { class: `time t-${s.time ?? 'day'}` }, t(`time.${s.time ?? 'day'}`), h('span', { class: 'extra' }, isStorm(s) ? ` · ${t('hud.storm')}` : '', ` · ${t(`hud.season.${season(s)}`)}`)),
    h('div', { class: 'mini-bar' }, h('i', { style: { width: `${s.scenario.days ? Math.round((s.day / s.scenario.days) * 100) : 0}%` } })));
  const food = block(`food${s.food < need ? ' critical' : ''}`, t('tip.food'), 'food', t('hud.food'), counter('food', s.food),
    h('small', {}, t('hud.foodNeed', { n: need })),
    h('small', { class: foodDays(s) < 2 ? 'bad' : '' }, foodDays(s) === Infinity ? '' : t('hud.foodDays', { n: foodDays(s) })),
    s.starvation ? h('small', { class: 'bad' }, t('hud.starvation', { n: s.starvation })) : null);
  // Tonight's attack on the base: how many come, how many are stopped, how many bite.
  const sf = siegeForecast(s);
  const siege = block(`siege${sf.hits ? ' critical' : ''}`, t('tip.siege', { wall: sf.wall, guards: sf.guards, barricades: sf.barricades }), 'skull', t('hud.siege'), null,
    h('b', {}, t('hud.siegeShort', { n: sf.attackers, k: sf.stopped })),
    sf.hits ? h('small', { class: 'bad' }, sf.targets.length
      ? t('hud.siegeWho', { list: Object.entries(sf.targets.reduce((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 10 }), {})).map(([id, hp]) => `${c('survivors', id, 'name').split(' ')[0]} −${hp}`).join(', ') })
      : t('hud.siegeFood', { n: sf.hits })) : null);
  const ms = missionStatus(s);
  const mission = ms ? block('mission', t('tip.mission', { days: ms.daysLeft, n: 2 }), 'star', t('hud.mission'), null,
    h('b', {}, `${Math.min(ms.progress, ms.target)}/${ms.target}`), h('small', {}, t(`mission.${ms.id}`, { n: ms.target }))) : null;
  const team = block('helpless team', t('tip.team', { max: RULES.TEAM_MAX }), 'person', t('hud.team'), counter('team', s.team.survivors.length, { text: (v) => `${v}/${RULES.TEAM_MAX}` }));

  const crisisChip = crisis ? h('button', {
    class: `stat-block crisis${ui.crisisOpen ? ' open' : ''}`, tip: t('tip.crisis'),
    onclick: (ev) => { ev.stopPropagation(); ctx.set({ crisisOpen: !ui.crisisOpen }); },
    'aria-expanded': ui.crisisOpen ? 'true' : 'false',
  },
  art.item(TYPE_REP[crisis.item], 's', { cls: 'crisis-art', alt: t(`item.${crisis.item}`) }),
  h('span', { class: 'lbl' }, t('hud.crisis')),
  h('b', {}, c('crises', crisis.id, 'name')),
  h('small', {}, t('hud.crisisShort', { n: crisisRequirement(s), item: t(`item.${crisis.item}`), k: crisisScore(s) }))) : null;

  const goal = block('goal', t('tip.goal', { text: c('scenarios', s.scenario.id, 'goalText') }), 'goal', t('hud.goal'),
    counter('goal', scenarioProgress(s), { text: (v) => `${v}/${scenarioTarget(s)}` }));

  // UI-2: one row — morale, day, food, and an ⓘ button; everything else sits in the "today" card.
  const alert = sf.hits > 0; // UI-6: red only when someone gets bitten tonight
  const infoBtn = h('button', {
    class: `icon-btn info-btn${alert ? ' alert' : ''}${ui.infoOpen ? ' on' : ''}`, tip: t('hud.today'), 'aria-label': t('hud.today'),
    'aria-expanded': ui.infoOpen ? 'true' : 'false',
    onclick: (ev) => { ev.stopPropagation(); ctx.set({ infoOpen: !ui.infoOpen, topMore: false }); },
  }, h('b', {}, 'i'));
  const moreBtn = h('button', {
    class: `icon-btn top-more${ui.topMore ? ' on' : ''}`, tip: t('hud.menu'), 'aria-label': t('hud.menu'),
    onclick: (ev) => { ev.stopPropagation(); ctx.set({ topMore: !ui.topMore, infoOpen: false }); },
  }, icon('more'));
  mount(el,
    h('div', { class: 'brand-mini' }, 'FROSTBOUND'),
    morale, round, food,
    h('div', { class: 'spacer' }),
    infoBtn, moreBtn);
  if (ui.infoOpen) {
    el.append(h('div', { class: 'popover info-pop panel', role: 'dialog', 'aria-label': t('hud.today'), onclick: (ev) => ev.stopPropagation() },
      h('h3', {}, t('hud.today')), crisisChip, siege, goal, mission, team));
  }
  if (ui.topMore) {
    const item = (label, ico, fn) => h('button', { class: 'menu-item', onclick: (ev) => { ev.stopPropagation(); ctx.set({ topMore: false }); fn(); } }, ico, h('span', {}, label));
    el.append(h('div', { class: 'popover top-menu panel', role: 'menu', onclick: (ev) => ev.stopPropagation() },
      item(t('hud.rules'), h('b', {}, '?'), () => ctx.set({ modal: 'rules' })),
      item(t('hud.log'), icon('log'), () => ctx.set({ logOpen: !ui.logOpen })),
      item(`${t('settings.sound')}: ${t(ui.sound ? 'settings.on' : 'settings.off')}`, icon(ui.sound ? 'sound' : 'mute'), () => ctx.setSound(!ui.sound)),
      item(t('hud.settings'), icon('settings'), () => ctx.set({ modal: 'settings' }))));
  }

  if (crisis && ui.crisisOpen) {
    el.append(h('div', { class: 'popover crisis-pop panel', role: 'dialog', onclick: (ev) => ev.stopPropagation() },
      h('div', { class: 'pop-head' },
        art.item(TYPE_REP[crisis.item], 'l', { cls: 'pop-art', alt: '' }),
        h('div', {}, h('h3', {}, c('crises', crisis.id, 'name')), h('p', {}, c('crises', crisis.id, 'text')))),
      h('p', { class: 'need' }, t('hud.crisisNeed', { n: crisisRequirement(s), item: t(`item.${crisis.item}`) })),
      h('p', { class: 'fail' }, icon('crisis'), ` ${describeEffects(crisis.fail)}`),
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
    : ['death', 'overrun', 'infectionSpreads'].includes(e.k) ? 'bad' : '';
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
  for (let r = s.day; r >= 1; r--) {
    const lines = entries.filter((j) => j.day === r);
    if (!lines.length && r === s.day) continue;
    days.push(h('li', { class: 'jr-day' },
      h('b', {}, daySummary(s, r)),
      lines.length ? h('ul', {}, lines.map((j) => h('li', { class: `jr-line w${Math.min(5, j.weight)}` }, t(`jr.${j.key}`, j.params)))) : null));
  }
  return days.length ? h('ol', { class: 'journal' }, days) : h('p', { class: 'muted small jr-empty' }, t('jr.empty'));
}

// ---------------------------------------------------------------- step 11: phase banner

const PHASE_STEPS = ['dawn', 'day', 'dusk', 'night'];

/** Where the day is: Dawn → Day → Dusk → Night. */
export function renderPhase(el, ctx) {
  const s = ctx.state;
  const now = s.phase === PHASES.GAME_OVER || s.phase === PHASES.DRAFT ? null : (ctx.ui.queue[0]?.type === 'colony' ? 'night' : s.time);
  const who = s.phase === PHASES.DRAFT ? t('phase.draftWho')
    : s.phase === PHASES.GAME_OVER ? t('phase.over')
      : s.phase === PHASES.CROSSROADS ? t('phase.crossroadsWho') : ''; // the step list already says "Your turn"
  mount(el,
    h('span', { class: 'phase-round' }, t('phase.day', { n: s.day, total: s.scenario.days })),
    h('ol', { class: 'phase-steps' }, PHASE_STEPS.map((k) => h('li', { class: k === now ? 'now' : '' }, t(`time.${k}`)))),
    who ? h('span', { class: 'phase-who' }, who) : null,
    // Step 15: while a move plays out.
    ctx.watching ? h('span', { class: 'skip-hint' }, t('scene.skip')) : null);
}

