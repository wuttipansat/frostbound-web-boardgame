// Step 12 screenshots: online lobby, crossroads (read aloud, no spoilers) and the outcome reveal.
// Requires the room server on the built game: npm run build && PORT=8799 npm start
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step12';
const BASE = 'http://localhost:8799/?snow=0';
const F = { force: true, timeout: 15000 };
(async () => {
  const b = await chromium.launch();
  const page = async () => { const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); await p.goto(BASE, { waitUntil: 'networkidle' }); await p.evaluate(() => window.__frostbound.stage.stop()); return p; };
  const host = await page();
  await host.locator('.mode-seg button').nth(1).click(F);
  await host.locator('.seat input').first().fill('Ana', F);
  await host.locator('.seat input').first().dispatchEvent('change');
  await host.locator('.btn.primary.big').click(F);
  await host.locator('.room-code').waitFor();
  const code = (await host.locator('.room-code').textContent()).trim();
  const guest = await page();
  await guest.locator('.mode-seg button').nth(1).click(F);
  await guest.locator('.seat input').first().fill('Ben', F);
  await guest.locator('.seat input').first().dispatchEvent('change');
  await guest.locator('.code-input').fill(code, F);
  await guest.locator('.join-row .btn').click(F);
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${out}/after-desktop-lobby.jpg`, type: 'jpeg', quality: 84 });
  await guest.screenshot({ path: `${out}/after-desktop-setup-online.jpg`, type: 'jpeg', quality: 84 });
  await b.close();

  // Crossroads + reveal from a local game (same modals online).
  const b2 = await chromium.launch();
  const p = await b2.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8799/?snow=0&play=HAA&seed=4&ai=fast', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.evaluate(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) }); a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'crossroads'; s.activePlayerId = 'p0';
    s.pendingCrossroads = { cardId: s.crossroadsDeck[0] ?? s.crossroadsDiscard[0], activePlayerId: 'p0', readerId: 'p1', focusSurvivorId: s.players[0].survivors[0] };
    a.loadState(s, 'p0');
  });
  await p.waitForTimeout(2200);
  await p.evaluate(() => window.__frostbound.stage.stop());
  await p.screenshot({ path: `${out}/after-desktop-crossroads.jpg`, type: 'jpeg', quality: 84 });
  await p.evaluate(() => document.querySelector('button.choice').click());
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/after-desktop-crossroads-reveal.jpg`, type: 'jpeg', quality: 84 });
  await b2.close();
  console.log('ok', code);
})();
