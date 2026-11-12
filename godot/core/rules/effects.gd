## src/core/rules/effects.js: crossroads choices and crisis outcomes. ctx = {focusSurvivorId, reason}.
class_name Effects
extends RefCounted


static func _focus(s: Dictionary, ctx: Dictionary):
	var id = ctx.get("focusSurvivorId")
	var sv = s.survivors.get(id) if id else null
	if sv != null and sv.alive:
		return sv
	return Sel.focus_survivor(s)


static func _where(s: Dictionary, ctx: Dictionary, where) -> String:
	if where == "here":
		var f = _focus(s, ctx)
		return f.location if f != null else "colony"
	return where if s.locations.has(where) else "colony"


static func apply(s: Dictionary, effects: Array, ctx: Dictionary = {}) -> void:
	var reason = ctx.get("reason")
	for e in effects:
		match e.type:
			"morale":
				H.change_morale(s, e.delta, reason)
			"food":
				H.change_food(s, e.delta, reason)
			"recruit":
				if not H.recruit_survivor(s):
					H.change_morale(s, 1, reason)
			"starvation":
				s.starvation += e.delta
			"spawn":
				H.add_zombies(s, _where(s, ctx, e.get("where")), e.n, reason)
			"removeZombies":
				var loc := _where(s, ctx, e.get("where"))
				var n := H.remove_zombies(s, loc, e.n)
				if n:
					H.add_log(s, "zombiesLeave", {"locationId": loc, "n": n})
			"barricade":
				H.add_barricades(s, _where(s, ctx, e.get("where")), e.n)
			"drawItem":
				var from = _where(s, ctx, e.get("from"))
				var l = s.locations.get(from)
				if from == "any" or l == null or l.deck == null or not l.deck.size():
					var stocked := CityMap.outside_of(s).filter(func(x): return s.locations[x].deck.size())
					if not stocked.size():
						continue
					from = Rng.pick(s, stocked)
				H.draw_items(s, from, e.n)
			"discard":
				for i in e.n:
					var uid = null
					for u in s.stockpile:
						if not e.get("item") or Sel.item_of(s, u).type == e.item:
							uid = u
							break
					if uid == null:
						break
					H.discard_card(s, uid)
					H.add_log(s, "discard", {"card": s.cards[uid]})
			"wound":
				var sv = _focus(s, ctx)
				if sv != null:
					H.wound_survivor(s, sv.id, "crossroads")
			"heal":
				var sv = _focus(s, ctx)
				if sv != null:
					H.heal_survivor(s, sv.id)
			"energy":
				for sv in Sel.alive_survivors(s):
					H.gain_energy(s, e.get("delta", Content.ENERGY.CARD), sv.id)
			"moveHome":
				var sv = _focus(s, ctx)
				if sv == null or sv.location == "colony":
					continue
				var from: String = sv.location
				sv.location = "colony"
				H.add_log(s, "move", {"survivorId": sv.id, "from": from, "to": "colony", "safe": true})
			_:
				push_error("Unknown effect type: " + str(e.type))
