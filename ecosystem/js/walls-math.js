// Where the tyre walls stand and how they group into solid pieces. Pure: the world (raceway.js) and the
// lap simulator both read it, so the tool and the world agree on the walls.

// Spots every `step` m: "auto" walls the outside of any turn tighter than a 34 m radius; a list walls
// the listed sides between `from` and `to`. Returns [{ s, side, x, z, fx, fz }].
export function wallSpots(track, step = 1) {
  const spots = [];
  if (track.walls === "auto") {
    const off = track.half + 3;
    for (let s = 0; s < Math.floor(track.len); s += step) {
      const a = track.at(s - 4), b = track.at(s + 4);
      const turn = Math.asin(Math.max(-1, Math.min(1, a.fx * b.fz - a.fz * b.fx)));
      if (Math.abs(turn) / 8 < 1 / 34) continue; // gentler than a 34 m radius: no wall
      const p = track.at(s);
      // Inside of the corner is the way the track turns; the wall goes on the other side
      const ix = b.fx - a.fx, iz = b.fz - a.fz;
      const side = ix * p.rx + iz * p.rz > 0 ? -1 : 1;
      spots.push({ s, side, x: p.x + p.rx * off * side, z: p.z + p.rz * off * side, fx: p.fx, fz: p.fz });
    }
  } else if (Array.isArray(track.walls)) {
    const off = track.half + 1.2;
    for (const w of track.walls) {
      for (const side of w.sides ?? [-1, 1]) {
        for (let s = w.from; s <= w.to + 1e-9; s += step) {
          const p = track.at(s);
          spots.push({ s, side, x: p.x + p.rx * off * side, z: p.z + p.rz * off * side, fx: p.fx, fz: p.fz });
        }
      }
    }
  }
  return spots;
}

// Pieces of four tyres, each turned along the track; a run longer than 6 m or shorter than two is one box per tyre.
export function wallBoxes(spots) {
  const boxes = [];
  for (let i = 0; i < spots.length; i += 4) {
    const run = spots.slice(i, i + 4);
    if (run.length < 2 || Math.abs(run.at(-1).s - run[0].s) > 6) {
      for (const p of run) boxes.push({ cx: p.x, cz: p.z, hx: 0.5, hz: 0.5, yaw: 0 });
      continue;
    }
    const cx = run.reduce((t, p) => t + p.x, 0) / run.length, cz = run.reduce((t, p) => t + p.z, 0) / run.length;
    const dx = run.at(-1).x - run[0].x, dz = run.at(-1).z - run[0].z;
    boxes.push({ cx, cz, hx: Math.hypot(dx, dz) / 2 + 0.5, hz: 0.5, yaw: Math.atan2(-dz, dx) });
  }
  return boxes;
}
