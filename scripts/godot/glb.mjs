// GODOT-0: a tiny glTF 2.0 binary (.glb) writer for voxel meshes (no dependencies).
// A mesh is { position: Float32Array, normal: Float32Array, color: Float32Array (linear rgb), index: Uint32Array|Uint16Array }.
// prims: [{ mesh, unlit }] — `unlit` marks glowing parts (windows, fire) with KHR_materials_unlit.

const FLOAT = 5126, USHORT = 5123, UINT = 5125;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;

/** prims -> Uint8Array (.glb). */
export function writeGlb(prims, { name = 'model' } = {}) {
  const views = []; const accessors = []; const chunks = []; let at = 0;
  const add = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (at % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); at += pad; }
    views.push({ buffer: 0, byteOffset: at, byteLength: bytes.length, target });
    chunks.push(bytes); at += bytes.length;
    return views.length - 1;
  };
  const acc = (o) => { accessors.push(o); return accessors.length - 1; };
  const materials = [
    { name: 'voxel', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
    { name: 'glow', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } },
  ];
  let usesUnlit = false;
  const primitives = [];
  for (const { mesh, unlit } of prims) {
    if (!mesh || !mesh.index?.length) continue;
    const n = mesh.position.length / 3;
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = mesh.position[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
    const pos = acc({ bufferView: add(Float32Array.from(mesh.position), ARRAY_BUFFER), componentType: FLOAT, count: n, type: 'VEC3', min, max });
    const nor = acc({ bufferView: add(Float32Array.from(mesh.normal), ARRAY_BUFFER), componentType: FLOAT, count: n, type: 'VEC3' });
    const col16 = new Uint16Array(n * 3);
    for (let i = 0; i < col16.length; i++) col16[i] = Math.round(Math.min(1, Math.max(0, mesh.color[i])) * 65535);
    const col = acc({ bufferView: add(col16, ARRAY_BUFFER), componentType: USHORT, normalized: true, count: n, type: 'VEC3' });
    const small = n <= 65535;
    const idx = small ? Uint16Array.from(mesh.index) : Uint32Array.from(mesh.index);
    const ind = acc({ bufferView: add(idx, ELEMENT_ARRAY_BUFFER), componentType: small ? USHORT : UINT, count: idx.length, type: 'SCALAR' });
    if (unlit) usesUnlit = true;
    primitives.push({ attributes: { POSITION: pos, NORMAL: nor, COLOR_0: col }, indices: ind, material: unlit ? 1 : 0 });
  }
  const json = {
    asset: { version: '2.0', generator: 'frostbound export-glb' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives }], materials, accessors, bufferViews: views, buffers: [{ byteLength: at }],
  };
  if (usesUnlit) json.extensionsUsed = ['KHR_materials_unlit'];
  return pack(json, chunks, at);
}

function pack(json, chunks, binLen) {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  const bpad = (4 - (binLen % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jpad + 8 + binLen + bpad;
  const out = new Uint8Array(total); const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jpad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jpad);
  let o = 20 + jsonBytes.length + jpad;
  dv.setUint32(o, binLen + bpad, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** .glb bytes -> { json, bin } (for tests and checks). */
export function readGlb(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  if (dv.getUint32(8, true) !== bytes.byteLength) throw new Error('bad length');
  const jl = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('no JSON chunk');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jl)));
  const bl = dv.getUint32(20 + jl, true);
  if (dv.getUint32(24 + jl, true) !== 0x004e4942) throw new Error('no BIN chunk');
  if (bl < json.buffers[0].byteLength) throw new Error('BIN too short');
  return { json, bin: bytes.subarray(28 + jl, 28 + jl + bl) };
}
