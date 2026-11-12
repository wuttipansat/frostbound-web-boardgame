// GODOT-1: test vectors (floats that are k / 2^32 go out as k: Godot's JSON reader is not correctly rounded) from the JS engine for the GDScript port (godot/data/vectors/*.json).
import { random, randInt, shuffle, normalizeSeed } from '../../src/core/rng.js';
import { hashZ, zoneOf, townDepth } from '../../src/core/zones.js';
import { stableJson, fnv1a, stateHash } from '../../src/core/hash.js';
import { createGame } from '../../src/core/state.js';
import { growCity } from '../../src/core/rules/city.js';

export function vectors() {
  const rng = [];
  for (const seed of [1, 7, 42, 123456789, 4294967295]) {
    const s = { rng: normalizeSeed(seed) }; const draws = [];
    for (let i = 0; i < 50; i++) draws.push(i % 3 === 0 ? ['random', random(s) * 4294967296] : i % 3 === 1 ? ['randInt', randInt(s, -3, 17)] : ['shuffle', shuffle(s, [0, 1, 2, 3, 4, 5, 6])]);
    rng.push({ seed, draws, end: s.rng });
  }
  const seeds = ['', 'abc', 'FROSTBOUND', 'กองไฟ', 'seed-2026'].map((str) => [str, normalizeSeed(str)]);
  const hz = [];
  for (let i = 0; i < 200; i++) { const a = (i * 7919) % 401 - 200; const b = (i * 104729) % 37 - 18; const c = i * 2654435761; hz.push([a, b, c, hashZ(a, b, c) * 4294967296]); }
  const tricky = [0, -0, 1, -1, 2 ** 31, 2 ** 32 + 5, 0.5, 0.1 + 0.2, 1 / 3, 1e21, 1e-7, -2.5e-8, 123.456, 'a"b\\c\n\t\u0001', 'กองไฟ สุดท้าย', '', null, true, false,
    [], {}, [1, [2, [3]]], { b: 1, a: 2, 10: 3, 2: 4, 'a-b': 5, A: 6 }, { x: undefined, y: null }, [undefined, 1],
    { nested: { z: [1, 2, { k: 'v' }], a: 'ข' } }, 'tab\tquote"', ' ', 'emoji 😀', 99999999999];
  const hash = tricky.map((v) => ({ value: v === undefined ? null : v, json: stableJson(v), hash: fnv1a(stableJson(v)) }));
  const zones = [];
  for (let look = 0; look <= 6; look++) for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) zones.push([look, x, z, zoneOf(x, z, look), townDepth(x, z, look)]);
  const growth = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createGame({ seed, scenarioId: 'crawler', days: 40 }); const hashes = [stateHash(s)];
    for (let i = 0; i < 4; i++) { growCity(s); hashes.push(stateHash(s)); }
    growth.push({ seed, hashes });
  }
  return { 'vectors/rng.json': { rng, seeds }, 'vectors/hashZ.json': hz, 'vectors/hash.json': hash, 'vectors/zones.json': zones, 'vectors/growth.json': growth };
}
