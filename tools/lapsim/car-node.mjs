// Loads the real car physics in node. car.js imports the DOM-bound modules (three, build, GLTFLoader, freeze, post),
// so this reads its source, swaps those imports for stubs, points the relative imports at this worktree's
// ecosystem/js/ and imports the result from the temp directory. The physics text is not touched.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const JS_DIR = fileURLToPath(new URL("../../ecosystem/js/", import.meta.url));

export function stubbedCarSource(src = readFileSync(join(JS_DIR, "car.js"), "utf8")) {
  const stubs = [
    [/^import \* as THREE from .*$/m, "const THREE = {};"],
    [/^import \{[^}]*\} from "\.\/build\.js";$/m, "export const colliders = [];"],
    [/^import \{ GLTFLoader \} from .*$/m, ""],
    [/^import \{ markLive \} from .*$/m, "const markLive = (o) => o;"],
    [/^import \{ glowIntensity \} from .*$/m, "const glowIntensity = () => 1;"],
  ];
  for (const [re, to] of stubs) {
    if (!re.test(src)) throw new Error(`car.js no longer has the import this stub replaces: ${re}`);
    src = src.replace(re, to);
  }
  const base = pathToFileURL(JS_DIR).href;
  return src.replace(/(from\s+")\.\/([^"]+)"/g, (_, a, f) => `${a}${base}${f}"`);
}

/** A fresh copy of the car module, so each simulator owns its own collider list. */
export async function loadStepCar() {
  const dir = mkdtempSync(join(tmpdir(), "lapsim-car-"));
  const file = join(dir, "car-stubbed.mjs");
  writeFileSync(file, stubbedCarSource());
  const m = await import(pathToFileURL(file).href);
  return { stepCar: m.stepCar, colliders: m.colliders, CAR_R: m.CAR_R };
}
