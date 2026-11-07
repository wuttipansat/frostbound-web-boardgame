// Right-hand location panel: details, who is here, and the actions available for the selected survivor.
import { h, mount, hex } from '../dom.js';
import { t, c } from '../../i18n/index.js';
import { LOCATIONS } from '../../content/locations.js';
import { LOCATION_IDS } from '../../core/constants.js';
import { survivorsAt, survivorDef, getPlayer, aliveSurvivorsOf } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import { survivorOptions, moveOption, hasFuel } from '../options.js';

export function renderLocationPanel(el, ctx) {
  const { state: s, ui } = ctx;
  const id = ui.selLoc;
  el.classList.toggle('hidden', !id);
  if (!id) return;
  const def = LOCATIONS[id];
  const loc = s.locations[id];
  const here = survivorsAt(s, id);
  const ownerIdx = (pid) => s.players.findIndex((p) => p.id === pid);

  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat warm' }, h('b', {}, `${here.length}/${def.survivorSlots ?? '∞'}`), h('span', {}, t('loc.survivors'))),
    h('div', { class: 'stat danger' }, h('b', {}, `${loc.zombies}/${def.zombieSlots}`), h('span', {}, t('loc.zombies'))),
    h('div', { class: 'stat' }, h('b', {}, loc.barricades), h('span', {}, t('loc.barricades'))),
    loc.deck ? h('div', { class: 'stat' }, h('b', {}, loc.deck.length), h('span', {}, t('loc.cards'))) : null);

  const people = h('div', { class: 'here' },
    h('h4', {}, t('loc.here')),
    here.length ? h('div', { class: 'chips' }, here.map((sv) => h('button', {
      class: `chip${ui.selSurvivor === sv.id ? ' selected' : ''}`,
      onclick: () => sv.owner === ctx.viewer && ctx.selectSurvivor(sv.id),
    }, h('i', { class: 'dot', style: { background: hex(PLAYER_COLORS[ownerIdx(sv.owner)]) } }), survivorDef(sv.id).name))) : h('p', { class: 'muted small' }, t('loc.nobody')));

  // Actions (only for the player whose turn it is, viewing their own survivor).
  const actions = [];
  if (ctx.canAct) {
    const me = ctx.viewer;
    const sel = ui.selSurvivor && s.survivors[ui.selSurvivor]?.alive && s.survivors[ui.selSurvivor].owner === me
      ? s.survivors[ui.selSurvivor] : null;
    if (sel && sel.location !== id) {
      const fuelAvailable = hasFuel(s, me);
      const opt = moveOption(s, me, sel.id, id, ui.useFuel && fuelAvailable);
      const safe = survivorDef(sel.id).ability.type === 'noMoveExposure' || (ui.useFuel && fuelAvailable);
      actions.push(h('div', { class: 'move-box' },
        h('button', {
          class: 'btn primary wide', disabled: !opt.ok, title: opt.ok ? '' : t(`err.${opt.error}`),
          onclick: () => ctx.dispatch(opt.action),
        }, `➜ ${t('loc.moveHere', { name: survivorDef(sel.id).name })}`),
        !opt.ok ? h('p', { class: 'bad small' }, t(`err.${opt.error}`)) : null,
        fuelAvailable ? h('label', { class: 'check' }, h('input', {
          type: 'checkbox', checked: ui.useFuel, onchange: (ev) => ctx.set({ useFuel: ev.target.checked }),
        }), ` ${t('loc.moveFuel')}`) : null,
        !safe ? h('p', { class: 'warn small' }, `🎲 ${t('loc.moveRisk')}`) : null));
    }
    const mine = aliveSurvivorsOf(s, me).filter((sv) => sv.location === id);
    const focus = sel && sel.location === id ? [sel] : mine;
    for (const sv of focus) {
      const opts = survivorOptions(s, me, sv.id, { dieIndex: ui.selDie, lureTo: ui.lureTo });
      const dieNote = (o) => (o.min > 1 ? t('act.needDie', { n: o.min }) : o.id === 'ability' ? '' : t('act.anyDie'));
      actions.push(h('div', { class: 'act-box' },
        h('h4', {}, t('loc.actionsFor', { name: survivorDef(sv.id).name })),
        h('div', { class: 'act-grid' }, opts.map((o) => h('button', {
          class: 'btn act', disabled: !o.ok, title: o.ok ? '' : t(`err.${o.error}`),
          onclick: () => ctx.dispatch(o.action),
        },
        h('span', {}, t(`act.${o.id}`)),
        h('small', {}, o.ok && o.die != null ? `🎲 ${getPlayer(s, me).dice[o.die].v}` : o.ok ? dieNote(o) : t(`err.${o.error}`))))),
        opts.find((o) => o.id === 'lure')?.ok || s.locations[sv.location].zombies > 0 ? h('label', { class: 'lure' },
          `${t('loc.lureTo')} `,
          h('select', { onchange: (ev) => ctx.set({ lureTo: ev.target.value }) },
            LOCATION_IDS.filter((l) => l !== sv.location).map((l) => h('option', { value: l, selected: (ui.lureTo ?? LOCATION_IDS.find((x) => x !== sv.location)) === l }, c('locations', l, 'name'))))) : null));
    }
    if (!sel && !mine.length) actions.push(h('p', { class: 'muted small' }, t('panel.selectHint')));
  }

  mount(el,
    h('button', { class: 'close', 'aria-label': t('settings.close'), onclick: () => ctx.selectLocation(null) }, '✕'),
    h('h2', {}, c('locations', id, 'name')),
    h('p', { class: 'blurb' }, c('locations', id, 'blurb')),
    stats, people, actions);
}
