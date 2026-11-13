## src/render/pack.js + mesher.js expandQuads: the baked model pack (quad records) -> meshes, made on first use.
## Same file format as the web build's models-pack.txt (gzipped, not base64): see scripts/godot/bake-pack.mjs.
class_name ModelPack
extends RefCounted

const FILE := "res://assets/models-pack.bin"
const QUAD := 8
const DEFAULTS := {"size": 1, "jitter": 0.05, "jitterLevels": 4, "origin": "center", "greedy": true, "ao": true, "aoStrength": 0.45}
const FACE_DIR := [Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(0, 1, 0), Vector3(0, -1, 0), Vector3(0, 0, 1), Vector3(0, 0, -1)]
const FACE_AXIS := [0, 0, 1, 1, 2, 2]
const FACE_SHADE := [0.86, 0.8, 1.0, 0.55, 0.92, 0.74]
const CU := [0, 1, 1, 0]
const CW := [0, 0, 1, 1]
const FLIP := [0, 1, 3, 1, 2, 3]
const NOFLIP := [0, 1, 2, 0, 2, 3]

static var _entries: Dictionary = {}   # full key -> [off, min, max, rgb, glow, lit_range, glow_range]
static var _data: PackedByteArray
static var _data_start := 0
static var _meshes: Dictionary = {}     # full key -> {lit: ArrayMesh|null, glow: ArrayMesh|null}
static var _loaded := false
static var lit_material: StandardMaterial3D
static var glow_material: StandardMaterial3D


static func load_pack(path := FILE) -> bool:
	if _loaded:
		return true
	if not FileAccess.file_exists(path):
		push_error("no model pack at " + path + " (node scripts/godot/bake-pack.mjs)")
		return false
	var gz := FileAccess.get_file_as_bytes(path)
	_data = gz.decompress_dynamic(-1, FileAccess.COMPRESSION_GZIP)
	var hl := _data.decode_u32(0)
	var head = JSON.parse_string(_data.slice(4, 4 + hl).get_string_from_utf8())
	_data_start = (4 + hl + 3) & ~3
	for m in head.models:
		_entries[m[0]] = m
	lit_material = StandardMaterial3D.new()
	lit_material.vertex_color_use_as_albedo = true
	lit_material.vertex_color_is_srgb = true
	lit_material.roughness = 0.92
	glow_material = StandardMaterial3D.new()
	glow_material.vertex_color_use_as_albedo = true
	glow_material.vertex_color_is_srgb = true
	glow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glow_material.albedo_color = Color(2.4, 2.4, 2.4) # (stage.js glowBoost: lit windows and fire go above 1 for the bloom)
	_loaded = true
	return true


## voxel.js keyOf: the cache key of one build (model key + every option that changes the mesh).
static func key_of(cache_key: String, opts: Dictionary = {}) -> String:
	var x := DEFAULTS.duplicate()
	x.merge(opts, true)
	var parts := PackedStringArray([cache_key])
	for k in ["size", "jitter", "jitterLevels", "origin", "greedy", "ao", "aoStrength"]:
		var v = x[k]
		parts.append(("true" if v else "false") if v is bool else (JS.js_number(float(v)) if (v is float or v is int) else str(v)))
	return "|".join(parts)


static func has(full_key: String) -> bool:
	load_pack()
	return _entries.has(full_key)


## Voxel bounds of a build: {min, max} (voxel units) or null.
static func bounds(full_key: String):
	load_pack()
	var e = _entries.get(full_key)
	return {"min": e[2], "max": e[3]} if e != null else null


static var _aabbs: Dictionary = {}


## The bounding box [x0, y0, z0, x1, y1, z1] of a build's lit and glow quads (no mesh made: safe on a worker thread).
static func aabb(full: String) -> Array:
	load_pack()
	if _aabbs.has(full):
		return _aabbs[full]
	var e = _entries.get(full)
	var out := [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
	if e == null:
		return out
	var size := float(full.split("|")[1])
	var off: Array = e[1]
	var lo := [INF, INF, INF]
	var hi := [-INF, -INF, -INF]
	for rng in [e[6], e[7]]:
		if rng == null:
			continue
		var start: int = _data_start + int(rng[0]) * 2
		for k in int(rng[1]) / QUAD:
			var b := start + k * QUAD * 2
			var plane := _data.decode_s16(b)
			var u0 := _data.decode_s16(b + 2)
			var w0 := _data.decode_s16(b + 4)
			var wu := _data.decode_s16(b + 6)
			var ww := _data.decode_s16(b + 8)
			var a: int = FACE_AXIS[_data.decode_s16(b + 10) & 7]
			var u := (a + 1) % 3
			var w := (a + 2) % 3
			var q0 := [0, 0, 0]
			var q1 := [0, 0, 0]
			q0[a] = plane; q1[a] = plane
			q0[u] = u0; q1[u] = u0 + wu
			q0[w] = w0; q1[w] = w0 + ww
			for c in 3:
				lo[c] = minf(lo[c], (q0[c] + off[c]) * size)
				hi[c] = maxf(hi[c], (q1[c] + off[c]) * size)
	out = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]
	_aabbs[full] = out
	return out


## One mesh with the lit surface (0) and the glow surface (1) of a build, or null.
static var _combined: Dictionary = {}
static func combined(full: String):
	if _combined.has(full):
		return _combined[full]
	var m = meshes_full(full)
	if m == null:
		_combined[full] = null
		return null
	var mesh := ArrayMesh.new()
	var glow_at := -1
	for s in ["lit", "glow"]:
		if m[s] != null:
			mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, m[s].surface_get_arrays(0))
			mesh.surface_set_material(mesh.get_surface_count() - 1, m[s].surface_get_material(0))
			if s == "glow":
				glow_at = mesh.get_surface_count() - 1
	mesh.set_meta("glow_surface", glow_at)
	_combined[full] = mesh
	return mesh


## {lit: ArrayMesh, glow: ArrayMesh} for a build (either may be null), or null if it is not in the pack.
static func meshes(cache_key: String, opts: Dictionary = {}):
	return meshes_full(key_of(cache_key, opts))


static func meshes_full(full: String):
	load_pack()
	if _meshes.has(full):
		return _meshes[full]
	var e = _entries.get(full)
	if e == null:
		return null
	var o := DEFAULTS.duplicate()
	var opts := full.split("|")
	o.size = float(opts[1])
	o.jitter = float(opts[2])
	o.jitterLevels = int(opts[3])
	o.aoStrength = float(opts[7])
	var r := {"lit": _expand(e[6], e[4], e[5], e[1], o, false), "glow": _expand(e[7], e[4], e[5], e[1], o, true)}
	_meshes[full] = r
	return r


## expandQuads -> an ArrayMesh with one surface (Godot winds front faces the other way round from three.js).
static func _expand(rng, rgb: Array, is_glow: Array, off: Array, o: Dictionary, glow_surface: bool):
	if rng == null:
		return null
	var start: int = _data_start + int(rng[0]) * 2
	var nq: int = int(rng[1]) / QUAD
	var size: float = o.size
	var jitter: float = o.jitter
	var jl_levels: int = o.jitterLevels
	var ao_s: float = o.aoStrength
	var ao_curve := [1 - ao_s, 1 - ao_s * 0.6, 1 - ao_s * 0.25, 1.0]
	var pos := PackedVector3Array()
	var nrm := PackedVector3Array()
	var col := PackedColorArray()
	var idx := PackedInt32Array()
	pos.resize(nq * 4)
	nrm.resize(nq * 4)
	col.resize(nq * 4)
	idx.resize(nq * 6)
	var q := [0, 0, 0]
	for k in nq:
		var b := start + k * QUAD * 2
		var plane := _data.decode_s16(b)
		var u0 := _data.decode_s16(b + 2)
		var w0 := _data.decode_s16(b + 4)
		var wu := _data.decode_s16(b + 6)
		var ww := _data.decode_s16(b + 8)
		var f5 := _data.decode_s16(b + 10)
		var pe := _data.decode_s16(b + 12)
		var jl := _data.decode_s16(b + 14)
		var fi := f5 & 7
		var pk := (f5 >> 3) & 255
		var a: int = FACE_AXIS[fi]
		var u := (a + 1) % 3
		var w := (a + 2) % 3
		var g: bool = int(is_glow[pe]) != 0
		var jf := 1.0 + (float(jl) / (jl_levels - 1) - 0.5) * 2 * jitter if jl_levels > 1 else 1.0
		var shade: float = (1.0 if g else FACE_SHADE[fi]) * jf
		var cr: float = rgb[pe * 3]
		var cg: float = rgb[pe * 3 + 1]
		var cb: float = rgb[pe * 3 + 2]
		var base := k * 4
		var acs := [3, 3, 3, 3]
		for i in 4:
			q[a] = plane
			q[u] = u0 + CU[i] * wu
			q[w] = w0 + CW[i] * ww
			pos[base + i] = Vector3((q[0] + off[0]) * size, (q[1] + off[1]) * size, (q[2] + off[2]) * size)
			nrm[base + i] = FACE_DIR[fi]
			var ac := (pk >> (i * 2)) & 3
			acs[i] = ac
			var kk: float = shade * (1.0 if g else ao_curve[ac])
			col[base + i] = Color(cr * kk, cg * kk, cb * kk).linear_to_srgb() # (Godot keeps vertex colours as 8 bits: sRGB bands less)
		var t: Array = FLIP if acs[0] + acs[2] < acs[1] + acs[3] else NOFLIP
		var facing := _facing(fi)
		var io := k * 6
		for i in [0, 3]:
			# three.js triangle (t0, t1, t2) when facing, else (t0, t2, t1); Godot gets the reverse.
			var v0: int = base + t[i]
			var v1: int = base + (t[i + 1] if facing else t[i + 2])
			var v2: int = base + (t[i + 2] if facing else t[i + 1])
			idx[io + i] = v0
			idx[io + i + 1] = v2
			idx[io + i + 2] = v1
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = pos
	arrays[Mesh.ARRAY_NORMAL] = nrm
	arrays[Mesh.ARRAY_COLOR] = col
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(0, glow_material if glow_surface else lit_material)
	return mesh


static var _facing_cache: Array = []


## mesher.js faceWinding: does the (u, w) corner order wind counter-clockwise seen along the face normal?
static func _facing(fi: int) -> bool:
	if _facing_cache.is_empty():
		for f in 6:
			var a: int = FACE_AXIS[f]
			var u := (a + 1) % 3
			var w := (a + 2) % 3
			var p0 := Vector3.ZERO
			var p1 := Vector3.ZERO
			p1[u] = 1
			var p2 := Vector3.ZERO
			p2[u] = 1
			p2[w] = 1
			_facing_cache.append((p1 - p0).cross(p2 - p0).dot(FACE_DIR[f]) > 0)
	return _facing_cache[fi]


## A node with the lit and glow meshes of a build (or null when the pack lacks it).
static func instance(cache_key: String, opts: Dictionary = {}) -> Node3D:
	var m = meshes(cache_key, opts)
	if m == null:
		return null
	var n := Node3D.new()
	n.name = cache_key
	for s in ["lit", "glow"]:
		if m[s] != null:
			var mi := MeshInstance3D.new()
			mi.mesh = m[s]
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if s == "lit" else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			n.add_child(mi)
	return n
