## src/core/rng.js: the game's RNG (mulberry32); its whole state is s.rng (a uint32).
class_name Rng
extends RefCounted


static func normalize_seed(seed) -> int:
	if (seed is int) or (seed is float and is_finite(seed)):
		return JS.u32(int(seed))
	var text := str(seed)
	var h := 2166136261
	for i in text.length():
		var c := text.unicode_at(i)
		if c > 0xFFFF:
			c -= 0x10000
			h = JS.u32(JS.imul(h ^ (0xD800 + (c >> 10)), 16777619))
			h = JS.u32(JS.imul(h ^ (0xDC00 + (c & 0x3FF)), 16777619))
		else:
			h = JS.u32(JS.imul(h ^ c, 16777619))
	return h


static func random(s: Dictionary) -> float:
	s.rng = JS.u32(s.rng + 0x6d2b79f5)
	var t: int = s.rng
	t = JS.imul(t ^ JS.ushr(t, 15), t | 1)
	t = JS.i32(t ^ JS.i32(t + JS.imul(t ^ JS.ushr(t, 7), t | 61)))
	return float(JS.u32(t ^ JS.ushr(t, 14))) / 4294967296.0


static func rand_int(s: Dictionary, lo: int, hi: int) -> int:
	return lo + floori(random(s) * (hi - lo + 1))


static func pick(s: Dictionary, arr: Array):
	return arr[floori(random(s) * arr.size())]


static func shuffle(s: Dictionary, arr: Array) -> Array:
	var out := arr.duplicate()
	var i := out.size() - 1
	while i > 0:
		var j := floori(random(s) * (i + 1))
		var t = out[i]
		out[i] = out[j]
		out[j] = t
		i -= 1
	return out
