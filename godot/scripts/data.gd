# Autoload `Data`: the game's content and tunables, exported from the web build (npm run export:godot).
extends Node

const DIR := "res://data/"
const FILES := ["constants", "locations", "items", "buildings", "crises", "crossroads", "scenarios", "survivors"]

var content := {}   # file name -> parsed JSON (e.g. content.locations.LOCATIONS)
var models := []    # godot/assets/models/index.json "models"


func _ready() -> void:
	for f in FILES:
		content[f] = load_json(DIR + f + ".json")
	var index = load_json("res://assets/models/index.json")
	models = index.get("models", []) if index is Dictionary else []
	load_translations()


static func load_json(path: String):
	if not FileAccess.file_exists(path):
		push_warning("missing " + path + " (run npm run export:godot)")
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed == null:
		push_error("bad JSON: " + path)
		return {}
	return parsed


## en.json / th.json -> Translation objects; nested keys become dotted keys ("hud.day").
func load_translations() -> void:
	for lang in ["en", "th"]:
		var d = load_json(DIR + "i18n/" + lang + ".json")
		if not d is Dictionary:
			continue
		var tr := Translation.new()
		tr.locale = lang
		_flatten(d.get("ui", {}), "", tr)
		_flatten(d.get("content", {}), "content.", tr)
		TranslationServer.add_translation(tr)


func _flatten(node, prefix: String, tr: Translation) -> void:
	if node is Dictionary:
		for k in node:
			_flatten(node[k], prefix + str(k) + ".", tr)
	elif node is String:
		tr.add_message(prefix.trim_suffix("."), node)


## The model file for a cache key prefix such as "lod1-place-grocery" (first match), or "".
func model_file(prefix: String) -> String:
	for m in models:
		if str(m.key).begins_with(prefix + "|"):
			return "res://assets/models/" + str(m.file)
	return ""
