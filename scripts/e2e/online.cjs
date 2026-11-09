// Online play, end to end: starts the room server on the built game, then two browsers play together.
//   npm run build && node scripts/e2e/online.cjs
// Host creates a 3-seat room (host, one friend, one bot); the friend joins by code; both play by
// clicking until round 3. After every step each browser must only show its own hand.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const PORT = 8799;
// Headless software WebGL renders the full-quality scene slowly, so elements never look 'stable' to
// Playwright between frames; skip that wait (the app itself is not affected).
const F = { force: true, timeout: 15000 };
const URL = `http://localhost:${PORT}/?snow=0`;

(async () => {
  const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT: String(PORT), BOT_DELAY_MS: '150' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 200)); }
  const browser = await chromium.launch();
  const errors = [];
  const open = async (name) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(URL, { waitUntil: 'networkidle' });
    // Two pages of software-rendered WebGL starve the CPU; the 3D view is not under test here.
    await page.evaluate(() => window.__frostbound.stage.stop());
    await page.locator('.mode-card[data-mode="online"]').click(F).catch(async (e) => { await page.screenshot({ path: `${process.env.SHOT_DIR || '.'}/online-${name}.png` }); throw e; });
    await page.locator('.seat input').first().fill(name, F);
    await page.locator('.seat input').first().dispatchEvent('change');
    return page;
  };
  console.log('opening host'); const host = await open('Host');
  // 3 players: seat 2 is a bot.
  await host.locator('.seg button', { hasText: '3' }).first().click(F);
  await host.locator('.seat').nth(2).locator('.seg button').nth(1).click(F);
  await host.locator('.btn.primary.big').click(F);
  await host.locator('.room-code').waitFor();
  const code = (await host.locator('.room-code').textContent()).trim(); console.log('room', code);
  const guest = await open('Guest');
  await guest.locator('.code-input').fill(code, F);
  await guest.locator('.join-box .btn').click(F);
  await guest.locator('.lobby-seats li.me').waitFor();
  console.log('guest joined'); await host.locator('.lobby .btn.primary:not([disabled])').click(F); console.log('started');
  // Step 16: both players see their draft at the same time (nobody waits for a turn to pick).
  await Promise.all([host.locator('.draft-screen .sv-pick').first().waitFor(), guest.locator('.draft-screen .sv-pick').first().waitFor()]);
  console.log('both drafting at once');

  const counts = { draft: 0, choice: 0, reveal: 0, end: 0, confirm: 0, colony: 0, incoming: 0, leakChecks: 0 };
  const leak = (page) => page.evaluate(() => {
    const a = window.__frostbound.app; const s = a.state;
    if (!s) return [];
    // A view only ever holds one hand: this player's own.
    const others = s.players.filter((p) => p.hand.length);
    const me = others[0] ?? null;
    const out = [];
    if (others.length > 1) out.push('view holds more than one hand');
    const shown = [...document.querySelectorAll('#pp-hand .item-card[data-uid]')].map((e) => e.dataset.uid);
    if (shown.some((u) => !me?.hand.includes(u))) out.push('a card on screen is not in this player hand');
    if (s.rng) { /* the hydrated stand-in is fine */ }
    // Step 23: the danger deck's order never reaches a client (only the counts).
    if (s.config?.rules === 'frostbound' && !s.danger?.left) out.push('no public danger counts in a frostbound view');
    if (s.danger?.deck?.length) out.push('danger deck order leaked');
    return out;
  });

  const step = async (page) => {
    const sel = async (q) => (await page.locator(q).count()) > 0;
    if (await sel('.dialog.colony .btn.primary, .dialog.vote-result .btn.primary, .dialog.cross-result .btn.primary')) {
      await page.waitForTimeout(300);
      await page.locator('.dialog.colony .btn.primary, .dialog.vote-result .btn.primary, .dialog.cross-result .btn.primary').first().click(F);
      counts[(await sel('.dialog.cross-result')) ? 'reveal' : 'colony']++; return true;
    }
    if (await sel('.draft-screen .sv-pick')) {
      if (await sel('.draft-screen .sv-pick.on')) return false; // already picked, waiting for others
      await page.locator('.draft-screen .sv-pick').nth(0).click(F); await page.locator('.draft-screen .sv-pick').nth(1).click(F);
      await page.locator('.draft-actions .btn.primary').click(F); counts.draft++; return true;
    }
    if (await sel('.obj-reveal .obj-card:not(.flipped)')) { await page.locator('.obj-reveal .obj-card').click(F); counts.objective = (counts.objective ?? 0) + 1; return true; }
    if (await sel('.obj-reveal .hold-btn')) {
      await page.locator('.obj-reveal .hold-btn').dispatchEvent('pointerdown');
      await page.waitForTimeout(1150);
      await page.locator('.obj-reveal .hold-btn').dispatchEvent('pointerup').catch(() => {});
      return true;
    }
    if (await sel('.obj-wait')) return false;
    if (await sel('.dialog.confirm-end')) { await page.locator('.dialog.confirm-end .btn.primary').click(F); counts.confirm++; return true; }
    if (await sel('.backdrop.incoming')) { await page.locator('.backdrop.incoming .btn.ghost').click(F); counts.incoming++; return true; }
    if (await sel('button.choice:not([disabled])')) {
      if (await sel('.choice small')) errors.push('crossroads effects shown before choosing');
      await page.locator('button.choice:not([disabled])').first().click(F); counts.choice++; return true;
    }
    if (await sel('#pp-actions .btn.end-turn:not(.off)')) { await page.locator('#pp-actions .btn.end-turn:not(.off)').click(F); counts.end++; return true; }
    return false;
  };

  let round = 1;
  for (let i = 0; i < 400 && round < 3; i++) {
    for (const [name, page] of [['host', host], ['guest', guest]]) {
      const l = await leak(page); counts.leakChecks++;
      if (l.length) errors.push(...l.map((x) => `${name}: ${x}`));
      await step(page);
    }
    round = await host.evaluate(() => window.__frostbound.app.state?.round ?? 1);
    const over = await host.evaluate(() => window.__frostbound.app.state?.phase === 'gameOver');
    if (over || errors.length) break;
    await host.waitForTimeout(150);
  }
  const fin = await Promise.all([host, guest].map((p) => p.evaluate(() => ({ round: window.__frostbound.app.state?.round, phase: window.__frostbound.app.state?.phase }))));
  if (round < 3 && fin[0].phase !== 'gameOver') errors.push(`stalled at ${JSON.stringify(fin)}`);
  if (fin[0].round !== fin[1].round) errors.push(`clients disagree: ${JSON.stringify(fin)}`);
  console.log(JSON.stringify({ code, counts, fin, errors }));
  await browser.close();
  server.kill();
  process.exit(errors.length ? 1 : 0);
})();
