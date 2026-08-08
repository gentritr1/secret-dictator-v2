/*
 * Headless self-test: plays complete bot-vs-bot games and asserts the rules
 * hold at every step. Run with:  node test/engine.test.js [games]
 */
'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];

var failures = [];
var checks = 0;

function check(cond, msg, ctx) {
  checks++;
  if (!cond) failures.push(msg + (ctx ? ' :: ' + JSON.stringify(ctx) : ''));
  return !!cond;
}

/** Total tiles must always be conserved: 6 Reform + 11 Seize = 17. */
function assertTileConservation(G, where) {
  var inPlay = G.deck.length + G.discard.length + G.hand.length + G.deputyHand.length +
    G.reform + G.seize + (G.chaosTile ? 1 : 0);
  check(inPlay === SD.DECK_REFORM + SD.DECK_SEIZE,
    'tile conservation broken at ' + where,
    { inPlay: inPlay, deck: G.deck.length, discard: G.discard.length,
      hand: G.hand.length, dep: G.deputyHand.length, reform: G.reform, seize: G.seize });
}

function assertInvariants(G, where) {
  check(G.reform >= 0 && G.reform <= SD.REFORM_TO_WIN, 'reform out of range at ' + where, { r: G.reform });
  check(G.seize >= 0 && G.seize <= SD.SEIZE_TO_WIN, 'seize out of range at ' + where, { s: G.seize });
  /* The track may sit at exactly 3 only while the Chaos screen is up; it is
   * emptied the moment that tile enacts itself. */
  var chaosCap = G.phase === SD.PHASE.CHAOS ? SD.CHAOS_LIMIT : SD.CHAOS_LIMIT - 1;
  check(G.chaos >= 0 && G.chaos <= chaosCap, 'chaos track out of range at ' + where,
    { c: G.chaos, cap: chaosCap });
  check(SD.aliveCount(G) >= 1, 'everyone is dead at ' + where);
  check(G.players.filter(function (p) { return p.role === SD.ROLE.DICTATOR; }).length === 1,
    'there must be exactly one Dictator at ' + where);
  if (G.phase !== SD.PHASE.GAME_OVER) {
    check(G.players[G.speaker].alive, 'a dead player holds the gavel at ' + where,
      { speaker: G.speaker });
  }
  assertTileConservation(G, where);
}

function playGame(seed, playerCount) {
  var names = NAMES.slice(0, playerCount);
  var G = SD.createGame({ names: names, humanIndex: -1, seed: seed });
  var minds = AI.create(G);
  var steps = 0;
  var LIMIT = 4000;

  /* Term-limit rule: a nominee must never be the previous elected government. */
  function assertNominationLegal(G, nomineeId) {
    var limited = SD.termLimited(G);
    check(limited.indexOf(nomineeId) === -1,
      'term-limited player was nominated', { nomineeId: nomineeId, limited: limited });
    check(nomineeId !== G.speaker, 'Speaker nominated themselves');
    check(G.players[nomineeId].alive, 'a purged player was nominated');
  }

  while (G.phase !== SD.PHASE.GAME_OVER && steps < LIMIT) {
    steps++;
    assertInvariants(G, G.phase);

    switch (G.phase) {
      case SD.PHASE.NOMINATION: {
        var pool = SD.eligibleDeputies(G);
        check(pool.length > 0, 'no legal nominee exists', { alive: SD.aliveCount(G) });
        var pickId = AI.chooseNominee(G, minds, G.speaker);
        assertNominationLegal(G, pickId);
        SD.nominate(G, pickId);
        break;
      }
      case SD.PHASE.VOTE: {
        SD.alivePlayers(G).forEach(function (p) {
          SD.castVote(G, p.id, AI.chooseVote(G, minds, p.id));
        });
        check(SD.allVotesIn(G), 'ballots did not close');
        SD.resolveVote(G);
        break;
      }
      case SD.PHASE.VOTE_RESULT: {
        var v = G.lastVote;
        check(v.aye.length + v.nay.length === SD.aliveCount(G),
          'ballot count does not match the living',
          { aye: v.aye.length, nay: v.nay.length, alive: SD.aliveCount(G) });
        if (v.aye.length === v.nay.length) check(!v.passed, 'a tie passed');
        AI.observeVote(minds, G, v);
        var chaosBefore = G.chaos;
        var seizeBefore = G.seize;
        SD.afterVote(G);
        if (!v.passed && G.phase !== SD.PHASE.GAME_OVER) {
          check(G.chaos === (chaosBefore + 1) % SD.CHAOS_LIMIT ||
                (chaosBefore + 1 >= SD.CHAOS_LIMIT),
            'chaos track did not advance on a failed election',
            { before: chaosBefore, after: G.chaos });
        }
        if (v.passed && G.phase === SD.PHASE.LEGISLATIVE_SPEAKER) {
          check(G.hand.length === 3, 'Speaker did not draw three', { hand: G.hand.length });
          check(G.chaos === 0, 'chaos track did not clear on a successful election');
          check(G.seize === seizeBefore, 'the board moved on an election');
        }
        break;
      }
      case SD.PHASE.LEGISLATIVE_SPEAKER: {
        var si = AI.chooseSpeakerDiscard(G, minds, G.speaker);
        check(si >= 0 && si < G.hand.length, 'illegal Speaker discard index', { si: si });
        SD.speakerDiscard(G, si);
        check(G.deputyHand.length === 2, 'Deputy did not receive two tiles');
        break;
      }
      case SD.PHASE.LEGISLATIVE_DEPUTY: {
        if (AI.chooseProposeBlock(G, minds, G.deputy)) {
          check(G.blockUnlocked, 'Block proposed before five Seize', { seize: G.seize });
          SD.proposeBlock(G);
          break;
        }
        var gov = { speaker: G.speaker, deputy: G.deputy, aye: G.lastVote.aye };
        var di = AI.chooseDeputyDiscard(G, minds, G.deputy);
        check(di >= 0 && di < G.deputyHand.length, 'illegal Deputy discard index', { di: di });
        SD.deputyDiscard(G, di);
        check(G.lastEnacted && !G.lastEnacted.byChaos, 'nothing was enacted');
        AI.observeEnact(minds, G, {
          speaker: gov.speaker, deputy: gov.deputy,
          tile: G.lastEnacted.tile, byChaos: false, aye: gov.aye
        });
        break;
      }
      case SD.PHASE.BLOCK_RESPONSE: {
        SD.respondBlock(G, AI.chooseRespondBlock(G, minds, G.speaker));
        break;
      }
      case SD.PHASE.CHAOS: {
        check(G.chaosTile != null, 'chaos with no tile drawn');
        SD.resolveChaos(G);
        check(G.chaos === 0, 'chaos track did not empty');
        check(G.lastSpeaker === null && G.lastDeputy === null,
          'term limits were not lifted by chaos');
        break;
      }
      case SD.PHASE.POWER: {
        var pp = G.pendingPower;
        check(!!SD.POWER_LABEL[pp.kind], 'unknown power granted', { kind: pp.kind });
        if (pp.kind === 'foresight') {
          check(pp.result && pp.result.tiles.length === 3, 'Foresight did not show three');
          SD.usePower(G, null);
        } else {
          var targets = SD.powerTargets(G);
          check(targets.length > 0, 'a power with no legal target', { kind: pp.kind });
          var tId = AI.choosePowerTarget(G, minds, pp.holder);
          check(targets.some(function (p) { return p.id === tId; }),
            'AI chose an illegal power target', { kind: pp.kind, tId: tId });
          var aliveBefore = SD.aliveCount(G);
          SD.usePower(G, tId);
          if (pp.kind === 'purge') {
            check(SD.aliveCount(G) === aliveBefore - 1, 'purge did not remove anyone');
            AI.observePurge(minds, G, pp.holder, tId);
          }
          if (pp.kind === 'peek') AI.observePeek(minds, G, pp.holder, tId, pp.result.team);
        }
        if (G.phase === SD.PHASE.POWER) SD.finishPower(G);
        break;
      }
      default:
        check(false, 'unreachable phase', { phase: G.phase });
        return { G: G, steps: steps, stuck: true };
    }
  }

  check(steps < LIMIT, 'game did not terminate', { seed: seed, players: playerCount });
  check(G.winner === SD.TEAM.LOYALIST || G.winner === SD.TEAM.REBEL,
    'game ended with no winner', { seed: seed, phase: G.phase });
  assertTileConservation(G, 'game over');

  /* The declared winner must match the board state that ended it. */
  var d = SD.dictator(G);
  if (G.reform >= SD.REFORM_TO_WIN) check(G.winner === SD.TEAM.LOYALIST, 'five Reform did not win for the Loyalists');
  if (G.seize >= SD.SEIZE_TO_WIN) check(G.winner === SD.TEAM.REBEL, 'six Seize did not win for the Rebels');
  if (!d.alive) check(G.winner === SD.TEAM.LOYALIST, 'the Dictator died but the Rebels won');

  return { G: G, steps: steps };
}

/* --------------------------------------------------------------- targeted */

function testSetupCounts() {
  for (var n = 5; n <= 10; n++) {
    var G = SD.createGame({ names: NAMES.slice(0, n), seed: 1234 + n });
    var d = G.players.filter(function (p) { return p.role === SD.ROLE.DICTATOR; }).length;
    var r = G.players.filter(function (p) { return p.role === SD.ROLE.REBEL; }).length;
    var l = G.players.filter(function (p) { return p.role === SD.ROLE.LOYALIST; }).length;
    check(d === 1, n + 'p: not exactly one Dictator');
    check(r === SD.SETUP[n].rebels, n + 'p: wrong Rebel count', { r: r });
    check(l === SD.SETUP[n].loyalists, n + 'p: wrong Loyalist count', { l: l });
    check(d + r + l === n, n + 'p: roles do not add up');

    /* Knowledge rule from the lobby copy. */
    var dict = SD.dictator(G);
    var seen = SD.knownRoles(G, dict.id);
    var seesRebels = Object.keys(seen).some(function (k) {
      return +k !== dict.id && seen[k] === SD.ROLE.REBEL;
    });
    check(seesRebels === (n <= SD.DICTATOR_SEES_REBELS_UP_TO),
      n + 'p: Dictator rebel-knowledge is wrong', { seesRebels: seesRebels });

    var reb = G.players.find(function (p) { return p.role === SD.ROLE.REBEL; });
    if (reb) {
      var rk = SD.knownRoles(G, reb.id);
      check(rk[dict.id] === SD.ROLE.DICTATOR, n + 'p: a Rebel cannot see the Dictator');
    }
  }
}

function testDictatorDeputyWin() {
  /* Drive the exact scenario the tutorial names: Dictator elected Deputy with
   * three Seize down must end the game for the Rebels immediately. */
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: 99 });
  var dict = SD.dictator(G);
  G.seize = 3;
  G.speaker = G.players.find(function (p) { return p.id !== dict.id; }).id;
  SD.nominate(G, dict.id);
  SD.alivePlayers(G).forEach(function (p) { SD.castVote(G, p.id, true); });
  SD.resolveVote(G);
  SD.afterVote(G);
  check(G.phase === SD.PHASE.GAME_OVER, 'seating the Dictator at 3 Seize did not end the game');
  check(G.winner === SD.TEAM.REBEL, 'seating the Dictator did not win for the Rebels');

  /* ...and must NOT end it at two Seize. */
  var H = SD.createGame({ names: NAMES.slice(0, 7), seed: 99 });
  var hd = SD.dictator(H);
  H.seize = 2;
  H.speaker = H.players.find(function (p) { return p.id !== hd.id; }).id;
  SD.nominate(H, hd.id);
  SD.alivePlayers(H).forEach(function (p) { SD.castVote(H, p.id, true); });
  SD.resolveVote(H);
  SD.afterVote(H);
  check(H.phase === SD.PHASE.LEGISLATIVE_SPEAKER,
    'seating the Dictator at 2 Seize wrongly ended the game', { phase: H.phase });
}

function testPurgingDictatorWins() {
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: 7 });
  var dict = SD.dictator(G);
  G.seize = 4;
  G.speaker = G.players.find(function (p) { return p.id !== dict.id; }).id;
  G.pendingPower = { kind: 'purge', holder: G.speaker, result: null, resolved: false };
  G.phase = SD.PHASE.POWER;
  SD.usePower(G, dict.id);
  check(G.phase === SD.PHASE.GAME_OVER, 'purging the Dictator did not end the game');
  check(G.winner === SD.TEAM.LOYALIST, 'purging the Dictator did not win for the Loyalists');
}

function testTieFails() {
  var G = SD.createGame({ names: NAMES.slice(0, 6), seed: 42 });
  SD.nominate(G, SD.eligibleDeputies(G)[0].id);
  var alive = SD.alivePlayers(G);
  alive.forEach(function (p, i) { SD.castVote(G, p.id, i % 2 === 0); });
  SD.resolveVote(G);
  check(G.lastVote.aye.length === G.lastVote.nay.length, 'test did not produce a tie');
  check(G.lastVote.passed === false, 'a tied vote passed');
}

function testChaosLiftsTermLimits() {
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: 5150 });
  G.lastSpeaker = 0; G.lastDeputy = 1;
  G.chaos = SD.CHAOS_LIMIT - 1;
  SD.nominate(G, SD.eligibleDeputies(G)[0].id);
  SD.alivePlayers(G).forEach(function (p) { SD.castVote(G, p.id, false); });
  SD.resolveVote(G);
  SD.afterVote(G);
  check(G.phase === SD.PHASE.CHAOS, 'third failure did not reach Chaos', { phase: G.phase });
  var before = G.reform + G.seize;
  SD.resolveChaos(G);
  check(G.reform + G.seize === before + 1, 'the chaos tile was not enacted');
  check(G.chaos === 0, 'chaos track did not empty');
  check(G.lastSpeaker === null && G.lastDeputy === null, 'chaos did not lift term limits');
}

function testPowerLadder() {
  /* Peek Allegiance, Foresight, Emergency Vote, then Purge, and Block at five. */
  var expected = { 1: 'peek', 2: 'foresight', 3: 'emergency', 4: 'purge', 5: 'purge' };
  Object.keys(expected).forEach(function (slot) {
    check(SD.POWER_BY_SLOT[slot] === expected[slot],
      'Seize slot ' + slot + ' grants the wrong power',
      { got: SD.POWER_BY_SLOT[slot], want: expected[slot] });
  });
  check(SD.POWER_BY_SLOT[6] === undefined, 'the sixth Seize should grant no power, it wins');
  check(SD.BLOCK_UNLOCKED_AT === 5, 'Block should unlock at five Seize');
}

function testPeekNeverRepeats() {
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: 808 });
  var holder = G.speaker;
  var victim = SD.alivePlayers(G).find(function (p) { return p.id !== holder; }).id;
  G.seize = 1;
  G.pendingPower = { kind: 'peek', holder: holder, result: null, resolved: false };
  G.phase = SD.PHASE.POWER;
  SD.usePower(G, victim);
  check(G.players[holder].peeked[victim] === G.players[victim].team, 'peek did not record a team');
  G.pendingPower = { kind: 'peek', holder: holder, result: null, resolved: false };
  var again = SD.powerTargets(G).some(function (p) { return p.id === victim; });
  check(!again, 'the same citizen can be peeked twice');
}

function testBlockOnlyOncePerSession() {
  /* Regression: a refused Block used to return to the Deputy, who could move it
   * again immediately — a Loyalist Deputy holding two Seizes against a Rebel
   * Speaker looped forever. The Block is once per session. */
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: 31337 });
  G.seize = 5;
  G.blockUnlocked = true;
  G.deputy = SD.alivePlayers(G).find(function (p) { return p.id !== G.speaker; }).id;
  G.deputyHand = [SD.TILE.SEIZE, SD.TILE.SEIZE];
  G.phase = SD.PHASE.LEGISLATIVE_DEPUTY;

  check(SD.canProposeBlock(G), 'Block should be available at five Seize');
  SD.proposeBlock(G);
  check(G.phase === SD.PHASE.BLOCK_RESPONSE, 'proposing a Block did not reach the Speaker');
  SD.respondBlock(G, false);
  check(G.phase === SD.PHASE.LEGISLATIVE_DEPUTY, 'a refused Block did not return to the Deputy');
  check(!SD.canProposeBlock(G), 'the Block can be moved twice in one session');

  var threw = false;
  try { SD.proposeBlock(G); } catch (e) { threw = true; }
  check(threw, 'proposeBlock did not reject a second attempt');

  /* And the session must still be completable. */
  SD.deputyDiscard(G, 0);
  check(G.seize === 6 && G.phase === SD.PHASE.GAME_OVER,
    'the Deputy could not enact after a refused Block', { seize: G.seize, phase: G.phase });

  /* An accepted Block burns both tiles and advances the Chaos Track. */
  var H = SD.createGame({ names: NAMES.slice(0, 7), seed: 4242 });
  H.seize = 5; H.blockUnlocked = true; H.chaos = 0;
  H.deputy = SD.alivePlayers(H).find(function (p) { return p.id !== H.speaker; }).id;
  H.deputyHand = [SD.TILE.SEIZE, SD.TILE.SEIZE];
  H.phase = SD.PHASE.LEGISLATIVE_DEPUTY;
  var boardBefore = H.reform + H.seize;
  SD.proposeBlock(H);
  SD.respondBlock(H, true);
  check(H.reform + H.seize === boardBefore, 'an accepted Block still passed a law');
  check(H.chaos === 1, 'an accepted Block did not advance the Chaos Track', { c: H.chaos });
}

function testEmergencyVoteReturnsGavelPastCaller() {
  /* Regression: the gavel used to come back *to* the citizen who called the
   * Emergency Vote, handing them two sessions in a row. */
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: 24680 });
  var caller = G.speaker;
  G.seize = 3;
  G.pendingPower = { kind: 'emergency', holder: caller, result: null, resolved: false };
  G.phase = SD.PHASE.POWER;

  var target = SD.powerTargets(G)[0].id;
  SD.usePower(G, target);
  SD.finishPower(G);
  check(G.speaker === target, 'the Emergency Vote target did not take the gavel',
    { speaker: G.speaker, target: target });

  /* Play that special session out with a failed election, then check rotation. */
  SD.nominate(G, SD.eligibleDeputies(G)[0].id);
  SD.alivePlayers(G).forEach(function (p) { SD.castVote(G, p.id, false); });
  SD.resolveVote(G);
  SD.afterVote(G);
  check(G.speaker !== caller,
    'the gavel returned to the citizen who called the Emergency Vote', { caller: caller, speaker: G.speaker });
  var expected = (function () {
    for (var s = 1; s <= G.players.length; s++) {
      var c = (caller + s) % G.players.length;
      if (G.players[c].alive) return c;
    }
  })();
  check(G.speaker === expected, 'the gavel did not rejoin the normal rotation',
    { got: G.speaker, want: expected });
}

/* ------------------------------------------------------------------- run */

var GAMES = parseInt(process.argv[2], 10) || 400;

testSetupCounts();
testPowerLadder();
testTieFails();
testDictatorDeputyWin();
testPurgingDictatorWins();
testChaosLiftsTermLimits();
testPeekNeverRepeats();
testBlockOnlyOncePerSession();
testEmergencyVoteReturnsGavelPastCaller();

var wins = { loyalist: 0, rebel: 0 };
var reasons = { reform: 0, seize: 0, purged: 0, deputy: 0 };
var totalSteps = 0;
var chaosSeen = 0, blockSeen = 0, emergencySeen = 0;

for (var i = 0; i < GAMES; i++) {
  var count = 5 + (i % 6);
  var res = playGame(1000 + i * 7919, count);
  var G = res.G;
  totalSteps += res.steps;
  wins[G.winner]++;
  if (G.reform >= SD.REFORM_TO_WIN) reasons.reform++;
  else if (G.seize >= SD.SEIZE_TO_WIN) reasons.seize++;
  else if (!SD.dictator(G).alive) reasons.purged++;
  else reasons.deputy++;
  G.log.forEach(function (e) {
    if (/Chaos takes the deck/.test(e.text)) chaosSeen++;
    if (/Block carries/.test(e.text)) blockSeen++;
    /* count the use, not the grant — both carry meta.power */
    if (e.kind === 'power' && e.meta && e.meta.power === 'emergency') emergencySeen++;
  });
}

console.log('games            ', GAMES, '(5–10 players, cycled)');
console.log('assertions       ', checks);
console.log('avg steps/game   ', (totalSteps / GAMES).toFixed(1));
console.log('wins             ', wins);
console.log('ending           ', reasons);
console.log('chaos enactments ', chaosSeen, '| blocks carried', blockSeen, '| emergency votes', emergencySeen);

/* Every one of the four documented endings must be reachable, or a whole
 * branch of the rules is dead code that the assertions above never touch. */
['reform', 'seize', 'purged', 'deputy'].forEach(function (k) {
  check(reasons[k] > 0, 'ending never occurred across ' + GAMES + ' games: ' + k);
});
check(chaosSeen > 0, 'the Chaos Track never filled across ' + GAMES + ' games');
check(emergencySeen > 0, 'Emergency Vote never fired across ' + GAMES + ' games');

if (failures.length) {
  console.error('\nFAILED (' + failures.length + '):');
  var seen = {};
  failures.forEach(function (f) {
    var key = f.split(' :: ')[0];
    seen[key] = (seen[key] || 0) + 1;
  });
  Object.keys(seen).forEach(function (k) { console.error('  ' + seen[k] + '×  ' + k); });
  console.error('\nfirst 5 with context:');
  failures.slice(0, 5).forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('\nOK — ' + checks + ' assertions passed.');
