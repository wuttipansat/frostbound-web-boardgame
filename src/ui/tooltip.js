// One shared tooltip for every element with data-tip. Works with the mouse (hover), the keyboard
// (focus) and touch (tap to show, tap elsewhere to hide) — unlike the browser's title= tooltips.
let tipEl = null;
let current = null;

function show(target) {
  const text = target?.dataset.tip;
  if (!text) return hide();
  current = target;
  tipEl.textContent = text;
  tipEl.classList.add('on');
  const r = target.getBoundingClientRect();
  const tw = tipEl.offsetWidth;
  const th = tipEl.offsetHeight;
  const above = r.top - th - 10 > 8;
  const top = above ? r.top - th - 8 : r.bottom + 8;
  const left = Math.min(window.innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2));
  tipEl.style.left = `${left}px`;
  tipEl.style.top = `${top}px`;
}

function hide() {
  current = null;
  tipEl?.classList.remove('on');
}

export function installTooltips() {
  if (tipEl) return;
  tipEl = document.createElement('div');
  tipEl.id = 'tip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);
  const find = (el) => el?.closest?.('[data-tip]');
  document.addEventListener('pointerover', (ev) => { if (ev.pointerType === 'mouse') show(find(ev.target)); });
  document.addEventListener('pointerout', (ev) => { if (ev.pointerType === 'mouse' && find(ev.target) === current && !find(ev.relatedTarget)) hide(); });
  document.addEventListener('focusin', (ev) => show(find(ev.target)));
  document.addEventListener('focusout', hide);
  // Touch: a tap shows the tip of what was tapped (disabled buttons included); tapping elsewhere hides it.
  document.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return;
    const el = find(ev.target);
    if (el && el !== current) show(el); else hide();
  }, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); });
}
