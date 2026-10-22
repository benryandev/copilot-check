// Go live panel on the Paper Copy page: connect a Cardano wallet, pick the Strike account, review every change,
// then set the markets and start the copy. The key lives in this closure only; Cancel or finishing drops it.
import { h, shortAddr, strikeUrl } from './view.js';
import { goLiveFields } from './paper.js';
import { BUILDER_CODE, cardanoWallets, connect, client, plan, openMarkets, execute, readBack } from './golive.js';

/** Builder code in use: the site's own, or ?builder= on localhost for testing. */
export function builderCode(loc = globalThis.location) {
  if (BUILDER_CODE) return BUILDER_CODE;
  const local = /^(localhost|127\.0\.0\.1)$/.test(loc?.hostname || '');
  const q = local ? new URLSearchParams(loc.search).get('builder') : null;
  return q && /^[A-Za-z0-9_-]{1,40}$/.test(q) ? q : '';
}

const button = (label, attrs = {}, icon = '→', secondary = false) =>
  h('button', { class: `br-button${secondary ? ' br-button--secondary' : ''}`, type: 'button', ...attrs }, h('span', { class: 'br-button-label', text: label }),
    h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: icon })));
const say = (box, text, cls = 'progress') => box.replaceChildren(h('p', { class: cls, role: cls === 'field-error' ? 'alert' : null, text }));

/** @returns {HTMLElement|null} the panel, or null when Go live isn't set up here. */
export function goLivePanel(t, mk) {
  const code = builderCode();
  if (!code) return null;
  const s = t.settings, box = h('div', { class: 'live', id: 'live' });
  let session = null; // {key, accountId, nickname, subs, call}
  const drop = () => { session = null; };

  function intro() {
    box.replaceChildren(
      h('p', { class: 'block-intro', text: `Or let this page do it: connect your Cardano wallet, choose the Strike account, check the list of changes, and start the copy. It sets ${s.lev}x ${s.marginMode} on each market first, then subscribes with the fields above.` }),
      h('ul', { class: 'live-facts' },
        h('li', { text: 'No fee: the connection approves a builder fee of 0.' }),
        h('li', { text: 'The key Strike accepts from this page is made in this tab, can\'t be copied out, and is gone when you close it. Strike sends withdrawals only to your own wallet.' }),
        h('li', { text: 'Nothing changes until you press Start the copy.' })),
      h('div', { class: 'actions' }, button('Copy it for real', { id: 'live-start' })));
    box.querySelector('#live-start').addEventListener('click', wallets);
  }

  function wallets() {
    const list = cardanoWallets(globalThis.window);
    if (!list.length) { box.replaceChildren(h('p', { class: 'field-error', role: 'alert', text: 'No Cardano wallet found in this browser (Eternl, Lace, Vespr and others). Use the fields above in Strike instead.' })); return; }
    box.replaceChildren(h('p', { class: 'block-intro', text: 'Choose the wallet you use with Strike. It will ask you to sign one message from Strike: check it says "up to 0% fee". It also says you entrust the key to the builder, copilotcheck; that\'s this page, and the key never leaves this tab.' }),
      h('div', { class: 'actions' }, list.map(w => { const b = button(w.name, { 'data-w': w.id }, '→', true); b.addEventListener('click', () => connectWith(w.id)); return b; }),
        cancelBtn()));
  }

  function cancelBtn() { const b = button('Cancel', {}, '×', true); b.addEventListener('click', () => { drop(); intro(); }); return b; }

  async function connectWith(id) {
    const status = h('div', {}); box.replaceChildren(status, h('div', { class: 'actions' }, cancelBtn()));
    try {
      say(status, 'Opening the wallet…');
      const api = await globalThis.window.cardano[id].enable();
      const c = await connect(api, { code, onStep: st => say(status, st === 'sign' ? 'Sign the message in your wallet.' : st === 'verify' ? 'Checking with Strike…' : 'Finding your Strike account…') });
      session = { ...c, call: client(c.key) };
      review(null);
    } catch (e) { say(status, e?.message || 'The wallet didn\'t connect.', 'field-error'); }
  }

  async function review(subId) {
    if (!session) return intro();
    const p = plan(s, t.lead, mk, subId);
    const head = h('p', { class: 'block-intro', text: `Connected: ${session.nickname || shortAddr(session.address)}. Choose the account to copy into. A sub-account keeps this copy apart from your others.` });
    const sel = h('select', { class: 'br-input', id: 'live-acct' }, h('option', { value: '', text: `${session.nickname || 'Main account'} (main)` }),
      session.subs.map(x => h('option', { value: x.id, text: x.name || x.id.slice(0, 8) })));
    sel.value = subId || '';
    sel.addEventListener('change', () => review(sel.value || null));
    const acctField = h('div', { class: 'br-field' }, h('label', { class: 'br-field-label', for: 'live-acct', text: 'Strike account' }), sel);
    const body = h('div', { class: 'live-body' }, h('p', { class: 'progress', text: 'Reading the account…' }));
    box.replaceChildren(head, acctField, body);
    if (p.error) { say(body, p.error, 'field-error'); body.append(h('div', { class: 'actions' }, cancelBtn())); return; }
    let skip = [];
    try { skip = await openMarkets(session.call, subId); } catch (e) { say(body, e.message, 'field-error'); body.append(h('div', { class: 'actions' }, cancelBtn())); return; }
    const n = new Set(p.steps.filter(x => x.sym && !skip.includes(x.sym)).map(x => x.sym)).size;
    const ok = h('input', { type: 'checkbox', id: 'live-ok' });
    const go = button('Start the copy', { id: 'live-go', disabled: true });
    ok.addEventListener('change', () => { go.disabled = !ok.checked; });
    go.addEventListener('click', () => run(p, subId, skip));
    body.replaceChildren(
      h('h3', { class: 'live-h', text: 'What will change' }),
      h('ol', { class: 'live-steps' },
        h('li', { text: `Set ${s.lev}x ${s.marginMode} on ${n} market${n === 1 ? '' : 's'}${p.capped.length ? ` (at their maximum where lower: ${p.capped.join(', ')})` : ''}.${s.excluded.length ? ` Excluded markets are left alone.` : ''}` }),
        skip.length ? h('li', { text: `Left as they are, because a position is open: ${skip.map(x => x.replace(/-USD$/, '')).join(', ')}. A copy there uses that position's settings.` }) : null,
        h('li', { text: `Start copying ${shortAddr(t.lead)} with the fields above. Its positions already open aren't copied; new trades are.` }),
        s.tcap ? h('li', { text: `Set the total cap to $${s.tcap.toLocaleString('en-US')}.` }) : null),
      h('div', { class: 'kvlist' }, goLiveFields(s).map(([k, v]) => h('div', {}, h('p', { class: 'br-label', text: k }), h('p', { class: 'mono', text: v }))),
        h('div', {}, h('p', { class: 'br-label', text: 'Builder fee' }), h('p', { class: 'mono', text: 'None' }))),
      h('p', { class: 'live-ok' }, ok, h('label', { for: 'live-ok', text: ' I understand this copies real trades with real money, and can lose it.' })),
      h('div', { class: 'actions' }, go, cancelBtn()));
  }

  async function run(p, subId, skip) {
    const status = h('div', {}); box.replaceChildren(status);
    const call = session?.call; if (!call) return intro();
    const r = await execute(call, p, { skip, onStep: x => say(status, x.step === 'settings' ? `Setting markets: ${x.done} of ${x.of}…` : x.step === 'subscribe' ? 'Starting the copy…' : 'Setting the total cap…') });
    let back = null;
    if (r.subscriptionId) back = await readBack(call, r.subscriptionId, subId).catch(() => null);
    drop(); // done: the key is no longer needed
    const links = h('div', { class: 'actions' },
      h('a', { class: 'br-button br-button--secondary', href: strikeUrl(t.lead), target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'br-button-label', text: 'Open in Strike' }), h('span', { class: 'br-button-icon', 'aria-hidden': 'true' }, h('span', { class: 'br-button-icon-inner', text: '↗' }))));
    if (!r.ok) { box.replaceChildren(h('p', { class: 'field-error', role: 'alert', text: r.error }), h('p', { class: 'br-field-hint', text: 'Market settings already sent stay as they are. Nothing was subscribed.' }), links); return; }
    box.replaceChildren(
      h('p', { class: 'live-done', text: `Copying in Strike${back?.status ? ` (${back.status})` : ''}.` }),
      h('p', { class: 'br-field-hint', text: `Subscription ${r.subscriptionId}.${back ? ` Strike shows ${back.copy_mode === 'fixed_ratio' ? `fixed ratio $${Number(back.copy_amount).toLocaleString('en-US')}` : `fixed margin $${Number(back.margin_per_entry_order).toLocaleString('en-US')} per entry`}${back.max_margin_per_symbol ? `, $${Number(back.max_margin_per_symbol).toLocaleString('en-US')} per market` : ''}${back.max_margin_total ? `, $${Number(back.max_margin_total).toLocaleString('en-US')} total` : ''}.` : ' Check it on Strike\'s copy page.'} Stop or change it in Strike. The key this page used is gone.` }),
      ...[r.error, mismatch(back)].filter(Boolean).map(text => h('p', { class: 'field-error', role: 'alert', text })), links);
  }

  /** What Strike read back differs from what was sent? */
  function mismatch(b) {
    if (!b) return null;
    const amt = s.mode === 'fm' ? b.margin_per_entry_order : b.copy_amount;
    const same = b.copy_mode === (s.mode === 'fm' ? 'fixed_amount' : 'fixed_ratio') && Number(amt) === s.amount
      && Number(b.max_margin_per_symbol || 0) === s.cap && Number(b.max_margin_total || 0) === s.tcap;
    return same ? null : 'Strike shows different settings from the ones sent. Check the copy in Strike before it trades.';
  }

  intro();
  return box;
}
