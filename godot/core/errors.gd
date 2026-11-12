## src/core/errors.js: an illegal action. GDScript has no exceptions: the first failed check is recorded here and
## every rule returns early once Err.code is set (the reducer then drops the half-made state).
class_name Err
extends RefCounted

static var code := ""
static var detail := ""


static func reset() -> void:
	code = ""
	detail = ""


## assert(cond, code): false (and the error recorded) when cond fails.
static func ok(cond, c: String, d = "") -> bool:
	if cond:
		return true
	if code == "":
		code = c
		detail = str(d)
	return false


static func failed() -> bool:
	return code != ""
