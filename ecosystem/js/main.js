// Strike ecosystem world: the hub. The world itself is runner.js; the hub is its entry (entries.js).
import { runWorld } from "./runner.js";
import { hubEntry } from "./entries.js";
runWorld(hubEntry());
