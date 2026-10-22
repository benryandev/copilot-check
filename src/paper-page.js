// Paper Copy trial page: read the trial (wallet + settings + start), replay the wallet's real trades since then in the
// browser, and show the result, the activity, a comparison over the same period, and what to enter in Strike.
import { h, money, pct, shortAddr, strikeUrl, WATCH_URL } from './view.js';
import { API, LEVS, parseSettings, goLiveFields, eventWords, trialDays } from './paper.js';
import { loadMarkets } from './fetch-wallet.js';
import { fetchLead, replay, fmSize, frSize, equityFn } from '../core/replay.js';
import { errorText } from './app.js';

const $ = id => document.getElementById(id);
const root = document.documentElement;
const dateShort = t => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const when = t => new Date(t).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const sec = (title, id, ...kids) => h('section', { class: 'br-block', 'aria-labelledby': id }, h('h2', { class: 'br-block-heading', id, text: title }), ...kids);
const modeName = m => (m === 'fm' ? 'fixed margin' : 'fixed ratio');

function setupTheme() {
  const t = $('theme-toggle');
  const sync = () => { const d = root.classList.contains('dark'); t.setAttribute('aria-label', d ? 'Switch to light mode' : 'Switch to dark mode');
    t.querySelector('.theme-toggle-path').setAttribute('d', d ? 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z' : 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'); };
  t.addEventListener('click', () => { const d = !root.classList.contains('dark'); root.classList.toggle('dark', d); root.classList.toggle('light', !d); sync(); try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch { /* blocked */ } });
  sync();
}

function show(main, ...kids) { main.replaceChildren(...kids); }
function message(main, title, text, withHome = true) {
  show(main, h('h1', { text: title }), h('p', { class: 'lede', text }),
    withHome ? h('p', {}, h('a', { class: 'br-button', href: '/' }, h('span', { class: 'br-button-label', text: 'Check a wallet' }), h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '→' })))) : null);
}

const sizeFor = (mode, amount, lev, eq) => (mode === 'fm' ? fmSize(amount, lev) : frSize(amount, eq));

function run(t, lead, mk, over = {}) {
  const s = { ...t.settings, ...over }, eq = equityFn(lead.equityHistory), log = over.log || null;
  return replay({ orders: lead.orders, marks: lead.marks, start: s.start, size: sizeFor(s.mode, s.amount, s.lev, eq), lev: s.lev, fee: 0.0005,
    cap: s.cap, tcap: s.tcap, excluded: new Set(s.excluded), mk, marginMode: s.marginMode, funding: lead.funding, log });
}

function render(main, t, lead, mk, now) {
  const s = t.settings, log = [], r = run(t, lead, mk, { log });
  const head = h('header', {}, h('h1', { text: `Paper copy of ${shortAddr(t.lead)}` }),
    h('p', { class: 'lede', text: `${s.mode === 'fm' ? `Fixed margin $${s.amount.toLocaleString('en-US')} per entry` : `Fixed ratio, $${s.amount.toLocaleString('en-US')}`}, ${s.lev}x ${s.marginMode}, on a $${s.start.toLocaleString('en-US')} paper account, counted from ${dateShort(t.from)}. The wallet's real trades on Strike markets, replayed each time this page opens. No money is involved.` }));
  const stat = (label, value) => h('div', { class: 'br-stat' }, h('span', { class: 'br-label', text: label }), h('span', { class: 'br-stat-value', text: value }));
  const skipped = Object.values(r.skipped).reduce((a, b) => a + b, 0);
  const panel = h('article', { class: 'br-panel result' },
    h('h2', { class: 'verdict-word', text: r.wiped ? 'Wiped out' : `${money(r.net)} since ${dateShort(t.from)}` }),
    h('div', { class: 'p-stats' }, stat('Paper equity', money(s.start + r.net, { sign: false })), stat('Biggest drop', money(r.dd)), stat('Liquidations', String(r.liquidations)),
      stat('Entries copied', String(r.taken)), stat('Entries skipped', String(skipped)), stat('Fees', money(-r.fees))),
    h('p', { class: 'br-field-hint', text: `Updated ${when(now)}. Funding ${r.funding >= 0 ? 'received' : 'paid'}: ${money(Math.abs(r.funding), { sign: false })}, at Strike's hourly rates. ${lead.truncated ? 'Busy wallet: only the most recent fills fitted in the browser budget. ' : ''}${lead.unmarked.length ? `No hourly prices for ${lead.unmarked.join(', ')}, so liquidations there aren't checked.` : ''}` }),
    h('div', { class: 'actions' }, h('button', { class: 'br-button br-button--secondary', type: 'button', id: 'refresh' }, h('span', { class: 'br-button-label', text: 'Update now' }),
      h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '↻' })))));

  const open = Object.entries(r.openNow);
  const holds = sec('Open paper positions', 'h-open', open.length
    ? h('ul', { class: 'holds' }, open.map(([sym, v]) => h('li', {}, h('span', { class: 'sym', text: sym.replace(/-USD$/, '') }), h('span', { text: v > 0 ? 'Long' : 'Short' }), h('span', { class: 'pnl', text: money(Math.abs(v), { sign: false }) }), h('span', { class: 'lv muted', text: 'position value' }))))
    : h('p', { class: 'empty-list', text: 'No open paper positions right now.' }));

  const recent = log.slice(-40).reverse();
  const evRow = e => { const [what, amt] = eventWords(e);
    return h('li', {}, h('span', { class: 'when', text: when(e.t) }), h('span', { class: 'sym', text: e.sym.replace(/-USD$/, '') }), h('span', { class: 'what', text: what }), h('span', { class: 'amt', text: amt == null ? '' : money(amt) })); };
  const acts = sec('Activity', 'h-act', h('p', { class: 'block-intro', text: 'Each lead trade on a Strike market and what the paper copy did with it, newest first.' }),
    recent.length ? h('ul', { class: 'events' }, recent.slice(0, 10).map(evRow)) : h('p', { class: 'empty-list', text: 'No trades on Strike markets since the start yet.' }),
    recent.length > 10 ? h('details', { class: 'more' }, h('summary', { text: `Show ${recent.length - 10} more` }), h('ul', { class: 'events' }, recent.slice(10).map(evRow))) : null);

  // Same period, other settings
  const cmp = h('div', { class: 'cmp', role: 'table', 'aria-label': 'Net and liquidations by leverage and copy mode over the trial period' },
    h('div', { class: 'hd', role: 'columnheader' }, h('span', { class: 'sr-only', text: 'Leverage' })),
    h('div', { class: 'hd br-label', role: 'columnheader', text: `Fixed margin $${(s.mode === 'fm' ? s.amount : Math.round(s.start / 20)).toLocaleString('en-US')}` }),
    h('div', { class: 'hd br-label', role: 'columnheader', text: `Fixed ratio $${(s.mode === 'fr' ? s.amount : s.start).toLocaleString('en-US')}` }));
  const cells = [];
  for (const lev of LEVS) {
    cmp.append(h('div', { class: 'lv', role: 'rowheader', text: `${lev}x` }));
    for (const mode of ['fm', 'fr']) {
      const amount = mode === s.mode ? s.amount : mode === 'fm' ? Math.round(s.start / 20) : s.start;
      const x = run(t, lead, mk, { mode, lev, amount }); cells.push({ mode, lev, ...x });
      cmp.append(h('div', { class: mode === s.mode && lev === s.lev ? 'on' : null, role: 'cell' }, x.wiped ? 'Wiped out' : money(x.net),
        h('span', { class: 'sub', text: `drop ${money(x.dd)} · ${x.liquidations} liq.` })));
    }
  }
  const other = run(t, lead, mk, { marginMode: s.marginMode === 'isolated' ? 'cross' : 'isolated' });
  const clean = cells.filter(c => c.liquidations === 0 && !c.wiped);
  const top = clean.sort((a, b) => b.net / Math.max(Math.abs(b.dd), 1) - a.net / Math.max(Math.abs(a.dd), 1))[0];
  const shows = sec('What the trial shows', 'h-shows', h('p', { class: 'block-intro', text: `The same trades since ${dateShort(t.from)}, with other settings. Your settings are outlined.` }), cmp,
    h('p', { class: 'replay-note', text: [
      !top ? 'In this trial, every leverage shown had a liquidation.'
        : top.net > 0 ? `In this trial, ${modeName(top.mode)} at ${top.lev}x ${s.marginMode} made the most per dollar of drop (${money(top.net)}, drop ${money(top.dd)}) with no liquidations.`
        : `In this trial, no setting shown made money; ${modeName(top.mode)} at ${top.lev}x lost least for its drop (${money(top.net)}).`,
      Math.round(other.net) === Math.round(r.net) && other.liquidations === r.liquidations ? ` ${other.marginMode[0].toUpperCase()}${other.marginMode.slice(1)} margin at ${s.lev}x ends the same here.`
        : ` At ${s.lev}x, ${other.marginMode} margin would have ended at ${money(other.net)} with ${other.liquidations} liquidation${other.liquidations === 1 ? '' : 's'}.`].join('') }),
    h('p', { class: 'br-field-hint', text: 'These describe this trial, not what to set. Past results don\'t predict future ones.' }));

  const go = sec('Go live', 'h-go', h('p', { class: 'block-intro', text: 'To copy this wallet for real with these settings, these are the fields in Strike\'s copy dialog. Strike locks a market\'s leverage when its first position opens, so set leverage and margin mode first.' }),
    h('div', { class: 'kvlist' }, goLiveFields(s).map(([k, v]) => h('div', {}, h('p', { class: 'br-label', text: k }), h('p', { class: 'mono', text: v })))),
    h('p', { class: 'br-field-hint', text: `Set ${s.lev}x ${s.marginMode} on each market before the first copy: the first position on a market locks it.` }),
    h('div', { class: 'actions' }, h('a', { class: 'br-button br-button--secondary', href: strikeUrl(t.lead), target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'br-button-label', text: 'Open in Strike' }), h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '↗' }))),
      h('a', { class: 'br-button br-button--secondary', href: WATCH_URL, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'br-button-label', text: 'Set up alerts' }), h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '↗' })))));

  show(main, head, panel, holds, acts, shows, go, editForm(t));
  $('refresh').addEventListener('click', () => start(main));
}

function editForm(t) {
  const s = t.settings;
  const field = (id, label, input, cls) => h('div', { class: `br-field${cls ? ' ' + cls : ''}` }, h('label', { class: 'br-field-label', for: id, text: label }), input);
  const inp = (id, value, extra = {}) => h('input', { class: 'br-input', id, name: id, value: String(value), inputmode: 'decimal', autocomplete: 'off', maxlength: 20, ...extra });
  const sel = (id, opts, value) => { const e = h('select', { class: 'br-input', id, name: id }, opts.map(([v, l]) => h('option', { value: v, text: l }))); e.value = value; return e; };
  const err = h('p', { class: 'field-error', id: 'edit-error', role: 'alert', hidden: true });
  const form = h('form', { class: 'edit', id: 'edit', novalidate: true },
    field('mode', 'Copy mode', sel('mode', [['fm', 'Fixed margin'], ['fr', 'Fixed ratio']], s.mode)),
    field('amount', 'Margin per entry or copy amount, $', inp('amount', s.amount)),
    field('lev', 'Leverage', sel('lev', Array.from({ length: 20 }, (_, i) => [String(i + 1), `${i + 1}x`]), String(s.lev))),
    field('marginMode', 'Margin mode', sel('marginMode', [['isolated', 'Isolated'], ['cross', 'Cross']], s.marginMode)),
    field('cap', 'Max per market, $ (0 = none)', inp('cap', s.cap)),
    field('tcap', 'Max total, $ (0 = none)', inp('tcap', s.tcap)),
    field('start', 'Paper account, $', inp('start', s.start)),
    field('excluded', 'Excluded markets (e.g. PUMP, ZEC)', inp('excluded', s.excluded.map(x => x.replace(/-USD$/, '')).join(', '), { inputmode: 'text', maxlength: 400 }), 'wide'),
    err,
    h('div', { class: 'wide' }, h('button', { class: 'br-button', type: 'submit' }, h('span', { class: 'br-button-label', text: 'Start a new paper copy' }), h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '→' })))));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form)); const p = parseSettings(f);
    if (p.error) { err.textContent = p.error; err.hidden = false; return; }
    err.hidden = true;
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lead: t.lead, settings: p.settings }) });
      const j = await r.json();
      if (!r.ok) { err.textContent = j.error === 'rate' ? 'Too many new paper copies from here; try again in a minute.' : j.error === 'full' ? 'Paper copies are at their limit for now.' : 'Couldn\'t start it. Check the settings.'; err.hidden = false; return; }
      location.assign(`/paper/${j.id}`);
    } catch (x) { err.textContent = errorText(x); err.hidden = false; }
  });
  return h('section', { class: 'br-block', 'aria-labelledby': 'h-edit' }, h('h2', { class: 'br-block-heading', id: 'h-edit', text: 'Try other settings' }),
    h('p', { class: 'block-intro', text: 'Starts a new paper copy of the same wallet from the same date, with its own link. This one stays as it is.' }), form);
}

async function start(main) {
  const id = (location.pathname.match(/^\/paper\/([A-Za-z0-9_-]{22})$/) || [])[1] || new URLSearchParams(location.search).get('id');
  if (!id || !/^[A-Za-z0-9_-]{22}$/.test(id)) { message(main, 'Paper copy not found', 'The link is incomplete. Paper copies start from a wallet report on Copilot Check, or with /paper in the Copilot Watch bot.'); return; }
  show(main, h('h1', { text: 'Paper copy' }), h('p', { class: 'progress', id: 'prog', text: 'Reading the paper copy…' }));
  const prog = t => { const p = $('prog'); if (p) p.textContent = t; };
  try {
    const r = await fetch(`${API}/${id}`);
    if (r.status === 404) { message(main, 'Paper copy not found', 'It has ended (paper copies last 30 days) or the link is wrong.'); return; }
    if (!r.ok) throw new TypeError('api');
    const t = await r.json(); const now = Date.now();
    document.title = `Paper copy of ${shortAddr(t.lead)} · Copilot Check`;
    const mk = await loadMarkets();
    const lead = await fetchLead(t.lead, trialDays(t, now), mk, { now, maxPages: 5, onProgress: p => prog(p.step === 'fills' ? `Reading fills, page ${p.page}…` : p.step === 'candles' ? `Reading hourly prices, ${p.page} of ${p.pages}…` : p.step === 'funding' ? 'Reading Strike\'s funding history…' : 'Reading equity history…') });
    render(main, t, lead, mk, now);
  } catch (e) { message(main, 'Couldn\'t load this paper copy', errorText(e), false); }
}

setupTheme();
start($('paper'));
