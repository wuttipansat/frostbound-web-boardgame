// Requires Playwright with Chromium and a running preview server: npm run build && npx vite preview --port 4173
// Step 8 before/after capture: node cap8.cjs <outDir> <prefix>
// Shots: setup, turn (survivor selected + location panel), hand (card selected), colony phase, game over;
// each at desktop (1440x900) and phone (390x844).
const { chromium } = require('playwright');
const [outDir, prefix] = process.argv.slice(2);

const SCENES = {
  setup: null,
  draft: `(() => { window.__frostbound.app.tutorialEvent?.('skip'); })()`,
  crisis: `(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
    a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0';
    a.loadState(s, 'p0'); setTimeout(() => document.querySelector('.stat-block.crisis')?.click(), 300);
  })()`,
  turn: `(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
    a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0';
    const sv = s.players[0].survivors[0];
    s.survivors[sv].location = 'grocery'; s.locations.grocery.zombies = 2;
    s.players[0].dice = [{ v: 5, used: false }, { v: 2, used: false }, { v: 6, used: false }];
    a.loadState(s, 'p0'); a.selectSurvivor(sv);
  })()`,
  hand: `(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
    a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0';
    const sv = s.players[0].survivors[0];
    s.survivors[sv].wounds = 1;
    // A varied hand: take one card of several types from the decks.
    const want = ['medicine', 'weapon', 'food', 'tools', 'junk', 'book', 'survivor'];
    for (const type of want) for (const loc of Object.values(s.locations)) {
      const i = (loc.deck || []).findIndex((u) => window.__frostbound.itemType(s.cards[u]) === type);
      if (i >= 0) { s.players[0].hand.push(loc.deck.splice(i, 1)[0]); break; }
    }
    a.loadState(s, 'p0');
    const med = s.players[0].hand.find((u) => window.__frostbound.itemType(s.cards[u]) === 'medicine');
    a.set({ selCard: med });
  })()`,
  colony: `(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
    a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0'; s.turnsTaken = s.players.length - 1;
    s.crisis = { id: 'whiteout', contributions: [] };
    for (const [type, pid] of [['fuel', 'p0'], ['food', 'p1'], ['fuel', 'p1']]) for (const loc of Object.values(s.locations)) {
      const i = (loc.deck || []).findIndex((u) => window.__frostbound.itemType(s.cards[u]) === type);
      if (i >= 0) { s.crisis.contributions.push({ uid: loc.deck.splice(i, 1)[0], playerId: pid }); break; }
    }
    a.loadState(s, 'p0'); a.dispatch({ type: 'END_TURN', playerId: 'p0' });
  })()`,
  over: `(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
    a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'gameOver';
    s.result = { reason: 'objectiveComplete', winners: ['p0', 'p2'], outcomes: [
      { playerId: 'p0', objectiveId: 'medics-oath', kind: 'loyal', objectiveMet: true, won: true },
      { playerId: 'p1', objectiveId: 'winter-hoard', kind: 'betrayer', objectiveMet: true, won: false },
      { playerId: 'p2', objectiveId: 'lone-wolf', kind: 'exile', objectiveMet: true, won: true } ] };
    a.loadState(s, 'p0');
  })()`,
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    for (const [name, script] of Object.entries(SCENES)) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => errors.push(`${device}/${name}: ${e.message}`));
      const url = script ? '/?snow=0&play=HAA&seed=4&ai=fast' : '/?snow=0';
      await page.goto('http://localhost:4173' + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      if (script) await page.evaluate(script);
      await page.waitForTimeout(name === 'colony' ? 6500 : 2500);
      await page.waitForFunction(() => !document.querySelector('img.art.pending') && !window.__frostbound.diceTray.busy, null, { timeout: 60000 }).catch(() => {});
      await page.evaluate(() => window.__frostbound.stage.stop());
      await page.screenshot({ path: `${outDir}/${prefix}-${device}-${name}.jpg`, type: 'jpeg', quality: 84, timeout: 120000 });
      await page.close();
    }
  }
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
