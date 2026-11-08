// Graphics quality tiers. Chosen in Settings, stored with the other settings, applied at load
// (switching reloads the page and the autosaved game resumes).

export const QUALITY_TIERS = {
  low: {
    hd: false, // original 1× voxel models
    maxPixelRatio: 1,
    shadowMapSize: 1024,
    softShadows: false,
    post: false, // no bloom / grading / tilt-shift
    snowFlakes: 1200,
    particleScale: 0.5,
    mist: false,
    sky: false,
    glowBoost: 1,
  },
  medium: {
    hd: true,
    maxPixelRatio: 1.5,
    shadowMapSize: 2048,
    softShadows: true,
    post: { bloom: 0.55, grade: true, tiltShift: false },
    snowFlakes: 2600,
    particleScale: 1,
    mist: true,
    sky: true,
    glowBoost: 2.2,
  },
  high: {
    hd: true,
    maxPixelRatio: 2,
    shadowMapSize: 4096,
    softShadows: true,
    post: { bloom: 0.7, grade: true, tiltShift: true },
    snowFlakes: 4200,
    particleScale: 1.4,
    mist: true,
    sky: true,
    glowBoost: 2.4,
  },
};

export const QUALITY_IDS = Object.keys(QUALITY_TIERS);
const SETTINGS_KEY = 'frostbound.settings.v1';

/** A sensible default for the device: phones and small GPUs get Low, everyone else Medium. */
export function defaultQuality(env = (typeof window !== 'undefined' ? window : {})) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(env.navigator?.userAgent ?? '');
  const cores = env.navigator?.hardwareConcurrency ?? 4;
  if (mobile || cores <= 2) return 'low';
  return 'medium';
}

/** Resolve the tier: ?quality= URL override > saved setting > device default. */
export function resolveQuality({ search = '', saved = null, env } = {}) {
  const fromUrl = new URLSearchParams(search).get('quality');
  const id = [fromUrl, saved].find((q) => q && QUALITY_TIERS[q]) ?? defaultQuality(env);
  return { id, ...QUALITY_TIERS[id] };
}

export function loadQuality() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY))?.quality ?? null; } catch { /* ignore */ }
  return resolveQuality({ search: typeof location !== 'undefined' ? location.search : '', saved });
}
