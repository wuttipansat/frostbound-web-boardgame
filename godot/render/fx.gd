## particles.js, stage.js snowfall, footprints.js and atmosphere.js: embers over the campfire, smoke from chimneys,
## sparks at the gate torches, falling snow with gusts, footprints that fill in over two days, and the weather and
## light (dusk, storm, fire) following the game.
class_name Fx
extends Node3D

var stage: Stage
var board: Board
var embers: CPUParticles3D
var smoke: Array = []
var sparks: Array = []
var snow: Array = []
var prints_mm: MultiMesh
var prints: Array = []
var print_next := 0
var round_ := 1
var cur := {"storm": 0.35, "dusk": 0.5, "fire": 1.0}
var goal := {"storm": 0.35, "dusk": 0.5, "fire": 1.0}
const MAX_PRINTS := 60
const DAY := {"hemi": Color("#9cc6d6"), "moon": Color("#ffe0c2"), "fog": Color("#24344f")}
const NIGHT := {"hemi": Color("#5f88b0"), "moon": Color("#8fa8e6"), "fog": Color("#0e182b")}
const DUSK := {"dawn": 0.3, "day": 0.0, "dusk": 0.65, "night": 1.0}


func _init(s: Stage, b: Board) -> void:
	stage = s
	board = b
	name = "fx"


static func _dot(soft: float) -> ImageTexture:
	var n := 32
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var d := Vector2(x + 0.5 - n / 2.0, y + 0.5 - n / 2.0).length() / (n / 2.0)
			var hard := 1.0 if d < 0.84 else 0.0
			var smooth := clampf(1.0 - d, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, lerpf(hard, smooth, soft) if d <= 1.0 else 0.0))
	return ImageTexture.create_from_image(img)


static func _quad(size: float, tex: Texture2D, additive: bool) -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2(size, size)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if additive else BaseMaterial3D.BLEND_MODE_MIX
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = tex
	m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	q.material = m
	return q


func _ready() -> void:
	var soft := _dot(1.0)
	var hard := _dot(0.25)
	var fire := Vector3(0, 1.2 * BL.BUILDING_SCALE + BL.GROUND, 0)
	embers = CPUParticles3D.new()
	embers.amount = 70
	embers.lifetime = 2.0
	embers.mesh = _quad(0.12, hard, true)
	embers.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	embers.emission_box_extents = Vector3(0.5, 0.2, 0.5)
	embers.direction = Vector3.UP
	embers.spread = 8
	embers.initial_velocity_min = 1.2
	embers.initial_velocity_max = 2.6
	embers.gravity = Vector3(0, -0.4, 0)
	embers.damping_min = 0.3
	embers.damping_max = 0.6
	var eg := Gradient.new()
	eg.set_color(0, Color(1.0, 0.82, 0.29, 1.0))
	eg.set_color(1, Color(1.0, 0.35, 0.1, 0.0))
	embers.color_ramp = eg
	embers.position = fire
	add_child(embers)
	# Gate torches (board.js fx.torches): 6 voxels either side of each opening, in the wall.
	var v := BL.COLONY_RADIUS / 50.0
	for d in [[0, -1], [1, 0], [0, 1], [-1, 0]]:
		var dir := Vector3(d[0], 0, d[1])
		var along := Vector3(1, 0, 0) if absf(dir.x) < 0.01 else Vector3(0, 0, 1)
		for k in [-1, 1]:
			var p: Vector3 = dir * 47 * v + along * 6 * v * k
			p.y = 13.5 * v + BL.GROUND
			var s := CPUParticles3D.new()
			s.amount = 6
			s.lifetime = 0.7
			s.mesh = _quad(0.09, hard, true)
			s.direction = Vector3.UP
			s.spread = 15
			s.initial_velocity_min = 0.8
			s.initial_velocity_max = 1.5
			s.gravity = Vector3.ZERO
			s.color_ramp = eg
			s.position = p
			add_child(s)
			sparks.append(s)
	# Falling snow: two layers (small far flakes, big near flakes) over the view.
	for L in [{"n": 2900, "size": 0.18, "speed": [1.5, 3.0], "alpha": 0.7}, {"n": 1250, "size": 0.32, "speed": [3.0, 5.0], "alpha": 0.9}]:
		var s := CPUParticles3D.new()
		s.amount = L.n
		s.lifetime = 60.0 / ((L.speed[0] + L.speed[1]) / 2)
		s.preprocess = s.lifetime
		s.mesh = _quad(L.size, soft, false)
		s.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
		s.emission_box_extents = Vector3(60, 0.5, 60)
		s.direction = Vector3.DOWN
		s.spread = 5
		s.initial_velocity_min = L.speed[0]
		s.initial_velocity_max = L.speed[1]
		s.gravity = Vector3.ZERO
		s.color = Color(1, 1, 1, L.alpha)
		s.local_coords = false
		s.position = Vector3(0, 60, 0)
		add_child(s)
		snow.append(s)
	# Footprints.
	prints_mm = MultiMesh.new()
	prints_mm.transform_format = MultiMesh.TRANSFORM_3D
	prints_mm.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3(0.55, 0.06, 0.9)
	var pm := StandardMaterial3D.new()
	pm.vertex_color_use_as_albedo = true
	box.material = pm
	prints_mm.mesh = box
	prints_mm.instance_count = MAX_PRINTS
	for i in MAX_PRINTS:
		prints_mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3(0, -50, 0)))
		prints.append(null)
	var pmi := MultiMeshInstance3D.new()
	pmi.multimesh = prints_mm
	add_child(pmi)


## Smoke from the colony's chimneys and the city's (board.js fx.chimneys).
func set_chimneys(list: Array) -> void:
	for s in smoke:
		s.queue_free()
	smoke = []
	var tex := _dot(1.0)
	for c in list:
		var s := CPUParticles3D.new()
		s.amount = 26
		s.lifetime = 4.0
		s.mesh = _quad(1.0, tex, false)
		s.direction = Vector3(0.4, 1, 0.05).normalized()
		s.spread = 10
		s.initial_velocity_min = 0.7
		s.initial_velocity_max = 1.0
		s.gravity = Vector3.ZERO
		s.damping_min = 0.05
		s.damping_max = 0.1
		var curve := Curve.new()
		curve.add_point(Vector2(0, 0.6))
		curve.add_point(Vector2(1, 1.6))
		s.scale_amount_curve = curve
		var g := Gradient.new()
		g.set_color(0, Color(0.54, 0.59, 0.66, 0.0))
		g.add_point(0.15, Color(0.54, 0.59, 0.66, 0.5))
		g.set_color(g.get_point_count() - 1, Color(0.54, 0.59, 0.66, 0.0))
		s.color_ramp = g
		s.position = Vector3(c[0], c[1], c[2])
		add_child(s)
		smoke.append(s)


static func colony_chimneys() -> Array:
	var k := BL.COLONY_RADIUS / 50.0
	var out := []
	for h in [[18, 18], [-18, -18]]:
		out.append([(h[0] + 3) * k, 13 * k + BL.GROUND, h[1] * k])
	out.append([BL.COLONY_SLOTS.dorm[0], 3.4 + BL.GROUND, BL.COLONY_SLOTS.dorm[1]])
	return out


## atmosphere.js atmosphereFor: what the weather should look like for a state.
static func atmosphere_for(s: Dictionary) -> Dictionary:
	if s.is_empty():
		return {"storm": 0.35, "dusk": 0.5, "fire": 1.0}
	var rounds: int = s.scenario.days if s.scenario.days else 40
	var progress := clampf((s.day - 1) / float(maxi(1, rounds - 1)), 0, 1)
	var morale := clampf(s.morale / float(s.maxMorale if s.maxMorale else 10), 0, 1)
	var dusk: float = DUSK.get(s.time, 0.2)
	var storm := clampf(0.2 + progress * 0.45 + (1 - morale) * 0.45, 0, 1)
	var fire := 0.35 + morale * 0.75
	if s.phase == "draft":
		dusk = 0.15
	if s.phase == "gameOver":
		var won: bool = s.result != null and s.result.reason == "objectiveComplete"
		storm = 0.08 if won else 1.0
		fire = 1.15 if won else 0.05
		dusk = 0.0 if won else 1.0
	return {"storm": storm, "dusk": dusk, "fire": fire}


func set_state(s: Dictionary) -> void:
	goal = atmosphere_for(s)
	round_ = s.get("day", 1)


func walk(a: Vector3, b: Vector3, dur := 1.2) -> void:
	var trim := func(p: Vector3) -> float: return 11.5 if Vector2(p.x, p.z).length() < 1 else 7.5
	var d := Vector2(b.x - a.x, b.z - a.z)
	var len := d.length()
	if len < 1.6:
		return
	var u := d / len
	var pts := []
	var n := 0
	var x := maxf(1.6 * 1.5, trim.call(a))
	while x < len - maxf(1.6, trim.call(b)):
		var side := 0.45 if n % 2 else -0.45
		pts.append({"x": a.x + u.x * x - u.y * side, "z": a.z + u.y * x + u.x * side, "rot": atan2(u.x, u.y)})
		x += 1.6
		n += 1
	for i in pts.size():
		var p: Dictionary = pts[i]
		p.round = round_
		p.t = -i * (dur / maxf(1, pts.size()))
		prints[print_next] = p
		print_next = (print_next + 1) % MAX_PRINTS


func _process(dt: float) -> void:
	var k := 1 - exp(-dt * 0.9)
	for key in ["storm", "dusk", "fire"]:
		cur[key] += (goal[key] - cur[key]) * k
	var env: Environment = stage.env
	env.ambient_light_color = DAY.hemi.lerp(NIGHT.hemi, cur.dusk)
	env.ambient_light_energy = 0.42 - cur.dusk * 0.12 - cur.storm * 0.08
	stage.moon.light_color = DAY.moon.lerp(NIGHT.moon, cur.dusk)
	stage.moon.light_energy = 0.62 - cur.dusk * 0.14 - cur.storm * 0.15
	env.fog_light_color = DAY.fog.lerp(NIGHT.fog, cur.dusk)
	env.fog_density = 0.0015 + cur.storm * 0.006
	board.set_fire(cur.fire)
	(embers.mesh.material as StandardMaterial3D).albedo_color.a = clampf(cur.fire, 0.1, 1.0)
	var t := Time.get_ticks_msec() / 1000.0
	var wind: float = 0.6 + cur.storm * 1.6
	var gust: float = (sin(t * 0.27) * sin(t * 0.11) * 3.5 + 0.6) * wind
	for s in snow:
		(s.mesh.material as StandardMaterial3D).albedo_color.a = 0.35 + cur.storm * 0.65
		s.gravity = Vector3(gust, 0, 0)
		s.position = Vector3(stage.target.x, 60, stage.target.z)
	for i in MAX_PRINTS:
		var p = prints[i]
		if p == null:
			continue
		p.t += dt
		var age: float = (round_ - p.round) / 2.0
		if age >= 1:
			prints[i] = null
			prints_mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ZERO), Vector3(0, -50, 0)))
			continue
		var appear := clampf(p.t * 4, 0, 1)
		prints_mm.set_instance_transform(i, Transform3D(Basis(Vector3.UP, p.rot).scaled(Vector3.ONE * maxf(0.001, appear)), Vector3(p.x, BL.GROUND + 0.02, p.z)))
		prints_mm.set_instance_color(i, Color("#2a3a58").lerp(Color("#dfe8f5"), maxf(age, 0.05)))
