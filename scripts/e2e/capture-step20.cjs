// Step 20 screenshots: living winter — calm early round, a late-game blizzard with a low fire,
// footprints after a walk, and the two endings (won / lost, plus "look at the colony"), desktop and phone.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step20.cjs docs/screenshots/step20
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step20';
const F = { force: true, timeout: 15000 };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    p.on('pageerror', (e) => errors.push(String(e)));
    const shot = (n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 84 });
    // Ease the weather/camera without rendering every frame (software GL is slow), then draw a few frames.
    const frames = (n = 110) => p.evaluate((k) => { const f = window.__frostbound; for (let i = 0; i < k; i++) { f.atmosphere.update(0.05); f.footprints.update(0.05); f.rig.update(0.05); } for (let i = 0; i < 3; i++) f.stage.step(0.05); }, n);
    await p.goto('http://localhost:4173/?play=HA&seed=4', { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
    await p.evaluate(() => {
      const f = window.__frostbound; f.stage.stop(); const a = f.app; a.tutorialEvent('skip');
      a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 2) });
      a.markObjectiveSeen(); a.set({ queue: [] });
    });
    await p.waitForTimeout(300); await frames();
    await shot('calm');
    const mood = (o) => p.evaluate((o2) => { const a = window.__frostbound.app; const s = structuredClone(a.state); Object.assign(s, o2); a.loadState(s, 'p0'); a.markObjectiveSeen(); a.set({ queue: [] }); }, o);
    await mood({ round: 6, morale: 2 });
    await frames();
    await shot('blizzard');
    await mood({ round: 2, morale: 8 });
    await p.evaluate(() => { const f = window.__frostbound; f.footprints.walk(f.board.layout.colony.center, f.board.layout.hospital.center); f.footprints.walk(f.board.layout.colony.center, f.board.layout.police.center); });
    await frames(60);
    if (device === 'desktop') {
      await p.evaluate(() => { const f = window.__frostbound; f.rig.focus({ kind: 'search', at: 'hospital' }); });
      await frames(60);
      await shot('footprints');
      await p.evaluate(() => window.__frostbound.rig.home()); await frames(60);
    }
    for (const reason of ['objectiveComplete', 'moraleCollapse']) {
      await p.evaluate((r) => {
        const a = window.__frostbound.app; const s = structuredClone(a.state);
        s.phase = 'gameOver';
        s.morale = r === 'objectiveComplete' ? 6 : 0;
        s.result = { reason: r, winners: r === 'objectiveComplete' ? [s.players[0].id] : [], outcomes: s.players.map((pl) => ({ playerId: pl.id, objectiveId: pl.objectiveId, won: r === 'objectiveComplete', objectiveMet: r === 'objectiveComplete' })) };
        a.loadState(s, 'p0'); a.set({ queue: [] });
      }, reason);
      await p.waitForTimeout(200); await frames(140);
      const tag = reason === 'objectiveComplete' ? 'won' : 'lost';
      await shot(`end-${tag}`);
      if (tag === 'lost' || device === 'desktop') {
        await p.locator('.over-look').click(F);
        await shot(`end-${tag}-look`);
        await p.locator('.over-back').click(F);
        const back = await p.locator('.backdrop.over.peek').count();
        if (back) errors.push(`${device}: show results did not return`);
      }
    }
    await p.close();
  }
  await b.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'capture-step20: ok, 0 errors');
  process.exit(errors.length ? 1 : 0);
})();
