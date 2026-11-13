## Double-precision 3-vectors as [x, y, z] arrays (Godot's Vector3 is 32-bit; the board's hashes of world
## positions must see the same numbers as the web build), and three.js Matrix4 composition.
class_name V
extends RefCounted


static func add(a: Array, b: Array) -> Array:
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]


static func sub(a: Array, b: Array) -> Array:
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


static func mul(a: Array, k: float) -> Array:
	return [a[0] * k, a[1] * k, a[2] * k]


## a.clone().addScaledVector(b, k)
static func adds(a: Array, b: Array, k: float) -> Array:
	return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]


static func length(a: Array) -> float:
	return sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


static func length_sq(a: Array) -> float:
	return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]


static func normalize(a: Array) -> Array:
	var l := length(a)
	return mul(a, 1.0 / l) if l != 0 else [0.0, 0.0, 0.0]


static func dist(a: Array, b: Array) -> float:
	return length(sub(a, b))


static func lerp(a: Array, b: Array, t: float) -> Array:
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]


## Math.hypot(a, b)
static func hypot(a: float, b: float) -> float:
	return sqrt(a * a + b * b)


## three.js Matrix4.compose(position, Euler(rx, ry, rz, order), scale) -> 16 elements, column-major.
static func compose(p: Array, rx: float, ry: float, rz: float, s, order := "XYZ") -> Array:
	var sc: Array = s if s is Array else [s, s, s]
	var a := cos(rx)
	var b := sin(rx)
	var c := cos(ry)
	var d := sin(ry)
	var e := cos(rz)
	var f := sin(rz)
	var te := []
	te.resize(16)
	if order == "XYZ":
		var ae := a * e
		var af := a * f
		var be := b * e
		var bf := b * f
		te[0] = c * e; te[4] = -c * f; te[8] = d
		te[1] = af + be * d; te[5] = ae - bf * d; te[9] = -b * c
		te[2] = bf - ae * d; te[6] = be + af * d; te[10] = a * c
	else: # YXZ
		var ce := c * e
		var cf := c * f
		var de := d * e
		var df := d * f
		te[0] = ce + df * b; te[4] = de * b - cf; te[8] = a * d
		te[1] = a * f; te[5] = a * e; te[9] = -b
		te[2] = cf * b - de; te[6] = df + ce * b; te[10] = a * c
	for i in 3:
		te[i] *= sc[0]
		te[4 + i] *= sc[1]
		te[8 + i] *= sc[2]
	te[3] = 0.0; te[7] = 0.0; te[11] = 0.0
	te[12] = p[0]; te[13] = p[1]; te[14] = p[2]; te[15] = 1.0
	return te


## a × b (column-major 4×4)
static func mat_mul(a: Array, b: Array) -> Array:
	var o := []
	o.resize(16)
	for c in 4:
		for r in 4:
			var s := 0.0
			for k in 4:
				s += a[k * 4 + r] * b[c * 4 + k]
			o[c * 4 + r] = s
	return o


## p transformed by a matrix (point).
static func apply(m: Array, p: Array) -> Array:
	return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]


static func to_transform(m: Array) -> Transform3D:
	return Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])), Vector3(m[12], m[13], m[14]))


## The scene dump's form: elements rounded to 1e-3, joined.
static func mstr(m: Array) -> String:
	var parts := PackedStringArray()
	for v in m:
		parts.append(JS.js_number(r3(v)))
	return ",".join(parts)


static func r3(v: float) -> float:
	var r := JS.round_(v * 1000) / 1000.0
	return 0.0 if r == 0 else r
