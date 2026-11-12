// VOXEL-2: render every model alone at its close-up level (¾ view and front), one sheet per group:
// docs/ref/gallery/<group>.jpg.   npm run build && npx vite preview --port 4173 && node scripts/e2e/model-gallery.cjs [group]
const { chromium } = require('playwright');
const fs = require('node:fs');
const only = process.argv[2];
(async () => {
  const br = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage({ viewport: { width: 420, height: 420 } });
  await p.goto('http://localhost:4173/?snow=0&play=1&seed=1&tutorial=off');
  await p.waitForFunction(() => window.__frostbound?.board && !window.__frostbound.board.pending, null, { timeout: 90000 });
  await p.addStyleTag({ content: '*{visibility:hidden!important} #scene{visibility:visible!important}' });
  const list = await p.evaluate(async () => (await window.__frostbound.gallery()).galleryList().map(([g, label]) => [g, label]));
  const groups = {};
  for (let i = 0; i < list.length; i++) {
    const [g, label] = list[i]; if (only && g !== only) continue;
    for (const turn of [0, Math.PI / 4]) {
      await p.evaluate(async ([i, turn]) => {
        const f = window.__frostbound; const gal = await f.gallery(); const { c, s } = gal.showModel(f, i, turn);
        const cam = f.stage.camera; const v = f.stage.view; const tgt = f.stage.controls?.target ?? v.target;
        if (tgt) { tgt.set(c[0], c[1], c[2]); cam.position.set(c[0] + 64, c[1] + 63, c[2] + 64); cam.lookAt(tgt.x, tgt.y, tgt.z); } // a fixed offset (it drifted shot by shot)
        v.goalTarget = null; const z = 2.4; v.goalZoom = z; cam.zoom = z; cam.updateProjectionMatrix();
      }, [i, turn]);
      await p.waitForTimeout(700);
      (groups[g] ??= []).push({ label: `${label}${turn ? ' (front)' : ''}`, png: (await p.locator('#scene').screenshot({ type: 'jpeg', quality: 85 })).toString('base64') });
    }
  }
  fs.mkdirSync('docs/ref/gallery', { recursive: true });
  for (const [g, shots] of Object.entries(groups)) {
    const sheet = await p.evaluate(async (shots) => {
      const imgs = await Promise.all(shots.map((s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/jpeg;base64,${s.png}`; })));
      const cols = 6; const W = 300; const c = document.createElement('canvas'); c.width = cols * W; c.height = Math.ceil(imgs.length / cols) * W;
      const x2 = c.getContext('2d'); x2.fillStyle = '#111'; x2.fillRect(0, 0, c.width, c.height);
      imgs.forEach((im, i) => { const x = (i % cols) * W; const y = Math.floor(i / cols) * W; x2.drawImage(im, x, y, W, W); x2.fillStyle = 'rgba(0,0,0,.6)'; x2.fillRect(x, y, W, 22); x2.fillStyle = '#fff'; x2.font = '15px sans-serif'; x2.fillText(shots[i].label, x + 6, y + 16); });
      return c.toDataURL('image/jpeg', 0.82).split(',')[1];
    }, shots);
    fs.writeFileSync(`docs/ref/gallery/${g}.jpg`, Buffer.from(sheet, 'base64'));
    console.log(`${g}: ${shots.length} shots`);
  }
  await br.close();
})();
