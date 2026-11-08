// UI controller: owns the GameState, dispatches actions through the reducer, drives AI seats,
// manages hot-seat hand-offs, persistence, settings, and renders every overlay view.
import { createGame } from '../core/state.js';
import { tryReduce } from '../core/reducer.js';
import { pendingActors, getPlayer } from '../core/selectors.js';
import { PHASES } from '../core/constants.js';
import { botAction } from '../ai/simpleBot.js';
import { mulberry } from '../ai/simulate.js';
import { t, setLang, getLang } from '../i18n/index.js';
import { formatLog } from '../i18n/format.js';
import { sound, soundForLog } from '../audio/sound.js';
import { mount } from './dom.js';
import { advanceTutorial, eventForAction, tutorialVisible, DONE } from './tutorial.js';
import { renderTutorial, positionTutorial } from './views/tutorial.js';
import { renderTopbar, renderLog, renderPhase, renderColony } from './views/hud.js';
import { resetTicker } from './ticker.js';
import { renderPlayerPanel } from './views/player.js';
import { renderLocationPanel } from './views/location.js';
import {
  setupScreen, settingsModal, passScreen, draftModal, crossroadsModal, requestModal,
  incomingRequestModal, voteModal, gameOverModal, toastLayer, colonyModal, voteResultModal, callVoteModal, confirmEndModal, pickModal,
} from './views/modals.js';
import { currentActor as actorOf, whoMustHold } from './seat.js';
import { moveTargets, lureTargets, actingSurvivors } from './options.js';
import { crossChoice, c } from '../i18n/index.js';

const SAVE_KEY = 'frostbound.save.v1';
const SETTINGS_KEY = 'frostbound.settings.v1';
const AI_DELAY = 0.55; // seconds between AI actions (after animations settle)
const TOAST_KEYS = new Set(['death', 'infectionSpreads', 'crisisResolved', 'overrun', 'exiled', 'starvation']);

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode etc. */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

const defaultSeats = () => Array.from({ length: 5 }, (_, i) => ({ name: t('setup.defaultName', { n: i + 1 }), isAI: i >= 2 }));

export function createApp({ dom, pieces, diceTray, board, art, fx = {}, aiFast = false }) {
  const settings = storage.get(SETTINGS_KEY) ?? {};
  setLang(settings.lang ?? (navigator.language?.startsWith('th') ? 'th' : 'en'));
  sound.enabled = settings.sound ?? true;

  let state = null;
  let seat = null; // the human currently holding the device (hot seat)
  let aiTimer = 0;
  let busyWait = 0;
  let queueTimer = 0;
  let modalKey = null;
  let aiRandom = mulberry(Date.now() >>> 0);
  let toasts = [];
  let lastActive = null;
  const ui = {
    setup: { count: 3, seats: defaultSeats(), scenarioId: 'beacon', betrayer: 'maybe' },
    modal: null, selSurvivor: null, selDie: null, selCard: null, selLoc: null, lureTo: null,
    queue: [], // public reveal modals waiting to be shown: { type: 'colony' | 'vote', report }
    useFuel: false, logOpen: typeof window !== 'undefined' ? window.innerWidth > 900 : true, crisisOpen: false, peek: false, draftPicks: [], req: null,
    sound: sound.enabled,
    tutorial: settings.tutorial ?? !settings.tutorialDone,
    tutStep: DONE,
    ppCollapsed: false,
    picking: null, // { type: 'lure', survivorId, dieIndex } while choosing a destination on the board
    skipEndConfirm: false,
  };
  let tutPlayer = null; // the human the first-round tutorial follows

  // ---------------------------------------------------------------- derived

  const humans = () => (state ? state.players.filter((p) => !p.isAI) : []);

  const currentActor = () => actorOf(state);

  function viewerId() {
    const hs = humans();
    if (!hs.length) return null;
    if (hs.length === 1) return hs[0].id;
    return seat;
  }

  /** Human who must take the device now (active player, a voter, or someone asked for an item). */
  const needsPass = () => whoMustHold(state, { seat });

  function ctx() {
    const actor = currentActor();
    const viewer = viewerId();
    return {
      state, ui, actor, viewer, art,
      canAct: !!viewer && viewer === actor && state?.phase === PHASES.TURN && !needsPass(),
      hasSave: !!storage.get(SAVE_KEY)?.state,
      set, dispatch, dismissQueue, tutorialEvent, setTutorial, sfx: (name, delay) => sound.play(name, delay), selectSurvivor, selectLocation, takeSeat, startGame, continueGame, quitToSetup, setLanguage, setSound,
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
    const before = state.log.length;
    state = res.state;
    for (const e of state.log.slice(before)) onLogEntry(e);
    for (const q of ui.queue) if (q.type === 'colony' && q.morale == null) q.morale = state.morale;
    answerAiRequests();
    const tev = action.playerId === tutPlayer ? eventForAction(action) : null;
    if (tev) ui.tutStep = advanceTutorial(ui.tutStep, tev);
    afterChange();
    return true;
  }

  function onLogEntry(e) {
    sound.play(soundForLog(e));
    if (e.k === 'exposure') fx.exposure?.(e.survivorId, e.face);
    if (e.k === 'crisisResolved' && state.reports.colony) ui.queue.push({ type: 'colony', report: structuredClone(state.reports.colony), morale: null });
    if (e.k === 'voteResult' && state.reports.vote) ui.queue.push({ type: 'vote', report: structuredClone(state.reports.vote) });
    if (e.k === 'crossroadsChoice' && getPlayer(state, e.playerId).isAI) {
      toast(t('cross.aiChose', { player: getPlayer(state, e.playerId).name, card: c('crossroads', e.cardId, 'title'), choice: crossChoice(e.cardId, e.choice) }));
    }
    if (TOAST_KEYS.has(e.k) && e.k !== 'crisisResolved') {
      const text = formatLog(e, state);
      if (text) toast(text, 'bad', { survivorId: e.survivorId ?? (e.k === 'infectionSpreads' ? e.to : null) });
    }
  }

  function answerAiRequests() {
    for (let i = 0; i < 10; i++) {
      const req = state.requests.find((r) => getPlayer(state, r.to).isAI);
      if (!req) return;
      const action = botAction(state, req.to, { random: aiRandom });
      const res = tryReduce(state, action?.type === 'RESPOND_REQUEST' ? action : { type: 'RESPOND_REQUEST', playerId: req.to, requestId: req.id, cardUid: null });
      if (!res.ok) return;
      state = res.state;
    }
  }

  function afterChange({ animate = true } = {}) {
    if (!animate) resetTicker(); // a new or loaded game: its numbers are not changes
    // AI seats draft instantly (nothing to watch).
    for (let i = 0; i < 10 && state.phase === PHASES.DRAFT; i++) {
      const a = currentActor();
      if (!a || !getPlayer(state, a).isAI) break;
      const res = tryReduce(state, botAction(state, a, { random: aiRandom }));
      if (!res.ok) break;
      state = res.state;
    }
    if (state.activePlayerId !== lastActive) {
      lastActive = state.activePlayerId;
      Object.assign(ui, { selSurvivor: null, selDie: null, selCard: null, useFuel: false, lureTo: null, picking: null });
    }
    if (ui.picking && (!state.survivors[ui.picking.survivorId]?.alive || state.phase !== PHASES.TURN)) ui.picking = null;
    // Drop stale selections.
    const v = viewerId();
    const me = v ? getPlayer(state, v) : null;
    if (ui.selSurvivor && !state.survivors[ui.selSurvivor]?.alive) ui.selSurvivor = null;
    if (ui.selCard && !me?.hand.includes(ui.selCard)) ui.selCard = null;
    if (ui.selDie != null && me?.dice[ui.selDie]?.used) ui.selDie = null;
    pieces.sync(state, { animate });
    pieces.setHighlight?.(ui.selSurvivor);
    storage.set(SAVE_KEY, { state, seat });
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
    if (id && window.innerWidth <= 760) ui.ppCollapsed = true; // phones: give the location sheet the room
    board.setSelected(ui.selLoc);
    pieces.setHighlight?.(id);
    render();
  }

  function selectLocation(id) {
    ui.selLoc = id;
    if (id) tutorialEvent('selectLocation');
    // Phones: fold the player panel so the location sheet (and its actions) get the screen.
    if (id && window.innerWidth <= 760) ui.ppCollapsed = true;
    board.setSelected(id);
    render();
  }

  function takeSeat(playerId) {
    seat = playerId;
    Object.assign(ui, { selSurvivor: null, selDie: null, selCard: null, peek: false, draftPicks: [] });
    storage.set(SAVE_KEY, { state, seat });
    render();
  }

  function startGame() {
    const cfg = ui.setup;
    state = createGame({
      players: cfg.seats.slice(0, cfg.count).map((s, i) => ({ name: s.name.trim() || t('setup.defaultName', { n: i + 1 }), isAI: s.isAI })),
      scenarioId: cfg.scenarioId, betrayer: cfg.betrayer, seed: cfg.seed ?? Date.now(),
    });
    aiRandom = mulberry((cfg.seed ?? Date.now()) >>> 0);
    seat = null;
    lastActive = null;
    Object.assign(ui, { modal: null, selLoc: null, queue: [] });
    tutPlayer = state.players.find((p) => !p.isAI)?.id ?? null;
    ui.tutStep = ui.tutorial && tutPlayer ? 0 : DONE;
    sound.unlock();
    sound.play('start');
    sound.setAmbient(true);
    afterChange({ animate: false });
  }

  function continueGame() {
    const save = storage.get(SAVE_KEY);
    if (!save?.state) return;
    state = save.state;
    seat = save.seat ?? null;
    lastActive = null;
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
    Object.assign(ui, { modal: null, selLoc: null, selSurvivor: null, queue: [] });
    board.setSelected(null);
    render();
  }

  function setLanguage(lang) {
    setLang(lang);
    saveSettings();
    // Default seat names follow the language until edited.
    ui.setup.seats = ui.setup.seats.map((s, i) => (/^(Player|ผู้เล่น) \d$/.test(s.name) ? { ...s, name: t('setup.defaultName', { n: i + 1 }) } : s));
    render();
  }

  function setSound(on) {
    sound.setEnabled(on);
    ui.sound = on;
    saveSettings();
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
    if (!state || ui.modal === 'settings') return;
    if (ui.queue.length) {
      // Reveal modals pause the game. With no humans at the table they dismiss themselves.
      if (!humans().length && (queueTimer += dt) > 6) { queueTimer = 0; dismissQueue(); }
      return;
    }
    if (state.phase === PHASES.GAME_OVER) return;
    const actor = currentActor();
    if (!actor || !getPlayer(state, actor).isAI) { aiTimer = 0; return; }
    if (!aiFast) {
      // Let the table see each AI action land before the next one.
      // Wait for animations, but never forever: after 5 s the AI plays on regardless.
      if ((pieces.busy || diceTray.busy || diceTray.exposureBusy) && (busyWait += dt) < 5) { aiTimer = 0; return; }
      busyWait = 0;
      aiTimer += dt;
      if (aiTimer < AI_DELAY) return;
    }
    aiTimer = 0;
    const action = botAction(state, actor, { random: aiRandom });
    if (!action || !dispatch(action)) {
      // A bot should never get stuck; fall back to ending its turn.
      if (state.phase === PHASES.TURN) dispatch({ type: 'END_TURN', playerId: actor });
    }
  }

  // ---------------------------------------------------------------- render

  function render() {
    const x = ctx();
    document.body.classList.toggle('in-game', !!state);
    if (!state) {
      for (const el of [dom.topbar, dom.log, dom.loc, dom.phase, dom.colony]) if (el) mount(el);
      dom.player.classList.add('hidden');
      dom.loc.classList.add('hidden');
      mount(dom.modal, ui.modal === 'settings' ? settingsModal(x) : setupScreen(x));
      renderTutorial(dom.tutorial, x, DONE, false);
      return;
    }
    dom.player.classList.remove('hidden');
    // While the device is being handed over, nothing private may be visible underneath.
    document.body.classList.toggle('passing', !!needsPass());
    document.body.classList.toggle('pp-collapsed', !!ui.ppCollapsed);
    renderTopbar(dom.topbar, x);
    if (dom.phase) renderPhase(dom.phase, x);
    if (dom.colony) {
      renderColony(dom.colony, x);
      document.documentElement.style.setProperty('--colony-h', `${dom.colony.offsetHeight}px`);
    }
    renderLog(dom.log, x);
    renderLocationPanel(dom.loc, x);
    renderPlayerPanel(dom.playerRefs, x);
    const shown = x.viewer ? getPlayer(state, x.viewer) : getPlayer(state, state.activePlayerId ?? state.players[0].id);
    if (shown && state.phase !== PHASES.DRAFT) diceTray.sync(shown.dice, `${shown.id}:${state.round}`);
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
    const me = x.canAct ? x.viewer : null;
    let hints = {};
    if (me && ui.picking?.type === 'lure') {
      for (const tg of lureTargets(state, me, ui.picking.survivorId, ui.picking.dieIndex)) hints[tg.to] = tg.ok ? 'lure' : 'blocked';
    } else if (me && ui.selSurvivor && state.survivors[ui.selSurvivor]?.owner === me && !state.survivors[ui.selSurvivor].moved) {
      hints = moveTargets(state, me, ui.selSurvivor);
    }
    board.setHints?.(hints);
    pieces.setActing?.(me ? actingSurvivors(state, me) : []);
    const tutVisible = ui.tutStep < DONE && tutorialVisible(ui.tutStep, {
      canAct: x.canAct && x.viewer === tutPlayer && !build,
      colonyShowing: ui.queue[0]?.type === 'colony',
    });
    renderTutorial(dom.tutorial, x, ui.tutStep, tutVisible);
    dom.onRender?.(state);
  }

  /** Which modal to show: [stableKey | null, builder]. A stable key means "don't re-mount while unchanged". */
  function modalFor(x) {
    if (ui.modal === 'settings') return [null, () => settingsModal(x)];
    const q = ui.queue[0];
    if (q?.type === 'colony') return [`colony:${q.report.round}:${getLangKey()}`, () => colonyModal(x, q)];
    if (q?.type === 'vote') return [`vote:${state.log.length}:${getLangKey()}`, () => voteResultModal(x, q.report)];
    if (state.phase === PHASES.GAME_OVER) return [null, () => gameOverModal(x)];
    const pass = needsPass();
    if (pass) return [null, () => passScreen(x, pass)];
    const incoming = x.viewer && state.requests.find((r) => r.to === x.viewer);
    if (incoming) return [null, () => incomingRequestModal(x, incoming)];
    if (state.phase === PHASES.DRAFT && x.viewer === x.actor && x.viewer) return [null, () => draftModal(x)];
    if (state.phase === PHASES.CROSSROADS && x.viewer === x.actor && x.viewer) {
      return [`cross:${state.pendingCrossroads.cardId}:${state.round}:${state.activePlayerId}:${getLangKey()}`, () => crossroadsModal(x)];
    }
    if (state.phase === PHASES.VOTE && x.viewer && pendingActors(state).includes(x.viewer)) return [null, () => voteModal(x)];
    const picker = x.canAct && getPlayer(state, x.viewer)?.pick;
    if (picker) return [null, () => pickModal(x, picker)];
    if (ui.modal === 'request' && x.canAct) return [null, () => requestModal(x)];
    if (ui.modal === 'callVote' && x.canAct) return [null, () => callVoteModal(x)];
    if (ui.modal === 'confirmEnd' && x.canAct) return [null, () => confirmEndModal(x)];
    return [null, null];
  }

  const getLangKey = () => getLang();

  /** Board clicks: a survivor of the viewer selects it; anything else selects the location. */
  function onBoardPick({ locationId, survivorId }) {
    if (!state) return;
    // Lure: the clicked location is the destination.
    if (ui.picking?.type === 'lure' && locationId) {
      const me = viewerId();
      const tg = lureTargets(state, me, ui.picking.survivorId, ui.picking.dieIndex).find((x) => x.to === locationId);
      if (tg?.ok && dispatch(tg.action)) { ui.picking = null; render(); }
      return;
    }
    const sv = survivorId && state.survivors[survivorId];
    if (sv && sv.owner === viewerId()) selectSurvivor(survivorId);
    else selectLocation(locationId ?? sv?.location ?? null);
  }

  /** Quick start for testing/screenshots, e.g. seats "HHA". */
  function quickStart({ seats = 'HA', scenarioId = 'beacon', seed = 1, lang }) {
    if (lang) setLang(lang);
    ui.setup = {
      count: seats.length,
      seats: [...seats].map((ch, i) => ({ name: ['Ana', 'Ben', 'Chai', 'Dara', 'Eve'][i], isAI: ch.toUpperCase() === 'A' })),
      scenarioId, betrayer: 'maybe', seed,
    };
    startGame();
  }

  /** Replace the whole game state (debugging, tests, future network sync). */
  function loadState(next, nextSeat = seat) {
    state = next;
    seat = nextSeat;
    lastActive = null;
    afterChange({ animate: false });
  }

  // Esc closes the top-most thing: popover, picking mode, card sheet, dialog, then the location panel.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !state) return;
    if (ui.crisisOpen) set({ crisisOpen: false });
    else if (ui.picking) set({ picking: null });
    else if (ui.selCard) set({ selCard: null });
    else if (ui.modal) set({ modal: null });
    else if (ui.selLoc) selectLocation(null);
  });
  // Clicking anywhere outside the crisis popover closes it.
  document.addEventListener('click', (ev) => {
    if (ui.crisisOpen && !ev.target.closest?.('.crisis-pop, .stat-block.crisis')) set({ crisisOpen: false });
  });

  render();
  return { loadState, set, tutorialEvent, continueGame, tick, render, onBoardPick, quickStart, dispatch, get state() { return state; }, get ui() { return ui; }, takeSeat, selectSurvivor, selectLocation };
}
