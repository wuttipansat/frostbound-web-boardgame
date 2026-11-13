# The Godot version of FROSTBOUND: the stage and board, the pieces and effects, and the UI over them.
extends Node3D

var stage: Stage
var board: Board
var pieces: Pieces
var fx: Fx
var app: App
var last_stage := 0
var down_at := Vector2.ZERO
var dragged := false


func _ready() -> void:
	stage = Stage.new()
	add_child(stage)
	board = Board.new()
	add_child(board)
	pieces = Pieces.new(board)
	add_child(pieces)
	fx = Fx.new(stage, board)
	add_child(fx)
	app = App.new(self)
	add_child(app)
	board.built_board.connect(func(b):
		stage.fit(b, last_stage <= 1)
		fx.set_chimneys(Fx.colony_chimneys() + board.desc.fx.get("city_chimneys", []))
		if not app.state.is_empty():
			pieces.sync(app.state, false)
		app.render())
	stage.zoom_changed.connect(func(z): board.set_zoom(z))
	# The title screen shows a city under the menu.
	var s := GameState.create_game({"scenarioId": "crawler", "seed": 21, "days": 40})
	board.set_map(s.map, s.base, true)


## The UI changed the game state: redraw the city when it grew or the base changed; move the pieces.
func on_state(s: Dictionary, animate: bool) -> void:
	if not animate or s.map.stage != last_stage or board.levels.hash() != s.base.hash() or board.map.get("look") != s.map.get("look"):
		var snap: bool = not animate or board.map.get("look") != s.map.get("look")
		last_stage = s.map.stage
		board.set_map(s.map, s.base, snap)
	pieces.sync(s, animate)
	fx.set_state(s)


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			down_at = e.position
			dragged = false
		elif not dragged:
			app.board_tap(stage.ground_at(e.position))
	elif e is InputEventMouseMotion and e.button_mask & MOUSE_BUTTON_MASK_LEFT and e.position.distance_to(down_at) > 6:
		dragged = true
