// Funding windsocks along the east verge of the Perps spoke: nine poles, one per market, each sock blowing with that
// market's funding rate on Strike (north, the way you drive, when longs pay; south when shorts pay; limp when nothing;
// full and flat when strong), three smaller socks behind each for Bybit, Binance and Hyperliquid, a label over every
// Strike pole with the market and its rate, and a board before the first that says what the row is. All the cloth in
// the world is one InstancedMesh posed every frame (windsock-math.js segmentAngles). A journey piece: nothing on the
// road, no pad or sheet, no colliders. main.js applies a new comparison every five minutes; the socks ease to it.
import * as THREE from "../vendor/three.module.min.js";
import { roads, terrainHeight } from "./terrain.js";
import { WINDSOCKS, sockState, sockLabel, polePositions, segmentAngles } from "./windsock-math.js";
import { canvasTexture, redraws, animated, box, cyl, M } from "./build.js";
import { DISTRICTS } from "./content.js";

const TONES = { up: new THREE.Color(0x4ade80), down: new THREE.Color(0xf87171), none: new THREE.Color(0x9aa3ad) };
const WHITE = new THREE.Color(0xffffff);
const VENUE_NAMES = { bybit: "Bybit", binance: "Binance", hyperliquid: "Hyperliquid" };
const SEG_LEN = 0.34, SEG_R0 = 0.15, TAPER = 0.85, CEX_SCALE = 0.7; // each segment's far end is TAPER of its near end, and the next segment starts there
const BOARD = ["FUNDING, PER 8 H", "Strike's rate on each sock. Green blows towards Perps: longs pay. Red blows back: shorts pay.", "Behind each: Bybit, Binance, Hyperliquid."];

export function buildWindsocks(scene, palette, { reduceMotion = false } = {}) {
  const g = new THREE.Group();
  g.name = "windsocks";
  const spoke = roads.find((r) => r.kind === "spoke" && r.to === "perps");
  if (!spoke) { g.userData = { apply() {}, recolour() {}, state: () => ({ map: null, fills: [] }) }; return g; }
  let pal = palette, map = null;
  const n = WINDSOCKS.segments;
  // A point beside the road: s along it, v beyond the east edge; with the unit tangent (north is along it)
  const at = (s, v) => { const u = Math.min(1, Math.max(0, s / spoke.len)), p = spoke.curve.getPointAt(u), t = spoke.curve.getTangentAt(u), l = Math.hypot(t.x, t.z); const tx = t.x / l, tz = t.z / l; return { x: p.x + -tz * (spoke.half + v), z: p.z + tx * (spoke.half + v), tx, tz }; };
  const pos = polePositions(spoke.len);

  // ── Poles, rings and labels ──
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  function label(text, width, parent, y) {
    let current = text;
    const { tex, redraw } = canvasTexture(512, 128, (ctx, w, h, q) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = "600 56px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      const tw = ctx.measureText(current).width, pw = Math.min(w - 8, tw + 56);
      ctx.fillStyle = q.panel; ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.roundRect((w - pw) / 2, 24, pw, 80, 40); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = q.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(current, w / 2, 64);
    });
    redraws.push(redraw);
    redraw(pal);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sprite.scale.set(width, width / 4, 1);
    sprite.position.y = y;
    sprite.renderOrder = 2;
    parent.add(sprite);
    return { set: (t) => { if (t !== current) { current = t; redraw(pal); } }, sprite };
  }
  // Each sock: where its ring is, which way north points, its scale, its label and its live state
  const socks = [];
  function pole({ s, v }, height, ringR, scale, text, labelWidth) {
    const p = at(s, v), y0 = terrainHeight(p.x, p.z);
    const grp = new THREE.Group();
    grp.position.set(p.x, y0, p.z);
    grp.add(cyl(0.06, height, M.trim, 0, 0, 0, 10));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.025, 8, 24), ringMat);
    ring.position.set(0, height, 0);
    ring.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI / 2; // the ring's axis along the road
    grp.add(ring);
    const lab = text == null ? { set() {} } : label(text, labelWidth, grp, height + 0.55);
    g.add(grp);
    const sock = { ring: new THREE.Vector3(p.x, y0 + height, p.z), tx: p.tx, tz: p.tz, scale, label: lab, fill: 0, target: 0, dir: 1, tone: "none", first: socks.length * n };
    socks.push(sock);
    return sock;
  }
  pos.strike.forEach((q) => { const sock = pole(q, 3.2, SEG_R0, 1, sockLabel(q.symbol, null), 2.2); sock.symbol = q.symbol; sock.venue = "strike"; });
  // The venue socks carry their name only in the first group (behind the first market, by the board): 27 labels were noise
  pos.cex.forEach((q) => { const sock = pole(q, 2.2, SEG_R0 * CEX_SCALE, CEX_SCALE, q.i === 0 ? VENUE_NAMES[q.venue] : null, 1.3); sock.symbol = q.symbol; sock.venue = q.venue; });

  // ── The cloth: one instanced mesh of tapered segments ──
  const cloth = new THREE.InstancedMesh(new THREE.CylinderGeometry(SEG_R0 * TAPER, SEG_R0, SEG_LEN, 10, 1, true), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), socks.length * n);
  cloth.castShadow = true;
  cloth.frustumCulled = false;
  g.add(cloth);
  const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Vector3();
  function colour() {
    for (const sock of socks) for (let k = 0; k < n; k++) cloth.setColorAt(sock.first + k, k % 2 ? TONES[sock.tone] : WHITE);
    cloth.instanceColor.needsUpdate = true;
  }
  let lastT = null;
  function pose(t) {
    const dt = lastT == null ? 0 : Math.min(0.1, t - lastT);
    lastT = t;
    const k0 = 1 - Math.exp(-dt / (WINDSOCKS.ease / 3.3)); // about `ease` seconds to settle
    for (const sock of socks) {
      sock.fill += (sock.target - sock.fill) * k0;
      const angles = segmentAngles(sock.fill, t + sock.first * 0.37, n);
      const L = SEG_LEN * sock.scale;
      c.copy(sock.ring);
      for (let k = 0; k < n; k++) {
        const a = angles[k];
        dirV.set(sock.tx * sock.dir * Math.cos(a), -Math.sin(a), sock.tz * sock.dir * Math.cos(a));
        // The cylinder's axis is +y with the wide end at −y: point −y back towards the ring
        qt.setFromUnitVectors(up, dirV);
        const r = sock.scale * TAPER ** k; // the girth tapers segment by segment; the length does not
        sc.set(r, sock.scale, r);
        m.compose(c.clone().addScaledVector(dirV, L / 2), qt, sc);
        cloth.setMatrixAt(sock.first + k, m);
        c.addScaledVector(dirV, L);
      }
    }
    cloth.instanceMatrix.needsUpdate = true;
  }

  // ── The board ──
  {
    const p = at(pos.board.s, pos.board.v), y0 = terrainHeight(p.x, p.z);
    const grp = new THREE.Group();
    grp.position.set(p.x, y0, p.z);
    grp.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI / 2; // faces the road
    grp.add(box(0.18, 2.6, 0.18, M.build, -1.6, 0, 0), box(0.18, 2.6, 0.18, M.build, 1.6, 0, 0));
    const { tex, redraw } = canvasTexture(1024, 384, (ctx, w, h, q) => {
      ctx.fillStyle = q.panel; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#" + new THREE.Color(DISTRICTS.perps.colour).getHexString(); ctx.fillRect(0, h - 14, w, 14);
      ctx.fillStyle = q.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "700 48px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      ctx.fillText(BOARD[0], w / 2, 56, w - 60);
      ctx.font = "500 34px 'Atkinson Hyperlegible Next', Arial, sans-serif";
      const lines = ["Strike's rate on each sock.", "Green blows towards Perps: longs pay.", "Red blows back: shorts pay.", BOARD[2]];
      lines.forEach((line, i) => ctx.fillText(line, w / 2, 128 + i * 58, w - 60));
    });
    redraws.push(redraw);
    redraw(pal);
    for (const [z, ry] of [[0.1, 0], [-0.1, Math.PI]]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      plane.position.set(0, 1.9, z); plane.rotation.y = ry; grp.add(plane);
    }
    grp.add(box(3.4, 1.4, 0.12, M.build, 0, 1.2, 0));
    g.add(grp);
  }

  function apply(next) {
    map = next || null;
    for (const sock of socks) {
      const rates = map?.get(sock.symbol), rate = rates ? rates[sock.venue] : null;
      const st = sockState(rate ?? null);
      sock.target = st.fill; sock.dir = st.dir || 1; sock.tone = st.tone;
      if (sock.venue === "strike") sock.label.set(sockLabel(sock.symbol, rate ?? null));
    }
    colour();
    if (reduceMotion) { for (const sock of socks) sock.fill = sock.target; lastT = null; pose(0); }
  }
  g.userData = {
    apply,
    recolour: (p) => { pal = p; },
    state: () => ({ map, fills: socks.map((s) => +s.fill.toFixed(3)) }),
  };
  apply(null);
  if (!reduceMotion) animated.push((t) => pose(t));
  scene.add(g);
  return g;
}
