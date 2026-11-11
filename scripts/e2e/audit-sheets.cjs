// MAP audit contact sheets: per seed, stage 1 and stage 4 overviews and close-ups of the colony, the railway,
// the evacuation route and a place, tiled into one labelled image (docs/ref/audit/seed-N.jpg).
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/audit-sheets.cjs [seeds]
const { chromium } = require('playwright');
const fs = require('node:fs');
const SEEDS = +(process.argv[2] ?? 3);
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  fs.mkdirSync('docs/ref/audit', { recursive: true });
  for (let seed = 1; seed <= SEEDS; seed++) {
    const p = await br.newPage({ viewport: { width: 640, height: 640 } });
    await p.goto(`http://localhost:4173/?snow=0&play=1&seed=${seed}&tutorial=off`);
    await p.waitForFunction(() => window.__frostbound?.board && !window.__frostbound.board.pending, null, { timeout: 90000 });
    const cards = p.locator('.draft-screen .sv-pick');
    if (await cards.count()) { await cards.nth(0).click(); await cards.nth(1).click(); await p.locator('.draft-screen .btn.primary').first().click().catch(() => {}); }
    await p.waitForTimeout(800);
    await p.addStyleTag({ content: '*{visibility:hidden!important} #scene{visibility:visible!important}' });
    const shots = [];
    const look = async (label, fn, arg) => {
      await p.evaluate(fn, arg);
      await p.waitForTimeout(1600);
      shots.push({ label, png: (await p.locator('#scene').screenshot({ type: 'jpeg', quality: 80 })).toString('base64') });
    };
    // flush() makes waiting models; stepping the board finishes pop-in (software GL frames are slow).
    const home = () => { const f = window.__frostbound; f.board.flush(); for (let i = 0, t = performance.now() / 1000; i < 80; i++) f.board.update(t + i * 0.1); f.stage.view.reset(); };
    const close = ([x, z]) => { const f = window.__frostbound; f.board.flush(); for (let i = 0, t = performance.now() / 1000; i < 80; i++) f.board.update(t + i * 0.1); const v = f.stage.view; const cam = f.stage.camera; const tgt = f.stage.controls?.target ?? v.target;
      // Jump the camera (easing is too slow on software GL): keep its offset, move its target, set the zoom.
      if (tgt) { const off = cam.position.clone().sub(tgt); tgt.set(x, 0, z); cam.position.copy(tgt).add(off); }
      v.goalTarget = null; v.goalZoom = 2.4; cam.zoom = 2.4; cam.updateProjectionMatrix(); f.board.setZoom(2.4); };
    const where = () => p.evaluate(() => {
      const f = window.__frostbound; const r = f.board.root;
      const box = (n) => { const o = r.getObjectByName(n); if (!o) return null; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; return [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2]; };
      const places = Object.values(f.board.layout).filter((L) => L.plan).map((L) => [L.id, L.center.x, L.center.z]);
      return { rail: box('railway'), furn: box('furniture'), places };
    });
    await look('stage 1', home);
    let w = await where();
    await look('colony', close, [0, 0]);
    if (w.rail) await look('railway', close, w.rail);
    for (let k = 0; k < 3; k++) {
      await p.evaluate(() => { const f = window.__frostbound; const s = structuredClone(f.app.state); const uid = `map-a${s.map.stage}`; s.cards[uid] = 'city-map-piece'; s.stockpile.push(uid); s.phase = 'turn'; s.pendingCrossroads = null; f.app.loadState(s); f.app.dispatch?.({ type: 'PLAY_CARD', cardUid: uid }); });
      await p.waitForTimeout(3500);
    }
    w = await where();
    await look('stage 4', home);
    for (const [id, x, z] of w.places.slice(-2)) await look(id, close, [x, z]);
    // Tile into one sheet with labels.
    const sheet = await p.evaluate(async (shots) => {
      const imgs = await Promise.all(shots.map((s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/jpeg;base64,${s.png}`; })));
      const cols = 3; const W = 420; const H = 420; const c = document.createElement('canvas');
      c.width = cols * W; c.height = Math.ceil(imgs.length / cols) * H;
      const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
      imgs.forEach((im, i) => { const x = (i % cols) * W; const y = Math.floor(i / cols) * H; g.drawImage(im, x, y, W, H); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y, W, 26); g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(shots[i].label, x + 8, y + 18); });
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    }, shots);
    fs.writeFileSync(`docs/ref/audit/seed-${seed}.jpg`, Buffer.from(sheet, 'base64'));
    console.log(`seed ${seed}: ${shots.length} shots`);
    await p.close();
  }
  await br.close();
})();
