/*
 * The square murmurs, and the murmurs cannot change the match.
 *
 *     node test/murmur.test.js [games]        (npm run test:murmur)
 *
 * Layer 1 wires v1's dormant `AI.chatter` into the square as ambient
 * table-talk. `chatter` draws from `G.rng()` — several times per call, with two
 * retry loops that draw a variable number more — and the engine's whole notion
 * of chance is that one seeded stream. Calling it with the real game object
 * would shift every later bot decision and break seed replay, which is the
 * oldest law in this project. src/engine/ is byte-frozen, so the whole defence
 * is caller-side and lives in src/play/murmur.js.
 *
 * This file does not assert that the defence works. It tries to break it, and
 * then proves the instrument that failed to break it can see the failure.
 *
 *  0. THE PREMISE. Everything above rests on a claim about frozen code: that
 *     chatter READS `G.players`, `G.seize` and `G.rng`, reads `minds` not at
 *     all, and mutates nothing. Reading ai.js is how the claim was formed;
 *     these checks are how it is held. minds arrives as a Proxy that throws on
 *     any access whatsoever, and the stand-in arrives deep-frozen, so a read or
 *     a write outside the contract is a thrown exception rather than a
 *     paragraph in a doc that stopped being true.
 *
 *  1. THE INVARIANCE, in three runs rather than two. Building a player-safe
 *     view at every seam is itself a call into the engine, so "plain vs
 *     murmuring" would confound two claims. A: plain. B: a view built at every
 *     seam, no talk. C: views plus murmurs firing on every beat. A === B says
 *     the projection is inert; B === C says the talk is. Event log, engine
 *     prose log, action log, winner and step count, byte for byte, over several
 *     seeds, table sizes, human seats and pace speeds.
 *
 *  2. THE PROBE. An invariance claim from an instrument nobody proved works is
 *     a green light from a broken sensor — the step-04 lesson, and the reason
 *     pace.test.js has the same section. So the same interleave runs once more
 *     with the mistake this whole design exists to prevent: chatter called with
 *     the REAL `G` at exactly the same beats. It must diverge.
 *
 *  3. THE LEAK SWEEP. Every sentence the square actually generated, across
 *     seeded matches, swept for a role or team word and for the name of anybody
 *     the square has not publicly been told about in that beat — the
 *     view.test.js idiom pointed at prose, as objective.js's sweep already
 *     does for the objective line. Plus the template census: every distinct
 *     line each v1 pool can produce, classified as used or excluded, so
 *     "which pools leak" is a measured list and not a reading.
 *
 *  4. THE SQUARE'S MANNERS. The dead do not speak, the human seat does not
 *     murmur, at most two bubbles are up at once, and a bubble does not outlive
 *     its band. Driven on a synthetic clock so the numbers are exact.
 *
 *  4b. THE SECOND VOICE (D2). src/play/floor-voice.js renders a validated
 *     utterance record into prose and pushes it through the SAME queue, so
 *     every manner above has to survive it: the cap is a cap on bubbles, not on
 *     murmurs. A whole match is driven on a synthetic clock with both voices
 *     running, and the authored prose gets the same treatment the templates
 *     get — no role word, no name the utterance did not publicly involve — plus
 *     the census of the sentence table itself, because an entry no match
 *     happens to reach is still prose that will ship.
 *
 *  5. THE SOURCE. src/play/murmur.js imports nothing, mentions no engine
 *     module, no `Math.random`, no `.rng(` and no `eventLog`.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Human = require('../src/engine/human-driver.js');
var View = require('../src/engine/view.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
var SPEEDS = [0.5, 1, 2, 4];

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

/** Deterministic but not constant — always answering options[0] tests one branch. */
function scriptedPlayer(salt) {
  var n = 0;
  return function (w) {
    var i = n++;
    if (w.kind === 'acknowledge' || w.kind === 'power_ack') return null;
    if (w.kind === 'vote') return ((i + salt) % 3) !== 0;
    if (w.kind === 'block_response') return ((i + salt) % 2) === 0;
    return w.options[(i + salt) % w.options.length];
  };
}

/**
 * Play one match. `seam(G, session)` runs at every point a real page consults
 * its own presentation state between engine calls — which is the point: main.js
 * refreshes the view and cues murmurs off it, so the test does too, only more
 * often than the page ever would.
 */
function playMatch(seed, count, humanIndex, salt, seam) {
  var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: humanIndex, seed: seed });
  var session = Human.createSession({ G: G, minds: AI.create(G), humanId: humanIndex });
  var decide = scriptedPlayer(salt);
  var guard = 0;

  while (!session.over && guard++ < 900) {
    if (seam) seam(G, session);
    var w = session.waitingFor();
    if (w) {
      var action = decide(w, session);
      if (seam) seam(G, session);
      session.submit(action);
      if (seam) seam(G, session);
    } else {
      if (!session.advanceBots()) break;
      if (seam) seam(G, session);
    }
  }
  return {
    log: JSON.stringify(session.events),
    prose: JSON.stringify(G.log),
    actions: JSON.stringify(session.actions),
    winner: G.winner,
    steps: session.steps
  };
}

/**
 * A seam that keeps a rolling pair of player-safe views and hands each
 * transition to `onPair`. `waitingFor` is pinned to null rather than derived:
 * no beat reads it, and pinning it keeps the projection from calling back into
 * the driver at all.
 */
function viewSeam(humanIndex, onPair) {
  var prev = null;
  return function (G) {
    var next = View.viewFor(G, humanIndex, { waitingFor: null });
    if (onPair) onPair(prev, next);
    prev = next;
  };
}

async function main() {
  var M = await import('../src/play/murmur.js');
  var createMurmurs = M.createMurmurs;
  var murmurBeat = M.murmurBeat;
  var keepable = M.keepable;
  var namesIn = M.namesIn;

  var GAMES = parseInt(process.argv[2], 10) || 40;

  /* ------------------------------------------------------- 0. the premise */

  /*
   * A minds object that cannot be touched. Any get, has, ownKeys or anything
   * else throws — so if chatter reads `minds` even once, this section fails
   * loudly instead of the doc comment quietly going stale.
   */
  var mindsTripwire = new Proxy({}, {
    get: function () { throw new Error('chatter read minds'); },
    has: function () { throw new Error('chatter probed minds'); },
    ownKeys: function () { throw new Error('chatter enumerated minds'); },
    getOwnPropertyDescriptor: function () { throw new Error('chatter described minds'); },
    set: function () { throw new Error('chatter wrote minds'); }
  });

  function frozenStandIn(nBots, seizeCount, stream) {
    var players = [];
    for (var i = 0; i <= nBots; i++) {
      players.push(Object.freeze({ id: i, alive: true, isHuman: i === 0 }));
    }
    return Object.freeze({
      players: Object.freeze(players),
      seize: seizeCount,
      rng: stream
    });
  }

  var probeStream = (function () {
    var s = 12345;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s % 100000) / 100000; };
  })();

  var POOLS = ['nomination', 'voteOpen', 'seizeEnacted', 'reformEnacted',
    'voteFailed', 'chaos', 'purge', 'danger'];
  var premiseOk = true;
  var premiseLines = 0;
  var premiseErr = null;
  try {
    for (var pi = 0; pi < POOLS.length; pi++) {
      for (var rep = 0; rep < 300; rep++) {
        var stand = frozenStandIn(7, rep % 6, probeStream);
        var got = AI.chatter(stand, mindsTripwire, POOLS[pi],
          { speaker: 'Bo', nominee: 'Chen', deputy: 'Dara', target: 'Eze' });
        premiseLines += got.length;
      }
    }
  } catch (e) { premiseOk = false; premiseErr = e.message; }
  check(premiseOk, 'chatter touched minds or wrote to the stand-in: ' + premiseErr);
  check(premiseLines > 0, 'the premise probe generated no lines at all — it proves nothing');

  /* And the fourth thing it reads: with nobody alive but the human, silence. */
  var onlyHuman = Object.freeze({
    players: Object.freeze([Object.freeze({ id: 0, alive: true, isHuman: true })]),
    seize: 0, rng: probeStream
  });
  check(AI.chatter(onlyHuman, mindsTripwire, 'chaos', {}).length === 0,
    'chatter produced a line with no living bot to say it');
  var allDead = Object.freeze({
    players: Object.freeze([
      Object.freeze({ id: 0, alive: true, isHuman: true }),
      Object.freeze({ id: 1, alive: false, isHuman: false })
    ]),
    seize: 0, rng: probeStream
  });
  check(AI.chatter(allDead, mindsTripwire, 'chaos', {}).length === 0,
    'chatter gave a line to a dead citizen');

  say('premise       ' + premiseLines + ' lines generated with `minds` behind a Proxy that throws on');
  say('              any access and the stand-in deep-frozen: chatter reads only players,');
  say('              seize and rng, and mutates nothing. Dead and human seats never speak.');

  /* --------------------------------------------------- 1. the invariance */

  var totalDraws = 0, totalCalls = 0, totalMurmurs = 0, totalBeats = 0;
  var swept = [];              // every kept line, with the beat that produced it
  var droppedByFilter = 0;

  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var seed = 1000 + g * 7919;
    var human = g % count;
    var speed = SPEEDS[g % SPEEDS.length];

    var plain = playMatch(seed, count, human, g, null);
    var viewsOnly = playMatch(seed, count, human, g, viewSeam(human, null));

    check(viewsOnly.log === plain.log && viewsOnly.prose === plain.prose,
      'seed ' + seed + ': building a player-safe view at every seam changed the match — ' +
      'the murmur comparison below would be measuring the wrong thing');

    /*
     * Firing on EVERY beat, not at the rates the page ships. The scarcity gates
     * decide how often chatter is called; the invariance question is what
     * happens when it is called, so the gates are switched off to hammer it.
     */
    var clock = 0;
    var lastView = null;
    var murmurs = createMurmurs(seed, {
      chatter: AI.chatter,
      alwaysSpeak: true,
      onSay: function (beat, kept, dropped) {
        droppedByFilter += dropped.length;
        for (var k = 0; k < kept.length; k++) {
          swept.push({ line: kept[k], beat: beat, view: lastView, seed: seed });
        }
      }
    });
    var timed = playMatch(seed, count, human, g, viewSeam(human, function (prev, next) {
      lastView = next;
      clock += 137;
      murmurs.observe(prev, next, { now: clock, notBefore: clock, speed: speed });
      murmurs.pump(clock, next);
    }));

    totalDraws += murmurs.draws;
    totalCalls += murmurs.calls;
    totalMurmurs += murmurs.produced;
    totalBeats += murmurs.beatsSeen;

    check(timed.log === viewsOnly.log,
      'seed ' + seed + '/' + count + 'p/seat ' + human + ' at ' + speed +
      'x: the driver event log changed when the square murmured');
    check(timed.prose === viewsOnly.prose,
      'seed ' + seed + ': the engine log — what the square has officially heard — ' +
      'changed when the square murmured; a murmur must not enter the record');
    check(timed.actions === viewsOnly.actions,
      'seed ' + seed + ': the recorded human actions changed when the square murmured');
    check(timed.winner === viewsOnly.winner && timed.steps === viewsOnly.steps,
      'seed ' + seed + ': winner or step count changed when the square murmured');
    check(murmurs.draws > 0, 'seed ' + seed + ': the murmur stream was never drawn — inert probe');
  }
  check(totalCalls > GAMES,
    'chatter ran only ' + totalCalls + ' times across ' + GAMES +
    ' matches — too few for the invariance result to mean much');

  /* ------------------------------------------------------------ 2. the probe */

  var caught = 0, attempted = 0, probeCalls = 0;
  for (var d = 0; d < GAMES; d++) {
    var dCount = 5 + (d % 6);
    var dSeed = 1000 + d * 7919;
    var dHuman = d % dCount;
    var clean = playMatch(dSeed, dCount, dHuman, d, viewSeam(dHuman, null));

    /*
     * The exact mistake: chatter handed the real G, so its picks come out of
     * the engine's seeded stream. This is what `Object.create(G)` without an
     * own `rng`, or a straight `AI.chatter(app.G, ...)` ported from v1, would
     * do — and it is the failure the section above must be able to see.
     */
    var dirtyG = null;
    var fired = 0;
    var dirty = playMatch(dSeed, dCount, dHuman, d, (function () {
      var seam = viewSeam(dHuman, function (prev, next) {
        var b = murmurBeat(prev, next);
        if (!b || !dirtyG) return;
        AI.chatter(dirtyG, null, b.beat === 'seize' ? 'seizeEnacted' : 'chaos', b.ctx);
        fired++;
      });
      return function (G, session) { dirtyG = G; seam(G, session); };
    })());
    attempted++;
    probeCalls += fired;
    if (fired > 0 && dirty.log !== clean.log) caught++;
    else if (fired === 0) attempted--;   // nothing was drawn; not a probe at all
  }
  check(attempted > GAMES / 2,
    'only ' + attempted + ' of ' + GAMES + ' probe matches ever reached a public beat');
  check(caught === attempted,
    'chatter drawing from the engine stream changed the match in only ' + caught +
    ' of ' + attempted + ' games — the invariance check above cannot reliably see ' +
    'the failure it is aimed at, so its green result means nothing');

  say('invariance    ' + GAMES + ' matches played three times — plain, with a player-safe view');
  say('              built at every seam, and with murmurs firing on every beat at 0.5-4x.');
  say('              ' + totalDraws + ' murmur draws over ' + totalCalls + ' chatter calls and ' +
      totalBeats + ' public beats: driver log,');
  say('              engine prose log, action log, winner and step count byte-identical.');
  say('probe         ' + caught + '/' + attempted + ' matches DIVERGED when chatter was handed the real G');
  say('              (' + probeCalls + ' calls), so the check above can see the failure it is aimed at');

  /* -------------------------------------------------------- 3. the leak sweep */

  check(swept.length > 200,
    'only ' + swept.length + ' murmurs were generated — too few to sweep meaningfully');

  var leaks = 0, strangers = 0, selfTalk = 0, deadSpoke = 0, humanSpoke = 0, seams = 0;
  for (var s = 0; s < swept.length; s++) {
    var rec = swept[s];
    var text = rec.line.text;
    var who = rec.line.playerId;
    var v = rec.view;

    if (M.ROLE_TOKENS.test(text)) {
      leaks++;
      check(false, 'a murmur asserted a role: "' + text + '"');
    }
    var named = namesIn(text, v.players);
    for (var n = 0; n < named.length; n++) {
      if (named[n] === who) {
        selfTalk++;
        check(false, '"' + text + '" is said by the citizen it names');
      } else if (rec.beat.subjects.indexOf(named[n]) === -1) {
        strangers++;
        check(false, '"' + text + '" names ' + v.players[named[n]].name +
          ', who is not publicly involved in the ' + rec.beat.beat + ' beat');
      }
    }
    if (!v.players[who].alive) { deadSpoke++; check(false, 'a dead citizen murmured'); }
    if (v.players[who].isYou) { humanSpoke++; check(false, 'the human seat murmured'); }
    /* An unfilled {slot} leaves a seam like "talk first, ." — fill() tidies the
     * punctuation but a doubled space or a stray brace is still a bug. */
    if (/\{|\}|\s{2,}|^\s|\s$/.test(text) || /[,:]\s*[.?!]/.test(text)) {
      seams++;
      check(false, 'a murmur shipped a template seam: ' + JSON.stringify(text));
    }
  }

  /*
   * The template census. Every distinct sentence each v1 pool can produce,
   * generated rather than transcribed, then run through the same filter the
   * page runs. This is what turns "which pools leak" into a measurement.
   */
  var censusView = {
    players: [
      { id: 0, name: 'Alice', alive: true, isYou: true },
      { id: 1, name: 'Bo', alive: true, isYou: false },
      { id: 2, name: 'Chen', alive: true, isYou: false },
      { id: 3, name: 'Dara', alive: true, isYou: false },
      { id: 4, name: 'Eze', alive: true, isYou: false }
    ]
  };
  /*
   * The census asks one question only: which templates are barred outright,
   * i.e. no matter WHO says them. So it is run in the most permissive possible
   * seat — the speaker is Eze, whom none of these templates name, and Eze also
   * held the two tiles — leaving the role rule as the only one that can fire.
   * The situational rules get their own targeted checks below, because a census
   * that conflated "this pool leaks" with "this citizen may not say this" would
   * report the wrong pools as leaky.
   */
  var censusBeat = { beat: 'census', ctx: {}, subjects: [1, 2, 3, 4], holder: 4 };
  var census = {};
  var excludedTexts = [];
  for (var cp = 0; cp < POOLS.length; cp++) {
    var pool = POOLS[cp];
    var seen = {};
    for (var t = 0; t < 4000; t++) {
      var out = AI.chatter(frozenStandIn(4, 2, probeStream), null, pool,
        { speaker: 'Bo', nominee: 'Chen', deputy: 'Dara', target: 'Dara' });
      for (var oi = 0; oi < out.length; oi++) seen[out[oi].text] = true;
    }
    var texts = Object.keys(seen);
    var kept = 0;
    for (var ti = 0; ti < texts.length; ti++) {
      var ok = keepable({ playerId: 4, text: texts[ti] }, censusView, censusBeat);
      if (ok) kept++;
      else excludedTexts.push(pool + ': ' + texts[ti]);
    }
    census[pool] = { total: texts.length, kept: kept };
  }
  /* The two v1 lines that assert an allegiance, and nothing else, are barred. */
  check(excludedTexts.length === 2,
    'the template filter barred ' + excludedTexts.length + ' lines outright, expected 2: ' +
    JSON.stringify(excludedTexts));
  for (var xi = 0; xi < excludedTexts.length; xi++) {
    check(M.ROLE_TOKENS.test(excludedTexts[xi]),
      'a line was barred for something other than a role word: ' + excludedTexts[xi]);
    check(/^purge:/.test(excludedTexts[xi]),
      'a pool other than purge was found to leak: ' + excludedTexts[xi]);
  }
  check(census.purge && census.purge.kept === census.purge.total - 2,
    'the purge pool should lose exactly its two role-asserting lines');

  /*
   * The three situational rules, each shown firing and each shown NOT firing,
   * because a filter that rejects everything passes a sweep just as happily as
   * a correct one.
   */
  var selfRef = { playerId: 3, text: 'Dara is gone and we still don’t know.' };
  check(!keepable(selfRef, censusView, { subjects: [3], holder: null }),
    'a citizen was allowed to talk about themselves in the third person');
  check(keepable({ playerId: 1, text: selfRef.text }, censusView, { subjects: [3], holder: null }),
    'a citizen was blocked from naming somebody publicly involved');
  check(!keepable({ playerId: 1, text: selfRef.text }, censusView, { subjects: [2], holder: null }),
    'a citizen was allowed to name somebody outside the beat');
  var handClaim = { text: 'i was handed two seizes. count the deck.' };
  check(!keepable({ playerId: 1, text: handClaim.text }, censusView, { subjects: [], holder: 2 }),
    'a citizen who never held the tiles was allowed to claim the hand');
  check(keepable({ playerId: 2, text: handClaim.text }, censusView, { subjects: [], holder: 2 }),
    'the Deputy was blocked from describing their own hand');
  check(!keepable({ playerId: 1, text: 'chen is a rebel, obviously.' }, censusView,
    { subjects: [1, 2], holder: null }),
    'a role word walked through the filter');

  say('sweep         ' + swept.length + ' generated murmurs across ' + GAMES + ' matches: ' + leaks +
      ' role words, ' + strangers + ' names outside');
  say('              the beat\'s public subjects, ' + selfTalk + ' citizens naming themselves, ' +
      deadSpoke + ' dead');
  say('              speakers, ' + humanSpoke + ' human speakers, ' + seams + ' template seams. ' +
      droppedByFilter + ' lines dropped');
  say('              by the filter before they could reach a bubble.');
  say('census        every distinct line each v1 pool can produce, run through the same');
  say('              filter: ' + Object.keys(census).map(function (k) {
    return k + ' ' + census[k].kept + '/' + census[k].total;
  }).join(', '));
  say('excluded      ' + excludedTexts.join('  |  '));

  /* ------------------------------------------------ 4. the square's manners */

  /*
   * Cadence at the shipping gates, measured rather than declared. A number in a
   * spec that was never computed from live data is the red flag this project
   * has been bitten by; this is the measurement.
   */
  var spokenBeats = 0, seenBeats = 0, bubbles = 0, longestQuiet = 0;
  for (var cg = 0; cg < GAMES; cg++) {
    var cCount = 5 + (cg % 6);
    var cSeed = 1000 + cg * 7919;
    var cHuman = cg % cCount;
    var quiet = 0;
    var cm = createMurmurs(cSeed, { chatter: AI.chatter });
    var cClock = 0;
    playMatch(cSeed, cCount, cHuman, cg, viewSeam(cHuman, function (prev, next) {
      if (!murmurBeat(prev, next)) return;
      seenBeats++;
      cClock += 2000;
      var made = cm.observe(prev, next, { now: cClock, notBefore: cClock, speed: 1 });
      if (made > 0) { spokenBeats++; bubbles += made; quiet = 0; }
      else { quiet++; if (quiet > longestQuiet) longestQuiet = quiet; }
    }));
  }
  var rate = seenBeats ? spokenBeats / seenBeats : 0;
  check(rate > 0.2 && rate < 0.8,
    'the square murmured at ' + Math.round(rate * 100) + '% of public beats — scarcity ' +
    'means neither silence nor wallpaper');
  check(longestQuiet >= 2,
    'no quiet stretch of two consecutive public beats was ever observed — the gates are inert');

  /* Concurrency and lifetime, on a synthetic clock so the numbers are exact. */
  var stageView = {
    players: [
      { id: 0, name: 'Alice', alive: true, isYou: true },
      { id: 1, name: 'Bo', alive: true, isYou: false },
      { id: 2, name: 'Chen', alive: true, isYou: false },
      { id: 3, name: 'Dara', alive: true, isYou: false },
      { id: 4, name: 'Eze', alive: true, isYou: false }
    ]
  };
  var stage = createMurmurs(77, { chatter: AI.chatter, alwaysSpeak: true });
  var maxUp = 0, everUp = 0, lifetimes = [];
  var upSince = {};
  var prevA = { players: stageView.players, phase: 'nomination', day: 1, reform: 0, seize: 0,
    nominee: null, speaker: 0, lastVote: null, lastEnacted: null, power: null,
    limits: { seizeToWin: 6 } };
  for (var stepI = 0; stepI < 400; stepI++) {
    var now = stepI * 250;
    if (stepI % 8 === 0) {
      /* A fresh chaos beat every two seconds — far denser than a real match. */
      var nextA = JSON.parse(JSON.stringify(prevA));
      nextA.phase = prevA.phase === 'chaos' ? 'nomination' : 'chaos';
      stage.observe(prevA, nextA, { now: now, notBefore: now, speed: 1 });
      prevA = nextA;
    }
    stage.pump(now, stageView);
    var up = stage.visible;
    if (up.length > maxUp) maxUp = up.length;
    everUp += up.length ? 1 : 0;
    var upNow = {};
    for (var ui = 0; ui < up.length; ui++) {
      /* Keyed on identity, not on the sentence: the same citizen can say the
       * same words twice in one match, and keying on the text measured those
       * two bubbles as one 12-second bubble. */
      var key = String(up[ui].id);
      upNow[key] = true;
      if (upSince[key] === undefined) upSince[key] = now;
    }
    Object.keys(upSince).forEach(function (k) {
      if (!upNow[k]) { lifetimes.push(now - upSince[k]); delete upSince[k]; }
    });
    var seats = {};
    for (var pi2 = 0; pi2 < up.length; pi2++) {
      check(up[pi2].playerId !== 0, 'the human seat had a bubble over it');
      /* One citizen, one bubble: there is one element per figure, so two
       * concurrent murmurs on one seat would be a murmur that never appears. */
      check(!seats[up[pi2].playerId],
        'seat ' + up[pi2].playerId + ' had two bubbles at once');
      seats[up[pi2].playerId] = true;
    }
  }
  check(maxUp === M.MAX_VISIBLE,
    'the busiest moment had ' + maxUp + ' bubbles up, expected exactly ' + M.MAX_VISIBLE);
  check(everUp > 100, 'the concurrency drive barely showed anything — it proves nothing');
  var longest = Math.max.apply(null, lifetimes.concat([0]));
  check(lifetimes.length > 20 && longest <= M.LIFE_MS[1] + 250,
    'a bubble lived ' + longest + ' ms, past the ' + M.LIFE_MS[1] + ' ms band');

  /* The dead stop talking mid-sentence. */
  var dyingView = JSON.parse(JSON.stringify(stageView));
  var dying = createMurmurs(9, { chatter: AI.chatter, alwaysSpeak: true });
  var pv = { players: dyingView.players, phase: 'nomination', day: 1, reform: 0, seize: 0,
    nominee: null, speaker: 0, lastVote: null, lastEnacted: null, power: null,
    limits: { seizeToWin: 6 } };
  var nv = JSON.parse(JSON.stringify(pv));
  nv.phase = 'chaos';
  dying.observe(pv, nv, { now: 0, notBefore: 0, speed: 1 });
  dying.pump(1200, dyingView);
  var before2 = dying.visible.length;
  for (var dp = 1; dp < dyingView.players.length; dp++) dyingView.players[dp].alive = false;
  dying.pump(1300, dyingView);
  check(before2 > 0 && dying.visible.length === 0,
    'a bubble survived the death of the citizen saying it (' + before2 + ' before, ' +
    dying.visible.length + ' after)');

  /* Speed scales the bands, so 4x does not leave the square muttering. */
  var slow = createMurmurs(31, { chatter: AI.chatter, alwaysSpeak: true });
  var fast = createMurmurs(31, { chatter: AI.chatter, alwaysSpeak: true });
  var pv2 = { players: stageView.players, phase: 'nomination', day: 1, reform: 0, seize: 0,
    nominee: null, speaker: 0, lastVote: null, lastEnacted: null, power: null,
    limits: { seizeToWin: 6 } };
  var nv2 = JSON.parse(JSON.stringify(pv2)); nv2.phase = 'chaos';
  slow.observe(pv2, nv2, { now: 0, notBefore: 0, speed: 1 });
  fast.observe(pv2, nv2, { now: 0, notBefore: 0, speed: 4 });
  slow.pump(20000, stageView); fast.pump(20000, stageView);
  check(slow.produced === fast.produced && slow.produced > 0,
    'the same seed produced a different number of murmurs at a different speed — ' +
    'speed must scale the clock and nothing else');

  /* The same seed says the same thing; a different seed does not. */
  function transcript(seed) {
    var out = [];
    var mm = createMurmurs(seed, {
      chatter: AI.chatter,
      onSay: function (beat, kept) {
        for (var i = 0; i < kept.length; i++) out.push(kept[i].playerId + ':' + kept[i].text);
      }
    });
    var c = 0;
    playMatch(4242, 7, 0, 3, viewSeam(0, function (prev, next) {
      c += 900;
      mm.observe(prev, next, { now: c, notBefore: c, speed: 1 });
    }));
    return out.join('\n');
  }
  var t1 = transcript(4242), t2 = transcript(4242), t3 = transcript(4243);
  check(t1.length > 0, 'the transcript check generated nothing');
  check(t1 === t2, 'the same seed murmured different words');
  check(t1 !== t3, 'two different seeds murmured identically — the seed is not being used');

  say('cadence       ' + spokenBeats + ' of ' + seenBeats + ' public beats murmured (' +
      Math.round(rate * 100) + '%) over ' + GAMES + ' matches at the');
  say('              shipping gates, ' + bubbles + ' bubbles; longest quiet run ' + longestQuiet +
      ' public beats');
  say('manners       never more than ' + M.MAX_VISIBLE + ' bubbles up under a beat every 2 s; ' +
      lifetimes.length + ' lifetimes, longest');
  say('              ' + longest + ' ms against a ' + M.LIFE_MS[0] + '-' + M.LIFE_MS[1] +
      ' ms band; a bubble dies with its citizen; the');
  say('              human seat never has one; the same seed says the same words');

  /* -------------------------------------------------- 4b. the floor speaks
   *
   * D2 gives the square a second voice: src/play/floor-voice.js renders a
   * validated utterance record into prose and pushes it through `say()`, into
   * THE SAME queue as an idle murmur. So every manner checked above has to
   * survive the addition — the cap is a cap on bubbles, not on murmurs — and
   * the prose has to pass the same bright line the templates do.
   *
   * The whole match is driven on a synthetic clock, so the numbers are exact
   * and a background tab cannot make the answer different.
   */

  var FV = await import('../src/play/floor-voice.js');
  var Floor = require('../src/engine/floor.js');
  var Orator = require('../src/engine/orator.js');
  var Intents = require('../src/engine/intents.js');

  (function () {
    var maxUp = 0, floorBubbles = 0, idleBubbles = 0, samples = 0;
    var seatsSeen = {}, kindsSeen = {}, missing = {}, wrongName = 0, roleWords = 0;
    var floorLines = 0, shown = {}, barred = 0, rejects = 0;
    var matches = 0, utterances = 0;
    var humanSaid = 0, humanNamed = 0, playerBeats = 0, playerSilences = 0;

    for (var fgi = 0; fgi < Math.min(GAMES, 8); fgi++) {
      var fSeed = 4242 + fgi * 7919;
      var fCount = 5 + (fgi % 6);
      var fHuman = fgi % fCount;
      var G = SD.createGame({
        names: NAMES.slice(0, fCount), humanIndex: fHuman, seed: fSeed
      });
      var fMinds = AI.create(G);
      var session = Human.createSession({ G: G, minds: fMinds, humanId: fHuman });
      /*
       * D3 hands the voice an Intents module, which is what turns the pause on:
       * the floor now STOPS at the human seat instead of speaking for it, and
       * `beat()` below answers the strip the way the tray does. Driving it with
       * the pause off would test a path the browser no longer takes.
       */
      var voice = FV.createFloorVoice({
        Floor: Floor, Orator: Orator, Intents: Intents, seed: fSeed, humanSeat: fHuman,
        names: NAMES.slice(0, fCount), minds: fMinds
      });
      var mm = createMurmurs(fSeed, { chatter: AI.chatter });
      var decide = scriptedPlayer(fgi);
      var prev = null;
      var now = 0;
      var guard = 0;
      matches++;

      /*
       * ANSWER THE STRIP, exactly as the tray does.
       *
       * A cycle of intents: whichever slot the counter lands on, so the sweep
       * sees claims, accusations, questions, support and both kinds of silence
       * rather than one of them fifty times. Every slot came out of
       * src/engine/intents.js already validated, so `rejects` staying at zero
       * below is a statement about the strip and not about this loop.
       */
      var pick = 0;
      function answerStrip(lines) {
        var spins = 0;
        while (voice.pending && spins++ < 12) {
          var strip = voice.strip();
          check(!!strip && strip.slots.length > 0,
            'the square waited on the human seat and the strip offered nothing at all');
          if (!strip || !strip.slots.length) { voice.runOut({ now: now }); break; }
          check(strip.slots[strip.slots.length - 1].id === 'silence',
            'the last slot on the strip was not silence');
          var slot = strip.slots[(pick++) % strip.slots.length];
          strip.slots.forEach(function (s2) {
            check(typeof s2.sentence === 'string' && s2.sentence.length > 0,
              'a strip slot (' + s2.id + ') had no sentence to print before speaking it');
          });
          var out = (pick % 7 === 0)
            ? voice.runOut({ now: now })
            : voice.say(slot.fields || (slot.options && slot.options[0].fields), { now: now });
          if (out && out.lines.length) {
            for (var oi = 0; oi < out.lines.length; oi++) lines.push(out.lines[oi]);
          }
        }
      }

      function beat() {
        var next = View.viewFor(G, fHuman, { waitingFor: null });
        mm.observe(prev, next, { now: now, notBefore: now, speed: 1 });
        var said = voice.observe(G, session.events, {
          now: now, notBefore: now, speed: 1, waiting: session.waitingFor()
        });
        answerStrip(said.lines);
        if (said.lines.length) {
          floorLines += said.lines.length;
          for (var li = 0; li < said.lines.length; li++) {
            var line = said.lines[li];
            if (M.ROLE_TOKENS.test(line.text)) roleWords++;
            /* A first-person bubble may name the citizen it is aimed at, and
             * nobody else — the same whitelist objective.js and the murmur
             * sweep already use, pointed at authored prose. */
            var u = Floor.utterance(voice.record, line.utterance);
            var named = M.namesIn(line.text, next.players);
            for (var ni = 0; ni < named.length; ni++) {
              if (named[ni] !== (u ? u.target : null)) wrongName++;
            }
          }
          mm.say(said.lines);
        }
        prev = next;
        /*
         * Pump across the WHOLE window the lines were scheduled into.
         *
         * The first version of this advanced a fixed 6.5 s and reported 81% of
         * floor lines dropped — which was the harness, not the square: an
         * argument runs up to six beats at ~2 s each, so more than half of it
         * was scheduled past the end of the window and counted as never shown.
         * In the running page the bot loop is held for exactly this window
         * (`floorUntil` in main.js), so pumping to the horizon is what the game
         * actually does, and a fixed window is what nothing does.
         */
        var horizon = now + 6500;
        for (var hi = 0; hi < said.lines.length; hi++) {
          if (said.lines[hi].until + 600 > horizon) horizon = said.lines[hi].until + 600;
        }
        for (var at = now; at <= horizon; at += 400) {
          mm.pump(at, next);
          var up = mm.visible;
          samples++;
          if (up.length > maxUp) maxUp = up.length;
          var perSeat = {};
          for (var k = 0; k < up.length; k++) {
            check(!perSeat[up[k].playerId],
              'seat ' + up[k].playerId + ' had two bubbles at once with the floor running');
            perSeat[up[k].playerId] = 1;
            /* The human seat may hold a FLOOR bubble now — it is their own
             * answer, spoken by their own figure — and may never hold an idle
             * murmur, which is the square talking about itself. */
            check(up[k].playerId !== fHuman || up[k].floor,
              'an idle murmur stood over the human seat');
            var who = next.players[up[k].playerId];
            check(!!who && who.alive, 'a bubble stood over a dead citizen');
            /* Keyed by MATCH and id: every match builds a fresh controller and
             * its ids restart at 1, so a bare id counted eight matches of
             * bubbles as one match's worth and reported 81% of the floor
             * dropped. The drop rate was the key, not the square. */
            if (up[k].floor) { floorBubbles++; shown[fgi + ':' + up[k].id] = 1; }
            else idleBubbles++;
            seatsSeen[up[k].playerId] = 1;
          }
        }
        now = horizon + 200;
      }

      beat();
      while (!session.over && guard++ < 900) {
        var w = session.waitingFor();
        if (w) session.submit(decide(w, session));
        else if (!session.advanceBots()) break;
        beat();
      }

      var rep = voice.report();
      playerBeats += rep.spokenByPlayer;
      playerSilences += rep.silences.explicit + rep.silences.timeout;
      utterances += rep.utterances;
      rejects += rep.rejected.length;
      barred += mm.barred;
      rep.missingSentences.forEach(function (id) { missing[id] = 1; });
      voice.record.utterances.forEach(function (u) {
        kindsSeen[u.kind] = (kindsSeen[u.kind] || 0) + 1;
        /* D3: the human seat both speaks and is spoken to. What has to stay
         * true is that everything it says came through the strip — nothing was
         * ever chosen for it — which is what `spokenByPlayer` counts against
         * the record below. */
        if (u.speaker === fHuman) humanSaid++;
        if (u.target === fHuman) humanNamed++;
      });
      check(voice.audit().length === 0,
        'seed ' + fSeed + ': the live record fails the allowlist in the browser path');
    }

    check(utterances > 100, 'only ' + utterances + ' utterances over ' + matches +
      ' browser-path matches — too few to sweep');
    check(rejects === 0, rejects + ' utterances were refused by the schema on the browser path');
    check(barred === 0, barred + ' floor lines named a role or a team and were barred');
    check(roleWords === 0, roleWords + ' floor bubbles carried a role or team word');
    check(wrongName === 0, wrongName + ' floor bubbles named a citizen the utterance did not ' +
      'publicly involve');
    check(Object.keys(missing).length === 0,
      'text_ids with no sentence in the table: ' + Object.keys(missing).join(', '));
    check(maxUp <= M.MAX_VISIBLE,
      'the busiest moment had ' + maxUp + ' bubbles up with the floor running, cap is ' +
      M.MAX_VISIBLE);
    check(floorBubbles > 0, 'no floor bubble was ever on screen');
    check(idleBubbles > 0, 'the idle murmurs stopped once the floor was wired in');

    var shownLines = Object.keys(shown).length;
    var dropRate = floorLines ? Math.round((1 - shownLines / floorLines) * 100) : 0;
    /* Reported rather than asserted at zero: the cap is deliberate and a floor
     * that outruns it drops its tail, which is the same "a stale bubble is
     * worse than silence" rule idle murmurs already follow. What must not
     * happen is most of an argument going unheard. */
    check(dropRate <= 25,
      dropRate + '% of floor lines never reached the screen — the beat band and the ' +
      'bubble cap are fighting');

    /* The pause has to have actually fired: every one of the human seat's
     * utterances has to be one the strip produced. `spokenByPlayer` is counted
     * by floor-voice at the moment it records one; `humanSaid` is counted off
     * the record afterwards. Two counters from two places agreeing is the
     * check — one of them alone would agree with a floor that spoke for you. */
    check(humanSaid > 0, 'the human seat never spoke on the browser path');
    check(humanNamed > 0, 'nothing was ever aimed at the human seat on the browser path');
    check(playerBeats === humanSaid, playerBeats + ' beats were taken through the strip but ' +
      humanSaid + ' utterances in the record came from the human seat — something was ' +
      'spoken FOR them');

    say('floor         ' + utterances + ' utterances over ' + matches +
        ' matches on the BROWSER path, 0 refused,');
    say('              kinds ' + JSON.stringify(kindsSeen));
    say('              ' + floorLines + ' bubbles cued, ' + dropRate +
        '% dropped to the 2-bubble cap; never more than ' + maxUp + ' up at once,');
    say('              never over the dead, never two on one citizen, no idle murmur on you');
    say('strip         ' + humanSaid + ' beats taken through the strip (' + playerSilences +
        ' of them silences) and ' + humanNamed + ' utterances aimed at the human seat');
  })();

  /* Every sentence in the table, rendered both ways, swept for the bright line
   * and for a name it has no business printing. The census is the point: a
   * table entry that no match happens to reach is still prose that will ship. */
  (function () {
    var ids = Object.keys(FV.SENTENCES);
    var players = [
      { id: 0, name: 'Alice' }, { id: 1, name: 'Bo' }, { id: 2, name: 'Chen' },
      { id: 3, name: 'Dara' }, { id: 4, name: 'Eze' }
    ];
    var names = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze'];
    var stub = {
      id: 'u-1', day: 2, floor: 'f-0', seq: 0, speaker: 1, target: 3,
      kind: 'CLAIM_HAND', basis: null, refs: {}, amends: null, text_id: 'x',
      drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 },
      received: { reform: 1, seize: 1 }, blocked: null, enacted: 'seize'
    };
    ids.forEach(function (id) {
      ['bubble', 'line'].forEach(function (how) {
        var u = JSON.parse(JSON.stringify(stub));
        u.text_id = id;
        var text = FV.renderUtterance(u, names, how);
        check(typeof text === 'string' && text.length > 0,
          id + '.' + how + ' rendered nothing');
        if (typeof text !== 'string') return;
        check(!M.ROLE_TOKENS.test(text), id + '.' + how + ' names a role or a team: ' + text);
        check(!/undefined|NaN|\[object/.test(text),
          id + '.' + how + ' rendered a hole: ' + text);
        var named = M.namesIn(text, players);
        for (var i = 0; i < named.length; i++) {
          var ok = how === 'bubble' ? named[i] === u.target
            : (named[i] === u.target || named[i] === u.speaker);
          check(ok, id + '.' + how + ' names seat ' + named[i] +
            ', who the utterance does not involve: ' + text);
        }
      });
    });
    check(ids.length >= 20, 'the sentence table has only ' + ids.length + ' entries');
    say('sentences     ' + ids.length + ' text_ids, rendered first-person for the bubble and');
    say('              third-person for the log: no role word, no hole, and no name outside');
    say('              the speaker and the seat the utterance is aimed at');
  })();

  /* ---------------------------------------------------------- 5. the source */

  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'murmur.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(!/Math\.random/.test(code), 'murmur.js uses Math.random');
  check(!/\brequire\s*\(|^\s*import\s/m.test(code), 'murmur.js imports something');
  check(!/\.rng\s*\(/.test(code), "murmur.js draws from the engine's stream");
  check(!/eventLog/.test(code), 'murmur.js reaches for the omniscient event log');
  check(!/engine\.js|\bSD\b|SDDriver|Driver\./.test(code), 'murmur.js names an engine module');
  check(!/\.role\b|\.team\b|\breveal\b|\bknown\b|\bpeeked\b/.test(code),
    'murmur.js reads a hidden field off the view');

  /* And the folder gate this project has relied on since Step 4. */
  var playDir = path.join(__dirname, '..', 'src', 'play');
  fs.readdirSync(playDir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    var text = fs.readFileSync(path.join(playDir, f), 'utf8');
    var body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check(!/Math\.random/.test(body), 'src/play/' + f + ' uses Math.random');
    check(!/\.rng\s*\(/.test(body), 'src/play/' + f + " draws from the engine's stream");
  });
  /*
   * main.js legitimately exposes `session.events` on `window.__play` — that is
   * the scripted review API, and it predates this layer. The rule is that the
   * MURMURS may not see it, so the sweep is scoped to this layer's own file and
   * to the one hook it added.
   */
  var mainSrc = fs.readFileSync(path.join(playDir, 'main.js'), 'utf8');
  var murmurWiring = mainSrc.split('\n').filter(function (l) { return /murmur/i.test(l); });
  check(murmurWiring.length > 0, 'main.js does not mention murmurs at all — is it wired up?');
  murmurWiring.forEach(function (l) {
    check(!/eventLog|session\.events|\.G\b|minds/.test(l),
      'the murmur wiring in main.js reaches past the projection: ' + l.trim());
  });
  say('purity        murmur.js imports nothing, names no engine module, reads no hidden field');
  say('              and cannot see the event log; no file under src/play/ draws from the');
  say('              engine stream; the ' + murmurWiring.length + ' murmur lines in main.js touch');
  say('              neither the event log nor the game object nor the bots\' minds');

  console.log(lines.join('\n'));
  console.log('');
  if (failures.length) {
    console.error('FAILED — ' + failures.length + ' of ' + checks + ' checks:');
    failures.slice(0, 12).forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
  }
  console.log('OK — ' + checks + ' checks passed.');
}

main().catch(function (err) { console.error(err); process.exit(1); });
