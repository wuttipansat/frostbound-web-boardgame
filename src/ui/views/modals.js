// Full-screen screens and dialogs: setup, settings, pass-the-device, draft, crossroads, requests, vote, game over.
import { h, mount, ITEM_ICON, hex } from '../dom.js';
import { t, c, LANGUAGES, getLang } from '../../i18n/index.js';
import { describeEffects } from '../../i18n/format.js';
import { SCENARIOS } from '../../content/scenarios.js';
import { CROSSROADS_BY_ID } from '../../content/crossroads.js';
import { ITEM_TYPES, RULES } from '../../core/constants.js';
import { getPlayer, survivorDef, itemOf, objectiveDef } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import * as act from '../../core/actions.js';

function dialog(cls, ...children) {
  return h('div', { class: `backdrop ${cls}` }, h('div', { class: 'dialog panel', role: 'dialog', 'aria-modal': 'true' }, children));
}

// ---------------------------------------------------------------- setup

export function setupScreen(ctx) {
  const cfg = ctx.ui.setup;
  const update = (patch) => ctx.set({ setup: { ...cfg, ...patch } });
  const seats = cfg.seats.slice(0, cfg.count);
  return h('div', { class: 'backdrop setup' }, h('div', { class: 'dialog panel wide' },
    h('h1', { class: 'logo' }, 'FROSTBOUND'),
    h('p', { class: 'tagline' }, t('app.tagline')),
    ctx.hasSave ? h('button', { class: 'btn primary wide', onclick: ctx.continueGame }, `↻ ${t('setup.continue')}`) : null,
    h('h2', {}, t('setup.title')),
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('setup.players')),
      h('div', { class: 'seg' }, [2, 3, 4, 5].map((n) => h('button', { class: cfg.count === n ? 'on' : '', onclick: () => update({ count: n }) }, n)))),
    h('div', { class: 'seats' }, seats.map((seat, i) => h('div', { class: 'seat' },
      h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[i]) } }),
      h('input', {
        value: seat.name, 'aria-label': t('setup.name'), maxlength: 14,
        oninput: (ev) => { cfg.seats[i] = { ...seat, name: ev.target.value }; },
        onchange: () => update({ seats: [...cfg.seats] }),
      }),
      h('div', { class: 'seg small' },
        h('button', { class: seat.isAI ? '' : 'on', onclick: () => { cfg.seats[i] = { ...seat, isAI: false }; update({ seats: [...cfg.seats] }); } }, t('setup.human')),
        h('button', { class: seat.isAI ? 'on' : '', onclick: () => { cfg.seats[i] = { ...seat, isAI: true }; update({ seats: [...cfg.seats] }); } }, t('setup.ai')))))),
    h('h3', {}, t('setup.scenario')),
    h('div', { class: 'scenarios' }, SCENARIOS.map((sc) => h('button', {
      class: `scenario${cfg.scenarioId === sc.id ? ' on' : ''}`, onclick: () => update({ scenarioId: sc.id }),
    },
    h('b', {}, c('scenarios', sc.id, 'name')),
    h('small', { class: `diff ${sc.difficulty}` }, `${t(`difficulty.${sc.difficulty}`)} · ${t('setup.rounds', { n: sc.rounds })} · ${t('setup.morale', { n: sc.morale })}`),
    h('span', {}, c('scenarios', sc.id, 'goalText'))))),
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('setup.betrayer')),
      h('div', { class: 'seg small' }, ['maybe', 'always', 'never'].map((m) => h('button', { class: cfg.betrayer === m ? 'on' : '', onclick: () => update({ betrayer: m }) }, t(`setup.betrayer.${m}`))))),
    settingsRows(ctx),
    h('button', { class: 'btn primary wide big', onclick: ctx.startGame }, t('setup.start'))));
}

function settingsRows(ctx) {
  return [
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.language')),
      h('div', { class: 'seg small' }, LANGUAGES.map((l) => h('button', { class: getLang() === l.id ? 'on' : '', onclick: () => ctx.setLanguage(l.id) }, l.label)))),
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.sound')),
      h('div', { class: 'seg small' },
        h('button', { class: ctx.ui.sound ? 'on' : '', onclick: () => ctx.setSound(true) }, t('settings.on')),
        h('button', { class: ctx.ui.sound ? '' : 'on', onclick: () => ctx.setSound(false) }, t('settings.off')))),
  ];
}

export function settingsModal(ctx) {
  return dialog('settings',
    h('h2', {}, t('settings.title')),
    settingsRows(ctx),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: ctx.quitToSetup }, t('settings.newGame')),
      h('button', { class: 'btn primary', onclick: () => ctx.set({ modal: null }) }, t('settings.close'))));
}

// ---------------------------------------------------------------- hot-seat

export function passScreen(ctx, playerId) {
  const p = getPlayer(ctx.state, playerId);
  const idx = ctx.state.players.indexOf(p);
  return h('div', { class: 'backdrop pass', onclick: () => ctx.takeSeat(playerId), role: 'button', tabindex: '0' },
    h('div', { class: 'pass-card' },
      h('div', { class: 'big-dot', style: { background: hex(PLAYER_COLORS[idx]) } }),
      h('h1', {}, t('pass.title', { name: p.name })),
      h('p', { class: 'muted' }, t('pass.hint')),
      h('p', { class: 'tap' }, t('pass.tap'))));
}

export function draftModal(ctx) {
  const p = getPlayer(ctx.state, ctx.viewer);
  const picks = ctx.ui.draftPicks ?? [];
  const need = RULES.SURVIVORS_PER_PLAYER - picks.length;
  return dialog('draft',
    h('h2', {}, t('draft.title', { name: p.name })),
    h('div', { class: 'draft-grid' }, p.draftOptions.map((id) => {
      const d = survivorDef(id);
      const on = picks.includes(id);
      return h('button', {
        class: `draft-card${on ? ' on' : ''}`, style: { '--accent': d.accent },
        onclick: () => ctx.set({ draftPicks: on ? picks.filter((x) => x !== id) : [...picks, id].slice(-RULES.SURVIVORS_PER_PLAYER) }),
      },
      h('b', {}, d.name),
      h('small', {}, c('survivors', id, 'occupation')),
      h('div', { class: 'sv-stats' }, h('span', {}, `⚔ ${d.attack}+`), h('span', {}, `🔍 ${d.search}+`), h('span', {}, `★ ${d.influence}`)),
      h('p', {}, c('survivors', id, 'abilityText')));
    })),
    h('button', {
      class: 'btn primary wide', disabled: need > 0,
      onclick: () => { if (ctx.dispatch(act.draftPick(p.id, picks))) ctx.set({ draftPicks: [] }); },
    }, need > 0 ? t('draft.pick', { n: need }) : t('draft.confirm')));
}

export function crossroadsModal(ctx) {
  const pend = ctx.state.pendingCrossroads;
  const card = CROSSROADS_BY_ID[pend.cardId];
  const reader = getPlayer(ctx.state, pend.readerId);
  const active = getPlayer(ctx.state, pend.activePlayerId);
  const mine = ctx.viewer === pend.activePlayerId;
  return dialog('crossroads',
    h('small', { class: 'kicker' }, t('cross.title')),
    h('h2', {}, c('crossroads', card.id, 'title')),
    h('p', { class: 'muted small' }, t('cross.reads', { reader: reader.name, active: active.name })),
    h('p', { class: 'story' }, c('crossroads', card.id, 'text')),
    h('div', { class: 'choices' }, card.choices.map((ch, i) => h('button', {
      class: 'choice', disabled: !mine,
      onclick: () => ctx.dispatch(act.resolveCrossroads(pend.activePlayerId, i)),
    }, h('b', {}, ch.label), h('small', {}, describeEffects(ch.effects))))));
}

export function requestModal(ctx) {
  const s = ctx.state;
  const others = s.players.filter((p) => p.id !== ctx.viewer);
  const r = ctx.ui.req ?? { targetId: others[0].id, itemType: null };
  const set = (patch) => ctx.set({ req: { ...r, ...patch } });
  return dialog('request',
    h('h2', {}, t('request.title')),
    h('h4', {}, t('request.from')),
    h('div', { class: 'seg' }, others.map((p) => h('button', { class: r.targetId === p.id ? 'on' : '', onclick: () => set({ targetId: p.id }) }, p.name))),
    h('h4', {}, t('request.type')),
    h('div', { class: 'seg wrap' },
      h('button', { class: r.itemType == null ? 'on' : '', onclick: () => set({ itemType: null }) }, t('item.any')),
      ITEM_TYPES.map((ty) => h('button', { class: r.itemType === ty ? 'on' : '', onclick: () => set({ itemType: ty }) }, `${ITEM_ICON[ty]} ${t(`item.${ty}`)}`))),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: null }) }, t('act.cancel')),
      h('button', {
        class: 'btn primary',
        onclick: () => { if (ctx.dispatch(act.requestItem(ctx.viewer, r.targetId, r.itemType))) ctx.set({ modal: null, req: null }); },
      }, t('request.send'))));
}

export function incomingRequestModal(ctx, req) {
  const s = ctx.state;
  const me = getPlayer(s, ctx.viewer);
  const from = getPlayer(s, req.from);
  const eligible = me.hand.filter((u) => !req.itemType || itemOf(s, u).type === req.itemType);
  return dialog('incoming',
    h('h2', {}, t('request.incoming', { from: from.name, item: req.itemType ? t(`item.${req.itemType}`) : t('item.any') })),
    h('div', { class: 'hand-cards' }, eligible.map((uid) => {
      const it = itemOf(s, uid);
      return h('button', { class: `item-card t-${it.type}`, onclick: () => ctx.dispatch(act.respondRequest(me.id, req.id, uid)) },
        h('span', { class: 'ico' }, ITEM_ICON[it.type]), h('span', { class: 'iname' }, c('items', it.id, 'name')), h('span', { class: 'itype' }, t('act.give')));
    })),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => ctx.dispatch(act.respondRequest(me.id, req.id, null)) }, t('act.decline'))));
}

export function voteModal(ctx) {
  const v = ctx.state.vote;
  const target = getPlayer(ctx.state, v.targetId);
  return dialog('vote',
    h('h2', {}, `⚖ ${target.name}`),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => ctx.dispatch(act.castVote(ctx.viewer, false)) }, '✖'),
      h('button', { class: 'btn primary', onclick: () => ctx.dispatch(act.castVote(ctx.viewer, true)) }, '✔')));
}

export function gameOverModal(ctx) {
  const s = ctx.state;
  const r = s.result;
  return dialog('over',
    h('small', { class: 'kicker' }, t('over.title')),
    h('h2', {}, t(`over.reason.${r.reason}`)),
    h('h4', {}, t('over.winners')),
    r.winners.length ? h('p', { class: 'winners' }, r.winners.map((id) => getPlayer(s, id).name).join(' · ')) : h('p', { class: 'muted' }, t('over.noWinners')),
    h('ul', { class: 'outcomes' }, r.outcomes.map((o) => {
      const p = getPlayer(s, o.playerId);
      const obj = objectiveDef(o.objectiveId);
      return h('li', { class: o.won ? 'won' : '' },
        h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[s.players.indexOf(p)]) } }),
        h('b', {}, p.name),
        h('span', { class: `tag k-${obj.kind}` }, t(`kind.${obj.kind}`)),
        h('span', {}, c('objectives', obj.id, 'name')),
        h('small', { class: o.objectiveMet ? 'good' : 'bad' }, o.objectiveMet ? t('over.met') : t('over.notMet')));
    })),
    h('button', { class: 'btn primary wide', onclick: ctx.quitToSetup }, t('over.again')));
}

export function toastLayer(el, toasts) {
  mount(el, toasts.map((x) => h('div', { class: `toast ${x.kind ?? ''}` }, x.text)));
}
