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

export function renderTopbar(el, ctx) {
  const { state: s, ui, art } = ctx;
  const crisis = crisisDef(s);
  const active = s.activePlayerId ? getPlayer(s, s.activePlayerId) : null;
  const activeIdx = active ? s.players.indexOf(active) : 0;
  const need = foodNeeded(s);

  const block = (cls, tip, ico, label, ...body) => h('div', { class: `stat-block ${cls}`, tip, tabindex: '0', role: 'group', 'aria-label': label },
    icon(ico, 'stat-ico'), h('span', { class: 'lbl' }, label), body);

  const morale = block('morale', t('tip.morale'), 'morale', t('hud.morale'),
    h('div', { class: 'meter' }, Array.from({ length: s.maxMorale }, (_, i) => h('i', { class: i < s.morale ? (s.morale <= 3 ? 'on low' : 'on') : '' }))),
    h('b', {}, s.morale));
  const round = block('round', t('tip.round'), 'round', t('hud.round'),
    h('div', { class: 'track' }, Array.from({ length: s.scenario.rounds }, (_, i) => h('i', { class: i + 1 < s.round ? 'past' : i + 1 === s.round ? 'now' : '' }))),
    h('b', {}, `${s.round}/${s.scenario.rounds}`));
  const food = block(`food${s.food < need ? ' warn' : ''}`, t('tip.food'), 'food', t('hud.food'),
    h('b', {}, s.food), h('small', {}, t('hud.foodNeed', { n: need })),
    s.starvation ? h('small', { class: 'bad' }, t('hud.starvation', { n: s.starvation })) : null);
  const waste = block('waste', t('tip.waste'), 'waste', t('hud.waste'),
    h('b', {}, s.waste),
    h('div', { class: 'mini-bar' }, h('i', { style: { width: `${((s.waste % RULES.WASTE_PER_MORALE) / RULES.WASTE_PER_MORALE) * 100}%` } })));

  const crisisChip = crisis ? h('button', {
    class: `stat-block crisis${ui.crisisOpen ? ' open' : ''}`, tip: t('tip.crisis'),
    onclick: (ev) => { ev.stopPropagation(); ctx.set({ crisisOpen: !ui.crisisOpen }); },
    'aria-expanded': ui.crisisOpen ? 'true' : 'false',
  },
  art.item(TYPE_REP[crisis.item], 's', { cls: 'crisis-art', alt: t(`item.${crisis.item}`) }),
  h('span', { class: 'lbl' }, t('hud.crisis')),
  h('b', {}, c('crises', crisis.id, 'name')),
  h('small', {}, `${t('hud.crisisNeed', { n: crisisRequirement(s), item: t(`item.${crisis.item}`) })} · ${t('hud.facedown', { n: s.crisis.contributions.length })}`)) : null;

  const goal = block('goal', t('tip.goal', { text: c('scenarios', s.scenario.id, 'goalText') }), 'goal', t('hud.goal'),
    h('b', {}, `${scenarioProgress(s)}/${scenarioTarget(s)}`),
    h('small', {}, c('scenarios', s.scenario.id, 'name')));

  const turn = active ? h('div', { class: 'stat-block turn' },
    h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[activeIdx]) } }),
    h('b', {}, t('hud.turn', { name: active.name }))) : null;

  mount(el,
    h('div', { class: 'brand-mini' }, 'FROSTBOUND'),
    morale, round, food, waste, crisisChip, goal, turn,
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
