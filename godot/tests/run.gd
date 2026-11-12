# GODOT-1 parity tests: vectors from the JS engine, then the golden games replayed action by action.
#   godot --headless --path godot --script res://tests/run.gd [-- --only vectors|golden] [--games N]
extends SceneTree

var fails := 0
var checks := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var only := ""
	var games := 20
	for i in args.size():
		if args[i] == "--only" and i + 1 < args.size():
			only = args[i + 1]
		if args[i] == "--games" and i + 1 < args.size():
			games = int(args[i + 1])
	var t0 := Time.get_ticks_msec()
	if only == "" or only == "vectors":
		vectors()
	if only == "" or only == "golden":
		golden(games)
	print("%d checks, %d failed, %d ms" % [checks, fails, Time.get_ticks_msec() - t0])
	quit(1 if fails else 0)


func check(ok: bool, what: String) -> bool:
	checks += 1
	if not ok:
		fails += 1
		if fails <= 30:
			printerr("FAIL ", what)
	return ok


func vectors() -> void:
	var v = JS.load_json("res://data/vectors/rng.json")
	for r in v.rng:
		var s := {"rng": Rng.normalize_seed(r.seed)}
		for d in r.draws:
			match d[0]:
				"random": check(Rng.random(s) * 4294967296.0 == float(d[1]), "random seed %s" % r.seed)
				"randInt": check(Rng.rand_int(s, -3, 17) == d[1], "randInt seed %s" % r.seed)
				"shuffle": check(Rng.shuffle(s, [0, 1, 2, 3, 4, 5, 6]) == d[1], "shuffle seed %s" % r.seed)
		check(s.rng == r.end, "rng end seed %s" % r.seed)
	for p in v.seeds:
		check(Rng.normalize_seed(str(p[0])) == p[1], "normalizeSeed '%s'" % p[0])
	for h in JS.load_json("res://data/vectors/hashZ.json"):
		check(Zones.hash_z(h[0], h[1], h[2]) * 4294967296.0 == float(h[3]), "hashZ %s" % [h])
	for h in JSON.parse_string(FileAccess.get_file_as_string("res://data/vectors/hash.json")):
		var val = JS.norm(h.value)
		check(JS.stable_json(val) == h.json, "stableJson %s -> %s" % [JS.stable_json(val), h.json])
		check(JS.fnv1a(h.json) == h.hash, "fnv1a %s" % h.json)
	var zbad := 0
	for z in JS.load_json("res://data/vectors/zones.json"):
		if Zones.zone_of(z[1], z[2], z[0]) != z[3] or absf(Zones.town_depth(z[1], z[2], z[0]) - float(z[4])) > 1e-9:
			zbad += 1
	check(zbad == 0, "zones: %d of the grid differ" % zbad)
	if not ClassDB.class_exists("Node") or not ResourceLoader.exists("res://core/state.gd"):
		return
	for g in JS.load_json("res://data/vectors/growth.json"):
		var s = GameState.create_game({"seed": g.seed, "scenarioId": "crawler", "days": 40})
		check(JS.state_hash(s) == g.hashes[0], "growth seed %d start" % g.seed)
		for i in 4:
			City.grow_city(s)
			if not check(JS.state_hash(s) == g.hashes[i + 1], "growth seed %d after %d" % [g.seed, i + 1]):
				break


func golden(games: int) -> void:
	if not ResourceLoader.exists("res://core/reducer.gd"):
		return
	pass
	pass
	for seed in range(1, games + 1):
		var g = JS.load_json("res://data/golden/%d.json" % seed)
		var s = GameState.create_game({"scenarioId": g.scenarioId, "seed": g.seed, "difficulty": g.difficulty, "days": 40})
		if not check(JS.state_hash(s) == g.start, "golden %d start" % seed):
			_dump(s, seed, 0)
			continue
		var ok := true
		for i in g.steps.size():
			var st = g.steps[i]
			var r = Reducer.try_reduce(s, st.action)
			if not r.ok:
				check(false, "golden %d step %d: %s rejected: %s" % [seed, i + 1, JSON.stringify(st.action), r.error])
				ok = false
				break
			s = r.state
			if JS.state_hash(s) != st.hash:
				check(false, "golden %d step %d: %s hash differs" % [seed, i + 1, JSON.stringify(st.action)])
				_dump(s, seed, i + 1)
				ok = false
				break
		if ok:
			check(true, "golden %d" % seed)
			print("golden %d: %d steps match (%s)" % [seed, g.steps.size(), JSON.stringify(g.result)])


## Writes the port's state next to where the JS one goes (node scripts/export-data.mjs --state seed step), for a diff.
func _dump(s, seed: int, step: int) -> void:
	DirAccess.make_dir_recursive_absolute("res://data/golden/states")
	var f := FileAccess.open("res://data/golden/states/%d-%d.gd.json" % [seed, step], FileAccess.WRITE)
	f.store_string(JSON.stringify(JSON.parse_string(JS.stable_json(s)), " ", true))
	printerr("  wrote data/golden/states/%d-%d.gd.json; for the JS one: node scripts/export-data.mjs --state %d %d" % [seed, step, seed, step])
