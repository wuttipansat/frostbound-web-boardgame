## The UI's look (the web build's style.css in brief): dark glass panels, warm gold accents, Oswald-like headings,
## and small helpers to build controls in code.
class_name Kit
extends RefCounted

const BG := Color(0.07, 0.085, 0.105, 0.92)
const BG_SOFT := Color(0.09, 0.11, 0.14, 0.82)
const LINE := Color(1, 1, 1, 0.08)
const TEXT := Color("#e8edf3")
const DIM := Color("#9aa6b6")
const GOLD := Color("#f2b33d")
const WARM := Color("#ffc46b")
const RED := Color("#e0605a")
const GREEN := Color("#7fcf6a")
const BLUE := Color("#8fd8ff")

static var theme: Theme
static var _portraits := {}


static func make_theme() -> Theme:
	if theme != null:
		return theme
	theme = Theme.new()
	theme.default_font_size = 15
	var panel := _box(BG, 10)
	theme.set_stylebox("panel", "PanelContainer", panel)
	theme.set_stylebox("panel", "Panel", panel)
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var c := Color(1, 1, 1, 0.06)
		match state:
			"hover": c = Color(1, 1, 1, 0.12)
			"pressed": c = Color(0.95, 0.7, 0.24, 0.3)
			"disabled": c = Color(1, 1, 1, 0.03)
			"focus": c = Color(1, 1, 1, 0.0)
		var b := _box(c, 8)
		b.set_border_width_all(1)
		b.border_color = Color(1, 1, 1, 0.1) if state != "focus" else Color(0.95, 0.7, 0.24, 0.6)
		b.content_margin_left = 12
		b.content_margin_right = 12
		b.content_margin_top = 8
		b.content_margin_bottom = 8
		theme.set_stylebox(state, "Button", b)
	theme.set_color("font_color", "Button", TEXT)
	theme.set_color("font_hover_color", "Button", Color.WHITE)
	theme.set_color("font_disabled_color", "Button", Color(1, 1, 1, 0.35))
	theme.set_color("font_color", "Label", TEXT)
	theme.set_constant("separation", "VBoxContainer", 6)
	theme.set_constant("separation", "HBoxContainer", 8)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1, 1, 1, 0.08)
	sb.set_corner_radius_all(3)
	theme.set_stylebox("background", "ProgressBar", sb)
	var fill := StyleBoxFlat.new()
	fill.bg_color = GOLD
	fill.set_corner_radius_all(3)
	theme.set_stylebox("fill", "ProgressBar", fill)
	return theme


static func _box(c: Color, r: int) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = c
	b.set_corner_radius_all(r)
	b.set_content_margin_all(12)
	return b


static func panel(color := BG, radius := 10, margin := 12) -> PanelContainer:
	var p := PanelContainer.new()
	var b := _box(color, radius)
	b.set_content_margin_all(margin)
	b.set_border_width_all(1)
	b.border_color = LINE
	p.add_theme_stylebox_override("panel", b)
	return p


static func label(text: String, size := 15, color := TEXT, wrap := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


static func caps(text: String, color := GOLD) -> Label:
	return label(text.to_upper(), 11, color)


static func button(text: String, cb: Callable, primary := false, enabled := true) -> Button:
	var b := Button.new()
	b.text = text
	b.disabled = not enabled
	b.custom_minimum_size = Vector2(44, 40)
	b.pressed.connect(cb)
	if primary:
		var s := _box(GOLD.darkened(0.15), 8)
		s.content_margin_left = 16
		s.content_margin_right = 16
		s.content_margin_top = 9
		s.content_margin_bottom = 9
		b.add_theme_stylebox_override("normal", s)
		var h := s.duplicate()
		h.bg_color = GOLD
		b.add_theme_stylebox_override("hover", h)
		b.add_theme_color_override("font_color", Color("#1a1306"))
		b.add_theme_color_override("font_hover_color", Color("#1a1306"))
	return b


static func vbox(sep := 6) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	return v


static func hbox(sep := 8) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	return h


static func bar(value: float, max_value: float, color := GOLD, w := 80.0, h := 6.0) -> ProgressBar:
	var p := ProgressBar.new()
	p.max_value = max_value
	p.value = value
	p.show_percentage = false
	p.custom_minimum_size = Vector2(w, h)
	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.set_corner_radius_all(3)
	p.add_theme_stylebox_override("fill", fill)
	return p


static func portrait(id: String, size := 48) -> TextureRect:
	var tr := TextureRect.new()
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	tr.custom_minimum_size = Vector2(size, size)
	tr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if not _portraits.has(id):
		var path := "res://assets/portraits/%s.png" % id
		var img := Image.new()
		_portraits[id] = ImageTexture.create_from_image(img) if img.load(ProjectSettings.globalize_path(path)) == OK else null
	tr.texture = _portraits[id]
	return tr


static func spacer() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


static func clear(n: Node) -> void:
	for c in n.get_children():
		n.remove_child(c)
		c.queue_free()
