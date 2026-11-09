// Floating player HUD (step 14): name tag, survivor tokens, dice chips, a floating hand (pile ↔ fan),
// the card sheet with round targets, and the round "more" button next to End turn.
import { h, mount, hex } from '../dom.js';
import { icon, dieFace, heart } from '../icons.js';
import { t, c, getLang } from '../../i18n/index.js';
import { flashTip } from '../tooltip.js';
import { getPlayer, aliveSurvivorsOf, survivorDef, itemOf, woundLimit, objectiveDef, isFrostbound, energyMax, energyRegen } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import {
  cardOptions, endTurnOption, voteTargets, cardNeeds, cardTargets, cardDice, shouldConfirmEndTurn, cardLocations, junkAction, cardUsable, actingSurvivors, unusedDice,
} from '../options.js';
import * as act from '../../core/actions.js';
import { itemPlay, itemShort } from '../itemText.js';
import { isPermanent } from '../../content/items.js';

/** A small round target: a portrait without a name (the name and the reason are in the tooltip).
 * Targets that can't be chosen stay visible, greyed, with a small mark; clicking one shows why. */
function roundTarget(art, survivorId, ok, tipText, onPick) {
  return h('button', {
    class: `pick round${ok ? '' : ' off'}`, 'aria-disabled': ok ? null : 'true', tip: tipText,
    'aria-label': tipText,
    onclick: (ev) => (ok ? onPick() : flashTip(ev.currentTarget)),
  }, art.portrait(survivorId, 's', { alt: '' }), ok ? null : h('span', { class: 'off-mark', 'aria-hidden': 'true' }, icon('close')));
}

const CARD_ACTION_ICON = { play: 'check', contribute: 'crisis', deposit: 'goal' };

/** The card sheet: small art, name, tier, one rule line; explicit target / die choice; the card's actions. */
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
      h('div', { class: 'picker-row round-row' }, cardTargets(s, shown.id, uid).map((tg) => roundTarget(art, tg.survivorId, tg.ok,
        `${survivorDef(tg.survivorId).name} — ${tg.ok ? t(...itemShort(item)) : t(`err.${tg.error}`)}`, () => go(tg.action)))));
  } else if (need === 'location') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickPlace')),
      h('div', { class: 'picker-row' }, cardLocations(s, shown.id, uid).map((tg) => h('button', {
        class: `pick place${tg.ok ? '' : ' off'}`, 'aria-disabled': tg.ok ? null : 'true',
        tip: tg.ok ? t('itemShort.zombiesHere', { n: tg.zombies }) : t(`err.${tg.error}`),
        onclick: (ev) => (tg.ok ? go(tg.action) : flashTip(ev.currentTarget)),
      }, c('locations', tg.to, 'name')))));
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
  const flavour = [c('items', item.id, 'text'), isPermanent(item) ? t(`itemPlay.permanent.${item.type}`) : null].filter(Boolean).join(' — ');
  return h('div', { class: `card-detail panel t-${item.type} tier-${item.tier}`, role: 'dialog', 'aria-label': t('panel.cardDetail') },
    h('button', { class: 'close', 'aria-label': t('act.close'), onclick: close }, icon('close')),
    h('div', { class: 'cd-head', tip: flavour },
      art.item(item.id, 'l', { alt: '' }),
      h('div', { class: 'cd-title' },
        h('h3', {}, c('items', item.id, 'name')),
        h('span', { class: 'type-badge' }, t(`item.${item.type}`),
          h('span', { class: 'ic-tier', 'aria-label': t(`tier.${item.tier}`) }, Array.from({ length: item.tier }, () => h('i'))),
          isPermanent(item) ? icon('lock') : null))),
    h('p', { class: 'cd-rule' }, t(...itemPlay(item))),
    picker,
    h('div', { class: 'cd-actions' }, opts.map((o) => h('button', {
      class: `btn small-act${o.id === 'play' ? ' primary' : ''}${o.ok ? '' : ' off'}`, 'aria-disabled': o.ok ? null : 'true',
      tip: o.ok ? t(`act.${o.id}`) : `${t(`act.${o.id}`)} — ${t(`err.${o.error}`)}`,
      onclick: (ev) => (o.ok ? go(o.action, o.id) : flashTip(ev.currentTarget)),
    }, icon(CARD_ACTION_ICON[o.id] ?? 'check'), h('span', {}, t(`act.${o.id}Short`))))));
}

/** Put the sheet next to the card it belongs to (phones use a low bottom sheet instead). */
function placeSheet(container, uid) {
  const sheet = container.querySelector('.card-detail');
  if (!sheet) return;
  if (window.innerWidth <= 760) { sheet.style.left = ''; sheet.style.bottom = ''; return; }
  const card = container.querySelector(`.item-card[data-uid="${uid}"]`);
  if (!card) return;
  const r = card.getBoundingClientRect();
  const w = sheet.offsetWidth || 300;
  sheet.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`;
  sheet.style.bottom = `${Math.max(12, window.innerHeight - r.top + 14)}px`;
}

/** refs: { head, survivors, chips, hand, actions } floating HUD pieces. */
export function renderPlayerPanel(refs, ctx) {
  const { state: s, ui, viewer, actor } = ctx;
  const shown = viewer ? getPlayer(s, viewer) : (s.activePlayerId ? getPlayer(s, s.activePlayerId) : null);
  if (!shown) {
    for (const el of Object.values(refs)) mount(el);
    document.body.classList.remove('hand-full');
    return;
  }
  const idx = s.players.indexOf(shown);
  const isActor = ctx.canAct;
  const actorP = actor ? getPlayer(s, actor) : null;

  // ---- name tag: colour dot, name, a small "your turn" light
  const status = isActor || (viewer && viewer === actor) ? t('panel.yourTurn')
    : !viewer ? t('panel.spectating', { name: shown.name })
      : actorP?.isAI ? t('waitingAi', { name: actorP.name })
        : t('panel.waiting', { name: actorP?.name ?? '' });
  mount(refs.head,
    h('span', { class: 'dot', style: { background: hex(PLAYER_COLORS[idx]) } }),
    h('b', { class: 'pname', tip: shown.name }, shown.name),
    h('span', { class: `turn-light${isActor ? ' go' : ''}`, tip: status, 'aria-label': status, role: 'status' }),
    shown.isAI ? h('span', { class: 'tag' }, t('panel.aiTag')) : null,
    shown.exiled ? h('span', { class: 'tag bad' }, t('panel.exiled')) : null);

  // ---- survivors: round tokens
  const acting = new Set(isActor ? actingSurvivors(s, shown.id) : []);
  mount(refs.survivors, aliveSurvivorsOf(s, shown.id).map((sv) => survivorToken(ctx, sv, { canAct: acting.has(sv.id), color: hex(PLAYER_COLORS[idx]) })));

  // ---- Frostbound: an energy meter instead of dice
  if (isFrostbound(s)) {
    const max = energyMax(s, shown.id);
    const e = shown.energy ?? 0;
    const tip = t('panel.energyTip', { n: e, max, regen: energyRegen(s, shown.id) });
    mount(refs.chips, h('div', { class: 'energy', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(e), 'aria-label': tip, tip },
      icon('exposure', 'en-ico'),
      h('span', { class: 'en-bar' }, h('i', { style: { width: `${Math.round((Math.min(e, max) / max) * 100)}%` } })),
      h('b', { class: 'en-num' }, `${e}`), h('small', {}, `/${max}`)));
  } else {
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
    isActor && shown.dice.length ? h('span', { class: 'dice-badge', tip: t('tip.diceLeft'), 'aria-label': t('panel.diceLeft', { n: left }) }, String(left)) : null);
  }

  // ---- hand (only ever the viewer's own): a floating pile or a fan
  const hand = viewer ? shown.hand : [];
  // Phones: an open location sheet takes the room, so the hand folds into its pile.
  const phoneLoc = window.innerWidth <= 760 && !!ui.selLoc;
  // A card picked by other means (keyboard, tutorial, a test) opens the fan while its sheet is up.
  const picked = !!(ui.selCard && hand.includes(ui.selCard));
  const compact = (ui.handCompact || phoneLoc) && !picked;
  document.body.classList.toggle('hand-full', !compact && hand.length > 0);
  renderHand(refs.hand, ctx, shown, hand, { isActor, compact, phoneLoc });

  // ---- actions: End turn, everything else behind the round "more" button
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
    // Quick rules are also here (on phones the top bar has no room for the ? button).
    // Step 21: mute right where you are (also in settings; the choice is saved).
    h('button', { class: `menu-item sound-item${ctx.ui.sound ? ' on' : ''}`, role: 'menuitemcheckbox', 'aria-checked': ctx.ui.sound ? 'true' : 'false', onclick: () => ctx.setSound(!ctx.ui.sound) }, icon(ctx.ui.sound ? 'sound' : 'mute'), h('span', {}, `${t('settings.sound')}: ${t(ctx.ui.sound ? 'settings.on' : 'settings.off')}`)),
    h('button', { class: 'menu-item rules-item', role: 'menuitem', onclick: () => ctx.set({ modal: 'rules', moreOpen: false }) }, icon('log'), h('span', {}, t('hud.rules'))),
  ].filter(Boolean);
  mount(refs.actions,
    menu.length ? h('button', {
      class: `icon-btn round more${ui.moreOpen ? ' on' : ''}`, tip: t('panel.more'), 'aria-label': t('panel.more'),
      'aria-haspopup': 'menu', 'aria-expanded': ui.moreOpen ? 'true' : 'false',
      onclick: (ev) => { ev.stopPropagation(); ctx.set({ moreOpen: !ui.moreOpen }); },
    }, icon('more')) : null,
    isActor ? h('button', {
      class: `btn primary end-turn${end.ok ? '' : ' off'}`, 'aria-disabled': end.ok ? null : 'true',
      tip: end.ok ? null : t(`err.${end.error}`),
      onclick: (ev) => (end.ok ? endTurn() : flashTip(ev.currentTarget)),
    }, t('panel.endTurn')) : null,
    ui.moreOpen && menu.length ? h('div', { class: 'more-menu panel', role: 'menu', onclick: (ev) => ev.stopPropagation() }, menu) : null,
    ui.peek && objective ? h('div', { class: `objective-peek panel k-${objective.kind}` },
      h('small', {}, t(`kind.${objective.kind}`)),
      h('h3', {}, c('objectives', objective.id, 'name')),
      h('p', {}, c('objectives', objective.id, 'text'))) : null);
}

// ---------------------------------------------------------------- step 14: floating hand

// Cards are kept by uid between renders, so switching pile ↔ fan (and drawing or playing) animates
// the same elements instead of rebuilding the row.
let handCtx = null;
let lastMode = null;
let settleTimer = 0;

function slots(container) {
  let fan = container.querySelector(':scope > .hand-fan');
  if (!fan) {
    mount(container,
      fan = h('div', { class: 'hand-fan' }),
      h('div', { class: 'hand-ctl' }),
      h('div', { class: 'hand-sheet' }));
  }
  return { fan, ctl: container.querySelector(':scope > .hand-ctl'), sheet: container.querySelector(':scope > .hand-sheet') };
}

function renderHand(container, ctx, shown, hand, { isActor, compact, phoneLoc }) {
  handCtx = ctx;
  const { ui } = ctx;
  const { fan, ctl, sheet } = slots(container);
  const n = hand.length;
  const mode = compact ? 'pile' : 'fan';
  container.classList.toggle('empty', !n);
  fan.classList.toggle('pile', compact);
  fan.classList.toggle('fanned', !compact);
  fan.style.setProperty('--n', String(Math.max(1, n)));
  if (mode !== lastMode) {
    // Stagger only while the layout changes; afterwards hover reacts at once.
    fan.classList.remove('settled');
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => fan.classList.add('settled'), 380 + n * 30);
    lastMode = mode;
  }

  const keep = new Map();
  for (const el of [...fan.children]) {
    if (hand.includes(el.dataset.uid)) keep.set(el.dataset.uid, el); else el.remove();
  }
  hand.forEach((uid, i) => {
    let el = keep.get(uid);
    const fresh = !el;
    el = updateCard(el, ctx, shown, uid, { isActor, compact });
    const off = i - (n - 1) / 2;
    const depth = Math.min(n - 1 - i, 4);
    el.style.setProperty('--i', String(i));
    el.style.setProperty('--off', String(off));
    // The middle of the fan rises; the outer cards stay on the baseline.
    const edge = (n - 1) / 2;
    const k = edge ? Math.min(2.4, 16 / (edge * edge)) : 0; // the rise is capped for big hands
    el.style.setProperty('--arc', `${((off * off - edge * edge) * k).toFixed(1)}px`);
    el.style.setProperty('--depth', String(depth));
    el.style.setProperty('--pr', `${depth === 0 ? 0 : (depth % 2 ? -1 : 1) * (3 + depth * 2.2)}deg`);
    if (fan.children[i] !== el) fan.insertBefore(el, fan.children[i] ?? null);
    if (fresh) {
      el.classList.add('dealt');
      el.addEventListener('animationend', () => el.classList.remove('dealt'), { once: true });
    }
  });

  const count = h('span', { class: 'count' }, String(n));
  mount(ctl,
    !n ? null : compact
      ? h('button', {
        class: 'pile-btn', 'aria-label': `${t('panel.handExpand')} (${n})`, tip: t('panel.handExpand'), 'aria-expanded': 'false',
        onclick: () => { if (phoneLoc) ctx.selectLocation(null); ctx.setHandCompact(false); },
      }, count)
      : h('button', {
        class: 'icon-btn round hand-toggle', 'aria-label': t('panel.handCompact'), tip: t('panel.handCompact'), 'aria-expanded': 'true',
        onclick: () => { ctx.set({ selCard: null }); ctx.setHandCompact(true); },
      }, icon('hand'), count));

  const sel = isActor && !compact && hand.includes(ui.selCard) ? ui.selCard : null;
  mount(sheet, sel ? cardDetail(ctx, shown, sel) : null);
  if (sel) requestAnimationFrame(() => placeSheet(container, sel));
}

/** Footer note: how the card behaves after use. */
function cardFooter(item, used) {
  if (item.type === 'weapon') return used ? t('card.used') : t('card.permanent');
  if (item.type === 'book') return t('card.passive');
  if (item.wild) return t('card.wild');
  return t('card.consumable');
}

/** Create or refresh one card of the hand (the element is kept; its face is rebuilt only when it changes). */
function updateCard(el, ctx, shown, uid, { isActor, compact }) {
  const { state: s, ui, art } = ctx;
  const item = itemOf(s, uid);
  const selected = ui.selCard === uid && !compact;
  const used = (shown.usedCards ?? []).includes(uid);
  const usable = isActor ? cardUsable(s, shown.id, uid) : { ok: true };
  if (!el) {
    el = h('button', {
      dataset: { uid },
      onclick: () => {
        const cx = handCtx;
        if (!cx || el.parentElement?.classList.contains('pile')) return;
        cx.set({ selCard: cx.ui.selCard === uid ? null : uid });
      },
    });
  }
  el.className = `item-card t-${item.type} tier-${item.tier}${selected ? ' selected' : ''}${used ? ' spent' : ''}${usable.ok ? '' : ' unusable'}`;
  el.setAttribute('aria-label', c('items', item.id, 'name'));
  el.setAttribute('aria-pressed', selected ? 'true' : 'false');
  el.tabIndex = compact ? -1 : 0;
  if (compact) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  // The face stays short; the full rule, flavour and why it can't be used now are in the tooltip.
  const tip = compact ? '' : usable.ok ? `${t(...itemPlay(item))} — ${c('items', item.id, 'text')}` : t(`err.${usable.reason}`);
  if (tip) el.dataset.tip = tip; else delete el.dataset.tip;
  const sig = `${item.id}|${used}|${getLang()}`;
  if (el.dataset.sig !== sig) {
    el.dataset.sig = sig;
    el.replaceChildren(...[
      h('span', { class: 'ic-head' },
        h('span', { class: 'ic-type' }, t(`item.${item.type}`)),
        h('span', { class: 'ic-tier', 'aria-label': t(`tier.${item.tier}`) }, Array.from({ length: item.tier }, () => h('i')))),
      h('span', { class: 'iname' }, c('items', item.id, 'name')),
      h('span', { class: 'ic-art' }, art.item(item.id, 's', { alt: '' })),
      h('span', { class: 'ishort' }, t(...itemShort(item))),
      h('span', { class: 'ic-foot' }, isPermanent(item) ? icon('lock') : null, cardFooter(item, used)),
      used ? h('span', { class: 'spent-mark', 'aria-hidden': 'true' }, icon('check')) : null].filter(Boolean));
  }
  return el;
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
