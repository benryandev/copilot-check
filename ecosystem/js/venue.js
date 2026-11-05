// A venue page's entry: the slug comes from the page's own path (/ecosystem/tracks/<slug>/), the track from its module.
import { runWorld } from "./runner.js";
import { venueEntry } from "./entries.js";
import { venueSlug } from "./deeplink-math.js";

const slug = venueSlug(location.pathname);
if (!slug) throw new Error(`venue.js: no venue in ${location.pathname}`);
const mod = await import(`../tracks/${slug}.js`);
runWorld(venueEntry(mod.default, { slug }));
