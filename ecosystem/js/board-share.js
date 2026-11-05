// Save the board: a track's top 10 as a PNG, composed from the canvas the board is already drawn on, with a band
// underneath naming the board, the day and the site. Offered through the share sheet on a touch screen (a phone or a
// tablet) and as a download everywhere else, since a desktop's share sheet has no "save". No three.js and no DOM until
// a function is called, so node can test the caption, the fit and the branching.
export const SITE = "strike.benryan.com.au/ecosystem";
export const BAND = 110; // px under the board
const FONT = { from: 44, to: 24 }; // px: the caption starts at 44 and steps down until it fits the band

/** One plain sentence for the band: the board (the track's name), the day and the site. */
export function shareCaption(trackName, date = new Date()) {
  const day = date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  return `${trackName} top 10 on ${day} at ${SITE}`;
}

/** The largest size from `from` down to `to` at which `widthAt(px)` fits `maxWidth`, else `to`. */
export function fitFont(widthAt, maxWidth, from = FONT.from, to = FONT.to) {
  for (let px = from; px > to; px--) if (widthAt(px) <= maxWidth) return px;
  return to;
}

/** A new canvas: the board as drawn, plus the band with the caption. The colours default to the board's own header. */
export function boardImage(board, caption, { band = "#032327", ink = "#fafafa" } = {}) {
  const c = document.createElement("canvas");
  c.width = board.width;
  c.height = board.height + BAND;
  const ctx = c.getContext("2d");
  ctx.drawImage(board, 0, 0);
  ctx.fillStyle = band;
  ctx.fillRect(0, board.height, c.width, BAND);
  const font = (px) => `500 ${px}px 'Geist Mono', monospace`;
  const px = fitFont((size) => { ctx.font = font(size); return ctx.measureText(caption).width; }, c.width - 80);
  ctx.font = font(px);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, c.width / 2, board.height + BAND / 2, c.width - 80);
  return c;
}

/** Offers the image: "shared" through the share sheet (touch screens only), "saved" as a download, "cancelled" when the
 * person backs out of the sheet. Any other refusal of the sheet falls back to the download. */
export async function shareBoard(canvas, { share = false, title = "Top 10", name = "raceway-top-10.png" } = {}) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], name, { type: "image/png" });
  if (share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)?.unref?.();
  return "saved";
}
