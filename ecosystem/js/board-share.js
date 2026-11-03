// Save the board: the Raceway's top 10 as a PNG, composed from the canvas the board is already drawn on, with a band
// underneath naming the board, the day and the site. Offered through the phone's share sheet when files can be shared,
// and as a download otherwise. No three.js and no DOM until a function is called, so node can test the caption.
export const SITE = "strike.benryan.com.au/ecosystem";
export const BAND = 110; // px under the board

/** One plain sentence for the band: the board, the day and the site. */
export function shareCaption(date = new Date()) {
  const day = date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  return `RealFi Raceway top 10 on ${day} at ${SITE}`;
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
  ctx.fillStyle = ink;
  ctx.font = "500 44px 'Geist Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(caption, c.width / 2, board.height + BAND / 2, c.width - 80);
  return c;
}

/** Offers the image: "shared" through the share sheet, "saved" as a download, "cancelled" when the person backs out of the sheet. */
export async function shareBoard(canvas, title = "RealFi Raceway top 10", name = "raceway-top-10.png") {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return "shared"; }
    catch (e) { if (e?.name === "AbortError") return "cancelled"; } // any other refusal falls through to the download
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return "saved";
}
