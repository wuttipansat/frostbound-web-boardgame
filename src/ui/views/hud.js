// Top bar (morale, round, food, waste, crisis, goal, turn) and the log panel — drawn icons, no emoji.
import { h, mount, hex, TYPE_REP } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { formatLog, describeEffects } from '../../i18n/format.js';
import {
  foodNeeded, crisisDef, crisisRequirement, scenarioProgress, scenarioTarget, getPlayer,
} from '../../core/selectors.js';
import { RULES } from '../../core/constants.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import { counter } from '../ticker.js';
import { PHASES } from '../../core/constants.js';

export function renderTopbar(el, ctx) {
  const { state: s, ui, art } = ctx;
  const crisis = crisisDef(s);
  const active = s.activePlayerId ? getPlayer(s, s.activePlayerId) : null;
  const activeIdx = active ? s.players.indexOf(active) : 0;
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

  const turn = active ? h('div', { class: 'stat-block turn' },
    h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[activeIdx]) } }),
    h('b', {}, t('hud.turn', { name: active.name }))) : null;

  mount(el,
    h('div', { class: 'brand-mini' }, 'FROSTBOUND'),
    morale, food, waste, helpless, round, goal, crisisChip, turn,
    h('div', { class: 'spacer' }),
    h('button', { class: `icon-btn${ui.logOpen ? ' on' : ''}`, tip: t('hud.log'), 'aria-label': t('hud.log'), onclick: () => ctx.set({ logOpen: !ui.logOpen }) }, icon('log')),
    h('button', { class: 'icon-btn', tip: t('hud.settings'), 'aria-label': t('hud.settings'), onclick: () => ctx.set({ modal: 'settings' }) }, icon('settings')));

  if (crisis && ui.crisisOpen) {
    el.append(h('div', { class: 'popover crisis-pop panel', role: 'dialog', onclick: (ev) => ev.stopPropagation() },
      h('div', { class: 'pop-head' },
        art.item(TYPE_REP[crisis.item], 'l', { cls: 'pop-art', alt: '' }),
        h('div', {}, h('h3', {}, c('crises', crisis.id, 'name')), h('p', {}, c('crises', crisis.id, 'text')))),
      h('p', { class: 'need' }, t('hud.crisisNeed', { n: crisisRequirement(s), item: t(`item.${crisis.item}`) })),
      h('p', { class: 'fail' }, icon('crisis'), ` ${describeEffects(crisis.fail)}`),
      h('p', { class: 'muted' }, icon('person'), ` ${t('hud.helpless', { n: s.helpless })}`)));
  }
}

// ---------------------------------------------------------------- step 13: floating action feed

const FEED_MS = 6000;
const FEED_MAX = 3;
const feed = { last: null, first: null, items: [] }; // items: { e, at }

// Entries the colony / round produce on their own: never attributed to a player.
const SYSTEM_KEYS = new Set(['roundStart', 'crisisResolved', 'fed', 'starvation', 'spawn', 'zombies', 'overrun', 'crisisDrawn', 'gameOver', 'voteResult']);

/**
 * Who did each log entry: its playerId, the owner of its survivor, or else whoever's turn it was
 * (a barricade or a card draw has no playerId of its own). Colony-phase and system entries: null.
 */
function attribute(log, s) {
  let turnOf = null;
  return log.map((e) => {
    if (e.k === 'turnStart') turnOf = e.playerId;
    if (e.k === 'roundStart' || e.k === 'turnEnd' || e.k === 'crisisResolved') { const was = e.k === 'turnEnd' ? e.playerId : null; turnOf = null; if (was) return was; }
    if (e.playerId) return e.playerId;
    if (e.survivorId) return s.survivors[e.survivorId]?.owner ?? null;
    return SYSTEM_KEYS.has(e.k) ? null : turnOf;
  });
}

/** Track entries as they arrive (client side), so the feed can fade them after a few seconds. */
function trackFeed(s, now) {
  const first = s.log[0] ? JSON.stringify(s.log[0]) : null;
  if (feed.first !== null && first !== feed.first && s.log.length < 200) { feed.items = []; feed.last = null; } // a new game
  feed.first = first;
  if (feed.last === null) { feed.last = s.log.length ? JSON.stringify(s.log.at(-1)) : ''; return; } // first sight: no flood
  let i = s.log.length - 1;
  while (i >= 0 && JSON.stringify(s.log[i]) !== feed.last) i--;
  const who = attribute(s.log, s);
  for (let k = i + 1; k < s.log.length; k++) feed.items.push({ e: s.log[k], at: now, pid: who[k] });
  feed.last = s.log.length ? JSON.stringify(s.log.at(-1)) : '';
  feed.items = feed.items.filter((x) => now - x.at < FEED_MS).slice(-12);
}

function feedLine(e, s, ctx, { age = null, pid = null } = {}) {
  const text = formatLog(e, s);
  if (!text) return null;
  const p = pid ? s.players.find((x) => x.id === pid) : null;
  const idx = p ? s.players.indexOf(p) : -1;
  const cls = e.k === 'roundStart' ? 'round' : e.k === 'turnStart' ? 'turn'
    : ['death', 'overrun', 'infectionSpreads'].includes(e.k) ? 'bad' : e.k === 'exposure' && e.face !== 'blank' ? 'warn' : '';
  const mine = pid && pid === s.activePlayerId;
  return h('li', {
    class: `feed-item ${cls}${mine ? ' actor' : pid ? '' : ' system'}`,
    style: age != null ? { animationDelay: `${-Math.round(age)}ms`, '--accent-p': p ? hex(PLAYER_COLORS[idx]) : 'transparent' } : { '--accent-p': p ? hex(PLAYER_COLORS[idx]) : 'transparent' },
  },
  // The acting player leads every line (turn-start lines already say who, so just the colour dot).
  p ? h('span', { class: 'who' }, h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[idx]) } }), e.k === 'turnStart' ? null : p.name) : null,
  e.survivorId && s.survivors[e.survivorId] ? ctx.art.portrait(e.survivorId, 's', { cls: `log-face${e.k === 'death' ? ' dead' : ''}` }) : null,
  h('span', { class: 'txt' }, text));
}

/**
 * Top-centre feed: the last few actions fade in and out; hovering, focusing or pinning (log button)
 * opens the history. Only public information (formatLog) is ever shown.
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
    .map((x) => feedLine(x.e, s, ctx, { age: now - x.at, pid: x.pid })).filter(Boolean);
  const history = [];
  const who = attribute(s.log, s);
  for (let i = s.log.length - 1; i >= 0 && history.length < 40; i--) {
    const li = feedLine(s.log[i], s, ctx, { pid: who[i] });
    if (li) history.push(li);
  }
  mount(el,
    h('ol', { class: 'feed-recent' }, recent),
    h('div', { class: 'feed-history' },
      h('div', { class: 'feed-head' }, h('span', {}, t('hud.log')),
        h('button', { class: `icon-btn pin${ui.logOpen ? ' on' : ''}`, tip: t('tip.logPin'), 'aria-label': t('tip.logPin'), 'aria-pressed': ui.logOpen ? 'true' : 'false', onclick: () => ctx.set({ logOpen: !ui.logOpen }) }, icon('log'))),
      h('ol', {}, history)));
}

// ---------------------------------------------------------------- step 11: phase banner

const PHASE_STEPS = ['draft', 'crossroads', 'turn', 'colony'];

/** Where the round is: Draft → (Crossroads) → Turn of <player> → Colony phase, plus whose move it is. */
export function renderPhase(el, ctx) {
  const s = ctx.state;
  const active = s.activePlayerId ? getPlayer(s, s.activePlayerId) : null;
  const now = s.phase === PHASES.VOTE ? 'turn' : s.phase === PHASES.GAME_OVER ? null : s.phase;
  const who = s.phase === PHASES.DRAFT ? t('phase.draftWho')
    : s.phase === PHASES.VOTE ? t('phase.vote')
      : s.phase === PHASES.GAME_OVER ? t('phase.over')
        : active ? t(s.phase === PHASES.CROSSROADS ? 'phase.crossroadsWho' : 'phase.turnWho', { name: active.name }) : '';
  const idx = active ? s.players.indexOf(active) : -1;
  mount(el,
    h('span', { class: 'phase-round' }, t('phase.round', { n: s.round, total: s.scenario.rounds })),
    h('ol', { class: 'phase-steps' }, PHASE_STEPS.map((k) => h('li', { class: k === now ? 'now' : '' }, t(`phase.${k}`)))),
    h('span', { class: 'phase-who' },
      idx >= 0 && s.phase !== PHASES.DRAFT ? h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[idx]) } }) : null, who));
}

