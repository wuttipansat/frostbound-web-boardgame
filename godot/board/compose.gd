## src/render/board.js (composition half): what the board shows for a map, as a description the board node renders
## and the scene test compares with the web build (scripts/godot/scene-dump.mjs):
##   instances: {"fullKey@lod": {key, lod, mats: [16 floats], tints: [[r,g,b]|null]}}
##   models:    [[fullKey, lod, mat]]           (places, colony wall and slots, landmarks, the flame)
##   meshes:    {"name@lod": [mesh]}            (terrain, streets, rails, river, rim, wires, drifts, skyline …)
##   furniture: [[key, x, y, z, yaw, tilt, axis, detail, fullKey, mat]]
class_name Compose
extends RefCounted

const LOD_SIZE := [0.15, 0.3, 0.6]
const SMALL_SCALE := 0.86
const SMALL_VARIANTS := 8
const COTTAGE_VARIANTS := 6
const CLUTTER_KINDS := 6
const PLACE_SCALE := 1.0
const BIG_FILLER := ["tower-", "office-", "cinema-", "garage-", "shed-", "rows-", "tall-", "sub-", "mixed-", "mid-", "work-"]
const GROUND_KINDS := ["wing", "lot", "dock", "tow", "triage", "busloop", "schoolyard", "garden", "convoy", "siding", "truckyard", "logs", "wrecks", "foodvan", "laststand", "shelter", "looted"]
const EXTRA := ["playground", "pharmacy", "impound", "graveyard", "diner", "watertower", "substation"]
const PIECE_VEHICLES := {
	"lot": [["car", -8, -2, PI / 2], ["car", 4, -2, PI / 2]], "impound": [["car", -7, -2, PI / 2], ["car", 0, -2, PI / 2], ["car", 7, -2, PI / 2]],
	"laststand": [["burnt", 4, 7, 0.3]], "looted": [["car", 0, -4, -PI / 2 + 0.1]],
	"triage": [["ambulance", 0, 6, 0.2]], "tow": [["car", 7, -1, PI / 2 + 0.2]],
}
const PLACE_NAMES := {"grocery": "GROCERY", "gas": "GAS", "police": "POLICE", "hospital": "HOSPITAL", "school": "SCHOOL", "library": "LIBRARY", "warehouse": "DEPOT", "motel": "MOTEL", "apartment": "APTS", "church": "CHURCH", "farmhouse": "FARM", "mall": "MALL", "hardware": "HARDWARE", "military": "ARMY", "factory": "FACTORY", "forest": "WOODS", "scrapyard": "SCRAP"}
const GENERATOR := ["grocery", "gas", "police", "hospital", "school", "library", "military"]
const HOUSE_CHIMNEYS_N := 2

static var _extents: Dictionary = {}

var map: Dictionary
var layout: Dictionary
var streets: Array = []
var desc: Dictionary
var house_spots: Array = []
var courtyards: Array = []
var crow_perches: Array = []
var landmarks: Dictionary = {}
var debug_items: Array = []
var lamps: Array = []
var levels: Dictionary = {}


static func extent(key: String) -> Dictionary:
	if _extents.is_empty():
		_extents = JS.load_json("res://data/extents.json")
	return _extents[key]


static func lod_opts(L: int) -> Dictionary:
	return {"size": LOD_SIZE[L], "jitter": 0, "ao": L < 2}


func has_block(bx: int, bz: int) -> bool:
	return map.blocks.has("%d,%d" % [bx, bz])


## Build the whole board for a map (as the web board's first setMap, snap).
func build(m: Dictionary, base_levels: Dictionary = {}) -> Dictionary:
	map = m
	levels = base_levels
	desc = {"instances": {}, "models": [], "meshes": {}, "furniture": [], "lights": [], "fx": {}}
	layout = BL.compute_layout(map, {})
	desc.layout = layout
	streets = street_segments()
	var fresh: Array = map.blocks.keys()
	JS.sort(fresh, func(a, b):
		var pa := BL.parse(a)
		var pb := BL.parse(b)
		return V.hypot(pa[0], pa[1]) - V.hypot(pb[0], pb[1]))
	for k in fresh:
		build_block(k, map.blocks[k])
	build_props(fresh, streets)
	build_street_decor()
	build_skyline()
	desc.models.append([ModelPack.key_of("flame", {"size": BL.BUILDING_SCALE * 0.55}), "all", V.compose([0.0, 1.2 * BL.BUILDING_SCALE + BL.GROUND + 0.25, 0.0], 0, 0, 0, 1)])
	desc.crow_perches = crow_perches
	return desc


# ---------------------------------------------------------------- helpers

func instanced(cache_key: String, size: float, mats: Array, lod: String, opts: Dictionary = {}, tints = null) -> void:
	if mats.is_empty():
		return
	var o := {"size": size, "jitter": opts.get("jitter", 0.05), "ao": opts.get("ao", true)}
	var full := ModelPack.key_of(cache_key, o)
	var k := full + "@" + lod
	if not desc.instances.has(k):
		desc.instances[k] = {"key": full, "lod": lod, "mats": [], "tints": [], "shadow": opts.get("shadow", true), "detail": opts.get("detail", false)}
	desc.instances[k].mats.append_array(mats)
	for i in mats.size():
		desc.instances[k].tints.append(tints[i] if tints != null and i < tints.size() else null)


## lodProp: near version + a half-resolution far version.
func lod_prop(key: String, scale: float, mats: Array, detail := false) -> void:
	instanced(key, scale, mats, "near", {"jitter": 0, "detail": detail})
	instanced(key + "-far", scale * 2, mats, "far", {"jitter": 0, "ao": false, "shadow": false, "detail": detail})


## lodInstanced: three levels (fine = false: the close-up level reuses the authored one).
func lod_instanced(key: String, mats: Array, fine := true, tints = null, detail := false) -> void:
	for L in 3:
		var M := 1 if not fine and L == 0 else L
		instanced("lod%d-%s" % [M, key], LOD_SIZE[M], mats, str(L), {"jitter": 0, "ao": M < 2, "shadow": M < 2, "detail": detail}, tints)


## lodModel: one model at three levels, placed by a matrix.
func lod_model(key: String, mat: Array, fine := true) -> void:
	for L in 3:
		var M := 1 if not fine and L == 0 else L
		desc.models.append([ModelPack.key_of("lod%d-%s" % [M, key], lod_opts(M)), str(L), mat])


func add_mesh(name: String, lod: String, mesh: Dictionary) -> void:
	if mesh.pos.is_empty():
		return
	var k := name + "@" + lod
	if not desc.meshes.has(k):
		desc.meshes[k] = []
	desc.meshes[k].append(mesh)


static func dist_to_segment(px: float, pz: float, a: Array, b: Array) -> float:
	var abx: float = b[0] - a[0]
	var abz: float = b[2] - a[2]
	var t := maxf(0.0, minf(1.0, ((px - a[0]) * abx + (pz - a[2]) * abz) / (abx * abx + abz * abz)))
	return V.hypot(px - (a[0] + abx * t), pz - (a[2] + abz * t))


func street_segments() -> Array:
	var out := []
	for seg in map.roads:
		var p: PackedStringArray = seg.split(",")
		var c0 := BL.corner_pos(int(p[0]), int(p[1]))
		var c1 := BL.corner_pos(int(p[0]) + 1, int(p[1])) if p[2] == "h" else BL.corner_pos(int(p[0]), int(p[1]) + 1)
		out.append([[c0[0], 0.0, c0[1]], [c1[0], 0.0, c1[1]], seg])
	for g in layout.colony.gates:
		var f := [g[0], 0.0, g[2]]
		out.append([f.duplicate(), V.mul(V.normalize(f), BL.block_half(0)), "gate"])
	return out


func cell_of(x: float, z: float) -> String:
	return "%d,%d" % [BL.grid_of(x), BL.grid_of(z)]


func off_river(x: float, z: float, margin := 0.0) -> bool:
	var rv := BL.river_line(map)
	return absf((z if rv.axis == "x" else x) - rv.c) > BL.RAIL_CLEAR + margin


func edge_dist(bx: int, bz: int) -> Callable:
	var gaps := []
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			if (dx or dz) and not has_block(bx + dx, bz + dz):
				gaps.append([bx + dx, bz + dz])
	return func(x: float, z: float) -> float:
		var d := INF
		for g in gaps:
			var ex := maxf(0.0, absf(x - BL.block_pos(g[0])) - BL.block_half(g[0]))
			var ez := maxf(0.0, absf(z - BL.block_pos(g[1])) - BL.block_half(g[1]))
			d = minf(d, maxf(ex, ez))
		return d


# ---------------------------------------------------------------- blocks

func terrain_for(key: String, far := false) -> Dictionary:
	var cell := 2.0 if far else 1.0
	var p := BL.parse(key)
	var bx: int = p[0]
	var bz: int = p[1]
	var cx := BL.block_pos(bx)
	var cz := BL.block_pos(bz)
	var hx := BL.block_half(bx)
	var hz := BL.block_half(bz)
	var near := streets.filter(func(s): return minf(s[0][0], s[1][0]) < cx + hx + 4 and maxf(s[0][0], s[1][0]) > cx - hx - 4 and minf(s[0][2], s[1][2]) < cz + hz + 4 and maxf(s[0][2], s[1][2]) > cz - hz - 4)
	var geo := Ground.terrain({"center": [cx, cz], "half": maxf(hx, hz), "edge_dist": edge_dist(bx, bz), "cell": cell,
		"clip": func(x: float, z: float) -> bool: return cell_of(x, z) == key,
		"dist_road": func(x: float, z: float) -> float:
			var d := INF
			for s in near:
				d = minf(d, dist_to_segment(x, z, s[0], s[1]))
			return d})
	var k: Dictionary = map.blocks[key]
	var lot: bool = BL.open_block(k, bx, bz) and k.kind != "plaza" and BL.hash3(bx, 77, bz) < 0.5
	var snowy: bool = k.kind == "park" or k.kind == "colony" or lot
	var roads := BL.roads_set(map)
	var op := {
		"x0": not roads.has("%d,%d,v" % [bx, bz]) and has_block(bx - 1, bz), "x1": not roads.has("%d,%d,v" % [bx + 1, bz]) and has_block(bx + 1, bz),
		"z0": not roads.has("%d,%d,h" % [bx, bz]) and has_block(bx, bz - 1), "z1": not roads.has("%d,%d,h" % [bx, bz + 1]) and has_block(bx, bz + 1),
	}
	var e := func(o: bool) -> float: return 0.0 if o else BL.ROAD_HALF
	var slab := Ground.block_slab({"x0": cx - hx + e.call(op.x0), "x1": cx + hx - e.call(op.x1), "z0": cz - hz + e.call(op.z0), "z1": cz + hz - e.call(op.z1),
		"walk": BL.ROAD_WALK - BL.ROAD_KERB, "surface": "snow" if snowy else "paved", "detail": not far, "seed": [bx, bz], "open": op})
	var base: int = geo.pos.size()
	geo.pos.append_array(slab.pos)
	geo.nrm.append_array(slab.nrm)
	geo.col.append_array(slab.col)
	for i in slab.idx:
		geo.idx.append(i + base)
	return geo


func build_block(key: String, b: Dictionary) -> void:
	var p := BL.parse(key)
	var bx: int = p[0]
	var bz: int = p[1]
	add_mesh("terrain", "near", terrain_for(key))
	add_mesh("terrain", "far", terrain_for(key, true))
	if b.kind == "colony":
		var w: int = levels.get("wall", 0)
		var root := V.compose([0.0, BL.GROUND, 0.0], 0, 0, 0, 1)
		lod_model("colony-w%d" % w, root)
		for id in BL.COLONY_SLOTS:
			var kv := BL.slot_view(id, levels)
			var xz: Array = BL.COLONY_SLOTS[id]
			var ry: float = JS.round_(atan2(-xz[0], -xz[1]) / (PI / 2)) * (PI / 2)
			lod_model("slot-%s-%d" % [kv[0], kv[1]], V.mat_mul(root, V.compose([xz[0], 0.0, xz[1]], 0, ry, 0, 1)))
	elif b.kind == "place":
		var L: Dictionary = layout[b.placeId]
		var type: String = b.get("type", b.placeId)
		var size := extent("place-" + type)
		var sc := minf(PLACE_SCALE, minf((L.plan.fw * BL.CHUNK - 0.2) / size.x, (L.plan.fd * BL.CHUNK - 0.2) / size.z))
		lod_model("place-" + type, V.compose(L.center, 0, L.facing, 0, sc))
	else:
		var lm = BL.landmark_of(b, bx, bz, map)
		if lm != null:
			var size := extent("lm-" + lm)
			var sc := minf(1.0, (2 * (BL.block_half(bx) - BL.ROAD_WALK) - 0.4) / maxf(size.x, size.z))
			var ry: float = {"z": 0.0, "x": PI / 2, "-z": PI, "-x": -PI / 2}[b.get("front", "z")]
			var mat := V.compose([BL.block_pos(bx), BL.GROUND, BL.block_pos(bz)], 0, ry, 0, sc)
			lod_model("lm-" + lm, mat, false)
			landmarks[key] = {"kind": lm, "mat": mat, "scale": sc, "ry": ry, "pos": [BL.block_pos(bx), BL.GROUND, BL.block_pos(bz)]}


# ---------------------------------------------------------------- MAP-9: which building stands on a chunk

static func pick_building(district: String, depth: float, what: String, front: bool, back: bool, corner: bool, n: int, r: float) -> Variant:
	var sub := func(k: int) -> Array:
		var v := k % 4
		return ["sub-%d" % v, 6.9 if v % 2 else 4.4]
	var mixed := func(k: int) -> Array: return ["mixed-%d" % (k % 2), 7.9]
	var mid := func(_k: int) -> Array: return ["mid-0", 13.2]
	var work := func(k: int) -> Array: return ["work-%d" % (k % 2), 3.6]
	if district == "industrial":
		return work.call(n)
	if district == "residential":
		if depth < 1.3:
			return sub.call(n)
		if front and corner:
			return mixed.call(n)
		if back and r < 0.4:
			return mid.call(n)
		return null if what == "rows" else (sub.call(n) if r < 0.5 else null)
	if district == "downtown":
		if front and corner:
			return null
		if front:
			return mixed.call(n) if r < 0.55 else null
		if back:
			return mid.call(n) if r < 0.6 else null
	return null


func _m(p: Array, ry: float, s := 1.0) -> Array:
	return V.compose(p, 0, ry, 0, s)


# ---------------------------------------------------------------- props of the blocks (buildProps)

func build_props(keys: Array, new_streets: Array) -> void:
	var trees := [[], [], []]
	var rocks := [[], [], []]
	var cars := [[], [], [], []]
	var yards := [[], [], []]
	var houses := []
	var house_t := []
	for v in SMALL_VARIANTS:
		houses.append([])
		house_t.append([])
	var cottages := []
	var cottage_t := []
	for v in COTTAGE_VARIANTS:
		cottages.append([])
		cottage_t.append([])
	var birches := [[], []]
	var stumps := []
	var drifts := [[], []]
	var ruins := [[], []]
	var pieces := {"parking": [], "fountain": []}
	var fences := {"picket": [], "chain": []}
	var big := {}   # key -> {mats, tints}
	var big_order := []
	var piece_vehicles := {}
	var pv_order := []
	var clutter := []
	for k in CLUTTER_KINDS:
		clutter.append([])
	var by0 := 113
	var roads := BL.roads_set(map)
	var look: int = map.get("look", 0)
	var free_at := func(x: float, z: float, b: Dictionary) -> bool:
		for s in streets:
			if dist_to_segment(x, z, s[0], s[1]) < BL.ROAD_WALK:
				return false
		if b.kind == "colony":
			return V.hypot(x, z) > BL.COLONY_RADIUS + 3
		var gx := BL.grid_of(x)
		var gz := BL.grid_of(z)
		var e := BL.edges_of(gx, gz)
		return absf(x - BL.block_pos(gx)) > e[0] - 0.5 or absf(z - BL.block_pos(gz)) > e[1] - 0.5
	var big_push := func(key: String, mat: Array, tint) -> void:
		if not big.has(key):
			big[key] = {"mats": [], "tints": []}
			big_order.append(key)
		big[key].mats.append(mat)
		big[key].tints.append(tint)
	for key in keys:
		var b: Dictionary = map.blocks[key]
		var bp := BL.parse(key)
		var bx: int = bp[0]
		var bz: int = bp[1]
		if BL.landmark_of(b, bx, bz, map) != null:
			continue
		if BL.RECIPES.has(b.kind) or b.kind == "place":
			var district := BL.district_of(bx, bz, look)
			var cp = BL.centerpiece_of(b.kind, district)
			var plan: Dictionary
			if b.kind == "place":
				plan = layout[b.placeId].plan.duplicate()
			else:
				plan = BL.place_plan(b.kind + "@", b.kind, bx, bz, roads, [cp[1], cp[2]] if cp != null else [0, 0], b.get("front"), BL.cut_lines(map))
			plan.core = BL.core_of(bx, bz, look)
			var recipe := BL.recipe_of(b.kind, district)
			var face0 := atan2(plan.fwd[0], plan.fwd[2])
			if cp != null and plan.fw == cp[1] and plan.fd == cp[2]:
				if cp[0] == "ruinBig":
					ruins[1].append(_m(plan.center, face0, 0.8))
				else:
					pieces[cp[0]].append(_m(plan.center, face0, 0.8))
			for piece in BL.block_pieces(b, bx, bz, plan, recipe, district):
				var i: int = piece[0]
				var j: int = piece[1]
				var what: String = piece[2]
				var span: int = piece[3]
				var p: Array = V.mul(V.add(BL.chunk_center(plan, i, j), BL.chunk_center(plan, i, j + 1)), 0.5) if span == 2 else BL.chunk_center(plan, i, j)
				var r2 := BL.hash3(bx * 5 + i, 67, bz * 5 + j)
				var back_row: bool = i == plan.rows - 1 and plan.rows > 2
				var face: float = face0 if i == 0 else (face0 + PI if back_row else (face0 if span == 2 else floori(r2 * 4) * (PI / 2)))
				if EXTRA.has(what) or GROUND_KINDS.has(what):
					var fy: float = face0 if i == 0 else face
					big_push.call(what, _m(p, fy, SMALL_SCALE), null)
					for pv in PIECE_VEHICLES.get(what, []):
						var u := 0.3 * SMALL_SCALE
						var c := cos(fy)
						var sn := sin(fy)
						var at := V.add(p, [(pv[1] * c + pv[2] * sn) * u, 0.12, (-pv[1] * sn + pv[2] * c) * u])
						var v := floori(BL.hash3(bx + pv[1], by0, bz + pv[2]) * 4)
						var vk: String = {"car": "car4-%d" % v, "burnt": "car-burnt-%d" % v, "bus": "veh-bus-1", "trailer": "veh-trailer", "cab": "veh-cab", "ambulance": "veh-ambulance", "police": "veh-police"}[pv[0]]
						if not piece_vehicles.has(vk):
							piece_vehicles[vk] = []
							pv_order.append(vk)
						piece_vehicles[vk].append(_m(at, fy + pv[3], 1))
					continue
				if ["tower", "office", "cinema", "garage", "shed"].has(what):
					var nv: int = {"tower": 1, "office": 2, "cinema": 1, "garage": 1, "shed": 2}[what]
					var v := floori(r2 * nv)
					big_push.call("%s-%d" % [what, v], _m(p, face, SMALL_SCALE), BL.tint_of(district, p[0], p[2]))
					continue
				var corner: bool = i == 0 and (j == 0 or j == plan.cols - 1)
				if what == "rows" or what == "house" or what == "shop":
					var pick = pick_building(district, Zones.town_depth(bx, bz, look), what, i == 0, back_row, corner, j + i * 2 + floori(BL.hash3(bx, 121, bz) * 7), BL.hash3(bx * 5 + j, 123 + i, bz * 5))
					if pick != null:
						big_push.call(pick[0], _m(p, face, SMALL_SCALE), BL.tint_of(district, p[0], p[2]))
						house_spots.append({"roof": [p[0], BL.GROUND + pick[1], p[2]]})
						if district == "residential" and i == 0 and pick[0].begins_with("sub-"):
							fences.picket.append(_m(V.adds(p, plan.fwd, BL.CHUNK / 2 - 0.25), face0))
						continue
				if what == "rows" or (what == "shop" and district == "downtown" and ((plan.core and BL.hash3(bx + j, 93 + i, bz) < 0.3) or corner)):
					var is_rows := what == "rows"
					var v: int = floori(r2 * 2) if is_rows else [0, 1, 3][floori(r2 * 3)]
					big_push.call("%s-%d" % ["rows" if is_rows else "tall", v], _m(p, face, SMALL_SCALE), BL.tint_of(district, p[0], p[2]))
					if is_rows and district == "residential" and (i == 0 or back_row):
						fences.picket.append(_m(V.adds(p, plan.fwd, (-1 if back_row else 1) * (BL.CHUNK / 2 - 0.25)), face0))
					continue
				if what == "alley":
					if r2 < 0.5:
						clutter[floori(r2 * 8) % (CLUTTER_KINDS - 1)].append(_m(p, face))
					if r2 > 0.3 and district != "industrial" and plan.rail_cut == null:
						trees[floori(r2 * 7) % 3].append(_m(V.add(p, [(r2 - 0.5) * 2.2, 0.0, (BL.hash3(i, j, bx) - 0.5) * 2.2]), r2 * 6, 0.65 + r2 * 0.3))
					continue
				if what == "camp" or what == "laundry":
					courtyards.append({"p": p, "face": face, "what": what})
					continue
				if what == "house" and district == "outskirts":
					var dead := BL.hash3(bx + j, 101, bz + i) < 0.25
					var v: int = 4 + floori(r2 * 2) if dead else floori(r2 * 4)
					cottages[v].append(_m(p, face0 if i == 0 else face, SMALL_SCALE))
					cottage_t[v].append(BL.tint_of(district, p[0], p[2]))
					if not dead:
						house_spots.append({"roof": [p[0], BL.GROUND + 3.4, p[2]], "cottage": true})
					continue
				if what == "house" or what == "shop":
					var pool: Array = BL.DISTRICT_SMALL.get(district, [0, 1, 2, 3, 4, 5, 6, 7])
					var shop_pool := pool.filter(func(v): return v % 2 == 0)
					var house_pool := pool.filter(func(v): return v % 2 == 1)
					var list: Array = shop_pool if what == "shop" and shop_pool.size() else (house_pool if what != "shop" and house_pool.size() else pool)
					var v: int = list[floori(r2 * list.size())]
					var wide: float = minf(1.1, (BL.CHUNK - 0.25) / ((16 + (v % 3) * 2 + 7) * 0.3)) if (district == "downtown" or district == "residential") and i == 0 else SMALL_SCALE
					houses[v % SMALL_VARIANTS].append(_m(p, face, wide))
					house_t[v % SMALL_VARIANTS].append(BL.tint_of(district, p[0], p[2]))
					var floors := 2 + (v % 3)
					var dep := (14 + (v % 2) * 3) * 0.3 * wide
					var toward: Array = plan.fwd if i == 0 else [sin(face), 0.0, cos(face)]
					var roof := V.adds(p, toward, dep / 2 - 0.2)
					roof[1] = BL.GROUND + floors * 10 * 0.3 * wide + 0.2
					house_spots.append({"roof": roof})
					if district == "residential" and i == 0:
						fences.picket.append(_m(V.adds(p, plan.fwd, BL.CHUNK / 2 - 0.25), face0))
				elif what == "clump" or (what == "trees" and district == "outskirts"):
					for k in 3:
						trees[floori(BL.hash3(k, i + bx, j) * 3)].append(_m(V.add(p, [(BL.hash3(k, bx, j) - 0.5) * 1.6, 0.0, (BL.hash3(k, bz, i) - 0.5) * 1.6]), k * 2.1, 0.95 + BL.hash3(j, k, i) * 0.45))
					for k in 4:
						var a := k * 1.57 + BL.hash3(k, bx + i, bz) * 1.2
						var q := V.add(p, [cos(a) * 2.1, 0.0, sin(a) * 2.1])
						var hh := BL.hash3(k, j, bz + 3)
						if hh < 0.35:
							birches[k % 2].append(_m(q, a, 0.8 + hh))
						elif hh < 0.55:
							stumps.append(_m(q, a, 1))
						else:
							trees[(k + j) % 3].append(_m(q, a, 0.45 + hh * 0.3))
					if plan.rail_cut == null and BL.hash3(bx + j, 103, bz + i) < 0.3:
						var tp := V.add(V.add(p, [0.0, 0.3, 0.0]), [cos(face0) * 1.8, 0.0, -sin(face0) * 1.8])
						trees[1].append(V.compose(tp, 0, face0, PI / 2 - 0.05, 0.8))
				elif what == "field" or what == "pond":
					var v := 0 if what == "pond" else floori(r2 * 3)
					if plan.rail_cut == null and BL.hash3(bx + j, 125, bz + i) < 0.55:
						var a := BL.hash3(i, j, 127) * 6.28
						trees[floori(r2 * 5) % 3].append(_m(V.add(p, [cos(a) * 2.4, 0.0, sin(a) * 2.4]), a, 0.6 + r2 * 0.35))
					big_push.call("b7-%s-%d" % [what, v], _m(p, face0 + floori(r2 * 4) * (PI / 2), SMALL_SCALE), null)
				elif what == "trees":
					for k in 3:
						var q := V.add(p, [(BL.hash3(k, bx, j) - 0.5) * 3, 0.0, (BL.hash3(k, bz, i) - 0.5) * 3])
						trees[floori(BL.hash3(k, i, j) * 3)].append(_m(q, k, 0.7 + BL.hash3(j, k, i) * 0.5))
				elif what == "tree":
					trees[floori(r2 * 3)].append(_m(V.add(p, [(r2 - 0.5) * 3, 0.0, (BL.hash3(i, j, 5) - 0.5) * 3]), r2 * 6, 0.8 + r2 * 0.4))
				elif what == "drift":
					drifts[floori(r2 * 2)].append(_m(V.add(p, [(r2 - 0.5) * 1.5, 0.0, (BL.hash3(i, j, 9) - 0.5) * 1.5]), r2 * 6, 0.8 + r2 * 0.25))
				elif what == "bench":
					clutter[CLUTTER_KINDS - 1].append(_m(V.adds(p, plan.fwd, BL.CHUNK * 0.35), face0 + PI))
				elif what == "car":
					var across := [sin(face + PI / 2), 0.0, cos(face + PI / 2)]
					cars[floori(r2 * 4)].append(_m(V.adds(p, across, -1.6), face + PI / 2))
					cars[floori(BL.hash3(i, j, bx) * 4)].append(_m(V.adds(p, across, 1.6), face + PI / 2))
				elif what == "yard":
					if district == "industrial" and i == 0:
						fences.chain.append(_m(V.adds(p, plan.fwd, BL.CHUNK / 2 - 0.2), face0))
					var across := [sin(face), 0.0, cos(face)]
					yards[floori(r2 * 3)].append(_m(V.adds(p, across, -1.7), face))
					yards[floori(BL.hash3(j, i, bz) * 3)].append(_m(V.adds(p, across, 1.8), face))
				elif what == "ruin":
					ruins[floori(r2 * 2)].append(_m(p, face, PLACE_SCALE))
				elif what == "rocks":
					for k in 2:
						rocks[k].append(_m(V.add(p, [(k - 0.5) * 3, 0.0, (r2 - 0.5) * 3]), r2 * 6, 0.9))
				else:
					for k in 2:
						clutter[floori(BL.hash3(k, i + bx, j + bz) * (CLUTTER_KINDS - 1))].append(_m(V.add(p, [(1.9 if k else -1.9) + (BL.hash3(k, 3, j) - 0.5) * 0.6, 0.0, (BL.hash3(k, 5, i) - 0.5) * 3]), BL.hash3(k, i, j) * 6))
			continue
		var spots := []
		var ed := edge_dist(bx, bz)
		var i := 0
		while i < 40 and spots.size() < 7:
			var x := BL.block_pos(bx) + (BL.hash3(i, bx * 7 + 3, bz * 13 + 11) * 2 - 1) * (BL.block_half(bx) - 2)
			var z := BL.block_pos(bz) + (BL.hash3(i, bx * 7 + 5, bz * 13 + 17) * 2 - 1) * (BL.block_half(bz) - 2)
			i += 1
			if ed.call(x, z) < 4 or not free_at.call(x, z, b) or spots.any(func(q): return V.hypot(q[0] - x, q[1] - z) < 3):
				continue
			spots.append([x, z])
		for si in spots.size():
			var x: float = spots[si][0]
			var z: float = spots[si][1]
			var r := BL.hash3(JS.round_(x * 10), 5, JS.round_(z * 10))
			var mat := V.compose([x, BL.GROUND, z], 0, floori(r * 4) * (PI / 2), 0, 0.75 + r * 0.6)
			if si % 3 == 2:
				rocks[floori(r * 3)].append(mat)
			elif si == 0 and b.kind == "place" and r < 0.3:
				yards[floori(r * 9) % 3].append(mat)
			else:
				trees[floori(r * 3)].append(mat)
	# (new streets: the random street cars are switched off in the web build)
	var cuts := BL.cut_lines(map)
	var clear_of_cuts := func(mx: Array) -> bool:
		for l in cuts:
			if absf((mx[14] if l.axis == "x" else mx[12]) - l.c) <= BL.RAIL_CLEAR + 3.4:
				return false
		return true
	for k in 3:
		trees[k] = trees[k].filter(clear_of_cuts)
	for k in 2:
		birches[k] = birches[k].filter(clear_of_cuts)
	for k in 3:
		lod_prop("tree-%d" % k, 0.25, trees[k])
	for v in SMALL_VARIANTS:
		lod_instanced("small-%d" % v, houses[v], false, house_t[v])
	for v in COTTAGE_VARIANTS:
		lod_instanced("cottage-%d" % v, cottages[v], true, cottage_t[v])
	for v in 2:
		lod_instanced("ruin-%d" % v, ruins[v])
	lod_instanced("parking-small", pieces.parking)
	lod_instanced("fountain", pieces.fountain)
	for k in CLUTTER_KINDS:
		instanced("clutter-%d" % k, 0.12, clutter[k], "near", {"jitter": 0, "shadow": false})
	for k in 2:
		if drifts[k].size():
			var key := "drift-%d@all" % k
			desc.instances[key] = {"key": "drift-%d" % k, "lod": "all", "mats": drifts[k], "tints": drifts[k].map(func(_m): return null), "shadow": false, "detail": false, "custom": true}
	for k in 2:
		lod_prop("birch-%d" % k, 0.25, birches[k], true)
	instanced("stump", 0.25, stumps, "near", {"jitter": 0, "shadow": false, "detail": true})
	for k in 3:
		instanced("rock-%d" % k, 0.25, rocks[k], "near", {"jitter": 0})
	for v in 4:
		instanced("car4-%d" % v, 0.15, cars[v], "near", {"jitter": 0, "shadow": false})
	for k in 3:
		lod_prop("container-%d" % k, 0.2, yards[k])
	for k in big_order:
		var fine := true
		for pre in BIG_FILLER:
			if k.begins_with(pre):
				fine = false
		lod_instanced("b5-" + k, big[k].mats, fine, big[k].tints, k.begins_with("b7-"))
	for k in pv_order:
		instanced(k, 0.15, piece_vehicles[k], "near", {"jitter": 0, "shadow": false})
	for k in ["picket", "chain"]:
		instanced("fence-" + k, 0.1, fences[k], "near", {"jitter": 0, "shadow": false})


# ---------------------------------------------------------------- streets: markings, ramps, lamps, pools, rails

func ground_ok(x: float, z: float) -> bool:
	var bx := BL.grid_of(x)
	var bz := BL.grid_of(z)
	return has_block(bx, bz) and edge_dist(bx, bz).call(x, z) >= 3


func slab_within(x: float, z: float, inset: float) -> bool:
	var bx := BL.grid_of(x)
	var bz := BL.grid_of(z)
	return has_block(bx, bz) and absf(x - BL.block_pos(bx)) <= BL.block_half(bx) - BL.ROAD_HALF - inset and absf(z - BL.block_pos(bz)) <= BL.block_half(bz) - BL.ROAD_HALF - inset


func rail_of(rail: Dictionary) -> Dictionary:
	var pieces := []
	var along: Array = map.blocks.keys().map(func(k): return BL.parse(k)[0 if rail.axis == "x" else 1])
	var in_row := func(b: int) -> bool: return has_block(b, rail.r) if rail.axis == "x" else has_block(rail.r, b)
	var roads := BL.roads_set(map)
	for b in range(along.min(), along.max() + 1):
		if not in_row.call(b):
			continue
		var h := BL.block_half(b) - BL.ROAD_HALF
		pieces.append([BL.block_pos(b) - h, BL.block_pos(b) + h, "slab", BL.GROUND])
		if in_row.call(b + 1):
			var line := BL.block_pos(b) + BL.block_half(b)
			var road: bool = roads.has(("%d,%d,v" % [b + 1, rail.r]) if rail.axis == "x" else ("%d,%d,h" % [rail.r, b + 1]))
			pieces.append([line - BL.ROAD_HALF, line + BL.ROAD_HALF, "road" if road else "lane", 0.0])
	var out := rail.duplicate()
	out.pieces = pieces
	return out


func rail_crossings(rail: Dictionary) -> Array:
	var out := []
	for pc in rail.get("pieces", []):
		if pc[2] != "road":
			continue
		var line: float = (pc[0] + pc[1]) / 2
		for i in 2:
			var s := -1 if i == 0 else 1
			var along: Array = [line + s * (BL.ROAD_KERB + 0.4), rail.c + s * 3.2] if rail.axis == "x" else [rail.c + s * 3.2, line + s * (BL.ROAD_KERB + 0.4)]
			var d: Array = [-s, 0] if rail.axis == "x" else [0, -s]
			out.append({"x": along[0], "z": along[1], "dx": d[0], "dz": d[1], "up": BL.hash3(JS.round_(line), i, rail.look) < 0.25})
	return out


func build_street_decor() -> void:
	var segs := streets.filter(func(s): return s[2] != "gate")
	var rail := rail_of(BL.rail_line(map))
	add_mesh("markings", "all", Streets.marking_quads(segs, func(x, z): return ground_ok(x, z), 0.03))
	var slab_test := func(x: float, z: float) -> bool:
		var bx := BL.grid_of(x)
		var bz := BL.grid_of(z)
		return has_block(bx, bz) and absf(x - BL.block_pos(bx)) <= BL.block_half(bx) - BL.ROAD_HALF + 0.7 and absf(z - BL.block_pos(bz)) <= BL.block_half(bz) - BL.ROAD_HALF + 0.7
	add_mesh("kerb-ramps", "all", Streets.ramp_quads(segs, slab_test, BL.GROUND))
	var posts := rail_crossings(rail)
	var spots := Streets.lamp_spots(segs, func(x, z): return ground_ok(x, z) and slab_within(x, z, 0.2))
	spots = spots.filter(func(l): return not posts.any(func(p): return V.hypot(p.x - l.x, p.z - l.z) < 2.5) and absf((l.z if rail.axis == "x" else l.x) - rail.c) > BL.RAIL_CLEAR + 0.6 and off_river(l.x, l.z, 0.6))
	var lit := []
	var dead := []
	var pool_list := []
	var flickers := []
	var doors_at := []
	for id in layout:
		var L: Dictionary = layout[id]
		if L.get("plan") != null:
			doors_at.append(V.adds(V.adds(L.plan.c, L.plan.fwd, L.plan.edge + 1), L.plan.side, L.plan.lat))
	var ave := BL.avenue_line(map)
	var look: int = map.get("look", 0)
	for l in spots:
		var h := BL.hash3(JS.round_(l.x * 3), 77, JS.round_(l.z * 3))
		var on_ave: bool = absf((l.z if ave.axis == "x" else l.x) - ave.c) < BL.ROAD_WALK + 1
		var keep: bool
		if V.hypot(l.x, l.z) < 30:
			keep = h < 0.75
		elif doors_at.any(func(d): return V.hypot(d[0] - l.x, d[2] - l.z) < 10):
			keep = h < 0.55
		elif on_ave and BL.district_of(BL.grid_of(l.x), BL.grid_of(l.z), look) == "downtown":
			keep = h < 0.5
		else:
			keep = h < 0.05
		l.dead = not keep
		l.flicker = keep and h > 0.7
	for l in spots:
		var mat := V.compose([l.x + l.dx * 0.45, BL.GROUND, l.z + l.dz * 0.45], 0, atan2(-l.dz, l.dx), 0, 1)
		(dead if l.dead else lit).append(mat)
		if l.dead:
			continue
		if l.flicker:
			flickers.append(pool_list.size())
		pool_list.append(V.compose([l.x + l.dx * 0.85, BL.GROUND + 0.05, l.z + l.dz * 0.85], -PI / 2, 0, 0, 5))
	instanced("lamp3", 0.1, lit, "near", {"jitter": 0, "shadow": false})
	instanced("lamp3-dead", 0.1, dead, "near", {"jitter": 0, "shadow": false})
	if pool_list.size():
		desc.instances["lamp-pools@all"] = {"key": "lamp-pools", "lod": "all", "mats": pool_list, "tints": [], "custom": true, "flickers": flickers}
	lamps = spots
	desc.lamps = spots
	build_railway(rail)
	build_furniture(rail, segs, spots)
	build_rim()


func build_railway(rail: Dictionary) -> void:
	if rail.pieces.is_empty():
		return
	add_mesh("railway", "all", Streets.rail_quads(rail, rail.pieces))
	var posts := {"down": [], "up": []}
	for p in rail_crossings(rail):
		var bd = ModelPack.bounds(ModelPack.key_of("crossing-" + ("up" if p.up else "down"), {"size": 0.1, "jitter": 0}))
		var o: float = ((bd.min[0] + bd.max[0]) / 2.0) * 0.1
		posts["up" if p.up else "down"].append(V.compose([p.x + p.dx * o, BL.GROUND, p.z + p.dz * o], 0, atan2(-p.dz, p.dx), 0, 1))
	for k in ["down", "up"]:
		instanced("crossing-" + k, 0.1, posts[k], "near", {"jitter": 0, "shadow": false})
	var slabs: Array = rail.pieces.filter(func(p): return p[2] == "slab")
	JS.sort(slabs, func(a, b):
		var d: float = (b[1] - b[0]) - (a[1] - a[0])
		return d if d != 0 else a[0] - b[0])
	var kinds := ["box", "tank", "hopper"]
	var wagons := {"box": [], "tank": [], "hopper": []}
	var lying := []
	var rv := BL.river_line(map)
	var blocks_on_row: Array = rail.pieces.filter(func(p): return p[2] == "slab" and not (rv.axis != rail.axis and p[0] < rv.c + 4 and p[1] > rv.c - 4))
	var pick: Array = blocks_on_row[floori(BL.hash3(rail.look, 7, 3) * blocks_on_row.size())] if blocks_on_row.size() else slabs[0]
	var s0: float = pick[0]
	var s1: float = pick[1]
	var n := maxi(1, mini(3, floori((s1 - s0 - 1) / 12.6)))
	var on_rail := func(t: float, lat: float, yaw := 0.0) -> Array: return [t, rail.c + lat, yaw] if rail.axis == "x" else [rail.c + lat, t, yaw + PI / 2]
	var look5: int = rail.look % 5
	for k in n:
		var kind: String = kinds[floori(BL.hash3(k, rail.look, 9) * 3)]
		var t := s0 + 0.8 + 6.3 + k * 12.6
		var over := k >= n - 1 and n > 1
		var xzy: Array = on_rail.call(t, 0.6 if over else 0.0)
		var mat := V.compose([xzy[0], BL.GROUND + (0.0 if over else 0.16), xzy[1]], 0, xzy[2] + (0.08 if over else 0.0), 0, 1)
		if over:
			lying.append([kind, mat])
		else:
			wagons[kind].append(mat)
	for k in kinds:
		instanced("wagon-%s-%d" % [k, look5], 0.3, wagons[k], "all", {"jitter": 0})
	for e in lying:
		instanced("wagon-lying-%s-%d" % [e[0], look5], 0.3, [e[1]], "all", {"jitter": 0})
	var ends := [rail.pieces[0][0] + 0.6, rail.pieces[rail.pieces.size() - 1][1] - 0.6]
	for i in 2:
		var xzy: Array = on_rail.call(ends[i], 0.0, PI if i else 0.0)
		instanced("buffer-%d" % i, 0.1, [V.compose([xzy[0], BL.GROUND, xzy[1]], 0, xzy[2], 0, 1)], "all", {"jitter": 0})


# ---------------------------------------------------------------- MAP-7: the rim

func build_rim() -> void:
	var m := {"pos": [], "nrm": [], "col": [], "idx": []}
	var box := func(x0: float, y0: float, z0: float, x1: float, y1: float, z1: float, c: Array) -> void:
		var v := [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
		for f in [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]]:
			var n: int = m.pos.size()
			for k in f:
				m.pos.append(v[k])
				m.col.append(c)
			m.idx.append_array([n, n + 1, n + 2, n, n + 2, n + 3])
	var snow := Ground.lin(Ground.P_SNOW)
	var ice := Ground.lin(0xcfe2f0)
	var root0 := Ground.lin(0x4a3426)
	var look: int = map.get("look", 0)
	for k in map.blocks:
		var bp := BL.parse(k)
		var bx: int = bp[0]
		var bz: int = bp[1]
		var outskirts := BL.district_of(bx, bz, look) == "outskirts"
		for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
			var dx: int = d[0]
			var dz: int = d[1]
			if has_block(bx + dx, bz + dz):
				continue
			var line_c := BL.block_pos(bx) + dx * (BL.block_half(bx) - 3) if dx else BL.block_pos(bz) + dz * (BL.block_half(bz) - 3)
			var cb := bz if dx else bx
			var c0 := BL.block_pos(cb) - BL.block_half(cb)
			var c1 := BL.block_pos(cb) + BL.block_half(cb)
			var end_off := func(sg: int) -> float:
				var nb: Array = [bx, bz + sg] if dx else [bx + sg, bz]
				var dg: Array = [bx + dx, bz + sg] if dx else [bx + sg, bz + dz]
				return -3.0 if not has_block(nb[0], nb[1]) else (3.0 if has_block(dg[0], dg[1]) else 0.0)
			var t0: float = c0 - end_off.call(-1)
			var t1: float = c1 + end_off.call(1)
			var P3 := func(t: float, o: float, y: float) -> Array: return [line_c + dx * o, y, t] if dx else [t, y, line_c + dz * o]
			var put := func(ta: float, tb: float, oa: float, ob: float, ya: float, yb: float, c: Array) -> void:
				var a: Array = P3.call(ta, oa, ya)
				var b: Array = P3.call(tb, ob, yb)
				box.call(minf(a[0], b[0]), ya, minf(a[2], b[2]), maxf(a[0], b[0]), yb, maxf(a[2], b[2]), c)
			var t := t0
			while t < t1 - 0.05:
				var h := BL.hash3(JS.round_(t * 7), bx * 5 + dx, bz * 5 + dz)
				var te := minf(t1, t + 0.7)
				put.call(t, te, -0.25, 0.18 + h * 0.14, BL.GROUND - 0.12 - h * 0.1, BL.GROUND + 0.08 + h * 0.07, snow)
				if h < 0.55:
					var L := 0.25 + BL.hash3(JS.round_(t * 11), 5, bx + bz) * 0.9
					var m0 := t + 0.2 + h * 0.3
					put.call(m0, m0 + 0.09, 0.05, 0.14, BL.GROUND - 0.12 - L, BL.GROUND - 0.1, ice)
					put.call(m0 + 0.02, m0 + 0.07, 0.07, 0.12, BL.GROUND - 0.2 - L * 1.25, BL.GROUND - 0.12 - L, ice)
				if outskirts and h > 0.86:
					put.call(t, t + 0.12, 0.0, 0.35 + h * 0.3, -1.9 - h * 0.4, -1.8 - h * 0.4, root0)
				t += 0.7
	m.computed_normals = true
	add_mesh("rim", "all", m)


# ---------------------------------------------------------------- MAP-6/7: the skyline

func build_skyline() -> void:
	var look: int = map.get("look", 0)
	var tw := Zones.town_of(look)
	var far := atan2(-1, -1)
	var a0 := atan2(tw.dz, tw.dx)
	var diff := atan2(sin(a0 - far), cos(a0 - far))
	diff = maxf(-0.5, minf(0.5, diff))
	a0 = far + diff
	desc.sky_dir = [cos(a0), 0.0, sin(a0)]
	var R := 0.0
	for k in map.blocks:
		var bp := BL.parse(k)
		var px := BL.block_pos(bp[0])
		var pz := BL.block_pos(bp[1])
		R = maxf(R, cos(atan2(pz, px) - a0) * V.hypot(px, pz))
	var n := 30
	var cards := []
	var dots := []
	for i in n:
		var u := float(i) / (n - 1) - 0.5
		var core := 1 - absf(u) * 2
		var side := u * (R + 20) * 1.5
		var d := R + 10 + BL.hash3(i, 5, look) * 14
		var x := cos(a0) * d - sin(a0) * side
		var z := sin(a0) * d + cos(a0) * side
		var H := 10 + core * (14 + 34 * BL.hash3(i, 7, look))
		var W := 6 + BL.hash3(i, 9, look) * 9
		cards.append(V.compose([x, H / 2 - 14, z], 0, -a0, 0, [4.0, H + 14, W]))
		for k in 2:
			if BL.hash3(i, 11 + k, look) < 0.18:
				dots.append(V.compose([x - cos(a0) * 2.1, H - 3 - k * 4 - BL.hash3(i, k, 13) * 6, z - sin(a0) * 2.1 + (k - 0.5) * 2], 0, -a0, 0, [0.5, 0.6, 0.6]))
	desc.instances["skyline-cards@all"] = {"key": "skyline-cards", "lod": "all", "mats": cards, "tints": [], "custom": true}
	desc.instances["skyline-lights@all"] = {"key": "skyline-lights", "lod": "all", "mats": dots, "tints": [], "custom": true}


# ---------------------------------------------------------------- MAP-3 E2: street furniture (buildFurniture)

static var _aabbs := {}


## World box (x0, z0, x1, z1) of a build under a matrix (lit and glow parts).
static func box_of(full: String, mat: Array) -> Array:
	var bb = _aabbs.get(full)
	if bb == null:
		var ms = ModelPack.meshes_full(full)
		var ab := AABB()
		var first := true
		if ms != null:
			for s in ["lit", "glow"]:
				if ms[s] != null:
					var a: AABB = ms[s].get_aabb()
					ab = a if first else ab.merge(a)
					first = false
		bb = [ab.position.x, ab.position.y, ab.position.z, ab.end.x, ab.end.y, ab.end.z]
		_aabbs[full] = bb
	var x0 := INF
	var z0 := INF
	var x1 := -INF
	var z1 := -INF
	for cx in [bb[0], bb[3]]:
		for cy in [bb[1], bb[4]]:
			for cz in [bb[2], bb[5]]:
				var p := V.apply(mat, [cx, cy, cz])
				x0 = minf(x0, p[0])
				x1 = maxf(x1, p[0])
				z0 = minf(z0, p[2])
				z1 = maxf(z1, p[2])
	return [x0, z0, x1, z1]


func furn(key: String, size: float, x: float, y: float, z: float, yaw: float, tilt := 0.0, axis := "x", detail := false) -> void:
	var full := ModelPack.key_of(key, {"size": size, "jitter": 0})
	var mat := V.compose([x, y, z], tilt if axis == "x" else 0.0, yaw, tilt if axis == "z" else 0.0, 1, "YXZ")
	desc.furniture.append([key, x, y, z, yaw, tilt, axis, detail, full, mat])
	debug_items.append(box_of(full, mat))


func taken(x: float, z: float, r: float) -> bool:
	for b in debug_items:
		if x > b[0] - r and x < b[2] + r and z > b[1] - r and z < b[3] + r:
			return true
	return false


static func near_any(x: float, z: float, list: Array, r: float) -> bool:
	for p in list:
		if V.hypot(p.x - x, p.z - z) < r:
			return true
	return false


func build_furniture(rail: Dictionary, segs: Array, lamp_list: Array) -> void:
	debug_items = []
	var look: int = map.get("look", 0)
	var doors := []
	for id in layout:
		var L: Dictionary = layout[id]
		if L.get("plan") != null:
			doors.append(V.adds(V.adds(L.plan.c, L.plan.fwd, L.plan.edge + 1), L.plan.side, L.plan.lat))
		elif L.has("gates"):
			doors.append_array(L.gates)
	var door_near := func(x: float, z: float, r: float) -> bool:
		for d in doors:
			if V.hypot(d[0] - x, d[2] - z) < r:
				return true
		return false
	var ground := func(x: float, z: float) -> bool:
		return ground_ok(x, z) and slab_within(x, z, 0.2) and absf((z if rail.axis == "x" else x) - rail.c) > BL.RAIL_CLEAR + 2.2 and off_river(x, z, 2.2) and not door_near.call(x, z, 3.5)
	var on_road_ok := func(x: float, z: float) -> bool:
		return ground_ok(x, z) and absf((z if rail.axis == "x" else x) - rail.c) > BL.RAIL_CLEAR + 0.6 and off_river(x, z, 1.5)
	var lamp_near := func(x: float, z: float, r: float) -> bool: return near_any(x, z, lamp_list, r)
	build_river()
	var sr := Streets.street_runs(segs)
	var nodes: Array = sr.nodes
	var runs: Array = sr.runs
	var on_rail_n := func(n) -> bool: return absf(n.z - rail.c) < 0.01 if rail.axis == "x" else absf(n.x - rail.c) < 0.01
	var junctions := nodes.filter(func(n): return n.kind == "junction")
	var ave := BL.avenue_line(map)
	var on_ave := func(n) -> bool: return absf(n.z - ave.c) < 0.01 if ave.axis == "x" else absf(n.x - ave.c) < 0.01
	for i in junctions.size():
		var n: Dictionary = junctions[i]
		if on_rail_n.call(n):
			continue
		if not on_ave.call(n):
			for sxz in [[1, 1], [-1, -1]]:
				var x: float = n.x + sxz[0] * (BL.ROAD_KERB + 0.35)
				var z: float = n.z + sxz[1] * (BL.ROAD_WALK + 0.6)
				if ground.call(x, z) and n.dirs.has("+z" if sxz[1] > 0 else "-z"):
					furn("stop", 0.1, x, BL.GROUND, z, 0.0 if sxz[1] > 0 else PI)
			continue
		var dx0: float = n.x - (BL.ROAD_KERB + 0.35)
		var dz0: float = n.z + (BL.ROAD_WALK + 0.6)
		if ground.call(dx0, dz0):
			furn("dirsign", 0.1, dx0, BL.GROUND, dz0, PI / 4)
		for sxz in [[1, 1], [-1, -1]]:
			var x: float = n.x + sxz[0] * (BL.ROAD_KERB + 0.35)
			var z: float = n.z + sxz[1] * (BL.ROAD_WALK + 0.6)
			if not ground.call(x, z) or not n.dirs.has("+z" if sxz[1] > 0 else "-z"):
				continue
			var h := BL.hash3(i, sxz[0] + 5, rail.look)
			var state := "dead" if h < 0.65 else ("amber" if h < 0.85 else "red")
			furn("tlight-" + state, 0.1, x - sxz[0] * 0.8, BL.GROUND, z, atan2(sxz[0], 0) + PI / 2)
		var sx: float = n.x + (BL.ROAD_KERB + 0.35)
		var sz: float = n.z - (BL.ROAD_WALK + 0.6)
		if ground.call(sx, sz):
			furn("sign", 0.1, sx, BL.GROUND, sz, 0)
	for ri in runs.size():
		var r: Dictionary = runs[ri]
		var bus_stop := false
		var k := ceili((r.t0 - 2.25) / 9)
		while k * 9 + 2.25 <= r.t1:
			var t := k * 9 + 2.25
			k += 1
			var lat := BL.ROAD_WALK - 0.6
			var x: float = t if r.axis == "x" else r.c + lat
			var z: float = r.c + lat if r.axis == "x" else t
			if not ground.call(x, z) or near_any(x, z, nodes, 11) or lamp_near.call(x, z, 1.6):
				continue
			var h := BL.hash3(JS.round_(t), ri, rail.look + 13)
			var zone_here := BL.district_of(BL.grid_of(x), BL.grid_of(z), look)
			var kind = null
			if zone_here == "outskirts":
				kind = "postbox" if h < 0.15 else null
			else:
				kind = "hydrant" if h < 0.3 else ("bin" if h < 0.5 else ("postbox" if h < 0.6 else ("newsbox" if h < 0.7 else ("phone" if h < 0.74 else ("busstop" if h < 0.86 else null)))))
			var ave_run: bool = r.axis == ave.axis and absf(r.c - ave.c) < 0.01
			if kind == "busstop":
				if bus_stop or not ave_run:
					kind = "bin"
				else:
					bus_stop = true
			var dxz: Array = [0, -1] if r.axis == "x" else [-1, 0]
			if kind != null:
				furn("furn-" + kind, 0.1, x, BL.GROUND, z, atan2(dxz[0], dxz[1]))
			elif (zone_here == "residential" or zone_here == "outskirts" or (zone_here == "downtown" and h > 0.93)) and not taken(x, z, 1):
				furn("tree-street", 0.16, x, BL.GROUND, z, h * 9, 0, "x", true)
			var tc := t + 4.5
			var cx: float = tc if r.axis == "x" else r.c + lat
			var cz: float = r.c + lat if r.axis == "x" else tc
			var hc := BL.hash3(JS.round_(tc), ri, rail.look + 19)
			if hc < 0.3 and zone_here != "outskirts" and tc < r.t1 and ground.call(cx, cz) and not near_any(cx, cz, nodes, 11) and not lamp_near.call(cx, cz, 1.6):
				var ck := floori(BL.hash3(JS.round_(tc), 5, rail.look) * (CLUTTER_KINDS - 1))
				furn("clutter-%d" % ck, 0.12, cx, BL.GROUND, cz, hc * 20)
	# Power lines.
	var wires := []
	var live_poles := []
	var ins := [[-0.9, 6.55, -0.05], [0.0, 6.55, -0.05], [0.9, 6.55, -0.05]]
	var sag := func(a: Array, b: Array) -> void:
		for s2 in 10:
			var u := s2 / 10.0
			var v := (s2 + 1) / 10.0
			var span := V.dist(a, b)
			var pa := V.lerp(a, b, u)
			pa[1] -= sin(u * PI) * span * 0.05
			var pb := V.lerp(a, b, v)
			pb[1] -= sin(v * PI) * span * 0.05
			wires.append([pa, pb])
	var long := runs.filter(func(r): return not (r.axis == rail.axis and absf(r.c - rail.c) < 0.01))
	JS.sort(long, func(a, b):
		var d: float = (b.t1 - b.t0) - (a.t1 - a.t0)
		return d if d != 0 else a.c - b.c)
	long = long.slice(0, 2)
	for ri in long.size():
		var r: Dictionary = long[ri]
		var lat := -(BL.ROAD_KERB + 1.0)
		var dir_t: Array = [1.0, 0.0, 0.0] if r.axis == "x" else [0.0, 0.0, 1.0]
		var chain := []
		var flush := func() -> void:
			for i in chain.size():
				var p: Dictionary = chain[i]
				var q = chain[i + 1] if i + 1 < chain.size() else null
				if q != null and not p.down and not q.down:
					for k in 3:
						sag.call(p.ends[k], q.ends[k])
				if q != null and p.down != q.down:
					var st: Dictionary = q if p.down else p
					var fl: Dictionary = p if p.down else q
					for k in 3:
						var g := V.lerp(fl.base, st.base, 0.25 + k * 0.08)
						g[1] = BL.GROUND + 0.02
						sag.call(st.ends[k], g)
			var live := chain.filter(func(c): return not c.down)
			for e in [[live[0] if live.size() else null, -1], [live[live.size() - 1] if live.size() else null, 1]]:
				if e[0] == null or live.size() < 2:
					continue
				var anchor := V.adds(e[0].base, dir_t, e[1] * 2.6)
				anchor[1] = BL.GROUND
				var top: Array = e[0].ends[1].duplicate()
				top[1] -= 0.4
				wires.append([top, anchor])
			chain.clear()
		var k := ceili((r.t0 - 6) / 12)
		while k * 12 + 6 <= r.t1:
			var t := k * 12 + 6
			k += 1
			var x: float = t if r.axis == "x" else r.c + lat
			var z: float = r.c + lat if r.axis == "x" else t
			if not ground.call(x, z) or near_any(x, z, nodes, 7) or lamp_near.call(x, z, 2.4):
				flush.call()
				continue
			var h := BL.hash3(JS.round_(t), ri, rail.look + 17)
			var down: bool = h < 0.08 and not lamp_near.call(x, z, 8.5) and absf((z if r.axis == "x" else x) - rail.c) > 10 and not (r.axis != rail.axis and absf(t - rail.c) < 10)
			var lean := 0.0 if down else ((h - 0.19) * 0.5 if h < 0.3 else 0.0)
			var yaw := PI / 2 if r.axis == "x" else 0.0
			var tilt := PI / 2 - 0.08 if down else lean
			furn("pole", 0.1, x, BL.GROUND, z, yaw, tilt, "x")
			var mx := V.compose([x, BL.GROUND, z], tilt, yaw, 0, 1, "YXZ")
			var c := {"base": [x, BL.GROUND, z], "down": down, "ends": ins.map(func(v): return V.apply(mx, v))}
			chain.append(c)
			if not down:
				live_poles.append(c)
		flush.call()
	for hs in house_spots:
		var best = null
		var bd := 12.0
		for p in live_poles:
			var d := V.hypot(p.base[0] - hs.roof[0], p.base[2] - hs.roof[2])
			if d < bd:
				bd = d
				best = p
		if best != null:
			sag.call(best.ends[1], hs.roof)
	# The evacuation route.
	var e_axis: String = rail.axis
	var e_line := 0 if rail.r > 0 else 1
	var e_c := BL.block_pos(e_line) - BL.block_half(e_line)
	var e_runs := runs.filter(func(r): return r.axis == e_axis and absf(r.c - e_c) < 0.01)
	var truck := false
	var bus := false
	for r in e_runs:
		var dir: Array = [1, 0] if r.axis == "x" else [0, 1]
		var at := func(t: float, l: float) -> Array: return [t, r.c + l] if r.axis == "x" else [r.c + l, t]
		var yaw0 := 0.0 if r.axis == "x" else -PI / 2
		var t: float = r.t0 + BL.ROAD_WALK + 2.5
		while t < r.t1 - BL.ROAD_WALK - 2.5:
			var xz: Array = at.call(t, -BL.ROAD_HALF / 2)
			if not on_road_ok.call(xz[0], xz[1]) or absf(t) < 12 or door_near.call(xz[0], xz[1], 13):
				t += 4.4
				continue
			var h := BL.hash3(JS.round_(t * 3), 23, rail.look)
			var tt := t
			var arm_near := func(d0: float, d1: float) -> bool:
				for l in lamp_list:
					var lx: float = l.x if r.axis == "x" else l.z
					var lz: float = l.z if r.axis == "x" else l.x
					if lx > tt + d0 and lx < tt + d1 and absf(lz - r.c) < BL.ROAD_HALF + 1.5:
						return true
				return false
			if not bus and h < 0.12 and t + 9 < r.t1 - BL.ROAD_WALK - 2.5 and not arm_near.call(-3, 9):
				furn("veh-bus-%d" % (rail.look % 2), 0.15, xz[0] + dir[0] * 2.5, 0.05, xz[1] + dir[1] * 2.5, yaw0)
				bus = true
				t += 12
				continue
			if not truck and h > 0.88 and t + 13 < r.t1 - BL.ROAD_WALK and not arm_near.call(-3, 13):
				var cxz: Array = at.call(t + 11, -0.4)
				furn("veh-cab", 0.15, cxz[0], 0.05, cxz[1], yaw0 + 0.3)
				furn("veh-trailer", 0.15, xz[0] + dir[0] * 4.5, 0.05, xz[1] + dir[1] * 4.5, yaw0 - 0.12)
				truck = true
				t += 17
				continue
			if h < 0.82:
				var v := floori(BL.hash3(JS.round_(t), 29, rail.look) * 4)
				furn("car4-%d" % v, 0.15, xz[0], 0.0, xz[1], yaw0 + (h - 0.4) * 0.3)
			t += 4.4
	if e_runs.size():
		var r = null
		for q in e_runs:
			if q.t0 < 0 and q.t1 > 0:
				r = q
				break
		if r == null:
			r = e_runs[0]
		var t := minf(r.t1 - BL.ROAD_WALK - 3, maxf(r.t0 + BL.ROAD_WALK + 3, 14))
		var x: float = t if r.axis == "x" else r.c + BL.ROAD_HALF / 2
		var z: float = r.c + BL.ROAD_HALF / 2 if r.axis == "x" else t
		if on_road_ok.call(x, z):
			furn("checkpoint", 0.1, x, 0.03, z, 0.0 if r.axis == "x" else PI / 2)
	for r in e_runs:
		var k := ceili((r.t0 - 4.5) / 18)
		while k * 18 + 4.5 <= r.t1:
			var t := k * 18 + 4.5
			k += 1
			if absf(t) < 14:
				continue
			var x: float = t if r.axis == "x" else r.c + (BL.ROAD_WALK - 0.6)
			var z: float = r.c + (BL.ROAD_WALK - 0.6) if r.axis == "x" else t
			if not ground.call(x, z) or near_any(x, z, nodes, 9) or lamp_near.call(x, z, 1.6) or taken(x, z, 0.8):
				continue
			var toward := -1 if t > 0 else 1
			furn("safe", 0.1, x, BL.GROUND, z, (0.0 if toward > 0 else PI) if r.axis == "x" else (-PI / 2 if toward > 0 else PI / 2))
	if e_runs.size():
		var far := {"r": null, "t": 0.0}
		for r in e_runs:
			if absf(r.t1) > absf(far.t):
				far = {"r": r, "t": r.t1 - BL.ROAD_WALK - 4}
			elif absf(r.t0) > absf(far.t):
				far = {"r": r, "t": r.t0 + BL.ROAD_WALK + 4}
		if far.r != null and absf(far.t) > 30:
			var x: float = far.t if far.r.axis == "x" else far.r.c - BL.ROAD_HALF / 2
			var z: float = far.r.c - BL.ROAD_HALF / 2 if far.r.axis == "x" else far.t
			if on_road_ok.call(x, z) and not taken(x, z, 2):
				furn("checkpoint", 0.1, x, 0.03, z, 0.0 if far.r.axis == "x" else PI / 2)
	# The station.
	var cross = null
	for p in rail.get("pieces", []):
		if p[2] == "road" and absf((p[0] + p[1]) / 2 - ave.c) < 0.5:
			cross = p
			break
	if cross != null:
		var t: float = ave.c + BL.ROAD_WALK + 5.5
		var lat := 2.35
		var x: float = t if rail.axis == "x" else rail.c + lat
		var z: float = rail.c + lat if rail.axis == "x" else t
		furn("shelter", 0.1, x, BL.GROUND, z, PI if rail.axis == "x" else -PI / 2)
	# Strings of lights.
	for ri in runs.size():
		var r: Dictionary = runs[ri]
		if r.axis == ave.axis and absf(r.c - ave.c) < 0.01:
			continue
		var k := ceili((r.t0 - 13.5) / 27)
		while k * 27 + 13.5 <= r.t1:
			var t := k * 27 + 13.5
			k += 1
			var cx: float = t if r.axis == "x" else r.c
			var cz: float = r.c if r.axis == "x" else t
			if BL.hash3(JS.round_(t), ri, rail.look + 51) > 0.7 or near_any(cx, cz, nodes, 9):
				continue
			if maxi(absi(BL.grid_of(cx)), absi(BL.grid_of(cz))) > 1:
				continue
			var P := func(l: float, y: float) -> Array: return [t, y, r.c + l] if r.axis == "x" else [r.c + l, y, t]
			var a: Array = P.call(-(BL.ROAD_WALK + 0.4), BL.GROUND + 4.6)
			var b: Array = P.call(BL.ROAD_WALK + 0.4, BL.GROUND + 4.6)
			if not slab_within(a[0] - (0.0 if r.axis == "x" else 0.6), a[2] - (0.6 if r.axis == "x" else 0.0), 0.2) or not slab_within(b[0] + (0.0 if r.axis == "x" else 0.6), b[2] + (0.6 if r.axis == "x" else 0.0), 0.2):
				continue
			sag.call(a, b)
			for q in range(1, 10):
				var u := q / 10.0
				var p := V.lerp(a, b, u)
				p[1] -= sin(u * PI) * V.dist(a, b) * 0.05 + 0.08
				furn("bulb", 0.12, p[0], p[1], p[2], 0)
	# Crows; chimneys.
	crow_perches = []
	for i in house_spots.size():
		if BL.hash3(i, 7, rail.look) < 0.18:
			crow_perches.append(house_spots[i].roof.duplicate())
	for i in live_poles.size():
		if BL.hash3(i, 9, rail.look) < 0.25:
			crow_perches.append(V.add(live_poles[i].ends[0], [0.0, 0.15, 0.0]))
	crow_perches = crow_perches.slice(0, 40)
	var chimneys := []
	for k in landmarks:
		var lm: Dictionary = landmarks[k]
		if lm.kind == "powerplant":
			for lx in [-15, 13]:
				var v := V.mul([lx * 0.3, 47 * 0.3, -12 * 0.3], lm.scale)
				var cs := cos(lm.ry)
				var sn := sin(lm.ry)
				chimneys.append(V.add([v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs], lm.pos))
	for i in house_spots.size():
		if chimneys.size() < 5 and BL.hash3(i, 11, rail.look) < 0.08:
			chimneys.append(V.add(house_spots[i].roof, [0.0, 0.6, 0.0]))
	desc.fx.city_chimneys = chimneys
	for c in courtyards:
		if taken(c.p[0], c.p[2], 0.5):
			continue
		furn("camp" if c.what == "camp" else "laundry", 0.1, c.p[0], BL.GROUND, c.p[2], c.face)
	_places_on_street(ground, on_road_ok, lamp_list, sag, junctions, on_ave, on_rail_n)
	_stories(runs, rail, e_axis, e_c, on_road_ok, ground, lamp_list, doors, nodes, junctions)
	desc.meshes["wires@near"] = [{"lines": wires}]


func _place_type(L: Dictionary) -> String:
	for k in map.blocks:
		if map.blocks[k].get("placeId") == L.id:
			return map.blocks[k].get("type", L.id)
	return L.id


## Places belong to their street: aprons, parked vehicles, signs, generators; then the avenue signs.
func _places_on_street(ground: Callable, on_road_ok: Callable, lamp_list: Array, sag: Callable, junctions: Array, on_ave: Callable, on_rail_n: Callable) -> void:
	var front := func(L: Dictionary, along: float, out: float) -> Array: return V.adds(V.adds(L.plan.c, L.plan.fwd, L.plan.edge + out), L.plan.side, L.plan.lat + along)
	var yaw_along := func(L: Dictionary) -> float: return atan2(L.plan.side[0], L.plan.side[2]) - PI / 2
	var parked := []
	var lamp_near := func(x: float, z: float, r: float) -> bool: return near_any(x, z, lamp_list, r)
	for id in layout:
		var L: Dictionary = layout[id]
		if L.get("plan") == null:
			continue
		var type := _place_type(L)
		var half: float = (L.plan.fw * BL.CHUNK) / 2
		var yaw_f := atan2(L.plan.fwd[0], L.plan.fwd[2])
		var kerb_lane := (BL.ROAD_WALK - BL.ROAD_HALF) + 1.2
		var park := func(key: String, along: float, i := 0, room := 5.2) -> void:
			var p = null
			for d in [0, 3, -3, 6, -6, 9, -9]:
				var q: Array = front.call(L, along + d, kerb_lane)
				var e1: Array = front.call(L, along + d - room / 2, kerb_lane)
				var e2: Array = front.call(L, along + d + room / 2, kerb_lane)
				if off_river(q[0], q[2], 2) and on_road_ok.call(q[0], q[2]) and on_road_ok.call(e1[0], e1[2]) and on_road_ok.call(e2[0], e2[2]) and not lamp_near.call(q[0], q[2], room) and not parked.any(func(o): return V.dist(o, q) < 5.5):
					p = q
					break
			if p == null:
				return
			parked.append(p)
			furn(key, 0.15, p[0], 0.05, p[2], yaw_along.call(L) + i * 0.04)
		if type == "gas" or type == "grocery" or type == "hospital":
			for a in ([-half + 2, half - 2] if type == "gas" else [half - 2.2]):
				var p: Array = front.call(L, a, 1.25)
				furn("apron", 0.1, p[0], BL.GROUND - 0.06, p[2], yaw_f)
		if type == "hospital":
			park.call("veh-ambulance", half - 2.2)
			park.call("veh-ambulance", -half + 3, 1)
		if type == "police":
			park.call("veh-police", -half + 2.5)
			park.call("veh-police", half - 2.5, 1)
			for a in [-3.4, 3.4]:
				var p: Array = front.call(L, a, 1.6)
				furn("clutter-4", 0.12, p[0], BL.GROUND, p[2], yaw_f + PI / 2)
		if type == "school":
			park.call("veh-bus-1", 0.0, 0, 7.0)
		if type == "library" and L.plan.fw >= 2:
			var p: Array = front.call(L, half - 1.5, 1.3)
			furn("statue", 0.1, p[0], BL.GROUND, p[2], yaw_f)
		if L.plan.fw >= 2 and type != "library":
			var y := Content.yields_of(type)
			var show := [["woodpile", y.wood], ["scrapheap", y.metal], ["crates", y.food]].filter(func(e): return e[1]).slice(0, 2)
			for n in show.size():
				var p: Array = front.call(L, (-1 if n else 1) * (half - 1.1), 1.1)
				if not taken(p[0], p[2], 0.6) and not lamp_near.call(p[0], p[2], 1.5):
					furn(show[n][0], 0.1, p[0], BL.GROUND, p[2], yaw_f + PI / 2)
		if L.plan.fw >= 2 and type != "gas" and type != "grocery" and type != "hospital":
			var p: Array = front.call(L, 0.0, 1.25)
			furn("apron", 0.1, p[0], BL.GROUND - 0.06, p[2], yaw_f)
		var name = PLACE_NAMES.get(type)
		var lit := GENERATOR.has(type)
		var free_at := func(p: Array, r: float) -> bool: return ground.call(p[0], p[2]) and not taken(p[0], p[2], r) and not lamp_near.call(p[0], p[2], 1.6)
		if name != null:
			for a in [half + 0.8, -(half + 0.8)]:
				var p: Array = front.call(L, a, 1.6)
				if free_at.call(p, 0.9):
					furn("name-" + type, 0.1, p[0], BL.GROUND, p[2], yaw_f)
					break
		if lit:
			for a in [-(half + 0.9), half + 0.9]:
				var p: Array = front.call(L, a, 0.5)
				if not free_at.call(p, 0.8):
					continue
				furn("generator", 0.1, p[0], BL.GROUND, p[2], yaw_f + PI / 2)
				var wall: Array = front.call(L, signf(a) * (half - 0.5), -0.4)
				wall[1] = BL.GROUND + 1.8
				sag.call([p[0], BL.GROUND + 0.7, p[2]], wall)
				break
		if type == "gas":
			for e in [[-half - 3.5, 0], [-half - 8, 1], [-half - 12.5, 2]]:
				park.call("car4-%d" % e[1], e[0], e[1], 4.4)
	var ave_j := junctions.filter(func(n): return on_ave.call(n) and not on_rail_n.call(n))
	for id in layout:
		var L: Dictionary = layout[id]
		if L.get("plan") == null:
			continue
		var type := _place_type(L)
		if not PLACE_NAMES.has(type):
			continue
		var best = null
		var bd := 70.0
		for n in ave_j:
			var d := V.hypot(n.x - L.center[0], n.z - L.center[2])
			if d < bd and d > 14:
				bd = d
				best = n
		if best == null:
			continue
		var dx: float = L.center[0] - best.x
		var dz: float = L.center[2] - best.z
		var yaw: float = (0.0 if dx > 0 else PI) if absf(dx) > absf(dz) else (-PI / 2 if dz > 0 else PI / 2)
		for sxz in [[-1, 1], [1, -1], [-1, -1], [1, 1]]:
			var x: float = best.x + sxz[0] * (BL.ROAD_KERB + 0.5)
			var z: float = best.z + sxz[1] * (BL.ROAD_WALK + 2.8)
			if not ground.call(x, z) or taken(x, z, 1.2):
				continue
			furn("dsign-" + type, 0.1, x, BL.GROUND, z, yaw)
			break


## Small stories, the downtown damage, kerb cars, the rim barriers and field fences.
func _stories(runs: Array, rail: Dictionary, e_axis: String, e_c: float, on_road_ok: Callable, ground: Callable, lamp_list: Array, doors: Array, nodes: Array, junctions: Array) -> void:
	var look: int = map.get("look", 0)
	var entrances := []
	for id in layout:
		var L: Dictionary = layout[id]
		if L.get("plan") != null:
			entrances.append(V.adds(V.adds(L.plan.c, L.plan.fwd, L.plan.edge + 1), L.plan.side, L.plan.lat + 0))
		elif L.has("gates"):
			entrances.append_array(L.gates)
	var lamp_near := func(x: float, z: float, r: float) -> bool: return near_any(x, z, lamp_list, r)
	var clear := func(x: float, z: float, road := false) -> bool:
		if not (on_road_ok.call(x, z) if road else ground.call(x, z)):
			return false
		for e in entrances:
			if V.hypot(e[0] - x, e[2] - z) < 7:
				return false
		return not taken(x, z, 1.5) and not lamp_near.call(x, z, 2.5)
	var ring_of_t := func(r: Dictionary, t: float) -> int:
		var x: float = t if r.axis == "x" else r.c
		var z: float = r.c if r.axis == "x" else t
		return maxi(absi(BL.grid_of(x)), absi(BL.grid_of(z)))
	for st in range(1, map.get("stage", 1) + 1):
		for k in 2:
			var h := BL.hash3(st, k, rail.look + 31)
			if k == 1 and h < 0.5:
				continue
			var pool := runs.filter(func(r): return not (r.axis == e_axis and absf(r.c - e_c) < 0.01) and not (r.axis == rail.axis and absf(r.c - rail.c) < 0.01))
			if pool.is_empty():
				break
			var r: Dictionary = pool[floori(BL.hash3(st, k, rail.look + 37) * pool.size())]
			var t: float = r.t0 + BL.ROAD_WALK + 4 + BL.hash3(st, k, 41) * maxf(0.0, r.t1 - r.t0 - 2 * BL.ROAD_WALK - 8)
			if ring_of_t.call(r, t) != st and st > 1:
				continue
			var at := func(l: float) -> Array: return [t, r.c + l] if r.axis == "x" else [r.c + l, t]
			var yaw := 0.0 if r.axis == "x" else PI / 2
			var kind := floori(BL.hash3(st, k, rail.look + 43) * 4)
			if kind == 0:
				var xz: Array = at.call(-0.8)
				if not clear.call(xz[0], xz[1], true) or not off_river(xz[0], xz[1], 6) or absf((xz[1] if rail.axis == "x" else xz[0]) - rail.c) < BL.RAIL_CLEAR + 6:
					continue
				furn("tree-1", 0.25, xz[0], 0.3, xz[1], yaw, PI / 2 - 0.05, "z")
			elif kind == 1:
				var xz: Array = at.call(1.4)
				if not clear.call(xz[0], xz[1], true):
					continue
				var v := floori(h * 4)
				furn("car-burnt-%d" % v, 0.15, xz[0], 0.0, xz[1], yaw + 0.4)
			elif kind == 2:
				for e in [[0, -2.5], [1, 1.5]]:
					var x: float = t + e[1] if r.axis == "x" else r.c + (BL.ROAD_WALK - 1.2)
					var z: float = r.c + (BL.ROAD_WALK - 1.2) if r.axis == "x" else t + e[1]
					if clear.call(x, z):
						furn("tent-%d" % e[0], 0.1, x, BL.GROUND, z, yaw + e[0] * 0.3)
			else:
				for i in 5:
					var x: float = t + (i - 2) * 0.9 if r.axis == "x" else r.c + BL.ROAD_WALK - 1 - BL.hash3(i, st, 47)
					var z: float = r.c + BL.ROAD_WALK - 1 - BL.hash3(i, st, 47) if r.axis == "x" else t + (i - 2) * 0.9
					if clear.call(x, z):
						var c: int = [1, 2, 3][i % 3]
						furn("clutter-%d" % c, 0.12, x, BL.GROUND, z, i * 1.3)
	var door_near := func(x: float, z: float, r: float) -> bool:
		for d in doors:
			if V.hypot(d[0] - x, d[2] - z) < r:
				return true
		return false
	var down_at := func(x: float, z: float) -> bool: return BL.district_of(BL.grid_of(x), BL.grid_of(z), look) == "downtown"
	for ri in runs.size():
		var r: Dictionary = runs[ri]
		var k := ceili((r.t0 - 6.5) / 13)
		while k * 13 + 6.5 <= r.t1:
			var t := k * 13 + 6.5
			k += 1
			for sgn in [1, -1]:
				var lat: float = sgn * (BL.ROAD_HALF - 0.65)
				var x: float = t if r.axis == "x" else r.c + lat
				var z: float = r.c + lat if r.axis == "x" else t
				var sx: float = t if r.axis == "x" else r.c + sgn * (BL.ROAD_WALK + 2)
				var sz: float = r.c + sgn * (BL.ROAD_WALK + 2) if r.axis == "x" else t
				if not down_at.call(sx, sz) or BL.hash3(JS.round_(t), ri * 2 + (1 if sgn > 0 else 0), rail.look + 61) > 0.6:
					continue
				if not on_road_ok.call(x, z) or absf((z if rail.axis == "x" else x) - rail.c) < BL.RAIL_CLEAR + 5 or near_any(x, z, nodes, 9) or taken(x, z, 1.4) or door_near.call(x, z, 5):
					continue
				var v := floori(BL.hash3(JS.round_(t), 63, ri) * 2)
				furn("heap-%d" % v, 0.1, x, 0.0, z, 0.0 if r.axis == "x" else PI / 2)
	var on_rail_n := func(n) -> bool: return absf(n.z - rail.c) < 0.01 if rail.axis == "x" else absf(n.x - rail.c) < 0.01
	for i in junctions.size():
		var n: Dictionary = junctions[i]
		if on_rail_n.call(n) or BL.hash3(i, 65, rail.look) > 0.4:
			continue
		for sxz in [[1, -1], [-1, 1]]:
			var x: float = n.x + sxz[0] * (BL.ROAD_KERB + 0.6)
			var z: float = n.z + sxz[1] * (BL.ROAD_WALK + 2.6)
			if not down_at.call(x, z) or not ground.call(x, z) or taken(x, z, 1.9):
				continue
			furn("sandbags", 0.1, x, BL.GROUND, z, PI / 2)
			break
	for ri in runs.size():
		var r: Dictionary = runs[ri]
		var k := ceili((r.t0 - 3.75) / 7.5)
		while k * 7.5 + 3.75 <= r.t1:
			var t := k * 7.5 + 3.75
			k += 1
			for sgn in [1, -1]:
				var x: float = t if r.axis == "x" else r.c + sgn * (BL.ROAD_HALF - 0.95)
				var z: float = r.c + sgn * (BL.ROAD_HALF - 0.95) if r.axis == "x" else t
				var sx: float = t if r.axis == "x" else r.c + sgn * (BL.ROAD_WALK + 2)
				var sz: float = r.c + sgn * (BL.ROAD_WALK + 2) if r.axis == "x" else t
				var dz := BL.district_of(BL.grid_of(sx), BL.grid_of(sz), look)
				if (dz != "downtown" and dz != "residential") or BL.hash3(JS.round_(t), ri * 2 + (1 if sgn > 0 else 0), rail.look + 71) > 0.24:
					continue
				if not on_road_ok.call(x, z) or absf((z if rail.axis == "x" else x) - rail.c) < BL.RAIL_CLEAR + 5 or near_any(x, z, nodes, 10) or taken(x, z, 1.6) or door_near.call(x, z, 5) or lamp_near.call(x, z, 3.5):
					continue
				var v := floori(BL.hash3(JS.round_(t), 73, ri) * 4)
				furn("car4-%d" % v, 0.15, x, 0.0, z, (0.0 if r.axis == "x" else -PI / 2) + (0.0 if sgn > 0 else PI), 0, "x", true)
	for n in nodes:
		if n.kind != "end":
			continue
		var d: String = n.dirs.keys()[0]
		var ax := d[1]
		var sg := 1 if d[0] == "+" else -1
		var off := func(k: float) -> Array: return [n.x - sg * k, n.z] if ax == "x" else [n.x, n.z - sg * k]
		var o1: Array = off.call(1)
		if ground_ok(o1[0], o1[1]):
			continue
		for k in [-4.5, -6.0, -7.5]:
			var xz: Array = off.call(k)
			if on_road_ok.call(xz[0], xz[1]) and not taken(xz[0], xz[1], 1.5):
				furn("barrier", 0.1, xz[0], 0.0, xz[1], PI / 2 if ax == "x" else 0.0, 0, "x", true)
				break
	for key in map.blocks:
		var bp := BL.parse(key)
		var bx: int = bp[0]
		var bz: int = bp[1]
		if BL.district_of(bx, bz, look) != "outskirts":
			continue
		for d in [[1, 0], [-1, 0], [0, 1], [0, -1]]:
			if has_block(bx + d[0], bz + d[1]) or BL.hash3(bx * 3 + d[0], 107, bz * 3 + d[1]) > 0.4:
				continue
			var rim_c: float = BL.block_pos(bx) + d[0] * (BL.block_half(bx) - 3) if d[0] else BL.block_pos(bz) + d[1] * (BL.block_half(bz) - 3)
			var t := (BL.block_pos(bz) if d[0] else BL.block_pos(bx)) + (BL.hash3(bx, 109, bz) - 0.5) * 8
			var x: float = rim_c - d[0] * 3.1 if d[0] else t
			var z: float = t if d[0] else rim_c - d[1] * 3.1
			if ground.call(x, z) and not taken(x, z, 3.2):
				furn("fence-rail", 0.1, x, BL.GROUND, z, 0.0 if d[0] else PI / 2, 0, "x", true)


# ---------------------------------------------------------------- MAP-6: the frozen river

func build_river() -> void:
	var rv := rail_of(BL.river_line(map))
	if rv.pieces.is_empty():
		return
	var m := {"pos": [], "nrm": [], "col": [], "idx": [], "computed_normals": true}
	var quad := func(t0: float, t1: float, l0: float, l1: float, y: float, c: Array) -> void:
		var n: int = m.pos.size()
		for tl in [[t0, l0], [t1, l0], [t1, l1], [t0, l1]]:
			m.pos.append([tl[0], y, rv.c + tl[1]] if rv.axis == "x" else [rv.c + tl[1], y, tl[0]])
			m.col.append(c)
		m.idx.append_array([n, n + 2, n + 1, n, n + 3, n + 2] if rv.axis == "x" else [n, n + 1, n + 2, n, n + 2, n + 3])
	var ice := Ground.lin(0x7f97a8)
	var deep := Ground.lin(0x5f798c)
	var crack := Ground.lin(0xd7e4ee)
	var bank := Ground.lin(Ground.P_SNOW)
	var W := 2.6
	for pc in rv.pieces:
		var t0: float = pc[0]
		var t1: float = pc[1]
		var kind: String = pc[2]
		var y0: float = pc[3]
		if kind == "road":
			for s2 in [-1, 1]:
				var mid: float = (t0 + t1) / 2 + s2 * (BL.ROAD_HALF + 0.45)
				var lx: float = mid if rv.axis == "x" else rv.c + 3.0 * s2
				var lz: float = rv.c + 3.0 * s2 if rv.axis == "x" else mid
				furn("lamp-bridge", 0.1, lx, BL.GROUND, lz, (PI if s2 > 0 else 0.0) if rv.axis == "x" else (PI / 2 if s2 > 0 else -PI / 2))
			var ave_r := BL.avenue_line(map)
			var kind2 := "parapet"
			if ave_r.axis != rv.axis and absf((t0 + t1) / 2 - ave_r.c) < 0.6:
				kind2 = "truss"
			for s2 in [-1, 1]:
				var mid: float = (t0 + t1) / 2 + s2 * (BL.ROAD_HALF + 0.45)
				if rv.axis == "x":
					furn(kind2, 0.1, mid, BL.GROUND, rv.c, PI / 2)
				else:
					furn(kind2, 0.1, rv.c, BL.GROUND, mid, 0)
			continue
		var y := y0 + 0.03
		quad.call(t0, t1, -W, W, y, ice)
		quad.call(t0, t1, -0.8, 0.9, y + 0.004, deep)
		var t := t0 + 0.6
		while t < t1 - 1.6:
			var h := BL.hash3(JS.round_(t * 3), 81, rv.look)
			if h < 0.5:
				quad.call(t, t + 1 + h, -1.6 + h * 2.4, -1.5 + h * 2.4, y + 0.008, crack)
			t += 1.7
		t = t0 + 2
		while t < t1 - 2:
			var h := BL.hash3(JS.round_(t * 3), 85, rv.look)
			if h < 0.45:
				quad.call(t, t + 0.35, -W + 0.4, W - 0.4 - h, y + 0.07, crack)
			t += 4.3
		if kind == "slab" and t1 - t0 > 12:
			var h := BL.hash3(JS.round_(t0), 87, rv.look)
			var at := func(tt: float, l: float) -> Array: return [tt, rv.c + l] if rv.axis == "x" else [rv.c + l, tt]
			if h < 0.35:
				var p: Array = at.call(t0 + 4 + h * 6, -0.6)
				furn("boat", 0.1, p[0], y0 + 0.02, p[1], 0.3 if rv.axis == "x" else PI / 2 + 0.3, 0.08, "z")
			elif h < 0.7:
				var p: Array = at.call(t0 + 5 + h * 4, 0.5)
				furn("fishing", 0.1, p[0], y0 + 0.04, p[1], h * 6)
		for sgn in [-1, 1]:
			var tb := t0
			while tb < t1 - 0.01:
				var h := BL.hash3(JS.round_(tb * 5), 83 + sgn, rv.look)
				quad.call(tb, minf(t1, tb + 1.2), sgn * (W - 0.1 - h * 0.5), sgn * (W + 0.5), y + 0.05 + h * 0.06, bank)
				tb += 1.2
	add_mesh("river", "all", m)
