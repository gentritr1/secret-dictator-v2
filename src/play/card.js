/*
 * The private card: 232 x 96px, top-left, the only private thing on screen.
 *
 * Wireframe 4B of design/handoff/floor-and-hud/Secret Dictator - Build
 * Specs.dc.html, and the three rules that come with it:
 *
 *   - three lines at rest — number and name, role, who you know — and a FOURTH
 *     only while you are holding tiles, removed the instant you enact;
 *   - it never grows, never animates and never asks for a click;
 *   - it dims to 35% during night states, because the beam owns those frames;
 *   - it is the ONLY 2D element permitted role colour, anywhere in the game.
 *
 * "Never grows" and "a fourth line appears" are in tension in the wireframe,
 * which draws the tiles state as a taller box. The acceptance checklist settles
 * it — "the private card's pixel dimensions are identical in every state of
 * every match, tiles or no tiles" — so the box is a fixed 232 x 96 and the
 * fourth line is laid out INSIDE it. The card reserves the room whether or not
 * it is holding anything; a HUD element that changes size is a HUD element the
 * eye has to re-find. test/hud.test.js measures the declared box in both states.
 *
 * Like tray.js and objective.js this is a pure function of the player-safe view
 * and imports no engine module. It is the one place in the UI that reads
 * `view.you.role`, `view.known` and `view.peeked` — every other surface would be
 * a leak, and having exactly one of them is what makes "does anything else show
 * a role?" a question a test can answer.
 */

import { seatKey, seatName, seatNumber } from './seat.js';

/** The declared box. Not a suggestion — the style sheet reads the same numbers. */
export const CARD_BOX = { width: 232, height: 96, top: 12, left: 12 };

/** The three roles, which are also the three role colours. */
export const ROLES = ['loyalist', 'rebel', 'dictator'];

/**
 * Which decisions put tiles in your hand, and therefore add the fourth line.
 *
 * Exactly the three card decisions: the Speaker's three, the Deputy's two and
 * the Foresight read. Nothing else in the game ever hands a seat material only
 * it can see, which is why this list and the centred-card list are the same
 * list wearing two hats.
 */
const HAND_KINDS = ['speaker_discard', 'deputy_discard', 'power_ack'];

/**
 * @param {object} view  the player-safe projection for this seat
 * @param {object} [presentation] `{ night }` — whether the light is in one of
 *        the night states. A boolean, and the only thing the page tells the
 *        card that the view does not already say.
 * @returns {object} the card, as data. `lines` is 3 or 4 and is what the render
 *          asserts against; the box never changes either way.
 */
export function cardFor(view, presentation) {
  const p = presentation || {};
  if (!view) {
    return {
      number: null, key: null, name: '', role: null, alive: true,
      known: [], read: [], knowText: '', hand: null, lines: 3,
      night: !!p.night, box: CARD_BOX
    };
  }

  const you = view.you;

  /*
   * Who you know, and how you know it, in one line.
   *
   * Two different kinds of knowledge share the line because they answer the
   * same question — "who in this square is not a stranger to me" — and because
   * the card has one line for it and is not allowed a second. The Dictator
   * carries a brass mark rather than the word, since "3 Chen dictator" does not
   * fit 232px and the mark is the thing a Rebel actually scans for.
   */
  const known = Object.keys(view.known).map(Number)
    .filter((id) => id !== you.id)
    .sort((a, b) => a - b)
    .map((id) => ({
      id: id, number: seatNumber(id), key: seatKey(id),
      name: seatName(view, id), role: view.known[id],
      mark: view.known[id] === 'dictator'
    }));

  const read = Object.keys(view.peeked).map(Number)
    .sort((a, b) => a - b)
    .map((id) => ({
      id: id, number: seatNumber(id), key: seatKey(id),
      name: seatName(view, id), team: view.peeked[id]
    }));

  /*
   * The tiles, and only while they are genuinely in your hand.
   *
   * `waitingFor.detail.tiles` is where the projection puts private material,
   * and it exists only for the seat that has to act on it and only while it
   * does — so "removed the instant you enact" needs no clock and no flag: the
   * decision is gone, the detail is gone, the line is gone.
   */
  const w = view.waitingFor;
  const hand = w && HAND_KINDS.indexOf(w.kind) !== -1 && w.detail && w.detail.tiles
    ? w.detail.tiles.slice()
    : null;

  return {
    number: seatNumber(you.id),
    key: seatKey(you.id),
    name: you.name,
    role: you.role,
    alive: you.alive,
    known: known,
    read: read,
    knowText: knowTextFor(known, read),
    hand: hand,
    /* What the hand line says it is: the Speaker's three are a draw, the
     * Deputy's two were passed, Foresight is a read of the deck. */
    handKind: hand ? (w.kind === 'power_ack' ? 'on top' : 'in hand') : null,
    lines: hand ? 4 : 3,
    night: !!p.night,
    box: CARD_BOX
  };
}

/** The third line, as text. Exported shape, so a test can read it without a DOM. */
function knowTextFor(known, read) {
  const parts = [];
  if (known.length) {
    parts.push('you know ' + known
      .map((k) => k.number + ' ' + k.name + (k.mark ? ' ✦' : '')).join(' · '));
  }
  if (read.length) {
    parts.push('read ' + read.map((r) => r.number + ' ' + r.name + ' ' + r.team).join(' · '));
  }
  /* A Loyalist knows nobody, and the line says so rather than disappearing —
   * a card whose third line comes and goes is a card that changes height. */
  if (!parts.length) return 'you know nobody';
  return parts.join(' · ');
}
