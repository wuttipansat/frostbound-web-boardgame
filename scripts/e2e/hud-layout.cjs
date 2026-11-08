// Step 14: the floating HUD pieces must never overlap each other, at desktop, tablet and phone sizes,
// with the hand piled and fanned, and with the location panel open. Optionally saves screenshots.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/hud-layout.cjs [screenshot-dir]
const { chromium } = require('playwright');
const out = process.argv[2] || null;
const SIZES = [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 1024, height: 768 }],
  ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ['phone-land', { width: 844, height: 390, isMobile: true, hasTouch: true }],
];

async function setup(p) {
  await p.goto('http://localhost:4173/?snow=0&play=HAA&seed=4&ai=fast', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    const a = window.__frostbound.app; const me = a.state.players[0];
    a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 2) });
    a.tutorialEvent?.('skip');
    const s = structuredClone(a.state);
    s.phase = 'turn'; s.pendingCrossroads = null; s.activePlayerId = 'p0'; s.round = 2;
    const [sv, sv2] = s.players[0].survivors;
    s.survivors[sv].location = 'grocery'; s.survivors[sv].wounds = 1; s.locations.grocery.zombies = 2;
    s.survivors[sv2].location = 'grocery';
    for (const type of ['weapon', 'medicine', 'book', 'food', 'junk', 'tools']) for (const loc of Object.values(s.locations)) {
      const i = (loc.deck || []).findIndex((u) => window.__frostbound.itemType(s.cards[u]) === type);
      if (i >= 0) { s.players[0].hand.push(loc.deck.splice(i, 1)[0]); break; }
    }
    a.loadState(s, 'p0');
    window.__frostbound.stage.stop();
    document.getElementById('dice-stage').classList.remove('on');
    document.getElementById('dice-stage').style.display = 'none';
  });
}

function boxes() {
  const union = (els) => {
    const rs = els.filter((e) => e && e.offsetParent !== null || e?.getClientRects?.().length).map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!rs.length) return null;
    return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  };
  const q = (s) => [...document.querySelectorAll(s)];
  const vis = (s) => q(s).filter((e) => getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0');
  const loc = document.getElementById('locpanel');
  return {
    topbar: union(q('#topbar')),
    name: union(q('#pp-head')),
    dice: union(q('#pp-chips')),
    actions: union(q('#pp-actions > .icon-btn, #pp-actions > .btn')),
    hand: union([...vis('#pp-hand .item-card'), ...q('#pp-hand .hand-ctl button')]),
    tokens: union(q('.sv-token')),
    hint: union(q('#hint:not(.hidden)')),
    location: loc.classList.contains('hidden') ? null : union([loc]),
  };
}

(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const problems = [];
  for (const [name, vp] of SIZES) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await setup(p);
    for (const [state, prep] of [
      ['pile', (a) => a.set({ handCompact: true, selLoc: null })],
      ['fan', (a) => a.set({ handCompact: false, selLoc: null })],
      ['pile-location', (a) => { a.set({ handCompact: true }); a.selectSurvivor(a.state.players[0].survivors[0]); }],
      ['fan-location', (a) => { a.set({ handCompact: false }); a.selectSurvivor(a.state.players[0].survivors[0]); }],
    ]) {
      await p.evaluate(`(${prep})(window.__frostbound.app)`);
      await p.waitForTimeout(900); // the pile ↔ fan animation
      const r = await p.evaluate(boxes);
      const keys = Object.keys(r).filter((k) => r[k]);
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const A = r[keys[i]]; const B = r[keys[j]];
        const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ox > 1 && oy > 1) problems.push(`${name}/${state}: ${keys[i]} overlaps ${keys[j]} (${Math.round(ox)}×${Math.round(oy)})`);
      }
      for (const k of keys) {
        const A = r[k];
        if (A.left < -1 || A.right > vp.width + 1 || A.bottom > vp.height + 1) problems.push(`${name}/${state}: ${k} is off screen`);
      }
      if (out) await p.screenshot({ path: `${out}/after-${name}-${state}.jpg`, type: 'jpeg', quality: 82 });
    }
    const actions = await p.evaluate(() => document.querySelectorAll('#locpanel .btn.icon-act').length);
    if (actions < 5) problems.push(`${name}: only ${actions} icon actions in the location panel`);
    if (errors.length) problems.push(`${name}: page errors ${errors.join(' | ')}`);
    await p.close();
  }
  await b.close();
  console.log(problems.length ? problems.join('\n') : 'no overlaps');
  process.exit(problems.length ? 1 : 0);
})();
