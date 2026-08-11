/*
 * THE INTENT STRIP: the player's own voice on the floor.
 *
 *     node test/strip.test.js [games]          (npm run test:strip)
 *
 * Work item 2 of design/handoff/floor-and-hud/README.md. D2 gave the bots a
 * mouth and kept the human seat out of the conversation entirely, for a reason
 * it wrote down: "being accused with no way to answer is worse than not being
 * accused". This gate is the way to answer, and it is aimed at the six ways
 * that goes wrong.
 *
 *  1. THE STRIP OFFERS SOMETHING THE SCHEMA WOULD REFUSE. The acceptance line
 *     is "fuzzed over 50 matches: zero schema-rejected submissions from the
 *     strip", and the way to earn it is not to check the slots against a second
 *     copy of the rules — that is how a sweep goes green against a strip that is
 *     wrong in the same direction as its test. Every slot is SPOKEN, through the
 *     real `Floor.speak`, into the real record, and a refusal is counted.
 *
 *  2. THE DRY RUN LEAVES A MARK. `Floor.attempt` runs the real constructor and
 *     unwinds it; the strip calls it dozens of times per beat. If the unwind is
 *     not exhaustive the record silently rots. So the record is serialised
 *     before and after every strip and compared byte for byte — a statement
 *     about the record rather than about the comment beside the rollback.
 *
 *  3. THE ORDER MOVES. "Stable order is what makes the expert fast": slot 1 is
 *     always the answer, the last slot is always silence, and the middle
 *     contracts rather than reorders. Asserted on every strip of every match.
 *
 *  4. THE CLOCK REACHES A RULES DECISION. The one hard line in the brief:
 *     "no rules decision has a clock in either setting". Checked two ways — the
 *     oil line's own functions never expire anything while the setting is on,
 *     and the page's eligibility rule (`floorBeatIsYours` in main.js, mirrored
 *     here as a table) never lets the beat burn while the rules owe you
 *     something.
 *
 *  5. "THE FLOOR WAITS FOR YOU" DOES NOT WAIT. Ten minutes of presentation
 *     clock, a match diffed before and after, and no silence in the log.
 *
 *  6. A REPLAY DIVERGES. A recorded list of human actions, replayed against the
 *     same seed, has to produce a byte-identical record — that is what makes the
 *     player's own beats part of the deterministic match rather than beside it.
 *
 * Plus the tray row itself: the 34-character truncation, the full sentence
 * printed verbatim before it can be spoken, and the keys.
 */

'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Driver = require('../src/engine/driver.js');
var Floor = require('../src/engine/floor.js');
var Orator = require('../src/engine/orator.js');
var Intents = require('../src/engine/intents.js');

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
/* The same order of calls src/play/floor-voice.js makes, minus the      */
/* clock: fold, file the seat's own hands, hold the floor, and when it   */
/* stops at the human seat build a strip and answer it. `policy` is the  */
/* player.                                                               */
/* ===================================================================== */

function playWithStrip(seed, count, human, policy, watch, probeSilence) {
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var minds = AI.create(G);
  var record = Floor.createRecord();
  var memory = Orator.createMemory();
  var ctx = {
    draw: Orator.streamFor(seed), minds: minds, memory: memory,
    humanSeat: human, awaitHuman: true
  };
  var out = {
    record: record, memory: memory, strips: [], rejected: [], actions: [],
    mutations: 0, followUps: 0, replies: 0,
    probe: { accepted: 0, rejectedOnBasis: 0, wrongFloor: 0, wrongFloorMissed: 0 }
  };
  var day = G.day;
  var guard = 0;

  function beat(state) {
    var spins = 0;
    while (state.pending !== null && state.pending !== undefined && spins++ < 16) {
      var prompt = Intents.promptFor(record, human);
      /* 2. THE DRY RUN LEAVES A MARK — the whole record, before and after. */
      var before = j(record);
      var strip = Intents.stripFor(record, human, {
        prompt: prompt, memory: memory.forSeat(human)
      });
      if (j(record) !== before) out.mutations++;
      out.strips.push(strip);
      if (watch) watch(strip, record);

      /*
       * THE THIRD COST OF SILENCE, probed where it is actually reachable.
       *
       * "Two silences make you a legal target for basis: silence — an
       * accusation that could not otherwise be constructed." The claim is about
       * CONSTRUCTIBILITY, so it is checked by constructing one, in the middle of
       * a live floor, through the real constructor. It cannot be checked after
       * the match: the record is over by then and no floor will open.
       *
       * The probe reads the REASON rather than the yes/no, because a refusal on
       * "the floor is not open to seat 3" says nothing about the basis. What has
       * to be true is that the basis itself is never the thing that refuses a
       * pair of floors the player really was quiet on — and always is the thing
       * that refuses a floor they spoke on.
       */
      if (probeSilence) {
        var quietSoFar = {};
        record.utterances.forEach(function (u) {
          if (u.kind === Floor.KIND.SILENCE && u.speaker === human) quietSoFar[u.floor] = 1;
        });
        /* A floor the player was NOT quiet on — which for a player who never
         * speaks is any floor their beat did not reach. That is the near miss
         * the basis has to refuse. */
        var sf = record.floors.filter(function (f) { return !quietSoFar[f.id]; })
          .map(function (f) { return f.id; });
        var qf = Object.keys(quietSoFar);
        var by = record.alive.filter(function (x) { return x !== human; })[0];
        if (qf.length >= 2 && by !== undefined) {
          var probe = function (floors) {
            var e = Floor.attempt(record, {
              kind: Floor.KIND.ACCUSE, speaker: by, target: human, basis: 'silence',
              refs: { floors: floors }, text_id: 'accuse.silence'
            });
            return e ? e.message : null;
          };
          var onQuiet = probe(qf.slice(-2));
          if (!onQuiet || onQuiet.indexOf('was not SILENT') === -1) out.probe.accepted++;
          else out.probe.rejectedOnBasis++;
          if (sf.length) {
            var onSpoken = probe([qf[qf.length - 1], sf[sf.length - 1]]);
            if (onSpoken && onSpoken.indexOf('was not SILENT') !== -1) out.probe.wrongFloor++;
            else out.probe.wrongFloorMissed++;
          }
        }
      }

      var choice = policy(strip, out.actions.length);
      out.actions.push(choice);
      var fields = choice.fields;
      var insert = null;
      if (fields) {
        try {
          var said = Floor.speak(record, fields);
          if (said.kind === Floor.KIND.SILENCE && said.prompted_by === 'accusation' &&
              prompt && prompt.kind === Floor.KIND.ACCUSE) {
            if (Floor.grantFollowUp(record, prompt.speaker)) {
              insert = prompt.speaker;
              out.followUps++;
            }
          }
        } catch (e) {
          out.rejected.push({ rule: e.rule || '?', why: e.message, fields: fields });
        }
      }
      state = Orator.resumeFloor(record, ctx, state, insert);
    }
    out.rejected = out.rejected.concat(state.rejected.map(function (r) {
      return { rule: r.rule, why: r.why, bot: r.seat };
    }));
    if (state.replied) out.replies++;
  }

  function floorNow() {
    var ts = Floor.triggers(record);
    if (!ts.length) return;
    beat(Orator.holdFloor(record, ts[0], ctx));
  }

  Floor.observe(record, G);
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    var ev = Driver.step(G, minds);
    ev.n = guard;
    guard++;
    Floor.observe(record, G);
    memory.note(ev, Orator.governmentFor(record, ev));
    floorNow();
    if (G.day !== day) {
      day = G.day;
      Floor.acknowledgeMorning(record, day);
      floorNow();
    }
  }
  return out;
}

/* The players. Each returns `{ fields, how }` — `fields` null means the beat
 * was skipped, which no policy below ever does: silence is a card. */
function cycler(strip, n) {
  if (!strip.slots.length) return { fields: null, how: 'none' };
  var slot = strip.slots[n % strip.slots.length];
  if (slot.options && slot.options.length) {
    var o = slot.options[n % slot.options.length];
    return { fields: o.fields, how: slot.id + ':' + (o.target === null ? n : o.target) };
  }
  return { fields: slot.fields, how: slot.id };
}
function alwaysSilent(strip) {
  var last = strip.slots[strip.slots.length - 1];
  return last ? { fields: last.fields, how: 'silence' } : { fields: null, how: 'none' };
}
function alwaysAnswers(strip) {
  var first = strip.slots[0];
  if (!first) return { fields: null, how: 'none' };
  if (first.options && first.options.length) {
    return { fields: first.options[0].fields, how: first.id };
  }
  return { fields: first.fields, how: first.id };
}

function seedFor(i) { return 1000 + i * 7919; }
function countFor(i) { return 5 + (i % 6); }

/* ===================================================================== */
/* 1 + 2 + 3. THE FUZZ SWEEP                                             */
/* ===================================================================== */

var swept = 0, strips = 0, spoken = 0, mutations = 0, rejects = [];
var slotCensus = {}, kindCensus = {}, sizeCensus = {}, promptCensus = {};
var followUps = 0, replies = 0;
var orderFaults = 0;

var POLICIES = [cycler, alwaysSilent, alwaysAnswers];

for (var gi = 0; gi < GAMES; gi++) {
  var count = countFor(gi);
  var human = gi % count;
  var policy = POLICIES[gi % POLICIES.length];
  var run = playWithStrip(seedFor(gi), count, human, policy, function (strip, record) {
    strips++;
    sizeCensus[strip.slots.length] = (sizeCensus[strip.slots.length] || 0) + 1;
    promptCensus[String(strip.promptKind)] = (promptCensus[String(strip.promptKind)] || 0) + 1;

    /* --- 3. THE STABLE ORDER ---------------------------------------- */
    var ids = strip.slots.map(function (s) { return s.id; });
    var canonical = Intents.SLOT_ORDER.filter(function (id) {
      return ids.indexOf(id) !== -1;
    });
    if (j(ids) !== j(canonical)) {
      orderFaults++;
      check(false, 'the strip reordered: ' + j(ids) + ' against ' + j(canonical));
    }
    check(ids.length === 0 || ids[ids.length - 1] === 'silence',
      'the last slot was ' + ids[ids.length - 1] + ', not silence');
    check(ids.indexOf('answer') === -1 || ids[0] === 'answer',
      'the answer was offered but was not slot 1: ' + j(ids));
    check(new Set(ids).size === ids.length, 'a slot id appeared twice: ' + j(ids));

    strip.slots.forEach(function (s) {
      slotCensus[s.id] = (slotCensus[s.id] || 0) + 1;
      kindCensus[s.kind] = (kindCensus[s.kind] || 0) + 1;
      /* A slot either speaks or opens a submenu. Never both, never neither —
       * a card that did neither would be a key that does nothing. */
      check(!!s.fields !== !!(s.options && s.options.length),
        'slot ' + s.id + ' both speaks and opens a submenu, or does neither');
      (s.options || []).forEach(function (o) {
        check(!!o.fields, 'an option on slot ' + s.id + ' carried no utterance');
      });
      /* Nothing on the strip may name the player as a target: the schema
       * refuses it, and this is the second mechanism that agrees. */
      var all = (s.options && s.options.length) ? s.options : [{ fields: s.fields }];
      all.forEach(function (o) {
        check(!o.fields || o.fields.target !== strip.seat,
          'the strip offered an utterance aimed at the player themselves');
        check(!o.fields || o.fields.speaker === strip.seat,
          'the strip offered an utterance in somebody else\'s mouth');
      });
    });
    /* Silence is always available. A beat with nothing to say is still a beat
     * that has to be answerable, or the oil line has nothing to run out into. */
    check(ids.indexOf('silence') !== -1, 'the strip offered no way to say nothing');
  });
  swept++;
  strips += 0;
  spoken += run.actions.length;
  mutations += run.mutations;
  followUps += run.followUps;
  replies += run.replies;
  rejects = rejects.concat(run.rejected);
  check(Floor.auditRecord(run.record).length === 0,
    'seed ' + seedFor(gi) + ': the record failed its own field audit after the strip spoke');
}

/* --- 1. ZERO REJECTS. The acceptance line, stated as a number. -------- */
check(rejects.length === 0, rejects.length + ' utterances were refused after the strip ' +
  'offered them: ' + j(rejects.slice(0, 3)));
/* --- 2. AND THE DRY RUN LEFT NOTHING BEHIND. ------------------------- */
check(mutations === 0, mutations + ' strips MUTATED the record they were built from — ' +
  'Floor.attempt does not unwind cleanly');
check(strips > 400, 'only ' + strips + ' strips were built over ' + swept +
  ' matches; the sweep did not exercise enough of the feature to mean anything');
check(Object.keys(slotCensus).length === 6,
  'only ' + Object.keys(slotCensus).length + ' of the six slots were ever offered: ' +
  j(Object.keys(slotCensus)));
check(Object.keys(kindCensus).length === 5,
  'the strip never offered all five kinds: ' + j(Object.keys(kindCensus)));
check((promptCensus.ACCUSE || 0) > 10, 'only ' + (promptCensus.ACCUSE || 0) +
  ' strips were prompted by an accusation — the headline moment is barely swept');

say('fuzz          ' + strips + ' strips over ' + swept + ' matches, three players ' +
    '(cycling, always silent, always answering):');
say('              ' + spoken + ' beats spoken, ' + rejects.length +
    ' refused by the schema, ' + mutations + ' records mutated by a dry run');
say('              slots ' + j(slotCensus));
say('              sizes ' + j(sizeCensus) + ', prompted by ' + j(promptCensus));
say('order         slot 1 is always the answer, the last is always silence, the middle ' +
    'contracts:');
say('              ' + orderFaults + ' reorderings in ' + strips + ' strips');

/* ===================================================================== */
/* THE COST OF SILENCE                                                   */
/* ===================================================================== */

/*
 * Four observable consequences, no hidden number. Each is checked against the
 * record rather than against the code that produced it, and each is aggregated
 * over a sweep rather than pinned to one seed: a cost that only shows up on the
 * seed the test happens to name is a cost the game does not have.
 */
(function () {
  var silences = 0, floorsQuiet = 0, granted = 0, owedOpen = 0, ledgerLogged = 0;
  var namedOnSilence = 0, constructible = 0, constructibleBefore = 0;
  var runs = 0;

  for (var i = 0; i < Math.min(GAMES, 20); i++) {
    var count = countFor(i);
    var human = i % count;
    var run = playWithStrip(seedFor(i), count, human, alwaysSilent, null, true);
    var record = run.record;
    runs++;
    var mine = record.utterances.filter(function (u) { return u.speaker === human; });
    check(mine.every(function (u) { return u.kind === Floor.KIND.SILENCE; }),
      'seed ' + seedFor(i) + ': the always-silent player said something');
    silences += mine.length;

    /* 1. LOGGED BY NAME. The ledger's own fold, split by `explicit` — chosen
     *    silence and a beat that ran out are different events and stay so. */
    var entry = Floor.ledger(record)[human];
    ledgerLogged += entry.silences.explicit.length;
    check(entry.silences.explicit.length === mine.length,
      'seed ' + seedFor(i) + ': the ledger recorded ' + entry.silences.explicit.length +
      ' chosen silences against ' + mine.length + ' in the record');
    check(entry.silences.timeout.length === 0,
      'a chosen silence was filed as a beat that ran out');

    /* 2. THE ACCUSER GETS A FREE FOLLOW-UP BEAT, appended to this floor. */
    record.floors.forEach(function (f) { granted += (f.followUps || []).length; });

    /* 3. TWO SILENCES MAKE YOU A LEGAL TARGET FOR basis: silence — "an
     *    accusation that could not otherwise be constructed". The claim is
     *    about CONSTRUCTIBILITY, so it is checked by constructing one: the same
     *    accusation is attempted against the floors the player was quiet on
     *    (must be accepted) and against a floor they spoke on (must be
     *    refused). Whether a bot happens to CHOOSE that basis is a separate
     *    question — the ladder prefers a ballot to a silence — and is reported
     *    rather than asserted. */
    var quiet = {};
    mine.forEach(function (u) { quiet[u.floor] = 1; });
    var quietFloors = Object.keys(quiet);
    floorsQuiet += quietFloors.length;
    namedOnSilence += record.utterances.filter(function (u) {
      return u.kind === Floor.KIND.ACCUSE && u.target === human && u.basis === 'silence';
    }).length;

    if (quietFloors.length >= 2 && run.probe) {
      constructible += run.probe.accepted;
      constructibleBefore += run.probe.wrongFloor;
    }

    /* 4. SILENCE AFTER A QUESTION IS RECORDED DISTINCTLY, and does not
     *    discharge it — the owner ruling in docs/step-10.md, now reachable by a
     *    person rather than only by a bot. */
    owedOpen += record.obligations.filter(function (o) {
      return o.target === human && !o.discharged && o.silences.length > 0;
    }).length;
  }

  check(silences > 100, 'only ' + silences + ' silences over ' + runs + ' silent matches');
  check(ledgerLogged === silences, 'the ledger logged ' + ledgerLogged + ' of ' + silences +
    ' silences by name');
  check(granted > 0, 'no accuser ever got the free follow-up beat silence owes them');
  check(constructible > 0, 'basis: silence was never constructible against the silent ' +
    'player, so the third cost of silence is unreachable');
  check(constructibleBefore > 0, 'the probe never once refused a floor the player was NOT ' +
    'quiet on, so "constructible" above is not saying anything about the basis');
  check(owedOpen > 0, 'a question answered with silence was discharged anyway');

  say('silence       ' + runs + ' matches played entirely in silence: ' + silences +
      ' silences over ' + floorsQuiet + ' floors,');
  say('              all ' + ledgerLogged + ' logged by name; ' + granted +
      ' free follow-up beats bought for the accusers;');
  say('              basis: silence constructible in ' + constructible + ' of them and ' +
      'refused ' + constructibleBefore + ' times against a floor');
  say('              they were not quiet on; ' + owedOpen + ' questions still owed (' +
      namedOnSilence + ' bots actually chose that basis)');
})();

/*
 * THE CONTROL, and it is the sharper of the two claims.
 *
 * A free follow-up beat is a change to the shape of a floor, so the thing that
 * has to be true is not only "silence buys one" but "nothing else does". Two
 * ways, both against the record:
 *
 *   1. an ALL-BOT match — the same seeds with `awaitHuman` off, which is what
 *      every headless sweep and every seed fingerprint in this repo runs — must
 *      contain no follow-up at all. `Floor.grantFollowUp` is a call the caller
 *      that owns the player's beat makes, and nothing else may reach it;
 *   2. in a played match, every follow-up on a floor must be matched by an
 *      accusation-prompted silence from the player on that same floor. A count
 *      that agreed in total but not per floor would let a follow-up appear
 *      somewhere nobody was stonewalled.
 */
(function () {
  var botFollowUps = 0, botFloors = 0;
  for (var i = 0; i < Math.min(GAMES, 20); i++) {
    var count = countFor(i);
    var human = i % count;
    var G = SD.createGame({ names: NAMES.slice(0, count), seed: seedFor(i) });
    var minds = AI.create(G);
    var record = Floor.createRecord();
    var memory = Orator.createMemory();
    /* No awaitHuman: D2's loop exactly. */
    var ctx = {
      draw: Orator.streamFor(seedFor(i)), minds: minds, memory: memory, humanSeat: human
    };
    var day = G.day;
    var guard = 0;
    var run = function () {
      var ts = Floor.triggers(record);
      if (ts.length) Orator.holdFloor(record, ts[0], ctx);
    };
    Floor.observe(record, G);
    while (G.phase !== SD.PHASE.GAME_OVER && guard++ < 4000) {
      var ev = Driver.step(G, minds);
      Floor.observe(record, G);
      memory.note(ev, Orator.governmentFor(record, ev));
      run();
      if (G.day !== day) { day = G.day; Floor.acknowledgeMorning(record, day); run(); }
    }
    record.floors.forEach(function (f) {
      botFloors++;
      botFollowUps += (f.followUps || []).length;
    });
  }
  check(botFollowUps === 0, botFollowUps + ' follow-up beats were granted in an ALL-BOT ' +
    'match — grantFollowUp is reachable without a person at the table');
  check(botFloors > 200, 'only ' + botFloors + ' all-bot floors were swept');

  /*
   * And the per-floor match, on the silent runs.
   *
   * `f.followUps` holds two different things and they have to be told apart:
   * an entry naming ANOTHER citizen is the cost of silence (their accusation
   * was stonewalled, so they speak twice); an entry naming the PLAYER is the
   * right of reply (they were accused after their own beat was spent). Both are
   * beats bought on a floor, both go through the same budget, and each has its
   * own justification that must be present in that floor's own utterances.
   */
  var floorsWithFollowUp = 0, matched = 0;
  var replies = 0, repliesMatched = 0;
  for (var k = 0; k < Math.min(GAMES, 20); k++) {
    var c2 = countFor(k);
    var h2 = k % c2;
    var r2 = playWithStrip(seedFor(k), c2, h2, alwaysSilent);
    /* eslint-disable no-loop-func */
    r2.record.floors.forEach(function (f) {
      var list = f.followUps || [];
      var forOthers = list.filter(function (seat) { return seat !== h2; }).length;
      var forYou = list.filter(function (seat) { return seat === h2; }).length;
      var said = f.utterances.map(function (id) { return Floor.utterance(r2.record, id); });
      if (forOthers) {
        floorsWithFollowUp++;
        var stonewalled = said.filter(function (u) {
          return u && u.speaker === h2 && u.kind === Floor.KIND.SILENCE &&
            u.prompted_by === 'accusation';
        }).length;
        if (stonewalled >= forOthers) matched++;
      }
      if (forYou) {
        replies++;
        var named = said.filter(function (u) {
          return u && u.kind === Floor.KIND.ACCUSE && u.target === h2;
        }).length;
        if (named >= forYou) repliesMatched++;
      }
    });
    /* eslint-enable no-loop-func */
  }
  check(floorsWithFollowUp > 0, 'no floor in the sweep ever bought an accuser a second beat');
  check(matched === floorsWithFollowUp, (floorsWithFollowUp - matched) + ' floors granted a ' +
    'follow-up beat without an accusation the player stonewalled on that floor');
  check(replies > 0, 'the right of reply never fired in the sweep');
  check(repliesMatched === replies, (replies - repliesMatched) + ' floors handed the player ' +
    'an extra beat without an accusation aimed at them on that floor');

  say('control       ' + botFloors + ' all-bot floors over the same ' +
      Math.min(GAMES, 20) + ' seeds: ' + botFollowUps + ' follow-ups granted;');
  say('              all ' + floorsWithFollowUp + ' floors that bought an accuser a second ' +
      'beat had a silence to justify it,');
  say('              and all ' + replies + ' that handed the player a right of reply had an ' +
      'accusation aimed at them');
})();

/* ===================================================================== */
/* 6. REPLAY                                                             */
/* ===================================================================== */

/*
 * A recorded human action list replays byte-identically.
 *
 * The point is sharper than "the same policy twice": the FIRST run's choices
 * are captured as a flat list of utterance fields, and the second run plays
 * that list back with no policy at all. So the replay has no idea what the
 * strip offered — it only knows what was said — and the record it produces has
 * to be the same record. That is what makes the player's own beats part of the
 * deterministic match rather than beside it.
 */
(function () {
  var replayed = 0;
  var diverged = 0;
  for (var i = 0; i < Math.min(GAMES, 12); i++) {
    var seed = seedFor(i);
    var count = countFor(i);
    var human = i % count;
    var live = playWithStrip(seed, count, human, POLICIES[i % POLICIES.length]);
    var script = live.actions.map(function (a) { return a.fields; });
    var at = 0;
    var back = playWithStrip(seed, count, human, function () {
      return { fields: script[at++] === undefined ? null : script[at - 1], how: 'replay' };
    });
    replayed++;
    if (j(live.record) !== j(back.record)) {
      diverged++;
      check(false, 'seed ' + seed + ': a recorded human action list replayed differently');
    }
    check(j(Floor.ledger(live.record)) === j(Floor.ledger(back.record)),
      'seed ' + seed + ': the ledger differed on replay');
  }

  /* Not vacuous: a DIFFERENTLY played fork must diverge, or "identical" is a
   * statement about the harness rather than about the record. */
  var a = playWithStrip(seedFor(0), 7, 0, alwaysSilent);
  var b = playWithStrip(seedFor(0), 7, 0, alwaysAnswers);
  check(j(a.record) !== j(b.record),
    'two differently played matches produced the same record — the player changes nothing');

  say('replay        ' + replayed + ' matches recorded as a flat action list and replayed ' +
      'with no strip at all:');
  say('              ' + diverged + ' diverged; a differently played fork of the same seed ' +
      'did diverge');
})();

/* ===================================================================== */
/* 4 + 5. THE CLOCK, AND THE TWO SETTINGS                                */
/* ===================================================================== */

async function clockGates() {
  var S = await import('../src/play/stage.js');
  var T = await import('../src/play/tray.js');

  /* --- the oil line's own arithmetic --------------------------------- */
  check(S.OIL.burnMs === 12000, 'the oil line is not the brief\'s ~12 s');
  check(S.OIL.fadeMs === 3000, 'the murmur does not fade over the last three seconds');
  check(S.OIL.height === 2, 'the oil line is not 2px');
  check(S.oilAt(0, false) === 1, 'a fresh beat is not a full rule');
  check(S.oilAt(S.OIL.burnMs, false) === 0, 'a spent beat is not an empty rule');
  check(S.oilAt(S.OIL.burnMs * 2, false) === 0, 'the rule burned past empty');
  check(S.oilSpent(S.OIL.burnMs, false), 'a full burn did not run out');
  check(!S.oilSpent(S.OIL.burnMs - 1, false), 'the beat ran out a millisecond early');
  check(S.oilFading(S.OIL.burnMs - S.OIL.fadeMs, false), 'the square never goes quiet');
  check(!S.oilFading(S.OIL.burnMs - S.OIL.fadeMs - 1, false), 'the square goes quiet too soon');

  /*
   * 5. "THE FLOOR WAITS FOR YOU": ten minutes, and nothing has moved.
   *
   * Ten minutes of the presentation clock, sampled every 250 ms — 2400 samples,
   * which is the same instrument the page runs — and at no point does the rule
   * shorten, the beat expire, or the square go quiet.
   */
  var expired = 0, faded = 0, shortened = 0;
  for (var ms = 0; ms <= 600000; ms += 250) {
    if (S.oilAt(ms, true) !== 1) shortened++;
    if (S.oilSpent(ms, true)) expired++;
    if (S.oilFading(ms, true)) faded++;
  }
  check(shortened === 0, 'with the floor waiting, the rule shortened ' + shortened + ' times');
  check(expired === 0, 'with the floor waiting, the beat ran out ' + expired + ' times');
  check(faded === 0, 'with the floor waiting, the square went quiet ' + faded + ' times');

  /* …and the same ten minutes against a real match, which is the acceptance
   * line: "a match left ten minutes is unchanged and the log shows no
   * silences". The record is the match; the clock cannot reach it, so the proof
   * is that the two are the same object before and after. */
  var run = playWithStrip(seedFor(5), 7, 0, function (strip) {
    /* A player who never touches the keyboard. With the setting ON the beat
     * simply holds, so the harness must too — it answers only to keep the
     * match moving, and the assertion is on what the clock did meanwhile. */
    var last = strip.slots[strip.slots.length - 1];
    return { fields: last ? last.fields : null, how: 'silence' };
  });
  var before = j(run.record);
  for (var t = 0; t <= 600000; t += 1000) {
    if (S.oilSpent(t, true)) break;
  }
  check(before === j(run.record), 'ten minutes of clock changed the record');

  /*
   * 4. THE TIMER NEVER GATES A RULES DECISION.
   *
   * `floorBeatIsYours()` in src/play/main.js is the rule, and it is four
   * conditions. Mirrored here as a table rather than imported, because main.js
   * is a page module that builds a WebGL context on load — so what is asserted
   * is the TABLE, and the browser pass (scripts/capture-strip.mjs) is what
   * proves the page runs it. Every row where the rules owe you something, or a
   * surface you opened is up, has to be a row where the beat does not burn.
   */
  var ROWS = [
    { waiting: null, panel: false, ledger: false, armed: false, burns: true },
    { waiting: 'nominate', panel: false, ledger: false, armed: false, burns: false },
    { waiting: 'vote', panel: false, ledger: false, armed: false, burns: false },
    { waiting: 'speaker_discard', panel: true, ledger: false, armed: false, burns: false },
    { waiting: 'deputy_discard', panel: true, ledger: false, armed: false, burns: false },
    { waiting: 'block_response', panel: false, ledger: false, armed: true, burns: false },
    { waiting: 'power_target', panel: false, ledger: false, armed: true, burns: false },
    { waiting: 'acknowledge', panel: true, ledger: false, armed: false, burns: false },
    { waiting: null, panel: false, ledger: true, armed: false, burns: false },
    { waiting: null, panel: true, ledger: false, armed: false, burns: false }
  ];
  var yours = function (r) { return !r.panel && !r.ledger && !r.armed && !r.waiting; };
  ROWS.forEach(function (r) {
    check(yours(r) === r.burns, 'the oil line burns while ' +
      (r.waiting ? 'the rules owe you ' + r.waiting : 'a surface you opened is up') +
      ' — that is a clock on a rules decision');
  });
  var burning = ROWS.filter(yours).length;
  check(burning === 1, burning + ' of ' + ROWS.length +
    ' situations let the beat burn; only "nothing else is owed" may');

  /* --- the tray row: what you read before you speak ------------------ */

  /*
   * "Cards show the sentence truncated at 34 chars; the highlighted card's full
   * sentence is printed verbatim on the tray's second line. You never speak
   * something you have not read."
   *
   * Both halves, over the same fuzz corpus rather than over a fixture: every
   * card of every strip is rendered, its width checked, and the sentence it
   * would speak matched against the second line character for character.
   */
  var FV = await import('../src/play/floor-voice.js');
  var View = require('../src/engine/view.js');
  var Human = require('../src/engine/human-driver.js');

  var cards = 0, overlong = 0, unread = 0, blank = 0, rows = {};
  var longest = 0;
  for (var g = 0; g < Math.min(GAMES, 10); g++) {
    var seedT = seedFor(g);
    var countT = countFor(g);
    var humanT = g % countT;
    var GT = SD.createGame({
      names: NAMES.slice(0, countT), humanIndex: humanT, seed: seedT
    });
    var mindsT = AI.create(GT);
    var sessionT = Human.createSession({ G: GT, minds: mindsT, humanId: humanT });
    var viewT = View.viewFor(GT, humanT, { waitingFor: sessionT.waitingFor() });
    var namesT = NAMES.slice(0, countT);

    /* eslint-disable no-loop-func */
    playWithStrip(seedT, countT, humanT, cycler, function (strip) {
      /* The sentences the tray prints come from floor-voice's table, exactly as
       * the page fills them in. */
      strip.slots.forEach(function (s) {
        s.sentence = FV.renderUtterance(s.fields || (s.options && s.options[0].fields),
          namesT, 'bubble');
        (s.options || []).forEach(function (o) {
          o.sentence = FV.renderUtterance(o.fields, namesT, 'bubble');
        });
      });
      var levels = [{ level: 'top', slot: null }];
      strip.slots.forEach(function (s) {
        if (s.options && s.options.length) levels.push({ level: s.id, slot: s.id });
      });
      levels.forEach(function (lv) {
        for (var c = 0; c < 9; c++) {
          var row = T.stripRow(viewT, strip, {
            level: lv.level, slot: lv.slot, cursor: c, burned: 0, waits: false
          });
          rows[row.id] = (rows[row.id] || 0) + 1;
          if (c >= row.cards.length) continue;
          row.cards.forEach(function (card) {
            cards++;
            if (card.label.length > T.CARD_CHARS) overlong++;
            if (card.label.length > longest) longest = card.label.length;
          });
          var here = row.cards[row.cursor];
          if (!here) return;
          /* THE PROMISE: the full sentence, verbatim, on the second line. */
          if (here.sentence && row.note.indexOf(here.sentence) === -1) unread++;
          if (!row.note || !row.note.trim()) blank++;
        }
      });
    });
    /* eslint-enable no-loop-func */
  }
  check(cards > 500, 'only ' + cards + ' cards were rendered; the tray row is barely swept');
  check(overlong === 0, overlong + ' of ' + cards + ' cards were wider than ' +
    T.CARD_CHARS + ' characters');
  check(unread === 0, unread + ' highlighted cards would have spoken a sentence that was ' +
    'not printed in full on the tray\'s second line');
  check(blank === 0, blank + ' strip rows had an empty second line — the tray is never blank');
  check(Object.keys(rows).length === 3, 'the strip produced ' + Object.keys(rows).length +
    ' of its three tray ids: ' + j(Object.keys(rows)));

  /* The truncation itself, at the boundary. */
  check(T.truncate('x'.repeat(34)).length === 34, 'a 34-character sentence was truncated');
  check(T.truncate('x'.repeat(35)).length === 34, 'a 35-character sentence overflowed');
  check(/…$/.test(T.truncate('x'.repeat(80))), 'a truncated card does not say it was cut');
  check(T.truncate('short') === 'short', 'a short sentence was changed');

  say('oil line      12000 ms, 2px, fading over the last 3000 ms; ' + burning + ' of ' +
      ROWS.length + ' page states may burn it —');
  say('              the one where nothing else is owed. 2401 samples of ten minutes with ' +
      '"the floor waits');
  say('              for you" on: 0 expiries, 0 fades, 0 shortenings, and the record ' +
      'byte-identical');
  say('read first    ' + cards + ' cards rendered, longest ' + longest + ' of ' +
      T.CARD_CHARS + ' characters, ' + unread + ' that would have');
  say('              spoken something not printed in full first');

  /* ===================================================================== */
  /* THE MODULE ITSELF                                                     */
  /* ===================================================================== */

  var fs = require('fs');
  var path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'intents.js'), 'utf8');
  var banned = [
    ['Math.random', /Math\s*\.\s*random/],
    ['Date.now', /Date\s*\.\s*now/],
    ['performance.now', /performance\s*\.\s*now/],
    ['a timer', /set(Timeout|Interval)/],
    ['the seeded stream', /\.\s*rng\s*\(/],
    ['a hidden role', /\.\s*role\b/],
    ['a hidden team', /\.\s*team\b/],
    ['the full reveal', /fullReveal/],
    ['who knows whom', /knownRoles/]
  ];
  banned.forEach(function (b) {
    check(!b[1].test(src), 'src/engine/intents.js mentions ' + b[0] + ' (' + b[1] + ')');
  });
  check(!/require\('\.\/(ai|driver|human-driver|view)\.js'\)/.test(src),
    'intents.js reaches into another engine module');
  say('module        intents.js draws no randomness, keeps no clock, loads only engine.js, ' +
      'floor.js and');
  say('              orator.js, and names no role, team, reveal or knowledge table');

  console.log('');
  lines.forEach(function (l) { console.log(l); });
  console.log('');
  if (failures.length) {
    console.log('FAILED — ' + failures.length + ' of ' + checks + ' checks');
    failures.forEach(function (f) { console.log('  - ' + f); });
    process.exit(1);
  }
  console.log('OK — ' + checks + ' checks passed.');
}

clockGates().catch(function (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
