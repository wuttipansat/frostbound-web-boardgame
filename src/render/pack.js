// LOAD-1: the baked model pack. scripts/bake-models.mjs writes it at build time (quad records per model build);
// the game fetches it once at start, so models it covers need no voxels and no meshing.
// Layout: Uint32 header length | header JSON | padding to 4 | Int16 quad data.

export const PACK_FILE = 'models.bin';

/** entries: Map ck -> { lit, glow (Int16Array|null), palette { rgb, glow }, off, min, max } -> bytes */
export function encodePack(entries) {
  const chunks = []; let at = 0;
  const put = (a) => { if (!a) return null; const r = [at, a.length]; chunks.push(a); at += a.length; return r; };
  const models = [];
  for (const [ck, e] of entries) {
    models.push([ck, e.off, e.min, e.max, Array.from(e.palette.rgb), Array.from(e.palette.glow), put(e.lit), put(e.glow)]);
  }
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, models }));
  const start = (4 + head.length + 3) & ~3;
  const out = new Uint8Array(start + at * 2);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  const data = new Int16Array(out.buffer, start, at);
  let o = 0;
  for (const c of chunks) { data.set(c, o); o += c.length; }
  return out;
}

/** bytes -> Map ck -> entry (typed views into the one buffer). */
export function decodePack(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len)));
  const start = (4 + len + 3) & ~3;
  const copy = Uint8Array.prototype.slice.call(bytes, start); // an aligned copy (Buffer.slice would be a view)
  const data = new Int16Array(copy.buffer, 0, copy.length >> 1);
  const view = (r) => (r ? data.subarray(r[0], r[0] + r[1]) : null);
  const map = new Map();
  for (const [ck, off, min, max, rgb, glow, lit, gl] of head.models) {
    map.set(ck, { off, min, max, palette: { rgb: new Float32Array(rgb), glow: new Uint8Array(glow) }, lit: view(lit), glow: view(gl) });
  }
  return map;
}

/** Browser: fetch + (if gzipped) decompress the pack. Resolves null when it is missing or unreadable. */
export async function loadPack(url = PACK_FILE) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let buf = new Uint8Array(await res.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') return null;
      buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    }
    return decodePack(buf);
  } catch {
    return null;
  }
}
