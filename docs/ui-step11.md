# FROSTBOUND UI — Step 11 colony survival dashboard

The game now reads like an industrial winter-colony management screen:
- Worn steel panels, brass accents and condensed headings.
- Depth comes from borders and shadows, not glows.
- The 3D board stays as the central colony area, framed by panels.

The mood is inspired by cold-city survival-management and post-war survival games, but nothing is copied from them.

Screenshots are in `docs/screenshots/step11/`:
- `before-*`: the Step 10 build. `after-*`: this step.
- Each is taken at `desktop` (1440×900) and `phone` (390×844).
- Scenes: `setup`, `draft`, `turn`, `hand`, `crisis`, `colony`, `over`.

## Tokens (`:root` in `src/ui/style.css`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#17191A` | page |
| `--panel-1` / `--panel` | `#222526` | panels, dialogs |
| `--panel-2` | `#2C302F` | gauges, card faces, pickers |
| `--text` / `--muted` | `#E5E0D5` / `#99988F` | text |
| `--accent` | `#B28A54` (brass) | primary buttons, selection, current phase, focus |
| `--good` / `--warn` / `--danger` | `#81956D` / `#C18C48` / `#A64F45` | gains, warnings, losses and critical gauges |
| `--tier-1/2/3` | `#6B6E69` / `#6F8BA3` / `#B8964F` | item tier pips and frames |
| `--radius`, `--radius-card` | 3px, 5px | almost square plates, slightly rounded cards |
| `--head` | Oswald | headings, labels, numbers |
| `--font` | IBM Plex Sans Thai | body text, Thai everywhere |
| `--grain` | 1px line texture | worn metal / paper grain on panels and cards |
| `--player-h` | 252px (214px on short screens) | height of the hand / player panel |

Item type accents: food `#7D8F5A`, medicine `#6F8AA3`, fuel `#B0643A`, tools `#8A9298`, weapon `#9A4A40`, junk `#7A6650`, survivor `#B9AB8E`, book `#A8894A`.

## Layout

- **A. Top resource bar** (`renderTopbar`, `src/ui/views/hud.js`): Morale, Food (and the amount needed), Waste, Helpless, Round, Goal and the Crisis gauge.
  - Numbers count to their new value. A `+N` (green) or `−N` (red) floats for 1.2 s, and the icon pulses once.
  - These changes come from state diffs in `src/ui/ticker.js`, outside the reducer. A new or loaded game resets the ticker.
  - **Critical states** (calm red plate, no flashing): food below what is needed, morale ≤ 3, 2 or fewer waste before the next −1 morale, the last round.
- **B. Colony status** (`renderColony`, `#colony`, left column), public information only:
  - survivors alive / fallen per player;
  - wounds and frostbite;
  - zombies at the colony gate against capacity, and barricades;
  - **next colony phase:** food eaten or short, waste penalty, crisis requirement and its fail penalty, starvation.
  - The log stacks under it. Phones hide it; its numbers are in the top bar and the crisis popover.
- **C. Phase banner** (`renderPhase`, `#phase`): `Round n/N · Draft › Crossroads › Turns › Colony phase`, with the current step highlighted and who is acting.
  - The crossroads and colony report dialogs are restrained narrative panels.
- **D. Hand:** vertical item cards in one row. The player panel head shows the unused dice left.
  - Survivor ID cards get a green dot while that survivor can still act.

## Item card anatomy (`itemCard` in `src/ui/views/player.js`)

1. **Header:** type label in the type colour; tier pips (1–3 diamonds in the tier colour).
2. **Name:** up to 2 lines.
3. **Illustration:** the 64×64 sprite at 1×, pixelated, on a recessed textured plate.
4. **Effect line:** from `itemShort` (`src/ui/itemText.js`), e.g. "+2 Food", "Kill 2 zombie".
5. **Flavour text:** 2 lines, italic. On short desktop screens it moves to the detail sheet.
6. **Footer:** Single use / Permanent (lock) / Used this turn / Passive / Wild in crisis.

The tier shows as the frame colour (bone grey, steel blue, brass) plus a brass corner notch on rare cards.

## Interaction rules

- **Hover:** the card rises 5px, scales to 1.04, gets a stronger border and a deeper shadow. It stays inside the hand row, which has headroom for the lift.
- **Click:** selects the card and opens the detail sheet, with its large sprite, full effect and permanence note.
  - Target pickers: survivor / location / dice. The blueprint put-back is a dialog.
  - Actions: Play / Add to crisis / Deposit, each with its disabled reason (err.*).
  - Clicking another card switches the selection; clicking the same card closes the sheet.
- **Unavailable cards:** when the card has no legal use right now (checked with `cardUsable` in `options.js`, through the reducer), it is desaturated and its tooltip gives the reason.
- **Use feedback:** a ghost of the card flies to where it went (`flyCard`):
  - played → onto the board;
  - added to the crisis → into the crisis gauge;
  - deposited → into the goal gauge.
  - Permanent weapons stay in hand, dimmed, with "Used this turn".
- **Reduced motion:** no count-up, no floating tags, no fly or hover motion.

## Kept

- Hot-seat pass screens and all hidden information (other hands, objectives, face-down crisis cards, the blueprint pick).
- Tutorial, `data-tip` tooltips, Esc / focus, EN/TH, and SVG-only icons and dice.
- The unused-dice confirmation before End Turn.
- `npm run e2e:audit`:
  - all 5 location actions are visible at 1440×900, 1280×720 and 390×844;
  - no clipped top-bar chips, no emoji, no `title=`, no horizontal scroll.
