## src/core/rules/flow.js: draft, rounds, the colony phase (dusk and night), end of game.
class_name Flow
extends RefCounted

const RARE_PARTS := ["engine-part", "heater-part"]
const RESTOCK_MIN := 6


static func draft_pick(s: Dictionary, a: Dictionary) -> void:
	if not Err.ok(s.phase == "draft", "wrongPhase", s.phase):
		return
	var t: Dictionary = s.team
	if not Err.ok(not t.drafted, "alreadyDrafted"):
		return
	var ids = a.get("survivorIds")
	var uniq := {}
	if ids is Array:
		for id in ids:
			uniq[id] = true
	if not Err.ok(ids is Array and ids.size() == Content.RULES.TEAM_START and uniq.size() == ids.size(), "badDraft"):
		return
	if not Err.ok(ids.all(func(id): return t.draftOptions.has(id)), "notInDraftOptions"):
		return
	t.survivors = ids.duplicate()
	t.drafted = true
	finish_draft(s)


static func finish_draft(s: Dictionary) -> void:
	var t: Dictionary = s.team
	for id in t.survivors:
		s.survivors[id] = H.new_survivor(id, "colony")
		s.survivors[id].ap = Sel.ap_max(s, id)
		H.give_trait(s, id)
	s.survivorDeck.append_array(t.draftOptions.filter(func(id): return not t.survivors.has(id)))
	t.draftOptions = []
	s.survivorDeck = Rng.shuffle(s, s.survivorDeck)
	H.add_log(s, "draftDone", {"survivorIds": t.survivors.duplicate()})
	for i in Content.RULES.STARTING_HAND:
		var stocked := CityMap.outside_of(s).filter(func(l): return s.locations[l].deck.size())
		if stocked.size():
			H.draw_items(s, Rng.pick(s, stocked), 1)
	start_round(s)


static func start_round(s: Dictionary) -> void:
	var crisis_id = H.draw_from_deck(s, "crisisDeck", "crisisDiscard")
	s.time = "dawn"
	s.crisis = {"id": crisis_id, "contributions": []}
	H.add_log(s, "roundStart", {"day": s.day, "crisisId": crisis_id})
	if s.mission == null and (s.day - 1) % 7 == 0:
		var m: Dictionary = Content.MISSIONS[floori(Rng.random(s) * Content.MISSIONS.size())]
		s.mission = {"id": m.id, "stat": m.stat, "target": m.target, "base": s.stats[m.stat], "until": s.day + 6}
		H.add_log(s, "missionNew", {"id": m.id, "target": m.target})
	restock(s)
	var green := Sel.base_level(s, "greenhouse")
	if green:
		H.change_food(s, green, "greenhouse")
	if Sel.base_level(s, "radio") and Rng.random(s) < 0.1 * Sel.base_level(s, "radio"):
		H.recruit_survivor(s)
	begin_turn(s)


static func begin_turn(s: Dictionary) -> void:
	var p: Dictionary = s.team
	for sv in Sel.alive_survivors(s):
		sv.moved = false
		sv.acted = false
		sv.napped = false
		sv.hungry = false
		sv.rest = "sleep"
	p.abilityUsed = {}
	p.usedCards = []
	p.pick = null
	s.searches = {}
	s.pendingCrossroads = null
	var card_id = null
	var card = null
	var triggered := false
	var i := 0
	while i < 6 and not triggered:
		if card_id != null:
			s.crossroadsDiscard.append(card_id)
		card_id = H.draw_from_deck(s, "crossroadsDeck", "crossroadsDiscard")
		card = Content.CROSSROADS_BY_ID.get(card_id) if card_id != null else null
		triggered = card != null and Conditions.evaluate(s, card.trigger)
		i += 1
	H.add_log(s, "turnStart", {})
	if triggered:
		var f = Sel.focus_survivor(s, Conditions.focus_filter_for(card.trigger))
		if f == null:
			f = Sel.focus_survivor(s)
		s.pendingCrossroads = {"cardId": card_id, "focusSurvivorId": f.id if f != null else null}
		s.phase = "crossroads"
		H.add_log(s, "crossroadsTriggered", {"cardId": card_id})
	else:
		if card_id != null:
			s.crossroadsDiscard.append(card_id)
		s.phase = "turn"
		s.time = "day"


static func resolve_crossroads(s: Dictionary, a: Dictionary) -> void:
	if not Err.ok(s.phase == "crossroads" and s.pendingCrossroads != null, "wrongPhase", s.phase):
		return
	var pending: Dictionary = s.pendingCrossroads
	var card: Dictionary = Content.CROSSROADS_BY_ID[pending.cardId]
	var choice = a.get("choice")
	if not Err.ok(choice is int and (choice == 0 or choice == 1), "badChoice"):
		return
	H.add_log(s, "crossroadsChoice", {"cardId": card.id, "choice": choice})
	s.reports.crossroads = {"cardId": card.id, "choice": choice}
	s.pendingCrossroads = null
	s.crossroadsDiscard.append(card.id)
	s.phase = "turn"
	s.time = "day"
	Effects.apply(s, card.choices[choice].effects, {"focusSurvivorId": pending.focusSurvivorId, "reason": "crossroads"})


static func end_turn(s: Dictionary) -> void:
	H.add_log(s, "turnEnd", {})
	colony_phase(s)


static func colony_phase(s: Dictionary) -> void:
	var report := {"day": s.day}
	s.phase = "colony"
	s.time = "dusk"
	for sv in Sel.alive_survivors(s):
		H.unpack(s, sv.id)
	# 1. Food
	var need := Sel.food_needed(s)
	report.population = Sel.colony_population(s)
	report.foodNeeded = need
	if s.food >= need:
		s.food -= need
		report.fed = true
		s.starvation = 0
		H.add_log(s, "fed", {"need": need, "value": s.food})
	else:
		var short: int = need - s.food
		s.food = 0
		s.starvation += 1
		report.fed = false
		report.hungry = []
		var home := Sel.alive_survivors(s).filter(func(sv): return sv.location == "colony")
		JS.sort(home, func(a, b): return (b.hp - a.hp) if b.hp != a.hp else Sel._cmp(a.id, b.id))
		for sv in home.slice(0, short):
			sv.hungry = true
			report.hungry.append(sv.id)
		H.add_log(s, "starvation", {"need": need, "tokens": short})
		H.change_morale(s, -Content.FOOD.HUNGRY_MORALE, "starvation")
		for id in report.hungry:
			H.damage_survivor(s, id, Content.FOOD.HUNGRY_HP, "hunger")
	report.starvation = s.starvation
	# 3. Crisis
	report.crisis = resolve_crisis(s)
	# 4. Zombies
	s.time = "night"
	report.spawns = spawn_zombies(s)
	report.siege = night_siege(s)
	# 5. Frostbite
	for id in s.survivors:
		var sv: Dictionary = s.survivors[id]
		if not sv.alive or not sv.frostbite:
			continue
		if sv.location == "colony":
			sv.frostbite = false
		else:
			H.wound_survivor(s, sv.id, "frostbite")
	# 6. Sleep
	report.sleep = Sel.sleep_plan(s)
	for id in report.sleep:
		var r: Dictionary = report.sleep[id]
		s.survivors[id].ap = r.ap
		if r.hp:
			H.heal_hp(s, id, r.hp)
	H.add_log(s, "sleep", {"plan": report.sleep.duplicate(true)})
	for id in report.sleep:
		var r: Dictionary = report.sleep[id]
		if r.kind == "outside":
			var l = s.locations.get(s.survivors[id].location)
			H.damage_survivor(s, id, Content.FIGHT.NIGHT_BITE * (l.zombies if l != null else 0) + (Content.SEASON.COLD_HP if s.day >= Content.SEASON.COLD else 0), "night")
	# Bonds
	var alive := Sel.alive_survivors(s)
	for i in alive.size():
		for j in range(i + 1, alive.size()):
			if alive[i].location != alive[j].location:
				continue
			var k := Sel.bond_key(alive[i].id, alive[j].id)
			s.bonds[k] = mini(Content.BOND.MAX, s.bonds.get(k, 0) + 1)
			if s.bonds[k] == Content.BOND.CLOSE:
				H.add_log(s, "bond", {"a": alive[i].id, "b": alive[j].id})
	# Mission
	var ms = Sel.mission_status(s)
	if ms != null and ms.progress >= ms.target:
		s.stats.missions += 1
		s.mission = null
		H.add_log(s, "missionDone", {"id": ms.id})
		H.change_morale(s, Content.K.MISSION_REWARD, "mission")
	elif ms != null and ms.daysLeft <= 0:
		s.mission = null
		H.add_log(s, "missionFailed", {"id": ms.id})
	s.reports.colony = report
	if s.morale <= 0:
		end_game(s, "moraleCollapse")
		return
	if check_scenario_goal(s):
		end_game(s, "objectiveComplete")
		return
	s.day += 1
	if s.scenario.days and s.day > s.scenario.days:
		end_game(s, "timeOut")
		return
	start_round(s)




static func resolve_crisis(s: Dictionary) -> Dictionary:
	var crisis: Dictionary = Content.CRISES_BY_ID[s.crisis.id]
	var required := Sel.crisis_requirement(s)
	var score := 0
	var cards := []
	for uid in s.crisis.contributions:
		var item = Sel.item_of(s, uid)
		var delta := 1 if Sel.crisis_matches(s, crisis, item) else -1
		score += delta
		cards.append({"card": s.cards[uid], "type": item.type, "delta": delta})
	var success := score >= required
	var result := {"crisisId": crisis.id, "required": required, "score": score, "success": success, "cards": cards}
	H.add_log(s, "crisisResolved", {"crisisId": crisis.id, "required": required, "score": score, "success": success})
	if success:
		var bonus := 1
		if Sel.team_has_ability(s, "inspire"):
			bonus += 1
		H.change_morale(s, bonus, "crisisAverted")
	else:
		Effects.apply(s, crisis.fail, {"reason": "crisisFailed"})
	s.crisisDiscard.append(s.crisis.id)
	s.crisis = null
	return result


static func night_siege(s: Dictionary) -> Dictionary:
	var f := Sel.siege_forecast(s)
	var col: Dictionary = s.locations.colony
	col.barricades -= maxi(0, mini(col.barricades, f.stopped - f.wall - f.guards))
	H.add_log(s, "siege", {"attackers": f.attackers, "stopped": f.stopped, "hits": f.hits})
	for id in f.targets:
		H.damage_survivor(s, id, Content.SIEGE.HIT_HP, "siege")
	if not f.targets.size() and f.hits:
		H.change_food(s, -mini(s.food, f.hits * Content.SIEGE.NO_ONE_FOOD), "siege")
	return f


static func restock(s: Dictionary) -> void:
	if s.day <= 1:
		return
	var rings := [1]
	for id in s.survivors:
		var v: Dictionary = s.survivors[id]
		if v.alive:
			rings.append(CityMap.ring_of(s, v.location))
	var reach: int = 1 + rings.max()
	var near := CityMap.outside_of(s).filter(func(loc): return CityMap.loc_def(s, loc).get("deck") != null and not CityMap.is_spot(s, loc) and CityMap.ring_of(s, loc) <= reach)
	var picks := near.duplicate()
	var i := 0
	while near.size() and picks.size() < RESTOCK_MIN:
		picks.append(near[i % near.size()])
		i += 1
	for k in picks.size():
		var loc: String = picks[k]
		var table: Dictionary = CityMap.loc_def(s, loc).deck
		var ids := table.keys().filter(func(id): return not RARE_PARTS.has(id))
		var total := 0
		for id in ids:
			total += table[id]
		var r := Rng.random(s) * total
		var item_id = ids[0]
		for id in ids:
			r -= table[id]
			if r < 0:
				item_id = id
				break
		var uid := "r%d%s%s" % [s.day, loc, (".%d" % k) if k >= near.size() else ""]
		s.cards[uid] = item_id
		s.locations[loc].deck.push_front(uid)
		var bt = s.locations[loc].get("batches")
		if bt != null:
			if bt.size() and bt[0] < 4:
				bt[0] += 1
			else:
				bt.push_front(1)


static func spawn_zombies(s: Dictionary) -> Dictionary:
	var spawns := Sel.spawn_forecast(s)
	for loc in spawns:
		H.add_zombies(s, loc, spawns[loc], "colonyPhase")
	return spawns


static func check_scenario_goal(s: Dictionary) -> bool:
	var goal: Dictionary = Sel.scenario_def(s).goal
	var target := Sel.scenario_target(s)
	match goal.type:
		"deposit": return s.scenario.deposited >= target
		"stockpile": return s.food >= target and s.locations.colony.zombies <= goal.maxColonyZombies
		"kills": return s.totalKills >= target
		"crawler": return s.get("base", {}).get("crawler", 0) >= target
	return false


static func end_game(s: Dictionary, reason: String) -> void:
	var won := reason == "objectiveComplete"
	s.phase = "gameOver"
	s.pendingCrossroads = null
	s.result = {"reason": reason, "won": won}
	H.add_log(s, "gameOver", {"reason": reason, "won": won})


static func check_immediate_end(s: Dictionary) -> void:
	if s.phase != "gameOver" and s.phase != "draft" and s.morale <= 0:
		end_game(s, "moraleCollapse")
