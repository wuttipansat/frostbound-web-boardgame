// Minimal DOM builder: h('div', { class: 'x', onclick }, child, 'text', [more]).
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const ch of children) {
    if (ch == null || ch === false) continue;
    if (Array.isArray(ch)) append(el, ch);
    else el.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
  }
}

export function mount(container, ...children) {
  container.replaceChildren();
  append(container, children);
  return container;
}

export const ITEM_ICON = { food: '🥫', medicine: '💊', fuel: '⛽', tools: '🔧', weapon: '🪓', junk: '⚙️' };
export const DIE_GLYPH = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
