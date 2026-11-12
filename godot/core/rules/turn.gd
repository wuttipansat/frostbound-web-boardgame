## src/core/rules/turn.js: the player's actions. Each rule checks with Err.ok and returns at the first failure.
class_name Turn
extends RefCounted


static func _require_turn(s: Dictionary, picking := false):
	if not Err.ok(s.phase == "turn", "wrongPhase", s.phase):
		return null
	if not Err.ok(picking or s.team.pick == null, "pickPending"):
		return null
	return s.team


static func _require_survivor(s: Dictionary, id):
	var sv = s.survivors.get(id) if id != null else null
	if not Err.ok(sv != null and sv.alive, "noSuchSurvivor", id):
		return null
	if not Err.ok(s.team.survivors.has(id), "notYourSurvivor", id):
		return null
	return sv


static func _require_active(s: Dictionary, id):
	var sv = _require_survivor(s, id)
	if sv == null:
		return null
	if not Err.ok(not sv.napped, "napping"):
		return null
	return sv


static func _pay(s: Dictionary, id: String, kind: String, to = null) -> void:
	s.survivors[id].acted = true
	H.spend_energy(s, Sel.action_cost(s, id, kind, to), id)


static func _require_card(s: Dictionary, uid):
	if not Err.ok(uid != null and Sel.holder_of(s, uid) != null, "cardNotInHand", uid):
		return null
	return Sel.item_of(s, uid)


static func _require_home(s: Dictionary, uid) -> bool:
	return Err.ok(Sel.place_of_item(s, uid) == "colony", "notHome")


static func _require_same_place(s: Dictionary, uid, id) -> bool:
	return Err.ok(Sel.place_of_item(s, uid) == s.survivors[id].location, "notHere")


static func _ability(id: String) -> Dictionary:
	return Sel.survivor_def(id).ability


## (h !== 'stockpile' ? h : the first alive survivor at the colony) ?? ''
static func _default_target(s: Dictionary, h):
	if h != "stockpile":
		return h if h != null else ""
	for id in s.team.survivors:
		var v = s.survivors.get(id)
		if v != null and v.alive and v.location == "colony":
			return id
	return ""


# ---------------------------------------------------------------- energy actions

static func attack(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	if not Err.ok(s.locations[sv.location].zombies > 0, "noZombiesHere"): return
	var w = Sel.gear_of(s, id).weapon
	var gun = w.get("gun") if w != null else null
	if gun and not Err.ok(sv.get("ammo", 0) > 0, "noAmmo"): return
	var preview := Sel.fight_preview(s, id)
	_pay(s, id, "attack")
	if Err.failed(): return
	var killed := H.remove_zombies(s, sv.location, Sel.kills_per_attack(s, id))
	H.credit_kills(s, killed)
	var drawn := 0
	if gun:
		sv.ammo -= 1
		if Rng.random(s) < gun.spawn:
			drawn = 1
			H.add_zombies(s, sv.location, 1, "noise")
	H.add_log(s, "attack", {"survivorId": id, "locationId": sv.location, "killed": killed, "hp": preview.hp, "drawn": drawn})
	H.gain_xp(s, id, "fight")
	H.damage_survivor(s, id, preview.hp, "fight")


static func search(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	if not Err.ok(sv.location != "colony", "cannotSearchColony"): return
	if not Err.ok(s.locations[sv.location].deck.size() > 0, "deckEmpty"): return
	if not Err.ok(not Sel.is_overrun(s, sv.location), "placeOverrun"): return
	var ab := _ability(id)
	var loc: Dictionary = s.locations[sv.location]
	var batches = loc.get("batches")
	var size: int = batches.pop_back() if batches != null and batches.size() else 2 + (loc.deck.size() % 3)
	var want: int = size + (1 if ab.type == "doubleSearch" and ab.get("location") == CityMap.type_of(s, sv.location) else 0)
	var n := mini(mini(Sel.pack_free(s, id), want), loc.deck.size())
	if n < size and batches != null:
		batches.append(size - n)
	if not Err.ok(n > 0, "packFull"): return
	var chance := maxf(0.0, Sel.search_spawn_chance(s, sv.location) - (0.05 if sv.get("trait") == "scavenger" else 0.0))
	_pay(s, id, "search")
	if Err.failed(): return
	var blueprint := Sel.holds_blueprint(s, id, sv.location)
	var map = _roll_map(s, sv.location)
	var drawn := H.draw_items(s, sv.location, n + 1 if blueprint else n, id)
	s.searches[sv.location] = s.searches.get(sv.location, 0) + 1
	s.stats.searches += 1
	H.gain_xp(s, id, "search")
	var spawned := Rng.random(s) < chance
	H.add_log(s, "search", {"survivorId": id, "locationId": sv.location, "count": drawn.size(), "spawned": spawned})
	if map != null:
		H.add_log(s, "mapFound", {"survivorId": id, "locationId": sv.location})
	if spawned:
		H.add_zombies(s, sv.location, 1, "search")
	if blueprint and drawn.size() > n:
		p.pick = {"locationId": sv.location, "uids": drawn}


static func _roll_map(s: Dictionary, loc_id: String):
	var pr = Sel.map_progress(s)
	if pr == null:
		return null
	if s.get("map") == null:
		s.map = CityMap.new_map(true)
	var k: int = pr.done + 1
	s.map.searchesSinceMap = k
	if k < pr.min or (k < pr.max and Rng.random(s) >= 1.0 / (pr.max - k + 1)):
		return null
	var uid := "map%d" % (s.map.stage + 1)
	s.cards[uid] = "city-map-piece"
	s.locations[loc_id].deck.append(uid)
	var b = s.locations[loc_id].get("batches")
	if b != null and b.size():
		b[b.size() - 1] += 1
	s.map.searchesSinceMap = 0
	s.map.pending = true
	return uid


static func return_card(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s, true)
	if p == null: return
	if not Err.ok(p.pick != null, "notPicking"): return
	var uid = a.get("cardUid")
	if not Err.ok(p.pick.uids.has(uid), "cardNotInHand", uid): return
	H.remove_from_hand(s, uid)
	s.locations[p.pick.locationId].deck.push_front(uid)
	p.pick = null


static func barricade(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	if not Err.ok(sv.location == "colony", "mustBeInColony"): return
	if not Err.ok(Sel.free_zombie_slots(s, sv.location) > 0, "noBarricadeSpace"): return
	_pay(s, id, "barricade")
	if Err.failed(): return
	var n: int = (2 if _ability(id).type == "barricadeTwo" else 1) + mini(1, Sel.books_held(s, "barricadePlus"))
	H.add_barricades(s, sv.location, n)


static func lure(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	var to = a.get("toLocation")
	if not Err.ok(to != null and s.locations.has(to), "noSuchLocation", to): return
	if not Err.ok(to != sv.location, "sameLocation"): return
	if not Err.ok(s.locations[sv.location].zombies > 0, "noZombiesHere"): return
	_pay(s, id, "lure")
	if Err.failed(): return
	var moved := H.remove_zombies(s, sv.location, 2 if _ability(id).type == "lureTwo" else 1)
	H.add_log(s, "lure", {"survivorId": id, "from": sv.location, "to": to, "n": moved})
	H.add_zombies(s, to, moved, "lure")


static func move(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	var to = a.get("toLocation")
	var fuel = a.get("fuelCardUid")
	if not Err.ok(to != null and s.locations.has(to), "noSuchLocation", to): return
	if not Err.ok(to != sv.location, "sameLocation"): return
	if not Err.ok(Sel.free_survivor_slots(s, to) > 0, "locationFull"): return
	if fuel:
		var it = _require_card(s, fuel)
		if it == null: return
		if not Err.ok(it.type == "fuel", "needFuel"): return
		if not _require_same_place(s, fuel, id): return
	_pay(s, id, "move", to)
	if Err.failed(): return
	var safe: bool = s.locations[to].zombies == 0
	if fuel:
		H.discard_card(s, fuel)
		safe = true
	var from: String = sv.location
	var bite := 0 if fuel else Sel.leave_damage(s, id)
	sv.location = to
	sv.moved = true
	H.add_log(s, "move", {"survivorId": id, "from": from, "to": to, "safe": safe})
	H.damage_survivor(s, id, bite, "escape")
	H.unpack(s, id)


# ---------------------------------------------------------------- gear

static func equip(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var uid = a.get("cardUid")
	var item = _require_card(s, uid)
	if item == null: return
	var slot = Content.gear_slot(item)
	if not Err.ok(slot != null, "notGear"): return
	var holder = Sel.holder_of(s, uid)
	var target = a.get("survivorId")
	if target == null:
		target = _default_target(s, holder)
	var sv = _require_survivor(s, target)
	if sv == null: return
	if not _require_same_place(s, uid, sv.id): return
	if sv.get("gear") == null:
		sv.gear = {"weapon": null, "armor": null, "book": null, "tool": null}
	var old = sv.gear.get(slot)
	H.remove_from_hand(s, uid)
	if old:
		(s.stockpile if holder == "stockpile" else s.survivors[holder].pack).append(old)
	sv.gear[slot] = uid
	if item.get("gun"):
		sv.ammo = sv.get("ammo", 0) + item.gun.ammo
	H.add_log(s, "equip", {"survivorId": sv.id, "card": s.cards[uid], "slot": slot})


# ---------------------------------------------------------------- cards

static func play_card(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var uid = a.get("cardUid")
	var item = _require_card(s, uid)
	if item == null: return
	var spend := func(): if not Content.is_permanent(item): H.discard_card(s, uid)
	if item.get("growMap"):
		if not _require_home(s, uid): return
		H.discard_card(s, uid)
		City.grow_city(s)
		return
	match item.type:
		"food":
			if not _require_home(s, uid): return
			spend.call()
			H.change_food(s, item.value * Content.FOOD.MEALS, "played")
		"medicine":
			var sv = _require_survivor(s, a.get("targetSurvivorId"))
			if sv == null: return
			if not Err.ok(sv.wounds > 0 or sv.frostbite, "notWounded"): return
			if not _require_same_place(s, uid, sv.id): return
			spend.call()
			for i in item.value:
				H.heal_survivor(s, sv.id)
		"tools":
			if not _require_home(s, uid): return
			if not Err.ok(Sel.free_zombie_slots(s, "colony") > 0, "noBarricadeSpace"): return
			spend.call()
			H.add_barricades(s, "colony", item.value)
		"junk":
			var h = Sel.holder_of(s, uid)
			var t = a.get("targetSurvivorId")
			var sv = _require_survivor(s, t if t != null else _default_target(s, h))
			if sv == null: return
			if not _require_same_place(s, uid, sv.id): return
			if not Err.ok(sv.ap < Sel.ap_max(s, sv.id), "energyFull"): return
			spend.call()
			H.gain_energy(s, Content.ENERGY.JUNK * item.value * (2 if Sel.team_has_ability(s, "haggler") else 1), sv.id)
		"consumable":
			var h = Sel.holder_of(s, uid)
			var t = a.get("targetSurvivorId")
			var sv = _require_survivor(s, t if t != null else _default_target(s, h))
			if sv == null: return
			if not _require_same_place(s, uid, sv.id): return
			var u: Dictionary = item.use
			if u.get("ammo"):
				var w = Sel.gear_of(s, sv.id).weapon
				if not Err.ok(w != null and w.get("gun"), "needGun"): return
			if u.get("burn") and not Err.ok(s.locations[sv.location].zombies > 0, "noZombiesHere"): return
			if not u.get("ammo") and not u.get("burn"):
				if not Err.ok((u.get("hp") and sv.hp < Content.RULES.HP_MAX) or (u.get("ap") and sv.ap < Sel.ap_max(s, sv.id)), "energyFull"): return
			spend.call()
			if u.get("hp"):
				H.heal_hp(s, sv.id, u.hp + (5 if _holder_trait(s, h) == "medic" else 0))
			if u.get("ap"):
				H.gain_energy(s, u.ap, sv.id)
			if u.get("ammo"):
				sv.ammo = sv.get("ammo", 0) + u.ammo
			if u.get("burn"):
				H.credit_kills(s, H.remove_zombies(s, sv.location, u.burn))
		"material":
			Err.ok(false, "craftInstead")
			return
		"survivor":
			H.remove_from_hand(s, uid)
			H.change_morale(s, 1 if H.recruit_survivor(s) else 2, "newcomer")
		"fuel":
			Err.ok(false, "fuelIsPlayedWhenMoving")
			return
		"weapon", "armor", "book", "gadget":
			Err.ok(false, "equipInstead")
			return
		_:
			Err.ok(false, "unplayable")
			return
	H.add_log(s, "play", {"card": s.cards[uid], "type": item.type})


static func contribute(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var uid = a.get("cardUid")
	if _require_card(s, uid) == null: return
	if not _require_home(s, uid): return
	if not Err.ok(s.crisis != null, "noCrisis"): return
	H.remove_from_hand(s, uid)
	s.crisis.contributions.append(uid)
	H.add_log(s, "contribute", {"card": s.cards[uid]})


static func deposit(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var goal: Dictionary = Sel.scenario_def(s).goal
	if not Err.ok(goal.type == "deposit", "scenarioHasNoDeposit"): return
	var uid = a.get("cardUid")
	var it = _require_card(s, uid)
	if it == null: return
	if not Err.ok(it.type == goal.item, "wrongItemType"): return
	if not _require_home(s, uid): return
	H.remove_from_hand(s, uid)
	s.scenario.deposited += 1
	H.add_log(s, "deposit", {"card": s.cards[uid], "total": s.scenario.deposited})


static func use_ability(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var id = a.get("survivorId")
	var sv = _require_survivor(s, id)
	if sv == null: return
	if not Err.ok(_ability(id).type == "healer", "noActiveAbility"): return
	if not Err.ok(not p.abilityUsed.get(id, false), "abilityUsed"): return
	var tid = a.get("targetSurvivorId")
	var target = s.survivors.get(tid) if tid != null else null
	if not Err.ok(target != null and target.alive and target.location == sv.location, "targetNotHere"): return
	if not Err.ok(target.wounds > 0 or target.frostbite, "notWounded"): return
	p.abilityUsed[id] = true
	H.heal_survivor(s, tid)


static func give(s: Dictionary, a: Dictionary) -> void:
	var p = _require_turn(s)
	if p == null: return
	var uid = a.get("cardUid")
	if _require_card(s, uid) == null: return
	var from = Sel.holder_of(s, uid)
	var to_id = a.get("toSurvivorId")
	if not to_id:
		if not Err.ok(from != "stockpile" and Sel.place_of_item(s, uid) == "colony", "notHome"): return
		H.remove_from_hand(s, uid)
		s.stockpile.append(uid)
		return
	var to = _require_survivor(s, to_id)
	if to == null: return
	if not Err.ok(from != to_id, "sameHolder"): return
	if not _require_same_place(s, uid, to_id): return
	if not Err.ok(Sel.pack_free(s, to_id) > 0, "packFull"): return
	H.remove_from_hand(s, uid)
	to.pack.append(uid)
	H.add_log(s, "give", {"survivorId": to_id if from == "stockpile" else from, "card": s.cards[uid], "to": to_id})


static func _gather(s: Dictionary, needs: Dictionary):
	var used := []
	for item_id in needs:
		var n: int = needs[item_id]
		var have: Array = s.stockpile.filter(func(u): return s.cards[u] == item_id and not used.has(u)).slice(0, n)
		if not Err.ok(have.size() == n, "missingMaterials", item_id):
			return null
		used.append_array(have)
	return used


static func craft(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var rid = a.get("recipeId")
	var r = Content.RECIPES.get(rid) if rid != null else null
	if not Err.ok(r != null, "noSuchRecipe", rid): return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	if not Err.ok(sv.location == "colony", "mustBeInColony"): return
	if not Err.ok(Sel.base_level(s, "workshop") >= 1, "needWorkshop"): return
	var cost := maxi(1, r.ap - 3 * (Sel.base_level(s, "workshop") - 1))
	var used = _gather(s, r.needs)
	if used == null: return
	if not Err.ok(sv.ap >= cost, "notEnoughEnergy"): return
	sv.ap -= cost
	sv.acted = true
	for u in used:
		H.discard_card(s, u)
	var uid := "k%d" % s.cards.size()
	s.cards[uid] = r.makes
	s.stockpile.append(uid)
	s.stats.crafts += 1
	H.add_log(s, "craft", {"survivorId": id, "card": r.makes})


static func build(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	if not Err.ok(sv.location == "colony", "mustBeInColony"): return
	var bid = a.get("buildingId")
	var nxt = Sel.next_level(s, bid) if bid != null else null
	if not Err.ok(nxt != null, "maxLevel", bid): return
	var put := mini(Content.K.BUILD_STEP, nxt.ap - (nxt.spent if nxt.started else 0))
	if not Err.ok(sv.ap >= put, "notEnoughEnergy"): return
	if not nxt.started:
		var used = _gather(s, nxt.needs)
		if used == null: return
		for u in used:
			H.discard_card(s, u)
		s.building[bid] = 0
	sv.ap -= put
	sv.acted = true
	s.building[bid] += put
	if s.building[bid] >= nxt.ap:
		s.building.erase(bid)
		s.base[bid] = nxt.level
		s.stats.builds += 1
		H.add_log(s, "built", {"buildingId": bid, "level": nxt.level})
	else:
		H.add_log(s, "building", {"survivorId": id, "buildingId": bid, "n": put})


# ---------------------------------------------------------------- rest

static func nap(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var id = a.get("survivorId")
	var sv = _require_active(s, id)
	if sv == null: return
	if not Err.ok(sv.location == "colony", "mustBeInColony"): return
	if not Err.ok(not sv.moved and not sv.acted, "alreadyActed"): return
	sv.napped = true
	H.gain_energy(s, Content.REST.NAP_AP, id)
	H.heal_hp(s, id, Content.REST.NAP_HP)
	H.add_log(s, "nap", {"survivorId": id})


static func set_rest(s: Dictionary, a: Dictionary) -> void:
	if _require_turn(s) == null: return
	var id = a.get("survivorId")
	var sv = _require_survivor(s, id)
	if sv == null: return
	var mode = a.get("mode")
	if not Err.ok(mode == "sleep" or mode == "guard", "badRest"): return
	if mode == "guard" and not Err.ok(sv.location == "colony", "mustBeInColony"): return
	sv.rest = mode


static func finish_turn(s: Dictionary, _a: Dictionary) -> void:
	if _require_turn(s) == null: return
	Flow.end_turn(s)


static func _holder_trait(s: Dictionary, holder):
	if holder != null and holder != "stockpile":
		var v = s.survivors.get(holder)
		return v.get("trait") if v != null else null
	for id in s.survivors:
		var v: Dictionary = s.survivors[id]
		if v.alive and v.location == "colony" and v.get("trait") == "medic":
			return "medic"
	return null
