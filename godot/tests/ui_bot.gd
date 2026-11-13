# GODOT-4: plays a whole game through the UI (the bot picks, the UI dispatches and shows every modal) to catch
# script errors; screenshots of each modal go to $SP/shots. godot --path godot --script res://tests/ui_bot.gd
extends SceneTree
var frames := 0
var main: Node
var shots := {}
var games := 0
func _initialize() -> void:
	main = load("res://main.tscn").instantiate()
	root.add_child(main)
func snap(name: String) -> void:
	if shots.has(name):
		return
	shots[name] = true
	root.get_viewport().get_texture().get_image().save_png(OS.get_environment("SP") + "/shots/ui-" + name + ".png")
func _process(_d: float) -> bool:
	frames += 1
	var app: App = main.app
	if frames == 10:
		app.start_game()
	if frames < 12 or frames % 2:
		return false
	var s := app.state
	if app.ui.modal == "confirmEnd":
		snap("confirm")
		app.ui.modal = ""
		app.dispatch({"type": "END_TURN"})
		return false
	if app.ui.queue.size():
		snap(app.ui.queue[0].type)
		app.dismiss_queue()
		return false
	if s.phase == "gameOver":
		snap("over")
		print("game over day %d: %s" % [s.day, JSON.stringify(s.result)])
		return true
	if s.phase == "draft":
		snap("draft")
	var a = Bot.bot_action(s, {"random": func(): return 0.5, "chaos": 0})
	if a == null:
		return false
	if a.type == "END_TURN":
		app.end_turn()
	else:
		app.dispatch(a)
	if frames % 40 == 0:
		app.select_location(s.survivors.get(app.ring_survivor(), {}).get("location", "colony") if s.has("survivors") else "")
	if frames > 30000:
		print("still going at day %d" % s.day)
		return true
	return false
