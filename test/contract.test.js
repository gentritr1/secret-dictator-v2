/*
 * The options -> submit round trip.
 *
 *     node test/contract.test.js [games]        (npm run test:contract)
 *
 * This suite exists because of a defect it would have caught on day one.
 * `waitingFor()` for a Deputy's draft advertised `options: [0, 1]`, and the
 * session's legality check demanded `{ discard: 0 }` — so the single most
 * obvious call anybody would write,
 *
 *     submit(waitingFor().options[0])
 *
 * threw, for that one kind, with an error message that printed the rejected
 * value inside the list of legal ones. The UI never noticed because the panel
 * built the object form by hand; the scripted API — the seam every future
 * automation drives — was self-contradictory.
 *
 * The lesson is the same shape as Step 3's A/D swap: the leak suite and the
 * replay suite were both thorough, and both tested one side of a seam. Nobody
 * tested the handshake between what the driver ADVERTISES and what the session
 * ACCEPTS. So:
 *
 *   1. Every value in `options`, for every decision, of complete matches, must
 *      pass the session's own legality check verbatim — and `options[0]` must
 *      actually be submittable, which is checked by submitting it.
 *   2. The Deputy's Block must appear in `options` exactly when
 *      `detail.canBlock` says it may be moved. Advertised, not hidden.
 *   3. An alive seat must be ASKED for everything it owes. Specifically: the
 *      number of ballots it was asked for equals the number of elections held
 *      while it was alive. A bot step that quietly voted on the human's behalf
 *      shows up here as a missing ballot.
 */

'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Driver = require('../src/engine/driver.js');
var Human = require('../src/engine/human-driver.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

/* ------------------------------------------------------------------- run */

var GAMES = parseInt(process.argv[2], 10) || 60;

var decisionsAudited = 0;
var optionsAudited = 0;
var blockOffers = 0;
var kindsSeen = {};
var electionsTotal = 0;
var ballotsAskedTotal = 0;
var seatsAliveAtEnd = 0;
var seatsPurged = 0;

for (var g = 0; g < GAMES; g++) {
  var count = 5 + (g % 6);
  var seed = 1000 + g * 7919;
  var humanIndex = g % count;
  var names = NAMES.slice(0, count);

  var G = SD.createGame({ names: names, humanIndex: humanIndex, seed: seed });
  var session = Human.createSession({ G: G, minds: AI.create(G), humanId: humanIndex });

  /* Elections the human was alive for, counted off the driver's own events so
   * it is independent of anything the session believes it asked. */
  var electionsWhileAlive = 0;
  var ballotsAsked = 0;
  var guard = 0;

  while (!session.over && guard++ < 2000) {
    var w = session.waitingFor();
    var aliveBefore = G.players[humanIndex].alive;
    var eventsBefore = session.events.length;

    if (w) {
      /* --- 1. every advertised option is accepted verbatim -------------- */
      decisionsAudited++;
      kindsSeen[w.kind] = (kindsSeen[w.kind] || 0) + 1;
      if (w.kind === 'vote') ballotsAsked++;

      check(Array.isArray(w.options) && w.options.length > 0,
        'seed ' + seed + ': ' + w.kind + ' advertised no options');

      for (var o = 0; o < w.options.length; o++) {
        optionsAudited++;
        check(session.isLegal(w.options[o], w),
          'seed ' + seed + ' ' + w.kind + ': advertised option ' +
          JSON.stringify(w.options[o]) + ' is rejected by the session (options ' +
          JSON.stringify(w.options) + ')');
      }

      /* --- 2. the Block is advertised exactly when it may be moved ------ */
      if (w.kind === 'deputy_discard') {
        var nonIndex = w.options.filter(function (x) { return typeof x !== 'number'; });
        var indices = w.options.filter(function (x) { return typeof x === 'number'; });
        check(indices.length === w.detail.tiles.length,
          'seed ' + seed + ': deputy_discard advertised ' + indices.length +
          ' tile indices for ' + w.detail.tiles.length + ' tiles');
        check(nonIndex.length === (w.detail.canBlock ? 1 : 0),
          'seed ' + seed + ': deputy_discard canBlock=' + w.detail.canBlock +
          ' but advertised ' + nonIndex.length + ' block options');
        if (w.detail.canBlock) {
          blockOffers++;
          check(nonIndex[0] === Driver.BLOCK_OPTION,
            'seed ' + seed + ': the Block option is ' + JSON.stringify(nonIndex[0]) +
            ', not Driver.BLOCK_OPTION');
        }
      }

      /* Submitting the first advertised option must simply work — no shape
       * translation, no special case for any kind. If this throws, the suite
       * fails loudly rather than being caught and counted. */
      session.submit(w.options[0]);
    } else if (!session.advanceBots()) {
      break;
    }

    /*
     * --- 3a. the human's ballot is in every election they were alive for ---
     *
     * Counted off the driver's own events rather than off anything the session
     * says it asked, and counted after EITHER call: the vote event is produced
     * by submit(), not by advanceBots(), which is exactly where the first
     * version of this counter was wrong — it sat in the bots-only branch and
     * reported zero elections in every match. An instrument that reads zero for
     * a thing that plainly happened is not evidence of anything.
     */
    for (var e = eventsBefore; e < session.events.length; e++) {
      var ev = session.events[e];
      if (ev.action !== 'vote' || !aliveBefore) continue;
      electionsWhileAlive++;
      var mine = (ev.detail.ballots || []).filter(function (b) { return b.id === humanIndex; });
      check(mine.length === 1,
        'seed ' + seed + ': the human seat produced ' + mine.length +
        ' ballots in one election');
    }
  }

  check(session.over, 'seed ' + seed + ': match did not finish');

  /* --- 3b. an alive seat is asked for every ballot it owes -------------- */
  if (G.players[humanIndex].alive) seatsAliveAtEnd++; else seatsPurged++;
  check(ballotsAsked === electionsWhileAlive,
    'seed ' + seed + ' (human ' + humanIndex + ', alive at end ' +
    G.players[humanIndex].alive + '): asked for ' + ballotsAsked +
    ' ballots across ' + electionsWhileAlive + ' elections it was alive for');
  electionsTotal += electionsWhileAlive;
  ballotsAskedTotal += ballotsAsked;
}

check(ballotsAskedTotal === electionsTotal, 'ballots asked did not match elections overall');
check(electionsTotal > 0, 'no elections were counted at all — the counter is broken, not the code');
check(decisionsAudited > 0 && optionsAudited > 0, 'nothing was audited at all');
/* A round-trip proof over kinds that never came up is worth little. Asserted
 * at the default game count only: a short run (`node test/contract.test.js 20`)
 * is a smoke test and genuinely may not reach a Foresight. */
if (GAMES >= 60) {
  ['acknowledge', 'nominate', 'vote', 'speaker_discard', 'deputy_discard',
    'power_target', 'power_ack'].forEach(function (k) {
    check((kindsSeen[k] || 0) > 0,
      'no ' + k + ' decision was ever audited across ' + GAMES + ' matches');
  });
}

say('round trip    ' + optionsAudited + ' advertised options across ' + decisionsAudited +
    ' decisions in ' + GAMES + ' complete matches — all accepted verbatim');
say('              kinds: ' + JSON.stringify(kindsSeen));
say('              options[0] submitted every time; no kind needed a special shape');
say('block         ' + blockOffers + ' of ' + (kindsSeen.deputy_discard || 0) +
    ' Deputy drafts could move the Block' +
    (blockOffers ? ', and it was advertised each time' :
      ' — random play rarely reaches five Seize with a human Deputy, so the'));
if (!blockOffers) say('              three answers are checked on a constructed position below instead');
say('no skipping   ' + ballotsAskedTotal + ' ballots asked for ' + electionsTotal +
    ' elections the human was alive for (' + seatsAliveAtEnd + ' survived, ' +
    seatsPurged + ' purged)');

/* ------------------------------------- the Deputy's three answers, by name */

(function () {
  var names = NAMES.slice(0, 7);

  function position(seed) {
    var G = SD.createGame({ names: names, humanIndex: 0, seed: seed });
    var minds = AI.create(G);
    G.seize = 5;
    G.blockUnlocked = true;
    G.speaker = 1;
    G.deputy = 0;                                   // the human drafts
    G.lastVote = { aye: [0, 1], nay: [], passed: true, speaker: 1, nominee: 0 };
    G.deputyHand = [SD.TILE.SEIZE, SD.TILE.SEIZE];
    G.phase = SD.PHASE.LEGISLATIVE_DEPUTY;
    return Human.createSession({ G: G, minds: minds, humanId: 0 });
  }

  var s = position(31337);
  var w = s.waitingFor();
  check(w.kind === 'deputy_discard' && w.options.length === 3,
    'a blockable Deputy draft should advertise three answers, got ' + JSON.stringify(w.options));
  check(JSON.stringify(w.options) === JSON.stringify([0, 1, Driver.BLOCK_OPTION]),
    'the advertised options are ' + JSON.stringify(w.options));

  /* Each of the three, taken verbatim, does what it says. */
  var byIndex = position(31337);
  byIndex.submit(byIndex.waitingFor().options[0]);
  check(byIndex.G.seize === 6 && byIndex.G.winner === SD.TEAM.REBEL,
    'submitting the advertised index 0 did not enact a Seize');

  var byBlock = position(31337);
  var before = byBlock.G.reform + byBlock.G.seize;
  byBlock.submit(Driver.BLOCK_OPTION);
  check(byBlock.G.phase === SD.PHASE.BLOCK_RESPONSE,
    'submitting the advertised Block option did not move the Block');
  check(byBlock.G.reform + byBlock.G.seize === before, 'moving the Block passed a law');

  /* The object form still replays: docs/step-04.md quotes recorded action logs
   * in that shape, and a fix that invalidated them would be a lie in the doc. */
  var byAlias = position(31337);
  byAlias.submit({ discard: 0 });
  check(byAlias.G.seize === 6, 'the legacy { discard } alias stopped working');
  var byAliasBlock = position(31337);
  byAliasBlock.submit({ block: true });
  check(byAliasBlock.G.phase === SD.PHASE.BLOCK_RESPONSE,
    'the legacy { block: true } alias stopped working');

  /* And when the Block is not available it is neither advertised nor accepted. */
  var G2 = SD.createGame({ names: names, humanIndex: 0, seed: 31337 });
  G2.seize = 2;                                     // below BLOCK_UNLOCKED_AT
  G2.blockUnlocked = false;
  G2.speaker = 1; G2.deputy = 0;
  G2.deputyHand = [SD.TILE.SEIZE, SD.TILE.REFORM];
  G2.phase = SD.PHASE.LEGISLATIVE_DEPUTY;
  var s2 = Human.createSession({ G: G2, minds: AI.create(G2), humanId: 0 });
  var w2 = s2.waitingFor();
  check(JSON.stringify(w2.options) === JSON.stringify([0, 1]),
    'a Block-less Deputy draft advertised ' + JSON.stringify(w2.options));
  var threw = false;
  try { s2.submit(Driver.BLOCK_OPTION); } catch (e) { threw = true; }
  check(threw, 'the Block was accepted with only two Seize on the board');

  say('deputy        all three answers verified by name: index 0 enacts, the Block moves,');
  say('              the legacy { discard } / { block } aliases still replay, and the');
  say('              Block is refused when the board has not unlocked it');
})();

/* ------------------------------- a bot step can never answer for the human */

(function () {
  /*
   * The direct probe, and the only shape that actually tests it: seat a human,
   * then call advanceBots() and NOTHING else, for as long as it will run.
   *
   * If advanceBots ever answered on the human's behalf the match would finish.
   * It must instead stall at the first decision the human owes and stay there
   * for ever. A loop that submits whenever it is asked — which is what every
   * other test here does — can never catch this, because advanceBots is only
   * reached in states where nothing is pending.
   */
  var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 777 });
  var s = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });

  /* Pass A: nothing but advanceBots. It must stall on the very first gate. */
  var nullsA = 0;
  for (var i = 0; i < 200; i++) if (!s.advanceBots()) nullsA++;
  check(nullsA === 200, 'advanceBots() stepped past the opening gate ' + (200 - nullsA) + ' times');
  check(s.actions.length === 0, 'advanceBots() recorded a human decision');

  /*
   * Pass B: answer the acknowledge beats — which are presentation gates, not
   * decisions a bot could ever make for you — and refuse everything else. The
   * bots must now get to act, and the match must then stall for good on the
   * first real decision the human owes. Without this pass the probe would only
   * ever prove that a session stuck on its opening gate stays stuck.
   */
  var botActions = 0;
  var nullsB = 0;
  var acks = 0;
  for (var k = 0; k < 600; k++) {
    var pend = s.waitingFor();
    if (pend && pend.kind === 'acknowledge') { s.submit(null); acks++; continue; }
    if (s.advanceBots()) botActions++; else nullsB++;
  }

  var stalled = s.waitingFor();
  check(!s.over, 'advanceBots() finished the match — it answered for the human');
  check(botActions > 0, 'the probe never let a bot act, so it proves nothing about bot steps');
  check(!!stalled && stalled.kind !== 'acknowledge',
    'the match did not stall on a real human decision, it stalled on ' +
    (stalled ? stalled.kind : 'nothing'));
  check(s.actions.every(function (a) { return a.kind === 'acknowledge'; }),
    'the session recorded a decision nobody submitted');

  /* And the state really is frozen while it waits.
   *
   * Guarded rather than assumed: when this probe fails it fails by the match
   * having RUN ON, so `stalled` is null and an unguarded `stalled.kind` here
   * throws a TypeError before the failures can be reported. A test that
   * crashes instead of reporting is a worse instrument than one that is merely
   * wrong — found by mutating advanceBots and watching the suite die instead
   * of speak. */
  if (stalled) {
    var frozen = Driver.snapshotAfter(G);
    for (var j = 0; j < 100; j++) s.advanceBots();
    check(JSON.stringify(Driver.snapshotAfter(G)) === JSON.stringify(frozen),
      'the game state moved while the human was owed a ' + stalled.kind);
  }

  say('bots only     pass A: 200 advanceBots() calls, all refused at the opening gate');
  say('              pass B: acknowledges answered, ' + acks + ' of them — ' + botActions +
      ' bot actions ran, then');
  say('              stalled on ' + (stalled ? stalled.kind : 'NOTHING — the match ran on') +
      ' for ' + nullsB + ' calls; state frozen, no decision invented');
})();

/* --------------------------------- an observer loop cannot lose a decision */

(function () {
  /*
   * The exact loop shape that made this look broken: watch waitingFor, answer
   * ONE decision, otherwise step the bots. With `auto()` scoped to one decision
   * this must see every decision the session records.
   */
  var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 777 });
  var s = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });

  var observed = 0;
  var guard = 0;
  while (!s.over && guard++ < 2000) {
    var w = s.waitingFor();
    if (w) { observed++; s.submit(w.options[0]); }     // one decision per pass
    else if (!s.advanceBots()) break;
  }

  check(s.over, 'the observer loop did not finish the match');
  check(observed === s.actions.length,
    'an observer answering one decision at a time saw ' + observed + ' of ' +
    s.actions.length + ' recorded decisions');
  check(observed > 20,
    'seed 777 should ask the human far more than once; it asked ' + observed + ' times');
  check(G.players[0].alive, 'seed 777 human was expected to survive — the check has moved');

  var votes = s.actions.filter(function (a) { return a.kind === 'vote'; }).length;
  var elections = s.events.filter(function (e) { return e.action === 'vote'; }).length;
  check(votes === elections,
    'seed 777: ' + votes + ' ballots asked for ' + elections + ' elections');

  say('observer      seed 777: ' + observed + ' decisions observed one at a time, all ' +
      s.actions.length + ' recorded');
  say('              ' + votes + ' ballots for ' + elections + ' elections, human alive at the end');
})();

/* ------------------------------------------------------------------- out */

console.log(lines.join('\n'));
console.log('');
if (failures.length) {
  console.error('FAILED — ' + failures.length + ' of ' + checks + ' checks:');
  failures.slice(0, 12).forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
}
console.log('OK — ' + checks + ' checks passed.');
