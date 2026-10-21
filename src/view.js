// DOM rendering for Copilot Check. Every node is built with createElement and every piece of data goes in through
// textContent, so nothing from an API can become markup.

/** h('p', {class: 'x'}, 'text', child) */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  return el;
}
const clear = el => { el.replaceChildren(); return el; };

// ---------- number formats (sign first, no colour) ----------
const MINUS = '−';
export const money = (n, { sign = true } = {}) => {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? MINUS : sign && v > 0 ? '+' : ''}$${Math.abs(v).toLocaleString('en-US')}`;
};
export const moneyShort = n => {
  const v = Number(n) || 0, a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K` : `${Math.round(a)}`;
  return { sign: v < 0 ? MINUS : v > 0 ? '+' : '', num: s };
};
export const pct = x => (x == null ? '–' : `${Math.round(x * 100)}%`);
export const shortAddr = a => `${a.slice(0, 6)}…${a.slice(-4)}`;
const coinName = c => String(c).replace(/^xyz:/, '');
const dateLong = t => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = ym => MONTHS[Number(String(ym).slice(5, 7)) - 1] || String(ym);
const modeName = m => (m === 'fm' ? 'Fixed margin' : 'Fixed ratio');
const btn = (label, href, { secondary = false, icon = '↗', external = true } = {}) =>
  h('a', { class: `br-button${secondary ? ' br-button--secondary' : ''}`, href, rel: external ? 'noopener noreferrer' : null, target: external ? '_blank' : null },
    h('span', { class: 'br-button-label', text: label }), h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: icon })));
const lab = (long, short) => (short ? [h('span', { class: 'l', text: long }), h('span', { class: 's', text: short })] : long);

export const strikeUrl = addr => `https://app.strikefinance.org/public-portfolio/${addr}?platform=hyperliquid`;
export const WATCH_URL = 'https://t.me/CopilotWatchBot';

// ---------- states ----------
const sections = root => ['holds', 'catches', 'replay', 'months'].map(id => root.querySelector(`#${id}`));

export function renderState(state, detail, root = document) {
  root.querySelector('.layout')?.setAttribute('data-idle', '');
  const res = clear(root.querySelector('#result'));
  for (const s of sections(root)) { s.hidden = true; clear(s); }
  if (state === 'empty') {
    res.append(
      h('h2', { class: 'verdict-word', text: 'What the check shows' }),
      h('p', { class: 'state-note', text: 'How much of the wallet\'s realised profit comes from markets Strike lists, what it holds now, the catches in its record, and a replay of copying it at your size in both copy modes at 10x, 5x and 3x, with liquidations.' }),
      h('div', { class: 'examples' }, h('span', { class: 'br-label', text: 'Example' }),
        h('button', { class: 'linkish', type: 'button', 'data-example': '0x01bb092c2e4fef1d68ef1ca66e9b1db29f0cf7b7', text: '0x01bb…f7b7' })));
  } else if (state === 'loading') {
    const p = detail || {};
    const steps = { markets: 'Reading Strike\'s markets…', account: 'Reading the wallet\'s positions and history…', fills: `Reading fills, page ${p.page || 1} of up to ${p.pages || 10}…`,
      candles: `Reading hourly prices, ${p.page || 1} of ${p.pages || 1}${p.sym ? ` (${p.sym.replace(/-USD$/, '')})` : ''}…`, equity: 'Reading equity history…', ledger: 'Reading deposits and withdrawals…', replay: 'Replaying 12 copy settings…' };
    const order = ['markets', 'account', 'fills', 'candles', 'equity', 'ledger', 'replay'];
    const frac = Math.min(1, (order.indexOf(p.step) + (p.pages ? (p.page || 0) / p.pages : 0)) / order.length);
    const bar = h('span'); bar.style.width = `${Math.round(Math.max(0.04, frac) * 100)}%`;
    res.append(h('h2', { class: 'verdict-word', text: 'Checking…' }), h('p', { class: 'progress', text: steps[p.step] || 'Starting…' }),
      h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(frac * 100) }, bar),
      h('p', { class: 'state-note', text: 'Usually under 15 seconds. Busy wallets take longer: up to 20,000 fills are read straight from Hyperliquid.' }));
  } else if (state === 'error') {
    res.append(h('h2', { class: 'verdict-word', text: 'Couldn\'t check that wallet' }), h('p', { class: 'state-note', text: detail || 'Something went wrong.' }),
      h('div', { class: 'actions' }, h('button', { class: 'br-button', type: 'submit', form: 'check' }, h('span', { class: 'br-button-label', text: 'Try again' }),
        h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '→' })))));
  }
}

// ---------- result ----------
export function render(r, root = document) {
  const [holds, catches, replay, months] = sections(root);
  root.querySelector('.layout')?.removeAttribute('data-idle');
  renderSummary(r, clear(root.querySelector('#result')));
  renderHolds(r, clear(holds)); holds.hidden = false;
  renderCatches(r, clear(catches)); catches.hidden = false;
  const hasReplay = r.replay.rows.some(x => x.taken > 0);
  renderReplay(r, clear(replay)); replay.hidden = false;
  renderMonths(r, clear(months)); months.hidden = !r.record.months.length;
  if (!hasReplay && !r.fit.coins.length) catches.hidden = !r.catches.length;
}

function renderSummary(r, res) {
  const b = r.replay.best;
  res.append(h('h2', { class: 'verdict-word', text: r.verdict.word }), h('p', { class: 'br-verdict', text: r.verdict.sentence }));
  if (r.verdict.notice) res.append(h('p', { class: 'br-notice', text: `${r.verdict.notice.title}.` }));
  if (r.fit.listedShareAll != null) res.append(h('div', { class: 'br-stat stat-wide' },
    h('span', { class: 'br-label', text: `Realised P&L on Strike markets, ${r.fit.windowDays} days` }), h('span', { class: 'br-stat-value', text: pct(r.fit.listedShareAll) })));
  if (b) res.append(h('div', { class: 'replay-sum' },
    h('p', { class: 'br-label', text: `Most per $ of drop · ${modeName(b.mode).toLowerCase()} ${b.lev}x` }),
    h('div', { class: 'stats-2 stats-3' },
      h('div', { class: 'br-stat' }, h('span', { class: 'br-label', text: 'Net' }), h('span', { class: 'br-stat-value', text: money(b.net) })),
      h('div', { class: 'br-stat' }, h('span', { class: 'br-label' }, lab('Biggest drop', 'Drop')), h('span', { class: 'br-stat-value', text: money(b.dd) })),
      h('div', { class: 'br-stat' }, h('span', { class: 'br-label' }, lab('Liquidated', 'Liq.')), h('span', { class: 'br-stat-value', text: '0' })))));
  res.append(h('div', { class: 'meta' },
    h('div', {}, h('p', { class: 'br-label', text: 'Wallet' }), h('p', { class: 'mono', title: r.addr, text: shortAddr(r.addr) })),
    r.record.firstTrade ? h('div', {}, h('p', { class: 'br-label', text: 'Trading since' }), h('p', { class: 'mono', text: dateLong(r.record.firstTrade) })) : null,
    h('div', {}, h('p', { class: 'br-label', text: 'Checked' }), h('p', { class: 'mono', text: new Date(r.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }))));
  res.append(h('div', { class: 'actions' }, btn('Open in Strike', strikeUrl(r.addr)), btn('Set up alerts', WATCH_URL, { secondary: true })));
}

function renderHolds(r, el) {
  el.append(h('h2', { class: 'br-block-heading', id: 'h-holds', text: 'What it holds now' }),
    h('p', { class: 'block-intro', text: 'Open positions with unrealised profit or loss. A new copy picks up its next trades, not these.' }));
  if (!r.fit.book.length) { el.append(h('p', { class: 'empty-list', text: 'No open positions right now.' })); return; }
  el.append(h('ul', { class: 'holds' }, r.fit.book.slice(0, 10).map(p => {
    const off = p.listed ? '' : ' off', v = moneyShort(p.value);
    return h('li', {}, h('span', { class: `sym${off}`, text: coinName(p.coin) }), h('span', { class: off.trim() || null, text: p.side === 'long' ? 'Long' : 'Short' }),
      h('span', { class: `pnl${off}`, text: money(p.upnl) }),
      h('span', { class: 'lv muted' }, `$${v.num}`, h('span', { class: 'sep' }), `${p.lev}x`, h('span', { class: 'sep' }), p.listed ? 'on Strike' : 'not on Strike',
        p.liqDist != null ? [h('span', { class: 'sep' }), `${pct(p.liqDist)} from liquidation`] : null));
  })));
  if (r.fit.book.length > 10) el.append(h('p', { class: 'br-field-hint', text: `And ${r.fit.book.length - 10} smaller positions.` }));
}

const SEV = { critical: ['critical', 'High'], medium: ['medium', 'Medium'], info: ['low', 'Info'] };
function renderCatches(r, el) {
  el.append(h('h2', { class: 'br-block-heading', id: 'h-catches', text: 'Catches' }));
  if (!r.catches.length) { el.append(h('p', { class: 'empty-list', text: 'Nothing flagged: no wipeouts, no high leverage now, a record over 6 months, and most profit on Strike markets.' })); return; }
  el.append(h('ul', { class: 'br-findings' }, r.catches.map(c => {
    const [sev, label] = SEV[c.severity];
    return h('li', { class: 'br-finding', 'data-severity': sev },
      h('div', { class: 'br-tags' }, h('span', { class: `br-tag${c.severity === 'info' ? '' : ' br-tag--alert'}`, text: label })),
      h('p', { class: 'br-finding-title', text: c.title }), h('p', { class: 'br-finding-body', text: c.body }));
  })));
}

function renderReplay(r, el) {
  const days = r.replay.days, size = r.size;
  const fmM = size / 20, rows = r.replay.rows;
  const cell = (mode, lev) => rows.find(x => x.mode === mode && x.lev === lev && x.days === days);
  const c30 = (mode, lev) => (days === 90 ? rows.find(x => x.mode === mode && x.lev === lev && x.days === 30) : null);
  const b = r.replay.best;
  el.append(h('div', { class: 'block-head' }, h('h2', { class: 'br-block-heading', id: 'h-replay', text: `The replay at $${size.toLocaleString('en-US')}` }),
    h('p', { class: 'br-label', text: `Last ${days} days` })));
  el.append(h('p', { class: 'block-intro', text: `Every trade it made on Strike markets, copied the way Strike copies: fees, your leverage, liquidations included. Fixed margin puts $${fmM.toLocaleString('en-US')} into each trade; fixed ratio copies in proportion to the wallet, as if its whole account were $${size.toLocaleString('en-US')} of yours. Past results don't predict future ones.` }));
  if (!rows.some(x => x.taken > 0)) { el.append(h('p', { class: 'empty-list', text: `No trades on Strike markets in the last ${days} days, so there is nothing to replay.` })); return; }
  const m = h('div', { class: 'matrix', role: 'table', 'aria-label': 'Replay results by leverage and copy mode' },
    h('div', { class: 'mrow', role: 'row' }, h('div', { class: 'h', role: 'columnheader' }, h('span', { class: 'sr-only', text: 'Leverage' })),
      h('div', { class: 'h br-label', role: 'columnheader', text: `Fixed margin $${fmM.toLocaleString('en-US')}` }),
      h('div', { class: 'h br-label', role: 'columnheader', text: `Fixed ratio $${size.toLocaleString('en-US')}` })));
  for (const lev of [10, 5, 3]) {
    const row = h('div', { class: 'mrow', role: 'row' }, h('div', { class: 'lev', role: 'rowheader', text: `${lev}x` }));
    for (const mode of ['fm', 'fr']) {
      const x = cell(mode, lev), y = c30(mode, lev); if (!x) { row.append(h('div', { class: 'cell', role: 'cell', text: '–' })); continue; }
      const isBest = b && b.mode === mode && b.lev === lev;
      const kv = (l, s, v) => h('span', { class: 'kv' }, h('span', { class: 'k' }, lab(l, s)), h('span', { class: 'v', text: v }));
      row.append(h('div', { class: `cell${isBest ? ' best' : ''}`, role: 'cell' },
        isBest ? h('span', { class: 'br-tag best-tag' }, lab('Most per $ of drop', 'Most/drop')) : null,
        h('span', { class: 'net', text: x.wiped ? 'Wiped out' : money(x.net) }),
        kv('Biggest drop', 'Drop', money(x.dd)), y ? kv('Last 30 days', '30d', money(y.net)) : null,
        kv('Liquidations', 'Liq.', String(x.liquidations))));
    }
    m.append(row);
  }
  el.append(m);
  const liqd = rows.filter(x => x.days === days && x.liquidations > 0);
  let note;
  if (b) {
    note = `Of the six replays, ${modeName(b.mode).toLowerCase()} at ${b.lev}x made the most per dollar of drop (${money(b.net)} for a ${money(Math.abs(b.dd), { sign: false })} drop), with no liquidations.`;
    const more = rows.filter(x => x.days === days && x.net > b.net && x.liquidations > 0).sort((p, q) => q.net - p.net)[0];
    if (more) note += ` ${modeName(more.mode)} at ${more.lev}x made more but was liquidated ${more.liquidations === 1 ? 'once' : `${more.liquidations} times`}.`;
  } else note = liqd.length ? 'Every one of the six replays had at least one liquidation.' : 'None of the six replays made money.';
  el.append(h('p', { class: 'replay-note', text: note }));
  if (b) {
    el.append(h('div', { class: 'used', 'aria-label': 'Settings behind that result' },
      h('div', {}, h('p', { class: 'br-label', text: 'Mode' }), h('p', { class: 'mono', text: modeName(b.mode) })),
      b.mode === 'fm' ? h('div', {}, h('p', { class: 'br-label' }, lab('Margin per entry', 'Margin/entry')), h('p', { class: 'mono', text: `$${b.marginPerEntry.toLocaleString('en-US')}` }))
        : h('div', {}, h('p', { class: 'br-label', text: 'Amount' }), h('p', { class: 'mono', text: `$${b.amount.toLocaleString('en-US')}` })),
      h('div', {}, h('p', { class: 'br-label' }, lab('Most open at once', 'Max open')), h('p', { class: 'mono', text: String(b.peakEntries ?? '–') })),
      h('div', {}, h('p', { class: 'br-label', text: 'Leverage' }), h('p', { class: 'mono', text: `${b.lev}x isolated` }))));
    el.append(h('p', { class: 'br-field-hint', text: `In that replay the most margin in use at once was $${b.totalCap.toLocaleString('en-US')}, and $${b.symCap.toLocaleString('en-US')} on one market. These describe the replay, not what to set.` }));
  }
  if (r.replay.unmarked.length) el.append(h('p', { class: 'br-field-hint', text: `No hourly prices read for ${r.replay.unmarked.map(s => s.replace(/-USD$/, '')).join(', ')} (budget of 12 markets), so liquidations there aren't checked.` }));
}

function renderMonths(r, el) {
  const ms = r.record.months.slice(-12);
  el.append(h('h2', { class: 'br-block-heading', id: 'h-months', text: 'Month by month' }),
    h('p', { class: 'block-intro', text: 'Its own profit and loss on Hyperliquid (all markets). Gains are filled, losses outlined.' }));
  if (!ms.length) return;
  const max = Math.max(...ms.map(m => Math.abs(m.pnl)), 1);
  const label = ms.map(m => { const s = moneyShort(m.pnl); return `${monthShort(m.ym)} ${s.num === '0' ? '' : s.sign}$${s.num}`; }).join(', ');
  const box = h('div', { class: 'months', role: 'img', 'aria-label': `Monthly profit and loss: ${label}` });
  box.style.setProperty('--n', ms.length);
  for (const m of ms) {
    const s = moneyShort(m.pnl), bar = h('span', { class: 'bar' }); bar.style.setProperty('--f', Math.max(0.02, Math.abs(m.pnl) / max).toFixed(3));
    const val = h('span', { class: 'val' }, s.num === '0' ? '' : s.sign, h('span', { class: 'cur', text: '$' }), s.num);
    box.append(h('div', { class: 'm' }, m.pnl >= 0 ? h('div', { class: 'up' }, val, bar) : h('div', { class: 'up' }),
      m.pnl < 0 ? h('div', { class: 'down' }, bar, val) : h('div', { class: 'down' }), h('span', { class: 'mo', text: monthShort(m.ym) })));
  }
  el.append(box);
}
