// Requires Playwright with Chromium and a running preview server: npm run build && npx vite preview --port 4173
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await page.goto('http://localhost:4173/?snow=0&quality=' + (process.argv[2] || 'medium'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Time every portrait + item synchronously (worst case: everything at once), small and large.
  console.log(JSON.stringify(await page.evaluate(() => {
    const f = window.__frostbound;
    f.stage.stop();
    const tier = f.stage.quality.id;
    const ids = { survivor: Object.keys(window.__frostbound.app.state ? {} : {}), };
    const t0 = performance.now();
    const items = ['canned-beans','frozen-venison','rice-sack','beef-jerky','cafeteria-tray','first-aid-pouch','antibiotics','cough-syrup','saline-bags','herbal-guide','jerry-can','lamp-oil','space-heater-fuel','oxygen-tank','candle-box','flare','road-flare-kit','zip-ties','duct-tape','repair-manual','socket-set','surgical-saw','old-almanac','service-pistol','riot-baton','pump-shotgun','box-cutter','hockey-stick','tire-iron','letter-opener','lost-and-found','shopping-cart','board-games','bedpan','paperback-pile','motor-junk'];
    const survivors = ['maren-holt','osei-vance','pim-arunrat','ilse-brandt','teodor-rusu','nia-calloway','wren-okafor','lio-fontaine','hattie-moss','rafael-quist','agnes-pell','corwin-daly','juno-barrera','kanya-srisuk','bo-lindqvist','ezra-kade','greta-vos','silas-thorn','dot-ferreira','ambrose-lark'];
    const specs = [
      ...survivors.flatMap((id) => ['s', 'l'].map((size) => ({ kind: 'survivor', id, size, tier }))),
      ...['0','1','2','3','4'].flatMap((id) => ['s', 'l'].map((size) => ({ kind: 'zombie', id, size, tier }))),
      ...items.flatMap((id) => ['s', 'l'].map((size) => ({ kind: 'item', id, size, tier }))),
    ];
    for (const s of specs) f.art.cache.get(s);
    while (f.art.cache.pump()) {}
    const st = f.art.cache.stats;
    return { images: st.rendered, totalMs: Math.round(st.totalMs), avgMs: +(st.totalMs / st.rendered).toFixed(1), maxMs: Math.round(st.maxMs), wall: Math.round(performance.now() - t0) };
  })));
  await browser.close();
})();
