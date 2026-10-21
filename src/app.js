// Copilot Check: form → fetch (in the browser, public APIs only) → report → view. Nothing is stored; the address
// goes in the URL hash so a report link can be shared.
import { HlBusyError } from '../core/http.js';

export const MIN_SIZE = 10, MAX_SIZE = 1_000_000;
const SIZE_MSG = 'Enter an account size from $10 to $1,000,000.';

/** Validate the two inputs. Accepts whitespace, upper-case hex and a trailing slash from a pasted URL. */
export function parseInputs(addrRaw, sizeRaw) {
  let a = String(addrRaw ?? '').trim().replace(/\/+$/, '');
  const fromUrl = a.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/); // e.g. a Hyperliquid explorer or Hyperdash link
  if (!/^0x[0-9a-fA-F]{40}$/.test(a) && fromUrl && /^https?:\/\//i.test(a)) a = fromUrl[0];
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
    const message = /^addr1/i.test(a) ? 'That\'s a Cardano (Strike) address. Paste the Hyperliquid wallet you\'re thinking of copying: 0x followed by 40 characters.'
      : /\.eth$/i.test(a) ? 'Names aren\'t looked up. Paste the 0x address itself.'
      : a ? 'A Hyperliquid wallet is 0x followed by 40 characters (0–9, a–f).' : 'Paste a Hyperliquid wallet address (0x…).';
    return { ok: false, field: 'addr', message };
  }
  const s = String(sizeRaw ?? '').trim().replace(/[$,\s]/g, '');
  if (s === '') return { ok: true, addr: a.toLowerCase(), size: 1000 };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, field: 'size', message: SIZE_MSG };
  const size = Number(s);
  if (!(size >= MIN_SIZE && size <= MAX_SIZE)) return { ok: false, field: 'size', message: SIZE_MSG };
  return { ok: true, addr: a.toLowerCase(), size };
}

/** Fee input in percent → rate per side (0.05 → 0.0005). Out-of-range falls back to Strike's base fee. */
export function parseFee(raw) {
  const v = Number(String(raw ?? '').trim().replace('%', ''));
  return Number.isFinite(v) && v >= 0 && v <= 1 ? Number((v / 100).toFixed(8)) : 0.0005;
}

export function errorText(e) {
  if (e instanceof HlBusyError || e?.name === 'HlBusyError') return 'Hyperliquid is busy. Try again in a minute.';
  if (e instanceof TypeError || /fetch|network/i.test(String(e?.message))) return 'Couldn\'t reach Hyperliquid or Strike. Check your connection.';
  return 'Something went wrong reading this wallet. Try again in a minute.';
}

// ---------- browser wiring (skipped under Node so tests can import parseInputs) ----------
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const ready = fn => (document.readyState === 'loading' ? addEventListener('DOMContentLoaded', fn) : fn());
  ready(async () => {
    if (!document.getElementById('check')) return; // another page (paper.html) importing helpers
    const [{ render, renderState }, { gatherWallet, loadMarkets }, { buildReport }] = await Promise.all([import('./view.js'), import('./fetch-wallet.js'), import('./report.js')]);
    const form = $('check'), addr = $('addr'), size = $('size'), fee = $('fee'), go = $('go');
    const root = document.documentElement;
    let running = false, mk = null;

    // Theme toggle (the starting class is set by theme.js before paint)
    const toggle = $('theme-toggle');
    const syncToggle = () => {
      const dark = root.classList.contains('dark');
      toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.querySelector('.theme-toggle-path').setAttribute('d', dark ? 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z' : 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z');
    };
    toggle.addEventListener('click', () => {
      const dark = !root.classList.contains('dark');
      root.classList.toggle('dark', dark); root.classList.toggle('light', !dark); syncToggle();
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
    });
    syncToggle();

    // Sticky summary column, bottom-anchored when taller than the window
    const fitSticky = () => { const col = document.querySelector('.summary'); if (col) col.style.top = innerWidth >= 1280 ? `${Math.min(16, innerHeight - col.offsetHeight - 16)}px` : ''; };
    addEventListener('resize', fitSticky);
    document.addEventListener('mouseover', e => { const b = e.target.closest?.('.br-button'); if (b) b.classList.add('hovered'); });

    const showError = (field, msg) => {
      for (const f of ['addr', 'size']) { const el = $(`${f}-error`); el.hidden = f !== field; el.textContent = f === field ? msg : ''; $(f).setAttribute('aria-invalid', String(f === field)); }
      if (field) $(field).focus();
    };
    fee.addEventListener('change', () => { $('fee-show').textContent = `${(parseFee(fee.value) * 100).toFixed(3).replace(/\.?0+$/, '')}%`; });

    async function check(a, s) {
      if (running) return; running = true; go.disabled = true; go.setAttribute('aria-busy', 'true');
      renderState('loading', { step: 'markets' }); fitSticky();
      try {
        mk = mk || await loadMarkets();
        const g = await gatherWallet(a, s, { mk, fee: parseFee(fee.value), onProgress: p => renderState('loading', p) });
        render(buildReport(g));
        document.title = `Copilot Check: ${a.slice(0, 6)}…${a.slice(-4)}`;
        $('result').focus({ preventScroll: true });
      } catch (e) {
        renderState('error', errorText(e));
      } finally { running = false; go.disabled = false; go.removeAttribute('aria-busy'); requestAnimationFrame(fitSticky); }
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      const p = parseInputs(addr.value, size.value);
      if (!p.ok) { showError(p.field, p.message); return; }
      showError(null); addr.value = p.addr;
      history.replaceState(null, '', `#${p.addr}${p.size !== 1000 ? `/${p.size}` : ''}`);
      check(p.addr, p.size);
    });
    document.addEventListener('click', e => {
      const ex = e.target.closest?.('[data-example]'); if (!ex) return;
      addr.value = ex.getAttribute('data-example'); form.requestSubmit();
    });

    // Dev-only screenshot states (no effect without the query flag)
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo === 'loading') { renderState('loading', { step: 'fills', page: 3, pages: 10 }); return; }
    if (demo === 'busy') { renderState('error', errorText(new HlBusyError('userFillsByTime'))); return; }

    const m = location.hash.match(/^#(0x[0-9a-fA-F]{40})(?:\/(\d+(?:\.\d+)?))?$/);
    if (m) { addr.value = m[1].toLowerCase(); if (m[2]) size.value = m[2]; form.requestSubmit(); }
    else renderState('empty');
    requestAnimationFrame(fitSticky);
  });
}
