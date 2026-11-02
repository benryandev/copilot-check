// Guides inside the world (workstream C): "Read the guide" fetches the guide's own page (same origin), mounts its
// <main> in the #guide sheet and pushes the guide's URL, so sharing and Back behave like a normal site; Back or Close
// returns to the pad and the world's URL without a reload. Works for the guides index and the stops page too.
// No three.js, no DOM at module level: the browser pieces are injected, so qa/guide-sheet-unit.mjs runs in node.

const IN_WORLD = [/^\/ecosystem\/guides\/(?!img\/)[a-z0-9-]*\/?$/, /^\/ecosystem\/stops\/$/];
export const isInWorldPath = (pathname) => IN_WORLD.some((re) => re.test(pathname));

// The page's title (before " · ") and its <main>; null when the document has no main to show
export function extractMain(html, parse) {
  const doc = parse(html);
  const main = doc.querySelector("main");
  if (!main) return null;
  const title = (doc.querySelector("title")?.textContent || "").split(" · ")[0].trim();
  return { title, main };
}

// Fetch and mount; on any failure the caller navigates instead (never an empty sheet). A second guide opened from
// inside the first replaces the entry, so Back returns to the world, not to the previous guide.
export async function mountGuide(url, { fetch, parse, mount, history, worldUrl }) {
  let got;
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return { navigate: url };
    got = extractMain(await res.text(), parse);
  } catch { return { navigate: url }; }
  if (!got) return { navigate: url };
  mount(got.title, got.main);
  const state = { guide: url, worldUrl: history.state?.worldUrl || worldUrl };
  if (history.state?.guide) history.replaceState(state, "", url);
  else history.pushState(state, "", url);
  return { ok: true };
}

export function closeGuide({ history }) {
  if (history.state?.guide) history.back();
}

export function onPopState(state, { isOpen, close, restoreTitle }) {
  if (state?.guide) return;
  if (!isOpen()) return;
  close();
  restoreTitle();
}

// Inside a mounted article: in-world links open in the sheet, the Drive there button goes (the visitor is already
// here), external links open in a new tab, the page's own skip link and theme toggle go.
export function rewriteLinks(root, origin) {
  root.querySelectorAll(".guide-drive, .skip, #theme-toggle, .stops-actions").forEach((el) => el.remove());
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    let u;
    try { u = new URL(href, origin); } catch { continue; }
    if (u.origin === origin && isInWorldPath(u.pathname)) a.setAttribute("data-guide-link", "");
    else if (u.origin !== origin) { a.target = "_blank"; a.rel = "noopener"; }
  }
}
