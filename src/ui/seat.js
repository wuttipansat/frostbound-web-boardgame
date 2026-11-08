// Hot-seat: who must be holding the device right now?
import { pendingActors, getPlayer } from '../core/selectors.js';
import { PHASES } from '../core/constants.js';

/** The player who must act next (AI seats draft first). */
export function currentActor(state) {
  if (!state || state.phase === PHASES.GAME_OVER) return null;
  const pending = pendingActors(state);
  if (state.phase === PHASES.DRAFT) return pending.find((id) => getPlayer(state, id).isAI) ?? pending[0] ?? null;
  return pending[0] ?? null;
}

/**
 * The human who should hold the device, or null when no hand-over is needed.
 * A request between two humans is answered right away: the asked player takes the device first.
 */
export function whoMustHold(state, { seat }) {
  if (!state || state.phase === PHASES.GAME_OVER) return null;
  const humans = state.players.filter((p) => !p.isAI);
  if (humans.length < 2) return null;
  const actor = currentActor(state);
  const askedHuman = state.phase === PHASES.TURN
    ? state.requests.find((r) => r.from === actor && !getPlayer(state, r.to).isAI)?.to
    : null;
  const holder = askedHuman ?? (actor && !getPlayer(state, actor).isAI ? actor : null);
  return holder && holder !== seat ? holder : null;
}
