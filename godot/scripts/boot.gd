# GODOT-2 boot scene: the real board for the current game (the ported composition), the diorama camera, and the
# ported rules engine driven by the bot. The city grows when a map is read; the board composes it on a thread.
extends Node3D

var stage: Stage
var board: Board
var pieces: Pieces
var fx: Fx
var game: Dictionary
var bot_opts: Dictionary
var info: Label
var last_stage := 0


func _ready() -> void:
	stage = Stage.new()
	add_child(stage)
	board = Board.new()
	add_child(board)
	pieces = Pieces.new(board)
	add_child(pieces)
	fx = Fx.new(stage, board)
	add_child(fx)
	board.built_board.connect(func(b):
		stage.fit(b, last_stage <= 1)
		fx.set_chimneys(Fx.colony_chimneys() + board.desc.fx.get("city_chimneys", []))
		pieces.sync(game, false))
	stage.zoom_changed.connect(func(z): board.set_zoom(z))
	_ui()
	_new_game()


func _ui() -> void:
	var ui := CanvasLayer.new()
	var panel := PanelContainer.new()
	panel.position = Vector2(12, 12)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.11, 0.15, 0.8)
	style.set_corner_radius_all(8)
	style.set_content_margin_all(12)
	panel.add_theme_stylebox_override("panel", style)
	var box := VBoxContainer.new()
	panel.add_child(box)
	info = Label.new()
	box.add_child(info)
	var row := HBoxContainer.new()
	for b in [["Bot step", _bot_step], ["Bot day", _bot_day], ["New game", _new_game]]:
		var btn := Button.new()
		btn.text = b[0]
		btn.custom_minimum_size = Vector2(110, 44)
		btn.pressed.connect(b[1])
		row.add_child(btn)
	box.add_child(row)
	ui.add_child(panel)
	add_child(ui)


func _new_game() -> void:
	var seed := int(Time.get_unix_time_from_system()) % 100000
	var args := OS.get_cmdline_user_args()
	for i in args.size():
		if args[i] == "--seed":
			seed = int(args[i + 1])
	game = GameState.create_game({"scenarioId": "crawler", "seed": seed, "difficulty": "normal", "days": 40})
	bot_opts = {"random": Bot.mulberry(seed * 7919 + 13), "chaos": 0}
	last_stage = 0
	_sync()


func _sync() -> void:
	if game.map.stage != last_stage or board.levels.hash() != game.base.hash():
		var snap := last_stage == 0
		last_stage = game.map.stage
		board.set_map(game.map, game.base, snap)
	pieces.sync(game, true)
	fx.set_state(game)
	_show()


func _bot_step() -> void:
	if game.phase == "gameOver":
		return
	var a = Bot.bot_action(game, bot_opts)
	var before := game
	var r := Reducer.try_reduce(game, a if a != null else {"type": "END_TURN"})
	if r.ok and a != null and a.type == "MOVE" and board.desc.layout.has(before.survivors[a.survivorId].location) and board.desc.layout.has(a.toLocation):
		var f: Array = board.desc.layout[before.survivors[a.survivorId].location].center
		var tt: Array = board.desc.layout[a.toLocation].center
		fx.walk(Vector3(f[0], 0, f[2]), Vector3(tt[0], 0, tt[2]))
	game = r.state if r.ok else Reducer.try_reduce(game, {"type": "END_TURN"}).state
	_sync()


func _bot_day() -> void:
	var day: int = game.day
	var guard := 0
	while game.phase != "gameOver" and game.day == day and guard < 400:
		_bot_step()
		guard += 1


func _show() -> void:
	var team := PackedStringArray()
	for sv in Sel.alive_survivors(game):
		team.append("%s %s %dHP %dAP" % [Sel.survivor_def(sv.id).name.split(" ")[0], sv.location, sv.hp, sv.ap])
	var res := ""
	if game.result != null:
		res = "\n%s (%s)" % ["WON" if game.result.won else "lost", game.result.reason]
	info.text = "FROSTBOUND — Godot port\nDay %d %s · %s · morale %d · food %d · stage %d · crawler %d\n%s%s" % [
		game.day, game.time, game.phase, game.morale, game.food, game.map.stage, Sel.base_level(game, "crawler"), "\n".join(team), res]
