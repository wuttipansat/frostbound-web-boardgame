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
import { locDef, isSpot } from '../../core/map.js';
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
  const def = locDef(s, id); // (typed places and search spots: 'police-2', 'spot-house-3')
  const loc = s.locations[id];
  // Step 17: a location at its zombie limit gets blood on its panel.
  el.classList.toggle('overrun', loc.zombies >= def.zombieSlots);
  const here = survivorsAt(s, id);

  // One inline row: icon + number; the labels are tooltips.
  const stats = h('div', { class: 'stats inline' },
    h('span', { class: 'stat warm', tip: t('loc.survivors'), tabindex: '0' }, icon('person'), h('b', {}, `${here.length}/${def.survivorSlots ?? '∞'}`), h('small', {}, t('loc.survivors'))),
    h('span', { class: 'stat danger', tip: `${t('loc.zombies')} — ${t('tip.zombies', { n: loc.zombies })}`, tabindex: '0' }, icon('skull'), h('b', {}, `${loc.zombies}/${def.zombieSlots}`), h('small', {}, t('loc.zombies'))),
    isSpot(s, id) ? null : h('span', { class: 'stat', tip: t('loc.barricades'), tabindex: '0' }, icon('barricade'), h('b', {}, loc.barricades), h('small', {}, t('loc.barricades'))),
    loc.deck ? h('span', { class: 'stat', tip: t('loc.cards'), tabindex: '0' }, icon('search'), h('b', {}, loc.deck.deckCount ?? loc.deckCount ?? loc.deck.length), h('small', {}, t('loc.cardsShort'))) : null,
    // Step 23: threat forecast — zombies this place gets if the round ended now.
    spawnForecast(s)[id] ? h('span', { class: 'stat danger forecast', tip: t('loc.forecast', { n: spawnForecast(s)[id] }), tabindex: '0' }, icon('crisis'), h('b', {}, `+${spawnForecast(s)[id]}`), h('small', {}, t('loc.forecastShort'))) : null);

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
          h('div', { class: 'bld-list' }, (s.scenario.id === 'crawler' ? ['crawler', ...BUILDING_IDS] : BUILDING_IDS).map((bid) => {
            const nx = nextLevel(s, bid);
            const r = sel?.location === 'colony' ? check(s, act.build(bid, sel.id)) : { ok: false, error: 'mustBeInColony' };
            // UI-7: a row per upgrade — level, what it does, what it costs and what is still missing.
            const max = bid === 'crawler' ? 4 : 3;
            const parts = nx && !nx.started ? Object.entries(nx.needs).map(([i, n]) => {
              const have = Math.min(n, s.stockpile.filter((u) => s.cards[u] === i).length);
              return h('span', { class: `need${have >= n ? ' ok' : ' miss'}` }, `${c('items', i, 'name')} ${have}/${n}`);
            }) : [];
            return h('button', {
              class: `bld-row${r.ok ? '' : ' off'}`, 'aria-disabled': r.ok ? null : 'true', dataset: { bld: bid },
              tip: r.ok ? null : t(`err.${r.error}`),
              onclick: (ev) => (r.ok ? ctx.dispatch(r.action) : flashTip(ev.currentTarget)),
            },
            h('b', {}, t(`bld.${bid}`), h('em', {}, ` ${s.base[bid]}/${max}`)),
            h('small', { class: 'fx' }, t(`bld.${bid}.fx`)),
            h('span', { class: 'cost' }, !nx ? t('build.max') : nx.started ? [`${t('build.working')} ${nx.spent}/${nx.ap} `, icon('bolt'), ` · ${t('build.shift', { n: Math.min(20, nx.ap - nx.spent) })}`] : [...parts, h('span', { class: 'need' }, icon('bolt'), `${nx.ap} · ${t('build.shift', { n: Math.min(20, nx.ap) })}`)]));
          }))));
      }
      if (id === 'colony' && sel?.location === 'colony') {
        const crafts = Object.entries(RECIPES).map(([rid, r]) => ({ rid, r, ...check(s, act.craft(rid, sel.id)) }));
        actions.push(h('div', { class: 'act-box craft' }, h('h4', {}, t('act.craft')),
          h('div', { class: 'bld-list' }, crafts.map((x) => h('button', {
            class: `bld-row${x.ok ? '' : ' off'}`,
            tip: `${Object.entries(x.r.needs).map(([i, n]) => `${n}× ${c('items', i, 'name')}`).join(' + ')} + ${x.r.ap} AP${x.ok ? '' : ` · ${t(`err.${x.error}`)}`}`,
            onclick: (ev) => (x.ok ? ctx.dispatch(x.action) : flashTip(ev.currentTarget)),
          }, h('b', {}, c('items', x.r.makes, 'name')), h('small', {}, `${Object.entries(x.r.needs).map(([i, n]) => `${c('items', i, 'name')} ${Math.min(n, s.stockpile.filter((u) => s.cards[u] === i).length)}/${n}`).join(' · ')}`), h('small', {}, icon('bolt'), `${x.r.ap}`))))));
      }
    }
  }

  mount(el,
    h('button', { class: 'close', 'aria-label': t('settings.close'), onclick: () => ctx.set({ locInfo: false, picking: null }) }, icon('close')),
    h('h2', { tip: c('locations', id, 'blurb') }, c('locations', id, 'name')),
    stats, people, actions);
}
