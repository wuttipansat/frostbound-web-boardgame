# FROSTBOUND UI audit (step 8)

How it was checked: the real UI was driven with Playwright at **1440×900**, **1280×720** and **390×844 (touch)**.
- Quick-start games (`?play=HHA&seed=4&ai=fast`) were set up through `window.__frostbound` and then used by clicking and pressing keys like a player.
- Measurements came from the live DOM: element rectangles vs. the viewport and panels, scroll widths, focus styles, and text nodes containing emoji or die glyphs.
- Before screenshots: `docs/screenshots/step8/before-*.jpg`.

Severity:
- **High:** blocks or misleads play.
- **Medium:** slows play or hides info.
- **Low:** polish.

| # | Issue | Steps to reproduce | Seen at | Severity | Status / fix |
|---|---|---|---|---|---|
| 1 | Playing medicine/tools/weapons **silently picks a target survivor** | Turn → select no survivor → click a First-Aid Pouch → **Play** is enabled and heals whoever the UI picks | all | High | **Planned:** card detail shows a *target picker* (portraits of eligible survivors). Play needs an explicit target; junk needs an explicit die. |
| 2 | Phone: **3 of 5 location actions are hidden** below the player panel inside a tiny scroll area | Phone → select survivor at a location | phone | High | **Planned:** on narrow screens the player panel folds away while a location is open, and the sheet gets the space (all actions visible). |
| 3 | Phone: **top bar clips Waste, Crisis and Goal** off-screen (only reachable by sideways scroll) | Phone → any turn | phone | High | **Planned:** compact two-row top bar with graphics; crisis and goal always visible. |
| 4 | Phone: the **selected card's actions are pushed out of view** | Phone → tap a hand card | phone | High | **Planned:** card detail is a fixed sheet above the panel. |
| 5 | **Lure destination only via a `<select>`** | Survivor with zombies at their location → Lure | all | Medium | **Planned:** "Pick on the board" highlights destinations on the 3D board (click one), with location buttons as a fallback. |
| 6 | **Dice drawn with font glyphs** (⚀–⚅) that differ per OS/font; item/type/stat icons are emoji | Any turn | all | Medium | **Planned:** dice are SVG pip faces; items are rendered voxel art; stats, types and UI symbols are SVG icons. No emoji or die glyphs remain (test). |
| 7 | **31 hints exist only as `title=` tooltips** (unreachable on touch), including why a card action is disabled | Phone → long-press/tap a disabled card action | touch | Medium | **Planned:** shared tooltip (`data-tip`) on hover, focus and tap. Disabled reasons are always written out. No `title=` remains in views (test). |
| 8 | **Hand overflows with no hint** that more cards exist | Hold 7+ cards at 1280×720 or on a phone | all | Medium | **Planned:** edge fades + arrow buttons when a row scrolls; the mouse wheel scrolls it sideways. |
| 9 | **End turn with unused dice ends immediately** | Turn with unused dice → End turn | all | Medium | **Planned:** confirmation ("You still have N unused dice"), with *don't ask again this game*. |
| 10 | **Item request to another human is only seen when they next hold the device**; the requester can't tell it is pending | 2 humans → Request item from the other human | hot seat | Medium | **Planned:** the device is handed to the asked player right away (pass screen → answer), then back to the active player. |
| 11 | **Pass screen ignores the keyboard** (Enter/Space do nothing) | Hot seat → pass screen → press Enter | all | Medium | **Planned:** focused on show; Enter/Space continue. |
| 12 | **Location labels clipped under the top bar** ("Gas Station") and drawn over/under panels | Default camera | desktop, small | Low | **Planned:** labels are clamped below the top bar and fade out when covered by a panel. |
| 13 | Crisis popover doesn't close on **Esc** or an **outside click**; settings and other dialogs ignore Esc | Click the crisis chip → press Esc / click the board | all | Low | **Planned:** Esc closes the top-most popover/dialog/picker; an outside click closes the popover. |
| 14 | **Toasts sit exactly where the crisis popover opens** (top centre) and under the tutorial bubble's usual spot | Open crisis popover while a toast appears | all | Low | **Planned:** toasts moved to the bottom centre, above the player panel. |
| 15 | Phone: **sky texture stretched** (the moon becomes an oval) | Phone, Medium/High quality | phone | Low | **Planned:** the sky is cropped to the screen aspect ("cover"). |
| 16 | Dialogs don't take focus, so keyboard users start behind the modal | Open any dialog, press Tab | all | Low | **Planned:** the primary button of a dialog gets focus. |
| 17 | Visible focus rings | Tab through buttons | all | — | **Ruled out:** focus rings were already visible. Kept, and restyled to match. |
| 18 | Many survivors at the colony overlapping on the board | Put all 6 survivors in the colony | all | — | **Ruled out:** nearest pair 2.6 units apart (figures are 1.2 wide). The 10-slot ring keeps its spacing. |

## Re-check after the fixes
See the bottom of this file. It is updated by the final audit pass.
