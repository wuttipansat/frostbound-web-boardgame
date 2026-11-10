// Hand-drawn SVG icons (no emoji, no icon fonts): dice faces, hearts, stats, actions and UI controls.
// All icons use currentColor so CSS decides their colour.

const S = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const st = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  morale: S(`<path ${st} d="M12 3c1 3 4 4.5 4 8.5A4 4 0 0 1 8 11.5c0-1.5.7-2.6 1.5-3.4C9.7 10 11 10.5 11 9c0-2 .5-4 1-6z"/><path ${st} d="M12 21a6 6 0 0 0 6-6"/>`),
  round: S(`<path ${st} d="M6 3h12M6 21h12M7 3c0 5 10 6 10 9s-10 4-10 9M17 3c0 5-10 6-10 9"/>`),
  food: S(`<rect ${st} x="6" y="5" width="12" height="15" rx="2"/><path ${st} d="M6 9h12M6 16h12"/>`),
  waste: S(`<path ${st} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>`),
  crisis: S(`<path ${st} d="M12 3 2 20h20L12 3z"/><path ${st} d="M12 10v4M12 17v.5"/>`),
  goal: S(`<path ${st} d="M5 21V4M5 4h11l-2 4 2 4H5"/>`),
  log: S(`<path ${st} d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7M7 3a2 2 0 0 0-2 2v2h4M9 8h7M9 12h7M9 16h5"/>`),
  settings: S(`<circle ${st} cx="12" cy="12" r="3"/><path ${st} d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>`),
  lock: S(`<rect ${st} x="5" y="10" width="14" height="10" rx="2"/><path ${st} d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>`),
  request: S(`<path ${st} d="M4 8h13l-3-3M20 16H7l3 3"/>`),
  vote: S(`<path ${st} d="M12 4v16M6 20h12M4 8h16M7 8l-3 6a3 3 0 0 0 6 0L7 8zM17 8l-3 6a3 3 0 0 0 6 0l-3-6z"/>`),
  attack: S(`<path ${st} d="M14 4l6 6-3 3-3-3-8 8-2-2 8-8-3-3 3-1z"/>`),
  search: S(`<circle ${st} cx="10" cy="10" r="6"/><path ${st} d="M15 15l5 5"/>`),
  barricade: S(`<path ${st} d="M5 4v16M19 4v16M3 8h18M3 15h18M6 8l12 7"/>`),
  clean: S(`<path ${st} d="M14 3l-3 9M8 12h7l2 9H6l2-9zM9 16v4M12 16v4M15 16v4"/>`),
  lure: S(`<path ${st} d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0"/>`),
  move: S(`<path ${st} d="M4 12h14M13 6l6 6-6 6"/>`),
  ability: S(`<path ${st} d="M12 3l2.5 6L21 9.5l-5 4.2L17.5 20 12 16.7 6.5 20 8 13.7l-5-4.2L9.5 9z"/>`),
  heal: S(`<path ${st} d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>`),
  exposure: S(`<path ${st} d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path ${st} d="M10 4l2 2 2-2M10 20l2-2 2 2"/>`),
  snowflake: S(`<path ${st} d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/>`),
  skull: S(`<path ${st} d="M12 3a8 8 0 0 0-6 13v3h3v-2h2v2h2v-2h2v2h3v-3a8 8 0 0 0-6-13z"/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><circle cx="15" cy="11" r="1.6" fill="currentColor"/>`),
  star: S(`<path fill="currentColor" d="M12 3l2.5 6L21 9.5l-5 4.2L17.5 20 12 16.7 6.5 20 8 13.7l-5-4.2L9.5 9z"/>`),
  check: S(`<path ${st} d="M5 12l5 5L20 7"/>`),
  more: S(`<circle fill="currentColor" cx="5" cy="12" r="1.8"/><circle fill="currentColor" cx="12" cy="12" r="1.8"/><circle fill="currentColor" cx="19" cy="12" r="1.8"/>`),
  fuel: S(`<path ${st} d="M6 21V6l3-3h6v18zM9 9h6M17 9l3 3v6a1.5 1.5 0 0 1-3 0v-3"/>`),
  target: S(`<circle ${st} cx="12" cy="12" r="7"/><path ${st} d="M12 2v5M12 17v5M2 12h5M17 12h5"/>`),
  close: S(`<path ${st} d="M6 6l12 12M18 6L6 18"/>`),
  sound: S(`<path ${st} d="M4 9h4l5-4v14l-5-4H4z"/><path ${st} d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>`),
  mute: S(`<path ${st} d="M4 9h4l5-4v14l-5-4H4z"/><path ${st} d="M17 9l5 6M22 9l-5 6"/>`),
  left: S(`<path ${st} d="M15 5l-7 7 7 7"/>`),
  right: S(`<path ${st} d="M9 5l7 7-7 7"/>`),
  up: S(`<path ${st} d="M5 15l7-7 7 7"/>`),
  down: S(`<path ${st} d="M5 9l7 7 7-7"/>`),
  person: S(`<circle ${st} cx="12" cy="7" r="3.5"/><path ${st} d="M5 21a7 7 0 0 1 14 0"/>`),
  hourglass: S(`<path ${st} d="M6 3h12M6 21h12M7 3c0 6 10 5 10 9s-10 3-10 9M17 3c0 6-10 5-10 9"/>`),
  door: S(`<path ${st} d="M6 21V4h10v17M4 21h16M13 12h.5"/>`),
  hand: S(`<path ${st} d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 13"/>`),
  dice: S(`<rect ${st} x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="15" r="1.5" fill="currentColor"/>`),
};

/** <span class="icon icon-name"> with an inline SVG. */
export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = `icon icon-${name} ${cls}`.trim();
  span.innerHTML = PATHS[name] ?? '';
  return span;
}

export const ICON_NAMES = Object.keys(PATHS);

// ---------------------------------------------------------------- dice and hearts

export function heart(full = true) {
  const span = document.createElement('span');
  span.className = `heart${full ? '' : ' lost'}`;
  span.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-7-4.6-9.3-9.2C1 8 3.5 4 7.2 4c2 0 3.4 1.1 4.8 2.9C13.4 5.1 14.8 4 16.8 4 20.5 4 23 8 21.3 11.8 19 16.4 12 21 12 21z"/></svg>';
  return span;
}
