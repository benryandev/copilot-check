// The touch steering stick: one pad on the left of the touch bar with a knob that follows the thumb. The point where
// the thumb lands is neutral, so it never matters where on the pad it lands (IBuyTheTop's thumb kept finding the gap
// between the two old buttons); dragging left or right from there steers in proportion (stick-math.js), and lifting
// off returns to straight. Pointer capture keeps a wandering thumb steering; a cancel, a lost capture or a window blur
// (releaseKeys in main.js) releases it. Gas and brake stay as the buttons on the right.
import { STICK, stickValue, knobOffset } from "./stick-math.js";

/** Wires the stick element; while it is held `keys.steer` is a number (left positive), otherwise null. */
export function initStick(el, keys, { travel = STICK.travel, dead = STICK.dead } = {}) {
  const knob = el.querySelector(".stick-knob");
  const opts = { travel, dead };
  let held = null; // { id, x0 }: the pointer that holds the stick and where it landed
  const maxPx = () => (el.clientWidth - knob.offsetWidth) / 2 - 2; // the knob stays inside the pad
  const set = (v) => {
    keys.steer = v;
    el.style.setProperty("--stick-x", `${knobOffset(v, maxPx())}px`);
    el.setAttribute("aria-valuenow", v.toFixed(2));
    el.setAttribute("aria-valuetext", v === 0 ? "straight" : `${v > 0 ? "left" : "right"} ${Math.round(Math.abs(v) * 100)}%`);
  };
  const release = () => {
    held = null;
    keys.steer = null;
    el.classList.remove("is-down");
    el.style.setProperty("--stick-x", "0px");
    el.setAttribute("aria-valuenow", "0");
    el.setAttribute("aria-valuetext", "straight");
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    held = { id: e.pointerId, x0: e.clientX };
    el.classList.add("is-down");
    set(0);
  });
  el.addEventListener("pointermove", (e) => {
    if (held && e.pointerId === held.id) set(stickValue(e.clientX - held.x0, opts));
  });
  for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(ev, (e) => { if (held && e.pointerId === held.id) release(); });
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  return { release };
}
