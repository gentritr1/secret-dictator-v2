/*
 * How long the square takes to answer.
 *
 * The owner played Gate 1 and said the match was "a bit repetitive but okay",
 * and diagnosed it themselves: the bots answer instantly, real people take
 * time. Two of the transitions were literally instantaneous — naming a Deputy
 * opened the ballot box in the same frame, and casting a ballot had the tally
 * ready before the panel had finished closing — because both are one call into
 * `Driver.step` triggered by the human's own submission.
 *
 * This file is the clock for that, and it is ONLY a clock.
 *
 * THE CONSTRAINT, which is the whole reason this is a separate file
 * ----------------------------------------------------------------
 * Timing must never change what happens. The engine's notion of chance is one
 * seeded stream and the bots draw from it; a single extra draw taken by the
 * presentation layer would desynchronise every later bot decision from the same
 * seed and quietly invalidate every recorded action log in docs/.
 *
 * So this module:
 *
 *   - imports nothing at all, and is handed a plain integer seed;
 *   - owns its OWN generator, salted away from the engine's, so a draw here
 *     cannot be a draw there even by accident;
 *   - returns numbers that are only ever passed to `setTimeout`.
 *
 * The platform's built-in unseeded generator is deliberately not used. It would
 * work — these values only ever become millisecond delays — but src/play/
 * containing no unseeded randomness at all is a gate this project has relied on
 * since Step 4, and a reproducible presentation layer costs one function. A
 * replayed match now has the rhythm of the original too, which is what makes a
 * recording of a pacing complaint worth anything.
 *
 * test/pace.test.js proves the constraint rather than asserting it: it plays
 * the same seeded match twice with the same human actions, once plainly and
 * once with pace draws interleaved between every single engine call, and
 * requires byte-identical event logs.
 */

/**
 * How long a bot takes to act, in milliseconds at 1x, per PHASE — because the
 * phase is what the square is doing, and it is public (it comes off the view,
 * never off the game object).
 *
 * The shape of the numbers is the point, not the numbers themselves:
 * deliberation is longest where the decision is hardest and most private (the
 * two legislative draws, where somebody is deciding what to throw away), and
 * shortest where the beat is bookkeeping.
 *
 * The pace control on the page divides these, so 4x lands near the flat 900 ms
 * that Gate 1 shipped — the old behaviour is still available, it is just no
 * longer the default.
 */
export const PHASE_DELAY = {
  nomination:          [1500, 3000],
  vote:                [1400, 2200],
  vote_result:         [600, 900],
  legislative_speaker: [2200, 3400],
  legislative_deputy:  [2200, 3400],
  block_response:      [1600, 2600],
  chaos:               [700, 1000],
  power:               [1800, 3000],
  game_over:           [600, 900]
};

const DEFAULT_DELAY = [900, 1200];

/**
 * The beat after one of YOUR submissions when the rules immediately owe you
 * another decision.
 *
 * Keyed by the decision now owed, because that is what the square is busy
 * producing. Shorter than a bot's deliberation: this is the pause before your
 * own next move, and a long one reads as the game being slow rather than the
 * square being thoughtful.
 */
export const BEAT = {
  vote: 1500,
  'acknowledge:vote_result': 1700,
  'acknowledge:chaos': 1400,
  'acknowledge:morning': 900,
  nominate: 1200,
  speaker_discard: 1500,
  deputy_discard: 1500,
  block_response: 1400,
  power_target: 1600,
  'power_ack:foresight': 1600
};

const DEFAULT_BEAT = 1000;

/** The key BEAT and the objective line agree on, for one pending decision. */
export function beatKey(waiting) {
  if (!waiting) return null;
  return waiting.gate ? waiting.kind + ':' + waiting.gate : waiting.kind;
}

/**
 * A generator that is not the engine's.
 *
 * Same mulberry32 the engine uses — there is no reason to invent a second
 * algorithm — but a different, salted seed and a different object, so the two
 * streams cannot be confused for one another. The salt is a constant, so the
 * rhythm of a replayed match matches the original.
 */
function makeStream(seed) {
  let s = (seed ^ 0x5f356495) >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return function nextUnit() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} seed  the match seed — used only to make the rhythm
 *                       reproducible. Nothing derived from it reaches the rules.
 */
export function createPace(seed) {
  const nextUnit = makeStream(seed >>> 0);
  let draws = 0;

  function scale(ms, speed) {
    const s = Number(speed) > 0 ? Number(speed) : 1;
    return ms / s;
  }

  return {
    /** How long before the bots take their next action in `phase`. */
    delayFor(phase, speed) {
      const band = PHASE_DELAY[phase] || DEFAULT_DELAY;
      draws++;
      return scale(band[0] + nextUnit() * (band[1] - band[0]), speed);
    },

    /**
     * The pause after your own submission, before the decision it produced
     * becomes answerable. Not jittered: a beat you are waiting through on
     * purpose should be the same length every time, or it reads as lag.
     */
    beatFor(waiting, speed) {
      const key = beatKey(waiting);
      return scale((key && BEAT[key]) || DEFAULT_BEAT, speed);
    },

    /** For a test or a review: how many times the presentation stream was drawn. */
    get draws() { return draws; },
    bands: PHASE_DELAY
  };
}
