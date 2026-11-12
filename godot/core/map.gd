## src/core/map.js: the city grid, its streets and how it grows (MAP-1 … MAP-11), search spots (GAME-1).
class_name CityMap
extends RefCounted

const ORIGINALS := ["library", "hospital", "police", "school"]
const OLD_FRONT := {"police": "z", "grocery": "z", "school": "z", "hospital": "x", "library": "x", "gas": "x"}

static var START_MAP: Dictionary = _start_map(false)
static var LEGACY_MAP: Dictionary = _start_map(true)
static var _caches: Dictionary = {}
static var _last_roads: Array = []
static var _last_c: Dictionary = {}


static func key(x, z) -> String:
	return "%d,%d" % [x, z]


static func parse(k: String) -> Array:
	var p := k.split(",")
	return [int(p[0]), int(p[1])]


static func ring(x: int, z: int) -> int:
	return maxi(absi(x), absi(z))


static func _start_roads() -> Array:
	var r := []
	for c in [0, 1]:
		for i in range(-1, 2):
			r.append("%d,%d,v" % [c, i])
			r.append("%d,%d,h" % [i, c])
	return r


static func _start_map(legacy: bool) -> Dictionary:
	var blocks := {}
	if legacy:
		blocks = {
			"0,0": {"kind": "colony", "placeId": "colony"},
			"0,-1": {"kind": "place", "placeId": "police"}, "1,-1": {"kind": "place", "placeId": "grocery"},
			"1,0": {"kind": "place", "placeId": "school"}, "0,1": {"kind": "place", "placeId": "hospital"},
			"-1,0": {"kind": "place", "placeId": "library"}, "-1,-1": {"kind": "place", "placeId": "gas"},
			"1,1": {"kind": "parking"}, "-1,1": {"kind": "containers"},
		}
	else:
		blocks = {
			"0,0": {"kind": "colony", "placeId": "colony"},
			"1,-1": {"kind": "place", "placeId": "grocery"}, "-1,-1": {"kind": "place", "placeId": "gas"},
			"0,-1": {"kind": "shops"}, "1,0": {"kind": "parking"}, "0,1": {"kind": "ruins"},
			"-1,0": {"kind": "plaza"}, "1,1": {"kind": "containers"}, "-1,1": {"kind": "park"},
		}
	var roads := _start_roads()
	var set := as_set(roads)
	for k in blocks:
		var b: Dictionary = blocks[k]
		if b.kind != "colony":
			var p := parse(k)
			b.front = OLD_FRONT[b.placeId] if b.has("placeId") and OLD_FRONT.has(b.placeId) else front_of(set, p[0], p[1])
	return {"stage": 1, "blocks": blocks, "roads": roads, "searchesSinceMap": 0, "pending": false}


static func as_set(arr: Array) -> Dictionary:
	var d := {}
	for x in arr:
		d[x] = true
	return d


static func new_map(legacy := false) -> Dictionary:
	return (LEGACY_MAP if legacy else START_MAP).duplicate(true)


static func map_of(s: Dictionary) -> Dictionary:
	return s.map if s.get("map") != null else LEGACY_MAP


static func map_places(m: Dictionary) -> Array:
	var out := []
	for k in m.blocks:
		if m.blocks[k].has("placeId"):
			out.append(m.blocks[k].placeId)
	return out


static func map_range(stage: int) -> Array:
	return [3, 4] if stage == 1 else [3 * stage * stage + 2, 4 * stage * stage + 4]


# ---------------------------------------------------------------- places

static func type_of(s: Dictionary, id: String) -> String:
	var loc = s.get("locations", {}).get(id)
	if loc != null and loc.has("type"):
		return loc.type
	return id


static func loc_def(s: Dictionary, id: String) -> Dictionary:
	return Content.LOCATIONS.get(type_of(s, id), Content.LOCATIONS.grocery)


static func places_of(s: Dictionary) -> Array:
	return s.locations.keys()


static func outside_of(s: Dictionary) -> Array:
	return s.locations.keys().filter(func(l): return l != "colony")


static func block_of(s: Dictionary, id: String):
	return _cache(map_of(s)).index.get(id, null)


static func ring_of(s: Dictionary, id: String) -> int:
	var k = block_of(s, id)
	if k == null:
		return 1
	var p := parse(k)
	return ring(p[0], p[1])


# ---------------------------------------------------------------- roads

static func seg_ends(seg: String) -> Array:
	var p := seg.split(",")
	var a := [int(p[0]), int(p[1])]
	return [a, [a[0] + 1, a[1]] if p[2] == "h" else [a[0], a[1] + 1]]


static func seg_key(a: Array, b: Array) -> String:
	if a[0] == b[0]:
		return "%d,%d,v" % [a[0], mini(a[1], b[1])]
	return "%d,%d,h" % [mini(a[0], b[0]), a[1]]


static func corners_of(bx: int, bz: int) -> Array:
	return [[bx, bz], [bx + 1, bz], [bx, bz + 1], [bx + 1, bz + 1]]


static func sides_of(bx: int, bz: int) -> Array:
	return ["%d,%d,h" % [bx, bz], "%d,%d,h" % [bx, bz + 1], "%d,%d,v" % [bx, bz], "%d,%d,v" % [bx + 1, bz]]


## Derived data (street graph, place index, distances), cached by the map's content (states are cloned per action).
static func _cache(m: Dictionary) -> Dictionary:
	if is_same(m.roads, _last_roads):
		return _last_c
	var spots: Dictionary = m.get("spots", {}) if m.get("spots") != null else {}
	var k := "%d|%s|%s" % [m.stage, ";".join(PackedStringArray(m.roads)), ";".join(PackedStringArray(spots.keys()))]
	var c = _caches.get(k)
	if c == null:
		var graph := {}
		for seg in m.roads:
			var e := seg_ends(seg)
			var a := key(e[0][0], e[0][1])
			var b := key(e[1][0], e[1][1])
			if not graph.has(a):
				graph[a] = []
			if not graph.has(b):
				graph[b] = []
			graph[a].append(b)
			graph[b].append(a)
		var index := {}
		for bk in m.blocks:
			var bl: Dictionary = m.blocks[bk]
			index[bl.get("placeId", bk)] = bk
		for id in spots:
			index[id] = spots[id].block
		c = {"graph": graph, "index": index, "dists": {}}
		_caches[k] = c
		if _caches.size() > 8:
			_caches.erase(_caches.keys()[0])
	_last_roads = m.roads
	_last_c = c
	return c


## Street distance in segments between two sets of corners (INF if cut off).
static func road_steps(g: Dictionary, from: Array, to: Array) -> float:
	var goal := {}
	for p in to:
		goal[key(p[0], p[1])] = true
	var frontier := []
	for p in from:
		var k := key(p[0], p[1])
		if g.has(k) or goal.has(k):
			frontier.append(k)
	var seen := as_set(frontier)
	var d := 0
	while frontier.size():
		for k in frontier:
			if goal.has(k):
				return d
		var nxt := []
		for k in frontier:
			for n in g.get(k, []):
				if not seen.has(n):
					seen[n] = true
					nxt.append(n)
		frontier = nxt
		d += 1
	return INF


# ---------------------------------------------------------------- GAME-1: search spots

static func is_spot(s: Dictionary, id: String) -> bool:
	var m = s.get("map")
	return m != null and m.get("spots") != null and m.spots.has(id)


## xorshift for spots (off the game's RNG).
static func spot_rand(seed: int) -> Callable:
	var st := [JS.i32(seed)]
	if st[0] == 0:
		st[0] = 1
	return func() -> float:
		var x: int = st[0]
		x = JS.i32(x ^ JS.shl(x, 13))
		x = JS.i32(x ^ JS.ushr(x, 17))
		x = JS.i32(x ^ JS.shl(x, 5))
		st[0] = x
		return float(JS.u32(x) % 1000000) / 1e6


static func spot_kind(b: Dictionary, zone: String, r: float) -> String:
	if b.kind == "containers" or b.kind == "rail" or zone == "industrial":
		return "spot-container" if r < 0.6 else "spot-car"
	if b.kind == "parking":
		return "spot-car"
	return "spot-house" if r < 0.75 else "spot-car"


## make_spot(type, block_key, i, rand) -> new location id.
static func add_spots(s: Dictionary, keys: Array, count: int, make_spot: Callable) -> Array:
	var m = s.get("map")
	if m == null:
		return []
	if m.get("spots") == null:
		m.spots = {}
	var look: int = m.get("look", 0)
	var rand := spot_rand(look * 7919 + m.stage * 104729 + keys.size())
	var free := keys.filter(func(k): return m.blocks.has(k) and m.blocks[k].kind != "place" and m.blocks[k].kind != "colony")
	var out := []
	var n := 0
	while n < count and free.size():
		var k: String = free.pop_at(floori(rand.call() * free.size()))
		var i := 0
		for id in m.spots:
			if m.spots[id].block == k:
				i += 1
		var p := parse(k)
		var type := spot_kind(m.blocks[k], Zones.zone_of(p[0], p[1], look), rand.call())
		var id: String = make_spot.call(type, k, i, rand)
		m.spots[id] = {"block": k, "kind": type, "i": i}
		out.append(id)
		n += 1
	return out


## Road distance between two places, in blocks (1 = next door).
static func road_distance(s: Dictionary, from: String, to: String) -> int:
	if from == to:
		return 0
	var m := map_of(s)
	var a = block_of(s, from)
	var b = block_of(s, to)
	if a == null or b == null:
		return 2
	var c := _cache(m)
	var mk: String = (a + "|" + b) if a < b else (b + "|" + a)
	var d = c.dists.get(mk)
	if d == null:
		var pa := parse(a)
		var pb := parse(b)
		d = road_steps(c.graph, corners_of(pa[0], pa[1]), corners_of(pb[0], pb[1]))
		c.dists[mk] = d
	if is_finite(d):
		return 1 + int(d)
	var q := parse(b)
	return 2 + ring(q[0], q[1])


# ---------------------------------------------------------------- growth

static func _pick_weighted(s: Dictionary, entries: Array):
	var total := 0.0
	for e in entries:
		total += e[1]
	var r := Rng.random(s) * total
	for e in entries:
		r -= e[1]
		if r < 0:
			return e[0]
	return entries[0][0]


static func _tier_ok(t: String, n: int) -> bool:
	var rule = Content.PLACE_RULES.get(t)
	var tier = rule.tier if rule != null else null
	return Content.TIER_STAGE.get(str(tier), 1) <= n


static func _fits(t: String, k: String, n: int, look: int) -> bool:
	if not _tier_ok(t, n):
		return false
	var rule = Content.PLACE_RULES.get(t)
	if rule == null:
		return true
	var p := parse(k)
	return rule.zones.has(Zones.zone_of(p[0], p[1], look))


## Grow the map one stage. make_place(type, block) -> place id. Returns the new block keys.
static func grow_map(s: Dictionary, make_place: Callable) -> Array:
	if s.get("map") == null:
		s.map = new_map(true)
	var m: Dictionary = s.map
	var n: int = m.stage + 1
	var added := []
	# 1. The ring.
	var ring_blocks := []
	for x in range(-n, n + 1):
		for z in range(-n, n + 1):
			if ring(x, z) == n and not m.blocks.has(key(x, z)):
				ring_blocks.append([x, z])
	var keep := {}
	for p in ring_blocks:
		var corner: bool = absi(p[0]) == n and absi(p[1]) == n
		if Rng.random(s) >= (0.45 if corner else 0.18):
			keep[key(p[0], p[1])] = true
	var placed := as_set(m.blocks.keys())
	var changed := true
	while changed:
		changed = false
		for k in keep.keys():
			if placed.has(k):
				continue
			var p := parse(k)
			for a in [[p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]]:
				if placed.has(key(a[0], a[1])):
					placed[k] = true
					added.append(k)
					changed = true
					break
	# 2. Pokes.
	var pokes := 1 + floori(Rng.random(s) * 3)
	var ring_added := added.duplicate()
	for i in pokes:
		var idx := floori(Rng.random(s) * ring_added.size())
		if idx >= ring_added.size():
			break
		var p := parse(ring_added[idx])
		var out: Array = [p[0] + signi(p[0]), p[1]] if absi(p[0]) >= absi(p[1]) else [p[0], p[1] + signi(p[1])]
		var ok := key(out[0], out[1])
		if not placed.has(ok):
			placed[ok] = true
			added.append(ok)
	# 3. Streets.
	for k in added:
		m.blocks[k] = {"kind": "pending"}
	m.stage = n
	_grow_roads(s, m, added, n)
	# 4. Kinds.
	var n_places: int = mini(added.size(), 2 + (1 if Rng.random(s) < 0.5 else 0))
	var have := {}
	for bk in m.blocks:
		var bl: Dictionary = m.blocks[bk]
		var t = bl.get("type", bl.get("placeId"))
		have[t] = true
	var missing := ORIGINALS.filter(func(t): return not have.has(t)).slice(0, 2)
	var graph: Dictionary = _cache(m).graph
	var look: int = m.get("look", 0)
	var dist := {}
	for k in added:
		var p := parse(k)
		dist[k] = road_steps(graph, corners_of(0, 0), corners_of(p[0], p[1])) + Rng.random(s) * 0.5
	var by_dist := JS.sort(added.duplicate(), func(a, b): return dist[a] - dist[b])
	var places_at := {}
	while missing.size() and n_places:
		var free := by_dist.filter(func(k): return not places_at.has(k))
		var k = null
		for b in free:
			if _fits(missing[0], b, n, look) and dist[b] <= dist[free[0]] + 1:
				k = b
				break
		if k == null:
			k = free[0] if free.size() else null
		if k == null:
			break
		places_at[k] = true
		var pid = make_place.call(missing[0], k)
		m.blocks[k] = {"kind": "place", "placeId": pid, "type": missing.pop_front()}
		n_places -= 1
	var rest_r := []
	for k in added:
		if not places_at.has(k):
			rest_r.append([k, Rng.random(s)])
	JS.sort(rest_r, func(a, b): return a[1] - b[1])
	var rest := rest_r.map(func(e): return e[0])
	var table := []
	for e in Content.PLACE_TABLE:
		var w = e[1] + e[2] * (n - 2)
		if w > 0:
			table.append([e[0], w])
	for i in rest.size():
		var k: String = rest[i]
		if i < n_places:
			var options := table.filter(func(e): return _fits(e[0], k, n, look))
			var type = _pick_weighted(s, options if options.size() else table.filter(func(e): return _tier_ok(e[0], n)))
			m.blocks[k] = {"kind": "place", "placeId": make_place.call(type, k), "type": type}
		else:
			var p := parse(k)
			var kinds: Array = Zones.FILLER_BY_ZONE.get(Zones.zone_of(p[0], p[1], look), Content.FILLER_KINDS)
			m.blocks[k] = {"kind": kinds[floori(Rng.random(s) * kinds.size())]}
	# 4b. A food, a wood and a metal source.
	for res in ["food", "wood", "metal"]:
		var found := false
		for bk in m.blocks:
			var bl: Dictionary = m.blocks[bk]
			if bl.kind == "place" and Content.yields_of(bl.get("type", bl.get("placeId")))[res]:
				found = true
				break
		if found:
			continue
		var sources := table.filter(func(e): return _tier_ok(e[0], n) and Content.yields_of(e[0])[res])
		var spots := added.filter(func(k): return m.blocks[k].kind != "place")
		var k = null
		for b in spots:
			if sources.any(func(e): return _fits(e[0], b, n, look)):
				k = b
				break
		if k == null and spots.size():
			k = spots[0]
		if k == null or not sources.size():
			continue
		var fit := sources.filter(func(e): return _fits(e[0], k, n, look))
		var type = _pick_weighted(s, fit if fit.size() else sources)
		m.blocks[k] = {"kind": "place", "placeId": make_place.call(type, k), "type": type}
	# 5. Fronts.
	var road_set := as_set(m.roads)
	for k in added:
		var p := parse(k)
		m.blocks[k].front = busiest_front(road_set, p[0], p[1]) if m.blocks[k].kind == "place" else front_of(road_set, p[0], p[1])
	return added


static func front_of(roads: Dictionary, bx: int, bz: int) -> String:
	var sides := {"z": "%d,%d,h" % [bx, bz + 1], "x": "%d,%d,v" % [bx + 1, bz], "-z": "%d,%d,h" % [bx, bz], "-x": "%d,%d,v" % [bx, bz]}
	for f in ["z", "x", "-z", "-x"]:
		if roads.has(sides[f]):
			return f
	return "z"


static func busiest_front(roads: Dictionary, bx: int, bz: int) -> String:
	var deg := func(x: int, z: int) -> int:
		var c := 0
		for r in ["%d,%d,h" % [x, z], "%d,%d,h" % [x - 1, z], "%d,%d,v" % [x, z], "%d,%d,v" % [x, z - 1]]:
			if roads.has(r):
				c += 1
		return c
	var sides := {
		"z": ["%d,%d,h" % [bx, bz + 1], [bx, bz + 1], [bx + 1, bz + 1]],
		"x": ["%d,%d,v" % [bx + 1, bz], [bx + 1, bz], [bx + 1, bz + 1]],
		"-z": ["%d,%d,h" % [bx, bz], [bx, bz], [bx + 1, bz]],
		"-x": ["%d,%d,v" % [bx, bz], [bx, bz], [bx, bz + 1]],
	}
	var best = null
	var score := -1
	for f in ["z", "x", "-z", "-x"]:
		var sd: Array = sides[f]
		if not roads.has(sd[0]):
			continue
		var sc: int = deg.call(sd[1][0], sd[1][1]) + deg.call(sd[2][0], sd[2][1])
		if sc > score:
			score = sc
			best = f
	return best if best != null else "z"


static func _placed_near(m: Dictionary, c: Array) -> bool:
	for p in [[c[0], c[1]], [c[0] - 1, c[1]], [c[0], c[1] - 1], [c[0] - 1, c[1] - 1]]:
		if m.blocks.has(key(p[0], p[1])):
			return true
	return false


static func _nodes(roads: Dictionary) -> Dictionary:
	var out := {}
	for seg in roads:
		for p in seg_ends(seg):
			out[key(p[0], p[1])] = true
	return out


static func _step(p: Array) -> Array:
	return [[p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]]


static func _grow_roads(s: Dictionary, m: Dictionary, added: Array, n: int) -> void:
	var roads := as_set(m.roads)
	var lim := n + 2
	var inside := func(q: Array) -> bool:
		return q[0] >= -lim + 1 and q[0] <= lim and q[1] >= -lim + 1 and q[1] <= lim and _placed_near(m, q)
	# Main roads keep going.
	var deg := {}
	for seg in roads:
		for p in seg_ends(seg):
			var k := key(p[0], p[1])
			deg[k] = deg.get(k, 0) + 1
	for k in deg:
		if deg[k] != 1 or Rng.random(s) < 0.35:
			continue
		var p := parse(k)
		var dir: Array = [signf(p[0] - 0.5), 0] if absf(p[0] - 0.5) >= absf(p[1] - 0.5) else [0, signf(p[1] - 0.5)]
		dir = [int(dir[0]), int(dir[1])]
		var length := 1 + floori(Rng.random(s) * 2)
		for i in length:
			var q := [p[0] + dir[0], p[1] + dir[1]]
			if not inside.call(q):
				break
			roads[seg_key(p, q)] = true
			p = q
			if Rng.random(s) < 0.3:
				var d0 = dir[1] * (1 if Rng.random(s) < 0.5 else -1)
				var d1 = dir[0] * (1 if Rng.random(s) < 0.5 else -1)
				dir = [d0, d1]
	# Every new block touches a street.
	for k in added:
		var b := parse(k)
		var touches := false
		for sg in sides_of(b[0], b[1]):
			if roads.has(sg):
				touches = true
		if touches:
			continue
		var net := _nodes(roads)
		var starts := corners_of(b[0], b[1])
		var prev := {}
		for p in starts:
			prev[key(p[0], p[1])] = null
		var queue := starts.duplicate()
		var hit = null
		while queue.size() and hit == null:
			var nxt := []
			for p in queue:
				if net.has(key(p[0], p[1])):
					hit = p
					break
				var nb := _step(p).filter(func(q): return inside.call(q))
				JS.sort(nb, func(_a, _b): return Rng.random(s) - 0.5)
				for q in nb:
					var qk := key(q[0], q[1])
					if not prev.has(qk):
						prev[qk] = p
						nxt.append(q)
			queue = nxt
		if hit == null:
			continue
		var p = hit
		while prev.get(key(p[0], p[1])) != null:
			var q = prev[key(p[0], p[1])]
			roads[seg_key(p, q)] = true
			p = q
		touches = false
		for sg in sides_of(b[0], b[1]):
			if roads.has(sg):
				touches = true
		if not touches:
			var nodes := _nodes(roads)
			var c = null
			for st in starts:
				if nodes.has(key(st[0], st[1])):
					c = st
					break
			if c == null:
				c = starts[0]
			var opts := sides_of(b[0], b[1]).filter(func(sg): return seg_ends(sg).any(func(e): return e[0] == c[0] and e[1] == c[1]))
			roads[opts[floori(Rng.random(s) * opts.size())]] = true
	# MAP-11: shared sides are streets.
	for k in added:
		var b := parse(k)
		for e in [["%d,%d,h" % [b[0], b[1]], b[0], b[1] - 1], ["%d,%d,h" % [b[0], b[1] + 1], b[0], b[1] + 1], ["%d,%d,v" % [b[0], b[1]], b[0] - 1, b[1]], ["%d,%d,v" % [b[0] + 1, b[1]], b[0] + 1, b[1]]]:
			if m.blocks.has(key(e[1], e[2])):
				roads[e[0]] = true
	# Spurs.
	var spurs := 1 + floori(Rng.random(s) * 3)
	var net := _nodes(roads).keys().map(func(k): return parse(k))
	for i in spurs:
		var p = net[floori(Rng.random(s) * net.size())]
		var q = _step(p)[floori(Rng.random(s) * 4)]
		if inside.call(q):
			roads[seg_key(p, q)] = true
	m.roads = roads.keys()
