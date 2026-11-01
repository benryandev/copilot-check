// Tuning panel for the sound layers, for Ben's ear: on with ?mix=1, never otherwise. Sliders are trims on each
// layer (1 = as designed) and are remembered in localStorage (eco-mix-2); Copy puts the values on the clipboard.
export function mountMixer(sound) {
  const box = document.createElement("div");
  box.id = "mix";
  box.style.cssText = "position:fixed;left:12px;bottom:88px;z-index:50;background:rgba(20,22,26,.92);color:#fff;font:12px/1.4 ui-monospace,monospace;padding:10px 12px;border-radius:10px;width:220px;pointer-events:auto";
  const title = document.createElement("div"); title.textContent = "SOUND MIX (?mix=1)"; title.style.cssText = "letter-spacing:.08em;margin-bottom:6px;opacity:.7"; box.append(title);
  const rows = [];
  for (const k of sound.TRIM_KEYS) {
    const row = document.createElement("label"); row.style.cssText = "display:grid;grid-template-columns:58px 1fr 34px;gap:6px;align-items:center;margin:2px 0";
    const name = document.createElement("span"); name.textContent = k === "bed" ? "music" : k; // the "bed" trim drives the music now
    const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "2.5"; input.step = "0.05"; input.value = String(sound.trims()[k]); input.style.cssText = "width:100%;accent-color:#22c55e";
    const val = document.createElement("span"); val.textContent = Number(input.value).toFixed(2); val.style.textAlign = "right";
    input.addEventListener("input", () => { sound.setTrim(k, input.value); val.textContent = Number(input.value).toFixed(2); });
    input.addEventListener("keydown", (e) => e.stopPropagation()); // arrows tune the slider, not the car
    row.append(name, input, val); box.append(row); rows.push({ k, input, val });
  }
  const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:6px;margin-top:8px";
  const mk = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.style.cssText = "flex:1;font:inherit;padding:4px 6px;border-radius:6px;border:1px solid #555;background:#2a2d33;color:#fff;cursor:pointer"; b.addEventListener("click", fn); return b; };
  const out = document.createElement("textarea"); out.readOnly = true; out.rows = 3; out.style.cssText = "width:100%;margin-top:6px;font:11px ui-monospace,monospace;background:#111;color:#9f9;border:1px solid #333;border-radius:6px;display:none";
  actions.append(
    mk("Copy", async () => { const j = JSON.stringify(sound.trims()); out.value = j; out.style.display = "block"; try { await navigator.clipboard.writeText(j); } catch {} }),
    mk("Reset", () => { for (const r of rows) { sound.setTrim(r.k, 1); r.input.value = "1"; r.val.textContent = "1.00"; } out.style.display = "none"; }),
  );
  box.append(actions, out);
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
  document.body.append(box);
}
