// "Who goes there?" (step 15): tapping a location on your turn floats your survivors' round faces next to
// it. Tapping one moves it there at once. Survivors that can't go are greyed (tap: the reason).
import { h, mount } from '../dom.js';
import { icon } from '../icons.js';
import { t, c } from '../../i18n/index.js';
import { flashTip } from '../tooltip.js';
import { aliveSurvivors, survivorDef, woundLimit } from '../../core/selectors.js';
import { moveOption, hasFuel } from '../options.js';

/** The survivors that could be sent to `locationId` (everyone not already there). */
export function moveCandidates(state, locationId, useFuel = false) {
  const fuel = useFuel && hasFuel(state);
  return aliveSurvivors(state).filter((sv) => sv.location !== locationId).map((sv) => {
    const opt = moveOption(state, sv.id, locationId, fuel);
    const safe = true; // walking carries no risk until HP fights (rework step 6)
    return { sv, opt, safe };
  });
}

export function renderMovePicker(el, ctx) {
  const { state: s, ui, art } = ctx;
  const at = ui.movePick;
  const open = !!(s && at && ctx.canAct && ui.selLoc === at && !ui.picking && !ctx.watching);
  const list = open ? moveCandidates(s, at, ui.useFuel) : [];
  el.classList.toggle('hidden', !list.length);
  if (!list.length) { mount(el); return; }
  const color = '#f2b33d';
  // The selected survivor comes first and stands out.
  list.sort((a, b) => (b.sv.id === ui.selSurvivor) - (a.sv.id === ui.selSurvivor));
  const place = c('locations', at, 'name');
  const fuel = hasFuel(s);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', t('scene.pickWho', { place }));
  mount(el,
    list.map(({ sv, opt, safe }) => {
      const name = survivorDef(sv.id).name;
      const tip = `${t('scene.moveTo', { name })} — ${opt.ok ? t('tip.safe') : t(`err.${opt.error}`)}`;
      const left = woundLimit(sv.id) - sv.wounds;
      return h('button', {
        class: `mp-token${opt.ok ? '' : ' off'}${ui.selSurvivor === sv.id ? ' preferred' : ''}`,
        style: { '--ring': color }, dataset: { sv: sv.id },
        'aria-disabled': opt.ok ? null : 'true', 'aria-label': tip, tip,
        onclick: (ev) => {
          ev.stopPropagation();
          if (!opt.ok) return flashTip(ev.currentTarget);
          if (ctx.dispatch(opt.action)) ctx.set({ selSurvivor: sv.id });
          return undefined;
        },
      },
      art.portrait(sv.id, 's', { alt: '', cls: 'mp-face' }),
      h('span', { class: 'mp-hp', 'aria-hidden': 'true' }, Array.from({ length: woundLimit(sv.id) }, (_, i) => h('i', { class: i < left ? 'on' : '' }))),
      opt.ok ? h('span', { class: `mp-risk${safe ? ' safe' : ''}`, 'aria-hidden': 'true' }, icon(safe ? 'check' : 'exposure')) : h('span', { class: 'mp-off', 'aria-hidden': 'true' }, icon('close')));
    }),
    fuel ? h('button', {
      class: `mp-fuel${ui.useFuel ? ' on' : ''}`, 'aria-pressed': ui.useFuel ? 'true' : 'false', tip: t('scene.fuel'), 'aria-label': t('scene.fuel'),
      onclick: (ev) => { ev.stopPropagation(); ctx.set({ useFuel: !ui.useFuel }); },
    }, icon('exposure'), h('span', {}, t('loc.fuelShort'))) : null);
}
