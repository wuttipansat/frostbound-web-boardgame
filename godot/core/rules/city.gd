## src/core/rules/city.js: growing the city when a map is read at the colony.
class_name City
extends RefCounted


static func grow_city(s: Dictionary) -> void:
	var fresh := []
	var added := CityMap.grow_map(s, func(type, _block):
		var id: String = type
		var k := 2
		while s.locations.has(id):
			id = "%s-%d" % [type, k]
			k += 1
		s.locations[id] = GameState.stock_place(s, id, type, "m", floori(Rng.random(s) * (s.map.stage - 1)))
		fresh.append(id)
		return id)
	var lo: int = Content.SPOT_RULES.PER_GROWTH[0]
	var hi: int = Content.SPOT_RULES.PER_GROWTH[1]
	var spots := CityMap.add_spots(s, added, lo + (s.map.stage % (hi - lo + 1)), func(type, _block, _i, rand): return GameState.make_spot(s, type, rand))
	if spots.size():
		H.add_log(s, "spotsFound", {"count": spots.size()})
	s.map.pending = false
	s.map.searchesSinceMap = 0
	H.add_log(s, "mapGrown", {"stage": s.map.stage, "blocks": added.size(), "places": fresh})
