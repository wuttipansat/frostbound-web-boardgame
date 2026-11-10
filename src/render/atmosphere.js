// Living winter (step 20): the scene reacts to how the game is going — presentation only.
// storm 0..1 (snow + fog), dusk 0..1 (day -> night within a round), fire 0..~1.4 (colony bonfire).
import * as THREE from 'three';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/** Pure: what the weather should look like for a (viewed) state. */
const DUSK = { dawn: 0.3, day: 0, dusk: 0.65, night: 1 };

export function atmosphereFor(s) {
  if (!s || !s.scenario) return { storm: 0.35, dusk: 0.5, fire: 1, mood: 'calm' };
  const rounds = s.scenario.days || 40;
  const progress = clamp((s.day - 1) / Math.max(1, rounds - 1));
  const morale = clamp(s.morale / (s.maxMorale || 10));
  // The light follows the time of day (the colony reveal shows dusk → night).
  let dusk = DUSK[s.time] ?? 0.2;
  let storm = clamp(0.2 + progress * 0.45 + (1 - morale) * 0.45);
  let fire = 0.35 + morale * 0.75;
  let mood = storm > 0.7 ? 'storm' : 'calm';
  if (s.phase === 'draft') dusk = 0.15;
  if (s.phase === 'gameOver') {
    const won = s.result?.reason === 'objectiveComplete';
    mood = won ? 'won' : 'lost';
    storm = won ? 0.08 : 1;
    fire = won ? 1.15 : 0.05;
    dusk = won ? 0 : 1;
  }
  return { storm, dusk, fire, mood };
}

const DAY = { hemi: new THREE.Color(0xa9c4ee), moon: new THREE.Color(0xd8e4ff), fog: new THREE.Color(0x24344f) };
const NIGHT = { hemi: new THREE.Color(0x6f8cc8), moon: new THREE.Color(0x8fa8e6), fog: new THREE.Color(0x0e182b) };

/** Eases the stage + board toward a target atmosphere each frame. */
export function createAtmosphere(stage, board) {
  const cur = { storm: 0.35, dusk: 0.5, fire: 1 };
  let goal = { ...cur };
  const c = new THREE.Color();
  return {
    set(a) { goal = a; },
    get current() { return { ...cur }; },
    update(dt) {
      const k = 1 - Math.exp(-dt * 0.9);
      for (const key of ['storm', 'dusk', 'fire']) cur[key] += (goal[key] - cur[key]) * k;
      stage.setWeather?.(cur.storm);
      const { hemi, moon, scene } = stage;
      if (hemi) { hemi.color.copy(c.copy(DAY.hemi).lerp(NIGHT.hemi, cur.dusk)); hemi.intensity = 1.4 - cur.dusk * 0.3 - cur.storm * 0.25; /* brighter day, readable night */ }
      if (moon) { moon.color.copy(c.copy(DAY.moon).lerp(NIGHT.moon, cur.dusk)); moon.intensity = 2.05 - cur.dusk * 0.45 - cur.storm * 0.5; }
      if (scene?.fog) { scene.fog.color.copy(c.copy(DAY.fog).lerp(NIGHT.fog, cur.dusk)); scene.fog.density = 0.0015 + cur.storm * 0.006; }
      board.setFire?.(cur.fire);
    },
  };
}
