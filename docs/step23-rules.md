# Step 23 — One survivor, personal energy, gear, no dice

There are **no dice anywhere** any more (no action dice, no exposure die, no 3D dice tray). The engine, bots, UI
and tests were rewritten around energy and a danger deck. `STATE_VERSION` is now 2.

## One survivor each
Draft: 3 options, pick **1**. If your survivor dies, a replacement arrives in the colony (as before).
Survivor cards found while searching are now **newcomers**: they join the colony as helpless people
(+1, the stranger also brings a child) and lift morale by 1.

## Personal energy (0–100)
Every survivor has their own pool and regen, balanced against their ability (stronger ability → less stamina):

| survivor | pool | regen | | survivor | pool | regen |
|---|---|---|---|---|---|---|
| Ambrose (tinkerer) | 100 | 70 | | Teodor (kills 2) | 80 | 60 |
| Wren, Lio | 95 | 70 | | Kanya (inspire) | 80 | 60 |
| Pim, Bo | 90 | 70 | | Osei (healer) | 75 | 60 |
| Agnes, Juno, Greta | 90 | 65 | | Ezra (lucky) | 75 | 60 |
| others | 85 | 65 | | Dot | 70 | 80 (+15) |

- The game starts full; each turn adds the regen (capped by the pool); unspent energy carries over.
- 2+ wounds: pool −20. Starving colony: regen −20. A frost card: next regen −15.
- **Costs are personal**: attack = 9 + 2 × attack skill (13…21), search = 15 + 2 × search skill (19…27),
  move 13, barricade 19, lure 11, clean 14. Modifiers: crowded (2+ zombies) +7, hospital/police search +7,
  Teodor +5, night outside +4.

## Gear: weapon / armor / book (equip is free; the old item returns to your hand)
| | item | effect |
|---|---|---|
| weapon | Riot Baton / Glock 19 / Mosin-Nagant | kills 1, attack −2 / −4 / −6 |
| weapon | Remington 870 / **Fire Axe** (new) | kills 2, attack +2 / +3 |
| armor | **Padded Parka** (new) | frost cards are safe |
| armor | **Winter Boots** (new) | moving −5 |
| armor | **Riot Vest** (new) | ignores the first scratch each round |
| book | blueprints | search that place: +1 card, put 1 back |
| book | cookbook / field manual | colony needs 1 less food / +1 barricade |
| book | **Winter Survival Guide** (new) | +10 regen |

Any weapon means fights draw no danger card. Junk is scrapped for 12 energy per value. Others see what you wear.

## Danger deck (unchanged from 23a)
20 shared cards (safe 9, scratch 4, frost 3, startle 2, surrounded 1, bite 1); drawn when walking in among zombies,
fighting bare-handed, crossroads, infection; +1 bite after rounds 3 and 6, +1 scratch per failed
crisis; order secret, counts public.

## Scenario goals (scaled for one survivor each)
Beacon: 1 + 1 fuel per player, 6 rounds. Stores: food ≥ 5 + 1 per player. Purge: 4 + 2 kills per player.

## Balance (bots, 60 games per cell)
| | dice rules (before) | now |
|---|---|---|
| Beacon 2–5p | 0–5% | 13–35% |
| Stores 2–5p | 0–5% | 27–62% |
| Purge 2–5p | 3–12% | 20–35% |

## UI
Draft cards show pool/regen and attack/search costs; the HUD shows the energy meter, with the worn gear next to the
survivor's face on wide screens (phones list it on the survivor card); gear cards get an **Equip** button; quick
rules, tutorial, hints and tooltips talk about energy. The hand is no longer in the page at all while the device is
being passed (it was only hidden before).

Tests: 159 unit tests; e2e smoke (desktop + phone), online, ui-audit, layout, watch, perf, new-game and
`capture-step23` — 0 errors.
