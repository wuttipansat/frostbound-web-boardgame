// Bottom player panel: who's playing, their survivors (portraits), dice (drawn faces), hand (item art),
// the card-detail sheet with an explicit target picker, objective (press & hold), request, vote, end turn.
import { h, mount, hex } from '../dom.js';
import { icon, dieFace, heart } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { getPlayer, aliveSurvivorsOf, survivorDef, itemOf, woundLimit, objectiveDef } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import {
  cardOptions, endTurnOption, voteTargets, cardNeeds, cardTargets, cardDice, shouldConfirmEndTurn,
} from '../options.js';
import * as act from '../../core/actions.js';

/** A horizontally scrolling row with edge fades and arrow buttons when it overflows. */
export function scrollRow(cls, children) {
  const inner = h('div', { class: `scroll-inner ${cls}` }, children);
  const left = h('button', { class: 'scroll-arrow left', 'aria-label': t('act.scrollLeft'), onclick: () => inner.scrollBy({ left: -inner.clientWidth * 0.8, behavior: 'smooth' }) }, icon('left'));
  const right = h('button', { class: 'scroll-arrow right', 'aria-label': t('act.scrollRight'), onclick: () => inner.scrollBy({ left: inner.clientWidth * 0.8, behavior: 'smooth' }) }, icon('right'));
  const wrap = h('div', { class: 'scroll-row' }, left, inner, right);
  const update = () => {
    const more = inner.scrollWidth > inner.clientWidth + 2;
    wrap.classList.toggle('more-left', more && inner.scrollLeft > 2);
    wrap.classList.toggle('more-right', more && inner.scrollLeft + inner.clientWidth < inner.scrollWidth - 2);
  };
  inner.addEventListener('scroll', update, { passive: true });
  // Mouse wheels scroll the row sideways.
  inner.addEventListener('wheel', (ev) => {
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && inner.scrollWidth > inner.clientWidth) { inner.scrollLeft += ev.deltaY; ev.preventDefault(); }
  }, { passive: false });
  requestAnimationFrame(update);
  return wrap;
}

function survivorCard(ctx, sv, { selectable = true } = {}) {
  const { ui, art } = ctx;
  const d = survivorDef(sv.id);
  const limit = woundLimit(sv.id);
  const selected = ui.selSurvivor === sv.id;
  const left = limit - sv.wounds;
  return h('button', {
    class: `sv-card${selected ? ' selected' : ''}${sv.moved ? ' moved' : ''}`,
    style: { '--accent': d.accent },
    'aria-pressed': selected ? 'true' : 'false',
    onclick: selectable ? () => ctx.selectSurvivor(selected ? null : sv.id) : null,
  },
  h('div', { class: 'sv-face' },
    art.portrait(sv.id, 's', { alt: d.name, cls: `${sv.wounds ? 'wounded' : ''}${sv.frostbite ? ' frosty' : ''}` }),
    sv.moved ? h('span', { class: 'moved-ribbon' }, t('panel.moved')) : null,
    ctx.state.players.find((p) => p.id === sv.owner)?.exiled ? h('span', { class: 'exile-badge', tip: t('panel.exiled') }, icon('door')) : null),
  h('div', { class: 'sv-info' },
    h('div', { class: 'sv-top' }, h('b', {}, d.name), h('span', { class: 'loc-chip' }, c('locations', sv.location, 'name'))),
    h('div', { class: 'sv-occ' }, c('survivors', sv.id, 'occupation')),
    h('div', { class: 'sv-stats' },
      h('span', { class: 'need', tip: t('tip.attack', { n: d.attack }) }, icon('attack'), dieFace(d.attack, 'mini'), '+'),
      h('span', { class: 'need', tip: t('tip.search', { n: d.search }) }, icon('search'), dieFace(d.search, 'mini'), '+'),
      h('span', { class: 'need', tip: t('tip.influence') }, icon('star'), d.influence)),
    h('div', { class: 'sv-health', tip: t('tip.health', { n: left }) },
      Array.from({ length: limit }, (_, i) => heart(i < left)),
      sv.frostbite ? h('span', { class: 'frost', tip: t('tip.frostbite') }, icon('snowflake')) : null),
    h('div', { class: 'sv-ability', tip: c('survivors', sv.id, 'abilityText') }, icon('ability'), h('span', {}, c('survivors', sv.id, 'abilityText')))));
}

/** The big card sheet: art, full text, explicit target/die choice, and the card's actions. */
function cardDetail(ctx, shown, uid) {
  const { state: s, art } = ctx;
  const item = itemOf(s, uid);
  const need = cardNeeds(s, uid);
  const opts = cardOptions(s, shown.id, uid).filter((o) => o.id !== 'play' || !need);
  const close = () => ctx.set({ selCard: null });
  let picker = null;
  if (need === 'survivor') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickTarget')),
      h('div', { class: 'picker-row' }, cardTargets(s, shown.id, uid).map((tg) => h('button', {
        class: 'pick', disabled: !tg.ok,
        onclick: () => { if (ctx.dispatch(tg.action)) close(); },
      }, art.portrait(tg.survivorId, 's', { alt: '' }), h('b', {}, survivorDef(tg.survivorId).name), h('small', { class: tg.ok ? 'good' : 'muted' }, tg.ok ? t(`itemShort.${item.type}`) : t(`err.${tg.error}`))))));
  } else if (need === 'die') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickDie')),
      h('div', { class: 'picker-row' }, cardDice(s, shown.id, uid).map((d) => h('button', {
        class: 'pick die-pick', disabled: !d.ok, 'aria-label': t('tip.die', { v: d.value }),
        onclick: () => { if (ctx.dispatch(d.action)) close(); },
      }, dieFace(d.value)))));
  }
  return h('div', { class: `card-detail panel t-${item.type}`, role: 'dialog', 'aria-label': t('panel.cardDetail') },
    h('button', { class: 'close', 'aria-label': t('act.close'), onclick: close }, icon('close')),
    h('div', { class: 'cd-head' },
      art.item(item.id, 'l', { alt: '' }),
      h('div', {},
        h('span', { class: 'type-badge' }, art.item(item.id, 's', { cls: 'badge-art', alt: '' }), t(`item.${item.type}`)),
        h('h3', {}, c('items', item.id, 'name')),
        h('p', {}, t(`itemPlay.${item.type}`, { n: item.value })))),
    picker,
    h('div', { class: 'cd-actions' }, opts.map((o) => h('button', {
      class: `btn${o.id === 'play' ? ' primary' : ''}`, disabled: !o.ok,
      onclick: () => { if (ctx.dispatch(o.action)) close(); },
    }, t(`act.${o.id}`), !o.ok ? h('small', { class: 'why' }, t(`err.${o.error}`)) : null))));
}

/** refs: { head, survivors, chips, hand, actions } containers inside the panel. */
export function renderPlayerPanel(refs, ctx) {
  const { state: s, ui, viewer, actor, art } = ctx;
  const shown = viewer ? getPlayer(s, viewer) : (s.activePlayerId ? getPlayer(s, s.activePlayerId) : null);
  if (!shown) { for (const el of Object.values(refs)) mount(el); return; }
  const idx = s.players.indexOf(shown);
  const isActor = ctx.canAct;
  const actorP = actor ? getPlayer(s, actor) : null;

  // ---- head
  const status = isActor || (viewer && viewer === actor) ? t('panel.yourTurn')
    : !viewer ? t('panel.spectating', { name: shown.name })
      : actorP?.isAI ? t('waitingAi', { name: actorP.name })
        : t('panel.waiting', { name: actorP?.name ?? '' });
  mount(refs.head,
    h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[idx]) } }),
    h('b', { class: 'pname' }, shown.name),
    shown.isAI ? h('span', { class: 'tag' }, t('panel.aiTag')) : null,
    shown.exiled ? h('span', { class: 'tag bad' }, t('panel.exiled')) : null,
    h('span', { class: `status${isActor ? ' go' : ''}` }, status),
    h('button', {
      class: 'icon-btn collapse', 'aria-label': ui.ppCollapsed ? 'expand' : 'collapse', 'aria-expanded': ui.ppCollapsed ? 'false' : 'true',
      onclick: () => ctx.set({ ppCollapsed: !ui.ppCollapsed }),
    }, icon(ui.ppCollapsed ? 'up' : 'down')));

  // ---- survivors
  mount(refs.survivors, scrollRow('sv-row', aliveSurvivorsOf(s, shown.id).map((sv) => survivorCard(ctx, sv))));

  // ---- dice (drawn faces; the tray above shows them in 3D)
  mount(refs.chips, shown.dice.map((d, i) => h('button', {
    class: `die-chip${d.used ? ' used' : ''}${ui.selDie === i ? ' selected' : ''}`,
    dataset: { die: String(i) },
    disabled: d.used || !isActor,
    'aria-label': t('tip.die', { v: d.v }),
    onclick: () => ctx.set({ selDie: ui.selDie === i ? null : i }),
  }, dieFace(d.v))),
  isActor ? h('span', { class: 'muted small' }, ui.selDie == null ? t('panel.dieAuto') : '') : null);

  // ---- hand (only ever the viewer's own)
  const hand = viewer ? shown.hand : [];
  const cards = hand.map((uid) => {
    const item = itemOf(s, uid);
    const selected = ui.selCard === uid;
    return h('button', {
      class: `item-card t-${item.type}${selected ? ' selected' : ''}`,
      dataset: { uid },
      'aria-pressed': selected ? 'true' : 'false',
      onclick: () => ctx.set({ selCard: selected ? null : uid, ppCollapsed: false }),
    },
    art.item(item.id, 's', { alt: '' }),
    h('span', { class: 'iname' }, c('items', item.id, 'name')),
    h('span', { class: 'ishort' }, t(`itemShort.${item.type}`, { n: item.value })));
  });
  mount(refs.hand,
    cards.length ? scrollRow('hand-cards', cards) : h('span', { class: 'muted small' }, viewer ? t('panel.handEmpty') : ''),
    isActor && ui.selCard && hand.includes(ui.selCard) ? cardDetail(ctx, shown, ui.selCard) : null);

  // ---- actions
  const objective = viewer ? objectiveDef(getPlayer(s, viewer).objectiveId) : null;
  const end = isActor ? endTurnOption(s, shown.id) : null;
  const endTurn = () => {
    if (shouldConfirmEndTurn(s, shown.id, { skip: ui.skipEndConfirm })) ctx.set({ modal: 'confirmEnd' });
    else ctx.dispatch(act.endTurn(shown.id));
  };
  mount(refs.actions,
    objective ? h('button', {
      class: 'btn ghost hold', tip: t('panel.objective'),
      onpointerdown: (ev) => { ev.preventDefault(); ctx.set({ peek: true }); },
      onpointerup: () => ctx.set({ peek: false }),
      onpointerleave: () => ui.peek && ctx.set({ peek: false }),
      onpointercancel: () => ctx.set({ peek: false }),
      onkeydown: (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); if (!ui.peek) ctx.set({ peek: true }); } },
      onkeyup: () => ctx.set({ peek: false }),
      oncontextmenu: (ev) => ev.preventDefault(),
    }, icon('lock'), ` ${t('panel.objectiveShort')}`) : null,
    isActor ? h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: 'request' }) }, icon('request'), ` ${t('panel.request')}`) : null,
    isActor && voteTargets(s, shown.id).length ? h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: 'callVote', voteTarget: null }) }, icon('vote'), ` ${t('vote.call')}`) : null,
    isActor ? h('button', { class: 'btn primary', disabled: !end.ok, onclick: endTurn }, t('panel.endTurn')) : null,
    ui.peek && objective ? h('div', { class: `objective-peek panel k-${objective.kind}` },
      h('small', {}, t(`kind.${objective.kind}`)),
      h('h3', {}, c('objectives', objective.id, 'name')),
      h('p', {}, c('objectives', objective.id, 'text'))) : null);
  // eslint-disable-next-line no-unused-expressions
  art;
}
