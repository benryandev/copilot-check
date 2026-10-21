# Design QA log (Copilot Check)

The BR design kit's mandatory loop: screenshots at 375, 768, 1001, 1024, 1279, 1280, 1440 and 1920 in light and dark,
score with `ui-ux-pro-max` (6 pillars), fix with `frontend-design`, re-score, then a blind re-score by a fresh reviewer.

```sh
node qa/serve.mjs                       # local server with the production CSP headers (port 8080)
node qa/shoot.mjs                       # all states × widths × themes → qa/shots/<state>-<width>-<theme>.png
node qa/shoot.mjs --states=empty,error --widths=375,1280
```

States: `empty` (/), `loading` (/?demo=loading), `error` (/?demo=busy), `resultA` (0x01bb…f7b7, has catches),
`resultB` (0x42fd…6623, one wipeout). Result states read Hyperliquid live, so each wallet loads once and the script
changes width and theme in the same page.

Each frame is audited automatically:
- horizontal overflow (`scrollWidth > innerWidth`), elements past either edge, text clipped in its own box;
- WCAG AA contrast on every visible text node, from computed colours over the composited background
  (4.5:1, or 3:1 for large text);
- wording: no "recommend", "you should", "best setting", "score", and neither current lead address;
- console errors (CSP violations show up here);
- `prefers-reduced-motion: reduce` leaves no transition or animation over 10 ms.

A self-test runs first (a known pale line, an overflowing box and a banned phrase must all be caught), so a quiet
run means the audit worked.

Pillars: 1 hierarchy and content, 2 layout and responsive, 3 typography, 4 colour and kit rules,
5 accessibility, 6 interaction and states.

## Round 1 (22 Oct): 6.8 → 8.2

Audit was clean before the round (no overflow, AA passes, no console errors); every defect below was visual.

| Pillar | Before | After | Notes |
|---|---|---|---|
| Hierarchy and content | 7 | 8 | Idle states on wide screens left the right column blank |
| Layout and responsive | 5.5 | 8 | See fixes |
| Typography | 7 | 8 | State notes and "no positions" line rendered at ~1.35rem grey, louder than the intro above them |
| Colour and kit rules | 7 | 8.5 | Orange focus ring on the whole verdict panel after every check |
| Accessibility | 8 | 8.5 | AA passes both themes; month chart has a full text alternative |
| Interaction and states | 6.5 | 8 | Idle layout, `−$0` months |

Fixes:
- Month chart: at 375 the month names ran together ("NOVDECJAN…") and loss labels overlapped; at 1001–1279 (half-width
  card) "JUNEJULY", "AUGSEPT" and "+$370K+$516K" collided. A container query now switches any chart narrower than
  600px to one row per month (losses left of the axis, gains right, value at the bar end). Month names are fixed
  three-letter ("Jun", not the en-AU "June"/"Sept"). A month that rounds to zero shows "$0", not "−$0".
  Bars leave room for their value label (they could overflow the half at 100%).
- Form, 768–1279: the hint sat in its own grid column and pushed "Check wallet" onto a stray second row. Now
  wallet | size | button on one row, hint and fee underneath.
- Verdict panel: programmatic focus after a check matched `:focus-visible` and drew an orange ring round the whole
  panel. The panel isn't a control (tabindex -1), so the ring is removed; focus still moves there for screen readers.
- Sidebar stats (1280+): "+$1,096" touched its box edge in the three-up row. Net now has its own row, with drop and
  liquidated below it (long labels again).
- Idle states (empty, loading, error) at 1280+: the panel moves into the right column instead of leaving it empty.
- Holds and months span the full width at ≤1000px (they were capped at 40rem, giving a ragged right edge).
