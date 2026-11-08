// Right-hand location panel: details, who is here (portraits), zombies (art), and illustrated actions
// for the selected survivor. Lure picks its destination on the board.
import { h, mount, hex } from '../dom.js';
import { icon, dieFace } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { LOCATIONS } from '../../content/locations.js';
import { survivorsAt, survivorDef, getPlayer, aliveSurvivorsOf } from '../../core/selectors.js';
import { PLAYER_COLORS } from '../../render/pieces.js';
import { survivorOptions, moveOption, hasFuel, lureTargets } from '../options.js';

const ACTION_ICON = { attack: 'attack', search: 'search', barricade: 'barricade', clean: 'clean', lure: 'lure', ability: 'heal' };

/** Light up the die chip an action would use while the pointer/focus is on it (no re-render). */
function hintDie(index, on) {
  const chip = document.querySelector(`#pp-chips [data-die="${index}"]`);
  chip?.classList.toggle('hint', on);
}

export function renderLocationPanel(el, ctx) {
  const { state: s, ui, art } = ctx;
  const id = ui.selLoc;
  el.classList.toggle('hidden', !id);
  document.body.classList.toggle('loc-open', !!id);
  if (!id) return;
  const def = LOCATIONS[id];
  const loc = s.locations[id];
  const here = survivorsAt(s, id);
  const ownerIdx = (pid) => s.players.findIndex((p) => p.id === pid);

  const stats = h('div', { class: 'stats' },
    h('div', { class: 'stat warm', tip: t('loc.survivors') }, icon('person'), h('b', {}, `${here.length}/${def.survivorSlots ?? '∞'}`), h('span', {}, t('loc.survivors'))),
    h('div', { class: 'stat danger', tip: t('tip.zombies', { n: loc.zombies }) },
      loc.zombies ? art.zombie((id.length + loc.zombies) % 5, 's', { cls: 'stat-art', alt: '' }) : icon('skull'),
      h('b', {}, `${loc.zombies}/${def.zombieSlots}`), h('span', {}, t('loc.zombies'))),
    h('div', { class: 'stat' }, icon('barricade'), h('b', {}, loc.barricades), h('span', {}, t('loc.barricades'))),
    loc.deck ? h('div', { class: 'stat' }, icon('search'), h('b', {}, loc.deck.length), h('span', {}, t('loc.cards'))) : null);

  const people = h('div', { class: 'here' },
    h('h4', {}, t('loc.here')),
    here.length ? h('div', { class: 'chips' }, here.map((sv) => h('button', {
      class: `chip person${ui.selSurvivor === sv.id ? ' selected' : ''}`,
      style: { '--owner': hex(PLAYER_COLORS[ownerIdx(sv.owner)]) },
      onclick: () => sv.owner === ctx.viewer && ctx.selectSurvivor(sv.id),
    }, art.portrait(sv.id, 's', { alt: '', cls: `${sv.wounds ? 'wounded' : ''}${sv.frostbite ? ' frosty' : ''}` }), survivorDef(sv.id).name,
    s.players.find((p) => p.id === sv.owner)?.exiled ? h('span', { class: 'exile-badge inline', tip: t('panel.exiled') }, icon('door')) : null))) : h('p', { class: 'muted small' }, t('loc.nobody')));

  const actions = [];
  if (ctx.canAct) {
    const me = ctx.viewer;
    const sel = ui.selSurvivor && s.survivors[ui.selSurvivor]?.alive && s.survivors[ui.selSurvivor].owner === me
      ? s.survivors[ui.selSurvivor] : null;

    // Lure picking mode: choose the destination on the board (or from these buttons).
    if (ui.picking?.type === 'lure' && sel) {
      const targets = lureTargets(s, me, ui.picking.survivorId, ui.picking.dieIndex);
      actions.push(h('div', { class: 'pick-box' },
        h('h4', {}, icon('lure'), ` ${t('loc.lurePick')}`),
        h('p', { class: 'small muted' }, t('loc.pickDestination')),
        h('div', { class: 'chips' }, targets.map((tg) => h('button', {
          class: 'chip', disabled: !tg.ok,
          onclick: () => { if (ctx.dispatch(tg.action)) ctx.set({ picking: null }); },
        }, c('locations', tg.to, 'name')))),
        h('button', { class: 'btn ghost', onclick: () => ctx.set({ picking: null }) }, t('act.cancel'))));
    } else {
      if (sel && sel.location !== id) {
        const fuelAvailable = hasFuel(s, me);
        const opt = moveOption(s, me, sel.id, id, ui.useFuel && fuelAvailable);
        const safe = survivorDef(sel.id).ability.type === 'noMoveExposure' || (ui.useFuel && fuelAvailable);
        actions.push(h('div', { class: 'move-box' },
          h('button', {
            class: 'btn primary wide act-big', disabled: !opt.ok,
            onclick: () => ctx.dispatch(opt.action),
          }, icon('move'), h('span', {}, t('loc.moveHere', { name: survivorDef(sel.id).name })),
          h('span', { class: `risk ${safe ? 'safe' : ''}`, tip: safe ? t('tip.safe') : t('tip.exposure') }, icon(safe ? 'check' : 'exposure'))),
          !opt.ok ? h('p', { class: 'bad small' }, t(`err.${opt.error}`)) : null,
          fuelAvailable ? h('label', { class: 'check' }, h('input', {
            type: 'checkbox', checked: ui.useFuel, onchange: (ev) => ctx.set({ useFuel: ev.target.checked }),
          }), ` ${t('loc.moveFuel')}`) : null,
          !safe ? h('p', { class: 'warn small' }, icon('exposure'), ` ${t('loc.moveRisk')}`) : null));
      }
      const mine = aliveSurvivorsOf(s, me).filter((sv) => sv.location === id);
      const focus = sel && sel.location === id ? [sel] : mine;
      for (const sv of focus) {
        const opts = survivorOptions(s, me, sv.id, { dieIndex: ui.selDie });
        const risky = (o) => o.id === 'attack' && survivorDef(sv.id).ability.type !== 'noAttackExposure';
        actions.push(h('div', { class: 'act-box' },
          h('h4', {}, art.portrait(sv.id, 's', { cls: 'h4-face', alt: '' }), t('loc.actionsFor', { name: survivorDef(sv.id).name })),
          h('div', { class: 'act-grid' }, opts.map((o) => {
            const isLure = o.id === 'lure';
            const die = o.die != null ? getPlayer(s, me).dice[o.die] : null;
            return h('button', {
              class: 'btn act', disabled: !o.ok,
              onclick: () => (isLure ? ctx.set({ picking: { type: 'lure', survivorId: sv.id, dieIndex: o.die } }) : ctx.dispatch(o.action)),
              onpointerenter: () => o.die != null && hintDie(o.die, true),
              onpointerleave: () => o.die != null && hintDie(o.die, false),
              onfocus: () => o.die != null && hintDie(o.die, true),
              onblur: () => o.die != null && hintDie(o.die, false),
            },
            icon(ACTION_ICON[o.id] ?? 'ability', 'act-ico'),
            h('span', { class: 'act-name' }, t(`act.${o.id}`)),
            h('span', { class: 'act-meta' },
              o.ok && die ? dieFace(die.v, 'mini') : null,
              !o.ok ? h('small', { class: 'why' }, t(`err.${o.error}`)) : o.min > 1 ? h('small', {}, t('act.needDie', { n: o.min })) : null,
              risky(o) && o.ok ? h('span', { class: 'risk', tip: t('tip.exposure') }, icon('exposure')) : null,
              isLure && o.ok ? h('small', {}, t('act.pickOnBoard')) : null));
          }))));
      }
      if (!sel && !mine.length) actions.push(h('p', { class: 'muted small' }, t('panel.selectHint')));
    }
  }

  mount(el,
    h('button', { class: 'close', 'aria-label': t('settings.close'), onclick: () => ctx.selectLocation(null) }, icon('close')),
    h('h2', { tip: c('locations', id, 'blurb') }, c('locations', id, 'name')),
    stats, people, actions);
}
