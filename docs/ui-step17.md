# FROSTBOUND UI — Step 17: frost and blood on the UI

Screenshots are in `docs/screenshots/step17/`, from `node scripts/e2e/capture-step17.cjs`. The failed-crisis report there is staged: the script marks the first colony report as failed, for display only.

## Textures
The textures are inline SVG data URIs held in custom properties at the end of `src/ui/style.css` (the "step 17" section). There are no image files; the whole section is about 10 KB.

| Property | What it is |
|---|---|
| `--frost-tex` | `feTurbulence` noise, tinted icy white, with alpha cut so it reads as speckled hoarfrost |
| `--rime-tl` / `--rime-br` | fern-like ice crystals growing from the top-left and bottom-right corners |
| `--icicles` | a strip of icicles that repeats along the top edge of dialogs |
| `--blood-tex` | a dried splatter (rough edges from `feDisplacementMap`) with droplets and a smear |
| `--blood-drip` | drips running down from an edge |

## How they are applied
- **Frost:** frost is drawn on `::before` of each panel. The host gets `isolation: isolate` and the layer `z-index: -1`, so the frost sits on the panel's background but under its text.
  - A radial mask keeps the middle of a panel almost plain, so frost only builds up toward the edges.
  - Dialogs also get icicles along the top.
- **Panels with frost:** the top bar, phase banner, location panel, card sheet, ⋯ menu, all dialogs, HUD chips, End turn, ⋯, log history, tooltip, toasts, the move picker, callouts, scenario/mode/team cards and the objective peek.
- **Cards:** item and survivor cards only get a thin rim of frost, so the art stays clear.
- **Borders:** borders are a cold blue-grey with a white top highlight and a faint icy inner glow. A pale rime gradient also builds up along the top of the large panels.
- **Blood:** blood is drawn on `::after`, only where something is dangerous:
  - the crisis tile in the top bar;
  - the game-over dialog when the colony is lost (`.dialog.over.lost`), plus a small mark on a win;
  - the colony report when the crisis failed (`.dialog.colony:has(.verdict-banner.bad)`);
  - the location panel when a location is at its zombie limit (`#locpanel.overrun`, set in `location.js`);
  - bad toasts (deaths, bites);
  - one small mark on the new-game dialog.

  Each spot places its blood with `--blood-x/-r/-y/-b/-w/-h`. The positions are fixed per element, so they never jump between renders.
- **Primary buttons:** a cold glint sweeps across them on hover only, and not with reduced motion.
- **Phones:** lighter frost (no crystals) and smaller blood.

## Not changed
- Layout, game logic and the step 14–16 HUD are unchanged. `npm test`, smoke (desktop and phone), ui-audit and `e2e:layout` all pass.
- Text sits on the near-plain middle of each panel, so its contrast is the same as before.
