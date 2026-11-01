// Emotes: the five gestures a driver can show over their car, the keys that pick them, and the bubble's pop and fade.
// No DOM, no three.js.

export const EMOTES = [
  { char: "👋", label: "Wave" },
  { char: "🎉", label: "Party" },
  { char: "🔥", label: "Fire" },
  { char: "🏁", label: "Race?" },
  { char: "👍", label: "Thumbs up" },
];
export const EMOTE_MS = 3000; // a bubble lives this long
const POP_MS = 160, FADE_MS = 500;

/** Which emote a key picks while the row is open: Digit1 to Digit5 (or the number pad) → 0 to 4; anything else → -1. */
export function emoteKey(code) {
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(String(code ?? ""));
  return m ? Number(m[1]) - 1 : -1;
}

/** The bubble at `age` ms: {scale, alpha}, or null once it is over. Pops past full size then settles; fades at the end. */
export function bubblePose(age) {
  const t = Math.max(0, age);
  if (t >= EMOTE_MS) return null;
  let scale = 1;
  if (t < POP_MS) {
    const u = t / POP_MS; // 0 → 1
    scale = Math.min(1, 0.2 + u * 1.3) + 0.18 * Math.sin(u * Math.PI); // quickly to full size, a bump past it, back to 1
  }
  const left = EMOTE_MS - t;
  const alpha = left < FADE_MS ? left / FADE_MS : 1;
  return { scale: Math.round(scale * 1000) / 1000, alpha: Math.round(alpha * 1000) / 1000 };
}
