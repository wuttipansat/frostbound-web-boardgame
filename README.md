# FROSTBOUND

A **solo** voxel survival board game for the browser, built with Three.js, Vite and a pure rules engine.
You lead a small team of survivors through a frozen, zombie-filled winter: scavenge, fight, feed the
colony and get through a crisis every round.

> **Status: rework in progress.** The game is being rebuilt step by step into a 30–40 day solo
> survival game (days instead of rounds, AP per survivor, 100 HP fights, base upgrades, a long main
> goal). The plan, step by step, is in [`docs/rework-plan.md`](docs/rework-plan.md).
> **Step 1 (done):** the game is single-player only. Multiplayer, online rooms, hot seat, AI seats,
> secret objectives, betrayer, item requests and exile votes are gone.

## Playing (current rules)

- **Setup:** pick a main objective (scenario). Options: tutorial, language (EN/TH), sound, graphics, hints.
- **Draft:** choose your starting survivor from 3 on offer.
- **Each round:** a crisis is revealed, a crossroads card may trigger, then your turn: spend energy to
  move, search, attack, barricade, clean or lure. Cards in hand are played, equipped (weapon / armor /
  book), added to the crisis or deposited for the goal. **End turn** runs the colony phase: the colony
  eats, the crisis is scored, zombies arrive.
- **Danger:** walking into zombies (or fighting bare-handed) draws from the shared danger deck.
- **Win / lose:** complete the scenario goal before time runs out; morale at 0 loses.

## Commands

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # rules + UI-helper tests, including full bot-played games checked after every action
npm run build         # static bundle in dist/
npm run balance       # bot-played outcome table per scenario
npm run e2e           # smoke test (needs `npx vite preview --port 4173` running): desktop + phone
```

Use Node 20 or later. URL options:
- framing: `?focus=colony&zoom=2.5&azimuth=-30&select=police&snow=0`
- quick start without the setup screen: `?play=1&scenario=beacon&seed=3&lang=th`

## Architecture

```
src/
  core/                 PURE rules engine: no DOM, no Three.js, JSON-serializable state
    constants.js        phases, item types, energy costs, danger deck, tunables
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
      helpers.js        wounds/death/danger cards, zombies/overrun, energy, logging
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
