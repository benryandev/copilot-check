// Post-processing: bloom on the things that are meant to glow (pads, night accents, stars), nothing else.
// The scene renders to a half-float target so only HDR values (above 1.0) bloom; ordinary lit surfaces stay
// under that. Off on the low tier, where the frame goes straight to the canvas as before.
import * as THREE from "../vendor/three.module.min.js";
import { EffectComposer } from "../vendor/post/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/post/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/post/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/post/postprocessing/OutputPass.js";

export const BLOOM_THRESHOLD = 1.05; // linear luminance; lit surfaces and white labels stay under it, glow sources are pushed to GLOW
export const GLOW = 1.15; // the linear luminance a glow source is scaled to, whatever its hue (a dark green needs more push than a mint)
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
// Scale a linear colour so its luminance is GLOW
export const toGlow = (c) => c.multiplyScalar(GLOW / Math.max(lum(c), 0.05));
// The emissive intensity that puts a material's emissive colour at GLOW
export const glowIntensity = (c) => GLOW / Math.max(lum(c), 0.05);

export function createPost(renderer, scene, camera) {
  let composer = null, bloom = null, size = { w: 1, h: 1, ratio: 1 };

  function dispose() {
    if (!composer) return;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    bloom.dispose();
    composer = bloom = null;
  }

  // on: false, or { strength, radius } for this tier
  function enable(on) {
    dispose();
    if (!on) return;
    const w = Math.round(size.w * size.ratio), h = Math.round(size.h * size.ratio);
    // MSAA on the composer's target keeps the edges the canvas's own antialiasing used to give
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(size.ratio);
    composer.setSize(size.w, size.h);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), on.strength, on.radius, BLOOM_THRESHOLD);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  function setSize(w, h, ratio) {
    size = { w, h, ratio };
    if (!composer) return;
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
  }

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  return { enable, setSize, render, get on() { return !!composer; }, get bloom() { return bloom; } };
}
