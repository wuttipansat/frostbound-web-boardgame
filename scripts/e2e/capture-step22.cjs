// Step 22 screenshots: loading screen, graphics setting, high vs battery saver (desktop + phone).
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step22.cjs docs/screenshots/step22
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step22';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (p, n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 84 });
    // Loading screen: hold the app script back so the inline screen is what shows.
    {
      const p = await ctx.newPage();
      await p.route(/\/assets\/index-.*\.js$/, () => {});
      await p.goto('http://localhost:4173/', { waitUntil: 'commit' });
      await p.waitForSelector('#boot');
      await p.waitForFunction(() => typeof window.__boot === 'function');
      await p.evaluate(() => window.__boot(0.45));
      await p.waitForTimeout(500);
      await shot(p, 'loading');
      await p.close();
    }
    for (const gfx of ['high', 'saver']) {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(`${device} ${gfx}: ${e.message}`));
      await p.goto(`http://localhost:4173/?play=HA&seed=4&gfx=${gfx}`, { waitUntil: 'networkidle' });
      await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
      await p.evaluate(() => {
        const f = window.__frostbound; const a = f.app; a.tutorialEvent('skip');
        a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 1) });
        a.markObjectiveSeen(); a.set({ queue: [] });
      });
      await p.waitForTimeout(1500);
      await p.evaluate(() => { const f = window.__frostbound; f.stage.stop(); for (let i = 0; i < 3; i++) f.stage.step(0.05); });
      await shot(p, `scene-${gfx}`);
      if (gfx === 'saver') {
        await p.evaluate(() => window.__frostbound.app.set({ modal: 'settings' }));
        await p.waitForTimeout(200);
        await shot(p, 'settings');
      }
      await p.close();
    }
    await ctx.close();
  }
  await b.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'capture-step22: ok, 0 errors');
  process.exit(errors.length ? 1 : 0);
})();
