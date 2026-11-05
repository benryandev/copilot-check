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
    pinned there) from 30 m before the ramp, returning the landing distance past the lip and whether it lands wet.
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

`qa/fixtures/lapsim/line-lagoon-29598.json` is the Lagoon's floor line (141 control points at 6 m, with its throttle): the
optimiser from the centreline, rng 11, 4000 iterations, on the layout of plan 5. The pins: it replays within 50 ms of 29.598
with no wall hits, it lifts below 27 m/s for Turn 1, it lands the jump dry, and the inlet's straight approach lands wet at
85% of tarmac top and dry at 92% at 1/60 and 1/30. Other seeds land within 0.13 s of it (rng 7: 29.469).

## Fragility worth knowing

A line tuned to the millisecond is sensitive: a different lookahead, 1/120 s steps or another start speed can turn a 22.9 s
lap into a missed checkpoint. `analyse.mjs` prints that sensitivity on purpose. Treat the floor as the time at `look 9`, 1/60 s,
24 m/s.
