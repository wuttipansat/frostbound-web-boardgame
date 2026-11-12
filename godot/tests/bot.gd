# GODOT-1: the ported bot replays the golden games action for action, then plays N crawler-normal games.
#   godot --headless --path godot --script res://tests/bot.gd [-- --games 20 --winrate 100]
extends SceneTree


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var games := 20
	var runs := 0
	for i in args.size():
		if args[i] == "--games": games = int(args[i + 1])
		if args[i] == "--winrate": runs = int(args[i + 1])
	var fails := 0
	var t0 := Time.get_ticks_msec()
	for seed in range(1, games + 1):
		var g = JS.load_json("res://data/golden/%d.json" % seed)
		var actions := []
		var r := Bot.simulate({"scenarioId": "crawler", "seed": seed, "difficulty": "normal", "onStep": func(_s, a): actions.append(a)})
		var same: bool = actions.size() == g.steps.size()
		var first := -1
		for i in mini(actions.size(), g.steps.size()):
			if JS.stable_json(actions[i]) != JS.stable_json(g.steps[i].action):
				same = false
				first = i
				break
		if not same:
			fails += 1
			printerr("bot game %d differs at action %d: %s vs %s (%d vs %d actions)" % [seed, first + 1, JS.stable_json(actions[first]) if first >= 0 else "", JS.stable_json(g.steps[first].action) if first >= 0 else "", actions.size(), g.steps.size()])
		else:
			print("bot game %d: same %d actions, %s" % [seed, actions.size(), JSON.stringify(r.state.result)])
	print("bot replays: %d of %d differ, %d ms" % [fails, games, Time.get_ticks_msec() - t0])
	if runs:
		var won := 0
		var t1 := Time.get_ticks_msec()
		for seed in range(1, runs + 1):
			var r := Bot.simulate({"scenarioId": "crawler", "seed": seed, "difficulty": "normal"})
			if r.state.result != null and r.state.result.won:
				won += 1
		print("crawler normal: won %d%% of %d games, %d ms" % [roundi(100.0 * won / runs), runs, Time.get_ticks_msec() - t1])
	quit(1 if fails else 0)
