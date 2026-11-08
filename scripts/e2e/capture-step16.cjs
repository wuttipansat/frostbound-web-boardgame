// Step 16 screenshots: the new-game screen, the draft (one card picked), the "waiting for others" screen
// (online, two browsers drafting at once) and the 2D dice.
//   npm run build && node scripts/e2e/capture-step16.cjs docs/screenshots/step16
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const out = process.argv[2] || 'docs/screenshots/step16';
const PORT = 8798;
const F = { force: true, timeout: 15000 };
const URL = `http://localhost:${PORT}/?snow=0`;
(async () => {
  const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 200)); }
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const calm = (p) => p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.evaluate(() => window.__frostbound.stage.stop());
    await calm(p);
    await p.screenshot({ path: `${out}/after-${device}-setup.jpg`, type: 'jpeg', quality: 84 });
    await p.locator('.mode-card[data-mode="online"]').click(F);
    await p.screenshot({ path: `${out}/after-${device}-setup-online.jpg`, type: 'jpeg', quality: 84 });
    // Local draft with one card picked.
    await p.goto(`${URL}&play=HA&seed=4`, { waitUntil: 'networkidle' });
    await p.evaluate(() => window.__frostbound.stage.stop());
    await calm(p);
    await p.locator('.draft-screen .sv-pick').nth(1).click(F);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/after-${device}-draft.jpg`, type: 'jpeg', quality: 84 });
    // 2D dice after the draft.
    await p.locator('.draft-screen .sv-pick').nth(0).click(F);
    await p.locator('.draft-actions .btn.primary').click(F);
    await p.waitForTimeout(500);
    await p.evaluate(() => { window.__frostbound.app.tutorialEvent('skip'); window.__frostbound.app.set({ queue: [] }); window.__frostbound.app.markObjectiveSeen(); document.getElementById('dice-stage').style.display = 'none'; });
    await p.waitForTimeout(300);
    const box = await p.locator('#pp-chips').boundingBox();
    if (box) await p.screenshot({ path: `${out}/after-${device}-dice.png`, clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } });
    await p.close();
  }
  // Online: two players draft at once; the one who is done waits and sees who is still choosing.
  const open = async () => { const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); await p.goto(URL, { waitUntil: 'networkidle' }); await p.evaluate(() => window.__frostbound.stage.stop()); await calm(p); await p.locator('.mode-card[data-mode="online"]').click(F); return p; };
  const host = await open();
  await host.locator('.count-seg button', { hasText: '3' }).click(F);
  await host.locator('.seat').nth(2).locator('.seg button').nth(1).click(F);
  await host.locator('.setup-actions .btn.primary').click(F);
  await host.locator('.room-code').waitFor();
  const code = (await host.locator('.room-code').textContent()).trim();
  const guest = await open();
  await guest.locator('.code-input').fill(code, F);
  await guest.locator('.join-box .btn').click(F);
  await guest.locator('.lobby-seats li.me').waitFor();
  await host.screenshot({ path: `${out}/after-desktop-lobby.jpg`, type: 'jpeg', quality: 84 });
  await host.locator('.lobby .btn.primary:not([disabled])').click(F);
  await host.locator('.draft-screen .sv-pick').first().waitFor();
  await host.locator('.draft-screen .sv-pick').nth(0).click(F);
  await host.locator('.draft-screen .sv-pick').nth(1).click(F);
  await host.locator('.draft-actions .btn.primary').click(F);
  await host.locator('.draft-screen.wait').waitFor();
  await host.screenshot({ path: `${out}/after-desktop-draft-wait.jpg`, type: 'jpeg', quality: 84 });
  await b.close();
  server.kill();
  console.log('ok');
})();
