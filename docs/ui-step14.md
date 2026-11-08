# FROSTBOUND UI — Step 14: floating HUD

There is no bottom bar any more. Each piece floats over the board on its own, with only the text that's needed. Details are in tooltips, and the tooltips also open on tap.

Screenshots are in `docs/screenshots/step14/`:
- `before-*`: Step 13.
- `after-<size>-<pile|fan>[-location]`: from `node scripts/e2e/hud-layout.cjs docs/screenshots/step14`.
- `after-*-card-sheet`, `disabled-reason`, `more-closed`, `more-open`: from `node scripts/e2e/capture-step14.cjs`.

## Layout

| Piece | Where | Hook |
|---|---|---|
| Name tag: colour dot, name, turn light | bottom left | `#pp-head.hud-chip` (inside `#pp-left`) |
| Dice: 2D chips | next to the name tag | `#pp-chips.hud-chip` |
| Survivor tokens | above the name tag | `#pp-survivors.sv-tokens` |
| Hand | bottom centre (phones: above the bottom row) | `#pp-hand` |
| ⋯ (round) + End turn | bottom right | `#pp-actions .icon-btn.round.more`, `#pp-actions .btn.end-turn` |

- **`#player`:** it is `display: contents`, so it no longer draws a box. Each piece has its own background.
- **Clicks reach the board:** the wrappers use `pointer-events: none`, and only the pieces themselves catch clicks.
- **Safe areas:** they are respected (`env(safe-area-inset-*)`).
- **`--player-h`:** now only the height kept free at the bottom, used by the dice stage, toasts and the phone location sheet.
- **Phones:** the name tag, dice and buttons share the bottom row. The tokens and the pile sit above it.
  - When the hand is fanned, it gets a row of its own and the tokens move up.
  - While the location sheet is open, the hand folds into its pile.
- **`npm run e2e:layout`** checks that no piece overlaps another at 1440×900, 1024×768, 390×844 and 844×390, with the hand piled and fanned, and with the location panel open.

## Hand: pile ↔ fan

- **Pile:** the cards sit on one spot. The four under the top card peek out at small angles, and a count badge sits on top.
  - The pile is one button (`.pile-btn`). Click it to fan the hand.
- **Fan:** full cards spread between the name tag and End turn, on a gentle arc.
  - The step between cards shrinks for big hands.
  - Hover lifts a card. Clicking opens its sheet.
  - A small round hand button stacks the hand again.
- **Animation:**
  - Cards are kept by `uid` between renders (`renderHand` / `updateCard` in `src/ui/views/player.js`). Switching layout moves the same elements with CSS transforms, staggered by `--i`.
  - Drawn cards deal in.
  - `prefers-reduced-motion` turns the animation off.
- **Remembered:** the choice is still `ui.handCompact`, saved per device.
- **Card states:** a picked card (keyboard, tutorial) fans the hand while its sheet is open. Unusable cards stay dimmed, and permanent cards used this turn carry a small mark.

## Card sheet

- **Header:** a 56 px sprite, the name, the type with tier pips (and a lock if the card is permanent), and one rule line. The flavour text is in the header tooltip.
- **"Use it on":** round portraits with no names (`.pick.round`).
  - Survivors who can't be chosen are greyed with a small × mark.
  - The name and the reason are in the tooltip, and a click shows it.
- **Buttons:** icon plus a short word (Use, Crisis, Goal). The reason a button is off is in its tooltip.
- **Placement:** desktop puts the sheet next to its card. Phones show a low bottom sheet.

## Location panel

- **Size:** about 40% narrower (196 px).
- **Stats:** one inline row of icon and number.
- **Here now:** small portraits.
- **Actions:** icon-only 40 px buttons (`.btn.act.icon-act[data-act]`).
  - A corner badge shows the die the action needs (`3+`), and a small dot marks an exposure risk.
  - The name, the die it would use, and why it can't be done now are in the tooltip.
- **Move:** "Move here" is a short button with the survivor's portrait. The risk details are in its tooltip.

## Disabled reasons on touch

- **No `disabled`:** buttons that can't be used now (location actions, Move, End turn, card actions and targets) use `aria-disabled` and an `.off` class instead.
- **Clicking or tapping one:** `flashTip` (`src/ui/tooltip.js`) shows its reason for about 2 s instead of acting. This replaces the reasons that Step 13 still wrote out under the buttons.

## ⋯

- It is a round button (`.icon-btn.round.more`). The menu is unchanged, and Esc or an outside click closes it.

## Removed

- The panel collapse button and `ui.ppCollapsed`.
- The `.item-card.mini` row and `scrollRow`.
