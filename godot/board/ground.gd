## src/render/ground.js blockSlab + terrain.js (heightmap streets) + palette helpers. Meshes as in Streets.
class_name Ground
extends RefCounted

const KERB := 0.3
const GROUT := 0.06
const CUT := 0.8
const TILE := 2.0
const SLABS := [0xcfccbf, 0xcac7b9, 0xd4d1c5]
const SNOWY := [0xeef3f8, 0xe6edf4, 0xf4f7fa]
const BASE := 0x8e8b80
const SNOW_BASE := 0xdde5ee
const KERBS := [0xdcd9ce, 0xd2cfc3]
const SIDE := 0xa8a598
const CRACK := 0x7a776c
const SNOW := 0xf3f6f9
const DIRT := [0x6b5a48, 0x7a6650]
# palette.js
const P_SNOW := 0xf2f6fc
const P_SNOW_SHADE := 0xd5e1f0
const P_SNOW_BLUE := 0xd5e1f0
const P_DIRT := 0x4a3a33
const P_ROCK := 0x3a4250
const P_ROCK_LIGHT := 0x707a88
const P_ASPHALT := 0x23272e
const P_SLUSH := 0x9aa6b6
const BAYER4 := [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

static var _lin_cache := {}


## THREE.Color.setHex: sRGB hex -> linear [r, g, b].
static func lin(hex: int) -> Array:
	var c = _lin_cache.get(hex)
	if c == null:
		var cc := Color(((hex >> 16) & 255) / 255.0, ((hex >> 8) & 255) / 255.0, (hex & 255) / 255.0).srgb_to_linear()
		c = [cc.r, cc.g, cc.b]
		_lin_cache[hex] = c
	return c


static func shade_hex(hex: int, k: float) -> int:
	var r := clampi(JS.round_(((hex >> 16) & 255) * k), 0, 255)
	var g := clampi(JS.round_(((hex >> 8) & 255) * k), 0, 255)
	var b := clampi(JS.round_((hex & 255) * k), 0, 255)
	return (r << 16) | (g << 8) | b


static func mix_hex(a: int, b: int, t: float) -> int:
	var ch := func(s: int) -> int: return JS.round_(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
	return (ch.call(16) << 16) | (ch.call(8) << 8) | ch.call(0)


static func bayer(x: int, y: int, z: int) -> float:
	return (BAYER4[((y & 3) << 2) | ((x + z) & 3)] + 0.5) / 16.0


## o: {x0, x1, z0, z1, walk, surface, detail, seed: [a, b], open: {x0, x1, z0, z1}}
static func block_slab(o: Dictionary) -> Dictionary:
	var x0: float = o.x0
	var x1: float = o.x1
	var z0: float = o.z0
	var z1: float = o.z1
	var walk: float = o.get("walk", 2.2)
	var surface: String = o.get("surface", "paved")
	var detail: bool = o.get("detail", true)
	var sa: int = o.seed[0]
	var sb: int = o.seed[1]
	var op: Dictionary = o.get("open", {})
	var closed := {"x0": not op.get("x0", false), "x1": not op.get("x1", false), "z0": not op.get("z0", false), "z1": not op.get("z1", false)}
	var cut := {"00": CUT if closed.x0 and closed.z0 else 0.0, "10": CUT if closed.x1 and closed.z0 else 0.0, "01": CUT if closed.x0 and closed.z1 else 0.0, "11": CUT if closed.x1 and closed.z1 else 0.0}
	var m := {"pos": [], "nrm": [], "col": [], "idx": []}
	var quad := func(pts: Array, n: Array, hex: int) -> void:
		var b: int = m.pos.size()
		var c := lin(hex)
		for p in pts:
			m.pos.append(p)
			m.nrm.append(n)
			m.col.append(c)
		m.idx.append_array([b, b + 1, b + 2, b, b + 2, b + 3])
	var top := func(ax: float, az: float, bx: float, bz: float, y: float, hex: int) -> void:
		if bx - ax > 1e-4 and bz - az > 1e-4:
			quad.call([[ax, y, az], [ax, y, bz], [bx, y, bz], [bx, y, az]], [0.0, 1.0, 0.0], hex)
	var corners := [[x0, z0, cut["00"]], [x1, z0, cut["10"]], [x0, z1, cut["01"]], [x1, z1, cut["11"]]]
	var cut_at := func(x: float, z: float) -> bool:
		for e in corners:
			if e[2] and absf(x - e[0]) + absf(z - e[1]) < e[2] + 0.05:
				return true
		return false
	var ring := [[x0 + cut["00"], z0], [x1 - cut["10"], z0], [x1, z0 + cut["10"]], [x1, z1 - cut["11"]], [x1 - cut["11"], z1], [x0 + cut["01"], z1], [x0, z1 - cut["01"]], [x0, z0 + cut["00"]]]
	var side_of := ["z0", null, "x1", null, "z1", null, "x0", null]
	for i in 8:
		var a: Array = ring[i]
		var b: Array = ring[(i + 1) % 8]
		var ex: float = b[0] - a[0]
		var ez: float = b[1] - a[1]
		var l := V.hypot(ex, ez)
		if l < 1e-6 or (side_of[i] != null and not closed[side_of[i]]):
			continue
		var n := [ez / l, 0.0, -ex / l]
		var steps: int = maxi(1, JS.round_(l)) if detail and i % 2 == 0 else 1
		for k in steps:
			var t0 := float(k) / steps
			var t1 := float(k + 1) / steps
			var p0 := [a[0] + ex * t0, a[1] + ez * t0]
			var p1 := [a[0] + ex * t1, a[1] + ez * t1]
			quad.call([[p1[0], 0.0, p1[1]], [p0[0], 0.0, p0[1]], [p0[0], BL.GROUND, p0[1]], [p1[0], BL.GROUND, p1[1]]], n, SIDE if detail and k % 2 else 0xb3b0a4)
	var base := SNOW_BASE if surface == "snow" else BASE
	var yb := BL.GROUND - 0.005
	var cxm := (x0 + x1) / 2
	var czm := (z0 + z1) / 2
	var bc := lin(base if detail else SLABS[0])
	for i in 8:
		var a: Array = ring[i]
		var b: Array = ring[(i + 1) % 8]
		if V.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6:
			continue
		var b0: int = m.pos.size()
		for p in [[cxm, yb, czm], [b[0], yb, b[1]], [a[0], yb, a[1]]]:
			m.pos.append(p)
			m.nrm.append([0.0, 1.0, 0.0])
			m.col.append(bc)
		m.idx.append_array([b0, b0 + 1, b0 + 2])
	if not detail:
		return m
	var tile := func(ax: float, az: float, bx: float, bz: float, zone: Array, hex: int):
		var cx0 := maxf(ax, zone[0]) + GROUT / 2
		var cz0 := maxf(az, zone[1]) + GROUT / 2
		var cx1 := minf(bx, zone[2]) - GROUT / 2
		var cz1 := minf(bz, zone[3]) - GROUT / 2
		if cx1 - cx0 < 0.12 or cz1 - cz0 < 0.12 or cut_at.call((cx0 + cx1) / 2, (cz0 + cz1) / 2):
			return null
		top.call(cx0, cz0, cx1, cz1, BL.GROUND, hex)
		return [cx0, cz0, cx1, cz1]
	var tone := func(list: Array, i, j, k) -> int: return list[floori(BL.hash3(int(i) * 3 + sa, k, int(j) * 3 + sb) * list.size())]
	var K := [[x0, z0, x1, z0 + KERB], [x0, z1 - KERB, x1, z1], [x0, z0 + KERB, x0 + KERB, z1 - KERB], [x1 - KERB, z0 + KERB, x1, z1 - KERB]]
	var k_side := ["z0", "z1", "x0", "x1"]
	for s in 4:
		var zone: Array = K[s]
		if not closed[k_side[s]]:
			continue
		var along_x := s < 2
		var t := floorf((zone[0] if along_x else zone[1]) / 2) * 2
		while t < (zone[2] if along_x else zone[3]):
			var hex: int = KERBS[(int(t / 2) + s) & 1]
			if along_x:
				tile.call(t, zone[1], t + 2, zone[3], zone, hex)
			else:
				tile.call(zone[0], t, zone[2], t + 2, zone, hex)
			t += 2
	var i0 := [x0 + (KERB if closed.x0 else 0.0), z0 + (KERB if closed.z0 else 0.0), x1 - (KERB if closed.x1 else 0.0), z1 - (KERB if closed.z1 else 0.0)]
	var inner := [i0[0] + (walk if closed.x0 else 0.0), i0[1] + (walk if closed.z0 else 0.0), i0[2] - (walk if closed.x1 else 0.0), i0[3] - (walk if closed.z1 else 0.0)]
	var inside := func(x: float, z: float) -> bool: return x > inner[0] and x < inner[2] and z > inner[1] and z < inner[3]
	var edge_d := func(x: float, z: float) -> float:
		return minf(minf(x - i0[0] if closed.x0 else 99.0, i0[2] - x if closed.x1 else 99.0), minf(z - i0[1] if closed.z0 else 99.0, i0[3] - z if closed.z1 else 99.0))
	var bit := func(cx: float, cz: float, w: float, d: float, hex: int, y := 0.004) -> void:
		top.call(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, BL.GROUND + y, hex)
	var x := floorf(i0[0] / TILE) * TILE
	while x < i0[2]:
		var z := floorf(i0[1] / TILE) * TILE
		while z < i0[3]:
			var mx := x + TILE / 2
			var mz := z + TILE / 2
			var cx0 := maxf(x, i0[0])
			var cz0 := maxf(z, i0[1])
			var cx1 := minf(x + TILE, i0[2])
			var cz1 := minf(z + TILE, i0[3])
			if cx1 - cx0 < 0.05 or cz1 - cz0 < 0.05 or cut_at.call((cx0 + cx1) / 2, (cz0 + cz1) / 2):
				z += TILE
				continue
			var soft: int = SNOWY[floori(BL.hash3(floori(mx / 6) + sa, 47, floori(mz / 6) + sb) * SNOWY.size())]
			var xi := int(x)
			var zi := int(z)
			var h := func(k: int) -> float: return BL.hash3(xi * 5 + sa, k, zi * 5 + sb)
			var snow_inside: bool = surface == "snow" and inside.call(mx, mz)
			var partial: bool = not snow_inside and cx1 - cx0 > 1.5 and cz1 - cz0 > 1.5 and h.call(49) < (0.16 if edge_d.call(mx, mz) < 2.5 else 0.07)
			if not partial:
				top.call(cx0, cz0, cx1, cz1, BL.GROUND + 0.002, soft)
				z += TILE
				continue
			var t = tile.call(x, z, x + TILE, z + TILE, i0, tone.call(SLABS, x, z, 33))
			if t == null:
				z += TILE
				continue
			var bw: float = 0.6 + h.call(50) * 0.7
			var bd: float = 0.5 + h.call(51) * 0.6
			var right: bool = h.call(52) < 0.5
			var farr: bool = h.call(53) < 0.5
			var bx0: float = cx1 - bw if right else cx0
			var bx1: float = cx1 if right else cx0 + bw
			var bz0: float = cz1 - bd if farr else cz0
			var bz1: float = cz1 if farr else cz0 + bd
			var ys := BL.GROUND + 0.004
			top.call(cx0, cz0 if farr else bz1, cx1, bz0 if farr else cz1, ys, soft)
			top.call(cx0 if right else bx1, bz0, bx0 if right else cx1, bz1, ys, soft)
			for k in 3:
				var ex: float = bx0 + h.call(54 + k) * (bx1 - bx0)
				var ez: float = bz0 + h.call(58 + k) * (bz1 - bz0)
				bit.call(ex, ez, 0.15 + h.call(62 + k) * 0.3, 0.12 + h.call(66 + k) * 0.25, SNOW, 0.006 + k * 0.001)
			if h.call(101) < 0.25:
				bit.call((bx0 + bx1) / 2, (bz0 + bz1) / 2, 0.25, 0.18, DIRT[floori(h.call(104) * 2)], 0.005)
			z += TILE
		x += TILE
	if surface != "snow" and inner[2] - inner[0] > 3:
		var mx: float = inner[0] + 1 + BL.hash3(sa, 41, sb) * (inner[2] - inner[0] - 2.4)
		var mz: float = inner[1] + 1 + BL.hash3(sb, 43, sa) * (inner[3] - inner[1] - 2.4)
		top.call(mx, mz, mx + 1.2, mz + 1.2, BL.GROUND + 0.004, 0x5e5c55)
		top.call(mx + 0.15, mz + 0.15, mx + 1.05, mz + 1.05, BL.GROUND + 0.006, 0x77746b)
	return m


## terrain.js heightmapGeometry
static func heightmap(n: int, cell: float, column: Callable, side: Callable, bottom := -12, ao_strength := 0.4) -> Dictionary:
	var W := 2 * n + 1
	var H := PackedInt32Array()
	H.resize(W * W)
	H.fill(-32768)
	var TOP := PackedInt32Array()
	TOP.resize(W * W)
	for x in range(-n, n + 1):
		for z in range(-n, n + 1):
			var c = column.call(x, z)
			if c != null:
				H[(x + n) * W + (z + n)] = c.h
				TOP[(x + n) * W + (z + n)] = c.top
	var height := func(x: int, z: int) -> int: return -32768 if x < -n or x > n or z < -n or z > n else H[(x + n) * W + (z + n)]
	var m := {"pos": [], "nrm": [], "col": [], "idx": []}
	var AO := [1 - ao_strength, 1 - ao_strength * 0.6, 1 - ao_strength * 0.25, 1.0]
	var quad := func(pts: Array, normal: Array, rgb: Array, ao: Array) -> void:
		var base: int = m.pos.size()
		for i in 4:
			var p: Array = pts[i]
			m.pos.append([p[0] * cell, p[1] * cell, p[2] * cell])
			m.nrm.append(normal)
			m.col.append([rgb[0] * AO[ao[i]], rgb[1] * AO[ao[i]], rgb[2] * AO[ao[i]]])
		if ao[0] + ao[2] < ao[1] + ao[3]:
			m.idx.append_array([base, base + 1, base + 3, base + 1, base + 2, base + 3])
		else:
			m.idx.append_array([base, base + 1, base + 2, base, base + 2, base + 3])
	for x in range(-n, n + 1):
		for z in range(-n, n + 1):
			var h: int = height.call(x, z)
			if h == -32768:
				continue
			var occ := func(dx: int, dz: int) -> int: return 1 if height.call(x + dx, z + dz) > h else 0
			var corner_ao := func(sx: int, sz: int) -> int:
				var s1: int = occ.call(sx, 0)
				var s2: int = occ.call(0, sz)
				var cc: int = occ.call(sx, sz)
				return 0 if s1 and s2 else 3 - (s1 + s2 + cc)
			quad.call([[x, h, z], [x, h, z + 1], [x + 1, h, z + 1], [x + 1, h, z]], [0.0, 1.0, 0.0], lin(TOP[(x + n) * W + (z + n)]),
				[corner_ao.call(-1, -1), corner_ao.call(-1, 1), corner_ao.call(1, 1), corner_ao.call(1, -1)])
			for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
				var dx: int = d[0]
				var dz: int = d[1]
				var nh: int = height.call(x + dx, z + dz)
				if nh == -32768:
					nh = bottom
				if nh >= h:
					continue
				var y := nh
				while y < h:
					var c0: int = side.call(x, z, y)
					var y1 := y + 1
					while y1 < h and side.call(x, z, y1) == c0:
						y1 += 1
					var k := 0.84 if dx != 0 else 0.76
					var l := lin(c0)
					var rgb := [l[0] * k, l[1] * k, l[2] * k]
					var fx := x + 1 if dx > 0 else x
					var fz := z + 1 if dz > 0 else z
					var pts: Array
					if dx != 0:
						pts = [[fx, y, z], [fx, y1, z], [fx, y1, z + 1], [fx, y, z + 1]]
					else:
						pts = [[x, y, fz], [x + 1, y, fz], [x + 1, y1, fz], [x, y1, fz]]
					var e1: Array = V.sub(pts[1], pts[0])
					var e2: Array = V.sub(pts[2], pts[0])
					var cr := [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
					if cr[0] * dx + cr[2] * dz < 0:
						pts.reverse()
					quad.call(pts, [float(dx), 0.0, float(dz)], rgb, [3, 3, 3, 3])
					y = y1
	return m


## terrain.js buildTerrainHD (a block-sized piece): o = {center, half, edge_dist, dist_road, clip, cell}
static func terrain(o: Dictionary) -> Dictionary:
	var cell: float = o.get("cell", 0.5)
	var ox := JS.round_(o.center[0] / cell)
	var oz := JS.round_(o.center[1] / cell)
	var n := ceili(o.half / cell) + 1
	var edge_dist: Callable = o.edge_dist
	var dist_road: Callable = o.dist_road
	var clip: Callable = o.clip
	var strata := func(lx: int, lz: int, y: int) -> int:
		var x := lx + ox
		var z := lz + oz
		var w := y * cell
		if w >= -1.5:
			return P_SNOW_SHADE if bayer(x, y, z) < 0.3 else P_SNOW_BLUE
		if w >= -2.5:
			return mix_hex(P_DIRT, 0x5a4638, BL.hash3(x, y, z) * 0.6)
		if y % 5 == 0:
			return shade_hex(P_ROCK, 0.72)
		return P_ROCK if BL.hash3(floori(x / 2.0), y, floori(z / 2.0)) > 0.5 else P_ROCK_LIGHT
	var column := func(lx: int, lz: int):
		var x := lx + ox
		var z := lz + oz
		var wx := (x + 0.5) * cell
		var wz := (z + 0.5) * cell
		if edge_dist.call(wx, wz) < 3:
			return null
		if not clip.call(wx, wz):
			return null
		var road_d: float = dist_road.call(wx, wz)
		var tp := P_SNOW
		if road_d < BL.ROAD_HALF + 0.25:
			var t := BL.hash3(floori(x / 3.0), 5, floori(z / 3.0))
			tp = 0x2c3038 if t < 0.06 else P_ASPHALT
			if BL.hash3(x, 5, z) < 0.025:
				tp = 0x1c1f25
			if road_d > BL.ROAD_HALF - 0.6 and BL.hash3(x, 7, z) < 0.55:
				tp = P_SLUSH
		return {"h": 0, "top": tp}
	var m := heightmap(n, cell, column, strata, -12)
	if ox or oz:
		for i in m.pos.size():
			m.pos[i] = [m.pos[i][0] + ox * cell, m.pos[i][1], m.pos[i][2] + oz * cell]
	return m
