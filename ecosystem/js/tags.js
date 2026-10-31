// Floating name tags: a sprite above a car painted with the theme's palette, repainted when the theme
// changes. The ghost wears one ("Ben  0:25.310") and so does every other visitor in the world.

import * as THREE from "../vendor/three.module.min.js";
import { canvasTexture, redraws, themePalette } from "./build.js";

/**
 * A name tag. `text()` returns what to show (called at every repaint); `colour` is the underline.
 * Returns { sprite, redraw, dispose }: add the sprite to the car's group; call redraw() after the
 * text changes; dispose() when the car goes.
 */
export function nameTag(text, { colour, width = 8, height = 1.5, y = 3.2 } = {}) {
  const bar = "#" + new THREE.Color(colour).getHexString();
  const tag = canvasTexture(1024, 192, (ctx, w, h, p) => {
    ctx.clearRect(0, 0, w, h);
    const t = text() || "";
    ctx.font = "600 84px 'Atkinson Hyperlegible Next', Arial, sans-serif";
    const tw = Math.min(w - 120, ctx.measureText(t).width);
    const pw = tw + 96;
    ctx.fillStyle = p.panel;
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.roundRect((w - pw) / 2, 30, pw, 132, 66);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = bar;
    ctx.fillRect((w - pw) / 2 + 56, 148, pw - 112, 8);
    ctx.fillStyle = p.text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(t, w / 2, 96, w - 120);
  });
  // The theme pass may have run before this was built: paint with the palette it used, then follow theme changes
  let pal = themePalette();
  const follow = (p) => { pal = p; tag.redraw(p); };
  redraws.push(follow);
  if (pal) tag.redraw(pal);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tag.tex, depthWrite: false, transparent: true }));
  sprite.scale.set(width, height, 1);
  sprite.position.y = y;
  sprite.renderOrder = 4;
  return {
    sprite,
    redraw: () => pal && tag.redraw(pal),
    dispose() {
      const i = redraws.indexOf(follow);
      if (i >= 0) redraws.splice(i, 1);
      tag.tex.dispose();
      sprite.material.dispose();
    },
  };
}
