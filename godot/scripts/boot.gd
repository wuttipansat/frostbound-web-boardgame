# GODOT-0 boot scene: the colony and six places on a snowy plane, cold light, a warm campfire glow.
# Proves the exported models, data and text load; the real board comes in GODOT-2.
extends Node3D

const PITCH := 30.0  # world units between block centres (as the web board)
const PLACES := ["grocery", "police", "gas", "hospital", "school", "library"]

var game: Dictionary
var bot_opts: Dictionary
var info: Label


func _ready() -> void:
	_environment()
	_ground()
	var colony := Models.instance(Data.model_file("lod1-colony-w1"))
	if colony:
		add_child(colony)
	for i in PLACES.size():
		var m := Models.instance(Data.model_file("lod1-place-" + PLACES[i]))
		if m == null:
			continue
		var a := TAU * i / PLACES.size()
		m.position = Vector3(cos(a), 0, sin(a)) * PITCH * 1.4
		m.rotation.y = -a - PI / 2  # face the colony
		add_child(m)
	var rig: Node3D = preload("res://scripts/orbit_camera.gd").new()
	rig.position = Vector3(0, 2, 0)
	add_child(rig)
	_label()


func _environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#2a3644")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#8fa6bf")
	env.ambient_light_energy = 0.35
	env.fog_enabled = true
	env.fog_light_color = Color("#6f8296")
	env.fog_density = 0.0025
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("#dfe9f5")
	sun.light_energy = 0.75
	sun.rotation_degrees = Vector3(-35, 40, 0)
	sun.shadow_enabled = true
	add_child(sun)
	var fire := OmniLight3D.new()  # the campfire
	fire.light_color = Color("#ffb347")
	fire.light_energy = 3.0
	fire.omni_range = 18.0
	fire.position = Vector3(0, 2, 0)
	add_child(fire)


func _ground() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(400, 400)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#aebdcc")
	mat.roughness = 1.0
	var g := MeshInstance3D.new()
	g.mesh = plane
	g.material_override = mat
	g.position.y = -0.02
	add_child(g)


func _label() -> void:
	var ui := CanvasLayer.new()
	var panel := PanelContainer.new()
	panel.position = Vector2(12, 12)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.11, 0.15, 0.8)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(12)
	panel.add_theme_stylebox_override("panel", style)
	var box := VBoxContainer.new()
	panel.add_child(box)
	info = Label.new()
	box.add_child(info)
	var row := HBoxContainer.new()
	for b in [["Bot step", _bot_step], ["Bot day", _bot_day], ["New game", _new_game]]:
		var btn := Button.new()
		btn.text = b[0]
		btn.custom_minimum_size = Vector2(110, 44)
		btn.pressed.connect(b[1])
		row.add_child(btn)
	box.add_child(row)
	ui.add_child(panel)
	add_child(ui)
	TranslationServer.set_locale("th" if OS.get_locale_language() == "th" else "en")
	_new_game()


## GODOT-1: the ported rules engine runs in the app; the bot plays the crawler scenario.
func _new_game() -> void:
	var seed := int(Time.get_unix_time_from_system())
	game = GameState.create_game({"scenarioId": "crawler", "seed": seed, "difficulty": "normal", "days": 40})
	bot_opts = {"random": Bot.mulberry(seed * 7919 + 13), "chaos": 0}
	_show()


func _bot_step() -> void:
	if game.phase == "gameOver":
		return
	var a = Bot.bot_action(game, bot_opts)
	var r := Reducer.try_reduce(game, a if a != null else {"type": "END_TURN"})
	game = r.state if r.ok else Reducer.try_reduce(game, {"type": "END_TURN"}).state
	_show()


func _bot_day() -> void:
	var day: int = game.day
	var guard := 0
	while game.phase != "gameOver" and game.day == day and guard < 400:
		_bot_step()
		guard += 1


func _show() -> void:
	var team := PackedStringArray()
	for sv in Sel.alive_survivors(game):
		team.append("%s %s %dHP %dAP" % [Sel.survivor_def(sv.id).name.split(" ")[0], sv.location, sv.hp, sv.ap])
	var res := ""
	if game.result != null:
		res = "\n%s (%s)" % ["WON" if game.result.won else "lost", game.result.reason]
	info.text = "FROSTBOUND — Godot port\n%d models · %s\nDay %d %s · %s · morale %d · food %d · stage %d · crawler %d\n%s%s" % [
		Data.models.size(), _name("colony"), game.day, game.time, game.phase, game.morale, game.food,
		game.map.stage, Sel.base_level(game, "crawler"), "\n".join(team), res]


## A place's name in the current language (Thai content text, else the English name from the data).
func _name(id: String) -> String:
	var k := "content.locations.%s.name" % id
	var t := tr(k)
	return t if t != k else str(Content.LOCATIONS[id].name)
