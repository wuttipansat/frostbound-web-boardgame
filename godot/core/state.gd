## src/core/state.js: createGame and the item piles of places and spots.
class_name GameState
extends RefCounted

const STATE_VERSION := 4
const RARE := ["engine-part", "heater-part"]


static func create_game(config: Dictionary = {}) -> Dictionary:
	var scenario = Content.SCENARIOS_BY_ID.get(config.get("scenarioId", "beacon"))
	if not Err.ok(scenario != null, "noSuchScenario"):
		return {}
	var diff = config.get("difficulty")
	var dd = Content.DIFFICULTY.get(diff) if diff != null else null
	var map := CityMap.new_map(config.get("fullTown", false))
	map.look = Rng.normalize_seed(config.get("seed"))
	var s := {
		"version": STATE_VERSION,
		"rng": Rng.normalize_seed(config.get("seed")),
		"config": {"scenarioId": scenario.id, "difficulty": diff if diff != null else "normal"},
		"difficulty": diff if dd != null else "normal",
		"phase": "draft",
		"day": 1,
		"time": "dawn",
		"map": map,
		"scenario": {"id": scenario.id, "days": config.get("days", scenario.days), "deposited": 0},
		"morale": mini(10, scenario.morale + (dd.morale if dd != null else 0)),
		"maxMorale": 10,
		"food": maxi(0, scenario.startFood + (dd.food if dd != null else 0)),
		"stats": {"kills": 0, "searches": 0, "builds": 0, "crafts": 0, "missions": 0},
		"bonds": {},
		"mission": null,
		"starvation": 0,
		"totalKills": 0,
		"team": null,
		"survivors": {},
		"survivorDeck": [],
		"locations": {},
		"cards": {},
		"crisis": null,
		"crisisDeck": [],
		"crisisDiscard": [],
		"crossroadsDeck": [],
		"crossroadsDiscard": [],
		"pendingCrossroads": null,
		"reports": {"colony": null, "crossroads": null},
		"log": [],
		"result": null,
	}
	for loc_id in CityMap.map_places(s.map):
		s.locations[loc_id] = stock_place(s, loc_id, loc_id, "c")
	if not config.get("fullTown", false):
		CityMap.add_spots(s, Content.SPOT_RULES.START, Content.SPOT_RULES.START.size(), func(type, _block, _i, rand): return make_spot(s, type, rand))
	s.crisisDeck = Rng.shuffle(s, Content.CRISES.map(func(c): return c.id))
	s.crossroadsDeck = Rng.shuffle(s, Content.CROSSROADS.map(func(c): return c.id))
	var pool := Rng.shuffle(s, Content.SURVIVORS.map(func(sv): return sv.id))
	var options := pool.slice(0, Content.RULES.DRAFT_OPTIONS)
	pool = pool.slice(Content.RULES.DRAFT_OPTIONS)
	s.team = {"survivors": [], "fallen": [], "draftOptions": options, "drafted": false, "kills": 0, "abilityUsed": {}, "usedCards": [], "pick": null}
	s.base = {"crawler": 0, "dorm": 0, "wall": 0, "greenhouse": 0, "workshop": 0, "infirmary": 0, "radio": 0}
	s.building = {}
	s.stockpile = []
	s.searches = {}
	s.survivorDeck = pool
	return s


## A search spot: a short deck (2–4 cards by weight), one find. Returns its id.
static func make_spot(s: Dictionary, type: String, rand: Callable) -> String:
	var id := type
	var k := 2
	while s.locations.has(id):
		id = "%s-%d" % [type, k]
		k += 1
	var deck_def: Dictionary = Content.LOCATIONS[type].deck
	var weights := []
	var total := 0
	for item_id in deck_def:
		weights.append([item_id, deck_def[item_id]])
		total += deck_def[item_id]
	var lo: int = Content.SPOT_RULES.CARDS[0]
	var hi: int = Content.SPOT_RULES.CARDS[1]
	var n := lo + floori(rand.call() * (hi - lo + 1))
	var deck := []
	for j in n:
		var r: float = rand.call() * total
		var item_id = weights[0][0]
		for w in weights:
			r -= w[1]
			if r < 0:
				item_id = w[0]
				break
		var uid := "s%s.%d" % [id, j]
		s.cards[uid] = item_id
		deck.append(uid)
	s.locations[id] = {"zombies": 0, "barricades": 0, "deck": deck, "type": type, "batches": [deck.size()]}
	return id


static func stock_place(s: Dictionary, id: String, type: String, prefix: String, zombies := 0) -> Dictionary:
	var def: Dictionary = Content.LOCATIONS[type]
	var deck := []
	var n := 0
	var deck_def = def.get("deck")
	if deck_def != null:
		for item_id in deck_def:
			for i in deck_def[item_id]:
				var uid := ("c%d" % s.cards.size()) if prefix == "c" else ("%s%s.%d" % [prefix, id, n])
				if prefix != "c":
					n += 1
				s.cards[uid] = item_id
				deck.append(uid)
	var batches = null
	if deck_def != null:
		var rule = Content.PLACE_RULES.get(type)
		var range_: Array = Content.SEARCH_BATCHES[str(rule.tier if rule != null else 1)]
		var b: int = range_[0] + floori(Rng.random(s) * (range_[1] - range_[0] + 1))
		b = maxi(b, ceili(deck.size() / 4.0))
		var common := []
		var total := 0
		for item_id in deck_def:
			var it = Content.ITEMS.get(item_id)
			if not RARE.has(item_id) and not item_id.begins_with("blueprint-") and (it == null or it.type != "survivor"):
				common.append([item_id, deck_def[item_id]])
				total += deck_def[item_id]
		while common.size() and deck.size() < b * 3:
			var r := Rng.random(s) * total
			var item_id = common[0][0]
			for w in common:
				r -= w[1]
				if r < 0:
					item_id = w[0]
					break
			var uid := ("c%d" % s.cards.size()) if prefix == "c" else ("%s%s.%d" % [prefix, id, n])
			if prefix != "c":
				n += 1
			s.cards[uid] = item_id
			deck.append(uid)
		batches = []
		for i in b:
			batches.append(2)
		var left := deck.size() - 2 * b
		var guard := 0
		while left > 0 and guard < 1000:
			var k := floori(Rng.random(s) * b)
			if batches[k] < 4:
				batches[k] += 1
				left -= 1
			guard += 1
		if left > 0:
			batches[batches.size() - 1] += left
	var pile = Rng.shuffle(s, deck) if deck_def != null else null
	if pile != null:
		for uid in pile.filter(func(u): return RARE.has(s.cards[u])):
			pile.remove_at(pile.find(uid))
			pile.insert(floori(Rng.random(s) * (pile.size() / 2.0)), uid)
	var loc := {"zombies": zombies, "barricades": 0, "deck": pile, "batches": batches}
	if type != id:
		loc.type = type
	return loc
