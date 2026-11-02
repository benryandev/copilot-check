// The Strike blimp: a low-poly airship on a slow loop over the world, painted like a brand ship: silver envelope, a
// Strike green band along both flanks with the wordmark on it. No figures (Ben, 2 Nov: from the ground a number on a
// blimp is hard to place). Where it is comes from blimp-math (the clock, or a pinned angle for a shot).
import * as THREE from "../vendor/three.module.min.js";
import { M, box, mesh, canvasTexture, redraws } from "./build.js";
import { BLIMP, blimpPose } from "./blimp-math.js";

const SKIN_W = 2048, SKIN_H = 512;
export function buildBlimp(scene, palette, { reduceMotion = false } = {}) {
  const g = new THREE.Group();
  const green = new THREE.MeshLambertMaterial({ color: 0x26fab0 }); // fins in Strike mint
  let current = palette;
  // Liveries, all built from Strike's official lockup SVGs (mint disc and bolt, STRIKE FINANCE wordmark; the -dark file is the
  // white wordmark for dark fields). The hull is a canvas skin: top colour, a band round the middle, the lockup on both flanks.
  const LIVERIES = {
    night: { top: "#0b1b3a", band: "#0b1b3a", bottom: "#d6dbe1", stripe: "#26fab0", logo: "dark" }, // Strike's dark app look: navy hull, mint stripe, white and mint lockup
    mint: { top: "#0b1b3a", band: "#26fab0", bottom: "#26fab0", stripe: "#ffffff", logo: "light" }, // the Gemini concept: navy over mint, black lockup on the mint
    silver: { top: "#d6dbe1", band: "#0b1b3a", bottom: "#d6dbe1", stripe: "#26fab0", logo: "dark" }, // Goodyear: silver ship, navy band, white and mint lockup
  };
  let livery = LIVERIES.night;
  const logos = { light: new Image(), dark: new Image() };
  for (const [k, img] of Object.entries(logos)) { img.onload = () => redraw(current); img.src = `/ecosystem/img/strike-logo${k === "dark" ? "-dark" : ""}.svg`; }
  const { tex: skin, redraw: paint } = canvasTexture(SKIN_W, SKIN_H, (ctx, w, h) => {
    const y0 = h * 0.3, y1 = h * 0.7;
    ctx.fillStyle = livery.top; ctx.fillRect(0, 0, w, y0);
    ctx.fillStyle = livery.bottom; ctx.fillRect(0, y1, w, h - y1);
    ctx.fillStyle = livery.band; ctx.fillRect(0, y0, w, y1 - y0);
    ctx.fillStyle = livery.stripe; ctx.fillRect(0, y1, w, 12); ctx.fillRect(0, y0 - 12, w, 12);
    // The lockup, squashed along u because the flank is stretched three to one along the ship
    const img = logos[livery.logo];
    if (!(img.complete && img.naturalWidth > 0)) return;
    const lw = 1180, lh = (lw * img.naturalHeight) / img.naturalWidth;
    for (const cx of [w * 0.25, w * 0.75]) {
      ctx.save(); ctx.translate(cx, (y0 + y1) / 2); ctx.scale(0.62, 1);
      ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
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
  g.userData = { tick, redraw, setAngle: (a) => { fixed = a; tick(0); }, pose: () => blimpPose(Date.now(), fixed), setLivery: (name) => { if (LIVERIES[name]) { livery = LIVERIES[name]; redraw(current); } }, liveries: Object.keys(LIVERIES) };
  return g;
}
export { BLIMP };
