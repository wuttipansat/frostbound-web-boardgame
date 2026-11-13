// UI-2: next-step line, why-disabled reasons, useful-action check, likely loot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/ai/simulate.js';
import * as act from '../src/core/actions.js';
import { nextHint, whyDisabled, usefulActionLeft, apNeed, uxSnapshot } from '../src/core/ux.js';
import { actionCost, packSize } from '../src/core/selectors.js';
import { tryReduce } from '../src/core/reducer.js';
import { shouldConfirmEndTurn } from '../src/ui/options.js';
import { likelyLoot } from '../src/ui/uxText.js';

/** States from a bot game on the player's turn. */
function turnStates(seed = 3, every = 7) {
  const out = [];
  let i = 0;
  simulate({ scenarioId: 'crawler', seed, onStep: (s) => { if (s.phase === 'turn' && i++ % every === 0) out.push(s); } });
  return out;
}

test('ux: legal actions have no reason; illegal ones carry the engine reason', () => {
  for (const s of turnStates()) {
    for (const id of s.team.survivors.filter((x) => s.survivors[x]?.alive)) {
      for (const a of [act.attack(id), act.search(id), act.barricade(id), act.move(id, 'colony')]) {
        const r = tryReduce(s, a);
        const w = whyDisabled(s, a);
        if (r.ok) assert.equal(w, null);
        else if (r.error === 'notEnoughEnergy' && apNeed(s, a) != null) assert.deepEqual(w, { key: 'ux.energy', params: { need: apNeed(s, a), have: s.survivors[id].ap } });
        else if (r.error === 'packFull') assert.equal(w.key, 'ux.packFull');
        else assert.equal(w.key, `err.${r.error}`);
      }
    }
  }
});

test('ux: energy reason names the real price and what the survivor has', () => {
  const s = turnStates()[0];
  const id = s.team.survivors[0];
  s.survivors[id].ap = 1;
  const to = Object.keys(s.locations).find((l) => l !== s.survivors[id].location && l !== 'colony');
  const w = whyDisabled(s, act.move(id, to));
  assert.equal(w.key, 'ux.energy');
  assert.equal(w.params.need, actionCost(s, id, 'move', to));
  assert.equal(w.params.have, 1);
  assert.equal(packSize(s, id) >= 3, true);
});

test('ux: useful action is always legal, and none means no AP worth spending', () => {
  let some = 0;
  let none = 0;
  for (const s of turnStates(5, 3)) {
    const u = usefulActionLeft(s);
    if (!u) { none++; continue; }
    some++;
    const a = { attack: act.attack(u.survivorId), search: act.search(u.survivorId), heal: act.useAbility(u.survivorId, u.targetId), barricade: act.barricade(u.survivorId), build: act.build(u.buildingId, u.survivorId) }[u.kind];
    assert.equal(tryReduce(s, a).ok, true, `${u.kind} should be legal`);
  }
  assert.ok(some > 0 && none > 0, `saw both cases (${some} / ${none})`);
});

test('ux: next-step line starts with AP left, then the useful thing or "end"', () => {
  for (const s of turnStates()) {
    const parts = nextHint(s);
    assert.equal(parts[0].key, 'nh.ap');
    assert.ok(parts[1].key === 'nh.end' || /^nh\.(attack|search|heal|barricade|build)$/.test(parts[1].key));
    assert.ok(parts.length <= 3);
    assert.doesNotThrow(() => JSON.stringify(uxSnapshot(s)));
  }
});

test('ux: end-turn confirm only when something is worth doing', () => {
  for (const s of turnStates(4, 5)) {
    const useful = !!usefulActionLeft(s);
    if (useful) assert.equal(shouldConfirmEndTurn(s), true);
    assert.equal(shouldConfirmEndTurn(s, { skip: true }), false);
  }
});

test('ux: likely loot comes from the place deck', () => {
  const s = turnStates()[0];
  const police = Object.keys(s.locations).find((l) => l.startsWith('police'));
  if (police) assert.ok(likelyLoot(s, police).length > 0);
  assert.deepEqual(likelyLoot(s, 'colony'), []);
});
