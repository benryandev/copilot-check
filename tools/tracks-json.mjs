// Generates ecosystem/tracks/tracks.json, the numbers the leaderboard worker reads so no track number is typed twice.
// Run: node tools/tracks-json.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { resolveTrack } from "../ecosystem/js/track-math.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tracksDir = resolve(root, "ecosystem/tracks");
const resultsDir = resolve(root, "tools/lapsim/results");
const outFile = resolve(tracksDir, "tracks.json");

// The Raceway is pinned to the worker's constants of 1 Nov 2026 so the worker can switch over with no behaviour change.
const PINS = {
  "realfi-v1": {
    length: 642, minMs: 22138, maxSpeed: 29, segMaxSpeed: 36,
    note: "pinned to the worker constants of 1 Nov 2026 until the optimiser-derived limits are adopted",
  },
};

export async function generate() {
  const out = {};
  const files = readdirSync(tracksDir).filter((f) => f.endsWith(".js")).sort();
  for (const file of files) {
    const short = file.slice(0, -3);
    const mod = (await import(pathToFileURL(resolve(tracksDir, file)).href)).default;
    const def = typeof mod === "function" ? mod({ origin: [0, 0], angle: 0 }) : mod;
    const t = resolveTrack(def);
    const rf = resolve(resultsDir, `${short}.json`);
    const res = existsSync(rf) ? JSON.parse(readFileSync(rf, "utf8")) : null;
    const floorMs = res?.floorMs ?? def.floorMs;
    const limits = res?.limits ?? def.limits;
    const entry = { name: def.name, checkpoints: [...t.checkpoints], length: Math.floor(t.len) };
    if (floorMs != null) entry.minMs = Math.round(0.97 * floorMs);
    if (limits?.maxSpeed != null) entry.maxSpeed = limits.maxSpeed;
    if (limits?.segMaxSpeed != null) entry.segMaxSpeed = limits.segMaxSpeed;
    if (PINS[def.id]) Object.assign(entry, PINS[def.id]);
    out[def.id] = entry;
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = await generate();
  writeFileSync(outFile, JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", Object.keys(data).join(", "));
}
