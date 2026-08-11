/*
 * The square murmurs.
 *
 * Layer 1 of "the core of this game is talk": v1 shipped a chatter bank in
 * src/engine/ai.js that nothing in v2 had ever called. This file calls it, and
 * puts the result over the citizens' heads as short-lived speech bubbles.
 *
 * It is a sibling of src/play/pace.js and obeys the same three rules, for the
 * same reason: it imports nothing, it owns its own generator, and nothing it
 * produces is allowed to reach the rules.
 *
 * THE SHARP EDGE — why this file exists at all
 * --------------------------------------------
 * `AI.chatter(G, minds, beat, ctx)` draws from `G.rng()`: once for how many
 * citizens speak, once per speaker pick (plus a retry loop that draws more),
 * once for the danger-pool branch, and once per line picked (plus its own
 * dedupe retry). The engine's whole notion of chance is that one seeded stream
 * and the bots draw from it, so calling chatter with the real `G` would shift
 * every later bot decision and quietly invalidate every recorded action log in
 * docs/. src/engine/ is byte-frozen, so the fix has to be caller-side.
 *
 * The fix here is a STAND-IN rather than a prototype facade over `G`.
 *
 * Read against the frozen ai.js, `chatter` touches exactly four things:
 *
 *     SD.alivePlayers(G)   -> G.players.filter(p => p.alive)
 *     p.isHuman            -> on those players
 *     G.seize              -> the one-tile-from-losing branch
 *     G.rng()              -> the draws
 *
 * and it reads `minds` not at all. All four are public — `alive`, `isYou` and
 * `seize` are on the player-safe view already — so the stand-in is built out of
 * the projection, not out of the game object. `Object.create(G)` with an own
 * `rng` would also work and was the obvious first design; this is strictly
 * stronger, because a module that never receives `G` cannot draw from its
 * stream by accident, cannot be made to leak a role by a later edit, and fails
 * loudly (undefined) rather than quietly if ai.js ever starts reading hidden
 * state. test/murmur.test.js proves the premise instead of trusting this
 * paragraph: it hands chatter a Proxy for `minds` that throws on any access at
 * all, and a deep-frozen stand-in that throws on any write.
 *
 * `minds` is deliberately passed as null for the same reason: a mind holds
 * `known`, i.e. every role that bot is certain of. Handing the presentation
 * layer that map to satisfy an unused parameter would put the whole hidden
 * state one property access away from a speech bubble, which is precisely what
 * src/engine/view.js exists to prevent.
 *
 * WHAT MAY BE SAID
 * ----------------
 * Two of v1's templates assert a hidden role as fact ("that was a loyalist and
 * you know it", "if that was the dictator we'd be done"). A murmur is prose on
 * screen next to a named citizen; a deduction game cannot print role tokens in
 * it, whether the claim is true, false or hypothetical. `keepable()` below is a
 * bright line rather than a blocklist of those two strings, so a template that
 * changes cannot walk through the gate. It also drops a citizen talking about
 * themselves in the third person, a citizen naming somebody the square has not
 * publicly been told about in this beat, and a first-person claim about a
 * private hand from anybody who was not holding it.
 *
 * Murmurs never enter `G.log`. SD.say() is not called and could not be — this
 * module has no game object. The official record of what the square has heard
 * stays exactly as long as it was before this layer.
 *
 * THE SECOND VOICE (D2)
 * ---------------------
 * `say()` takes lines somebody else authored — src/play/floor-voice.js renders
 * them from a validated utterance record — and puts them through THIS queue,
 * not a second one. Floor speech and idle chatter therefore share one answer to
 * "how many bubbles are up", one bubble per citizen, one rule about the dead
 * and the human's own seat, and one "dropped rather than shown late". Two
 * queues with two sets of caps would be two answers, and the first thing that
 * goes wrong with two answers is that they disagree — which is exactly the bug
 * the one-bubble-per-citizen hold was added for in the first place.
 *
 * `keepable()` does not apply to those lines: they come from a schema in which
 * an allegiance is unrepresentable, not from a v1 template bank. The bright
 * line still does. A line naming a role or a team is dropped and counted
 * (`barred`), so a bad sentence in a table is a number rather than a word on
 * screen.
 */

/** At most this many bubbles on screen at once. */
export const MAX_VISIBLE = 2;
/** How long one bubble lives, in ms at 1x. */
export const LIFE_MS = [4000, 6000];
/** How long after the beat the first murmur lands, in ms at 1x. */
export const OPENING_MS = [300, 1000];
/** The gap between the first and second murmur of one beat, in ms at 1x. */
export const STAGGER_MS = [800, 1600];
/** A murmur that could not be shown within this long of its cue is dropped. */
export const GRACE_MS = 1500;

/**
 * A role or team word. Case-insensitive and word-bounded.
 *
 * The tokens are the ones src/engine/engine.js actually uses plus the two the
 * genre is named for, because a template borrowed from anywhere else in the
 * genre is the likely way one arrives.
 */
export const ROLE_TOKENS =
  /\b(loyalist|loyalists|rebel|rebels|dictator|dictators|fascist|fascists|liberal|liberals|hitler)\b/i;

/** A first-person claim about a private hand. Only the holder may make it. */
const HAND_CLAIM = /^i was handed\b/i;

/**
 * The beat table.
 *
 * `pools` are the banks in ai.js. `chance` is the scarcity gate — the style
 * bible's rule is that a signal means nothing if it is always on, and an
 * ambient bubble on every single transition is wallpaper. `gap` is the number
 * of PUBLIC BEATS that must have passed since the square last murmured before
 * this beat is allowed to; it is zero for the beats that are actually news, so
 * a purge is never swallowed by a quiet rule.
 *
 * Both gates are deterministic: `gap` counts beats, and `chance` is rolled off
 * this module's own stream, so a replayed seed murmurs the same words in the
 * same order — the same property pace.js gives the rhythm.
 */
export const BEATS = {
  morning:     { pools: ['danger'],                    chance: 0.70, gap: 0 },
  nomination:  { pools: ['nomination', 'voteOpen'],    chance: 0.55, gap: 2 },
  vote_failed: { pools: ['voteFailed'],                chance: 0.60, gap: 0 },
  reform:      { pools: ['reformEnacted'],             chance: 0.50, gap: 1 },
  seize:       { pools: ['seizeEnacted'],              chance: 0.85, gap: 0 },
  purge:       { pools: ['purge'],                     chance: 0.90, gap: 0 },
  chaos:       { pools: ['chaos'],                     chance: 1.00, gap: 0 }
};

/* ------------------------------------------------------------- the beat */

function nameOf(view, id) {
  const p = id == null ? null : view.players[id];
  return p ? p.name : null;
}

/**
 * Which beat, if any, two consecutive PLAYER-SAFE VIEWS represent.
 *
 * Pure, and public by construction: it reads phase, day, the board counts, who
 * is alive, `lastVote` and `lastEnacted` — the same fields lighting.js's
 * `publicEdges` reads, and for the same reason. The driver's omniscient event
 * log is not reachable from here and must never become so; a murmur that could
 * hear it would be a tell in a deduction game.
 *
 * One beat per transition, in priority order — a step that both purges and
 * fills the board is news about the purge.
 *
 * @returns {{beat: string, ctx: object, subjects: number[], holder: number|null}|null}
 *   `subjects` is every seat the square has publicly been told about in this
 *   beat: the whitelist a murmur's prose may name, and nothing wider.
 *   `holder` is the seat that held a private hand at this beat, and only ever
 *   the Deputy of a government that just enacted — the one citizen entitled to
 *   say what they were passed.
 */
export function murmurBeat(prev, next) {
  if (!prev || !next) return null;
  if (next.phase === 'game_over') return null;

  /* A citizen who was standing is not. Purge is the only way that happens. */
  for (const p of next.players) {
    const before = prev.players[p.id];
    if (before && before.alive && !p.alive) {
      /* Who aimed the Purge was announced, so the square may name them too.
       * Not to be confused with `holder` below, which is about a private HAND. */
      const purger = next.power && next.power.holder != null ? next.power.holder : null;
      return {
        beat: 'purge',
        ctx: { target: p.name },
        subjects: purger == null ? [p.id] : [p.id, purger],
        holder: null
      };
    }
  }

  if (prev.phase !== 'chaos' && next.phase === 'chaos') {
    return { beat: 'chaos', ctx: {}, subjects: [], holder: null };
  }

  /* Something went on the board. The board is the one thing everybody sees. */
  const before = (prev.reform || 0) + (prev.seize || 0);
  const after = (next.reform || 0) + (next.seize || 0);
  if (after > before && next.lastEnacted) {
    /* Chaos enacts off the top of the deck with nobody in the government; the
     * chaos beat above already covered it and there is no pair to talk about. */
    if (next.lastEnacted.byChaos) return null;
    const gov = next.lastVote;
    if (!gov) return null;
    return {
      beat: next.lastEnacted.tile === 'reform' ? 'reform' : 'seize',
      ctx: { speaker: nameOf(next, gov.speaker), deputy: nameOf(next, gov.nominee) },
      subjects: [gov.speaker, gov.nominee],
      /* Only the Deputy held two tiles, so only the Deputy may say so. */
      holder: gov.nominee
    };
  }

  /* The ballots were opened. A government that passed speaks for itself; the
   * square only mutters when one fails. */
  if (prev.phase !== 'vote_result' && next.phase === 'vote_result') {
    const v = next.lastVote;
    if (v && !v.passed) {
      return {
        beat: 'vote_failed',
        ctx: {},
        subjects: [v.speaker, v.nominee],
        holder: null
      };
    }
    return null;
  }

  /* A name was put on the floor. */
  if (prev.nominee == null && next.nominee != null) {
    return {
      beat: 'nomination',
      ctx: { speaker: nameOf(next, next.speaker), nominee: nameOf(next, next.nominee) },
      subjects: [next.speaker, next.nominee],
      holder: null
    };
  }

  /*
   * Morning.
   *
   * Every entry into the nomination phase bumps the day (engine.js nextRound /
   * finishPower), so a day that has moved IS a new session opening.
   *
   * The square only murmurs at dawn when it is one tile from losing, and the
   * `danger` bank is the only one that fits: it is the one pool with no name
   * slots at all, so it stays coherent at a moment when there is no nominee to
   * talk about, and "one more seize and they take the Republic" is exactly the
   * thing a town says on that morning and no other. Scarcity is the point —
   * an ordinary morning gets the bell and silence.
   */
  if (next.day > prev.day && next.phase === 'nomination') {
    const limit = (next.limits && next.limits.seizeToWin) || 6;
    if (next.seize === limit - 1) {
      return { beat: 'morning', ctx: {}, subjects: [], holder: null };
    }
  }

  return null;
}

/* ------------------------------------------------------- what may be said */

function escapeName(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every seat whose name appears in `text`. */
export function namesIn(text, players) {
  const hit = [];
  for (const p of players) {
    if (!p.name) continue;
    if (new RegExp('\\b' + escapeName(p.name) + '\\b').test(text)) hit.push(p.id);
  }
  return hit;
}

/**
 * May this citizen say this sentence, out loud, in front of everybody?
 *
 * Four rules, each of which a v1 template can fail:
 *
 *  1. No role or team word, ever. Asserting an allegiance as fact is the one
 *     thing a deduction game's ambient prose may not do — and it is not made
 *     safe by being wrong, or hypothetical, or about somebody already dead.
 *  2. Nobody talks about themselves in the third person. `{speaker} drew three
 *     and this is what we get?` is a fine line from anyone except the Speaker,
 *     and reads as a bug from them.
 *  3. No name the square has not publicly been told about in this beat. Same
 *     whitelist idea as the objective line's sweep in src/play/objective.js.
 *  4. A first-person claim about a private hand is only for whoever held it.
 *     "i was handed two seizes" from somebody who was not the Deputy is not a
 *     lie a bot is telling, it is a sentence about a fact the whole square just
 *     watched happen to somebody else.
 */
export function keepable(line, view, beat) {
  if (!line || !line.text) return false;
  if (ROLE_TOKENS.test(line.text)) return false;
  const named = namesIn(line.text, view.players);
  for (const id of named) {
    if (id === line.playerId) return false;
    if (beat.subjects.indexOf(id) === -1) return false;
  }
  if (HAND_CLAIM.test(line.text) && line.playerId !== beat.holder) return false;
  return true;
}

/* ---------------------------------------------------------- the generator */

/**
 * A generator that is not the engine's — the same mulberry32 the engine uses,
 * a different salt, a different closure. Copied rather than imported from
 * pace.js on purpose: this file imports nothing, so no future edit to a shared
 * helper can reach into it. The salt differs from pace.js's so the rhythm and
 * the talk are not the same sequence read twice.
 */
function makeStream(seed) {
  let s = (seed ^ 0x1b873593) >>> 0;
  if (s === 0) s = 0x85ebca6b;
  return function nextUnit() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The stand-in game object handed to chatter.
 *
 * Everything on it comes off the player-safe view; the only thing that is not
 * a projection is `rng`, which is this module's own stream. There is no path
 * from here to the engine's.
 */
function standIn(view, stream) {
  return {
    players: view.players.map((p) => ({ id: p.id, alive: p.alive, isHuman: p.isYou })),
    seize: view.seize,
    rng: stream
  };
}

/**
 * @param {number} seed     the match seed — only so a replayed match murmurs
 *                          the same words. Nothing derived from it reaches the
 *                          rules; see the header.
 * @param {object} options  { chatter, alwaysSpeak }
 *   chatter      AI.chatter, injected rather than imported so this module keeps
 *                pace.js's "imports nothing" property and the test can hand it
 *                a probe.
 *   alwaysSpeak  skip the scarcity gates. For test/murmur.test.js, which needs
 *                chatter to fire on every beat to hammer the invariance; it
 *                changes how OFTEN the stream is drawn and nothing else.
 *   onSay        (beat, kept, dropped) after every chatter call, so a review
 *                can sweep the prose that was actually generated rather than
 *                the prose this file's templates could theoretically produce.
 */
export function createMurmurs(seed, options = {}) {
  const chatter = options.chatter;
  const always = !!options.alwaysSpeak;
  const onSay = typeof options.onSay === 'function' ? options.onSay : null;
  const raw = makeStream(seed >>> 0);
  let draws = 0;
  const nextUnit = () => { draws++; return raw(); };

  function between(band, speed) {
    const s = Number(speed) > 0 ? Number(speed) : 1;
    return (band[0] + nextUnit() * (band[1] - band[0])) / s;
  }

  let queue = [];       // cued, not yet on screen
  let visible = [];     // on screen now
  let beats = 0;        // public beats seen
  let spokeAt = -99;    // the beat index of the last murmur
  let produced = 0;     // murmurs ever queued
  let calls = 0;        // chatter invocations
  let nextId = 1;       // identity, so two identical sentences are two murmurs
  let barred = 0;       // authored lines refused at the bright line

  function reset() {
    queue = [];
    visible = [];
    beats = 0;
    spokeAt = -99;
  }

  return {
    /**
     * Look at a public transition and, maybe, cue some talk.
     *
     * @param {object} prev  the previous player-safe view (null at match start)
     * @param {object} next  the current player-safe view
     * @param {object} opts  { now, notBefore, speed }
     *   notBefore  the earliest a bubble may appear. main.js passes the end of
     *              any deliberation hold in progress, because a murmur about a
     *              tally the player has not walked over to open yet would
     *              announce the result — the same anti-spoiler rule the held
     *              ambience in main.js follows.
     * @returns {number} how many murmurs were cued
     */
    observe(prev, next, opts = {}) {
      const beat = murmurBeat(prev, next);
      if (!beat) return 0;
      beats++;

      const rule = BEATS[beat.beat];
      if (!rule || !chatter) return 0;
      if (!always) {
        if (beats - spokeAt <= rule.gap) return 0;
        if (nextUnit() >= rule.chance) return 0;
      }

      const pool = rule.pools.length > 1
        ? rule.pools[Math.min(rule.pools.length - 1, Math.floor(nextUnit() * rule.pools.length))]
        : rule.pools[0];

      calls++;
      const said = chatter(standIn(next, nextUnit), null, pool, beat.ctx) || [];
      const kept = said.filter((line) => keepable(line, next, beat));
      if (onSay) onSay(beat, kept, said.filter((line) => kept.indexOf(line) === -1), pool);
      if (!kept.length) return 0;

      spokeAt = beats;
      const now = opts.now || 0;
      const speed = opts.speed || 1;
      let at = Math.max(now, opts.notBefore || 0) + between(OPENING_MS, speed);
      for (const line of kept) {
        queue.push({
          id: nextId++,
          playerId: line.playerId,
          text: line.text,
          beat: beat.beat,
          at,
          until: at + between(LIFE_MS, speed)
        });
        at += between(STAGGER_MS, speed);
        produced++;
      }
      return kept.length;
    },

    /**
     * Queue speech somebody else authored — the floor.
     *
     * Idle murmurs come out of v1's template banks and are gated by `keepable`
     * because a template can say something a citizen may not. Floor speech is
     * rendered from a validated utterance record by src/play/floor-voice.js, so
     * the schema has already made an allegiance unrepresentable. The one gate
     * that still applies is the bright line: no role or team word reaches a
     * bubble, whatever produced it. A line that fails it is dropped and counted
     * rather than shown, so a bad sentence in the table is a number a sweep can
     * find instead of a word on screen.
     *
     * Everything after that is the SAME queue as an idle murmur, on purpose:
     * one bubble per citizen, at most MAX_VISIBLE on screen, nothing over the
     * dead or over your own seat, dropped rather than shown late. A second
     * queue with its own caps would be a second answer to "how many bubbles are
     * up", and the first thing that goes wrong with two answers is that they
     * disagree.
     *
     * @param {Array} lines  each { playerId, text, at, until, ... } — the
     *                       caller owns the clock, because the record and the
     *                       display schedule have to come from one place.
     * @returns {number} how many were accepted
     */
    say(lines) {
      let taken = 0;
      for (const line of lines || []) {
        if (!line || !line.text || typeof line.playerId !== 'number') { barred++; continue; }
        if (ROLE_TOKENS.test(line.text)) { barred++; continue; }
        queue.push({
          id: nextId++,
          playerId: line.playerId,
          text: line.text,
          beat: line.beat || 'floor',
          floor: true,
          utterance: line.utterance || null,
          at: line.at || 0,
          until: line.until || (line.at || 0) + LIFE_MS[1]
        });
        produced++;
        taken++;
      }
      return taken;
    },

    /**
     * Advance the bubbles. Returns true when what is on screen changed.
     *
     * Driven from BOTH loops in main.js, exactly like `pumpCast` and
     * `pumpAmbience`: requestAnimationFrame does not run in a hidden pane, so a
     * scripted review would otherwise find a bubble that never expires, and
     * anything that only happens on a frame cannot be observed by anything that
     * is not watching the window.
     */
    pump(now, view) {
      let changed = false;

      /**
       * May this citizen hold a bubble at all?
       *
       * The dead never can. Your own seat can hold ONE kind and only one: a
       * floor line, which is your own answer, chosen by you on the intent
       * strip, spoken aloud by your own figure — the design doc's "your figure
       * speaks it aloud, and the square writes it down". What it may never hold
       * is an idle murmur, because that is the square talking about itself and
       * you are not somebody you overhear.
       *
       * D3 found this the expensive way: with the exclusion in
       * src/engine/orator.js lifted, the player's own answers were being cued
       * into this queue and then silently discarded here, which read in the
       * sweep as a third of the whole argument going unheard.
       */
      const canSpeak = (id, floor) => {
        const p = view && view.players ? view.players[id] : null;
        return !!(p && p.alive && (!p.isYou || floor));
      };

      const stillUp = visible.filter((m) => now < m.until && canSpeak(m.playerId, m.floor));
      if (stillUp.length !== visible.length) { visible = stillUp; changed = true; }

      const keep = [];
      for (const m of queue) {
        if (!canSpeak(m.playerId, m.floor)) { changed = true; continue; }
        if (now < m.at) { keep.push(m); continue; }
        /* Overdue and still blocked: a stale murmur about a beat the square has
         * moved past is worse than silence, so it is dropped, not delayed. */
        if (now > m.at + GRACE_MS || now >= m.until) { changed = true; continue; }
        if (visible.length >= MAX_VISIBLE) { keep.push(m); continue; }
        /*
         * One citizen, one bubble.
         *
         * A citizen who speaks at two beats in a row can have the second murmur
         * come due while the first is still up, and there is exactly one bubble
         * element per figure — so the renderer would draw the newer sentence and
         * this list would claim two were showing. Found by cross-checking the
         * controller against the DOM in the browser, where it read as 3 of 44
         * samples disagreeing; it is a real murmur that never appeared. Holding
         * it here means what this list says is what the square shows.
         */
        if (visible.some((v) => v.playerId === m.playerId)) { keep.push(m); continue; }
        visible.push(m);
        changed = true;
      }
      queue = keep;
      return changed;
    },

    /** What is on screen, for the renderer and for a scripted review. */
    get visible() {
      return visible.map((m) => ({
        id: m.id, playerId: m.playerId, text: m.text, beat: m.beat,
        floor: !!m.floor, until: m.until
      }));
    },
    /** Authored lines refused for naming a role or a team. Must stay zero. */
    get barred() { return barred; },
    get pending() { return queue.length; },
    /** How many times this module's own stream was drawn — chatter's included. */
    get draws() { return draws; },
    /** How many times chatter was called, and how many bubbles it produced. */
    get calls() { return calls; },
    get produced() { return produced; },
    get beatsSeen() { return beats; },
    reset
  };
}
