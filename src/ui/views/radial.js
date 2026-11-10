// UI-4: tap a place → small round icons float in an arc above it. Walk there, or act there, with one tap.
// The selected survivor decides what shows: elsewhere → walk (and drive, with fuel); here → that place's actions.
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { flashTip } from '../tooltip.js';
import { actionCost, leaveDamage, searchSpawnChance, survivorDef } from '../../core/selectors.js';
import { survivorOptions, moveOption, actingSurvivors } from '../options.js';

const ICON = { walk: 'move', drive: 'exposure', attack: 'attack', search: 'search', barricade: 'barricade', lure: 'lure', ability: 'heal', nap: 'hourglass', guard: 'door', unguard: 'door', build: 'goal', info: 'log' };
const COLONY_ONLY = ['nap', 'guard', 'unguard'];

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
    const walk = moveOption(state, svId, at, false);
    const hurt = leaveDamage(state, svId);
    items.push({ id: 'walk', ...walk, cost: actionCost(state, svId, 'move', at), risk: hurt ? `−${hurt}` : null, label: t('ring.walk', { place: c('locations', at, 'name') }), move: true });
    const drive = moveOption(state, svId, at, true);
    if (drive.fuel && drive.ok) items.push({ id: 'drive', ...drive, cost: actionCost(state, svId, 'move', at), label: t('scene.fuel'), move: true });
  } else {
    for (const o of survivorOptions(state, svId)) {
      if (COLONY_ONLY.includes(o.id) && at !== 'colony') continue;
      if (o.id === 'search' && at === 'colony') continue;
      if (o.id === 'lure' && !state.locations[at].zombies) continue;
      const risk = o.id === 'attack' && o.fight ? (o.fight.gun ? `${Math.round(o.fight.spawn * 100)}%` : (o.fight.hp ? `−${o.fight.hp}` : null))
        : o.id === 'search' && o.ok ? `${Math.round(searchSpawnChance(state, at) * 100)}%` : null;
      const item = { ...o, risk, label: t(`act.${o.id}`) };
      if (o.id === 'lure') item.fn = () => ctx.set?.({ picking: { type: 'lure', survivorId: svId } });
      items.push(item);
    }
    if (at === 'colony') items.push({ id: 'build', ok: true, label: t('act.build'), fn: () => ctx.set?.({ locInfo: true }) });
  }
  items.push(info);
  return items;
}

export function renderRadial(el, ctx) {
  const { state: s, ui } = ctx;
  const at = s && ui.selLoc;
  const open = !!(at && s.phase !== 'draft' && s.phase !== 'gameOver' && !ui.locInfo && !ui.picking && !ctx.watching && !ui.modal && !ui.queue?.length);
  el.classList.toggle('hidden', !open);
  document.body.classList.toggle('radial-open', open);
  if (!open) { mount(el); el.dataset.at = ''; el.dataset.key = ''; return; }
  el.dataset.at = at;
  const items = ringItems(s, ui, at, ctx);
  const svId = ringSurvivor(s, ui);
  // Re-build only when something on it changed, so the open animation plays once.
  const key = [at, svId, svId ? s.survivors[svId].ap : 0, ...items.map((it) => `${it.id}:${it.ok}:${it.cost ?? ''}:${it.risk ?? ''}`)].join('|');
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const n = items.length;
  const R = Math.max(62, Math.round((54 * (n + 1)) / Math.PI)); // about 54px between icon centres
  el.style.setProperty('--r', `${R}px`);
  mount(el,
    svId ? h('span', { class: 'rd-who', 'aria-hidden': 'true' }, ctx.art.portrait(svId, 's', { alt: '' }), h('b', {}, `${s.survivors[svId].ap}`)) : null,
    items.map((it, i) => {
      // An arc over the top: from about 200° to 340°.
      const ang = Math.PI + ((i + 1) * Math.PI) / (n + 1);
      const x = Math.round(Math.cos(ang) * R);
      const y = Math.round(Math.sin(ang) * R * 0.85);
      const tip = [it.label, it.cost != null ? t('act.cost', { n: it.cost, have: svId ? s.survivors[svId].ap : 0 }) : null, !it.ok ? t(`err.${it.error}`) : null].filter(Boolean).join(' · ');
      return h('button', {
        class: `rd-btn${it.ok ? '' : ' off'}${it.move ? ' move' : ''}`, dataset: { act: it.id },
        style: { '--x': `${x}px`, '--y': `${y}px`, '--i': i },
        tip, 'aria-label': tip, 'aria-disabled': it.ok ? null : 'true',
        onclick: (ev) => {
          ev.stopPropagation();
          if (!it.ok) return flashTip(ev.currentTarget);
          if (it.fn) return it.fn();
          if (ctx.dispatch(it.action) && svId) ctx.set({ selSurvivor: svId });
          return undefined;
        },
      },
      icon(ICON[it.id] ?? 'ability'),
      it.cost ? h('span', { class: 'rd-cost', 'aria-hidden': 'true' }, String(it.cost)) : null,
      it.risk ? h('span', { class: 'rd-risk', 'aria-hidden': 'true' }, it.risk) : null);
    }));
  el.setAttribute('aria-label', svId ? t('ring.for', { name: survivorDef(svId).name, place: c('locations', at, 'name') }) : c('locations', at, 'name'));
}
