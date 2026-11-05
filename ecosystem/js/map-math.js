// The Map sheet's pure parts (no DOM, no three.js), so node can test them (qa/hud-unit.mjs).

/** A venue's lap-record row (R31): the board's best when the board has one, else this device's best, else an invitation.
 * `board` is race.js raceBoard() ({ status, top }), `best` the device's best ({ ms }) or null, `fmt` the lap clock format. */
export function venueRecord(board, best, fmt) {
  const top = board?.status === "ok" ? board.top?.[0] : null;
  if (top) return { source: "board", title: "Lap record", text: `${top.name}, ${fmt(top.ms)}` };
  if (best) return { source: "device", title: "Your best lap", text: `${fmt(best.ms)} on this device` };
  return { source: null, title: "Lap record", text: board?.status === "offline" ? "The board is offline. Race a lap to set your best." : "No laps yet. Race one to set the first." };
}
