# FROSTBOUND rework plan (solo, 30–40 days)

The game is rebuilt step by step. Each step is one commit (or a few) on its own, tested and pushed.
Numbers are starting values; Step 18 tunes them.

## Target game

- **Solo:** one player controls a team of survivors (start with 2, at most 6).
- **40 days**, each day has 4 parts: 🌅 dawn → ☀️ day → 🌆 dusk → 🌙 night.
- **No danger deck.** Everything can be calculated, except the chance that a search makes a zombie
  appear (shown as % before you press).
- **Win:** build the snow crawler before day 40. **Lose:** morale 0, everyone dead, or day 40 passes.

## Steps

| # | Step | Status |
|---|------|--------|
| 1 | Solo only: remove multiplayer, online, hot seat, AI seats, secret objectives, betrayer, requests, votes, `perPlayer` values. State has `s.team`, actions carry no player id. | **done** |
| 2 | Remove waste and the danger deck. Item art becomes empty frames (name + type colour); `public/items/<item-id>.png` is used when it exists (`docs/item-art.md` lists the files, 128×128, transparent). | **done** |
| 3 | Rounds → days (`s.day` 1–40), parts of the day, calendar on the HUD, light follows the time of day. | **done** |
| 4 | Several survivors: pick 2 of 6 at the start; recruit up to 6. Each survivor has location, HP, AP, ATK, gear, backpack. Remove "helpless". | |
| 5 | AP per survivor (max 60–95, odd numbers) and sleep. Night: bed 100% AP +15 HP, no bed 70% +5 HP, outside 40% +0 HP (and the zombies there attack). Guard duty (helps defend, 50% AP next day). Nap: +25 AP +5 HP, skips the day. | |
| 6 | HP 100 and fights. One attack = one zombie dead, costs 15 AP. HP lost = `max(0, zombie ferocity − (AP left + ATK)) ÷ 3` rounded up, minus armor. Walker ferocity 110, brute 150 (day 21+). Leaving a place with zombies: 5 HP per zombie. Guns: kill without losing HP, 10 AP + 1 ammo, a chance a new zombie appears (pistol 40%, shotgun 50% and kills 2, silenced rifle 15%). | |
| 7 | Expeditions: walking costs AP by distance (12 / 17 / 23), search 17 AP into the survivor's backpack (3 slots). Items count only once carried home (`s.stockpile`). A search may make a zombie appear (10–25% by place, +10% per extra search there that day; it appears, it does not bite at once). Hand items over for free at the same place. No player hand. | |
| 8 | Items: weapons (knife +6, crowbar +8, bat +10, bow +12 silent, fire axe +18, guns), armor (−2 / −3 / −5 HP per fight, snow suit), tools (flashlight, map, big backpack, sled, survival guide, tool kit), consumables (bandage +15 HP, first-aid kit +35 HP, painkillers, coffee +20 AP, chocolate, canned food, ammo, firebomb), materials (wood, scrap, cloth, tools, fuel, engine and heater parts). Loot tables per place. Crafting (needs the workshop). | |
| 9 | New location capacity: remove the slot pedestals. One floating sign per place: name, 👤 2/4, 🧟 3/6 bar, search %, cards left. 6 zombies = the place is overrun (no searching, extra zombies walk to the base). | |
| 10 | Food every day: everyone at the base eats 1. Missing food: −15 HP each, −1 morale, 50% AP next day. "Food for N days" on the HUD. | |
| 11 | A crisis every day: revealed at dawn, items handed in during the day (face up), scored at dusk. +1 needed every 10 days. | |
| 12 | Base upgrades (3 levels each, materials + AP, AP carries over): dorm, wall, greenhouse, workshop, infirmary, radio tower. | |
| 13 | Main goal: the snow crawler in 4 stages (frame, engine, heater, fuel). Rare parts in certain places. Seasons get harsher (cold day 11+, brutes day 21+, storms day 31+). | |
| 14 | Night attacks on the base: dawn forecast; at night walls and guards stop zombies first; the rest hurt people at the base. Fully predictable ("5 attack, 4 stopped"). | |
| 15 | Solo fun: a daily event card with 2 choices, traits and bonds, weekly missions, experience (skills improve with use), difficulty levels, an end-of-game summary. | |
| 16 | New scene and camera: isometric ~55°, rotate in 90° steps, 3 zoom levels; less fog, brighter day, readable night; limited palette, bigger survivors with outlines; roads with AP costs; bigger buttons and a bottom sheet on phones. | |
| 17 | Show every action: previews (path + AP, HP to lose, spawn %), animations (walk, loot flying into the backpack, hits with damage numbers, scaffolding, night attack), HP bars, toasts, a daily report, a tutorial over days 1–3. | |
| 18 | Balance, tests, deploy: a balance bot (100 games per difficulty; normal wins 35–50%, wins end on day 30–36), e2e on desktop and phone, perf, publish. | |

## Step 1 notes

- `createGame({ scenarioId, seed })` → `s.team` holds the hand, gear, energy, survivors, fallen and kills.
- Survivors no longer have an `owner`. Crisis contributions are plain card uids (face up).
- `s.result = { reason, won }`. Scenario targets are fixed numbers (`goal.target`):
  beacon 2 fuel, stores 6 food, purge 6 kills. Crises need 1 matching card.
- The bot (`src/ai/simpleBot.js`) now plays the solo team: it powers the next-move hint, the
  simulation tests and `npm run balance`.
- Removed: `src/net`, `server/`, `src/core/view.js`, `src/core/rules/social.js`,
  `src/content/objectives.js`, `src/ui/seat.js`, online / hot-seat / objective / vote / request UI and
  strings, `ws` dependency.
- Balance right now (one survivor, 60 games each): beacon 13% won, stores 8%, purge 7%. That is expected
  with a single survivor; Step 4 gives the team two, and Step 18 tunes everything.

## Step 2 notes

- Waste is gone: no `s.waste`, no clean action, used cards simply leave the game (`discardCard`).
  Crises and crossroads that used waste now cost morale or food instead.
- The danger deck is gone: no `s.danger`, `lastExposure`, infection, escalation. Moving into zombies
  and bare-handed fights carry no risk until HP fights (Step 6). Crossroads "exposure" became "wound".
- Abilities that only touched waste or danger cards were replaced:
  Maren `roadRunner` (move −5), Ilse `sharpshooter` (attack −5), Wren `handy` (barricade −5),
  Bo `coldProof` (no night extra), Ezra `haggler` (junk gives double energy).
  Padded parka and riot vest now lower move cost (−2 / −3) until armor protects HP in Step 6.
- Item pictures: the old sprites were removed. `art.item()` shows an empty dashed frame in the item type's
  colour and checks `public/items/<id>.png` once; when the file exists it replaces the frame.

## Step 3 notes

- `s.round` → `s.day` (1–40), `scenario.rounds` → `scenario.days` (all 40). `s.time` is
  `dawn` (crisis, crossroads) → `day` (your actions) → `dusk` (food, crisis) → `night` (zombies), then the next dawn.
- HUD: a calendar block ("Day 12/40", time of day, storm, a progress bar) and a Dawn · Day · Dusk · Night strip.
  The board's light follows `s.time`; the night report is shown at night. The button says "End the day →".
- The old "even rounds are night" cost became **storm days** (every 3rd day: outside actions +4; Bo ignores it).
- Scenario targets for 40 days: beacon 8 fuel, stores 12 food, purge 25 kills (placeholders until Step 13).
- Balance: with one survivor the bot now loses almost every 40-day game (morale runs out by day 6–10).
  Expected; Steps 4–14 add the team, sleep, food and base systems that make 40 days survivable.
