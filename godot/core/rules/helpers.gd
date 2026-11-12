## src/core/rules/helpers.js: low-level state changes shared by the rules (they change the draft state s).
class_name H
extends RefCounted


## add_log(s, key, params): params with a null value are kept (JS null); leave a key out for JS undefined.
static func add_log(s: Dictionary, k: String, params: Dictionary = {}) -> void:
	var e := {"r": s.day, "k": k}
	e.merge(params, true)
	s.log.append(e)
	if s.log.size() > Content.RULES.MAX_LOG:
		s.log = s.log.slice(s.log.size() - Content.RULES.MAX_LOG)


## Params for a log line, leaving out JS-undefined values (null here).
static func p(d: Dictionary) -> Dictionary:
	var out := {}
	for k in d:
		if d[k] != null:
			out[k] = d[k]
	return out


static func change_morale(s: Dictionary, delta: int, reason = null) -> void:
	if not delta:
		return
	s.morale = maxi(0, mini(s.maxMorale, s.morale + delta))
	add_log(s, "morale", p({"delta": delta, "reason": reason, "value": s.morale}))


static func change_food(s: Dictionary, delta: int, reason = null) -> void:
	if not delta:
		return
	s.food = maxi(0, s.food + delta)
	add_log(s, "food", p({"delta": delta, "reason": reason, "value": s.food}))


static func draw_items(s: Dictionary, loc_id: String, n: int, survivor_id = null) -> Array:
	var loc = s.locations.get(loc_id)
	var drawn := []
	if loc == null or loc.deck == null:
		return drawn
	var deck: Array = loc.deck
	var i := 0
	while i < n and deck.size():
		drawn.append(deck.pop_back())
		i += 1
	(s.survivors[survivor_id].pack if survivor_id else s.stockpile).append_array(drawn)
	if drawn.size():
		add_log(s, "draw", {"locationId": loc_id, "count": drawn.size()})
	return drawn


static func remove_from_hand(s: Dictionary, uid: String) -> bool:
	var lists := [s.stockpile]
	for id in s.survivors:
		var sv: Dictionary = s.survivors[id]
		if sv.get("pack") != null:
			lists.append(sv.pack)
	for list in lists:
		var i: int = list.find(uid)
		if i != -1:
			list.remove_at(i)
			return true
	return false


static func unpack(s: Dictionary, survivor_id: String) -> void:
	var sv = s.survivors.get(survivor_id)
	if sv == null or not sv.alive or sv.location != "colony" or sv.get("pack") == null or not sv.pack.size():
		return
	add_log(s, "unpack", {"survivorId": survivor_id, "count": sv.pack.size()})
	s.stockpile.append_array(sv.pack)
	sv.pack = []


static func discard_card(s: Dictionary, uid: String) -> void:
	remove_from_hand(s, uid)


static func kill_survivor(s: Dictionary, survivor_id: String, cause: String) -> void:
	var sv = s.survivors.get(survivor_id)
	if sv == null or not sv.alive:
		return
	sv.alive = false
	sv.deathCause = cause
	var t: Dictionary = s.team
	if sv.location == "colony":
		var g = sv.get("gear") if sv.get("gear") != null else {}
		for uid in g.values() + (sv.pack if sv.get("pack") != null else []):
			if uid:
				s.stockpile.append(uid)
	sv.pack = []
	sv.gear = {"weapon": null, "armor": null, "book": null, "tool": null}
	t.survivors = t.survivors.filter(func(id): return id != survivor_id)
	t.fallen.append(survivor_id)
	add_log(s, "death", {"survivorId": survivor_id, "cause": cause, "location": sv.location})
	change_morale(s, -1, "survivorDied")
	if t.survivors.size() == 0:
		recruit_survivor(s)


static func recruit_survivor(s: Dictionary) -> bool:
	if not s.survivorDeck.size() or s.team.survivors.size() >= Content.RULES.TEAM_MAX:
		return false
	var id: String = s.survivorDeck.pop_back()
	s.survivors[id] = new_survivor(id, "colony")
	s.survivors[id].ap = Sel.ap_max(s, id)
	give_trait(s, id)
	s.team.survivors.append(id)
	add_log(s, "recruit", {"survivorId": id, "location": "colony"})
	return true


static func new_survivor(id: String, location: String) -> Dictionary:
	return {"id": id, "location": location, "wounds": 0, "frostbite": false, "alive": true, "moved": false, "acted": false, "ap": 0, "hp": Content.RULES.HP_MAX, "ammo": 0, "pack": [], "xp": {"fight": 0, "search": 0}, "rest": "sleep", "napped": false, "gear": {"weapon": null, "armor": null, "book": null, "tool": null}}


static func wound_survivor(s: Dictionary, survivor_id: String, cause := "wound") -> void:
	var sv = s.survivors.get(survivor_id)
	if sv == null or not sv.alive:
		return
	sv.wounds += 1
	add_log(s, "wound", {"survivorId": survivor_id, "wounds": sv.wounds, "cause": cause})
	if sv.wounds >= Sel.wound_limit(survivor_id):
		kill_survivor(s, survivor_id, "wounds")


static func heal_survivor(s: Dictionary, survivor_id: String) -> bool:
	var sv = s.survivors.get(survivor_id)
	if sv == null or not sv.alive:
		return false
	if sv.frostbite:
		sv.frostbite = false
	elif sv.wounds > 0:
		sv.wounds -= 1
	else:
		return false
	add_log(s, "heal", {"survivorId": survivor_id})
	return true


static func add_zombies(s: Dictionary, loc_id: String, n: int, reason = null) -> void:
	var loc: Dictionary = s.locations[loc_id]
	var slots: int = CityMap.loc_def(s, loc_id).zombieSlots
	for i in n:
		if loc.barricades > 0:
			loc.barricades -= 1
			add_log(s, "barricadeBroken", {"locationId": loc_id})
		elif loc.zombies < slots:
			loc.zombies += 1
		elif loc_id != "colony":
			add_zombies(s, "colony", 1, "overflow")
		else:
			_overrun(s, loc_id)
	if n > 0:
		add_log(s, "spawn", p({"locationId": loc_id, "n": n, "reason": reason, "zombies": loc.zombies}))


static func _overrun(s: Dictionary, loc_id: String) -> void:
	add_log(s, "overrun", {"locationId": loc_id})
	var victims := Sel.survivors_at(s, loc_id)
	if not victims.size():
		return
	JS.sort(victims, func(a, b): return (a.hp - b.hp) if a.hp != b.hp else (Sel.survivor_def(a.id).influence - Sel.survivor_def(b.id).influence))
	damage_survivor(s, victims[0].id, Content.RULES.OVERRUN_HP, "overrun")


static func remove_zombies(s: Dictionary, loc_id: String, n: int) -> int:
	var loc: Dictionary = s.locations[loc_id]
	var removed := mini(n, loc.zombies)
	loc.zombies -= removed
	return removed


static func add_barricades(s: Dictionary, loc_id: String, n: int) -> int:
	var loc: Dictionary = s.locations[loc_id]
	var slots: int = CityMap.loc_def(s, loc_id).zombieSlots
	var added := maxi(0, mini(n, slots - loc.zombies - loc.barricades))
	loc.barricades += added
	if added:
		add_log(s, "barricade", {"locationId": loc_id, "n": added})
	return added


static func credit_kills(s: Dictionary, n: int) -> void:
	if not n:
		return
	s.totalKills += n
	if s.get("stats") != null:
		s.stats.kills += n
	s.team.kills += n


static func draw_from_deck(s: Dictionary, deck_key: String, discard_key: String):
	if not s[deck_key].size():
		s[deck_key] = Rng.shuffle(s, s[discard_key])
		s[discard_key] = []
	return s[deck_key].pop_back() if s[deck_key].size() else null


static func spend_energy(s: Dictionary, cost: int, survivor_id: String) -> void:
	var sv = s.survivors.get(survivor_id)
	if not Err.ok(sv != null and sv.ap >= cost, "notEnoughEnergy"):
		return
	sv.ap -= cost


static func gain_energy(s: Dictionary, n: int, survivor_id: String) -> void:
	var sv = s.survivors.get(survivor_id)
	if sv == null or not sv.alive:
		return
	sv.ap = maxi(0, mini(Sel.ap_max(s, survivor_id), sv.get("ap", 0) + n))


static func damage_survivor(s: Dictionary, survivor_id: String, n: int, cause := "fight") -> void:
	var sv = s.survivors.get(survivor_id)
	if sv == null or not sv.alive or n <= 0:
		return
	sv.hp = maxi(0, sv.get("hp", Content.RULES.HP_MAX) - n)
	add_log(s, "hurt", {"survivorId": survivor_id, "n": n, "hp": sv.hp, "cause": cause})
	if sv.hp <= 0:
		kill_survivor(s, survivor_id, cause)


static func heal_hp(s: Dictionary, survivor_id: String, n: int) -> void:
	var sv = s.survivors.get(survivor_id)
	if sv != null and sv.alive:
		sv.hp = mini(Content.RULES.HP_MAX, sv.get("hp", Content.RULES.HP_MAX) + n)


static func give_trait(s: Dictionary, id: String) -> void:
	var sv = s.survivors.get(id)
	if sv != null and not sv.get("trait"):
		sv.trait = Content.TRAITS[floori(Rng.random(s) * Content.TRAITS.size())]


static func gain_xp(s: Dictionary, survivor_id: String, kind: String) -> void:
	var sv = s.survivors.get(survivor_id)
	if sv == null:
		return
	if sv.get("xp") == null:
		sv.xp = {"fight": 0, "search": 0}
	var before := floori(sv.xp[kind] / float(Content.XP.PER_LEVEL))
	sv.xp[kind] += 1
	var after := floori(sv.xp[kind] / float(Content.XP.PER_LEVEL))
	if after > before and after <= Content.XP.MAX_LEVEL:
		add_log(s, "levelUp", {"survivorId": survivor_id, "kind": kind, "level": after})
