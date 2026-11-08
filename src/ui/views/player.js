// Bottom player panel: who's playing, their survivors, dice, hand, secret objective (press & hold), end turn.
import { h, mount, ITEM_ICON, DIE_GLYPH, hex } from '../dom.js';
import { t, c } from '../../i18n/index.js';
import { getPlayer, aliveSurvivorsOf, survivorDef, itemOf, woundLimit, objectiveDef } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import { cardOptions, endTurnOption, voteTargets } from '../options.js';
import * as act from '../../core/actions.js';

/**
 * refs: { head, survivors, chips, hand, actions } containers inside the panel.
 * The dice tray canvas lives next to `chips` and is never re-created.
 */
export function renderPlayerPanel(refs, ctx) {
  const { state: s, ui, viewer, actor } = ctx;
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
    }, ui.ppCollapsed ? '▴' : '▾'));

  // ---- survivors
  const survivors = aliveSurvivorsOf(s, shown.id);
  mount(refs.survivors, survivors.map((sv) => {
    const d = survivorDef(sv.id);
    const limit = woundLimit(sv.id);
    const selected = ui.selSurvivor === sv.id;
    return h('button', {
      class: `sv-card${selected ? ' selected' : ''}${sv.moved ? ' moved' : ''}`,
      style: { '--accent': d.accent },
      title: c('survivors', sv.id, 'abilityText'),
      onclick: () => ctx.selectSurvivor(selected ? null : sv.id),
    },
    h('div', { class: 'sv-top' }, h('b', {}, d.name), h('span', { class: 'loc-chip' }, c('locations', sv.location, 'name'))),
    h('div', { class: 'sv-occ' }, c('survivors', sv.id, 'occupation')),
    h('div', { class: 'sv-stats' },
      h('span', { title: t('stat.attack') }, `⚔ ${d.attack}+`),
      h('span', { title: t('stat.search') }, `🔍 ${d.search}+`),
      h('span', { title: t('stat.influence') }, `★ ${d.influence}`)),
    h('div', { class: 'sv-health', title: t('stat.wounds') },
      Array.from({ length: limit }, (_, i) => h('i', { class: i < limit - sv.wounds ? 'hp' : 'lost' })),
      sv.frostbite ? h('span', { class: 'frost', title: t('stat.frostbite') }, '❄') : null,
      sv.moved ? h('span', { class: 'moved-tag' }, t('panel.moved')) : null),
    selected ? h('div', { class: 'sv-ability' }, c('survivors', sv.id, 'abilityText')) : null);
  }));

  // ---- dice chips (the 3D tray above shows the same dice)
  mount(refs.chips, shown.dice.map((d, i) => h('button', {
    class: `die-chip${d.used ? ' used' : ''}${ui.selDie === i ? ' selected' : ''}`,
    disabled: d.used || !isActor,
    'aria-label': `die ${d.v}`,
    onclick: () => ctx.set({ selDie: ui.selDie === i ? null : i }),
  }, DIE_GLYPH[d.v])),
  isActor ? h('span', { class: 'muted small' }, ui.selDie == null ? t('panel.dieAuto') : '') : null);

  // ---- hand (only ever the viewer's own)
  const handOwner = viewer ? shown : null;
  const hand = handOwner ? handOwner.hand : [];
  const cards = hand.map((uid) => {
    const item = itemOf(s, uid);
    const selected = ui.selCard === uid;
    return h('button', {
      class: `item-card t-${item.type}${selected ? ' selected' : ''}`,
      onclick: () => ctx.set({ selCard: selected ? null : uid }),
      title: t(`itemPlay.${item.type}`, { n: item.value }),
    },
    h('span', { class: 'ico' }, ITEM_ICON[item.type]),
    h('span', { class: 'iname' }, c('items', item.id, 'name')),
    h('span', { class: 'itype' }, t(`item.${item.type}`)));
  });
  let cardBar = null;
  if (isActor && ui.selCard && hand.includes(ui.selCard)) {
    const item = itemOf(s, ui.selCard);
    // Play needs a target survivor for some types: prefer the selected one, else the first that makes it legal.
    let opts = cardOptions(s, shown.id, ui.selCard, { survivorId: ui.selSurvivor, dieIndex: ui.selDie });
    const play = opts.find((o) => o.id === 'play');
    if (play && !play.ok && ['medicine', 'tools', 'weapon'].includes(item.type)) {
      for (const sv of survivors) {
        const alt = cardOptions(s, shown.id, ui.selCard, { survivorId: sv.id, dieIndex: ui.selDie });
        if (alt.find((o) => o.id === 'play')?.ok) { opts = alt; break; }
      }
    }
    cardBar = h('div', { class: 'card-bar' },
      h('span', { class: 'muted small' }, t(`itemPlay.${item.type}`, { n: item.value })),
      opts.map((o) => h('button', {
        class: 'btn', disabled: !o.ok, title: o.ok ? '' : t(`err.${o.error}`),
        onclick: () => { if (ctx.dispatch(o.action)) ctx.set({ selCard: null }); },
      }, t(`act.${o.id}`))));
  }
  mount(refs.hand,
    h('div', { class: 'hand-cards' }, cards.length ? cards : h('span', { class: 'muted small' }, viewer ? t('panel.handEmpty') : '')),
    cardBar);

  // ---- actions: objective (hold), request, end turn
  const objective = viewer ? objectiveDef(getPlayer(s, viewer).objectiveId) : null;
  const end = isActor ? endTurnOption(s, shown.id) : null;
  mount(refs.actions,
    objective ? h('button', {
      class: 'btn ghost hold', title: t('panel.objective'),
      onpointerdown: (ev) => { ev.preventDefault(); ctx.set({ peek: true }); },
      onpointerup: () => ctx.set({ peek: false }),
      onpointerleave: () => ui.peek && ctx.set({ peek: false }),
      onpointercancel: () => ctx.set({ peek: false }),
      oncontextmenu: (ev) => ev.preventDefault(),
    }, `🔒 ${t('panel.objectiveShort')}`) : null,
    isActor ? h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: 'request' }) }, `🤝 ${t('panel.request')}`) : null,
    isActor && voteTargets(s, shown.id).length ? h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: 'callVote', voteTarget: null }) }, `⚖ ${t('vote.call')}`) : null,
    isActor ? h('button', {
      class: 'btn primary', disabled: !end.ok, onclick: () => ctx.dispatch(act.endTurn(shown.id)),
    }, t('panel.endTurn')) : null,
    ui.peek && objective ? h('div', { class: `objective-peek panel k-${objective.kind}` },
      h('small', {}, t(`kind.${objective.kind}`)),
      h('h3', {}, c('objectives', objective.id, 'name')),
      h('p', {}, c('objectives', objective.id, 'text'))) : null);
}
