// Step 15: while a bot plays, the camera leaves the player's view (pans / zooms to the action),
// callouts show, Space skips a scene, and once the queue is empty the camera is back where it was.
// Frames are stepped by hand (software WebGL is slow): stage.step() runs one frame of everything.
//   npm run build && npx vite preview --port 4173 && node scripts/e2e/watch.cjs [screenshot-dir]
const { chromium } = require('playwright');
const out = process.argv[2] || null;
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const problems = [];
  for (const [device, vp] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const p = await b.newPage({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => process.env.DEBUG && console.log('page:', m.text()));
    await p.goto('http://localhost:4173/?snow=0&play=HA&seed=4&ai=fast&scenes=8', { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);
    await p.evaluate(() => {
      const f = window.__frostbound; const a = f.app; const me = a.state.players[0];
      f.stage.stop();
      a.dispatch({ type: 'DRAFT_PICK', playerId: me.id, survivorIds: me.draftOptions.slice(0, 1) });
      a.tutorialEvent('skip');
    });
    // Play p0's turn away (End turn), then let the bot go, stepping frames until its scenes play.
    const step = (n = 1, dt = 0.25) => p.evaluate(([k, d]) => { for (let i = 0; i < k; i++) window.__frostbound.stage.step(d); }, [n, dt]);
    let watched = null;
    let ended = false;
    for (let i = 0; i < 320 && !watched; i++) {
      watched = await p.evaluate((endedTurn) => {
        const f = window.__frostbound; const a = f.app; const s = a.state;
        const cur = a.director.current;
        if (a.watching && cur && ['move', 'attack', 'search', 'barricade', 'lure', 'clean'].includes(cur.kind)) return cur.kind;
        // Reveal dialogs (crossroads, colony) pause the bot: continue them. Never start a new game.
        document.querySelector('.dialog.cross-result .btn.primary, .dialog.colony .btn.primary')?.click();
        document.querySelector('button.choice:not([disabled])')?.click();
        if (s.phase !== 'draft' && document.querySelector('.obj-reveal')) { a.markObjectiveSeen(); return null; }
        if (!endedTurn && s.phase === 'turn' && s.activePlayerId === 'p0') { a.dispatch({ type: 'END_TURN', playerId: 'p0' }); return 'ended'; }
        return null;
      }, ended);
      if (watched === 'ended') { ended = true; watched = null; }
      if (!watched) { await step(1, 0.1); await p.waitForTimeout(150); }
    }
    if (!watched) {
      const st = await p.evaluate(() => { const a = window.__frostbound.app; return { phase: a.state.phase, act: a.state.activePlayerId, cur: a.director.current, q: a.ui.queue.length, modal: document.querySelector('#modal')?.innerText.slice(0, 80) }; });
      problems.push(`${device}: never saw a bot scene ${JSON.stringify(st)}`); await p.close(); continue;
    }
    // The player's own view, as the rig saved it when it first moved.
    const home = await p.evaluate(() => { const h = window.__frostbound.rig.homeView; return h ? { t: h.target.toArray(), z: h.zoom } : null; });
    if (!home) { problems.push(`${device}: the camera rig never took over`); await p.close(); continue; }
    await step(4, 0.25);
    const during = await p.evaluate(() => ({
      t: window.__frostbound.stage.controls.target.toArray(), z: window.__frostbound.stage.camera.zoom,
      callouts: document.querySelectorAll('.scene-callout').length, watching: document.body.classList.contains('watching'),
      skipHint: !!document.querySelector('#phase .skip-hint'),
    }));
    const moved = Math.hypot(during.t[0] - home.t[0], during.t[2] - home.t[2]) > 0.5 || during.z > home.z * 1.1;
    if (!moved) problems.push(`${device}: camera did not move for a ${watched} (${JSON.stringify({ home, during })})`);
    if (!during.callouts) problems.push(`${device}: no callout`);
    if (!during.watching) problems.push(`${device}: body.watching not set`);
    if (out) await p.screenshot({ path: `${out}/after-${device}-bot-${watched}.jpg`, type: 'jpeg', quality: 82 });
    // Space skips the scene on screen.
    // (Space on a focused button presses the button, as usual: start from the board.)
    await p.waitForFunction(() => window.__frostbound.app.watching, null, { timeout: 60000 }).catch(() => {});
    const before = await p.evaluate(() => { document.activeElement?.blur?.(); return window.__frostbound.app.director.current; });
    await p.keyboard.press('Space');
    const after = await p.evaluate(() => window.__frostbound.app.director.current);
    if (JSON.stringify(before) === JSON.stringify(after)) {
      const dbg = await p.evaluate(() => ({ w: window.__frostbound.app.watching, active: document.activeElement?.outerHTML.slice(0, 80) }));
      problems.push(`${device}: Space did not skip ${JSON.stringify({ before, after, dbg })}`);
    }
    // Let the queue run out (scenes are timed in real time), stepping frames so the camera comes home.
    for (let i = 0; i < 80; i++) {
      const busy = await p.evaluate(() => { const a = window.__frostbound.app; document.querySelector('.backdrop .dialog .btn.primary')?.click(); a.director.skip(); return a.director.busy || a.director.settling || a.state.activePlayerId !== 'p0'; });
      if (!busy) break;
      await step(1, 0.1);
      await p.waitForTimeout(50);
    }
    await step(16, 0.25);
    const back = await p.evaluate(() => ({ t: window.__frostbound.stage.controls.target.toArray(), z: window.__frostbound.stage.camera.zoom, busy: window.__frostbound.app.director.busy }));
    if (back.busy) problems.push(`${device}: the queue never emptied`);
    if (Math.hypot(back.t[0] - home.t[0], back.t[2] - home.t[2]) > 0.3 || Math.abs(back.z - home.z) > 0.03) problems.push(`${device}: camera not back home (${JSON.stringify({ home, back })})`);
    if (errors.length) problems.push(`${device}: ${errors.join(' | ')}`);
    await p.close();
  }
  await b.close();
  console.log(problems.length ? problems.join('\n') : 'camera follows, skips and comes home');
  process.exit(problems.length ? 1 : 0);
})();
