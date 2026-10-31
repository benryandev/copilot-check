// Cobbled plazas: a seamless tile of setts painted on a canvas (colour and relief), repeated in world metres across
// every plaza disc, so the squares under the districts read as paved ground instead of a flat colour. Repainted on
// theme change: warm sandstone by day, dark slate by night. No files to download, like everything else here.

import * as THREE from "../vendor/three.module.min.js";

export const TILE_M = 6; // one canvas tile covers this many metres
const PX = 512;
const STONE = 0.44, GAP = 0.07; // metres: sett size and mortar joint

// Deterministic jitter so the tile looks the same on every visit and in every QA shot
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const hex = (c) => "#" + new THREE.Color(c).getHexString();
const mix = (a, b, t) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

function stones() {
  // Offset rows of slightly irregular setts; each stone is placed once but drawn with wrap copies so the tile is seamless
  const r = rng(20261031);
  const pitch = STONE + GAP;
  const cols = Math.round(TILE_M / pitch), rows = Math.round(TILE_M / pitch);
  const px = PX / TILE_M; // pixels per metre
  const out = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i + (j % 2 ? 0.5 : 0)) * (TILE_M / cols), y = j * (TILE_M / rows);
      const w = STONE * (0.92 + r() * 0.16), h = STONE * (0.92 + r() * 0.16);
      out.push({ x: (x + r() * 0.03) * px, y: (y + r() * 0.03) * px, w: w * px, h: h * px, tone: r(), rot: (r() - 0.5) * 0.08 });
    }
  }
  return out;
}
const SETTS = stones();

function paint(ctx, p, relief) {
  const w = PX, h = PX;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = relief ? "#5a5a5a" : hex(p.mortar);
  ctx.fillRect(0, 0, w, h);
  const r = Math.round(0.08 * (PX / TILE_M));
  for (const s of SETTS) {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const cx = s.x + s.w / 2 + dx, cy = s.y + s.h / 2 + dy;
      if (cx < -s.w || cx > w + s.w || cy < -s.h || cy > h + s.h) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(s.rot);
      if (relief) {
        // Height: stone tops light, a darker rim so each sett reads as a slightly domed block
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(s.w, s.h) * 0.6);
        g.addColorStop(0, "#d8d8d8");
        g.addColorStop(0.75, "#bdbdbd");
        g.addColorStop(1, "#8a8a8a");
        ctx.fillStyle = g;
      } else {
        const base = mix(p.cobbleA, p.cobbleB, s.tone);
        const g = ctx.createLinearGradient(-s.w / 2, -s.h / 2, s.w / 2, s.h / 2);
        g.addColorStop(0, mix(base, "#ffffff", 0.08));
        g.addColorStop(1, mix(base, "#000000", 0.08));
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, r);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** The shared cobble maps and a repaint(palette) for theme changes. Palette needs cobbleA, cobbleB, mortar. */
export function createCobbles(palette) {
  const make = () => {
    const c = document.createElement("canvas");
    c.width = c.height = PX;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return { c, tex };
  };
  const colour = make(), relief = make();
  colour.tex.colorSpace = THREE.SRGBColorSpace;
  const repaint = (p) => {
    paint(colour.c.getContext("2d"), p, false);
    paint(relief.c.getContext("2d"), p, true);
    colour.tex.needsUpdate = relief.tex.needsUpdate = true;
  };
  repaint(palette);
  return { map: colour.tex, bump: relief.tex, repaint };
}

/** Give a flat geometry UVs in world metres (one tile per TILE_M), so setts are the same size on every plaza. */
export function metreUVs(geometry) {
  const pos = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / TILE_M, pos.getY(i) / TILE_M);
  uv.needsUpdate = true;
}
