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
| 4 | Several survivors: pick 2 of 6 at the start; recruit up to 6. Each survivor has location, HP, AP, ATK, gear, backpack. Remove "helpless". | **done** (AP, HP, ATK, backpack come in Steps 5–7) |
| 5 | AP per survivor (max 60–95, odd numbers) and sleep. Night: bed 100% AP +15 HP, no bed 70% +5 HP, outside 40% +0 HP (and the zombies there attack). Guard duty (helps defend, 50% AP next day). Nap: +25 AP +5 HP, skips the day. | **done** (HP is tracked; zombie bites outside come in Step 6) |
| 6 | HP 100 and fights. One attack = one zombie dead, costs 15 AP. HP lost = `max(0, zombie ferocity − (AP left + ATK)) ÷ 3` rounded up, minus armor. Walker ferocity 110, brute 150 (day 21+). Leaving a place with zombies: 5 HP per zombie. Guns: kill without losing HP, 10 AP + 1 ammo, a chance a new zombie appears (pistol 40%, shotgun 50% and kills 2, silenced rifle 15%). | **done** |
| 7 | Expeditions: walking costs AP by distance (12 / 17 / 23), search 17 AP into the survivor's backpack (3 slots). Items count only once carried home (`s.stockpile`). A search may make a zombie appear (10–25% by place, +10% per extra search there that day; it appears, it does not bite at once). Hand items over for free at the same place. No player hand. | **done** |
| 8 | Items: weapons (knife +6, crowbar +8, bat +10, bow +12 silent, fire axe +18, guns), armor (−2 / −3 / −5 HP per fight, snow suit), tools (flashlight, map, big backpack, sled, survival guide, tool kit), consumables (bandage +15 HP, first-aid kit +35 HP, painkillers, coffee +20 AP, chocolate, canned food, ammo, firebomb), materials (wood, scrap, cloth, tools, fuel, engine and heater parts). Loot tables per place. Crafting (needs the workshop). | **done** (crafting at the colony; the workshop gate comes in Step 12) |
| 9 | New location capacity: remove the slot pedestals. One floating sign per place: name, 👤 2/4, 🧟 3/6 bar, search %, cards left. 6 zombies = the place is overrun (no searching, extra zombies walk to the base). | **done** (after Step 18) |
| 10 | Food every day: everyone at the base eats 1. Missing food: −15 HP each, −1 morale, 50% AP next day. "Food for N days" on the HUD. | **done** |
| 11 | A crisis every day: revealed at dawn, items handed in during the day (face up), scored at dusk. +1 needed every 10 days. | **done** |
| 12 | Base upgrades (3 levels each, materials + AP, AP carries over): dorm, wall, greenhouse, workshop, infirmary, radio tower. | **done** |
| 13 | Main goal: the snow crawler in 4 stages (frame, engine, heater, fuel). Rare parts in certain places. Seasons get harsher (cold day 11+, brutes day 21+, storms day 31+). | **done** |
| 14 | Night attacks on the base: dawn forecast; at night walls and guards stop zombies first; the rest hurt people at the base. Fully predictable ("5 attack, 4 stopped"). | **done** |
| 15 | Solo fun: a daily event card with 2 choices, traits and bonds, weekly missions, experience (skills improve with use), difficulty levels, an end-of-game summary. | **done** |
| 16 | New scene and camera: isometric ~55°, rotate in 90° steps, 3 zoom levels; less fog, brighter day, readable night; limited palette, bigger survivors with outlines; roads with AP costs; bigger buttons and a bottom sheet on phones. | **done** (palette unchanged) |
| 17 | Show every action: previews (path + AP, HP to lose, spawn %), animations (walk, loot flying into the backpack, hits with damage numbers, scaffolding, night attack), HP bars, toasts, a daily report, a tutorial over days 1–3. | **done** |
| 18 | Balance, tests, deploy: a balance bot (100 games per difficulty; normal wins 35–50%, wins end on day 30–36), e2e on desktop and phone, perf, publish. | **done** (normal 34%, wins on day ~29) |

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

## Step 4 notes

- Start: pick **2 of 6** survivors. The team holds at most **6** (`RULES.TEAM_MAX`).
- Newcomers join the team at the colony: survivor cards (+1 morale; a full team gives +2 morale instead)
  and the crossroads effect `recruit` (a full team: +1 morale).
- "Helpless" is gone: no counter, no food or spawns for them. Crossroads that added or lost helpless now
  recruit or cost morale; crises that killed helpless now wound the team.
- Gear is per survivor (`survivor.gear`): equipping asks who wears it; a blueprint works for its wearer;
  books with a team passive (cookbook, field manual, survival guide) count for everyone. A survivor who dies
  drops their gear back into the hand.
- The energy pool is still shared by the team (the lead survivor's pool) until Step 5 gives each survivor AP.
- HUD: a Team counter (n/6) replaces Helpless; the draft screen shows 6 cards and asks for 2.

## Step 5 notes

- Each survivor has their own AP (`survivor.ap`, max = the survivor's `energy`: odd numbers 69–95, −20 with 2+ wounds).
  No more shared team pool or per-turn regen. Actions spend the acting survivor's AP.
- Night (after the zombies arrive): **bed** 100% of max AP +15 HP, **floor** 70% +5 HP (the colony has
  `RULES.BEDS` = 2 beds, given to the most tired first; the dorm adds more in Step 12), **outside** 40%,
  **guard** 50%. Dot +15, a survival guide +value, starving −20. AP carries over, capped at the max.
- **Guard duty** (`setRest(id, 'guard')`, at the colony): each guard stops one colony zombie tonight.
- **Nap** (`nap(id)`, at the colony, before acting): +25 AP +5 HP, no more actions for that survivor today.
- `survivor.hp` (100) exists and is healed by sleep and naps; fights start using it in Step 6.
- Junk cards and crossroads `energy` give AP to a chosen survivor / everyone.
- UI: AP on each token, the meter shows the selected survivor and tonight's sleep, nap and guard buttons.
- Balance (bot, 30 games): beacon 80% won, stores 90%, purge 90% — far too easy now that every survivor has a
  full pool; HP fights (Step 6), food (Step 10) and night attacks (Step 14) bring the danger back.

## Step 6 notes

- Melee: 15 AP, kills 1 zombie for sure (Teodor 2). HP lost = `ceil(max(0, ferocity − (AP left + ATK)) / 3) − armor`.
  Ferocity 110 (walkers), 150 from day 21 (brutes). ATK = (7 − attack skill) × 4 (4..20) + melee weapon
  (baton +8, fire axe +18). Armor: parka 2, riot vest 3. HP 0 = dead.
- Guns: 10 AP + 1 ammo, no HP lost, kills `value` (shotgun 2). Noise may draw a zombie: Glock 40%, shotgun 50%,
  Mosin (silenced rifle) 15%. A gun comes loaded (6 / 4 / 5 rounds) on `survivor.ammo`; ammo items come in Step 8.
- Leaving a place with zombies: 5 HP per zombie (driving with fuel avoids it). Sleeping outside: 5 HP per zombie there.
- `fightPreview(s, id)` drives the attack button tooltip (HP to lose / noise %) and the bot. Tokens show an HP bar.
- Wounds and medicine cards still work as before; Step 8 moves healing to HP items.
- Balance (bot, 30 games): beacon 63% won, stores 73%, purge 67%.

## Step 7 notes

- No player hand: items are in the colony **stockpile** (`s.stockpile`) or a survivor's **backpack**
  (`survivor.pack`, 3 slots). Searching puts items in the searcher's backpack; walking into the colony
  (or being there at dusk) unpacks it. Crises, deposits and eating food only take items that are home.
  Medicine, tools, junk, fuel and gear work where the item is (same place as the survivor).
- `give(cardUid, toSurvivorId)` hands an item over for free at the same place (null = into the stockpile).
- Walking costs by distance (`RING`): near 12 (grocery, school), mid 17 (gas, library), far 23 (police, hospital).
- Search costs 17 AP. The chance a zombie appears: grocery / library 10%, school / gas 15%, hospital 20%,
  police 25%, +10% for every earlier search there today (`searchSpawnChance`, shown on the search button).
- A survivor who dies at the colony leaves gear and backpack in the stockpile; out there they are lost.
- Balance (bot, 30 games): beacon 23% won, stores 27%, purge 43%.

## Step 8 notes

- New item types: **gadget** (a 4th gear slot, `tool`), **consumable** (used on a survivor at the same place),
  **material** (crafting now; base upgrades and the snow crawler later). Old items stay.
- Melee: kitchen knife +6, crowbar +8 (riot baton +8), baseball bat +10, hunting bow +12, fire axe +18.
  Armor: parka 2, riot vest 3, scrap plate 5, snow suit 1 + no storm cost.
- Gadgets: flashlight (search −5), city map (walk −3), big backpack (+2 slots), sled (+3 slots, walk +2),
  tool kit (barricade −5). The survival guide stays a book.
- Consumables: bandage +15 HP, first-aid kit +35, painkillers +10 HP +10 AP, coffee +20 AP, chocolate +10 AP +5 HP,
  ammo +6 rounds (needs a gun), firebomb kills up to 3 zombies here.
- Materials: wood, scrap, cloth, engine part (gas station), heater part (school).
- Some new items also count for crises (`counts`): bandages / painkillers / first-aid kits / cloth as medicine,
  coffee / chocolate as food, wood / scrap as tools, ammo / firebomb as weapons.
- Crafting (`craft(recipeId, survivorId)`, at the colony, stockpile materials + AP): bandage (cloth, 5 AP),
  firebomb (fuel + cloth, 5), baseball bat (2 wood, 10), scrap plate (2 scrap + cloth, 15),
  sled (2 wood + scrap, 15), socket set for barricades (wood + scrap, 5). Craft buttons are in the colony panel.
- Loot: every place got a few new items (about +6 cards each); `docs/item-art.md` lists all 53 picture files.
- Balance (bot, 30 games): beacon 3% won, stores 10%, purge 3%. Bigger decks mean fewer crisis items, and
  the bot does not plan expeditions well. Step 10 (food), 11 (crises) and 18 retune this.

## Step 10 notes

- Every survivor at the colony eats 1 food at dusk (the cook and the cookbook still save 1 each).
- Not enough food: the survivors left without food (the healthiest first) lose 15 HP and wake with half
  their AP after that night; morale −1 (no more escalating starvation tokens; `s.starvation` counts hungry days in a row).
- The HUD food block shows "food for N day(s)" (`foodDays`), red when it is under 2.
- Step 9 (location signs) was skipped for now and can be done later.
- Balance (bot, 30 games): beacon 0% won, stores 3%, purge 3%. The bot needs to plan food runs; Step 18.

## Step 11 notes

- One crisis every day: drawn at dawn, items handed in face up during the day (only items at the colony),
  scored at dusk in the order they were given. Matching items +1 (also `counts` and wild items), others −1.
- Needed: the crisis's own need (1) **+1 every 10 days** (day 11: 2, day 21: 3, day 31: 4).
- `crisisScore(s)` shows the running score on the HUD ("1/2 Fuel · scored at dusk").
- Balance (bot, 30 games): beacon 0%, stores 3%, purge 3% — unchanged; Step 18.

## Step 12 notes

- `src/content/buildings.js`: 6 upgrades × 3 levels. `build(buildingId, survivorId)` at the colony: starting a level
  takes its materials (wood / scrap / cloth) from the stockpile, then the survivor puts in all their AP up to what is
  left; unfinished work (`s.building`) carries over to later days. Levels live in `s.base`.
- Effects: **dorm** +2 beds per level; **wall** stops 1 colony zombie a night per level; **greenhouse** +1 food every
  dawn per level; **workshop** is needed to craft (levels 2–3: −3 / −6 AP); **infirmary** +5 HP a night per level at the
  colony; **radio tower** 10% per level each dawn that a newcomer joins.
- UI: an "Base upgrades" row in the colony panel (level, cost or progress, effect in the tooltip).
- The bot tries to build, but it rarely brings materials home yet (0 levels in 10 test games); Step 18.

## Step 13 notes

- New main scenario **crawler** (the default in the UI): build the snow crawler in 4 stages with `build('crawler', id)`
  at the colony, like an upgrade: frame (3 scrap + 2 wood, 40 AP), engine (2 engine parts + scrap, 50),
  heater (2 heater parts + 2 cloth, 40), fuel (3 jerry cans, 20). Stage 4 done = win. The old scenarios stay as modes.
- Rare parts: engine parts at the gas station (2) and the police station (1); heater parts at the school, hospital and library (1 each).
- Seasons (shown on the HUD calendar): cold from day 11 (sleeping outside −10 HP more), brutes from day 21
  (ferocity 150), storms every day from day 31.
- Balance (bot, 30 games): crawler 0% won — the bot does not gather parts yet; Step 18 teaches it.

## Step 14 notes

- The colony no longer gets night spawns; it gets a **night attack** (`siegeForecast`, `nightSiege`):
  attackers = 1 + 1 per 4 days (day 1: 1, day 17: 5, day 37: 10) + zombies already at the colony gate.
- Stopped first: wall (1 per level), guards (1 each), colony barricades (1 each, used up). Every attacker left bites
  someone at the colony for 10 HP (round-robin, healthiest first). Nobody home: each one eats 1 food.
  Zombies at the gate stay there until killed.
- HUD block "Tonight: 5 attack, 4 stopped · 1 bite (−10 HP)", with the wall / guard / barricade numbers in the tooltip.
- Balance (bot, 30 games): crawler 0%, beacon 3%, stores 0%, purge 7%; Step 18.

## Step 15 notes

- **Daily event:** each dawn the crossroads deck is drawn until a card's trigger fits today (up to 6 tries),
  so almost every day brings a 2-choice event.
- **Traits** (one per survivor, seeded when they join): strong +4 ATK, quick walk −2, scavenger −5% search
  spawn chance, medic consumables +5 HP, night owl wakes at 70% after guard duty.
- **Bonds:** survivors who end the day at the same place gain a bond point (max 5); at 3 they are close friends and
  each one's fights cost 2 HP less while the other is there.
- **Experience:** every attack / search is +1 XP; each 5 is a level (max 3): fighting +2 ATK, searching −2 AP.
- **Weekly missions** (days 1, 8, 15, …): kill 6, search 8, finish 1 upgrade level or craft 2 items within 7 days → +2 morale.
  HUD "Mission" block with progress.
- **Difficulty** (setup screen): easy +3 food +2 morale −1 attacker a night; hard −1 food −2 morale +1 attacker.
- **End-of-game summary:** days, kills, searches, levels built, items crafted, missions, survivors lost, difficulty.
- Balance (bot, normal, 30 games): crawler 0%, beacon 0%, stores 7%, purge 23%; Step 18.

## Step 16 notes

- Camera: fixed isometric tilt 55°, no free orbit. Turn the view in 90° steps (buttons on the left, Q / E) and
  zoom in 3 levels (buttons, mouse wheel one step per gesture, + / −). Panning still works.
- Light: half the fog, brighter day light, the night keeps more light so the board stays readable.
- Survivors are 30% bigger than before and wear a dark outline (inverted hull), so they stand out from zombies.
- Roads with prices: with a survivor selected, every place's label shows what walking there costs in AP.
- Touch: buttons are at least 44 px on touch screens; the location panel was already a bottom sheet on phones.
- Fixed: the draft cards showed "NaN" for the attack cost since Step 6; they now show the survivor's ATK.
- The palette was not changed in this step.

## Step 17 notes

- Previews: walking AP on every place's label (Step 16); the attack button shows a badge with the HP it will cost
  (red when > 0) or the noise % for guns; the search button shows the zombie chance; tooltips keep the details.
- Scenes / callouts for every action: attacks show the kills and a rising red "−12 HP" (plus "the noise drew one"),
  searches show "A zombie appears!" when one does, crafting, building ("+10 AP" scaffolding, "level 2!"),
  unpacking into the stockpile, hand-overs and naps.
- Tokens have HP bars (Step 6) and AP numbers (Step 5).
- The daily report (dusk) now also shows the night attack ("5 came, 4 stopped, 1 got in"), who went hungry,
  and how everyone slept (bed / floor / outside / guard).
- Tutorial over days 1–3: a tip toast at each of the first three dawns (off when hints are off), next to the
  existing step-by-step tutorial.

## Step 18 notes

Balance changes (all found with `npm run balance`, the bot playing 100 crawler games per difficulty):
- **Supply:** every dawn each outside place gets 1 new item from its own loot table (`restock`); the crawler's
  rare parts never restock and start in the lower half of their pile. A food card feeds 4 × its value.
  More wood / scrap / cloth in the loot tables.
- **Crawler stages:** frame 3 scrap + 2 wood (100 AP), engine 2 engine parts + 1 scrap (100), heater 2 heater
  parts + 2 cloth (100), fuel 3 jerry cans (50). The crawler scenario starts with morale 10 and 6 food.
- **Morale:** an averted crisis always gives +1; crisis failures cost at most −1 morale; the crisis needs +1 item
  every 15 days (was 10); weekly missions give +3.
- **Overrun:** no longer kills outright; the weakest survivor there loses 30 HP.
- Old scenarios retargeted for 40 days: beacon 15 fuel, stores 60 food, purge 60 kills.
- **Bot:** goes home before running out of AP (or with a full pack / low HP), searches where the next crawler stage's
  materials are (and for food when the larder is low), keeps crawler materials out of crises, builds the crawler
  first, builds other upgrades only with leftover AP, recruits only with food to spare.

Results (100 games each):

| difficulty | won | average win day | average loss day |
|---|---|---|---|
| easy | 46% | 27.3 | 38.6 |
| normal | 34% | 29.0 | 38.0 |
| hard | 24% | 30.1 | 35.7 |

Normal is just under the 35–50% target and wins come about a day earlier than 30–36; the bot is weaker than a
careful player, so this is a reasonable place to stop. Old scenarios, normal, 30 games: beacon 30%, stores 57%, purge 57%.

Tests and checks: `npm test` 139 passing; e2e smoke on desktop and phone, HUD layout (no overlaps), UI audit,
and perf (initial download 251 kB as the perf script measures it, 3 ms frames) all pass.

Publish: `.github/workflows/pages.yml` builds, tests and deploys `dist/` to GitHub Pages on pushes to `main` (or by
hand from the Actions tab). One-time setup: Settings → Pages → Source: GitHub Actions.

## Step 9 notes (done after Step 18) and leftovers

- Balance after this change (bot, normal, 50 games): crawler 34% won, average win day 28.9.
- Every outside place holds **6 zombies**. At 6 it is **overrun**: no searching there, and extra zombies walk on to
  the colony gate (they join the night attack). A full colony gate still hurts the weakest survivor there (30 HP).
- The slot pedestals are gone. Each place has one floating sign: name, 👤 people / max, 🧟 n/6 with a bar, the search
  zombie chance (or "overrun"), items left, and the walk price in AP when a survivor is selected. The hover name tag
  is hidden (the sign carries the name).
- Night attack scene: at night a callout over the colony shows a row of skulls (the stopped ones greyed out),
  "5 attack · 4 stopped" and the HP lost.
- Limited palette: near-duplicate tones now share one swatch (snow shades, road, wood, pine, window, danger, slot).

## UI rework (UI-1 … UI-5): less on screen

- **UI-1 camera:** free again — drag to pan, two fingers / right drag to turn, pinch / wheel to zoom (tilt 40–65°).
  One small "usual view" button bottom right; Q / E / + / − still work.
- **UI-2 top bar:** one row — morale, day, food, an ⓘ "Today" button (red dot when tonight bites or the crisis is short)
  and a menu (rules, log, settings). The "Today" card holds the crisis, the night attack, the goal, the mission and the team.
- **UI-3 pins:** each place shows only a small pin (zombies, our people, red ring when overrun). Tap it to open the place.
- **UI-4 ring:** tapping a place floats small round icons in an arc over it, for the selected survivor (or the first who can
  act). Elsewhere: walk (and drive with fuel), with the AP and any HP lost on the icon. Here: search / attack / barricade /
  lure (outside) or nap / guard / build (colony), with AP and risk badges; disabled icons stay in place and explain on tap.
  ⓘ opens the place card (stats, build, craft). Walking from the colony to a place and searching takes 3 taps.
- **UI-5 items:** folded into one round button with the item count. Open: tabs for the stockpile and each backpack;
  using a card folds the list again.
- e2e: smoke walks and searches through the ring; hud-layout checks the ring at all 7 places on desktop, tablet and phone.

### UI-6 — one place per piece of info (done)
- The ring of round icons is gone: tapping a place opens an **action bar** on the bottom edge (place name, zombies / people, who acts, labelled buttons with "AP 17 · เสี่ยง 25%"). Attack and lure only show when zombies are there; lure targets are picked in the same bar. The camera pans (never zooms) when the place would sit under the bar.
- Survivor faces: one HP bar (green / yellow / red), AP under the face, wounds as a small red count. The energy chip, the floating day chip and the bottom ⋯ menu are removed (sound moved to the top ⋯ menu).
- Items: the button counts what the selected survivor can use now (stockpile at the colony, own pack `x/3` elsewhere). The open list has a header ("เป้ของ Juno · 1/3" / "คลังที่ฐาน · 4 ชิ้น") and tags lists that cannot be used from here. On phones it is a bottom sheet with full-size cards; cards without art show their type icon.
- Pins carry the place name; the "today" card stays on screen with labels; the view button is fixed top-right; the end-day dialog names survivors who would sleep outside; a search says what it found.
- `ui-audit.cjs` removed (stale selectors); `hud-layout.cjs` checks the action bar and the "today" card.
- Left for UI-7: draft screen cut-off, opening sequence (tutorial + crossroads + tip at once), default phone zoom, upgrade costs on the colony card, night summary layout. Phones do not show day/night in the top bar (no room).
