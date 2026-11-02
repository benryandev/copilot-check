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
// pushHistory: false re-mounts on a popstate (Forward after Back), where the entry already exists.
export async function mountGuide(url, { fetch, parse, mount, history, worldUrl, pushHistory = true }) {
  let got;
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return { navigate: url };
    got = extractMain(await res.text(), parse);
  } catch { return { navigate: url }; }
  if (!got) return { navigate: url };
  mount(got.title, got.main);
  if (pushHistory) {
    const state = { guide: url, worldUrl: history.state?.worldUrl || worldUrl };
    if (history.state?.guide) history.replaceState(state, "", url);
    else history.pushState(state, "", url);
  }
  return { ok: true };
}

export function closeGuide({ history }) {
  if (history.state?.guide) history.back();
}

// Back with a guide open closes it; Forward onto a guide entry with the sheet closed reopens that guide
export function onPopState(state, { isOpen, close, restoreTitle, open }) {
  if (state?.guide) { if (!isOpen() && open) open(state.guide); return; }
  if (!isOpen()) return;
  close();
  restoreTitle();
}

// What a link inside a mounted page is: another in-world page, a fragment on the same page (scroll inside the
// sheet, no navigation), an external site, or anything else (left alone, a normal navigation)
export function classifyLink(href, pageUrl) {
  let u, at;
  try { u = new URL(href, pageUrl); at = new URL(pageUrl); } catch { return "plain"; }
  if (u.origin !== at.origin) return "external";
  if (u.hash && u.pathname === at.pathname && u.search === at.search) return "anchor";
  if (isInWorldPath(u.pathname)) return "guide";
  if (u.pathname === "/ecosystem/" && (u.searchParams.has("stop") || u.searchParams.has("district"))) return "drive"; // a deep link: the visitor is already in the world, so drive, don't reload
  return "plain";
}

// Inside a mounted article: in-world links open in the sheet, the Drive there button goes (the visitor is already
// here), external links open in a new tab, the page's own skip link and theme toggle go.
export function rewriteLinks(root, pageUrl) {
  root.querySelectorAll(".guide-drive, .skip, #theme-toggle, .stops-actions").forEach((el) => el.remove());
  for (const a of root.querySelectorAll("a[href]")) {
    const kind = classifyLink(a.getAttribute("href"), pageUrl);
    if (kind === "guide") a.setAttribute("data-guide-link", "");
    else if (kind === "anchor") a.setAttribute("data-guide-anchor", new URL(a.getAttribute("href"), pageUrl).hash.slice(1));
    else if (kind === "drive") a.setAttribute("data-guide-drive", new URL(a.getAttribute("href"), pageUrl).search);
    else if (kind === "external") { a.target = "_blank"; a.rel = "noopener"; }
  }
}
