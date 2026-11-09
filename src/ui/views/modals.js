// Full-screen screens and dialogs (solo game): setup, settings, draft, crossroads, colony phase, game over.
import { h, mount, TYPE_REP } from '../dom.js';
import { icon } from '../icons.js';
import { t, c, LANGUAGES, getLang, crossChoice, signed } from '../../i18n/index.js';
import { describeEffects, describeTrigger } from '../../i18n/format.js';
import { SCENARIOS } from '../../content/scenarios.js';
import { CRISES_BY_ID } from '../../content/crises.js';
import { CROSSROADS_BY_ID } from '../../content/crossroads.js';
import { RULES, ENERGY, FIGHT } from '../../core/constants.js';
import { survivorDef, itemOf, woundLimit, aliveSurvivors } from '../../core/selectors.js';
import * as act from '../../core/actions.js';
import { checklistView } from './help.js';
import { daySummary, highlights, journalLine } from '../journal.js';

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
    h('span', {}, icon('round'), sc.days),
    h('span', {}, icon('morale'), sc.morale)));
}

/** New game (solo): 1. scenario (cards), 2. options (folded). The main button stays bottom right. */
export function setupScreen(ctx) {
  const cfg = ctx.ui.setup;
  const update = (patch) => ctx.set({ setup: { ...cfg, ...patch } });
  const step = (n, title, ...body) => h('section', { class: 'setup-step' }, h('h3', {}, h('i', { class: 'step-n' }, n), title), ...body);
  return h('div', { class: 'backdrop setup' }, h('div', { class: 'dialog panel wide setup-v2' },
    h('header', { class: 'setup-head' },
      h('h1', { class: 'logo' }, 'FROSTBOUND'),
      h('p', { class: 'tagline' }, t('app.tagline'))),
    step(1, t('setup.scenario'),
      h('div', { class: 'scenario-cards' }, SCENARIOS.map((sc) => scenarioCard(ctx, sc, { on: cfg.scenarioId === sc.id, onclick: () => update({ scenarioId: sc.id }) })))),
    step(2, t('setup.difficulty'),
      h('div', { class: 'seg' }, ['easy', 'normal', 'hard'].map((d) => h('button', {
        class: (cfg.difficulty ?? 'normal') === d ? 'on' : '', 'data-difficulty': d, tip: t(`diff.${d}.tip`),
        onclick: () => update({ difficulty: d }),
      }, t(`diff.${d}`))))),
    h('details', { class: 'setup-more' },
      h('summary', {}, t('setup.more')),
      h('div', { class: 'row' },
        h('span', { class: 'lbl' }, t('setup.tutorial')),
        h('div', { class: 'seg small' },
          h('button', { class: ctx.ui.tutorial ? 'on' : '', onclick: () => ctx.setTutorial(true) }, t('settings.on')),
          h('button', { class: ctx.ui.tutorial ? '' : 'on', onclick: () => ctx.setTutorial(false) }, t('settings.off')))),
      settingsRows(ctx)),
    h('footer', { class: 'setup-actions' },
      ctx.hasSave ? h('button', { class: 'btn ghost', onclick: ctx.continueGame }, t('setup.continue')) : null,
      h('button', { class: 'btn primary big', onclick: ctx.startGame }, t('setup.start')))));
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
    // Step 22: graphics — auto adapts to the device, saver = 30 fps and no post effects.
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.graphics')),
      h('div', { class: 'seg small' }, ['auto', 'high', 'saver'].map((v) => h('button', {
        class: (ctx.ui.graphics ?? 'auto') === v ? 'on' : '', 'data-graphics': v, onclick: () => ctx.setGraphics(v),
      }, t(`settings.graphics.${v}`))))),
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.hints')),
      h('div', { class: 'seg small' },
        h('button', { class: ctx.ui.hints !== false ? 'on' : '', 'data-hints': 'on', onclick: () => ctx.setHints(true) }, t('settings.on')),
        h('button', { class: ctx.ui.hints !== false ? '' : 'on', 'data-hints': 'off', onclick: () => ctx.setHints(false) }, t('settings.off')))),
    // Step 15: the camera follows each move; how fast moves play out.
    h('div', { class: 'row' },
      h('span', { class: 'lbl' }, t('settings.camera')),
      h('div', { class: 'seg small' }, ['all', 'off'].map((v) => h('button', {
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
    h('span', { class: 'need', tip: t('draft.energy', { n: d.energy }) }, icon('exposure'), `${d.energy}`),
    h('span', { class: 'need', tip: t('draft.atk') }, icon('attack'), `ATK ${(7 - d.attack) * FIGHT.ATK_PER_SKILL}`),
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

const TEAM_COLOR = '#f2b33d';

/** Draft: the options as separate cards; pick the starting team (order badges), then recruit. */
export function draftModal(ctx) {
  const p = ctx.state.team;
  const color = TEAM_COLOR;
  const picks = ctx.ui.draftPicks ?? [];
  const need = RULES.TEAM_START - picks.length;
  const dealKey = p.draftOptions.join();
  const deal = dealtFor !== dealKey;
  dealtFor = dealKey;
  return h('div', { class: `backdrop draft-screen${deal ? ' deal' : ''}`, role: 'dialog', 'aria-label': t('draft.title') },
    h('h2', {}, t('draft.title')),
    h('div', { class: 'sv-pick-row' }, p.draftOptions.map((id, i) => {
      const order = picks.indexOf(id) + 1;
      const card = survivorCard(ctx, id, {
        order, color, dim: !order && need === 0, pop: order && id === ctx.ui.draftLast,
        onclick: () => ctx.set({ draftPicks: order ? picks.filter((x) => x !== id) : [...picks, id].slice(-RULES.TEAM_START), draftLast: order ? null : id }),
      });
      card.style.setProperty('--i', i);
      return card;
    })),
    h('div', { class: 'draft-actions' },
      h('button', {
        class: 'btn primary big', disabled: need > 0, 'data-autofocus': need === 0 ? '' : null,
        onclick: () => { flyPicks(); if (ctx.dispatch(act.draftPick(picks))) ctx.set({ draftPicks: [], draftLast: null }); },
      }, need > 0 ? t('draft.pick', { n: need }) : t('draft.confirm'))));
}

export function crossroadsModal(ctx) {
  const pend = ctx.state.pendingCrossroads;
  const card = CROSSROADS_BY_ID[pend.cardId];
  const focus = pend.focusSurvivorId ? survivorDef(pend.focusSurvivorId) : null;
  return h('div', { class: 'backdrop crossroads' },
    h('div', { class: 'flip-stage' },
      h('div', { class: 'flip-card' },
        h('div', { class: 'face back' }, h('span', { class: 'sigil' }, icon('exposure')), h('b', {}, t('cross.title'))),
        h('div', { class: 'face front dialog panel', role: 'dialog', 'aria-modal': 'true' },
          h('small', { class: 'kicker', tip: t('cross.because', { why: describeTrigger(card.trigger) }) }, t('cross.title')),
          h('h2', {}, c('crossroads', card.id, 'title')),
          // Who it happened to. What each choice does is revealed after.
          focus ? h('p', { class: 'muted small read-aloud' }, icon('person'), ` ${focus.name}`) : null,
          h('p', { class: 'story' }, c('crossroads', card.id, 'text')),
          h('div', { class: 'choices' }, card.choices.map((_, i) => h('button', {
            class: 'choice',
            onclick: () => ctx.dispatch(act.resolveCrossroads(i)),
          }, h('b', {}, crossChoice(card.id, i)))))))));
}

/** After a crossroads choice: what was chosen and what it did. */
export function crossResultModal(ctx, q) {
  const card = CROSSROADS_BY_ID[q.cardId];
  const effects = card.choices[q.choice].effects;
  return dialog('cross-result',
    h('small', { class: 'kicker' }, t('cross.title')),
    h('h2', {}, c('crossroads', card.id, 'title')),
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

/** Blueprint search: the player saw one card too many and puts one back. */
export function pickModal(ctx, pick) {
  return dialog('pick',
    h('h2', {}, t('pick.title')),
    h('p', { class: 'muted' }, t('pick.text', { place: c('locations', pick.locationId, 'name') })),
    h('div', { class: 'hand-cards' }, pick.uids.map((uid) => {
      const it = itemOf(ctx.state, uid);
      return h('button', { class: `item-card t-${it.type} tier-${it.tier}`, onclick: () => ctx.dispatch(act.returnCard(uid)) },
        ctx.art.item(it.id, 's', { alt: '' }), h('span', { class: 'iname' }, c('items', it.id, 'name')), h('span', { class: 'ishort' }, t('pick.putBack')));
    })));
}

/** The colony phase, revealed step by step: food, the crisis cards one by one, verdict, new zombies. */
export function colonyModal(ctx, item) {
  const r = item.report;
  const crisis = r.crisis;
  const def = CRISES_BY_ID[crisis.crisisId];
  let delay = 0.2;
  const next = (step = 0.45) => { const d = delay; delay += step; return { animationDelay: `${d}s` }; };
  const rows = [];
  if (item.day) rows.push(h('p', { class: 'jr-summary reveal', style: next(0.2) }, icon('log'), ` ${daySummary(ctx.state, item.day)}`));
  rows.push(h('p', { class: `step reveal ${r.fed ? '' : 'bad'}`, style: next() },
    icon('food'), ` ${r.fed ? t('colony.fed', { n: r.foodNeeded }) : t('colony.starve', { n: r.hungry?.length ?? 0 })}`));
  // Step 17: the daily report also covers the night attack, how everyone slept and the weekly mission.
  if (r.siege) rows.push(h('p', { class: `step reveal ${r.siege.hits ? 'bad' : ''}`, style: next() }, icon('skull'),
    ` ${t('colony.siege', { n: r.siege.attackers, k: r.siege.stopped, hits: r.siege.hits, hp: r.siege.hits * 10 })}`));
  if (r.sleep) {
    const kinds = {};
    for (const x of Object.values(r.sleep)) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
    rows.push(h('p', { class: 'step reveal', style: next() }, icon('hourglass'), ` ${Object.entries(kinds).map(([k, n]) => `${n}× ${t(`sleep.${k}`)}`).join(' · ')}`));
  }
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
    h('small', { class: 'kicker' }, t('colony.title', { n: r.day })),
    h('h2', { class: 'with-art' }, ctx.art.item(TYPE_REP[def.item], 's', { alt: '' }), c('crises', def.id, 'name')),
    h('p', { class: 'muted small' }, c('crises', def.id, 'text')),
    rows);
}

export function gameOverModal(ctx) {
  const s = ctx.state;
  const r = s.result;
  const won = r.reason === 'objectiveComplete';
  // Step 20: the scene behind tells the ending (bonfire blazing / colony buried). "Look" hides the card a moment.
  const peek = (on) => (ev) => { ev.stopPropagation(); ev.currentTarget.closest('.backdrop')?.classList.toggle('peek', on); };
  const el = dialog(`over${won ? ' won' : ' lost'}`,
    h('small', { class: 'kicker' }, t('over.title')),
    h('h2', {}, t(`over.reason.${r.reason}`)),
    h('p', { class: 'over-epitaph' }, t(`over.epitaph.${won ? 'won' : 'lost'}`)),
    (() => { const hl = highlights(s); return hl.length ? h('div', { class: 'jr-story' }, h('h4', {}, t('jr.story')), h('ul', {}, hl.map((j) => h('li', {}, journalLine(j))))) : null; })(),
    h('div', { class: 'over-stats' }, [
      ['over.days', s.day], ['over.kills', s.totalKills], ['over.searches', s.stats?.searches ?? 0],
      ['over.builds', s.stats?.builds ?? 0], ['over.crafts', s.stats?.crafts ?? 0], ['over.missions', s.stats?.missions ?? 0],
      ['over.lost', s.team.fallen.length], ['over.difficulty', t(`diff.${s.difficulty ?? 'normal'}`)],
    ].map(([k, v]) => h('div', { class: 'ov-stat' }, h('b', {}, String(v)), h('small', {}, t(k))))),
    h('h4', {}, t('over.team')),
    h('div', { class: 'mini-faces big over-team' },
      aliveSurvivors(s).map((sv) => ctx.art.portrait(sv.id, 'l', { alt: survivorDef(sv.id).name })),
      s.team.fallen.map((sid) => ctx.art.portrait(sid, 'l', { cls: 'dead', alt: survivorDef(sid).name }))),
    h('div', { class: 'over-actions' },
      h('button', { class: 'btn ghost over-look', onclick: peek(true) }, icon('search'), t('over.look')),
      h('button', { class: 'btn primary wide', onclick: ctx.quitToSetup }, t('over.again'))));
  el.append(h('button', { class: 'btn over-back', onclick: peek(false) }, t('over.back')));
  return el;
}

export function toastLayer(el, toasts) {
  mount(el, toasts.map((x) => h('div', { class: `toast ${x.kind ?? ''}` }, x.face, h('span', {}, x.text))));
}

export function confirmEndModal(ctx) {
  const me = ctx.state.team;
  return dialog('confirm-end',
    h('h2', {}, t('confirm.end.title')),
    h('p', {}, t('confirm.end.energy', { n: me.survivors.reduce((a, id) => a + (ctx.state.survivors[id]?.alive ? ctx.state.survivors[id].ap : 0), 0) })),
    // Step 18: what is still unsafe this round, before the colony phase.
    (() => { const bad = checklistView(ctx.state, { onlyBad: true }); return bad ? h('div', { class: 'warn-box' }, h('small', {}, t('check.warn')), bad) : null; })(),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: ctx.ui.skipEndConfirm, onchange: (ev) => { ctx.ui.skipEndConfirm = ev.target.checked; } }), ` ${t('confirm.end.skip')}`),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => ctx.set({ modal: null }) }, t('confirm.end.no')),
      h('button', { class: 'btn primary', 'data-autofocus': '', onclick: () => { ctx.set({ modal: null }); ctx.dispatch(act.endTurn()); } }, t('confirm.end.yes'))));
}
