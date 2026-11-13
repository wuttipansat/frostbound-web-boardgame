# GODOT-2: the ported board composition builds the same scene as the web board (scripts/godot/scene-dump.mjs):
# instanced models and their matrices, single models, merged-mesh fingerprints, furniture, layout anchors.
#   godot --headless --path godot --script res://tests/scene.gd [-- --only seed1-stage1]
extends SceneTree

const SKIP_MESHES := ["furniture@all", "furniture-glow@all", "furniture-detail@all", "amber-lights@all"]
var fails := 0
var notes := 0


func _init() -> void:
	var only := ""
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--only":
			only = args[i + 1]
	var t0 := Time.get_ticks_msec()
	for f in DirAccess.get_files_at("res://data/scenes"):
		if only != "" and not f.begins_with(only):
			continue
		check_scene("res://data/scenes/" + f)
	print("scenes: %d differences, %d ms" % [fails, Time.get_ticks_msec() - t0])
	quit(1 if fails else 0)


func bad(what: String) -> void:
	fails += 1
	if fails < 60:
		printerr("  ", what)


static func nums(s: String) -> Array:
	return Array(s.split(",")).map(func(x): return float(x))


static func close(a: Array, b: Array, tol := 0.0025) -> bool:
	if a.size() != b.size():
		return false
	for i in a.size():
		if absf(float(a[i]) - float(b[i])) > tol * maxf(1.0, absf(float(b[i])) * 0.01):
			return false
	return true


## Pair two lists of matrices (sorted by translation) within tolerance; returns how many have no partner.
static func unmatched(js: Array, gd: Array) -> int:
	var key := func(m: Array) -> float: return m[12] * 1000.0 + m[14] + m[13] * 0.001
	var a := js.duplicate()
	var b := gd.duplicate()
	a.sort_custom(func(x, y): return key.call(x) < key.call(y))
	b.sort_custom(func(x, y): return key.call(x) < key.call(y))
	var used := {}
	var miss := 0
	for m in a:
		var found := false
		for j in b.size():
			if used.has(j):
				continue
			if absf(b[j][12] - m[12]) > 0.05:
				if b[j][12] > m[12] + 0.05:
					break
				continue
			if close(m, b[j]):
				used[j] = true
				found = true
				break
		if not found:
			miss += 1
	return miss + (b.size() - used.size())


static func fingerprint(m: Dictionary) -> Array:
	var out := [0, 0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
	if m.has("lines"):
		out[0] = m.lines.size() * 2
		for l in m.lines:
			for p in l:
				out[2] += p[0]; out[3] += p[1]; out[4] += p[2]; out[8] += p[0] * p[2] * 0.01
		return out
	out[0] = m.pos.size()
	out[1] = m.idx.size()
	for i in m.pos.size():
		var p: Array = m.pos[i]
		out[2] += p[0]; out[3] += p[1]; out[4] += p[2]; out[8] += p[0] * p[2] * 0.01
		var c: Array = m.col[i]
		out[5] += c[0]; out[6] += c[1]; out[7] += c[2]
	return out


func check_scene(path: String) -> void:
	var d: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
	var map: Dictionary = JS.norm(d.map)
	var t0 := Time.get_ticks_msec()
	var c := Compose.new()
	var desc := c.build(map)
	var before := fails
	print("%s: built in %d ms" % [path.get_file(), Time.get_ticks_msec() - t0])
	# instances
	for k in d.instances:
		var js: Array = d.instances[k].map(func(s): return nums(s))
		if js.is_empty() or k.begins_with("crow|"):
			continue
		var gd: Array = desc.instances[k].mats.map(func(m): return m.map(func(v): return V.r3(v))) if desc.instances.has(k) else []
		if gd.is_empty():
			bad("instances %s: %d in the web build, none here" % [k, js.size()])
			continue
		var miss := unmatched(js, gd)
		if miss:
			bad("instances %s: %d web / %d here, %d unmatched" % [k, js.size(), gd.size(), miss])
	for k in desc.instances:
		if not d.instances.has(k) and desc.instances[k].mats.size():
			bad("instances %s: %d here, none in the web build" % [k, desc.instances[k].mats.size()])
	# single models
	var jm := {}
	for e in d.models:
		var k: String = e[0] + "@" + e[1]
		if not jm.has(k):
			jm[k] = []
		jm[k].append(nums(e[2]))
	var gm := {}
	for e in desc.models:
		var k: String = e[0] + "@" + e[1]
		if not gm.has(k):
			gm[k] = []
		gm[k].append(e[2].map(func(v): return V.r3(v)))
	for k in jm:
		if not gm.has(k):
			bad("model %s missing here" % k)
		elif unmatched(jm[k], gm[k]):
			bad("model %s placed differently" % k)
	for k in gm:
		if not jm.has(k):
			bad("model %s here, not in the web build" % k)
	# merged meshes
	for k in d.meshes:
		if SKIP_MESHES.has(k):
			continue
		var js: Array = d.meshes[k]
		var gd: Array = desc.meshes.get(k, []).map(func(m): return fingerprint(m))
		if gd.size() != js.size():
			bad("meshes %s: %d web / %d here" % [k, js.size(), gd.size()])
			continue
		var left := gd.duplicate()
		for f in js:
			var hit := -1
			for j in left.size():
				var g: Array = left[j]
				if g[0] == f[0] and g[1] == f[1] and close(f.slice(2), g.slice(2), 0.05):
					hit = j
					break
			if hit < 0:
				bad("meshes %s: no match for %s (closest here %s)" % [k, str(f), str(_closest(left, f))])
			else:
				left.remove_at(hit)
	# furniture
	var jf: Array = d.furniture.map(func(e): return [e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]])
	var gf: Array = desc.furniture.map(func(e): return [e[0], V.r3(e[1]), V.r3(e[2]), V.r3(e[3]), V.r3(e[4]), V.r3(e[5]), e[6], e[7]])
	var used := {}
	var fmiss := 0
	for e in jf:
		var ok := false
		for j in gf.size():
			if used.has(j):
				continue
			var g: Array = gf[j]
			if g[0] == e[0] and g[6] == e[6] and bool(g[7]) == bool(e[7]) and close([e[1], e[2], e[3], fposmod(e[4], TAU), e[5]], [g[1], g[2], g[3], fposmod(g[4], TAU), g[5]]):
				used[j] = true
				ok = true
				break
		if not ok:
			fmiss += 1
			if fmiss <= 8:
				bad("furniture %s missing here" % str(e))
	for j in gf.size():
		if not used.has(j):
			fmiss += 1
			if fmiss <= 16:
				bad("furniture %s extra here" % str(gf[j]))
	if fmiss:
		bad("furniture: %d web / %d here, %d unmatched" % [jf.size(), gf.size(), fmiss])
	# layout
	for id in d.layout:
		var L = desc.layout.get(id)
		var J: Dictionary = d.layout[id]
		if L == null:
			bad("layout %s missing" % id)
			continue
		if not close(J.center, L.center.map(func(v): return V.r3(v))) or absf(J.facing - V.r3(L.facing)) > 0.002 or absf(J.hit - V.r3(L.hitRadius)) > 0.002:
			bad("layout %s differs" % id)
	print("  %s" % ("same" if fails == before else "%d differences" % (fails - before)))


static func _closest(left: Array, f: Array):
	var best = null
	var bd := INF
	for g in left:
		var dd := absf(g[0] - f[0]) + absf(g[2] - f[2])
		if dd < bd:
			bd = dd
			best = g
	return best
