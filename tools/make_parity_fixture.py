"""Parity fixture: run Strike Copilot's Python replay on one wallet and dump its inputs and outputs for the JS port.

  python3 tools/make_parity_fixture.py <0x wallet>

Imports $STRIKE_COPILOT_DIR/scripts (default ~/Dev/strike-copilot/scripts) read-only. One fixed `now` for both windows.
Writes test/fixtures/parity-<first 10 chars>.json:
  {lead, mk, equityHistory, windows: {90: {t0, now, orders, marks, nfills, unmarked}, 30: {...}},
   expected: [{mode, lev, days, margin_mode, args, result}]}
`mk` is in the JS shape ({base, hl, minNotional, tiers}); marks are [T, symbol, close, low, high].
"""
import sys, os, json, bisect
from pathlib import Path

sys.path.insert(0, os.path.join(os.environ.get('STRIKE_COPILOT_DIR', os.path.expanduser('~/Dev/strike-copilot')), 'scripts'))
import replay as R  # noqa: E402
from common import markets, hl, now_ms, DAY, F  # noqa: E402

FEE, START, LEVS, FM, FR = 0.0005, 1000, (10, 5, 3), 50, 1000
KEYS = ('net', 'realised', 'dd', 'low', 'peak_margin', 'peak_entries', 'fees', 'volume', 'taken', 'skipped', 'liquidations', 'liq_loss', 'wiped')


def main(lead):
    lead = lead.lower(); now = now_ms(); mk = markets()
    hist = sorted((int(t), F(v)) for t, v in dict(hl({'type': 'portfolio', 'user': lead}, list))['allTime']['accountValueHistory'])
    ht = [t for t, _ in hist]
    L = R.Lead.__new__(R.Lead)  # use Copilot's own fm/fr sizing without its fetching constructor
    L.equity = lambda t: hist[max(bisect.bisect_right(ht, t) - 1, 0)][1] if hist else 0.0
    windows, expected = {}, []
    for days in (90, 30):
        t0 = now - int(days * DAY)
        orders, nfills = R.lead_orders(lead, t0, now, mk)
        symbols = sorted({o['c'] for o in orders})
        marks, unmarked = R.marks(symbols, t0, now, mk)
        windows[days] = {'t0': t0, 'now': now, 'nfills': nfills, 'unmarked': unmarked, 'orders': orders, 'marks': [list(m) for m in marks]}
        print(f'{lead[:10]} {days}d: {nfills} fills, {len(orders)} orders, {len(symbols)} symbols, {len(marks)} marks', file=sys.stderr)
        for mode in ('fm', 'fr'):
            for lev in LEVS:
                size = L.fm(FM, lev) if mode == 'fm' else L.fr(FR)
                r = R.replay(orders, marks, START, size, lev, FEE, 0, 0, set(), mk, 'isolated')
                expected.append({'mode': mode, 'lev': lev, 'days': days, 'margin_mode': 'isolated',
                                 'args': {'start': START, 'fee': FEE, 'cap': 0, 'tcap': 0, 'margin': FM if mode == 'fm' else None, 'amount': FR if mode == 'fr' else None},
                                 'result': {k: r[k] for k in KEYS}})
    jmk = {s: {'base': m['base'], 'hl': m['hl'], 'minNotional': m['min_notional'], 'tiers': m['tiers']} for s, m in mk.items()}
    out = {'lead': lead, 'mk': jmk, 'equityHistory': [[t, v] for t, v in hist], 'windows': windows, 'expected': expected}
    path = Path(__file__).resolve().parent.parent / 'test' / 'fixtures' / f'parity-{lead[:10]}.json'
    path.write_text(json.dumps(out, separators=(',', ':')))
    print(f'wrote {path.name} ({path.stat().st_size / 1e6:.1f} MB, {len(expected)} expected rows)', file=sys.stderr)


if __name__ == '__main__':
    if len(sys.argv) != 2 or not sys.argv[1].lower().startswith('0x'): sys.exit(__doc__)
    main(sys.argv[1])
