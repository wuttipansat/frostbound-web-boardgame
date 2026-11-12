## src/core/reducer.js: reduce(state, action) -> next state; never changes its input.
class_name Reducer
extends RefCounted

static var HANDLERS := {
	"DRAFT_PICK": [Flow, "draft_pick"],
	"RESOLVE_CROSSROADS": [Flow, "resolve_crossroads"],
	"ATTACK": [Turn, "attack"],
	"SEARCH": [Turn, "search"],
	"BARRICADE": [Turn, "barricade"],
	"LURE": [Turn, "lure"],
	"MOVE": [Turn, "move"],
	"PLAY_CARD": [Turn, "play_card"],
	"CONTRIBUTE": [Turn, "contribute"],
	"DEPOSIT": [Turn, "deposit"],
	"USE_ABILITY": [Turn, "use_ability"],
	"END_TURN": [Turn, "finish_turn"],
	"RETURN_CARD": [Turn, "return_card"],
	"EQUIP": [Turn, "equip"],
	"NAP": [Turn, "nap"],
	"GIVE": [Turn, "give"],
	"CRAFT": [Turn, "craft"],
	"BUILD": [Turn, "build"],
	"SET_REST": [Turn, "set_rest"],
}


## {ok, state, error, message}: the new state, or the old one and why the action is illegal.
static func try_reduce(state: Dictionary, action: Dictionary) -> Dictionary:
	Err.reset()
	if not Err.ok(state.phase != "gameOver", "gameOver"):
		return _fail(state)
	var h = HANDLERS.get(action.get("type"))
	if not Err.ok(h != null, "unknownAction", action.get("type")):
		return _fail(state)
	var s := state.duplicate(true)
	h[0].call(h[1], s, action)
	if Err.failed():
		return _fail(state)
	Flow.check_immediate_end(s)
	return {"ok": true, "state": s, "error": null}


static func _fail(state: Dictionary) -> Dictionary:
	var r := {"ok": false, "state": state, "error": Err.code, "message": Err.code + (": " + Err.detail if Err.detail != "" else "")}
	Err.reset()
	return r


## reduce: the new state, or null for an illegal action (see try_reduce for why).
static func reduce(state: Dictionary, action: Dictionary):
	var r := try_reduce(state, action)
	return r.state if r.ok else null
