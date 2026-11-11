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

### UI-7 — first minute and readability (done)
- Draft on phones is a 2-column grid (no sideways cut-off); the title stays on screen.
- The day tip waits until dialogs are closed and is skipped while the tutorial runs; tips stay 7 s. Messages sit under the top bar on phones.
- Suggestions fade after 6 s and the same one shows once a day.
- Place card: every number has a word; upgrades and recipes are rows with level, effect and cost (`เศษเหล็ก 1/3`, green when enough).
- Card sheet: says when the selected survivor cannot reach the card, lists why a target is blocked, "บริจาคให้วิกฤต" with a one-line rule.
- Night report: one boxed line per event, the continue button is always visible. Crossroads result shows only the chosen option.
- Phone camera fits the whole island with its pins. Not done: skipping the day-1 crossroads during the tutorial (needs a core change).

### UI-8 — item tiles, faces to tap, base-only barricades (done)
- Crossroads show who they happen to (face + name), before and after the choice; party-wide energy says "ทุกคน".
- Items are small square tiles with an icon and the name under it; details stay in the sheet.
- Walking: one button per survivor elsewhere, with their face. Giving: tap a face (or the stockpile button).
- Rule change: barricades only at the colony. Tool cards add barricades at the base at once (no target; the card must be at the base). Bot and tests updated.
- Action costs show the energy icon instead of "AP".

### UI-9 — endless winter, no nap, icons (done)
- No day limit: scenarios have `days: 0` (no time-out); the top bar shows only the day number. Bots, the balance script and simulation tests still play a fixed 40-day winter (`createGame({ days })`) so they finish.
- Nap removed from the UI and the bot (the reducer action stays for old saves and tests).
- Energy shows a yellow lightning icon; HP in costs shows a red heart. The HP bar on faces is unchanged.

### Build shifts and the night attack (done)
- Building is done in shifts: each tap puts a fixed 20 AP (or what is left of the job) from one survivor, who must have that much. Progress still carries over between taps, survivors and days. The upgrade rows show "ครั้งละ 20".
- Night attack is not random: zombies = 1 + 1 per 4 days (+difficulty) + zombies at the gate; wall level, guards and barricades stop that many; each remaining bite is −10 HP, handed round to survivors at the colony from the healthiest down. Nobody home: −1 food per bite. The "today" card now names who will be bitten and for how much.

### UI-10 — fog of war (done)
- Start: colony, grocery and gas are open; police, school, hospital and library sit under white fog with a "?" pin.
- New action SCOUT (15 AP, from an open place in town): opens that place's locked neighbours on the circle (NEIGHBORS in constants). Locked places reject move and lure (`locked`); restock and random item draws skip them. Old saves without `s.unlocked` keep the whole town open.
- Rare crawler parts moved off the gas station (library now has 2 engine parts), so the goal needs scouting.
- Rendering: 16 soft sprite puffs per locked place; buildings are buried under it and rise as it rolls back (~1.5 s). Tapping a fogged place opens the action bar with Scout buttons (faces of survivors at a neighbour) or a hint where to stand.
- Bot scouts when needed parts are only under the fog, or from day 3. Balance crawler normal (30 games): 27% (was 30%).
- Not done from the prompt: the board does not physically grow and camera limits do not change with the open area — the fog lifts by sector over the same island.
- Fixed: a faded suggestion left an empty box on screen.

### UI-13 part A–B — snowed-in city ground (done)
- docs/art-style.md: the style guide.
- The board is a floating square slab over a dark backdrop (no sky); desktop view zoomed out to show it whole.
- Streets: packed snow with dark asphalt ruts, slush, half-buried dashes, sidewalk tiles and kerbs.
- Props (src/render/props.js, instanced): wrecked cars (3 variants, one with headlights), street lamps, snow-capped container stacks.
- Left for parts C–D: new place buildings (neon signs, roof props, ruins), characters in winter clothes, voxel item icons, fog along the slab edge, day/night tint.

### UI-13 part C — city buildings (done, take 2)
- The first pass (upscaled boxes) looked flat; redone at full voxel resolution in `src/render/city.js`, using the user's reference image for style only (own models).
- Layout is now a 3×3 grid of city blocks with straight streets (colony in the middle, two filler blocks: a fenced parking lot and a container yard). Every building's front faces a side the camera sees.
- Buildings: hollow concrete shells with floor ledges, framed windows (lit / dark / broken / boarded), shopfronts with shutters and awnings, balconies, drainpipes, wall and roof AC units, stair huts, water tanks, moss, graffiti, neon signs with one dead letter (POLICE, MART, SCHOOL, ER + red cross, BOOKS, GAS). Library has a collapsed corner; colony is a container-wall fort with barricaded gates.
- Streets are ploughed asphalt with a centre dash and snow banks; moonlight moved to light the visible façades.
- Tests updated for the grid layout and full-resolution models.

### The city grows instead of fog (done)
- The white fog puffs are gone. The board is split into its 9 grid blocks (terrain chunk, building and props per block); a locked block is not drawn at all.
- Start: colony, gas station and grocery (plus nothing else). Scouting opens a place's block, which rises into place (~1.25 s); a filler block (parking lot, container yard) appears once a place next to it is open.
- '?' markers only on the next blocks that can be opened. The usual camera view (and its reset button) fits the open blocks and widens as the city grows.

### MAP-1 items 1–7 — the city grows by finding maps (done)
- Scouting, the fog list (`unlocked`, `START_OPEN`, `NEIGHBORS`), the '?' pins and the green move/lure rings are gone. Old saves load as the stage-1 town.
- `src/core/map.js`: `s.map = { stage, blocks: { 'bx,bz': { kind, placeId?, type? } }, roads: [street segments on block edges], searchesSinceMap, pending }`. Stage 1 is the fixed 3×3 town. Stage n has a (2n+1)×(2n+1) outline; each growth adds the next ring, leaves out ~18% of it (45% of corners), pokes 1–3 blocks one step further, stays connected and never removes a block.
- About one new block in three holds a place (at least two per growth), picked from a weighted table that favours the new, harder types as stages go up: warehouse, motel, apartment block, church, farmhouse (plus repeats of the first six, e.g. `grocery-2`). Others are plaza, parking lot, container yard, park, ruins or rail yard. New places further out can start with zombies, and searching there is a little riskier per ring.
- Streets: dead ends on the old outline keep going (sometimes bending), every new block gets a street on one of its sides by a shortest path with random turns, plus a few dead-end spurs. Walking = 12 + 4 per block of street (cap 40); every stage-1 place costs 16 from the colony.
- Places are dynamic (`placesOf`, `outsideOf`, `locDef`, `typeOf`); spawns, siege, restock, bot and UI work with any number. Restock only covers places up to one ring past the furthest survivor.
- City map (`city-map-piece`, "แผนที่เมือง"): found only by searching. Search k since the last map: none before the range, then 1 / (max − k + 1), certain at max. Range for the map that opens stage n+1 = [3n²+2, 4n²+4] (5–8, 14–20, 29–40, 50–68 …: wider cities need more searching). Reading it at the colony grows the city one stage; toasts "พบแผนที่เมือง" / "เมืองขยาย". The old "City Map" gadget is now "Shortcut Map" (แผนที่ทางลัด).
- Board: built from the map, one group per block (terrain piece, building / filler model) plus one instanced prop group per growth; old blocks next to new ones get fresh terrain. New blocks rise in order outward from the colony. The usual camera view fits the outline and the zoom-out limit follows it. Five new building models and four new filler blocks in `src/render/city.js`.
- Bot: reads a map as soon as it is home and weighs the walk when choosing where to go. Balance crawler normal (30 games): 27% (unchanged).
- Left for items 8–13: chunk-level pop-in with bounce and snow puff, pan-only camera with clamping, culling and merging for big cities, screenshots at stage 4.

### MAP-1b — places in chunks (done)
- A block's area inside its sidewalks is 3×3 chunks (~6.4 world each). A place covers 2×2 chunks (church and apartment block 1×2; some repeat places such as `grocery-2` are a smaller 2×1 branch) on its street side; its model is scaled to fit (about 0.6–0.85×).
- The free chunks of a place's block hold small closed-up buildings (8 variants, 1–4 floors, `city.smallBuilding`), a cluster of trees, a parked car or a container stack. All are instanced per growth.
- A place block is flat ground; survivor pads sit on the sidewalk in front of the place, zombies on its forecourt.

### MAP-1c — two places at the start, 2–3 per stage, richer city (done)
- Stage 1: the colony, the grocery and the gas station; the other six blocks are decoration (shops, parking, ruins, plaza, containers, park). Old saves (and rule tests, via `createGame({ fullTown: true })`) keep the six-place town.
- Each growth adds 2–3 places. The four missing originals come first (library, hospital, police, school) and appear in the decoration blocks nearest the colony, so early walks stay short; after that, new places are drawn from the weighted table in the new ring.
- The town turns up at least 6 items a day (restock spreads over the known places), so a small town is not starved. The first map is found within 3–5 searches. Balance crawler normal (30 games): 33% (3–6: 37%, 4–7: 20%; a 30-game run varies by about ±8%).
- Every place and small building shares one voxel size (0.3 × 0.8). The shared building code adds fire escapes on tall buildings, satellite dishes, roof plants and debris, warning signs; the grocery has a lit billboard, the motel a walkway on columns with a railing and upstairs doors, and a roof-edge MOTEL sign with a dead letter. Church is one chunk wide.
- Decoration blocks are built from chunks: a fenced parking lot (2×2), a frozen fountain, small ruined buildings with stepped broken walls, shops, houses, trees, parked cars (4 kinds, incl. a taxi and a van with headlights on), container stacks and clutter. Each block owns its chunk props, so a decoration block that turns into a place is rebuilt and rises again.
- Ground: built-up blocks are flat square paving with grout, grass in the cracks, missing tiles and drifted snow; zebra crossings at junctions; lamps on both sides of every street; cones, crates, barrels, trash bags and barriers on the sidewalks.

### MAP-2 part A — stable blocks (done)
- Every block stores its front side when it is created (`frontOf`); layouts and chunk plans read it, so an old block looks the same however the streets grow. No block ever changes kind.
- The originals come in the new ring: stage 2 brings library + hospital, stage 3 police + school, each on the new block with the shortest road to the colony; other places from the weighted table. New places start with 0 … stage−2 zombies.
- Walking = 14 + 2 per block of street (16 from the colony to a stage-1 place); first map in 3–4 searches. Balance crawler normal (30 games): 27%.
- Test: after two growths, every old place keeps its centre and every old decoration block its chunk plan.

### MAP-2 part B — finer voxels (done, with limits)
- City models (places, colony, small buildings, ruins, parking lot, fountain, rail yard) go through `refineCity`: built at 2× (0.12 world per voxel at the usual scale) with glazing bars and frames on windows, brick courses, metal ribs and wood grain, snow caps one fine voxel thick, and thin parts (posts, rails, fences, ledges, awnings, signs) at half thickness.
- Plain painted walls and snow stay flat so faces merge: stage 1 is ~0.74 M triangles (was ~0.35 M). Cars and street clutter no longer cast shadows.
- Not done: terrain stays at 0.5 world per cell (0.25 would quadruple the ground triangles); models were refined, not redrawn by hand.

### MAP-2 part C — pop-in and a pan-only camera (done)
- New blocks pop in: the ground rises (0.3 s), every chunk piece and street prop pops up with a small overshoot (scale 0.6 → 1.05 → 1, y −6 → 0), later the further it is from the colony, and the building lands last with a puff of snow (a small pool of point clouds). A growth takes under ~3 s; matrices are updated in place.
- The camera has a fixed angle: drag / one finger pans, wheel / pinch zooms; Q/E, right-drag and two-finger turning are gone. Panning stays inside the city outline + 1 block; the home view eases out when the city grows.
- Not done: the very first build of a game still appears at once (the board is built before the game starts).

### MAP-2 part D — big-city performance (done)
- Chunk pieces and street props of one growth share one instanced set (draw calls: 766 → ~240 at stage 4).
- Levels of detail by zoom: zoom ≥ 0.8 fine (2×) models, 0.5–0.8 the authored ones, below 0.5 half-resolution copies, coarser ground (1 world per cell), half-resolution trees and containers, and no cars, lamps, rocks or clutter.
- Instanced bounds are recomputed after pop-in so culling is right; pins of places off screen are hidden and skip layout reads.
- Stage 4 (69 blocks) whole-city view: ~0.84 M triangles drawn (was 7.4 M before the levels of detail), perf.cjs ok.

### MAP-2 part E — winter clothes, item pictures, help (done)
- Survivors wear a knit beanie with a pom-pom (a fur-trimmed hood for those with goggles or a mask), a scarf, gloves, fur boot cuffs and a padded parka collar; colours come from each survivor's id. Zombies have a torn hood or a frayed scarf and puffer stripes. Portraits are unchanged.
- Item tiles without a picture of their own show a small voxel model of the item's type (can, med kit, bandage, jerry can, hammer, planks, bat, vest, book, flashlight, junk, figure, map), rendered once by the art studio and cached; a PNG in public/items/ still wins.
- Help: a rules card for maps and the growing city (th + en); the day-2 tip no longer mentions naps. Test: help / tutorial text has no day limit, naps, scouting or fog.

### LOAD-1 part A — fast map loading (done, same pixels)
- Measured first (scripts/bench/board-load.mjs, Node): building the start board took 7.7 s, 6.8 s of it in the voxel mesher (string keys per neighbour lookup).
- Mesher rewritten on typed arrays (src/render/mesher.js): a dense Int32 grid with an empty border, greedy masks per slice, quad records (8 × Int16) expanded into preallocated buffers. Output is identical to the old mesher (tests/load.test.js compares every place, the colony and a fine city model); ~9× faster. VoxelModel keeps its Map (model code edits voxels in place) but with numeric keys.
- Levels of detail are built the first time they are shown (the start builds one level, not three); places are fitted from voxel bounds, so no mesh is needed for that.
- Baked pack: `npm run build` first runs scripts/bake-models.mjs, which builds every city model build of several cities (all stages, legacy town, all zoom levels) and writes public/models.bin (98 models, 9.9 MB raw, 2.55 MB gzip, not committed). The game fetches it once (decompressed with DecompressionStream) and makes geometry straight from the quads; a model not in the pack (e.g. church) is meshed at runtime. `?pack=0` turns it off; dev builds don't use it.
- Progressive start: ground and the colony are made at once; other models wait in a queue and are made nearest-first within 6 ms a frame (`board.pending`, `board.flush()`). Growths still build at once (their pop-in needs the pieces).
- Load marks in window.__loadTimes (start, pack, board, firstFrame, allBlocks), reported by perf.cjs, which also checks the pack is used, the city finishes and no build step takes over 50 ms.
- Numbers (swiftshader, noisy): load 11.1 s → 2.3–4.9 s; board build 7.7 s → ~0.2 s; whole city ready ~3.9 s. Screenshot diff old vs new: 0 differing pixels.
- Not done: a Web Worker / IndexedDB cache path — with the pack covering every level (fine included) under 3 MB, there is little left to mesh at runtime.
