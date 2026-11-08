# FROSTBOUND UI — Step 18: easier to learn

Screenshots are in `docs/screenshots/step18/`, from `node scripts/e2e/capture-step18.cjs`. The rules are unchanged.

## Next-move hint (`src/ui/views/help.js`)
- **What it is:** a small bar above your survivor tokens (`#hint`). It shows one suggested move with a short reason, for example "Ana: attack at the Grocery Store with a 5 — 2 zombies there" or "Add First-Aid Pouch to the crisis — the crisis needs 1 × medicine".
- **Where the suggestion comes from:** the bots' own logic, `botAction(…, { cooperative: true })`.
  - The new `cooperative` flag means it never plays as a betrayer, so it can't reveal or push anyone's secret objective.
  - Results are cached per state.
- **"Show me":** it selects the survivor and die, opens the move picker at the place, opens the card, or pulses End turn.
- **When it shows:** only on your own turn. It is hidden during the tutorial, while others' moves play, and while a card sheet is open. On phones it is also hidden while the location sheet is open.
- **Turning it off:** use × or Settings → *Next-move hints*.

## This round (checklist)
- **What it shows:** `roundChecklist(state)` gives three lines: food (have / need), crisis (cards in / needed) and colony (zombies, waste). Each line turns green when it is safe.
- **Where it appears:** in the crisis popover. The End turn confirmation also lists the lines that are still unsafe.

## Quick rules
- **Opening them:** the **?** button in the top bar.
- **What they are:** eight small cards: your turn, dice & actions, moving & the cold, item cards, crisis & colony phase, morale & food, secret objectives, exile vote. Each card has an example.
- **The game keeps running:** opening the rules does not pause it.

## Tutorial: learn by doing
- **Steps:** welcome → move a survivor → spend a die → use a card → end your turn → the colony phase.
  - Each step waits for the real action. The card step also allows Next, in case you have no card to play.
  - Each text is at most 2 lines.
- **At the end:** a *Quick rules* button.
- **New events:** `PLAY_CARD`/`DEPOSIT` → `card`, `CONTRIBUTE` → `contribute`.

## Tests
- `tests/help.test.js`:
  - The hint gives words and something to point at.
  - The cooperative suggestion is legal.
  - The checklist has its three lines.
- `tests/polish.test.js`: the new tutorial flow.
- `e2e:layout`: the hint is now one of the pieces checked for overlaps.
- smoke, ui-audit, online: pass.
