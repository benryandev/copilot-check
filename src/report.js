// Pure report metrics for one Hyperliquid wallet as a Strike copy. No I/O: everything comes in as data.
// Wording is descriptive ("in the replay"), never advice. There is no score.
import { hlMap } from '../core/markets.js';

const DAY = 86_400_000;
const sum = a => a.reduce((s, x) => s + x, 0);
const ym = t => new Date(t).toISOString().slice(0, 7);
const pct = x => `${Math.round(x * 100)}%`;
const usd = n => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const fin = x => (Number.isFinite(x) ? x : null);

/** Monthly P&L from a cumulative P&L history [[t, cum]]: [{ym, pnl}] oldest first. */
export function monthsFrom(pnlHistory) {
  const h = (pnlHistory || []).filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  if (h.length < 2) return [];
  const ends = new Map(); for (const [t, v] of h) ends.set(ym(t), v); // last value in each month
  const out = []; let prev = h[0][1];
  for (const [m, v] of ends) { out.push({ ym: m, pnl: v - prev }); prev = v; }
  return out;
}

/** Wipeouts: losses since an equity peak reaching 90% of that peak (flow-proof: uses P&L, not account value). */
export function wipeoutsFrom(accountValue, pnl) {
  const pv = new Map((pnl || []).map(([t, v]) => [t, v]));
  const pts = (accountValue || []).filter(([t]) => pv.has(t)).map(([t, e]) => [t, e, pv.get(t)]).sort((a, b) => a[0] - b[0]);
  let n = 0, peakE = 0, peakP = 0, dates = [];
  for (const [t, e, p] of pts) {
    if (e >= peakE) { peakE = e; peakP = p; continue; }
    if (peakE >= 100 && peakP - p >= 0.9 * peakE) { n++; dates.push(t); peakE = e; peakP = p; }
  }
  return { n, dates };
}

/** Realised P&L by coin from fills (closedPnl), plus listed share. */
export function listedShare(fills, mk, since = 0) {
  const map = hlMap(mk); const by = {};
  for (const f of fills) if (f.time >= since && !String(f.coin).startsWith('@')) by[f.coin] = (by[f.coin] || 0) + Number(f.closedPnl || 0);
  const mag = sum(Object.values(by).map(Math.abs));
  const listedMag = sum(Object.entries(by).filter(([c]) => map[c]).map(([, v]) => Math.abs(v)));
  return { share: mag > 0 ? listedMag / mag : null, byCoin: by, listed: c => !!map[c] };
}

/** Rows: {mode: 'fm'|'fr', lev, days, ...replay result}. Highest net / |dd| among rows with no liquidation; ties to the smaller |dd|. */
export function bestInReplay(rows) {
  const ok = rows.filter(r => r.liquidations === 0 && !r.wiped && r.taken > 0);
  if (!ok.length) return null;
  const ratio = r => r.net / Math.max(Math.abs(r.dd), 1);
  return ok.slice().sort((a, b) => ratio(b) - ratio(a) || Math.abs(a.dd) - Math.abs(b.dd))[0];
}

const ceil10 = x => Math.ceil(x / 10) * 10;

/**
 * @param {object} d
 * @param {string} d.addr
 * @param {number} d.size account size (USD)
 * @param {number} d.fee taker fee per side
 * @param {object[]} d.fills Hyperliquid fills in the replay window (for listed share)
 * @param {number} d.fillsSince start of that window
 * @param {{main, xyz}|null} d.ch clearinghouse (both dexes)
 * @param {{accountValue, pnl, perp}|null} d.portfolio
 * @param {{time, usdc}[]} d.ledger last 30 days
 * @param {object} d.mk Strike markets
 * @param {object[]} d.replays rows {mode, lev, days, ...result}
 * @param {{days: number, truncated: boolean, unmarked: string[]}} d.meta
 * @param {number} d.now
 */
export function buildReport(d) {
  const { addr, size, fee, mk, now = Date.now() } = d;
  const fills = d.fills || [], replays = d.replays || [], meta = d.meta || { days: 90, truncated: false, unmarked: [] };
  const pf = d.portfolio || { accountValue: [], pnl: [], perp: null };
  const perpFills = fills.filter(f => !String(f.coin).startsWith('@'));

  // Record
  const firstT = [pf.accountValue[0]?.[0], perpFills[0]?.time].filter(Number.isFinite);
  const firstTrade = firstT.length ? Math.min(...firstT) : null;
  const months = monthsFrom(pf.pnl);
  const wipe = wipeoutsFrom(pf.accountValue, pf.pnl);
  const allP = pf.pnl.at(-1)?.[1] ?? 0, perpP = pf.perp?.pnl?.at(-1)?.[1];
  const perpShare = perpP == null ? null : (Math.abs(perpP) + Math.abs(allP - perpP)) > 0 ? fin(Math.abs(perpP) / (Math.abs(perpP) + Math.abs(allP - perpP))) : null;
  const record = { firstTrade, months, wipeouts: wipe.n, perpShare, ageMonths: firstTrade ? (now - firstTrade) / (30.44 * DAY) : 0 };

  // Strike fit
  const ls = listedShare(perpFills, mk, d.fillsSince || 0), ls14 = listedShare(perpFills, mk, now - 14 * DAY);
  const map = hlMap(mk);
  const book = [];
  for (const dex of ['main', 'xyz']) for (const p of d.ch?.[dex]?.positions || []) {
    const mark = p.value && p.szi ? Math.abs(p.value / p.szi) : p.entry;
    book.push({ coin: p.coin, sym: map[p.coin] || null, listed: !!map[p.coin], side: p.szi > 0 ? 'long' : 'short', lev: p.lev,
      value: Math.abs(p.value || 0), upnl: p.upnl || 0, liqDist: p.liqPx && mark ? fin(Math.abs(mark - p.liqPx) / mark) : null });
  }
  book.sort((a, b) => b.value - a.value);
  const coinsPnl = Object.entries(ls.byCoin).map(([coin, pnl]) => ({ coin, pnl, listed: !!map[coin] })).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const fit = { listedShareAll: fin(ls.share), listedShare14d: fin(ls14.share), windowDays: meta.days, book, coins: coinsPnl.slice(0, 8) };

  // Replay
  const best = bestInReplay(replays.filter(r => r.days === meta.days));
  const replay = {
    rows: replays.map(r => ({ mode: r.mode, lev: r.lev, days: r.days, net: r.net, dd: r.dd, liquidations: r.liquidations, wiped: r.wiped, taken: r.taken,
      skipped: Object.values(r.skipped || {}).reduce((s, x) => s + x, 0), peakMargin: r.peakMargin, peakEntries: r.peakEntries, fees: r.fees })),
    best: best ? { mode: best.mode, lev: best.lev, days: best.days, net: best.net, dd: best.dd,
      marginPerEntry: best.mode === 'fm' ? size / 20 : null, amount: best.mode === 'fr' ? size : null, peakEntries: best.peakEntries, liquidations: 0,
      symCap: ceil10(Math.max(0, ...Object.values(best.symPk || {}))), totalCap: ceil10(best.peakMargin || 0) } : null,
    days: meta.days, truncated: !!meta.truncated, unmarked: meta.unmarked || [], fee,
  };

  // Catches (most severe first)
  const catches = [];
  const add = (severity, title, body) => catches.push({ severity, title, body });
  if (wipe.n) add('critical', `${wipe.n === 1 ? 'One wipeout' : `${wipe.n} wipeouts`} in its history`, 'At least once, losses since a high reached 90% of the account. A copy at the same leverage would have been wiped too.');
  const maxLev = Math.max(0, ...book.map(b => b.lev || 0));
  if (maxLev >= 20) add('critical', `Holds a ${maxLev}x position now`, 'At that leverage a 5% move against it ends the position. Strike copies use your own leverage setting, not the lead\'s.');
  for (const dex of ['main', 'xyz']) {
    const x = d.ch?.[dex];
    if (x && x.accountValue > 0 && x.maintUsed / x.accountValue >= 0.6) add('critical', 'Close to liquidation on Hyperliquid', `Maintenance margin is ${pct(x.maintUsed / x.accountValue)} of account value${dex === 'xyz' ? ' on its stock and commodity account' : ''}; Hyperliquid liquidates at 100%.`);
  }
  if (firstTrade && record.ageMonths < 6) add('medium', 'Young record', `First trade ${new Date(firstTrade).toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })}: under 6 months of history.`);
  if (ls.share != null && (ls.share < 0.5 || (ls14.share != null && ls14.share < ls.share - 0.2)))
    add('medium', 'Profit drifting to markets Strike doesn\'t list', `Strike lists the markets behind ${pct(ls.share)} of its realised P&L over ${meta.days} days${ls14.share != null ? ` (${pct(ls14.share)} in the last 14 days)` : ''}. A copy only follows the listed part.`);
  const mag = sum(coinsPnl.map(c => Math.abs(c.pnl)));
  if (mag > 0 && coinsPnl[0] && Math.abs(coinsPnl[0].pnl) / mag > 0.6) add('medium', `Concentrated in ${coinsPnl[0].coin.replace('xyz:', '')}`, `${pct(Math.abs(coinsPnl[0].pnl) / mag)} of its realised P&L over ${meta.days} days comes from one coin.`);
  const out30 = sum((d.ledger || []).filter(u => u.usdc < 0 && u.time >= now - 30 * DAY).map(u => -u.usdc));
  const eqNow = (d.ch?.main?.accountValue || 0) + (d.ch?.xyz?.accountValue || 0);
  if (out30 > 0 && out30 > 0.5 * (eqNow + out30)) add('medium', 'Large withdrawals', `${usd(out30)} moved out in the last 30 days. Fixed-ratio copies size off the lead's equity, so they shrink or grow with moves like this.`);
  const lastFull = months.filter(m => m.ym < ym(now)).at(-1);
  if (lastFull && lastFull.pnl < 0) add('info', 'Last full month was a loss', `${lastFull.ym}: −${usd(lastFull.pnl)}.`);
  if (meta.truncated) add('info', 'Big wallet: replayed the last 30 days only', 'It trades too often to page 90 days of fills in a browser.');
  if (meta.unmarked?.length) add('info', 'Some markets replayed without hourly prices', `${meta.unmarked.join(', ')}: liquidations can't be checked there.`);
  const rank = { critical: 0, medium: 1, info: 2 };
  catches.sort((a, b) => rank[a.severity] - rank[b.severity]);

  // Verdict: a short headline, one descriptive sentence, and the most severe catch as the notice
  let word, sentence;
  const lost = replay.rows.filter(r => r.days === meta.days);
  if (!perpFills.length && !replays.some(r => r.taken)) { word = 'No perp history yet'; sentence = 'No perp trades in this wallet\'s history yet.'; }
  else if (ls.share == null) { word = 'Nothing closed yet'; sentence = 'No closed perp trades in the window yet, so there is no realised P&L to compare.'; }
  else {
    if (ls.share >= 0.7) { word = 'Mostly copyable on Strike'; sentence = 'Most of this wallet\'s closed profit and loss is on markets Strike lists.'; }
    else if (ls.share >= 0.4) { word = 'Partly copyable on Strike'; sentence = 'About half of this wallet\'s closed profit and loss is on markets Strike lists.'; }
    else { word = 'Mostly not copyable on Strike'; sentence = 'Most of this wallet\'s results come from markets Strike doesn\'t list, so a copy can\'t follow them.'; }
    if (replay.best) sentence += replay.best.net >= 0 ? ` In the replay at $${size.toLocaleString('en-US')}, a copy made money in at least one setting with no liquidations.` : ' In the replay, no setting made money without a liquidation.';
    else if (lost.length) sentence += ' Every setting in the replay had a liquidation.';
  }
  // A serious catch changes the headline; the notice counts the catches instead of repeating one of them.
  const crit = catches.filter(c => c.severity === 'critical'), med = catches.filter(c => c.severity === 'medium');
  if (crit.length && word.endsWith('on Strike')) { word += ', with a serious catch'; sentence += ` But: ${crit[0].title.charAt(0).toLowerCase()}${crit[0].title.slice(1)}.`; }
  const parts = [crit.length && `${crit.length} serious`, med.length && `${med.length} to weigh`].filter(Boolean);
  const notice = parts.length ? { severity: crit.length ? 'critical' : 'medium', title: `Catches below: ${parts.join(', ')}` } : null;
  const verdict = { word, sentence, notice };

  return { addr, size, fee, at: now, record, fit, replay, catches, verdict };
}
