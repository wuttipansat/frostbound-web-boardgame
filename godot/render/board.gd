## src/render/board.js (the drawing half): draws a Compose description: instanced models as MultiMeshes, single
## models, merged meshes, furniture, drifts, lamp pools, the skyline; three levels of detail picked by zoom; warm
## lights; the flame. A new map is composed on a worker thread; what is new pops up (MAP-2 C).
class_name Board
extends Node3D

const LOD_SHOW := {"0": [0], "1": [1], "2": [2], "near": [0, 1], "far": [2], "all": [0, 1, 2]}
const POP := 0.35

var desc: Dictionary = {}
var map: Dictionary = {}
var levels: Dictionary = {}
var lod_level := 0
var lod_nodes := {}          # tag -> Node3D
var detail_nodes: Array = []
var content: Node3D
var flame: Node3D
var lights: Array = []
var fire_level := 1.0
var pools_mm: MultiMesh
var pool_flickers: Array = []
var amber_mat: StandardMaterial3D
var pops: Array = []         # [{mm or node, i, mat, delay}]
var pop_t := 0.0
var battery_saver := false
var _task := -1
var _pending: Compose
var _prev_keys := {}
var built := false
signal built_board(bounds: Dictionary)

static var _lit_mesh_mat: StandardMaterial3D
static var _mark_mat: StandardMaterial3D
static var _wire_mat: StandardMaterial3D
static var _pool_mat: StandardMaterial3D
static var _sky_mat: StandardMaterial3D
static var _sky_lit: StandardMaterial3D


func _ready() -> void:
	ModelPack.load_pack()
	_materials()


static func _materials() -> void:
	if _lit_mesh_mat != null:
		return
	_lit_mesh_mat = ModelPack.lit_material
	_mark_mat = ModelPack.lit_material.duplicate()
	_mark_mat.render_priority = 1
	_wire_mat = StandardMaterial3D.new()
	_wire_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_wire_mat.albedo_color = Color("#1c1f24")
	_pool_mat = StandardMaterial3D.new()
	_pool_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_pool_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_pool_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_pool_mat.no_depth_test = false
	_pool_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_pool_mat.albedo_color = Color(1.0, 0.70, 0.42, 0.55)
	_pool_mat.albedo_texture = _radial(64, [[0.0, 0.9], [0.45, 0.35], [1.0, 0.0]])
	_pool_mat.vertex_color_use_as_albedo = true
	_pool_mat.disable_fog = true
	_sky_mat = StandardMaterial3D.new()
	_sky_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_sky_mat.albedo_color = Color("#313d52")
	_sky_lit = StandardMaterial3D.new()
	_sky_lit.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_sky_lit.albedo_color = Color("#ffc66b") * 1.6


static func _radial(size: int, stops: Array) -> ImageTexture:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	for y in size:
		for x in size:
			var d := Vector2(x + 0.5 - size / 2.0, y + 0.5 - size / 2.0).length() / (size / 2.0)
			var a := 0.0
			for i in stops.size() - 1:
				if d >= stops[i][0] and d <= stops[i + 1][0]:
					a = lerpf(stops[i][1], stops[i + 1][1], (d - stops[i][0]) / (stops[i + 1][0] - stops[i][0]))
			img.set_pixel(x, y, Color(1, 1, 1, a))
	return ImageTexture.create_from_image(img)


# ---------------------------------------------------------------- building

## Draw a map. snap: build now (blocking) and show at once; else compose on a worker thread and pop the new parts in.
func set_map(m: Dictionary, base_levels: Dictionary = {}, snap := false) -> void:
	map = m.duplicate(true)
	levels = base_levels.duplicate()
	if snap or not built:
		var c := Compose.new()
		_apply(c.build(map, levels), not snap and built)
		return
	if _task >= 0:
		return # (one build at a time; the next set_map after it finishes catches up)
	_pending = Compose.new()
	var mm := map
	var lv := levels
	_task = WorkerThreadPool.add_task(func(): _pending.build(mm, lv))


func set_base(base_levels: Dictionary) -> void:
	if base_levels.hash() == levels.hash():
		return
	set_map(map, base_levels)


func _process(dt: float) -> void:
	if _task >= 0 and WorkerThreadPool.is_task_completed(_task):
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		_apply(_pending.desc, true)
		_pending = null
	_animate(dt)


func _apply(d: Dictionary, animate: bool) -> void:
	var old := content
	desc = d
	content = Node3D.new()
	content.name = "content"
	add_child(content)
	lod_nodes = {}
	detail_nodes = []
	pops = []
	pop_t = 0.0
	for tag in LOD_SHOW:
		var n := Node3D.new()
		n.name = "lod-" + tag
		content.add_child(n)
		lod_nodes[tag] = n
	var keys := {}
	var fresh := func(k: String) -> bool:
		keys[k] = true
		return animate and not _prev_keys.has(k)
	# instanced models
	for k in desc.instances:
		var e: Dictionary = desc.instances[k]
		if e.get("custom"):
			_custom(e)
			continue
		var mesh = ModelPack.combined(e.key)
		if mesh == null:
			continue
		var mmi := _multimesh(mesh, e.mats, e.tints, e.get("shadow", true))
		mmi.name = k
		(lod_nodes[e.lod] as Node3D).add_child(mmi)
		if e.get("detail"):
			detail_nodes.append(mmi)
		for i in e.mats.size():
			if fresh.call(k + "|" + _pkey(e.mats[i])):
				pops.append({"mm": mmi.multimesh, "i": i, "mat": e.mats[i]})
	# single models
	for e in desc.models:
		var mesh = ModelPack.combined(e[0])
		if mesh == null:
			continue
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.transform = V.to_transform(e[2])
		(lod_nodes[e[1]] as Node3D).add_child(mi)
		if e[0].begins_with("flame|"):
			flame = mi
		elif fresh.call(e[0] + "|" + _pkey(e[2])):
			pops.append({"node": mi, "mat": e[2], "model": true})
	# merged meshes
	for k in desc.meshes:
		var parts: PackedStringArray = k.split("@")
		for m in desc.meshes[k]:
			var mi := MeshInstance3D.new()
			if m.has("lines"):
				mi.mesh = _lines(m.lines)
			else:
				mi.mesh = _array_mesh(m, _mark_mat if parts[0] == "markings" or parts[0] == "river" else _lit_mesh_mat)
			mi.name = parts[0]
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if parts[0] in ["markings", "kerb-ramps", "railway", "river", "wires"] else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			(lod_nodes[parts[1]] as Node3D).add_child(mi)
			if parts[0] == "rim":
				detail_nodes.append(mi)
	# furniture: one MultiMesh per build (and per detail flag)
	var groups := {}
	for f in desc.furniture:
		var gk: String = f[8] + ("|detail" if f[7] else "")
		if not groups.has(gk):
			groups[gk] = {"key": f[8], "mats": [], "detail": f[7]}
		groups[gk].mats.append(f[9])
	for gk in groups:
		var g: Dictionary = groups[gk]
		var mesh = ModelPack.combined(g.key)
		if mesh == null:
			continue
		if g.key.begins_with("tlight-amber|"):
			mesh = _amber(mesh)
		var mmi := _multimesh(mesh, g.mats, null, true)
		mmi.name = "furniture " + gk
		(lod_nodes["all"] as Node3D).add_child(mmi)
		if g.detail:
			detail_nodes.append(mmi)
		for i in g.mats.size():
			if fresh.call("f" + gk + "|" + _pkey(g.mats[i])):
				pops.append({"mm": mmi.multimesh, "i": i, "mat": g.mats[i]})
	_lights()
	_prev_keys = keys
	if old != null:
		old.queue_free()
	set_zoom_level(lod_level, true)
	for n in detail_nodes:
		n.visible = not battery_saver
	# Start the new parts small and below the ground, nearest the colony first.
	pops.sort_custom(func(a, b): return Vector2(a.mat[12], a.mat[14]).length_squared() < Vector2(b.mat[12], b.mat[14]).length_squared())
	for r in pops.size():
		pops[r].delay = 0.25 + minf(2.4, r * 0.02)
	_step_pops(0.0)
	built = true
	built_board.emit(bounds())


static func _pkey(m: Array) -> String:
	return "%d,%d,%d" % [JS.round_(m[12] * 100), JS.round_(m[13] * 100), JS.round_(m[14] * 100)]


func _multimesh(mesh: Mesh, mats: Array, tints, shadow: bool, force_colors := false) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	var colored: bool = force_colors or (tints != null and tints.any(func(t): return t != null))
	mm.use_colors = colored
	mm.mesh = mesh
	mm.instance_count = mats.size()
	for i in mats.size():
		mm.set_instance_transform(i, V.to_transform(mats[i]))
		if colored:
			var t = tints[i] if tints != null and i < tints.size() else null
			mm.set_instance_color(i, Color(t[0], t[1], t[2]) if t != null else Color.WHITE)
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi


## A packed mesh dict (three.js winding, linear colours) -> ArrayMesh.
static func _array_mesh(m: Dictionary, mat: Material) -> ArrayMesh:
	var pos: PackedVector3Array = m.pos
	var col := PackedColorArray()
	col.resize(m.col.size())
	for i in m.col.size():
		col[i] = (m.col[i] as Color).linear_to_srgb()
	var idx := PackedInt32Array()
	idx.resize(m.idx.size())
	for t in range(0, m.idx.size(), 3):
		idx[t] = m.idx[t]
		idx[t + 1] = m.idx[t + 2]
		idx[t + 2] = m.idx[t + 1]
	var nrm: PackedVector3Array = m.nrm
	if m.get("computed_normals") or nrm.size() != pos.size():
		nrm = PackedVector3Array()
		nrm.resize(pos.size())
		for t in range(0, m.idx.size(), 3):
			var a: Vector3 = pos[m.idx[t]]
			var fn := (pos[m.idx[t + 1]] - a).cross(pos[m.idx[t + 2]] - a)
			for k in 3:
				nrm[m.idx[t + k]] += fn
		for i in nrm.size():
			nrm[i] = nrm[i].normalized()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_COLOR] = col
	arrays[Mesh.ARRAY_INDEX] = idx
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	am.surface_set_material(0, mat)
	return am


static func _lines(lines: Array) -> ArrayMesh:
	var pos := PackedVector3Array()
	for l in lines:
		pos.append(Vector3(l[0][0], l[0][1], l[0][2]))
		pos.append(Vector3(l[1][0], l[1][1], l[1][2]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	var am := ArrayMesh.new()
	am.add_surface_from_arrays(Mesh.PRIMITIVE_LINES, arrays)
	am.surface_set_material(0, _wire_mat)
	return am


func _amber(mesh: ArrayMesh) -> ArrayMesh:
	var g: int = mesh.get_meta("glow_surface", -1)
	if g < 0:
		return mesh
	var copy: ArrayMesh = mesh.duplicate()
	amber_mat = (copy.surface_get_material(g) as StandardMaterial3D).duplicate()
	copy.surface_set_material(g, amber_mat)
	return copy


## Drifts, lamp pools and the skyline: geometry made here (not voxel builds).
func _custom(e: Dictionary) -> void:
	var mesh: Mesh
	var shadow := false
	if e.key.begins_with("drift-"):
		mesh = drift_mesh(int(e.key.substr(6)))
	elif e.key == "lamp-pools":
		var q := QuadMesh.new()
		q.size = Vector2(1, 1)
		q.material = _pool_mat
		mesh = q
	elif e.key == "skyline-cards" or e.key == "skyline-lights":
		var b := BoxMesh.new()
		b.material = _sky_mat if e.key == "skyline-cards" else _sky_lit
		mesh = b
	else:
		return
	var mmi := _multimesh(mesh, e.mats, null, shadow, e.key == "lamp-pools")
	mmi.name = e.key
	if e.key == "lamp-pools":
		pools_mm = mmi.multimesh
		for i in e.mats.size():
			pools_mm.set_instance_color(i, Color.WHITE)
		pool_flickers = e.get("flickers", [])
	(lod_nodes[e.lod] as Node3D).add_child(mmi)
	if e.key.begins_with("skyline"):
		var dir: Array = desc.get("sky_dir", [-1, 0, -1])
		# (the camera looks along (−1, 0, −1)/√2: the skyline shows only while it stands behind the city)
		mmi.visible = Vector3(-1, 0, -1).normalized().dot(Vector3(dir[0], 0, dir[2])) > 0.15


static var _drifts := {}


## board.js DRIFT_GEOS: a flattened, wobbly half dome (three.js SphereGeometry(1, 18, 5, 0, 2π, 0, π/2)).
static func drift_mesh(v: int) -> ArrayMesh:
	if _drifts.has(v):
		return _drifts[v]
	var ws := 18
	var hs := 5
	var pos := PackedVector3Array()
	var col := PackedColorArray()
	var grid := []
	var snow := Color("#f2f6fc").srgb_to_linear()
	var under := Color("#c9d6e6").srgb_to_linear()
	for iy in hs + 1:
		var row := []
		var vv := float(iy) / hs
		for ix in ws + 1:
			var u := float(ix) / ws
			var x := -cos(u * TAU) * sin(vv * PI / 2)
			var y := cos(vv * PI / 2)
			var z := sin(u * TAU) * sin(vv * PI / 2)
			var n := 1 + (BL.hash3(JS.round_(atan2(z, x) * 3), v, 7) - 0.5) * 0.3 * (1 - y)
			pos.append(Vector3(x * n * 2.4, y * (0.32 + v * 0.16), z * n * 1.4))
			col.append(snow.lerp(under, (1 - y) * 0.35).linear_to_srgb())
			row.append(pos.size() - 1)
		grid.append(row)
	var idx := PackedInt32Array()
	for iy in hs:
		for ix in ws:
			var a: int = grid[iy][ix + 1]
			var b: int = grid[iy][ix]
			var c: int = grid[iy + 1][ix]
			var d: int = grid[iy + 1][ix + 1]
			if iy != 0:
				idx.append_array([a, d, b])
			idx.append_array([b, d, c])
	var st := SurfaceTool.new()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_COLOR] = col
	arrays[Mesh.ARRAY_INDEX] = idx
	var tmp := ArrayMesh.new()
	tmp.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	st.create_from(tmp, 0)
	st.generate_normals()
	var mesh := st.commit()
	mesh.surface_set_material(0, ModelPack.lit_material)
	_drifts[v] = mesh
	return mesh


# ---------------------------------------------------------------- lights

func _lights() -> void:
	for l in lights:
		l.node.queue_free()
	lights = []
	var fire := OmniLight3D.new()
	fire.light_color = Color("#ff8a3c")
	fire.omni_range = 32
	fire.omni_attenuation = 1.2
	fire.light_energy = 6.0
	fire.position = Vector3(0, 4.5, 0)
	content.add_child(fire)
	lights.append({"node": fire, "base": 6.0, "flicker": 0.25})
	for id in BL.START_FRONT:
		var L = desc.layout.get(id)
		if L == null:
			continue
		var c := Vector3(L.center[0], L.center[1], L.center[2])
		var p := c + c.normalized() * -6.5
		var lamp := OmniLight3D.new()
		lamp.light_color = Color("#ffa552")
		lamp.omni_range = 16
		lamp.omni_attenuation = 1.5
		lamp.light_energy = 3.0
		lamp.position = Vector3(p.x, 3, p.z)
		content.add_child(lamp)
		lights.append({"node": lamp, "base": 3.0, "flicker": 0.08})


# ---------------------------------------------------------------- level of detail, animation

## board.js setZoom: 0 (close, refined models) at zoom ≥ 0.8, 1 at ≥ 0.56, else 2 (the whole-city view).
func set_zoom(z: float) -> void:
	set_zoom_level(0 if z >= 0.8 else (1 if z >= 0.56 else 2))


func set_zoom_level(level: int, force := false) -> void:
	if level == lod_level and not force:
		return
	lod_level = level
	for tag in lod_nodes:
		(lod_nodes[tag] as Node3D).visible = LOD_SHOW[tag].has(level)


func set_battery_saver(on: bool) -> void:
	battery_saver = on
	for n in detail_nodes:
		if is_instance_valid(n):
			n.visible = not on


func set_fire(k: float) -> void:
	fire_level = k


func _curve(p: float) -> Array:
	var e := 1 - pow(1 - p, 3)
	return [0.6 + 0.45 * (p / 0.6) if p < 0.6 else 1.05 - 0.05 * ((p - 0.6) / 0.4), -6 * (1 - e)]


func _step_pops(dt: float) -> void:
	if pops.is_empty():
		return
	pop_t += dt
	var done := true
	for pc in pops:
		var p := clampf((pop_t - pc.delay) / POP, 0.0, 1.0)
		if p < 1:
			done = false
		var ky: Array = [1.0, 0.0] if p >= 1 else ([0.001, -6.0] if p <= 0 else _curve(p))
		var t := V.to_transform(pc.mat)
		var o := t.origin
		t = Transform3D(t.basis * Basis.from_scale(Vector3.ONE * ky[0]), Vector3(o.x, o.y + ky[1], o.z))
		if pc.has("mm"):
			pc.mm.set_instance_transform(pc.i, t)
		else:
			pc.node.transform = t
	if done:
		pops = []


func _animate(dt: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	_step_pops(dt)
	if flame != null:
		var fl := minf(1.3, fire_level)
		flame.visible = fl > 0.15
		flame.scale = Vector3(fl * (1 + sin(t * 17) * 0.06), fl * (1 + sin(t * 11.3) * 0.18 + sin(t * 23) * 0.08), fl * (1 + cos(t * 15) * 0.06))
		flame.rotation.y = sin(t * 2.1) * 0.4
	for i in lights.size():
		var l: Dictionary = lights[i]
		var f := sin(t * 13 + i * 3) * 0.5 + sin(t * 7.3 + i) * 0.5
		l.node.light_energy = l.base * (1 + f * l.flicker) * (fire_level if i == 0 else 1.0)
	if amber_mat != null:
		amber_mat.albedo_color.a = 1.0 if int(floor(t * 1.6)) % 2 == 0 else 0.0
		amber_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if pools_mm != null:
		for n in pool_flickers.size():
			var f := 0.15 if sin(t * 9 + n * 2.3) > 0.6 or sin(t * 23 + n) > 0.93 else 1.0
			pools_mm.set_instance_color(pool_flickers[n], Color(f, f, f))


# ---------------------------------------------------------------- queries

## World extents of the open blocks: {x0, x1, z0, z1, block}.
func bounds() -> Dictionary:
	var xs := []
	var zs := []
	for k in map.blocks:
		var p := BL.parse(k)
		xs.append(p[0])
		zs.append(p[1])
	return {"x0": BL.block_pos(xs.min()) - BL.block_half(xs.min()), "x1": BL.block_pos(xs.max()) + BL.block_half(xs.max()),
		"z0": BL.block_pos(zs.min()) - BL.block_half(zs.min()), "z1": BL.block_pos(zs.max()) + BL.block_half(zs.max()), "block": BL.BLOCK}


## The place under a ground point (by the web board's pick radii), or "".
func location_at(p: Vector3) -> String:
	var best := ""
	var bd := INF
	for id in desc.get("layout", {}):
		var L: Dictionary = desc.layout[id]
		var d := Vector2(p.x - L.center[0], p.z - L.center[2]).length()
		if d < L.hitRadius and d < bd:
			bd = d
			best = id
	return best
