# FROSTBOUND UI — Step 15: watching other players, moving by faces

Screenshots are in `docs/screenshots/step15/`:
- `before-*`: Step 14.
- `after-*-board-no-names`, `move-pick`, `bot-attack`, `bot-search`: from `node scripts/e2e/capture-step15.cjs`.
- `after-*-bot-*`: from `npm run e2e:watch`.

## The presentation queue — `src/ui/director.js`

- **Where scenes come from:** `eventsFromLog(entries, state, viewer)` turns new log entries into scenes. Each scene has a kind (`move`, `attack`, `search`, `barricade`, `clean`, `lure`, `play`, `contribute`, `deposit`, `exposure`, `turn`), who did it, and where.
  - It reads the public log only, the same on every online client. This is the `newLogEntries` diff, so it works for hot-seat, bots and online alike.
- **No hidden cards:** a search only knows how many cards were found, and a contribution carries no card.
  - A test checks that no scene from a whole bot game holds a card uid.
- **`createDirector`** plays the scenes one at a time. For each scene the camera goes there (if allowed), the effect and callout play (`scene.play` in `src/main.js`), and then the next scene starts.
- **Timing:**
  - Scenes are timed with real timers, not frames, so a paused tab can't stall the queue.
  - Each scene is capped at 4 s.
  - Your own moves only take 0.15–0.25 s and never move the camera. Exposure rolls still get their dice time.
- **Bots wait:** `tick` doesn't let a bot act while `director.busy`. `?ai=fast` still skips the wait.
- **Exposure:** the exposure roll is now a scene too (it used to be fired straight from the log).
- **Skipping and speed:**
  - Click the board, or press Space or Esc, to skip the scene on screen.
  - Hold the pointer down to play scenes 3× faster.
  - While a scene plays, `body.watching` is set, and the phase banner gets an accent line and a "Click to skip · hold to speed up" hint.
- **Settings** (remembered): *Camera follows* is Everyone / Others (default) / Off. *Others' moves* is Normal / Fast.
- **Tests:** `?scenes=N` stretches every scene (tests only, because software WebGL is slow).

## Camera rig — `src/render/camera.js`

- **Movement:** it eases the orthographic camera to the scene's location: target and camera move together, and the zoom is about 1.6× the player's own.
  - During a move it follows the walking survivor.
  - When the queue is empty it eases back to the view the player had.
- **The player drags or uses the wheel:** the rig lets go and doesn't pull back until the queue is empty. A plain click doesn't count as a drag.
- **`prefers-reduced-motion`:** the camera cuts instead of easing.
- **`stage.step(dt)`:** a new hook that runs one frame by hand, for tests where the render loop is stopped.

## Callouts

- **What they show:** a small pill over the location: the player's colour, the survivor's face, an action icon and a short result.
  - Results: `−1` and a skull for an attack, card backs and "2 cards" for a search, `+1` for a barricade, the destination for a move, and the item for a played or deposited card.
- They only appear for other players' moves.
- An attack also bursts particles at the survivor.

## Moving: tap a location, tap a face (`src/ui/views/movepick.js`)

- **Opening it:** on your turn, clicking or tapping a location floats your survivors' round faces by its survivor pads (`#move-pick .mp-token`).
- **The faces:**
  - Tapping one moves it at once, with no confirmation.
  - Survivors who can't go are greyed with a ×, and a tap shows the reason.
  - Each face shows health pips and an exposure-risk or safe mark.
  - The selected survivor comes first and is larger.
  - If you have fuel, a small *Fuel* toggle sits next to the faces.
- **Closing it:** Esc or a click on empty board. It is hidden while someone else's move plays.
- **Location panel:** it no longer has a Move button. When none of your survivors are there, its hint says to tap a face.
- **Tutorial:** the move step points at the faces.

## Location names only on hover / tap

- **No name signs:** the permanent signs over buildings are gone.
- **Zombie badges:** a small zombie badge (`.loc-label.zbadge`) stays over a location with zombies.
- **The name:** `#loc-name` shows over the hovered building, or the tapped or selected one, with its zombie count.

## Tests

- `tests/director.test.js`:
  - Log → scenes, in order.
  - Own vs. watched moves.
  - No card in other players' scenes, including a whole bot game.
  - Durations.
  - The queue: camera for others only, then home, then idle.
  - Skip, clear, and camera off.
- `npm run e2e:watch`: a bot's scene moves the camera, a callout and `body.watching` appear, Space skips, and the camera comes back home (desktop and phone).
- smoke (desktop and phone): moves a survivor with the face picker and checks it arrived.
- ui-audit: checks the zombie badges and the name tag instead of the old signs.
