## src/render/pieces.js: survivors, zombies and barricades on the board, kept in step with the game state.
## Survivors hop between places (through the nearest colony gate), pop in, topple when they die; zombies rise from
## the snow, shuffle, fall and sink; barricades pop in and break. Snow puffs and breath clouds.
class_name Pieces
extends Node3D

const SURVIVOR_SCALE := 1.3
const CHAR := 0.075
const ZOMBIE_VARIANTS := 5

var board: Board
var survivors := {}       # id -> {group, body, loc, slot, moving, dying, phase, breath, glow}
var slots := {}           # loc -> {id: slot}
var zombies := {}         # loc -> [item]
var barricades := {}      # loc -> [item]
var zombie_mm: Array = [] # MultiMesh per variant
var zombie_items: Array = []
var barricade_mm: MultiMesh
var barricade_items: Array = []
var puffs: Array = []
var puff_mm: MultiMesh
var ring: MeshInstance3D
var highlighted := ""
var pending := 0
var t := 0.0
static var _outline_mat: StandardMaterial3D
static var _disc_mat: StandardMaterial3D
static var _act_mat: StandardMaterial3D


func _init(b: Board) -> void:
	board = b
	name = "pieces"


func _ready() -> void:
	_outline_mat = StandardMaterial3D.new()
	_outline_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_outline_mat.albedo_color = Color("#0c0f14")
	_outline_mat.cull_mode = BaseMaterial3D.CULL_FRONT
	_disc_mat = StandardMaterial3D.new()
	_disc_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_disc_mat.albedo_color = Color("#f2b33d")
	_act_mat = StandardMaterial3D.new()
	_act_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_act_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_act_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_act_mat.albedo_color = Color(0.56, 0.85, 1.0, 0.35)
	for v in ZOMBIE_VARIANTS:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = ModelPack.combined(ModelPack.key_of("zombie-%d" % v, {"size": CHAR, "jitter": 0}))
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		add_child(mmi)
		zombie_mm.append(mm)
		zombie_items.append([])
	barricade_mm = MultiMesh.new()
	barricade_mm.transform_format = MultiMesh.TRANSFORM_3D
	barricade_mm.mesh = ModelPack.combined(ModelPack.key_of("barricade", {"size": 0.11, "jitter": 0}))
	var bmi := MultiMeshInstance3D.new()
	bmi.multimesh = barricade_mm
	add_child(bmi)
	puff_mm = MultiMesh.new()
	puff_mm.transform_format = MultiMesh.TRANSFORM_3D
	puff_mm.use_colors = true
	var box := BoxMesh.new()
	box.size = Vector3(0.16, 0.16, 0.16)
	var pm := StandardMaterial3D.new()
	pm.vertex_color_use_as_albedo = true
	box.material = pm
	puff_mm.mesh = box
	var pmi := MultiMeshInstance3D.new()
	pmi.multimesh = puff_mm
	pmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(pmi)
	ring = MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.85
	tm.outer_radius = 1.12
	tm.rings = 4
	var rm := StandardMaterial3D.new()
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rm.albedo_color = Color("#ffc46b")
	tm.material = rm
	ring.mesh = tm
	ring.scale = Vector3(1, 0.05, 1)
	ring.position.y = 0.1
	ring.visible = false


# ---------------------------------------------------------------- helpers (pieces.js)

static func assign_slots(prev: Dictionary, ids: Array) -> Dictionary:
	var out := {}
	var taken := {}
	for id in ids:
		var s = prev.get(id)
		if s != null and not taken.has(s):
			out[id] = s
			taken[s] = true
	var nxt := 0
	for id in ids:
		if out.has(id):
			continue
		while taken.has(nxt):
			nxt += 1
		out[id] = nxt
		taken[nxt] = true
	return out


static func zombie_slot_index(loc: String, i: int) -> int:
	if loc != "colony":
		return i
	var gates: int = Content.LOCATIONS.colony.entrances
	var per: int = Content.LOCATIONS.colony.zombieSlots / gates
	return (i % gates) * per + floori(i / float(gates))


static func z_slots(id: String) -> int:
	var l = Content.LOCATIONS.get(id)
	if l == null:
		var re := RegEx.create_from_string("-\\d+$")
		l = Content.LOCATIONS.get(re.sub(id, ""))
	return l.zombieSlots if l != null else 6


func _v(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


func survivor_slot_pos(loc: String, k: int) -> Vector3:
	var L: Dictionary = board.desc.layout[loc]
	var n: int = L.survivorSlots.size()
	var p := _v(L.survivorSlots[k % n])
	if k >= n:
		var out := (p - _v(L.center))
		out.y = 0
		p += out.normalized() * 1.8 * floori(k / float(n))
	return p


func zombie_slot_pos(loc: String, i: int) -> Vector3:
	var L: Dictionary = board.desc.layout[loc]
	return _v(L.zombieSlots[zombie_slot_index(loc, i) % L.zombieSlots.size()])


static func face_toward(from: Vector3, to: Vector3) -> float:
	return atan2(to.x - from.x, to.z - from.z)


func route(from_pos: Vector3, from_loc: String, to_pos: Vector3, to_loc: String) -> Array:
	var pts := [from_pos]
	var gates: Array = board.desc.layout.colony.gates
	var gate_near := func(p: Vector3) -> Vector3:
		var best := _v(gates[0])
		for g in gates:
			if _v(g).distance_to(p) < best.distance_to(p):
				best = _v(g)
		return best
	if from_loc == "colony" and to_loc != "colony":
		var g: Vector3 = gate_near.call(to_pos)
		pts.append_array([g * 0.75, g * 1.3])
	if to_loc == "colony" and from_loc != "colony":
		var g: Vector3 = gate_near.call(from_pos)
		pts.append_array([g * 1.3, g * 0.75])
	pts.append(to_pos)
	return pts


# ---------------------------------------------------------------- survivors

func _create_survivor(id: String) -> Dictionary:
	var group := Node3D.new()
	group.name = "survivor " + id
	var body := Node3D.new()
	var big := Node3D.new()
	big.scale = Vector3.ONE * SURVIVOR_SCALE
	var mesh = ModelPack.combined(ModelPack.key_of("char-" + id, {"size": CHAR, "jitter": 0}))
	if mesh != null and OS.get_environment("NOOUTLINE") == "":
		var outline := MeshInstance3D.new()
		outline.mesh = mesh
		outline.material_override = _outline_mat
		outline.scale = Vector3.ONE * 1.07
		outline.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		big.add_child(outline)
	if mesh != null:
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		big.add_child(mi)
	body.add_child(big)
	var disc := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.78
	cyl.bottom_radius = 0.78
	cyl.height = 0.08
	cyl.material = _disc_mat
	disc.mesh = cyl
	disc.position.y = 0.04
	group.add_child(disc)
	group.add_child(body)
	var glow := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.95
	cm.bottom_radius = 0.95
	cm.height = 0.01
	cm.material = _act_mat
	glow.mesh = cm
	glow.position.y = 0.09
	glow.visible = false
	group.add_child(glow)
	add_child(group)
	return {"id": id, "group": group, "body": body, "glow": glow, "loc": "", "slot": -1, "moving": false, "dying": false, "phase": randf() * 10, "breath": randf() * 3}


func _hop(vis: Dictionary, pts: Array, facing: float) -> void:
	var segs := []
	var total := 0.0
	for i in range(1, pts.size()):
		var l: float = pts[i].distance_to(pts[i - 1])
		segs.append({"a": pts[i - 1], "b": pts[i], "len": l, "start": total})
		total += l
	var hops := maxi(1, ceili(total / 2.6))
	var duration := minf(3.2, 0.24 * hops + 0.1)
	if vis.get("tween") != null and vis.tween.is_valid():
		vis.tween.kill() # (a newer move replaces one still on its way)
		pending -= 1
	vis.moving = true
	pending += 1
	var tw := create_tween()
	vis.tween = tw
	tw.tween_method(func(tt: float):
		var d := tt * total
		var seg: Dictionary = segs[segs.size() - 1]
		for s in segs:
			if d <= s.start + s.len + 1e-6:
				seg = s
				break
		var p: Vector3 = seg.a.lerp(seg.b, (d - seg.start) / seg.len if seg.len else 1.0)
		var local := fmod(tt * hops, 1.0)
		p.y = sin(PI * local) * 0.9
		vis.group.position = p
		vis.group.rotation.y = face_toward(seg.a, seg.b)
		var squash := 0.88 if local < 0.15 or local > 0.85 else 1.04
		vis.body.scale = Vector3(2 - squash, squash, 2 - squash), 0.0, 1.0, duration)
	tw.tween_callback(func():
		vis.group.position.y = 0
		vis.body.scale = Vector3.ONE
		vis.group.rotation.y = facing
		vis.moving = false
		vis.tween = null
		pending -= 1
		burst(vis.group.position, 6))


func _appear(vis: Dictionary, pos: Vector3, facing: float, animate: bool) -> void:
	vis.group.position = pos
	vis.group.rotation.y = facing
	if not animate:
		return
	vis.group.scale = Vector3.ONE * 0.01
	pending += 1
	burst(pos, 16)
	var tw := create_tween()
	tw.tween_property(vis.group, "scale", Vector3.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func(): pending -= 1)


func _kill(vis: Dictionary, animate: bool) -> void:
	vis.dying = true
	if highlighted == vis.id:
		set_highlight("")
	survivors.erase(vis.id)
	if not animate:
		vis.group.queue_free()
		return
	pending += 1
	var tw := create_tween()
	tw.tween_property(vis.body, "rotation:x", -PI / 2, 0.45).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func(): burst(vis.group.position, 18, Color("#9a2b2b")))
	tw.tween_property(vis.group, "position:y", -1.6, 0.7).set_delay(0.3).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(func():
		vis.group.queue_free()
		pending -= 1)


# ---------------------------------------------------------------- zombies & barricades

func _spawn_zombie(loc: String, i: int, animate: bool) -> Dictionary:
	var pos := zombie_slot_pos(loc, i)
	var variant := (i + loc.length()) % ZOMBIE_VARIANTS
	var c := _v(board.desc.layout[loc].center)
	var item := {"p": pos, "base_y": -2.2 if animate else 0.0, "rot_y": face_toward(pos, c) + (randf() - 0.5) * 0.5, "lean": 0.0,
		"phase": randf() * 10, "variant": variant, "twitch": 0.0, "dying": false, "y": 0.0, "tilt_x": 0.0, "tilt_z": 0.0}
	zombie_items[variant].append(item)
	if animate:
		pending += 1
		burst(pos, 18, Color("#e3ecf7"), 1.1)
		var tw := create_tween()
		tw.tween_interval(randf() * 0.25)
		tw.tween_callback(func(): burst(pos, 10))
		tw.tween_method(func(e: float):
			item.base_y = -2.2 * (1 - e)
			item.lean = (1 - e) * 0.5, 0.0, 1.0, 1.0).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_callback(func(): pending -= 1)
	return item


func _remove_zombie(item: Dictionary, animate: bool) -> void:
	if not animate:
		zombie_items[item.variant].erase(item)
		return
	item.dying = true
	pending += 1
	var tw := create_tween()
	tw.tween_method(func(e: float): item.lean = -1.4 * e, 0.0, 1.0, 0.35)
	tw.tween_callback(func(): burst(item.p + Vector3(0, 0.2, 0), 14, Color("#6f8a4e")))
	tw.tween_method(func(e: float): item.base_y = -2.2 * e, 0.0, 1.0, 0.6)
	tw.tween_callback(func():
		zombie_items[item.variant].erase(item)
		pending -= 1)


func _add_barricade(loc: String, j: int, animate: bool) -> Dictionary:
	var pos := zombie_slot_pos(loc, z_slots(loc) - 1 - j)
	var item := {"p": pos, "rot_y": face_toward(pos, _v(board.desc.layout[loc].center)) + PI / 2, "scale": 0.01 if animate else 1.0, "tilt_z": 0.0}
	barricade_items.append(item)
	if animate:
		pending += 1
		burst(pos, 8, Color("#8a6444"))
		var tw := create_tween()
		tw.tween_method(func(e: float): item.scale = maxf(0.01, e), 0.0, 1.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_callback(func(): pending -= 1)
	return item


func _remove_barricade(item: Dictionary, animate: bool) -> void:
	if not animate:
		barricade_items.erase(item)
		return
	burst(item.p, 16, Color("#6b4a32"), 1.2)
	pending += 1
	var tw := create_tween()
	tw.tween_method(func(e: float):
		item.scale = 1 - e * 0.99
		item.tilt_z = e, 0.0, 1.0, 0.3)
	tw.tween_callback(func():
		barricade_items.erase(item)
		pending -= 1)


# ---------------------------------------------------------------- sync with the state

func sync(state: Dictionary, animate := true) -> void:
	if board.desc.is_empty():
		return
	for id in survivors.keys():
		if not state.survivors.has(id):
			var vis: Dictionary = survivors[id]
			if highlighted == id:
				set_highlight("")
			vis.group.queue_free()
			survivors.erase(id)
	var by_loc := {}
	for id in state.locations:
		by_loc[id] = []
	for id in state.survivors:
		var sv: Dictionary = state.survivors[id]
		if sv.alive and by_loc.has(sv.location):
			by_loc[sv.location].append(sv.id)
	for loc in by_loc:
		var prev := {}
		for id in slots.get(loc, {}):
			if survivors.has(id) and survivors[id].loc == loc:
				prev[id] = slots[loc][id]
		slots[loc] = assign_slots(prev, by_loc[loc])
	for id in state.survivors:
		var sv: Dictionary = state.survivors[id]
		var vis = survivors.get(id)
		if not sv.alive:
			if vis != null and not vis.dying:
				_kill(vis, animate)
			continue
		if not board.desc.layout.has(sv.location):
			continue
		var slot: int = slots[sv.location][id]
		var pos := survivor_slot_pos(sv.location, slot)
		var facing := face_toward(pos, _v(board.desc.layout[sv.location].center))
		if vis == null:
			vis = _create_survivor(id)
			survivors[id] = vis
			_appear(vis, pos, facing, animate)
		elif vis.loc != sv.location or vis.slot != slot:
			if animate:
				_hop(vis, route(vis.group.position, vis.loc, pos, sv.location), facing)
			else:
				vis.group.position = pos
				vis.group.rotation.y = facing
		vis.loc = sv.location
		vis.slot = slot
	for id in state.locations:
		if not board.desc.layout.has(id):
			continue
		if not zombies.has(id):
			zombies[id] = []
			barricades[id] = []
		var zs: Array = zombies[id]
		var target: int = state.locations[id].zombies
		while zs.size() > target:
			_remove_zombie(zs.pop_back(), animate)
		while zs.size() < target:
			zs.append(_spawn_zombie(id, zs.size(), animate))
		var bs: Array = barricades[id]
		var tb: int = state.locations[id].barricades
		while bs.size() > tb:
			_remove_barricade(bs.pop_back(), animate)
		while bs.size() < tb:
			bs.append(_add_barricade(id, bs.size(), animate))


# ---------------------------------------------------------------- per frame

func burst(pos: Vector3, n := 14, color := Color("#f2f6fc"), power := 1.0) -> void:
	for i in n:
		if puffs.size() >= 400:
			break
		var a := randf() * TAU
		var s := (0.8 + randf() * 1.6) * power
		puffs.append({"p": pos + Vector3(0, 0.15, 0), "v": Vector3(cos(a) * s, (1.5 + randf() * 2.5) * power, sin(a) * s), "life": 0.6 + randf() * 0.5, "color": color})


func _process(dt: float) -> void:
	t += dt
	for v in ZOMBIE_VARIANTS:
		var items: Array = zombie_items[v]
		var mm: MultiMesh = zombie_mm[v]
		mm.instance_count = items.size()
		for i in items.size():
			var z: Dictionary = items[i]
			var ph: float = t * 2.4 + z.phase
			z.y = z.base_y + (0.0 if z.dying else absf(sin(ph)) * 0.07)
			if not z.dying and z.twitch <= 0 and randf() < dt * 0.15:
				z.twitch = 0.35
			z.twitch = maxf(0.0, z.twitch - dt)
			var snap := sin((0.35 - z.twitch) * 18) * 0.35 if z.twitch > 0 else 0.0
			z.tilt_z = 0.0 if z.dying else sin(ph * 0.5) * 0.14 + snap
			z.tilt_x = 0.12 + z.lean + sin(ph) * 0.03
			mm.set_instance_transform(i, Transform3D(Basis.from_euler(Vector3(z.tilt_x, z.rot_y, z.tilt_z), EULER_ORDER_YXZ), Vector3(z.p.x, z.y, z.p.z)))
	barricade_mm.instance_count = barricade_items.size()
	for i in barricade_items.size():
		var b: Dictionary = barricade_items[i]
		barricade_mm.set_instance_transform(i, Transform3D(Basis.from_euler(Vector3(0, b.rot_y, b.tilt_z), EULER_ORDER_YXZ).scaled(Vector3.ONE * b.scale), Vector3(b.p.x, 0, b.p.z)))
	for id in survivors:
		var vis: Dictionary = survivors[id]
		if vis.moving or vis.dying:
			continue
		vis.body.scale.y = 1 + sin(t * 2 + vis.phase) * 0.025
		vis.body.rotation.z = sin(t * 0.9 + vis.phase) * 0.035
		vis.breath -= dt
		if vis.breath <= 0:
			vis.breath = 2.5 + randf() * 2
			var dir := Vector3(sin(vis.group.rotation.y), 0, cos(vis.group.rotation.y))
			var p: Vector3 = vis.group.position + dir * 0.55
			p.y = 1.65
			burst(p, 3, Color("#eef4fb"), 0.12)
	var alive := []
	for q in puffs:
		q.life -= dt
		if q.life > 0:
			q.v.y -= 9 * dt
			q.p += q.v * dt
			if q.p.y < 0.05:
				q.p.y = 0.05
				q.v *= 0.5
			alive.append(q)
	puffs = alive
	puff_mm.instance_count = puffs.size()
	for i in puffs.size():
		var q: Dictionary = puffs[i]
		puff_mm.set_instance_transform(i, Transform3D(Basis.from_euler(Vector3(q.life * 5, q.life * 3, 0)).scaled(Vector3.ONE * minf(1.0, q.life / 0.4)), q.p))
		puff_mm.set_instance_color(i, q.color)
	_act_mat.albedo_color.a = 0.25 + sin(t * 3.2) * 0.12
	if ring.visible:
		ring.scale = Vector3(1, 0.05, 1) * (1 + sin(t * 4) * 0.06)


func set_highlight(id: String) -> void:
	var vis = survivors.get(id) if id != "" else null
	highlighted = id if vis != null else ""
	if ring.get_parent() != null:
		ring.get_parent().remove_child(ring)
	ring.visible = vis != null
	if vis != null:
		vis.group.add_child(ring)


func set_acting(ids: Array) -> void:
	for id in survivors:
		survivors[id].glow.visible = ids.has(id)


func burst_at(survivor_id: String, colors: Array, n := 18, power := 1.1) -> void:
	var vis = survivors.get(survivor_id)
	if vis == null:
		return
	var p: Vector3 = vis.group.position
	p.y = 1.2
	for c in colors:
		burst(p, ceili(float(n) / colors.size()), c, power)


## The survivor nearest a ground point (within reach), or "".
func survivor_at(p: Vector3) -> String:
	var best := ""
	var bd := 1.1
	for id in survivors:
		var vis: Dictionary = survivors[id]
		if vis.dying:
			continue
		var d := Vector2(vis.group.position.x - p.x, vis.group.position.z - p.z).length()
		if d < bd:
			bd = d
			best = id
	return best


func busy() -> bool:
	return pending > 0
