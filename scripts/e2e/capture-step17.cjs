// Step 17 screenshots: frost on every panel, blood where it is dangerous.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step17.cjs docs/screenshots/step17
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step17';
const URL = 'http://localhost:4173/?snow=0';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const calm = (p) => p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 85 });
    if (device === 'desktop') {
      await p.goto(URL, { waitUntil: 'networkidle' });
      await p.evaluate(() => window.__frostbound.stage.stop());
      await calm(p);
      await shot('setup');
    }
    await p.goto(`${URL}&play=HA&seed=4&ai=fast`, { waitUntil: 'networkidle' });
    await calm(p);
    await p.evaluate(() => {
      const f = window.__frostbound; const a = f.app; f.stage.stop();
      a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 1) });
      a.tutorialEvent('skip'); a.set({ queue: [] });
      const s = structuredClone(a.state);
      s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0'; s.round = 2;
      s.locations.grocery.zombies = 3; // full: blood on its panel
      const sv = s.players[0].survivors[0]; s.survivors[sv].location = 'grocery';
      a.loadState(s, 'p0');
      a.selectSurvivor(sv);
      
      f.stage.step(0.05);
    });
    await shot('in-game');
    if (device === 'desktop') {
      // Play the round away to the colony phase, then show its report as a failed crisis.
      const ok = await p.evaluate(() => {
        const a = window.__frostbound.app;
        for (let i = 0; i < 400; i++) {
          const q = a.ui.queue[0];
          // The first colony report; staged as a failure if the crisis happened to succeed (display only).
          if (q?.type === 'colony') { if (q.report.crisis.success) Object.assign(q.report.crisis, { success: false, score: 0 }); return true; }
          if (q) { a.set({ queue: a.ui.queue.slice(1) }); continue; }
          const s = a.state;
          if (s.phase === 'gameOver') return false;
          if (s.phase === 'turn' && s.activePlayerId === 'p0') { a.dispatch({ type: 'END_TURN', playerId: 'p0' }); continue; }
          if (s.phase === 'crossroads' && s.activePlayerId === 'p0') { document.querySelector('button.choice:not([disabled])')?.click(); continue; }
          a.tick(1);
        }
        return false;
      });
      if (ok) { await p.evaluate(() => window.__frostbound.app.render()); await p.waitForTimeout(300); await shot('colony-failed'); }
      else console.log('no failed crisis found');
    }
    await p.close();
  }
  await b.close();
  console.log('ok');
})();
