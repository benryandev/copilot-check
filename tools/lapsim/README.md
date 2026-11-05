# Lap simulator

The real car physics (`ecosystem/js/car.js`) driven round a track's real terrain by a pursuit controller, with the race's
own gate timing. It is how the Raceway's floor (22.914 s) was found, and it is the tool for setting a new track's floor and
speed limits. It runs in node with no browser and no bundler. A lap takes about 20 ms.

## Files

- `car-node.mjs`: `loadStepCar()` reads `car.js`, swaps the `three`, `build.js`, `GLTFLoader`, `freeze.js` and `post.js`
  imports for stubs, points the `./` imports at this checkout's `ecosystem/js/`, writes it to the OS temp directory and imports
  it. The physics text is never edited, and nothing generated is committed. Each call returns a fresh copy with its own collider list.
- `sim.mjs`: `makeSim({ track, props, physics })` returns `{ runLap, pathFrom, ghostPath, project }`. `track` must be the one the terrain is configured for (`trackDef()`); any other throws, so a floor is never measured on the wrong height field.
  - `runLap(latFn, { thrFn, look, dt, startBack, startSpeed, log })` returns `{ ms, valid, reason, path, crossings, hits, wallHits }`. `latFn(s)` is the
    path's lateral offset (right of travel positive) at `s`; `thrFn(s)` the throttle there (on at 0.5 and up; off is a lift, a coast:
    there is no brake channel). Full throttle by default, so every line recorded before the throttle channel runs as it did.
    `wallHits` counts the wall contacts that begin during the lap; a floor is a clean lap (none).
  - `pathFrom(ctrl, DS)` makes a `latFn` from control offsets every `DS` m (Catmull-Rom). `throttleFrom(thr, DS)` makes a `thrFn`
    from one value per control point (a step: each holds for `DS` m around its point). `ghostPath(trace)` makes a `latFn` from a recorded lap.
  - `inletJump(speed, { wi, dt })` is the water jump alone: a straight approach on the centreline at exactly `speed` (the tops
    pinned there) from the first walls' end (the hairpin's exit) to the ramp, or from 30 m before it on a track without
    walls, returning the landing distance past the lip and whether it lands wet. The run-up was 30 m until lagoon-v2, whose
    ramp sits 2 m past the walls: a 30 m run-up started inside the hairpin and the 95% and 100% runs never took off.
  - `exitJump(v0, { dt })` is the jump from the hairpin's exit: the car on the centreline at the first walls' end
    (`track.walls[0].to`), heading along the track at `v0`, full throttle on the car's own physics, stepped to the landing or
    6 s. It returns `{ lip, past, wet, boost }`: `lip` the speed on the take-off frame, `past` metres past the lip at landing,
    `wet` and `boost` as `inletJump`'s. A track without an inlet or walls throws.
  - Colliders are `wallBoxes(wallSpots(track))` from `walls-math.js` plus the gantry posts, so the tool and the world agree on the walls.
  - `props: "cleared"` removes the bales, crate stacks and cones. This is the floor's convention: the record holders' laps
    were driven with the props knocked out of the way, and the floor must be a time a clean lap can approach. `props: "placed"` puts
    the Raceway's props back (the Raceway only: no other track has props) (they cost about 1.3 s on the leader's line, and a bale hit can break the line outright).
  - `physics` overrides the car's feel: `{ dirt: { top, pull, turn }, tarmac: { top, pull, turn, turnHigh, vLow, vHigh }, graze: { min, headOn, nudge } }`,
    any subset. `makeSim` resolves it once (`resolvePhysics`) and hands the resolved object to every `stepCar`; `sim.physics` is that object.
    `opt.mjs` and `analyse.mjs` take `--physics file.json` (an overrides object) and write the resolved physics under `physics` in their output;
    `analyse --write` records it in `results/<track>.json`.
- `opt.mjs`: the hill-climb over the lateral offsets and the throttle (a quarter of the moves lift or restore a run of 1 to 12
  control points). Each wall hit scores a second, so the best line is clean when a clean one exists; `DONE` says if it is not.
- `analyse.mjs`: splits, the per-sector table (time, centreline speed, the line's min and max), the lifts, wall hits, sector diffs against a ghost, path length, grass and air time, sensitivity to lookahead, frame rate, start
  speed and props, an SVG map, and `--write`.
- `cut.mjs`: `node tools/lapsim/cut.mjs --track <id>` prints both ratios. `cutLine(track, { wallsAsGates })` returns `{ L, ratio, path }`, the shortest polyline through the gate windows. With
  `wallsAsGates` (the default) each wall section also counts as a 4.5 m window every 6 m. `ratio` is `L` over the lap length.
- `results/<track>.json`: what `analyse.mjs --write` recorded. `results/realfi.json` is the Raceway's.

## Commands

`--track realfi` means the terrain's configured track (the hub's Raceway). Any other name is a track module,
`ecosystem/tracks/<name>.js`: the tool builds its venue entry as the venue page does (`entries.js` `venueEntry`) and configures
the terrain for it, so `--track lagoon` measures the Lagoon on its own height field.

```
node tools/lapsim/opt.mjs --track realfi --seed <ghost.json|centreline|ctrl.json> --rng 11 --iters 4000 --out out.json [--amp 0.5]
node tools/lapsim/analyse.mjs --track realfi --line out.json [--ghost ghost.json] [--svg out.svg] [--write] [--dt 60]
node tools/lapsim/cut.mjs --track lagoon
```

`--seed` is a ghost file (`{ ghost: { trace } }`), the word `centreline`, or a line file (`{ ctrl, DS, look }`). The optimiser
writes the best line to `--out` every 250 iterations. 500 iterations take about 11 s, and 4000 take several minutes.

`--dt` is the lap's step as frames per second (60 by default, the floor's convention). On a track with an inlet, analyse also
sweeps the jump at shares of tarmac top at 1/60 and 1/30 (wet or dry, metres past the lip) and `--write` records it under `inlet`.
A track with walls and an inlet also gets the exit sweep, `exitJump` from 0, 5, 8, 10, 12, 15, 20 and 23 m/s at both steps,
recorded under `inlet.exit` with `from` (the walls' end), `lipDist` (the lip's distance past it) and each step's `wadesUpTo`
(the highest start speed that lands wet).

`--write` records `floorMs` (the analysed line's time), `limits.maxSpeed` (the lap's average centreline speed times 1.08, rounded to
0.1) and `limits.segMaxSpeed` (the fastest sector's centreline speed times 1.15, rounded to 0.1). A sector's centreline speed is its
centreline distance (the gaps between gate `s` values, and the lap length less the last gate's `s` for the final sector) over its time.

The SVG is written as SVG only. To get a PNG, render it by hand:

```
qlmanage -t -s 2000 -o . out.svg
```

## Fixtures

`qa/fixtures/lapsim/ghost-ninja1-23034.json` is Ninja1's real 23.034 lap. `qa/fixtures/lapsim/line-realfi-22914.json` is the 22.914
floor line (108 control points at 6 m). `qa/lapsim-unit.mjs` pins them: the replay lands within 60 ms of the real lap, the floor
line within 40 ms of 22.914, the centreline flat out is 26.725 s, the three ramps are worth about 1.5 s, and the cut ratio is 87%.
If a pin moves, `car.js`, the terrain or the wall maths changed.

`qa/fixtures/lapsim/line-lagoon-29694.json` is the Lagoon's floor line on lagoon-v2 (142 control points at 6 m, with its
throttle): the best clean lap of three optimiser runs from the centreline at 4000 iterations on the relaid layout of 6 Nov 2026
(rng 7 29.694, rng 11 29.980, rng 3 30.603, all clean, with the crest walled; the floor is the best clean lap). The pins: it
replays within 50 ms of 29.694 with no wall hits, it lifts below 27 m/s for Turn 1, it lands the jump dry, its offset spans 3 m or more across the walled
kink, the brow holds it 1.5 m or more above the flat at the crest's peak (walls along the crest keep it on the road there), the inlet's straight approach lands wet at 85% of
tarmac top and dry at 92% at 1/60 and 1/30, and from the hairpin's exit (`exitJump`) it wades from 0 and clears from 20.

## Fragility worth knowing

A line tuned to the millisecond is sensitive: a different lookahead, 1/120 s steps or another start speed can turn a 22.9 s
lap into a missed checkpoint. `analyse.mjs` prints that sensitivity on purpose. Treat the floor as the time at `look 9`, 1/60 s,
24 m/s.
