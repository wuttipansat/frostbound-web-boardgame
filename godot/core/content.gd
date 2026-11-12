## The game's content and tunables (godot/data, exported from the web build), loaded once.
class_name Content
extends RefCounted

const DIR := "res://data/"

static var K: Dictionary = JS.load_json(DIR + "constants.json")
static var LOC_FILE: Dictionary = JS.load_json(DIR + "locations.json")
static var ITEM_FILE: Dictionary = JS.load_json(DIR + "items.json")
static var BUILD_FILE: Dictionary = JS.load_json(DIR + "buildings.json")

static var LOCATIONS: Dictionary = LOC_FILE.LOCATIONS
static var PLACE_RULES: Dictionary = LOC_FILE.PLACE_RULES
static var PLACE_TABLE: Array = LOC_FILE.PLACE_TABLE
static var FILLER_KINDS: Array = LOC_FILE.FILLER_KINDS
static var SEARCH_BATCHES: Dictionary = LOC_FILE.SEARCH_BATCHES
static var SPOT_RULES: Dictionary = LOC_FILE.SPOT_RULES
static var TIER_STAGE: Dictionary = LOC_FILE.TIER_STAGE
static var ITEMS: Dictionary = ITEM_FILE.ITEMS
static var RECIPES: Dictionary = ITEM_FILE.RECIPES
static var GEAR_SLOTS: Dictionary = ITEM_FILE.GEAR_SLOTS
static var PERMANENT_TYPES: Array = ITEM_FILE.PERMANENT_TYPES
static var BUILDINGS: Dictionary = BUILD_FILE.BUILDINGS
static var CRAWLER: Dictionary = BUILD_FILE.CRAWLER
static var SURVIVORS: Array = JS.load_json(DIR + "survivors.json").SURVIVORS
static var SCENARIOS: Array = JS.load_json(DIR + "scenarios.json").SCENARIOS
static var CRISES: Array = JS.load_json(DIR + "crises.json").CRISES
static var CROSSROADS: Array = JS.load_json(DIR + "crossroads.json").CROSSROADS
static var SURVIVORS_BY_ID: Dictionary = _by_id(SURVIVORS)
static var SCENARIOS_BY_ID: Dictionary = _by_id(SCENARIOS)
static var CRISES_BY_ID: Dictionary = _by_id(CRISES)
static var CROSSROADS_BY_ID: Dictionary = _by_id(CROSSROADS)

static var RULES: Dictionary = K.RULES
static var ENERGY: Dictionary = K.ENERGY
static var REST: Dictionary = K.REST
static var FIGHT: Dictionary = K.FIGHT
static var SEASON: Dictionary = K.SEASON
static var SIEGE: Dictionary = K.SIEGE
static var XP: Dictionary = K.XP
static var BOND: Dictionary = K.BOND
static var DIFFICULTY: Dictionary = K.DIFFICULTY
static var SEARCH_SPAWN: Dictionary = K.SEARCH_SPAWN
static var FOOD: Dictionary = K.FOOD
static var MISSIONS: Array = K.MISSIONS
static var TRAITS: Array = K.TRAITS
static var PHASES: Dictionary = K.PHASES


static func _by_id(list: Array) -> Dictionary:
	var d := {}
	for x in list:
		d[x.id] = x
	return d


## items.js isPermanent
static func is_permanent(item) -> bool:
	return item != null and PERMANENT_TYPES.has(item.type)


## items.js gearSlot
static func gear_slot(item):
	if item == null:
		return null
	return GEAR_SLOTS.get(item.type, null)


## locations.js yieldsOf (MAP-6): what a place is a good source of.
static func yields_of(type) -> Dictionary:
	var deck = LOCATIONS.get(type, {}).get("deck", null)
	if deck == null:
		deck = {}
	var food := 0
	var wood := 0
	var metal := 0
	for id in deck:
		var n: int = deck[id]
		var it = ITEMS.get(id, null)
		if it != null and (it.get("type") == "food" or it.get("counts") == "food"):
			food += n
		if id == "wood":
			wood += n
		if id == "scrap" or id == "motor-junk" or id == "scrap-plate":
			metal += n
	return {"food": food >= 5, "wood": wood >= 4, "metal": metal >= 5}
