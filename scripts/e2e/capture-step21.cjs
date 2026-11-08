// Step 21 screenshots: the colony journal tab, the day summary on the colony report, the story on the
// ending, and the sound toggle in the ⋯ menu (desktop + phone). The log is a scripted few days of play.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step21.cjs docs/screenshots/step21
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step21';
const F = { force: true, timeout: 15000 };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    p.on('pageerror', (e) => errors.push(`${device}: ${e}`));
    const shot = (n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 84 });
    const draw = () => p.evaluate(() => window.__frostbound.stage.step(0.05));
    await p.goto('http://localhost:4173/?snow=0&play=HA&seed=4', { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
    await p.evaluate(() => {
      const f = window.__frostbound; f.stage.stop(); const a = f.app; a.tutorialEvent('skip');
      a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 2) });
      a.markObjectiveSeen(); a.set({ queue: [] });
      // A few scripted days on top of the real state (journal reads the public log only).
      const s = structuredClone(a.state);
      const [p0, p1] = s.players; const [a1, a2] = p0.survivors; const [b1] = p1.survivors.length ? p1.survivors : [a2];
      const crisis = s.crisis?.crisisId ?? s.crisis?.id ?? Object.keys(s.crises ?? {})[0];
      s.round = 3;
      s.log.push(
        { r: 1, k: 'search', playerId: p0.id, survivorId: a1, locationId: 'hospital', count: 2 },
        { r: 1, k: 'attack', playerId: p1.id, survivorId: b1, locationId: 'police', killed: 2 },
        { r: 1, k: 'morale', delta: 1, value: 9 },
        { r: 2, k: 'barricadeBroken', locationId: 'grocery' },
        { r: 2, k: 'death', survivorId: a2, playerId: p0.id, cause: 'bite', location: 'grocery' },
        { r: 2, k: 'morale', delta: -1, value: 8 },
        { r: 2, k: 'crisisResolved', crisisId: crisis, required: 2, score: 1, success: false },
        { r: 2, k: 'morale', delta: -1, value: 7 },
        { r: 3, k: 'search', playerId: p1.id, survivorId: b1, locationId: 'library', count: 1 },
      );
      s.morale = 7;
      a.loadState(s, 'p0'); a.markObjectiveSeen(); a.set({ queue: [], logOpen: true, logTab: 'journal' });
    });
    await p.waitForTimeout(200); await draw();
    const lines = await p.locator('.journal .jr-line').count();
    if (lines < 4) errors.push(`${device}: journal shows ${lines} lines`);
    await shot('journal');
    // Colony report for day 2 with its one-line summary.
    await p.evaluate(() => {
      const a = window.__frostbound.app; const s = a.state;
      a.set({ logOpen: false, logTab: 'log', queue: [{ type: 'colony', round: 2, morale: 7, report: { round: 2, fed: true, foodNeeded: 2, starvation: 0, wasteLoss: 0, crisis: { crisisId: s.log.find((e) => e.k === 'crisisResolved').crisisId, required: 2, score: 1, success: false, cards: [] } } }] });
    });
    await p.waitForTimeout(200); await draw();
    const sum = await p.locator('.jr-summary').textContent().catch(() => '');
    if (!/2/.test(sum)) errors.push(`${device}: colony summary missing (${sum})`);
    await shot('colony-summary');
    await p.evaluate(() => window.__frostbound.app.set({ queue: [] }));
    // ⋯ menu with the sound toggle.
    await p.locator('#pp-actions .more').click(F);
    await p.locator('.sound-item').click(F);
    const off = await p.locator('.sound-item[aria-checked="false"]').count();
    if (!off) errors.push(`${device}: sound toggle did not switch`);
    await shot('menu-sound');
    await p.locator('.sound-item').click(F);
    await p.evaluate(() => window.__frostbound.app.set({ moreOpen: false }));
    // Ending: the story so far.
    await p.evaluate(() => {
      const a = window.__frostbound.app; const s = structuredClone(a.state);
      s.phase = 'gameOver';
      s.result = { reason: 'timeOut', winners: [], outcomes: s.players.map((pl) => ({ playerId: pl.id, objectiveId: pl.objectiveId, won: false, objectiveMet: false })) };
      a.loadState(s, 'p0'); a.set({ queue: [] });
    });
    await p.waitForTimeout(200); await draw();
    if ((await p.locator('.jr-story li').count()) < 3) errors.push(`${device}: ending story too short`);
    await shot('ending-story');
    await p.close();
  }
  await b.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'capture-step21: ok, 0 errors');
  process.exit(errors.length ? 1 : 0);
})();
