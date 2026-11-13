## src/audio/sound.js: procedural sound. Every effect is synthesised (oscillators with pitch slides and filtered
## noise bursts, WebAudio-style envelopes) once into a sample buffer, then played from a small pool. The ambience
## is wind (looping low-passed noise, louder in storms) and campfire crackle.
class_name Sound
extends Node

const RATE := 22050
var enabled := true
var pool: Array = []
var cache := {}
var wind: AudioStreamPlayer
var storm := 0.35
var fire := 1.0
var crackle_t := 0.0
var rng := RandomNumberGenerator.new()


func _ready() -> void:
	for i in 10:
		var p := AudioStreamPlayer.new()
		p.volume_db = -4
		add_child(p)
		pool.append(p)
	wind = AudioStreamPlayer.new()
	wind.stream = _wind_loop()
	wind.volume_db = -60
	add_child(wind)


func set_enabled(on: bool) -> void:
	enabled = on
	if not on:
		wind.stop()


func set_ambient(on: bool) -> void:
	if on and enabled and not wind.playing:
		wind.play()
	elif not on:
		wind.stop()


func set_weather(s: float, f: float) -> void:
	storm = s
	fire = f


func play(name: String, delay := 0.0) -> void:
	if not enabled or name == "":
		return
	if delay > 0:
		get_tree().create_timer(delay).timeout.connect(func(): play(name))
		return
	var st = cache.get(name)
	if st == null:
		var voices := _recipe(name)
		if voices.is_empty():
			return
		st = _render(voices)
		cache[name] = st
	for p in pool:
		if not p.playing:
			p.stream = st
			p.play()
			return


func _process(dt: float) -> void:
	if not wind.playing:
		return
	var g := 0.025 + storm * 0.075
	wind.volume_db = lerpf(wind.volume_db, linear_to_db(g / 0.1), minf(1.0, dt))
	crackle_t -= dt
	if crackle_t <= 0:
		crackle_t = 0.14
		if rng.randf() < clampf(fire * 0.6, 0, 0.9):
			var key := "crackle%d" % rng.randi_range(0, 5)
			if not cache.has(key):
				cache[key] = _render([{"kind": "noise", "dur": 0.02 + rng.randf() * 0.03, "freq": 2000 + rng.randf() * 3000, "q": 3.0, "gain": 0.03 + rng.randf() * 0.03}])
			for p in pool:
				if not p.playing:
					p.stream = cache[key]
					p.play()
					break


## sound.js soundForLog
static func for_log(e: Dictionary) -> String:
	match e.k:
		"move", "attack", "search", "barricade", "lure", "play", "contribute", "spawn", "death", "roundStart", "turnStart", "crossroadsTriggered", "gameOver", "starvation":
			return e.k
	return ""


# ---------------------------------------------------------------- the palette (voices)

static func T(f: float, dur: float, type := "sine", gain := 0.3, delay := 0.0, to := 0.0, attack := 0.005) -> Dictionary:
	return {"kind": "tone", "f": f, "to": to, "dur": dur, "type": type, "gain": gain, "delay": delay, "attack": attack}


static func N(dur: float, freq: float, gain := 0.3, delay := 0.0, q := 0.8, to := 0.0, attack := 0.003, ftype := "bandpass") -> Dictionary:
	return {"kind": "noise", "dur": dur, "freq": freq, "to": to, "q": q, "gain": gain, "delay": delay, "attack": attack, "ftype": ftype}


static func chord(freqs: Array, type: String, spread: float, dur: float, gain: float) -> Array:
	var out := []
	for i in freqs.size():
		out.append(T(freqs[i], dur, type, gain, i * spread))
	return out


func _recipe(name: String) -> Array:
	match name:
		"ui": return [T(900, 0.05, "triangle", 0.08, 0, 1200)]
		"error": return [T(180, 0.12, "square", 0.07), T(150, 0.14, "square", 0.07, 0.1)]
		"start": return chord([262, 330, 392, 523], "triangle", 0.09, 0.9, 0.1)
		"move": return [T(220, 0.09, "sine", 0.18, 0, 110), N(0.08, 600, 0.08, 0.05)]
		"attack": return [N(0.12, 900, 0.45, 0, 0.5), T(120, 0.18, "triangle", 0.3, 0, 60)]
		"search": return [N(0.25, 1800, 0.12, 0, 1.5, 5000, 0.03)]
		"barricade":
			var v := []
			for i in 3:
				v.append(N(0.05, 700, 0.35, i * 0.14, 3))
				v.append(T(160, 0.06, "triangle", 0.15, i * 0.14, 120))
			return v
		"lure": return [T(600, 0.15, "square", 0.05, 0, 900), T(900, 0.15, "square", 0.05, 0.16, 600)]
		"play": return [T(660, 0.08, "triangle", 0.1, 0, 880)]
		"contribute": return [N(0.04, 3000, 0.2, 0, 2), T(330, 0.12, "triangle", 0.06, 0.03)]
		"spawn": return [{"kind": "groan", "f": 95 + rng.randf() * 30, "to": 60.0, "dur": 0.95, "gain": 0.12}]
		"death":
			var v := []
			var fs := [523, 466, 392, 311]
			for i in 4:
				v.append(T(fs[i], 0.35, "triangle", 0.12, i * 0.16))
			return v
		"crisis:ok": return chord([392, 494, 587, 784], "triangle", 0.08, 0.9, 0.11)
		"crisis:fail": return chord([311, 370, 415], "sawtooth", 0.02, 1.0, 0.05)
		"roundStart": return [T(220, 1.6, "sine", 0.09, 0, 0, 0.002), T(440, 1.2, "sine", 0.045, 0, 0, 0.002), T(660, 0.8, "sine", 0.03, 0, 0, 0.002)]
		"turnStart": return [T(740, 0.12, "triangle", 0.05)]
		"crossroadsTriggered":
			var v := []
			var fs := [659, 784, 988, 1319]
			for i in 4:
				v.append(T(fs[i], 0.6, "sine", 0.04, i * 0.09))
			return v
		"gameOver": return chord([262, 311, 392, 466, 523], "triangle", 0.15, 1.4, 0.08)
		"starvation": return [T(200, 0.6, "triangle", 0.12, 0, 120)]
	return []


# ---------------------------------------------------------------- synthesis

## WebAudio's env(): exponential rise to the peak over `attack`, exponential fall over `decay`.
static func _env(t: float, attack: float, decay: float, peak: float) -> float:
	if t < 0:
		return 0.0
	if t < attack:
		return 0.0001 * pow(peak / 0.0001, t / attack)
	var u := (t - attack) / decay
	if u >= 1:
		return 0.0
	return peak * pow(0.0001 / peak, u)


static func _osc(type: String, ph: float) -> float:
	var x := fposmod(ph, 1.0)
	match type:
		"square": return 1.0 if x < 0.5 else -1.0
		"triangle": return 4.0 * absf(x - 0.5) - 1.0
		"sawtooth": return 2.0 * x - 1.0
	return sin(x * TAU)


func _render(voices: Array) -> AudioStreamWAV:
	var length := 0.0
	for v in voices:
		length = maxf(length, v.get("delay", 0.0) + v.get("attack", 0.005) + v.dur + 0.06)
	var n := int(length * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	for v in voices:
		var start := int(v.get("delay", 0.0) * RATE)
		var attack: float = v.get("attack", 0.005)
		var dur: float = v.dur
		if v.kind == "tone":
			var ph := 0.0
			for i in range(start, n):
				var t := float(i - start) / RATE
				var f: float = v.f * pow(v.to / v.f, minf(1.0, t / dur)) if v.to > 0 else v.f
				ph += f / RATE
				var e := _env(t, attack, dur, v.gain)
				if e == 0 and t > attack:
					break
				buf[i] += _osc(v.type, ph) * e
		elif v.kind == "noise":
			var bq := _Biquad.new()
			for i in range(start, n):
				var t := float(i - start) / RATE
				var f: float = v.freq * pow(v.to / v.freq, minf(1.0, t / dur)) if v.get("to", 0.0) > 0 else v.freq
				bq.set_params(v.get("ftype", "bandpass"), f, v.q, RATE)
				var e := _env(t, attack, dur, v.gain)
				if e == 0 and t > attack:
					break
				buf[i] += bq.process(rng.randf() * 2 - 1) * e
		elif v.kind == "groan":
			var bq := _Biquad.new()
			var ph := 0.0
			for i in range(start, n):
				var t := float(i - start) / RATE
				var f: float = v.f * pow(v.to / v.f, minf(1.0, t / 0.9)) + sin(t * TAU * 6) * 8
				ph += f / RATE
				bq.set_params("lowpass", 900 * pow(250 / 900.0, minf(1.0, t / 0.9)), 0.7, RATE)
				buf[i] += bq.process(_osc("sawtooth", ph)) * _env(t, 0.15, 0.8, v.gain)
	var data := PackedByteArray()
	data.resize(n * 2)
	for i in n:
		data.encode_s16(i * 2, int(clampf(buf[i] * 0.55, -1, 1) * 32767))
	var st := AudioStreamWAV.new()
	st.format = AudioStreamWAV.FORMAT_16_BITS
	st.mix_rate = RATE
	st.data = data
	return st


func _wind_loop() -> AudioStreamWAV:
	var n := RATE * 4
	var data := PackedByteArray()
	data.resize(n * 2)
	var bq := _Biquad.new()
	for i in n:
		var t := float(i) / RATE
		bq.set_params("lowpass", 420 + sin(t * TAU * 0.25) * 200, 0.7, RATE)
		data.encode_s16(i * 2, int(clampf(bq.process(rng.randf() * 2 - 1) * 0.6, -1, 1) * 32767))
	var st := AudioStreamWAV.new()
	st.format = AudioStreamWAV.FORMAT_16_BITS
	st.mix_rate = RATE
	st.data = data
	st.loop_mode = AudioStreamWAV.LOOP_FORWARD
	st.loop_end = n
	return st


## RBJ biquad (WebAudio's lowpass / bandpass).
class _Biquad:
	var b0 := 1.0
	var b1 := 0.0
	var b2 := 0.0
	var a1 := 0.0
	var a2 := 0.0
	var x1 := 0.0
	var x2 := 0.0
	var y1 := 0.0
	var y2 := 0.0

	func set_params(type: String, f: float, q: float, rate: float) -> void:
		var w := TAU * clampf(f, 10, rate * 0.45) / rate
		var alpha := sin(w) / (2 * maxf(q, 0.0001))
		var cw := cos(w)
		var a0 := 1 + alpha
		if type == "lowpass":
			b0 = (1 - cw) / 2 / a0
			b1 = (1 - cw) / a0
			b2 = b0
		else:
			b0 = alpha / a0
			b1 = 0
			b2 = -alpha / a0
		a1 = -2 * cw / a0
		a2 = (1 - alpha) / a0

	func process(x: float) -> float:
		var y := b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		return y
