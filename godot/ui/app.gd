## src/ui/app.js: the UI controller. Owns the game state, dispatches actions through the rules engine, saves,
## and draws the overlay: top bar, team and items, the action bar for a place, the place panel (with base
## upgrades and crafting at the colony), labels over places, toasts, and the modals (ui/modals.gd).
class_name App
extends CanvasLayer

const SAVE := "user://save.json"
const SETTINGS := "user://settings.json"
const TOAST_KEYS := ["death", "crisisResolved", "overrun", "starvation"]

var main: Node
var state: Dictionary = {}
var ui := {"sel_survivor": "", "sel_loc": "", "loc_info": false, "picking": "", "queue": [], "modal": "", "item": "", "log_open": false, "items_open": false, "draft": [], "setup": {"scenarioId": "crawler", "difficulty": "normal"}, "skip_end_confirm": false}
var settings := {"lang": "", "sound": true, "hints": true}
var root: Control
var top: PanelContainer
var team_box: Control
var items_box: Control
var action_bar: PanelContainer
var loc_panel: PanelContainer
var end_btn: Button
var labels_layer: Control
var toast_box: VBoxContainer
var modal_layer: Control
var hint_box: PanelContainer
var labels := {}
var toasts := []
var sound: Sound


func _init(m: Node) -> void:
	main = m
	layer = 5


func _ready() -> void:
	_load_settings()
	sound = Sound.new()
	add_child(sound)
	sound.set_enabled(settings.sound)
	root = Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = Kit.make_theme()
	add_child(root)
	labels_layer = Control.new()
	labels_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	labels_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(labels_layer)
	top = Kit.panel(Kit.BG, 0, 8)
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	root.add_child(top)
	var left := Kit.vbox(8)
	left.anchor_top = 1.0
	left.anchor_bottom = 1.0
	left.offset_left = 12
	left.offset_top = -12
	left.offset_bottom = -12
	left.grow_vertical = Control.GROW_DIRECTION_BEGIN
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(left)
	hint_box = Kit.panel(Kit.BG_SOFT, 8, 10)
	hint_box.visible = false
	hint_box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	left.add_child(hint_box)
	items_box = Kit.panel()
	items_box.visible = false
	items_box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	left.add_child(items_box)
	team_box = Kit.vbox(8)
	left.add_child(team_box)
	action_bar = Kit.panel()
	action_bar.visible = false
	root.add_child(action_bar)
	loc_panel = Kit.panel()
	loc_panel.visible = false
	root.add_child(loc_panel)
	end_btn = Kit.button(I18n.t("panel.endTurn"), func(): end_turn(), true)
	end_btn.anchor_left = 1.0
	end_btn.anchor_right = 1.0
	end_btn.anchor_top = 1.0
	end_btn.anchor_bottom = 1.0
	end_btn.offset_left = -16
	end_btn.offset_right = -16
	end_btn.offset_top = -16
	end_btn.offset_bottom = -16
	end_btn.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	end_btn.grow_vertical = Control.GROW_DIRECTION_BEGIN
	end_btn.custom_minimum_size = Vector2(150, 48)
	root.add_child(end_btn)
	toast_box = Kit.vbox(6)
	toast_box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	toast_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(toast_box)
	modal_layer = Control.new()
	modal_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(modal_layer)
	get_viewport().size_changed.connect(render)
	ui.modal = "setup"
	render()


# ---------------------------------------------------------------- settings and saves

func _load_settings() -> void:
	if FileAccess.file_exists(SETTINGS):
		var d = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS))
		if d is Dictionary:
			settings.merge(d, true)
	if settings.lang == "":
		settings.lang = "th" if OS.get_locale_language() == "th" else "en"
	I18n.set_lang(settings.lang)


func save_settings() -> void:
	var f = FileAccess.open(SETTINGS, FileAccess.WRITE)
	f.store_string(JSON.stringify(settings))


func has_save() -> bool:
	return FileAccess.file_exists(SAVE)


func _save() -> void:
	if state.is_empty():
		return
	var f = FileAccess.open(SAVE, FileAccess.WRITE)
	f.store_string(JSON.stringify({"state": state}))


func set_language(l: String) -> void:
	settings.lang = l
	I18n.set_lang(l)
	save_settings()
	end_btn.text = I18n.t("panel.endTurn")
	render()


# ---------------------------------------------------------------- game flow

func start_game() -> void:
	var cfg: Dictionary = ui.setup
	state = GameState.create_game({"scenarioId": cfg.scenarioId, "difficulty": cfg.difficulty, "seed": int(Time.get_unix_time_from_system() * 1000) % 2147483647, "days": Content.SCENARIOS_BY_ID[cfg.scenarioId].days})
	ui.merge({"modal": "", "sel_loc": "", "sel_survivor": "", "queue": [], "draft": [], "item": "", "loc_info": false}, true)
	sound.play("start")
	sound.set_ambient(true)
	_after_change(false)


func continue_game() -> void:
	var d = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	if not (d is Dictionary) or not d.has("state"):
		return
	state = JS.norm(d.state)
	ui.merge({"modal": "", "sel_loc": "", "sel_survivor": "", "queue": [], "draft": [], "item": "", "loc_info": false}, true)
	_after_change(false)


func quit_to_setup() -> void:
	ui.modal = "setup"
	render()


func dispatch(action: Dictionary) -> bool:
	var res = Reducer.try_reduce(state, action)
	if not res.ok:
		var key = "err." + str(res.error)
		toast(I18n.t(key) if I18n.has(key) else I18n.t("err.unknown"), "bad")
		sound.play("error")
		return false
	var prev_log: Array = state.log
	var pack_before: Array = state.survivors.get(action.get("survivorId", ""), {}).get("pack", []).duplicate() if action.has("survivorId") else []
	var cross_focus = state.pendingCrossroads.focusSurvivorId if state.get("pendingCrossroads") != null else null
	var before = state
	state = res.state
	if action.type == "SEARCH":
		var sv: Dictionary = state.survivors[action.survivorId]
		var uids = []
		for u in sv.pack:
			if not pack_before.has(u):
				uids.append(u)
		if state.team.pick != null:
			for u in state.team.pick.uids:
				if not uids.has(u):
					uids.append(u)
		var spawned = new_log_entries(prev_log, state.log).any(func(e): return e.k == "search" and e.get("spawned"))
		if uids.size():
			ui.queue.append({"type": "found", "survivorId": action.survivorId, "locationId": sv.location, "uids": uids, "spawned": spawned})
		else:
			toast(I18n.t("toast.foundNone"))
	if action.type == "MOVE" and main.board.desc.layout.has(before.survivors[action.survivorId].location) and main.board.desc.layout.has(action.toLocation):
		var f: Array = main.board.desc.layout[before.survivors[action.survivorId].location].center
		var tt: Array = main.board.desc.layout[action.toLocation].center
		main.fx.walk(Vector3(f[0], 0, f[2]), Vector3(tt[0], 0, tt[2]))
	var added = new_log_entries(prev_log, state.log)
	if added.any(func(e): return e.k == "mapFound"):
		toast(I18n.t("toast.mapFound"), "good")
	for e in added:
		sound.play(Sound.for_log(e))
		if e.k == "mapGrown":
			toast(I18n.t("toast.mapGrown", {"n": e.get("places", []).size()}), "good")
		if e.k == "crisisResolved" and state.reports.colony != null:
			ui.queue.append({"type": "colony", "report": state.reports.colony.duplicate(true), "morale": state.morale, "day": e.r})
		if e.k == "crossroadsChoice":
			ui.queue.append({"type": "cross", "cardId": e.cardId, "choice": e.choice, "focus": cross_focus})
		if e.k == "roundStart" and e.day <= 3 and settings.hints:
			ui.pending_tip = I18n.t("tut.day%d" % e.day)
		if TOAST_KEYS.has(e.k) and e.k != "crisisResolved":
			var text = I18n.format_log(e)
			if text != "":
				toast(text, "bad")
	_after_change(true)
	return true


static func new_log_entries(prev: Array, next: Array) -> Array:
	if prev.is_empty():
		return next.duplicate()
	var last = JSON.stringify(prev[prev.size() - 1])
	if next.size() >= prev.size() and JSON.stringify(next[prev.size() - 1]) == last:
		return next.slice(prev.size())
	var i = next.size() - 1
	while i >= 0:
		if JSON.stringify(next[i]) == last:
			return next.slice(i + 1)
		i -= 1
	return []


func _after_change(animate: bool) -> void:
	if ui.get("pending_tip", "") != "" and ui.queue.is_empty() and state.phase == "turn":
		toast(ui.pending_tip, "tip")
		ui.pending_tip = ""
	if ui.sel_survivor != "" and not state.survivors.get(ui.sel_survivor, {}).get("alive", false):
		ui.sel_survivor = ""
	main.on_state(state, animate)
	var a = Fx.atmosphere_for(state)
	sound.set_weather(a.storm, a.fire)
	_save()
	render()


func end_turn() -> void:
	if state.is_empty() or state.phase != "turn":
		return
	if not ui.skip_end_confirm and Options.acting_survivors(state).size():
		ui.modal = "confirmEnd"
		render()
		return
	dispatch({"type": "END_TURN"})


func dismiss_queue() -> void:
	if ui.queue.size():
		ui.queue.pop_front()
	render()


func select_survivor(id: String) -> void:
	ui.sel_survivor = id
	ui.picking = ""
	if id != "":
		ui.sel_loc = state.survivors[id].location
	main.pieces.set_highlight(id)
	render()


func select_location(id: String) -> void:
	ui.sel_loc = id
	ui.loc_info = false
	ui.picking = ""
	render()


## A tap on the board (from the main scene): a survivor first, else a place.
func board_tap(p: Vector3) -> void:
	if state.is_empty() or ui.modal != "" or ui.queue.size():
		return
	var sv: String = main.pieces.survivor_at(p)
	if sv != "":
		select_survivor(sv)
		return
	var loc: String = main.board.location_at(p)
	if ui.picking == "lure" and loc != "":
		var a = {"type": "LURE", "survivorId": ring_survivor(), "toLocation": loc}
		if dispatch(a):
			ui.picking = ""
		return
	select_location(loc)


func toast(text: String, kind := "") -> void:
	toasts.append({"text": text, "kind": kind, "ttl": 9.0 if kind == "tip" else 3.6})
	if toasts.size() > 4:
		toasts.pop_front()
	_render_toasts()


func _process(dt: float) -> void:
	var changed = false
	if ui.get("pending_tip", "") != "" and ui.queue.is_empty() and ui.modal == "" and not state.is_empty() and state.phase == "turn":
		toast(ui.pending_tip, "tip")
		ui.pending_tip = ""
	for tt in toasts:
		tt.ttl -= dt
		if tt.ttl <= 0:
			changed = true
	if changed:
		toasts = toasts.filter(func(tt): return tt.ttl > 0)
		_render_toasts()
	_place_labels()
	# Panels that size to their content: placed every frame from their size (bottom centre, top right).
	var vp = root.get_viewport_rect().size
	if action_bar.visible:
		action_bar.position = Vector2((vp.x - action_bar.size.x) / 2, vp.y - action_bar.size.y - 14)
	if loc_panel.visible:
		loc_panel.position = Vector2(vp.x - loc_panel.size.x - 12, top.size.y + 8)


# ---------------------------------------------------------------- render

func render() -> void:
	if root == null:
		return
	var vp = root.get_viewport_rect().size
	var playing = not state.is_empty() and ui.modal != "setup"
	top.visible = playing
	team_box.visible = playing and state.phase != "draft"
	end_btn.visible = playing and state.phase == "turn"
	if playing:
		_render_top(vp)
		_render_team(vp)
		_render_items(vp)
		_render_action_bar(vp)
		_render_loc_panel(vp)
		_render_hint(vp)
	else:
		items_box.visible = false
		action_bar.visible = false
		loc_panel.visible = false
		hint_box.visible = false
	_render_labels()
	Modals.render(self)


func _render_top(vp: Vector2) -> void:
	Kit.clear(top)
	var outer = Kit.hbox(10)
	top.add_child(outer)
	var row = HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 18)
	row.add_theme_constant_override("v_separation", 4)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	outer.add_child(row)
	var s = state
	var stat = func(title: String, value: String, sub: String, warn := false) -> VBoxContainer:
		var v = Kit.vbox(0)
		v.add_child(Kit.caps(title, Kit.DIM))
		var h = Kit.hbox(6)
		h.add_child(Kit.label(value, 20, Kit.RED if warn else Kit.TEXT))
		if sub != "":
			h.add_child(Kit.label(sub, 12, Kit.DIM))
		v.add_child(h)
		return v
	var mor = stat.call(I18n.t("hud.morale"), str(s.morale), "", s.morale <= 3)
	mor.add_child(Kit.bar(s.morale, s.maxMorale, Kit.GOLD if s.morale > 3 else Kit.RED, 110))
	row.add_child(mor)
	var season = "early" if s.day < Content.SEASON.COLD else ("storms" if s.day >= Content.SEASON.STORMS else ("brutes" if s.day >= Content.FIGHT.BRUTE_DAY else "cold"))
	row.add_child(stat.call(I18n.t("hud.day"), "%d/%d" % [s.day, s.scenario.days] if s.scenario.days else str(s.day), "%s · %s" % [I18n.t("time." + s.time), I18n.t("hud.season." + season)]))
	var need = Sel.food_needed(s)
	var days = floori(s.food / float(need)) if need else 99
	row.add_child(stat.call(I18n.t("hud.food"), str(s.food), "%s · %s" % [I18n.t("hud.foodNeed", {"n": need}), I18n.t("hud.foodDays", {"n": days})], need > 0 and s.food < need))
	var cr = Sel.crisis_def(s)
	if cr != null:
		var req = Sel.crisis_requirement(s)
		row.add_child(stat.call(I18n.t("hud.crisis") + " · " + I18n.c("crises", cr.id, "name"), "%d/%d" % [Sel.crisis_score(s), req], I18n.t("item." + cr.item)))
	var goal: Dictionary = Sel.scenario_def(s).goal
	if goal.type == "crawler":
		row.add_child(stat.call(I18n.t("hud.goal"), "%d/%d" % [Sel.base_level(s, "crawler"), goal.target], I18n.t("bld.crawler")))
	var ms = Sel.mission_status(s)
	if ms != null:
		row.add_child(stat.call(I18n.t("hud.mission"), "%d/%d" % [ms.progress, ms.target], I18n.t("mission." + ms.id, {"n": ms.target})))
	var sf = Sel.siege_forecast(s)
	row.add_child(stat.call(I18n.t("hud.siege"), I18n.t("hud.siegeShort", {"n": sf.attackers, "k": sf.stopped}), I18n.t("hud.siegeHits", {"n": sf.hits, "hp": Content.SIEGE.HIT_HP}) if sf.hits else "", sf.hits > 0))
	var btns = Kit.hbox(6)
	outer.add_child(btns)
	btns.add_child(Kit.button(I18n.t("hud.log"), func():
		ui.modal = "log"
		render()))
	btns.add_child(Kit.button(I18n.t("hud.rules"), func():
		ui.modal = "rules"
		render()))
	btns.add_child(Kit.button(I18n.t("hud.menu"), func():
		ui.modal = "settings"
		render()))


func _render_team(vp: Vector2) -> void:
	Kit.clear(team_box)
	var faces = Kit.hbox(8)
	var acting = Options.acting_survivors(state)
	for sv in Sel.alive_survivors(state):
		var card = Kit.panel(Kit.BG_SOFT if sv.id != ui.sel_survivor else Color(0.3, 0.22, 0.08, 0.92), 10, 6)
		var v = Kit.vbox(3)
		var face = Kit.portrait(sv.id, 52)
		v.add_child(face)
		v.add_child(Kit.label(I18n.c("survivors", sv.id, "name").split(" ")[0], 12))
		v.add_child(Kit.bar(sv.hp, Content.RULES.HP_MAX, Kit.RED if sv.hp < 40 else Kit.GREEN, 56, 5))
		var apl = Kit.label("⚡%d" % sv.ap, 12, Kit.BLUE if acting.has(sv.id) else Kit.DIM)
		v.add_child(apl)
		card.add_child(v)
		card.gui_input.connect(func(e):
			if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
				select_survivor(sv.id if ui.sel_survivor != sv.id else ""))
		card.tooltip_text = "%s · %s\nHP %d · AP %d/%d · %s" % [I18n.c("survivors", sv.id, "name"), I18n.c("locations", sv.location, "name"), sv.hp, sv.ap, Sel.ap_max(state, sv.id), I18n.t("trait." + str(sv.get("trait"))) if sv.get("trait") else ""]
		faces.add_child(card)
	team_box.add_child(faces)
	var n = Options.all_items(state).size()
	var row = Kit.hbox(8)
	row.add_child(Kit.button("%s (%d)" % [I18n.t("hud.team") + " · " + I18n.t("pack.items") if I18n.has("pack.items") else I18n.t("hud.team"), n], func():
		ui.items_open = not ui.items_open
		ui.item = ""
		render()))
	team_box.add_child(row)


func _item_line(uid: String) -> String:
	var it = Sel.item_of(state, uid)
	return "%s · %s" % [I18n.c("items", state.cards[uid], "name"), I18n.t("item." + it.type)]


func _render_items(vp: Vector2) -> void:
	items_box.visible = ui.items_open and state.phase != "draft"
	if not items_box.visible:
		return
	Kit.clear(items_box)
	var scroll = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(minf(420, vp.x - 24), minf(420, vp.y * 0.55))
	var v = Kit.vbox(4)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(v)
	items_box.add_child(scroll)
	var groups = [["stockpile", state.stockpile]]
	for sv in Sel.alive_survivors(state):
		groups.append([sv.id, sv.pack])
	for g in groups:
		var title = I18n.t("pack.stockpile") if g[0] == "stockpile" else I18n.t("pack.carried", {"name": I18n.c("survivors", g[0], "name"), "place": I18n.c("locations", state.survivors[g[0]].location, "name")})
		v.add_child(Kit.caps(title, Kit.GOLD))
		if g[1].is_empty():
			v.add_child(Kit.label("—", 13, Kit.DIM))
		for uid in g[1]:
			var b = Kit.button(_item_line(uid), func():
				ui.item = uid if ui.item != uid else ""
				render())
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			v.add_child(b)
			if ui.item == uid:
				v.add_child(_item_actions(uid))


## What can be done with an item (options.js): equip / play on a survivor, play, add to the crisis, give.
func _item_actions(uid: String) -> Control:
	var box = Kit.vbox(4)
	var it = Sel.item_of(state, uid)
	var desc_key = "itemPlay." + it.type
	if I18n.has(desc_key):
		box.add_child(Kit.label(I18n.t(desc_key, {"n": it.get("value", ""), "text": ""}), 12, Kit.DIM, true))
	var row = HFlowContainer.new()
	for o in Options.card_targets(state, uid):
		var label: String = (I18n.t("act.equipShort") if Content.gear_slot(it) != null else I18n.t("act.playShort")) + " → " + I18n.c("survivors", o.survivorId, "name").split(" ")[0]
		row.add_child(Kit.button(label, func():
			if dispatch(o.action):
				ui.item = "", false, o.ok))
	for o in Options.card_options(state, uid):
		row.add_child(Kit.button(I18n.t("act." + o.id + "Short") if I18n.has("act." + o.id + "Short") else I18n.t("act." + o.id), func():
			if dispatch(o.action):
				ui.item = "", false, o.ok))
	for g in Options.give_targets(state, uid):
		var name = I18n.t("pack.toStockpile") if g.survivorId == null else I18n.c("survivors", g.survivorId, "name").split(" ")[0]
		row.add_child(Kit.button(I18n.t("act.give") + " → " + name, func():
			if dispatch(g.action):
				ui.item = ""))
	box.add_child(row)
	return box


## The survivor the action bar acts for: the selected one, else the first who can still act, else the first alive.
func ring_survivor() -> String:
	if ui.sel_survivor != "" and state.survivors.get(ui.sel_survivor, {}).get("alive", false):
		return ui.sel_survivor
	var a = Options.acting_survivors(state)
	if a.size():
		return a[0]
	for id in state.team.survivors:
		if state.survivors.get(id, {}).get("alive", false):
			return id
	return ""


func _render_action_bar(vp: Vector2) -> void:
	var at: String = ui.sel_loc
	var open: bool = at != "" and state.locations.has(at) and state.phase != "draft" and state.phase != "gameOver" and not ui.loc_info and ui.modal == "" and ui.queue.is_empty()
	action_bar.visible = open
	if not open:
		return
	Kit.clear(action_bar)
	var v = Kit.vbox(8)
	action_bar.add_child(v)
	var sv_id = ring_survivor()
	var loc: Dictionary = state.locations[at]
	var people = Sel.survivors_at(state, at).size()
	var head = Kit.hbox(10)
	head.add_child(Kit.label(I18n.t("loc.lurePick") if ui.picking == "lure" else I18n.c("locations", at, "name"), 18))
	head.add_child(Kit.label("☠ %d   ♟ %d" % [loc.zombies, people], 14, Kit.RED if loc.zombies else Kit.DIM))
	head.add_child(Kit.spacer())
	head.add_child(Kit.button("i", func():
		ui.loc_info = true
		render()))
	head.add_child(Kit.button("✕", func(): select_location("")))
	v.add_child(head)
	var row = HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 6)
	row.add_theme_constant_override("v_separation", 6)
	v.add_child(row)
	if ui.picking == "lure":
		for tg in Options.lure_targets(state, sv_id):
			row.add_child(Kit.button(I18n.c("locations", tg.to, "name"), func():
				if dispatch(tg.action):
					ui.picking = "", false, tg.ok))
		row.add_child(Kit.button(I18n.t("act.cancel"), func():
			ui.picking = ""
			render()))
	else:
		var items = Options.ring_items(state, sv_id, at)
		if state.phase == "turn" and not items.any(func(it): return it.id == "walk"):
			var who = Kit.hbox(6)
			for s2 in Sel.alive_survivors(state):
				var b = Kit.button("%s ⚡%d" % [I18n.c("survivors", s2.id, "name").split(" ")[0], s2.ap], func(): select_survivor(s2.id), s2.id == sv_id)
				who.add_child(b)
			v.add_child(who)
		for it in items:
			var meta = ""
			if it.get("cost") != null:
				meta += " ⚡%d" % it.cost
			if it.get("risk") != null:
				meta += " · " + str(it.risk)
			var text: String = I18n.t("bar." + it.id) + meta
			if it.get("face") != null:
				text = I18n.c("survivors", it.face, "name").split(" ")[0] + ": " + text
			var b = Kit.button(text, func():
				if it.id == "lure":
					ui.picking = "lure"
					render()
				elif it.id == "build":
					ui.loc_info = true
					render()
				elif dispatch(it.action) and it.get("face", sv_id) != null:
					ui.sel_survivor = it.get("face", sv_id)
					render(), false, it.ok)
			if not it.ok and it.get("error") != null:
				b.tooltip_text = I18n.t("err." + str(it.error))
			row.add_child(b)
		if items.is_empty():
			row.add_child(Kit.label(I18n.t("bar.none"), 13, Kit.DIM))
	action_bar.custom_minimum_size = Vector2(minf(560, vp.x - 24), 0)
	action_bar.size = Vector2.ZERO


func _render_loc_panel(vp: Vector2) -> void:
	var at: String = ui.sel_loc
	loc_panel.visible = ui.loc_info and at != "" and state.locations.has(at)
	if not loc_panel.visible:
		return
	Kit.clear(loc_panel)
	var scroll = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(minf(400, vp.x - 24), minf(vp.y - 120, 620))
	var v = Kit.vbox(6)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(v)
	loc_panel.add_child(scroll)
	var head = Kit.hbox()
	head.add_child(Kit.label(I18n.c("locations", at, "name"), 20))
	head.add_child(Kit.spacer())
	head.add_child(Kit.button("✕", func():
		ui.loc_info = false
		render()))
	v.add_child(head)
	v.add_child(Kit.label(I18n.c("locations", CityMap.type_of(state, at), "blurb"), 13, Kit.DIM, true))
	var loc: Dictionary = state.locations[at]
	var facts = PackedStringArray()
	facts.append("%s %d" % [I18n.t("loc.zombies"), loc.zombies])
	facts.append("%s %d" % [I18n.t("loc.barricades"), loc.barricades])
	if loc.get("deck") != null:
		facts.append("%s %d" % [I18n.t("loc.findsShort"), loc.batches.size() if loc.get("batches") != null else loc.deck.size()])
		facts.append(I18n.t("act.searchChance", {"p": roundi(Sel.search_spawn_chance(state, at) * 100)}))
	var fc: Dictionary = Sel.spawn_forecast(state)
	if fc.has(at):
		facts.append(I18n.t("loc.forecast", {"n": fc[at]}))
	v.add_child(Kit.label(" · ".join(facts), 13, Kit.TEXT, true))
	var here = Sel.survivors_at(state, at)
	v.add_child(Kit.caps(I18n.t("loc.here")))
	v.add_child(Kit.label(", ".join(PackedStringArray(here.map(func(s): return I18n.c("survivors", s.id, "name")))) if here.size() else I18n.t("loc.nobody"), 13, Kit.TEXT, true))
	var deck = CityMap.loc_def(state, at).get("deck")
	if deck != null:
		v.add_child(Kit.caps(I18n.t("loc.cards")))
		var names = PackedStringArray()
		for id in deck:
			names.append(I18n.c("items", id, "name"))
		v.add_child(Kit.label(", ".join(names), 12, Kit.DIM, true))
	if at == "colony":
		_colony_section(v)
	loc_panel.size = Vector2.ZERO


## The colony: base upgrades (and the snow crawler) and crafting, worked by the survivor at hand.
func _colony_section(v: VBoxContainer) -> void:
	var worker = ""
	for s in Sel.survivors_at(state, "colony"):
		if worker == "" or s.id == ui.sel_survivor:
			worker = s.id
	v.add_child(Kit.caps(I18n.t("act.build")))
	if worker == "":
		v.add_child(Kit.label(I18n.t("loc.nobody"), 13, Kit.DIM))
	for bid in ["crawler", "workshop", "dorm", "greenhouse", "wall", "infirmary", "radio"]:
		var nl = Sel.next_level(state, bid)
		var row = Kit.hbox(8)
		var title = "%s %d" % [I18n.t("bld." + bid), Sel.base_level(state, bid)]
		var info: String
		if nl == null:
			info = I18n.t("build.max")
		else:
			var needs = PackedStringArray()
			for id in nl.needs:
				var have = state.stockpile.filter(func(u): return state.cards[u] == id).size()
				needs.append("%s %d/%d" % [I18n.c("items", id, "name"), have, nl.needs[id]])
			info = ("%s %d/%d AP" % [I18n.t("build.working"), nl.spent, nl.ap] if nl.started else ", ".join(needs) + " · %d AP" % nl.ap)
		var col = Kit.vbox(0)
		col.add_child(Kit.label(title, 14))
		col.add_child(Kit.label(info, 11, Kit.DIM, true))
		col.add_child(Kit.label(I18n.t("bld." + bid + ".fx"), 11, Kit.DIM, true))
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(col)
		if nl != null and worker != "":
			var a = {"type": "BUILD", "buildingId": bid, "survivorId": worker}
			var ok = Reducer.try_reduce(state, a).ok
			row.add_child(Kit.button(I18n.t("bar.build"), func(): dispatch(a), false, ok))
		v.add_child(row)
	v.add_child(Kit.caps(I18n.t("act.craft")))
	for rid in Content.RECIPES:
		var r: Dictionary = Content.RECIPES[rid]
		var row = Kit.hbox(8)
		var needs = PackedStringArray()
		for id in r.needs:
			needs.append("%s ×%d" % [I18n.c("items", id, "name"), r.needs[id]])
		var col = Kit.vbox(0)
		col.add_child(Kit.label(I18n.c("items", r.makes, "name"), 14))
		col.add_child(Kit.label(", ".join(needs) + " · %d AP" % r.ap, 11, Kit.DIM, true))
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(col)
		if worker != "":
			var a = {"type": "CRAFT", "recipeId": rid, "survivorId": worker}
			row.add_child(Kit.button(I18n.t("act.craft").split(" (")[0], func(): dispatch(a), false, Reducer.try_reduce(state, a).ok))
		v.add_child(row)


## The bot's next move as a hint (help.js renderHint).
func _render_hint(vp: Vector2) -> void:
	hint_box.visible = settings.hints and state.phase == "turn" and ui.modal == "" and ui.queue.is_empty() and ui.sel_loc == "" and not ui.items_open
	if not hint_box.visible:
		return
	var a = Bot.bot_action(state, {"random": func(): return 0.5, "chaos": 0})
	if a == null:
		hint_box.visible = false
		return
	Kit.clear(hint_box)
	var v = Kit.vbox(2)
	v.add_child(Kit.caps(I18n.t("hint.title") if I18n.has("hint.title") else "Suggested"))
	v.add_child(Kit.label(Options.describe_action(state, a), 13, Kit.TEXT, true))
	v.custom_minimum_size = Vector2(260, 0)
	hint_box.add_child(v)


# ---------------------------------------------------------------- labels over places

func _render_labels() -> void:
	var want = {}
	if not state.is_empty() and ui.modal != "setup":
		for id in state.locations:
			if main.board.desc.get("layout", {}).has(id):
				want[id] = true
	for id in labels.keys():
		if not want.has(id):
			labels[id].queue_free()
			labels.erase(id)
	for id in want:
		if not labels.has(id):
			var b = Button.new()
			b.add_theme_font_size_override("font_size", 12)
			for st in ["normal", "hover", "pressed", "focus"]:
				var sb = StyleBoxFlat.new()
				sb.bg_color = Color(0.05, 0.07, 0.1, 0.82 if st != "hover" else 0.95)
				sb.set_corner_radius_all(12)
				sb.content_margin_left = 10
				sb.content_margin_right = 10
				sb.content_margin_top = 3
				sb.content_margin_bottom = 3
				sb.set_border_width_all(1)
				sb.border_color = Color(1, 1, 1, 0.12) if st != "focus" else Color(0.95, 0.7, 0.24, 0.0)
				b.add_theme_stylebox_override(st, sb)
			b.pressed.connect(func(): select_location(id))
			labels_layer.add_child(b)
			labels[id] = b
		var loc: Dictionary = state.locations[id]
		var n = Sel.survivors_at(state, id).size()
		var spot = CityMap.is_spot(state, id)
		labels[id].text = ("⌕" if spot else I18n.c("locations", id, "name")) + ("  ☠%d" % loc.zombies if loc.zombies else "") + ("  ♟%d" % n if n else "")
		labels[id].modulate = Color(1, 0.85, 0.5) if id == ui.sel_loc else Color.WHITE
	_place_labels()


func _place_labels() -> void:
	if labels.is_empty() or main.stage == null:
		return
	var cam: Camera3D = main.stage.camera
	var vp = root.get_viewport_rect().size
	for id in labels:
		var L: Dictionary = main.board.desc.layout[id]
		var p = Vector3(L.label[0], L.label[1], L.label[2])
		var b: Button = labels[id]
		var spot: bool = L.get("spot", false)
		var on = not cam.is_position_behind(p) and (not spot or main.stage.zoom >= 1.3)
		var sp = cam.unproject_position(p)
		b.visible = on and sp.x > -50 and sp.x < vp.x + 50 and sp.y > 40 and sp.y < vp.y
		b.position = sp - b.size / 2


# ---------------------------------------------------------------- toasts

func _render_toasts() -> void:
	Kit.clear(toast_box)
	for tt in toasts:
		var p = Kit.panel(Color(0.35, 0.08, 0.08, 0.92) if tt.kind == "bad" else (Color(0.12, 0.3, 0.14, 0.92) if tt.kind == "good" else Kit.BG), 8, 8)
		p.add_child(Kit.label(tt.text, 14, Kit.WARM if tt.kind == "tip" else Kit.TEXT, true))
		toast_box.add_child(p)
	var vp = root.get_viewport_rect().size
	toast_box.position = Vector2(vp.x / 2 - 220, 80)
	toast_box.custom_minimum_size = Vector2(440, 0)
