## src/core/rules/conditions.js: crossroads triggers.
class_name Conditions
extends RefCounted


static func _hand_count(s: Dictionary, type: String) -> int:
	return s.stockpile.filter(func(uid): return Sel.item_of(s, uid).type == type).size()


static func _wounded(sv) -> bool:
	return sv.wounds > 0 or sv.frostbite


static func evaluate(s: Dictionary, c: Dictionary) -> bool:
	match c.type:
		"always": return true
		"all": return c.of.all(func(sub): return evaluate(s, sub))
		"any": return c.of.any(func(sub): return evaluate(s, sub))
		"moraleAtMost": return s.morale <= c.n
		"moraleAtLeast": return s.morale >= c.n
		"foodAtMost": return s.food <= c.n
		"foodAtLeast": return s.food >= c.n
		"dayAtLeast": return s.day >= c.n
		"colonyZombiesAtLeast": return s.locations.colony.zombies >= c.n
		"survivorAt": return Sel.alive_survivors(s).any(func(sv): return sv.location == c.location)
		"notInColony": return Sel.alive_survivors(s).any(func(sv): return sv.location != "colony")
		"hasItem": return _hand_count(s, c.item) >= 1
		"handHas": return _hand_count(s, c.item) >= c.count
		"handHasEach": return c.items.all(func(t): return _hand_count(s, t) >= 1)
		"handSizeAtLeast": return s.stockpile.size() >= c.n
		"hasWounded": return Sel.alive_survivors(s).any(func(sv): return _wounded(sv))
		"noWoundedSurvivors": return Sel.alive_survivors(s).all(func(sv): return sv.wounds == 0 and not sv.frostbite)
		"survivorCountAtLeast": return Sel.alive_survivors(s).size() >= c.n
		"survivorsAlive": return Sel.alive_survivors(s).size() >= c.min
		"killsAtLeast": return s.team.kills >= c.n
	push_error("Unknown condition type: " + str(c.type))
	return false


static func focus_filter_for(c: Dictionary):
	match c.type:
		"survivorAt": return func(sv): return sv.location == c.location
		"notInColony": return func(sv): return sv.location != "colony"
		"hasWounded": return func(sv): return _wounded(sv)
	return null
