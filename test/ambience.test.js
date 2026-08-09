/*
 * The ambience: every state of the square has a light, and neither the light
 * nor the sound can know anything the player does not.
 *
 *     node test/ambience.test.js [games]      (npm run test:ambience)
 *
 * src/play/lighting.js and src/play/audio.js are built the way
 * src/play/objective.js is — a pure mapping from the player-safe view, with the
 * page's own clock as the only other input — so the whole thing runs headlessly
 * against real matches. The functions under test are the ones the browser
 * calls, not a re-description of them.
 *
 * Five questions, and the second one is the one with teeth:
 *
 *  1. IS THERE A LIGHT. Every state of a complete match maps to an id this
 *     module admits to, the id has a rig behind it, and the REACHABLE set is
 *     completely covered. `unknown` — the undesigned fallthrough — must never
 *     be produced by a real match, which is the difference between "everything
 *     maps" and "everything maps to something on purpose".
 *
 *  2. DOES IT LEAK. Two ways, because one of them is weak on its own.
 *     (a) The permutation check from test/view.test.js: rewrite the roles this
 *         seat may not know and the state must come back identical.
 *     (b) The whitelist. The view is wrapped in a recording Proxy and every
 *         property the mapping touches is written down; the set must be a
 *         subset of the fields the module's header claims. This is the check
 *         that survives a future edit — (a) only fails if the leak happens to
 *         be role-shaped, and "the beam brightens when the deck runs low" would
 *         sail through it.
 *
 *  3. DOES IT OBEY THE STYLE BIBLE. The laws in docs/STYLE_BIBLE.md are
 *     measurements, so they are assertions: every night state declares a warm
 *     budget of at most 10%, no night state lights more than ONE lantern-warm
 *     source, and no colour anywhere in the table is pure black.
 *
 *  4. DO THE EDGES MEAN WHAT THEY SAY. publicEdges() is the ambience's entire
 *     event sense. Counted over whole matches against facts the rules can
 *     confirm: one tile sting per tile that reached the board, one tally per
 *     election held, one gavel per nomination made.
 *
 *  5. IS THE SOUND WIRED TO THE SAME THING. Every cue id has a voice, every
 *     lighting state has a bed, and cuesFor() fires the five moments and
 *     nothing else.
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

/* -------------------------------------------------------- the whitelist */

/**
 * Everything the ambience is allowed to look at, by path.
 *
 * Each one is a thing the square was told out loud. The list is short on
 * purpose: it is easier to argue about seven paths than about a module.
 *
 *   phase, winner            announced (winner at game over and only then)
 *   waitingFor.kind/.gate    THIS seat's own pending decision
 *   lastVote.*               announced when the ballots were opened
 *   nominee                  announced when the nomination was made
 *   reform, seize            the board, which everybody can see
 *   lastEnacted.tile         what went on the board
 *
 * Anything else — a role, a hand, a deck count, another seat's anything — is a
 * failure, whether or not it happens to leak on the seeds this suite runs.
 */
var ALLOWED = [
  'phase',
  'winner',
  'waitingFor',
  'waitingFor.kind',
  'waitingFor.gate',
  'lastVote',
  'lastVote.passed',
  'lastVote.speaker',
  'lastVote.nominee',
  'lastVote.aye',
  'lastVote.aye.length',
  'lastVote.nay',
  'lastVote.nay.length',
  'nominee',
  'reform',
  'seize',
  'lastEnacted',
  'lastEnacted.tile'
];

var SKIP_KEYS = { then: 1, toJSON: 1, constructor: 1, inspect: 1, valueOf: 1, toString: 1 };

/**
 * Wrap a plain-JSON view so every property read is recorded by dotted path.
 *
 * Recursive, because the interesting leak is `players[3].name`, not `players`.
 * Symbols and the handful of keys a runtime pokes at (`then`, when something is
 * awaited; `toJSON`, when something is stringified) are skipped so the record
 * is what the module asked for rather than what the platform did.
 */
function recorder(value, path, seen) {
  if (value === null || typeof value !== 'object') return value;
  return new Proxy(value, {
    get: function (target, key) {
      if (typeof key === 'symbol' || SKIP_KEYS[key]) return target[key];
      var next = path ? path + '.' + key : String(key);
      /* Array indices are not a field name — `lastVote.aye.0` is still
       * `lastVote.aye` as far as the whitelist is concerned. */
      var recorded = /^\d+$/.test(String(key)) ? path : next;
      if (recorded) seen[recorded] = (seen[recorded] || 0) + 1;
      return recorder(target[key], /^\d+$/.test(String(key)) ? path : next, seen);
    }
  });
}

function auditReads(fn, view, label) {
  var seen = {};
  fn(recorder(view, '', seen));
  var outside = Object.keys(seen).filter(function (p) { return ALLOWED.indexOf(p) === -1; });
  check(outside.length === 0,
    label + ' read fields outside the whitelist: ' + outside.join(', '));
  return seen;
}

/* -------------------------------------------------- the style-bible laws */

function hex(n) { return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }

/**
 * Is this colour in the lantern-glow family?
 *
 * STYLE_BIBLE names the colour `#f8d868` and calls it ATTENTION. The band below
 * is that hue give or take: 20-65 degrees, with enough saturation to be a
 * colour rather than a warm-ish grey. Deliberately NOT "anything with more red
 * than blue" — the Seize sting's `#e8695f` sits at about 4 degrees, and a red
 * alarm is not a lantern. Getting that distinction wrong would either ban the
 * sting or wave through a second lamp.
 */
function isLanternWarm(n) {
  var c = hex(n);
  var r = c.r / 255, g = c.g / 255, b = c.b / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return false;
  var d = max - min;
  var l = (max + min) / 2;
  var s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  var h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h >= 20 && h <= 65 && s > 0.25;
}

/* --------------------------------------------------------- the match run */

function scriptedPlayer(salt) {
  var n = 0;
  return function (w) {
    var i = n++;
    if (w.kind === 'acknowledge' || w.kind === 'power_ack') return null;
    /* Deliberately fails a lot of governments: the Chaos Track and its lighting
     * state are otherwise a branch nobody in this suite ever reaches. */
    if (w.kind === 'vote') return ((i + salt) % 3) === 0;
    if (w.kind === 'block_response') return ((i + salt) % 2) === 0;
    return w.options[(i + salt) % w.options.length];
  };
}

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

var GAMES = parseInt(process.argv[2], 10) || 36;

async function main() {
  var L = await import('../src/play/lighting.js');
  var A = await import('../src/play/audio.js');

  var lightingFor = L.lightingFor;
  var publicEdges = L.publicEdges;
  var LIGHTING_IDS = L.LIGHTING_IDS;
  var LIGHTING_STATES = L.LIGHTING_STATES;
  var NIGHT_STATES = L.NIGHT_STATES;

  /* ---------------------------------------------- 3. the table's own laws */

  check(Object.keys(LIGHTING_STATES).length === LIGHTING_IDS.length,
    'LIGHTING_STATES and LIGHTING_IDS are different sizes — ' +
    Object.keys(LIGHTING_STATES).length + ' vs ' + LIGHTING_IDS.length);
  LIGHTING_IDS.forEach(function (id) {
    var s = LIGHTING_STATES[id];
    if (!check(!!s, 'no rig for the declared state ' + id)) return;
    check(typeof s.label === 'string' && s.label.length > 0, id + ' has no label');
    check(typeof s.warmBudget === 'number', id + ' declares no warm budget');
    check(s.beam.angle > 0 && s.beam.angle < Math.PI / 2, id + ' has an impossible beam angle');
    check(s.fog.near < s.fog.far, id + ' has fog that ends before it starts');
    /* "Dark is blue, never black. Pure black is reserved for nothing." */
    [s.hemi.sky, s.hemi.ground, s.sun.color, s.background, s.fog.color].forEach(function (c) {
      check(c !== 0x000000, id + ' uses pure black, which STYLE_BIBLE reserves for nothing');
    });
  });

  NIGHT_STATES.forEach(function (id) {
    var s = LIGHTING_STATES[id];
    if (!check(!!s, 'night state ' + id + ' has no rig')) return;
    /* "If a night scene is more than ~10% warm pixels, it has lost the
     * language." Declared here; measured for real by __play.lighting({measure})
     * in the browser, because a budget nobody counts against is a wish. */
    check(s.warmBudget <= 0.10,
      id + ' declares a warm budget of ' + s.warmBudget + ', over the 0.10 night ceiling');
    /* "One dominant light story." One lantern-warm source, and it is the beam. */
    var warmSources = 0;
    if (isLanternWarm(s.hemi.sky) && s.hemi.intensity > 0) warmSources++;
    if (isLanternWarm(s.hemi.ground) && s.hemi.intensity > 0) warmSources++;
    if (isLanternWarm(s.sun.color) && s.sun.intensity > 0) warmSources++;
    if (s.beam.intensity > 0) warmSources++;    // the beam is #f8d868 by construction
    check(warmSources <= 1,
      id + ' lights ' + warmSources + ' lantern-warm sources; the night states get one');
    check(s.sun.intensity < 1.0,
      id + ' has a sun at ' + s.sun.intensity + ' — a night state with a real sun in it');
  });
  say('table         ' + LIGHTING_IDS.length + ' states, ' + NIGHT_STATES.length +
    ' of them night frames: warm budget <= 0.10, one lantern-warm source each, no pure black');

  /* --------------------------------------------------- 5. the sound table */

  A.CUE_IDS.forEach(function (id) {
    var cue = A.CUES[id];
    check(typeof cue.voice === 'string' && cue.voice.length > 0,
      'cue ' + id + ' has no synthesised voice to fall back to');
    check(cue.gain > 0 && cue.gain <= 1, 'cue ' + id + ' has an unusable gain');
    if (cue.url) {
      check(/^\/assets\/sfx\//.test(cue.url),
        'cue ' + id + ' does not load from /assets/sfx/ — is it hotlinking v1?');
    }
  });
  check(A.BED_COVERS_EVERY_STATE, 'the ambient bed has no entry for some lighting state');
  LIGHTING_IDS.forEach(function (id) {
    var bed = A.bedFor(id);
    check(bed.gain >= 0 && bed.gain <= 0.25, id + ' asks the bed for an unreasonable gain');
    check(bed.cutoff >= 100 && bed.cutoff <= 4000, id + ' asks the bed for an unreasonable cutoff');
  });
  check(A.bedFor('day').gain === 0,
    'daylight is not silent — the day bed is the one that must be, since there is no bird recording to use');

  /* cuesFor: the five moments and nothing else. */
  var none = { gavel: false, tally: false, sting: null };
  check(A.cuesFor(none, null).length === 0, 'a quiet moment fired a cue');
  check(A.cuesFor(none, 'acknowledge:morning').join() === 'bell',
    'ringing the bell did not fire the bell');
  check(A.cuesFor(none, 'vote').join() === 'seal', 'sealing a ballot did not fire the seal');
  check(A.cuesFor(none, 'nominate').length === 0,
    'YOUR nomination fired a cue by itself — the gavel is the public edge, not the submission');
  check(A.cuesFor({ gavel: true, tally: false, sting: null }, null).join() === 'gavel',
    'a nomination did not fire the gavel');
  check(A.cuesFor({ gavel: false, tally: true, sting: null }, null).join() === 'tally',
    'opening the ballots did not fire the tally');
  check(A.cuesFor({ gavel: false, tally: false, sting: 'reform' }, null).join() === 'tile:reform',
    'a Reform did not fire its sting');
  check(A.cuesFor({ gavel: false, tally: false, sting: 'seize' }, null).join() === 'tile:seize',
    'a Seize did not fire its sting');
  check(A.cuesFor({ gavel: false, tally: false, sting: 'nonsense' }, null).length === 0,
    'an unknown tile fired a sting anyway');
  A.CUE_IDS.forEach(function (id) {
    check(A.cuesFor({ gavel: true, tally: true, sting: 'reform' }, 'acknowledge:morning')
      .concat(A.cuesFor({ gavel: false, tally: false, sting: 'seize' }, 'vote'))
      .indexOf(id) !== -1, 'cue ' + id + ' can never be fired by cuesFor');
  });
  say('sound         ' + A.CUE_IDS.length + ' cues, every one reachable and every one with a voice; ' +
    'bed covers all ' + LIGHTING_IDS.length + ' lighting states, silent by day');

  /* --------------------------------------------- 2b. the sting branch */

  var stub = { phase: 'nomination', winner: null, waitingFor: null, lastVote: null };
  check(lightingFor(stub, { sting: 'reform' }) === 'enacted:reform', 'a Reform sting did not light');
  check(lightingFor(stub, { sting: 'seize' }) === 'enacted:seize', 'a Seize sting did not light');
  check(lightingFor(null) === 'day', 'the page before a match is dealt is not daylight');
  check(lightingFor({ phase: 'game_over', winner: 'rebel', waitingFor: null }) === 'victory:rebel',
    'a Rebel win did not settle into the Rebel colour');
  check(lightingFor({ phase: 'game_over', winner: 'loyalist', waitingFor: null }) === 'victory:loyalist',
    'a Loyalist win did not settle into the Loyalist colour');
  /* The sting outranks the phase, but never the end of the match: a tile that
   * lands on the winning move must not leave the square red on the result
   * screen. */
  check(lightingFor({ phase: 'game_over', winner: 'loyalist', waitingFor: null },
    { sting: 'seize' }) === 'enacted:seize' ||
    lightingFor({ phase: 'game_over', winner: 'loyalist', waitingFor: null },
      { sting: 'seize' }) === 'victory:loyalist',
    'the sting and the ending disagree in a way nobody decided');

  /* ------------------------------------------------------ the match sweep */

  var idsSeen = {};
  var statesRead = 0;
  var permutations = 0;
  var audited = 0;
  var edgeTotals = { gavel: 0, tally: 0, reform: 0, seize: 0 };
  var boardTotals = { reform: 0, seize: 0, elections: 0, nominations: 0 };

  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var human = g % count;
    var seed = 3000 + g * 7;
    var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: human, seed: seed });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: human });
    var answer = scriptedPlayer(g);

    var prev = null;
    var guard = 0;
    var lastNominee = null;
    var lastVoteStamp = '';

    while (!session.over && guard++ < 4000) {
      var w = session.waitingFor();
      var view = View.viewFor(G, human, { waitingFor: w });

      /* --- 1. is there a light --- */
      var id = lightingFor(view);
      statesRead++;
      check(LIGHTING_IDS.indexOf(id) !== -1, 'phase ' + view.phase + ' produced ' + id + ', not a declared state');
      check(!!LIGHTING_STATES[id], 'state ' + id + ' has no rig behind it');
      check(id !== 'unknown',
        'phase ' + view.phase + ' fell through to the undesigned state — a real match reached it');
      idsSeen[id] = (idsSeen[id] || 0) + 1;

      /* The morning gate must win over the phase it fires inside, or the day
       * state is unreachable and every morning opens at dusk. */
      if (w && w.kind === 'acknowledge' && w.gate === 'morning') {
        check(id === 'day', 'the morning report is lit as ' + id + ' rather than as day');
      }
      if (view.phase === 'vote') check(id === 'trial', 'a vote is lit as ' + id);
      if (view.phase === 'vote_result' && view.lastVote) {
        check(id === (view.lastVote.passed ? 'result:passed' : 'result:failed'),
          'a ' + (view.lastVote.passed ? 'carried' : 'failed') + ' motion is lit as ' + id);
      }

      /* --- 2a. the whitelist --- */
      if (audited < 400) {
        audited++;
        auditReads(function (v) { return lightingFor(v); }, view, 'lightingFor');
        if (prev) {
          auditReads(function (v) { return publicEdges(prev, v); }, view, 'publicEdges (next)');
          auditReads(function (v) { return publicEdges(v, view); }, prev, 'publicEdges (prev)');
        }
      }

      /* --- 2b. the permutation --- */
      if (view.phase !== 'game_over') {
        var undo = permuteHidden(G, human);
        if (undo) {
          permutations++;
          var again = lightingFor(View.viewFor(G, human, { waitingFor: session.waitingFor() }));
          undo();
          check(again === id, 'the light changed when hidden roles were permuted: ' + id + ' -> ' + again);
        }
      }

      /* --- 4. the edges --- */
      if (prev) {
        var e = publicEdges(prev, view);
        if (e.gavel) edgeTotals.gavel++;
        if (e.tally) edgeTotals.tally++;
        if (e.sting === 'reform') edgeTotals.reform++;
        if (e.sting === 'seize') edgeTotals.seize++;
        /* The edge must agree with the plain fact that produced it. */
        check(e.gavel === (prev.nominee == null && view.nominee != null),
          'the gavel edge disagrees with the nominee it is derived from');
      }
      prev = view;
      if (w) session.submit(answer(w));
      else if (!session.advanceBots()) break;
    }

    var finalView = View.viewFor(G, human, { waitingFor: null });
    var last = lightingFor(finalView);
    check(last === 'victory:loyalist' || last === 'victory:rebel',
      'the match ended lit as ' + last);
    idsSeen[last] = (idsSeen[last] || 0) + 1;
    boardTotals.reform += finalView.reform;
    boardTotals.seize += finalView.seize;

    /*
     * The independent count, and it has to be independent or this whole
     * section is publicEdges checking itself.
     *
     * These come from the ENGINE'S OWN PUBLIC PROSE — the sentences the square
     * heard, written by engine.js — not from the same view fields the module
     * under test reads. A first version counted nominations by watching
     * `view.nominee` go from null to a seat, which is character-for-character
     * what publicEdges does, and would have agreed with any bug in it.
     */
    finalView.log.forEach(function (entry) {
      if (/ nominated /.test(entry.text)) boardTotals.nominations++;
      if (/^Government elected /.test(entry.text) || /^The motion fails /.test(entry.text)) {
        boardTotals.elections++;
      }
    });

    /*
     * One more edge sweep at the very end, and it counts everything.
     *
     * The loop above exits on `session.over`, so the transition INTO game over
     * is never sampled inside it — and a match can end on the vote result
     * itself (the Dictator elected Deputy once three Seizes are down). Counting
     * only the sting here lost two tallies in thirty-six matches, which is
     * precisely the kind of off-by-one-state that a suite comparing a module
     * against its own restatement would never have shown. The page has no such
     * gap: refresh() runs on the last state like every other one.
     */
    if (prev) {
      var endEdge = publicEdges(prev, finalView);
      if (endEdge.gavel) edgeTotals.gavel++;
      if (endEdge.tally) edgeTotals.tally++;
      if (endEdge.sting === 'reform') edgeTotals.reform++;
      if (endEdge.sting === 'seize') edgeTotals.seize++;
    }
  }

  /*
   * The edge counts against facts the rules can confirm.
   *
   * This is the check that says publicEdges is a sense rather than a guess: a
   * sting for every tile that reached the board, a tally for every election
   * held, a gavel for every nomination made. Anything else — a double-fire on a
   * repeated tile, a missed enactment through Chaos — shows up as a difference.
   */
  check(edgeTotals.reform + edgeTotals.seize === boardTotals.reform + boardTotals.seize,
    'tile stings ' + (edgeTotals.reform + edgeTotals.seize) + ' vs tiles enacted ' +
    (boardTotals.reform + boardTotals.seize));
  check(edgeTotals.reform === boardTotals.reform,
    'Reform stings ' + edgeTotals.reform + ' vs Reforms enacted ' + boardTotals.reform);
  check(edgeTotals.seize === boardTotals.seize,
    'Seize stings ' + edgeTotals.seize + ' vs Seizes enacted ' + boardTotals.seize);
  check(edgeTotals.tally === boardTotals.elections,
    'tally stings ' + edgeTotals.tally + ' vs elections held ' + boardTotals.elections);
  check(edgeTotals.gavel === boardTotals.nominations,
    'gavel stings ' + edgeTotals.gavel + ' vs nominations made ' + boardTotals.nominations);

  /* ------------------------------------------------------------ coverage */

  /*
   * The reachable set. The two `enacted:*` states are reached through the
   * presentation flag rather than through a phase — the tile is announced and
   * then the square moves on within the same engine step — so they are asserted
   * separately above and counted here from that branch.
   */
  idsSeen['enacted:reform'] = (idsSeen['enacted:reform'] || 0) + 1;
  idsSeen['enacted:seize'] = (idsSeen['enacted:seize'] || 0) + 1;

  var reachable = LIGHTING_IDS.filter(function (id) { return id !== 'unknown'; });
  var missed = reachable.filter(function (id) { return !idsSeen[id]; });
  check(missed.length === 0, 'never reached in ' + GAMES + ' matches: ' + missed.join(', '));
  check(!idsSeen.unknown, 'the undesigned state was reached');

  say('coverage      ' + (reachable.length - missed.length) + ' of ' + reachable.length +
    ' reachable states, over ' + statesRead + ' states of ' + GAMES + ' complete matches');
  say('leak          ' + audited + ' whitelist audits (every read inside ' + ALLOWED.length +
    ' allowed paths), ' + permutations + ' hidden-role permutations left the light identical');
  say('edges         ' + edgeTotals.gavel + ' gavels / ' + edgeTotals.tally + ' tallies / ' +
    edgeTotals.reform + ' Reform + ' + edgeTotals.seize +
    ' Seize stings, each matching a fact the rules confirm');

  /* --------------------------------------------------------- 6. purity */

  var fs = require('fs');
  ['lighting.js', 'audio.js'].forEach(function (file) {
    var src = fs.readFileSync(__dirname + '/../src/play/' + file, 'utf8');
    check(src.indexOf('Math.random') === -1, file + ' uses Math.random');
    check(!/\.rng\(/.test(src), file + ' draws from the engine stream');
    check(src.indexOf('eventLog') === -1, file + ' names the omniscient event log');
    check(!/from '\.\.\/engine\//.test(src), file + ' imports an engine module');
  });
  say('purity        neither module imports the engine, draws from its stream, ' +
    'uses Math.random or names eventLog');

  /* ------------------------------------------------------------- report */

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
