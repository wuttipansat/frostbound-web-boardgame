## src/render/stage.js: the diorama view: dark backdrop with haze, cold moon + sky fill + rim light, and the fixed
## isometric orthographic camera (drag to pan, wheel / pinch to zoom, kept over the city).
class_name Stage
extends Node3D

const VIEW_HEIGHT := 62.0
const DIST := 110.0
const POLAR := deg_to_rad(55.0)
const AZIMUTH := deg_to_rad(45.0)
const ZOOM_MIN := 0.75
const ZOOM_MAX := 3.5

var camera: Camera3D
var moon: DirectionalLight3D
var env: Environment
var target := Vector3.ZERO
var zoom := 1.05
var goal_zoom = null
var goal_target = null
var min_zoom := ZOOM_MIN
var pan_box := Rect2(-24, -24, 48, 48)
var home := {"target": Vector3.ZERO, "zoom": 1.05}
var touches := {}
var pinch_from := 0.0
signal zoom_changed(z: float)


func _ready() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#1a2130")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#9fb8e8").lerp(Color("#3a2f3c"), 0.35)
	env.ambient_light_energy = float(OS.get_environment("AMB")) if OS.get_environment("AMB") != "" else 0.3
	env.fog_enabled = OS.get_environment("NOFOG") == ""
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = Color("#1a2130")
	env.fog_density = 0.0021
	env.fog_sky_affect = 0.0
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.15
	env.glow_enabled = false # (the Compatibility renderer's glow floods the dark backdrop; the Mobile / Forward+ renderers can turn it on)
	env.glow_hdr_threshold = float(OS.get_environment("GT")) if OS.get_environment("GT") != "" else 1.6
	env.glow_intensity = 0.7
	env.glow_bloom = 0.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	moon = DirectionalLight3D.new()
	moon.light_color = Color("#b8d0ff")
	moon.light_energy = float(OS.get_environment("MOON")) if OS.get_environment("MOON") != "" else 0.45
	moon.shadow_enabled = true
	moon.shadow_bias = 0.04
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	moon.directional_shadow_max_distance = 220.0
	add_child(moon)
	moon.look_at_from_position(Vector3(-25, 70, 45), Vector3.ZERO)
	var rim := DirectionalLight3D.new()
	rim.light_color = Color("#7f9fe0")
	rim.light_energy = 0.35
	add_child(rim)
	rim.look_at_from_position(Vector3(-55, 18, -70), Vector3.ZERO)
	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.near = 1
	camera.far = 400
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	add_child(camera)
	_apply()


func view_height() -> float:
	var vp := get_viewport().get_visible_rect().size
	var aspect := vp.x / maxf(1.0, vp.y)
	return (VIEW_HEIGHT * 1.34) / maxf(aspect, 0.42) if aspect < 1.1 else VIEW_HEIGHT * 1.3


func _apply() -> void:
	var off := Vector3(DIST * sin(POLAR) * sin(AZIMUTH), DIST * cos(POLAR), DIST * sin(POLAR) * cos(AZIMUTH))
	camera.position = target + off
	camera.look_at(target, Vector3.UP)
	camera.size = view_height() / zoom


func _process(dt: float) -> void:
	if goal_target != null:
		var d: Vector3 = goal_target - target
		if d.length() < 0.05:
			goal_target = null
		target += d * minf(1.0, dt * 4)
	if goal_zoom != null:
		zoom += (goal_zoom - zoom) * minf(1.0, dt * 8)
		if absf(goal_zoom - zoom) < 0.003:
			zoom = goal_zoom
			goal_zoom = null
		zoom_changed.emit(zoom)
	_apply()


## Fit the usual view to the open city (stage.js view.fit): bounds = {x0, x1, z0, z1, block}.
func fit(b: Dictionary, snap := false) -> void:
	var us := []
	var vs := []
	for x in [b.x0, b.x1]:
		for z in [b.z0, b.z1]:
			us.append((x - z) / sqrt(2.0))
			vs.append((x + z) / sqrt(2.0))
	var u: float = (us.min() + us.max()) / 2
	var v: float = (vs.min() + vs.max()) / 2
	home.target = Vector3((u + v) / sqrt(2.0), 0, (v - u) / sqrt(2.0))
	var full: float = 3 * b.block * sqrt(2.0)
	var need: float = maxf(us.max() - us.min(), (vs.max() - vs.min()) * 0.82)
	var vp := get_viewport().get_visible_rect().size
	var portrait := vp.x < vp.y
	home.zoom = minf(ZOOM_MAX, 1.05 * (full / maxf(need, full * 0.45)) * (0.82 if portrait else 1.0))
	min_zoom = minf(ZOOM_MIN, home.zoom * 0.8)
	pan_box = Rect2(b.x0 - b.block, b.z0 - b.block, b.x1 - b.x0 + 2 * b.block, b.z1 - b.z0 + 2 * b.block)
	if snap:
		target = home.target
		zoom = home.zoom
		zoom_changed.emit(zoom)
		_apply()
	else:
		goal_target = home.target
		goal_zoom = home.zoom


func _clamp_target() -> void:
	target.x = clampf(target.x, pan_box.position.x, pan_box.end.x)
	target.z = clampf(target.z, pan_box.position.y, pan_box.end.y)
	target.y = 0


## Screen drag (pixels) -> pan on the ground plane.
func pan(rel: Vector2) -> void:
	var px := camera.size / get_viewport().get_visible_rect().size.y
	var right := camera.global_transform.basis.x
	var fwd := -camera.global_transform.basis.z
	fwd.y = 0
	fwd = fwd.normalized()
	right.y = 0
	right = right.normalized()
	target -= right * rel.x * px
	target += fwd * rel.y * px / cos(POLAR)
	goal_target = null
	_clamp_target()


func zoom_by(f: float) -> void:
	goal_zoom = clampf((goal_zoom if goal_zoom != null else zoom) * f, min_zoom, ZOOM_MAX)


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and e.button_mask & (MOUSE_BUTTON_MASK_LEFT | MOUSE_BUTTON_MASK_RIGHT):
		pan(e.relative)
	elif e is InputEventMouseButton and e.pressed:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom_by(1.15)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom_by(1 / 1.15)
	elif e is InputEventScreenTouch:
		if e.pressed:
			touches[e.index] = e.position
		else:
			touches.erase(e.index)
		pinch_from = _spread()
	elif e is InputEventScreenDrag:
		touches[e.index] = e.position
		if touches.size() == 1:
			pan(e.relative)
		elif touches.size() == 2:
			var d := _spread()
			if pinch_from > 0 and d > 0:
				zoom = clampf(zoom * d / pinch_from, min_zoom, ZOOM_MAX)
				goal_zoom = null
				zoom_changed.emit(zoom)
			pinch_from = d
	elif e is InputEventMagnifyGesture:
		zoom_by(e.factor)


func _spread() -> float:
	if touches.size() != 2:
		return 0.0
	var p := touches.values()
	return (p[0] as Vector2).distance_to(p[1])


## The ground point (y = 0.25) under a screen position.
func ground_at(screen: Vector2) -> Vector3:
	var o := camera.project_ray_origin(screen)
	var d := camera.project_ray_normal(screen)
	if absf(d.y) < 1e-5:
		return Vector3.ZERO
	var t := (0.25 - o.y) / d.y
	return o + d * t
