// First-round tutorial as a pure state machine. The app feeds it events; it says which step to show.
//   target: CSS selector of the element to spotlight (null = centred card)
//   when:   'turn'  -> only while the tutorial player is taking their turn
//           'colony'-> only while the colony-phase reveal is on screen
//   on:     events that complete the step (besides pressing Next when `next` is true)

export const TUTORIAL = [
  // Step 18: learn by doing. Each step waits for the real action (cards also allow Next: you may have none to play).
  { id: 'welcome', target: null, when: 'turn', next: true, on: [] },
  { id: 'move', target: '#move-pick', when: 'turn', next: false, on: ['move'], placement: 'top' },
  { id: 'actions', target: '#locpanel', when: 'turn', next: false, on: ['dieAction'] },
  { id: 'card', target: '#pp-hand', when: 'turn', next: true, on: ['card', 'contribute'] },
  { id: 'endTurn', target: '#pp-actions .btn.end-turn', when: 'turn', next: false, on: ['endTurn'] },
  { id: 'colony', target: '.dialog.colony', when: 'colony', next: true, on: ['colonyDone'] },
];

export const DONE = TUTORIAL.length;
const COLONY = TUTORIAL.findIndex((s) => s.id === 'colony');

/** Feed an event; returns the new step index (DONE when finished). */
export function advanceTutorial(index, event) {
  if (index >= DONE) return DONE;
  if (event === 'skip') return DONE;
  const step = TUTORIAL[index];
  if ((event === 'next' && step.next) || step.on.includes(event)) return index + 1;
  // Ending the turn early jumps straight to the colony explanation.
  if (event === 'endTurn' && index < COLONY) return COLONY;
  // If the round ends without the colony step being seen (e.g. it was dismissed), finish.
  if (event === 'colonyDone' && index <= COLONY) return DONE;
  return index;
}

/** Map a dispatched action to a tutorial event. */
export function eventForAction(action) {
  switch (action.type) {
    case 'MOVE': return 'move';
    case 'ATTACK': case 'SEARCH': case 'BARRICADE': case 'CLEAN': case 'LURE': return 'dieAction';
    case 'END_TURN': return 'endTurn';
    case 'PLAY_CARD': case 'DEPOSIT': return 'card';
    case 'CONTRIBUTE': return 'contribute';
    default: return null;
  }
}

/** Should the current step be on screen right now? */
export function tutorialVisible(index, { canAct, colonyShowing }) {
  const step = TUTORIAL[index];
  if (!step) return false;
  if (step.when === 'colony') return colonyShowing;
  return canAct && !colonyShowing;
}
