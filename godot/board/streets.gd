## src/render/streets.js: the street graph, markings, lamp spots, the railway and kerb ramps (pure geometry).
## Meshes come back as {pos: Array of [x,y,z], nrm, col (linear [r,g,b]), idx} in three.js winding.
class_name Streets
extends RefCounted

const LAMP_STEP := 9.0
const LAMP_IN := BL.ROAD_KERB + 0.5
const DASH := 1.5
const LINE_W := 0.16
const WHITE := [0.86, 0.88, 0.9]
const WORN := [0.62, 0.64, 0.66]
const GAUGE := 0.72
const STEEL := [0.55, 0.57, 0.6]
const GROOVE := [0.09, 0.1, 0.11]
const BALLAST := [0.32, 0.3, 0.28]
const SLEEPER := [0.26, 0.2, 0.15]
const SNOWC := [0.9, 0.93, 0.96]
const PLANK := [0.36, 0.28, 0.2]
const PLANK_DARK := [0.16, 0.13, 0.1]
const RAIL_TOP := [0.82, 0.84, 0.87]


static func nk(x: float, z: float) -> String:
	return "%d,%d" % [JS.round_(x * 100), JS.round_(z * 100)]


## segments: [[a, b, seg]] with a, b = [x, y, z]. -> {nodes: [{x, z, dirs, kind}], runs: [{axis, c, t0, t1, a, b}]}
static func street_runs(segments: Array) -> Dictionary:
	var nodes := {}
	var node := func(x: float, z: float) -> Dictionary:
		var k := nk(x, z)
		if not nodes.has(k):
			nodes[k] = {"x": x, "z": z, "dirs": {}}
		return nodes[k]
	var segs := []
	for s in segments:
		var a: Array = s[0]
		var b: Array = s[1]
		var axis := "x" if absf(a[0] - b[0]) > absf(a[2] - b[2]) else "z"
		var lo: bool = a[0] < b[0] if axis == "x" else a[2] < b[2]
		var p: Array = a if lo else b
		var q: Array = b if lo else a
		node.call(p[0], p[2]).dirs["+" + axis] = true
		node.call(q[0], q[2]).dirs["-" + axis] = true
		segs.append({"axis": axis, "c": p[2] if axis == "x" else p[0], "t0": p[0] if axis == "x" else p[2], "t1": q[0] if axis == "x" else q[2]})
	for k in nodes:
		var d: Dictionary = nodes[k].dirs
		nodes[k].kind = "junction" if d.size() >= 3 else ("end" if d.size() == 1 else ("through" if (d.has("+x") and d.has("-x")) or (d.has("+z") and d.has("-z")) else "corner"))
	var runs := []
	var by_line := {}
	for s in segs:
		var k := "%s|%d" % [s.axis, JS.round_(s.c * 100)]
		if not by_line.has(k):
			by_line[k] = []
		by_line[k].append(s)
	for k in by_line:
		var list: Array = by_line[k]
		JS.sort(list, func(a, b): return a.t0 - b.t0)
		var cur = null
		for s in list:
			var at_node: Dictionary = nodes[nk(s.t0, s.c) if s.axis == "x" else nk(s.c, s.t0)]
			if cur != null and absf(cur.t1 - s.t0) < 1e-6 and at_node.kind == "through":
				cur.t1 = s.t1
			else:
				cur = s.duplicate()
				runs.append(cur)
	for r in runs:
		r.a = nodes[nk(r.t0, r.c) if r.axis == "x" else nk(r.c, r.t0)]
		r.b = nodes[nk(r.t1, r.c) if r.axis == "x" else nk(r.c, r.t1)]
	return {"nodes": nodes.values(), "runs": runs}


static func _mesh() -> Dictionary:
	return {"pos": [], "nrm": [], "col": [], "idx": []}


static func marking_quads(segments: Array, on_ground: Callable, y := 0.03, rail = null) -> Dictionary:
	var runs: Array = street_runs(segments).runs
	var pos := []
	var col := []
	var rect := func(r: Dictionary, t0: float, t1: float, l0: float, l1: float, c: Array) -> void:
		var P := func(t: float, l: float) -> Array: return [t, y, r.c + l] if r.axis == "x" else [r.c + l, y, t]
		var q := [P.call(t0, l0), P.call(t1, l0), P.call(t1, l1), P.call(t0, l1)]
		for p in q:
			if not on_ground.call(p[0], p[2]):
				return
		for p in q:
			pos.append(p)
			col.append(c)
	var shade := func(k1, k2, k3) -> Array: return WORN if BL.hash3(k1, k2, k3) < 0.12 else WHITE
	for r in runs:
		var cut_of := func(n: Dictionary) -> float: return 0.4 if n.kind == "end" else BL.ROAD_HALF
		var s0: float = r.t0 + cut_of.call(r.a)
		var s1: float = r.t1 - cut_of.call(r.b)
		if s1 <= s0:
			continue
		var stop_at := func(n: Dictionary) -> float: return BL.ROAD_WALK + 0.5 if n.kind == "junction" else 0.0
		var d0: float = r.t0 + maxf(cut_of.call(r.a), stop_at.call(r.a) + 0.3)
		var d1: float = r.t1 - maxf(cut_of.call(r.b), stop_at.call(r.b) + 0.3)
		var e := BL.ROAD_HALF - 0.35
		for side in [-1, 1]:
			var t := s0
			while t < s1:
				var k := JS.round_(t * 10)
				if BL.hash3(k, side + 5, JS.round_(r.c * 10)) >= 0.04:
					rect.call(r, t, minf(s1, t + 3), side * e - LINE_W / 2, side * e + LINE_W / 2, shade.call(k, side, 9))
				t += 3
		var rail_here: bool = rail != null and rail.axis == r.axis and absf(rail.c - r.c) < 0.01
		if not rail_here:
			var k := ceili(d0 / (2 * DASH))
			while k * 2 * DASH + DASH <= d1:
				if BL.hash3(k, 7, JS.round_(r.c * 10)) >= 0.06:
					rect.call(r, k * 2 * DASH, k * 2 * DASH + DASH, -LINE_W / 2, LINE_W / 2, shade.call(k, 3, JS.round_(r.c)))
				k += 1
		for nd in [[r.a, 1], [r.b, -1]]:
			var n: Dictionary = nd[0]
			var dir: int = nd[1]
			var t: float = r.t0 if dir > 0 else r.t1
			if n.kind == "junction":
				var z0 := t + dir * BL.ROAD_KERB
				var z1 := t + dir * BL.ROAD_WALK
				var l := -BL.ROAD_HALF + 0.45
				while l <= BL.ROAD_HALF - 0.45 + 1e-6:
					rect.call(r, minf(z0, z1), maxf(z0, z1), l - 0.22, l + 0.22, shade.call(JS.round_(l * 10), JS.round_(t), 11))
					l += 0.75
				var right: int = -dir if r.axis == "x" else dir
				var st: float = t + dir * stop_at.call(n)
				var lab: Array = [0.15, BL.ROAD_HALF - 0.3] if right > 0 else [-(BL.ROAD_HALF - 0.3), -0.15]
				rect.call(r, minf(st, st + dir * 0.35), maxf(st, st + dir * 0.35), lab[0], lab[1], WHITE)
			elif n.kind == "end":
				var st := t + dir * 0.4
				rect.call(r, minf(st, st + dir * 0.4), maxf(st, st + dir * 0.4), -BL.ROAD_HALF + 0.3, BL.ROAD_HALF - 0.3, WHITE)
	var nq := pos.size() / 4
	var idx := []
	for q in nq:
		var o := q * 4
		var ax: float = pos[o + 1][0] - pos[o][0]
		var az: float = pos[o + 1][2] - pos[o][2]
		var bx: float = pos[o + 2][0] - pos[o][0]
		var bz: float = pos[o + 2][2] - pos[o][2]
		if az * bx - ax * bz > 0:
			idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3])
		else:
			idx.append_array([o, o + 2, o + 1, o, o + 3, o + 2])
	var nrm := []
	for i in pos.size():
		nrm.append([0.0, 1.0, 0.0])
	return {"pos": pos, "nrm": nrm, "col": col, "idx": idx}


## [{x, z, dx, dz, dead, flicker}]
static func lamp_spots(segments: Array, on_ground: Callable) -> Array:
	var sr := street_runs(segments)
	var out := []
	var keep := func(x: float, z: float, dx: float, dz: float) -> void:
		if not on_ground.call(x, z):
			return
		var h := BL.hash3(JS.round_(x * 4), 91, JS.round_(z * 4))
		out.append({"x": x, "z": z, "dx": dx, "dz": dz, "dead": h < 0.07, "flicker": h >= 0.07 and h < 0.13})
	var junctions: Array = sr.nodes.filter(func(n): return n.kind == "junction")
	var others: Array = sr.nodes.filter(func(n): return n.kind == "corner" or n.kind == "end")
	for r in sr.runs:
		for side in [1, -1]:
			var phase := 0.0 if side > 0 else LAMP_STEP / 2
			var k := ceili((r.t0 - phase) / LAMP_STEP)
			while k * LAMP_STEP + phase <= r.t1:
				var t := k * LAMP_STEP + phase
				k += 1
				var x: float = t if r.axis == "x" else r.c + side * LAMP_IN
				var z: float = r.c + side * LAMP_IN if r.axis == "x" else t
				if junctions.any(func(n): return V.hypot(n.x - x, n.z - z) < 11):
					continue
				if others.any(func(n): return V.hypot(n.x - x, n.z - z) < BL.ROAD_WALK + 1):
					continue
				keep.call(x, z, 0.0 if r.axis == "x" else float(-side), float(-side) if r.axis == "x" else 0.0)
	for n in junctions:
		for sxz in [[1, 1], [1, -1], [-1, 1], [-1, -1]]:
			keep.call(n.x + sxz[0] * LAMP_IN, n.z + sxz[1] * LAMP_IN, -sxz[0] * sqrt(0.5), -sxz[1] * sqrt(0.5))
	return out


static func rail_quads(rail: Dictionary, pieces: Array) -> Dictionary:
	var pos := []
	var col := []
	var nrm := []
	var P := func(t: float, l: float, y: float) -> Array: return [t, y, rail.c + l] if rail.axis == "x" else [rail.c + l, y, t]
	var quad := func(pts: Array, n: Array, c: Array) -> void:
		for p in pts:
			pos.append(p)
			nrm.append(n)
			col.append(c)
	var flat := func(t0: float, t1: float, l0: float, l1: float, y: float, c: Array) -> void:
		quad.call([P.call(t0, l0, y), P.call(t1, l0, y), P.call(t1, l1, y), P.call(t0, l1, y)], [0.0, 1.0, 0.0], c)
	var side := func(t0: float, t1: float, l: float, y0: float, y1: float, out: float, c: Array) -> void:
		quad.call([P.call(t0, l, y0), P.call(t1, l, y0), P.call(t1, l, y1), P.call(t0, l, y1)], [0.0, 0.0, out] if rail.axis == "x" else [out, 0.0, 0.0], c)
	for pc in pieces:
		var t0: float = pc[0]
		var t1: float = pc[1]
		var kind: String = pc[2]
		var y0: float = pc[3] if pc.size() > 3 else 0.0
		var F := func(a: float, b: float, l0: float, l1: float, y: float, c: Array) -> void: flat.call(a, b, l0, l1, y0 + y, c)
		if kind == "road":
			F.call(t0, t1, -1.5, 1.5, 0.03, PLANK_DARK)
			var t := ceilf(t0 / 0.5) * 0.5
			while t + 0.42 <= t1:
				F.call(t, t + 0.42, -1.45, 1.45, 0.034, PLANK)
				t += 0.5
			for g in [-GAUGE, GAUGE]:
				F.call(t0, t1, g - 0.12, g - 0.05, 0.037, GROOVE)
				F.call(t0, t1, g - 0.05, g + 0.07, 0.039, RAIL_TOP)
			continue
		F.call(t0, t1, -1.6, 1.6, 0.03, BALLAST)
		var t := ceilf(t0 / 0.65) * 0.65
		while t + 0.3 <= t1:
			var k := JS.round_(t * 10)
			F.call(t, t + 0.3, -1.3, 1.3, 0.07, SNOWC if BL.hash3(k, 3, JS.round_(rail.c)) < 0.3 else SLEEPER)
			t += 0.65
		for g in [-GAUGE, GAUGE]:
			F.call(t0, t1, g - 0.05, g + 0.05, 0.16, RAIL_TOP)
			side.call(t0, t1, g - 0.05, y0 + 0.07, y0 + 0.16, -1.0, GROOVE)
			side.call(t0, t1, g + 0.05, y0 + 0.07, y0 + 0.16, 1.0, GROOVE)
	var nq := pos.size() / 4
	var idx := []
	for q in nq:
		var o := q * 4
		var a: Array = V.sub(pos[o + 1], pos[o])
		var b: Array = V.sub(pos[o + 2], pos[o])
		var cr := [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
		var n: Array = nrm[o]
		var up: bool = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0
		idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3] if up else [o, o + 2, o + 1, o, o + 3, o + 2])
	return {"pos": pos, "nrm": nrm, "col": col, "idx": idx}


static func ramp_quads(segments: Array, on_slab: Callable, top: float) -> Dictionary:
	var sr := street_runs(segments)
	var pos := []
	var nrm := []
	var col := []
	var C1 := [0.72, 0.73, 0.75]
	var C2 := [0.6, 0.61, 0.63]
	for n in sr.nodes:
		if n.kind != "junction":
			continue
		for d in n.dirs:
			var axis: String = d[1]
			var s := 1 if d[0] == "+" else -1
			for side in [-1, 1]:
				var P := func(along: float, lat: float, y: float) -> Array:
					return [n.x + s * along, y, n.z + side * lat] if axis == "x" else [n.x + side * lat, y, n.z + s * along]
				var mid: Array = P.call((BL.ROAD_KERB + BL.ROAD_WALK) / 2, BL.ROAD_HALF + 0.6, 0.0)
				if not on_slab.call(mid[0], mid[2]):
					continue
				var a0 := BL.ROAD_KERB + 0.15
				var a1 := BL.ROAD_WALK - 0.15
				var q := [P.call(a0, BL.ROAD_HALF - 0.5, 0.025), P.call(a1, BL.ROAD_HALF - 0.5, 0.025), P.call(a1, BL.ROAD_HALF + 0.2, top + 0.012), P.call(a0, BL.ROAD_HALF + 0.2, top + 0.012)]
				var out: Array = [0.0, 0.0, float(-side)] if axis == "x" else [float(-side), 0.0, 0.0]
				var len := V.hypot(top, 0.7)
				var nm := [out[0] * top / len, 0.7 / len, out[2] * top / len]
				var e1: Array = V.sub(q[1], q[0])
				var e2: Array = V.sub(q[2], q[0])
				var cry: float = e1[2] * e2[0] - e1[0] * e2[2]
				var pts: Array = q if cry > 0 else [q[0], q[3], q[2], q[1]]
				for p in pts:
					pos.append(p)
					nrm.append(nm)
					col.append(C1 if (JS.round_(p[0] + p[2]) & 1) else C2)
	var idx := []
	for q in pos.size() / 4:
		var o: int = q * 4
		idx.append_array([o, o + 1, o + 2, o, o + 2, o + 3])
	return {"pos": pos, "nrm": nrm, "col": col, "idx": idx}
