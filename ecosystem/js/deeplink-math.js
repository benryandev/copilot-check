// Deep links into the world (no three.js): ?stop=<key> opens the world at that pad with its sheet open,
// ?district=<key> arrives at the district's plaza (both hub-only), and ?start=1 puts the car on a track's grid: a
// venue page's own (the only deep link a venue honours, ruling R21), the RealFi Raceway's on the hub, as ?stop=raceway
// does. Query flags like ?arrive, ?mp and ?mix; the hash stays for #owner=. Unit tests: qa/deeplink-unit.mjs. Keys are
// validated before any lookup.

export const BAD_KEY = /[^a-z0-9-]/;

// What a URL asks for: a stop, a district, the raceway's start line, or nothing (unknown keys are ignored
// so a stale link still gives a normal visit). `stop` wins when both are present.
export function parseDeepLink(search, stopKeys, districtKeys) {
  const q = new URLSearchParams(search);
  const clean = (v) => (v && !BAD_KEY.test(v) ? v : null);
  const stop = clean(q.get("stop")), district = clean(q.get("district"));
  if (q.get("start") === "1") return { kind: "start", key: "start" }; // a venue's grid (the hub reads it as the Raceway's)
  if (stop === "raceway" || (!stop && district === "raceway")) return { kind: "start", key: "raceway" };
  if (stop && stopKeys.includes(stop)) return { kind: "stop", key: stop };
  if (district && districtKeys.includes(district)) return { kind: "district", key: district };
  return { kind: null, key: null };
}

// A venue page's slug from its own path, /ecosystem/tracks/<slug>/ (null for anything else)
export function venueSlug(pathname) {
  const m = /^\/ecosystem\/tracks\/([a-z0-9-]+)(?:\/(?:index\.html)?)?$/.exec(pathname);
  return m ? m[1] : null;
}

export const stopUrl = (origin, key) => `${origin}/ecosystem/?stop=${encodeURIComponent(key)}`;
