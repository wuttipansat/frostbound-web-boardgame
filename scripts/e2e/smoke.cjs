// Requires Playwright with Chromium and a running preview server: npm run build && npx vite preview --port 4173
// Smoke test: a solo game to round 4 by clicking, at desktop and phone width.  node smoke.cjs desktop|phone
const { chromium } = require('playwright');
const device = process.argv[2] || 'desktop';
const VP = device === 'phone' ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: VP.width, height: VP.height }, isMobile: !!VP.isMobile, hasTouch: !!VP.hasTouch });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/?snow=0&play=1&seed=21', { waitUntil: 'networkidle' });
  const counts = { draft: 0, choice: 0, endTurn: 0, confirm: 0, colony: 0, leakChecks: 0 };
  const click = async (sel) => { const l = page.locator(sel).first(); if (VP.hasTouch) await l.tap(); else await l.click(); };

  // Solo checks, run after every step: the hand on screen is the team's hand, and there is no
  // hot-seat / online / secret-objective UI anywhere.
  const leaks = async () => page.evaluate(() => {
    const s = window.__frostbound.app.state;
    const out = [];
    if (s.players || s.activePlayerId) out.push('state still has player seats');
    if (document.querySelector('.backdrop.pass, .obj-reveal, .lobby, .backdrop.incoming, .dialog.vote, .mode-cards')) out.push('multiplayer UI on screen');
    const shownUids = [...document.querySelectorAll('.item-card[data-uid]')].map((e) => e.dataset.uid);
    if (shownUids.some((u) => !s.team.hand.includes(u))) out.push('a card on screen is not in the hand');
    return out;
  });

  for (let i = 0; i < 260; i++) {
    const st = await page.evaluate(() => { const s = window.__frostbound.app.state; return { phase: s.phase, round: s.round }; });
    if (st.phase === 'gameOver' || st.round >= 4) { console.log('stop at', JSON.stringify(st)); break; }
    const l = await leaks(); counts.leakChecks++;
    if (l.length) { errors.push(...l); break; }
    if (await page.locator('.dialog.colony .btn.primary, .dialog.cross-result .btn.primary').count()) {
      await page.waitForTimeout(400);
      await click('.dialog.colony .btn.primary, .dialog.cross-result .btn.primary'); counts.colony++; continue;
    }
    if (await page.locator('.draft-screen .sv-pick').count()) {
      const cards = page.locator('.draft-screen .sv-pick');
      if (VP.hasTouch) await cards.nth(0).tap(); else await cards.nth(0).click();
      await click('.draft-actions .btn.primary'); counts.draft++; continue;
    }
    if (await page.locator('.dialog.confirm-end').count()) { await click('.dialog.confirm-end .btn.primary'); counts.confirm++; continue; }
    if (await page.locator('button.choice:not([disabled])').count()) { await click('button.choice:not([disabled])'); counts.choice++; continue; }
    // The first-game tutorial bubble can sit over the board: play on without it (the tutorial has its own e2e).
    if (await page.locator('#tutorial .tut-bubble').count()) { await page.evaluate(() => window.__frostbound.app.tutorialEvent('skip')); continue; }
    // Moving (step 15): tap a location, then one of your survivors' round faces by it.
    if (!counts.move && await page.locator('#pp-actions .btn.end-turn').count()) {
      const target = await page.evaluate(() => {
        const a = window.__frostbound.app; const s = a.state;
        const svs = s.team.survivors.map((id) => s.survivors[id]).filter((sv) => sv.alive && !sv.moved);
        const to = ['grocery', 'gas', 'police', 'hospital', 'school', 'library'].find((l) => s.locations[l] && svs.some((sv) => sv.location !== l));
        if (!to) return null;
        a.onBoardPick({ locationId: to, survivorId: null });
        return to;
      });
      if (target && await page.locator('#move-pick .mp-token:not(.off)').count()) {
        const sv = await page.locator('#move-pick .mp-token:not(.off)').first().getAttribute('data-sv');
        await click('#move-pick .mp-token:not(.off)');
        await page.waitForTimeout(300);
        const at = await page.evaluate((id) => window.__frostbound.app.state.survivors[id].location, sv);
        if (at !== target) errors.push(`the move picker did not move ${sv} to ${target} (at ${at})`);
        counts.move = 1;
        await page.evaluate(() => window.__frostbound.app.selectLocation(null));
        continue;
      }
      counts.move = target ? 0 : 1;
      if (!target) continue;
    }
    // The hand (step 14): open the pile into a fan once, open a card's sheet, close it again.
    if (!counts.fan && await page.locator('#pp-hand .pile-btn').count()) {
      await click('#pp-hand .pile-btn'); await page.waitForTimeout(600);
      if (!(await page.locator('#pp-hand .hand-fan.fanned').count())) errors.push('the pile did not open into a fan');
      counts.fan = 1; continue;
    }
    if (!counts.sheet && await page.locator('#pp-hand .hand-fan.fanned .item-card').count() && await page.locator('#pp-actions .btn.end-turn').count()) {
      await click('#pp-hand .hand-fan.fanned .item-card'); await page.waitForTimeout(300);
      if (!(await page.locator('.card-detail').count())) errors.push('clicking a fanned card opened no sheet');
      await click('.card-detail .close'); counts.sheet = 1; continue;
    }
    const end = page.locator('#pp-actions .btn.end-turn:not(.off)');
    if (await end.count()) { await click('#pp-actions .btn.end-turn:not(.off)'); counts.endTurn++; await page.waitForTimeout(250); continue; }
    await page.waitForTimeout(350);
  }
  const fin = await page.evaluate(() => ({ round: window.__frostbound.app.state.round, phase: window.__frostbound.app.state.phase }));
  console.log(JSON.stringify({ device, counts, fin, errors }));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
