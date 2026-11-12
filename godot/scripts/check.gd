# Headless check: every exported .glb loads and every data file parses.
#   godot --headless --path godot --script res://scripts/check.gd
extends SceneTree


func _init() -> void:
	var bad := 0
	var data_files: Array[String] = ["constants", "locations", "items", "buildings", "crises", "crossroads", "scenarios", "survivors", "i18n/en", "i18n/th"]
	for f in data_files:
		var path: String = "res://data/" + f + ".json"
		if JSON.parse_string(FileAccess.get_file_as_string(path)) == null:
			printerr("bad data: ", path)
			bad += 1
	var golden := DirAccess.get_files_at("res://data/golden")
	for f in golden:
		if JSON.parse_string(FileAccess.get_file_as_string("res://data/golden/" + f)) == null:
			printerr("bad golden: ", f)
			bad += 1
	var index = JSON.parse_string(FileAccess.get_file_as_string("res://assets/models/index.json"))
	var models: Array = index.get("models", []) if index is Dictionary else []
	if models.is_empty():
		printerr("no models: run npm run export:godot")
		bad += 1
	for m in models:
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		if doc.append_from_file("res://assets/models/" + str(m.file), state) != OK or state.get_meshes().is_empty():
			printerr("bad model: ", m.file)
			bad += 1
	print("checked %d data files, %d golden games, %d models: %d bad" % [data_files.size(), golden.size(), models.size(), bad])
	quit(1 if bad else 0)
