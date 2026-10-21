// Gathers everything one report needs, inside a browser-friendly budget: at most 10 fill pages (20,000 fills) and
// hourly prices for the 12 most-traded markets. Hyperliquid calls are sequential with short pauses.
import * as strike from '../core/strike.js';
import * as hl from '../core/hl.js';
import { hlInfo } from '../core/http.js';
import { buildMarkets } from '../core/markets.js';
import { fetchLead, replay, fmSize, frSize, equityFn, DAY } from '../core/replay.js';

export const LEVS = [10, 5, 3];

/** Strike markets with their Hyperliquid twins (3 calls). */
export async function loadMarkets({ fetch } = {}) {
  const [sm, core, xyz] = await Promise.all([
    strike.markets({ fetch }),
    hlInfo({ type: 'meta' }, { want: Object, fetch }),
    hlInfo({ type: 'meta', dex: 'xyz' }, { want: Object, fetch }),
  ]);
  return buildMarkets(sm, new Set(core.universe.map(u => u.name)), new Set(xyz.universe.map(u => u.name)));
}

/** The 12 replays (2 modes x 3 leverages x 2 windows, or 1 window when the wallet is too big for 90 days). */
export function runReplays(lead, { size, fee, mk, now, windows }) {
  const eq = equityFn(lead.equityHistory); const rows = [];
  for (const days of windows) {
    const t0 = now - days * DAY;
    const orders = lead.orders.filter(o => o.t >= t0), marks = lead.marks.filter(m => m[0] >= t0);
    for (const mode of ['fm', 'fr']) for (const lev of LEVS) {
      const r = replay({ orders, marks, start: size, size: mode === 'fm' ? fmSize(size / 20, lev) : frSize(size, eq), lev, fee, mk });
      rows.push({ mode, lev, days, ...r });
    }
  }
  return rows;
}

/**
 * @param {string} addr lower-case 0x address
 * @param {number} size account size
 * @param {{fetch?, onProgress?, now?, fee?, mk?}} o
 */
export async function gatherWallet(addr, size, { fetch, onProgress = () => {}, now = Date.now(), fee = 0.0005, mk = null } = {}) {
  onProgress({ step: 'markets' });
  mk = mk || await loadMarkets({ fetch });
  onProgress({ step: 'account' });
  const ch = await hl.clearinghouse(addr, { fetch });
  const portfolio = await hl.portfolioHistory(addr, { fetch });
  let days = 90, lead = await fetchLead(addr, 90, mk, { fetch, now, onProgress });
  if (lead.truncated) { days = 30; lead = await fetchLead(addr, 30, mk, { fetch, now, onProgress }); }
  onProgress({ step: 'ledger' });
  const ledger = await hl.ledger(addr, now - 30 * DAY, { fetch }).catch(() => []);
  const fills = lead.fills || [];
  onProgress({ step: 'replay' });
  const replays = runReplays(lead, { size, fee, mk, now, windows: days === 90 ? [90, 30] : [30] });
  return { addr, size, fee, fills, fillsSince: now - days * DAY, ch, portfolio, ledger, mk, replays, now,
    meta: { days, truncated: days !== 90, stillTruncated: lead.truncated, unmarked: lead.unmarked, nfills: lead.nfills } };
}
