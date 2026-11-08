// Top bar (morale, round, food, waste, crisis, goal, turn) and the log panel — drawn icons, no emoji.
import { h, mount, hex, TYPE_REP } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { formatLog, describeEffects } from '../../i18n/format.js';
import {
  foodNeeded, crisisDef, crisisRequirement, scenarioProgress, scenarioTarget, getPlayer, aliveSurvivorsOf, freeZombieSlots,
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

export function renderLog(el, ctx) {
  const { state: s, ui, art } = ctx;
  el.classList.toggle('hidden', !ui.logOpen);
  if (!ui.logOpen) return;
  const lines = [];
  for (let i = s.log.length - 1; i >= 0 && lines.length < 80; i--) {
    const e = s.log[i];
    const text = formatLog(e, s);
    if (!text) continue;
    const cls = e.k === 'roundStart' ? 'round' : ['death', 'overrun', 'infectionSpreads'].includes(e.k) ? 'bad'
      : e.k === 'exposure' && e.face !== 'blank' ? 'warn' : e.k === 'turnStart' ? 'turn' : '';
    const who = e.survivorId && s.survivors[e.survivorId] ? art.portrait(e.survivorId, 's', { cls: `log-face${e.k === 'death' ? ' dead' : ''}` }) : null;
    lines.push(h('li', { class: cls }, who, h('span', {}, text)));
  }
  mount(el, h('h3', {}, t('hud.log')), h('ol', {}, lines));
}

// ---------------------------------------------------------------- step 11: phase banner + colony status

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

/** Public colony overview: who is alive, health, the colony gate, and what the colony phase will do next. */
export function renderColony(el, ctx) {
  const s = ctx.state;
  if (s.phase === PHASES.DRAFT) { mount(el); return; }
  const alive = Object.values(s.survivors).filter((sv) => sv.alive);
  const wounds = alive.reduce((n, sv) => n + sv.wounds, 0);
  const frost = alive.filter((sv) => sv.frostbite).length;
  const col = s.locations.colony;
  const cap = col.zombies + freeZombieSlots(s, 'colony');
  const need = foodNeeded(s);
  const crisis = crisisDef(s);
  const wastePenalty = Math.floor(s.waste / RULES.WASTE_PER_MORALE);
  const bar = (v, max, cls = '') => h('span', { class: `bar ${cls}` }, h('i', { style: { width: `${Math.min(100, (v / Math.max(1, max)) * 100)}%` } }));
  const row = (ico, label, value, extra = null, cls = '') => h('li', { class: cls }, icon(ico), h('span', { class: 'k' }, label), h('b', {}, value), extra);
  mount(el,
    h('h3', {}, t('colony.status')),
    h('ul', { class: 'cs-players' }, s.players.map((p, i) => h('li', { class: p.exiled ? 'exiled' : '' },
      h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[i]) } }),
      h('span', { class: 'k' }, p.name),
      h('b', { tip: t('colony.aliveFallen') }, `${aliveSurvivorsOf(s, p.id).length}`, h('small', {}, ` / ${p.fallen.length}†`))))),
    h('ul', { class: 'cs-rows' },
      row('heal', t('colony.health'), t('colony.healthVal', { w: wounds, f: frost }), null, wounds + frost ? 'warn' : ''),
      row('skull', t('colony.gate'), `${col.zombies}/${cap}`, bar(col.zombies, cap, col.zombies >= cap - 1 ? 'bad' : ''), col.zombies >= cap - 1 ? 'bad' : ''),
      row('barricade', t('colony.barricades'), String(col.barricades))),
    h('h4', {}, t('colony.next')),
    h('ul', { class: 'cs-rows next' },
      row('food', t('colony.nextFood'), s.food >= need ? t('colony.eats', { n: need }) : t('colony.short', { n: need - s.food }), null, s.food >= need ? '' : 'bad'),
      row('waste', t('colony.nextWaste'), wastePenalty ? `−${wastePenalty}` : '0', null, wastePenalty ? 'bad' : ''),
      crisis ? h('li', { class: 'warn', tip: t('colony.failTip', { fx: describeEffects(crisis.fail) }) }, icon('crisis'), h('span', { class: 'k' }, t('colony.nextCrisis')),
        h('b', {}, t('hud.crisisShort', { n: crisisRequirement(s), item: t(`item.${crisis.item}`), k: s.crisis.contributions.length }))) : null,
      s.starvation ? row('food', t('colony.starving'), String(s.starvation), null, 'bad') : null));
}
