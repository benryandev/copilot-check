# Lap simulator

The real car physics (`ecosystem/js/car.js`) driven round a track's real terrain by a pursuit controller, with the race's
own gate timing. It is how the Raceway's floor (22.914 s) was found, and it is the tool for setting a new track's floor and
speed limits. It runs in node with no browser and no bundler. A lap takes about 20 ms.

## Files

- `car-node.mjs`: `loadStepCar()` reads `car.js`, swaps the `three`, `build.js`, `GLTFLoader`, `freeze.js` and `post.js`
  imports for stubs, points the `./` imports at this checkout's `ecosystem/js/`, writes it to the OS temp directory and imports
  it. The physics text is never edited, and nothing generated is committed. Each call returns a fresh copy with its own collider list.
- `sim.mjs`: `makeSim({ track, props, physics })` returns `{ runLap, pathFrom, ghostPath, project }`. `track` must be the one the terrain is configured for (`trackDef()`); any other throws, so a floor is never measured on the wrong height field.
  - `runLap(latFn, { look, dt, startBack, startSpeed, log })` returns `{ ms, valid, reason, path, crossings, hits }`. `latFn(s)` is the
    path's lateral offset (right of travel positive) at `s`.
  - `pathFrom(ctrl, DS)` makes a `latFn` from control offsets every `DS` m (Catmull-Rom). `ghostPath(trace)` makes one from a recorded lap.
  - Colliders are `wallBoxes(wallSpots(track))` from `walls-math.js` plus the gantry posts, so the tool and the world agree on the walls.
  - `props: "cleared"` removes the bales, crate stacks and cones. This is the floor's convention: the record holders' laps
    were driven with the props knocked out of the way, and the floor must be a time a clean lap can approach. `props: "placed"` puts
    the Raceway's props back (they cost about 1.3 s on the leader's line, and a bale hit can break the line outright).
  - `physics` overrides the car's feel: `{ dirt: { top, pull, turn }, tarmac: { top, pull, turn, turnHigh, vLow, vHigh }, graze: { min, headOn, nudge } }`,
    any subset. `makeSim` resolves it once (`resolvePhysics`) and hands the resolved object to every `stepCar`; `sim.physics` is that object.
    `opt.mjs` and `analyse.mjs` take `--physics file.json` (an overrides object) and write the resolved physics under `physics` in their output;
    `analyse --write` records it in `results/<track>.json`.
- `opt.mjs`: the hill-climb over the lateral offsets.
- `analyse.mjs`: splits, sector diffs against a ghost, path length, grass and air time, sensitivity to lookahead, frame rate, start
  speed and props, an SVG map, and `--write`.
- `cut.mjs`: `cutLine(track, { wallsAsGates })` returns `{ L, ratio, path }`, the shortest polyline through the gate windows. With
  `wallsAsGates` (the default) each wall section also counts as a 4.5 m window every 6 m. `ratio` is `L` over the lap length.
- `results/<track>.json`: what `analyse.mjs --write` recorded. `results/realfi.json` is the Raceway's.

## Commands

`--track realfi` means the terrain's configured track (the hub's Raceway). Any other name is an error until the terrain can be
re-configured per track.

```
node tools/lapsim/opt.mjs --track realfi --seed <ghost.json|centreline|ctrl.json> --rng 11 --iters 4000 --out out.json [--amp 0.5]
node tools/lapsim/analyse.mjs --track realfi --line out.json [--ghost ghost.json] [--svg out.svg] [--write]
```

`--seed` is a ghost file (`{ ghost: { trace } }`), the word `centreline`, or a line file (`{ ctrl, DS, look }`). The optimiser
writes the best line to `--out` every 250 iterations. 500 iterations take about 11 s, and 4000 take several minutes.

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

## Fragility worth knowing

A line tuned to the millisecond is sensitive: a different lookahead, 1/120 s steps or another start speed can turn a 22.9 s
lap into a missed checkpoint. `analyse.mjs` prints that sensitivity on purpose. Treat the floor as the time at `look 9`, 1/60 s,
24 m/s.
