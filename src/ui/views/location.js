import { RECIPES } from '../../content/items.js';
import { BUILDING_IDS } from '../../content/buildings.js';
import * as act from '../../core/actions.js';
import { tryReduce } from '../../core/reducer.js';
const check = (s, action) => { const r = tryReduce(s, action); return { action, ok: r.ok, error: r.error }; };
// Right-hand location panel: details, who is here (portraits), zombies (art), and illustrated actions
// for the selected survivor. Lure picks its destination on the board.
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { LOCATIONS } from '../../content/locations.js';
import { survivorsAt, survivorDef, aliveSurvivors, spawnForecast, searchSpawnChance, nextLevel } from '../../core/selectors.js';
import { flashTip } from '../tooltip.js';
import { survivorOptions, lureTargets } from '../options.js';

const ACTION_ICON = { attack: 'attack', search: 'search', barricade: 'barricade', lure: 'lure', ability: 'heal', nap: 'hourglass', guard: 'door', unguard: 'door' };

export function renderLocationPanel(el, ctx) {
  const { state: s, ui, art } = ctx;
  // UI-4: the place's card floats only when asked for (ⓘ / build / craft in the ring), or while picking a lure target.
  const id = ui.selLoc && ui.locInfo ? ui.selLoc : null; // UI-6: lure targets are picked in the action bar
  el.classList.toggle('hidden', !id);
  document.body.classList.toggle('loc-open', !!id);
  if (!id) return;
  const def = LOCATIONS[id];
  const loc = s.locations[id];
  // Step 17: a location at its zombie limit gets blood on its panel.
  el.classList.toggle('overrun', loc.zombies >= def.zombieSlots);
  const here = survivorsAt(s, id);

  // One inline row: icon + number; the labels are tooltips.
  const stats = h('div', { class: 'stats inline' },
    h('span', { class: 'stat warm', tip: t('loc.survivors'), tabindex: '0' }, icon('person'), h('b', {}, `${here.length}/${def.survivorSlots ?? '∞'}`)),
    h('span', { class: 'stat danger', tip: `${t('loc.zombies')} — ${t('tip.zombies', { n: loc.zombies })}`, tabindex: '0' }, icon('skull'), h('b', {}, `${loc.zombies}/${def.zombieSlots}`)),
    h('span', { class: 'stat', tip: t('loc.barricades'), tabindex: '0' }, icon('barricade'), h('b', {}, loc.barricades)),
    loc.deck ? h('span', { class: 'stat', tip: t('loc.cards'), tabindex: '0' }, icon('search'), h('b', {}, loc.deck.deckCount ?? loc.deckCount ?? loc.deck.length)) : null,
    // Step 23: threat forecast — zombies this place gets if the round ended now.
    spawnForecast(s)[id] ? h('span', { class: 'stat danger forecast', tip: t('loc.forecast', { n: spawnForecast(s)[id] }), tabindex: '0' }, icon('crisis'), h('b', {}, `+${spawnForecast(s)[id]}`)) : null);

  const people = h('div', { class: 'here' },
    here.length ? h('div', { class: 'chips' }, here.map((sv) => h('button', {
      class: `chip person face-only${ui.selSurvivor === sv.id ? ' selected' : ''}`,
      style: { '--owner': '#f2b33d' },
      tip: survivorDef(sv.id).name,
      'aria-label': survivorDef(sv.id).name,
      onclick: () => ctx.selectSurvivor(sv.id),
    }, art.portrait(sv.id, 's', { alt: '', cls: `${sv.wounds ? 'wounded' : ''}${sv.frostbite ? ' frosty' : ''}` })))) : null);

  const actions = [];
  if (ctx.canAct) {
    const sel = ui.selSurvivor && s.survivors[ui.selSurvivor]?.alive ? s.survivors[ui.selSurvivor] : null;

    // Lure picking mode: choose the destination on the board (or from these buttons).
    if (ui.picking?.type === 'lure' && sel) {
      const targets = lureTargets(s, ui.picking.survivorId);
      actions.push(h('div', { class: 'pick-box' },
        h('h4', {}, icon('lure'), ` ${t('loc.lurePick')}`),
        h('p', { class: 'small muted' }, t('loc.pickDestination')),
        h('div', { class: 'chips' }, targets.map((tg) => h('button', {
          class: 'chip', disabled: !tg.ok,
          onclick: () => { if (ctx.dispatch(tg.action)) ctx.set({ picking: null }); },
        }, c('locations', tg.to, 'name')))),
        h('button', { class: 'btn ghost', onclick: () => ctx.set({ picking: null }) }, t('act.cancel'))));
    } else {
      if (id === 'colony') {
        // Base upgrades: level, next level's cost and progress; buttons for the selected survivor at home.
        actions.push(h('div', { class: 'act-box build' }, h('h4', {}, t('act.build')),
          h('div', { class: 'picker-row' }, (s.scenario.id === 'crawler' ? ['crawler', ...BUILDING_IDS] : BUILDING_IDS).map((bid) => {
            const nx = nextLevel(s, bid);
            const r = sel?.location === 'colony' ? check(s, act.build(bid, sel.id)) : { ok: false, error: 'mustBeInColony' };
            const cost = nx ? (nx.started ? `${nx.spent}/${nx.ap} AP` : `${Object.entries(nx.needs).map(([i, n]) => `${n}× ${c('items', i, 'name')}`).join(' + ')} + ${nx.ap} AP`) : t('build.max');
            return h('button', {
              class: `btn small-act${r.ok ? '' : ' off'}`,
              tip: `${t(`bld.${bid}`)} ${s.base[bid]}/${bid === 'crawler' ? 4 : 3} — ${t(`bld.${bid}.fx`)} · ${cost}${r.ok ? '' : ` · ${t(`err.${r.error}`)}`}`,
              onclick: (ev) => (r.ok ? ctx.dispatch(r.action) : flashTip(ev.currentTarget)),
            }, `${t(`bld.${bid}`)} ${s.base[bid]}${nx?.started ? ' …' : ''}`);
          }))));
      }
      if (id === 'colony' && sel?.location === 'colony') {
        const crafts = Object.entries(RECIPES).map(([rid, r]) => ({ rid, r, ...check(s, act.craft(rid, sel.id)) }));
        actions.push(h('div', { class: 'act-box craft' }, h('h4', {}, t('act.craft')),
          h('div', { class: 'picker-row' }, crafts.map((x) => h('button', {
            class: `btn small-act${x.ok ? '' : ' off'}`,
            tip: `${Object.entries(x.r.needs).map(([i, n]) => `${n}× ${c('items', i, 'name')}`).join(' + ')} + ${x.r.ap} AP${x.ok ? '' : ` · ${t(`err.${x.error}`)}`}`,
            onclick: (ev) => (x.ok ? ctx.dispatch(x.action) : flashTip(ev.currentTarget)),
          }, c('items', x.r.makes, 'name'))))));
      }
    }
  }

  mount(el,
    h('button', { class: 'close', 'aria-label': t('settings.close'), onclick: () => ctx.set({ locInfo: false, picking: null }) }, icon('close')),
    h('h2', { tip: c('locations', id, 'blurb') }, c('locations', id, 'name')),
    stats, people, actions);
}
