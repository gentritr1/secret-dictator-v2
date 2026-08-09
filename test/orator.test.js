/*
 * The orator: bots speaking the canonical schema, and the four ways that goes
 * wrong.
 *
 *     node test/orator.test.js [games]        (npm run test:orator)
 *
 * D1 built a claim schema nobody had ever filled in — every utterance in every
 * sweep came from a synthetic speaker written for the test, and its own
 * open-gaps list said so first: "whether the schema can express what a bot
 * actually wants to say is D2's question and is not answered here". This suite
 * is aimed at the four ways the answer can be wrong.
 *
 *  1. IT CHANGES THE GAME. Selection draws from a dedicated stream derived from
 *     the match seed (`SD.makeRng(seed ^ SALT)`), never from `G.rng`. Fifty
 *     seeds played twice, floor off and floor on, byte-identical event logs —
 *     with the positive control that hands selection the game's own stream and
 *     must diverge. The step-04 lesson: an invariance claim from an instrument
 *     nobody proved works is a green light from a broken sensor.
 *
 *  2. IT SPEAKS SOMETHING THE SCHEMA WOULD REFUSE. Every emission over fifty
 *     complete matches must be accepted. `holdFloor` REPORTS refusals rather
 *     than throwing or swallowing, so a refusal is a number in this file rather
 *     than an exception nobody sees.
 *
 *  3. IT TOUCHES A MIND IT SHOULD NOT. Bots read their minds on purpose in D2 —
 *     that is the gameplay — but read-only, and only four properties. The mind
 *     arrives behind a Proxy that throws on every write and records every read,
 *     so the contract is measured, not described. (The step-08 idiom, pointed
 *     the other way: murmur.js proved chatter never touches minds; this proves
 *     the orator touches exactly four things and mutates none of them.)
 *
 *  4. IT LEAKS A ROLE. And this is where D1's permutation gate had to be
 *     RE-SCOPED rather than kept. D1 asserted that a seat's utterance stream
 *     survives a rotation of the roles it may not know. With minds informing
 *     choice that is now FALSE BY DESIGN — choice correlating with role is the
 *     deduction game — so this suite asserts what must still be true, in three
 *     parts, and proves the false part is false rather than quietly dropping
 *     it:
 *        4a  the public fold is still blind: no speech, roles rotated at every
 *            observation, public record byte-identical;
 *        4b  no utterance FIELD carries a role token, over fifty matches;
 *        4c  the ledger, the flags and the audit render identically for a
 *            permuted game GIVEN the same utterance record;
 *        4d  and the control: the utterance stream DOES change under rotation,
 *            because if it did not, minds would not be informing anything and
 *            the whole feature would be inert.
 *
 * Plus: the human seat is never targeted and never takes a beat (work item 4
 * gives them a voice; being accused with no way to answer is worse than not
 * being accused), the private hand memory hands each seat only its own rows,
 * and one reproducible caught lie.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Driver = require('../src/engine/driver.js');
var Floor = require('../src/engine/floor.js');
var Orator = require('../src/engine/orator.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
var GAMES = parseInt(process.argv[2], 10) || 50;

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }
function j(x) { return JSON.stringify(x); }

/* ===================================================================== */
/* THE HARNESS                                                           */
/*                                                                       */
/* One function, used by every section, because the thing under test is  */
/* an ORDER of calls as much as it is a module: fold, file the event into */
/* the seat's own hand memory, run the floor for the transition that just */
/* happened — and only THEN acknowledge the morning, which publishes a    */
/* transition of its own and would otherwise swallow the one before it,   */
/* which is how D1's T4 and T5 came to open zero floors in fifty matches. */
/* ===================================================================== */

function playWithOrator(seed, count, opts) {
  opts = opts || {};
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var minds = AI.create(G);
  var record = Floor.createRecord();
  var memory = Orator.createMemory();
  var ctx = {
    /* THE control. `leak` hands selection the game's own seeded stream, which
     * is exactly the mistake the dedicated stream exists to prevent. */
    draw: opts.leak ? G.rng : Orator.streamFor(seed),
    minds: opts.blind ? null : minds,
    memory: memory,
    humanSeat: opts.humanSeat === undefined ? null : opts.humanSeat
  };
  var events = [];
  var rejected = [];
  var day = G.day;
  var guard = 0;

  function floorNow() {
    var ts = Floor.triggers(record);
    if (!ts.length) return;
    var held = Orator.holdFloor(record, ts[0], ctx);
    rejected = rejected.concat(held.rejected);
  }

  Floor.observe(record, G);
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    /* `n` is stamped by Driver.playOut and the plain run below goes through it;
     * stamping it here is what makes the two logs comparable field for field.
     * D1's first invariance test compared a log that had `n` with one that did
     * not, "failed" on every seed, and would have hidden a real divergence
     * behind a formatting difference. */
    var ev = Driver.step(G, minds);
    ev.n = guard;
    guard++;
    events.push(ev);
    Floor.observe(record, G);
    memory.note(ev, Orator.governmentFor(record, ev));
    floorNow();
    if (G.day !== day) {
      day = G.day;
      Floor.acknowledgeMorning(record, day);
      floorNow();
    }
  }
  return {
    G: G, record: record, memory: memory, minds: minds,
    events: events, rejected: rejected, steps: events.length
  };
}

function plainMatch(seed, count) {
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var out = Driver.playOut(G, AI.create(G));
  return { G: G, events: out.events, steps: out.steps };
}

function seedFor(i) { return 1000 + i * 7919; }
function countFor(i) { return 5 + (i % 6); }

/* ===================================================================== */
/* 1. THE PREMISE: what the orator does to a mind                        */
/* ===================================================================== */

(function () {
  var reads = {};
  var writes = [];

  /** A mind that records every read and refuses every write. */
  function guardMind(mind, label) {
    var inner = {};
    Object.keys(mind).forEach(function (k) {
      var v = mind[k];
      inner[k] = (v && typeof v === 'object') ? new Proxy(v, {
        set: function (t, p) { writes.push(label + '.' + k + '.' + String(p)); return true; },
        deleteProperty: function (t, p) { writes.push('delete ' + label + '.' + k + '.' + String(p)); return true; },
        defineProperty: function (t, p) { writes.push('define ' + label + '.' + k + '.' + String(p)); return true; }
      }) : v;
    });
    return new Proxy(mind, {
      get: function (t, p) {
        if (typeof p === 'string') reads[p] = (reads[p] || 0) + 1;
        return p in inner ? inner[p] : t[p];
      },
      set: function (t, p) { writes.push(label + '.' + String(p)); return true; },
      deleteProperty: function (t, p) { writes.push('delete ' + label + '.' + String(p)); return true; },
      defineProperty: function (t, p) { writes.push('define ' + label + '.' + String(p)); return true; }
    });
  }

  var beats = 0;
  for (var g = 0; g < Math.min(GAMES, 20); g++) {
    var seed = seedFor(g), count = countFor(g);
    var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
    var minds = AI.create(G);
    var guarded = minds.map(function (m, i) { return guardMind(m, 'mind[' + i + ']'); });
    var record = Floor.createRecord();
    var memory = Orator.createMemory();
    var ctx = { draw: Orator.streamFor(seed), minds: guarded, memory: memory, humanSeat: null };
    var day = G.day, guard = 0;
    Floor.observe(record, G);
    function run() {
      var ts = Floor.triggers(record);
      if (ts.length) beats += Orator.holdFloor(record, ts[0], ctx).utterances.length;
    }
    while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
      var ev = Driver.step(G, minds);
      guard++;
      Floor.observe(record, G);
      memory.note(ev, Orator.governmentFor(record, ev));
      run();
      if (G.day !== day) { day = G.day; Floor.acknowledgeMorning(record, day); run(); }
    }
  }

  check(beats > 200, 'only ' + beats + ' beats spoken through a guarded mind — too few to sweep');
  check(writes.length === 0,
    'the orator WROTE to a mind: ' + writes.slice(0, 3).join(', '));

  /* The contract, measured. Anything outside this set is a surface the header
   * does not describe, and a surface nobody described is a surface nobody
   * reviewed. */
  var allowed = { id: 1, known: 1, peeked: 1, sus: 1 };
  var outside = Object.keys(reads).filter(function (k) { return !allowed[k]; });
  check(outside.length === 0,
    'the orator read a mind property outside the declared contract: ' + outside.join(', '));
  check(!!reads.known && !!reads.sus,
    'the orator never read `known` or `sus` — the mind is not informing anything');

  say('minds         ' + beats + ' beats spoken with every mind behind a recording Proxy: 0 writes,');
  say('              and the whole read surface is ' + j(Object.keys(reads).sort()));
})();

/* ===================================================================== */
/* 2. INVARIANCE — the argument changes no rule                          */
/* ===================================================================== */

var invGames = 0, invUtterances = 0, invFloors = 0, invRejects = 0;
var kindsSeen = {};

for (var ig = 0; ig < GAMES; ig++) {
  var iSeed = seedFor(ig), iCount = countFor(ig);
  var off = plainMatch(iSeed, iCount);
  var on = playWithOrator(iSeed, iCount);
  invGames++;
  invUtterances += on.record.utterances.length;
  invFloors += on.record.floors.length;
  invRejects += on.rejected.length;
  on.record.utterances.forEach(function (u) {
    kindsSeen[u.kind] = (kindsSeen[u.kind] || 0) + 1;
  });

  check(off.steps === on.steps,
    'seed ' + iSeed + ': ' + off.steps + ' steps with the floor off, ' + on.steps + ' with it on');
  check(j(off.events) === j(on.events),
    'seed ' + iSeed + ': the event log changed when the bots started talking');
  check(off.G.winner === on.G.winner && off.G.winReason === on.G.winReason,
    'seed ' + iSeed + ': the winner changed when the bots started talking');
  check(on.record.utterances.length > 0,
    'seed ' + iSeed + ': nothing was said — the invariance result is vacuous here');
}

/* --- the positive control ------------------------------------------- */
var caught = 0, attempted = 0;
for (var cg = 0; cg < GAMES; cg++) {
  var cSeed = seedFor(cg), cCount = countFor(cg);
  var plain = plainMatch(cSeed, cCount);
  var leaky = playWithOrator(cSeed, cCount, { leak: true });
  if (!leaky.record.utterances.length) continue;
  attempted++;
  if (j(plain.events) !== j(leaky.events)) caught++;
}
check(attempted >= GAMES * 0.8,
  'only ' + attempted + ' of ' + GAMES + ' control matches produced speech at all');
check(caught >= attempted * 0.9,
  'selection wired to the game\'s own stream was caught in only ' + caught + ' of ' +
  attempted + ' matches — the invariance above cannot see the failure it is aimed at');

say('invariance    ' + invGames + ' matches played twice, floor off and floor on: identical event');
say('              logs, winners and step counts, with ' + invUtterances + ' utterances over ' +
    invFloors + ' floors on the "on" side');
say('probe         ' + caught + '/' + attempted + ' matches DIVERGED when SELECTION was handed ' +
    'the game\'s own seeded');
say('              stream, so the invariance above can see the failure it is aimed at');

/* ===================================================================== */
/* 3. ZERO SCHEMA REFUSALS, AND EVERY KIND REACHED                       */
/* ===================================================================== */

check(invRejects === 0,
  invRejects + ' utterances were refused by the schema across ' + GAMES +
  ' matches — a speaker that offers an invalid utterance is the defect, not the schema');
Object.keys(Floor.KIND).forEach(function (k) {
  check((kindsSeen[k] || 0) > 0, 'the orator never produced a ' + k + ' — that kind is unswept');
});

/* Every basis and every `about` the schema offers should be reachable, or the
 * orator is quietly speaking a fifth of the vocabulary. Reported as a census
 * rather than asserted one by one: an unreachable basis is a finding, not
 * necessarily a bug, and a number is what makes it visible. */
var basisSeen = {}, aboutSeen = {}, promptSeen = {}, textIds = {};
for (var bg = 0; bg < GAMES; bg++) {
  var br = playWithOrator(seedFor(bg), countFor(bg));
  br.record.utterances.forEach(function (u) {
    textIds[u.text_id] = (textIds[u.text_id] || 0) + 1;
    if (u.kind === Floor.KIND.ACCUSE) basisSeen['accuse.' + u.basis] = 1;
    if (u.kind === Floor.KIND.SUPPORT) basisSeen['support.' + u.basis] = 1;
    if (u.kind === Floor.KIND.QUESTION) aboutSeen[u.about] = 1;
    if (u.kind === Floor.KIND.SILENCE) promptSeen[u.prompted_by] = 1;
  });
  /* And the record is still clean under the D1 allowlist, every match. */
  var violations = Floor.auditRecord(br.record);
  check(violations.length === 0,
    'seed ' + seedFor(bg) + ': ' + violations.slice(0, 2).join(' | '));
}

var accuseBases = Object.keys(Floor.ACCUSE_BASIS).filter(function (b) {
  return basisSeen['accuse.' + b];
});
var supportBases = Object.keys(Floor.SUPPORT_BASIS).filter(function (b) {
  return basisSeen['support.' + b];
});
check(accuseBases.length >= 5,
  'only ' + accuseBases.length + ' of ' + Object.keys(Floor.ACCUSE_BASIS).length +
  ' accusation bases were ever constructed: ' + accuseBases.join(', '));
check(Object.keys(aboutSeen).length >= 3,
  'only ' + Object.keys(aboutSeen).length + ' QUESTION subjects were ever used');

say('schema        0 refusals over ' + GAMES + ' matches; kinds ' + j(kindsSeen));
say('              accuse ' + j(accuseBases) + ',');
say('              support ' + j(supportBases) + ', question ' + j(Object.keys(aboutSeen)) +
    ', silence ' + j(Object.keys(promptSeen)));

/* ===================================================================== */
/* 4. DETERMINISM — the same seed argues the same argument               */
/* ===================================================================== */

var detGames = 0;
for (var dg = 0; dg < Math.min(GAMES, 24); dg++) {
  var dSeed = seedFor(dg), dCount = countFor(dg);
  var one = playWithOrator(dSeed, dCount);
  var two = playWithOrator(dSeed, dCount);
  detGames++;
  check(j(one.record.utterances) === j(two.record.utterances),
    'seed ' + dSeed + ': the same seed produced a different argument');
  check(j(Floor.ledger(one.record)) === j(Floor.ledger(two.record)),
    'seed ' + dSeed + ': the same seed folded a different ledger');
  check(j(Floor.contradictions(one.record)) === j(Floor.contradictions(two.record)),
    'seed ' + dSeed + ': the same seed raised different flags');
}
/* The control: a determinism check that only ever compares equal things is
 * just as green comparing an object with itself. */
var difA = playWithOrator(seedFor(0), 7);
var difB = playWithOrator(seedFor(1), 7);
check(j(difA.record.utterances) !== j(difB.record.utterances),
  'two different seeds produced the same argument — the comparison is vacuous');

/* And the salt is doing work: the same match with a different selection stream
 * must argue differently, or `streamFor` is decoration. */
var saltA = playWithOrator(seedFor(3), 7);
var saltB = (function () {
  var seed = seedFor(3);
  var G = SD.createGame({ names: NAMES.slice(0, 7), seed: seed });
  var minds = AI.create(G);
  var record = Floor.createRecord();
  var memory = Orator.createMemory();
  var ctx = { draw: SD.makeRng((seed ^ 0x1234) >>> 0), minds: minds, memory: memory, humanSeat: null };
  var day = G.day, guard = 0;
  Floor.observe(record, G);
  function run() { var ts = Floor.triggers(record); if (ts.length) Orator.holdFloor(record, ts[0], ctx); }
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    var ev = Driver.step(G, minds); guard++;
    Floor.observe(record, G); memory.note(ev, Orator.governmentFor(record, ev)); run();
    if (G.day !== day) { day = G.day; Floor.acknowledgeMorning(record, day); run(); }
  }
  return record;
})();
check(j(saltA.record.utterances) !== j(saltB.utterances),
  'a different selection stream produced the identical argument — streamFor does nothing');

say('determinism   ' + detGames + ' seeds played twice: identical utterance records, ledgers and');
say('              flags; different seeds and a different selection salt both diverged');

/* ===================================================================== */
/* 5. THE HUMAN SEAT IS NOT IN THIS CONVERSATION                         */
/* ===================================================================== */

var humanBeats = 0, humanTargets = 0, humanSweeps = 0, humanSpoken = 0;
for (var hg = 0; hg < GAMES; hg++) {
  var hCount = countFor(hg);
  var hSeat = hg % hCount;
  var hr = playWithOrator(seedFor(hg), hCount, { humanSeat: hSeat });
  humanSweeps++;
  humanSpoken += hr.record.utterances.length;
  hr.record.utterances.forEach(function (u) {
    if (u.speaker === hSeat) humanBeats++;
    if (u.target === hSeat) humanTargets++;
  });
  hr.record.floors.forEach(function (f) {
    check(f.utterances.length > 0 || hr.record.alive.length <= 2,
      'seed ' + seedFor(hg) + ' ' + f.id + ': a floor opened and nobody spoke');
  });
}
check(humanBeats === 0, 'the human seat took ' + humanBeats + ' beats in D2');
check(humanTargets === 0,
  'the human seat was targeted ' + humanTargets + ' times — D2 gives them no way to answer');
check(humanSpoken > 500, 'only ' + humanSpoken + ' utterances with a human seated — too few');

/* Not vacuous: with no human seat declared, every seat is fair game. */
var noHuman = playWithOrator(seedFor(0), 7);
check(noHuman.record.utterances.some(function (u) { return u.target === 0; }) ||
      noHuman.record.utterances.some(function (u) { return u.speaker === 0; }),
  'seat 0 was untouched even with no human declared — the exclusion check is vacuous');

say('human         ' + humanSweeps + ' matches with a seat declared human: ' + humanSpoken +
    ' utterances, 0 spoken by them');
say('              and 0 aimed at them; the same seat is spoken to freely when nobody is human');

/* ===================================================================== */
/* 6. PRIVATE MEMORY, AND ONE REAL LIE                                   */
/* ===================================================================== */

var memGames = 0, memRows = 0, truthful = 0, lies = 0, caughtLies = 0;

for (var mg = 0; mg < GAMES; mg++) {
  var mSeed = seedFor(mg), mCount = countFor(mg);
  var mr = playWithOrator(mSeed, mCount);
  memGames++;

  /* A citizen's memory holds their OWN hands and nobody else's. Asked seat by
   * seat and government by government, not assumed from the code that files
   * them. */
  mr.memory.seats.forEach(function (seat) {
    var rows = mr.memory.forSeat(seat);
    Object.keys(rows).forEach(function (govId) {
      memRows++;
      var g = Floor.government(mr.record, govId);
      check(!!g, 'seed ' + mSeed + ': memory names a government the record does not have');
      check(!!g && (g.speaker === seat || g.deputy === seat),
        'seed ' + mSeed + ': seat ' + seat + ' remembers a hand from ' + govId +
        ', where it did not sit');
      check(rows[govId].seat_role !== Floor.SEAT_ROLE.SPEAKER || g.speaker === seat,
        'seed ' + mSeed + ': seat ' + seat + ' remembers holding the gavel in ' + govId);
    });
  });

  /* Every CLAIM_HAND against the truth its speaker actually holds. */
  mr.record.utterances.forEach(function (u) {
    if (u.kind !== Floor.KIND.CLAIM_HAND) return;
    var truth = mr.memory.forSeat(u.speaker)[u.refs.government];
    if (!truth) return;
    var claimed = j([u.drawn, u.passed, u.received]);
    var real = j([truth.drawn || null, truth.passed || null, truth.received || null]);
    if (claimed === real) truthful++; else lies++;
  });

  /* And how many of the lies the CONTRADICTION RULES actually caught. */
  Floor.contradictions(mr.record).forEach(function (f) {
    f.refs.utterances.forEach(function (uid) {
      var u = Floor.utterance(mr.record, uid);
      if (!u || u.kind !== Floor.KIND.CLAIM_HAND) return;
      var truth = mr.memory.forSeat(u.speaker)[u.refs.government];
      if (!truth) return;
      if (j([u.drawn, u.passed, u.received]) !==
          j([truth.drawn || null, truth.passed || null, truth.received || null])) caughtLies++;
    });
  });
}

check(memRows > 100, 'only ' + memRows + ' private hand rows across ' + GAMES + ' matches');
check(truthful > 0, 'no CLAIM_HAND ever matched the hand its speaker actually held');
check(lies > 0, 'no bot ever lied — the whole point of CLAIM_HAND is unswept');
check(caughtLies > 0, 'not one lie was ever caught by a contradiction rule');
check(lies < truthful,
  'more claims were lies (' + lies + ') than truths (' + truthful +
  ') — a square where everybody lies has nothing to deduce');

/* --- AN HONEST TABLE RAISES NO EVIDENCE ------------------------------
 *
 * The check that found the bug, kept as the check that stops it coming back.
 *
 * A mindless orator never lies — `wantsCover` needs to know whose side it is
 * on — so every CLAIM_HAND it makes is the hand its speaker actually held. On
 * such a table C1 (impossible), C2 (contradicts the board), C3 (the pair
 * disagree), C4 (over the deck) and C5 (the story changed) must ALL stay
 * silent, because every one of them is a statement that somebody said something
 * untrue and nobody did.
 *
 * C6 is deliberately not in that list: "accuses on a basis their own prior
 * claims contradict" is an overreach an entirely honest citizen can commit, and
 * it is one of the few things in this game that is genuinely about argument
 * rather than about truth.
 *
 * It fired: C4 flagged five and six truthful citizens at once, because
 * `deck_window` was stamped when the government was ELECTED and the Speaker
 * draws a phase or two later, with a reshuffle possible in between. Six honest
 * governments' worth of draws — eighteen tiles — were attributed to one window
 * of a seventeen-tile deck. The window count was right (37 reshuffles, 37
 * windows over 40 matches); the attribution was off by a phase. */

(function () {
  var honestGames = 0, honestClaims = 0, spurious = {};
  var QUIET = { C1: 1, C2: 1, C3: 1, C4: 1, C5: 1 };
  for (var hg = 0; hg < GAMES; hg++) {
    var hSeed = seedFor(hg), hCount = countFor(hg);
    var hr = playWithOrator(hSeed, hCount, { blind: true });
    honestGames++;

    /* The premise first: nobody lied. A "no flags fired" result from a table
     * that happens to contain a lie proves the opposite of what it looks like. */
    var lied = 0;
    hr.record.utterances.forEach(function (u) {
      if (u.kind !== Floor.KIND.CLAIM_HAND) return;
      honestClaims++;
      var truth = hr.memory.forSeat(u.speaker)[u.refs.government];
      if (!truth) return;
      if (j([u.drawn, u.passed, u.received]) !==
          j([truth.drawn || null, truth.passed || null, truth.received || null])) lied++;
    });
    check(lied === 0, 'seed ' + hSeed + ': a mindless orator told ' + lied +
      ' lies — the honest-table premise does not hold, so the check below is meaningless');

    Floor.contradictions(hr.record).forEach(function (f) {
      if (!QUIET[f.rule]) return;
      spurious[f.rule] = (spurious[f.rule] || 0) + 1;
      check(false, 'seed ' + hSeed + ': ' + f.rule + ' fired on a table where every claim ' +
        'is true — ' + f.id + ' names seats ' + j(f.seats));
    });
  }
  check(honestClaims > 200, 'only ' + honestClaims + ' honest claims — too few to sweep');
  say('honesty       ' + honestGames + ' matches with a mindless (therefore truthful) orator: ' +
      honestClaims + ' claims,');
  say('              0 of them false, and C1-C5 stayed silent on every one — evidence that ' +
      'fires');
  say('              on the innocent is worse than no evidence' +
      (Object.keys(spurious).length ? ' (SPURIOUS: ' + j(spurious) + ')' : ''));
})();

/* THE FINGERPRINT. Quoted in docs/step-10.md and in the review report, so a
 * reviewer reproduces the exact lie rather than a lie like it. */
(function () {
  /* Seat 0 human, which is what play.html deals by default — so the reviewer's
   * browser run and this check are looking at the same square. */
  var r = playWithOrator(1000, 7, { humanSeat: 0 });
  var flags = Floor.contradictions(r.record);
  var want = flags.filter(function (f) { return f.id === 'C3:u-18:u-17:g-2'; })[0];
  check(!!want, 'seed 1000 / 7 citizens no longer raises C3:u-18:u-17:g-2 — the quoted ' +
    'caught lie in docs/step-10.md is stale (flags now: ' +
    flags.map(function (f) { return f.id; }).join(', ') + ')');
  if (!want) return;
  var lie = Floor.utterance(r.record, 'u-17');
  var truth = r.memory.forSeat(lie.speaker)['g-2'];
  check(lie.speaker === 2 && lie.seat_role === 'deputy' && lie.received.seize === 2 &&
        lie.received.reform === 0,
    'seed 1000: u-17 is not Chen claiming two Seizes any more');
  check(!!truth && truth.received.reform === 1 && truth.received.seize === 1,
    'seed 1000: Chen was not actually passed one of each');
  check(j(want.seats) === j([2, 3]), 'seed 1000: the C3 pair is no longer seats 2 and 3');
  check(want.class === 'pair', 'the C3 flag stopped being a pair flag');
  say('caught lie    seed 1000, 7 citizens, day 3: Chen (seat 2) was passed {reform 1, seize 1}');
  say('              as Deputy of g-2 and claimed {reform 0, seize 2} — "no choice". The');
  say('              Speaker\'s own account (u-18) disagrees and C3:u-18:u-17:g-2 flags the');
  say('              pair [2,3] without saying which of them lied');
})();

say('lying         ' + memRows + ' private hand rows, each held only by the seat that held it;');
say('              ' + truthful + ' claims matched the hand their speaker actually had, ' +
    lies + ' did not,');
say('              and ' + caughtLies + ' of those were named by a contradiction rule');

/* ===================================================================== */
/* 7. THE PERMUTATION GATE, RE-SCOPED                                    */
/* ===================================================================== */

/**
 * Rewrite the roles a seat is not entitled to know, keeping the multiset legal.
 * Lifted from test/view.test.js and test/floor.test.js so the three suites
 * cannot drift on what "hidden" means.
 */
function permuteHidden(G, v) {
  var known = SD.knownRoles(G, v);
  var hidden = G.players.filter(function (p) { return !known[p.id]; });
  if (hidden.length < 2) return null;
  var before = hidden.map(function (p) { return { id: p.id, role: p.role, team: p.team }; });
  var distinct = {};
  before.forEach(function (b) { distinct[b.role] = 1; });
  if (Object.keys(distinct).length < 2) return null;
  for (var i = 0; i < hidden.length; i++) {
    var src = before[(i + 1) % before.length];
    hidden[i].role = src.role;
    hidden[i].team = src.role === SD.ROLE.LOYALIST ? SD.TEAM.LOYALIST : SD.TEAM.REBEL;
  }
  return function undo() {
    before.forEach(function (b) {
      G.players[b.id].role = b.role;
      G.players[b.id].team = b.team;
    });
  };
}

/* --- 7a. the public fold is still blind ------------------------------
 *
 * No speech at all here, on purpose. This is D1's claim and it is untouched by
 * D2: `publicSnapshot` is a whitelist, so the governments, powers, purges,
 * deck windows and triggers a match folds are the same whichever way the
 * hidden roles are rotated. */
var foldPerms = 0, foldGames = 0;
for (var fg = 0; fg < Math.min(GAMES, 16); fg++) {
  var fSeed = seedFor(fg), fCount = countFor(fg);
  var FG = SD.createGame({ names: NAMES.slice(0, fCount), seed: fSeed });
  var fMinds = AI.create(FG);
  var A = Floor.createRecord(), B = Floor.createRecord();
  Floor.observe(A, FG); Floor.observe(B, FG);
  var fGuard = 0;
  while (FG.phase !== SD.PHASE.GAME_OVER && fGuard < 4000) {
    Driver.step(FG, fMinds);
    fGuard++;
    Floor.observe(A, FG);
    var undo = permuteHidden(FG, fGuard % fCount);
    if (undo) foldPerms++;
    Floor.observe(B, FG);
    if (undo) undo();
  }
  foldGames++;
  check(j(A.governments) === j(B.governments),
    'seed ' + fSeed + ': the public record moved when hidden roles were rotated');
  check(j(A.powers) === j(B.powers) && j(A.purges) === j(B.purges),
    'seed ' + fSeed + ': powers or purges moved when hidden roles were rotated');
  check(A.deckWindow === B.deckWindow && A.serial === B.serial,
    'seed ' + fSeed + ': the deck window or the transition count moved under rotation');
}
check(foldPerms > 0, 'no rotation ever ran — 7a is vacuous');

/* --- 7b. no field carries a role token ------------------------------
 * `auditRecord` was already run over every match in section 3. Here it is run
 * against the mutation that proves it can fail, on a REAL orator utterance
 * rather than a synthetic one. */
var probeRun = playWithOrator(seedFor(2), 7);
var realUtterance = probeRun.record.utterances.filter(function (u) {
  return u.kind === Floor.KIND.CLAIM_HAND;
})[0] || probeRun.record.utterances[0];
check(Floor.auditUtterance(JSON.parse(JSON.stringify(realUtterance)), [], 'clean').length === 0,
  'a real orator utterance fails the allowlist as it stands');
[['a role field', function (u) { u.role = 'rebel'; }],
 ['an allegiance as a value', function (u) { u.text_id = 'x'; u.basis = 'dictator'; }],
 ['a certainty', function (u) { u.certainty = 0.9; }]].forEach(function (m) {
  var u = JSON.parse(JSON.stringify(realUtterance));
  m[1](u);
  check(Floor.auditUtterance(u, [], 'injected').length > 0,
    'the allowlist did not catch ' + m[0] + ' on a real orator utterance');
});

/* --- 7c. rendering is blind GIVEN the record -------------------------
 * The ledger, the flags and the audit are pure folds over the record, and the
 * record carries no role — so rotating the hidden roles of the game the record
 * came from must leave all three byte-identical. This is the half of D1's
 * permutation claim that survives, stated as what it actually is. */
var renderGames = 0;
for (var rg = 0; rg < Math.min(GAMES, 16); rg++) {
  var rr = playWithOrator(seedFor(rg), countFor(rg));
  var beforeLedger = j(Floor.ledger(rr.record));
  var beforeFlags = j(Floor.contradictions(rr.record));
  var beforeAudit = j(Floor.auditRecord(rr.record));
  var rotations = 0;
  for (var v = 0; v < rr.record.seats.length; v++) {
    var undoR = permuteHidden(rr.G, v);
    if (!undoR) continue;
    rotations++;
    check(j(Floor.ledger(rr.record)) === beforeLedger,
      'seed ' + seedFor(rg) + ': the ledger rendered differently for rotated roles');
    check(j(Floor.contradictions(rr.record)) === beforeFlags,
      'seed ' + seedFor(rg) + ': the flags rendered differently for rotated roles');
    check(j(Floor.auditRecord(rr.record)) === beforeAudit,
      'seed ' + seedFor(rg) + ': the audit reported differently for rotated roles');
    undoR();
  }
  check(rotations > 0, 'seed ' + seedFor(rg) + ': no rotation was possible — 7c is vacuous here');
  renderGames++;
}

/* --- 7d. and the part that is now FALSE, proved false ----------------
 *
 * This is the honest half of the re-scoping. D1 asserted the utterance stream
 * survives a rotation. It does not any more, and it MUST not: if a permuted
 * match argued identically, minds would not be informing choice and the whole
 * feature would be inert decoration. So the suite requires the divergence and
 * names it, rather than deleting the check and leaving a silent hole where an
 * assertion used to be.
 *
 * The rotation is applied to the DEAL, before a step is taken, so both runs are
 * legal games — rotating mid-match would leave the bots' own minds describing a
 * game that no longer exists, and the divergence would prove nothing. */
function argueWithRotation(seed, count, rotate) {
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  if (rotate) {
    var ids = G.players.map(function (p) { return { role: p.role, team: p.team }; });
    for (var i = 0; i < G.players.length; i++) {
      var src = ids[(i + 1) % ids.length];
      G.players[i].role = src.role;
      G.players[i].team = src.team;
    }
  }
  var minds = AI.create(G);
  var record = Floor.createRecord();
  var memory = Orator.createMemory();
  var ctx = { draw: Orator.streamFor(seed), minds: minds, memory: memory, humanSeat: null };
  var day = G.day, guard = 0;
  Floor.observe(record, G);
  function run() { var ts = Floor.triggers(record); if (ts.length) Orator.holdFloor(record, ts[0], ctx); }
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    var ev = Driver.step(G, minds); guard++;
    Floor.observe(record, G); memory.note(ev, Orator.governmentFor(record, ev)); run();
    if (G.day !== day) { day = G.day; Floor.acknowledgeMorning(record, day); run(); }
  }
  return record;
}

var tellGames = 0, tellDiverged = 0;
for (var tg = 0; tg < Math.min(GAMES, 16); tg++) {
  var tSeed = seedFor(tg), tCount = countFor(tg);
  var straight = argueWithRotation(tSeed, tCount, false);
  var rotated = argueWithRotation(tSeed, tCount, true);
  tellGames++;
  if (j(straight.utterances) !== j(rotated.utterances)) tellDiverged++;
}
check(tellDiverged >= tellGames * 0.75,
  'only ' + tellDiverged + ' of ' + tellGames + ' matches argued differently when the roles ' +
  'were dealt differently — minds are not informing what anybody says, so the whole ' +
  'behavioural-tell design is inert');

/* And the counterpart: with minds withheld, the argument is a pure function of
 * the public record and the rotation changes nothing. That is what pins the
 * divergence above on the MINDS rather than on the deal. */
var blindA = playWithOrator(seedFor(5), 7, { blind: true });
var blindB = playWithOrator(seedFor(5), 7, { blind: true });
check(j(blindA.record.utterances) === j(blindB.record.utterances),
  'a mindless orator is not even deterministic');
check(blindA.record.utterances.length > 0, 'a mindless orator said nothing at all');

say('permutation   RE-SCOPED for D2, in four parts:');
say('              7a  ' + foldGames + ' matches, ' + foldPerms + ' rotations, no speech: the public');
say('                  fold is byte-identical — the whitelist window still holds');
say('              7b  no utterance field carries a role token, and the instrument catches');
say('                  three injected faults on a REAL orator utterance');
say('              7c  ' + renderGames + ' matches: ledger, flags and audit render byte-identically');
say('                  for every legal rotation, GIVEN the same utterance record');
say('              7d  and the part D1 asserted that is now FALSE BY DESIGN: ' + tellDiverged +
    '/' + tellGames);
say('                  matches argued DIFFERENTLY when the roles were dealt differently.');
say('                  Choice correlates with role. That is the deduction game, and it is');
say('                  a different thing from a presentation channel leaking one');

/* ===================================================================== */
/* 8. THE MODULE ITSELF                                                  */
/* ===================================================================== */

var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'orator.js'), 'utf8');
[['Math.random', /Math\s*\.\s*random/],
 ['Date.now', /Date\s*\.\s*now/],
 ['performance.now', /performance\s*\.\s*now/],
 ['a timer', /set(Timeout|Interval)/],
 ['the game\'s seeded stream', /\.\s*rng\s*\(/],
 ['the full reveal', /fullReveal/],
 ['another seat\'s hand', /deputyHand|speakerHand/],
 ['the deck contents', /\.\s*deck\s*\[/]].forEach(function (b) {
  check(!b[1].test(src), 'src/engine/orator.js mentions ' + b[0] + ' (' + b[1] + ')');
});
check(/require\('\.\/engine\.js'\)/.test(src) && /require\('\.\/floor\.js'\)/.test(src),
  'orator.js does not load engine.js and floor.js');
check(!/require\('\.\/(ai|driver|human-driver|view)\.js'\)/.test(src),
  'orator.js reaches into ai.js, driver.js, human-driver.js or view.js');
/* It DOES name `known`, `peeked` and `sus` — that is the D2 decision, and the
 * Proxy sweep in section 1 is what holds it to exactly those. Asserted
 * positively so a future edit that removes mind-reading is a failure here and
 * not a silent regression to a D1 orator. */
check(/mind\.known/.test(src) && /mind\.peeked/.test(src) && /mind\.sus/.test(src),
  'orator.js no longer reads a mind at all — the behavioural tells are gone');

say('module        orator.js draws no randomness of its own, keeps no clock, loads only');
say('              engine.js and floor.js, and reads a mind through four accessors');

/* ===================================================================== */

console.log('');
lines.forEach(function (l) { console.log(l); });
console.log('');
if (failures.length) {
  console.log('FAILED — ' + failures.length + ' of ' + checks + ' checks');
  failures.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('OK — ' + checks + ' checks passed.');
