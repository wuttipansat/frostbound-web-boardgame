# FROSTBOUND UI — Step 16: draft, new-game screen, 2D dice

Screenshots are in `docs/screenshots/step16/`, from `node scripts/e2e/capture-step16.cjs` (it starts its own room server).

## Draft
- **Online:** everyone drafts at once. The draft modal shows to every seat that hasn't picked, whoever's "turn" it is.
  - Once you have picked, you see who has picked ✓ and who is still choosing… (`draftWaitModal`).
- **Hidden picks:** during the draft, `viewFor` hides other players' picks (`survivors: []`) and only keeps `drafted`. This is a view change; the rules are unchanged.
- **Hot seat:** it still goes one at a time through the pass screen. The draft screen shows the same status row.
- **Team reveal:** when the last player picks, every team is shown at once (`teamsModal`). It moves on by itself after 2.6 s on a timer (not frames), or on a click.
- **Cards:** each option is its own card (`.draft-screen .sv-pick`) with a portrait, name, job, attack/search die, influence, health and ability.
  - Cards deal in once.
  - A picked card lifts, glows in the player's colour, pops, and gets an order badge (1, 2). The others dim once two are picked.
  - Recruiting flies the two cards toward the survivor tokens.
  - On phones the cards snap-scroll sideways.
  - The game HUD is hidden while drafting (`body.drafting`).

## New game
- **Numbered steps:** 1. mode (two cards: This device / Online, with Join by code under Online), 2. main objective (one card per scenario), 3. players.
- **More options:** the betrayer setting, the tutorial and settings are folded into `<details>`.
- **Buttons:** Start or Create room sits in a sticky bar at the bottom right, with Continue if there is a save.
- **Lobby:** a big code with a Copy button, the chosen scenario as a card, and seats as small cards.

## 2D dice
- **What was wrong:** `#pp-chips .die-chip` (34 / 30 / 28 px with padding) held a fixed 30 px face. The face overflowed and sat off-centre.
- **The fix:** the face now fills the chip (`width/height: 100%`, border-box, no transform). See `before-desktop-dice.png` and `after-*-dice.png`.

## Tests
- `tests/online.test.js`: a guest picks before the host, sees nobody's picks until everyone is done, then sees them all.
- `online.cjs`: both browsers show the draft at the same time.
- smoke, ui-audit, layout: pass.
