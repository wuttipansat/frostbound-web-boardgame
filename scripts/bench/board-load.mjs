// Node benchmark: how long building the start board takes, split by stage (no WebGL needed).
import { performance } from 'node:perf_hooks';
const fakeCtx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.document = { createElement: () => ({ getContext: () => fakeCtx, width: 0, height: 0 }) };
const voxel = await import('../../src/render/voxel.js');
const detail = await import('../../src/render/detail.js');
const T = {};
const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[label] = (T[label] ?? 0) + performance.now() - t; } }; };
wrap(voxel.VoxelModel.prototype, 'buildGeometries', 'mesh');
const { createBoard } = await import('../../src/render/board.js');
const t0 = performance.now();
const board = createBoard();
const total = performance.now() - t0;
let tri = 0; board.root.traverse((o) => { if (o.geometry?.index) tri += o.geometry.index.count / 3 * (o.count ?? 1); });
console.log(JSON.stringify({ totalMs: Math.round(total), meshMs: Math.round(T.mesh), otherMs: Math.round(total - T.mesh), triangles: tri }));
