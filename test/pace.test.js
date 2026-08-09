/*
 * The deliberation clock, and the promise that it is only a clock.
 *
 *     node test/pace.test.js [games]        (npm run test:pace)
 *
 * Gate 1.5 gave the bots humanlike think-time. The whole risk of that change is
 * one sentence: **timing must never alter an outcome.** The engine's notion of
 * chance is a single seeded stream and the bots draw from it, so one draw taken
 * by the presentation layer would shift every later bot decision — silently,
 * and only for the seeds somebody happens to re-run.
 *
 * This file does not assert that. It tries to break it.
 *
 *  1. THE INTERLEAVE. The same seeded match is played twice with an identical
 *     scripted player: once plainly, and once with the pace clock hammered
 *     between every single engine call — before each waitingFor, between the
 *     decision and the submit, after each bot step, at every speed setting the
 *     page offers. The event logs must be byte-identical. If the clock could
 *     reach the rules at all, this is where it would show.
 *
 *     That is the step-02 pace-invariance idiom: the playground proved a speed
 *     control could not change a match by running one, and this is the same
 *     proof for a control that now varies per phase.
 *
 *  2. THE CONTROL. A determinism check that only ever compares equal things
 *     passes just as happily when both sides are secretly the same object, so
 *     one run is also forked at a real choice and the logs must DIFFER.
 *
 *  3. THE SOURCE. src/play/pace.js may not import anything, may not mention
 *     Math.random, and may not reach for the game object or its stream. Checked
 *     on the file text, because the strongest structural guarantee here is that
 *     the code cannot see the thing it must not touch.
 *
 *  4. THE NUMBERS. Bands, ordering (legislative deliberation is the longest,
 *     bookkeeping the shortest), 1/speed scaling, and reproducibility from the
 *     seed — a replayed match should have the rhythm of the original.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Human = require('../src/engine/human-driver.js');

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
 * Play one match. `clock`, if given, is called at every seam a real page would
 * consult its timer at — which is the point: the page calls delayFor between
 * engine calls, so the test does too.
 */
function playMatch(seed, count, humanIndex, salt, clock, forkAt) {
  var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: humanIndex, seed: seed });
  var session = Human.createSession({ G: G, minds: AI.create(G), humanId: humanIndex });
  var decide = scriptedPlayer(salt);
  var guard = 0;
  var decisions = 0;
  var forked = false;

  while (!session.over && guard++ < 900) {
    if (clock) clock('before-waitingFor', G.phase, G);
    var w = session.waitingFor();
    if (w) {
      var action = decide(w, session);
      if (clock) clock('mid-decision', G.phase, G);
      /*
       * The control: one legal answer swapped for a different legal one.
       *
       * At the FIRST real choice at or after `forkAt`, not at exactly `forkAt`
       * — most decisions in this game are acknowledge beats with a single legal
       * answer, and a fork that lands on one silently forks nothing. The first
       * version did exactly that in 25 of 40 matches and reported them as
       * "diverged", which would have made the control vacuous for most of the
       * suite.
       */
      if (forkAt != null && !forked && decisions >= forkAt && w.options.length > 1) {
        var other = w.options.find(function (o) { return o !== action; });
        if (other !== undefined) { action = other; forked = true; }
      }
      decisions++;
      session.submit(action);
      if (clock) clock('after-submit', G.phase, G);
    } else {
      if (!session.advanceBots()) break;
      if (clock) clock('after-bot-step', G.phase, G);
    }
  }
  return {
    log: JSON.stringify(session.events),
    actions: JSON.stringify(session.actions),
    decisions: decisions,
    forked: forked,
    winner: G.winner,
    steps: session.steps
  };
}

async function main() {
  var pace = await import('../src/play/pace.js');
  var createPace = pace.createPace;

  var GAMES = parseInt(process.argv[2], 10) || 40;

  /* ------------------------------------------------- 1. the interleave --- */

  var interleaved = 0;
  var totalDraws = 0;
  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var seed = 1000 + g * 7919;
    var human = g % count;

    var plain = playMatch(seed, count, human, g, null, null);

    /*
     * Every speed the page offers, on the same match. The clock is drawn at
     * every seam AND for every speed at each seam, so a single run consumes the
     * presentation stream far more aggressively than the page ever would.
     */
    var clockPace = createPace(seed);
    var drawsHere = 0;
    var timed = playMatch(seed, count, human, g, function (where, phase) {
      for (var s = 0; s < SPEEDS.length; s++) {
        var ms = clockPace.delayFor(phase, SPEEDS[s]);
        check(ms > 0 && isFinite(ms), 'seed ' + seed + ': delayFor(' + phase + ') = ' + ms);
        drawsHere++;
      }
      clockPace.beatFor({ kind: 'vote', gate: null }, 1);
    }, null);

    interleaved++;
    totalDraws += drawsHere;
    check(timed.log === plain.log,
      'seed ' + seed + '/' + count + 'p/seat ' + human +
      ': the event log changed when the pace clock was run between engine calls');
    check(timed.actions === plain.actions,
      'seed ' + seed + ': the recorded human actions changed under the pace clock');
    check(timed.winner === plain.winner && timed.steps === plain.steps,
      'seed ' + seed + ': winner or step count changed under the pace clock');
    check(drawsHere > 0, 'seed ' + seed + ': the clock was never drawn — the probe is inert');
  }

  /* ------------------------------------ 1b. can the probe see a stream draw?
   *
   * The result above is worth exactly as much as the probe's ability to detect
   * the failure it is aimed at. So the same interleave is run once more with a
   * clock that does the forbidden thing — one `G.rng()` per seam, which is what
   * a presentation layer reaching for the engine's stream would look like — and
   * the log MUST diverge. A green invariance check from a probe that cannot see
   * a stream draw is the step-04 lesson repeating: a probe that cannot reach
   * the code it is aimed at reports green.
   */
  var caught = 0;
  var attempted = 0;
  for (var d = 0; d < GAMES; d++) {
    var dCount = 5 + (d % 6);
    var dSeed = 1000 + d * 7919;
    var dHuman = d % dCount;
    var clean = playMatch(dSeed, dCount, dHuman, d, null, null);
    var dirty = playMatch(dSeed, dCount, dHuman, d, function (where, phase, G) {
      G.rng();                       // the exact mistake this gate exists to catch
    }, null);
    attempted++;
    if (dirty.log !== clean.log) caught++;
  }
  check(caught === attempted,
    'a clock that drew from the engine stream changed the match in only ' + caught +
    ' of ' + attempted + ' games — the invariance probe cannot reliably see the ' +
    'failure it is aimed at, so its green result means nothing');

  /* ------------------------------------------------------- 2. the control */

  var diverged = 0;
  for (var c = 0; c < GAMES; c++) {
    var cCount = 5 + (c % 6);
    var cSeed = 1000 + c * 7919;
    var cHuman = c % cCount;
    var base = playMatch(cSeed, cCount, cHuman, c, null, null);
    /* Fork a decision in the first third, where there is still a match left. */
    var forkIndex = Math.max(0, Math.floor(base.decisions / 3));
    var fork = playMatch(cSeed, cCount, cHuman, c, null, forkIndex);
    if (fork.forked) {
      diverged++;
      check(fork.log !== base.log,
        'seed ' + cSeed + ': forcing a different legal answer did NOT change the match — ' +
        'the comparison above proves nothing');
    }
  }
  check(diverged > GAMES / 2,
    'only ' + diverged + ' of ' + GAMES + ' matches could be forked at a real choice');

  say('invariance    ' + interleaved + ' complete matches played twice: ' + totalDraws +
      ' pace draws interleaved between every engine call,');
  say('              at ' + SPEEDS.join('x, ') + 'x — event log, action log, winner and step');
  say('              count byte-identical every time');
  say('probe         ' + caught + '/' + attempted + ' matches DIVERGED when the same clock drew ' +
      'one G.rng() per seam,');
  say('              so the check above can see the failure it is aimed at');
  say('control       ' + diverged + ' matches forked at a real choice and diverged, so the');
  say('              comparison is between things that CAN differ');

  /* --------------------------------------------------------- 3. the source */

  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'pace.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(!/Math\.random/.test(code), 'pace.js uses Math.random');
  check(!/\brequire\s*\(|\bimport\s/.test(code), 'pace.js imports something');
  check(!/\bG\b|SDDriver|engine\.js/.test(code), 'pace.js reaches for the game object');
  check(!/\.rng\b/.test(code), "pace.js touches the engine's stream");
  /* And the same rule for the folder it lives in, which is the gate the project
   * has relied on since Step 4 — a presentation layer that draws is a
   * presentation layer that can desynchronise a seed. */
  var playDir = path.join(__dirname, '..', 'src', 'play');
  fs.readdirSync(playDir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
    var text = fs.readFileSync(path.join(playDir, f), 'utf8');
    var body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check(!/Math\.random/.test(body), 'src/play/' + f + ' uses Math.random');
    check(!/\.rng\s*\(/.test(body), 'src/play/' + f + " draws from the engine's stream");
  });
  say('purity        pace.js imports nothing, names no game object and uses no Math.random;');
  say('              no file under src/play/ draws from the engine stream');

  /* -------------------------------------------------------- 4. the numbers */

  var p = createPace(1000);
  var q = createPace(1000);
  var r = createPace(1001);
  var pa = [], qa = [], ra = [];
  for (var i = 0; i < 40; i++) {
    pa.push(p.delayFor('nomination', 1));
    qa.push(q.delayFor('nomination', 1));
    ra.push(r.delayFor('nomination', 1));
  }
  check(JSON.stringify(pa) === JSON.stringify(qa),
    'the same seed produced a different rhythm');
  check(JSON.stringify(pa) !== JSON.stringify(ra),
    'two different seeds produced the same rhythm — the seed is not being used');

  /* Bands, and the ordering that carries the design intent. */
  var mid = {};
  Object.keys(pace.PHASE_DELAY).forEach(function (phase) {
    var band = pace.PHASE_DELAY[phase];
    check(band[0] > 0 && band[1] > band[0], phase + ': band is ' + JSON.stringify(band));
    mid[phase] = (band[0] + band[1]) / 2;
    var seen = createPace(7);
    for (var k = 0; k < 200; k++) {
      var ms = seen.delayFor(phase, 1);
      check(ms >= band[0] && ms <= band[1],
        phase + ': delayFor returned ' + ms + ', outside ' + JSON.stringify(band));
    }
  });
  check(mid.legislative_speaker > mid.nomination && mid.legislative_deputy > mid.nomination,
    'a legislative draft should take longer than a nomination — the hardest, most ' +
    'private decision is the one that should look like deliberation');
  check(mid.nomination > mid.vote_result && mid.nomination > mid.chaos,
    'bookkeeping beats should be shorter than a real decision');
  check(mid.nomination >= 1500 && mid.nomination <= 3000,
    'nomination deliberation is ' + mid.nomination + ' ms, outside the 1.5-3 s the ' +
    'pacing brief asked for');

  /* Speed is a divisor, exactly — 4x must land near the flat 900 ms Gate 1
   * shipped, or "the old behaviour is still available" is not true. */
  Object.keys(pace.PHASE_DELAY).forEach(function (phase) {
    var one = createPace(99).delayFor(phase, 1);
    SPEEDS.forEach(function (s) {
      var scaled = createPace(99).delayFor(phase, s);
      check(Math.abs(scaled - one / s) < 1e-9,
        phase + ' at ' + s + 'x is ' + scaled + ', expected ' + (one / s));
    });
  });
  var fastest = Math.max.apply(null, Object.keys(pace.PHASE_DELAY).map(function (ph) {
    return pace.PHASE_DELAY[ph][1] / 4;
  }));
  check(fastest <= 900,
    'at 4x the slowest phase still waits ' + Math.round(fastest) +
    ' ms, which is longer than the flat 900 ms Gate 1 shipped');

  /* Beats are keyed the way the objective line is keyed, and are not jittered:
   * a pause you are sitting through should be the same length every time. */
  check(pace.beatKey({ kind: 'acknowledge', gate: 'vote_result' }) === 'acknowledge:vote_result',
    'beatKey does not fold the gate in');
  check(pace.beatKey({ kind: 'vote', gate: null }) === 'vote', 'beatKey mangles a gateless kind');
  check(pace.beatKey(null) === null, 'beatKey(null) should be null');
  var b1 = createPace(5).beatFor({ kind: 'vote' }, 1);
  var b2 = createPace(6).beatFor({ kind: 'vote' }, 1);
  check(b1 === b2 && b1 === pace.BEAT.vote, 'the beat is jittered or seed-dependent');
  check(createPace(5).beatFor({ kind: 'vote' }, 4) === pace.BEAT.vote / 4,
    'the beat does not scale with the pace control');
  Object.keys(pace.BEAT).forEach(function (k) {
    check(pace.BEAT[k] >= 700 && pace.BEAT[k] <= 2500,
      'beat ' + k + ' is ' + pace.BEAT[k] + ' ms — long enough to read as lag');
  });

  say('numbers       every band respected over 200 draws each; a legislative draft');
  say('              deliberates longer than a nomination, bookkeeping shorter; speed is');
  say('              an exact divisor and 4x is within the 900 ms Gate 1 shipped');
  say('rhythm        the same seed replays the same rhythm; a different seed does not');

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
