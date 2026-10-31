// Project submission form: checks the fields here (the worker checks them again), then posts them to
// the Copilot Watch worker, which stores them privately and alerts Ben on Telegram.
const API = "https://copilot-watch.benryan.workers.dev/submit";
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const loadedAt = Date.now();

// ── Theme toggle, as on the other Copilot Check pages ──────────────────
{
  const t = $("theme-toggle");
  const sync = () => {
    const d = root.classList.contains("dark");
    t.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode");
    t.querySelector(".theme-toggle-path").setAttribute("d", d ? "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" : "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z");
  };
  t.addEventListener("click", () => {
    const d = !root.classList.contains("dark");
    root.classList.toggle("dark", d);
    root.classList.toggle("light", !d);
    sync();
    try { localStorage.setItem("theme", d ? "dark" : "light"); } catch { /* blocked */ }
  });
  sync();
}

const form = $("submit-form");
const isUpdate = () => form.elements.type.value === "update";
form.addEventListener("change", (e) => {
  if (e.target.name === "type") $("f-listing").hidden = !isUpdate();
});

// ── Checks (same limits as the worker) ─────────────────────────────────
const len = (s) => [...s].length;
const httpsUrl = (raw) => {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") && u.href.length <= 200 ? u : null;
  } catch { return null; }
};
const xHandle = (raw) => /^(?:(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/)?@?[A-Za-z0-9_]{1,15}\/?$/i.test(raw.trim());
const text = (id, min, max, what) => () => {
  const n = len(form.elements[id].value.trim());
  if (!n && min) return `Add ${what}.`;
  if (n && n < min) return `That's ${n} characters. It needs at least ${min}.`;
  if (n > max) return `That's ${n} characters. The limit is ${max}.`;
  return "";
};
const CHECKS = {
  listing: () => (isUpdate() && !form.elements.listing.value.trim() ? "Say which listing this updates." : ""),
  name: text("name", 2, 40, "the project's name"),
  tagline: text("tagline", 10, 100, "a one-line description"),
  category: () => (form.elements.category.value ? "" : "Choose a category."),
  uses: () => (form.querySelectorAll('[name="uses"]:checked').length ? "" : "Tick at least one way it uses Strike."),
  description: text("description", 30, 800, "how it works"),
  site: () => (httpsUrl(form.elements.site.value) ? "" : "Add the website's address, starting https://"),
  x: () => (!form.elements.x.value.trim() || xHandle(form.elements.x.value) ? "" : "That doesn't look like an X handle. Try @name."),
  github: () => {
    const v = form.elements.github.value;
    if (!v.trim()) return "";
    const u = httpsUrl(v);
    return u && u.hostname === "github.com" ? "" : "Use a github.com link, or leave it blank.";
  },
  logo: () => (!form.elements.logo.value.trim() || httpsUrl(form.elements.logo.value) ? "" : "Use an https link to the image, or leave it blank."),
  contact: text("contact", 3, 100, "a way to reach you"),
  notes: text("notes", 0, 400, ""),
  permission: () => ($("permission").checked ? "" : "Tick this to confirm you can list the project."),
};
// The element that shows a field's error, and the control that gets focus
const box = (k) => $(`f-${k}`);
const control = (k) => (k === "uses" ? form.querySelector('[name="uses"]') : k === "type" ? form.querySelector('[name="type"]') : $(k));

function setError(k, msg) {
  const b = box(k);
  let p = $(`${k}-err`);
  const c = control(k);
  const target = k === "uses" ? b : c;
  if (!msg) {
    p?.remove();
    target.removeAttribute("aria-invalid");
    if (k === "uses") b.removeAttribute("aria-describedby");
    else c.setAttribute("aria-describedby", (c.getAttribute("aria-describedby") || "").replace(`${k}-err`, "").trim());
    return;
  }
  if (!p) {
    p = Object.assign(document.createElement("p"), { id: `${k}-err`, className: "field-error" });
    b.append(p);
  }
  p.textContent = msg;
  target.setAttribute("aria-invalid", "true");
  if (k === "uses") b.setAttribute("aria-describedby", p.id);
  else if (!(c.getAttribute("aria-describedby") || "").includes(p.id)) c.setAttribute("aria-describedby", `${c.getAttribute("aria-describedby") || ""} ${p.id}`.trim());
}
// Once a field has shown an error, re-check it as it changes
form.addEventListener("input", (e) => {
  const k = e.target.name;
  if (CHECKS[k] && $(`${k}-err`)) setError(k, CHECKS[k]());
});
form.addEventListener("change", (e) => {
  const k = e.target.name;
  if (CHECKS[k] && $(`${k}-err`)) setError(k, CHECKS[k]());
});

// ── Send ───────────────────────────────────────────────────────────────
const SERVER = {
  rate: "That's a few submissions from here in the last hour. Please try again later.",
  busy: "Lots of submissions today. Please try again tomorrow.",
  origin: "Submissions only work from strike.benryan.com.au.",
  too_large: "That's too long to send. Shorten the longer fields and try again.",
};
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("status");
  let first = null;
  for (const [k, check] of Object.entries(CHECKS)) {
    const msg = check();
    setError(k, msg);
    if (msg && !first) first = k;
  }
  if (first) {
    status.textContent = "Check the highlighted fields.";
    control(first).focus();
    return;
  }
  const v = (k) => form.elements[k].value.trim();
  const body = {
    type: isUpdate() ? "update" : "new",
    listing: isUpdate() ? v("listing") : "",
    name: v("name"), tagline: v("tagline"), category: v("category"),
    uses: [...form.querySelectorAll('[name="uses"]:checked')].map((c) => c.value),
    description: v("description"), site: v("site"), x: v("x"), github: v("github"), logo: v("logo"),
    contact: v("contact"), notes: v("notes"), permission: $("permission").checked,
    company: form.elements.company.value, elapsed: Date.now() - loadedAt,
  };
  const btn = $("send");
  btn.disabled = true;
  status.textContent = "Sending…";
  try {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (res.ok && out.ok) {
      form.hidden = true;
      $("done-ref").textContent = out.id ? `Reference: ${out.id}` : "";
      $("done").hidden = false;
      $("done").focus();
      return;
    }
    if (out.error === "bad_field" && CHECKS[out.field]) {
      setError(out.field, "This didn't pass the check. Have another look.");
      status.textContent = "Check the highlighted field.";
      control(out.field).focus();
    } else {
      status.textContent = SERVER[out.error] || "That didn't go through. Please try again in a minute.";
    }
  } catch {
    status.textContent = "Couldn't reach the server. Check your connection and try again.";
  } finally {
    btn.disabled = false;
  }
});
