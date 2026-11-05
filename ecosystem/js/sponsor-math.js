// A track's sponsor on its gantry, gates and top 10 board, and its dressing. Plain data: no three.js, no DOM, so node can test it.
// A sponsor is { name, logo, colour } or null. Only RealFi has a logo asset (img/realfi-logo.svg); any other sponsor,
// or none, gets plain colours and no logo.
const REALFI = { band: "#032327", accent: "#0fb89c", paper: "#fafafa" }; // as build.js's REALFI
const PLAIN = { band: "#1b1f24", paper: "#fafafa" };
const hex = (c) => "#" + c.toString(16).padStart(6, "0");

/** The board's header text: the hub's "RACEWAY TOP 10" under a sponsor, a plain "TOP 10" without one. */
export const boardHeader = (sponsor) => (sponsor ? "RACEWAY TOP 10" : "TOP 10");

/** The banner colours and whether to draw the logo. `colour` is the accent when there is no RealFi sponsor. */
export function brandFor(sponsor, colour = sponsor?.colour ?? 0x9aa4ad) {
  if (sponsor?.logo === "realfi") return { ...REALFI, logo: true };
  return { band: PLAIN.band, accent: hex(colour), paper: PLAIN.paper, logo: false };
}

/** The Raceway's things to knock about (raceway.js buildProps places them), in the order they are placed: RealFi crates in
 * stacks of three outside the gantry and through the S-bend's chicane, cones leading into each chicane stack, bales on the
 * inside of both hairpins. Every s is the Raceway's own, so they are its sponsor's dressing: a track with no sponsor gets
 * none (plan 5 amendment 2, ruling R4: no crates on the Lagoon). Each is { kind, s, v, yaw, lift }: v the signed offset from
 * the centreline (+ the track's right), yaw added to the track's heading there, lift off the ground. */
export function racewayProps(track) {
  if (!track?.sponsor) return [];
  const out = [], h = track.half;
  const stack = (s, v) => {
    for (const k of [-0.65, 0.65]) out.push({ kind: "crate", s, v: v + k, yaw: 0, lift: 0 });
    out.push({ kind: "crate", s, v, yaw: 0.3, lift: 1.2 });
  };
  for (const v of [-(h + 4), h + 4]) stack(8, v); // either side of the start, outside the gantry
  [[352, -3.2], [374, 3.2], [396, -3.2]].forEach(([s, v]) => { // the chicane through the S-bend: stacks on alternate sides, cones leading in
    stack(s, v);
    for (const k of [6, 10]) out.push({ kind: "cone", s: s - k, v: v * 1.25, yaw: 0, lift: 0 });
  });
  for (const s of [205, 213, 221, 544, 552, 560]) { // bales on the inside of both hairpins
    const a = track.at(s - 4), b = track.at(s + 4), p = track.at(s);
    const inner = (b.fx - a.fx) * p.rx + (b.fz - a.fz) * p.rz > 0 ? 1 : -1;
    out.push({ kind: "bale", s, v: inner * (h + 1.6), yaw: 0, lift: 0 });
  }
  return out;
}
