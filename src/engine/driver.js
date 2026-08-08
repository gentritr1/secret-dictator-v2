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
   * Advance `G` by one action.
   *
   * @param {object} G     a game from SD.createGame
   * @param {object} minds the bot minds from AI.create(G)
   * @returns {object|null} the event, or null if the game is already over
   *
   * The switch below mirrors test/engine.test.js case for case, hook for hook.
   * Do not reorder a call without changing the test to match — the order is the
   * seed's meaning.
   */
  function step(G, minds) {
    if (G.phase === SD.PHASE.GAME_OVER) return null;

    var ev;

    switch (G.phase) {
      case SD.PHASE.NOMINATION: {
        var pool = SD.eligibleDeputies(G);
        var pickId = AI.chooseNominee(G, minds, G.speaker);
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
          var aye = AI.chooseVote(G, minds, p.id);
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
        var si = AI.chooseSpeakerDiscard(G, minds, G.speaker);
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
        if (AI.chooseProposeBlock(G, minds, G.deputy)) {
          ev = makeEvent(G, 'propose_block', G.deputy);
          ev.detail = { hand: G.deputyHand.slice() };
          ev.text = nameOf(G, G.deputy) + ' moves the Block.';
          SD.proposeBlock(G);
          break;
        }
        var gov = { speaker: G.speaker, deputy: G.deputy, aye: G.lastVote.aye };
        var depHand = G.deputyHand.slice();
        var di = AI.chooseDeputyDiscard(G, minds, G.deputy);
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
        var accepted = AI.chooseRespondBlock(G, minds, G.speaker);
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
          var tId = AI.choosePowerTarget(G, minds, pp.holder);
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
    step: step,
    playOut: playOut,
    endingOf: endingOf,
    snapshotAfter: snapshotAfter
  };
});
