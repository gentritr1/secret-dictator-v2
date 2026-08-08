/*
 * The human-in-the-loop driver: replay determinism, and the promise that
 * seating a human changed nothing about an all-bot match.
 *
 *     node test/human-driver.test.js [games]     (npm run test:human)
 *
 * Three claims, in order of how much they are worth:
 *
 *  1. REPLAY. Same seed + same roster + same humanIndex + the same recorded
 *     list of human actions produces a byte-identical event log. This is the
 *     property that makes a bug report reproducible and, later, makes a
 *     server able to re-derive a client's match.
 *
 *  2. THE CONTROL. Force one different (still legal) human action and the log
 *     must differ. A determinism check that only ever compares equal things
 *     passes just as happily when the "replay" is really the same object.
 *
 *  3. NO SPILLOVER. With humanIndex = -1 the session must reproduce
 *     Driver.playOut exactly — the same events, event for event. Together with
 *     scripts/driver-parity.js (which still runs the untouched two-argument
 *     step()), that is what says the all-bot path did not move.
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
  if (!ok) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

/* ------------------------------------------------------- the human's hand
 *
 * A scripted "player" that is deterministic but NOT constant. Always picking
 * option 0 would drive every match down the same branch and would never send a
 * Deputy to the Block or a vote to Nay, so the replay would be proving
 * determinism over a thin slice of the rules. This mixes the running action
 * count into the choice: still a pure function of (how many decisions have been
 * made, which decision this is), so it replays, but it spreads across the
 * option space and takes the Block whenever it is offered.
 *
 * It draws from nothing. That is the whole point — if the scripted player used
 * a generator, "the same seed replays" would be a statement about the generator
 * rather than about the driver.
 */
function scriptedPlayer(salt) {
  var n = 0;
  return function (w) {
    var i = n++;
    switch (w.kind) {
      case 'acknowledge':
      case 'power_ack':
        return null;
      case 'vote':
        /* roughly 2 in 3 aye, in a fixed pattern */
        return ((i + salt) % 3) !== 0;
      case 'block_response':
        return ((i + salt) % 2) === 0;
      case 'deputy_discard':
        if (w.detail.canBlock && ((i + salt) % 2) === 0) return { block: true };
        return { discard: w.options[(i + salt) % w.options.length] };
      default:
        return w.options[(i + salt) % w.options.length];
    }
  };
}

/* An override wrapper: behave like `inner`, except at decision `index`, where
 * `swap(w)` chooses instead. Used for the divergence control. */
function withOverride(inner, index, swap) {
  var n = 0;
  return function (w, s) {
    var i = n++;
    if (i === index) return swap(w);
    return inner(w, s);
  };
}

function logOf(session) {
  return JSON.stringify(session.events);
}

/* Roles are dealt from the seed, so which seat is "the human" is not knowable
 * in advance — every seat gets a turn across the run. */
function rosterFor(count) { return NAMES.slice(0, count); }

/* ------------------------------------------------------------------- run */

var GAMES = parseInt(process.argv[2], 10) || 120;

var totalHumanActions = 0;
var kindsSeen = {};
var divergenceChecked = 0;
var divergenceSkipped = 0;
var deadHumanSeen = 0;
var humanWonSeen = { loyalist: 0, rebel: 0 };

for (var g = 0; g < GAMES; g++) {
  var count = 5 + (g % 6);
  var seed = 1000 + g * 7919;
  var humanIndex = g % count;
  var names = rosterFor(count);
  var salt = g;

  /* --- 1. record ------------------------------------------------------- */
  var recorded = Human.playMatch({
    names: names, humanIndex: humanIndex, seed: seed, decide: scriptedPlayer(salt)
  });
  var recordedLog = logOf(recorded);
  var script = recorded.actions.map(function (a) {
    return { n: a.n, kind: a.kind, gate: a.gate, action: a.action };
  });

  totalHumanActions += script.length;
  script.forEach(function (a) { kindsSeen[a.kind] = (kindsSeen[a.kind] || 0) + 1; });

  check(recorded.over, 'game ' + g + ': recorded match did not finish');
  check(script.length > 0, 'game ' + g + ': the human was never asked anything');
  if (!recorded.G.players[humanIndex].alive) deadHumanSeen++;
  if (recorded.G.winner) humanWonSeen[recorded.G.winner]++;

  /* --- 2. replay ------------------------------------------------------- */
  var replayed = Human.replayMatch({
    names: names, humanIndex: humanIndex, seed: seed, actions: script
  });
  check(logOf(replayed) === recordedLog,
    'game ' + g + ' (seed ' + seed + ', ' + count + 'p, human ' + humanIndex +
    '): replay produced a different event log');
  check(replayed.actions.length === script.length,
    'game ' + g + ': replay consumed ' + replayed.actions.length + ' of ' +
    script.length + ' recorded actions');
  check(replayed.G.winner === recorded.G.winner,
    'game ' + g + ': replay ended with a different winner');

  /* Replaying twice more from the same script must also match — a check that
   * the first replay did not simply hand back the recorded session. */
  var replayedAgain = Human.replayMatch({
    names: names, humanIndex: humanIndex, seed: seed, actions: script
  });
  check(replayedAgain !== replayed, 'game ' + g + ': replay returned the same session object');
  check(logOf(replayedAgain) === recordedLog, 'game ' + g + ': second replay differed');

  /* --- 3. the divergence control --------------------------------------- */
  /* Find the first decision that genuinely had another legal answer. Feeding a
   * different action there and letting the scripted player carry on must move
   * the match. */
  var forkAt = -1, forkSwap = null;
  for (var k = 0; k < recorded.actions.length; k++) {
    var a = recorded.actions[k];
    if (a.kind === 'vote' || a.kind === 'block_response') {
      forkAt = k;
      forkSwap = (function (was) { return function () { return !was; }; })(a.action);
      break;
    }
    if (a.kind === 'nominate' || a.kind === 'power_target' || a.kind === 'speaker_discard') {
      /* only useful if there really was a second option at the time */
      forkAt = k;
      forkSwap = (function (was) {
        return function (w) {
          var alt = w.options.filter(function (o) { return o !== was; });
          return alt.length ? alt[0] : was;
        };
      })(a.action);
      break;
    }
  }

  if (forkAt < 0) {
    divergenceSkipped++;
  } else {
    var forked = Human.playMatch({
      names: names, humanIndex: humanIndex, seed: seed,
      decide: withOverride(scriptedPlayer(salt), forkAt, forkSwap)
    });
    var forkedLog = logOf(forked);
    if (forked.actions[forkAt] &&
        JSON.stringify(forked.actions[forkAt].action) === JSON.stringify(recorded.actions[forkAt].action)) {
      /* the swap had nowhere to go — a one-option decision, not a control */
      divergenceSkipped++;
    } else {
      divergenceChecked++;
      check(forkedLog !== recordedLog,
        'game ' + g + ': changing human action #' + forkAt + ' (' +
        recorded.actions[forkAt].kind + ') left the event log identical');
    }
  }
}

/* A replay proof over decisions the human never actually faced would be worth
 * very little, so the kinds are asserted rather than merely printed.
 * `block_response` is not in this list: it needs a five-Seize board and a bot
 * Deputy holding two of them, which random play almost never produces — it gets
 * its own constructed position further down. */
['acknowledge', 'nominate', 'vote', 'speaker_discard', 'deputy_discard',
  'power_target', 'power_ack'].forEach(function (k) {
  check((kindsSeen[k] || 0) > 0,
    'the human was never asked for a ' + k + ' across ' + GAMES + ' matches');
});

say('replay        ' + GAMES + ' matches, every seat rotated through the human chair');
say('              ' + totalHumanActions + ' human decisions recorded and replayed byte-identically');
say('              decision kinds: ' + JSON.stringify(kindsSeen));
say('control       ' + divergenceChecked + ' matches forked at a real choice and diverged' +
    (divergenceSkipped ? ' (' + divergenceSkipped + ' had no second option to take)' : ''));
say('coverage      human purged in ' + deadHumanSeen + ' matches; winners ' +
    JSON.stringify(humanWonSeen));

/* --------------------------------------------- 3. the all-bot path stands */

var botMismatch = 0;
for (var b = 0; b < 24; b++) {
  var bc = 5 + (b % 6);
  var bseed = 4242 + b * 104729;
  var bnames = rosterFor(bc);

  /* the existing two-argument path */
  var G1 = SD.createGame({ names: bnames, humanIndex: -1, seed: bseed });
  var run1 = Driver.playOut(G1, AI.create(G1));

  /* the same match through the session, with no human seated */
  var G2 = SD.createGame({ names: bnames, humanIndex: -1, seed: bseed });
  var s2 = Human.createSession({ G: G2, minds: AI.create(G2), humanId: -1 });
  var asked = 0;
  Human.playOut(s2, function () { asked++; return null; });

  if (asked !== 0) botMismatch++;
  check(asked === 0, 'all-bot session ' + b + ': the session asked a human ' + asked + ' times');
  if (JSON.stringify(run1.events) !== JSON.stringify(s2.events)) botMismatch++;
  check(JSON.stringify(run1.events) === JSON.stringify(s2.events),
    'all-bot session ' + b + ' (seed ' + bseed + '): session log differs from Driver.playOut');
  check(G1.winner === G2.winner, 'all-bot session ' + b + ': different winner');
}
say('all-bot       24 matches: session log === Driver.playOut log' +
    (botMismatch ? ' — ' + botMismatch + ' MISMATCHES' : ', no human ever asked'));

/* ------------------------------------------------ illegal actions bounce */

(function () {
  var G = SD.createGame({ names: rosterFor(7), humanIndex: 0, seed: 7 });
  var s = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });

  var w = s.waitingFor();
  check(w && w.kind === 'acknowledge' && w.gate === 'morning',
    'a fresh match should open on the morning report, got ' + JSON.stringify(w && w.kind));
  check(s.submit(null) === null, 'the morning gate should take no engine step');
  check(s.waitingFor() === null || s.waitingFor().gate !== 'morning',
    'the morning gate did not clear');

  /* Walk to the first real decision the human owns and try to break it. */
  var guard = 0;
  while (!s.over && guard++ < 200) {
    var pending = s.waitingFor();
    if (pending && pending.kind !== 'acknowledge') break;
    if (pending) s.submit(null);
    else if (!s.advanceBots()) break;
  }
  var pend = s.waitingFor();
  if (check(!!pend, 'never reached a real human decision in 200 steps')) {
    var threw = false;
    try {
      if (pend.kind === 'vote' || pend.kind === 'block_response') s.submit('yes please');
      else if (pend.kind === 'deputy_discard') s.submit({ discard: 99 });
      else s.submit(-999);
    } catch (err) { threw = true; }
    check(threw, 'an illegal ' + pend.kind + ' was accepted');
  }

  /* Submitting when nothing is pending must throw too, not silently step. */
  var threwIdle = false;
  var G3 = SD.createGame({ names: rosterFor(7), humanIndex: 0, seed: 11 });
  var s3 = Human.createSession({ G: G3, minds: AI.create(G3), humanId: 0 });
  s3.submit(null);                                  // clear the morning gate
  while (s3.waitingFor()) s3.submit(s3.waitingFor().options[0]);
  try { s3.submit(0); } catch (e) { threwIdle = true; }
  check(threwIdle, 'submit() was accepted while nothing was waiting');

  say('guards        illegal actions and idle submits throw; the morning gate takes no step');
})();

/* ------------------------------------------ the Block, aimed at on purpose
 *
 * A human Speaker answering a bot Deputy's Block needs the Deputy to be holding
 * two Seizes with five already on the board, which across a random 120 matches
 * turns up roughly never. Rather than leave the branch to luck, the position is
 * built directly — the same idiom test/engine.test.js uses for the same rule —
 * and then driven through the session so the human path is the one exercised.
 */
(function () {
  var names = rosterFor(7);

  function setUp(seed) {
    var G = SD.createGame({ names: names, humanIndex: 0, seed: seed });
    var minds = AI.create(G);
    G.seize = 5;
    G.blockUnlocked = true;
    G.speaker = 0;                                  // the human holds the gavel
    /* Only a Loyalist bot Deputy blocks two Seizes (ai.js: a Rebel blocks only
     * to deny a forced Reform), so the seat is chosen by role, not by index. */
    G.deputy = G.players.find(function (p) {
      return p.id !== 0 && p.role === SD.ROLE.LOYALIST;
    }).id;
    G.lastVote = { aye: [0, G.deputy], nay: [], passed: true, speaker: 0, nominee: G.deputy };
    G.deputyHand = [SD.TILE.SEIZE, SD.TILE.SEIZE];
    G.phase = SD.PHASE.LEGISLATIVE_DEPUTY;
    return Human.createSession({ G: G, minds: minds, humanId: 0 });
  }

  /* The bot Deputy moves the Block; the session must then stop on the human. */
  var s = setUp(31337);
  check(s.waitingFor() === null, 'the human should not be owed anything while the Deputy drafts');
  var ev = s.advanceBots();
  check(ev && ev.action === 'propose_block',
    'the Loyalist bot Deputy did not move the Block on two Seizes, got ' + (ev && ev.action));
  var w = s.waitingFor();
  check(w && w.kind === 'block_response' && w.playerId === 0,
    'the Block did not stop on the human Speaker, got ' + JSON.stringify(w && w.kind));
  check(!!w && w.options.length === 2, 'block_response should offer two answers');

  /* Refusing forces the Deputy to enact — and the sixth Seize ends it. */
  var refused = setUp(31337);
  refused.advanceBots();
  refused.submit(false);
  check(refused.G.phase === SD.PHASE.LEGISLATIVE_DEPUTY,
    'a refused Block did not return to the Deputy');
  refused.advanceBots();
  check(refused.G.winner === SD.TEAM.REBEL && refused.G.seize === 6,
    'refusing the Block did not force the sixth Seize through');

  /* Agreeing burns both tiles and turns the Chaos Track instead. */
  var agreed = setUp(31337);
  agreed.advanceBots();
  var before = agreed.G.reform + agreed.G.seize;
  agreed.submit(true);
  check(agreed.G.reform + agreed.G.seize === before, 'an accepted Block still passed a law');
  check(agreed.G.chaos === 1, 'an accepted Block did not advance the Chaos Track');

  /* And the human's answer replays: the whole position is reconstructible. */
  function runFrom(answer) {
    var sx = setUp(31337);
    sx.advanceBots();
    sx.submit(answer);
    var guard = 0;
    while (!sx.over && guard++ < 400) {
      var pw = sx.waitingFor();
      if (pw) sx.submit(pw.kind === 'deputy_discard' ? { discard: pw.options[0] } : pw.options[0]);
      else if (!sx.advanceBots()) break;
    }
    return logOf(sx);
  }
  check(runFrom(true) === runFrom(true), 'the same Block answer replayed differently');
  check(runFrom(true) !== runFrom(false), 'agreeing and refusing the Block produced the same log');

  say('block         a bot Deputy\'s Block stops on the human Speaker; both answers replay');
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
