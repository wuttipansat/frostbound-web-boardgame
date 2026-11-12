## src/core/selectors.js: read-only queries over the state.
class_name Sel
extends RefCounted


static func survivor_def(id: String):
	return Content.SURVIVORS_BY_ID.get(id)


static func item_of(s: Dictionary, uid: String):
	return Content.ITEMS.get(s.cards.get(uid))


static func scenario_def(s: Dictionary) -> Dictionary:
	return Content.SCENARIOS_BY_ID[s.scenario.id]


static func crisis_def(s: Dictionary):
	return Content.CRISES_BY_ID.get(s.crisis.id) if s.crisis != null else null


static func alive_survivors(s: Dictionary) -> Array:
	var out := []
	for id in s.team.survivors:
		var sv = s.survivors.get(id)
		if sv != null and sv.alive:
			out.append(sv)
	return out


static func survivors_at(s: Dictionary, loc: String) -> Array:
	var out := []
	for id in s.survivors:
		var sv: Dictionary = s.survivors[id]
		if sv.alive and sv.location == loc:
			out.append(sv)
	return out


static func ability_type(id: String) -> String:
	return survivor_def(id).ability.type


static func gear_of(s: Dictionary, survivor_id = null) -> Dictionary:
	var sv = s.survivors.get(survivor_id) if survivor_id else hero_of(s)
	var g = sv.get("gear") if sv != null else null
	if g == null:
		g = {}
	var out := {}
	for slot in ["weapon", "armor", "book", "tool"]:
		var uid = g.get(slot)
		out[slot] = Content.ITEMS.get(s.cards.get(uid)) if uid else null
	return out


static func books_held(s: Dictionary, passive: String) -> int:
	var n := 0
	for sv in alive_survivors(s):
		var b = gear_of(s, sv.id).book
		if b != null and b.get("passive") == passive:
			n += 1
	return n


static func holds_blueprint(s: Dictionary, survivor_id: String, loc: String) -> bool:
	var b = gear_of(s, survivor_id).book
	return b != null and b.get("blueprint") == CityMap.type_of(s, loc)


static func team_has_ability(s: Dictionary, type: String) -> bool:
	for sv in alive_survivors(s):
		if ability_type(sv.id) == type:
			return true
	return false


static func wound_limit(survivor_id: String) -> int:
	return Content.RULES.WOUNDS_TO_DIE + (1 if ability_type(survivor_id) == "stoic" else 0)


static func free_survivor_slots(s: Dictionary, loc: String) -> float:
	var slots = CityMap.loc_def(s, loc).get("survivorSlots")
	if slots == null:
		return INF
	return slots - survivors_at(s, loc).size()


static func free_zombie_slots(s: Dictionary, loc: String) -> int:
	var l: Dictionary = s.locations[loc]
	return CityMap.loc_def(s, loc).zombieSlots - l.zombies - l.barricades


static func colony_population(s: Dictionary) -> int:
	return survivors_at(s, "colony").size()


static func food_needed(s: Dictionary) -> int:
	var need := colony_population(s)
	for sv in survivors_at(s, "colony"):
		if ability_type(sv.id) == "foodSaver":
			need -= 1
			break
	need -= books_held(s, "foodSaver")
	return maxi(0, need)


static func crisis_requirement(s: Dictionary) -> int:
	var c = crisis_def(s)
	if c == null:
		return 0
	return maxi(1, c.get("need", 1)) + floori((s.day - 1) / float(Content.RULES.CRISIS_STEP_DAYS))


static func crisis_score(s: Dictionary) -> int:
	var c = crisis_def(s)
	if c == null:
		return 0
	var n := 0
	for uid in s.crisis.contributions:
		n += 1 if crisis_matches(s, c, item_of(s, uid)) else -1
	return n


static func crisis_matches(s: Dictionary, crisis: Dictionary, item: Dictionary) -> bool:
	return item.type == crisis.item or item.get("counts") == crisis.item or bool(item.get("wild", false)) \
		or (item.type == "junk" and team_has_ability(s, "tinkerer"))


## The survivor a crossroads card is about: highest influence (stable), optionally filtered.
static func focus_survivor(s: Dictionary, filter = null):
	var list := alive_survivors(s)
	if filter != null:
		list = list.filter(filter)
	JS.sort(list, func(a, b): return survivor_def(b.id).influence - survivor_def(a.id).influence)
	return list[0] if list.size() else null


static func scenario_target(s: Dictionary) -> int:
	return scenario_def(s).goal.get("target", 0)


static func is_storm(s: Dictionary) -> bool:
	return s.day % 3 == 0 or s.day >= Content.SEASON.STORMS


static func action_cost(s: Dictionary, survivor_id: String, kind: String, to = null) -> int:
	var sv = s.survivors.get(survivor_id)
	var def = survivor_def(survivor_id)
	var gear: Dictionary = gear_of(s, survivor_id) if sv != null else {}
	var cost = Content.ENERGY.COST.get(kind, 0)
	var weapon = gear.get("weapon")
	var armor = gear.get("armor")
	var tool = gear.get("tool")
	if kind == "attack":
		cost = Content.FIGHT.GUN_AP if weapon != null and weapon.get("gun") else Content.FIGHT.MELEE_AP
	if kind == "search":
		cost = Content.ENERGY.SEARCH
	if kind == "move":
		cost = walk_cost(s, sv.location if sv != null else "colony", to if to else "colony") \
			+ (armor.get("moveMod", 0) if armor != null else 0) + (tool.get("walkMod", 0) if tool != null else 0) \
			- (2 if sv != null and sv.get("trait") == "quick" else 0)
	if kind == "search":
		cost += (tool.get("searchMod", 0) if tool != null else 0) - Content.XP.SEARCH_AP * xp_level(sv, "search")
	if kind == "barricade":
		cost += tool.get("barricadeMod", 0) if tool != null else 0
	if sv == null:
		return cost
	if kind == "search" and CityMap.is_spot(s, sv.location):
		cost = JS.round_(cost * Content.SPOT_RULES.AP_SHARE)
	var here: String = sv.location
	var zombies = s.locations.get(here, {}).get("zombies", 0)
	if (kind == "search" or kind == "barricade") and zombies >= 2:
		cost += Content.ENERGY.CROWDED
	var at = def.ability.type if def != null else null
	if kind == "attack" and at == "killTwo":
		cost += Content.ENERGY.HEAVY
	var cheaper = {"move": "roadRunner", "attack": "sharpshooter", "barricade": "handy"}.get(kind)
	if cheaper != null and at == cheaper:
		cost -= Content.ENERGY.SKILLED
	var outside: bool = (to != null and to != "" and to != "colony") if kind == "move" else here != "colony"
	if is_storm(s) and outside and at != "coldProof" and not (armor != null and armor.get("coldProof")):
		cost += Content.ENERGY.STORM
	return maxi(1, cost)


static func walk_cost(s: Dictionary, from: String, to: String) -> int:
	if from == to:
		return 0
	return mini(Content.ENERGY.WALK_CAP, Content.ENERGY.WALK_BASE + Content.ENERGY.WALK_BLOCK * CityMap.road_distance(s, from, to))


static func search_spawn_chance(s: Dictionary, loc: String) -> float:
	var bk = CityMap.block_of(s, loc) if s.get("map") != null else null
	var downtown := 0.0
	if bk != null:
		var p := CityMap.parse(bk)
		if Zones.zone_of(p[0], p[1], s.map.get("look", 0)) == "commercial":
			downtown = Content.SEARCH_SPAWN.DOWNTOWN
	var base: float = Content.SEARCH_SPAWN.get(CityMap.type_of(s, loc), 0.15) + Content.SEARCH_SPAWN.RING * maxi(0, CityMap.ring_of(s, loc) - 1) + downtown
	return maxf(0.0, minf(1.0, base + Content.SEARCH_SPAWN.EXTRA * s.get("searches", {}).get(loc, 0)))


static func holder_of(s: Dictionary, uid: String):
	if s.stockpile.has(uid):
		return "stockpile"
	for id in s.survivors:
		var sv: Dictionary = s.survivors[id]
		if sv.alive and sv.get("pack") != null and sv.pack.has(uid):
			return sv.id
	return null


static func place_of_item(s: Dictionary, uid: String):
	var h = holder_of(s, uid)
	if h == "stockpile":
		return "colony"
	return s.survivors[h].location if h != null else null


static func pack_size(s: Dictionary, survivor_id: String) -> int:
	if not s.survivors.has(survivor_id):
		return Content.RULES.PACK
	var t = gear_of(s, survivor_id).tool
	return Content.RULES.PACK + (t.get("pack", 0) if t != null else 0)


static func pack_free(s: Dictionary, survivor_id: String) -> int:
	var sv = s.survivors.get(survivor_id)
	return pack_size(s, survivor_id) - (sv.pack.size() if sv != null and sv.get("pack") != null else 0)


static func kills_per_attack(s: Dictionary, survivor_id: String) -> int:
	var w = gear_of(s, survivor_id).weapon if s.survivors.has(survivor_id) else null
	if w != null and w.get("gun"):
		return w.value
	var d = survivor_def(survivor_id)
	return 1 + (1 if d != null and d.ability.type == "killTwo" else 0)


static func ferocity(s: Dictionary) -> int:
	return Content.FIGHT.BRUTE if s.day >= Content.FIGHT.BRUTE_DAY else Content.FIGHT.WALKER


static func atk_of(s: Dictionary, survivor_id: String) -> int:
	var w = gear_of(s, survivor_id).weapon
	var sv = s.survivors.get(survivor_id)
	var d = survivor_def(survivor_id)
	return (7 - (d.get("attack", 4) if d != null else 4)) * Content.FIGHT.ATK_PER_SKILL + (w.get("atk", 0) if w != null and not w.get("gun") else 0) \
		+ Content.XP.ATK * xp_level(sv, "fight") + (4 if sv != null and sv.get("trait") == "strong" else 0)


static func fight_preview(s: Dictionary, survivor_id: String) -> Dictionary:
	var sv = s.survivors.get(survivor_id)
	var gear := gear_of(s, survivor_id)
	var cost := action_cost(s, survivor_id, "attack")
	var kills := kills_per_attack(s, survivor_id)
	if gear.weapon != null and gear.weapon.get("gun"):
		return {"cost": cost, "kills": kills, "hp": 0, "gun": true, "spawn": gear.weapon.gun.spawn, "ammo": sv.get("ammo", 0) if sv != null else 0}
	var left := maxi(0, (sv.get("ap", 0) if sv != null else 0) - cost)
	var raw := ceili(maxi(0, ferocity(s) - (left + atk_of(s, survivor_id))) / 3.0)
	var bond: int = Content.BOND.HP_SAVED if close_bond(s, survivor_id) != null else 0
	return {"cost": cost, "kills": kills, "hp": maxi(0, raw - (gear.armor.get("value", 0) if gear.armor != null else 0) - bond), "gun": false, "spawn": 0, "ammo": 0}


static func leave_damage(s: Dictionary, survivor_id: String) -> int:
	var sv = s.survivors.get(survivor_id)
	var loc = s.locations.get(sv.location) if sv != null else null
	return Content.FIGHT.LEAVE_HP * (loc.zombies if loc != null else 0)


static func hero_of(s: Dictionary):
	var a := alive_survivors(s)
	return a[0] if a.size() else null


static func ap_max(s: Dictionary, survivor_id: String) -> int:
	var sv = s.survivors.get(survivor_id)
	if sv == null:
		return 0
	var base = survivor_def(survivor_id).get("energy", Content.ENERGY.MAX)
	return maxi(10, mini(Content.ENERGY.MAX, base - (Content.ENERGY.HURT if sv.wounds >= 2 else 0)))


static func ap_of(s: Dictionary, survivor_id: String) -> int:
	var sv = s.survivors.get(survivor_id)
	return sv.get("ap", 0) if sv != null else 0


static func sleep_plan(s: Dictionary) -> Dictionary:
	var out := {}
	var alive := alive_survivors(s)
	var home := alive.filter(func(sv): return sv.location == "colony" and sv.rest != "guard")
	JS.sort(home, func(a, b):
		var d: float = float(ap_of(s, a.id)) / ap_max(s, a.id) - float(ap_of(s, b.id)) / ap_max(s, b.id)
		return d if d != 0 else _cmp(a.id, b.id))
	var beds := {}
	for sv in home.slice(0, bed_count(s)):
		beds[sv.id] = true
	var bonus := 0
	for o in alive:
		var b = gear_of(s, o.id).book
		if b != null and b.get("passive") == "regenPlus":
			bonus += b.value
	for sv in alive:
		var kind: String = "outside" if sv.location != "colony" else ("guard" if sv.rest == "guard" else ("bed" if beds.has(sv.id) else "floor"))
		var mx := ap_max(s, sv.id)
		var extra := bonus + (15 if ability_type(sv.id) == "extraDie" else 0)
		var share: float = 0.7 if kind == "guard" and sv.get("trait") == "nightOwl" else float(Content.REST[kind].ap)
		var ap := maxi(0, mini(mx, ap_of(s, sv.id) + JS.round_(mx * share) + extra))
		if sv.get("hungry"):
			ap = JS.round_(ap * Content.REST.HUNGRY)
		out[sv.id] = {"kind": kind, "ap": ap, "hp": Content.REST[kind].hp + (5 * base_level(s, "infirmary") if sv.location == "colony" else 0)}
	return out


## a.localeCompare(b) for the ids used here (lowercase ASCII): code-unit order.
static func _cmp(a: String, b: String) -> int:
	return -1 if a < b else (1 if a > b else 0)


static func xp_level(sv, kind: String) -> int:
	var xp = sv.get("xp") if sv != null else null
	var v = xp.get(kind, 0) if xp != null else 0
	return mini(Content.XP.MAX_LEVEL, floori(v / float(Content.XP.PER_LEVEL)))


static func bond_key(a: String, b: String) -> String:
	return (a + "|" + b) if a < b else (b + "|" + a)


static func close_bond(s: Dictionary, survivor_id: String):
	var sv = s.survivors.get(survivor_id)
	if sv == null:
		return null
	for o in alive_survivors(s):
		if o.id != sv.id and o.location == sv.location and s.get("bonds", {}).get(bond_key(sv.id, o.id), 0) >= Content.BOND.CLOSE:
			return o.id
	return null


static func mission_status(s: Dictionary):
	var m = s.mission
	if m == null:
		return null
	var out: Dictionary = m.duplicate()
	out.progress = maxi(0, s.get("stats", {}).get(m.stat, 0) - m.base)
	out.daysLeft = m.until - s.day
	return out


static func is_overrun(s: Dictionary, id: String) -> bool:
	return id != "colony" and s.locations.get(id, {}).get("zombies", 0) >= CityMap.loc_def(s, id).zombieSlots


static func base_level(s: Dictionary, id: String) -> int:
	return s.get("base", {}).get(id, 0) if s.get("base") != null else 0


static func bed_count(s: Dictionary) -> int:
	return Content.RULES.BEDS + 2 * base_level(s, "dorm")


static func next_level(s: Dictionary, id: String):
	var def = Content.CRAWLER if id == "crawler" else Content.BUILDINGS.get(id)
	var lv := base_level(s, id)
	if def == null or lv >= def.levels.size():
		return null
	var spent = s.get("building", {}).get(id) if s.get("building") != null else null
	var out: Dictionary = {"level": lv + 1}
	out.merge(def.levels[lv], true)
	out.spent = spent if spent != null else 0
	out.started = spent != null
	return out


static func guards_on_duty(s: Dictionary) -> int:
	return alive_survivors(s).filter(func(sv): return sv.location == "colony" and sv.rest == "guard").size()


static func spawn_forecast(s: Dictionary) -> Dictionary:
	var out := {}
	for loc in CityMap.outside_of(s):
		var here := survivors_at(s, loc)
		if not here.size():
			continue
		var quiet := here.filter(func(sv): return ability_type(sv.id) == "quiet").size()
		var n := maxi(0, ceili(here.size() / 2.0) - quiet)
		if n:
			out[loc] = n
	return out


static func siege_forecast(s: Dictionary) -> Dictionary:
	var dd = Content.DIFFICULTY.get(s.difficulty)
	var col = s.locations.get("colony")
	var attackers: int = maxi(0, Content.SIEGE.BASE + floori((s.day - 1) / float(Content.SIEGE.EVERY)) + (dd.siege if dd != null else 0)) + (col.zombies if col != null else 0)
	var wall := base_level(s, "wall")
	var guards: int = guards_on_duty(s) * Content.SIEGE.GUARD
	var barricades: int = col.barricades if col != null else 0
	var stopped := mini(attackers, wall + guards + barricades)
	var hits: int = attackers - stopped
	var home := alive_survivors(s).filter(func(sv): return sv.location == "colony")
	JS.sort(home, func(a, b): return (b.hp - a.hp) if b.hp != a.hp else _cmp(a.id, b.id))
	var targets := []
	if home.size():
		for i in hits:
			targets.append(home[i % home.size()].id)
	return {"attackers": attackers, "wall": wall, "guards": guards, "barricades": barricades, "stopped": stopped, "hits": hits, "targets": targets}


static func map_progress(s: Dictionary):
	var m := CityMap.map_of(s)
	if m.pending:
		return null
	var r := CityMap.map_range(m.stage)
	return {"done": m.get("searchesSinceMap", 0), "min": r[0], "max": r[1]}
