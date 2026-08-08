/*
 * Secret Dictator — the shared driver.
 *
 * One function, `step(G, minds)`, advances a game by exactly ONE action and
 * returns a plain, JSON-serialisable event describing what happened. Nothing in
 * here renders, touches the DOM, or sets a timer: a caller decides *when* to
 * step, never *what* a step does.
 *
 * Why this file exists
 * --------------------
 * The engine's randomness is a single seeded stream (`G.rng`), and the bots in
 * ai.js draw from that same stream. A seed therefore fixes a whole match only if
 * the *sequence of calls into the engine and the AI* is also fixed. Before this
 * file there were two hand-copied drivers — test/engine.test.js and
 * scripts/simulate.js — and a third (the 3D playground) would have been a third
 * chance to get the order subtly wrong and silently play a different game.
 *
 * So: the phase switch below is a transcription of the one in
 * test/engine.test.js, with the assertions removed and event-building added.
 * The event-building only *reads* state; it never calls G.rng() and never adds
 * an AI call the test does not make. In particular AI.chatter is NOT called —
 * it draws from the stream, and wiring it in would shift every later draw.
 *
 * scripts/driver-parity.js replays the test's exact 50 seed/player-count pairs
 * through this driver and must reproduce the test's numbers exactly. If it ever
 * disagrees, the bug is here, not in the engine.
 *
 * One human seat (Step 4)
 * -----------------------
 * `step(G, minds, opts)` takes an optional third argument, `{ humanId, action }`.
 * Every place the switch below asks the AI for a decision, it first asks whether
 * that decision belongs to `humanId`; if it does, `opts.action` is used and the
 * AI is not called for that seat. Nothing else changes:
 *
 *   - `humanId` defaults to -1, and no player id is ever negative, so with no
 *     opts every comparison is false and the all-bot path is the code it always
 *     was, calling the same AI hooks in the same order. That is what
 *     scripts/driver-parity.js keeps honest.
 *   - The human draws nothing from the seeded stream — their decision arrives
 *     from outside it — so with a human seated the bots simply consume the
 *     stream in the same order minus that seat's draws, exactly as v1 did.
 *
 * `humanTurn(G, humanId)` reports what the human owes right now (or null), so a
 * caller can stop and wait instead of guessing. It is a pure read.
 *
 * UMD, like engine.js and ai.js: CommonJS under Node, `self.SDDriver` in a
 * browser (where engine.js and ai.js must already have been loaded).
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode
    ? factory(require('./engine.js'), require('./ai.js'))
    : factory(root.SD, root.SDAI);
  if (isNode) module.exports = api;
  else root.SDDriver = api;
})(typeof self !== 'undefined' ? self : this, function (SD, AI) {
  'use strict';

  var STEP_LIMIT = 4000;

  /*
   * The Deputy's move-to-Block, as an option value.
   *
   * A Deputy is really being asked one question with three possible answers at
   * five Seize — throw the first, throw the second, or ask the Speaker to burn
   * both — so all three are advertised in `options` and a caller can take any
   * of them verbatim. The first version hid the Block in `detail.canBlock` and
   * required a `{block: true}` object that appeared nowhere in `options`, which
   * made `submit(waitingFor().options[0])` throw for this one kind. See
   * test/contract.test.js: every advertised option must be accepted as-is.
   */
  var BLOCK_OPTION = 'block';

  function nameOf(G, id) {
    return id == null ? null : G.players[id].name;
  }

  function aliveIds(G) {
    return G.players.filter(function (p) { return p.alive; }).map(function (p) { return p.id; });
  }

  /** The board as the presentation layer needs it — numbers and ids only. */
  function snapshotAfter(G) {
    return {
      phase: G.phase,
      day: G.day,
      reform: G.reform,
      seize: G.seize,
      chaos: G.chaos,
      speaker: G.speaker,
      deputy: G.deputy,
      nominee: G.nominee,
      alive: aliveIds(G),
      winner: G.winner
    };
  }

  function makeEvent(G, action, actor) {
    return {
      phase: G.phase,          // the phase this step consumed
      day: G.day,
      action: action,
      actor: actor == null ? null : actor,
      actorName: nameOf(G, actor),
      text: '',
      detail: {},
      after: null
    };
  }

  /**
   * What the human seat owes right now, or null if it is the bots' business.
   *
   * A pure read: it calls nothing that draws from the seeded stream and changes
   * nothing. `kind` names the decision; `options` is the complete set of legal
   * answers, so a caller can validate a submission without knowing the rules.
   *
   * THE INVARIANT, and it is load-bearing: **every value in `options` must be
   * accepted by submit() verbatim.** `submit(waitingFor().options[0])` is
   * always a legal move, for every kind, with no special cases — that is the
   * seam every script, test and future front end drives, and the one place it
   * was not true (the Deputy's Block, which lived in `detail` and demanded a
   * shape `options` never mentioned) was a real defect that the panel happened
   * to paper over. test/contract.test.js walks every option of every decision
   * of complete matches and refuses to let it come back.
   *
   * `detail` may carry information that is private to THIS seat (the tiles in
   * its own hand, the three tiles Foresight showed it). That is safe because
   * the function is only ever asked about one seat at a time and answers only
   * about that seat — but it is also why the projection in view.js embeds this
   * verbatim only for the seat it is building a view for.
   *
   * `acknowledge` is a decision with one legal answer: it is the beat where a
   * result is on the table and the human has to look at it before the match
   * moves on. It consumes nothing from the stream, which is precisely why it
   * can exist at all.
   *
   * @param {object} G
   * @param {number} humanId  the human's seat, or -1 for an all-bot match
   * @returns {object|null} { playerId, phase, kind, options, detail }
   */
  function humanTurn(G, humanId) {
    if (humanId == null || humanId < 0) return null;
    if (G.phase === SD.PHASE.GAME_OVER) return null;
    var me = G.players[humanId];
    if (!me) return null;

    function turn(kind, options, detail, gate) {
      return {
        playerId: humanId,
        phase: G.phase,
        kind: kind,
        gate: gate || null,
        options: options,
        detail: detail || {}
      };
    }

    switch (G.phase) {
      case SD.PHASE.NOMINATION:
        if (G.speaker !== humanId) return null;
        return turn('nominate',
          SD.eligibleDeputies(G).map(function (p) { return p.id; }),
          { termLimited: SD.termLimited(G) });

      case SD.PHASE.VOTE:
        /* The dead do not vote — the engine throws on it — so a purged human
         * simply watches the ballots close. */
        if (!me.alive) return null;
        return turn('vote', [true, false], { speaker: G.speaker, nominee: G.nominee });

      case SD.PHASE.VOTE_RESULT:
        return turn('acknowledge', [null], {
          aye: G.lastVote.aye.slice(),
          nay: G.lastVote.nay.slice(),
          passed: !!G.lastVote.passed,
          speaker: G.lastVote.speaker,
          nominee: G.lastVote.nominee
        }, 'vote_result');

      case SD.PHASE.LEGISLATIVE_SPEAKER:
        if (G.speaker !== humanId) return null;
        return turn('speaker_discard',
          G.hand.map(function (_, i) { return i; }),
          { tiles: G.hand.slice() });

      case SD.PHASE.LEGISLATIVE_DEPUTY: {
        if (G.deputy !== humanId) return null;
        var canBlock = SD.canProposeBlock(G);
        var choices = G.deputyHand.map(function (_, i) { return i; });
        if (canBlock) choices.push(BLOCK_OPTION);
        return turn('deputy_discard', choices,
          { tiles: G.deputyHand.slice(), canBlock: canBlock });
      }

      case SD.PHASE.BLOCK_RESPONSE:
        if (G.speaker !== humanId) return null;
        return turn('block_response', [true, false], { deputy: G.deputy });

      case SD.PHASE.CHAOS:
        return turn('acknowledge', [null], { tile: G.chaosTile }, 'chaos');

      case SD.PHASE.POWER: {
        var pp = G.pendingPower;
        if (!pp || pp.holder !== humanId) return null;
        if (pp.kind === 'foresight') {
          return turn('power_ack', [null], {
            power: pp.kind,
            label: SD.POWER_LABEL[pp.kind],
            tiles: pp.result && pp.result.tiles ? pp.result.tiles.slice() : []
          }, 'foresight');
        }
        return turn('power_target',
          SD.powerTargets(G).map(function (p) { return p.id; }),
          { power: pp.kind, label: SD.POWER_LABEL[pp.kind] });
      }

      default:
        return null;
    }
  }

  /**
   * Advance `G` by one action.
   *
   * @param {object} G     a game from SD.createGame
   * @param {object} minds the bot minds from AI.create(G)
   * @param {object} [opts] { humanId, action } — see humanTurn() above. Omitted
   *                        (or humanId < 0) means an all-bot match, and then
   *                        this function behaves exactly as it always has.
   * @returns {object|null} the event, or null if the game is already over
   *
   * The switch below mirrors test/engine.test.js case for case, hook for hook.
   * Do not reorder a call without changing the test to match — the order is the
   * seed's meaning.
   */
  function step(G, minds, opts) {
    if (G.phase === SD.PHASE.GAME_OVER) return null;

    /* No seat id is ever negative, so -1 makes every "is this the human's
     * decision" test below false and the all-bot path untouched. */
    var humanId = (opts && opts.humanId != null) ? opts.humanId : -1;
    var action = opts ? opts.action : undefined;

    var ev;

    switch (G.phase) {
      case SD.PHASE.NOMINATION: {
        var pool = SD.eligibleDeputies(G);
        var pickId = G.speaker === humanId
          ? action
          : AI.chooseNominee(G, minds, G.speaker);
        ev = makeEvent(G, 'nominate', G.speaker);
        ev.detail = {
          nominee: pickId,
          nomineeName: nameOf(G, pickId),
          eligible: pool.map(function (p) { return p.id; }),
          termLimited: SD.termLimited(G)
        };
        ev.text = nameOf(G, G.speaker) + ' names ' + nameOf(G, pickId) + ' as Deputy.';
        SD.nominate(G, pickId);
        break;
      }

      case SD.PHASE.VOTE: {
        ev = makeEvent(G, 'vote', null);
        var ballots = [];
        SD.alivePlayers(G).forEach(function (p) {
          /* The human's ballot replaces their own AI call and nothing else, so
           * the bots draw from the stream in the same order they always did —
           * v1 sealed the bot ballots in exactly this order too. */
          var aye = p.id === humanId ? action : AI.chooseVote(G, minds, p.id);
          ballots.push({ id: p.id, name: p.name, aye: !!aye });
          SD.castVote(G, p.id, aye);
        });
        SD.resolveVote(G);
        var lv = G.lastVote;
        /* Note: the engine's lastVote records `nominee`, not `deputy` — the
         * nominee only becomes Deputy if the vote carried. */
        ev.detail = {
          ballots: ballots,
          aye: lv.aye.slice(),
          nay: lv.nay.slice(),
          passed: !!lv.passed,
          speaker: lv.speaker,
          nominee: lv.nominee
        };
        ev.text = 'Ballots close: ' + lv.aye.length + ' aye, ' + lv.nay.length + ' nay — ' +
          (lv.passed ? 'the government is elected.' : 'the election fails.');
        break;
      }

      case SD.PHASE.VOTE_RESULT: {
        var v = G.lastVote;
        ev = makeEvent(G, 'vote_result', null);
        ev.detail = {
          aye: v.aye.slice(),
          nay: v.nay.slice(),
          passed: !!v.passed,
          speaker: v.speaker,
          nominee: v.nominee,
          speakerName: nameOf(G, v.speaker),
          nomineeName: nameOf(G, v.nominee)
        };
        AI.observeVote(minds, G, v);
        SD.afterVote(G);
        ev.text = v.passed
          ? nameOf(G, v.speaker) + ' and ' + nameOf(G, v.nominee) + ' take office.'
          : 'No government. The Chaos Track stands at ' + G.chaos + '.';
        break;
      }

      case SD.PHASE.LEGISLATIVE_SPEAKER: {
        var handBefore = G.hand.slice();
        var si = G.speaker === humanId
          ? action
          : AI.chooseSpeakerDiscard(G, minds, G.speaker);
        ev = makeEvent(G, 'speaker_discard', G.speaker);
        ev.detail = {
          index: si,
          hand: handBefore,
          discarded: handBefore[si],
          passedOn: handBefore.filter(function (_, i) { return i !== si; })
        };
        ev.text = nameOf(G, G.speaker) + ' throws away a ' + handBefore[si] + ' tile and passes two on.';
        SD.speakerDiscard(G, si);
        break;
      }

      case SD.PHASE.LEGISLATIVE_DEPUTY: {
        var humanDeputy = G.deputy === humanId;
        /* A human Deputy answers one question with three possible answers. The
         * canonical action is whatever `humanTurn` advertised — a tile index or
         * BLOCK_OPTION. `{ block: true }` / `{ discard: i }` stay accepted as an
         * alias so action logs recorded before that was fixed still replay. */
        var movesBlock = humanDeputy
          ? (action === BLOCK_OPTION || !!(action && action.block))
          : AI.chooseProposeBlock(G, minds, G.deputy);
        if (movesBlock) {
          ev = makeEvent(G, 'propose_block', G.deputy);
          ev.detail = { hand: G.deputyHand.slice() };
          ev.text = nameOf(G, G.deputy) + ' moves the Block.';
          SD.proposeBlock(G);
          break;
        }
        var gov = { speaker: G.speaker, deputy: G.deputy, aye: G.lastVote.aye };
        var depHand = G.deputyHand.slice();
        var di = humanDeputy
          ? (typeof action === 'number' ? action : (action && action.discard))
          : AI.chooseDeputyDiscard(G, minds, G.deputy);
        ev = makeEvent(G, 'deputy_discard', G.deputy);
        SD.deputyDiscard(G, di);
        ev.detail = {
          index: di,
          hand: depHand,
          discarded: depHand[di],
          enacted: G.lastEnacted ? G.lastEnacted.tile : null
        };
        ev.text = nameOf(G, gov.deputy) + ' enacts a ' +
          (G.lastEnacted ? G.lastEnacted.tile : '?') + ' tile.';
        AI.observeEnact(minds, G, {
          speaker: gov.speaker, deputy: gov.deputy,
          tile: G.lastEnacted.tile, byChaos: false, aye: gov.aye
        });
        break;
      }

      case SD.PHASE.BLOCK_RESPONSE: {
        var accepted = G.speaker === humanId
          ? action
          : AI.chooseRespondBlock(G, minds, G.speaker);
        ev = makeEvent(G, 'block_response', G.speaker);
        ev.detail = { accepted: !!accepted };
        ev.text = nameOf(G, G.speaker) + (accepted ? ' seconds the Block.' : ' refuses the Block.');
        SD.respondBlock(G, accepted);
        break;
      }

      case SD.PHASE.CHAOS: {
        ev = makeEvent(G, 'chaos', null);
        ev.detail = { tile: G.chaosTile };
        ev.text = 'Three failures. Chaos takes the deck: a ' + G.chaosTile + ' tile enacts itself.';
        SD.resolveChaos(G);
        break;
      }

      case SD.PHASE.POWER: {
        var pp = G.pendingPower;
        ev = makeEvent(G, 'power', pp.holder);
        if (pp.kind === 'foresight') {
          /* Foresight's result is filled in when the power is granted, so the
           * three tiles are readable before the power is spent. */
          ev.detail = {
            kind: pp.kind,
            label: SD.POWER_LABEL[pp.kind],
            target: null,
            targetName: null,
            tiles: pp.result && pp.result.tiles ? pp.result.tiles.slice() : null
          };
          ev.text = nameOf(G, pp.holder) + ' reads the top three tiles.';
          SD.usePower(G, null);
        } else {
          var targets = SD.powerTargets(G);
          var tId = pp.holder === humanId
            ? action
            : AI.choosePowerTarget(G, minds, pp.holder);
          SD.usePower(G, tId);
          ev.detail = {
            kind: pp.kind,
            label: SD.POWER_LABEL[pp.kind],
            target: tId,
            targetName: nameOf(G, tId),
            targets: targets.map(function (p) { return p.id; }),
            team: pp.kind === 'peek' && pp.result ? pp.result.team : null
          };
          if (pp.kind === 'purge') {
            ev.text = nameOf(G, pp.holder) + ' purges ' + nameOf(G, tId) + '.';
            AI.observePurge(minds, G, pp.holder, tId);
          } else if (pp.kind === 'peek') {
            ev.text = nameOf(G, pp.holder) + ' peeks at ' + nameOf(G, tId) + '.';
            AI.observePeek(minds, G, pp.holder, tId, pp.result.team);
          } else if (pp.kind === 'emergency') {
            ev.text = nameOf(G, pp.holder) + ' calls an Emergency Vote on ' + nameOf(G, tId) + '.';
          } else {
            ev.text = nameOf(G, pp.holder) + ' uses ' + SD.POWER_LABEL[pp.kind] + '.';
          }
        }
        if (G.phase === SD.PHASE.POWER) SD.finishPower(G);
        break;
      }

      default: {
        ev = makeEvent(G, 'stuck', null);
        ev.text = 'unreachable phase: ' + G.phase;
        ev.after = snapshotAfter(G);
        ev.stuck = true;
        return ev;
      }
    }

    if (G.phase === SD.PHASE.GAME_OVER && G.winReason) {
      ev.gameOver = { winner: G.winner, reason: G.winReason };
    }
    ev.after = snapshotAfter(G);
    return ev;
  }

  /**
   * Convenience for headless callers: step until the game ends (or the step
   * limit trips) and return every event. Identical, action for action, to
   * calling step() from a timer — only faster.
   *
   * All-bot only, deliberately: it passes no opts, so a game with a human seat
   * would have that seat's decisions come back undefined. human-driver.js is
   * the loop for those.
   */
  function playOut(G, minds, limit) {
    var cap = limit || STEP_LIMIT;
    var events = [];
    var steps = 0;
    while (G.phase !== SD.PHASE.GAME_OVER && steps < cap) {
      var ev = step(G, minds);
      if (!ev) break;
      ev.n = steps;
      steps++;
      events.push(ev);
      if (ev.stuck) return { G: G, steps: steps, events: events, stuck: true };
    }
    return { G: G, steps: steps, events: events, stuck: steps >= cap };
  }

  /** Which of the four documented endings closed this game. */
  function endingOf(G) {
    if (G.reform >= SD.REFORM_TO_WIN) return 'reform';
    if (G.seize >= SD.SEIZE_TO_WIN) return 'seize';
    if (!SD.dictator(G).alive) return 'purged';
    return 'deputy';
  }

  return {
    STEP_LIMIT: STEP_LIMIT,
    BLOCK_OPTION: BLOCK_OPTION,
    step: step,
    humanTurn: humanTurn,
    playOut: playOut,
    endingOf: endingOf,
    snapshotAfter: snapshotAfter
  };
});
