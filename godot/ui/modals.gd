## src/ui/views/modals.js: setup, draft, crossroads and its result, the dusk-and-night report, what a search found,
## the blueprint pick, the end-of-day check, game over, settings, quick rules and the log.
class_name Modals
extends RefCounted

static var _key := ""


static func render(app: App) -> void:
	var s = app.state
	var ui = app.ui
	var kind = ""
	var arg = null
	if ui.modal != "":
		kind = ui.modal
	elif not s.is_empty() and s.phase == "draft":
		kind = "draft"
	elif ui.queue.size():
		kind = ui.queue[0].type
		arg = ui.queue[0]
	elif not s.is_empty() and s.phase == "crossroads":
		kind = "crossroads"
	elif not s.is_empty() and s.team.get("pick") != null:
		kind = "pick"
	elif not s.is_empty() and s.phase == "gameOver" and not ui.get("over_closed", false):
		kind = "over"
	var layer = app.modal_layer
	Kit.clear(layer)
	if kind == "":
		return
	var shade = ColorRect.new()
	shade.color = Color(0, 0, 0, 0.45 if kind != "setup" else 0.55)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	layer.add_child(shade)
	var vp = layer.get_viewport_rect().size
	var center = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(center)
	var p = Kit.panel(Kit.BG, 12, 18)
	center.add_child(p)
	var w = minf(900.0 if kind == "draft" else 620.0, vp.x - 24)
	var v = Kit.vbox(10)
	v.custom_minimum_size = Vector2(w - 40, 0)
	if kind in ["draft", "log", "rules", "colony", "setup", "found"]:
		var scroll = ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.custom_minimum_size = Vector2(w - 36, minf(vp.y - 80, 660.0 if kind != "found" else 420.0))
		scroll.add_child(v)
		p.add_child(scroll)
		var maxh = minf(vp.y - 80, 660.0)
		# (fit the box to its content once laid out)
		v.resized.connect(func(): if is_instance_valid(scroll): scroll.custom_minimum_size.y = minf(v.size.y + 4, maxh))
	else:
		p.add_child(v)
	match kind:
		"setup": _setup(app, v)
		"draft": _draft(app, v)
		"crossroads": _crossroads(app, v)
		"cross": _cross_result(app, v, arg)
		"colony": _colony(app, v, arg)
		"found": _found(app, v, arg)
		"pick": _pick(app, v)
		"over": _over(app, v)
		"confirmEnd": _confirm_end(app, v)
		"settings": _settings(app, v)
		"rules": _rules(app, v)
		"log": _log(app, v)


static func _title(v: VBoxContainer, caps: String, title: String) -> void:
	if caps != "":
		v.add_child(Kit.caps(caps))
	v.add_child(Kit.label(title, 26))


static func _close(app: App) -> Callable:
	return func():
		app.ui.modal = ""
		app.render()


# ---------------------------------------------------------------- setup

static func _setup(app: App, v: VBoxContainer) -> void:
	v.add_child(Kit.label("FROSTBOUND", 40, Kit.WARM))
	v.add_child(Kit.label(I18n.t("app.tagline"), 15, Kit.DIM))
	v.add_child(Kit.caps(I18n.t("setup.scenario")))
	for sc in Content.SCENARIOS:
		var on: bool = app.ui.setup.scenarioId == sc.id
		var b = Kit.button("%s — %s" % [I18n.c("scenarios", sc.id, "name"), I18n.c("scenarios", sc.id, "blurb")], func():
			app.ui.setup.scenarioId = sc.id
			app.render(), on)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		v.add_child(b)
	v.add_child(Kit.caps(I18n.t("setup.difficulty")))
	var row = Kit.hbox()
	for d in ["easy", "normal", "hard"]:
		row.add_child(Kit.button(I18n.t("setup.difficulty." + d) if I18n.has("setup.difficulty." + d) else d, func():
			app.ui.setup.difficulty = d
			app.render(), app.ui.setup.difficulty == d))
	v.add_child(row)
	var go = Kit.hbox()
	go.add_child(Kit.button(I18n.t("setup.start"), func(): app.start_game(), true))
	if app.has_save():
		go.add_child(Kit.button(I18n.t("setup.continue"), func(): app.continue_game()))
	go.add_child(Kit.spacer())
	go.add_child(Kit.button("ไทย" if I18n.lang == "en" else "English", func(): app.set_language("th" if I18n.lang == "en" else "en")))
	v.add_child(go)


# ---------------------------------------------------------------- draft

static func _draft(app: App, v: VBoxContainer) -> void:
	_title(v, "", I18n.t("draft.title"))
	var picks: Array = app.ui.draft
	var grid = GridContainer.new()
	grid.columns = 3 if v.custom_minimum_size.x > 700 else 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for id in app.state.team.draftOptions:
		var d: Dictionary = Content.SURVIVORS_BY_ID[id]
		var on = picks.has(id)
		var card = Kit.panel(Color(0.3, 0.22, 0.08, 0.95) if on else Kit.BG_SOFT, 10, 10)
		var col = Kit.vbox(4)
		var head = Kit.hbox(8)
		head.add_child(Kit.portrait(id, 64))
		var nm = Kit.vbox(0)
		nm.add_child(Kit.label(I18n.c("survivors", id, "name"), 16))
		nm.add_child(Kit.label(I18n.c("survivors", id, "occupation"), 12, Kit.DIM))
		head.add_child(nm)
		col.add_child(head)
		col.add_child(Kit.label(I18n.c("survivors", id, "abilityText") if I18n.c("survivors", id, "abilityText") != id else str(d.ability.get("text", d.ability.type)), 12, Kit.TEXT, true))
		col.add_child(Kit.label("%s %d · ⚡%d · %s %d · %s %d" % [I18n.t("draft.influence"), d.influence, d.energy, I18n.t("draft.attackCost") if false else "ATK", (7 - d.attack) * 4, "Search", d.search], 11, Kit.DIM, true))
		card.add_child(col)
		card.custom_minimum_size = Vector2(250, 0)
		card.gui_input.connect(func(e):
			if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
				if picks.has(id):
					picks.erase(id)
				elif picks.size() < Content.RULES.TEAM_START:
					picks.append(id)
				app.render())
		grid.add_child(card)
	v.add_child(grid)
	var left: int = Content.RULES.TEAM_START - picks.size()
	v.add_child(Kit.button(I18n.t("draft.confirm") if left == 0 else I18n.t("draft.pick", {"n": left}), func():
		if app.dispatch({"type": "DRAFT_PICK", "survivorIds": picks.duplicate()}):
			app.ui.draft = [], true, left == 0))


# ---------------------------------------------------------------- crossroads

static func _crossroads(app: App, v: VBoxContainer) -> void:
	var pc: Dictionary = app.state.pendingCrossroads
	var card: Dictionary = Content.CROSSROADS_BY_ID[pc.cardId]
	_title(v, I18n.t("cross.title"), I18n.c("crossroads", pc.cardId, "title"))
	if pc.get("focusSurvivorId") != null:
		var h = Kit.hbox()
		h.add_child(Kit.portrait(pc.focusSurvivorId, 36))
		h.add_child(Kit.label(I18n.t("cross.who", {"name": I18n.c("survivors", pc.focusSurvivorId, "name")}), 14, Kit.DIM))
		v.add_child(h)
	v.add_child(Kit.label(I18n.c("crossroads", pc.cardId, "text"), 16, Kit.TEXT, true))
	for i in card.choices.size():
		var b = Kit.button(I18n.cross_choice(pc.cardId, i), func(): app.dispatch({"type": "RESOLVE_CROSSROADS", "choice": i}))
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.custom_minimum_size = Vector2(0, 52)
		v.add_child(b)


static func _cross_result(app: App, v: VBoxContainer, q: Dictionary) -> void:
	var card: Dictionary = Content.CROSSROADS_BY_ID[q.cardId]
	_title(v, I18n.t("cross.youChose"), I18n.cross_choice(q.cardId, q.choice))
	v.add_child(Kit.label(I18n.describe_effects(card.choices[q.choice].effects), 15, Kit.TEXT, true))
	v.add_child(Kit.button(I18n.t("colony.continue"), func(): app.dismiss_queue(), true))


# ---------------------------------------------------------------- dusk and night

static func _colony(app: App, v: VBoxContainer, q: Dictionary) -> void:
	var r: Dictionary = q.report
	_title(v, "", I18n.t("colony.title", {"n": r.day}))
	if r.fed:
		v.add_child(Kit.label(I18n.t("colony.fed", {"n": r.foodNeeded}), 15))
	else:
		v.add_child(Kit.label(I18n.t("colony.starve", {"n": r.get("hungry", []).size()}), 15, Kit.RED, true))
	var cr: Dictionary = r.crisis
	v.add_child(Kit.caps(I18n.t("colony.crisis", {"name": I18n.c("crises", cr.crisisId, "name")})))
	var cd: Dictionary = Content.CRISES_BY_ID[cr.crisisId]
	v.add_child(Kit.label(I18n.t("colony.needs", {"n": cr.required, "item": I18n.t("item." + cd.item)}), 13, Kit.DIM, true))
	if cr.cards.is_empty():
		v.add_child(Kit.label(I18n.t("colony.noCards"), 13, Kit.DIM))
	for cc in cr.cards:
		v.add_child(Kit.label("%s %s" % [("+1" if cc.delta > 0 else "−1"), I18n.c("items", cc.card, "name")], 13, Kit.GREEN if cc.delta > 0 else Kit.RED))
	v.add_child(Kit.label("%s — %s" % [I18n.t("colony.score", {"score": cr.score, "required": cr.required}), I18n.t("colony.averted" if cr.success else "colony.failed")], 17, Kit.GREEN if cr.success else Kit.RED))
	if not cr.success:
		v.add_child(Kit.label(I18n.describe_effects(cd.fail), 13, Kit.DIM, true))
	v.add_child(Kit.caps(I18n.t("colony.spawns")))
	if r.spawns.is_empty():
		v.add_child(Kit.label(I18n.t("colony.noSpawns"), 13, Kit.DIM))
	for loc in r.spawns:
		v.add_child(Kit.label("+%d %s" % [r.spawns[loc], I18n.c("locations", loc, "name")], 13))
	var sg: Dictionary = r.siege
	v.add_child(Kit.label(I18n.t("colony.siege", {"n": sg.attackers, "k": sg.stopped, "hits": sg.hits, "hp": Content.SIEGE.HIT_HP}), 13, Kit.RED if sg.hits else Kit.TEXT, true))
	v.add_child(Kit.label(I18n.t("colony.morale", {"n": q.morale}), 15, Kit.WARM))
	v.add_child(Kit.button(I18n.t("colony.continue"), func(): app.dismiss_queue(), true))


# ---------------------------------------------------------------- a search

static func _found(app: App, v: VBoxContainer, q: Dictionary) -> void:
	_title(v, I18n.c("locations", q.locationId, "name"), I18n.t("found.title", {"n": q.uids.size()}))
	v.add_child(Kit.label(I18n.t("found.who", {"name": I18n.c("survivors", q.survivorId, "name")}), 14, Kit.DIM))
	for u in q.uids:
		var it = Sel.item_of(app.state, u)
		v.add_child(Kit.label("• %s  (%s)" % [I18n.c("items", app.state.cards[u], "name"), I18n.t("item." + it.type)], 16))
	if q.spawned:
		v.add_child(Kit.label(I18n.t("found.spawned"), 14, Kit.RED))
	var loc = app.state.locations.get(q.locationId)
	if loc != null:
		var left: int = loc.batches.size() if loc.get("batches") != null else loc.deck.size()
		v.add_child(Kit.label(I18n.t("found.left", {"n": left}) if left else I18n.t("found.empty"), 13, Kit.DIM))
	v.add_child(Kit.label(I18n.t("found.pack", {"n": Sel.pack_free(app.state, q.survivorId)}), 13, Kit.DIM))
	v.add_child(Kit.button(I18n.t("found.ok"), func(): app.dismiss_queue(), true))


static func _pick(app: App, v: VBoxContainer) -> void:
	var pk: Dictionary = app.state.team.pick
	_title(v, "", I18n.t("pick.title"))
	v.add_child(Kit.label(I18n.t("pick.text"), 14, Kit.DIM, true))
	for u in pk.uids:
		v.add_child(Kit.button("%s — %s" % [I18n.t("pick.putBack"), I18n.c("items", app.state.cards[u], "name")], func(): app.dispatch({"type": "RETURN_CARD", "cardUid": u})))


# ---------------------------------------------------------------- end of day, game over

static func _confirm_end(app: App, v: VBoxContainer) -> void:
	_title(v, "", I18n.t("confirm.end.title"))
	var ap = 0
	for id in Options.acting_survivors(app.state):
		ap += app.state.survivors[id].ap
	v.add_child(Kit.label(I18n.t("confirm.end.energy", {"n": ap}), 14, Kit.DIM, true))
	var row = Kit.hbox()
	row.add_child(Kit.button(I18n.t("confirm.end.yes"), func():
		app.ui.modal = ""
		app.dispatch({"type": "END_TURN"}), true))
	row.add_child(Kit.button(I18n.t("confirm.end.no"), _close(app)))
	row.add_child(Kit.button(I18n.t("confirm.end.skip"), func():
		app.ui.skip_end_confirm = true
		app.ui.modal = ""
		app.dispatch({"type": "END_TURN"})))
	v.add_child(row)


static func _over(app: App, v: VBoxContainer) -> void:
	var s = app.state
	var won: bool = s.result.won
	_title(v, I18n.t("over.title"), I18n.t("over.reason." + s.result.reason))
	v.add_child(Kit.label(I18n.t("over.epitaph.won" if won else "over.epitaph.lost"), 15, Kit.WARM if won else Kit.DIM, true))
	var st: Dictionary = s.stats
	v.add_child(Kit.label("%d %s · %d %s · %d %s · %d %s · %d %s · %d %s" % [s.day, I18n.t("over.days"), st.kills, I18n.t("over.kills"), st.searches, I18n.t("over.searches"), st.builds, I18n.t("over.builds"), st.crafts, I18n.t("over.crafts"), s.team.fallen.size(), I18n.t("over.lost")], 13, Kit.TEXT, true))
	var row = Kit.hbox()
	row.add_child(Kit.button(I18n.t("over.again"), func():
		app.ui.over_closed = false
		app.quit_to_setup(), true))
	row.add_child(Kit.button(I18n.t("over.look"), func():
		app.ui.over_closed = true
		app.render()))
	v.add_child(row)


# ---------------------------------------------------------------- settings, rules, log

static func _settings(app: App, v: VBoxContainer) -> void:
	_title(v, "", I18n.t("settings.title"))
	var lang = Kit.hbox()
	lang.add_child(Kit.label(I18n.t("settings.language"), 15))
	lang.add_child(Kit.button("English", func(): app.set_language("en"), I18n.lang == "en"))
	lang.add_child(Kit.button("ไทย", func(): app.set_language("th"), I18n.lang == "th"))
	v.add_child(lang)
	var hints = Kit.hbox()
	hints.add_child(Kit.label(I18n.t("settings.hints"), 15))
	hints.add_child(Kit.button(I18n.t("settings.on"), func():
		app.settings.hints = true
		app.save_settings()
		app.render(), app.settings.hints))
	hints.add_child(Kit.button(I18n.t("settings.off"), func():
		app.settings.hints = false
		app.save_settings()
		app.render(), not app.settings.hints))
	v.add_child(hints)
	var snd = Kit.hbox()
	snd.add_child(Kit.label(I18n.t("settings.sound"), 15))
	snd.add_child(Kit.button(I18n.t("settings.on"), func():
		app.settings.sound = true
		app.sound.set_enabled(true)
		app.sound.set_ambient(true)
		app.save_settings()
		app.render(), app.settings.sound))
	snd.add_child(Kit.button(I18n.t("settings.off"), func():
		app.settings.sound = false
		app.sound.set_enabled(false)
		app.save_settings()
		app.render(), not app.settings.sound))
	v.add_child(snd)
	var gfx = Kit.hbox()
	gfx.add_child(Kit.label(I18n.t("settings.graphics"), 15))
	gfx.add_child(Kit.button(I18n.t("settings.graphics.high"), func():
		app.main.board.set_battery_saver(false)
		app.render(), not app.main.board.battery_saver))
	gfx.add_child(Kit.button(I18n.t("settings.graphics.saver"), func():
		app.main.board.set_battery_saver(true)
		app.render(), app.main.board.battery_saver))
	v.add_child(gfx)
	var row = Kit.hbox()
	row.add_child(Kit.button(I18n.t("settings.newGame"), func():
		app.ui.modal = "setup"
		app.render()))
	row.add_child(Kit.button(I18n.t("settings.close"), _close(app), true))
	v.add_child(row)


static func _rules(app: App, v: VBoxContainer) -> void:
	_title(v, "", I18n.t("hud.rules"))
	for k in I18n.EN.keys():
		if str(k).begins_with("rules.") and not str(k).ends_with(".title"):
			var tk = str(k) + ".title"
			if I18n.EN.has(tk):
				v.add_child(Kit.caps(I18n.t(tk)))
			v.add_child(Kit.label(I18n.t(k), 13, Kit.TEXT, true))
	v.add_child(Kit.button(I18n.t("settings.close"), _close(app), true))


static func _log(app: App, v: VBoxContainer) -> void:
	_title(v, "", I18n.t("hud.log"))
	var lines = []
	for e in app.state.log:
		var text = I18n.format_log(e)
		if text != "":
			lines.append("%s %d · %s" % [I18n.t("hud.day"), e.r, text])
	lines.reverse()
	for l in lines.slice(0, 120):
		v.add_child(Kit.label(l, 13, Kit.TEXT, true))
	v.add_child(Kit.button(I18n.t("settings.close"), _close(app), true))
