/*
 * The floor, out loud.
 *
 * src/engine/floor.js records what was said as ordinals; src/engine/orator.js
 * decides what a citizen says. Neither of them knows a name, a sentence or a
 * millisecond, and neither of them should. This file is the third piece: it
 * drives the recorder beside the running match, turns each `text_id` into
 * prose, and hands the result to the bubble system src/play/murmur.js already
 * owns.
 *
 * IT IMPORTS NOTHING, like pace.js and murmur.js before it, and for the same
 * reason: `createFloorVoice` is handed `Floor` and `Orator` rather than
 * importing them, so this module cannot reach an engine module a later edit
 * decides to add, cannot reach `G`, and cannot draw from the seeded stream even
 * by accident. What it owns is a clock and a vocabulary.
 *
 * TWO STREAMS, AND WHY THEY ARE TWO
 * ---------------------------------
 *   - WHAT is said comes from the orator's stream, `Orator.streamFor(seed)`.
 *   - WHEN it appears, and WHETHER a given trigger is worth convening the
 *     square for at all, comes from this file's own stream.
 *
 * Keeping them apart is what makes the record independent of the frame rate:
 * a floor's whole argument is selected and written the moment the floor opens,
 * synchronously, and only its DISPLAY is spread over the next few seconds. So
 * the same seed produces the same argument whether the page ran at 1x, at 4x,
 * in a background tab, or not at all. If the words were chosen beat by beat off
 * a wall clock, a dropped frame would change the record.
 *
 * SCARCITY IS A PRESENTATION DECISION, NOT A RULE
 * -----------------------------------------------
 * `triggers()` reports every floor the record would allow, and D1's sweeps
 * opened one for every single report — about thirty floors a match. A square
 * that convenes thirty times a game is not a square, it is a queue. `CONVENE`
 * below is the same scarcity gate `BEATS` is in murmur.js: a per-trigger
 * chance, drawn off this file's own stream, so a replayed seed convenes the
 * same floors in the same order. It is a taste dial and it is one object
 * literal, deliberately.
 *
 * The consequence worth stating: the utterance record a browser match produces
 * is NOT the record test/orator.test.js's harness produces for the same seed,
 * because the harness convenes every floor. Both are deterministic; they are
 * deterministic functions of different things.
 *
 * WHAT MAY BE SAID
 * ----------------
 * Every sentence here is authored, keyed by `text_id`, and rendered twice from
 * one entry — first person for the bubble over the speaker's head, third person
 * for a log or a ledger — which is the whole reason the record carries an id
 * instead of a string. A sentence may name the speaker's TARGET and nothing
 * else: every other citizen in the square is somebody the utterance did not
 * publicly involve, which is the same whitelist rule objective.js and murmur.js
 * already follow. No sentence carries a role or team word; the schema makes
 * that unrepresentable in the record, and `test/murmur.test.js` sweeps the
 * prose so it stays unrepresentable on screen too.
 */

/** How long before the first beat of a floor lands, in ms at 1x. */
export const FLOOR_OPEN_MS = [400, 900];
/** The gap between one beat and the next, in ms at 1x — the deliberation band. */
export const FLOOR_BEAT_MS = [1500, 2600];
/** How long one floor bubble lives, in ms at 1x. Longer than an idle murmur. */
export const FLOOR_LIFE_MS = [4200, 5400];

/**
 * Whether a trigger is worth convening the square for.
 *
 * A purge always is. A failed ballot usually is not — the square has just
 * spoken by voting, and a floor after every failed government is what turns
 * discussion into paperwork.
 */
export const CONVENE = { T1: 0.85, T2: 0.5, T3: 0.75, T4: 0.55, T5: 1 };

/* --------------------------------------------------------------- prose */

const TILE_WORD = { reform: 'Reform', seize: 'Seize' };

/** "two Seizes", "one Reform and one Seize", "three Seizes", "nothing". */
export function tilePhrase(counts) {
  if (!counts) return 'nothing';
  const parts = [];
  for (const tile of ['reform', 'seize']) {
    const n = counts[tile] || 0;
    if (!n) continue;
    parts.push(`${['no', 'one', 'two', 'three'][n] || n} ${TILE_WORD[tile]}${n > 1 ? 's' : ''}`);
  }
  if (!parts.length) return 'nothing';
  return parts.join(' and ');
}

/**
 * The sentence table.
 *
 * One entry per `text_id`, two renderings. `n(seat)` is the name lookup and is
 * the only thing in this file that knows a citizen has one.
 */
export const SENTENCES = {
  'claim.speaker.forced': {
    bubble: () => 'Every tile in my hand was a Seize. There was nothing else to pass on.',
    line: (u, n) => `${n(u.speaker)} says they drew ${tilePhrase(u.drawn)} and had no choice about what went on.`
  },
  'claim.speaker.choice': {
    bubble: (u) => `I drew ${tilePhrase(u.drawn)} and passed on ${tilePhrase(u.passed)}.`,
    line: (u, n) => `${n(u.speaker)} says they drew ${tilePhrase(u.drawn)} and passed on ${tilePhrase(u.passed)}.`
  },
  'claim.deputy.no_choice': {
    bubble: (u) => `I was handed ${tilePhrase(u.received)}. Look at what that leaves me.`,
    line: (u, n) => `${n(u.speaker)} says they were passed ${tilePhrase(u.received)} and had no choice.`
  },
  'claim.deputy.choice': {
    bubble: (u) => `I was handed ${tilePhrase(u.received)}, and I chose.`,
    line: (u, n) => `${n(u.speaker)} says they were passed ${tilePhrase(u.received)}.`
  },
  'claim.deputy.blocked': {
    bubble: (u) => `I was handed ${tilePhrase(u.received)}, and I moved to Block.`,
    line: (u, n) => `${n(u.speaker)} says they were passed ${tilePhrase(u.received)} and moved the Block.`
  },

  'accuse.contradiction': {
    bubble: (u, n) => `${n(u.target)}'s account does not stand up against the record.`,
    line: (u, n) => `${n(u.speaker)} says ${n(u.target)}'s account contradicts what is already on the record.`
  },
  'accuse.claim_consistency': {
    bubble: (u, n) => `${n(u.target)} has told this square two different stories.`,
    line: (u, n) => `${n(u.speaker)} sets two of ${n(u.target)}'s own claims side by side.`
  },
  'accuse.enactment': {
    bubble: (u, n) => `${n(u.target)} sat in the government that put that Seize on the board.`,
    line: (u, n) => `${n(u.speaker)} names ${n(u.target)} over the Seize their government enacted.`
  },
  'accuse.vote_pattern': {
    bubble: (u, n) => `Look at how ${n(u.target)} has been voting.`,
    line: (u, n) => `${n(u.speaker)} points at ${n(u.target)}'s ballots.`
  },
  'accuse.power_use': {
    bubble: (u, n) => `${n(u.target)} held that power. Ask them what they did with it.`,
    line: (u, n) => `${n(u.speaker)} names ${n(u.target)} over the power they held.`
  },
  'accuse.isolation': {
    bubble: (u, n) => `${n(u.target)} has kept clear of every government we have seated.`,
    line: (u, n) => `${n(u.speaker)} notes ${n(u.target)} has sat in none of the last three governments.`
  },
  'accuse.silence': {
    bubble: (u, n) => `${n(u.target)} has said nothing here twice now.`,
    line: (u, n) => `${n(u.speaker)} names ${n(u.target)} for staying silent on two floors.`
  },
  'accuse.gut': {
    bubble: (u, n) => `I do not like the look of ${n(u.target)}. That is all I have.`,
    line: (u, n) => `${n(u.speaker)} names ${n(u.target)} on nothing but a feeling.`
  },

  'support.partner': {
    bubble: (u, n) => `I sat with ${n(u.target)}. I will stand by what came out of it.`,
    line: (u, n) => `${n(u.speaker)} stands by ${n(u.target)}, the government they shared.`
  },
  'support.corroborate': {
    bubble: (u, n) => `${n(u.target)} is telling it as I heard it.`,
    line: (u, n) => `${n(u.speaker)} corroborates ${n(u.target)}.`
  },
  'support.claim_consistency': {
    bubble: (u, n) => `${n(u.target)} has said the same thing twice. That counts for something.`,
    line: (u, n) => `${n(u.speaker)} notes ${n(u.target)}'s two claims agree.`
  },
  'support.vote_pattern': {
    bubble: (u, n) => `${n(u.target)} has voted the way I would have.`,
    line: (u, n) => `${n(u.speaker)} backs ${n(u.target)} on the tallies.`
  },

  'question.hand': {
    bubble: (u, n) => `${n(u.target)} — what were you actually holding?`,
    line: (u, n) => `${n(u.speaker)} asks ${n(u.target)} what they were holding.`
  },
  'question.vote': {
    bubble: (u, n) => `${n(u.target)} — explain that ballot.`,
    line: (u, n) => `${n(u.speaker)} asks ${n(u.target)} to explain a ballot.`
  },
  'question.accusation': {
    bubble: (u, n) => `${n(u.target)} — on what, exactly?`,
    line: (u, n) => `${n(u.speaker)} asks ${n(u.target)} what their accusation rests on.`
  },
  'question.silence': {
    bubble: (u, n) => `${n(u.target)} — you have been very quiet.`,
    line: (u, n) => `${n(u.speaker)} asks ${n(u.target)} about their silence.`
  },

  /*
   * A silence is a beat that happened, so it gets a bubble — one glyph, plainly
   * not a sentence. Rendering it as prose ("says nothing") would put words in
   * the mouth of somebody who declined to speak, and rendering it as nothing at
   * all would make an answered question indistinguishable from a skipped turn.
   * A proper visual for a refusal belongs to the tray and the ledger.
   */
  'silence.question': {
    bubble: () => '…',
    line: (u, n) => `${n(u.speaker)} says nothing, and the question stands.`
  },
  'silence.accusation': {
    bubble: () => '…',
    line: (u, n) => `${n(u.speaker)} says nothing to it.`
  },
  'silence.floor_open': {
    bubble: () => '…',
    line: (u, n) => `${n(u.speaker)} has nothing to add.`
  }
};

/**
 * Render one utterance.
 *
 * Returns null for an unknown `text_id` rather than a placeholder: a missing
 * sentence must be a visible hole a sweep can count, not a "[claim.x.y]" that
 * ships to a player looking like a bug in the game rather than a gap in a
 * table.
 */
export function renderUtterance(u, names, how = 'bubble') {
  const entry = SENTENCES[u.text_id];
  if (!entry) return null;
  const n = (seat) => (names && names[seat] != null ? names[seat] : `citizen ${seat}`);
  return entry[how](u, n);
}

/* ------------------------------------------------------------ the clock */

/**
 * This module's own generator — the same mulberry32 the engine uses, a third
 * salt. pace.js has one, murmur.js has one, and copying it rather than sharing
 * it is what keeps each of these files importing nothing.
 */
function makeStream(seed) {
  let s = (seed ^ 0x3c6ef372) >>> 0;
  if (s === 0) s = 0xa5a5f01d;
  return function nextUnit() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTHING = { lines: [], until: 0, floor: null, convened: false };

/**
 * @param {object} deps
 *   Floor       src/engine/floor.js, injected rather than imported
 *   Orator      src/engine/orator.js, likewise
 *   seed        the match seed — the argument and its rhythm both replay from it
 *   humanSeat   the seat that takes no beats and is never targeted in D2
 *   names       seat -> name, for the prose only
 *   minds       the bots' minds, read-only (see orator.js)
 */
export function createFloorVoice(deps = {}) {
  const { Floor, Orator } = deps;
  const seed = (deps.seed >>> 0) || 1;
  const names = deps.names || [];
  const recorder = Floor.createRecorder();
  const memory = Orator.createMemory();
  const ctx = {
    draw: Orator.streamFor(seed),
    minds: deps.minds || null,
    memory,
    humanSeat: deps.humanSeat === undefined ? null : deps.humanSeat
  };
  const clock = makeStream(seed);

  let seen = 0;               // driver events already filed into the memory
  let acknowledged = 0;       // the last day whose morning report was answered
  let rejected = [];          // anything the schema refused — must stay empty
  let missing = {};           // text_ids with no sentence — must stay empty
  let convened = 0;           // floors actually held
  let declined = 0;           // triggers the scarcity gate turned down
  let decided = -1;         // the transition the convene roll was made for
  let nextLine = 1;
  let lastLines = [];

  function between(band, speed) {
    const s = Number(speed) > 0 ? Number(speed) : 1;
    return (band[0] + clock() * (band[1] - band[0])) / s;
  }

  function render(u) {
    const text = renderUtterance(u, names, 'bubble');
    if (text === null) missing[u.text_id] = (missing[u.text_id] || 0) + 1;
    return text;
  }

  function hold(spec, opts) {
    const held = Orator.holdFloor(recorder.record, spec, ctx);
    if (held.rejected.length) rejected = rejected.concat(held.rejected);
    convened++;

    const now = opts.now || 0;
    const speed = opts.speed || 1;
    let at = Math.max(now, opts.notBefore || 0) + between(FLOOR_OPEN_MS, speed);
    const lines = [];
    for (const u of held.utterances) {
      const text = render(u);
      const life = between(FLOOR_LIFE_MS, speed);
      const gap = between(FLOOR_BEAT_MS, speed);
      if (text !== null) {
        lines.push({
          id: `floor-${nextLine++}`,
          playerId: u.speaker,
          text,
          beat: 'floor',
          floor: true,
          utterance: u.id,
          kind: u.kind,
          /*
           * Whom the utterance publicly named, carried on the line so the
           * staging layer can ask "is this aimed at me" without reaching into
           * the record. It is the most public field there is — the bubble says
           * the name out loud over the speaker's head — and it is null for the
           * claims and the silences, which name nobody.
           */
          target: u.target === undefined ? null : u.target,
          at,
          until: at + life
        });
      }
      at += gap;
    }
    lastLines = lines;
    return { lines, until: at, floor: held.floor, convened: true };
  }

  /**
   * Decide once per public transition whether the square convenes.
   *
   * `decided` is what makes it once. `refresh()` is called from more places
   * than there are steps — a panel closing calls it, and so does a restart —
   * and a scarcity roll that happened twice for one transition would be two
   * chances at a floor and a stream that advances at the rate the UI happens
   * to redraw. The record would still be deterministic; it would just be
   * deterministic in the wrong variable.
   */
  function attempt(opts) {
    const ts = recorder.triggers();
    if (!ts.length) return NOTHING;
    if (recorder.record.serial === decided) return NOTHING;
    decided = recorder.record.serial;
    const spec = ts[0];
    const chance = CONVENE[spec.id] === undefined ? 1 : CONVENE[spec.id];
    if (clock() >= chance) { declined++; return NOTHING; }
    return hold(spec, opts);
  }

  return {
    get record() { return recorder.record; },
    /** The minds arrive with the match, after the voice is built. Read-only. */
    setMinds(minds) { ctx.minds = minds || null; return this; },

    /**
     * Fold one observation, file any new driver events into the private hand
     * memory, and — if a trigger fires and the square is minded to convene —
     * hold a whole floor at once.
     *
     * @param {object} G        the live game (read through Floor's public window)
     * @param {Array}  events   the session's driver events, consumed by index
     * @param {object} opts     { now, notBefore, speed, waiting, day }
     * @returns {{lines: Array, until: number, floor: object|null, convened: boolean}}
     */
    observe(G, events, opts = {}) {
      recorder.observe(G);

      /*
       * The hands are filed AFTER the fold, and the government is found by
       * matching the actor against the record rather than by reading whichever
       * government happened to be open. Reading the open one is correct only if
       * exactly one step happened since the last observation — which is true of
       * refresh() and false of runToEnd(), and a memory that is silently wrong
       * in fast-forward is a lie that only shows up in a review.
       */
      const list = events || [];
      for (let i = seen; i < list.length; i++) {
        memory.note(list[i], Orator.governmentFor(recorder.record, list[i]));
      }
      seen = list.length;

      /*
       * The transition that just happened gets its floor FIRST, and only then
       * is the morning acknowledged.
       *
       * That order is a D1 scar, not a preference: acknowledging publishes a
       * transition of its own, which becomes the record's `lastEvents`, and the
       * enactment or the purge that had just happened is swallowed by it. D1's
       * first scheduling sweep opened ZERO T4 and T5 floors across fifty
       * matches with powers and purges on every seed, for exactly this reason.
       */
      let out = attempt(opts);

      /*
       * T1's condition is "morning report acknowledged", and the engine has no
       * phase for it — human-driver.js owns that gate. The square has answered
       * it once the session is past it: the day has turned, nomination is up,
       * and nothing is waiting on a morning acknowledgement any more.
       */
      const waiting = opts.waiting || null;
      const morningPending = !!(waiting && waiting.kind === 'acknowledge' &&
        waiting.gate === 'morning');
      const day = recorder.record.day;
      if (!morningPending && !recorder.record.over && day > acknowledged &&
          recorder.record.phase === 'nomination') {
        acknowledged = day;
        recorder.acknowledgeMorning(day);
        /* One floor per observation. Two arguments cued in the same frame would
         * be two conversations on top of each other, and the second one would
         * be the one the bubble cap dropped. */
        if (!out.convened) out = attempt(opts);
      }
      return out;
    },

    /** What a scripted review needs, and nothing a panel could not draw. */
    report() {
      const record = recorder.record;
      return {
        utterances: record.utterances.length,
        floors: record.floors.length,
        convened,
        declined,
        openFloor: record.openFloor,
        day: record.day,
        rejected: rejected.slice(),
        missingSentences: Object.keys(missing),
        flags: recorder.flags().map((f) => ({
          id: f.id, rule: f.rule, class: f.class, seats: f.seats,
          refs: f.refs, addressed: f.addressed
        })),
        obligations: record.obligations.map((o) => ({
          question: o.question, target: o.target, discharged: o.discharged,
          silences: o.silences.length
        })),
        /* Third-person renderings, for reading a match back. The bubbles carry
         * the first-person half of the same entries. */
        said: record.utterances.slice(-12).map((u) => ({
          id: u.id, floor: u.floor, seq: u.seq, seat: u.speaker, kind: u.kind,
          target: u.target, basis: u.basis || u.about || u.prompted_by || null,
          text_id: u.text_id, text: renderUtterance(u, names, 'line')
        })),
        lastFloorLines: lastLines.map((l) => ({ seat: l.playerId, text: l.text }))
      };
    },

    /** Every ledger entry, for a review. A pure fold — see floor.js. */
    ledger() { return recorder.ledger(); },

    /**
     * Everything the ledger panel renders, as one projection.
     *
     * The entries are `Floor.ledger()` — the panel RENDERS that fold, it does
     * not recompute it — plus the parts of the record those entries are ids
     * into: the utterances they name, the governments and powers they sat in,
     * and the flags. A copy rather than the live record, for the reason __play
     * has always handed out projections: a surface that can be written to is a
     * surface somebody will write to.
     *
     * Everything in here came through `Floor.publicSnapshot`, so a permutation
     * of the roles this seat may not know leaves all of it byte-identical —
     * which is what makes the ledger's own permutation gate a statement about
     * the RENDER rather than a second test of the record.
     */
    source() {
      const record = recorder.record;
      const copy = (v) => JSON.parse(JSON.stringify(v));
      return {
        day: record.day,
        entries: recorder.ledger(),
        utterances: copy(record.utterances),
        governments: copy(record.governments),
        powers: copy(record.powers),
        purges: copy(record.purges),
        /* Floors are a trace target: `basis: silence` and `about: silence` both
         * reference the floors somebody was quiet on, so a row can point at one
         * and a reviewer must be able to resolve it. */
        floors: copy(record.floors),
        flags: copy(recorder.flags())
      };
    },
    /** The allowlist instrument, run over the live record. */
    audit() { return recorder.audit(); }
  };
}
