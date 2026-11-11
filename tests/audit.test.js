// MAP audit as a test: nothing overlaps, floats, sits over the void or on the track, or blocks a door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('map audit: 2 seeds × 3 stages have no placement problems', () => {
  const out = execFileSync(process.execPath, ['scripts/audit-map.mjs', '2', '3', '--no-write'], { encoding: 'utf8' });
  assert.match(out, /^0 findings/m, out.split('\n').slice(0, 12).join('\n'));
});
