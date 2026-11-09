// Requires a running preview server (npm run build && npx vite preview --port 4173).
// Regression: after starting new games, the board shows exactly the new state's survivors.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:4173/?play=AAA&seed=3&ai=fast');
  await p.waitForTimeout(6000); // let the AI play a while
  const rounds = [];
  for (const seed of [11, 12, 13, 14, 15]) {
    const r = await p.evaluate(async (seed) => {
      const f = window.__frostbound;
      f.app.quickStart({ seats: 'HA', seed });
      const me = f.app.state.players[0];
      const draftBoard = f.pieces.counts().survivors;
      f.app.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 1) });
      await new Promise((r) => setTimeout(r, 1500));
      const alive = Object.values(f.app.state.survivors).filter((s) => s.alive).length;
      const info = f.stage.renderer?.info?.memory ?? {};
      return { draftBoard, alive, figures: f.pieces.counts().survivors, geometries: info.geometries };
    }, seed);
    rounds.push(r);
  }
  console.log(JSON.stringify(rounds));
  const bad = rounds.filter((r) => r.draftBoard !== 0 || r.figures !== r.alive);
  const leak = rounds.at(-1).geometries - rounds[0].geometries > 40;
  console.log(bad.length || leak || errors.length ? `FAIL ${JSON.stringify({ bad, leak, errors })}` : 'new-game reset OK');
  await b.close();
  process.exit(bad.length || leak || errors.length ? 1 : 0);
})();
