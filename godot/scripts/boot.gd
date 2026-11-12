# GODOT-0 boot scene: the colony and six places on a snowy plane, cold light, a warm campfire glow.
# Proves the exported models, data and text load; the real board comes in GODOT-2.
extends Node3D

const PITCH := 30.0  # world units between block centres (as the web board)
const PLACES := ["grocery", "police", "gas", "hospital", "school", "library"]


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
	env.ambient_light_energy = 0.6
	env.fog_enabled = true
	env.fog_light_color = Color("#9fb3c8")
	env.fog_density = 0.006
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_color = Color("#dfe9f5")
	sun.light_energy = 0.9
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
	mat.albedo_color = Color("#e8f0f5")
	mat.roughness = 1.0
	var g := MeshInstance3D.new()
	g.mesh = plane
	g.material_override = mat
	g.position.y = -0.02
	add_child(g)


func _label() -> void:
	var ui := CanvasLayer.new()
	var l := Label.new()
	l.position = Vector2(16, 12)
	var n_loc := (Data.content.get("locations", {}).get("LOCATIONS", {}) as Dictionary).size()
	TranslationServer.set_locale("th" if OS.get_locale_language() == "th" else "en")
	l.text = "FROSTBOUND — Godot port (GODOT-0)\n%d models · %d places · %s" % [Data.models.size(), n_loc, tr("content.locations.colony.name")]
	ui.add_child(l)
	add_child(ui)
