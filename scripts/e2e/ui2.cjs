// UI-2 e2e (phone 390×844): one full turn with few taps — walk, search, take the finds, end the day.
// Checks the next-step line, the cost chips, the reason on a greyed button and the log filters.
// Requires a running preview server: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');

const MAX_TAPS = 8;

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173/?snow=0&play=1&seed=21&lang=en', { waitUntil: 'networkidle' });
  let taps = 0;
  const tap = async (sel) => { await page.locator(sel).first().tap({ timeout: 8000 }); taps++; await page.waitForTimeout(350); };
  const app = (fn, arg) => page.evaluate(fn, arg);

  // Draft (not part of the turn count).
  const cards = page.locator('.draft-screen .sv-pick');
  await cards.nth(0).tap(); await cards.nth(1).tap();
  await page.locator('.draft-actions .btn.primary').first().tap();
  await page.waitForTimeout(500);
  for (let i = 0; i < 6; i++) {
    if (await page.locator('button.choice:not([disabled])').count()) { await page.locator('button.choice:not([disabled])').first().tap(); await page.waitForTimeout(300); continue; }
    if (await page.locator('.dialog .btn.primary').count()) { await page.locator('.dialog .btn.primary').first().tap(); await page.waitForTimeout(300); continue; }
    break;
  }
  await app(() => window.__frostbound.app.tutorialEvent('skip'));
  await app(() => window.__frostbound.app.director.clear?.());
  await page.waitForTimeout(400);

  // 1. The next-step line shows AP left (once the 6-second suggestion has gone).
  await app(() => window.__frostbound.app.set({ hints: false }));
  const line = await page.locator('#hint.status .hint-line').textContent().catch(() => '');
  if (!/AP left/.test(line ?? '')) errors.push(`no next-step line (got "${line}")`);

  // 2. A full turn: pick a place (a board tap), walk, search, take the finds, end the day.
  const target = await app(() => {
    const s = window.__frostbound.app.state; const sv = s.survivors[window.__frostbound.app.ui.selSurvivor];
    // A search spot first: a quick search that a fresh survivor can afford after the walk.
    return Object.keys(s.locations).find((l) => l.startsWith('spot-') && l !== sv.location) ?? Object.keys(s.locations).find((l) => l !== 'colony' && l !== sv.location);
  });
  await app((t) => window.__frostbound.app.selectLocation(t), target); taps++; // the place's pin (the camera can move it mid-tap)
  await page.waitForTimeout(300);
  const meta = await page.locator('#radial .rd-btn[data-act="walk"] .rd-meta .ap').first().textContent().catch(() => '');
  if (!/\d/.test(meta ?? '')) errors.push('walk button shows no AP cost');
  await tap('#radial .rd-btn[data-act="walk"]');
  await page.waitForFunction(() => !window.__frostbound.app.watching, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  if (await page.locator('#radial .rd-btn[data-act="search"]:not(.off)').count()) {
    await tap('#radial .rd-btn[data-act="search"]:not(.off)');
    await page.waitForFunction(() => !window.__frostbound.app.watching, null, { timeout: 15000 }).catch(() => {});
    if (await page.locator('.dialog.found .btn.primary').count()) await tap('.dialog.found .btn.primary');
  } else errors.push(`no search button after walking: ${JSON.stringify(await app(() => { const a = window.__frostbound.app; const s = a.state; return { phase: s.phase, sel: a.ui.selSurvivor, selLoc: a.ui.selLoc, at: Object.values(s.survivors).map((v) => [v.id, v.location, v.ap]), btns: [...document.querySelectorAll('#radial .rd-btn')].map((b) => b.dataset.act + (b.classList.contains('off') ? '-off' : '')), hidden: document.querySelector('#radial').className }; }))}`);

  // 3. A greyed button explains itself with numbers.
  const why = await app(() => {
    const s = structuredClone(window.__frostbound.app.state); const id = window.__frostbound.app.ui.selSurvivor;
    s.survivors[id].ap = 1; window.__frostbound.app.loadState(s); window.__frostbound.app.selectLocation(s.survivors[id].location);
    return document.querySelector('#radial .rd-btn.off')?.getAttribute('aria-label') ?? '';
  });
  if (!/Needs \d+ AP, has 1/.test(why)) errors.push(`greyed button gives no AP reason (got "${why}")`);

  // 4. Log filters.
  await app(() => window.__frostbound.app.set({ logOpen: true, logFilter: 'loot' }));
  if (!(await page.locator('#log .log-chip.on').count())) errors.push('no log filter chips');
  await app(() => window.__frostbound.app.set({ logOpen: false }));

  // 5. End the day (with nothing useful left: no confirmation).
  await app(() => window.__frostbound.app.selectLocation(null));
  await tap('#pp-actions .btn.end-turn');
  if (await page.locator('.dialog.confirm-end').count()) await tap('.dialog.confirm-end .btn.primary');
  const after = await app(() => ({ phase: window.__frostbound.app.state.phase, day: window.__frostbound.app.state.day }));
  if (after.phase === 'turn' && after.day === 1) errors.push('the day did not end');
  if (taps > MAX_TAPS) errors.push(`a turn took ${taps} taps (max ${MAX_TAPS})`);

  console.log(JSON.stringify({ taps, line, why, after, errors }));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
