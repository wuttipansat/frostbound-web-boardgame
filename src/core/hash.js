// GODOT-0: a stable fingerprint of a game state (sorted-key JSON -> 32-bit FNV-1a, hex), so a port of the
// rules can be checked against this engine action by action (godot/data/golden).

/** JSON with object keys sorted (arrays keep their order; undefined fields are dropped, like JSON.stringify). */
export function stableJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : stableJson(x))).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined && typeof v[k] !== 'function').sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
}

/** 32-bit FNV-1a over the UTF-16 code units of a string, as 8 hex digits. */
export function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const stateHash = (s) => fnv1a(stableJson(s));
