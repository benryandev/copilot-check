// The board zoom's camera maths, kept free of three.js so it can be tested in node.
// A takeover like the jump's side-on camera (stunt-math.js): the camera eases to a spot in front of the Raceway's
// top 10 board that fits the whole board in the viewport, looking at its centre, while the car stays where it is.
export const FOCUS = { in: 0.9, out: 0.6, margin: 1.15, near: 20, still: 0.5 }; // s to blend in and out; the frame's margin; the prompt's zone in m and its "still" speed in m/s

/** How far in front of a w × h m plane a camera with a vertical field of view of fovDeg must stand to fit all of it.
 * `bandShare` is the share of the viewport's height the plane may use (the band above the Save and Back bar). */
export function frameDistance(w, h, fovDeg, aspect, margin = FOCUS.margin, bandShare = 1) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.max(h / 2 / t / bandShare, w / 2 / (t * aspect)) * margin;
}

/** Where the camera stands and looks for a board { x, y, z, fx, fz, w, h } (its centre, unit facing in xz, size in m).
 * With a bar `inset` px tall at the bottom of a viewport `viewH` px tall, the board is framed in the band above the
 * bar: the distance grows so the board fits the band, and the camera and the look drop together so it centres there. */
export function focusPose(board, fovDeg, aspect, { inset = 0, viewH = 0 } = {}) {
  const share = viewH > 0 && inset > 0 ? Math.max(0.3, (viewH - inset) / viewH) : 1;
  const d = frameDistance(board.w, board.h, fovDeg, aspect, FOCUS.margin, share);
  const drop = (1 - share) * d * Math.tan((fovDeg * Math.PI) / 360);
  const y = board.y - drop;
  return { cam: { x: board.x + board.fx * d, y, z: board.z + board.fz * d }, look: { x: board.x, y, z: board.z } };
}

/** Blend 0..1: rises while the zoom is on, falls once it ends. */
export const focusBlend = (k, dt, on) => (on ? Math.min(1, k + dt / FOCUS.in) : Math.max(0, k - dt / FOCUS.out));

// The marker (Ben, 4 Nov 2026): a pad-style ring in front of the board, so the zoom is found by driving into it
// rather than by parking nearby by chance
export const MARKER = { ahead: 10, r: 3 }; // m in front of the board's centre; the ring's radius, the pads' own
/** Where the marker stands: `ahead` m in front of the board's centre, on the ground. */
export const markerPos = (board, ahead = MARKER.ahead) => ({ x: board.x + board.fx * ahead, z: board.z + board.fz * ahead });
/** True when a position is on or inside the marker's ring. */
export const atMarker = (pos, m, r = MARKER.r) => Math.hypot(pos.x - m.x, pos.z - m.z) <= r;

// The infield is not level (a flat ring there sat half sunk, half floating, Ben's screenshot of 4 Nov 2026), so the
// marker's ring and disc are draped over the terrain point by point: `heightAt(x, z)` is the ground, `lift` the gap
// above it. Both return world positions as x y z triples and triangle indices for a BufferGeometry.
export function drapedRing(cx, cz, rIn, rOut, segments, heightAt, lift = 0) {
  const positions = [], indices = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (const r of [rIn, rOut]) { const x = cx + c * r, z = cz + s * r; positions.push(x, heightAt(x, z) + lift, z); }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = ((i + 1) % segments) * 2, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { positions, indices };
}
export function drapedDisc(cx, cz, r, segments, heightAt, lift = 0) {
  const positions = [cx, heightAt(cx, cz) + lift, cz], indices = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    positions.push(x, heightAt(x, z) + lift, z);
  }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + ((i + 1) % segments));
  return { positions, indices };
}

/** True when a position is within `near` m of the board's centre and on its printed side. */
export function nearBoard(pos, board, near = FOCUS.near) {
  const dx = pos.x - board.x, dz = pos.z - board.z;
  return Math.hypot(dx, dz) <= near && dx * board.fx + dz * board.fz > 0;
}
