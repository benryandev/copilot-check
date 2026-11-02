// The Strike blimp: a low-poly airship on a slow loop over the world, painted like a brand ship: silver envelope, a
// Strike green band along both flanks with the wordmark on it. No figures (Ben, 2 Nov: from the ground a number on a
// blimp is hard to place). Where it is comes from blimp-math (the clock, or a pinned angle for a shot).
import * as THREE from "../vendor/three.module.min.js";
import { M, box, mesh, canvasTexture, redraws } from "./build.js";
import { DISTRICTS } from "./content.js";
import { BLIMP, blimpPose } from "./blimp-math.js";

const SKIN_W = 2048, SKIN_H = 512;
export function buildBlimp(scene, palette, { reduceMotion = false } = {}) {
  const g = new THREE.Group();
  const green = new THREE.MeshLambertMaterial({ color: DISTRICTS.hub.colour });
  const greenHex = "#" + new THREE.Color(DISTRICTS.hub.colour).getHexString();
  let current = palette;
  // The Strike mark (the site's own SVG, in its own colours: mint disc, black bolt); the skin repaints once it has loaded
  const mark = new Image();
  mark.onload = () => redraw(current);
  mark.src = "/ecosystem/img/strike-mark.svg";
  // The envelope's skin: silver, a green band round the middle, the mark and the wordmark twice so each flank reads them
  const { tex: skin, redraw: paint } = canvasTexture(SKIN_W, SKIN_H, (ctx, w, h, p) => {
    ctx.fillStyle = p.blimp;
    ctx.fillRect(0, 0, w, h);
    const y0 = h * 0.33, y1 = h * 0.67;
    ctx.fillStyle = greenHex;
    ctx.fillRect(0, y0, w, y1 - y0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, y0 - 10, w, 10); ctx.fillRect(0, y1, w, 10);
    // The mark and the wordmark, squashed along u because the flank is stretched three to one along the ship
    for (const cx of [w * 0.25, w * 0.75]) {
      ctx.save(); ctx.translate(cx, (y0 + y1) / 2); ctx.scale(0.62, 1);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 150px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      const text = "STRIKE", tw = ctx.measureText(text).width, ms = 150, gap = 36;
      const ok = mark.complete && mark.naturalWidth > 0, total = tw + (ok ? ms + gap : 0), x0 = -total / 2;
      if (ok) { // a white ring, then the mark in its own colours
        ctx.beginPath(); ctx.arc(x0 + ms / 2, 0, ms / 2 + 8, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(mark, x0, -ms / 2, ms, ms);
      }
      ctx.fillText(text, x0 + (ok ? ms + gap : 0), 4);
      ctx.restore();
    }
  });
  skin.wrapS = THREE.RepeatWrapping;
  const envGeo = new THREE.SphereGeometry(1, 48, 24);
  envGeo.rotateY(Math.PI / 2); // flanks at u = 0.25 and 0.75, nose and tail at the seam, so the wordmark sits on each side
  const env = new THREE.Mesh(envGeo, new THREE.MeshLambertMaterial({ map: skin }));
  env.scale.set(3, 3, 9); // 18 m long, 6 m round, nose along local -z
  env.castShadow = false;
  env.receiveShadow = true;
  g.add(env);
  // Gondola under the belly, fins at the tail
  g.add(box(1.4, 1.0, 3.4, M.build, 0, -3.6, 1.0));
  g.add(box(0.16, 2.6, 2.6, green, 0, 1.8, 7.2));
  g.add(box(0.16, 2.0, 2.4, green, 0, -3.6, 7.2));
  g.add(box(5.6, 0.16, 2.4, green, 0, 0, 7.2));
  const redraw = (p) => { current = p; paint(p); };
  redraws.push(redraw);
  redraw(palette);
  let fixed = reduceMotion ? (282 * Math.PI) / 180 : null; // still under reduced motion, parked where the river jump's camera sees it
  const tick = (t) => {
    const p = blimpPose(Date.now(), fixed);
    g.position.set(p.x, p.y + (reduceMotion ? 0 : Math.sin(t * 0.45) * 0.5), p.z);
    g.rotation.y = p.heading;
    g.rotation.z = reduceMotion ? 0 : Math.sin(t * 0.3) * 0.03;
  };
  tick(0);
  g.frustumCulled = false;
  scene.add(g);
  g.userData = { tick, redraw, setAngle: (a) => { fixed = a; tick(0); }, pose: () => blimpPose(Date.now(), fixed) };
  return g;
}
export { BLIMP };
