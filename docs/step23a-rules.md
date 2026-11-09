# Step 23a — Frostbound rules (core, AI, tests; plain UI)

New games use **Frostbound** rules; **Classic dice** stays in Setup → More (`?rules=classic`). The core
default is still classic, so old saves and every existing seed play exactly as before.

## Energy instead of action dice
- Each player: start **100**, **+70** at the start of each turn, unspent energy **carries over**, cap 100
  (80 while one of your survivors has 2+ wounds). Starving colony: +50. Dot (extra die): +15.
- Costs (odd on purpose): move **13**, search **23**, attack **17**, barricade **19**, lure **11**, clean **14**;
  playing / giving / contributing cards is free.
- Modifiers: 2+ zombies here → search/barricade **+7**; hospital/police search **+7**; Teodor's double kill **+5**;
  night (even rounds) outside **+4**.
- Moving is no longer free-once: it costs energy and can be repeated. Junk cards give 12 energy per value;
  "gain/lose a die" effects are ±20 energy.

## Danger deck instead of the exposure die
- Shared 20 cards: safe 9, scratch 4 (wound), frost 3 (frostbite wound, −15 next regen), startle 2 (−10 energy),
  surrounded 1 (+1 zombie here), bite 1 (death, infection spreads).
- Draw when: walking **into a place with zombies** (empty places are safe), **attacking bare-handed**
  (a weapon in hand protects), **searching deeper**, crossroads "exposure", infection.
- Discards reshuffle when the deck runs out. End of rounds 3 and 6: **+1 bite**. A failed crisis: **+1 scratch**.
- Order is secret (`viewFor` sends only `danger.left` counts); counts are public.
- Abilities keep their meaning: Maren's moves never draw, Ilse's attacks never draw, Ezra draws two and keeps the
  better, Bo ignores frost.

## Search deeper
Right after a search, the same survivor may **search deeper** for free: one more card, then a danger card.
Repeatable; any paid action ends it.

## Threat forecast
`spawnForecast(state)` = what the colony phase will spawn if the round ended now; the colony phase now uses it.
The location sheet shows it as "+N".

## AI
Value per energy: deeper search while bite odds ≤ 9% and the survivor has ≤ 1 wound, fight crowds (bare-handed only
at 3+), scavenge, barricade the colony against the forecast, walk to empty places first, home when hurt; hunts on
"kills" scenarios, heads to the grocery when food is short.

## Balance (bots, 60 games per cell, `node scripts/balance.mjs 60 [classic]`)
| | Classic wins | Frostbound wins |
|---|---|---|
| Beacon 2–5p | 0–5% | 10–38% |
| Stores 2–5p | 0–5% | 2–13% |
| Purge 2–5p | 3–12% | 0–7% |

Bots now win more often under Frostbound rules, but they are far from the 40–60% target, mostly because of starvation
and failed crises (base-game numbers that both rule sets share). Humans should do better than these bots; tuning
continues with real play.

## Plain UI (23b polishes)
Energy meter (number + bar) instead of dice chips; action buttons show their energy cost; a "search deeper"
button; forecast "+N" on the location sheet; danger results reuse the exposure popups (no die tumble);
log/hint/confirm texts for energy; Setup rules toggle; online rooms carry the ruleset.
Not yet: cost preview on the bar, danger card flip + deck widget, rewritten quick rules / tutorial.

Tests: `tests/frostbound.test.js` (12). e2e: smoke (desktop + phone), online (+ danger leak check), ui-audit,
layout, watch, perf, new-game — 0 errors.
