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
 * …and, since the juice map, the four channels the STAGING adds. The previous
 * version of this file named the gap in its own last paragraph — "a future
 * animation, camera move or shader that took a role would need its own row" —
 * and the juice map is that future arriving, so the rows are here:
 *
 *   framing            the camera's push, its yaw and every offset in the
 *                      accusation's schedule, including which of them is last
 *   stagger            the ballot reveal: which seat lands when, in what order,
 *                      and what the running count reads as each one does
 *   silence            how long the square is quiet, and how hard the cut is
 *   curtain            the game-over reveal: who turns, in what order, who is
 *                      held last — and, far more importantly, that the plan is
 *                      EMPTY at every moment before the engine has disclosed
 *
 * The curtain call is the sharpest of the four and the reason it is worth a row
 * of its own: it is the one surface in the project that is ALLOWED to show a
 * role, so the thing to prove is not that it hides one but that it shows one
 * only when `view.reveal` is populated — i.e. at game over and never a moment
 * earlier. A curtain call that leaked one step early would be the largest tell
 * the game could have.
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
  },

  /* ---- the five the juice map's own channels needed ------------------- */

  {
    name: 'the camera pushes 20% further when the accuser is a Rebel',
    channel: 'framing',
    apply: function (rec, G, view) {
      if (isRebelSeat(G, view.speaker)) {
        rec.framing = Object.assign({}, rec.framing, { push: rec.framing.push * 1.2 });
      }
    }
  },
  {
    name: 'the ballots land Rebels first',
    channel: 'stagger',
    apply: function (rec, G) {
      if (!rec.ballots.steps.length) return;
      var sorted = rec.ballots.steps.slice().sort(function (a, b) {
        var ra = isRebelSeat(G, a.id) ? 0 : 1;
        var rb = isRebelSeat(G, b.id) ? 0 : 1;
        return ra - rb || a.seat - b.seat;
      });
      /* The TIMES stay where they were and only the order of the seats moves:
       * the subtle version of this tell, and the one a stagger measured in
       * milliseconds would sail straight past. */
      rec.ballots = Object.assign({}, rec.ballots, {
        steps: sorted.map(function (s, i) {
          return Object.assign({}, s, { at: rec.ballots.steps[i].at });
        })
      });
    }
  },
  {
    name: 'the purge silence runs 120 ms longer when a Loyalist is taken',
    channel: 'silence',
    apply: function (rec, G, view) {
      if (view.nominee != null && !isRebelSeat(G, view.nominee)) {
        rec.silence = Object.assign({}, rec.silence, { purgeMs: rec.silence.purgeMs + 120 });
      }
    }
  },
  {
    name: 'the reveal warms up early — one curtain step while the Dictator is Speaker',
    channel: 'curtain',
    apply: function (rec, G, view) {
      if (view.speaker === dictatorSeat(G)) {
        rec.curtain = Object.assign({}, rec.curtain, { of: rec.curtain.of + 1 });
      }
    }
  },
  {
    name: 'the tile takes 90 ms longer to reach the board while the Dictator holds the gavel',
    channel: 'framing',
    apply: function (rec, G, view) {
      if (view.speaker === dictatorSeat(G)) {
        rec.tile = Object.assign({}, rec.tile, { travelMs: rec.tile.travelMs + 90 });
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
  'nominee', 'reform', 'seize', 'lastEnacted', 'lastEnacted.tile',
  /*
   * The staging's own reads, and the whole of them. Every one is something the
   * square was told out loud or can see by looking:
   *
   *   players / .id / .seat / .alive   the roster and who is standing. There is
   *                                    no role in the projection's roster —
   *                                    src/engine/view.js maps id, seat, name,
   *                                    alive and isYou, and nothing else.
   *   limits.*                         the board's size, printed on the tray
   *   reveal / .id / .role             NULL until game over, and the engine's
   *                                    own disclosure at it. This is the one
   *                                    entry on this list that is role-shaped,
   *                                    and the curtain mutant below exists to
   *                                    prove it cannot be read a moment early.
   */
  'players', 'players.length', 'players.id', 'players.seat', 'players.alive',
  'limits', 'limits.reformToWin', 'limits.seizeToWin',
  'reveal', 'reveal.length', 'reveal.id', 'reveal.role', 'reveal.team', 'reveal.alive'
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
  var S = await import('../src/play/stage.js');

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
      },

      /* ---- the staging, four channels ------------------------------- */

      /*
       * FRAMING. The accusation's whole schedule at a fixed trigger time, so
       * every offset in it — and which one is LAST — is compared. `reduced` is
       * taken both ways, because a moment that behaved differently for a player
       * who asked for less motion would be a second channel to leak through.
       */
      framing: {
        push: S.ACCUSE.push,
        yaw: S.ACCUSE.yaw,
        lastMs: S.ACCUSE_LAST_MS,
        full: S.accusationPlan(0, false),
        reduced: S.accusationPlan(0, true),
        lantern: { lift: S.ACCUSE.lanternLift, pull: S.ACCUSE.lanternPull, rim: S.ACCUSE.rimColor }
      },
      /* STAGGER. Which seat's ballot lands when, and the count as it climbs. */
      ballots: S.ballotPlanFor(view),
      /* SILENCE. How long the square is quiet, and how hard each cut is. */
      silence: {
        purgeMs: A.HUSH.purge.ms, purgeHard: A.HUSH.purge.hard, purgeTo: A.HUSH.purge.to,
        accuseMs: A.HUSH.accusation.ms, accuseTo: A.HUSH.accusation.to,
        gavelAt: S.PURGE.gavelAt, narrowMs: S.PURGE.narrowMs, angle: S.PURGE.angle
      },
      /*
       * CURTAIN. Empty at every moment except game over — which is the whole
       * assertion, and it is why `of` is in the record rather than only the
       * steps: a plan that gained a single step early would move this number.
       */
      curtain: S.curtainFor(view),
      /*
       * And the tile's travel, which is a framing decision with a clock in it.
       * The constants are in the record whether or not a tile is landing this
       * moment, deliberately: a mutant that could only fire on the handful of
       * steps where a sting happens to coincide with a particular seat holding
       * the gavel is a mutant that might go a whole sweep without being caught,
       * and "never caught" is indistinguishable from "cannot be caught".
       */
      tile: {
        travelMs: S.TILE.travelMs,
        settleMs: S.TILE.settleMs,
        plan: sting ? S.tilePlanFor(view, sting) : null
      },
      /* Who the beam would find. Two player-safe views compared, exactly as the
       * public edges are: a seat that was standing and is not. */
      purge: S.purgeFor(prev, view)
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
  /* The staging's own exercise floors, for the same reason the ambience's exist:
   * a channel that was never produced is a channel this sweep did not test, and
   * a green light with nothing behind it is the failure mode this file was
   * written against. */
  var ballotRevealsSeen = 0;
  var ballotsLandedSeen = 0;
  var purgesSeen = 0;
  var curtainsSeen = 0;
  var curtainLeaks = 0;
  var tilePlansSeen = 0;

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

      if (recA.ballots.total) { ballotRevealsSeen++; ballotsLandedSeen += recA.ballots.total; }
      if (recA.purge != null) purgesSeen++;
      if (recA.tile.plan) tilePlansSeen++;
      if (recA.curtain.of) {
        curtainsSeen++;
        /*
         * THE STRUCTURAL ASSERTION, and it is the one this row exists for. The
         * curtain call is the only surface in the project allowed to show a
         * role, so what has to be proved is not that it hides one — it does not
         * — but that it is EMPTY at every moment before the engine has
         * disclosed. Checked here, against the phase, on every single step of
         * every match rather than only under permutation: a permutation compares
         * two runs and would happily agree that both leaked.
         */
        if (view.phase !== 'game_over') {
          curtainLeaks++;
          check(false, 'the curtain call had ' + recA.curtain.of + ' steps in phase ' +
            view.phase + ' — role identity staged before the engine disclosed it');
        }
      }

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

    /*
     * ONE MORE PROJECTION, AFTER THE MATCH.
     *
     * The loop above exits the instant `session.over` turns true, so it never
     * projects a game-over view — which meant the curtain channel was swept
     * 1,769 times and produced a plan zero times. A row that is only ever
     * checked in its empty state proves that the empty state is empty and
     * nothing else. Found by the exercise floor, not by reading the loop.
     *
     * There is no permutation here on purpose: at game over the engine has
     * disclosed every role, so a "hidden" role is a contradiction and permuting
     * would be testing that the game hides something it is required to show.
     * What is checked is the SHAPE — that the plan names everybody exactly once,
     * that the Dictator is last, and that the order is otherwise seat order.
     */
    var finalView = View.viewFor(G, human, { waitingFor: null });
    var finalCurtain = S.curtainFor(finalView);
    if (finalCurtain.of) {
      curtainsSeen++;
      var seats = finalCurtain.steps.map(function (s) { return s.id; });
      check(seats.length === finalView.players.length,
        'the curtain call named ' + seats.length + ' of ' + finalView.players.length + ' citizens');
      check(new Set(seats).size === seats.length, 'a citizen took two bows');
      var dictators = finalCurtain.steps.filter(function (s) { return s.role === 'dictator'; });
      check(dictators.length !== 1 || finalCurtain.steps[finalCurtain.steps.length - 1].role === 'dictator',
        'the Dictator did not turn last at seed ' + seed);
      var rest = finalCurtain.steps.filter(function (s) { return s.role !== 'dictator'; })
        .map(function (s) { return s.id; });
      var sorted = rest.slice().sort(function (a, b) { return a - b; });
      check(JSON.stringify(rest) === JSON.stringify(sorted),
        'everybody but the Dictator must turn in seat order, and did not at seed ' + seed);
      check(finalCurtain.lastAt === (finalCurtain.of - 1) * S.CURTAIN.step,
        'the curtain call\'s last bow is not ' + S.CURTAIN.step + ' ms per figure');
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

  /* …and the same floors for the four staging channels. */
  check(ballotRevealsSeen > 20, 'only ' + ballotRevealsSeen +
    ' moments had a tally to reveal; the stagger channel was barely swept');
  check(ballotsLandedSeen > 100, 'only ' + ballotsLandedSeen +
    ' ballots were ever planned; the stagger channel was barely swept');
  check(purgesSeen > 0, 'the sweep never saw a purge, so the silence channel never fired');
  check(tilePlansSeen > 0, 'the sweep never planned a tile onto the board');
  check(curtainsSeen > 0, 'the sweep never reached a curtain call, so the one surface ' +
    'allowed to show a role was never produced at all');
  check(curtainLeaks === 0, curtainLeaks +
    ' moments staged a curtain call before game over');

  /*
   * The accusation's own cap, asserted where the channel is rather than only in
   * test/stage.test.js: the brief's number is 700 ms and it is a promise about
   * what the player sees, so it belongs beside the record that carries it.
   */
  check(S.ACCUSE_LAST_MS <= 700, 'the accusation\'s last beat lands at ' + S.ACCUSE_LAST_MS +
    ' ms, past the 700 ms the brief caps it at');

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
    'sting timing, pace, flame, framing, stagger, silence, curtain');
  say('exercise      ' + Object.keys(lightsSeen).length + ' lighting states, up to ' +
    seizesSeen + ' Seizes on a board, ' + lanternsOutSeen + ' moments with a lantern out');
  say('staging       ' + ballotRevealsSeen + ' ballot reveals (' + ballotsLandedSeen +
    ' ballots planned, ' + 'stagger ' + S.BALLOT.stagger + ' ms), ' + purgesSeen + ' purges (' +
    A.HUSH.purge.ms + ' ms of hard silence each), ' + tilePlansSeen + ' tiles onto the board, ' +
    curtainsSeen + ' curtain calls — and ' + curtainLeaks + ' staged before game over');
  say('accusation    last beat at ' + S.ACCUSE_LAST_MS + ' ms of a 700 ms cap; reduced motion ' +
    'lands at ' + (S.accusationPlan(0, true).lastAt) + ' ms and can only be earlier');
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
