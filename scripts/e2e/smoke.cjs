// Requires Playwright with Chromium and a running preview server: npm run build && npx vite preview --port 4173
// Step 8 smoke test: 2-human hot seat to round 4 by clicking, at desktop and phone width,
// asserting hidden information on every step.  node smoke8.cjs desktop|phone
const { chromium } = require('playwright');
const device = process.argv[2] || 'desktop';
const VP = device === 'phone' ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: VP.width, height: VP.height }, isMobile: !!VP.isMobile, hasTouch: !!VP.hasTouch });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/?snow=0&play=HH&seed=21&ai=fast', { waitUntil: 'networkidle' });
  const counts = { pass: 0, draft: 0, choice: 0, endTurn: 0, confirm: 0, incoming: 0, colony: 0, leakChecks: 0 };
  const click = async (sel) => { const l = page.locator(sel).first(); if (VP.hasTouch) await l.tap(); else await l.click(); };

  // Hidden-information check, run after every step.
  const leaks = async () => page.evaluate(() => {
    const f = window.__frostbound; const a = f.app; const s = a.state;
    const out = [];
    const passing = !!document.querySelector('.backdrop.pass');
    if (passing && getComputedStyle(document.getElementById('player')).visibility !== 'hidden') out.push('player panel visible behind the pass screen');
    const shownUids = [...document.querySelectorAll('.item-card[data-uid]')].map((e) => e.dataset.uid);
    if (shownUids.length && !passing) {
      // Whose hand is this? It must be exactly the hand of the human holding the device.
      const owner = s.players.find((p) => shownUids.every((u) => p.hand.includes(u)));
      // Who is entitled to see a hand right now: the active player, or a human answering a request.
      const asked = s.requests.find((r) => !s.players.find((p) => p.id === r.to).isAI)?.to;
      const entitled = document.querySelector('.backdrop.incoming') ? asked : s.activePlayerId;
      if (!owner) out.push('hand on screen matches nobody');
      else if (['turn', 'crossroads'].includes(s.phase) && owner.id !== entitled) out.push(`showing ${owner.name}'s hand while it is ${entitled}'s move`);
    }
    // Face-down crisis cards: their art (by item id) must never be on screen outside the colony reveal.
    if (s.crisis && !document.querySelector('.dialog.colony')) {
      const holderName = document.querySelector('#pp-head .pname')?.textContent;
      const holder = s.players.find((p) => p.name === holderName);
      for (const c of s.crisis.contributions) {
        if (holder && c.playerId === holder.id) continue; // you may know your own
        const def = s.cards[c.uid];
        if ([...document.querySelectorAll('img.art-item')].some((im) => im.getAttribute('src')?.endsWith(`/items/${def}.png`) && im.closest('.item-card, .card-detail') && !holder?.hand.some((u) => s.cards[u] === def))) out.push(`face-down ${def} visible`);
      }
    }
    return out;
  });

  for (let i = 0; i < 260; i++) {
    const st = await page.evaluate(() => { const s = window.__frostbound.app.state; return { phase: s.phase, round: s.round }; });
    if (st.phase === 'gameOver' || st.round >= 4) { console.log('stop at', JSON.stringify(st)); break; }
    const l = await leaks(); counts.leakChecks++;
    if (l.length) { errors.push(...l); break; }
    if (await page.locator('.dialog.colony .btn.primary, .dialog.vote-result .btn.primary, .dialog.cross-result .btn.primary').count()) {
      await page.waitForTimeout(400);
      await click('.dialog.colony .btn.primary, .dialog.vote-result .btn.primary, .dialog.cross-result .btn.primary'); counts.colony++; continue;
    }
    if (await page.locator('.backdrop.pass').count()) { await click('.backdrop.pass'); counts.pass++; continue; }
    if (await page.locator('.draft-card').count()) {
      const cards = page.locator('.draft-card');
      if (VP.hasTouch) { await cards.nth(0).tap(); await cards.nth(2).tap(); } else { await cards.nth(0).click(); await cards.nth(2).click(); }
      await click('.dialog .btn.primary'); counts.draft++; continue;
    }
    if (await page.locator('.dialog.confirm-end').count()) { await click('.dialog.confirm-end .btn.primary'); counts.confirm++; continue; }
    if (await page.locator('.backdrop.incoming').count()) { await click('.backdrop.incoming .btn.ghost'); counts.incoming++; continue; }
    if (await page.locator('button.choice:not([disabled])').count()) { await click('button.choice:not([disabled])'); counts.choice++; continue; }
    // On a phone the panel may be folded: open it to reach End turn.
    if (VP.hasTouch && await page.locator('body.pp-collapsed').count()) { await click('#pp-head .collapse'); continue; }
    const end = page.locator('#pp-actions .btn.primary:not([disabled])');
    if (await end.count()) { await click('#pp-actions .btn.primary:not([disabled])'); counts.endTurn++; await page.waitForTimeout(250); continue; }
    await page.waitForTimeout(350);
  }
  const fin = await page.evaluate(() => ({ round: window.__frostbound.app.state.round, phase: window.__frostbound.app.state.phase }));
  console.log(JSON.stringify({ device, counts, fin, errors }));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
