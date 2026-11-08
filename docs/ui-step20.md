# Step 20 — Living winter (presentation only)

No rule changes: everything reads public state (`round`, `morale`, active player, `phase`, `result`).

| | What | Where |
|---|---|---|
| 1 | **Weather follows the game** — snow amount, wind and fog grow with rounds passed and falling morale (light flurries early, blizzard when the colony is failing). Uses `drawRange` on the existing snow points (no extra cost). | `src/render/atmosphere.js` (`atmosphereFor`, `createAtmosphere`), `stage.setWeather` |
| 2 | **Dusk through the round + bonfire** — sky/moon light and fog colour shift from day to night as each player takes their turn; the colony bonfire light and flame follow morale. | `atmosphere.js`, `board.setFire` |
| 3 | **Footprints** — every move scene leaves voxel prints in the snow from gate to door, laid one by one, fading over ~2 rounds. One `InstancedMesh`, a fixed pool (60, 40 on phones), oldest reused; prints sit on the real snow height (raycast). | `src/render/footprints.js`, `main.js` `playScene` |
| 6 | **Endings** — win: storm calms, fire blazes, warm vignette, *"The fire still burns…"*; loss: blizzard, fire out, white frost vignette, *"Snow settles over the palisade…"*. Camera goes to the colony; **Look at the colony** hides the card (and HUD) to see the scene, **Show results** brings it back. | `atmosphere.js`, `modals.js` `gameOverModal`, `style.css` (step 20) |

Items 4 (journal) and 5 (audio) were cut from this step.

Tests: `tests/winter.test.js` (atmosphere mapping, footprint path and pool). Screenshots: `node scripts/e2e/capture-step20.cjs` → `docs/screenshots/step20/`.
