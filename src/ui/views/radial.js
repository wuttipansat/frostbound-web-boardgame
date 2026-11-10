// UI-6: tap a place → an action bar slides up from the bottom edge. Walk there, or act there, with one tap.
// (It replaced the UI-4 ring, which moved with the camera and covered the buildings.)
// The selected survivor decides what shows: elsewhere → walk (and drive, with fuel); here → that place's actions.
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { flashTip } from '../tooltip.js';
import { actionCost, leaveDamage, searchSpawnChance, survivorDef, aliveSurvivors } from '../../core/selectors.js';
import { survivorOptions, moveOption, actingSurvivors, lureTargets } from '../options.js';

const ICON = { walk: 'move', drive: 'fuel', attack: 'attack', search: 'search', barricade: 'barricade', lure: 'lure', ability: 'heal', nap: 'hourglass', guard: 'door', unguard: 'door', build: 'goal', info: 'log' };
const COLONY_ONLY = ['nap', 'guard', 'unguard', 'barricade'];

/** The survivor the ring acts for: the selected one, else the first who can still act, else the first alive. */
export function ringSurvivor(state, ui) {
  const sel = ui.selSurvivor && state.survivors[ui.selSurvivor]?.alive ? ui.selSurvivor : null;
  return sel ?? actingSurvivors(state)[0] ?? state.team.survivors.find((id) => state.survivors[id]?.alive) ?? null;
}

/** The icons for a place: [{ id, ok, error, action?, fn?, cost?, risk?, label }]. */
export function ringItems(state, ui, at, ctx = {}) {
  const items = [];
  const svId = ringSurvivor(state, ui);
  const info = { id: 'info', ok: true, label: t('ring.info'), fn: () => ctx.set?.({ locInfo: true }) };
  if (!svId || state.phase !== 'turn') return [info];
  const sv = state.survivors[svId];
  if (sv.location !== at) {
    // Walking is a tap on a face: one button per survivor who is somewhere else (the selected one first).
    const walkers = aliveSurvivors(state).filter((v) => v.location !== at).sort((x, y) => (y.id === svId) - (x.id === svId));
    for (const v of walkers) {
      const hurt = leaveDamage(state, v.id);
      items.push({ id: 'walk', ...moveOption(state, v.id, at, false), cost: actionCost(state, v.id, 'move', at), risk: hurt ? `−${hurt}` : null, label: t('bar.walk'), move: true, face: v.id });
    }
    const drive = moveOption(state, svId, at, true);
    if (drive.fuel && drive.ok) items.push({ id: 'drive', ...drive, cost: actionCost(state, svId, 'move', at), label: t('bar.drive'), move: true, face: svId });
  } else {
    for (const o of survivorOptions(state, svId)) {
      if (COLONY_ONLY.includes(o.id) && at !== 'colony') continue;
      if (o.id === 'search' && at === 'colony') continue;
      if ((o.id === 'lure' || o.id === 'attack') && !state.locations[at].zombies) continue; // nothing to hit or lure
      const risk = o.id === 'attack' && o.fight ? (o.fight.gun ? `${Math.round(o.fight.spawn * 100)}%` : (o.fight.hp ? `−${o.fight.hp}` : null))
        : o.id === 'search' && o.ok ? `${Math.round(searchSpawnChance(state, at) * 100)}%` : null;
      const item = { ...o, risk, label: t(`bar.${o.id}`) };
      if (o.id === 'lure') item.fn = () => ctx.set?.({ picking: { type: 'lure', survivorId: svId } });
      items.push(item);
    }
    if (at === 'colony') items.push({ id: 'build', ok: true, label: t('bar.build'), fn: () => ctx.set?.({ locInfo: true }) });
  }
  items.push(info);
  return items;
}

export function renderRadial(el, ctx) {
  const { state: s, ui } = ctx;
  const at = s && ui.selLoc;
  const open = !!(at && s.phase !== 'draft' && s.phase !== 'gameOver' && !ui.locInfo && !ctx.watching && !ui.modal && !ui.queue?.length);
  el.classList.toggle('hidden', !open);
  document.body.classList.toggle('radial-open', open);
  if (!open) { mount(el); el.dataset.at = ''; el.dataset.key = ''; return; }
  el.dataset.at = at;
  const svId = ringSurvivor(s, ui);
  const luring = ui.picking?.type === 'lure' && ui.picking.survivorId === svId;
  const items = luring ? [] : ringItems(s, ui, at, ctx).filter((it) => it.id !== 'info');
  const lures = luring ? lureTargets(s, svId) : [];
  const loc = s.locations[at];
  const people = aliveSurvivors(s).filter((v) => v.location === at).length;
  // Re-build only when something on it changed, so the slide-in plays once.
  const key = [at, svId, luring, loc.zombies, people, ...aliveSurvivors(s).map((v) => `${v.id}:${v.ap}`), ...items.map((it) => `${it.id}:${it.ok}:${it.cost ?? ''}:${it.risk ?? ''}`), ...lures.map((l) => `${l.to}:${l.ok}`)].join('|');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const ap = svId ? s.survivors[svId].ap : 0;
  const off = (ev, it) => { ev.stopPropagation(); if (!it.ok) { flashTip(ev.currentTarget); return true; } return false; };
  const button = (it) => {
    const risk = it.risk ? (it.risk.endsWith('%') ? t('bar.risk', { n: it.risk }) : `${it.risk} HP`) : null;
    const meta = it.cost || risk ? [it.cost ? h('span', { class: 'ap' }, icon('exposure'), String(it.cost)) : null, it.cost && risk ? ' · ' : null, risk].filter(Boolean) : [];
    const tip = [it.label, it.cost != null ? t('act.cost', { n: it.cost, have: ap }) : null, !it.ok ? t(`err.${it.error}`) : null].filter(Boolean).join(' · ');
    return h('button', {
      class: `rd-btn${it.ok ? '' : ' off'}${it.move ? ' move' : ''}`, dataset: { act: it.id, sv: it.face ?? '' },
      tip: it.ok ? null : tip, 'aria-label': tip, 'aria-disabled': it.ok ? null : 'true',
      onclick: (ev) => {
        if (off(ev, it)) return undefined;
        if (it.fn) return it.fn();
        if (ctx.dispatch(it.action) && (it.face ?? svId)) ctx.set({ selSurvivor: it.face ?? svId });
        return undefined;
      },
    },
    it.face ? h('span', { class: 'rd-face' }, ctx.art.portrait(it.face, 's', { alt: survivorDef(it.face).name }), icon(ICON[it.id])) : icon(ICON[it.id] ?? 'ability'),
    h('span', { class: 'rd-label' }, it.label),
    meta.length ? h('span', { class: `rd-meta${it.risk ? ' risky' : ''}` }, ...meta) : null);
  };
  mount(el,
    h('div', { class: 'ab-head' },
      h('div', { class: 'ab-title' },
        h('b', {}, luring ? t('loc.lurePick') : c('locations', at, 'name')),
        h('span', { class: 'ab-counts' },
          h('span', { class: loc.zombies ? 'z' : '' }, icon('skull'), String(loc.zombies)),
          h('span', {}, icon('person'), String(people)))),
      h('button', { class: 'ab-icon', dataset: { act: 'info' }, 'aria-label': t('ring.info'), tip: t('ring.info'), onclick: (ev) => { ev.stopPropagation(); ctx.set({ locInfo: true, picking: null }); } }, h('b', {}, 'i')),
      h('button', { class: 'ab-icon ab-close', 'aria-label': t('settings.close'), onclick: (ev) => { ev.stopPropagation(); ctx.set({ picking: null }); ctx.selectLocation(null); } }, icon('close'))),
    // Who acts: tap a face to switch.
    s.phase === 'turn' && !items.some((it) => it.id === 'walk') ? h('div', { class: 'ab-who', role: 'group' }, aliveSurvivors(s).map((v) => h('button', {
      class: `ab-face${v.id === svId ? ' on' : ''}`, 'aria-pressed': v.id === svId ? 'true' : 'false', 'aria-label': survivorDef(v.id).name,
      onclick: (ev) => { ev.stopPropagation(); ctx.set({ selSurvivor: v.id, picking: null }); },
    }, ctx.art.portrait(v.id, 's', { alt: '' }), h('span', {}, icon('exposure'), String(v.ap)),
    v.id === svId ? h('small', {}, v.location === at ? t('bar.here') : c('locations', v.location, 'name')) : null))) : null,
    h('div', { class: 'ab-row' }, luring
      ? [...lures.map((tg) => h('button', {
        class: `rd-btn${tg.ok ? '' : ' off'}`, dataset: { act: 'lure-to', to: tg.to }, tip: tg.ok ? null : t(`err.${tg.error}`), 'aria-disabled': tg.ok ? null : 'true',
        onclick: (ev) => { if (off(ev, tg)) return; if (ctx.dispatch(tg.action)) ctx.set({ picking: null }); },
      }, icon('lure'), h('span', { class: 'rd-label' }, c('locations', tg.to, 'name')))),
      h('button', { class: 'rd-btn', dataset: { act: 'cancel' }, onclick: (ev) => { ev.stopPropagation(); ctx.set({ picking: null }); } }, icon('close'), h('span', { class: 'rd-label' }, t('act.cancel')))]
      : items.length ? items.map(button) : h('p', { class: 'ab-empty' }, t('bar.none'))));
  el.setAttribute('aria-label', svId ? t('ring.for', { name: survivorDef(svId).name, place: c('locations', at, 'name') }) : c('locations', at, 'name'));
}
