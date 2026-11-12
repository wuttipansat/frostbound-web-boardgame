## src/core/zones.js: the town plan (MAP-6).
class_name Zones
extends RefCounted

const FILLER_BY_ZONE := {
	"outskirts": ["park", "park", "ruins", "parking"],
	"residential": ["park", "shops", "plaza", "parking", "ruins"],
	"commercial": ["plaza", "shops", "shops", "parking", "park"],
	"industrial": ["containers", "rail", "parking", "ruins"],
}


static func hash_z(a, b, c) -> float:
	var x := JS.i32(JS.imul(JS.i32(int(a)), 374761393) + JS.imul(JS.i32(int(b)), 668265263) + JS.imul(JS.i32(int(c)), 1440662683))
	x = JS.imul(x ^ JS.ushr(x, 13), 1274126177)
	x = JS.i32(x ^ JS.ushr(x, 16))
	return float(JS.u32(x)) / 4294967296.0


static func town_of(look = 0) -> Dictionary:
	var a := hash_z(look, 13, 7) * PI * 2
	return {"dx": cos(a), "dz": sin(a), "side": 1 if hash_z(look, 17, 3) < 0.5 else -1}


static func town_depth(bx, bz, look = 0) -> float:
	var t := town_of(look)
	return bx * t.dx + bz * t.dz + (hash_z(bx, bz, look + 5) - 0.5) * 0.5


static func zone_of(bx, bz, look = 0) -> String:
	if not bx and not bz:
		return "colony"
	var tw := town_of(look)
	var t := town_depth(bx, bz, look)
	var p: float = (-bx * tw.dz + bz * tw.dx) * tw.side
	if t < 0.35:
		return "outskirts"
	if t < 2:
		return "industrial" if p > 2 else "residential"
	return "industrial" if p > 1.2 else "commercial"
