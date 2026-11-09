// Step 13 screenshots of HUD states: dice mid-roll and settled, hand compact/expanded + card detail,
// more-actions menu, survivor hover card, log feed (compact and expanded), location panel.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-hud.cjs docs/screenshots/step13
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step13';
const F = { force: true, timeout: 15000 };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (name) => p.screenshot({ path: `${out}/after-${device}-${name}.jpg`, type: 'jpeg', quality: 84 });
    await p.goto('http://localhost:4173/?snow=0&play=HAA&seed=4&ai=fast', { waitUntil: 'networkidle' });
    await p.waitForTimeout(1000);
    await p.evaluate(() => {
      const a = window.__frostbound.app; const me = a.state.players[0];
      a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 1) });
      a.tutorialEvent?.('skip');
      const s = structuredClone(a.state);
      s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0'; s.round = 2;
      const sv = s.players[0].survivors[0];
      s.survivors[sv].location = 'grocery'; s.survivors[sv].wounds = 1; s.locations.grocery.zombies = 2;
      for (const type of ['weapon', 'medicine', 'book', 'food']) for (const loc of Object.values(s.locations)) {
        const i = (loc.deck || []).findIndex((u) => window.__frostbound.itemType(s.cards[u]) === type);
        if (i >= 0) { s.players[0].hand.push(loc.deck.splice(i, 1)[0]); break; }
      }
      a.loadState(s, 'p0');
      // Software WebGL in headless Chrome is slow: freeze the board so the dice tray gets the CPU.
      window.__frostbound.stage.stop();
      
    });
    // The tray steps at most 50 ms per frame and headless frames are slow: wait for the throw to land.
    await p.waitForFunction(() => !window.__frostbound.diceTray.busy, null, { timeout: 90000 }).catch(() => {});
    
    await p.waitForTimeout(300);
    await shot('dice-roll');
    
    await p.evaluate(() => { const a = window.__frostbound.app; a.set({ handCompact: true }); });
    await p.waitForTimeout(300);
    await shot('hand-compact');
    // a few actions so the feed has something to show
    await p.evaluate(() => {
      const a = window.__frostbound.app; const s = a.state; const sv = s.players[0].survivors[0];
      a.dispatch({ type: 'ATTACK', playerId: 'p0', survivorId: sv, dieIndex: s.players[0].dice.findIndex((d) => d.v >= 3) });
      a.selectSurvivor(sv);
    });
    await p.waitForTimeout(2500);
    await shot('feed-location');
    await p.hover('#log .feed-recent', F).catch(() => {});
    await p.evaluate(() => window.__frostbound.app.set({ logOpen: true }));
    await p.waitForTimeout(400);
    await shot('feed-expanded');
    await p.evaluate(() => window.__frostbound.app.set({ logOpen: false, handCompact: false }));
    const box = await p.evaluate(() => { const r = document.querySelector('.sv-token').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.move(box.x, box.y);
    await p.waitForTimeout(600);
    await p.mouse.move(box.x + 2, box.y + 1); // re-renders replace the token: hover again just before the shot
    await shot('survivor-card');
    await p.mouse.move(5, 300);
    await p.evaluate(() => { document.activeElement?.blur(); window.__frostbound.app.set({ moreOpen: true, selCard: window.__frostbound.app.state.players[0].hand[0] }); });
    await p.waitForTimeout(400);
    await shot('menu-and-card');
    await p.close();
  }
  await b.close();
  console.log('ok');
})();
