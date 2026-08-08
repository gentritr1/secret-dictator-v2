/*
 * Secret Dictator — the human-in-the-loop session.
 *
 * driver.js is stateless: one call, one action. This file is the small amount
 * of state that a match with a person in it needs, and nothing more.
 *
 *   waitingFor()      what the human owes right now, or null
 *   advanceBots()     take one bot action; refuses while the human is owed one
 *   submit(action)    supply the human's decision and take the step it unblocks
 *
 * A caller drives it with a timer, a keyboard, or a for-loop; the session does
 * not care and owns no clock.
 *
 * Why the human cannot break replay
 * ---------------------------------
 * The engine's whole notion of chance is one seeded stream, and the bots draw
 * from it. A match is therefore a pure function of (seed, roster, the order of
 * calls into engine and AI). Seating a human changes exactly one thing: at that
 * seat, an AI call is replaced by a value handed in from outside. The human
 * draws nothing. So a match with a human is a pure function of
 *
 *     (seed, roster, humanIndex, the ordered list of human actions)
 *
 * and replaying that list reproduces the match byte for byte. test/human-driver
 * .test.js records a scripted playthrough, replays it, and diffs the event logs
 * — plus a divergent control, because a determinism check that only ever
 * compares equal things proves nothing.
 *
 * The morning gate
 * ----------------
 * One beat the engine has no phase for: the start of a day. The session holds
 * it (`_morningDay`), because it is a presentation gate rather than a rule —
 * acknowledging it takes no engine step at all. It still goes into the recorded
 * action list, so a replay stays aligned; being inert, it cannot shift a draw.
 *
 * UMD, like the rest of src/engine: CommonJS under Node, `self.SDHuman` in a
 * browser (where engine.js, ai.js and driver.js must already have loaded).
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode
    ? factory(require('./engine.js'), require('./ai.js'), require('./driver.js'))
    : factory(root.SD, root.SDAI, root.SDDriver);
  if (isNode) module.exports = api;
  else root.SDHuman = api;
})(typeof self !== 'undefined' ? self : this, function (SD, AI, Driver) {
  'use strict';

  var STEP_LIMIT = 4000;

  /* -------------------------------------------------------------- session */

  /**
   * @param {object} opts { G, minds, humanId }
   *   G      a game from SD.createGame({ names, humanIndex, seed })
   *   minds  the bot minds from AI.create(G)
   *   humanId the human's seat, or -1 for an all-bot match (then the session
   *           never waits and is exactly Driver.step in a loop)
   */
  function createSession(opts) {
    var G = opts.G;
    var minds = opts.minds;
    var humanId = opts.humanId == null ? -1 : opts.humanId;

    var events = [];       // the driver's omniscient event stream
    var actions = [];      // every human decision, in order — the replay script
    var steps = 0;
    var morningDay = null; // the day whose morning report has been acknowledged

    function over() {
      return G.phase === SD.PHASE.GAME_OVER;
    }

    /** The morning report: one beat at the top of each day, before nomination. */
    function morningPending() {
      if (humanId < 0) return false;
      if (G.phase !== SD.PHASE.NOMINATION) return false;
      return morningDay !== G.day;
    }

    function waitingFor() {
      if (over()) return null;
      if (morningPending()) {
        return {
          playerId: humanId,
          phase: G.phase,
          kind: 'acknowledge',
          gate: 'morning',
          options: [null],
          detail: {
            day: G.day,
            speaker: G.speaker,
            reform: G.reform,
            seize: G.seize,
            chaos: G.chaos,
            termLimited: SD.termLimited(G),
            isSpecialElection: !!G.isSpecialElection
          }
        };
      }
      return Driver.humanTurn(G, humanId);
    }

    /**
     * Is `action` one of the legal answers to `w`?
     *
     * The contract every branch below has to satisfy: anything `w.options`
     * advertises is accepted verbatim. The `{discard}` / `{block}` object forms
     * are aliases kept because action logs recorded before the options list
     * carried the Block still have to replay; they are not the canonical shape
     * and nothing new should emit them.
     */
    function legal(w, action) {
      switch (w.kind) {
        case 'acknowledge':
        case 'power_ack':
          return true;                       // one legal answer; the value is ignored
        case 'vote':
        case 'block_response':
          return action === true || action === false;
        case 'deputy_discard':
          if (action === Driver.BLOCK_OPTION || (action && action.block === true)) {
            return !!w.detail.canBlock;
          }
          if (typeof action === 'number') return w.options.indexOf(action) !== -1;
          return !!action && w.options.indexOf(action.discard) !== -1;
        default:
          return w.options.indexOf(action) !== -1;
      }
    }

    function record(ev) {
      if (!ev) return null;
      ev.n = steps;
      steps++;
      events.push(ev);
      return ev;
    }

    /**
     * Supply the human's decision. Returns the driver event it produced, or
     * null for the morning gate, which takes no engine step.
     */
    function submit(action) {
      var w = waitingFor();
      if (!w) throw new Error('nothing is waiting on the human');
      if (!legal(w, action)) {
        throw new Error('illegal ' + w.kind + ': ' + JSON.stringify(action) +
          ' (legal: ' + JSON.stringify(w.options) + ')');
      }
      actions.push({ n: actions.length, kind: w.kind, gate: w.gate, action: action });

      if (w.gate === 'morning') {
        morningDay = G.day;
        return null;
      }
      return record(Driver.step(G, minds, { humanId: humanId, action: action }));
    }

    /**
     * One bot action. Returns null while the human is being waited on.
     *
     * It must never answer for the human, and the guard above is the whole
     * mechanism: no path through this function reaches Driver.step with an
     * action in it. test/contract.test.js checks the consequence rather than
     * the code — an alive seat's recorded `vote` decisions must equal the
     * number of elections held while it was alive, so a bot step that voted on
     * its behalf would show up as a missing ballot.
     */
    function advanceBots() {
      if (over()) return null;
      if (waitingFor()) return null;
      return record(Driver.step(G, minds, { humanId: humanId }));
    }

    return {
      get G() { return G; },
      get minds() { return minds; },
      humanId: humanId,
      events: events,
      actions: actions,
      get steps() { return steps; },
      get over() { return over(); },
      waitingFor: waitingFor,
      submit: submit,
      advanceBots: advanceBots,
      /* Ask whether an action would be accepted, without submitting it. The
       * contract test walks every advertised option through this. */
      isLegal: function (action, w) {
        var pending = w || waitingFor();
        return pending ? legal(pending, action) : false;
      }
    };
  }

  /* ---------------------------------------------------------------- loops */

  /**
   * Run a session to the end, asking `decide(waitingFor, session)` for every
   * human decision. Headless: no timers, no waiting. The page uses a timer for
   * the bot steps instead, which changes when a step happens and never what it
   * does — the same separation the playground has.
   *
   * @param {object} session
   * @param {function} decide  (waitingFor, session) -> action
   * @param {number} [cap]
   */
  function playOut(session, decide, cap) {
    var limit = cap || STEP_LIMIT;
    var guard = 0;
    while (!session.over && guard < limit) {
      guard++;
      var w = session.waitingFor();
      if (w) session.submit(decide(w, session));
      else if (!session.advanceBots()) break;
    }
    return session;
  }

  /**
   * Deal a match and run it with a decision function. The one entry point the
   * replay test uses, so record and replay cannot drift by construction.
   *
   * @param {object} opts { names, humanIndex, seed, decide, cap }
   */
  function playMatch(opts) {
    var G = SD.createGame({
      names: opts.names.slice(),
      humanIndex: opts.humanIndex,
      seed: opts.seed
    });
    var minds = AI.create(G);
    var session = createSession({ G: G, minds: minds, humanId: opts.humanIndex });
    return playOut(session, opts.decide, opts.cap);
  }

  /**
   * Replay a recorded action list. Consumes the list in order and throws if the
   * match ever asks for a decision the list does not have — a replay that runs
   * off the end of its script is a determinism failure, not a shrug.
   */
  function replayMatch(opts) {
    var script = opts.actions;
    var i = 0;
    return playMatch({
      names: opts.names,
      humanIndex: opts.humanIndex,
      seed: opts.seed,
      cap: opts.cap,
      decide: function (w) {
        if (i >= script.length) {
          throw new Error('replay ran out of recorded actions at ' + w.kind +
            ' (had ' + script.length + ')');
        }
        var rec = script[i++];
        if (rec.kind !== w.kind) {
          throw new Error('replay diverged at action ' + (i - 1) + ': recorded ' +
            rec.kind + ', match wants ' + w.kind);
        }
        return rec.action;
      }
    });
  }

  return {
    STEP_LIMIT: STEP_LIMIT,
    createSession: createSession,
    playOut: playOut,
    playMatch: playMatch,
    replayMatch: replayMatch
  };
});
