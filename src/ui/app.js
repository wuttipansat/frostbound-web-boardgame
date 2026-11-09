// UI controller (solo game): owns the GameState, dispatches actions through the reducer,
// persistence, settings, and renders every overlay view.
import { createGame } from '../core/state.js';
import { tryReduce } from '../core/reducer.js';
import { PHASES } from '../core/constants.js';
import { t, setLang, getLang } from '../i18n/index.js';
import { formatLog } from '../i18n/format.js';
import { sound, soundForLog } from '../audio/sound.js';
import { mount } from './dom.js';
import { advanceTutorial, eventForAction, tutorialVisible, DONE } from './tutorial.js';
import { renderTutorial, positionTutorial } from './views/tutorial.js';
import { renderTopbar, renderLog, renderPhase } from './views/hud.js';
import { resetTicker } from './ticker.js';
import { renderPlayerPanel } from './views/player.js';
import { renderLocationPanel } from './views/location.js';
import { renderMovePicker } from './views/movepick.js';
import { renderHint, rulesModal } from './views/help.js';
import { createDirector, eventsFromLog } from './director.js';
import {
  setupScreen, settingsModal, draftModal, crossroadsModal, gameOverModal, toastLayer, colonyModal,
  confirmEndModal, pickModal, crossResultModal,
} from './views/modals.js';
import { moveTargets, lureTargets, actingSurvivors } from './options.js';

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
    setup: { scenarioId: 'beacon' },
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
    handCompact: settings.handCompact ?? (typeof window !== 'undefined' && (window.innerWidth <= 760 || window.innerHeight <= 800)),
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
    state = res.state;
    const added = newLogEntries(prevLog, state.log);
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
    if (e.k === 'crisisResolved' && state.reports.colony) ui.queue.push({ type: 'colony', report: structuredClone(state.reports.colony), morale: null, round: e.r });
    // What was chosen and what it did (the choice buttons only show the words).
    if (e.k === 'crossroadsChoice') ui.queue.push({ type: 'cross', cardId: e.cardId, choice: e.choice });
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
    if (ui.selCard && !state.team.hand.includes(ui.selCard)) ui.selCard = null;
    pieces.sync(state, { animate });
    pieces.setHighlight?.(ui.selSurvivor);
    storage.set(SAVE_KEY, { state });
    render();
  }

  function toast(text, kind = '', { survivorId = null } = {}) {
    toasts.push({ text, kind, ttl: 3.6, face: survivorId && art ? art.portrait(survivorId, 's', { cls: kind === 'bad' ? 'toast-face' : 'toast-face' }) : null });
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
    state = createGame({ scenarioId: cfg.scenarioId, seed: cfg.seed ?? Date.now() });
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
    renderTopbar(dom.topbar, x);
    if (dom.phase) renderPhase(dom.phase, x);
    renderLog(dom.log, x);
    renderLocationPanel(dom.loc, x);
    if (dom.movePick) renderMovePicker(dom.movePick, x);
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
    // Board hints: survivors that can still act glow; where the selected survivor can go (or lure to) lights up.
    let hints = {};
    if (x.canAct && ui.picking?.type === 'lure') {
      for (const tg of lureTargets(state, ui.picking.survivorId)) hints[tg.to] = tg.ok ? 'lure' : 'blocked';
    } else if (x.canAct && ui.selSurvivor && state.survivors[ui.selSurvivor]?.alive && !state.survivors[ui.selSurvivor].moved) {
      hints = moveTargets(state, ui.selSurvivor);
    }
    board.setHints?.(hints);
    pieces.setActing?.(x.canAct ? actingSurvivors(state) : []);
    const tutVisible = ui.tutStep < DONE && tutorialVisible(ui.tutStep, {
      canAct: x.canAct && !build,
      colonyShowing: ui.queue[0]?.type === 'colony',
    });
    renderTutorial(dom.tutorial, x, ui.tutStep, tutVisible);
    dom.onRender?.(state);
  }

  /** Which modal to show: [stableKey | null, builder]. A stable key means "don't re-mount while unchanged". */
  function modalFor(x) {
    if (ui.modal === 'settings') return [null, () => settingsModal(x)];
    if (ui.modal === 'rules') return [`rules:${getLangKey()}`, () => rulesModal(x)];
    const q = ui.queue[0];
    if (q?.type === 'colony') return [`colony:${q.report.round}:${getLangKey()}`, () => colonyModal(x, q)];
    if (q?.type === 'cross') return [`cross:${state.log.length}:${q.cardId}:${getLangKey()}`, () => crossResultModal(x, q)];
    if (state.phase === PHASES.GAME_OVER) return [null, () => gameOverModal(x)];
    if (state.phase === PHASES.DRAFT) return [`draft:${(ui.draftPicks ?? []).join()}:${getLangKey()}`, () => draftModal(x)];
    if (state.phase === PHASES.CROSSROADS) {
      return [`cross:${state.pendingCrossroads.cardId}:${state.round}:${getLangKey()}`, () => crossroadsModal(x)];
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
    if (sv?.alive) { selectSurvivor(survivorId); return; }
    const loc = locationId ?? sv?.location ?? null;
    // During the turn, a location opens "who goes there" (your survivors as round faces).
    ui.movePick = loc && ctx().canAct ? loc : null;
    selectLocation(loc);
  }

  /** Quick start for testing/screenshots. */
  function quickStart({ scenarioId = 'beacon', seed = 1, lang } = {}) {
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
    if (ui.crisisOpen) set({ crisisOpen: false });
    else if (ui.moreOpen) set({ moreOpen: false });
    else if (ui.logOpen) set({ logOpen: false });
    else if (ui.picking) set({ picking: null });
    else if (ui.movePick) set({ movePick: null });
    else if (ui.selCard) set({ selCard: null });
    else if (ui.modal) set({ modal: null });
    else if (ui.selLoc) selectLocation(null);
  });
  // Clicking anywhere outside the crisis popover closes it.
  document.addEventListener('click', (ev) => {
    if (ui.crisisOpen && !ev.target.closest?.('.crisis-pop, .stat-block.crisis')) set({ crisisOpen: false });
    if (ui.moreOpen && !ev.target.closest?.('.more-menu, .icon-btn.more')) set({ moreOpen: false });
  });

  render();

  return {
    get watching() { return director.watching; },
    sceneHold: (on) => director.setHold(on),
    director,
    loadState, set, tutorialEvent, continueGame, tick, render, onBoardPick, quickStart, dispatch, get state() { return state; }, get ui() { return ui; }, selectSurvivor, selectLocation };
}
