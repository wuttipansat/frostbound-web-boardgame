// Floating team HUD (step 14): status tag, survivor tokens, energy meter, a floating hand (pile ↔ fan),
// the card sheet with round targets, and the round "more" button next to End turn.
import { h, mount } from '../dom.js';
import { icon, heart } from '../icons.js';
import { t, c, getLang } from '../../i18n/index.js';
import { flashTip } from '../tooltip.js';
import { aliveSurvivors, survivorDef, itemOf, woundLimit, holderOf, apMax, sleepPlan, atkOf, xpLevel, gearOf, actionCost, killsPerAttack, heroOf } from '../../core/selectors.js';
import {
  cardOptions, endTurnOption, cardNeeds, cardTargets, giveTargets, allItems, shouldConfirmEndTurn, cardUsable, actingSurvivors,
} from '../options.js';
import * as act from '../../core/actions.js';
import { RULES } from '../../core/constants.js';
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

const CARD_ACTION_ICON = { play: 'check', equip: 'hand', contribute: 'crisis', deposit: 'goal' };

/** The card sheet: small art, name, tier, one rule line; explicit target / die choice; the card's actions. */
function cardDetail(ctx, shown, uid) {
  const { state: s, art } = ctx;
  const item = itemOf(s, uid);
  const need = cardNeeds(s, uid);
  const opts = cardOptions(s, uid).filter((o) => o.id !== 'play' || !need);
  const close = () => ctx.set({ selCard: null });
  // Every use goes through the legal action; the card flies to where it went (board, crisis, goal).
  // UI-5: using a card closes the list again.
  const go = (action, kind = 'play') => { flyCard(uid, kind); if (ctx.dispatch(action)) { close(); ctx.setHandCompact(true); } };
  let picker = null;
  if (need === 'survivor') {
    picker = h('div', { class: 'picker', 'data-target-picker': '' },
      h('h4', {}, t('act.pickTarget')),
      h('div', { class: 'picker-row round-row' }, cardTargets(s, uid).map((tg) => roundTarget(art, tg.survivorId, tg.ok,
        `${survivorDef(tg.survivorId).name} — ${tg.ok ? t(...itemShort(item)) : t(`err.${tg.error}`)}`, () => go(tg.action)))),
      cardTargets(s, uid).filter((tg) => !tg.ok).map((tg) => h('small', { class: 'cd-why' }, `${survivorDef(tg.survivorId).name.split(' ')[0]}: ${t(`err.${tg.error}`)}`)));
  }
  const gives = giveTargets(s, uid);
  const holder = holderOf(s, uid);
  // UI-7: say where the card is, and when the selected survivor cannot reach it from where they stand.
  const actor = ctx.ui.selSurvivor && s.survivors[ctx.ui.selSurvivor]?.alive ? s.survivors[ctx.ui.selSurvivor] : null;
  const far = actor && ((holder === 'stockpile' && actor.location !== 'colony') || (holder && holder !== 'stockpile' && s.survivors[holder].location !== actor.location));
  const where = h('p', { class: 'cd-where' }, holder === 'stockpile' ? t('pack.stockpile') : holder ? t('pack.carried', { name: survivorDef(holder).name, place: c('locations', s.survivors[holder].location, 'name') }) : '',
    far ? h('small', { class: 'away' }, ` — ${t('pack.far', { name: survivorDef(actor.id).name.split(' ')[0], place: c('locations', actor.location, 'name') })}`) : null);

  const giveRow = gives.length ? h('div', { class: 'picker' }, h('h4', {}, t('act.give')),
    // Hand-overs are a tap on a face (or on the stockpile's round button).
    h('div', { class: 'picker-row round-row' }, gives.map((g) => (g.survivorId
      ? roundTarget(art, g.survivorId, true, `${t('act.give')}: ${survivorDef(g.survivorId).name}`, () => go(g.action, 'play'))
      : h('button', { class: 'pick round stock', tip: t('pack.toStockpile'), 'aria-label': t('pack.toStockpile'), onclick: () => go(g.action, 'play') }, icon('goal')))))) : null;
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
    where,
    picker,
    giveRow,
    h('div', { class: 'cd-actions' }, opts.map((o) => h('button', {
      class: `btn small-act${o.id === 'play' || o.id === 'equip' ? ' primary' : ''}${o.ok ? '' : ' off'}`, 'aria-disabled': o.ok ? null : 'true',
      tip: o.ok ? t(`act.${o.id}`) : `${t(`act.${o.id}`)} — ${t(`err.${o.error}`)}`,
      onclick: (ev) => (o.ok ? go(o.action, o.id) : flashTip(ev.currentTarget)),
    }, icon(CARD_ACTION_ICON[o.id] ?? 'check'), h('span', {}, t(`act.${o.id}Short`))))),
    opts.some((o) => o.id === 'contribute') ? h('small', { class: 'cd-why' }, t('act.contributeWhy')) : null);
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
  const { state: s, ui, art } = ctx;
  const shown = s.team;
  if (!shown || s.phase === 'draft') {
    for (const el of Object.values(refs)) mount(el);
    document.body.classList.remove('hand-full');
    return;
  }
  const isActor = ctx.canAct;

  // ---- status tag: day, a small "your turn" light
  const status = isActor ? t('panel.yourTurn') : t('panel.waitingColony');
  mount(refs.head,
    h('b', { class: 'pname', tip: status }, t('panel.team')),
    h('span', { class: `turn-light${isActor ? ' go' : ''}`, tip: status, 'aria-label': status, role: 'status' }));

  // ---- survivors: round tokens
  const acting = new Set(isActor ? actingSurvivors(s) : []);

  // ---- energy meter + worn gear (weapon / armor / book), with the survivor's personal costs in the tooltip
  // The meter shows the selected survivor's AP (or the first one's).
  const gearSv = (ui.selSurvivor && s.survivors[ui.selSurvivor]?.alive) ? ui.selSurvivor : aliveSurvivors(s)[0]?.id;
  const hero = gearSv ? s.survivors[gearSv] : heroOf(s);
  const max = hero ? apMax(s, hero.id) : 0;
  const e = hero?.ap ?? 0;
  const night = hero ? sleepPlan(s)[hero.id] : null;
  const costs = hero ? t('panel.costs', {
    move: actionCost(s, hero.id, 'move', 'school'), search: actionCost(s, hero.id, 'search'), attack: actionCost(s, hero.id, 'attack'), kills: killsPerAttack(s, hero.id),
  }) : '';
  const tip = `${t('panel.energyTip', { name: hero ? survivorDef(hero.id).name : '', n: e, max, wake: night?.ap ?? 0, sleep: t(`sleep.${night?.kind ?? 'bed'}`) })}\n${costs}`;
  const gear = gearOf(s, gearSv);
  mount(refs.chips); // UI-6: AP lives on each face now
  // The survivor's round face, with the worn gear (weapon / armor / book) beside it.
  mount(refs.survivors, aliveSurvivors(s).map((sv) => survivorToken(ctx, sv, { canAct: acting.has(sv.id), color: '#f2b33d' })),
    h('div', { class: 'gear', role: 'group', 'aria-label': t('panel.gear') }, ['weapon', 'armor', 'book', 'tool'].map((slot) => {
      const it = gear[slot];
      const label = it ? `${t(`item.${slot}`)}: ${c('items', it.id, 'name')} — ${t(...itemShort(it))}` : t('panel.gearEmpty', { slot: t(`item.${slot}`) });
      return h('span', { class: `gear-slot${it ? ' on' : ''}`, dataset: { slot }, tip: label, 'aria-label': label, tabindex: '0' },
        it ? art.item(it.id, 's', { alt: '' }) : icon(slot === 'weapon' ? 'attack' : slot === 'armor' ? 'barricade' : 'log'));
    })));

  // ---- hand: a floating pile or a fan
  // UI-5: one list at a time — the colony stockpile, or one survivor's backpack (tabs while open).
  // UI-6: the list that opens first is what the selected survivor can use right now —
  // the stockpile at the colony, their own backpack anywhere else.
  const all = allItems(s);
  const home = hero && hero.location !== 'colony' ? hero.id : 'stockpile';
  const tabs = ['stockpile', ...s.team.survivors.filter((id) => s.survivors[id]?.alive && (id === home || s.survivors[id].pack?.length))];
  const tab = ui.handTabFor === (hero?.id ?? null) && tabs.includes(ui.handTab) ? ui.handTab : home;
  const hand = all.filter((u) => (tab === 'stockpile' ? s.stockpile.includes(u) : s.survivors[tab]?.pack?.includes(u)));
  // Phones: an open ring or place card takes the room, so the hand folds into its button.
  const phoneLoc = window.innerWidth <= 760 && !!ui.selLoc;
  // A card picked by other means (keyboard, tutorial, a test) opens the fan while its sheet is up.
  const picked = !!(ui.selCard && hand.includes(ui.selCard));
  const compact = (ui.handCompact || phoneLoc) && !picked;
  document.body.classList.toggle('hand-full', !compact);
  renderHand(refs.hand, { ...ctx, handTabs: tabs, handTab: tab, handHome: home, heroId: hero?.id ?? null }, shown, hand, { isActor, compact, phoneLoc });

  // ---- actions: End turn, everything else behind the round "more" button
  const end = isActor ? endTurnOption(s) : null;
  const endTurn = () => {
    if (shouldConfirmEndTurn(s, { skip: ui.skipEndConfirm })) ctx.set({ modal: 'confirmEnd' });
    else ctx.dispatch(act.endTurn());
  };
  mount(refs.actions,
    isActor ? h('button', {
      class: `btn primary end-turn${end.ok ? '' : ' off'}`, 'aria-disabled': end.ok ? null : 'true',
      tip: end.ok ? null : t(`err.${end.error}`),
      onclick: (ev) => (end.ok ? endTurn() : flashTip(ev.currentTarget)),
    }, t('panel.endDay')) : null);
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

// UI-6: a card without a picture shows its type's icon instead of an empty frame.
const TYPE_ICON = { weapon: 'attack', armor: 'barricade', food: 'food', medicine: 'heal', consumable: 'heal', fuel: 'fuel', tools: 'settings', gadget: 'star', book: 'log', junk: 'goal', material: 'goal', map: 'map' };

function renderHand(container, ctx, shown, hand, { isActor, compact, phoneLoc }) {
  handCtx = ctx;
  const { ui } = ctx;
  const { fan, ctl, sheet } = slots(container);
  const n = hand.length;
  const mode = compact ? 'pile' : 'fan';
  container.classList.toggle('empty', false);
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

  const s = ctx.state;
  const sizeOf = (id) => (id === 'stockpile' ? s.stockpile.length : s.survivors[id].pack.length);
  const countOf = (id) => (id === 'stockpile' ? String(sizeOf(id)) : `${sizeOf(id)}/${RULES.PACK}`);
  const home = ctx.handHome;
  const usable = ctx.handTab === home;
  const head = compact ? null : h('div', { class: 'hand-head' },
    h('b', {}, ctx.handTab === 'stockpile' ? t('pack.headStock', { n: sizeOf('stockpile') }) : t('pack.headPack', { name: survivorDef(ctx.handTab).name.split(' ')[0], n: countOf(ctx.handTab) })),
    usable ? null : h('small', { class: 'away' }, t(ctx.handTab === 'stockpile' ? 'pack.awayStock' : 'pack.awayPack')),
    !n ? h('small', {}, t('pack.empty')) : null);
  const tabRow = !compact && ctx.handTabs.length > 1 ? h('div', { class: 'hand-tabs', role: 'tablist' }, ctx.handTabs.map((id) => h('button', {
    class: `hand-tab${id === ctx.handTab ? ' on' : ''}`, role: 'tab', 'aria-selected': id === ctx.handTab ? 'true' : 'false',
    onclick: (ev) => { ev.stopPropagation(); ctx.set({ handTab: id, handTabFor: ctx.heroId, selCard: null }); },
  }, id === 'stockpile' ? t('pack.tabStock') : survivorDef(id).name.split(' ')[0],
  h('small', {}, countOf(id))))) : null;
  mount(ctl,
    head, tabRow,
    compact
      ? h('button', {
        class: 'pile-btn', 'aria-label': `${t(home === 'stockpile' ? 'pack.tabStock' : 'pack.myPack')} (${countOf(home)})`, tip: t(home === 'stockpile' ? 'pack.tabStock' : 'pack.myPack'), 'aria-expanded': 'false',
        onclick: () => { if (phoneLoc) ctx.selectLocation(null); ctx.set({ handTab: home, handTabFor: ctx.heroId }); ctx.setHandCompact(false); },
      }, icon('hand'), h('span', { class: 'count' }, countOf(home)))
      : h('button', {
        class: 'icon-btn round hand-toggle', 'aria-label': t('panel.handCompact'), tip: t('panel.handCompact'), 'aria-expanded': 'true',
        onclick: () => { ctx.set({ selCard: null }); ctx.setHandCompact(true); },
      }, icon('close')));

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
  const usable = isActor ? cardUsable(s, uid) : { ok: true };
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
      h('span', { class: 'ic-art' }, art.item(item.id, 's', { alt: '' }), icon(TYPE_ICON[item.type] ?? 'goal', 'ic-type-ico')),
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

/** A round portrait token: ring in the team colour, health pips, frostbite, "can act" and moved marks.
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
  sv.wounds ? h('span', { class: 'tok-wound', 'aria-hidden': 'true' }, String(sv.wounds)) : null,
  sv.frostbite ? h('span', { class: 'tok-frost', 'aria-hidden': 'true' }, icon('snowflake')) : null,
  canAct ? h('span', { class: 'tok-ready', 'aria-hidden': 'true' }) : null,
  h('span', { class: 'tok-ap', 'aria-hidden': 'true' }, icon('bolt'), `${sv.ap}`),
  h('span', { class: `tok-hpbar ${(sv.hp ?? 100) > 60 ? 'ok' : (sv.hp ?? 100) >= 30 ? 'mid' : 'low'}`, 'aria-hidden': 'true' }, h('i', { style: { width: `${sv.hp ?? 100}%` } })),
  h('span', { class: 'tok-card', 'aria-hidden': 'true' },
    h('b', {}, d.name),
    h('small', {}, `${c('survivors', sv.id, 'occupation')} · ${where}`),
    h('span', { class: 'sv-stats' },
      h('span', { class: 'need' }, icon('heartIco'), `${sv.hp ?? 100}`),
      h('span', { class: 'need' }, icon('bolt'), `${sv.ap}/${apMax(ctx.state, sv.id)}`),
      h('span', { class: 'need' }, 'ATK ', `${atkOf(ctx.state, sv.id)}`),
      sv.trait ? h('span', { class: 'need trait', tip: t(`trait.${sv.trait}.tip`) }, t(`trait.${sv.trait}`)) : null,
      h('span', { class: 'need', tip: t('xp.tip') }, icon('attack'), `${xpLevel(sv, 'fight')}`, icon('search'), `${xpLevel(sv, 'search')}`),
      h('span', { class: 'need' }, icon('attack'), actionCost(ctx.state, sv.id, 'attack')),
      h('span', { class: 'need' }, icon('search'), actionCost(ctx.state, sv.id, 'search'))),
    h('span', { class: 'sv-health' }, Array.from({ length: limit }, (_, i) => heart(i < left)), sv.moved ? h('small', {}, ` · ${t('panel.moved')}`) : null, sv.napped ? h('small', {}, ` · ${t('act.nap')}`) : null, sv.rest === 'guard' ? h('small', {}, ` · ${t('act.guard')}`) : null),
    h('span', { class: 'tok-ability' }, icon('ability'), c('survivors', sv.id, 'abilityText')),
    // Worn gear (phones hide the gear slots in the HUD, so it is listed here too).
    (() => {
      const g = gearOf(ctx.state, sv.id);
      const worn = ['weapon', 'armor', 'book', 'tool'].map((k) => g[k]).filter(Boolean);
      return worn.length ? h('span', { class: 'tok-gear' }, icon('hand'), worn.map((it) => c('items', it.id, 'name')).join(' · ')) : null;
    })()));
}
