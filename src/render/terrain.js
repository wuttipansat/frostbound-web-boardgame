// HD terrain: a heightmap mesher at 0.5 world units per cell. It only emits what can be seen —
// one top quad per cell (with per-vertex AO from neighbouring heights) and the exposed side walls,
// whose rows are merged when they share a colour.
import * as THREE from 'three';
import { hash3 } from './voxel.js';
import { P } from './palette.js';
import { shadeHex, mixHex, bayer } from './detail.js';

/**
 * Generic heightmap mesher.
 * @param {object} o
 * @param {number} o.n          grid half-size (cells from -n..n on x and z)
 * @param {number} o.cell       world size of one cell (also one height step)
 * @param {(x:number,z:number)=>({h:number, top:number}|null)} o.column  null = no ground here
 * @param {(x:number,z:number,y:number)=>number} o.side  colour of the wall voxel row y in column (x,z)
 * @param {number} o.bottom     lowest height (walls at the rim go down to here)
 */
export function heightmapGeometry({ n, cell, column, side, bottom = -12, aoStrength = 0.4 }) {
  const W = 2 * n + 1;
  const H = new Int16Array(W * W).fill(-32768);
  const TOP = new Int32Array(W * W);
  const idx = (x, z) => (x + n) * W + (z + n);
  for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
    const c = column(x, z);
    if (c) { H[idx(x, z)] = c.h; TOP[idx(x, z)] = c.top; }
  }
  const height = (x, z) => (x < -n || x > n || z < -n || z > n ? -32768 : H[idx(x, z)]);
  const pos = []; const nrm = []; const col = []; const ind = [];
  const color = new THREE.Color();
  const AO = [1 - aoStrength, 1 - aoStrength * 0.6, 1 - aoStrength * 0.25, 1];

  const quad = (pts, normal, rgb, ao = [3, 3, 3, 3]) => {
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      pos.push(p[0] * cell, p[1] * cell, p[2] * cell);
      nrm.push(...normal);
      col.push(rgb.r * AO[ao[i]], rgb.g * AO[ao[i]], rgb.b * AO[ao[i]]);
    });
    const flip = ao[0] + ao[2] < ao[1] + ao[3];
    if (flip) ind.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
    else ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let x = -n; x <= n; x++) {
    for (let z = -n; z <= n; z++) {
      const h = height(x, z);
      if (h === -32768) continue;
      // Top face: corners (x,z) (x,z+1) (x+1,z+1) (x+1,z) wound counter-clockwise seen from above.
      const occ = (dx, dz) => (height(x + dx, z + dz) > h ? 1 : 0);
      const cornerAo = (sx, sz) => {
        const s1 = occ(sx, 0); const s2 = occ(0, sz); const cc = occ(sx, sz);
        return s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
      };
      color.setHex(TOP[idx(x, z)]);
      quad([[x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [0, 1, 0], color,
        [cornerAo(-1, -1), cornerAo(-1, 1), cornerAo(1, 1), cornerAo(1, -1)]);
      // Side walls towards lower neighbours, merging runs of the same colour.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let nh = height(x + dx, z + dz);
        if (nh === -32768) nh = bottom;
        if (nh >= h) continue;
        let y = nh;
        while (y < h) {
          const c0 = side(x, z, y);
          let y1 = y + 1;
          while (y1 < h && side(x, z, y1) === c0) y1++;
          color.setHex(c0).multiplyScalar(dx !== 0 ? 0.84 : 0.76);
          // Wall on the face of this column that points to (dx,dz).
          const fx = dx > 0 ? x + 1 : x; const fz = dz > 0 ? z + 1 : z;
          let pts;
          if (dx !== 0) pts = [[fx, y, z], [fx, y1, z], [fx, y1, z + 1], [fx, y, z + 1]];
          else pts = [[x, y, fz], [x + 1, y, fz], [x + 1, y1, fz], [x, y1, fz]];
          // Make the winding face outwards.
          const e1 = new THREE.Vector3(...pts[1]).sub(new THREE.Vector3(...pts[0]));
          const e2 = new THREE.Vector3(...pts[2]).sub(new THREE.Vector3(...pts[0]));
          if (e1.cross(e2).dot(new THREE.Vector3(dx, 0, dz)) < 0) pts.reverse();
          quad(pts, [dx, 0, dz], color);
          y = y1;
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * The FROSTBOUND plateau at 2× resolution.
 * env: { radius, distRoad(x,z) -> distance to nearest road (world), distPlot(x,z) -> distance to building plots }
 */
export function buildTerrainHD({ radius, distRoad, distPlot }) {
  const cell = 0.5;
  const n = Math.ceil(radius / cell) + 1;
  const strata = (x, z, y) => {
    const w = y * cell; // world height of this row
    if (w >= -1.5) return bayer(x, y, z) < 0.3 ? P.snowShade : P.snowBlue;
    if (w >= -2.5) return mixHex(P.dirt, 0x5a4638, hash3(x, y, z) * 0.6);
    // Rock with darker seams every few rows: an embossed cross-section of the diorama.
    if (y % 5 === 0) return shadeHex(P.rock, 0.72);
    return hash3(Math.floor(x / 2), y, Math.floor(z / 2)) > 0.5 ? P.rock : P.rockLight;
  };
  const column = (x, z) => {
    const wx = (x + 0.5) * cell; const wz = (z + 0.5) * cell;
    // UI-13: a square city slab (the diorama sits on a floating block of packed snow).
    const r = Math.max(Math.abs(wx), Math.abs(wz));
    const edge = radius - 3;
    if (r > edge) return null;
    const roadD = distRoad(wx, wz);
    const plotD = distPlot(wx, wz);
    const flat = Math.min(roadD - 1.5, plotD);
    const noise = Math.sin(wx * 0.21) * Math.cos(wz * 0.17) + Math.sin((wx + wz) * 0.09) * 0.8 + hash3(x, 1, z) * 0.18;
    let h = 0;
    if (flat > 2) h = Math.max(0, Math.round((noise + 0.4) * 2 * Math.min(1, (flat - 2) / 3)));
    if (r > radius - 6) h = Math.max(h, Math.floor(hash3(Math.floor(x / 2), 3, Math.floor(z / 2)) * 3));
    let top;
    if (roadD < 2.2) {
      // Snow-packed street: two dark asphalt ruts, grey slush between, a few half-buried dashes.
      top = P.snowShade;
      if (Math.abs(roadD - 1.0) < 0.3) top = P.asphalt;
      else if (roadD < 0.3 && (Math.floor((wx + wz) * 0.7) % 3 === 0)) top = 0xe9edf2; // dash
      else if (roadD < 0.7) top = P.slush;
      if (hash3(x, 5, z) < 0.04) top = shadeHex(top, 0.85);
      h = 0;
    } else if (roadD < 3.6) {
      // Sidewalk tiles under snow: a faint grid shows through, a kerb at the road side.
      top = (x % 4 === 0 || z % 4 === 0) && bayer(x, 1, z) < 0.5 ? P.paving : P.snow;
      if (roadD < 2.6) top = P.kerb;
      h = 0;
    } else {
      const coarseN = hash3(Math.floor(x / 5), 9, Math.floor(z / 5));
      if (flat > 1 && flat < 7 && coarseN > 0.9) top = hash3(x, 2, z) < 0.08 ? 0xe9f6ff : 0xa9cdea; // frozen puddle
      else if (hash3(x, 4, z) < 0.006) top = 0x4a4f5c; // debris
      else if (hash3(x, 6, z) < 0.012) top = 0xffffff; // sparkle
      else {
        const t = Math.min(1, h / 4);
        top = bayer(x, 0, z) < 0.35 - t * 0.3 ? P.snowShade : (hash3(x, 8, z) < 0.05 ? P.snowBlue : P.snow);
      }
    }
    return { h, top };
  };
  return heightmapGeometry({ n, cell, column, side: strata, bottom: -12 });
}
