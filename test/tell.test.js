/*
 * THE ANTI-TELL SWEEP: no channel the player can see or hear may correlate with
 * a hidden role.
 *
 *     node test/tell.test.js [games]          (npm run test:tell)
 *
 * The design review made this law and until this gate nothing enforced it. The
 * law is not "the ambience does not read roles" — that is a code-review
 * statement and it decays the first time somebody adds a parameter. It is:
 *
 *   GIVEN THE SAME PUBLIC RECORD, EVERY PRESENTATION CHANNEL IS BYTE-IDENTICAL,
 *   WHATEVER THE HIDDEN ROLES BEHIND IT HAPPEN TO BE.
 *
 * A tell is not only a panel that prints a role. It is a lantern that goes out
 * a beat early for a Rebel Speaker; a bed that drops 40 Hz when the nominee is
 * one; a sting that holds 200 ms longer; a bot that deliberates 15% longer over
 * a fellow conspirator. Every one of those is invisible in a diff, invisible in
 * a screenshot, and a complete solve of the game to anybody who notices. So the
 * sweep takes ALL of them at once:
 *
 *   lantern states     which lanterns burn, at what intensity, in what order
 *   light sequence     the lighting id, step by step, for a whole match
 *   bed selection      the phase bed's gain and cutoff, and the constant layer
 *   cues               which one-shots fire, and in what order
 *   sting timing       whether a sting fired, and how long it holds
 *   pace               the bot deliberation band and the beat, drawn for real
 *   flame              the seeded flicker table, by checksum
 *
 * HOW IT IS RUN, AND THE THING IT CANNOT SEE
 * ------------------------------------------
 * At every step of every match the hidden roles are permuted in place, the view
 * is re-projected, the channels are recomputed, and the roles are put back. Two
 * records, compared as JSON.
 *
 * The honest weakness, stated here rather than discovered later: the production
 * channels are pure functions of a PLAYER-SAFE view, and a player-safe view does
 * not carry hidden roles, so their agreeing under permutation is close to
 * tautological. A sweep that only did that would be a green light with nothing
 * behind it.
 *
 * So it does three things instead of one, and only the first is cheap:
 *
 *   1. THE PREMISE IS CHECKED, NOT ASSUMED. The view itself is compared under
 *      permutation, byte for byte. "The same public record" is then a verified
 *      fact rather than the thing being taken on faith — and if a future engine
 *      change ever let a role reach the projection, this fails first and loudest.
 *
 *   2. THE DETECTOR IS MUTATION-TESTED. Seven deliberately injected tells are
 *      run through the same harness, each reaching for `G` — the omniscient game
 *      object the real code never receives — and each one must be CAUGHT. A
 *      sweep that cannot fail is not a gate, and the only way to know this one
 *      can is to make it. An identity mutant is run as the control and must be
 *      caught by nothing, so "everything differs" is excluded too.
 *
 *   3. THE READS ARE AUDITED. The whole composed pipeline is driven through a
 *      recording Proxy, so a channel that starts reading a field nobody
 *      whitelisted fails even when that field is not role-shaped and would sail
 *      through the permutation. "The beam brightens when the deck runs low" is
 *      not a role tell and it is still a tell.
 *
 * What none of the three can see: a tell delivered through a channel this file
 * does not enumerate. It reads the channels the ambience produces; a future
 * animation, camera move or shader that took a role would need its own row here.
 * That gap is real and it is why the row list above is written out in full.
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

/* ------------------------------------------------------- the permutation */

/**
 * Rewrite the roles this seat is not entitled to know, and hand back the undo.
 *
 * Rotated rather than shuffled: a rotation of a list with at least two distinct
 * roles in it is guaranteed to move at least one seat's role, which a shuffle is
 * not. Seats whose role this seat legitimately knows (their own, and a Rebel's
 * knowledge of the Dictator) are left alone — permuting those would be testing
 * that the game hides things it is supposed to show.
 */
function permuteHidden(G, seat) {
  var known = SD.knownRoles(G, seat);
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

/* ----------------------------------------------------- the injected tells */

/**
 * Seven tells, each one plausible enough that it could arrive in a real diff
 * as a mood note, and each one a complete or partial solve of the game.
 *
 * Every one reaches for `G`, because that is the only place hidden roles live —
 * which is itself the finding: a tell CANNOT be written against the view the
 * real code is handed. The mutants exist to prove the harness would catch one
 * if a future edit ever passed something wider in.
 */
function dictatorSeat(G) {
  for (var i = 0; i < G.players.length; i++) {
    if (G.players[i].role === SD.ROLE.DICTATOR) return i;
  }
  return -1;
}
function isRebelSeat(G, id) {
  return id != null && G.players[id] && G.players[id].team === SD.TEAM.REBEL;
}

var MUTANTS = [
  {
    name: 'control (no tell at all)',
    control: true,
    apply: function () {}
  },
  {
    name: 'the lanterns go out from the other side when the Dictator sits odd',
    channel: 'lantern states',
    apply: function (rec, G) {
      if (dictatorSeat(G) % 2 === 1) rec.lanterns = rec.lanterns.slice().reverse();
    }
  },
  {
    name: 'the west lantern dims a touch while a Rebel holds the floor',
    channel: 'lantern states',
    apply: function (rec, G, view) {
      if (isRebelSeat(G, view.speaker) && rec.lanterns.length) {
        rec.lanterns[0] = Object.assign({}, rec.lanterns[0],
          { intensity: rec.lanterns[0].intensity * 0.85 });
      }
    }
  },
  {
    name: 'the bed drops 40 Hz when the nominee is a Rebel',
    channel: 'bed selection',
    apply: function (rec, G, view) {
      if (isRebelSeat(G, view.nominee)) rec.bed = Object.assign({}, rec.bed, { cutoff: rec.bed.cutoff - 40 });
    }
  },
  {
    name: 'the sting holds 200 ms longer for a Seize enacted by the Dictator',
    channel: 'sting timing',
    apply: function (rec, G, view) {
      if (rec.sting.tile && view.speaker === dictatorSeat(G)) rec.sting.ms += 200;
    }
  },
  {
    name: 'the trial is lit as a power play when the Speaker is the Dictator',
    channel: 'light sequence',
    apply: function (rec, G, view) {
      if (rec.light === 'trial' && view.speaker === dictatorSeat(G)) rec.light = 'power';
    }
  },
  {
    name: 'the gavel is swallowed when a Loyalist is nominated',
    channel: 'cues',
    apply: function (rec, G, view) {
      if (view.nominee != null && !isRebelSeat(G, view.nominee)) {
        rec.cues = rec.cues.filter(function (c) { return c !== 'gavel'; });
      }
    }
  },
  {
    name: 'the flicker is salted with the Dictator\'s seat',
    channel: 'flame',
    apply: function (rec, G, view, L) {
      rec.flame = checksum(L.flickerTable(1000 + dictatorSeat(G)));
    }
  },
  {
    name: 'the bots deliberate 15% longer over a fellow conspirator',
    channel: 'pace',
    apply: function (rec, G, view) {
      if (isRebelSeat(G, view.nominee) && isRebelSeat(G, view.speaker)) {
        rec.pace = Object.assign({}, rec.pace, { delay: rec.pace.delay * 1.15 });
      }
    }
  }
];

function checksum(table) {
  var h = 2166136261;
  for (var i = 0; i < table.length; i++) {
    h ^= Math.round(table[i] * 1e9) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* -------------------------------------------------------- the whitelist */

/* The same list src/play/lighting.js's header declares and
 * test/ambience.test.js proves, extended by nothing: this gate found no field
 * the ambience needed that was not already public. */
var ALLOWED = [
  'phase', 'winner',
  'waitingFor', 'waitingFor.kind', 'waitingFor.gate',
  'lastVote', 'lastVote.passed', 'lastVote.speaker', 'lastVote.nominee',
  'lastVote.aye', 'lastVote.aye.length', 'lastVote.nay', 'lastVote.nay.length',
  'nominee', 'reform', 'seize', 'lastEnacted', 'lastEnacted.tile'
];
var SKIP_KEYS = { then: 1, toJSON: 1, constructor: 1, inspect: 1, valueOf: 1, toString: 1 };

function recorder(value, path, seen) {
  if (value === null || typeof value !== 'object') return value;
  return new Proxy(value, {
    get: function (target, key) {
      if (typeof key === 'symbol' || SKIP_KEYS[key]) return target[key];
      var next = path ? path + '.' + key : String(key);
      var recorded = /^\d+$/.test(String(key)) ? path : next;
      if (recorded) seen[recorded] = (seen[recorded] || 0) + 1;
      return recorder(target[key], /^\d+$/.test(String(key)) ? path : next, seen);
    }
  });
}

/* ------------------------------------------------------------- the sweep */

var GAMES = parseInt(process.argv[2], 10) || 24;

function scriptedPlayer(salt) {
  var n = 0;
  return function (w) {
    var i = n++;
    if (w.kind === 'acknowledge' || w.kind === 'power_ack') return null;
    /* Fails plenty of governments on purpose, so Chaos and its state are swept
     * too, and enacts plenty of Seizes, so the weather actually moves. */
    if (w.kind === 'vote') return ((i + salt) % 3) !== 0;
    if (w.kind === 'block_response') return ((i + salt) % 2) === 0;
    return w.options[(i + salt) % w.options.length];
  };
}

async function main() {
  var L = await import('../src/play/lighting.js');
  var A = await import('../src/play/audio.js');
  var P = await import('../src/play/pace.js');

  /**
   * EVERY PRESENTATION CHANNEL THE AMBIENCE PRODUCES, for one moment.
   *
   * Built out of the functions the browser actually calls — not a restatement of
   * them — so a change to any of those changes this. `pace` is drawn for real
   * rather than read off the band table, because a stream that advanced a
   * different number of times would itself be a timing channel.
   */
  function channels(view, prev, own, waiting, pace, flame) {
    var edges = L.publicEdges(prev, view);
    var sting = edges.sting;
    var light = L.lightingFor(view, sting ? { sting: sting } : null);
    var weather = L.weatherFor(view, L.LANTERN_ORDER.length);
    return {
      light: light,
      edges: edges,
      cues: A.cuesFor(edges, own),
      bed: A.bedFor(light),
      town: A.TOWN,
      weather: weather,
      lanterns: L.lanternPlanFor(light, weather),
      sting: { tile: sting, ms: L.STING_MS },
      flame: flame,
      pace: {
        delay: pace.delayFor(view.phase, 1),
        beat: pace.beatFor(waiting, 1),
        lead: L.LIGHT_LEAD_MS,
        transition: L.TRANSITION_SECONDS
      }
    };
  }

  /* The flame's table is seeded from the match seed and nothing else. Folded to
   * a checksum so a 512-sample array does not drown the record. */
  function flameOf(seed) { return checksum(L.flickerTable(seed)); }

  var steps = 0;
  var permutations = 0;
  var viewMismatches = 0;
  var channelMismatches = 0;
  var audited = 0;
  var outsideWhitelist = [];
  /* mutant index -> how many moments it was caught at. */
  var caught = MUTANTS.map(function () { return 0; });
  var seizesSeen = 0;
  var lanternsOutSeen = 0;
  var lightsSeen = {};

  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var human = g % count;
    var seed = 7000 + g * 13;
    var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: human, seed: seed });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: human });
    var answer = scriptedPlayer(g);

    /*
     * Two pace streams, seeded alike and advanced in lockstep. One per run
     * rather than one shared, because a shared stream would hand the second run
     * different numbers for a reason that has nothing to do with roles and the
     * whole sweep would be noise.
     */
    var paceA = P.createPace(seed);
    var paceB = P.createPace(seed);
    var flame = flameOf(seed);

    var prev = null;
    var guard = 0;
    var own = null;

    while (!session.over && guard++ < 4000) {
      var w = session.waitingFor();
      var view = View.viewFor(G, human, { waitingFor: w });
      steps++;

      var recA = channels(view, prev, own, w, paceA, flame);
      lightsSeen[recA.light] = (lightsSeen[recA.light] || 0) + 1;
      if (recA.weather.out > 0) lanternsOutSeen++;
      seizesSeen = Math.max(seizesSeen, recA.weather.seizes);

      /* --- the composed pipeline, through the recording Proxy --- */
      if (audited < 300) {
        audited++;
        var seen = {};
        var paceAudit = P.createPace(seed);
        channels(recorder(view, '', seen), prev, own, w, paceAudit, flame);
        Object.keys(seen).forEach(function (p) {
          if (ALLOWED.indexOf(p) === -1 && outsideWhitelist.indexOf(p) === -1) {
            outsideWhitelist.push(p);
          }
        });
      }

      /*
       * The injected tells, applied to the FIRST record while the real roles are
       * still in place. Order is load-bearing and the first version got it
       * wrong: applied after `permuteHidden`, both copies saw the permuted game,
       * every mutant agreed with itself and all seven were reported clean —
       * a mutation test that cannot fail, which is the exact failure it exists
       * to rule out. Caught by the sweep's own control expectations (`caught > 0`
       * for every non-control mutant) rather than by reading the code.
       */
      var mutatedA = null;
      if (view.phase !== 'game_over') {
        mutatedA = MUTANTS.map(function (m) {
          var copy = JSON.parse(JSON.stringify(recA));
          m.apply(copy, G, view, L);
          return JSON.stringify(copy);
        });
      }

      /* --- the permutation --- */
      if (view.phase !== 'game_over') {
        var undo = permuteHidden(G, human);
        if (undo) {
          permutations++;
          var viewB = View.viewFor(G, human, { waitingFor: session.waitingFor() });
          var recB = channels(viewB, prev, own, w, paceB, flame);

          /*
           * 1. THE PREMISE. The public record must be the same record. If this
           * ever fires, the channel comparison below is meaningless and the leak
           * is in the projection rather than in the ambience.
           */
          if (JSON.stringify(view) !== JSON.stringify(viewB)) {
            viewMismatches++;
            check(false, 'the PLAYER-SAFE VIEW itself changed when hidden roles were permuted ' +
              '(seed ' + seed + ', phase ' + view.phase + ') — the leak is upstream of the ambience');
          }

          /* 2. THE CLAIM. */
          var a = JSON.stringify(recA);
          var b = JSON.stringify(recB);
          if (a !== b) {
            channelMismatches++;
            check(false, 'a presentation channel moved with the hidden roles (seed ' + seed +
              ', phase ' + view.phase + '):\n      ' + a + '\n      ' + b);
          }

          /*
           * 3. THE DETECTOR. Each injected tell is applied to BOTH records — it
           * is "the code", and the code is the same in both runs. What differs
           * is the roles it is allowed to see. A mutant that never produces a
           * difference anywhere in the sweep is a mutant this gate would not
           * have caught, and that is a failure of the gate rather than of the
           * mutant.
           */
          MUTANTS.forEach(function (m, mi) {
            var mb = JSON.parse(b);
            /* `mutatedA` was built above against the ORIGINAL roles; this half
             * runs against the permuted ones. Same code, two worlds. */
            m.apply(mb, G, viewB, L);
            if (mutatedA[mi] !== JSON.stringify(mb)) caught[mi]++;
          });

          undo();

          /* The undo has to be exact or every later step of this match is run
           * against a game nobody dealt. */
          var restored = View.viewFor(G, human, { waitingFor: session.waitingFor() });
          check(JSON.stringify(restored) === JSON.stringify(view),
            'the role permutation did not undo cleanly at seed ' + seed);
        }
      }

      prev = view;
      if (w) {
        own = w.gate ? w.kind + ':' + w.gate : w.kind;
        session.submit(answer(w));
      } else {
        own = null;
        if (!session.advanceBots()) break;
      }
    }
  }

  /* ------------------------------------------------------------ verdicts */

  check(viewMismatches === 0,
    viewMismatches + ' moments where the player-safe view itself moved with the hidden roles');
  check(channelMismatches === 0,
    channelMismatches + ' moments where a presentation channel moved with the hidden roles');
  check(outsideWhitelist.length === 0,
    'the composed channel pipeline read fields outside the whitelist: ' + outsideWhitelist.join(', '));

  /*
   * The sweep has to have had something to look at. A permutation count of zero
   * with every check green is the failure mode this project has seen before in
   * another shape — a suite that agrees with a bug because it never ran the
   * branch — so the exercise floors are asserted rather than reported.
   */
  check(permutations > 500, 'only ' + permutations + ' role permutations were possible; ' +
    'the sweep did not exercise enough of the match to mean anything');
  check(seizesSeen >= 2, 'the sweep never saw two Seizes enacted, so the weather never moved');
  check(lanternsOutSeen > 0, 'the sweep never saw a lantern go out');
  check(Object.keys(lightsSeen).length >= 6,
    'only ' + Object.keys(lightsSeen).length + ' lighting states occurred; the light sequence ' +
    'channel was barely swept');

  /* The mutation test, and it cuts both ways. */
  MUTANTS.forEach(function (m, mi) {
    if (m.control) {
      check(caught[mi] === 0,
        'the CONTROL mutant — which changes nothing — was "caught" ' + caught[mi] +
        ' times, so the sweep reports differences that are not there');
      return;
    }
    check(caught[mi] > 0,
      'the injected tell "' + m.name + '" (' + m.channel + ') was NEVER caught in ' +
      permutations + ' permutations — this gate would not have stopped it');
  });

  say('sweep         ' + steps + ' moments over ' + GAMES + ' complete matches, ' +
    permutations + ' hidden-role permutations');
  say('premise       ' + viewMismatches + ' of ' + permutations +
    ' permutations changed the player-safe view itself (the record the channels are given)');
  say('channels      ' + channelMismatches + ' of ' + permutations +
    ' permutations changed any of: lantern states, light sequence, bed selection, cues, ' +
    'sting timing, pace, flame');
  say('exercise      ' + Object.keys(lightsSeen).length + ' lighting states, up to ' +
    seizesSeen + ' Seizes on a board, ' + lanternsOutSeen + ' moments with a lantern out');
  say('reads         ' + audited + ' audits of the WHOLE composed pipeline through a recording ' +
    'Proxy, every read inside ' + ALLOWED.length + ' allowed public paths');
  MUTANTS.forEach(function (m, mi) {
    say('  ' + (m.control ? 'control ' : 'caught  ') +
      String(caught[mi]).padStart(6) + '  ' + m.name +
      (m.control ? '  (must be 0)' : '  [' + m.channel + ']'));
  });

  lines.forEach(function (l) { console.log(l); });
  if (failures.length) {
    console.error('\nFAIL — ' + failures.length + ' of ' + checks + ' checks');
    failures.forEach(function (f) { console.error('  · ' + f); });
    process.exit(1);
  }
  console.log('\nOK — ' + checks + ' checks passed');
}

main().catch(function (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
