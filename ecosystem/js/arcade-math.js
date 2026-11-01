// The arcade cabinet's pure parts: messages from the game frame, the marquee line, the frame's URL. No DOM, no three.js.

const KINDS = { "arcade.run": "run", "arcade.board": "board", "arcade.close": "close" };
const SLUG = /^[a-z0-9-]{1,40}$/;
const row = (r) => (r && typeof r === "object" && typeof r.name === "string" && Number.isFinite(r.score)
  ? { name: r.name, score: r.score, level: Number.isFinite(r.level) ? r.level : null, won: !!r.won } : null);

/** A message posted by a game frame, or null when it is not one we take. */
export function parseArcadeMessage(d) {
  if (!d || typeof d !== "object" || typeof d.game !== "string" || !SLUG.test(d.game)) return null;
  const t = KINDS[d.t];
  if (!t) return null;
  if (t === "close") return { t, game: d.game };
  if (t === "board") return { t, game: d.game, top: Array.isArray(d.top) ? d.top.map(row).filter(Boolean) : [] };
  if (!Number.isFinite(d.score) || !Number.isFinite(d.level)) return null;
  return { t, game: d.game, score: d.score, level: d.level, won: !!d.won };
}

/** What the cabinet's marquee says: the top score, or an invitation. Names are shortened to fit the sign. */
export function marqueeText(top) {
  const r = Array.isArray(top) ? top[0] : null;
  if (!r) return "INSERT COIN";
  let name = String(r.name).toUpperCase();
  if (name.length > 12) name = name.slice(0, 11).trimEnd() + "…";
  return `TOP  ${name}  ${r.score}`;
}

/** Where a cabinet's game lives, with the world's theme passed along. */
export function frameUrl(slug, dark) {
  if (!SLUG.test(slug)) throw new Error("bad arcade slug");
  return `/ecosystem/arcade/${slug}/?theme=${dark ? "dark" : "light"}`;
}
