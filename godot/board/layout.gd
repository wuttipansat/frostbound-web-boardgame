## src/render/board.js (layout half): the grid, rail and river lines, landmarks, where places sit in their blocks,
## and which chunk of a block holds what. Pure maths, double precision (see V).
class_name BL
extends RefCounted

const BLOCK := 30.0
const COLONY_RADIUS := 15.0
const BUILDING_SCALE := 0.6
const ROAD_HALF := 3.0
const ROAD_KERB := 3.3
const ROAD_WALK := 5.5
const GROUND := 0.25
const CHUNK := (BLOCK - 2 * ROAD_WALK) / 3.0
const RAIL_CLEAR := 2.2

const RECIPES := {
	"place": [["house", 55], ["trees", 18], ["car", 10], ["yard", 10], ["clutter", 7]],
	"shops": [["shop", 80], ["trees", 10], ["clutter", 10]],
	"parking": [["car", 35], ["house", 35], ["yard", 30]],
	"containers": [["yard", 75], ["house", 15], ["clutter", 10]],
	"plaza": [["trees", 35], ["shop", 45], ["clutter", 20]],
	"park": [["trees", 80], ["clutter", 20]],
	"ruins": [["ruin", 55], ["house", 20], ["rocks", 25]],
	"rail": [["yard", 60], ["car", 15], ["clutter", 25]],
}
const PLACE_GROUNDS := {
	"grocery": ["dock", "looted", "lot"], "gas": ["tow", "lot"], "police": ["impound", "laststand", "lot"],
	"hospital": ["triage", "wing", "pharmacy", "lot"], "school": ["busloop", "schoolyard", "playground", "shelter"], "library": ["garden", "lot"],
	"mall": ["lot", "foodvan", "looted", "lot"], "military": ["convoy", "laststand"], "factory": ["siding", "truckyard"],
	"forest": ["logs", "clump"], "scrapyard": ["wrecks", "tow"], "motel": ["diner", "lot"], "church": ["graveyard", "shelter", "garden"],
	"warehouse": ["truckyard", "dock"], "apartment": ["lot", "garden"], "farmhouse": ["field", "field"], "hardware": ["lot", "truckyard"],
}
const CENTERPIECE := {"parking": ["parking", 2, 2], "plaza": ["fountain", 1, 1], "park": ["fountain", 1, 1], "ruins": ["ruinBig", 1, 1]}
const COLONY_SLOTS := {
	"dorm": [10.5, 4.5], "infirmary": [4.5, 10.5], "greenhouse": [-10.5, 4.5], "workshop": [-4.5, 10.5],
	"radio": [10.5, -4.5], "towers": [4.5, -10.5], "garage": [-10.5, -4.5], "spare": [-4.5, -10.5],
	"reserved-1": [10.2, 10.2], "reserved-2": [-10.2, -10.2],
}
const START_FRONT := {"police": "z", "grocery": "z", "school": "z", "hospital": "x", "library": "x", "gas": "x"}
const FOOT := {"church": [1, 2], "hardware": [1, 1], "military": [3, 2]}
const ZONE_DISTRICT := {"colony": "colony", "outskirts": "outskirts", "residential": "residential", "commercial": "downtown", "industrial": "industrial"}
const DISTRICT_RECIPES := {
	"downtown": [["shop", 55], ["house", 30], ["car", 8], ["clutter", 7]],
	"residential": [["house", 55], ["trees", 22], ["car", 15], ["clutter", 8]],
	"industrial": [["yard", 50], ["ruin", 15], ["car", 15], ["house", 10], ["clutter", 10]],
	"outskirts": [["house", 55], ["trees", 45]],
}
const DISTRICT_SMALL := {"downtown": [2, 4, 5, 7, 1], "residential": [0, 3, 6, 1], "industrial": [3, 6, 0]}
const DISTRICT_TINT := {"downtown": [0.94, 0.96, 1.0], "residential": [1.04, 0.99, 0.93], "industrial": [1.04, 0.94, 0.87], "outskirts": [1.02, 0.99, 0.95]}


## mesher.js hash3
static func hash3(x, y, z) -> float:
	var h := JS.imul(JS.i32(int(x)), 374761393) ^ JS.imul(JS.i32(int(y)), 668265263) ^ JS.imul(JS.i32(int(z)), 2147483647)
	h = JS.i32(h)
	h = JS.imul(h ^ JS.ushr(h, 13), 1274126177)
	return float(JS.u32(h ^ JS.ushr(h, 16))) / 4294967296.0


static func parse(k: String) -> Array:
	var p := k.split(",")
	return [int(p[0]), int(p[1])]


static func chunks_of(b: int) -> int:
	return 5 if b == 0 else 3


static func block_pos(b: int) -> float:
	return 0.0 if b == 0 else signf(b) * (absi(b) * BLOCK + CHUNK)


static func block_half(b: int) -> float:
	return chunks_of(b) * CHUNK / 2 + ROAD_WALK


static func grid_of(x: float) -> int:
	return 0 if absf(x) <= block_half(0) else int(signf(x)) * JS.round_((absf(x) - CHUNK) / BLOCK)


static func line_of(c: int) -> float:
	return block_pos(c) - block_half(c)


static func corner_pos(cx: int, cz: int) -> Array:
	return [line_of(cx), line_of(cz)]


static func edges_of(bx: int, bz: int) -> Array:
	return [chunks_of(bx) * CHUNK / 2, chunks_of(bz) * CHUNK / 2]


static func rail_line(m: Dictionary) -> Dictionary:
	var look: int = m.get("look", 0)
	var axis := "x" if hash3(look, 3, 1) < 0.5 else "z"
	var r := 1 if hash3(look, 5, 2) < 0.5 else -1
	return {"axis": axis, "r": r, "c": block_pos(r), "look": look}


static func river_line(m: Dictionary) -> Dictionary:
	var look: int = m.get("look", 0)
	var t := Zones.town_of(look)
	var axis := "z" if absf(t.dx) > absf(t.dz) else "x"
	var v: float = t.dx if axis == "z" else t.dz
	var r := 2 if v > 0 else -2
	return {"axis": axis, "r": r, "c": block_pos(r), "look": look, "river": true}


static func cut_lines(m: Dictionary) -> Array:
	return [rail_line(m), river_line(m)]


static func district_of(bx: int, bz: int, look := 0) -> String:
	return ZONE_DISTRICT[Zones.zone_of(bx, bz, look)]


static func core_of(bx: int, bz: int, look := 0) -> bool:
	return Zones.town_depth(bx, bz, look) >= 2.2


static func avenue_line(m: Dictionary) -> Dictionary:
	var rail := rail_line(m)
	var li := 0 if hash3(m.get("look", 0), 19, 4) < 0.5 else 1
	return {"axis": "z" if rail.axis == "x" else "x", "c": block_pos(li) - block_half(li)}


static func centerpiece_of(kind: String, district: String):
	var cp = CENTERPIECE.get(kind)
	if cp == null:
		return null
	if cp[0] == "fountain" and district != "downtown" and district != "residential":
		return null
	return cp


static func landmark_of(b, bx: int, bz: int, m: Dictionary):
	if b == null or b.kind == "place" or b.kind == "colony":
		return null
	var look: int = m.get("look", 0)
	for l in [rail_line(m), river_line(m)]:
		if (bz if l.axis == "x" else bx) == l.r:
			return null
	var sx := floori((bx + 1) / 3.0)
	var sz := floori((bz + 1) / 3.0)
	var at := func(h: float) -> Array:
		var p := floori(h * 9)
		return [sx * 3 - 1 + (p % 3), sz * 3 - 1 + floori(p / 3.0)]
	var a: Array = at.call(hash3(sx, 131, sz + look))
	var c: Array = at.call(hash3(sx, 135, sz + look))
	if c[0] == a[0] and c[1] == a[1]:
		c = [sx * 3 - 1 + ((a[0] - (sx * 3 - 1) + 1) % 3), a[1]]
	var zone := Zones.zone_of(bx, bz, look)
	if bx == a[0] and bz == a[1]:
		if zone == "commercial":
			return "skyscraper" if Zones.town_depth(bx, bz, look) >= 2.4 else "cityhall"
		if zone == "industrial" and hash3(sx, 139, sz + look) < 0.5:
			return "powerplant"
		if zone == "residential":
			return "stadium" if Zones.town_depth(bx, bz, look) >= 1.3 else "cathedral"
		if zone == "outskirts" and hash3(sx, 141, sz + look) < 0.7:
			return ["mast", "reservoir", "barns"][floori(hash3(sx, 143, sz + look) * 3)]
	if bx == c[0] and bz == c[1] and zone == "commercial":
		return "carpark" if hash3(sx, 133, sz + look) < 0.5 else "cityhall"
	if bx == c[0] and bz == c[1] and zone == "residential" and hash3(sx, 145, sz + look) < 0.4:
		return "cathedral"
	return null


## Where a place sits in its block: {c, fwd, side, fw, fd, lat, rows, cols, edge, center, covered, rail_cut}.
static func place_plan(id: String, type: String, bx: int, bz: int, roads: Dictionary, foot = null, front = null, rail = null) -> Dictionary:
	var c := [block_pos(bx), GROUND, block_pos(bz)]
	var fronts := {"z": "%d,%d,h" % [bx, bz + 1], "x": "%d,%d,v" % [bx + 1, bz], "-z": "%d,%d,h" % [bx, bz], "-x": "%d,%d,v" % [bx, bz]}
	var pick = front
	if pick == null:
		pick = START_FRONT.get(id)
	if pick == null:
		for f in ["z", "x", "-z", "-x"]:
			if roads.has(fronts[f]):
				pick = f
				break
	if pick == null:
		pick = "z"
	var to_front: Array = {"z": [0, 1], "x": [1, 0], "-z": [0, -1], "-x": [-1, 0]}[pick]
	var fwd := [float(to_front[0]), 0.0, float(to_front[1])]
	var side := [-fwd[2], 0.0, fwd[0]]
	var fp = foot if foot != null else FOOT.get(type, [2, 2])
	var fw: int = fp[0]
	var fd: int = fp[1]
	var along_x: bool = to_front[0] != 0
	var rows := chunks_of(bx if along_x else bz)
	var cols := chunks_of(bz if along_x else bx)
	var edge := rows * CHUNK / 2
	var rail_cut = null
	var lines: Array = rail if rail is Array else ([] if rail == null else [rail])
	for line in lines:
		if (bz if line.axis == "x" else bx) != line.r:
			continue
		if rail_cut == null:
			rail_cut = {}
		var track_along_rows: bool = (line.axis == "x") == along_x
		if track_along_rows:
			rail_cut.col = floori(cols / 2.0)
			fw = mini(fw, floori(cols / 2.0))
		else:
			rail_cut.row = 1
			fd = 1
	var col: int
	if type == "gas":
		col = 0 if hash3(bx, 43, bz) < 0.5 else cols - fw
	else:
		col = floori(hash3(bx, 43, bz) * (cols + 1 - fw))
	if rail_cut != null and rail_cut.has("col") and col <= rail_cut.col and col + fw > rail_cut.col:
		col = 0 if hash3(bx, 45, bz) < 0.5 else rail_cut.col + 1
	var lat := (col + fw / 2.0 - cols / 2.0) * CHUNK
	var fwd_c := edge - fd * CHUNK / 2
	var covered := []
	for i in fd:
		for j in range(col, col + fw):
			covered.append("%d,%d" % [i, j])
	var plan := {"c": c, "fwd": fwd, "side": side, "fw": fw, "fd": fd, "lat": lat, "rows": rows, "cols": cols, "edge": edge, "covered": covered, "rail_cut": rail_cut, "core": false}
	plan.center = at(plan, fwd_c, lat)
	return plan


## plan.at(forward, lateral)
static func at(plan: Dictionary, forward: float, lateral: float) -> Array:
	return V.adds(V.adds(plan.c, plan.fwd, forward), plan.side, lateral)


static func chunk_center(plan: Dictionary, i: int, j: int) -> Array:
	return at(plan, plan.edge - (i + 0.5) * CHUNK, (j + 0.5 - plan.cols / 2.0) * CHUNK)


static func place_layout(id: String, type: String, bx: int, bz: int, roads: Dictionary, front, rail) -> Dictionary:
	var plan := place_plan(id, type, bx, bz, roads, null, front, rail)
	var e: float = plan.edge
	var lat: float = plan.lat
	var loc = Content.LOCATIONS.get(type)
	var ns = loc.get("survivorSlots") if loc != null else null
	var n_surv: int = ns if ns != null else 3
	var zs := []
	for fl in [[e - 0.6, -1.6], [e - 0.6, 0.0], [e - 0.6, 1.6], [e - 1.7, -0.8], [e - 1.7, 0.8], [e - 1.7, 2.4]]:
		zs.append(at(plan, fl[0], lat + fl[1]))
	var ss := []
	for k in n_surv:
		ss.append(at(plan, e + 1.6, lat + (k - (n_surv - 1) / 2.0) * 1.9))
	return {"id": id, "theta": atan2(bz, bx), "center": plan.center, "facing": atan2(plan.fwd[0], plan.fwd[2]), "plan": plan,
		"label": [plan.center[0], 8.0, plan.center[2]], "zombieSlots": zs, "survivorSlots": ss, "hitRadius": maxi(plan.fw, plan.fd) * CHUNK / 2 + 1}


static func colony_layout() -> Dictionary:
	var gate_dirs := [[0, -1], [1, 0], [0, 1], [-1, 0]]
	var zs := []
	for d in gate_dirs:
		for l in [-1.4, 0.0, 1.4]:
			zs.append([d[0] * (COLONY_RADIUS + 1.6) + (l if d[1] != 0 else 0.0), GROUND, d[1] * (COLONY_RADIUS + 1.6) + (l if d[0] != 0 else 0.0)])
	var ss := []
	for k in 10:
		var a := (k / 10.0) * PI * 2 + 0.3
		ss.append([cos(a) * 4.2, GROUND, sin(a) * 4.2])
	var gates := gate_dirs.map(func(d): return [d[0] * COLONY_RADIUS, GROUND, d[1] * COLONY_RADIUS])
	return {"id": "colony", "theta": 0.0, "center": [0.0, GROUND, 0.0], "facing": 0.0, "label": [0.0, 9.0, 0.0],
		"zombieSlots": zs, "survivorSlots": ss, "gates": gates, "hitRadius": COLONY_RADIUS + 1}


static func roads_set(m: Dictionary) -> Dictionary:
	var d := {}
	for r in m.roads:
		d[r] = true
	return d


## computeLayout(map, into)
static func compute_layout(m: Dictionary, into: Dictionary = {}) -> Dictionary:
	var roads := roads_set(m)
	var rail := cut_lines(m)
	for k in m.blocks:
		var b: Dictionary = m.blocks[k]
		if b.kind != "place" or into.has(b.placeId):
			continue
		var p := parse(k)
		into[b.placeId] = place_layout(b.placeId, b.get("type", b.placeId), p[0], p[1], roads, b.get("front"), rail)
	if not into.has("colony"):
		into.colony = colony_layout()
	var spots = m.get("spots")
	if spots != null:
		for id in spots:
			if not into.has(id) and m.blocks.has(spots[id].block):
				into[id] = spot_layout(id, spots[id], m, roads, rail)
	return into


static func spot_layout(id: String, sp: Dictionary, m: Dictionary, roads: Dictionary, rail: Array) -> Dictionary:
	var p := parse(sp.block)
	var bx: int = p[0]
	var bz: int = p[1]
	var b: Dictionary = m.blocks[sp.block]
	var district := district_of(bx, bz, m.get("look", 0))
	var cp = centerpiece_of(b.kind, district)
	var plan := place_plan(b.kind + "@", b.kind, bx, bz, roads, [cp[1], cp[2]] if cp != null else [0, 0], b.get("front"), rail)
	var want: Array = {"spot-house": ["house", "shop", "rows"], "spot-car": ["car", "lot", "yard"], "spot-container": ["yard", "car"]}.get(sp.kind, [])
	var pieces := []
	if landmark_of(b, bx, bz, m) == null:
		pieces = block_pieces(b, bx, bz, plan, null, district).filter(func(e): return want.has(e[2]))
	var pick = pieces[sp.i % pieces.size()] if pieces.size() else null
	var ij: Array = [pick[0], pick[1]] if pick != null else [0, (sp.i + 1) % plan.cols]
	var c := chunk_center(plan, ij[0], ij[1])
	if pick != null and pick[3] == 2:
		c = V.mul(V.add(c, chunk_center(plan, ij[0], ij[1] + 1)), 0.5)
	var at_ := func(f: float, l: float) -> Array: return V.adds(V.adds(c, plan.fwd, f), plan.side, l)
	return {"id": id, "spot": true, "theta": atan2(bz, bx), "center": c, "facing": atan2(plan.fwd[0], plan.fwd[2]), "label": [c[0], 5.0, c[2]],
		"zombieSlots": [at_.call(1.6, -1.8), at_.call(1.6, 1.8)], "survivorSlots": [at_.call(2.6, -0.9), at_.call(2.6, 0.9)], "hitRadius": CHUNK / 2 - 0.3, "plan": null}


static func open_block(b: Dictionary, bx: int, bz: int, district = null) -> bool:
	return RECIPES.has(b.kind) and b.kind != "place" and hash3(bx, 71, bz) < (0.3 if district == "outskirts" else 0.125)


static func recipe_of(kind: String, district) -> Array:
	if kind == "park":
		return RECIPES.park
	if district != null and DISTRICT_RECIPES.has(district):
		return DISTRICT_RECIPES[district]
	return RECIPES.get(kind, RECIPES.place)


static func pick_by(list: Array, r: float):
	var total := 0.0
	for e in list:
		total += e[1]
	var t := r * total
	for e in list:
		t -= e[1]
		if t < 0:
			return e[0]
	return list[0][0]


## blockPieces: the chunks of a block that get something: [row, col, what, span].
static func block_pieces(b: Dictionary, bx: int, bz: int, plan: Dictionary, recipe = null, district = null) -> Array:
	if recipe == null:
		recipe = recipe_of(b.kind, district)
	var out := []
	var h := func(k: int) -> float: return hash3(bx * 7 + k, 73, bz * 7 - k)
	var rc = plan.rail_cut
	var on_rail := func(i: int, j: int) -> bool: return rc != null and ((rc.has("row") and rc.row == i) or (rc.has("col") and rc.col == j))
	var covered := {}
	for c in plan.covered:
		covered[c] = true
	var free := func(i: int, j: int) -> bool:
		return i >= 0 and j >= 0 and i < plan.rows and j < plan.cols and not covered.has("%d,%d" % [i, j]) and not on_rail.call(i, j)
	var used := {}
	var take := func(i: int, j: int, what: String, span := 1) -> void:
		out.append([i, j, what, span])
		for k in span:
			used["%d,%d" % [i, j + k]] = true
	var open := open_block(b, bx, bz, district)
	var grounds = null
	if b.kind == "place":
		grounds = PLACE_GROUNDS.get(b.get("type", b.get("placeId")), ["lot"])
	if grounds != null:
		var cols: Array = plan.covered.map(func(c): return int(c.split(",")[1]))
		var rows: Array = plan.covered.map(func(c): return int(c.split(",")[0]))
		var same_side := func(i: int, j: int) -> bool:
			if rc == null:
				return true
			var ok_r: bool = not rc.has("row") or ((i < rc.row) == (rows.max() < rc.row))
			var ok_c: bool = not rc.has("col") or ((j < rc.col) == (cols.max() < rc.col))
			return ok_r and ok_c
		var order := []
		for i in plan.rows:
			for j in plan.cols:
				if free.call(i, j) and same_side.call(i, j):
					var md := 1 << 30
					for cc in cols:
						md = mini(md, absi(cc - j))
					order.append([i, j, i * 10 + md + hash3(bx + j, 111, bz + i) * 0.5])
		JS.sort(order, func(a, c): return a[2] - c[2])
		var gk := 0
		for e in order.slice(0, grounds.size()):
			take.call(e[0], e[1], grounds[gk])
			gk += 1
		var far := 0
		for i in plan.rows:
			for j in plan.cols:
				if not free.call(i, j) or same_side.call(i, j) or used.has("%d,%d" % [i, j]) or far >= 2:
					continue
				take.call(i, j, "house" if district == "downtown" or district == "residential" else ("yard" if district == "industrial" else "trees"))
				far += 1
	var dense: bool = grounds == null and not open and (district == "downtown" or district == "residential") and b.kind != "park"
	if dense:
		var back: int = plan.rows - 1
		for i in [0, back]:
			for j in plan.cols:
				if not free.call(i, j) or used.has("%d,%d" % [i, j]):
					continue
				if i == back and hash3(bx * 9 + j, 95, bz * 9) > (0.6 if district == "downtown" else 0.4):
					continue
				if district == "downtown" and free.call(i, j + 1) and not used.has("%d,%d" % [i, j + 1]) and hash3(bx * 5 + j, 81 + i, bz * 5) < 0.45:
					var r := hash3(bx * 3 + j, 83 + i, bz * 3)
					take.call(i, j, "tower" if plan.core and r < 0.15 else ("office" if r < 0.55 else ("cinema" if r < 0.78 else "garage")), 2)
					continue
				if district == "downtown" and plan.core and hash3(bx + j, 99 + i, bz) < 0.12:
					take.call(i, j, "ruin")
					continue
				take.call(i, j, "rows" if district == "residential" and hash3(bx + j, 85 + i, bz) < 0.5 else "shop")
		var court := false
		for i in range(1, back):
			for j in plan.cols:
				if not free.call(i, j) or used.has("%d,%d" % [i, j]):
					continue
				if not court and hash3(bx + j, 87, bz + i) < 0.5:
					take.call(i, j, "laundry" if district == "residential" else "camp")
					court = true
				else:
					take.call(i, j, "alley")
	elif not open and grounds == null:
		var cols: Array = plan.covered.map(func(c): return int(c.split(",")[1]))
		var first: int = maxi(0, cols.max() - 2) if cols.size() else 0
		var last: int = mini(cols.min(), plan.cols - 3) if cols.size() else plan.cols - 3
		var w0: int = first + floori(h.call(1) * (last - first + 1))
		var win := []
		for i in 2:
			for j in range(w0, w0 + 3):
				if free.call(i, j):
					win.append([i, j])
		JS.sort(win, func(a, c):
			if a[0] != c[0]:
				return a[0] - c[0]
			return hash3(bx + a[1], 75, bz) - hash3(bx + c[1], 75, bz))
		var n := mini(mini(2 if b.kind == "place" or district == "outskirts" else 3, 6 - plan.covered.size()), win.size())
		for k in n:
			var i: int = win[k][0]
			var j: int = win[k][1]
			if used.has("%d,%d" % [i, j]):
				continue
			if district == "industrial" and b.kind != "place" and k == 0 and h.call(5) < 0.35:
				take.call(i, j, "watertower" if h.call(6) < 0.5 else "substation")
				continue
			if district == "industrial" and free.call(i, j + 1) and not used.has("%d,%d" % [i, j + 1]) and win.any(func(e): return e[0] == i and e[1] == j + 1) and hash3(bx + j, 91, bz + i) < 0.4:
				take.call(i, j, "shed", 2)
				continue
			var what: String = pick_by(recipe, hash3(bx * 3 + j, 61 + i, bz * 3 + i))
			if district == "outskirts" and what == "house" and i > 0:
				what = "trees"
			take.call(i, j, what)
	for i in plan.rows:
		for j in plan.cols:
			var k := "%d,%d" % [i, j]
			if used.has(k) or covered.has(k) or on_rail.call(i, j):
				continue
			var r := hash3(bx * 11 + j, 79 + i, bz * 11 + i)
			if district == "outskirts":
				if i == 0:
					if r < 0.4: out.append([i, j, "clump", 1])
					elif r < 0.65: out.append([i, j, "tree", 1])
					elif r < 0.85: out.append([i, j, "drift", 1])
					continue
				if r < 0.32: out.append([i, j, "clump", 1])
				elif r < 0.5: out.append([i, j, "field", 1])
				elif r < 0.58 and not out.any(func(o): return o[2] == "pond"): out.append([i, j, "pond", 1])
				elif r < 0.78: out.append([i, j, "tree", 1])
				elif r < 0.92: out.append([i, j, "drift", 1])
				continue
			var square: bool = (b.kind == "park" or b.kind == "plaza") and district != "outskirts"
			if square and r < 0.14:
				out.append([i, j, "bench", 1])
			else:
				var base := 0.75 if b.kind == "park" else (0.6 if district == "residential" else (0.45 if district == "downtown" else 0.3))
				if r < base:
					out.append([i, j, "trees" if district != null and r < base * 0.33 else "tree", 1])
	return out


## MAP-7: a building's district tone (an instance colour), or null.
static func tint_of(district, x: float, z: float):
	var t = DISTRICT_TINT.get(district) if district != null else null
	if t == null:
		return null
	var j := func(k: int) -> float: return 1 + (hash3(JS.round_(x * 3), k, JS.round_(z * 3)) - 0.5) * 0.12
	return [t[0] * j.call(1), t[1] * j.call(2), t[2] * j.call(3)]


static func slot_view(id: String, levels: Dictionary = {}) -> Array:
	if id == "towers":
		return ["towers", levels.get("wall", 0)]
	if id == "garage":
		return ["garage", levels.get("crawler", 0)]
	if id == "spare" or id.begins_with("reserved"):
		return ["reserved" if id.begins_with("reserved") else "spare", 0]
	return [id, levels.get(id, 0)]
