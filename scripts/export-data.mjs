// GODOT-0: dump the game's content, tunables and text to godot/data/*.json, plus golden replays
// (seeded bot games, a state hash per action) for checking a port of the rules.
//   node scripts/export-data.mjs [goldenGames=20]
// Functions in content cannot become JSON: they are written as {"$fn": "<path>"} and listed in TODO-logic.md.
import fs from 'node:fs';
import { simulate } from '../src/ai/simulate.js';
import { stateHash } from '../src/core/hash.js';

const OUT = 'godot/data';
const MODULES = {
  constants: '../src/core/constants.js',
  locations: '../src/content/locations.js',
  items: '../src/content/items.js',
  buildings: '../src/content/buildings.js',
  crises: '../src/content/crises.js',
  crossroads: '../src/content/crossroads.js',
  scenarios: '../src/content/scenarios.js',
  survivors: '../src/content/survivors.js',
};

/** value -> plain JSON value; functions become {$fn: path} and are reported. */
export function plain(v, path, fns) {
  if (typeof v === 'function') { fns.push(path); return { $fn: path }; }
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x, i) => plain(x, `${path}[${i}]`, fns));
  const o = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = plain(x, `${path}.${k}`, fns);
  return o;
}

export async function exportData({ out = OUT, golden = 20, write = true } = {}) {
  const files = {}; const fns = [];
  for (const [name, path] of Object.entries(MODULES)) {
    const mod = await import(path);
    const data = {};
    for (const [k, v] of Object.entries(mod)) {
      if (k.endsWith('_BY_ID')) continue; // (an index of a list already exported)
      data[k] = plain(v, `${name}.${k}`, fns);
    }
    files[`${name}.json`] = data;
  }
  const [en, th, contentTh] = await Promise.all(['../src/i18n/en.js', '../src/i18n/th.js', '../src/i18n/content.th.js'].map((p) => import(p).then((m) => m.default)));
  files['i18n/en.json'] = { ui: plain(en, 'en', fns) };
  files['i18n/th.json'] = { ui: plain(th, 'th', fns), content: plain(contentTh, 'contentTh', fns) };
  for (let seed = 1; seed <= golden; seed++) {
    const steps = [];
    const { state, errors } = simulate({ scenarioId: 'crawler', seed, difficulty: 'normal', onStep: (s, action) => {
      steps.push({ action, hash: stateHash(s), day: s.day, time: s.time, phase: s.phase, morale: s.morale, food: s.food, team: s.team?.length ?? 0 });
    } });
    files[`golden/${seed}.json`] = { seed, scenarioId: 'crawler', difficulty: 'normal', start: stateHash(simulate({ scenarioId: 'crawler', seed, maxSteps: 0 }).state),
      result: state.result ?? null, illegal: errors.length, steps };
  }
  files['TODO-logic.md'] = `# Content logic to port by hand (GODOT-1)\n\nThese entries are functions in the web build; the JSON holds \`{"$fn": path}\` in their place.\n\n${fns.length ? fns.map((p) => `- \`${p}\``).join('\n') : '- (none)'}\n`;
  if (write) {
    fs.rmSync(out, { recursive: true, force: true });
    for (const [f, d] of Object.entries(files)) {
      fs.mkdirSync(`${out}/${f.split('/').slice(0, -1).join('/')}`, { recursive: true });
      fs.writeFileSync(`${out}/${f}`, typeof d === 'string' ? d : JSON.stringify(d, null, f.startsWith('golden/') ? 0 : 1));
    }
  }
  return { files, fns };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const { files, fns } = await exportData({ golden: Number(process.argv[2] ?? 20) });
  const mb = Object.values(files).reduce((a, d) => a + (typeof d === 'string' ? d : JSON.stringify(d)).length, 0) / 1e6;
  console.log(`exported ${Object.keys(files).length} data files, ${mb.toFixed(1)} MB, ${fns.length} functions to port, ${Date.now() - t0} ms`);
}
