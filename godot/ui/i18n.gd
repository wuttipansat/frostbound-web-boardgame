## src/i18n: UI text (en / th) with {placeholders}, localized content names, and log lines (format.js).
class_name I18n
extends RefCounted

static var lang := "en"
static var EN: Dictionary = (JSON.parse_string(FileAccess.get_file_as_string("res://data/i18n/en.json")) as Dictionary).ui
static var TH_FILE: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/i18n/th.json"))
static var TH: Dictionary = TH_FILE.ui
static var TH_CONTENT: Dictionary = TH_FILE.content
const QUIET := ["turnEnd", "roll", "draw", "energy"]


static func set_lang(l: String) -> void:
	lang = "th" if l == "th" else "en"
	TranslationServer.set_locale(lang)


static func t(key: String, params: Dictionary = {}) -> String:
	var s = (TH.get(key) if lang == "th" else null)
	if s == null:
		s = EN.get(key, key)
	s = str(s)
	if params.is_empty() or s.find("{") < 0:
		return s
	var out = ""
	var i = 0
	while i < s.length():
		var c = s[i]
		if c == "{":
			var j = s.find("}", i)
			if j > i:
				var k = s.substr(i + 1, j - i - 1)
				if params.has(k) and params[k] != null:
					out += str(params[k])
				else:
					out += s.substr(i, j - i + 1)
				i = j + 1
				continue
		out += c
		i += 1
	return out


static func has(key: String) -> bool:
	return (TH.has(key) if lang == "th" else EN.has(key))


static func _source(kind: String) -> Dictionary:
	match kind:
		"locations": return Content.LOCATIONS
		"items": return Content.ITEMS
		"survivors": return Content.SURVIVORS_BY_ID
		"crises": return Content.CRISES_BY_ID
		"crossroads": return Content.CROSSROADS_BY_ID
		"scenarios": return Content.SCENARIOS_BY_ID
	return {}


## c('locations', 'police', 'name'): Thai override, else the English content text, else the id.
static func c(kind: String, id, field: String) -> String:
	if id == null:
		return ""
	id = str(id)
	if kind == "locations" and not Content.LOCATIONS.has(id):
		var re = RegEx.create_from_string("^(.+)-(\\d+)$")
		var m = re.search(id)
		if m != null:
			return "%s %s" % [c(kind, m.get_string(1), field), m.get_string(2)] if field == "name" else c(kind, m.get_string(1), field)
	if lang == "th":
		var o = TH_CONTENT.get(kind, {}).get(id, {})
		if o is Dictionary and o.get(field) != null:
			return str(o[field])
	var src = _source(kind).get(id)
	if src != null and src.get(field) != null:
		return str(src[field])
	return id


static func cross_choice(card_id: String, i: int) -> String:
	if lang == "th":
		var o = TH_CONTENT.get("crossroads", {}).get(card_id, {})
		if o is Dictionary and o.has("choices") and i < o.choices.size():
			return str(o.choices[i])
	var card = Content.CROSSROADS_BY_ID.get(card_id)
	return str(card.choices[i].label) if card != null else ""


static func signed(n) -> String:
	return "+%d" % n if n > 0 else ("−%d" % absi(n) if n < 0 else "0")


## format.js formatLog: one line for a log entry, or "" to hide it.
static func format_log(e: Dictionary) -> String:
	if QUIET.has(e.k):
		return ""
	var p = {
		"survivor": c("survivors", e.get("survivorId"), "name"),
		"loc": c("locations", e.get("locationId"), "name"),
		"to": c("locations", e.get("to"), "name") if e.get("to") is String else "",
		"n": _first(e, ["n", "count", "wounds", "killed", "removed", "need", "tokens", "total"]),
		"d": signed(e.delta) if e.get("delta") != null else "",
		"value": e.get("value"),
		"round": e.get("day"),
		"crisis": c("crises", e.get("crisisId"), "name"),
		"card": c("items", e.get("card"), "name") if e.get("card") != null else "",
		"item": t("item." + str(e.itemType)) if e.get("itemType") != null else t("item.any"),
		"cause": t("cause." + str(e.cause)) if e.get("cause") != null else "",
		"reason": t("reason." + str(e.reason)) if e.get("reason") != null else "",
		"score": e.get("score"),
		"required": e.get("required"),
		"title": c("crossroads", e.get("cardId"), "title") if e.get("cardId") != null else "",
	}
	match e.k:
		"move": return t("log.moveSafe" if e.get("safe") else "log.move", p)
		"crisisResolved":
			p.result = t("log.crisisOk" if e.success else "log.crisisFail")
			return t("log.crisisResolved", p)
		"lure": return t("log.lure", p)
		"unpack":
			p.count = e.count
			return t("log.unpack", p)
		"mapFound": return t("log.mapFound", {"name": c("survivors", e.survivorId, "name"), "place": c("locations", e.locationId, "name")})
		"spotsFound": return t("log.spotsFound", {"count": e.count})
		"mapGrown": return t("log.mapGrown", {"stage": e.stage, "places": ", ".join(PackedStringArray(e.get("places", []).map(func(l): return c("locations", l, "name"))))})
		"built": return t("log.built", {"building": t("bld." + e.buildingId), "level": e.level})
		"building":
			p.building = t("bld." + e.buildingId)
			return t("log.building", p)
		"siege": return t("log.siege", {"attackers": e.attackers, "stopped": e.stopped, "hits": e.hits})
		"levelUp":
			p.kind = t("xp." + e.kind)
			p.level = e.level
			return t("log.levelUp", p)
		"bond": return t("log.bond", {"a": c("survivors", e.a, "name"), "b": c("survivors", e.b, "name")})
		"hurt":
			p.hp = e.hp
			return t("log.hurt", p)
		"crossroadsChoice":
			p.choice = cross_choice(e.cardId, e.choice)
			return t("log.crossroadsChoice", p)
		"starvation": return t("log.starvation", {"n": e.tokens})
		"fed": return t("log.fed", {"n": e.need})
		"draftDone": return t("log.draftDone", {"names": ", ".join(PackedStringArray(e.get("survivorIds", []).map(func(id): return c("survivors", id, "name"))))})
		"gameOver": return t("log.gameOver")
	var key: String = "log." + e.k
	var s = t(key, p)
	return "" if s == key else s


static func _first(e: Dictionary, keys: Array):
	for k in keys:
		if e.get(k) != null:
			return e[k]
	return ""


static func describe_effect(e: Dictionary) -> String:
	var where = t("where.here") if e.get("where") == "here" else (c("locations", e.where, "name") if e.get("where") else "")
	match e.type:
		"morale", "food", "starvation", "energy":
			return t("eff." + e.type, {"d": signed(e.get("delta", 0))})
		"discard":
			return t("eff.discard", {"n": e.n, "item": t("item." + e.item) if e.get("item") else ""})
	return t("eff." + e.type, {"n": e.get("n"), "where": where})


static func describe_effects(list: Array) -> String:
	if list.is_empty():
		return t("eff.nothing")
	return " · ".join(PackedStringArray(list.map(func(e): return describe_effect(e))))


static func describe_trigger(cond: Dictionary) -> String:
	return t("trig." + cond.type, {"n": cond.get("n"), "loc": c("locations", cond.location, "name") if cond.get("location") else "", "item": t("item." + cond.item) if cond.get("item") else ""})
