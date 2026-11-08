// Step 18 screenshots: the hint bar (two situations), this round's checklist, quick rules, the first
// tutorial step, and a phone.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step18.cjs docs/screenshots/step18
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step18';
const URL = 'http://localhost:4173/?snow=0&play=HA&seed=4&ai=fast';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const calm = (p) => p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
  const start = async (p, { tutorial = false } = {}) => {
    await p.goto(URL, { waitUntil: 'networkidle' });
    await calm(p);
    await p.evaluate((tut) => {
      const f = window.__frostbound; const a = f.app; f.stage.stop();
      a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 2) });
      a.set({ queue: [] });
      const s = structuredClone(a.state);
      s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0';
      s.locations.grocery.zombies = 2;
      a.loadState(s, 'p0');
      if (tut) a.set({ tutStep: 0 }); else a.tutorialEvent('skip');
      document.getElementById('dice-stage').style.display = 'none';
      f.stage.step(0.05);
    }, tutorial);
    await p.waitForTimeout(200);
  };
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 84 });
    await start(p);
    await shot('hint-1');
    if (device === 'phone') { await p.close(); continue; }
    // "Show me": the hint points at what it suggests (here it opens the card).
    await p.evaluate(() => { const a = window.__frostbound.app; document.querySelector('#hint .btn')?.click(); });
    await p.waitForTimeout(200);
    await shot('hint-show-me');
    await p.evaluate(() => { const a = window.__frostbound.app; a.set({ crisisOpen: true, selCard: null }); });
    await p.waitForTimeout(200);
    await shot('checklist');
    await p.evaluate(() => window.__frostbound.app.set({ crisisOpen: false, modal: 'rules' }));
    await p.waitForTimeout(200);
    await shot('rules');
    await start(p, { tutorial: true });
    await shot('tutorial-1');
    await p.evaluate(() => document.querySelector('#tutorial .btn.primary')?.click());
    await p.waitForTimeout(200);
    await shot('tutorial-2');
    await p.close();
  }
  await b.close();
  console.log('ok');
})();
