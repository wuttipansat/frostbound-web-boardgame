// MAP-3: road markings and street lamps from the street segments. Pure geometry/maths (no scene objects), so it is
// testable in Node. Streets are axis-aligned; collinear segments are merged into runs so lines don't break.
import { hash3 } from './mesher.js';
import { ROAD } from './terrain.js';

export const LAMP_STEP = 9;         // lamps every 9 world along each side, sides staggered by half a step
export const LAMP_IN = ROAD.kerb + 0.5; // lamps stand 0.5 in from the kerb
const DASH = 1.5;                   // centre line: 1.5 on, 1.5 off, phase anchored to world coordinates
const LINE_W = 0.16;
const WHITE = [0.86, 0.88, 0.9]; const WORN = [0.62, 0.64, 0.66];

const nk = (x, z) => `${Math.round(x * 100)},${Math.round(z * 100)}`;

/** Street graph: nodes with their directions, and straight runs between nodes that are not plain "through" nodes. */
export function streetRuns(segments) {
  const nodes = new Map();
  const node = (x, z) => { const k = nk(x, z); if (!nodes.has(k)) nodes.set(k, { x, z, dirs: new Set() }); return nodes.get(k); };
  const segs = [];
  for (const [a, b] of segments) {
    const axis = Math.abs(a.x - b.x) > Math.abs(a.z - b.z) ? 'x' : 'z';
    const [p, q] = (axis === 'x' ? a.x < b.x : a.z < b.z) ? [a, b] : [b, a];
    node(p.x, p.z).dirs.add(`+${axis}`); node(q.x, q.z).dirs.add(`-${axis}`);
    segs.push({ axis, c: axis === 'x' ? p.z : p.x, t0: axis === 'x' ? p.x : p.z, t1: axis === 'x' ? q.x : q.z });
  }
  for (const n of nodes.values()) {
    const d = n.dirs;
    n.kind = d.size >= 3 ? 'junction' : d.size === 1 ? 'end' : ((d.has('+x') && d.has('-x')) || (d.has('+z') && d.has('-z'))) ? 'through' : 'corner';
  }
  // Merge collinear segments across "through" nodes.
  const runs = [];
  const byLine = new Map();
  for (const s of segs) { const k = `${s.axis}|${Math.round(s.c * 100)}`; if (!byLine.has(k)) byLine.set(k, []); byLine.get(k).push(s); }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.t0 - b.t0);
    let cur = null;
    for (const s of list) {
      const at = (t) => nodes.get(s.axis === 'x' ? nk(t, s.c) : nk(s.c, t));
      if (cur && Math.abs(cur.t1 - s.t0) < 1e-6 && at(s.t0).kind === 'through') cur.t1 = s.t1;
      else { cur = { ...s }; runs.push(cur); }
    }
  }
  for (const r of runs) {
    r.a = nodes.get(r.axis === 'x' ? nk(r.t0, r.c) : nk(r.c, r.t0));
    r.b = nodes.get(r.axis === 'x' ? nk(r.t1, r.c) : nk(r.c, r.t1));
  }
  return { nodes: [...nodes.values()], runs };
}

/** Flat quads for every marking: { position, normal, color, index } (one mesh for the whole city).
 *  onGround(x, z) says whether there is street surface at a spot. */
export function markingQuads(segments, onGround = () => true, y = 0.03) {
  const { runs } = streetRuns(segments);
  const pos = []; const col = [];
  // A rectangle in run space: along t0..t1, lateral l0..l1.
  const rect = (r, t0, t1, l0, l1, c) => {
    const P = (t, l) => (r.axis === 'x' ? [t, y, r.c + l] : [r.c + l, y, t]);
    const q = [P(t0, l0), P(t1, l0), P(t1, l1), P(t0, l1)];
    if (!q.every((p) => onGround(p[0], p[2]))) return; // no paint over the void at the city's rim
    for (const p of q) pos.push(...p);
    for (let i = 0; i < 4; i++) col.push(...c);
  };
  const shade = (k1, k2, k3) => (hash3(k1, k2, k3) < 0.12 ? WORN : WHITE);
  for (const r of runs) {
    const cutOf = (n) => (n.kind === 'end' ? 0.4 : ROAD.half);
    const s0 = r.t0 + cutOf(r.a); const s1 = r.t1 - cutOf(r.b);
    if (s1 <= s0) continue;
    // Junction ends: zebra on the sidewalk line, a stop line for the incoming lane; centre dashes stop before it.
    const stopAt = (n) => (n.kind === 'junction' ? ROAD.walk + 0.5 : 0);
    const d0 = r.t0 + Math.max(cutOf(r.a), stopAt(r.a) + 0.3); const d1 = r.t1 - Math.max(cutOf(r.b), stopAt(r.b) + 0.3);
    // Edge lines, in pieces so a few can be worn or snowed over.
    const e = ROAD.half - 0.35;
    for (const side of [-1, 1]) {
      for (let t = s0; t < s1; t += 3) {
        const k = Math.round(t * 10);
        if (hash3(k, side + 5, Math.round(r.c * 10)) < 0.04) continue; // snowed over
        rect(r, t, Math.min(s1, t + 3), side * e - LINE_W / 2, side * e + LINE_W / 2, shade(k, side, 9));
      }
    }
    // Centre dashes anchored to world coordinates.
    for (let k = Math.ceil(d0 / (2 * DASH)); k * 2 * DASH + DASH <= d1; k++) {
      if (hash3(k, 7, Math.round(r.c * 10)) < 0.06) continue;
      rect(r, k * 2 * DASH, k * 2 * DASH + DASH, -LINE_W / 2, LINE_W / 2, shade(k, 3, Math.round(r.c)));
    }
    for (const [n, dir] of [[r.a, 1], [r.b, -1]]) {
      const t = dir > 0 ? r.t0 : r.t1;
      if (n.kind === 'junction') {
        // Zebra: stripes along the road, across the carriageway, where the cross street's sidewalk meets it.
        const z0 = t + dir * ROAD.kerb; const z1 = t + dir * ROAD.walk;
        for (let l = -ROAD.half + 0.45; l <= ROAD.half - 0.45 + 1e-6; l += 0.75) rect(r, Math.min(z0, z1), Math.max(z0, z1), l - 0.22, l + 0.22, shade(Math.round(l * 10), Math.round(t), 11));
        // Stop line across the lane coming in (right-hand traffic: the lane on the driver's right).
        const right = r.axis === 'x' ? -dir : dir; // lateral sign of the right-hand lane for traffic heading to n
        const st = t + dir * stopAt(n);
        const [la, lb] = right > 0 ? [0.15, ROAD.half - 0.3] : [-(ROAD.half - 0.3), -0.15];
        rect(r, Math.min(st, st + dir * 0.35), Math.max(st, st + dir * 0.35), la, lb, WHITE);
      } else if (n.kind === 'end') {
        const st = t + dir * 0.4;
        rect(r, Math.min(st, st + dir * 0.4), Math.max(st, st + dir * 0.4), -ROAD.half + 0.3, ROAD.half - 0.3, WHITE);
      }
    }
  }
  const nq = pos.length / 12;
  const index = new Uint32Array(nq * 6);
  for (let q = 0; q < nq; q++) index.set([q * 4, q * 4 + 2, q * 4 + 1, q * 4, q * 4 + 3, q * 4 + 2], q * 6);
  // Winding: make every quad face up.
  for (let q = 0; q < nq; q++) {
    const o = q * 12;
    const ax = pos[o + 3] - pos[o]; const az = pos[o + 5] - pos[o + 2]; const bx = pos[o + 6] - pos[o]; const bz = pos[o + 8] - pos[o + 2];
    if (az * bx - ax * bz > 0) { const i = q * 6; index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], i); }
  }
  const normal = new Float32Array(pos.length);
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
  return { position: new Float32Array(pos), normal, color: new Float32Array(col), index };
}

/**
 * Street lamps: every LAMP_STEP along both sides (staggered, anchored to world coordinates), none near a junction
 * or on a crossing, one on each junction corner instead. onGround(x, z) says whether a spot has sidewalk under it.
 * Returns [{ x, z, dx, dz (unit vector towards the road), dead, flicker }].
 */
export function lampSpots(segments, onGround = () => true) {
  const { nodes, runs } = streetRuns(segments);
  const out = [];
  const keep = (x, z, dx, dz) => {
    if (!onGround(x, z)) return;
    const h = hash3(Math.round(x * 4), 91, Math.round(z * 4));
    out.push({ x, z, dx, dz, dead: h < 0.07, flicker: h >= 0.07 && h < 0.13 });
  };
  const junctions = nodes.filter((n) => n.kind === 'junction');
  const others = nodes.filter((n) => n.kind === 'corner' || n.kind === 'end');
  for (const r of runs) {
    for (const side of [1, -1]) {
      const phase = side > 0 ? 0 : LAMP_STEP / 2;
      for (let k = Math.ceil((r.t0 - phase) / LAMP_STEP); k * LAMP_STEP + phase <= r.t1; k++) {
        const t = k * LAMP_STEP + phase;
        const [x, z] = r.axis === 'x' ? [t, r.c + side * LAMP_IN] : [r.c + side * LAMP_IN, t];
        if (junctions.some((n) => Math.hypot(n.x - x, n.z - z) < 11)) continue; // junction box, crossings, corner lamps
        if (others.some((n) => Math.hypot(n.x - x, n.z - z) < ROAD.walk + 1)) continue;
        const [dx, dz] = r.axis === 'x' ? [0, -side] : [-side, 0];
        keep(x, z, dx, dz);
      }
    }
  }
  // Junction corners: one lamp on each corner, leaning over the junction.
  for (const n of junctions) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) keep(n.x + sx * LAMP_IN, n.z + sz * LAMP_IN, -sx * Math.SQRT1_2, -sz * Math.SQRT1_2);
  }
  return out;
}
