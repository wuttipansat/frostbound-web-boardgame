# Loads an exported voxel model: the imported scene when the editor has imported it, else the raw .glb
# at runtime (headless checks, fresh checkouts). Vertex colours are the albedo.
class_name Models
extends RefCounted


static func instance(path: String) -> Node3D:
	if path == "":
		return null
	var node: Node3D = null
	if ResourceLoader.exists(path):
		var scene = load(path)
		if scene is PackedScene:
			node = scene.instantiate()
	if node == null:
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		if doc.append_from_file(path, state) != OK:
			push_error("cannot read " + path)
			return null
		node = doc.generate_scene(state)
	_vertex_colors(node)
	return node


static func _vertex_colors(n: Node) -> void:
	if n is MeshInstance3D and n.mesh:
		for i in n.mesh.get_surface_count():
			var src = n.mesh.surface_get_material(i)
			var mat := StandardMaterial3D.new()
			mat.vertex_color_use_as_albedo = true
			mat.roughness = 0.9
			if src is BaseMaterial3D and src.shading_mode == BaseMaterial3D.SHADING_MODE_UNSHADED:
				mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			n.set_surface_override_material(i, mat)
	for c in n.get_children():
		_vertex_colors(c)
