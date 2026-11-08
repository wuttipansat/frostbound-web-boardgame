# Step 21 — Colony journal + winter sounds (presentation only)

| | What | Where |
|---|---|---|
| 1 | **Journal tab** in the log panel (Log / Journal): the public log retold as diary lines grouped by day, newest first, each day headed by its summary. Names, places and counts only, never which card. Pinning the log now also opens it on phones. | `src/ui/journal.js`, `hud.js` `journalView` |
| 2 | **Day summary** on the colony report: "Day 2: 1 lost · morale −2" (quiet days say so). | `daySummary`, `modals.js` `colonyModal` |
| 3 | **Ambience follows the weather** (step 20): wind gets louder, brighter and gustier with the storm, and the fire crackles with the bonfire (none when it is out). **Sound on/off** in the ⋯ menu (saved, same as settings). | `src/audio/sound.js` `setWeather`, `player.js` |
| 4 | **"How it went"** on the end screen: the 4 heaviest journal lines (deaths, exiles, failed crises, overruns…) in story order. | `highlights`, `gameOverModal` |

Fixes: `crisisOpen`/`peek`/`draftPicks`/`req` were hidden inside a comment in the initial UI state, so they were never initialised; the rolled dice no longer cover the ⋯ menu on phones.

Tests: `tests/journal.test.js`. Screenshots: `node scripts/e2e/capture-step21.cjs` → `docs/screenshots/step21/`.
