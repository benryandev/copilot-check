// Emotes: press E (or the smiley on the touch controls) for a row of five gestures; the one you pick shows in a speech
// bubble over your car for three seconds and goes to the room, so everyone near you sees it over your car too. Bubbles
// are sprites, so they face whoever is looking.
import * as THREE from "../vendor/three.module.min.js";
import { EMOTES, emoteKey, bubblePose } from "./emote-math.js";

const $ = (id) => document.getElementById(id);
const SIZE = 2.6; // metres across at full size
let hooks = {}; // { send(e), myGroup, groupFor(id) }
const textures = [];
const active = new Map(); // "me" or a peer id → { sprite, group, start, e }
let open = false, sel = 0, buttons = [];

function texFor(e) {
  if (textures[e]) return textures[e];
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(18, 14, 220, 186, 46);
  ctx.fill();
  ctx.beginPath(); // the tail, bottom centre
  ctx.moveTo(104, 196); ctx.lineTo(128, 246); ctx.lineTo(152, 196); ctx.closePath();
  ctx.fill();
  ctx.font = "132px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111111";
  ctx.fillText(EMOTES[e].char, 128, 112);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures[e] = tex;
  return tex;
}

export function initEmotes(h) {
  hooks = h;
  const row = $("emote-row");
  buttons = EMOTES.map((em, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = em.char;
    b.title = `${em.label} (${i + 1})`;
    b.setAttribute("aria-label", em.label);
    b.addEventListener("click", () => pick(i));
    b.addEventListener("pointerenter", () => select(i));
    row.append(b);
    return b;
  });
  $("emote-chip")?.addEventListener("click", toggleEmotes);
  EMOTES.forEach((_, i) => texFor(i)); // painted once, up front, so the first pick costs nothing
}

export const emotesOpen = () => open;
export function openEmotes() { open = true; $("emote-row").hidden = false; select(sel); }
export function closeEmotes() { open = false; $("emote-row").hidden = true; }
export function toggleEmotes() { if (open) closeEmotes(); else openEmotes(); }
function select(i) { sel = (i + EMOTES.length) % EMOTES.length; buttons.forEach((b, k) => b.classList.toggle("is-selected", k === sel)); }

/** A keydown while the row is open. True when it was for the row. */
export function emoteKeydown(e) {
  if (!open) return false;
  const k = emoteKey(e.code);
  if (k >= 0) { pick(k); return true; }
  if (e.code === "ArrowLeft" || e.code === "KeyA") { select(sel - 1); return true; }
  if (e.code === "ArrowRight" || e.code === "KeyD") { select(sel + 1); return true; }
  if (e.code === "Enter" || e.code === "Space") { pick(sel); return true; }
  if (e.code === "Escape" || e.code === "KeyE") { closeEmotes(); return true; }
  return false;
}

function pick(i) {
  closeEmotes();
  showBubble("me", i);
  hooks.send?.(i);
}

/** A bubble over a car: "me" for the player's own, otherwise a peer id. A new one replaces the old. */
export function showBubble(key, e) {
  if (!Number.isInteger(e) || e < 0 || e >= EMOTES.length) return;
  const group = key === "me" ? hooks.myGroup : hooks.groupFor?.(key);
  if (!group) return;
  drop(key);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFor(e), depthWrite: false, depthTest: false, transparent: true }));
  sprite.center.set(0.5, 0); // grows up from the tail
  sprite.position.y = key === "me" ? 2.4 : 4.1; // over the name tag on someone else's car
  sprite.renderOrder = 6;
  sprite.scale.set(0.01, 0.01, 1);
  group.add(sprite);
  active.set(key, { sprite, group, start: performance.now(), e });
}
function drop(key) {
  const b = active.get(key);
  if (!b) return;
  b.group.remove(b.sprite);
  b.sprite.material.dispose();
  active.delete(key);
}

/** Every frame: the pop and the fade; done bubbles go. */
export function emoteTick(now = performance.now()) {
  for (const [key, b] of active) {
    const p = bubblePose(now - b.start);
    if (!p) { drop(key); continue; }
    b.sprite.scale.set(SIZE * p.scale, SIZE * p.scale, 1);
    b.sprite.material.opacity = p.alpha;
  }
}

export const activeEmotes = () => [...active].map(([id, b]) => ({ id, e: b.e }));
