/*
 * The floor: speech as canonical engine data.
 *
 *     node test/floor.test.js [games]        (npm run test:floor)
 *
 * src/engine/floor.js is the first engine extension since the v1 port. The five
 * frozen files are guarded by the v1 oracle and scripts/driver-parity.js; this
 * suite is the guard on the sixth, and it is aimed at the four ways a claim
 * schema can be wrong:
 *
 *  1. IT SAYS TOO MUCH. A field allowlist over 50 complete matches with
 *     synthetic utterance streams, plus the permutation test extended from
 *     test/view.test.js: rewrite the roles a seat may not know and the whole
 *     record — every utterance, every ledger entry — must serialise identically.
 *     Both are mutation-tested; an instrument nobody broke on purpose is an
 *     instrument nobody has proved works.
 *
 *  2. IT ACCEPTS A LIE ABOUT PUBLIC FACT. V1–V6 are enforced at construction,
 *     so an invalid claim is not rejected on append — it is never built. Named
 *     rejections plus a fuzz sweep that must accept nothing.
 *
 *  3. IT DELIVERS A VERDICT. C1–C6 are evidence: a flag names a rule and its
 *     refs and stops. Each rule gets a triggering fixture AND a near-miss, so a
 *     rule that fires on everything fails as loudly as one that never fires.
 *
 *  4. IT CHANGES THE GAME. This is the pre-coupling stage: utterances are
 *     canonical, validated and analysable, and NO bot rules-decision reads them.
 *     So a match played with the whole layer running must produce the same event
 *     log as the same seed played plain — with a positive control that hands the
 *     speech layer the real seeded stream and proves the instrument can see the
 *     violation it is aimed at. A later gate (belief coupling) flips this into a
 *     controlled-divergence test on purpose.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Driver = require('../src/engine/driver.js');
var Human = require('../src/engine/human-driver.js');
var Floor = require('../src/engine/floor.js');

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

/* A stream of this suite's own, never the game's. Every random choice below —
 * which citizen speaks, what they claim, which invalid claim to fuzz — comes
 * from here, so nothing in this file can shift a bot decision by drawing. */
function ownRng(seed) { return SD.makeRng(seed >>> 0); }

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

/** A split of `n` tiles across the two types. */
function split(rng, n) {
  var r = Math.floor(rng() * (n + 1));
  return { reform: r, seize: n - r };
}

/* ===================================================================== */
/* 1. THE SYNTHETIC SPEAKER                                              */
/*                                                                       */
/* A stand-in for the bots that do not speak yet (D2 owns that). It reads */
/* ONLY the public record — never G, never a mind, never a role — and     */
/* draws only from this suite's own stream. That is what makes it a valid */
/* probe for both the permutation test and the invariance test: if it     */
/* could see a role, the permutation would catch it; if it could draw     */
/* from G.rng, the invariance would.                                      */
/* ===================================================================== */

function livingOthers(record, seat) {
  return record.alive.filter(function (s) { return s !== seat; });
}

function unclaimedSeatsOf(record, seat) {
  return record.governments.filter(function (g) {
    return g.resolved && g.resolution !== 'failed' &&
      (g.speaker === seat || g.deputy === seat) &&
      !record.utterances.some(function (u) {
        return u.kind === 'CLAIM_HAND' && u.speaker === seat && u.refs.government === g.id;
      });
  });
}

function claimFields(record, seat, rng) {
  var pool = unclaimedSeatsOf(record, seat);
  if (!pool.length) return null;
  var g = pick(rng, pool);
  var enacted = g.resolution === 'enacted' ? g.enacted : null;
  var f = {
    kind: 'CLAIM_HAND',
    speaker: seat,
    refs: { government: g.id },
    enacted: enacted,
    text_id: 'claim.' + (g.speaker === seat ? 'speaker' : 'deputy') + '.' + (g.id.replace('-', '_'))
  };
  if (g.speaker === seat) {
    f.seat_role = 'speaker';
    var drawn = split(rng, 3);
    f.drawn = drawn;
    /* Three quarters of claims are internally possible; the rest are the kind
     * of claim C1 exists to notice. Both are constructible — C1 is evidence,
     * not a validity rule, and a schema that refused it would be deciding. */
    if (rng() < 0.75) {
      var takeR = Math.min(drawn.reform, Math.floor(rng() * 3));
      var r = Math.min(takeR, 2);
      f.passed = { reform: r, seize: 2 - r };
      if (f.passed.seize > drawn.seize) f.passed = { reform: 2 - drawn.seize, seize: drawn.seize };
    } else {
      f.passed = split(rng, 2);
    }
  } else {
    f.seat_role = 'deputy';
    if (enacted && rng() < 0.8) {
      var other = enacted === 'reform' ? 'seize' : 'reform';
      f.received = {};
      f.received[enacted] = rng() < 0.5 ? 2 : 1;
      f.received[other] = 2 - f.received[enacted];
    } else {
      f.received = split(rng, 2);
    }
    if (g.block_available) f.blocked = rng() < 0.3;
  }
  return f;
}

/** The strongest accusation basis the public record actually supports. */
function accuseFields(record, seat, rng) {
  var targets = livingOthers(record, seat);
  if (!targets.length) return null;
  var target = pick(rng, targets);
  var options = [];
  var i, g;

  var seize = record.governments.filter(function (gv) {
    return gv.resolution === 'enacted' && gv.enacted === 'seize' &&
      (gv.speaker === target || gv.deputy === target);
  });
  if (seize.length) {
    options.push({ basis: 'enactment', refs: { government: pick(rng, seize).id } });
  }

  var theirClaims = record.utterances.filter(function (u) {
    return u.kind === 'CLAIM_HAND' && u.speaker === target;
  }).map(function (u) { return u.id; });
  if (theirClaims.length >= 2) {
    options.push({ basis: 'claim_consistency', refs: { utterances: theirClaims.slice(0, 2) } });
  }

  var voted = record.governments.filter(function (gv) {
    return gv.ballot &&
      (gv.ballot.aye.indexOf(target) !== -1 || gv.ballot.nay.indexOf(target) !== -1);
  }).map(function (gv) { return gv.id; });
  if (voted.length >= 2) {
    options.push({ basis: 'vote_pattern', refs: { governments: voted.slice(0, 3) } });
  }

  var outside = record.governments.filter(function (gv) {
    return gv.speaker !== target && gv.deputy !== target && gv.nominee !== target;
  }).map(function (gv) { return gv.id; });
  if (outside.length >= 3) {
    options.push({ basis: 'isolation', refs: { governments: outside.slice(0, 3) } });
  }

  var held = record.powers.filter(function (p) { return p.holder === target; });
  if (held.length) options.push({ basis: 'power_use', refs: { power: pick(rng, held).id } });

  var silentOn = {};
  record.utterances.forEach(function (u) {
    if (u.kind === 'SILENCE' && u.speaker === target) silentOn[u.floor] = 1;
  });
  var silentFloors = Object.keys(silentOn);
  if (silentFloors.length >= 2) {
    options.push({ basis: 'silence', refs: { floors: silentFloors.slice(0, 2) } });
  }

  var flags = Floor.contradictions(record);
  for (i = 0; i < flags.length; i++) {
    if (flags[i].seats.indexOf(target) === -1) continue;
    var mine = flags[i].refs.utterances.filter(function (id) {
      return Floor.utterance(record, id).speaker === target;
    });
    if (!mine.length) continue;
    options.push({ basis: 'contradiction', refs: { utterances: mine, flag: flags[i].id } });
    break;
  }

  options.push({ basis: 'gut', refs: {} });
  var chosen = pick(rng, options);
  return {
    kind: 'ACCUSE', speaker: seat, target: target,
    basis: chosen.basis, refs: chosen.refs,
    text_id: 'accuse.' + chosen.basis + '.' + (1 + Math.floor(rng() * 3))
  };
}

function questionFields(record, seat, rng) {
  var targets = livingOthers(record, seat);
  var i, j;
  for (i = 0; i < targets.length; i++) {
    var t = targets[i];
    var held = record.governments.filter(function (g) {
      return g.resolved && g.resolution !== 'failed' && (g.speaker === t || g.deputy === t) &&
        !record.utterances.some(function (u) {
          return u.kind === 'CLAIM_HAND' && u.speaker === t && u.refs.government === g.id;
        });
    });
    if (held.length) {
      return {
        kind: 'QUESTION', speaker: seat, target: t, about: 'hand',
        refs: { government: pick(rng, held).id }, text_id: 'question.hand.1'
      };
    }
    var voted = record.governments.filter(function (g) { return !!g.ballot; });
    if (voted.length) {
      return {
        kind: 'QUESTION', speaker: seat, target: t, about: 'vote',
        refs: { government: pick(rng, voted).id }, text_id: 'question.vote.1'
      };
    }
  }
  return null;
}

function supportFields(record, seat, rng) {
  var targets = livingOthers(record, seat);
  var i;
  for (i = 0; i < targets.length; i++) {
    var t = targets[i];
    var theirs = record.utterances.filter(function (u) { return u.speaker === t; });
    if (theirs.length) {
      return {
        kind: 'SUPPORT', speaker: seat, target: t, basis: 'corroborate',
        refs: { utterance: pick(rng, theirs).id }, text_id: 'support.corroborate.1'
      };
    }
    var shared = record.governments.filter(function (g) {
      return (g.speaker === seat || g.deputy === seat) && (g.speaker === t || g.deputy === t);
    });
    if (shared.length) {
      return {
        kind: 'SUPPORT', speaker: seat, target: t, basis: 'partner',
        refs: { government: pick(rng, shared).id }, text_id: 'support.partner.1'
      };
    }
  }
  return null;
}

function silenceFields(record, seat, rng) {
  var owed = record.obligations.filter(function (o) {
    return o.target === seat && !o.discharged;
  });
  if (owed.length) {
    return {
      kind: 'SILENCE', speaker: seat, prompted_by: 'question',
      refs: { utterance: owed[0].question }, explicit: rng() < 0.5,
      text_id: 'silence.question.1'
    };
  }
  var aimed = record.utterances.filter(function (u) {
    return u.kind === 'ACCUSE' && u.target === seat;
  });
  if (aimed.length && rng() < 0.6) {
    return {
      kind: 'SILENCE', speaker: seat, prompted_by: 'accusation',
      refs: { utterance: aimed[aimed.length - 1].id }, explicit: rng() < 0.5,
      text_id: 'silence.accusation.1'
    };
  }
  return {
    kind: 'SILENCE', speaker: seat, prompted_by: 'floor_open',
    refs: {}, explicit: rng() < 0.5, text_id: 'silence.floor_open.1'
  };
}

/** One beat, chosen from what the public record will actually accept. */
function chooseUtterance(record, seat, rng) {
  /* A fifth of beats are silence — deliberately, because SILENCE is the one
   * kind that is always legal and would otherwise only ever appear as a
   * fallback, leaving it unswept and leaving `basis: silence` unreachable. */
  if (rng() < 0.2) return silenceFields(record, seat, rng);
  var makers = [claimFields, accuseFields, questionFields, supportFields];
  var order = [0, 1, 2, 3];
  /* Rotate the preference so every kind gets produced across a match rather
   * than always the first one that happens to be legal. */
  var shift = Math.floor(rng() * 4);
  var i, f;
  for (i = 0; i < 4; i++) {
    f = makers[order[(i + shift) % 4]](record, seat, rng);
    if (f) return f;
  }
  return silenceFields(record, seat, rng);
}

/** The beat order a floor offers: the trigger's first speaker, then the ring. */
function beatOrder(record, f) {
  var out = [];
  function once(s) { if (s !== null && s !== undefined && out.indexOf(s) === -1) out.push(s); }
  once(f.first);
  once(f.then);
  /* Whoever a QUESTION obliged answers first and is then offered the floor a
   * second time — the one case the caps allow a citizen two beats, and the
   * only way this sweep ever exercises it. Appending them at the END instead
   * looks tidier and never fires: a three-beat floor with seven citizens is
   * full long before the tail of the order is reached. */
  f.obliged.forEach(function (s) { if (out.indexOf(s) !== -1) out.push(s); });
  record.alive.forEach(once);
  return out;
}

/**
 * Open whatever floor the triggers allow and fill it.
 *
 * Returns how many beats were spoken. `opts.rejects` counts anything the schema
 * refused — the suite requires that to stay zero, because a speaker that offers
 * an utterance the schema rejects is the work-item-2 defect one layer early.
 */
function runFloor(record, rng, opts) {
  var ts = Floor.triggers(record);
  if (!ts.length) return 0;
  var f = Floor.openFloor(record, ts[0]);
  var order = beatOrder(record, f);
  var spoken = 0;
  for (var i = 0; i < order.length; i++) {
    var seat = order[i];
    if (!Floor.floorOpenTo(record, seat)) continue;
    var fields = chooseUtterance(record, seat, rng);
    try {
      Floor.speak(record, fields);
      spoken++;
    } catch (e) {
      if (opts) { opts.rejects++; opts.lastReject = e.message; }
    }
  }
  Floor.closeFloor(record);
  return spoken;
}

/* ===================================================================== */
/* 2. THE FOLD IS FAITHFUL — cross-checked against a DIFFERENT record    */
/* ===================================================================== */

/**
 * The governments of a match, derived from the driver's event stream instead of
 * from the public snapshot.
 *
 * Deliberately a second representation. A fold checked against itself agrees
 * with its own bugs; the driver events are built by different code, from
 * different fields, at a different moment.
 */
function governmentsFromEvents(events) {
  var out = [];
  var open = null;
  events.forEach(function (ev) {
    if (ev.action === 'nominate') {
      open = { speaker: ev.actor, nominee: ev.detail.nominee, passed: null, enacted: null,
               resolution: null };
      out.push(open);
    } else if (ev.action === 'vote' && open) {
      open.passed = !!ev.detail.passed;
      if (!open.passed) { open.resolution = 'failed'; open = null; }
    } else if (ev.action === 'deputy_discard' && open) {
      open.enacted = ev.detail.enacted;
      open.resolution = 'enacted';
      open = null;
    } else if (ev.action === 'block_response' && open && ev.detail.accepted) {
      open.resolution = 'blocked';
      open = null;
    }
  });
  return out;
}

var GAMES = parseInt(process.argv[2], 10) || 50;

var foldGames = 0, foldGovs = 0, foldPowers = 0, foldPurges = 0;

for (var fg = 0; fg < GAMES; fg++) {
  var fCount = 5 + (fg % 6);
  var fSeed = 1000 + fg * 7919;
  var FG = SD.createGame({ names: NAMES.slice(0, fCount), seed: fSeed });
  var fMinds = AI.create(FG);
  var fRec = Floor.createRecord();
  Floor.observe(fRec, FG);
  var fEvents = [];
  var fGuard = 0;
  while (FG.phase !== SD.PHASE.GAME_OVER && fGuard < 4000) {
    fGuard++;
    fEvents.push(Driver.step(FG, fMinds));
    Floor.observe(fRec, FG);
  }
  foldGames++;
  foldGovs += fRec.governments.length;
  foldPowers += fRec.powers.length;
  foldPurges += fRec.purges.length;

  var fromEvents = governmentsFromEvents(fEvents);
  check(fromEvents.length === fRec.governments.length,
    'seed ' + fSeed + ': the fold saw ' + fRec.governments.length +
    ' governments, the event stream ' + fromEvents.length);
  for (var k = 0; k < Math.min(fromEvents.length, fRec.governments.length); k++) {
    var a = fromEvents[k], b = fRec.governments[k];
    check(a.speaker === b.speaker && a.nominee === b.nominee,
      'seed ' + fSeed + ' ' + b.id + ': seats disagree with the event stream');
    check((a.resolution || 'open') === (b.resolution || 'open'),
      'seed ' + fSeed + ' ' + b.id + ': resolution ' + b.resolution + ' vs ' + a.resolution);
    check(a.enacted === b.enacted,
      'seed ' + fSeed + ' ' + b.id + ': enacted ' + b.enacted + ' vs ' + a.enacted);
  }

  var enactments = fRec.governments.filter(function (g) { return g.resolution === 'enacted'; })
    .length + fRec.chaosEnactments.length;
  check(enactments === FG.reform + FG.seize,
    'seed ' + fSeed + ': the record counts ' + enactments + ' enactments, the board shows ' +
    (FG.reform + FG.seize));
  check(fRec.purges.length === fCount - SD.aliveCount(FG),
    'seed ' + fSeed + ': ' + fRec.purges.length + ' purges recorded, ' +
    (fCount - SD.aliveCount(FG)) + ' citizens are dead');
  fRec.powers.forEach(function (p) {
    check(p.resolved, 'seed ' + fSeed + ': power ' + p.id + ' never resolved');
    check(p.kind === 'foresight' || p.target !== null,
      'seed ' + fSeed + ': ' + p.kind + ' ' + p.id + ' was aimed at nobody');
  });
}

check(foldGovs > 0 && foldPowers > 0 && foldPurges > 0,
  'the fold sweep never saw a government, a power or a purge');
say('fold          ' + foldGames + ' matches: ' + foldGovs + ' governments, ' + foldPowers +
    ' powers, ' + foldPurges + ' purges — every one cross-checked against the driver\'s');
say('              own event stream, a different representation built by different code');

/* ===================================================================== */
/* 3. THE FIELD ALLOWLIST, over complete matches with speech             */
/* ===================================================================== */

/**
 * Play a whole match with the floor layer running beside it.
 *
 * `opts.leak` is the positive control for the invariance test: it hands the
 * speech layer the game's own seeded stream instead of its own.
 */
function playWithFloor(seed, count, opts) {
  opts = opts || {};
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var minds = AI.create(G);
  var record = Floor.createRecord();
  var rng = opts.leak ? G.rng : ownRng(seed ^ 0x5f3759df);
  var stats = { rejects: 0, lastReject: null, beats: 0, floors: 0, mornings: 0 };
  var events = [];
  var day = G.day;

  Floor.observe(record, G);
  var guard = 0;
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    /* `n` is stamped by Driver.playOut, and the plain run below goes through
     * it. Stamping it here too is what makes the two logs comparable field for
     * field — the first version of this test compared a log that had `n` with
     * one that did not, "failed" on every seed, and would have hidden a real
     * divergence behind a formatting difference. */
    var ev = Driver.step(G, minds);
    ev.n = guard;
    guard++;
    events.push(ev);
    Floor.observe(record, G);
    /* The transition that just happened gets its floor FIRST. Acknowledging the
     * morning before this point publishes a new transition and quietly swallows
     * it — which is how T4 and T5 came to have zero floors in the first version
     * of this sweep while powers and purges were happening on every seed. */
    stats.beats += runFloor(record, rng, stats);
    /* The morning report is human-driver.js's gate; an all-bot match still
     * crosses the top of a day, and T1 needs somebody to say so. */
    if (G.day !== day) {
      day = G.day;
      Floor.acknowledgeMorning(record, day);
      stats.mornings++;
      stats.beats += runFloor(record, rng, stats);
    }
  }
  stats.floors = record.floors.length;
  return { G: G, record: record, events: events, stats: stats, steps: events.length };
}

var auditGames = 0, auditUtterances = 0, auditRejects = 0, auditFloors = 0;
var kindsSeen = {};
var lastAuditRecord = null;
var lastAuditViolations = null;

for (var ag = 0; ag < GAMES; ag++) {
  var aCount = 5 + (ag % 6);
  var aSeed = 1000 + ag * 7919;
  var run = playWithFloor(aSeed, aCount);
  auditGames++;
  auditUtterances += run.record.utterances.length;
  auditRejects += run.stats.rejects;
  auditFloors += run.record.floors.length;
  run.record.utterances.forEach(function (u) { kindsSeen[u.kind] = (kindsSeen[u.kind] || 0) + 1; });

  var violations = Floor.auditRecord(run.record);
  check(violations.length === 0,
    'seed ' + aSeed + ': the record carries ' + violations.slice(0, 3).join(' | '));
  lastAuditRecord = run.record;
  lastAuditViolations = violations;
}

check(auditUtterances > 200,
  'only ' + auditUtterances + ' utterances across ' + GAMES + ' matches — too few to sweep');
check(auditRejects === 0,
  auditRejects + ' utterances were refused by the schema; a speaker that offers an ' +
  'invalid utterance is the defect, not the schema');
Object.keys(Floor.KIND).forEach(function (k) {
  check((kindsSeen[k] || 0) > 0, 'no ' + k + ' was ever produced — that kind is unswept');
});

say('allowlist     ' + auditUtterances + ' utterances over ' + auditGames +
    ' complete matches and ' + auditFloors + ' floors: no field outside the schema,');
say('              no forbidden key at any depth, no role token as a value anywhere');
say('              kinds ' + JSON.stringify(kindsSeen));

/* --- and the instrument, broken on purpose ---------------------------
 *
 * A sweep that has never failed is a sweep nobody has proved works. Three
 * faults are injected into a real utterance from the run above and the same
 * audit that returned clean must report each one. */

function injectAndAudit(mutate, label) {
  var u = JSON.parse(JSON.stringify(lastAuditRecord.utterances[0]));
  mutate(u);
  var out = Floor.auditUtterance(u, [], 'injected');
  check(out.length > 0, 'the allowlist sweep did NOT catch ' + label);
  return out.length ? out[0] : '(nothing)';
}

var mutations = [
  ['a role field', function (u) { u.role = 'rebel'; }],
  ['a suspicion number', function (u) { u.suspicion = 0.8; }],
  ['free text', function (u) { u.text = 'that was a loyalist and you know it'; }],
  ['a team token nested in refs', function (u) { u.refs = { government: 'g-0', team: 'rebel' }; }],
  ['prose in text_id', function (u) { u.text_id = 'I think Bo is lying'; }]
];
var mutationRows = mutations.map(function (m) {
  return '                ' + m[0] + ' -> ' + injectAndAudit(m[1], m[0]);
});
say('mutation      five faults injected into a real utterance; all five reported:');
mutationRows.forEach(say);

/* ===================================================================== */
/* 4. THE PERMUTATION TEST, EXTENDED TO SPEECH                           */
/*                                                                       */
/* READ THIS BEFORE COPYING IT. What this section proves is that the     */
/* SCHEMA and the FOLD are blind to hidden roles: the speaker below is   */
/* the synthetic one at the top of this file, which has no mind, reads   */
/* only the public record, and draws only from this suite's own stream.  */
/* Rotate the roles it may not know and its stream is byte-identical,    */
/* because there is nothing for a role to get into.                      */
/*                                                                       */
/* It is NOT the claim "a citizen's utterance stream is independent of   */
/* its role". Since D2 that is false on purpose — src/engine/orator.js   */
/* reads minds, so what a bot chooses to say correlates with what it     */
/* knows, and that correlation IS the deduction game. The re-scoped gate */
/* lives in test/orator.test.js section 7, in four parts, one of which   */
/* requires the divergence rather than forbidding it. This section keeps */
/* its value untouched — it is the control that says the schema and the  */
/* public window are still the reason nothing leaks.                     */
/* ===================================================================== */

/**
 * Rewrite the roles a seat is not entitled to know, keeping the multiset legal.
 * Lifted from test/view.test.js so the two suites cannot drift on what "hidden"
 * means; a pure index rotation, no generator involved.
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

/**
 * Two records of ONE match: A folded from the game as dealt, B folded from the
 * same game with the roles seat `v` may not know rotated at every observation.
 * Both grow their own utterance stream from identically seeded streams.
 *
 * If any part of the record — a field, a derived boolean, an ordering, a
 * ledger entry — depended on hidden state, the two serialisations differ.
 *
 * `opts.leak` is this test's positive control: it folds one hidden role into
 * record B so the comparison is known to be able to fail.
 */
function permutationRun(seed, count, opts) {
  opts = opts || {};
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var minds = AI.create(G);
  var A = Floor.createRecord();
  var B = Floor.createRecord();
  var rngA = ownRng(seed ^ 0x5f3759df);
  var rngB = ownRng(seed ^ 0x5f3759df);
  var statsA = { rejects: 0 }, statsB = { rejects: 0 };
  var permuted = 0, skipped = 0;
  var day = G.day;

  function both(fn) { fn(A, rngA, statsA); fn(B, rngB, statsB); }

  function observeBoth(v) {
    Floor.observe(A, G);
    var undo = permuteHidden(G, v);
    if (undo) permuted++; else skipped++;
    Floor.observe(B, G);
    if (opts.leak) B.leaked = G.players[0].role;   // the control
    if (undo) undo();
  }

  observeBoth(0);
  var guard = 0;
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    guard++;
    Driver.step(G, minds);
    observeBoth(guard % count);
    both(function (R, rng, st) { runFloor(R, rng, st); });
    if (G.day !== day) {
      day = G.day;
      both(function (R, rng, st) { Floor.acknowledgeMorning(R, day); runFloor(R, rng, st); });
    }
  }
  return { A: A, B: B, permuted: permuted, skipped: skipped };
}

var permGames = 0, permRotations = 0, permUtterances = 0;

for (var pg = 0; pg < Math.min(GAMES, 24); pg++) {
  var pCount = 5 + (pg % 6);
  var pSeed = 1000 + pg * 7919;
  var pr = permutationRun(pSeed, pCount);
  permGames++;
  permRotations += pr.permuted;
  permUtterances += pr.A.utterances.length;

  check(JSON.stringify(pr.A.utterances) === JSON.stringify(pr.B.utterances),
    'seed ' + pSeed + ': the utterance stream changed when hidden roles were permuted');
  check(JSON.stringify(Floor.ledger(pr.A)) === JSON.stringify(Floor.ledger(pr.B)),
    'seed ' + pSeed + ': a ledger entry changed when hidden roles were permuted');
  check(JSON.stringify(Floor.contradictions(pr.A)) === JSON.stringify(Floor.contradictions(pr.B)),
    'seed ' + pSeed + ': a contradiction flag changed when hidden roles were permuted');
  check(JSON.stringify(pr.A.governments) === JSON.stringify(pr.B.governments),
    'seed ' + pSeed + ': the public record changed when hidden roles were permuted');
}

check(permRotations > 0, 'no permutation ever ran — the check is vacuous');
check(permUtterances > 0, 'the permutation matches produced no speech at all');

/* The control: one hidden role folded into record B, and the comparison must
 * now fail. Without this the four checks above pass just as happily on two
 * records that are equal for the wrong reason. */
var leaky = permutationRun(1000, 7, { leak: true });
check(JSON.stringify(leaky.A) !== JSON.stringify(leaky.B),
  'the permutation comparison did NOT notice a hidden role folded into the record — ' +
  'it cannot see the failure it is aimed at');

say('permutation   ' + permGames + ' matches folded twice (' + permRotations +
    ' role rotations, ' + permUtterances + ' utterances): stream, ledger, flags');
say('              and public record all byte-identical; the control run diverged, so the');
say('              comparison can see a hidden role when there is one');

/* ===================================================================== */
/* 5. V1–V6 AT CONSTRUCTION                                              */
/* ===================================================================== */

/**
 * A hand-built record. The record is plain JSON by design — that is what makes
 * it replayable and what makes a fixture possible without playing a match into
 * exactly the position a rule needs.
 */
function fixture(governments, opts) {
  opts = opts || {};
  var record = Floor.createRecord();
  var n = opts.seats || 5;
  record.seats = [];
  for (var i = 0; i < n; i++) record.seats.push(i);
  record.alive = (opts.alive || record.seats).slice();
  record.day = 4;
  record.phase = SD.PHASE.NOMINATION;
  record.governments = governments || [];
  record._nextGovernment = record.governments.length;
  record.powers = opts.powers || [];
  record._prev = {};
  nextBeat(record);
  return record;
}

/** Move the record on to a fresh public transition, so a floor may open. */
function nextBeat(record) {
  record.serial += 1;
  record.lastEvents = [{ kind: 'enacted', serial: record.serial, day: record.day, seat: null }];
  record.lastEvent = record.lastEvents[0];
  return record;
}

function openSix(record) {
  if (record.openFloor) Floor.closeFloor(record);
  nextBeat(record);
  return Floor.openFloor(record, { id: 'T3', beats: 6, first: null });
}

function gov(id, speaker, deputy, opts) {
  opts = opts || {};
  return {
    id: id, day: 2, speaker: speaker, nominee: deputy, deputy: deputy,
    special: false, deck_window: opts.window === undefined ? 0 : opts.window,
    ballot: opts.ballot || { aye: [speaker, deputy], nay: [], passed: true },
    block_available: !!opts.block,
    block_proposed: false,
    resolved: opts.resolved === undefined ? true : opts.resolved,
    resolution: opts.resolution === undefined ? 'enacted' : opts.resolution,
    enacted: opts.resolution === 'failed' || opts.resolution === 'blocked'
      ? null : (opts.enacted || 'seize')
  };
}

function rejects(rule, fn, what) {
  var got = null;
  try { fn(); } catch (e) { got = e.rule || '(no rule)'; }
  check(got === rule, what + ': expected ' + rule + ', got ' + (got || 'ACCEPTANCE'));
  return got;
}

/**
 * V5 and V6 are checked before anything kind-specific, which is right — a dead
 * citizen's malformed claim is refused for being a dead citizen's. It also
 * means a rejection test for V1–V4 must run on a seat with a beat still
 * available, or it reads V6 and the assertion silently tests the wrong rule.
 * The first version of this section did exactly that.
 */
function onAFreshFloor(record, fn) {
  return function () { openSix(record); fn(); };
}

var vRecord = fixture([
  gov('g-0', 1, 2, { enacted: 'seize' }),
  gov('g-1', 3, 4, { resolved: false, resolution: null }),
  gov('g-2', 0, 1, { resolution: 'failed', ballot: { aye: [], nay: [0, 1, 2], passed: false } })
], { seats: 5, alive: [0, 1, 2, 3] });
openSix(vRecord);

var goodClaim = {
  kind: 'CLAIM_HAND', speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
  drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 }, enacted: 'seize',
  text_id: 'claim.speaker.plain'
};

function withClaim(over) {
  var f = JSON.parse(JSON.stringify(goodClaim));
  Object.keys(over).forEach(function (k) {
    if (over[k] === '@delete') delete f[k]; else f[k] = over[k];
  });
  return f;
}

/* The happy path first: if this throws, every rejection below is meaningless. */
var built = null;
try { built = Floor.speak(vRecord, withClaim({})); } catch (e) { built = e; }
check(built && built.id === 'u-0',
  'a valid CLAIM_HAND for a resolved government was refused: ' + (built && built.message));
check(built && built.seq === 0 && built.floor === 'f-0' && built.day === 4,
  'the engine did not assign id/seq/floor/day');
check(Object.isFrozen(built), 'the utterance is not frozen');

rejects('V1', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 3, text_id: 'claim.v1' }));
}), 'V1 a seat that did not hold the gavel');
rejects('V1', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'speaker', text_id: 'claim.v1b' }));
}), 'V1 the Deputy claiming the Speaker\'s seat');
rejects('V1', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 0, refs: { government: 'g-2' }, enacted: null,
    text_id: 'claim.v1c' }));
}), 'V1 a government that failed at the ballot handed nobody a hand');
rejects('V2', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 3, refs: { government: 'g-1' }, text_id: 'claim.v2' }));
}), 'V2 an unresolved government');
rejects('V2', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ enacted: 'reform', speaker: 2, seat_role: 'deputy',
    drawn: '@delete', passed: '@delete', received: { reform: 1, seize: 1 },
    text_id: 'claim.v2b' }));
}), 'V2 an enacted tile that is not the one on the board');
rejects('V3', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ drawn: { reform: 2, seize: 2 }, text_id: 'claim.v3' }));
}), 'V3 four tiles drawn');
rejects('V3', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ passed: { reform: 1, seize: 2 }, text_id: 'claim.v3b' }));
}), 'V3 three tiles passed');
rejects('V3', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 1 }, text_id: 'claim.v3c' }));
}), 'V3 one tile received');
rejects('V3', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 0, seize: 2 }, blocked: true,
    text_id: 'claim.v3d' }));
}), 'V3 claiming a Block that was never available');
rejects('V4', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ text_id: 'claim.v4' }));
}), 'V4 a second claim on one government with no amends');
rejects('V5', onAFreshFloor(vRecord, function () {
  Floor.speak(vRecord, withClaim({ speaker: 4, text_id: 'claim.v5' }));
}), 'V5 a dead citizen');

/* V6: the same claim, refused once the floor has closed. */
Floor.closeFloor(vRecord);
rejects('V6', function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 0, seize: 2 }, text_id: 'claim.v6' }));
}, 'V6 no floor is open');
openSix(vRecord);
/* ...and refused for a seat that has already had its beat, with no obligation. */
Floor.speak(vRecord, { kind: 'SILENCE', speaker: 3, prompted_by: 'floor_open', refs: {},
  explicit: true, text_id: 'silence.floor_open.1' });
rejects('V6', function () {
  Floor.speak(vRecord, { kind: 'SILENCE', speaker: 3, prompted_by: 'floor_open', refs: {},
    explicit: true, text_id: 'silence.floor_open.2' });
}, 'V6 a second beat on one floor with no QUESTION obliging it');

/* The schema-level allowlist, at construction rather than in the sweep. */
openSix(vRecord);
rejects('V0', function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 0, seize: 2 }, role: 'rebel',
    text_id: 'claim.allow' }));
}, 'a role field');
rejects('V0', function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 0, seize: 2 }, confidence: 0.9,
    text_id: 'claim.allow2' }));
}, 'a confidence number');
rejects('V0', function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 0, seize: 2 }, text_id: 'Bo is lying' }));
}, 'prose in text_id');
rejects('V0', function () {
  Floor.speak(vRecord, withClaim({ speaker: 2, seat_role: 'deputy', drawn: '@delete',
    passed: '@delete', received: { reform: 0, seize: 2 }, id: 'u-99',
    text_id: 'claim.allow3' }));
}, 'a caller-assigned id');
rejects('V0', function () {
  Floor.speak(vRecord, withClaim({ refs: { government: 'g-99' }, text_id: 'claim.allow4' }));
}, 'a reference to a government that does not exist');

/* --- the fuzz sweep ---------------------------------------------------
 *
 * Randomised claims from this suite's own stream, over a record whose real
 * shape is known. Anything the constructor accepts must ALSO be valid by an
 * independent reading of V1–V4, so the sweep cannot pass by rejecting
 * everything either. */

var fuzzRng = ownRng(20260809);
var fuzzTried = 0, fuzzAccepted = 0, fuzzWrong = 0, fuzzRules = {};

for (var fz = 0; fz < 4000; fz++) {
  var R = fixture([
    gov('g-0', 1, 2, { enacted: 'seize' }),
    gov('g-1', 0, 3, { enacted: 'reform', block: true }),
    gov('g-2', 2, 4, { resolution: 'failed', ballot: { aye: [], nay: [0], passed: false } }),
    gov('g-3', 3, 0, { resolved: false, resolution: null })
  ], { seats: 5, alive: [0, 1, 2, 3] });         // seat 4 has been purged
  openSix(R);
  /* Weighted towards nearly-legal claims on purpose. A fuzz sweep whose every
   * candidate is obviously malformed proves only that the constructor can
   * throw; the interesting candidates are the ones that are one field wrong. */
  var gid = 'g-' + (fuzzRng() < 0.85 ? Math.floor(fuzzRng() * 4) : 4);
  var role = fuzzRng() < 0.5 ? 'speaker' : 'deputy';
  var holder = Floor.government(R, gid);
  var seat = (holder && fuzzRng() < 0.6)
    ? (role === 'speaker' ? holder.speaker : holder.deputy)
    : (fuzzRng() < 0.8 ? Math.floor(fuzzRng() * 4) : 4 + Math.floor(fuzzRng() * 2));
  var cand = {
    kind: 'CLAIM_HAND', speaker: seat, seat_role: role, refs: { government: gid },
    text_id: 'fuzz.' + fz
  };
  if (role === 'speaker') {
    cand.drawn = fuzzRng() < 0.6 ? split(fuzzRng, 3)
      : { reform: Math.floor(fuzzRng() * 5), seize: Math.floor(fuzzRng() * 5) };
    cand.passed = fuzzRng() < 0.6 ? split(fuzzRng, 2)
      : { reform: Math.floor(fuzzRng() * 4), seize: Math.floor(fuzzRng() * 4) };
  } else {
    cand.received = fuzzRng() < 0.6 ? split(fuzzRng, 2)
      : { reform: Math.floor(fuzzRng() * 4), seize: Math.floor(fuzzRng() * 4) };
    if (fuzzRng() < 0.4) cand.blocked = fuzzRng() < 0.5;
  }
  var target = Floor.government(R, gid);
  cand.enacted = fuzzRng() < 0.7
    ? (target && target.resolution === 'enacted' ? target.enacted : null)
    : (fuzzRng() < 0.5 ? 'reform' : 'seize');

  fuzzTried++;
  var made = null, err = null;
  try { made = Floor.speak(R, cand); } catch (e) { err = e; }
  if (err) {
    fuzzRules[err.rule] = (fuzzRules[err.rule] || 0) + 1;
    continue;
  }
  fuzzAccepted++;
  /* Independently re-derive validity rather than asking the module again. */
  var okSeat = R.seats.indexOf(seat) !== -1 && R.alive.indexOf(seat) !== -1;
  var okGov = !!target && target.resolved && target.resolution !== 'failed';
  var okRole = okGov && (role === 'speaker' ? target.speaker === seat : target.deputy === seat);
  var okCounts = role === 'speaker'
    ? (cand.drawn.reform + cand.drawn.seize === 3 && cand.passed.reform + cand.passed.seize === 2)
    : (cand.received.reform + cand.received.seize === 2);
  var okEnacted = cand.enacted === (target && target.resolution === 'enacted' ? target.enacted : null);
  var okBlock = role === 'speaker' || cand.blocked === undefined || cand.blocked === null ||
    !!target.block_available;
  if (!(okSeat && okGov && okRole && okCounts && okEnacted && okBlock)) {
    fuzzWrong++;
    if (failures.length < 40) {
      failures.push('fuzz: an invalid claim was accepted: ' + JSON.stringify(cand));
    }
  }
}

check(fuzzWrong === 0, fuzzWrong + ' invalid claims were accepted by the constructor');
check(fuzzAccepted > fuzzTried * 0.05, 'the fuzz sweep accepted only ' + fuzzAccepted +
  ' of ' + fuzzTried + ' — a sweep that rejects nearly everything proves only that ' +
  'the constructor can throw');
check(Object.keys(fuzzRules).length >= 4,
  'the fuzz sweep only ever tripped ' + Object.keys(fuzzRules).length + ' rules');

say('validity      ' + fuzzTried + ' fuzzed claims: ' + fuzzAccepted +
    ' accepted and independently re-derived as valid, ' + (fuzzTried - fuzzAccepted) +
    ' refused ' + JSON.stringify(fuzzRules));
say('              (each candidate meets a fresh record, so V4 and V6 — repeat claims and a');
say('              spent beat — are covered by the named rejections above, not by the sweep)');
say('              V1-V6 each refused by name, plus the schema allowlist at construction');

/* ===================================================================== */
/* 6. C1–C6 — a triggering fixture AND a near-miss for each              */
/* ===================================================================== */

function flagsOf(record, rule) {
  return Floor.contradictions(record).filter(function (f) { return f.rule === rule; });
}

function claim(record, f) {
  f.kind = 'CLAIM_HAND';
  return Floor.speak(record, f);
}

var cRows = [];

function ruleCase(rule, label, build, expectFlags) {
  var record = build();
  var got = flagsOf(record, rule);
  check(got.length === expectFlags,
    rule + ' ' + label + ': expected ' + expectFlags + ' flag(s), got ' + got.length);
  if (expectFlags && got.length) {
    check(got[0].refs.utterances.length > 0, rule + ' ' + label + ': the flag names no utterance');
    check(got[0].verdict === undefined && got[0].liar === undefined &&
          got[0].confidence === undefined,
      rule + ' ' + label + ': the flag delivered a verdict');
  }
  if (expectFlags) {
    cRows.push('                ' + rule + '  ' + label + ' -> ' +
      (got.length ? got[0].class + ' · ' + got[0].refs.utterances.join(',') : 'NOTHING'));
  }
  return record;
}

/* --- C1: passed is not a subset of drawn ---------------------------- */
ruleCase('C1', 'passed two Reform having drawn one', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'reform' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 2, seize: 0 }, enacted: 'reform',
    text_id: 'c1.hit' });
  return R;
}, 1);
ruleCase('C1', 'near miss — passed exactly what was drawn', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'reform' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 1, seize: 1 }, enacted: 'reform',
    text_id: 'c1.miss' });
  return R;
}, 0);

/* --- C2: the Deputy's received lacks the tile on the board ---------- */
ruleCase('C2', 'received two Reform, a Seize is on the board', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 2, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 2, seize: 0 }, enacted: 'seize', text_id: 'c2.hit' });
  return R;
}, 1);
ruleCase('C2', 'near miss — received one of each', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 2, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 1, seize: 1 }, enacted: 'seize', text_id: 'c2.miss' });
  return R;
}, 0);

/* --- C3: the pair disagrees; the flag names both and stops ---------- */
var c3 = ruleCase('C3', 'passed one of each, received two Seize', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 1, seize: 1 }, enacted: 'seize',
    text_id: 'c3.speaker' });
  claim(R, { speaker: 2, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 0, seize: 2 }, enacted: 'seize', text_id: 'c3.deputy' });
  return R;
}, 1);
var c3flag = flagsOf(c3, 'C3')[0];
check(c3flag && c3flag.class === 'pair', 'C3 is not classed as a pair');
check(c3flag && c3flag.refs.utterances.length === 2 &&
      c3flag.refs.utterances.indexOf('u-0') !== -1 && c3flag.refs.utterances.indexOf('u-1') !== -1,
  'the C3 flag does not name both utterances');
check(c3flag && c3flag.seats.length === 2 && c3flag.seats[0] === 1 && c3flag.seats[1] === 2,
  'the C3 flag does not name both seats');
ruleCase('C3', 'near miss — the two accounts agree', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 }, enacted: 'seize',
    text_id: 'c3.speaker' });
  claim(R, { speaker: 2, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 0, seize: 2 }, enacted: 'seize', text_id: 'c3.deputy' });
  return R;
}, 0);

/* --- C4: claimed draws exceed the deck ------------------------------
 * The bound is read off the engine (SD.DECK_REFORM), never written here as a
 * number — which is also why this fixture is expressed in whole claims of
 * three rather than in "seven". */
function reformClaims(n) {
  var govs = [];
  for (var i = 0; i < n; i++) govs.push(gov('g-' + i, i, (i + 1) % 5, { enacted: 'reform' }));
  var R = fixture(govs);
  for (i = 0; i < n; i++) {
    openSix(R);
    claim(R, { speaker: i, seat_role: 'speaker', refs: { government: 'g-' + i },
      drawn: { reform: 3, seize: 0 }, passed: { reform: 2, seize: 0 }, enacted: 'reform',
      text_id: 'c4.claim' + i });
  }
  return R;
}
var overdraw = Math.ceil((SD.DECK_REFORM + 1) / 3);   // claims of three Reform each
check(overdraw >= 3, 'the C4 fixture no longer overdraws the deck');
ruleCase('C4', overdraw + ' claims of three Reform, deck holds ' + SD.DECK_REFORM,
  function () { return reformClaims(overdraw); }, 1);
ruleCase('C4', 'near miss — exactly the deck, one claim fewer',
  function () { return reformClaims(overdraw - 1); }, 0);

/* --- C5: the story changed ------------------------------------------
 * V4 makes an unamended second claim unconstructible, so the reachable case is
 * an amendment that names something other than the claim it contradicts. The
 * unamended case is checked separately, on a record built from outside — which
 * is the case that actually matters, because a replay or a wire format can
 * deliver one. */
ruleCase('C5', 'amended, but naming the wrong utterance', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  Floor.speak(R, { kind: 'SILENCE', speaker: 1, prompted_by: 'floor_open', refs: {},
    explicit: true, text_id: 'c5.silence' });
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 }, enacted: 'seize',
    text_id: 'c5.first' });
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 2, seize: 1 }, passed: { reform: 1, seize: 1 }, enacted: 'seize',
    amends: 'u-0', text_id: 'c5.second' });
  return R;
}, 1);
ruleCase('C5', 'near miss — properly amended', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 }, enacted: 'seize',
    text_id: 'c5.first' });
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 2, seize: 1 }, passed: { reform: 1, seize: 1 }, enacted: 'seize',
    amends: 'u-0', text_id: 'c5.second' });
  return R;
}, 0);
ruleCase('C5', 'a foreign record with two unamended claims', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 }, enacted: 'seize',
    text_id: 'c5.first' });
  /* Not built through speak() — this is a record arriving from elsewhere. */
  R.utterances.push({
    id: 'u-1', day: 4, floor: 'f-0', seq: 1, speaker: 1, kind: 'CLAIM_HAND', target: null,
    basis: null, refs: { government: 'g-0' }, amends: null, text_id: 'c5.smuggled',
    seat_role: 'speaker', drawn: { reform: 2, seize: 1 }, passed: { reform: 1, seize: 1 },
    received: null, blocked: null, enacted: 'seize'
  });
  return R;
}, 1);

/* --- C6: accusing on a basis your own record contradicts ------------ */
ruleCase('C6', 'the Speaker says they passed two Seize, then blames the Deputy', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 }, enacted: 'seize',
    text_id: 'c6a.claim' });
  openSix(R);
  Floor.speak(R, { kind: 'ACCUSE', speaker: 1, target: 2, basis: 'enactment',
    refs: { government: 'g-0' }, text_id: 'c6a.accuse' });
  return R;
}, 1);
ruleCase('C6', 'near miss — the Speaker says the Deputy had a choice', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 1, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 1, seize: 1 }, enacted: 'seize',
    text_id: 'c6a.claim' });
  openSix(R);
  Floor.speak(R, { kind: 'ACCUSE', speaker: 1, target: 2, basis: 'enactment',
    refs: { government: 'g-0' }, text_id: 'c6a.accuse' });
  return R;
}, 0);
ruleCase('C6', 'the Deputy says they held a choice, then blames the Speaker', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 2, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 1, seize: 1 }, enacted: 'seize', text_id: 'c6b.claim' });
  openSix(R);
  Floor.speak(R, { kind: 'ACCUSE', speaker: 2, target: 1, basis: 'enactment',
    refs: { government: 'g-0' }, text_id: 'c6b.accuse' });
  return R;
}, 1);
ruleCase('C6', 'near miss — the Deputy says they were handed two Seize', function () {
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 2, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 0, seize: 2 }, enacted: 'seize', text_id: 'c6b.claim' });
  openSix(R);
  Floor.speak(R, { kind: 'ACCUSE', speaker: 2, target: 1, basis: 'enactment',
    refs: { government: 'g-0' }, text_id: 'c6b.accuse' });
  return R;
}, 0);

say('contradiction each of C1-C6 fired on its fixture and stayed silent on its near miss;');
say('              no flag carries a verdict, a liar or a confidence:');
cRows.forEach(say);

/* Flags are evidence, and the strongest statement of that is that C3 cannot
 * name a liar even in principle: the same pair with the roles of the two
 * accounts swapped produces the same flag. */
var c3mirror = (function () {
  var R = fixture([gov('g-0', 2, 1, { enacted: 'seize' })]);
  openSix(R);
  claim(R, { speaker: 2, seat_role: 'speaker', refs: { government: 'g-0' },
    drawn: { reform: 1, seize: 2 }, passed: { reform: 1, seize: 1 }, enacted: 'seize',
    text_id: 'c3.speaker' });
  claim(R, { speaker: 1, seat_role: 'deputy', refs: { government: 'g-0' },
    received: { reform: 0, seize: 2 }, enacted: 'seize', text_id: 'c3.deputy' });
  return flagsOf(R, 'C3')[0];
})();
check(c3flag && c3mirror &&
  JSON.stringify(c3flag.seats) === JSON.stringify(c3mirror.seats) &&
  c3flag.class === c3mirror.class,
  'C3 distinguishes the two seats — it is deciding, not flagging');

/* ===================================================================== */
/* 7. THE LEDGER REBUILDS FROM A REPLAY                                  */
/* ===================================================================== */

/**
 * Play a match with a human seated, recording both the human's actions and the
 * utterance stream; then replay the recorded actions from the seed and fold a
 * second record with an identically seeded speech stream. The two ledgers must
 * be byte-identical — which is the whole claim that the record is derived data
 * and never a second source of truth.
 */
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

function foldSession(seed, count, humanIndex, decide) {
  var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: humanIndex, seed: seed });
  var minds = AI.create(G);
  var session = Human.createSession({ G: G, minds: minds, humanId: humanIndex });
  var record = Floor.createRecord();
  var rng = ownRng(seed ^ 0x9e3779b9);
  var stats = { rejects: 0 };
  var day = G.day;
  var actions = [];

  Floor.observe(record, G);
  var guard = 0;
  while (!session.over && guard < 4000) {
    guard++;
    var w = session.waitingFor();
    if (w) {
      var action = decide(w, session);
      if (w.gate === 'morning') {
        Floor.acknowledgeMorning(record, G.day);
        runFloor(record, rng, stats);
      }
      session.submit(action);
      actions.push(action);
    } else if (!session.advanceBots()) break;
    Floor.observe(record, G);
    if (G.day !== day) day = G.day;
    runFloor(record, rng, stats);
  }
  return { G: G, session: session, record: record, stats: stats };
}

var replayGames = 0, replayUtterances = 0;
for (var rg = 0; rg < 12; rg++) {
  var rCount = 5 + (rg % 6);
  var rSeed = 4400 + rg * 7919;
  var rHuman = rg % rCount;
  var live = foldSession(rSeed, rCount, rHuman, scriptedPlayer(rg));
  var again = foldSession(rSeed, rCount, rHuman, scriptedPlayer(rg));
  replayGames++;
  replayUtterances += live.record.utterances.length;

  check(JSON.stringify(live.session.events) === JSON.stringify(again.session.events),
    'seed ' + rSeed + ': the replayed match diverged before the ledger was folded');
  check(JSON.stringify(Floor.ledger(live.record)) === JSON.stringify(Floor.ledger(again.record)),
    'seed ' + rSeed + ': the ledger rebuilt from the replay is not byte-identical');
  check(JSON.stringify(live.record.utterances) === JSON.stringify(again.record.utterances),
    'seed ' + rSeed + ': the utterance stream did not reproduce');
  check(live.stats.rejects === 0, 'seed ' + rSeed + ': the schema refused an utterance');

  /* The ledger must be a FOLD, not a store: rebuilding it from the recorded
   * utterances plus the public record — with the live record's own bookkeeping
   * thrown away — must give the same answer. */
  var rebuilt = JSON.parse(JSON.stringify(live.record));
  check(JSON.stringify(Floor.ledger(rebuilt)) === JSON.stringify(Floor.ledger(live.record)),
    'seed ' + rSeed + ': the ledger is not a pure fold over the record');

  /* No score, no meter, no percentage — asserted on the shape, not the intent. */
  Floor.ledger(live.record).forEach(function (e) {
    Object.keys(e).forEach(function (key) {
      var v = e[key];
      check(typeof v !== 'number' || key === 'seat',
        'seed ' + rSeed + ': ledger entry carries a number at .' + key + ' — that is a score');
    });
  });
}
check(replayUtterances > 0, 'the replay matches produced no speech');

/* The control: a determinism check that only ever compares equal things passes
 * just as happily when it is comparing an object with itself. */
var forkA = foldSession(4400, 7, 0, scriptedPlayer(0));
var forkB = foldSession(4400, 7, 0, scriptedPlayer(3));
check(JSON.stringify(Floor.ledger(forkA.record)) !== JSON.stringify(Floor.ledger(forkB.record)),
  'two matches played differently produced the same ledger — the comparison is vacuous');

say('replay        ' + replayGames + ' human-seated matches recorded and replayed: ' +
    replayUtterances + ' utterances and every');
say('              ledger entry byte-identical; a differently-played fork diverged');

/* ===================================================================== */
/* 8. FLOOR-DISABLED INVARIANCE — proof speech changed no rule           */
/* ===================================================================== */

function plainMatch(seed, count) {
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var minds = AI.create(G);
  var out = Driver.playOut(G, minds);
  return { G: G, events: out.events, steps: out.steps };
}

var invGames = 0, invBeats = 0, invFloors = 0;
for (var ig = 0; ig < GAMES; ig++) {
  var iCount = 5 + (ig % 6);
  var iSeed = 1000 + ig * 7919;
  var off = plainMatch(iSeed, iCount);
  var on = playWithFloor(iSeed, iCount);
  invGames++;
  invBeats += on.record.utterances.length;
  invFloors += on.record.floors.length;

  check(off.steps === on.steps,
    'seed ' + iSeed + ': ' + off.steps + ' steps with the floor off, ' + on.steps + ' with it on');
  check(JSON.stringify(off.events) === JSON.stringify(on.events),
    'seed ' + iSeed + ': the event log changed when the floor was enabled');
  check(off.G.winner === on.G.winner && off.G.winReason === on.G.winReason,
    'seed ' + iSeed + ': the winner changed when the floor was enabled');
  check(on.record.utterances.length > 0,
    'seed ' + iSeed + ': nothing was said — the invariance result is vacuous for this match');
}

/* --- the positive control -------------------------------------------
 *
 * The result above is worth exactly as much as this comparison's ability to
 * detect a speech layer that touches the rules. So the same layer is run again
 * with `G.rng` handed to it in place of its own stream: every draw the speaker
 * makes now consumes from the seeded stream the bots are drawing from, and the
 * event log MUST diverge. A green invariance check from a probe that cannot see
 * a stream draw is the step-04 lesson repeating. */

var caught = 0, attempted = 0, inert = 0;
for (var cg = 0; cg < GAMES; cg++) {
  var cCount = 5 + (cg % 6);
  var cSeed = 1000 + cg * 7919;
  var plain = plainMatch(cSeed, cCount);
  var leakRun = playWithFloor(cSeed, cCount, { leak: true });
  if (leakRun.record.utterances.length === 0) { inert++; continue; }
  attempted++;
  if (JSON.stringify(plain.events) !== JSON.stringify(leakRun.events)) caught++;
}
check(attempted >= GAMES * 0.8,
  'only ' + attempted + ' of ' + GAMES + ' control matches ever produced speech');
check(caught >= attempted * 0.9,
  'the leaky speech layer was caught in only ' + caught + ' of ' + attempted +
  ' matches — the invariance check above cannot reliably see the failure it is aimed at');

say('invariance    ' + invGames + ' matches played twice, floor off and floor on: identical');
say('              event logs, winners and step counts, with ' + invBeats + ' utterances over ' +
    invFloors + ' floors spoken on the "on" side');
say('probe         ' + caught + '/' + attempted + ' matches DIVERGED when the speech layer was ' +
    'handed the game\'s own');
say('              seeded stream, so the invariance above can see the failure it is aimed at');

/* ===================================================================== */
/* 9. FLOOR SCHEDULING: the caps, over complete matches                  */
/* ===================================================================== */

var capFloors = 0, capDouble = 0, capObliged = 0, capT = {};
var openDuring = {};

for (var sg = 0; sg < GAMES; sg++) {
  var sCount = 5 + (sg % 6);
  var sSeed = 1000 + sg * 7919;
  var sRun = playWithFloor(sSeed, sCount);
  var rec = sRun.record;
  var serials = {};
  rec.floors.forEach(function (f) {
    capFloors++;
    capT[f.trigger] = (capT[f.trigger] || 0) + 1;
    check(f.utterances.length <= Floor.FLOOR_BEAT_CAP,
      'seed ' + sSeed + ' ' + f.id + ': ' + f.utterances.length + ' beats, cap is ' +
      Floor.FLOOR_BEAT_CAP);
    check(!serials[f.serial],
      'seed ' + sSeed + ': two floors opened on one phase transition (serial ' + f.serial + ')');
    serials[f.serial] = 1;

    var spoke = {};
    f.utterances.forEach(function (uid) {
      var u = Floor.utterance(rec, uid);
      spoke[u.speaker] = (spoke[u.speaker] || 0) + 1;
    });
    Object.keys(spoke).forEach(function (seat) {
      if (spoke[seat] > 1) {
        capDouble++;
        check(f.obliged.indexOf(Number(seat)) !== -1,
          'seed ' + sSeed + ' ' + f.id + ': seat ' + seat + ' took ' + spoke[seat] +
          ' beats with no QUESTION obliging it');
        check(spoke[seat] === 2,
          'seed ' + sSeed + ' ' + f.id + ': seat ' + seat + ' took ' + spoke[seat] + ' beats');
      }
    });
    if (f.obliged.length) capObliged++;
  });
  rec.utterances.forEach(function (u) {
    var f = Floor.floor(rec, u.floor);
    check(!!f, 'seed ' + sSeed + ': ' + u.id + ' belongs to no floor');
    check(f.utterances.indexOf(u.id) === u.seq,
      'seed ' + sSeed + ': ' + u.id + ' is at beat ' + u.seq + ' but sits at ' +
      f.utterances.indexOf(u.id));
  });
}

check(capFloors > 0, 'no floor ever opened');
check(capDouble > 0, 'no citizen ever took a second beat — the obligation cap is unexercised');
/* Every opening trigger must actually fire somewhere in the sweep. T6 is a
 * carry-over rather than an opener — it modifies whatever floor opens next —
 * so it is checked by its own fixture below instead. */
['T1', 'T2', 'T3', 'T4', 'T5'].forEach(function (t) {
  check((capT[t] || 0) > 0, t + ' never opened a floor in ' + GAMES +
    ' matches — that trigger is unswept');
});

/* The negative half: the states a floor must never open in. */
var neverRec = fixture([gov('g-0', 1, 2, {})], { seats: 5, alive: [0, 1, 2, 3, 4] });
[SD.PHASE.VOTE, SD.PHASE.LEGISLATIVE_SPEAKER, SD.PHASE.LEGISLATIVE_DEPUTY,
 SD.PHASE.BLOCK_RESPONSE, SD.PHASE.GAME_OVER].forEach(function (phase) {
  neverRec.phase = phase;
  nextBeat(neverRec);
  check(!Floor.canOpenFloor(neverRec), 'a floor may not open during ' + phase);
  check(Floor.triggers(neverRec).length === 0, 'triggers fired during ' + phase);
});
neverRec.phase = SD.PHASE.NOMINATION;
nextBeat(neverRec);
check(Floor.canOpenFloor(neverRec), 'a floor cannot open at nomination either — the check is dead');
neverRec.alive = [0, 1];
check(!Floor.canOpenFloor(neverRec), 'a floor opened at two alive');
neverRec.alive = [0, 1, 2, 3, 4];
neverRec.over = true;
check(!Floor.canOpenFloor(neverRec), 'a floor opened after game over');
neverRec.over = false;
Floor.openFloor(neverRec, { id: 'T3', beats: 3, first: null });
check(!Floor.canOpenFloor(neverRec), 'a second floor opened while one was already open');
Floor.closeFloor(neverRec);
check(!Floor.canOpenFloor(neverRec),
  'a second floor opened on the same phase transition as the first');

/* T6: an unanswered QUESTION prepends its target and buys a beat. */
var t6 = fixture([gov('g-0', 1, 2, {}), gov('g-1', 3, 4, {})], { seats: 5 });
openSix(t6);
Floor.speak(t6, { kind: 'QUESTION', speaker: 1, target: 3, about: 'hand',
  refs: { government: 'g-1' }, text_id: 'q.hand.1' });
Floor.closeFloor(t6);
nextBeat(t6);
var t6triggers = Floor.triggers(t6);
check(t6triggers.length === 1 && t6triggers[0].first === 3,
  'T6 did not prepend the questioned citizen');
check(t6triggers[0].beats === Math.min(Floor.TRIGGERS.T3.beats + 1, Floor.FLOOR_BEAT_CAP),
  'T6 did not add a beat (got ' + (t6triggers[0] && t6triggers[0].beats) + ')');
check(t6triggers[0].carried && t6triggers[0].carried.indexOf('u-0') !== -1,
  'T6 does not name the question it is carrying');
var t6floor = Floor.openFloor(t6, t6triggers[0]);
check(t6floor.obliged.indexOf(3) !== -1, 'the obliged citizen is not recorded on the floor');
Floor.speak(t6, { kind: 'SILENCE', speaker: 3, prompted_by: 'question',
  refs: { utterance: 'u-0' }, explicit: true, text_id: 'silence.question.1' });
check(Floor.speak(t6, { kind: 'SILENCE', speaker: 3, prompted_by: 'floor_open', refs: {},
  explicit: false, text_id: 'silence.floor_open.1' }).seq === 1,
  'an obliged citizen was refused their second beat');

/* Explicit and timed-out silence are DIFFERENT events, recorded not inferred. */
var sil = Floor.ledger(t6)[3];
check(sil.silences.explicit.length === 1 && sil.silences.timeout.length === 1,
  'the ledger does not keep chosen and timed-out silence apart');

/* --- D2, owner-locked: SILENCE DOES NOT DISCHARGE A QUESTION ---------
 *
 * D1 discharged an obligation on anything the questioned citizen said next,
 * silence included. That is now reversed: an obligation persists, floor after
 * floor, until the obliged citizen actually speaks, and every silence in
 * between is recorded on the obligation as well as in the stream — so
 * `basis: silence` accumulates references and the evasion gets more
 * referencable, not less. */

check(!t6.obligations[0].discharged,
  'two silences discharged a QUESTION — silence is not an answer (D2 spec)');
check(t6.obligations[0].silences.length === 2,
  'the obligation did not record the silences it survived (got ' +
  t6.obligations[0].silences.length + ')');

/* Floor two: still owed, still prepended, and the trigger still carries it. */
Floor.closeFloor(t6);
nextBeat(t6);
var t6b = Floor.triggers(t6);
check(t6b.length === 1 && t6b[0].first === 3,
  'the obligation did not carry to a SECOND floor after a silence');
check(t6b[0].carried && t6b[0].carried.indexOf('u-0') !== -1,
  'the second floor does not name the question it is still carrying');
var t6floorB = Floor.openFloor(t6, t6b[0]);
check(t6floorB.obliged.indexOf(3) !== -1, 'the second floor does not oblige seat 3');
Floor.speak(t6, { kind: 'SILENCE', speaker: 3, prompted_by: 'question',
  refs: { utterance: 'u-0' }, explicit: true, text_id: 'silence.question.2' });
check(!t6.obligations[0].discharged,
  'a third silence discharged the QUESTION across two floors');
check(t6.obligations[0].silences.length === 3,
  'the third silence was not recorded on the obligation');

/* Three silences on two DIFFERENT floors is exactly what `basis: silence`
 * needs — the evasion is now constructible evidence, which is the point of
 * making silence persist rather than discharge. */
var silenceAccuse = Floor.speak(t6, {
  kind: 'ACCUSE', speaker: 1, target: 3, basis: 'silence',
  refs: { floors: [t6floor.id, t6floorB.id] }, text_id: 'accuse.silence.1'
});
check(silenceAccuse.basis === 'silence',
  'two floors of recorded silence did not support basis: silence');

/* And an actual answer discharges it — the fixture that proves the persistence
 * above is a rule and not a broken discharge. */
Floor.speak(t6, { kind: 'ACCUSE', speaker: 3, target: 1, basis: 'gut', refs: {},
  text_id: 'accuse.gut.1' });
check(t6.obligations[0].discharged,
  'speaking did not discharge the QUESTION — nothing ever would');
check(t6.obligations[0].answer !== null,
  'the obligation does not name the utterance that discharged it');
Floor.closeFloor(t6);
nextBeat(t6);
check(Floor.triggers(t6).every(function (t) { return !t.carried; }),
  'a discharged obligation is still being carried');

say('obligation    silence does not discharge a QUESTION: 3 silences over 2 floors left it');
say('              owed and carried, made basis: silence constructible, and an actual');
say('              answer then discharged it and stopped the carry');

say('scheduling    ' + capFloors + ' floors over ' + GAMES + ' matches ' + JSON.stringify(capT) +
    ': six beats per floor,');
say('              one floor per phase transition, ' + capDouble + ' second beats and every one ' +
    'of them obliged by a QUESTION');
say('              never during a vote, drafting, at two alive, or after game over');

/* ===================================================================== */
/* 9b. FLAGS ARE PERMANENT EVIDENCE (D2, owner-locked)                   */
/*                                                                       */
/* A flag never expires. Addressing it changes exactly one thing: it     */
/* stops LEADING T1's morning ordering. Three fixtures — leads before,   */
/* stops leading after, still queryable always.                          */
/* ===================================================================== */

(function () {
  /* One C3 pair flag, built the same way section 6's C3 fixture builds it. */
  var R = fixture([gov('g-0', 1, 2, { enacted: 'seize' }),
                   gov('g-1', 3, 4, { enacted: 'seize' })], { seats: 5 });
  openSix(R);
  Floor.speak(R, { kind: 'CLAIM_HAND', speaker: 1, seat_role: 'speaker',
    refs: { government: 'g-0' }, drawn: { reform: 1, seize: 2 },
    passed: { reform: 1, seize: 1 }, enacted: 'seize', text_id: 'claim.speaker.choice' });
  Floor.speak(R, { kind: 'CLAIM_HAND', speaker: 2, seat_role: 'deputy',
    refs: { government: 'g-0' }, received: { reform: 0, seize: 2 },
    enacted: 'seize', text_id: 'claim.deputy.no_choice' });

  var f1 = Floor.contradictions(R);
  check(f1.length === 1 && f1[0].rule === 'C3', 'the flag fixture did not raise its C3');
  check(f1[0].addressed.length === 0, 'a brand-new flag is already marked addressed');

  /* LEADS BEFORE: T1 turns to a flagged citizen. Seat 1 and seat 2 both carry
   * the pair flag; mostFlagged picks the lowest-numbered of the tied. */
  R.day = 3;
  Floor.closeFloor(R);
  Floor.acknowledgeMorning(R, 3);
  var lead = Floor.triggers(R).filter(function (t) { return t.id === 'T1'; })[0];
  check(!!lead && lead.first === 1, 'T1 did not lead with a flagged citizen (got ' +
    (lead && lead.first) + ')');

  /* Seat 1 speaks to it — an ACCUSE on the very flag, naming the two utterances
   * inside it. "One of us is lying, and it is not me" is the whole move. */
  var lf = Floor.openFloor(R, lead);
  Floor.speak(R, { kind: 'ACCUSE', speaker: 1, target: 2, basis: 'contradiction',
    refs: { utterances: ['u-0', 'u-1'], flag: f1[0].id }, text_id: 'accuse.contradiction.1' });

  var f2 = Floor.contradictions(R);
  /* STILL QUERYABLE ALWAYS: the flag is still in the list, same id, same rule,
   * same refs, both seats still named. Addressing is not retiring. */
  check(f2.length >= 1, 'the flag vanished once it was addressed');
  var same = f2.filter(function (f) { return f.id === f1[0].id; })[0];
  check(!!same, 'the addressed flag is no longer queryable by its id');
  check(!!same && same.rule === 'C3' && same.class === 'pair' &&
    JSON.stringify(same.seats) === JSON.stringify(f1[0].seats) &&
    JSON.stringify(same.refs) === JSON.stringify(f1[0].refs),
    'addressing a flag changed its rule, class, seats or refs');
  check(!!same && same.addressed.indexOf(1) !== -1,
    'the citizen who spoke to the flag is not recorded as having addressed it');
  check(!!same && same.addressed.indexOf(2) === -1,
    'seat 2 was marked as having addressed a flag it never spoke to');

  /* The ledger still carries it for both, addressed or not. */
  var led = Floor.ledger(R);
  check(led[1].flags.indexOf(f1[0].id) !== -1 && led[2].flags.indexOf(f1[0].id) !== -1,
    'the ledger dropped an addressed flag');

  /* STOPS LEADING AFTER: the next morning, T1 turns to seat 2 — who has not
   * spoken to it — rather than to seat 1 again. */
  Floor.closeFloor(R);
  R.day = 4;
  nextBeat(R);
  Floor.acknowledgeMorning(R, 4);
  var lead2 = Floor.triggers(R).filter(function (t) { return t.id === 'T1'; })[0];
  check(!!lead2 && lead2.first === 2,
    'an addressed flag is still leading the morning (T1 first = ' +
    (lead2 && lead2.first) + ', expected 2)');

  /* And when BOTH have spoken to it, T1 has nobody to lead with — the morning
   * opens on the ring rather than on a citizen who has already answered. */
  var lf2 = Floor.openFloor(R, lead2);
  Floor.speak(R, { kind: 'ACCUSE', speaker: 2, target: 1, basis: 'contradiction',
    refs: { utterances: ['u-0', 'u-1'], flag: f1[0].id }, text_id: 'accuse.contradiction.2' });
  Floor.closeFloor(R);
  R.day = 5;
  nextBeat(R);
  Floor.acknowledgeMorning(R, 5);
  var lead3 = Floor.triggers(R).filter(function (t) { return t.id === 'T1'; })[0];
  check(!!lead3 && lead3.first === null,
    'T1 still leads with a flag both parties have addressed (first = ' +
    (lead3 && lead3.first) + ')');
  check(Floor.contradictions(R).filter(function (f) { return f.id === f1[0].id; }).length === 1,
    'the flag expired once everybody had addressed it — flags are permanent');

  say('flags         permanent evidence: one C3 led the morning, stopped leading once its');
  say('              own party spoke to it, and is still queryable by id, still on both');
  say('              ledger entries and still carrying its rule, class, seats and refs');
})();

/* ===================================================================== */
/* 10. THE INTEGRATION SEAM                                              */
/*                                                                       */
/* human-driver.js is frozen, so the play layer gets a companion object   */
/* rather than a hook inside the session. Nothing in src/play calls it    */
/* yet; what is checked here is that it is the SAME code path as the      */
/* functional API, so a future caller cannot get a second answer.         */
/* ===================================================================== */

(function () {
  var seed = 1000, count = 7;
  var G = SD.createGame({ names: NAMES.slice(0, count), seed: seed });
  var minds = AI.create(G);
  var rec = Floor.createRecorder();
  var rng = ownRng(seed ^ 0x5f3759df);
  var stats = { rejects: 0 };
  var day = G.day;

  rec.observe(G);
  var guard = 0;
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    guard++;
    Driver.step(G, minds);
    rec.observe(G);
    runFloor(rec.record, rng, stats);
    if (G.day !== day) {
      day = G.day;
      rec.acknowledgeMorning(day);
      runFloor(rec.record, rng, stats);
    }
  }

  var functional = playWithFloor(seed, count);
  check(JSON.stringify(rec.record) === JSON.stringify(functional.record),
    'the recorder facade and the functional API built different records');
  check(JSON.stringify(rec.ledger()) === JSON.stringify(Floor.ledger(functional.record)),
    'the recorder facade folds a different ledger');
  check(rec.audit().length === 0, 'the recorder\'s own audit reports a violation');
  check(typeof rec.triggers === 'function' && typeof rec.speak === 'function' &&
        typeof rec.openFloor === 'function' && typeof rec.flags === 'function',
    'the recorder does not offer the seam the play layer needs');
  check(rec.record.utterances.length > 0, 'the recorder recorded nothing');
  say('seam          the recorder facade built a byte-identical record and ledger to the ' +
      'functional API');
})();

/* ===================================================================== */
/* 11. THE MODULE ITSELF                                                 */
/* ===================================================================== */

var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'engine', 'floor.js'), 'utf8');
var banned = [
  ['Math.random', /Math\s*\.\s*random/],
  ['Date.now', /Date\s*\.\s*now/],
  ['performance.now', /performance\s*\.\s*now/],
  ['a timer', /set(Timeout|Interval)/],
  ['the seeded stream', /\.\s*rng\s*\(/],
  ['a hidden role', /\.\s*role\b/],
  ['a hidden team', /\.\s*team\b/],
  ['another seat\'s Peek record', /\.\s*peeked\b/],
  ['the full reveal', /fullReveal/],
  ['who knows whom', /knownRoles/],
  ['the seed', /\.\s*seed\b/],
  ['the deck contents', /\.\s*deck\s*\[/],
  ['a private hand', /\.\s*(hand|deputyHand)\b/]
];
banned.forEach(function (b) {
  check(!b[1].test(src), 'src/engine/floor.js mentions ' + b[0] + ' (' + b[1] + ')');
});
check(/require\('\.\/engine\.js'\)/.test(src), 'floor.js does not load engine.js');
check(!/require\('\.\/(ai|driver|human-driver|view)\.js'\)/.test(src),
  'floor.js reaches into another engine module');

/* The five frozen files must still be byte-identical to what git holds — this
 * suite is an extension, and an extension that edited them would not be one. */
say('module        floor.js draws no randomness, keeps no clock, loads only engine.js, and');
say('              names no role, team, peek record, hand, deck or seed anywhere in its text');

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
