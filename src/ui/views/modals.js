// Full-screen screens and dialogs: setup, settings, pass-the-device, draft, crossroads, requests, vote, game over.
import { h, mount, hex, TYPE_REP } from '../dom.js';
import { icon, dieFace } from '../icons.js';
import { t, c, LANGUAGES, getLang, crossChoice, signed } from '../../i18n/index.js';
import { describeEffects, describeTrigger } from '../../i18n/format.js';
import { SCENARIOS } from '../../content/scenarios.js';
import { CRISES_BY_ID } from '../../content/crises.js';
import { voteTargets } from '../options.js';
import { CROSSROADS_BY_ID } from '../../content/crossroads.js';
import { ITEM_TYPES, RULES } from '../../core/constants.js';
import { getPlayer, survivorDef, itemOf, objectiveDef, woundLimit } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import * as act from '../../core/actions.js';

function dialog(cls, ...children) {
  return h('div', { class: `backdrop ${cls}` }, h('div', { class: `dialog panel ${cls}`, role: 'dialog', 'aria-modal': 'true' }, children));
}

// ---------------------------------------------------------------- setup

/** A scenario as a card: goal art, name, short goal, rounds / morale / difficulty; full text in the tooltip. */
function scenarioCard(ctx, sc, { on = false, onclick = null } = {}) {
  return h(onclick ? 'button' : 'div', {
    class: `scenario-card diff-${sc.difficulty}${on ? ' on' : ''}`, 'aria-pressed': onclick ? String(on) : null,
    tip: c('scenarios', sc.id, 'goalText'), dataset: { scenario: sc.id }, onclick,
  },
  h('span', { class: 'sc-art' }, sc.goal.type === 'kills' ? ctx.art.zombie(0, 'l', { alt: '' })
    : ctx.art.item(sc.goal.type === 'deposit' ? 'jerry-can' : 'rice-sack', 'l', { alt: '' })),
  h('b', {}, c('scenarios', sc.id, 'name')),
  h('span', { class: 'sc-goal' }, c('scenarios', sc.id, 'goalText')),
  h('span', { class: 'sc-meta' },
    h('span', { class: `diff ${sc.difficulty}` }, t(`difficulty.${sc.difficulty}`)),
    h('span', {}, icon('round'), sc.rounds),
    h('span', {}, icon('morale'), sc.morale)));
}

/** New game: 1. mode, 2. scenario (cards), 3. players, 4. options (folded). The main button stays bottom right. */
export function setupScreen(ctx) {
  const cfg = ctx.ui.setup;
  const update = (patch) => ctx.set({ setup: { ...cfg, ...patch } });
  const seats = cfg.seats.slice(0, cfg.count);
  const online = cfg.mode === 'online';
  const setSeat = (i, patch) => { cfg.seats[i] = { ...cfg.seats[i], ...patch }; update({ seats: [...cfg.seats] }); };
  const join = () => (cfg.joinCode?.length === 4 ? ctx.joinRoom(cfg.joinCode) : null);
  const step = (n, title, ...body) => h('section', { class: 'setup-step' }, h('h3', {}, h('i', { class: 'step-n' }, n), title), ...body);
  return h('div', { class: 'backdrop setup' }, h('div', { class: 'dialog panel wide setup-v2' },
    h('header', { class: 'setup-head' },
      h('h1', { class: 'logo' }, 'FROSTBOUND'),
      h('p', { class: 'tagline' }, t('app.tagline'))),
    step(1, t('setup.modeTitle'),
      h('div', { class: 'mode-cards', role: 'radiogroup' }, ['local', 'online'].map((m) => h('button', {
        class: `mode-card${(online ? 'online' : 'local') === m ? ' on' : ''}`, role: 'radio', 'aria-checked': String((online ? 'online' : 'local') === m),
        dataset: { mode: m }, onclick: () => update({ mode: m }),
      }, icon(m === 'local' ? 'person' : 'request'), h('b', {}, t(`setup.${m}`)), h('small', {}, t(m === 'local' ? 'tip.modeLocal' : 'tip.modeOnline'))))),
      online ? h('div', { class: 'join-box' },
        h('span', { class: 'lbl' }, t('setup.joinTitle')),
        h('input', {
          class: 'code-input big', value: cfg.joinCode ?? '', placeholder: t('online.codePh'), 'aria-label': t('online.code'), maxlength: 4, autocomplete: 'off',
          oninput: (ev) => { cfg.joinCode = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); ev.target.value = cfg.joinCode; },
          onkeydown: (ev) => { if (ev.key === 'Enter') join(); },
        }),
        h('button', { class: 'btn', tip: t('tip.join'), onclick: join }, t('online.join'))) : null),
    step(2, t('setup.scenario'),
      h('div', { class: 'scenario-cards' }, SCENARIOS.map((sc) => scenarioCard(ctx, sc, { on: cfg.scenarioId === sc.id, onclick: () => update({ scenarioId: sc.id }) })))),
    step(3, online ? t('online.newRoom') : t('setup.players'),
      h('div', { class: 'seg count-seg', 'aria-label': t('setup.players') }, [2, 3, 4, 5].map((n) => h('button', { class: cfg.count === n ? 'on' : '', onclick: () => update({ count: n }) }, n))),
      h('div', { class: 'seats' }, seats.map((seat, i) => h('div', { class: 'seat' },
        h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[i]) } }),
        online && i > 0 ? h('span', { class: 'open-seat' }, seat.isAI ? t('online.botSeat') : t('online.openSeat')) : h('input', {
          value: seat.name, 'aria-label': t('setup.name'), maxlength: 14,
          oninput: (ev) => { cfg.seats[i] = { ...seat, name: ev.target.value }; },
          onchange: () => update({ seats: [...cfg.seats] }),
        }),
        online && i === 0 ? null : h('div', { class: 'seg small' },
          h('button', { class: seat.isAI ? '' : 'on', onclick: () => setSeat(i, { isAI: false }) }, online ? t('online.openSeat') : t('setup.human')),
          h('button', { class: seat.isAI ? 'on' : '', onclick: () => setSeat(i, { isAI: true }) }, t('setup.ai'))))))),
    h('details', { class: 'setup-more' },
      h('summary', {}, t('setup.more')),
      h('div', { class: 'row' },
        h('span', { class: 'lbl' }, t('setup.betrayer')),
        h('div', { class: 'seg small' }, ['maybe', 'always', 'never'].map((m) => h('button', { class: cfg.betrayer === m ? 'on' : '', onclick: () => update({ betrayer: m }) }, t(`setup.betrayer.${m}`))))),
      online ? null : h('div', { class: 'row' },
        h('span', { class: 'lbl' }, t('setup.tutorial')),
        h('div', { class: 'seg small' },
          h('button', { class: ctx.ui.tutorial ? 'on' : '', onclick: () => ctx.setTutorial(true) }, t('settings.on')),
          h('button', { class: ctx.ui.tutorial ? '' : 'on', onclick: () => ctx.setTutorial(false) }, t('settings.off')))),
      settingsRows(ctx)),
    h('footer', { class: 'setup-actions' },
      ctx.hasSave && !online ? h('button', { class: 'btn ghost', onclick: ctx.continueGame }, t('setup.continue')) : null,
      online
        ? h('button', { class: 'btn primary big', onclick: ctx.createRoom }, t('online.create'))
        : h('button', { class: 'btn primary big', onclick: ctx.startGame }, t('setup.start')))));
}

/** Online lobby: the scenario, the room code (with Copy), seats as small cards, and Start for the host. */
export function lobbyScreen(ctx) {
  const o = ctx.online;
  const lobby = o.lobby;
  const ready = lobby?.seats.every((x) => x.taken);
  const sc = SCENARIOS.find((x) => x.id === lobby?.scenarioId);
  const copy = (ev) => {
    const btn = ev.currentTarget;
    navigator.clipboard?.writeText(o.code).then(() => { btn.classList.add('done'); setTimeout(() => btn.classList.remove('done'), 1200); }, () => {});
  };
  return h('div', { class: 'backdrop setup' }, h('div', { class: 'dialog panel lobby' },
    h('small', { class: 'kicker' }, t('online.room')),
    h('div', { class: 'code-row' },
      h('div', { class: 'room-code', tip: t('tip.roomCode') }, o.code),
      h('button', { class: 'icon-btn round copy', 'aria-label': t('online.copy'), tip: t('online.copy'), onclick: copy }, icon('check'))),
    h('p', { class: 'muted small' }, t('online.share')),
    sc ? scenarioCard(ctx, sc) : null,
    h('ul', { class: 'lobby-seats cards' }, (lobby?.seats ?? []).map((x) => h('li', { class: `${x.taken ? 'taken' : 'open'}${`p${x.seat}` === o.playerId ? ' me' : ''}`, style: { '--seat': hex(PLAYER_COLORS[x.seat]) } },
      h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[x.seat]) } }),
      h('span', { class: 'who' }, x.isAI ? t('online.botSeat') : x.name ?? t('online.waiting')),
      `p${x.seat}` === o.playerId ? h('small', { class: 'tag' }, t('online.you')) : null,
      !x.isAI && x.taken && !x.connected ? h('small', { class: 'muted' }, t('online.away')) : null))),
    o.status !== 'open' ? h('p', { class: 'warn small' }, t('online.connecting')) : null,
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: ctx.leaveRoom }, t('online.leave')),
      o.host
        ? h('button', { class: 'btn primary', disabled: !ready, tip: ready ? null : t('tip.waitSeats'), onclick: ctx.startRoom }, t('online.start'))
        : h('span', { class: 'muted small' }, t('online.waitHost')))));
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
    // Step 15: the camera follows what others do; how fast their moves play out.
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.camera')),
      h('div', { class: 'seg small' }, ['all', 'others', 'off'].map((v) => h('button', {
        class: ctx.ui.cameraFollow === v ? 'on' : '', 'data-camera': v, onclick: () => ctx.setPresentation({ cameraFollow: v }),
      }, t(`settings.camera.${v}`))))),
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.speed')),
      h('div', { class: 'seg small' }, ['normal', 'fast'].map((v) => h('button', {
        class: ctx.ui.playSpeed === v ? 'on' : '', 'data-speed': v, onclick: () => ctx.setPresentation({ playSpeed: v }),
      }, t(`settings.speed.${v}`))))),
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
  return h('div', {
    class: 'backdrop pass', role: 'button', tabindex: '0', 'data-autofocus': '',
    onclick: () => ctx.takeSeat(playerId),
    onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ctx.takeSeat(playerId); } },
  },
    h('div', { class: 'pass-card' },
      h('div', { class: 'big-dot', style: { background: hex(PLAYER_COLORS[idx]) } }),
      h('h1', {}, t('pass.title', { name: p.name })),
      h('p', { class: 'muted' }, t('pass.hint')),
      h('p', { class: 'tap' }, t('pass.tap'))));
}

/** Who has picked so far: a dot, the name, picked ✓ / choosing… (never whom they picked). */
function draftStatus(ctx) {
  const s = ctx.state;
  return h('ul', { class: 'draft-status', 'aria-live': 'polite' }, s.players.map((p, i) => h('li', { class: p.drafted ? 'done' : 'busy', dataset: { player: p.id } },
    h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[i]) } }),
    h('span', {}, p.name),
    p.drafted ? h('small', {}, icon('check'), t('draft.picked')) : h('small', {}, icon('hourglass'), t('draft.choosing')))));
}

let dealtFor = null; // the draft the cards were dealt in for (deal once, not on every pick)

/** One survivor as a separate vertical card. */
function survivorCard(ctx, id, { order = 0, color = '#888', dim = false, pop = false, onclick } = {}) {
  const d = survivorDef(id);
  const hp = woundLimit(id);
  return h('button', {
    class: `sv-pick${order ? ' on' : ''}${dim ? ' dim' : ''}${pop ? ' pop' : ''}`, style: { '--accent': d.accent, '--glow': color },
    'aria-pressed': order ? 'true' : 'false', dataset: { sv: id }, onclick,
  },
  order ? h('span', { class: 'order' }, order) : null,
  h('span', { class: 'svp-art' }, ctx.art.portrait(id, 'l', { alt: '' })),
  h('b', {}, d.name),
  h('small', {}, c('survivors', id, 'occupation')),
  h('span', { class: 'sv-stats' },
    h('span', { class: 'need', tip: t('act.attack') }, icon('attack'), dieFace(d.attack, 'mini'), '+'),
    h('span', { class: 'need', tip: t('act.search') }, icon('search'), dieFace(d.search, 'mini'), '+'),
    h('span', { class: 'need', tip: t('draft.influence') }, icon('star'), d.influence),
    h('span', { class: 'need', tip: t('draft.health') }, icon('heal'), hp)),
  h('p', { class: 'svp-ability' }, c('survivors', id, 'abilityText')));
}

/** The chosen cards fly down to where the survivor tokens live. */
function flyPicks() {
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  for (const [k, el] of [...document.querySelectorAll('.sv-pick.on')].entries()) {
    const r = el.getBoundingClientRect();
    const g = el.cloneNode(true);
    Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: 0, zIndex: 60, pointerEvents: 'none' });
    document.body.append(g);
    const dx = 40 + k * 64 - (r.left + r.width / 2);
    const dy = innerHeight - 110 - (r.top + r.height / 2);
    g.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.22)`, opacity: 0.2 }], { duration: 600, easing: 'cubic-bezier(.5,0,.3,1)', delay: k * 80 })
      .finished.then(() => g.remove(), () => g.remove());
  }
}

/** Draft: the options as separate cards; pick two (order badges, player-colour glow), then recruit. */
export function draftModal(ctx) {
  const s = ctx.state;
  const p = getPlayer(s, ctx.viewer);
  const color = hex(PLAYER_COLORS[s.players.indexOf(p)]);
  const picks = ctx.ui.draftPicks ?? [];
  const need = RULES.SURVIVORS_PER_PLAYER - picks.length;
  const dealKey = `${p.id}:${p.draftOptions.join()}`;
  const deal = dealtFor !== dealKey;
  dealtFor = dealKey;
  return h('div', { class: `backdrop draft-screen${deal ? ' deal' : ''}`, role: 'dialog', 'aria-label': t('draft.title', { name: p.name }) },
    h('h2', {}, h('i', { class: 'dot', style: { background: color } }), t('draft.title', { name: p.name })),
    s.players.length > 1 ? draftStatus(ctx) : null,
    h('div', { class: 'sv-pick-row' }, p.draftOptions.map((id, i) => {
      const order = picks.indexOf(id) + 1;
      const card = survivorCard(ctx, id, {
        order, color, dim: !order && need === 0, pop: order && id === ctx.ui.draftLast,
        onclick: () => ctx.set({ draftPicks: order ? picks.filter((x) => x !== id) : [...picks, id].slice(-RULES.SURVIVORS_PER_PLAYER), draftLast: order ? null : id }),
      });
      card.style.setProperty('--i', i);
      return card;
    })),
    h('div', { class: 'draft-actions' },
      h('button', {
        class: 'btn primary big', disabled: need > 0, 'data-autofocus': need === 0 ? '' : null,
        onclick: () => { flyPicks(); if (ctx.dispatch(act.draftPick(p.id, picks))) ctx.set({ draftPicks: [], draftLast: null }); },
      }, need > 0 ? t('draft.pick', { n: need }) : t('draft.confirm'))));
}

/** You have picked; others are still choosing. */
export function draftWaitModal(ctx) {
  const left = ctx.state.players.filter((p) => !p.drafted).length;
  return h('div', { class: 'backdrop draft-screen wait', role: 'dialog', 'aria-label': t('draft.waitTitle') },
    h('h2', {}, icon('hourglass'), t('draft.waitTitle')),
    h('p', { class: 'muted' }, t('draft.waitText', { n: left })),
    draftStatus(ctx));
}

/** Everyone has picked: all teams at once, briefly (auto-continues; click to skip). */
export function teamsModal(ctx) {
  const s = ctx.state;
  return h('div', { class: 'backdrop teams-reveal', role: 'dialog', 'aria-label': t('draft.teams'), onclick: () => ctx.dismissQueue() },
    h('h2', {}, t('draft.teams')),
    h('div', { class: 'teams' }, s.players.map((p, i) => h('div', { class: 'team', style: { '--i': i, '--glow': hex(PLAYER_COLORS[i]) } },
      h('span', { class: 'team-name' }, h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[i]) } }), p.name),
      h('span', { class: 'team-faces' }, p.survivors.map((id) => ctx.art.portrait(id, 's', { alt: survivorDef(id).name, cls: 'team-face' })))))),
    h('p', { class: 'muted small' }, t('draft.teamsSkip')));
}

export function crossroadsModal(ctx) {
  const pend = ctx.state.pendingCrossroads;
  const card = CROSSROADS_BY_ID[pend.cardId];
  const active = getPlayer(ctx.state, pend.activePlayerId);
  const mine = ctx.viewer === pend.activePlayerId;
  return h('div', { class: 'backdrop crossroads' },
    h('div', { class: 'flip-stage' },
      h('div', { class: 'flip-card' },
        h('div', { class: 'face back' }, h('span', { class: 'sigil' }, icon('exposure')), h('b', {}, t('cross.title'))),
        h('div', { class: 'face front dialog panel', role: 'dialog', 'aria-modal': 'true' },
          h('small', { class: 'kicker', tip: t('cross.because', { why: describeTrigger(card.trigger) }) }, t('cross.title')),
          h('h2', {}, c('crossroads', card.id, 'title')),
          // The player it happened to reads it aloud and decides. What each choice does is revealed after.
          h('p', { class: 'muted small read-aloud' }, icon('person'), ` ${t('cross.readAloud', { name: active.name })}`),
          h('p', { class: 'story' }, c('crossroads', card.id, 'text')),
          h('div', { class: 'choices' }, card.choices.map((_, i) => h('button', {
            class: 'choice', disabled: !mine,
            onclick: () => ctx.dispatch(act.resolveCrossroads(pend.activePlayerId, i)),
          }, h('b', {}, crossChoice(card.id, i)))))))));
}

/** Shown to everyone after a crossroads choice: what was chosen and what it did. */
export function crossResultModal(ctx, q) {
  const card = CROSSROADS_BY_ID[q.cardId];
  const who = getPlayer(ctx.state, q.playerId);
  const effects = card.choices[q.choice].effects;
  return dialog('cross-result',
    h('small', { class: 'kicker' }, t('cross.title')),
    h('h2', {}, c('crossroads', card.id, 'title')),
    h('p', { class: 'muted small' }, t('cross.chose', { name: who.name })),
    h('div', { class: 'choices' }, card.choices.map((ch, i) => h('div', { class: `choice${i === q.choice ? ' chosen' : ' other'}` },
      h('b', {}, crossChoice(card.id, i)),
      h('small', {}, effectArt(ctx, ch.effects), describeEffects(ch.effects))))),
    h('p', { class: 'outcome' }, icon('check'), ` ${describeEffects(effects)}`),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: ctx.dismissQueue }, t('colony.continue'))));
}

/** Small item pictures for crossroads effects that hand out or take away cards. */
function effectArt(ctx, effects) {
  return effects.filter((e) => e.type === 'discard' || e.type === 'drawItem').map((e) => (e.type === 'discard' && e.item
    ? ctx.art.item(TYPE_REP[e.item], 's', { cls: 'fx-art minus', alt: '' })
    : h('span', { class: 'fx-art plus' }, icon('search'))));
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
      ITEM_TYPES.map((ty) => h('button', { class: `type-pick${r.itemType === ty ? ' on' : ''}`, onclick: () => set({ itemType: ty }) }, ctx.art.item(TYPE_REP[ty], 's', { cls: 'badge-art', alt: '' }), t(`item.${ty}`)))),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: null }) }, t('act.cancel')),
      h('button', {
        class: 'btn primary',
        onclick: () => { if (ctx.dispatch(act.requestItem(ctx.viewer, r.targetId, r.itemType))) ctx.set({ modal: null, req: null }); },
      }, t('request.send'))));
}

/** Blueprint search: the player saw one card too many and puts one back. */
export function pickModal(ctx, pick) {
  return dialog('pick',
    h('h2', {}, t('pick.title')),
    h('p', { class: 'muted' }, t('pick.text', { place: c('locations', pick.locationId, 'name') })),
    h('div', { class: 'hand-cards' }, pick.uids.map((uid) => {
      const it = itemOf(ctx.state, uid);
      return h('button', { class: `item-card t-${it.type} tier-${it.tier}`, onclick: () => ctx.dispatch(act.returnCard(ctx.viewer, uid)) },
        ctx.art.item(it.id, 's', { alt: '' }), h('span', { class: 'iname' }, c('items', it.id, 'name')), h('span', { class: 'ishort' }, t('pick.putBack')));
    })));
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
      return h('button', { class: `item-card t-${it.type} tier-${it.tier}`, onclick: () => ctx.dispatch(act.respondRequest(me.id, req.id, uid)) },
        ctx.art.item(it.id, 's', { alt: '' }), h('span', { class: 'iname' }, c('items', it.id, 'name')), h('span', { class: 'ishort' }, t('act.give')));
    })),
    h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => ctx.dispatch(act.respondRequest(me.id, req.id, null)) }, t('act.decline'))));
}

export function callVoteModal(ctx) {
  const s = ctx.state;
  const targets = voteTargets(s, ctx.viewer);
  const chosen = ctx.ui.voteTarget ?? targets[0];
  return dialog('call-vote',
    h('h2', {}, icon('vote'), ` ${t('vote.callTitle')}`),
    h('p', { class: 'muted small' }, t('vote.callHelp')),
    h('h4', {}, t('vote.target')),
    h('div', { class: 'seg wrap' }, targets.map((id) => {
      const p = getPlayer(s, id);
      return h('button', { class: chosen === id ? 'on' : '', onclick: () => ctx.set({ voteTarget: id }) },
        h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[s.players.indexOf(p)]), marginRight: '6px' } }), p.name,
        h('span', { class: 'mini-faces' }, p.survivors.map((sid) => ctx.art.portrait(sid, 's', { alt: '' }))));
    })),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: null }) }, t('act.cancel')),
      h('button', {
        class: 'btn primary', disabled: !chosen,
        onclick: () => { if (ctx.dispatch(act.callVote(ctx.viewer, chosen))) ctx.set({ modal: null }); },
      }, t('vote.start'))));
}

export function voteModal(ctx) {
  const v = ctx.state.vote;
  const s = ctx.state;
  const target = getPlayer(s, v.targetId);
  const caller = getPlayer(s, v.callerId);
  const voters = s.players.filter((p) => p.id !== v.targetId);
  return dialog('vote',
    h('small', { class: 'kicker' }, t('vote.callTitle')),
    h('h2', {}, icon('vote'), ` ${t('vote.title', { name: target.name })}`),
    h('div', { class: 'mini-faces big' }, target.survivors.map((sid) => ctx.art.portrait(sid, 'l', { alt: '' }))),
    h('p', { class: 'muted small' }, t('vote.calledBy', { name: caller.name })),
    h('p', { class: 'small' }, t('vote.secret')),
    h('div', { class: 'ballots' }, voters.map((p) => h('span', { class: `ballot${p.id in v.votes ? ' cast' : ''}` }, p.name))),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost big', onclick: () => ctx.dispatch(act.castVote(ctx.viewer, false)) }, icon('hand'), ` ${t('vote.no')}`),
      h('button', { class: 'btn primary big', onclick: () => ctx.dispatch(act.castVote(ctx.viewer, true)) }, icon('door'), ` ${t('vote.yes')}`)));
}

export function voteResultModal(ctx, report) {
  const target = getPlayer(ctx.state, report.targetId);
  return dialog('vote-result',
    h('small', { class: 'kicker' }, t('vote.result', { name: target.name })),
    h('div', { class: 'tally' },
      Array.from({ length: report.yes }, (_, i) => h('span', { class: 'ballot-card yes', style: { animationDelay: `${0.25 + i * 0.3}s` } }, icon('door'))),
      Array.from({ length: report.no }, (_, i) => h('span', { class: 'ballot-card no', style: { animationDelay: `${0.25 + (report.yes + i) * 0.3}s` } }, icon('hand')))),
    h('p', { class: 'muted reveal', style: { animationDelay: `${0.4 + (report.yes + report.no) * 0.3}s` } }, t('vote.tally', { yes: report.yes, no: report.no })),
    h('h2', { class: `verdict reveal ${report.passed ? 'bad' : 'good'}`, style: { animationDelay: `${0.7 + (report.yes + report.no) * 0.3}s` } },
      report.passed ? t('vote.passed', { name: target.name }) : t('vote.failed', { name: target.name })),
    report.passed ? h('p', { class: 'small reveal', style: { animationDelay: `${0.9 + (report.yes + report.no) * 0.3}s` } }, t('vote.exileNote')) : null,
    h('button', { class: 'btn primary wide reveal', style: { animationDelay: `${1 + (report.yes + report.no) * 0.3}s` }, onclick: ctx.dismissQueue }, t('colony.continue')));
}

/** The colony phase, revealed step by step: food, waste, the crisis cards one by one, verdict, new zombies. */
export function colonyModal(ctx, item) {
  const r = item.report;
  const crisis = r.crisis;
  const def = CRISES_BY_ID[crisis.crisisId];
  let delay = 0.2;
  const next = (step = 0.45) => { const d = delay; delay += step; return { animationDelay: `${d}s` }; };
  const rows = [];
  rows.push(h('p', { class: `step reveal ${r.fed ? '' : 'bad'}`, style: next() },
    icon('food'), ` ${r.fed ? t('colony.fed', { n: r.foodNeeded }) : t('colony.starve', { n: r.starvation })}`));
  rows.push(h('p', { class: `step reveal ${r.wasteLoss ? 'bad' : 'muted'}`, style: next() },
    icon('waste'), ` ${r.wasteLoss ? t('colony.waste', { n: r.wasteLoss }) : t('colony.noWaste')}`));
  rows.push(h('h3', { class: 'reveal', style: next(0.3) }, t('colony.crisis', { name: c('crises', def.id, 'name') })));
  rows.push(h('p', { class: 'muted small reveal', style: next(0.3) }, t('colony.needs', { n: crisis.required, item: t(`item.${def.item}`) })));
  if (crisis.cards.length) {
    let running = 0;
    rows.push(h('div', { class: 'crisis-cards' }, crisis.cards.map((cd) => {
      running += cd.delta;
      const style = next(0.55);
      ctx.sfx?.('flip', Number.parseFloat(style.animationDelay) + 0.25);
      return h('div', { class: 'cflip', style },
        h('div', { class: 'cflip-inner', style },
          h('div', { class: 'cface cback' }, '?'),
          h('div', { class: `cface cfront t-${cd.type} ${cd.delta > 0 ? 'plus' : 'minus'}` },
            ctx.art.item(cd.card, 's', { alt: '' }),
            h('span', { class: 'iname' }, c('items', cd.card, 'name')),
            h('b', { class: 'delta' }, signed(cd.delta)),
            h('small', { class: 'run' }, `Σ ${running}`))));
    })));
  } else {
    rows.push(h('p', { class: 'muted reveal', style: next() }, t('colony.noCards')));
  }
  rows.push(h('p', { class: 'score reveal', style: next(0.4) }, t('colony.score', { score: crisis.score, required: crisis.required })));
  const verdictStyle = next(0.5);
  ctx.sfx?.(crisis.success ? 'crisis:ok' : 'crisis:fail', Number.parseFloat(verdictStyle.animationDelay));
  rows.push(h('div', { class: `verdict-banner reveal ${crisis.success ? 'good' : 'bad'}`, style: verdictStyle },
    h('b', {}, crisis.success ? t('colony.averted') : t('colony.failed')),
    !crisis.success ? h('small', {}, describeEffects(def.fail)) : crisis.score >= crisis.required + 2 ? h('small', {}, t('colony.bonus')) : null));
  const spawns = Object.entries(r.spawns ?? {});
  rows.push(h('h3', { class: 'reveal', style: next(0.3) }, icon('skull'), ` ${t('colony.spawns')}`));
  rows.push(spawns.length
    ? h('div', { class: 'chips reveal', style: next() }, spawns.map(([loc, n], i) => h('span', { class: 'chip danger' }, ctx.art.zombie(i % 5, 's', { alt: '' }), `${c('locations', loc, 'name')} +${n}`)))
    : h('p', { class: 'muted reveal', style: next() }, t('colony.noSpawns')));
  if (item.morale != null) rows.push(h('p', { class: 'step reveal', style: next() }, icon('morale'), ` ${t('colony.morale', { n: item.morale })}`));
  rows.push(h('button', { class: 'btn primary wide reveal', style: next(), onclick: ctx.dismissQueue }, t('colony.continue')));
  return dialog('colony',
    h('small', { class: 'kicker' }, t('colony.title', { n: r.round })),
    h('h2', { class: 'with-art' }, ctx.art.item(TYPE_REP[def.item], 's', { alt: '' }), c('crises', def.id, 'name')),
    h('p', { class: 'muted small' }, c('crises', def.id, 'text')),
    rows);
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
        h('span', { class: 'mini-faces' },
          p.survivors.map((sid) => ctx.art.portrait(sid, 's', { alt: '' })),
          p.fallen.map((sid) => ctx.art.portrait(sid, 's', { cls: 'dead', alt: '' }))),
        h('b', {}, p.name),
        h('span', { class: `tag k-${obj.kind}` }, t(`kind.${obj.kind}`)),
        h('span', {}, c('objectives', obj.id, 'name')),
        h('small', { class: o.objectiveMet ? 'good' : 'bad' }, o.objectiveMet ? t('over.met') : t('over.notMet')));
    })),
    h('button', { class: 'btn primary wide', onclick: ctx.quitToSetup }, t('over.again')));
}

export function toastLayer(el, toasts) {
  mount(el, toasts.map((x) => h('div', { class: `toast ${x.kind ?? ''}` }, x.face, h('span', {}, x.text))));
}

export function confirmEndModal(ctx) {
  const me = getPlayer(ctx.state, ctx.viewer);
  const n = me.dice.filter((d) => !d.used).length;
  return dialog('confirm-end',
    h('h2', {}, t('confirm.end.title')),
    h('div', { class: 'dice-row' }, me.dice.map((d) => dieFace(d.v, d.used ? 'spent' : ''))),
    h('p', {}, t('confirm.end.text', { n })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ctx.ui.skipEndConfirm, onchange: (ev) => { ctx.ui.skipEndConfirm = ev.target.checked; } }), ` ${t('confirm.end.skip')}`),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: null }) }, t('confirm.end.no')),
      h('button', { class: 'btn primary', 'data-autofocus': '', onclick: () => { ctx.set({ modal: null }); ctx.dispatch(act.endTurn(me.id)); } }, t('confirm.end.yes'))));
}
