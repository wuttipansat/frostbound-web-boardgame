# GODOT-2: meshes made from the pack match the web build's (vertex counts, positions, colours, triangles).
extends SceneTree


func _init() -> void:
	var fails := 0
	var t0 := Time.get_ticks_msec()
	for v in JS.load_json("res://data/vectors/meshes.json"):
		var m = ModelPack.meshes_full(v.key)
		if m == null:
			printerr("missing ", v.key)
			fails += 1
			continue
		var arr: Array = m.lit.surface_get_arrays(0)
		var pos: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		var col: PackedColorArray = arr[Mesh.ARRAY_COLOR]
		var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
		var sp := 0.0
		for i in pos.size():
			for c in 3:
				sp += pos[i][c] * (((i * 3 + c) % 7) + 1)
		var sc := 0.0
		for i in col.size():
			for c in 3:
				sc += col[i].srgb_to_linear()[c] * (((i * 3 + c) % 5) + 1)
		var ok: bool = pos.size() == v.verts and idx.size() / 3 == v.tris and absf(sp - v.posSum) < 1e-6 * maxf(1.0, absf(v.posSum)) and absf(sc - v.colSum) < 0.01 * absf(v.colSum)
		# the same triangles, wound the other way round
		for t in 4:
			if idx[t * 3] != v.idx[t * 3] or idx[t * 3 + 1] != v.idx[t * 3 + 2] or idx[t * 3 + 2] != v.idx[t * 3 + 1]:
				ok = false
		print("%s %s: %d verts" % ["ok" if ok else "FAIL", v.key.split("|")[0], pos.size()])
		if not ok:
			fails += 1
			printerr("  posSum %f vs %f, colSum %f vs %f" % [sp, v.posSum, sc, v.colSum])
	print("pack: %d models, %d failed, %d ms" % [ModelPack._entries.size(), fails, Time.get_ticks_msec() - t0])
	quit(1 if fails else 0)
