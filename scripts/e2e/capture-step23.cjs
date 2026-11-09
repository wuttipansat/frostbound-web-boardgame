// Step 23: one survivor each, personal energy, gear. Screenshots: the draft (pick 1, energy + costs),
// the HUD with energy and worn gear, a gear card's Equip button, the survivor card listing gear (phone).
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/capture-step23.cjs docs/screenshots/step23
const { chromium } = require('playwright');
const out = process.argv[2] || 'docs/screenshots/step23';
const F = { force: true, timeout: 15000 };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const [device, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    p.on('pageerror', (e) => errors.push(`${device}: ${e.message}`));
    const shot = (n) => p.screenshot({ path: `${out}/after-${device}-${n}.jpg`, type: 'jpeg', quality: 84 });
    const draw = () => p.evaluate(() => { const f = window.__frostbound; for (let i = 0; i < 3; i++) f.stage.step(0.05); });
    await p.goto('http://localhost:4173/?snow=0&play=HA&seed=4', { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; animation-delay: 0s !important; }' });
    await p.evaluate(() => { const f = window.__frostbound; f.stage.stop(); f.app.tutorialEvent('skip'); });
    await p.waitForTimeout(400); await draw();
    const options = await p.locator('.draft-screen .sv-pick').count();
    if (options !== 3) errors.push(`${device}: ${options} draft options`);
    await p.locator('.draft-screen .sv-pick').first().click(F);
    await shot('draft');
    await p.evaluate(() => {
      const a = window.__frostbound.app;
      a.dispatch({ type: 'DRAFT_PICK', playerId: 'p0', survivorIds: a.state.players[0].draftOptions.slice(0, 1) });
      a.markObjectiveSeen(); a.set({ queue: [] });
      // Hand the survivor some gear and wear two pieces.
      const s = structuredClone(a.state);
      const me = s.players[0];
      const give = (id) => { const uid = `g-${id}`; s.cards[uid] = id; me.hand.push(uid); return uid; };
      me.gear = { weapon: give('remington-870'), armor: give('padded-parka'), book: null };
      me.hand = me.hand.filter((u) => !Object.values(me.gear).includes(u));
      give('riot-vest');
      s.phase = 'turn'; s.activePlayerId = 'p0'; s.pendingCrossroads = null;
      a.loadState(s, 'p0'); a.markObjectiveSeen(); a.set({ queue: [] });
    });
    await p.waitForTimeout(300); await draw();
    if ((await p.locator('.energy .en-num').count()) !== 1) errors.push(`${device}: no energy meter`);
    await shot('hud-gear');
    // A gear card's sheet: Equip.
    await p.evaluate(() => { const a = window.__frostbound.app; a.set({ handCompact: false, selCard: 'g-riot-vest' }); });
    await p.waitForTimeout(300);
    const equip = await p.locator('.card-detail .btn.primary').first().textContent().catch(() => '');
    if (!/equip/i.test(equip ?? '')) errors.push(`${device}: no Equip button (${equip})`);
    await shot('equip');
    await p.locator('.card-detail .btn.primary').first().click(F);
    const worn = await p.evaluate(() => window.__frostbound.app.state.players[0].gear.armor);
    if (worn !== 'g-riot-vest') errors.push(`${device}: equip did not swap (${worn})`);
    if (device === 'phone') {
      await p.evaluate(() => window.__frostbound.app.set({ selCard: null }));
      await p.locator('.sv-token').first().click(F);
      await p.waitForTimeout(300);
      await shot('survivor-card');
    }
    await p.close();
  }
  await b.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'capture-step23: ok, 0 errors');
  process.exit(errors.length ? 1 : 0);
})();
