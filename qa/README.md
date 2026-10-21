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

## Blind re-score 1 (fresh reviewer, screenshots + kit README only): 6.5

Hierarchy 6, layout 6, typography 7, colour and kit rules 7, accessibility 7, states 6. Triage of its 24 points:
- Fixed in round 2: month rows without a shared zero line (a real bug: grid order put gains left and losses right),
  net overflowing its tile at 375, idle panel short of the right edge at 1440, a full-width "Try again" pill and a
  second primary pill, the empty "What it holds now" card stretched to the chart's height at 1001–1279, orange outline
  on non-critical tags, the idle heading larger than the page h1, address clipped in the 1280+ sidebar, widows, the
  eyebrow wrapping at 375, fee line not reading as a control, the pill shorter than the inputs, dead space in the
  vertical chart, liquidations looking like zero, the dark footer not reading as a band.
- Not defects: negatives already use U+2212 (−); the theme toggle and example link are 44px tall. The empty wallet
  field in loading and error appears only in the `?demo=` frames (a real check fills the address in).
- Left as agreed: Catches at the top of the right column from 1280 (the round-10 sketch Ben approved), the full
  reflow at 1280 and the uneven column bottoms that follow from it.
- Raised with the lead (report numbers or wording from `src/report.js`): the verdict notice repeats the top catch's
  title; the fixed-ratio column can be identical at 10x, 5x and 3x with nothing saying why.

## Round 2 (22 Oct): 8.4

Hierarchy 8, layout 8.5, typography 8.5, colour and kit rules 9, accessibility 8.5, states 8. Audit clean on all
80 frames, both themes; reduced motion clean.
- Month chart: rows read month | losses ← axis | → gains. Wide charts size the gain and loss areas to their own
  largest bar (rows set from JS as `--rows`), so labels sit by the bars.
- Net on its own row on phones too. Idle panel: full right column, heading below h1 size, buttons at natural width.
- "Try again" is secondary; only the highest-severity tag is orange (rule width carries severity).
- 0.8rem mono address in the 1280+ sidebar; 55px pill in the 768–1279 form row; `text-wrap: balance` on h1, verdict,
  notice and replay note; "Copilot Watch" never splits; the eyebrow tail hides under 420px.
- "Change" cue on the fee disclosure; a liquidation count over zero is bold; dark footer on the surface tone.

## Blind re-score 2 (a second fresh reviewer): 7.0

Hierarchy 6, layout 7, typography 8, colour and kit rules 8, accessibility 6, states 7.
- Below 7, hierarchy: the wipeout wallet gets the same headline and sentence as the clean one ("Mostly copyable on
  Strike… made money in at least one setting with no liquidations"), with only a 3px notice rule to set it apart;
  the catch is said three times. The headline and sentence come from `src/report.js` (raised with the lead). Round 3
  gives the notice the same rule width as its catch (7px for high), so the difference is visible in the panel.
- Below 7, accessibility: input borders 1.2:1 light and 1.5:1 dark (WCAG 1.4.11 wants 3:1), placeholder 2.7:1.
  Fixed in round 3, and `shoot.mjs` now checks field borders too (it flags the old 1.18:1).
- Also fixed: the pill vs input height at 1280+, the replay footnote running to ~110ch, "$0" months on the loss
  side, "MOST/DROP" on phones (now "Most per $ drop").
- Not changed: the address clipped inside its input (inputs scroll; the kit keeps inputs at 16px for iOS, so the
  0.8rem sidebar address from round 2 is reverted); "Check wallet" not busy in the loading frame (the `?demo` flag
  skips the real submit, which does disable it); whitespace beside the shorter card at 1001–1279 and under the left
  column at 1280+ (agreed structure); orange rules at 2.7:1 on light (decorative; severity is also in the tag text).

## Round 3 (22 Oct): 8.4

Hierarchy 7.5, layout 8.5, typography 8.5, colour and kit rules 9, accessibility 8.5, states 8. Audit clean on all
80 frames including the new field-border check.
