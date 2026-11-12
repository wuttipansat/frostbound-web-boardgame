# FROSTBOUND — Godot port

GODOT-0 adds the port's starting point. The web game in `../src` stays the reference: content, balance and rules
are made there first, then exported here.

## Open it
1. Install Godot 4.3 or newer (standard build, not .NET).
2. From the repo root run the exporters (Node 18+, about 1.5 minutes):
   ```bash
   npm install && npm run export:godot
   ```
   - **`godot/assets/models/`:** about 350 `.glb` files (about 86 MB). They are generated and not in git.
   - **`godot/data/`:** JSON. It is in git.
3. Open `godot/project.godot` in Godot.
   - The first open imports the models, which takes a few minutes.
   - Run it (F5). You should see the colony and six places on the snow, and you can drag or pinch to orbit.
4. Headless check (loads every model and data file):
   ```bash
   godot --headless --path godot --script res://scripts/check.gd
   ```

## What is here
| Path | What |
|---|---|
| `assets/models/<lod>/*.glb`, `index.json` | Every model build. `lod1` is the middle and `lod2` the far level of detail. The close-up level `lod0` is left out: all levels together are 178 MB. Voxel scale is 0.3 / 0.6 world units per voxel, Y up. Glowing parts are an unlit second surface. |
| `data/*.json` | Content and tunables: constants, locations, items, buildings, crises, crossroads, scenarios, survivors. |
| `data/i18n/{en,th}.json` | UI text, plus Thai content names. Loaded as `Translation`s with dotted keys, e.g. `tr("content.locations.colony.name")`. |
| `data/golden/<seed>.json` | 20 bot games (crawler, normal), with every action and the state hash after it (`stateHash` in `src/core/hash.js`: sorted-key JSON, then FNV-1a). |
| `data/TODO-logic.md` | Content functions that must be ported by hand. |
| `scripts/data.gd` | The `Data` autoload. |
| `scripts/models.gd` | Loads a model: the imported scene, else the raw .glb at runtime. Vertex colours are used as albedo. |
| `scripts/boot.gd`, `orbit_camera.gd` | The demo scene. |
| `export_presets.cfg` | Android (arm64) and Web presets. Keystores are set in the editor and never committed. |

**Thai font:** Godot falls back to system fonts, which covers Thai on Android and desktop. Before release, bundle Noto Sans Thai (OFL) in a Theme so every platform looks the same.

## Port plan
- **GODOT-1, rules:**
  - Port `src/core` to GDScript.
  - Replay every `data/golden` game: create the game with the same seed, apply each action, and check that the state hash matches at every step.
  - The engine RNG (`src/core/rng.js`) must be ported bit-exact, using 32-bit integer maths.
- **GODOT-2, board:** block layout (streets, rail, river, places, spots), levels of detail, fog and snow, night lights.
- **GODOT-3, UI for touch:** bottom sheets, cost previews, the found window, the journal (the UI-2 ideas).
- **GODOT-4, store builds:** Android first (Play closed test), then iOS (needs a Mac or a cloud CI).

Re-run `npm run export:godot` whenever content or models change on the web side.
