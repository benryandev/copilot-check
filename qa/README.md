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

# Paper Copy page (paper.html)

States: `paper` (/paper/NlpQ3_cKru9OII4FHqNSpA, a live trial), `paperGone` (/paper/AAAAAAAAAAAAAAAAAAAAAA, the API's
404), `paperBad` (/paper/x). Same widths, themes and audit; `node qa/shoot.mjs --states=paper,paperGone,paperBad`.
The audit's overlap check also covers the comparison table cells, activity rows and Go live fields. The 404 console
line is expected in `paperGone` and exempted there only. Presentation fixes go in `css/paper.css`; markup lives in
`src/paper-page.js` (the lead's).

## Paper round 1 (22 Oct): 6.5 → 8.3

Audit clean before and after; every defect was visual.
| Pillar | Before | After |
|---|---|---|
| Hierarchy and content | 6.5 | 8 |
| Layout and responsive | 6 | 8.5 |
| Typography | 7 | 8 |
| Colour and kit rules | 8 | 8 |
| Accessibility | 8 | 8.5 |
| Interaction and states | 6 | 8 |

- Activity: the time wrapped onto three lines in a 6.5rem column ("22 Oct, / 01:26 / am"), making 40 rows ~4,000px
  on phones. Now one line (9rem column); on phones each row is time + market, then what happened + amount.
- Open positions: "SKHYNIX" ran into "Short" (4rem column). The market column now fits its name.
- Lede at 1.35rem grey on every state, and a 2rem gap between the not-found heading and its line. Lede at 1.05rem,
  heading and line kept together.
- Short pages (not found, bad link): the footer ended mid-window with page colour below. The body is now a full-height
  column, so the footer sits at the bottom.
- Buttons ("Update now", "Open in Strike", "Set up alerts") stretched full width from 1280, inherited from the main
  page's sidebar rule. Natural width here.
- Frame: content centred in a 64rem column at 1279 but left-aligned with a ~400px void at 1440. The topbar, content
  and footer now share one centred 64rem column from 1001 up.
- Raised with the lead (markup or wording in `src/paper-page.js`):
  - 40 activity rows still dominate the page; show ~10 with a "Show all 40" disclosure (`<details>`).
  - "Leverage and margin mode" value is a sentence in mono ("5x isolated, set on each market before the first
    copy"); split into the value ("5x isolated") and a hint line.
  - Two primary pills ("Open in Strike" in Go live, "Start a new paper copy"); the main page has "Open in Strike" as
    secondary per the plan.
  - When every replay loses, the note reads "made the most per dollar of drop (−$534, drop −$620)", and the cross
    line can repeat the same figure ("cross margin would have made −$534").

## Round 7 (22 Oct): after the lead's verdict and Paper Copy additions

Full audit on all 8 states (128 frames): clean, including the new verdict wording ("…, with a serious catch",
"But: …"), the catch-count notice, the fixed-ratio hint and the "Try it on paper first" block (wording ban list
included). "Update now" on the paper page is natural width at every size (148–167px; fixed in paper round 1).
- The verdict sentence used `text-wrap: balance`, which made short ragged prose lines; now `pretty` (balance stays
  on headings and the notice).
- The "no hourly prices" replay note now comes before the paper-copy block, next to the replay data it qualifies.

## Ecosystem world (30 Oct)

```sh
node qa/serve.mjs                           # same server; it now serves .png and .glb with their own types
node qa/shoot-eco.mjs                       # 8 states × widths × themes → qa/shots/eco-<state>-<width>-<theme>.png
node qa/shoot-eco.mjs --states=map,mapEnd --widths=375 --themes=dark
node qa/shoot.mjs --states=submit,submitErrors,submitDone   # the project submission form (31 Oct); submitDone mocks the worker
```

States: `loading`, `intro`, `drive` (on the Liquidations pad), `stop` (its sheet), `map`, `mapEnd` (Map view
scrolled to the bottom), `raceway` (start line), `walls` (the car grazing the hairpin's tyre wall at 24 m/s, turned along it), `race` (lap-finish sheet, filled in by the script). 375 and 768 run
as touch devices, so the driving buttons show and tap targets are checked. Exit code 1 if anything is found.

Venue pages: `--page=/ecosystem/tracks/lagoon/` shoots that page instead of the hub, and its frames carry the venue's slug (`qa/shots/eco-lagoon-<state>-<width>-<theme>.png`), so a venue run never overwrites the hub's frames. The states are `loading`, `intro` (a direct visit's intro sheet, the opening flight skipped with `&arrive=0`; the shoot fails if no intro opens), `grid` (the car on the grid once the intro closes; the check fails if the car is moving or the HUD title is not "The Lagoon"), `drive` (up held until the car is over the start line with the lap clock running), `peers` (the car back 14 m behind the start line with no lap running, so the camera is clear of the gantry and the clock reads 0:00.00, and three stand-ins apart on the grid in the venue's zone, since peers.js parks a peer from another zone; the shoot fails if the clock runs), `jump` (the lap run up to the ramp first through the page's own race module, over the start line and each checkpoint short of the run-up, so the HUD counts them; then the car driven off the real ramp at speed and shot in the air over the inlet with the stunt camera most of the way round; the shoot fails if the HUD has taken no checkpoint), `map` and `race` (the finish sheet with Lagoon times above the 29.469 s floor: a new best of 0:29.794, 0.326 s faster than the last best 0:30.120, with the post-my-best note hidden as it is for a new best, so no time is stated twice). `raceway` and `ghost` are not shot on a venue: the venue is the track, so `raceway` would repeat `grid`, and the ghost needs the open worker's board, which is a production check. It also shoots the two portal states, which need `?venues=1` on the hub (the shoot adds it): `portalOut` (the flight to the venue frozen mid-way with the `portalHold` hook; the touch controls are hidden there) and `portalIn` (the venue's hold under a real hand-off record, then the landed frame; the shoot fails if the record was not read or the intro opened). The portal states also run alone: `--states=portalOut,portalIn`. Every frame is audited as on the hub.

Each frame is audited: sideways scroll (against the device width: a mobile viewport widens itself to fit oversized
content), sheets past the viewport, HUD pieces off-screen or overlapping, 44px tap targets on touch, AA contrast on
panel text (a translucent panel is tried over a black and a white scene and the worse ratio counts; text straight on
the 3D scene is judged from the screenshot), page errors. A self-test runs first.

Test-environment artifacts: the race API allows only `localhost:8766` and `strike.benryan.com.au`, so the board reads
"Leaderboard offline" from :8080; the 3D renders in software, so frame rates are low and 3D quality isn't judged.

Four rounds, then a blind re-score of 7.3 before its fixes:
- A Builders' Row shop sign could load before the theme and throw, leaving the shop as its blockout.
- Light theme: the HUD's grey labels on 88% panels fell to ~3.9:1 over dark scenery; panels are opaque in light.
- Footer: a pill over the scene; hidden under sheets; driving buttons clear its two-line form at 375; the credit
  link is 44px tall on touch.
- Map view: figures as 2×2 (was 3 + 1) with values aligned when a label wraps; Read / Drive in / Go to start as
  pills, centred on their card (they stretched to its height); Read under each card on phones; space above Top 10.
- Portrait camera aims lower so the car sits above the driving buttons.
- Below 1140px a sheet hid the corner panels behind it mid-word: they hide while a sheet is open. Darker scrim.
  The intro's phone tip shows on touch screens only.

## Chart Ridge

- `node --test qa/ridge-unit.mjs qa/data-unit.mjs` — the profile (slope cap, scaling, flat and missing data) and the klines fetch.
- `node qa/ridge-smoke.mjs http://localhost:8766` — the car drives the chart both ways at 24 m/s on the steepest allowed day and on a flat one.
- Shoot state `ridge`; still `tools/showcase-stills.mjs --only=ridge`; hook `__eco.ridge.set(closes)` / `__eco.ridge.series()` (a series set by hand is applied at once, even with the car on the ridge).

## Funding windsocks

- `node --test qa/windsock-unit.mjs qa/data-unit.mjs` — the row's math (fill scale, direction, labels, the normalised comparison with missing venues, every pole off the road and on flat ground, the cloth's angles) and the funding fetch.
- Shoot state `windsocks`; still `tools/showcase-stills.mjs --only=windsocks`; hook `__eco.windsocks.set(rawBody)` / `__eco.windsocks.state()` (`fills` per sock, Strike socks first). Fixed comparison: `qa/fixtures/funding-2026-11-02.json` (Strike's body, copied once). No smoke: nothing is on the road.

## Plaza furniture

- `node --test qa/furniture-unit.mjs qa/terrain-unit.mjs` — where the kerb opens (gaps from road endpoints, merged, whole across the ±π seam), lamp spots beside pads (right first, none when blocked), bollard spots just outside each gap, bench and planter spots between pads; the kerb's 12 cm lip in the height field (open at mouths, under the car's bump allowance).
- Shoot state `plaza` (HQ's rim from inside, by day and night); still `tools/showcase-stills.mjs --only=plaza` (night). Benches and planters are props in the crate system, so the crate QA covers their physics.

## Track engine (4 Nov 2026)

- The Raceway became a track definition (`ecosystem/tracks/realfi.js`) resolved by `track-math.js`; terrain is built by `configureTerrain`, water is a list of bodies, walls come from `walls-math.js`, and `tools/lapsim/` and `tools/tracks-json.mjs` are new tools.
- `node --test qa/track-math-unit.mjs qa/track-realfi-unit.mjs qa/terrain-config-unit.mjs qa/water-bodies-unit.mjs qa/raceway-walls-unit.mjs qa/track-lift-unit.mjs qa/lapsim-unit.mjs qa/tracks-json-unit.mjs` — the resolver, the Raceway module against the old numbers, in-place terrain configuration, water bodies, wall spots and boxes, lifts, the lap simulator (Ninja1's 23.034 replay, the 22.914 floor line, the 26.725 centreline, the bales penalty, the 0.87 cut ratio, fixtures in `qa/fixtures/lapsim/`) and the generated tracks.json. Suite: 382 tests, 378 pass, 4 skipped.
- Shoot states `drive`, `raceway`, `ford` and `bridge` were shot during the build. The full gate runs before the deploy and is not claimed here.

## When to run the full shoot (Ben, 2 Nov 2026)

- During a build: only the states the change touches plus `drive`, at two widths, both themes, e.g. `node qa/shoot-eco.mjs http://localhost:8766 --states=ridge,drive --widths=375,1280`. About a minute.
- The full matrix (all states, twelve widths, both themes) only before a deploy, or when the change is to something every frame shares: the HUD or its CSS, the palette, the quality tiers, the loader, the audit itself.
- Never re-shoot states nothing touched between those two moments.

## QA scoped by the change (Ben, 4 Nov 2026): the standing rule

The full pass used to be one thing: the shoot, the six-pillar score, a fix pass, a re-score and a blind re-score, run over
every state before every deploy. Most of that re-read screens the change never touched. From 4 Nov the pass is in two
parts, and only the first always runs.

**Always, on every deploy (cheap, scripted, minutes):** the automated audit over the full matrix. Overflow, elements
past the edges, clipped text, AA contrast, banned wording, console errors, reduced motion. It is the regression net for
shared CSS moving under something, so it is never scoped down.

**The design loop (score, fix, re-score, blind re-score) only where the change can be seen:**

| What changed | Design loop | Blind re-score |
|---|---|---|
| Shared CSS, the palette, a shared component, the HUD, the loader, the quality tiers | every state, as before | yes |
| A new sheet, page, board or guide template | that thing only, at the eight widths, both themes | yes, on that thing |
| Copy inside an existing sheet (the copy rule and `stops-unit.mjs` cover it) | no | no |
| World geometry, props, physics, data, a new track on an existing page template | no | no |

**What a change to world code or geometry always keeps, whatever the table says:** the phone performance pass
(`?fps=1` over the LAN on the iPhone, the Low tier) and the unit tests. New triangles are new load on the same phone
budget, so this is the one check that is not redundant for a track or a monument.

**A new track on an existing venue template** therefore costs: the automated audit on its page, the phone pass, its
own track checks (gates crossed in order in the smoke, the lap optimiser's floor recorded before launch, the worker's
per-track speed limits), and no design loop unless it brings a new sheet.

**How the scope is decided:** by the diff, not by judgement each time. Each shoot state lists the files it depends on
(`qa/state-deps.json`, to be added with the venue pipeline); a state is re-scored when one of its files changed. Until
that manifest exists, the table above is the rule and the reasoning goes in the deploy note.

## Frame times (4 Nov): the ?fps=1 readout and the perf probe

`/ecosystem/?fps=1` shows a small readout over the world (`ecosystem/js/fps.js`): the average and worst gap between
frames over the last second, the frame loop's script time with the draw call's share, the GPU's own time per frame where
the browser reports it (Chrome on a desktop; Safari does not), the quality tier, and the draw calls and triangles for the
whole frame. It is for a phone, where there are no developer tools; nothing is created without the flag.

```sh
node qa/perf-eco.mjs http://localhost:8080 --tiers=high,medium,low   # stands on the hub plaza, then drives round it
node qa/perf-eco.mjs http://localhost:8080 --ab                      # the medium tier with one thing changed at a time
node qa/perf-eco.mjs http://localhost:8080 --cpu=4 --tiers=medium    # the main thread four times slower, a phone's processor
node qa/perf-eco.mjs http://localhost:8080 --tiers=phone --jitless  # V8 without its JIT: Safari under Lockdown Mode (Ben's phone)
```

Chrome runs headed so the real GPU draws (headless Chromium draws in software). The figures are this machine's, so
compare settings with each other rather than with a phone; on an Apple-silicon Mac the GPU is the same family as an
iPhone's, several times faster, so the shares hold.

### The scene walk (4 Nov): frozen matrices and merged geometry

Ben's phone runs Safari without its JIT, and there the draw call's cost is mostly three.js walking the scene rather than the
GPU: every object visited twice a frame (the matrix walk, then the culling walk) and a call per visible mesh, tens of
microseconds each. Under every row the probe prints a scene-walk line, read standing on the hub plaza: the objects visited
each frame, how many still compose a matrix every frame, the drawables, and the median cost of one `scene.updateMatrixWorld()`
and one `renderer.render()`. Two modules keep it small. `ecosystem/js/freeze.js` freezes the matrix of everything that never
moves once the world is up and again once the Blender models are in; whatever moves marks itself live first (`markLive`),
and code that moves a frozen object afterwards calls `moved(o)`. `ecosystem/js/merge.js` then merges each district's static
geometry into one mesh per material, does the same for what stands outside the districts, and folds the static pieces inside
each thing that moves (a bench, a stack of coins, the blimp) into one mesh; what the code later finds by name or repaints is
marked keep (`markKeep`) and left alone. On the M5 with the JIT off, phone tier at 390×844 ×3: objects 2,770 → 1,546,
composing a matrix each frame 2,770 → 354, `updateMatrixWorld` 2.4 → 0.5 ms, one render 8.2 → 4.8 ms, the driving draw
7.0 → 3.7 ms.

```sh
node qa/scene-walk-smoke.mjs http://localhost:8766   # the freeze and the merge, end to end, on the low tier
```

The smoke checks that a quarter of the objects at most still compose a matrix after the models, that nothing frozen is
moved behind three.js's back once everything that moves or redraws has run (a frozen object's matrix must still equal its
position, rotation and scale), that the car, the blimp, the sky dome, the flywheel, the Orrery's rings, a spin_ node and the
minute hand still move, that no two static meshes under one root still share a batch, and that the pads and the Orrery's
named pedestal are still there, and that every node the monuments hold is still attached. Rule for new code: anything that
moves after the world is built is marked live (or calls `moved`); anything found by name, repainted (`.material =`), shown or
hidden (`.visible`), read for a world position, or given children later is marked keep, and so is a group that must survive
being emptied. A kept or live node under a static mesh is re-attached to the mesh's parent when the mesh merges, so it
survives, but its place in the tree changes: better not to export one that way.

## Stops page (3 Nov): 8.3

`/ecosystem/stops/`, the world's text companion (generated by `tools/site-pages.mjs`), shot with `node qa/shoot.mjs --states=stops`:
16 frames clean on the first styled run (no overflow, AA both themes, no banned words, no console errors, reduced motion clean).
Pillars: hierarchy 8.5 (eyebrow, display h1, lede, two actions, district rail), layout 8.5 (chips row under 1024, sticky rail
from 1024, two card columns from 1280), typography 8 (card summaries trimmed to 1.05rem so the h3 leads), colour and kit 8.5
(district colour as the card's left rule only, never as text), accessibility 8.5, states 8 (the theme toggle is the Check page's,
wired by `src/theme-toggle.js` so static pages share it; the shoot flips the class on a page without one).

## Guides (3 Nov): the guide pages, the guides index and the stops page's backdrop

Workstream C of the content spec. States `guides` (`/ecosystem/guides/`), `guide` (one guide page) and `stops` shot at the
8 kit widths in both themes: audit empty on all 48 frames after two fixes (dark-theme link colour inherited inside the
article and on the stops page's guide line; the fixture image inside the sheet's width). By eye: index cards no longer
underline every line; FAQ headings spaced from the box title. Local Lighthouse (mobile / desktop): guide page 99 / 100,
index 100, stops page with the HQ still 99, all four categories at 100 otherwise; LCP 1.5–1.7 s mobile. The blind
re-score runs before the deploy, on the real S0 and S1 pages.

## UX controls (3 Nov): the steering stick, the footer fade, the board zoom

`qa/ux-smoke.mjs` drives the three changes from IBuyTheTop's note and Ben's ideas end to end, against the worktree's
server on 8767 (`PORT=8767 node qa/serve.mjs`; the race and arcade API allow 8766 only, so their CORS and 403 console
lines are ignored there):

```sh
node qa/ux-smoke.mjs http://localhost:8767                      # every part
node qa/ux-smoke.mjs http://localhost:8767 --part=zoom --shots  # the zoomed state to qa/shots/eco-focus-<w>-<theme>.png
node qa/ux-smoke.mjs http://localhost:8767 --part=zoom,footer --reduced
```

Parts: `stick` (the floating stick on a 375 px touch page: value, knob, full lock past the edge, release on blur),
`footer` (fades after a moment on the throttle, back after a moment still, the touch bar never moves), `zoom` (the
camera lands on the board pose while the car stops where it is, the HUD hides, Escape or Back returns), `landscape`
(no closed sheet paints at 844 by 390), `triggers` (See it on the board, the Zoom in card, Not now) and `save` (the
PNG download). The world's clock runs slower than the wall clock under software rendering, so every check waits on
the state it expects rather than on a timer.

## Awwwards pass (4 Nov): the world's own kit loop

The loop above, run on the world for the first time (the Check page and the stops page had it; the world had only
the automated audit). Branch `awwwards`.

1. The eight-width shoot of every state in both themes on main (the "before" set), audit clean.
2. Two informed reviews of it, one per theme, given the kit README, the house rules and the states: dark 6.8, light
   6.5 (hierarchy 7, layout 6–6.5, typography 7, colour and kit rules 7.5, accessibility 6–6.5, states 6–6.5).
   Fifteen findings each, most shared: the race invite squeezing its message to a word a line at 375; sheets
   opening scrolled past their title (the browser's default focus went to the first control, past the fold) and
   the name forms raising a phone's keyboard; exit labels in two wordings and two positions; an odd stat tile beside
   an empty cell; the arrive card's grey eyebrow and hint at about 2:1 over grass; "You you" on your own row; the
   pad prompt with no cue on touch; the black scrim muddying the light scene; the intro's wall of text on phones.
3. The fixes, then a blind re-score by a fresh reviewer given only the after-frames at 375, 768 and 1280 and the
   kit README: 6.5 (hierarchy 7, layout 6, typography 7, colour and kit rules 7, accessibility 7, states 6). Its
   defects fixed: an orange focus box round the title a shared link lands on (the heading focus from step 2, now
   without a ring); long sheets with no visible way out on a phone (each sheet's own action row is now sticky at
   the sheet's bottom edge; measured flush at 375 and 1280, and in its natural place when the sheet does not
   scroll); Join indistinguishable from Not now; "10." overhanging the top 10 and the next district crowding it;
   the HUD title wrapping in one theme because "Light" is wider than "Dark". Left as taste or for Ben: the stop
   sheet's filled Docs pill, the two post actions on the lap sheet, the title card repeated as the intro's heading,
   Map view as a list, the arcade game's start screen taller than its frame, mono-caps chips against Atkinson pills.
4. A second blind read, spawned too early: it scored 6 on frames shot before step 3's fixes, and its three leading
   defects (the last line cut above the buttons, the action bar floating above the sheet's edge, a blank Join in
   the light theme) were those fixes, measured flush and legible afterwards. It added one real point, the guide
   lede at 78 characters against the kit's 46ch, fixed. A third read runs on the gate shoot's frames.
5. The third blind read, on the gate shoot's frames at 375, 1280 and 1440: 6.5 (hierarchy 7, layout 6, typography
   7, colour and kit rules 7, accessibility 7, states 6). Its real points, fixed: scrolled text under the pinned
   row read as cut mid-line (a soft fade now sits over the row's top margin); Map view carried two "Keep driving"
   pills once the row was pinned (the header one went); the intro's keycaps stretched to their grid column; the
   stop labels floating over the world showed above a sheet's edge like a heading (hidden while a sheet is open);
   a shared link's sheet said "Keep driving" to someone who had not driven ("Start driving" there). Its claim that
   a deep-linked sheet's figures render in Inter did not hold: the computed face is Geist Mono and all three kit
   fonts are loaded about a second into the page, long before the sheet opens (the world page now preloads them,
   which keeps it that way on a slow connection).
   Left: the arcade game's start screen taller than its frame, the two boards on that sheet, mono-caps chips beside
   Atkinson pills, the lap sheet's five pills, the guide title's hyphen, Map view as a list.
6. The gate, run again after those fixes: `pnpm test`, the monuments, UX, guide and deep-link smokes, the twelve-width shoot, Lighthouse through
   the SEO toolkit on the local world page (accessibility 100, was 92 in production; best practices 96; SEO 100;
   performance reported, not gated).

Lessons: the shoot's audit never sees a sheet that opens scrolled, a focus ring on a heading or a prompt peeking
out under a sheet, so a human read of the frames stays in the loop; a sticky element's constraint rectangle in
Chrome excludes the scroll container's padding, so a bar meant to sit flush with a padded sheet's edge needs a
negative `bottom` of the padding's size; `:focus-visible` matches a heading focused by script at load, so a
shared link shows the ring unless the heading opts out.

## The Lagoon venue page (5–6 Nov 2026): the first venue's kit loop

The first page beyond the hub. Shot with `node qa/shoot-eco.mjs <base> --page=/ecosystem/tracks/lagoon/` (states grid, drive,
intro, jump, loading, map, peers, portalIn, portalOut, race; frames `eco-lagoon-*`). Scores on the six pillars:

| Read | Overall | Notes |
|---|---|---|
| First score (gate) | 7.3 | 11 defects: hub copy and panels carried onto the venue (Map lede and rows, footer, share image), the gantry clipped at 375 and 768, shoot states that did not exercise what they named |
| Re-score after the fix wave | 8.1 | 10 of 11 fixed; the gantry clipping left (the hub clips the same at 375: a camera framing fix for both pages) |
| Blind re-score (fresh reviewer, frames only) | 6.6 | 21 defects; 14 are the hub's shared UI the venue inherits (HUD sub-line, intro focus ring, lap sheet autofocus, Map view type mix, the emoji wave control) and went to a hub backlog; the venue-only ones were fixed in a second scoped pass |
| Final re-score | 8.3 | the venue's own work 8.9 with the hub-shared items excluded; left: the ramp deck in the jump camera's foreground, the Map's Music row below the fold at 375, gate 3's sign clipped in the jump frame |

Lighthouse on the venue page: accessibility 100, SEO 100, best practices 100 once the worker knew the track (96 while it
answered 404 for its board). Phone tier against the hub, driving on the start straight: 40 draw calls vs 72, 316K triangles
vs 339K, 1.0 ms script vs 1.8 ms, both at the display's 8.3 ms cap.

The hub-unchanged proof with a venue road present: the Raceway canvases and the board hash identical to main, the ground
hash identical outside a 60 m window round the venue road, its arch and its tree belt, and the mesh delta accounted for
item by item (the road, the arch sign and beam, the belt): the masked rule replaces the whole-grid hash now that a road
exists by design.

## Multiplayer smoke (`qa/peers-smoke.mjs`)

```sh
PORT=8766 node qa/serve.mjs &           # the site, with the production CSP headers
NO_ROOM=1 node qa/peers-smoke.mjs       # room-free: no worker needed
node qa/peers-smoke.mjs                 # also runs the part that needs a live room (local worker on 8787)
```

The first section is the **zones** check and needs no room: the page's hooks inject a hub peer and a venue peer, then it asserts
that only the own zone is drawn, `online` counts everyone (me plus both), `zones` is `{ hub: 2, lagoon-v1: 1 }`, the who's-here
sheet labels the venue row ("on …") and leaves the hub row bare, and a `4001`/`dup` close ends in the final `dup` state
(chip "In another tab", aria-label "This device is driving in another tab", note shown, no reconnect in 5 s) while an ordinary
close (1006) does reconnect. `NO_ROOM=1` stops after that section. Without it the smoke goes on to the live-room checks.
The pure parts (`hiMessage`, `safeDevice`, which keep a blocked `localStorage` from stopping the `hi`) are in `qa/peers-unit.mjs`.
