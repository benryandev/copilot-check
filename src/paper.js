// Paper Copy: pure helpers for the trial page (settings parsing, what to enter in Strike, event wording).
export const API = 'https://copilot-watch.benryan.workers.dev/api/paper';
export const LEVS = [10, 5, 3, 2];
const DAY = 86_400_000;

/** Form values → trial settings, or {error}. Amount is margin per entry (fixed margin) or copy amount (fixed ratio). */
export function parseSettings(f) {
  const n = v => Number(String(v ?? '').trim().replace(/[$,\s]/g, ''));
  const mode = f.mode === 'fr' ? 'fr' : 'fm';
  const amount = n(f.amount), lev = n(f.lev), start = n(f.start || 1000);
  const cap = f.cap === '' || f.cap == null ? 0 : n(f.cap), tcap = f.tcap === '' || f.tcap == null ? 0 : n(f.tcap);
  if (!(start >= 10 && start <= 1_000_000)) return { error: 'Paper account size: $10 to $1,000,000.' };
  if (mode === 'fm' && !(amount >= 1 && amount <= 100_000)) return { error: 'Margin per entry: $1 to $100,000.' };
  if (mode === 'fr' && !(amount >= 10 && amount <= 1_000_000)) return { error: 'Copy amount: $10 to $1,000,000.' };
  if (!(Number.isInteger(lev) && lev >= 1 && lev <= 20)) return { error: 'Leverage: a whole number from 1 to 20.' };
  if (!(cap >= 0 && cap <= 1e7) || !(tcap >= 0 && tcap <= 1e7)) return { error: 'Caps: 0 (none) or a dollar amount.' };
  const excluded = String(f.excluded || '').split(/[\s,]+/).filter(Boolean).map(s => s.toUpperCase().replace(/(-USD)?$/, '-USD'));
  if (excluded.length > 40 || !excluded.every(s => /^[A-Z0-9]{1,15}-USD$/.test(s))) return { error: 'Excluded markets: names like PUMP, ZEC, separated by commas.' };
  return { settings: { mode, amount, lev, marginMode: f.marginMode === 'cross' ? 'cross' : 'isolated', cap, tcap, excluded: [...new Set(excluded)], start } };
}

/** The fields to enter in Strike's copy dialog for these settings. */
export function goLiveFields(s) {
  const usd = v => `$${Number(v).toLocaleString('en-US')}`;
  return [
    ['Copy mode', s.mode === 'fm' ? 'Fixed margin' : 'Fixed ratio'],
    s.mode === 'fm' ? ['Margin per entry', usd(s.amount)] : ['Copy amount', usd(s.amount)],
    ['Max margin per market', s.cap ? usd(s.cap) : 'None'],
    ['Max total margin', s.tcap ? usd(s.tcap) : 'None'],
    ['Excluded markets', s.excluded.length ? s.excluded.map(x => x.replace(/-USD$/, '')).join(', ') : 'None'],
    ['Leverage and margin mode', `${s.lev}x ${s.marginMode}`],
  ];
}

const WHY = { capped: 'Skipped: over a cap', no_margin: 'Skipped: not enough free margin', tiny: 'Skipped: below Strike\'s minimum', excluded: 'Skipped: excluded market' };
/** One replay log event → [what, amount-or-null]. */
export function eventWords(e) {
  if (e.kind === 'open') return [`Opened ${e.q > 0 ? 'long' : 'short'}`, null];
  if (e.kind === 'add') return [`Added to ${e.q > 0 ? 'long' : 'short'}`, null];
  if (e.kind === 'close') return ['Closed (part or all)', e.pnl];
  if (e.kind === 'liq') return ['Liquidated', e.pnl];
  return [WHY[e.why] || 'Skipped', null];
}

export const trialDays = (t, now = Date.now()) => Math.max(1 / 24, (now - t.from) / DAY);
