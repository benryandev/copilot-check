// A track's sponsor on its gantry, gates and top 10 board. Plain data: no three.js, no DOM, so node can test it.
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
