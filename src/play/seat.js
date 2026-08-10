/*
 * The one grammar: every citizen owns a number for the whole match.
 *
 * This file is four short functions, and it is a file rather than four lines
 * inlined in three places because the rule it encodes is the foundation the
 * tray, the private card, the nameplates and (next gate) the ledger and the
 * intent strip all stand on. The moment two of them disagree about which
 * citizen `3` names, the keyboard means two different things on one screen.
 *
 * The rule, from design/handoff/floor-and-hud/README.md:
 *
 *   - the number comes from the engine's ROSTER ORDER (`player.id`), never from
 *     where somebody is standing, never from how close they are to you, and
 *     never from a filtered list of options;
 *   - it never changes when somebody dies — a dead citizen keeps their number
 *     and the number is retired, never handed to anyone else;
 *   - it is the key you press to name them, everywhere a citizen is named.
 *
 * Positional numbering is the thing this exists to prevent. It is the obvious
 * implementation — `options.map((id, i) => i + 1)` — and it is wrong in a way
 * that only shows up in play: the nomination list drops term-limited citizens,
 * so `2` was Chen on Monday and Eze on Tuesday, and the player who has learned
 * the square has learned nothing.
 *
 * Seat 10 (roster id 9) gets `0`, because there is no `10` key. Ten is the
 * largest table the engine deals, so this is the whole of the exception.
 *
 * Imports nothing, knows no engine module, and holds no state.
 */

/** The permanent number a citizen is known by, 1-based off roster order. */
export function seatNumber(id) {
  return id + 1;
}

/** The key that names them. `0` is seat 10; there is no other special case. */
export function seatKey(id) {
  return id === 9 ? '0' : String(id + 1);
}

/**
 * Which citizen a keypress names, or null if the key names nobody.
 *
 * The inverse of seatKey and deliberately written as one: a second mapping
 * derived by hand is how `0` ends up meaning seat 10 in the tray and nothing at
 * all in the panel.
 */
export function seatFromKey(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  if (key === '0') return 9;
  if (key >= '1' && key <= '9') return Number(key) - 1;
  return null;
}

/** A citizen's name, from the player-safe view and nowhere else. */
export function seatName(view, id) {
  if (id == null) return null;
  const p = view.players.find((q) => q.id === id);
  return p ? p.name : '#' + id;
}

/**
 * How a citizen is written wherever one is named: "3 Chen".
 *
 * The number leads because the number is the key, and a player scanning for
 * something to press should not have to read a name to find it.
 */
export function seatLabel(view, id) {
  if (id == null) return 'nobody';
  return seatNumber(id) + ' ' + seatName(view, id);
}

/** "2 Bo and 5 Eze", "2 Bo, 5 Eze and 6 Fin", "nobody". */
export function seatList(view, ids) {
  const parts = (ids || []).map((id) => seatLabel(view, id));
  if (!parts.length) return 'nobody';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}
