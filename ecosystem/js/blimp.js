// The Strike blimp: a low-poly airship on a slow loop over the world with the live 24 h volume on both flanks.
// Where it is comes from blimp-math (the clock, or a pinned angle for a shot); this file only builds and moves it.
import * as THREE from "../vendor/three.module.min.js";
import { M, box, mesh, canvasTexture, redraws } from "./build.js";
import { DISTRICTS } from "./content.js";
import { BLIMP, blimpPose, blimpText } from "./blimp-math.js";

const BANNER_W = 1024, BANNER_H = 256;
export function buildBlimp(scene, palette, getLive, { reduceMotion = false } = {}) {
  const g = new THREE.Group();
  const green = new THREE.MeshLambertMaterial({ color: DISTRICTS.hub.colour });
  // Envelope: a stretched sphere, 18 m long and 6 m round, nose along local -z (forward, like the car)
  const env = mesh(new THREE.SphereGeometry(1, 28, 18), green);
  env.scale.set(3, 3, 9);
  env.castShadow = false;
  g.add(env);
  // Gondola under the belly, fins at the tail
  g.add(box(1.4, 1.0, 3.4, M.build, 0, -3.6, 1.0));
  g.add(box(0.16, 2.6, 2.6, green, 0, 1.8, 7.2));
  g.add(box(0.16, 2.0, 2.4, green, 0, -3.6, 7.2));
  g.add(box(5.6, 0.16, 2.4, green, 0, 0, 7.2));
  // Banners: a panel on each flank, drawn once per theme or live update; each faces outward so the text reads the right way
  const { tex, redraw: paint } = canvasTexture(BANNER_W, BANNER_H, (ctx, w, h, p) => {
    ctx.fillStyle = p.panel;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#" + new THREE.Color(DISTRICTS.hub.colour).getHexString();
    ctx.fillRect(0, h - 18, w, 18);
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.text;
    ctx.font = "800 118px 'Atkinson Hyperlegible Next', Arial, sans-serif";
    ctx.fillText("STRIKE", 40, h / 2 - 6);
    // The figure on the right: the label small above the number, so neither runs into the wordmark
    const [label, figure] = blimpText(getLive()?.values).split(/\s{2}/);
    ctx.textAlign = "right";
    ctx.fillStyle = p.sub;
    ctx.font = "500 40px 'Geist Mono', monospace";
    ctx.fillText(label, w - 44, 62);
    ctx.fillStyle = p.text;
    ctx.font = "600 104px 'Geist Mono', monospace";
    ctx.fillText(figure, w - 44, 158);
    ctx.textAlign = "left";
  });
  const bannerMat = new THREE.MeshBasicMaterial({ map: tex });
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), bannerMat);
    b.position.set(side * 3.02, 0.2, 0.6);
    b.rotation.y = side * Math.PI / 2;
    g.add(b);
  }
  const redraw = (p) => paint(p);
  redraws.push(redraw); // theme changes repaint it with the rest; main.js also calls it when live figures arrive
  redraw(palette);
  let fixed = reduceMotion ? (289 * Math.PI) / 180 : null; // still under reduced motion, parked where the river jump's camera sees it
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
