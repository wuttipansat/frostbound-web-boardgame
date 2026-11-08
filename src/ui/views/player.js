// Bottom player panel: who's playing, their survivors (portraits), dice (drawn faces), hand (item art),
// the card-detail sheet with an explicit target picker, objective (press & hold), request, vote, end turn.
import { h, mount, hex } from '../dom.js';
import { icon, dieFace, heart } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { getPlayer, aliveSurvivorsOf, survivorDef, itemOf, woundLimit, objectiveDef } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import {
  cardOptions, endTurnOption, voteTargets, cardNeeds, cardTargets, cardDice, shouldConfirmEndTurn, cardLocations, junkAction, cardUsable, actingSurvivors, unusedDice,
} from '../options.js';
import * as act from '../../core/actions.js';
import { itemPlay, itemShort } from '../itemText.js';
import { isPermanent } from '../../content/items.js';

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

/** The big card sheet: art, full text, explicit target/die choice, and the card's actions. */
function cardDetail(ctx, shown, uid) {
  const { state: s, art } = ctx;
  const item = itemOf(s, uid);
  const need = cardNeeds(s, uid);
  const opts = cardOptions(s, shown.id, uid).filter((o) => o.id !== 'play' || !need);
  const close = () => ctx.set({ selCard: null });
  // Every use goes through the legal action; the card flies to where it went (board, crisis, goal).
  const go = (action, kind = 'play') => { flyCard(uid, kind); if (ctx.dispatch(action)) close(); };
  let picker = null;
  if (need === 'survivor') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickTarget')),
      h('div', { class: 'picker-row' }, cardTargets(s, shown.id, uid).map((tg) => h('button', {
        class: 'pick', disabled: !tg.ok,
        onclick: () => go(tg.action),
      }, art.portrait(tg.survivorId, 's', { alt: '' }), h('b', {}, survivorDef(tg.survivorId).name), h('small', { class: tg.ok ? 'good' : 'muted' }, tg.ok ? t(...itemShort(item)) : t(`err.${tg.error}`))))));
  } else if (need === 'location') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickPlace')),
      h('div', { class: 'picker-row' }, cardLocations(s, shown.id, uid).map((tg) => h('button', {
        class: 'pick', disabled: !tg.ok,
        onclick: () => go(tg.action),
      }, h('b', {}, c('locations', tg.to, 'name')), h('small', { class: tg.ok ? 'good' : 'muted' }, tg.ok ? t('itemShort.zombiesHere', { n: tg.zombies }) : t(`err.${tg.error}`))))));
  } else if (need === 'die' && item.value > 1) {
    // Stronger junk: tick up to two dice, then reroll.
    const picked = (ctx.ui.junkDice ?? []).filter((i) => shown.dice[i] && !shown.dice[i].used);
    const toggle = (i) => ctx.set({ junkDice: picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].slice(-item.value) });
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickDice', { n: item.value })),
      h('div', { class: 'picker-row' }, cardDice(s, shown.id, uid).map((d) => h('button', {
        class: `pick die-pick${picked.includes(d.dieIndex) ? ' on' : ''}`, disabled: !d.ok, 'aria-pressed': picked.includes(d.dieIndex) ? 'true' : 'false',
        'aria-label': t('tip.die', { v: d.value }), onclick: () => toggle(d.dieIndex),
      }, dieFace(d.value))),
      h('button', {
        class: 'btn primary', disabled: !picked.length,
        onclick: () => { flyCard(uid, 'play'); if (ctx.dispatch(junkAction(shown.id, uid, picked))) { ctx.set({ junkDice: [] }); close(); } },
      }, t('act.reroll'))));
  } else if (need === 'die') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickDie')),
      h('div', { class: 'picker-row' }, cardDice(s, shown.id, uid).map((d) => h('button', {
        class: 'pick die-pick', disabled: !d.ok, 'aria-label': t('tip.die', { v: d.value }),
        onclick: () => go(d.action),
      }, dieFace(d.value)))));
  }
  return h('div', { class: `card-detail panel t-${item.type} tier-${item.tier}`, role: 'dialog', 'aria-label': t('panel.cardDetail') },
    h('button', { class: 'close', 'aria-label': t('act.close'), onclick: close }, icon('close')),
    h('div', { class: 'cd-head' },
      art.item(item.id, 'l', { alt: '' }),
      h('div', {},
        h('span', { class: 'type-badge' }, t(`item.${item.type}`), ' · ', t(`tier.${item.tier}`)),
        h('h3', {}, c('items', item.id, 'name')),
        h('p', {}, t(...itemPlay(item))),
        isPermanent(item) ? h('p', { class: 'muted small' }, icon('lock'), ' ', t(`itemPlay.permanent.${item.type}`)) : null)),
    picker,
    h('div', { class: 'cd-actions' }, opts.map((o) => h('button', {
      class: `btn${o.id === 'play' ? ' primary' : ''}`, disabled: !o.ok,
      onclick: () => go(o.action, o.id),
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

  // ---- head: name, a small "your turn" light, collapse
  const status = isActor || (viewer && viewer === actor) ? t('panel.yourTurn')
    : !viewer ? t('panel.spectating', { name: shown.name })
      : actorP?.isAI ? t('waitingAi', { name: actorP.name })
        : t('panel.waiting', { name: actorP?.name ?? '' });
  mount(refs.head,
    h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[idx]) } }),
    h('b', { class: 'pname' }, shown.name),
    h('span', { class: `turn-light${isActor ? ' go' : ''}`, tip: status, 'aria-label': status, role: 'status' }),
    shown.isAI ? h('span', { class: 'tag' }, t('panel.aiTag')) : null,
    shown.exiled ? h('span', { class: 'tag bad' }, t('panel.exiled')) : null,
    h('button', {
      class: 'icon-btn collapse', 'aria-label': ui.ppCollapsed ? 'expand' : 'collapse', 'aria-expanded': ui.ppCollapsed ? 'false' : 'true',
      onclick: () => ctx.set({ ppCollapsed: !ui.ppCollapsed }),
    }, icon(ui.ppCollapsed ? 'up' : 'down')));

  // ---- survivors: round tokens floating above the panel
  const acting = new Set(isActor ? actingSurvivors(s, shown.id) : []);
  mount(refs.survivors, aliveSurvivorsOf(s, shown.id).map((sv) => survivorToken(ctx, sv, { canAct: acting.has(sv.id), color: hex(PLAYER_COLORS[idx]) })));

  // ---- dice: 2D chips only (the 3D tray shows the roll, then hides)
  const left = unusedDice(s, shown.id);
  mount(refs.chips,
    shown.dice.map((d, i) => h('button', {
      class: `die-chip${d.used ? ' used' : ''}${ui.selDie === i ? ' selected' : ''}`,
      dataset: { die: String(i) },
      disabled: d.used || !isActor,
      'aria-label': t('tip.die', { v: d.v }),
      tip: isActor ? t('tip.dieChip') : null,
      onclick: () => ctx.set({ selDie: ui.selDie === i ? null : i }),
    }, dieFace(d.v))),
    isActor ? h('span', { class: 'dice-badge', tip: t('tip.diceLeft'), 'aria-label': t('panel.diceLeft', { n: left }) }, String(left)) : null);

  // ---- hand (only ever the viewer's own): compact faces or full cards
  const hand = viewer ? shown.hand : [];
  const compact = ui.handCompact;
  const cards = hand.map((uid) => itemCard(ctx, shown, uid, { isActor, compact }));
  mount(refs.hand,
    hand.length ? h('button', {
      class: `icon-btn hand-toggle${compact ? '' : ' on'}`, tip: t(compact ? 'panel.handExpand' : 'panel.handCompact'),
      'aria-label': t(compact ? 'panel.handExpand' : 'panel.handCompact'), 'aria-pressed': compact ? 'false' : 'true',
      onclick: () => ctx.setHandCompact(!compact),
    }, icon('hand'), h('span', { class: 'count' }, String(hand.length))) : null,
    cards.length ? scrollRow(`hand-cards${compact ? ' compact' : ''}`, cards) : h('span', { class: 'muted small' }, viewer ? t('panel.handEmpty') : ''),
    isActor && ui.selCard && hand.includes(ui.selCard) ? cardDetail(ctx, shown, ui.selCard) : null);

  // ---- actions: End turn, everything else behind "more"
  const objective = viewer ? objectiveDef(getPlayer(s, viewer).objectiveId) : null;
  const end = isActor ? endTurnOption(s, shown.id) : null;
  const endTurn = () => {
    if (shouldConfirmEndTurn(s, shown.id, { skip: ui.skipEndConfirm })) ctx.set({ modal: 'confirmEnd' });
    else ctx.dispatch(act.endTurn(shown.id));
  };
  const canVote = isActor && voteTargets(s, shown.id).length > 0;
  const menu = [
    objective ? h('button', {
      class: 'menu-item hold', role: 'menuitem',
      onpointerdown: (ev) => { ev.preventDefault(); ctx.set({ peek: true }); },
      onpointerup: () => ctx.set({ peek: false }),
      onpointerleave: () => ui.peek && ctx.set({ peek: false }),
      onpointercancel: () => ctx.set({ peek: false }),
      onkeydown: (ev) => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); if (!ui.peek) ctx.set({ peek: true }); } },
      onkeyup: () => ctx.set({ peek: false }),
      oncontextmenu: (ev) => ev.preventDefault(),
    }, icon('lock'), h('span', {}, t('panel.objectiveShort')), h('small', {}, t('panel.hold'))) : null,
    isActor ? h('button', { class: 'menu-item', role: 'menuitem', onclick: () => ctx.set({ modal: 'request', moreOpen: false }) }, icon('request'), h('span', {}, t('panel.request'))) : null,
    canVote ? h('button', { class: 'menu-item', role: 'menuitem', onclick: () => ctx.set({ modal: 'callVote', voteTarget: null, moreOpen: false }) }, icon('vote'), h('span', {}, t('vote.call'))) : null,
  ].filter(Boolean);
  mount(refs.actions,
    menu.length ? h('button', {
      class: `icon-btn more${ui.moreOpen ? ' on' : ''}`, tip: t('panel.more'), 'aria-label': t('panel.more'),
      'aria-haspopup': 'menu', 'aria-expanded': ui.moreOpen ? 'true' : 'false',
      onclick: (ev) => { ev.stopPropagation(); ctx.set({ moreOpen: !ui.moreOpen }); },
    }, icon('more')) : null,
    isActor ? h('button', { class: 'btn primary', disabled: !end.ok, onclick: endTurn }, t('panel.endTurn')) : null,
    ui.moreOpen && menu.length ? h('div', { class: 'more-menu panel', role: 'menu', onclick: (ev) => ev.stopPropagation() }, menu) : null,
    ui.peek && objective ? h('div', { class: `objective-peek panel k-${objective.kind}` },
      h('small', {}, t(`kind.${objective.kind}`)),
      h('h3', {}, c('objectives', objective.id, 'name')),
      h('p', {}, c('objectives', objective.id, 'text'))) : null);
  // eslint-disable-next-line no-unused-expressions
  art;
}

// ---------------------------------------------------------------- step 11: vertical item cards

/** Footer note: how the card behaves after use. */
function cardFooter(item, used) {
  if (item.type === 'weapon') return used ? t('card.used') : t('card.permanent');
  if (item.type === 'book') return t('card.passive');
  if (item.wild) return t('card.wild');
  return t('card.consumable');
}

/** A vertical playing card: header (name, type, tier), sprite plate, effect line, flavour, footer. */
export function itemCard(ctx, shown, uid, { isActor = false, compact = false } = {}) {
  const { state: s, ui, art } = ctx;
  const item = itemOf(s, uid);
  const selected = ui.selCard === uid;
  const used = (shown.usedCards ?? []).includes(uid);
  const usable = isActor ? cardUsable(s, shown.id, uid) : { ok: true };
  return h('button', {
    class: `item-card t-${item.type} tier-${item.tier}${compact ? ' mini' : ''}${selected ? ' selected' : ''}${used ? ' spent' : ''}${usable.ok ? '' : ' unusable'}`,
    'aria-label': c('items', item.id, 'name'),
    dataset: { uid },
    'aria-pressed': selected ? 'true' : 'false',
    // The card face stays short; the full rule and the flavour text are in the tooltip.
    tip: `${compact ? `${c('items', item.id, 'name')} · ${t(`tier.${item.tier}`)} — ` : ''}${usable.ok ? `${t(...itemPlay(item))} — ${c('items', item.id, 'text')}` : t(`err.${usable.reason}`)}${compact ? ` · ${cardFooter(item, used)}` : ''}`,
    onclick: () => ctx.set({ selCard: selected ? null : uid, ppCollapsed: false }),
  },
  h('span', { class: 'ic-head' },
    h('span', { class: 'ic-type' }, t(`item.${item.type}`)),
    h('span', { class: 'ic-tier', 'aria-label': t(`tier.${item.tier}`) }, Array.from({ length: item.tier }, () => h('i')))),
  h('span', { class: 'iname' }, c('items', item.id, 'name')),
  h('span', { class: 'ic-art' }, art.item(item.id, 's', { alt: '' })),
  h('span', { class: 'ishort' }, t(...itemShort(item))),
  h('span', { class: 'ic-foot' }, isPermanent(item) ? icon('lock') : null, cardFooter(item, used)));
}

/** A ghost of the card flies to where it was used: the board, the crisis gauge, or the goal gauge. */
export function flyCard(uid, kind) {
  const card = document.querySelector(`.item-card[data-uid="${uid}"]`);
  if (!card || typeof card.animate !== 'function') return;
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const from = card.getBoundingClientRect();
  const target = kind === 'contribute' ? document.querySelector('.stat-block.crisis')
    : kind === 'deposit' ? document.querySelector('.stat-block.goal') : null;
  const to = target?.getBoundingClientRect() ?? { left: innerWidth / 2 - 20, top: innerHeight * 0.42, width: 40, height: 40 };
  const ghost = card.cloneNode(true);
  ghost.classList.add('card-ghost');
  Object.assign(ghost.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: 0, zIndex: 50, pointerEvents: 'none' });
  document.body.append(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 30}px) scale(0.8) rotate(-6deg)`, opacity: 0.95, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(-10deg)`, opacity: 0 },
  ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.then(() => ghost.remove(), () => ghost.remove());
}

// ---------------------------------------------------------------- step 13: survivor tokens

/** A round portrait token: ring in the owner's colour, health pips, frostbite, "can act" and moved marks.
 * No text on it; hovering or focusing shows a small card with the details. */
function survivorToken(ctx, sv, { canAct = false, color = '#888' } = {}) {
  const { ui, art } = ctx;
  const d = survivorDef(sv.id);
  const limit = woundLimit(sv.id);
  const left = limit - sv.wounds;
  const selected = ui.selSurvivor === sv.id;
  const where = c('locations', sv.location, 'name');
  return h('button', {
    class: `sv-token${selected ? ' selected' : ''}${sv.moved ? ' moved' : ''}${canAct ? ' can-act' : ''}${sv.frostbite ? ' frosty' : ''}`,
    dataset: { sv: sv.id },
    style: { '--ring': color },
    'aria-pressed': selected ? 'true' : 'false',
    'aria-label': t('panel.tokenLabel', { name: d.name, place: where, hp: left, max: limit }),
    onclick: () => ctx.selectSurvivor(selected ? null : sv.id),
  },
  art.portrait(sv.id, 's', { alt: '', cls: 'tok-face' }),
  h('span', { class: 'tok-hp', 'aria-hidden': 'true' }, Array.from({ length: limit }, (_, i) => h('i', { class: i < left ? 'on' : '' }))),
  sv.frostbite ? h('span', { class: 'tok-frost', 'aria-hidden': 'true' }, icon('snowflake')) : null,
  canAct ? h('span', { class: 'tok-ready', 'aria-hidden': 'true' }) : null,
  h('span', { class: 'tok-card', 'aria-hidden': 'true' },
    h('b', {}, d.name),
    h('small', {}, `${c('survivors', sv.id, 'occupation')} · ${where}`),
    h('span', { class: 'sv-stats' },
      h('span', { class: 'need' }, icon('attack'), dieFace(d.attack, 'mini'), '+'),
      h('span', { class: 'need' }, icon('search'), dieFace(d.search, 'mini'), '+'),
      h('span', { class: 'need' }, icon('star'), d.influence)),
    h('span', { class: 'sv-health' }, Array.from({ length: limit }, (_, i) => heart(i < left)), sv.moved ? h('small', {}, ` · ${t('panel.moved')}`) : null),
    h('span', { class: 'tok-ability' }, icon('ability'), c('survivors', sv.id, 'abilityText'))));
}
