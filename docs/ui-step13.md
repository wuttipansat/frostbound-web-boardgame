# FROSTBOUND UI — Step 13 minimal player HUD

The screen shows only what is needed to act now. Everything else appears on hover, focus or tap.

Screenshots are in `docs/screenshots/step13/`:
- `before-*` / `after-*`: the standard scenes (`node scripts/e2e/capture.cjs`).
- `after-*-dice-roll`, `hand-compact`, `feed-location`, `feed-expanded`, `survivor-card` and `menu-and-card`: the new HUD states (`node scripts/e2e/capture-hud.cjs`).

## Survivors: floating round tokens

- **What it is:** `survivorToken` in `src/ui/views/player.js`, inside `#pp-survivors.sv-tokens`, which floats over the board above the panel's left edge.
- **Token:** a portrait in a ring of the owner's colour, plus health pips, a frostbite mark, a green "can act" dot and a grey "moved" state. There's no text on it.
- **Hover card:** hover, focus or tap shows name, occupation, location, attack/search needs, influence, health and the full ability.
- **Click:** selects the survivor, shown by a brass outer ring.
- Hook: `.sv-token[data-sv]`.

## Dice: the roll, then 2D

- **The roll:** when a turn starts, the 3D tray (`#dice-stage`) throws the active player's dice.
  - Dice are public, so every seat sees the roll, online too.
  - The throw takes 1.6 s and the result holds ~1.6 s, then the stage fades.
  - Clicking the stage skips it. Exposure rolls use the same stage.
- **Timing:** the stage is shown and hidden by timers, never by frames, so it can't get stuck if rendering pauses. It is capped at 6 s.
- **After the roll:** the panel only has the 2D die chips (`.die-chip`) and a small count badge. The "cheapest die" hint is in the chip tooltip.

## Hand: compact or full

- **Toggle:** a hand button with a card-count badge switches between mini faces (sprite, type edge, tier pips) and the full vertical cards.
- **Default:** compact on phones and screens ≤ 800 px tall.
- **Remembered:** the choice is stored per device (`handCompact` in the settings, via the existing try/catch storage).
- **Mini cards:** the tooltip carries the name, tier, rule, flavour and permanence.
- The card detail sheet, the unusable state and `flyCard` work in both sizes.

## Actions: End turn + ⋯

- **Always visible:** End turn (`#pp-actions .btn.primary`), while you can act.
- **Behind ⋯ (`.icon-btn.more`):**
  - Objective (hold to peek);
  - Request item;
  - Call exile vote, only when a vote is possible.
- Esc and clicking outside close the menu.
- The "Your turn" pill became a small light next to the player's name.
- The tutorial's objective step now points at ⋯.

## Log: a floating feed at the top centre

- **What it is:** `renderLog` in `src/ui/views/hud.js`, a feed under the phase banner.
- **Recent entries:** the last 3 fade in and out over ~6 s.
- **Who did it:** every line starts with the acting player's colour dot and name.
  - Entries without a `playerId` (a barricade, a draw) are attributed to whoever's turn it was.
  - Colony and round entries stay neutral.
  - The current actor's lines are highlighted.
- **History:** hover, focus, or pinning with the log buttons opens it: the last 40 entries, round and turn headings, a light translucent panel and a thin transparent scrollbar.
- Only public text (`formatLog`) is shown, and `aria-live` is kept.

## Location panel: leaner

- **Stats:** icon + number; the labels are tooltips.
- **"Here now":** portrait chips in the owner's colour ring, with the name on hover.
- **Survivor actions:** headed by the selected survivor's portrait.
- **Disabled reasons:** still written out, because disabled buttons can't show tooltips on touch.

## Removed

- The colony status column (Step 11) and its i18n keys. Food needed and the crisis requirement stay in the top bar and the crisis popover.

## Fixes found on the way

- **Custom properties:** `h()` dropped CSS custom properties (`--owner`, `--ring`, `--accent`) because `Object.assign(el.style, …)` ignores `--x` keys. It now uses `setProperty`. The location chips' owner-colour rings had never actually applied before this.
- **Token hover card:** the old `#pp-survivors` rule had `overflow-x: auto`, which clipped the hover card. The token row now overrides it.
