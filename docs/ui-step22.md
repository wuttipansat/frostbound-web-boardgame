# Step 22 — Smooth and fast

| | What | Where |
|---|---|---|
| 1 | **Graphics tiers + governor.** `high` (post, 4096 shadows, ratio 2, all snow) → `medium` (ratio 1.25, 2048, 60% snow) → `low` (no post, 1024, 35% snow). **Auto** starts at high (medium on phones / small CPUs), steps down after two slow 2 s windows (< 40 fps) and climbs back only after 6 fast windows (> 57 fps), never right after stepping down and never above its start. **Settings → Graphics: Auto / High / Battery saver** (saver = low tier at 30 fps); saved. `?gfx=` overrides it for tests. | `src/render/perf.js`, `stage.setTier`, `modals.js` |
| 2 | **Faster load.** three.js has its own long-cached chunk; post-processing (bloom, grade, tilt-shift) is a lazy chunk loaded only by tiers that use it, so the saver tier never downloads it. Initial JS: **231 KB gzip** (was 237 KB in one file), + 21 KB CSS. Portraits were already drawn when the browser is idle. | `vite.config.js`, `src/render/post.js` |
| 3 | **Loading screen** in plain inline HTML/CSS (shows before any script): title, snow, progress bar; fades once the first frame is drawn. | `index.html`, `main.js` `boot()` |
| 4 | **Draw less when nobody looks.** A hidden tab draws nothing and pauses the audio clock; behind the opaque pass-the-device / draft / objective screens only 1 frame in 4 is drawn, and game time keeps running. | `stage.js` loop, `sound.pause` |
| 5 | **`npm run e2e:perf`**: gzip budgets (entry 130 KB, three 135 KB, initial 300 KB), separate post chunk, loading screen appears and goes away, saver never fetches post and survives a reload, the covered screen throttles, frame cost reported. | `scripts/e2e/perf.cjs` |

Tests: `tests/perf.test.js` (governor). Screenshots: `node scripts/e2e/capture-step22.cjs`.
