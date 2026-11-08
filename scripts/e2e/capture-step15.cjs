// Step 15 screenshots: the board without name signs, the hover/selected name, the "who goes there" faces,
// and a bot's attack / search with the camera zoomed in and a callout. Scenes are pushed by hand so the
// shots don't depend on what the bot decides; frames are stepped by hand (software WebGL is slow).
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step15.cjs docs/screenshots/step15
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step15';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (name) => p.screenshot({ path: `${out}/after-${device}-${name}.jpg`, type: 'jpeg', quality: 84 });
    const step = (n = 1, dt = 0.25) => p.evaluate(([k, d]) => { for (let i = 0; i < k; i++) window.__frostbound.stage.step(d); }, [n, dt]);
    await p.goto('http://localhost:4173/?snow=0&play=HA&seed=4&ai=fast&scenes=20', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    // Headless Chrome barely advances CSS transitions here: show end states.
    await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
    await p.evaluate(() => {
      const f = window.__frostbound; const a = f.app;
      f.stage.stop();
      const me = a.state.players[0];
      a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
      a.tutorialEvent('skip');
      const s = structuredClone(a.state);
      s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0'; s.round = 2;
      s.locations.grocery.zombies = 2; s.locations.police.zombies = 1;
      const bot = s.players[1].survivors[0];
      s.survivors[bot].location = 'grocery';
      a.loadState(s, 'p0');
      a.set({ handCompact: true });
      document.getElementById('dice-stage').style.display = 'none';
    });
    await step(2, 0.05);
    await shot('board-no-names');
    // Tap a location on your turn: its name shows, and your survivors float by it as round faces.
    await p.evaluate(() => window.__frostbound.app.onBoardPick({ locationId: 'grocery', survivorId: null }));
    await step(1, 0.05);
    await shot('move-pick');
    await p.evaluate(() => window.__frostbound.app.set({ movePick: null, selLoc: null }));
    // A bot's attack, then its search: the camera eases in, a callout says what happened.
    await p.evaluate(() => {
      const a = window.__frostbound.app; const s = a.state; const bot = s.players[1].survivors[0];
      a.selectLocation(null);
      a.director.push([
        { kind: 'attack', playerId: 'p1', survivorId: bot, at: 'grocery', n: 1, watch: true },
        { kind: 'search', playerId: 'p1', survivorId: bot, at: 'grocery', n: 2, watch: true },
      ]);
    });
    await step(10, 0.12);
    await shot('bot-attack');
    await p.evaluate(() => window.__frostbound.app.director.skip());
    await step(8, 0.12);
    await shot('bot-search');
    await p.evaluate(() => window.__frostbound.app.director.clear());
    await p.close();
  }
  await b.close();
  console.log('ok');
})();
