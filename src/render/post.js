// Post-processing (bloom -> grade + vignette (+ tilt-shift) -> tone map). Step 22: its own chunk, loaded
// only when the graphics tier uses it (the "battery saver" tier never downloads it).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createPost(renderer, scene, camera, opts) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Threshold above 1.0: only boosted glow voxels (fire, windows, eyes) bloom, not firelit snow.
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), opts.bloom, 0.5, 1.05);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uTilt.value = opts.tiltShift ? 1 : 0;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer,
    setSize(w, h, ratio) {
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      bloom.setSize(Math.round(w / 2), Math.round(h / 2));
      grade.uniforms.uResolution.value.set(w * ratio, h * ratio);
    },
    render(dt) { composer.render(dt); },
  };
}

/** Colour grade (cool shadows, warm highlights, a touch of saturation), vignette, optional tilt-shift. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTilt: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTilt;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uTilt > 0.5) {
        // Miniature look: blur grows towards the top and bottom of the frame.
        float amt = smoothstep(0.22, 0.5, abs(vUv.y - 0.55)) * 2.5;
        if (amt > 0.01) {
          vec2 px = amt / uResolution;
          vec3 acc = c;
          acc += texture2D(tDiffuse, vUv + vec2( px.x,  0.0)).rgb;
          acc += texture2D(tDiffuse, vUv + vec2(-px.x,  0.0)).rgb;
          acc += texture2D(tDiffuse, vUv + vec2( 0.0,  px.y)).rgb;
          acc += texture2D(tDiffuse, vUv + vec2( 0.0, -px.y)).rgb;
          acc += texture2D(tDiffuse, vUv + px * 1.4).rgb;
          acc += texture2D(tDiffuse, vUv - px * 1.4).rgb;
          acc += texture2D(tDiffuse, vUv + vec2(px.x, -px.y) * 1.4).rgb;
          acc += texture2D(tDiffuse, vUv + vec2(-px.x, px.y) * 1.4).rgb;
          c = acc / 9.0;
        }
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 cool = c * vec3(0.93, 0.98, 1.09);
      vec3 warm = c * vec3(1.07, 1.0, 0.9);
      c = mix(cool, warm, smoothstep(0.25, 0.9, l));
      c = mix(vec3(l), c, 1.1);
      float d = distance(vUv, vec2(0.5));
      c *= mix(1.0, 0.7, smoothstep(0.38, 0.85, d));
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};
