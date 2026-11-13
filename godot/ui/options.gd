## src/ui/options.js + radial.js ringItems: which actions the UI offers. Legality always comes from the rules
## engine (try_reduce), so the UI never offers an illegal move or hides a legal one.
class_name Options
extends RefCounted

const COLONY_ONLY := ["nap", "guard", "unguard", "barricade"]


static func check(state: Dictionary, action: Dictionary) -> Dictionary:
	var r = Reducer.try_reduce(state, action)
	return {"action": action, "ok": r.ok, "error": null if r.ok else r.error}


static func survivor_options(state: Dictionary, id: String) -> Array:
	var sv = state.survivors.get(id)
	if sv == null or not sv.alive:
		return []
	var out = []
	var add = func(oid: String, action: Dictionary) -> void:
		var o = {"id": oid, "cost": Sel.action_cost(state, id, oid)}
		o.merge(check(state, action))
		out.append(o)
	add.call("attack", {"type": "ATTACK", "survivorId": id})
	out[out.size() - 1].fight = Sel.fight_preview(state, id)
	add.call("search", {"type": "SEARCH", "survivorId": id})
	add.call("barricade", {"type": "BARRICADE", "survivorId": id})
	var other = null
	for l in CityMap.places_of(state):
		if l != sv.location:
			other = l
			break
	add.call("lure", {"type": "LURE", "survivorId": id, "toLocation": other})
	if Sel.ability_type(id) == "healer":
		var target = null
		for oid in state.survivors:
			var o: Dictionary = state.survivors[oid]
			if o.alive and o.location == sv.location and (o.wounds > 0 or o.frostbite):
				target = o.id
				break
		var a = {"type": "USE_ABILITY", "survivorId": id, "targetSurvivorId": target if target != null else id}
		var o = {"id": "ability", "cost": 0}
		o.merge(check(state, a) if target != null else {"action": a, "ok": false, "error": "notWounded"})
		out.append(o)
	var mode = "sleep" if sv.rest == "guard" else "guard"
	var g = {"id": "unguard" if sv.rest == "guard" else "guard", "cost": null}
	g.merge(check(state, {"type": "SET_REST", "survivorId": id, "mode": mode}))
	out.append(g)
	return out


static func move_option(state: Dictionary, id: String, to: String, use_fuel := false) -> Dictionary:
	var fuel = null
	if use_fuel:
		for u in state.stockpile:
			if Sel.item_of(state, u).type == "fuel":
				fuel = u
				break
	var a = {"type": "MOVE", "survivorId": id, "toLocation": to}
	if fuel != null:
		a.fuelCardUid = fuel
	var o = {"to": to, "fuel": fuel}
	o.merge(check(state, a))
	return o


static func ring_items(state: Dictionary, sv_id: String, at: String) -> Array:
	var items = []
	if sv_id == "" or state.phase != "turn":
		return items
	var sv: Dictionary = state.survivors[sv_id]
	if sv.location != at:
		var walkers = Sel.alive_survivors(state).filter(func(v): return v.location != at)
		walkers.sort_custom(func(x, y): return x.id == sv_id and y.id != sv_id)
		for v in walkers:
			var hurt = Sel.leave_damage(state, v.id)
			var it = move_option(state, v.id, at)
			it.merge({"id": "walk", "cost": Sel.action_cost(state, v.id, "move", at), "risk": "−%d HP" % hurt if hurt else null, "face": v.id})
			items.append(it)
		var drive = move_option(state, sv_id, at, true)
		if drive.fuel != null and drive.ok:
			drive.merge({"id": "drive", "cost": Sel.action_cost(state, sv_id, "move", at), "face": sv_id})
			items.append(drive)
	else:
		for o in survivor_options(state, sv_id):
			if COLONY_ONLY.has(o.id) and at != "colony":
				continue
			if o.id == "search" and at == "colony":
				continue
			if (o.id == "lure" or o.id == "attack") and not state.locations[at].zombies:
				continue
			var risk = null
			if o.id == "attack" and o.get("fight") != null:
				risk = "%d%%" % roundi(o.fight.spawn * 100) if o.fight.gun else ("−%d HP" % o.fight.hp if o.fight.hp else null)
			elif o.id == "search" and o.ok:
				risk = I18n.t("bar.risk", {"n": "%d%%" % roundi(Sel.search_spawn_chance(state, at) * 100)})
			o.risk = risk
			items.append(o)
		if at == "colony":
			items.append({"id": "build", "ok": true, "cost": null})
	return items


static func all_items(state: Dictionary) -> Array:
	var out: Array = state.stockpile.duplicate()
	for id in state.team.survivors:
		var sv = state.survivors.get(id)
		if sv != null and sv.alive:
			out.append_array(sv.get("pack", []))
	return out


static func card_needs_survivor(state: Dictionary, uid: String) -> bool:
	var it = Sel.item_of(state, uid)
	return ["consumable", "medicine"].has(it.type) or Content.gear_slot(it) != null


static func card_targets(state: Dictionary, uid: String) -> Array:
	if not card_needs_survivor(state, uid):
		return []
	var gear = Content.gear_slot(Sel.item_of(state, uid)) != null
	var out = []
	for id in state.team.survivors:
		if not state.survivors.get(id, {}).get("alive", false):
			continue
		var a = {"type": "EQUIP", "cardUid": uid, "survivorId": id} if gear else {"type": "PLAY_CARD", "cardUid": uid, "targetSurvivorId": id}
		var o = {"survivorId": id}
		o.merge(check(state, a))
		out.append(o)
	return out


static func card_options(state: Dictionary, uid: String) -> Array:
	var it = Sel.item_of(state, uid)
	var out = []
	if Content.gear_slot(it) == null and it.type != "fuel" and not card_needs_survivor(state, uid):
		var o = {"id": "play"}
		o.merge(check(state, {"type": "PLAY_CARD", "cardUid": uid}))
		out.append(o)
	var c = {"id": "contribute"}
	c.merge(check(state, {"type": "CONTRIBUTE", "cardUid": uid}))
	out.append(c)
	if Sel.scenario_def(state).goal.type == "deposit":
		var d = {"id": "deposit"}
		d.merge(check(state, {"type": "DEPOSIT", "cardUid": uid}))
		out.append(d)
	return out


static func give_targets(state: Dictionary, uid: String) -> Array:
	var out = []
	for id in state.team.survivors:
		if not state.survivors.get(id, {}).get("alive", false):
			continue
		var o = {"survivorId": id}
		o.merge(check(state, {"type": "GIVE", "cardUid": uid, "toSurvivorId": id}))
		if o.ok:
			out.append(o)
	var home = {"survivorId": null}
	home.merge(check(state, {"type": "GIVE", "cardUid": uid}))
	if home.ok:
		out.append(home)
	return out


static func lure_targets(state: Dictionary, id: String) -> Array:
	var sv = state.survivors.get(id)
	if sv == null or not sv.alive:
		return []
	var list = []
	for to in CityMap.places_of(state):
		if to != sv.location:
			list.append([to, CityMap.road_distance(state, sv.location, to)])
	list.sort_custom(func(a, b): return a[1] < b[1])
	var out = []
	for e in list.slice(0, 6):
		var o = {"to": e[0]}
		o.merge(check(state, {"type": "LURE", "survivorId": id, "toLocation": e[0]}))
		out.append(o)
	return out


static func acting_survivors(state: Dictionary) -> Array:
	if state.is_empty() or state.phase != "turn":
		return []
	var out = []
	for id in state.team.survivors:
		var sv = state.survivors.get(id)
		if sv == null or not sv.alive:
			continue
		var can = false
		for to in CityMap.places_of(state):
			if to != sv.location and move_option(state, id, to).ok:
				can = true
				break
		if not can:
			for o in survivor_options(state, id):
				if o.ok and not ["nap", "guard", "unguard"].has(o.id):
					can = true
					break
		if can:
			out.append(id)
	return out


## A short line for an action (the hint bar).
static func describe_action(state: Dictionary, a: Dictionary) -> String:
	var who = I18n.c("survivors", a.get("survivorId", ""), "name")
	var card = I18n.c("items", state.cards.get(a.get("cardUid", ""), ""), "name") if a.has("cardUid") else ""
	match a.type:
		"MOVE": return "%s → %s" % [who, I18n.c("locations", a.toLocation, "name")]
		"SEARCH": return "%s: %s" % [who, I18n.t("bar.search")]
		"ATTACK": return "%s: %s" % [who, I18n.t("bar.attack")]
		"BARRICADE": return "%s: %s" % [who, I18n.t("bar.barricade")]
		"CONTRIBUTE": return "%s → %s" % [card, I18n.t("hud.crisis")]
		"PLAY_CARD": return "%s: %s" % [I18n.t("act.playShort"), card]
		"EQUIP": return "%s: %s" % [I18n.t("act.equipShort"), card]
		"BUILD": return "%s: %s" % [who, I18n.t("bld." + a.buildingId)]
		"CRAFT": return "%s: %s" % [who, I18n.c("items", Content.RECIPES[a.recipeId].makes, "name")]
		"SET_REST": return "%s: %s" % [who, I18n.t("bar.guard")]
		"END_TURN": return I18n.t("act.endTurn")
	return a.type
