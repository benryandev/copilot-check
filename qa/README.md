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

## Blind re-score 3 (a third fresh reviewer): 6.8

Hierarchy 7, layout 5, typography 8, colour and kit rules 8, accessibility 6, states 7.
- Below 7, layout and accessibility: at 375 the best cell's tag ran over the next column and hid its value
  ("+$170" read "70"). Round 3 caused it by lengthening the phone label, and the audit only checked page edges. Fixed
  in round 4, and `shoot.mjs` now checks that tags, values, labels and buttons stay inside their own box (cell, stat,
  finding, chart row); it flags the old frame.
- Address clipped in the 1280+ sidebar even at 1920 (403px of text, 350–382px of field). Fixed in round 4 by widening
  the sidebar (27.5rem, 28rem from 1440), keeping the kit's 16px for inputs.
- Short holds card beside the tall chart at 1001–1279, and the chart switching shape between 768 (columns), 1001
  (rows) and 1280 (columns). Round 4 stacks holds and months at full width at 1001–1279, as at 768, so the chart is
  in column form from 768 up and in row form only on phones. This departs from the round-10 sketch's side-by-side
  pair at that width; it is one rule if Ben wants the pair back.
- "10X" in an upper-case label: leverage keeps its lower-case x.
- Not changed: the theme toggle (a 44px button with a 20px icon, as on benryan.com.au); light orange rules at 2.8:1
  (kit colour; severity is also in the tag text); the verdict notice repeating the catch title (`src/report.js`).

## Round 4 (22 Oct): 8.5

Hierarchy 8, layout 8.5, typography 8.5, colour and kit rules 9, accessibility 8.5, states 8. All 80 frames clean
with the new overlap check; full address fits at 1280, 1440 and 1920.

## Blind re-score 4 (a fourth fresh reviewer): 7.6

Hierarchy 6.5, layout 7, typography 8, colour and kit rules 8.5, accessibility 7.5, states 8.
- Below 7, hierarchy: the column chart drew losses at less than half the scale of gains (resultA at 1440: gains
  ~0.61 px per $1K, losses ~0.27). Round 2 caused it: each half was sized to its own largest bar but both reserved
  the same fixed label room, so the smaller half's bars shrank more. On a risk tool that understates losses. Fixed in
  round 5. `shoot.mjs` now reads every bar's length against its printed value and fails if the px-per-$ differs by
  more than 8% (it flags the round-4 chart at 2.32x).
- Also fixed: "Open in Strike" was a second filled pill (the plan specifies it as secondary; "Check wallet" is now
  the only primary); the best-cell tag reads "Most per $ of drop" at every width.
- Not changed: "$1,000" in the replay heading is Atkinson's own slashed zero, not mono; the address clipped inside
  its field on phones and at 768 (inputs scroll; 16px minimum); uneven columns and the 1279/1280 jump (agreed
  structure); the repeated catch (`src/report.js`).

## Round 5 (22 Oct): 8.5

Hierarchy 8.5, layout 8.5, typography 8.5, colour and kit rules 9, accessibility 8.5, states 8. All 80 frames clean
with the scale check. Columns: each side's room is its largest bar × 9rem plus 1.5rem for the label, bars
`--f × 9rem`. Rows: the shared scale `--S` comes from container-query width (`100cqw`), so phones get the widest
bars that still leave label room.

## Blind re-score 5 (a fifth fresh reviewer): 7.7, every pillar 7 or over

Hierarchy 8, layout 7, typography 8, colour and kit rules 8, accessibility 7, states 8. No clipping, overflow or
horizontal scroll at any width.
- Round 6 fixes its left-edge point: the verdict panel (kit `br-panel`, 2rem) now uses the cards' 1.75rem.
- Left as polish for later: the replay table on phones is tall (five lines a cell, the tag and the fixed-ratio
  header in three lines each); replay cells wrap differently where a value is longer; the month chart has no year;
  a liquidation is shown by weight (and the count), not a marker; the error card has no notice rule; light grey
  text is 4.6–4.8:1 (kit token, passes AA); "Change" and the toggle have 44px hit areas, though the glyphs are small.

## Round 6 (22 Oct): 8.5 (mine), 7.7 blind

All 80 frames clean: no overflow, no overlap, AA text and field borders in both themes, one chart scale, wording,
no console errors, reduced motion respected.
