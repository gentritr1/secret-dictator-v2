/*
 * THE JUICE MAP'S SCHEDULE: the five moments, as numbers.
 *
 *     node test/stage.test.js [games]          (npm run test:stage)
 *
 * src/play/stage.js decides WHEN each of the design doc's five moments happens.
 * A screenshot cannot check a schedule — it can show that somebody is lit, not
 * that the bed cut before the light moved, that the ballots were 180 ms apart,
 * or that the silence was 800 ms and not 780. So the schedule is a pure module
 * and this is the gate on it.
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT
 * -----------------------------------------
 * It is NOT the anti-tell sweep. test/tell.test.js owns "no channel correlates
 * with a hidden role" and gained four rows for these moments — framing,
 * stagger, silence, curtain — with five new mutants, and that is where the role
 * question is answered. This file answers the other one: given a public record,
 * is the schedule the one the design doc and the brief actually asked for.
 *
 * Four things, and the first two are the ones a reviewer would check by hand:
 *
 *   1. THE BRIEF'S HARD NUMBERS. Nothing in the accusation appears later than
 *      700 ms; the ballots are 180 ms apart in SEAT order; the purge is 800 ms
 *      of silence and one gavel; the curtain is 250 ms a figure with the
 *      Dictator last and held for 1.2 s.
 *   2. REDUCED MOTION IS NOT "EVERYTHING OFF". The framing snaps and the light
 *      keeps its crossfade, because light is information here and information
 *      should not snap. Asserted as an ordering — reduced can only ever be
 *      EARLIER, never later — rather than as a second table of numbers.
 *   3. THE CURTAIN CALL IS EMPTY BEFORE GAME OVER. Swept over real matches.
 *   4. THE MODULE IS PURE. No engine import, no draw from the seeded stream, no
 *      unseeded randomness, and it never names the omniscient log — the same
 *      four greps test/ambience.test.js runs over lighting.js and audio.js.
 */

'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Human = require('../src/engine/human-driver.js');
var View = require('../src/engine/view.js');

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

var GAMES = parseInt(process.argv[2], 10) || 30;

async function main() {
  var S = await import('../src/play/stage.js');
  var A = await import('../src/play/audio.js');

  /* ------------------------------------------- 1. the accusation aimed at you */

  /*
   * THE 700 MS CAP, which is the brief's one hard number for this moment.
   *
   * Checked as "the maximum of every offset", not as "the offset I believe is
   * last": the whole failure mode is somebody adding a sixth beat at 900 ms and
   * the assertion still passing because it was written against `camera`.
   */
  var offsets = {
    hush: S.ACCUSE.hush, lantern: S.ACCUSE.lantern, rim: S.ACCUSE.rim,
    turn: S.ACCUSE.turn, camera: S.ACCUSE.camera + S.ACCUSE.cameraMs,
    bubble: S.ACCUSE.bubble, objective: S.ACCUSE.objective,
    /* D3: the tray's centre becomes the intent strip, and it lands ON the cap
     * rather than near it — "if it is not here by 700 ms it is not coming". */
    strip: S.ACCUSE.strip
  };
  var latest = 0;
  var latestName = null;
  Object.keys(offsets).forEach(function (k) {
    if (offsets[k] > latest) { latest = offsets[k]; latestName = k; }
  });
  check(latest <= 700, 'the accusation\'s last beat is ' + latestName + ' at ' + latest +
    ' ms, past the brief\'s 700 ms cap');
  check(S.ACCUSE_LAST_MS === latest,
    'ACCUSE_LAST_MS says ' + S.ACCUSE_LAST_MS + ' and the schedule says ' + latest +
    ' — a declared number that disagrees with the thing it declares');

  /* THE ORDER IS THE DESIGN. The bed cuts FIRST — before the light, before the
   * body, before the camera — because the square going quiet is the pressure
   * and a silence that arrived after the light would read as its consequence. */
  check(S.ACCUSE.hush === 0, 'the bed does not cut at zero');
  check(S.ACCUSE.hush < S.ACCUSE.lantern, 'the accuser\'s lantern lifts before the bed cuts');
  check(S.ACCUSE.lantern < S.ACCUSE.rim, 'the rim finds you before the accuser is lit');
  check(S.ACCUSE.rim < S.ACCUSE.turn, 'you turn before you are lit');
  check(S.ACCUSE.turn <= S.ACCUSE.camera, 'the camera moves before the body does');
  check(S.ACCUSE.camera < S.ACCUSE.bubble, 'the bubble arrives before the camera starts moving');
  check(S.ACCUSE.bubble < S.ACCUSE.objective, 'the line swaps before the bubble it is about');
  check(S.ACCUSE.objective < S.ACCUSE.strip,
    'the strip arrives before the line that tells you to answer on the floor');
  check(S.ACCUSE.strip === 700, 'the strip does not land on the brief\'s 700 ms mark');

  /*
   * THE WARM BUDGET, expressed as a property of the constants rather than
   * checked in a browser.
   *
   * The accusation is the most frequent dramatic beat in the game and the square
   * measured 8.08% warm against a 10% ceiling at this gate's branch point. The
   * lift-and-pull has to be a net REDUCTION in lit lantern-warm over a square of
   * five posts, or the most frequent moment in the match is the one that spends
   * the last of the headroom. One post lifted, four pulled back.
   */
  var lanternsAfter = S.ACCUSE.lanternLift + 4 * S.ACCUSE.lanternPull;
  check(lanternsAfter < 5, 'the accusation lights the square MORE than it found it (' +
    lanternsAfter.toFixed(2) + ' lantern-units against 5) — it must be a redistribution');
  /* And the rim is not amber: hue outside 15-70 degrees, the same classifier
   * src/play/lighting.js `measure()` counts the warm budget with. */
  check(hueOf(S.ACCUSE.rimColor) < 15 || hueOf(S.ACCUSE.rimColor) > 70,
    'the accusation\'s rim is in the amber family (hue ' + hueOf(S.ACCUSE.rimColor).toFixed(0) +
    ') and would be charged to the warm budget');

  /* Who is naming you, off the floor's own lines. */
  var lines2 = [
    { playerId: 3, target: null, id: 'a' },
    { playerId: 5, target: 2, id: 'b' },
    { playerId: 1, target: 0, id: 'c' }
  ];
  check(S.accusationFrom(lines2, 0).from === 1, 'the accuser aimed at seat 0 was not found');
  check(S.accusationFrom(lines2, 4) === null, 'a seat nobody named was reported as accused');
  check(S.accusationFrom(lines2, null) === null, 'a null seat was reported as accused');
  check(S.accusationFrom(null, 0) === null, 'no lines at all still produced an accusation');
  check(S.accusationFrom([{ playerId: 2, target: 2 }], 2) === null,
    'a citizen was allowed to accuse themselves');

  /* Reduced motion: the framing snaps, and NOTHING lands later than it would. */
  var full = S.accusationPlan(0, false);
  var reduced = S.accusationPlan(0, true);
  check(reduced.cameraMs === 0, 'reduced motion did not snap the camera');
  check(reduced.turnMs === 0, 'reduced motion did not snap the body turn');
  check(reduced.hushAt === full.hushAt && reduced.rimAt === full.rimAt &&
    reduced.lanternAt === full.lanternAt,
    'reduced motion moved the LIGHT — light is information here and must keep its crossfade');
  check(reduced.lastAt <= full.lastAt,
    'reduced motion made the moment finish LATER (' + reduced.lastAt + ' vs ' + full.lastAt + ')');
  say('accusation    bed cuts at 0, last beat at ' + latest + ' ms (' + latestName +
    ') of a 700 ms cap; reduced motion lands at ' + reduced.lastAt + ' ms; ' +
    'lantern-units ' + lanternsAfter.toFixed(2) + ' of 5, rim hue ' +
    hueOf(S.ACCUSE.rimColor).toFixed(0) + ' degrees');

  /* ------------------------------------------------- 2. the ballot reveal */

  check(S.BALLOT.stagger === 180, 'the ballots are not the design doc\'s 180 ms apart');

  var v = fakeVote([0, 2, 4], [1, 3], 5);
  var plan = S.ballotPlanFor(v);
  check(plan.total === 5, 'a five-seat tally produced ' + plan.total + ' ballots');
  check(JSON.stringify(plan.steps.map(function (s) { return s.seat; })) === '[0,1,2,3,4]',
    'the ballots did not land in seat order: ' + plan.steps.map(function (s) { return s.seat; }));
  var gaps = plan.steps.slice(1).map(function (s, i) { return s.at - plan.steps[i].at; });
  check(gaps.every(function (g) { return g === S.BALLOT.stagger; }),
    'the stagger is not constant: ' + gaps.join(', '));
  check(plan.aye === 3 && plan.nay === 2, 'the plan miscounted the tally');
  /* The count ACCUMULATES — the doc's acceptance criterion is that a viewer with
   * the sound off knows the result before the count finishes, and a count that
   * ever went down or jumped would not deliver that. */
  var last = { aye: -1, nay: -1, landed: -1 };
  for (var ms = 0; ms <= plan.endsAt; ms += 20) {
    var at = S.ballotCountAt(plan, ms);
    check(at.aye >= last.aye && at.nay >= last.nay && at.landed >= last.landed,
      'the running count went backwards at ' + ms + ' ms');
    check(at.aye + at.nay === at.landed, 'the count and the ballots landed disagree at ' + ms);
    last = at;
  }
  check(S.ballotCountAt(plan, plan.endsAt).done, 'the reveal never finished');
  check(S.ballotCountAt(plan, 0).landed === 0,
    'a ballot had already landed before the reveal began — the lead is what stops the ' +
    'stagger sitting on top of the deliberation beat');
  /* A seat that did not vote is not in the plan at all. */
  var dead = fakeVote([0, 2], [1], 5);
  check(S.ballotPlanFor(dead).total === 3, 'a seat that did not vote was given a ballot');
  check(S.ballotPlanFor({ players: [], lastVote: null }).total === 0,
    'a view with no tally still planned a reveal');
  say('ballots       ' + S.BALLOT.stagger + ' ms apart, seat order, count monotone over ' +
    Math.round(plan.endsAt / 20) + ' samples; a seat that did not vote gets no slot');

  /* ------------------------------------------------- 3. the tile enacted */

  var boardView = { reform: 2, seize: 3, limits: { reformToWin: 5, seizeToWin: 6 } };
  check(S.tilePlanFor(boardView, 'reform').index === 1, 'the Reform went into the wrong slot');
  check(S.tilePlanFor(boardView, 'seize').index === 2, 'the Seize went into the wrong slot');
  check(S.tilePlanFor({ reform: 0, seize: 0 }, 'reform') === null,
    'an empty board still placed a tile');
  check(S.tilePlanFor(boardView, 'nonsense') === null, 'a tile nobody enacted was placed');
  /* The travel is an ease-OUT: it leaves fast and arrives slowly, which is what
   * a heavy thing set down by a hand does. Checked as a property — the first
   * half covers more ground than the second — rather than against a table of
   * sampled values, which would only restate the formula. */
  check(S.tileEase(0) === 0 && S.tileEase(1) === 1, 'the travel does not start at 0 and end at 1');
  check(S.tileEase(0.5) > 0.5, 'the tile does not decelerate — it arrives like a UI transition');
  var monotone = true;
  for (var k = 0; k < 1; k += 0.01) if (S.tileEase(k + 0.01) < S.tileEase(k)) monotone = false;
  check(monotone, 'the tile\'s travel is not monotone — it backs up somewhere');
  check(S.tileEase(-1) === 0 && S.tileEase(2) === 1, 'the travel is unclamped');
  say('tile          slot = the board\'s own count, travel ' + S.TILE.travelMs +
    ' ms ease-out + ' + S.TILE.settleMs + ' ms settle, clamped and monotone');

  /* ------------------------------------------------------- 4. the purge */

  check(S.PURGE.silenceMs === 800, 'the purge silence is not the design doc\'s 800 ms');
  check(A.HUSH.purge.hard === true, 'the purge silence FADES — the doc says it cuts');
  check(A.HUSH.purge.to === 0, 'the purge silence is not total');
  check(A.HUSH.purge.ms === S.PURGE.silenceMs,
    'the sound and the schedule declare two different silences (' + A.HUSH.purge.ms +
    ' vs ' + S.PURGE.silenceMs + ')');
  check(S.PURGE.gavelAt >= S.PURGE.silenceMs,
    'the one gavel fires INSIDE the silence, where it would be inaudible');
  check(A.HUSH.accusation.hard === false && A.HUSH.accusation.to > 0,
    'the accusation\'s duck is a hard cut — the square has stopped talking, not stopped existing');
  check(S.PURGE.angle < 0.34, 'the beam does not narrow below the trial\'s own cone');

  var alive = { players: [{ id: 0, alive: true }, { id: 1, alive: true }, { id: 2, alive: true }] };
  var oneDown = { players: [{ id: 0, alive: true }, { id: 1, alive: false }, { id: 2, alive: true }] };
  check(S.purgeFor(alive, oneDown) === 1, 'the purged citizen was not found');
  check(S.purgeFor(oneDown, oneDown) === null, 'a citizen who was already down was purged again');
  check(S.purgeFor(oneDown, alive) === null, 'somebody standing back up read as a purge');
  check(S.purgeFor(null, oneDown) === null, 'a first projection produced a purge');
  var purgePlan = S.purgePlan(0, true);
  check(purgePlan.narrowMs === 0, 'reduced motion did not snap the beam');
  check(purgePlan.silenceMs === S.PURGE.silenceMs,
    'reduced motion shortened the SILENCE — it is not motion and must not move');
  say('purge         ' + S.PURGE.silenceMs + ' ms of hard silence, one gavel at ' +
    S.PURGE.gavelAt + ' ms, cone ' + S.PURGE.angle + ' against the trial\'s 0.34; ' +
    'reduced motion snaps the beam and leaves the silence alone');

  /* -------------------------------------------------- 5. the curtain call */

  check(S.CURTAIN.step === 250, 'the figures do not turn 250 ms apart');
  check(S.CURTAIN.dictatorHold === 1200, 'the Dictator is not held for the doc\'s 1.2 s');

  var reveal = [
    { id: 0, name: 'Alice', role: 'loyalist', team: 'loyalist', alive: true },
    { id: 1, name: 'Bo', role: 'dictator', team: 'rebel', alive: true },
    { id: 2, name: 'Chen', role: 'rebel', team: 'rebel', alive: false },
    { id: 3, name: 'Dara', role: 'loyalist', team: 'loyalist', alive: true }
  ];
  var curtain = S.curtainFor({ reveal: reveal });
  check(curtain.of === 4, 'the curtain call did not name every citizen');
  check(JSON.stringify(curtain.steps.map(function (s) { return s.id; })) === '[0,2,3,1]',
    'seat order with the Dictator last is not what came back: ' +
    curtain.steps.map(function (s) { return s.id; }));
  check(curtain.dictator === 1, 'the Dictator was not identified');
  check(curtain.steps[3].last === true, 'the last figure is not marked as last');
  check(curtain.lastAt === 3 * S.CURTAIN.step, 'the last bow is at the wrong time');
  check(curtain.holdUntil > curtain.lastAt + S.CURTAIN.dictatorHold - 1,
    'the Dictator is not held after turning');
  check(curtain.tableAt > curtain.holdUntil,
    'the reveal table appears before the curtain call has finished — the doc says ' +
    'it comes "beneath it"');
  curtain.steps.forEach(function (s) {
    check(s.sealAt >= s.at, 'a seal pressed onto a plate before its citizen turned');
  });

  /* EMPTY WITHOUT A REVEAL, which is every moment before game over. */
  check(S.curtainFor({ reveal: null }).of === 0, 'a curtain call was staged with no reveal');
  check(S.curtainFor({}).of === 0, 'a curtain call was staged from a view with no reveal field');
  check(S.curtainFor(null).of === 0, 'a curtain call was staged from nothing at all');
  check(S.curtainFor({ reveal: [] }).of === 0, 'a curtain call was staged from an empty reveal');

  /* ---------------------------------------- the sweep, over real matches */

  var steps = 0;
  var curtainsSeen = 0;
  var leaks = 0;
  var revealsSeen = 0;
  var purgesSeen = 0;
  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var human = g % count;
    var seed = 3100 + g * 7;
    var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: human, seed: seed });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: human });
    var prev = null;
    var guard = 0;
    var n = 0;
    while (!session.over && guard++ < 4000) {
      var w = session.waitingFor();
      var view = View.viewFor(G, human, { waitingFor: w });
      steps++;

      var c = S.curtainFor(view);
      if (c.of) {
        curtainsSeen++;
        if (view.phase !== 'game_over') leaks++;
      }
      var b = S.ballotPlanFor(view);
      if (b.total) {
        revealsSeen++;
        /* Every ballot in the plan belongs to a citizen who is alive and who
         * actually voted — nobody is invented and nobody is dropped. */
        check(b.total === view.lastVote.aye.length + view.lastVote.nay.length,
          'the reveal planned ' + b.total + ' ballots for a tally of ' +
          (view.lastVote.aye.length + view.lastVote.nay.length) + ' at seed ' + seed);
        var seatsAsc = b.steps.every(function (s, i) { return i === 0 || s.seat > b.steps[i - 1].seat; });
        check(seatsAsc, 'the ballots left seat order at seed ' + seed);
      }
      if (S.purgeFor(prev, view) != null) purgesSeen++;

      prev = view;
      if (w) session.submit(w.kind === 'acknowledge' || w.kind === 'power_ack'
        ? null : w.options[(n++) % w.options.length]);
      else if (!session.advanceBots()) break;
    }
    var over = View.viewFor(G, human, { waitingFor: null });
    var final = S.curtainFor(over);
    if (final.of) {
      curtainsSeen++;
      check(final.of === over.players.length, 'the curtain call missed a citizen at seed ' + seed);
      check(final.steps[final.of - 1].role === 'dictator' ||
        !final.steps.some(function (s) { return s.role === 'dictator'; }),
        'the Dictator did not turn last at seed ' + seed);
    }
  }

  check(leaks === 0, leaks + ' curtain calls were staged before game over');
  check(curtainsSeen >= GAMES, 'only ' + curtainsSeen + ' curtain calls in ' + GAMES +
    ' matches — the one surface allowed to show a role was barely produced');
  check(revealsSeen > 100, 'only ' + revealsSeen + ' ballot reveals were planned');
  check(purgesSeen > 0, 'the sweep never saw a purge');
  say('sweep         ' + steps + ' moments over ' + GAMES + ' matches: ' + revealsSeen +
    ' ballot reveals, ' + purgesSeen + ' purges, ' + curtainsSeen + ' curtain calls, ' +
    leaks + ' staged before game over');

  /* ------------------------------------------------------------- purity */

  /*
   * The same four greps test/ambience.test.js runs over lighting.js and audio.js,
   * extended to the module this gate added. A staging layer that could reach the
   * omniscient stream would be the exact tell test/tell.test.js exists to stop,
   * and a grep is the only check that keeps working after somebody adds a
   * parameter.
   */
  var fs = require('fs');
  var src = fs.readFileSync(__dirname + '/../src/play/stage.js', 'utf8');
  var banned = ['Math' + '.random', 'event' + 'Log'];
  banned.forEach(function (token) {
    check(src.indexOf(token) === -1, 'src/play/stage.js names ' + token);
  });
  check(!/\.rng\(/.test(src), 'src/play/stage.js draws from the engine stream');
  check(!/from '\.\.\/engine\//.test(src), 'src/play/stage.js imports an engine module');
  check(!/^import /m.test(src), 'src/play/stage.js imports anything at all — the schedule is a ' +
    'pure module and pace.js, murmur.js and floor-voice.js are the precedent');
  /* Its own generator, salted away from every other stream in the project. */
  var a = S.salted(1000);
  var b2 = S.salted(1000);
  check(a() === b2() && a() === b2(), 'the staging stream is not reproducible from its seed');
  say('purity        no engine import, no import at all, no unseeded randomness, ' +
    'no draw from the seeded stream, and its own salt');

  lines.forEach(function (l) { console.log(l); });
  if (failures.length) {
    console.error('\nFAIL — ' + failures.length + ' of ' + checks + ' checks');
    failures.forEach(function (f) { console.error('  · ' + f); });
    process.exit(1);
  }
  console.log('\nOK — ' + checks + ' checks passed');
}

/** A view with just enough in it to plan a ballot reveal. */
function fakeVote(aye, nay, count) {
  var players = [];
  for (var i = 0; i < count; i++) players.push({ id: i, seat: i, alive: true, isYou: i === 0 });
  return { players: players, lastVote: { aye: aye, nay: nay, passed: aye.length > nay.length } };
}

/** HSL hue in degrees, the same arithmetic src/play/lighting.js `measure()` uses. */
function hueOf(hex) {
  var r = ((hex >> 16) & 255) / 255;
  var g = ((hex >> 8) & 255) / 255;
  var b = (hex & 255) / 255;
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  if (max === min) return 0;
  var d = max - min;
  var hue;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return hue * 60;
}

main().catch(function (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
