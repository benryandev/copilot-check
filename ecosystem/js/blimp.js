// The Strike blimp: a low-poly airship on a slow loop over the world, painted like a brand ship: silver envelope, a
// Strike green band along both flanks with the wordmark on it. No figures (Ben, 2 Nov: from the ground a number on a
// blimp is hard to place). Where it is comes from blimp-math (the clock, or a pinned angle for a shot).
import * as THREE from "../vendor/three.module.min.js";
import { M, box, mesh, canvasTexture, redraws } from "./build.js";
import { BLIMP, blimpPose, shadowSpot } from "./blimp-math.js";
import { groundHeight } from "./terrain.js";

const SKIN_W = 2048, SKIN_H = 512;
export function buildBlimp(scene, palette, { reduceMotion = false } = {}) {
  const g = new THREE.Group();
  const green = new THREE.MeshLambertMaterial({ color: 0x26fab0 }); // fins in Strike mint
  let current = palette;
  // Liveries, all built from Strike's official lockup SVGs (mint disc and bolt, STRIKE FINANCE wordmark; the -dark file is the
  // white wordmark for dark fields). The hull is a canvas skin: top colour, a band round the middle, the lockup on both flanks.
  const LIVERIES = {
    night: { top: "#0b1b3a", band: "#0b1b3a", bottom: "#0b1b3a", stripe: "#0b1b3a", tail: true, logo: "dark" }, // Ben's pick (2 Nov): navy hull, white and mint tail stripes, the white and mint lockup
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
    if (livery.tail) { // two bands round the hull near the tail (the tail is at the texture's seam, u = 0 and 1)
      for (const [a, b, c] of [[0.035, 0.065, "#26fab0"], [0.065, 0.085, "#ffffff"], [0.915, 0.935, "#ffffff"], [0.935, 0.965, "#26fab0"]]) { ctx.fillStyle = c; ctx.fillRect(w * a, 0, w * (b - a), h); }
    }
    // The lockup, squashed along u because the flank is stretched three to one along the ship
    const img = logos[livery.logo];
    if (!(img.complete && img.naturalWidth > 0)) return;
    const lw = 960, lh = (lw * img.naturalHeight) / img.naturalWidth; // about 0.29 of the way round: the flank, clear of the tail bands
    for (const cx of [w * 0.27, w * 0.73]) { // a little towards the nose (the tail is at the seam)
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
  // Gondola under the belly, fins at the tail. None of it casts a shadow: from 24 m up the sun's shadow map drew the
  // gondola and the flat fins as hard black slabs sliding over the grass (Ben, 2 Nov). The ship's shadow is the soft
  // blob below instead.
  for (const part of [box(1.4, 1.0, 3.4, M.build, 0, -3.6, 1.0), box(0.16, 2.6, 2.6, green, 0, 1.8, 7.2), box(0.16, 2.0, 2.4, green, 0, -3.6, 7.2), box(5.6, 0.16, 2.4, green, 0, 0, 7.2)]) {
    part.castShadow = false;
    g.add(part);
  }
  // The soft shadow: a dark ellipse laid on the ground down-sun of the ship, the envelope's footprint, fading to nothing
  // at its edge. A small patch draped on the terrain (a flat plane sank into the hills beyond a plaza's rim) with the
  // fade in a four-part vertex colour (vertex alpha; a canvas texture drew nothing here), 22 × 11 m at 1 m cells, every
  // vertex just above the plaza discs and rims; re-laid each tick as the ship moves.
  const BW = 22, BH = 11, NX = 22, NZ = 11;
  const blobGeo = new THREE.BufferGeometry();
  const bpos = new Float32Array((NX + 1) * (NZ + 1) * 3), bcol = new Float32Array((NX + 1) * (NZ + 1) * 4), bidx = [];
  for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
    const q = i * (NZ + 1) + j, u = i / NX - 0.5, v = j / NZ - 0.5, d = Math.min(1, 2 * Math.hypot(u, v)); // 0 at the centre, 1 at the rim
    bcol[q * 4 + 3] = 0.8 * (1 - d * d); // black, fading out with the square of the distance (0.4 read as nothing against lit grass)
    if (i < NX && j < NZ) bidx.push(q, q + 1, q + NZ + 1, q + 1, q + NZ + 2, q + NZ + 1);
  }
  blobGeo.setAttribute("position", new THREE.BufferAttribute(bpos, 3));
  blobGeo.setAttribute("color", new THREE.BufferAttribute(bcol, 4));
  blobGeo.setIndex(bidx);
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  blob.renderOrder = 1;
  blob.frustumCulled = false;
  scene.add(blob);
  function layBlob(sp) {
    const ax = -Math.sin(sp.heading), az = -Math.cos(sp.heading), cx = -az, cz = ax; // along the ship, and across it
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const u = (i / NX - 0.5) * BW, v = (j / NZ - 0.5) * BH, q = (i * (NZ + 1) + j) * 3;
      const x = sp.x + ax * u + cx * v, z = sp.z + az * u + cz * v;
      bpos[q] = x; bpos[q + 1] = groundHeight(x, z) + 0.3; bpos[q + 2] = z; // above the plaza discs (0.08), their rims (0.12) and the coarse ground mesh where it bows above the analytic surface
    }
    blobGeo.attributes.position.needsUpdate = true;
  }
  const redraw = (p) => { current = p; paint(p); };
  redraws.push(redraw);
  redraw(palette);
  let fixed = reduceMotion ? (282 * Math.PI) / 180 : null; // still under reduced motion, parked where the river jump's camera sees it
  const tick = (t) => {
    const p = blimpPose(Date.now(), fixed);
    g.position.set(p.x, p.y + (reduceMotion ? 0 : Math.sin(t * 0.45) * 0.5), p.z);
    g.rotation.y = p.heading;
    g.rotation.z = reduceMotion ? 0 : Math.sin(t * 0.3) * 0.03;
    layBlob(shadowSpot(p));
  };
  tick(0);
  g.frustumCulled = false;
  scene.add(g);
  g.userData = { tick, redraw, setAngle: (a) => { fixed = a; tick(0); }, pose: () => blimpPose(Date.now(), fixed), setLivery: (name) => { if (LIVERIES[name]) { livery = LIVERIES[name]; redraw(current); } }, liveries: Object.keys(LIVERIES) };
  return g;
}
export { BLIMP };
