// Coach-mark overlay: a spotlight on the target element and a bubble with the step text.
import { h, mount } from '../dom.js';
import { t } from '../../i18n/index.js';
import { TUTORIAL } from '../tutorial.js';

export function renderTutorial(el, ctx, index, visible) {
  const step = TUTORIAL[index];
  if (!step || !visible) { mount(el); el.dataset.step = ''; return; }
  if (el.dataset.step === step.id && el.dataset.lang === document.documentElement.lang) return; // keep DOM (and its animation)
  el.dataset.step = step.id;
  el.dataset.lang = document.documentElement.lang;
  mount(el,
    h('div', { class: `tut-spot${step.target ? '' : ' none'}` }),
    // No target on screen yet (e.g. the move picker before a building is tapped): start centred.
    h('div', { class: `tut-bubble panel${step.target && document.querySelector(step.target)?.getClientRects().length ? '' : ' center'}${step.placement === 'top' ? ' top' : ''}`, role: 'dialog', 'aria-live': 'polite' },
      h('small', { class: 'kicker' }, t('tut.of', { i: index + 1, n: TUTORIAL.length })),
      h('h3', {}, t(`tut.${step.id}.title`)),
      h('p', {}, t(`tut.${step.id}.text`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small-btn', onclick: () => ctx.tutorialEvent('skip') }, t('tut.skip')),
        step.id === 'colony' ? h('button', { class: 'btn ghost small-btn', onclick: () => { ctx.tutorialEvent('next'); ctx.set({ modal: 'rules' }); } }, t('tut.rules')) : null,
        step.next ? h('button', { class: 'btn primary', onclick: () => ctx.tutorialEvent('next') }, step.id === 'colony' ? t('tut.done') : t('tut.next')) : null)));
}

/** Called every frame: keep the spotlight and bubble glued to the (possibly moving) target. */
export function positionTutorial(el) {
  const id = el.dataset.step;
  if (!id) return;
  const step = TUTORIAL.find((s) => s.id === id);
  const spot = el.querySelector('.tut-spot');
  const bubble = el.querySelector('.tut-bubble');
  if (!spot || !bubble || !step.target) return;
  const target = document.querySelector(step.target);
  // (offsetParent is always null for position:fixed elements, so test the layout boxes instead)
  if (!target || !target.getClientRects().length || target.classList.contains('hidden')) {
    spot.classList.add('none');
    bubble.classList.add('center');
    return;
  }
  spot.classList.remove('none');
  bubble.classList.remove('center');
  const r = target.getBoundingClientRect();
  const pad = 6;
  Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const below = r.bottom + 14 + bh < window.innerHeight;
  const top = below ? r.bottom + 14 : Math.max(12, r.top - 14 - bh);
  const left = Math.min(window.innerWidth - bw - 12, Math.max(12, r.left + r.width / 2 - bw / 2));
  Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` });
}
