// UI controller (solo game): owns the GameState, dispatches actions through the reducer,
// persistence, settings, and renders every overlay view.
import { createGame } from '../core/state.js';
import { tryReduce } from '../core/reducer.js';
import { PHASES } from '../core/constants.js';
import { t, c, setLang, getLang } from '../i18n/index.js';
import { itemOf, mapOf } from '../core/selectors.js';
import { formatLog } from '../i18n/format.js';
import { sound, soundForLog } from '../audio/sound.js';
import { mount } from './dom.js';
import { advanceTutorial, eventForAction, tutorialVisible, DONE } from './tutorial.js';
import { renderTutorial, positionTutorial } from './views/tutorial.js';
import { renderTopbar, renderLog, renderPhase } from './views/hud.js';
import { resetTicker } from './ticker.js';
import { renderPlayerPanel } from './views/player.js';
import { renderLocationPanel } from './views/location.js';
import { renderRadial, ringSurvivor } from './views/radial.js';
import { renderHint, rulesModal } from './views/help.js';
import { createDirector, eventsFromLog } from './director.js';
import {
  setupScreen, settingsModal, draftModal, crossroadsModal, gameOverModal, toastLayer, colonyModal,
  confirmEndModal, pickModal, crossResultModal,
} from './views/modals.js';
import { lureTargets, actingSurvivors, allItems } from './options.js';

/** Log entries added since `prev` (the log is capped at RULES.MAX_LOG, so it may have shifted). */
export function newLogEntries(prev, next) {
  if (!prev?.length) return next.slice();
  const last = JSON.stringify(prev.at(-1));
  if (next.length >= prev.length && JSON.stringify(next[prev.length - 1]) === last) return next.slice(prev.length);
  for (let i = next.length - 1; i >= 0; i--) if (JSON.stringify(next[i]) === last) return next.slice(i + 1);
  return [];
}

const SAVE_KEY = 'frostbound.save.v3'; // v3: solo game (older saves are multiplayer)
const SETTINGS_KEY = 'frostbound.settings.v1';
const TOAST_KEYS = new Set(['death', 'infectionSpreads', 'crisisResolved', 'overrun', 'starvation']);

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode etc. */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

export function createApp({ dom, pieces, board, art, fx = {}, scene = {}, sceneScale = 1, graphics = null }) {
  const settings = storage.get(SETTINGS_KEY) ?? {};
  setLang(settings.lang ?? (navigator.language?.startsWith('th') ? 'th' : 'en'));
  sound.enabled = settings.sound ?? true;

  let state = null;
  let modalKey = null;
  let toasts = [];
  const ui = {
    setup: { scenarioId: 'crawler' },
    modal: null, selSurvivor: null, selCard: null, selLoc: null, lureTo: null,
    queue: [], // public reveal modals waiting to be shown: { type: 'colony' | 'vote', report }
    useFuel: false, logOpen: false, logTab: 'log', crisisOpen: false, draftPicks: [], // logOpen pins the log history open (the feed itself always shows)
    sound: sound.enabled,
    tutorial: settings.tutorial ?? !settings.tutorialDone,
    tutStep: DONE,
    picking: null, // { type: 'lure', survivorId } while choosing a destination on the board
    skipEndConfirm: false,
    moreOpen: false, // the "more actions" menu next to End turn
    // Hand shown as compact faces (remembered per device); phones and short screens start compact.
    hints: settings.hints ?? true, // step 18: next-move hint bar
    cameraFollow: settings.cameraFollow === 'off' ? 'off' : 'all', // step 15: the camera follows each move
    playSpeed: settings.playSpeed ?? 'normal',
    graphics: graphics?.mode ?? settings.graphics ?? 'auto', // step 22: auto | high | saver
    movePick: null, // location whose "who goes there" picker is open
    handCompact: true, // UI-5: the items list starts folded into its button
  };
  // Step 15: what happened plays out one scene at a time (camera, effect, callout).
  const director = createDirector({
    camera: scene.camera ?? null,
    play: (ev) => scene.play?.(ev, state),
    settings: () => ({ follow: ui.cameraFollow, speed: ui.playSpeed, scale: sceneScale }),
    onChange: () => { document.body.classList.toggle('watching', director.watching); if (state) render(); },
  });
  const present = (entries) => { if (state && entries.length) director.push(eventsFromLog(entries, state)); };

  function ctx() {
    return {
      state, ui, art,
      canAct: state?.phase === PHASES.TURN,
      hasSave: !!storage.get(SAVE_KEY)?.state,
      set, dispatch, dismissQueue, tutorialEvent, setTutorial, sfx: (name, delay) => sound.play(name, delay), selectSurvivor, selectLocation, startGame, continueGame, quitToSetup, setLanguage, setSound,
      setPresentation,
      setGraphics: (mode) => { ui.graphics = mode; saveSettings({ graphics: mode }); graphics?.setMode(mode); render(); },
      setHints: (on) => { ui.hints = on; saveSettings({ hints: on }); render(); },
      watching: director.watching,
      setHandCompact: (on) => { ui.handCompact = on; saveSettings({ handCompact: on }); render(); },
    };
  }

  // ---------------------------------------------------------------- state changes

  let lastBaseKey = null;
  let lastMapKey = null;
  function set(patch) {
    Object.assign(ui, patch);
    render();
  }

  function saveSettings(extra = {}) {
    const prev = storage.get(SETTINGS_KEY) ?? {};
    storage.set(SETTINGS_KEY, { ...prev, lang: getLang(), sound: ui.sound, tutorial: ui.tutorial, ...extra });
  }

  function tutorialEvent(event) {
    if (ui.tutStep >= DONE) return;
    const before = ui.tutStep;
    ui.tutStep = advanceTutorial(ui.tutStep, event);
    if (ui.tutStep >= DONE && before < DONE) {
      // Finished (or skipped): don't offer it again by default.
      ui.tutorial = false;
      saveSettings({ tutorialDone: true, tutorial: false });
    }
    if (ui.tutStep !== before) render();
  }

  function dispatch(action) {
    const res = tryReduce(state, action);
    if (!res.ok) {
      toast(t(`err.${res.error}`) === `err.${res.error}` ? t('err.unknown') : t(`err.${res.error}`), 'bad');
      sound.play('error');
      return false;
    }
    const prevLog = state.log;
    ui.crossFocus = state.pendingCrossroads?.focusSurvivorId ?? null;
    const packBefore = action.survivorId ? state.survivors[action.survivorId]?.pack ?? [] : [];
    state = res.state;
    // UI-6: say what a search found.
    if (action.type === 'SEARCH') {
      const got = (state.survivors[action.survivorId]?.pack ?? []).filter((u) => !packBefore.includes(u)).map((u) => c('items', itemOf(state, u)?.id, 'name'));
      toast(got.length ? t('toast.found', { items: got.join(', ') }) : t('toast.foundNone'), got.length ? 'good' : '');
    }
    const added = newLogEntries(prevLog, state.log);
    // MAP-1: a city map turned up / the city grew.
    if (added.some((e) => e.k === 'mapFound')) toast(t('toast.mapFound'), 'good');
    const grown = added.find((e) => e.k === 'mapGrown');
    if (grown) toast(t('toast.mapGrown', { n: grown.places?.length ?? 0 }), 'good');
    for (const e of added.filter((x) => x.k === 'setComplete')) toast(t('toast.setComplete', { set: t(`set.${e.setId}`) }), 'good'); // GAME-1
    for (const e of added) onLogEntry(e);
    present(added);
    for (const q of ui.queue) if (q.type === 'colony' && q.morale == null) q.morale = state.morale;
    const tev = eventForAction(action);
    if (tev) ui.tutStep = advanceTutorial(ui.tutStep, tev);
    afterChange();
    return true;
  }

  function onLogEntry(e) {
    sound.play(soundForLog(e));
    if (e.k === 'crisisResolved' && state.reports.colony) ui.queue.push({ type: 'colony', report: structuredClone(state.reports.colony), morale: null, day: e.r });
    // What was chosen and what it did (the choice buttons only show the words).
    if (e.k === 'roundStart' && e.day <= 3 && ui.hints !== false) ui.pendingTip = t(`tut.day${e.day}`); // UI-7: shown once nothing else is up
    if (e.k === 'crossroadsChoice') ui.queue.push({ type: 'cross', cardId: e.cardId, choice: e.choice, focus: ui.crossFocus });
    if (TOAST_KEYS.has(e.k) && e.k !== 'crisisResolved') {
      const text = formatLog(e, state);
      if (text) toast(text, 'bad', { survivorId: e.survivorId ?? (e.k === 'infectionSpreads' ? e.to : null) });
    }
  }

  function afterChange({ animate = true } = {}) {
    if (!animate) { resetTicker(); director.clear(); } // a new or loaded game: its numbers are not changes
    if (ui.picking && (!state.survivors[ui.picking.survivorId]?.alive || state.phase !== PHASES.TURN)) ui.picking = null;
    // Drop stale selections.
    if (ui.selSurvivor && !state.survivors[ui.selSurvivor]?.alive) ui.selSurvivor = null;
    if (ui.selCard && !allItems(state).includes(ui.selCard)) ui.selCard = null;
    pieces.sync(state, { animate });
    pieces.setHighlight?.(ui.selSurvivor);
    storage.set(SAVE_KEY, { state });
    render();
  }

  function toast(text, kind = '', { survivorId = null } = {}) {
    toasts.push({ text, kind, ttl: kind === 'tip' ? 7 : 3.6, face: survivorId && art ? art.portrait(survivorId, 's', { cls: kind === 'bad' ? 'toast-face' : 'toast-face' }) : null });
    if (toasts.length > 4) toasts.shift();
    toastLayer(dom.toasts, toasts);
  }

  // ---------------------------------------------------------------- actions from views

  function dismissQueue() {
    const was = ui.queue.shift();
    if (was?.type === 'colony') tutorialEvent('colonyDone');
    render();
  }

  function selectSurvivor(id) {
    ui.selSurvivor = id;
    ui.picking = null;
    if (id) tutorialEvent('selectSurvivor');
    if (id) ui.selLoc = state.survivors[id].location;
    board.setSelected(ui.selLoc);
    pieces.setHighlight?.(id);
    render();
  }

  function selectLocation(id) {
    if (id !== ui.movePick) ui.movePick = null;
    ui.selLoc = id;
    if (id) tutorialEvent('selectLocation');
    board.setSelected(id);
    render();
  }

  function startGame() {
    const cfg = ui.setup;
    state = createGame({ scenarioId: cfg.scenarioId, difficulty: cfg.difficulty ?? 'normal', seed: cfg.seed ?? Date.now() });
    Object.assign(ui, { modal: null, selLoc: null, queue: [], draftPicks: [] });
    ui.tutStep = ui.tutorial ? 0 : DONE;
    sound.unlock();
    sound.play('start');
    sound.setAmbient(true);
    afterChange({ animate: false });
  }

  function continueGame() {
    const save = storage.get(SAVE_KEY);
    if (!save?.state) return;
    state = save.state;
    ui.modal = null;
    ui.queue = [];
    ui.tutStep = DONE; // a resumed game skips the tutorial
    sound.setAmbient(true);
    afterChange({ animate: false });
  }

  function quitToSetup() {
    sound.setAmbient(false);
    if (state?.phase === PHASES.GAME_OVER) storage.del(SAVE_KEY);
    state = null;
    director.clear();
    Object.assign(ui, { modal: null, selLoc: null, selSurvivor: null, queue: [], movePick: null });
    board.setSelected(null);
    render();
  }

  function setLanguage(lang) {
    setLang(lang);
    saveSettings();
    render();
  }

  function setSound(on) {
    sound.setEnabled(on);
    ui.sound = on;
    saveSettings();
    render();
  }

  function setPresentation(patch) {
    Object.assign(ui, patch);
    saveSettings({ cameraFollow: ui.cameraFollow, playSpeed: ui.playSpeed });
    render();
  }

  function setTutorial(on) {
    ui.tutorial = on;
    saveSettings();
    render();
  }

  // ---------------------------------------------------------------- per-frame

  function tick(dt) {
    positionTutorial(dom.tutorial);
    if (toasts.length) {
      const n = toasts.length;
      toasts = toasts.filter((x) => (x.ttl -= dt) > 0);
      if (toasts.length !== n) toastLayer(dom.toasts, toasts);
    }
  }

  // ---------------------------------------------------------------- render

  function render() {
    const x = ctx();
    document.body.classList.toggle('in-game', !!state);
    if (!state) {
      for (const el of [dom.topbar, dom.log, dom.loc, dom.phase, dom.playerRefs.survivors]) if (el) mount(el);
      dom.player.classList.add('hidden');
      dom.loc.classList.add('hidden');
      mount(dom.modal, ui.modal === 'settings' ? settingsModal(x) : setupScreen(x));
      renderTutorial(dom.tutorial, x, DONE, false);
      return;
    }
    dom.player.classList.remove('hidden');
    // While drafting, the draft cards own the screen (no HUD underneath).
    document.body.classList.toggle('drafting', state.phase === PHASES.DRAFT);
    // UI-4: there is always someone to act for when it's your turn.
    if (x.canAct && !(ui.selSurvivor && state.survivors[ui.selSurvivor]?.alive)) ui.selSurvivor = ringSurvivor(state, ui);
    renderTopbar(dom.topbar, x);
    if (dom.phase) renderPhase(dom.phase, x);
    renderLog(dom.log, x);
    renderLocationPanel(dom.loc, x);
    if (dom.movePick) dom.movePick.classList.add('hidden');
    if (dom.radial) renderRadial(dom.radial, x);
    if (dom.hint) renderHint(dom.hint, { ...x, ui: { ...ui, hints: ui.hints && ui.tutStep >= DONE } });
    renderPlayerPanel(dom.playerRefs, x);
    // Animated reveal modals keep their DOM while they stay on screen, so the animation isn't restarted.
    const [key, build] = modalFor(x);
    if (!key || key !== modalKey) {
      const prevFocus = document.activeElement;
      mount(dom.modal, build ? build() : null);
      // Move keyboard focus into a newly shown dialog (pass screen, confirmations…).
      const target = dom.modal.querySelector('[data-autofocus]') ?? dom.modal.querySelector('.dialog .btn.primary:not([disabled])');
      if (build && target && (!dom.modal.contains(prevFocus) || key !== modalKey)) target.focus({ preventScroll: true });
    }
    modalKey = key;
    // MAP-1: the city grows a stage at a time (snap on a new or loaded game, pop in when a map is read).
    const map = state ? mapOf(state) : null;
    const mapKey = map ? `${map.stage}:${Object.keys(map.blocks).join(';')}` : '';
    if (map && mapKey !== lastMapKey) {
      board.setMap?.(map, { snap: lastMapKey === null || map.stage <= +lastMapKey.split(':')[0] });
      lastMapKey = mapKey;
    }
    // MAP-3: base upgrades show in the colony (snap on the first show, pop in on an upgrade).
    if (state) {
      const baseKey = JSON.stringify(state.base ?? {});
      if (baseKey !== lastBaseKey) { board.setBase?.(state.base ?? {}, { snap: lastBaseKey === null }); lastBaseKey = baseKey; }
    }
    pieces.setActing?.(x.canAct ? actingSurvivors(state) : []);
    const tutVisible = ui.tutStep < DONE && tutorialVisible(ui.tutStep, {
      canAct: x.canAct && !build,
      colonyShowing: ui.queue[0]?.type === 'colony',
    });
    renderTutorial(dom.tutorial, x, ui.tutStep, tutVisible);
    if (ui.pendingTip && state?.phase === PHASES.TURN && !key && !tutVisible && !ui.queue.length) {
      if (ui.tutStep >= DONE) toast(ui.pendingTip, 'tip');
      ui.pendingTip = null;
    }
    dom.onRender?.(state);
  }

  /** Which modal to show: [stableKey | null, builder]. A stable key means "don't re-mount while unchanged". */
  function modalFor(x) {
    if (ui.modal === 'settings') return [null, () => settingsModal(x)];
    if (ui.modal === 'rules') return [`rules:${getLangKey()}`, () => rulesModal(x)];
    const q = ui.queue[0];
    if (q?.type === 'colony') return [`colony:${q.report.day}:${getLangKey()}`, () => colonyModal(x, q)];
    if (q?.type === 'cross') return [`cross:${state.log.length}:${q.cardId}:${getLangKey()}`, () => crossResultModal(x, q)];
    if (state.phase === PHASES.GAME_OVER) return [null, () => gameOverModal(x)];
    if (state.phase === PHASES.DRAFT) return [`draft:${(ui.draftPicks ?? []).join()}:${getLangKey()}`, () => draftModal(x)];
    if (state.phase === PHASES.CROSSROADS) {
      return [`cross:${state.pendingCrossroads.cardId}:${state.day}:${getLangKey()}`, () => crossroadsModal(x)];
    }
    const picker = x.canAct && state.team.pick;
    if (picker) return [null, () => pickModal(x, picker)];
    if (ui.modal === 'confirmEnd' && x.canAct) return [null, () => confirmEndModal(x)];
    return [null, null];
  }

  const getLangKey = () => getLang();

  /** Board clicks: a survivor of the viewer selects it; anything else selects the location. */
  function onBoardPick({ locationId, survivorId }) {
    if (!state) return;
    // Someone else's move is playing: a click on the board skips it.
    if (director.watching) { director.skip(); return; }
    // Lure: the clicked location is the destination.
    if (ui.picking?.type === 'lure' && locationId) {
      const tg = lureTargets(state, ui.picking.survivorId).find((x) => x.to === locationId);
      if (tg?.ok && dispatch(tg.action)) { ui.picking = null; render(); }
      return;
    }
    const sv = survivorId && state.survivors[survivorId];
    if (sv?.alive) { ui.locInfo = false; selectSurvivor(survivorId); return; }
    const loc = locationId ?? sv?.location ?? null;
    // UI-4: a place opens its ring of round icons; tapping the same place again closes it.
    ui.movePick = null;
    ui.locInfo = false;
    selectLocation(loc && loc === ui.selLoc ? null : loc);
  }

  /** Quick start for testing/screenshots. */
  function quickStart({ scenarioId = 'crawler', seed = 1, lang } = {}) {
    if (lang) setLang(lang);
    ui.setup = { scenarioId, seed };
    startGame();
  }

  /** Replace the whole game state (debugging, tests, future network sync). */
  function loadState(next) {
    state = next;
    afterChange({ animate: false });
  }

  // Esc closes the top-most thing: popover, picking mode, card sheet, dialog, then the location panel.
  window.addEventListener('keydown', (ev) => {
    if (!state) return;
    // Space / Esc skip the scene of someone else's move that is on screen.
    if ((ev.key === ' ' || ev.key === 'Escape') && director.watching && !ev.target.closest?.('input, textarea, button, [role="button"]')) {
      ev.preventDefault(); director.skip(); return;
    }
    if (ev.key !== 'Escape') return;
    if (ui.infoOpen || ui.topMore) set({ infoOpen: false, topMore: false });
    else if (ui.crisisOpen) set({ crisisOpen: false });
    else if (ui.moreOpen) set({ moreOpen: false });
    else if (ui.logOpen) set({ logOpen: false });
    else if (ui.picking) set({ picking: null });
    else if (ui.movePick) set({ movePick: null });
    else if (ui.locInfo) set({ locInfo: false });
    else if (ui.selCard) set({ selCard: null });
    else if (ui.modal) set({ modal: null });
    else if (ui.selLoc) selectLocation(null);
  });
  // Clicking anywhere outside the crisis popover closes it.
  document.addEventListener('click', (ev) => {
    if (ui.crisisOpen && !ev.target.closest?.('.crisis-pop, .stat-block.crisis')) set({ crisisOpen: false });
    if (ui.moreOpen && !ev.target.closest?.('.more-menu, .icon-btn.more')) set({ moreOpen: false });
    if ((ui.infoOpen || ui.topMore) && !ev.target.closest?.('.info-pop, .top-menu, .info-btn, .top-more, .crisis-pop')) set({ infoOpen: false, topMore: false });
  });

  render();

  return {
    get watching() { return director.watching; },
    sceneHold: (on) => director.setHold(on),
    director,
    loadState, set, tutorialEvent, continueGame, tick, render, onBoardPick, quickStart, dispatch, get state() { return state; }, get ui() { return ui; }, selectSurvivor, selectLocation };
}
