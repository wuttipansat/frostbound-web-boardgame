# FROSTBOUND UI — Step 10 field-kit theme

The UI should look like a survival board game spread out on a workbench at night in a frozen town. Cards are worn card stock, panels are steel plates, and labels are stencilled. It drops the generic glassmorphism, rounded pills and gradients that came before.

Screenshots are in `docs/screenshots/step10/`:
- `before-*`: the previous build. `after-*`: this step.
- Each is taken at `desktop` (1440×900) and `phone` (390×844).
- Scenes: `setup`, `draft`, `turn`, `hand`, `crisis`, `colony`, `over`.

To re-take them: `npm run build && npx vite preview --port 4173`, then `node scripts/e2e/capture.cjs docs/screenshots/step10 after`.

## Design tokens (`:root` in `src/ui/style.css`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0d0f11` | page background |
| `--panel` / `--panel-solid` | charcoal steel | panels, dialogs, popovers |
| `--border`, `--line` | `#30373d`, `#2c3237` | hard 1px plate edges |
| `--text` | `#e7e1d4` (bone) | text on steel |
| `--paper`, `--paper-2` | `#ddd5c3`, `#c9bfa8` | card stock (survivor badges, item cards, crisis reveals) |
| `--paper-ink`, `--paper-muted` | `#24211c`, `#6b6455` | text on card stock |
| `--warm` | `#e8742a` (signal orange) | primary actions, selection, active turn |
| `--danger`, `--blood` | `#c4402f`, `#7d1f18` | crisis, damage, used dice |
| `--ice`, `--frost` | `#9cc7e3` | frost rims and cold stats |
| `--tier-1/2/3` | bone `#cfc7b4`, blue `#4f8fd9`, gold `#e2b23c` | item tier frames |
| `--radius`, `--radius-card` | 4px, 6px | plates are almost square; cards slightly rounded |
| `--font` | IBM Plex Sans Thai | body text (Latin + Thai) |
| `--stencil` | Saira Stencil One | headings, labels, numbers (Thai falls back to Plex bold) |
| `--noise` | 1px scanline gradient | a subtle grain on plates and paper |

There are two web fonts in total, both from Google Fonts.

## Anatomy of each object

- **Panel / dialog:** dark steel plate with a hard edge and a frost-tinted top rim. A strip of grey tape is drawn with CSS across the top of dialogs, popovers and the card sheet.
- **Survivor card (ID badge):** bone card stock with a coloured band on the left edge (the survivor's accent).
  - The portrait is a 64×64 sprite in a white photo border.
  - The name is stencilled; the location shows in a black chip.
  - Attack/search thresholds are drawn dice; wounds are hearts on the paper.
  - **Moved:** a tilted stamp, and the photo turns grey.
  - **Selected:** an orange outline.
- **Item card (playing card):** bone face with a stripe in the type colour along the top.
  - The frame colour shows the tier: bone (common), blue with a glow (uncommon), gold with a glow (rare).
  - A permanent weapon already used this turn is greyed out and hatched.
  - The card sheet repeats the tier frame around the large sprite.
- **Action dice:** raised bone dice with dark pips and a red "one" pip.
  - **Selected:** turns orange.
  - **Used:** sinks, greys out and gets a red slash.
- **Crisis:** the top-bar gauge has red hazard stripes. The popover has a red top edge.
  - The colony reveal flips face-down cards (striped card backs) into bone cards with +1 / −1.
- **Top bar:** a strip of steel gauges with stencilled labels, segmented meters and diamond round markers.
- **Buttons:** stamped steel plates in uppercase (English only; Thai stays in normal case).
  - The primary button is a hazard-orange plate with a pressed edge.
  - Location actions stay in normal case as compact list rows, so all five fit at 1280×720.

## Kept from earlier steps

- Target pickers, `data-tip` tooltips (no `title=`), Esc to close, and focus rings.
- The pass screen and the hidden-information rules.
- `npm run e2e:audit` shows all 5 location actions at every audited size, no clipped top-bar chips, and no emoji.
