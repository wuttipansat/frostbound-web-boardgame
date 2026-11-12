## src/ai/simpleBot.js + simulate.js: the rule-based bot that plays the solo team, and a headless game driver.
class_name Bot
extends RefCounted

const EFFECT_SCORE_KEYS := ["morale", "food", "recruit", "spawn", "removeZombies", "barricade", "drawItem", "discard", "wound", "heal", "energy", "moveHome", "starvation"]


## simulate.js mulberry: the bot's own random stream (never the game's).
static func mulberry(seed: int) -> Callable:
	var st := [JS.u32(seed)]
	return func() -> float:
		st[0] = JS.u32(st[0] + 0x6d2b79f5)
		var t: int = st[0]
		t = JS.imul(t ^ JS.ushr(t, 15), t | 1)
		t = JS.i32(t ^ JS.i32(t + JS.imul(t ^ JS.ushr(t, 7), t | 61)))
		return float(JS.u32(t ^ JS.ushr(t, 14))) / 4294967296.0


## A whole bot game: {state, steps, errors}. on_step(state, action) after each legal action.
static func simulate(opts: Dictionary = {}) -> Dictionary:
	var seed: int = opts.get("seed", 1)
	var state := GameState.create_game({"scenarioId": opts.get("scenarioId", "beacon"), "seed": seed, "difficulty": opts.get("difficulty", "normal"), "days": opts.get("days", 40), "fullTown": opts.get("fullTown", false)})
	var bot_opts := {"random": mulberry(seed * 7919 + 13), "chaos": opts.get("chaos", 0)}
	var errors := []
	var steps := 0
	var max_steps: int = opts.get("maxSteps", 5000)
	var on_step = opts.get("onStep")
	while state.phase != "gameOver" and steps < max_steps:
		steps += 1
		var action = bot_action(state, bot_opts)
		var res := Reducer.try_reduce(state, action if action != null else {})
		if res.ok:
			state = res.state
			if on_step != null:
				on_step.call(state, action)
			continue
		errors.append({"action": action, "error": res.error})
		if state.phase != "turn":
			break
		state = Reducer.try_reduce(state, {"type": "END_TURN"}).state
	return {"state": state, "steps": steps, "errors": errors}


static func _crawler_wants(s: Dictionary) -> Array:
	if s.scenario.id != "crawler":
		return []
	var lv: int = s.get("base", {}).get("crawler", 0)
	if lv >= Content.CRAWLER.levels.size() or s.get("building", {}).get("crawler") != null:
		return []
	var needs: Dictionary = Content.CRAWLER.levels[lv].needs
	return needs.keys().filter(func(id): return s.stockpile.filter(func(u): return s.cards[u] == id).size() < needs[id])


static func _num(e: Dictionary, k: String) -> float:
	var v = e.get(k)
	return float(v) if v != null else NAN


static func _effect_score(e: Dictionary) -> float:
	match e.type:
		"morale": return 3 * _num(e, "delta")
		"food": return _num(e, "delta")
		"recruit": return 2
		"spawn": return -1.2 * _num(e, "n")
		"removeZombies": return _num(e, "n")
		"barricade": return 0.8 * _num(e, "n")
		"drawItem": return _num(e, "n")
		"discard": return -0.8 * _num(e, "n")
		"wound": return -2
		"heal": return 1.5
		"energy": return _num(e, "delta") / 20
		"moveHome": return 0.5
		"starvation": return -3 * _num(e, "delta")
	return 0


static func _score_choice(choice: Dictionary) -> float:
	var sum := 0.0
	for e in choice.effects:
		sum += _effect_score(e)
	return sum


static func _pick_one(list: Array, opts: Dictionary):
	if not list.size():
		return null
	if opts.chaos and opts.random.call() < opts.chaos:
		return list[floori(opts.random.call() * list.size())]
	return list[0]


static func bot_action(s: Dictionary, opts: Dictionary = {}):
	if not opts.has("random"):
		opts.random = func(): return randf()
	if not opts.has("chaos"):
		opts.chaos = 0
	var p: Dictionary = s.team
	match s.phase:
		"draft":
			var rank := func(id):
				var d = Sel.survivor_def(id)
				return d.attack + d.search - d.energy / 25.0
			var ranked: Array = JS.sort(p.draftOptions.duplicate(), func(a, b): return rank.call(a) - rank.call(b))
			var n: int = Content.RULES.TEAM_START
			var picks := ranked.slice(ranked.size() - n) if opts.chaos and opts.random.call() < opts.chaos else ranked.slice(0, n)
			return {"type": "DRAFT_PICK", "survivorIds": picks}
		"crossroads":
			var card: Dictionary = Content.CROSSROADS_BY_ID[s.pendingCrossroads.cardId]
			var scores: Array = card.choices.map(func(c): return _score_choice(c))
			var choice := 1 if scores[1] > scores[0] else 0
			if opts.chaos and opts.random.call() < opts.chaos:
				choice = 0 if opts.random.call() < 0.5 else 1
			return {"type": "RESOLVE_CROSSROADS", "choice": choice}
		"turn":
			return _turn_action(s, p, opts)
	return null


static func _play(uid, target = null) -> Dictionary:
	var a := {"type": "PLAY_CARD", "cardUid": uid}
	if target != null:
		a.targetSurvivorId = target
	return a


static func _move(id, to, fuel = null) -> Dictionary:
	var a := {"type": "MOVE", "survivorId": id, "toLocation": to}
	if fuel != null:
		a.fuelCardUid = fuel
	return a


static func _turn_action(s: Dictionary, p: Dictionary, opts: Dictionary) -> Dictionary:
	var candidates := []
	var survivors := Sel.alive_survivors(s)
	var crisis = Sel.crisis_def(s)
	var items: Array = s.stockpile.duplicate()
	for sv in survivors:
		if sv.get("pack") != null:
			items.append_array(sv.pack)
	var cards_of := func(type) -> Array: return items.filter(func(u): return Sel.item_of(s, u).type == type)
	var crawler: bool = s.scenario.id == "crawler"

	if p.pick != null:
		var rank := func(u): return Sel.item_of(s, u).get("tier", 0) * 10 + Sel.item_of(s, u).get("value", 0)
		var worst = JS.sort(p.pick.uids.duplicate(), func(a, b): return rank.call(a) - rank.call(b))[0]
		return {"type": "RETURN_CARD", "cardUid": worst}

	if crisis != null:
		var added: int = s.crisis.contributions.size()
		var keep := (_crawler_wants(s) + ["engine-part", "heater-part"]) if crawler else []
		var match_ = null
		for u in cards_of.call(crisis.item):
			if not keep.has(s.cards[u]):
				match_ = u
				break
		if match_ == null:
			for u in items:
				if Sel.item_of(s, u).get("counts") == crisis.item and not keep.has(s.cards[u]):
					match_ = u
					break
		if match_ != null and Sel.crisis_score(s) < Sel.crisis_requirement(s) + 1 and added < 6:
			candidates.append({"type": "CONTRIBUTE", "cardUid": match_})

	var goal: Dictionary = Sel.scenario_def(s).goal
	if goal.type == "deposit" and survivors.any(func(sv): return sv.location == "colony"):
		var keep_for_crisis := 1 if crisis != null and crisis.item == goal.item else 0
		var fuel: Array = cards_of.call(goal.item)
		if fuel.size() > keep_for_crisis:
			candidates.append({"type": "DEPOSIT", "cardUid": fuel[fuel.size() - 1]})

	if s.food < Sel.food_needed(s) + (99 if goal.type == "stockpile" else 0):
		var all_food: Array = cards_of.call("food")
		var food := all_food.filter(func(_u): return (crisis == null or crisis.item != "food") or all_food.size() > 1)
		if food.size():
			candidates.append(_play(food[0]))

	var hurt = null
	for sv in survivors:
		if sv.wounds > 0 or sv.frostbite:
			hurt = sv
			break
	var meds: Array = cards_of.call("medicine")
	if hurt != null and meds.size() and (crisis == null or crisis.item != "medicine"):
		candidates.append(_play(meds[0], hurt.id))
	var healer = null
	for sv in survivors:
		if Sel.ability_type(sv.id) == "healer" and not p.abilityUsed.get(sv.id, false):
			healer = sv
			break
	if healer != null:
		for oid in s.survivors:
			var o: Dictionary = s.survivors[oid]
			if o.alive and o.location == healer.location and (o.wounds > 0 or o.frostbite):
				candidates.append({"type": "USE_ABILITY", "survivorId": healer.id, "targetSurvivorId": o.id})
				break

	for uid in items:
		var item = Sel.item_of(s, uid)
		var slot = Content.gear_slot(item)
		if slot == null:
			continue
		var at = Sel.place_of_item(s, uid)
		var who = null
		for sv in survivors:
			var w = Sel.gear_of(s, sv.id)[slot]
			if sv.location == at and (w == null or (item.get("tier") != null and w.get("tier") != null and item.tier > w.tier)):
				who = sv
				break
		if who != null:
			candidates.push_front({"type": "EQUIP", "cardUid": uid, "survivorId": who.id})
			break

	for uid in cards_of.call("consumable"):
		var u: Dictionary = Sel.item_of(s, uid).use
		var at = Sel.place_of_item(s, uid)
		for sv in survivors.filter(func(x): return x.location == at):
			var want: bool = (u.get("hp") and sv.hp <= 100 - u.hp) or (u.get("ap") and not u.get("hp") and sv.ap < 25) or (u.get("ammo") != null and u.get("ammo") != 0) \
				or (u.get("burn") and s.locations[sv.location].zombies >= 2)
			if want:
				candidates.append(_play(uid, sv.id))

	var builder = null
	for sv in survivors:
		if sv.location == "colony" and sv.ap >= 20 and sv.ap < 60 and not sv.napped:
			builder = sv
			break
	if crawler:
		for sv in survivors:
			if sv.location == "colony" and sv.ap >= 20 and not sv.napped:
				candidates.push_front({"type": "BUILD", "buildingId": "crawler", "survivorId": sv.id})
				break
	var wants := _crawler_wants(s)
	var saving: bool = (crawler and wants.any(func(id): return ["wood", "scrap", "cloth"].has(id))) or (crawler and s.get("base", {}).get("crawler", 0) == 0)
	if builder != null and not saving:
		for b in ["workshop", "dorm", "greenhouse", "wall", "infirmary", "radio"]:
			candidates.append({"type": "BUILD", "buildingId": b, "survivorId": builder.id})
	var crafter = null
	for sv in survivors:
		if sv.location == "colony" and sv.ap >= 20:
			crafter = sv
			break
	if crafter != null and not saving and s.food >= Sel.food_needed(s):
		for rid in ["scrap-plate", "sled", "baseball-bat", "bandage"]:
			candidates.append({"type": "CRAFT", "recipeId": rid, "survivorId": crafter.id})

	var recruits: Array = cards_of.call("survivor")
	if recruits.size() and s.food >= Sel.food_needed(s) * 4:
		candidates.append(_play(recruits[0]))

	for u in items:
		if s.cards[u] == "city-map-piece" and Sel.place_of_item(s, u) == "colony":
			candidates.push_front(_play(u))
			break
	_energy_actions(s, p, survivors, candidates, cards_of, opts)
	for c in candidates:
		if Reducer.try_reduce(s, c).ok:
			if opts.chaos and opts.random.call() < opts.chaos:
				var ok := candidates.filter(func(x): return Reducer.try_reduce(s, x).ok)
				return ok[floori(opts.random.call() * ok.size())]
			return c
	return {"type": "END_TURN"}


static func _energy_actions(s: Dictionary, _p: Dictionary, survivors: Array, candidates: Array, cards_of: Callable, opts: Dictionary) -> void:
	var can := func(sv, kind: String, to = null) -> bool:
		if sv.napped or sv.ap < Sel.action_cost(s, sv.id, kind, to):
			return false
		if kind == "move" and Sel.leave_damage(s, sv.id) >= sv.hp - 10:
			return false
		if kind != "attack":
			return true
		var f := Sel.fight_preview(s, sv.id)
		return f.ammo > 0 if f.gun else f.hp < sv.hp - 25
	var search_ap: int = Content.ENERGY.SEARCH
	# 1. Home before dark.
	for sv in survivors:
		if sv.location == "colony" or sv.napped:
			continue
		var home := Sel.action_cost(s, sv.id, "move", "colony")
		if sv.ap >= home and (sv.ap < home + search_ap or Sel.pack_free(s, sv.id) == 0 or sv.hp < 45):
			candidates.append(_move(sv.id, "colony"))
	var goal: Dictionary = Sel.scenario_def(s).goal
	for sv in survivors:
		var loc: Dictionary = s.locations[sv.location]
		var hunt: bool = goal.type == "kills" and sv.wounds < 2
		if loc.zombies > 0 and can.call(sv, "attack") and hunt:
			candidates.append({"type": "ATTACK", "survivorId": sv.id})
		if loc.zombies >= 2 and can.call(sv, "attack"):
			candidates.append({"type": "ATTACK", "survivorId": sv.id})
		if sv.location != "colony" and loc.deck.size() and can.call(sv, "search"):
			candidates.append({"type": "SEARCH", "survivorId": sv.id})
		if loc.zombies > 0 and can.call(sv, "attack"):
			candidates.append({"type": "ATTACK", "survivorId": sv.id})
	for sv in survivors:
		if Sel.free_zombie_slots(s, sv.location) > 0 and can.call(sv, "barricade") and sv.location == "colony" and Sel.siege_forecast(s).hits > 0:
			candidates.append({"type": "BARRICADE", "survivorId": sv.id})
	# 5. Walk.
	var carrying: int = cards_of.call(goal.item).size() if goal.type == "deposit" else 0
	var late: bool = bool(s.scenario.days) and s.day >= s.scenario.days - 1
	for sv in survivors:
		var loc: Dictionary = s.locations[sv.location]
		var bring_home: bool = carrying >= 2 or (carrying >= 1 and late)
		var deck_empty: bool = loc.deck == null or not loc.deck.size()
		if sv.location != "colony" and (sv.wounds >= 2 or deck_empty or bring_home or Sel.pack_free(s, sv.id) == 0 or sv.hp < 40) and can.call(sv, "move", "colony"):
			var fuel: Array = cards_of.call("fuel")
			candidates.append(_move(sv.id, "colony", fuel[0] if s.locations.colony.zombies and fuel.size() else null))
		elif goal.type == "kills" and sv.wounds < 2:
			var prey_list := CityMap.outside_of(s) + ["colony"]
			prey_list = prey_list.filter(func(l): return l != sv.location and s.locations[l].zombies >= 2 and Sel.free_survivor_slots(s, l) > 0 \
				and sv.ap >= Sel.action_cost(s, sv.id, "move", l) + Sel.action_cost(s, sv.id, "attack"))
			JS.sort(prey_list, func(a, b): return s.locations[b].zombies - s.locations[a].zombies)
			if prey_list.size() and loc.zombies == 0:
				candidates.append(_move(sv.id, prey_list[0]))
			elif sv.location == "colony":
				_push_out(s, sv, candidates, can, opts)
		elif sv.location == "colony" and sv.wounds < 2:
			_push_out(s, sv, candidates, can, opts)
	# 6. Junk is energy.
	var junk: Array = cards_of.call("junk")
	var tired_list: Array = JS.sort(survivors.duplicate(), func(a, b): return a.ap - b.ap)
	if junk.size() and tired_list.size() and tired_list[0].ap < 30:
		candidates.append(_play(junk[0], tired_list[0].id))
	# 7. A spent survivor guards when zombies are due.
	var guard = null
	for sv in survivors:
		if sv.location == "colony" and sv.ap < 15 and sv.rest != "guard":
			guard = sv
			break
	if guard != null and Sel.siege_forecast(s).hits > 0 and not survivors.any(func(sv): return sv.rest == "guard"):
		candidates.append({"type": "SET_REST", "survivorId": guard.id, "mode": "guard"})


static func _push_out(s: Dictionary, sv: Dictionary, candidates: Array, can: Callable, opts: Dictionary) -> void:
	var options := CityMap.outside_of(s).filter(func(l): return Sel.free_survivor_slots(s, l) > 0 and s.locations[l].deck.size() and can.call(sv, "move", l))
	var goal: Dictionary = Sel.scenario_def(s).goal
	var hungry: bool = s.food < Sel.food_needed(s) + 2 or goal.type == "stockpile"
	var hunting: bool = goal.type == "kills"
	var want := _crawler_wants(s)
	var low_food: bool = s.food < Sel.food_needed(s) * 2
	var score := func(l: String) -> float:
		var deck = CityMap.loc_def(s, l).get("deck")
		var loot := 0
		var food_loot := 0
		if deck != null:
			for id in want:
				loot += deck.get(id, 0)
			for id in deck:
				if Content.ITEMS[id].type == "food":
					food_loot += deck[id]
		var z: int = s.locations[l].zombies
		return (-z * 2 if hunting else z) - (3 if hungry and l == "grocery" else 0) - mini(4, loot) - (food_loot * 2 if low_food else 0) \
			+ Sel.action_cost(s, sv.id, "move", l) / 4.0
	JS.sort(options, func(a, b):
		var d: float = score.call(a) - score.call(b)
		return d if d != 0 else opts.random.call() - 0.5)
	var def = Sel.survivor_def(sv.id)
	var preferred = def.ability.get("location") if def.ability.type == "doubleSearch" and options.has(def.ability.get("location")) else (options[0] if options.size() else null)
	if preferred != null and not sv.napped and sv.ap >= Sel.action_cost(s, sv.id, "move", preferred) + Content.ENERGY.SEARCH:
		candidates.append(_move(sv.id, preferred))
