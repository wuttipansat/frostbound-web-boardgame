## JS semantics the rules depend on, bit-exact: 32-bit integer maths, Math.round, V8's Array.prototype.sort,
## and the state fingerprint (stableJson + FNV-1a, as src/core/hash.js).
class_name JS
extends RefCounted

const M32 := 0xFFFFFFFF


## ToInt32.
static func i32(x: int) -> int:
	x = x & M32
	return x - 0x100000000 if x >= 0x80000000 else x


## ToUint32 (x >>> 0).
static func u32(x: int) -> int:
	return x & M32


## x >>> n
static func ushr(x: int, n: int) -> int:
	return (x & M32) >> n


## x << n (int32 result)
static func shl(x: int, n: int) -> int:
	return i32((x & M32) << n)


## Math.imul (via 16-bit halves: no reliance on 64-bit overflow).
static func imul(a: int, b: int) -> int:
	a = a & M32
	b = b & M32
	var lo := (a & 0xFFFF) * b
	var hi := ((a >> 16) * (b & 0xFFFF)) & 0xFFFF
	return i32(lo + (hi << 16))


## A number in JS can be an int or a float; doubles with no fraction become ints so ids and counts compare.
static func num(x) -> Variant:
	if x is float and is_finite(x) and x == floorf(x) and absf(x) < 9007199254740992.0:
		return int(x)
	return x


## Deep copy of parsed JSON with integral floats turned into ints.
static func norm(v) -> Variant:
	if v is Dictionary:
		var d := {}
		for k in v:
			d[k] = norm(v[k])
		return d
	if v is Array:
		var a := []
		for x in v:
			a.append(norm(x))
		return a
	return num(v)


static func floor_(x) -> int:
	return floori(x)


static func ceil_(x) -> int:
	return ceili(x)


## Math.round: halves go up (Math.round(-0.5) is -0).
static func round_(x) -> int:
	return floori(float(x) + 0.5)


static func load_json(path: String) -> Variant:
	var text := FileAccess.get_file_as_string(path)
	var v = JSON.parse_string(text)
	if v == null:
		push_error("bad JSON " + path)
	return norm(v)


# ---------------------------------------------------------------- sort (V8 TimSort)

## Array.prototype.sort(cmp) in place, as V8 does it: for fewer than 64 elements one run made by countAndMakeRun,
## then binary insertion. (Larger arrays: a stable merge sort — identical for consistent comparators.)
## cmp(a, b) -> number; NaN counts as 0.
static func sort(arr: Array, cmp: Callable) -> Array:
	var n := arr.size()
	if n < 2:
		return arr
	if n >= 64:
		_merge_sort(arr, cmp)
		return arr
	var run := _count_and_make_run(arr, 0, n, cmp)
	if run < n:
		_binary_insertion(arr, 0, run, n, cmp)
	return arr


static func _c(cmp: Callable, a, b) -> float:
	var r = cmp.call(a, b)
	if r is bool:
		return 1.0 if r else 0.0
	var f := float(r)
	return 0.0 if is_nan(f) else f


static func _count_and_make_run(a: Array, low_arg: int, high: int, cmp: Callable) -> int:
	var low := low_arg + 1
	if low == high:
		return 1
	var run := 2
	var el_low = a[low]
	var el_pre = a[low - 1]
	var order := _c(cmp, el_low, el_pre)
	var desc := order < 0
	var prev = el_low
	for idx in range(low + 1, high):
		var cur = a[idx]
		order = _c(cmp, cur, prev)
		if desc:
			if order >= 0:
				break
		elif order < 0:
			break
		prev = cur
		run += 1
	if desc:
		var i := low_arg
		var j := low_arg + run - 1
		while i < j:
			var t = a[i]
			a[i] = a[j]
			a[j] = t
			i += 1
			j -= 1
	return run


static func _binary_insertion(a: Array, low: int, start_arg: int, high: int, cmp: Callable) -> void:
	var start := start_arg + 1 if low == start_arg else start_arg
	while start < high:
		var left := low
		var right := start
		var pivot = a[start]
		while left < right:
			var mid := left + ((right - left) >> 1)
			if _c(cmp, pivot, a[mid]) < 0:
				right = mid
			else:
				left = mid + 1
		var p := start
		while p > left:
			a[p] = a[p - 1]
			p -= 1
		a[left] = pivot
		start += 1


static func _merge_sort(a: Array, cmp: Callable) -> void:
	if a.size() < 2:
		return
	var mid := a.size() >> 1
	var l := a.slice(0, mid)
	var r := a.slice(mid)
	_merge_sort(l, cmp)
	_merge_sort(r, cmp)
	var i := 0
	var j := 0
	var k := 0
	while i < l.size() and j < r.size():
		if _c(cmp, r[j], l[i]) < 0:
			a[k] = r[j]
			j += 1
		else:
			a[k] = l[i]
			i += 1
		k += 1
	while i < l.size():
		a[k] = l[i]
		i += 1
		k += 1
	while j < r.size():
		a[k] = r[j]
		j += 1
		k += 1


## Default sort() (no comparator): by string value, UTF-16 order.
static func sort_strings(arr: Array) -> Array:
	arr.sort()
	return arr


# ---------------------------------------------------------------- the state fingerprint

static func stable_json(v) -> String:
	if v == null:
		return "null"
	if v is bool:
		return "true" if v else "false"
	if v is int:
		return str(v)
	if v is float:
		return js_number(v)
	if v is String or v is StringName:
		return js_string(String(v))
	if v is Array:
		var parts := PackedStringArray()
		for x in v:
			parts.append(stable_json(x))
		return "[" + ",".join(parts) + "]"
	if v is Dictionary:
		var keys := []
		for k in v:
			if v[k] is Callable:
				continue
			keys.append(str(k))
		keys.sort()
		var parts := PackedStringArray()
		for k in keys:
			var val = v[k] if v.has(k) else v[_key_back(v, k)]
			parts.append(js_string(k) + ":" + stable_json(val))
		return "{" + ",".join(parts) + "}"
	return js_string(str(v))


static func _key_back(d: Dictionary, k: String):
	for kk in d:
		if str(kk) == k:
			return kk
	return k


## JSON.stringify of a string: escapes quote, backslash and control characters; other text as is.
static func js_string(s: String) -> String:
	var out := "\""
	for i in s.length():
		var c := s.unicode_at(i)
		match c:
			0x22: out += "\\\""
			0x5C: out += "\\\\"
			0x08: out += "\\b"
			0x0C: out += "\\f"
			0x0A: out += "\\n"
			0x0D: out += "\\r"
			0x09: out += "\\t"
			_:
				if c < 0x20:
					out += "\\u%04x" % c
				else:
					out += char(c)
	return out + "\""


## Number#toString for a double: integers plain, else the shortest digits that read back the same.
static func js_number(x: float) -> String:
	if is_nan(x) or is_inf(x):
		return "null"
	if x == 0.0:
		return "0"
	var ax := absf(x)
	if x == floorf(x) and ax < 1e21:
		return str(int(x))
	if ax >= 1e21 or ax < 1e-6:
		var e := floori(log(ax) / log(10.0))
		for _t in 3:
			if ax / pow(10.0, e) >= 10.0:
				e += 1
			elif ax / pow(10.0, e) < 1.0:
				e -= 1
		for p in range(1, 18):
			var m := String.num(x / pow(10.0, e), p - 1)
			if m.find(".") != -1:
				m = m.rstrip("0").rstrip(".")
			var cand := m + "e" + ("+" if e >= 0 else "-") + str(absi(e))
			if cand.to_float() == x:
				return cand
		return str(x)
	for d in range(0, 21):
		var cand := String.num(x, d)
		if cand.to_float() == x:
			if cand.find(".") != -1:
				cand = cand.rstrip("0").rstrip(".")
			return cand
	return str(x)


## 32-bit FNV-1a over UTF-16 code units, 8 hex digits.
static func fnv1a(s: String) -> String:
	var h := 2166136261
	for i in s.length():
		var c := s.unicode_at(i)
		if c > 0xFFFF:
			c -= 0x10000
			h = u32(imul(h ^ (0xD800 + (c >> 10)), 16777619))
			h = u32(imul(h ^ (0xDC00 + (c & 0x3FF)), 16777619))
		else:
			h = u32(imul(h ^ c, 16777619))
	return "%08x" % h


static func state_hash(s) -> String:
	return fnv1a(stable_json(s))
