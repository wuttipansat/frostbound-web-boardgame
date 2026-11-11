// Step 22: performance checks.
//  - bundle budget (gzip): entry + three + css under budget; post-processing is a separate lazy chunk
//  - loading screen: shows at once, gone after the first frame; load time reported
//  - battery saver never downloads post-processing; the graphics setting sticks across reloads
//  - drawing slows down behind the opaque pass-the-device screen
//  - frame cost reported (software GL here, so only a loose ceiling)
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/perf.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const BUDGET = { entry: 130, three: 135, initial: 300 }; // KB gzip
(async () => {
  const problems = [];
  const dir = 'dist/assets';
  const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dir, f))).length / 1024;
  const files = fs.readdirSync(dir);
  const pick = (re) => files.filter((f) => re.test(f));
  const entry = pick(/^index-.*\.js$/).reduce((a, f) => a + gz(f), 0);
  const three = pick(/^three-.*\.js$/).reduce((a, f) => a + gz(f), 0);
  const css = pick(/\.css$/).reduce((a, f) => a + gz(f), 0);
  const post = pick(/^post-.*\.js$/);
  const sizes = { entry: +entry.toFixed(1), three: +three.toFixed(1), css: +css.toFixed(1), initial: +(entry + three + css).toFixed(1) };
  if (!post.length) problems.push('post-processing is not a separate chunk');
  if (!three) problems.push('three.js is not a separate chunk');
  for (const k of Object.keys(BUDGET)) if (sizes[k] > BUDGET[k]) problems.push(`${k} ${sizes[k]} KB gz > budget ${BUDGET[k]} KB`);

  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = { sizes };
  // 1. Default load: loading screen first, then gone; post chunk requested (auto starts on a post tier).
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const reqs = [];
    p.on('request', (r) => reqs.push(r.url()));
    p.on('pageerror', (e) => problems.push(`default: ${e.message}`));
    const t0 = Date.now();
    await p.goto('http://localhost:4173/?snow=0', { waitUntil: 'domcontentloaded' });
    if (!(await p.locator('#boot').count())) problems.push('no loading screen at first paint');
    await p.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('done'), null, { timeout: 30000 }).catch(() => problems.push('loading screen never went away'));
    report.loadMs = Date.now() - t0;
    // LOAD-1: phase marks from the page (ms since navigation) and long main-thread tasks during load.
    report.marks = await p.evaluate(() => window.__loadTimes);
    if (!report.marks?.packed) problems.push('model pack not used');
    await p.waitForFunction(() => window.__loadTimes?.allBlocks, null, { timeout: 30000 }).catch(() => problems.push('city never finished building'));
    report.marks = await p.evaluate(() => window.__loadTimes);
    report.buildSliceMs = Math.round(await p.evaluate(() => window.__frostbound.board.stats.maxSliceMs));
    if (report.buildSliceMs > 50) problems.push(`a progressive build step took ${report.buildSliceMs} ms`);
    const m = report.marks;
    if (m.allBlocks - m.start > 8000) problems.push(`city took ${m.allBlocks - m.start} ms to build`);
    await p.waitForTimeout(800);
    if (!reqs.some((u) => /post-.*\.js/.test(u))) problems.push('auto/high did not load post-processing');
    report.gfx = await p.evaluate(() => document.body.dataset.gfx);
    // Frame cost: a few hand-stepped frames.
    report.frameMs = await p.evaluate(() => { const f = window.__frostbound; f.stage.stop(); const t = performance.now(); for (let i = 0; i < 5; i++) f.stage.step(0.016); return Math.round((performance.now() - t) / 5); });
    if (report.frameMs > 2000) problems.push(`frame takes ${report.frameMs} ms`);
    // Settings: pick battery saver; it must stick.
    await p.evaluate(() => window.__frostbound.app.set({ modal: 'settings' }));
    await p.locator('[data-graphics="saver"]').click({ force: true });
    if ((await p.evaluate(() => document.body.dataset.gfx)) !== 'saver') problems.push('saver setting not applied');
    if ((await p.evaluate(() => window.__frostbound.stage.drawEvery)) !== 2) problems.push('saver does not draw at half rate');
    await ctx.close();
  }
  // 2. A fresh visit with saver saved: no post chunk at all, still saver.
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('frostbound.settings.v1', JSON.stringify({ graphics: 'saver', tutorial: 'off' })); } catch { /* */ } });
    const p = await ctx.newPage();
    const reqs = [];
    p.on('request', (r) => reqs.push(r.url()));
    p.on('pageerror', (e) => problems.push(`saver: ${e.message}`));
    await p.goto('http://localhost:4173/?snow=0&play=1&seed=3', { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    if (reqs.some((u) => /post-.*\.js/.test(u))) problems.push('saver downloaded post-processing');
    if ((await p.evaluate(() => document.body.dataset.gfx)) !== 'saver') problems.push('saver not restored after reload');
    // 3. The draft screen covers the board → draw 1 frame in 4.
    await p.evaluate(() => window.__frostbound.app.set({ modal: null }));
    const passing = await p.locator('.draft-screen').count();
    await p.waitForTimeout(800);
    const every = await p.evaluate(() => window.__frostbound.stage.drawEvery);
    report.coveredDrawEvery = every;
    if (passing && every < 4) problems.push(`covered screen still draws every ${every} frame(s)`);
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(report));
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'perf: ok, 0 problems');
  process.exit(problems.length ? 1 : 0);
})();
