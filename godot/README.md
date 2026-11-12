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

## Rules engine (GODOT-1)
`core/` is a GDScript port of `src/core`, file for file, and `ai/bot.gd` ports the bot (`src/ai/simpleBot.js`, `simulate.js`).
The port is checked against the web engine:
```bash
godot --headless --path godot --script res://tests/run.gd
godot --headless --path godot --script res://tests/bot.gd -- --games 20 --winrate 100
```
- **`run.gd`** first checks 546 vectors: rng, hashZ, stableJson + FNV-1a, the zones of a 21×21 grid for 7 looks, and createGame plus four city growths for 5 seeds. It then replays the 20 golden games. Every one of the 9189 actions must give the same state hash as the JS engine. This takes about 6 minutes, because hashing the whole state after every action is slow.
- **`bot.gd`** checks that the ported bot chooses the same action as the JS bot at every step of the 20 golden games. With `--winrate`, it also plays N crawler-normal games and reports the win %. Over 100 games it wins 17%, the same as `node scripts/balance.mjs 100 crawler normal`.
- **On a mismatch:** `run.gd` writes `data/golden/states/<seed>-<step>.gd.json`. Then `node scripts/export-data.mjs --state <seed> <step>` writes the JS state beside it, so the two can be diffed.

Results when GODOT-1 was finished: 546/546 vectors, 20/20 golden games (9189/9189 actions) and 20/20 bot replays matched, and both engines won 17% of 100 games.

### Port notes: the traps between JS and GDScript
| Trap | How the port handles it |
|---|---|
| 32-bit maths (`Math.imul`, `>>>`, `\|0`) | `JS.imul` multiplies via 16-bit halves. `JS.i32`, `u32`, `ushr` and `shl` mask to 32 bits, and every xor and shift is wrapped the way JS does it. |
| Godot's JSON reads every number as a float | `JS.norm` turns integral floats into ints when data is loaded. Without it, `[1].has(1.0)` and int-keyed lookups fail. |
| Godot's JSON float parsing is not correctly rounded | Float test vectors are exported as `k` for values of the form `k / 2^32`. The state itself never holds a non-integer, which was checked over 5 bot games. |
| `/` is integer division for two ints in GDScript | Every JS division is written with a float operand (`/ 2.0`, `float(x) / y`). |
| `Math.round` rounds halves up (`-0.5` → `-0`) | `JS.round_` is `floor(x + 0.5)`. |
| `Array.prototype.sort(cmp)` in V8 is TimSort; some comparators are random (`() => random() - 0.5`) or return NaN (`Infinity - Infinity`) | `JS.sort` copies V8's run detection and binary insertion exactly for arrays under 64 elements, and counts NaN as 0. Larger arrays use a stable merge sort, which gives the same result whenever the comparator is consistent. |
| `undefined` vs `null` (stableJson drops `undefined` but keeps `null`) | Log lines use `H.p()` to leave out the params that JS leaves undefined. Optional fields are only set when JS sets them (`loc.type`, `sv.trait`, `deathCause`). |
| JS object order puts integer-like keys first | No runtime object has integer-like keys (location ids, `x,z` blocks, `a\|b` bonds), and exported content keeps JS's order. If ids like `"3"` are ever added, iterate them in JS order. |
| Exceptions (`RuleError`) | GDScript has no exceptions. `Err.ok(cond, code)` records the first failure, every rule returns early, and the reducer drops the half-changed copy. |
| `localeCompare` on survivor ids | All ids are lowercase ASCII, so code-unit order is the same. |
| The road cache in `map.js` is keyed by content and also by the roads array, so it can be briefly stale inside `growCity` | `map.gd` uses the same key and a one-slot cache keyed by array identity, so it is stale in the same places. |
| `Math.cos` / `sin` (fdlibm) vs the C library | The zone grid matches. A last-bit difference could only flip a block that sits exactly on a zone border. |

## Port plan
- **GODOT-1, rules (done):** see above. The demo scene runs the engine: Bot step, Bot day and New game buttons, with the day, phase, morale, food, stage and team shown in the panel.
- **GODOT-2, board:** block layout (streets, rail, river, places, spots), levels of detail, fog and snow, night lights.
- **GODOT-3, UI for touch:** bottom sheets, cost previews, the found window, the journal (the UI-2 ideas).
- **GODOT-4, store builds:** Android first (Play closed test), then iOS (needs a Mac or a cloud CI).

Re-run `npm run export:godot` whenever content or models change on the web side.
