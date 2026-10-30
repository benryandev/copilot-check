// District colours that need a different shade in light mode to stay visible (the community map's
// white disappears on a light plaza). Everything that paints a district colour goes through tint().

const LIGHT_SWAP = { 0xcbd5e1: 0x64748b };
let dark = false;
export const setDark = (v) => (dark = v);
export const tint = (c) => (!dark && LIGHT_SWAP[c]) || c;
