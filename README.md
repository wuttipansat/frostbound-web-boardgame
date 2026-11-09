# FROSTBOUND

A **solo** voxel survival board game for the browser, built with Three.js, Vite and a pure rules engine.
You lead a small team of survivors through a frozen, zombie-filled winter: scavenge, fight, feed the
colony and get through a crisis every round.

> **Status:** the 18-step solo rework is done (Step 9, location signs, was skipped). The plan and per-step notes
> are in [`docs/rework-plan.md`](docs/rework-plan.md).

## Playing

- **Setup:** pick a scenario (default: *Build the Snow Crawler*) and a difficulty (easy / normal / hard).
- **Team:** pick 2 of 6 survivors; recruit up to 6. Each has HP 100, their own AP, ATK, a trait, skills that grow
  with use, gear (weapon / armor / book / tool) and a 3-slot backpack.
- **Each day:** dawn (crisis, daily event, weekly mission) → day (walk, search, fight, build, craft, nap, guard)
  → dusk (everyone at the colony eats; the crisis is scored) → night (the base is attacked; everyone sleeps).
- **Items** count once they are carried home to the colony stockpile. Searching may draw a zombie (the % is shown).
- **Win:** finish the 4 stages of the snow crawler before day 40. **Lose:** morale 0, everyone dead, or day 40 passes.

## Commands

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # rules + UI-helper tests, including full bot-played games checked after every action
npm run build         # static bundle in dist/
npm run balance       # bot-played crawler games per difficulty (win %, win day)
npm run e2e           # smoke test (needs `npx vite preview --port 4173` running): desktop + phone
```

Use Node 20 or later. URL options:
- framing: `?focus=colony&zoom=2.5&azimuth=-30&select=police&snow=0`
- quick start without the setup screen: `?play=1&scenario=beacon&seed=3&lang=th`

## Architecture

```
src/
  core/                 PURE rules engine: no DOM, no Three.js, JSON-serializable state
    constants.js        phases, item types, AP costs, fights, sleep, food, siege, tunables
    rng.js              seeded RNG; its seed lives in state.rng, so games replay deterministically
    state.js            createGame({ scenarioId, seed }) -> GameState (one `team`)
    actions.js          action types + creators ({ type, ... } — no player ids)
    reducer.js          reduce(state, action) -> new state (never mutates); tryReduce() -> { ok, state, error }
    selectors.js        derived read-only queries for UI and renderer
    errors.js           RuleError with a stable `code` (an i18n key)
    rules/
      flow.js           draft -> round start -> turn (crossroads) -> colony phase -> end of game
      turn.js           energy actions + free actions (cards, gear, abilities)
      effects.js        data-driven effect interpreter (crossroads choices, crisis failures)
      conditions.js     predicate language (crossroads triggers)
      helpers.js        HP/death, zombies/overrun, AP, backpacks, logging
  content/              all original cards and characters, as pure data
  ai/simpleBot.js       botAction(state) -> action: next-move hints, tests, balance runs
  ai/simulate.js        headless bot-played games (tests + balance)
  render/               Three.js only; reads state, never changes it
  i18n/                 en.js + th.js UI strings, content.th.js (Thai content), format.js (log lines, effect text)
  ui/                   controller (app.js), pure option helpers (options.js), views, tutorial, director
  audio/sound.js        procedural WebAudio
  main.js               boots stage/board/pieces, board picking, labels, and the UI controller
tests/                  node:test suites
scripts/e2e/            Playwright checks (smoke, ui-audit, hud-layout, new-game, perf)
```

The UI only *reads* state through selectors and only *changes* it by dispatching actions to `reduce`,
so saving is just `serialize`/`deserialize`.
