// Deep links into the world (no three.js): ?stop=<key> opens the world at that pad with its sheet open,
// ?district=<key> arrives at the district's plaza. Query flags like ?arrive, ?mp and ?mix; the hash stays
// for #owner=. Unit tests: qa/deeplink-unit.mjs. Keys are validated before any lookup.

export const BAD_KEY = /[^a-z0-9-]/;

// What a URL asks for: a stop, a district, the raceway's start line, or nothing (unknown keys are ignored
// so a stale link still gives a normal visit). `stop` wins when both are present.
export function parseDeepLink(search, stopKeys, districtKeys) {
  const q = new URLSearchParams(search);
  const clean = (v) => (v && !BAD_KEY.test(v) ? v : null);
  const stop = clean(q.get("stop")), district = clean(q.get("district"));
  if (stop === "raceway" || (!stop && district === "raceway")) return { kind: "start", key: "raceway" };
  if (stop && stopKeys.includes(stop)) return { kind: "stop", key: stop };
  if (district && districtKeys.includes(district)) return { kind: "district", key: district };
  return { kind: null, key: null };
}

export const stopUrl = (origin, key) => `${origin}/ecosystem/?stop=${encodeURIComponent(key)}`;
