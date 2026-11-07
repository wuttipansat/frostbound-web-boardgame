// Top bar (morale, round, food, waste, crisis, goal, turn) and the log panel.
import { h, mount, ITEM_ICON, hex } from '../dom.js';
import { t, c } from '../../i18n/index.js';
import { formatLog, describeEffects } from '../../i18n/format.js';
import {
  foodNeeded, crisisDef, crisisRequirement, scenarioProgress, scenarioTarget, getPlayer,
} from '../../core/selectors.js';
import { RULES } from '../../core/constants.js';
import { PLAYER_COLORS } from '../../render/pieces.js';

export function renderTopbar(el, ctx) {
  const { state: s, ui } = ctx;
  const crisis = crisisDef(s);
  const active = s.activePlayerId ? getPlayer(s, s.activePlayerId) : null;
  const activeIdx = active ? s.players.indexOf(active) : 0;

  const morale = h('div', { class: 'stat-block morale', title: t('hud.morale') },
    h('span', { class: 'lbl' }, t('hud.morale')),
    h('div', { class: 'meter' }, Array.from({ length: s.maxMorale }, (_, i) => h('i', {
      class: i < s.morale ? (s.morale <= 3 ? 'on low' : 'on') : '',
    }))),
    h('b', {}, s.morale));

  const round = h('div', { class: 'stat-block' },
    h('span', { class: 'lbl' }, t('hud.round')),
    h('div', { class: 'track' }, Array.from({ length: s.scenario.rounds }, (_, i) => h('i', {
      class: i + 1 < s.round ? 'past' : i + 1 === s.round ? 'now' : '',
    }))),
    h('b', {}, `${s.round}/${s.scenario.rounds}`));

  const need = foodNeeded(s);
  const food = h('div', { class: `stat-block${s.food < need ? ' warn' : ''}` },
    h('span', { class: 'lbl' }, t('hud.food')),
    h('b', {}, `${ITEM_ICON.food} ${s.food}`),
    h('small', {}, t('hud.foodNeed', { n: need })),
    s.starvation ? h('small', { class: 'bad' }, t('hud.starvation', { n: s.starvation })) : null);

  const waste = h('div', { class: 'stat-block' },
    h('span', { class: 'lbl' }, t('hud.waste')),
    h('b', {}, `🗑 ${s.waste}`),
    h('div', { class: 'mini-bar' }, h('i', { style: { width: `${((s.waste % RULES.WASTE_PER_MORALE) / RULES.WASTE_PER_MORALE) * 100}%` } })));

  const crisisChip = crisis ? h('button', {
    class: `stat-block crisis${ui.crisisOpen ? ' open' : ''}`,
    onclick: () => ctx.set({ crisisOpen: !ui.crisisOpen }),
    'aria-expanded': ui.crisisOpen ? 'true' : 'false',
  },
  h('span', { class: 'lbl' }, t('hud.crisis')),
  h('b', {}, c('crises', crisis.id, 'name')),
  h('small', {}, `${ITEM_ICON[crisis.item]} ${t('hud.crisisNeed', { n: crisisRequirement(s), item: t(`item.${crisis.item}`) })} · ${t('hud.facedown', { n: s.crisis.contributions.length })}`)) : null;

  const goal = h('div', { class: 'stat-block goal', title: c('scenarios', s.scenario.id, 'goalText') },
    h('span', { class: 'lbl' }, t('hud.goal')),
    h('b', {}, `${scenarioProgress(s)}/${scenarioTarget(s)}`),
    h('small', {}, c('scenarios', s.scenario.id, 'name')));

  const turn = active ? h('div', { class: 'stat-block turn' },
    h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[activeIdx]) } }),
    h('b', {}, t('hud.turn', { name: active.name }))) : null;

  mount(el,
    h('div', { class: 'brand-mini' }, 'FROSTBOUND'),
    morale, round, food, waste, crisisChip, goal, turn,
    h('div', { class: 'spacer' }),
    h('button', { class: `icon-btn${ui.logOpen ? ' on' : ''}`, title: t('hud.log'), 'aria-label': t('hud.log'), onclick: () => ctx.set({ logOpen: !ui.logOpen }) }, '📜'),
    h('button', { class: 'icon-btn', title: t('hud.settings'), 'aria-label': t('hud.settings'), onclick: () => ctx.set({ modal: 'settings' }) }, '⚙'));

  if (crisis && ui.crisisOpen) {
    el.append(h('div', { class: 'popover crisis-pop panel' },
      h('h3', {}, c('crises', crisis.id, 'name')),
      h('p', {}, c('crises', crisis.id, 'text')),
      h('p', { class: 'need' }, `${ITEM_ICON[crisis.item]} ${t('hud.crisisNeed', { n: crisisRequirement(s), item: t(`item.${crisis.item}`) })}`),
      h('p', { class: 'fail' }, `✖ ${describeEffects(crisis.fail)}`),
      h('p', { class: 'muted' }, `${t('hud.helpless', { n: s.helpless })}`)));
  }
}

export function renderLog(el, ctx) {
  const { state: s, ui } = ctx;
  el.classList.toggle('hidden', !ui.logOpen);
  if (!ui.logOpen) return;
  const lines = [];
  for (let i = s.log.length - 1; i >= 0 && lines.length < 80; i--) {
    const e = s.log[i];
    const text = formatLog(e, s);
    if (!text) continue;
    const cls = e.k === 'roundStart' ? 'round' : ['death', 'overrun', 'infectionSpreads'].includes(e.k) ? 'bad'
      : e.k === 'exposure' && e.face !== 'blank' ? 'warn' : e.k === 'turnStart' ? 'turn' : '';
    lines.push(h('li', { class: cls }, text));
  }
  mount(el, h('h3', {}, t('hud.log')), h('ol', {}, lines));
}
