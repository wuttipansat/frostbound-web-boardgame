// Step 19 screenshots: the face-down objective, a colonist and a betrayer turned over, the online
// "others are reading" wait, and the objective peek (no longer covered), desktop and phone.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step19.cjs docs/screenshots/step19
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const out = process.argv[2] || 'docs/screenshots/step19';
const F = { force: true, timeout: 15000 };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const calm = (p) => p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const shot = (n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 84 });
    await p.goto('http://localhost:4173/?snow=0&play=HA&seed=4', { waitUntil: 'networkidle' });
    await calm(p);
    await p.evaluate(() => { const f = window.__frostbound; f.stage.stop(); const a = f.app; a.tutorialEvent('skip'); a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 2) }); a.set({ queue: [] }); });
    await p.waitForTimeout(200);
    if (device === 'desktop') await shot('objective-face-down');
    await p.locator('.obj-reveal .obj-card').click(F);
    await p.waitForTimeout(200);
    const kind = await p.evaluate(() => (document.querySelector('.obj-card.betrayer') ? 'betrayer' : 'colonist'));
    await shot(`objective-${kind}`);
    if (device === 'desktop') {
      // The other side of the coin: the same screen for the other kind (display only).
      await p.evaluate((k) => {
        const { OBJECTIVES } = window.__frostbound;
        const a = window.__frostbound.app;
        const s = structuredClone(a.state);
        const want = k === 'betrayer' ? (o) => o.kind !== 'betrayer' : (o) => o.kind === 'betrayer';
        const other = (OBJECTIVES ?? []).find(want);
        if (other) { s.players[0].objectiveId = other.id; a.loadState(s, 'p0'); a.set({ objSeen: [], objFlipped: true }); }
      }, kind);
      await p.waitForTimeout(200);
      await shot(`objective-${kind === 'betrayer' ? 'colonist' : 'betrayer'}`);
    }
    await p.evaluate(() => { const a = window.__frostbound.app; a.markObjectiveSeen(); a.set({ peek: true, handCompact: false }); });
    await p.waitForTimeout(200);
    await shot('peek');
    await p.close();
  }
  // Online wait screen.
  const PORT = 8797;
  const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 200)); }
  const open = async () => { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.goto(`http://localhost:${PORT}/?snow=0`, { waitUntil: 'networkidle' }); await p.evaluate(() => window.__frostbound.stage.stop()); await calm(p); await p.locator('.mode-card[data-mode="online"]').click(F); return p; };
  const host = await open();
  await host.locator('.count-seg button', { hasText: '2' }).click(F);
  await host.locator('.setup-actions .btn.primary').click(F);
  await host.locator('.room-code').waitFor();
  const code = (await host.locator('.room-code').textContent()).trim();
  const guest = await open();
  await guest.locator('.code-input').fill(code, F);
  await guest.locator('.join-box .btn').click(F);
  await guest.locator('.lobby-seats li.me').waitFor();
  await host.locator('.lobby .btn.primary:not([disabled])').click(F);
  for (const pg of [host, guest]) {
    await pg.locator('.draft-screen .sv-pick').first().waitFor();
    await pg.locator('.draft-screen .sv-pick').nth(0).click(F);
    await pg.locator('.draft-screen .sv-pick').nth(1).click(F);
    await pg.locator('.draft-actions .btn.primary').click(F);
  }
  await host.locator('.obj-reveal .obj-card').waitFor({ timeout: 20000 });
  await host.evaluate(() => window.__frostbound.app.markObjectiveSeen());
  await host.locator('.obj-wait').waitFor({ timeout: 10000 });
  await host.screenshot({ path: `${out}/after-desktop-objective-wait.jpg`, type: 'jpeg', quality: 84 });
  server.kill();
  await b.close();
  console.log('ok');
})();
