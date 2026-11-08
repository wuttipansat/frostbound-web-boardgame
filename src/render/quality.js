// The one graphics quality: HD voxel models, soft shadows, bloom, grading and tilt-shift.
// Only the pixel-ratio cap and the particle counts adapt to the device, to keep phones smooth.

export const QUALITY = Object.freeze({
  id: 'high',
  maxPixelRatio: 2,
  shadowMapSize: 4096,
  softShadows: true,
  post: { bloom: 0.7, grade: true, tiltShift: true },
  snowFlakes: 4200,
  particleScale: 1.4,
  sky: true,
  glowBoost: 2.4,
});

/** Device adjustments: phones and small CPUs render at a lower pixel ratio with fewer particles. */
export function qualityFor(env = (typeof window !== 'undefined' ? window : {})) {
  const mobile = /Android|iPhone|iPad|Mobile/i.test(env.navigator?.userAgent ?? '');
  const cores = env.navigator?.hardwareConcurrency ?? 4;
  if (!mobile && cores > 2) return QUALITY;
  return { ...QUALITY, maxPixelRatio: 1.5, shadowMapSize: 2048, snowFlakes: 2400, particleScale: 0.9 };
}

export const loadQuality = () => qualityFor();
