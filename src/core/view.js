// viewFor(state, playerId): a copy of state safe to show a given seat (hot-seat UI / network clients).
// Hides other players' hands and objectives, face-down crisis cards, deck order, and the RNG seed.
import { PHASES } from './constants.js';

export function viewFor(state, playerId) {
  const v = structuredClone(state);
  const over = state.phase === PHASES.GAME_OVER;
  delete v.rng;
  for (const p of v.players) {
    if (p.id !== playerId && !over) {
      p.handCount = p.hand.length;
      p.hand = [];
      p.objectiveId = null;
      p.draftOptions = [];
      p.pick = null;
      // While drafting, others only learn THAT you have picked (drafted), not whom.
      if (state.phase === PHASES.DRAFT) p.survivors = [];
    }
  }
  if (v.crisis) {
    v.crisis.contributionCount = v.crisis.contributions.length;
    // Contributors are public (you see who adds a card); the cards themselves stay face down.
    v.crisis.contributions = v.crisis.contributions.map((c) => ({
      playerId: c.playerId,
      uid: c.playerId === playerId ? c.uid : null,
    }));
  }
  // Only keep uid -> item lookups for cards this seat may see.
  if (!over) {
    const visible = new Set(v.players.find((p) => p.id === playerId)?.hand ?? []);
    for (const c of v.crisis?.contributions ?? []) if (c.uid) visible.add(c.uid);
    v.cards = Object.fromEntries(Object.entries(v.cards).filter(([uid]) => visible.has(uid)));
  }
  for (const loc of Object.values(v.locations)) {
    if (loc.deck) { loc.deckCount = loc.deck.length; loc.deck = []; }
  }
  for (const key of ['crisisDeck', 'crossroadsDeck', 'survivorDeck', 'exileDeck']) {
    v[`${key}Count`] = v[key].length;
    v[key] = [];
  }
  // Step 23: the danger deck's order is secret; how many of each kind are left is public.
  if (v.danger) {
    const left = {};
    for (const k of v.danger.deck) left[k] = (left[k] ?? 0) + 1;
    v.danger = { left, deckCount: v.danger.deck.length, deck: [], discard: v.danger.discard };
  }
  // A triggered crossroads card is read aloud, so it stays visible to everyone.
  // Untriggered cards were discarded unseen by the active player and never appear in state.
  return v;
}
