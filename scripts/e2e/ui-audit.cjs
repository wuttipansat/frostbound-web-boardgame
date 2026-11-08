// Requires Playwright with Chromium and a running preview server: npm run build && npx vite preview --port 4173
// UI audit: drives real flows at desktop + phone size and measures the suspected problems.
// node audit.cjs  -> prints JSON findings
const { chromium } = require('playwright');

const setupTurn = (opts = {}) => `(() => {
  const a = window.__frostbound.app;
  for (const p of a.state.players.filter((x) => !x.isAI && !x.drafted)) a.dispatch({ type: 'DRAFT_PICK', playerId: p.id, survivorIds: p.draftOptions.slice(0, 2) });
  a.tutorialEvent?.('skip');
  const s = structuredClone(a.state);
  s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0';
  const sv = s.players[0].survivors[0];
  s.survivors[sv].location = ${JSON.stringify(opts.loc ?? 'grocery')};
  s.survivors[sv].wounds = 1;
  s.locations[${JSON.stringify(opts.loc ?? 'grocery')}].zombies = 2;
  s.players[0].dice = [{ v: 5, used: false }, { v: 2, used: false }, { v: 6, used: false }];
  for (const type of ['medicine', 'weapon', 'food', 'tools', 'junk', 'fuel', 'medicine', 'food']) for (const loc of Object.values(s.locations)) {
    const i = (loc.deck || []).findIndex((u) => window.__frostbound.itemType(s.cards[u]) === type);
    if (i >= 0) { s.players[0].hand.push(loc.deck.splice(i, 1)[0]); break; }
  }
  a.loadState(s, 'p0');
  return sv;
})()`;

async function audit(browser, device, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.touch, hasTouch: !!vp.touch, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const f = {};
  await page.goto('http://localhost:4173/?snow=0&play=HHA&seed=4&ai=fast', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Pass screen: keyboard can't continue?
  f.passScreenShown = !!(await page.$('.backdrop.pass'));
  if (f.passScreenShown) {
    await page.focus('.backdrop.pass').catch(() => {});
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    f.passScreenEnterWorks = !(await page.$('.backdrop.pass'));
    if (!f.passScreenEnterWorks) await page.click('.backdrop.pass');
  }

  const sv = await page.evaluate(setupTurn());
  await page.evaluate((id) => window.__frostbound.app.selectSurvivor(id), sv);
  await page.waitForTimeout(600);

  // Labels under the top bar / covered by panels.
  f.labelsHidden = await page.evaluate(() => {
    const bar = document.getElementById('topbar').getBoundingClientRect();
    const panels = ['pp-left', 'pp-hand', 'pp-actions', 'locpanel', 'log'].map((id) => document.getElementById(id)).filter((e) => e && !e.classList.contains('hidden')).map((e) => e.getBoundingClientRect());
    // Step 15: zombie badges (hidden when empty) and the hovered / selected location's name.
    return [...document.querySelectorAll('.loc-label, #loc-name.on')].filter((l) => {
      const r = l.getBoundingClientRect();
      if (!r.width || !r.height) return false; // not shown
      const underBar = r.top < bar.bottom;
      // A label drawn over a panel without being faded out counts as a problem; faded ("covered") ones don't.
      const overPanel = !l.classList.contains('covered') && panels.some((p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top);
      return underBar || overPanel;
    }).map((l) => l.textContent || l.dataset.loc);
  });

  // Location action buttons reachable in the viewport?
  f.actionsVisible = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#locpanel .btn.act')];
    // Floating HUD pieces (step 14): a button is reachable when it is on screen and none of them cover it.
    const hud = [...document.querySelectorAll('#pp-left, #pp-actions > *, #pp-hand .item-card, #pp-hand .hand-ctl button, .sv-token')].map((e) => e.getBoundingClientRect());
    const hit = (r, p) => r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top;
    return { total: btns.length, visible: btns.filter((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && !hud.some((p) => hit(r, p)); }).length };
  });
  f.lureIsSelectOnly = !!(await page.$('#locpanel select'));

  // Top bar: crisis/goal chips visible without scrolling?
  f.topbarClipped = await page.evaluate(() => {
    const vw = innerWidth;
    return [...document.querySelectorAll('#topbar .stat-block')].filter((b) => b.getBoundingClientRect().right > vw).map((b) => b.querySelector('.lbl')?.textContent ?? '?');
  });

  // Overflow without a hint.
  f.overflow = await page.evaluate(() => Object.fromEntries(['#pp-survivors', '#topbar'].map((sel) => {
    const e = document.querySelector(sel);
    return [sel, e ? { overflows: e.scrollWidth > e.clientWidth + 2, hint: getComputedStyle(e).maskImage !== 'none' || e.classList.contains('scroll-hint') } : null];
  })));

  // Dice and items drawn with font glyphs / emoji?
  f.emojiInUi = await page.evaluate(() => {
    const re = /\p{Extended_Pictographic}|[⚀-⚅☠⚔★❄⚖✋]/u;
    const hits = new Set();
    for (const el of document.querySelectorAll('#player *, #topbar *, #locpanel *, #labels *, #log *, .sv-tokens *')) {
      for (const n of el.childNodes) if (n.nodeType === 3 && re.test(n.textContent)) hits.add(n.textContent.trim().slice(0, 12));
    }
    return [...hits].slice(0, 20);
  });

  // Tooltips only in title= (unreachable on touch).
  f.titleOnlyHints = await page.evaluate(() => document.querySelectorAll('[title]').length);

  // Card play with no survivor selected: is a target chosen silently?
  await page.evaluate(() => window.__frostbound.app.selectSurvivor(null));
  f.silentTarget = await page.evaluate(() => {
    const a = window.__frostbound.app;
    const med = a.state.players[0].hand.find((u) => window.__frostbound.itemType(a.state.cards[u]) === 'medicine');
    a.set({ selCard: med });
    const play = [...document.querySelectorAll('.card-bar .btn, .cd-actions .btn')].find((b) => /Play|Use|ใช้/.test(b.textContent));
    const picker = document.querySelector('[data-target-picker]');
    return { playEnabledWithoutTarget: !!play && !play.disabled && play.getAttribute('aria-disabled') !== 'true', hasPicker: !!picker };
  });
  await page.evaluate(() => window.__frostbound.app.set({ selCard: null }));

  // Crisis popover: Esc / outside click close it?
  if (await page.$('#topbar .stat-block.crisis')) {
    await page.click('#topbar .stat-block.crisis');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    f.crisisPopoverEsc = !(await page.$('.crisis-pop'));
    if (!f.crisisPopoverEsc) {
      await page.mouse.click(vp.width / 2, vp.height / 2);
      await page.waitForTimeout(150);
      f.crisisPopoverOutsideClick = !(await page.$('.crisis-pop'));
      if (await page.$('.crisis-pop')) await page.click('#topbar .stat-block.crisis');
    }
  }

  // Settings modal: Esc closes?
  await page.evaluate(() => window.__frostbound.app.set({ modal: 'settings' }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  f.settingsEsc = !(await page.$('.dialog.settings'));
  await page.evaluate(() => window.__frostbound.app.set({ modal: null }));

  // Focus ring visible on buttons?
  f.focusRing = await page.evaluate(() => {
    const b = document.querySelector('#pp-actions .btn');
    if (!b) return null;
    b.focus();
    const cs = getComputedStyle(b);
    return cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
  });

  // End turn with unused dice: confirmation?
  f.endTurnUnusedDiceConfirm = await page.evaluate(() => {
    const before = window.__frostbound.app.state.turnsTaken;
    const btn = [...document.querySelectorAll('#pp-actions .btn.primary')].pop();
    btn?.click();
    const after = window.__frostbound.app.state.turnsTaken;
    return { endedImmediately: after !== before, confirmShown: !!document.querySelector('.dialog.confirm-end') };
  });

  // Request item between humans: does the target get asked right away?
  await page.evaluate(setupTurn());
  await page.evaluate(() => window.__frostbound.app.dispatch({ type: 'REQUEST_ITEM', playerId: 'p0', targetId: 'p1', itemType: null }));
  await page.waitForTimeout(300);
  f.requestHandedToTarget = !!(await page.$('.backdrop.pass')) || !!(await page.$('.backdrop.incoming'));

  // Colony survivors overlap on the board (screen-space distance between figures).
  f.colonyOverlap = await page.evaluate(() => {
    const f = window.__frostbound;
    const s = structuredClone(f.app.state);
    const ids = Object.keys(s.survivors);
    for (const id of ids) s.survivors[id].location = 'colony';
    f.app.loadState(s, 'p0');
    const pos = ids.map((id) => f.pieces.survivorObject(id)?.position).filter(Boolean);
    let min = Infinity;
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) min = Math.min(min, pos[i].distanceTo(pos[j]));
    return { count: pos.length, minDistance: +min.toFixed(2) };
  });

  // Sky texture stretch (moon aspect) only matters with the sky on (Medium/High); report aspect.
  f.viewportAspect = +(vp.width / vp.height).toFixed(2);
  f.errors = errors;
  await page.close();
  return f;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  out.desktop = await audit(browser, 'desktop', { width: 1440, height: 900 });
  out.small = await audit(browser, 'small', { width: 1280, height: 720 });
  out.phone = await audit(browser, 'phone', { width: 390, height: 844, touch: true });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
