# Orbit camera: drag to turn, wheel / pinch to zoom (mouse and touch).
extends Node3D

@export var distance := 95.0
@export var min_distance := 20.0
@export var max_distance := 160.0
@export var pitch := -40.0

var yaw := 35.0
var touches := {}
var pinch_from := 0.0
var cam: Camera3D


func _ready() -> void:
	cam = Camera3D.new()
	cam.fov = 40
	cam.far = 1000
	add_child(cam)
	_apply()


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and e.button_mask & MOUSE_BUTTON_MASK_LEFT:
		_turn(e.relative)
	elif e is InputEventMouseButton and e.pressed:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom(0.9)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom(1.1)
	elif e is InputEventScreenTouch:
		if e.pressed:
			touches[e.index] = e.position
		else:
			touches.erase(e.index)
		pinch_from = _spread()
	elif e is InputEventScreenDrag:
		touches[e.index] = e.position
		if touches.size() == 1:
			_turn(e.relative)
		elif touches.size() == 2:
			var d := _spread()
			if pinch_from > 0.0 and d > 0.0:
				_zoom(pinch_from / d)
			pinch_from = d
	elif e is InputEventMagnifyGesture:
		_zoom(1.0 / e.factor)


func _spread() -> float:
	if touches.size() != 2:
		return 0.0
	var p = touches.values()
	return (p[0] as Vector2).distance_to(p[1])


func _turn(rel: Vector2) -> void:
	yaw -= rel.x * 0.3
	pitch = clamp(pitch - rel.y * 0.2, -85.0, -15.0)
	_apply()


func _zoom(f: float) -> void:
	distance = clamp(distance * f, min_distance, max_distance)
	_apply()


func _apply() -> void:
	rotation_degrees = Vector3(pitch, yaw, 0)
	if cam:
		cam.position = Vector3(0, 0, distance)
