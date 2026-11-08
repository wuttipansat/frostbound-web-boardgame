# FROSTBOUND UI — Step 19: bug fixes + the secret-objective reveal

Screenshots are in `docs/screenshots/step19/`, from `node scripts/e2e/capture-step19.cjs`.

## Secret-objective reveal (after the draft, before round 1)
- **The card:** after the team reveal, each human gets their objective face down (`objectiveRevealModal`).
  - Tap it to flip it (3D).
  - A colonist's card is icy blue. A betrayer's card is blood red with **BETRAYER** in large letters.
  - Then hold **Got it** for 1 s, so a stray tap can't close it.
- **The rules are unchanged:** objectives are still dealt by `createGame`. "Seen" is display state only.
  - **Hot seat:** `ui.objSeen` decides. The device is handed to each human in turn, and the HUD is hidden while a card is shown.
  - **Online:** `Room.seen` decides. A new ws message `{ t: 'seen' }` marks your seat. The lobby carries `seats[].seen`. Until every human has seen theirs, `Room.act` refuses with `waitingObjectives` and bots wait.
  - Players who are done see who is still looking (`objectiveWaitModal`). Others' objectives never reach the client (`viewFor`).
- **Bots** need no reveal. AI turns wait until every human is done.
- **Tutorial:** with the tutorial on, one line under the title explains colonists and the betrayer.

## Bugs fixed
| Symptom | Cause | Fix |
|---|---|---|
| The secret-objective peek was covered or cut off | `.objective-peek` was `position: absolute` inside `#pp-actions`, under the hand, hint, tokens and screen edge | It is now `position: fixed` and centred, the actions layer is raised while peeking (`body.peeking`), and the hint and tooltip are hidden; `e2e:layout` checks it is whole and on top at 4 sizes |
| The tutorial bubble sat in a corner while its target wasn't shown yet (move picker before a building is tapped) | `center` was only set by the per-frame positioner | It starts centred when its target isn't on screen |
| Phone top bar broke onto a second row | Step 18's `?` button had no slot in the phone top-bar grid | On phones it is hidden, and Quick rules is now in the ⋯ menu at every size |
| Team reveal and objective reveal could overlap | — | The objective reveal is only offered once the reveal queue is empty: teams first, then objective |

## Tests
- `tests/online.test.js`:
  - After the draft, humans' actions are refused and bots wait until both humans have seen their objective.
  - `seen` is in the lobby.
  - Each view holds only its own `objectiveId`.
- smoke (desktop and phone) flips the card and holds Got it. online does the same in two browsers. `e2e:layout` checks the peek. ui-audit and new-game pass.
