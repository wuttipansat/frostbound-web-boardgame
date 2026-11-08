// Step 14 screenshots: card sheet with round targets, a disabled action's reason, the round ⋯ (closed/open).
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step14.cjs docs/screenshots/step14
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step14';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (name) => p.screenshot({ path: `${out}/after-${device}-${name}.jpg`, type: 'jpeg', quality: 84 });
    await p.goto('http://localhost:4173/?snow=0&play=HAA&seed=4&ai=fast', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    await p.evaluate(() => {
      const a = window.__frostbound.app; const me = a.state.players[0];
      a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
      a.tutorialEvent?.('skip');
      const s = structuredClone(a.state);
      s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0'; s.round = 2;
      const [sv, sv2] = s.players[0].survivors;
      s.survivors[sv].location = 'grocery'; s.survivors[sv].wounds = 1; s.locations.grocery.zombies = 0;
      s.survivors[sv2].location = 'grocery';
      s.players[0].hand = [];
      for (const type of ['medicine', 'weapon', 'food', 'book']) for (const loc of Object.values(s.locations)) {
        const i = (loc.deck || []).findIndex((u) => window.__frostbound.itemType(s.cards[u]) === type);
        if (i >= 0) { s.players[0].hand.push(loc.deck.splice(i, 1)[0]); break; }
      }
      a.loadState(s, 'p0');
      window.__frostbound.stage.stop();
      document.getElementById('dice-stage').style.display = 'none';
      a.set({ handCompact: false });
    });
    await p.waitForTimeout(900);
    await shot('more-closed');
    await p.evaluate(() => { const a = window.__frostbound.app; a.set({ selCard: a.state.players[0].hand[0] }); });
    await p.waitForTimeout(500);
    await shot('card-sheet');
    // A disabled action answers a click with its reason (touch has no hover).
    await p.evaluate(() => { const a = window.__frostbound.app; a.set({ selCard: null }); a.selectSurvivor(a.state.players[0].survivors[0]); });
    await p.waitForTimeout(400);
    await p.locator('#locpanel .btn.icon-act[data-act="attack"]').click({ force: true });
    await p.waitForTimeout(250);
    await shot('disabled-reason');
    await p.evaluate(() => { const a = window.__frostbound.app; a.selectLocation(null); a.set({ moreOpen: true }); });
    await p.waitForTimeout(400);
    await shot('more-open');
    await p.close();
  }
  await b.close();
  console.log('ok');
})();
