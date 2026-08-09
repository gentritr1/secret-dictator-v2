/*
 * The persistent objective line: every state gets a correct one, and none of
 * them says anything the seat is not entitled to hear.
 *
 *     node test/objective.test.js [games]      (npm run test:objective)
 *
 * src/play/objective.js takes the player-safe view and nothing else, so the
 * whole thing runs headlessly against real matches — the same function the
 * browser calls, not a re-description of it.
 *
 * Four questions, and the last two are the ones with teeth:
 *
 *  1. IS THERE ONE. Every state of a complete match, for a rotated human seat,
 *     produces a non-empty line whose id is one this module admits to.
 *
 *  2. IS IT THE RIGHT KIND. The id must be derived from the pending decision —
 *     `nominate` cannot produce the vote line — and the REACHABLE set must be
 *     completely covered, so "every kind maps" is measured rather than hoped.
 *
 *  3. DOES IT SEND YOU TO THE RIGHT OBJECT. The line names the bell or the
 *     podium, and which one must agree with the routing rule the interaction
 *     system actually uses (src/play/main.js: the bell takes `acknowledge`, the
 *     podium takes everything else). A line that sends a player to the wrong
 *     side of the square is worse than no line: they walk, and then they are
 *     stuck with no prompt and no explanation.
 *
 *  4. DOES IT LEAK. The leak-sweep idiom from test/view.test.js, pointed at the
 *     string: no role or team token, no tile token, and no player NAME that is
 *     not publicly involved in the current beat. Plus the permutation check —
 *     rewrite the roles this seat may not know and the line must come back
 *     byte-identical.
 */

'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Human = require('../src/engine/human-driver.js');
var View = require('../src/engine/view.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];

/* Tokens that must never appear in a line, matched case-insensitively on word
 * boundaries. `reform` and `seize` are here for the same reason view.test.js
 * checks tile values: a permanently visible line is not where a private hand
 * belongs, and the safest rule is that the objective never says a tile at all. */
var FORBIDDEN = ['loyalist', 'rebel', 'dictator', 'reform', 'seize'];

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

/* ------------------------------------------------------------- the rules */

/** Which object a decision opens at — main.js's routing, restated here. */
function expectedObject(w) {
  return w.kind === 'acknowledge' ? 'bell' : 'podium';
}

/**
 * The seats whose names may appear in the line right now.
 *
 * Everything in this set is announced to the square: who holds the gavel, who
 * was nominated, who is Deputy, who was handed a power. Any other name in the
 * line means the objective is naming somebody for a reason the square has not
 * been told, which is exactly the shape a leak takes.
 */
function publicSeats(view) {
  var ok = {};
  [view.you.id, view.speaker, view.nominee, view.deputy].forEach(function (id) {
    if (id != null) ok[id] = 1;
  });
  if (view.power && view.power.holder != null) ok[view.power.holder] = 1;
  var w = view.waitingFor;
  if (w && w.detail) {
    ['speaker', 'nominee', 'deputy'].forEach(function (k) {
      if (w.detail[k] != null) ok[w.detail[k]] = 1;
    });
  }
  return ok;
}

var idsSeen = {};
var linesSeen = 0;
var permutationsRun = 0;

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

/** Audit one objective line against the state that produced it. */
function audit(objectiveFor, OBJECTIVE_IDS, G, session, where) {
  var w = session.waitingFor();
  var view = View.viewFor(G, session.humanId, { waitingFor: w });
  var got = objectiveFor(view);
  linesSeen++;

  var tag = where + ' [' + (got && got.id) + ']';

  if (!check(!!got && typeof got.text === 'string' && got.text.trim().length > 0,
    tag + ': no objective text')) return;
  check(OBJECTIVE_IDS.indexOf(got.id) !== -1, tag + ': id is not one this module admits to');
  idsSeen[got.id] = (idsSeen[got.id] || 0) + 1;

  /* --- 2. the right kind, and the right object --- */
  if (w) {
    check(got.id === 'unknown' || got.id.split(':')[0] === w.kind,
      tag + ': pending ' + w.kind + ' produced the ' + got.id + ' line');
    if (w.gate && w.kind === 'acknowledge') {
      check(got.id === 'acknowledge:' + w.gate,
        tag + ': gate ' + w.gate + ' produced ' + got.id);
    }
    if (w.kind === 'power_target') {
      check(got.id === 'power_target:' + w.detail.power,
        tag + ': power ' + w.detail.power + ' produced ' + got.id);
    }
    check(got.at === expectedObject(w),
      tag + ': sends the player to the ' + got.at + ', but ' + w.kind +
      ' opens at the ' + expectedObject(w));
    check(got.text.indexOf(expectedObject(w)) !== -1,
      tag + ': does not name the ' + expectedObject(w) + ' — "' + got.text + '"');
    check(got.act === true, tag + ': a pending decision was not marked as yours to act on');
  } else {
    check(got.at === null && got.act === false,
      tag + ': nothing is pending but the line asks the player to act');
    if (view.phase === 'game_over') {
      check(got.id === 'game_over', tag + ': the match is over and the line does not say so');
    } else if (!view.you.alive) {
      check(got.id === 'dead', tag + ': a purged seat did not get the purged line');
    } else {
      check(got.id.indexOf('bots:') === 0,
        tag + ': nobody owes anything and the line is not a waiting line');
      check(/^Waiting: /.test(got.text),
        tag + ': a waiting line does not read as one — "' + got.text + '"');
    }
  }

  /* --- 4a. the sweep --- */
  for (var i = 0; i < FORBIDDEN.length; i++) {
    var re = new RegExp('\\b' + FORBIDDEN[i] + '\\b', 'i');
    check(!re.test(got.text),
      tag + ': the line says "' + FORBIDDEN[i] + '" — "' + got.text + '"');
  }
  var allowed = publicSeats(view);
  view.players.forEach(function (p) {
    if (allowed[p.id]) return;
    check(!new RegExp('\\b' + p.name + '\\b').test(got.text),
      tag + ': names ' + p.name + ' (seat ' + p.id + '), who is not publicly involved — "' +
      got.text + '"');
  });

  /* --- 4b. the permutation --- */
  if (view.phase !== 'game_over') {
    var undo = permuteHidden(G, session.humanId);
    if (undo) {
      permutationsRun++;
      var again = objectiveFor(View.viewFor(G, session.humanId, { waitingFor: session.waitingFor() }));
      undo();
      check(again.text === got.text && again.id === got.id,
        tag + ': the line changed when hidden roles were permuted');
    }
  }
}

/*
 * The five-element stub document, lifted from test/view.test.js so the real
 * panels.js render path runs in node. It is deliberately dumb: anything
 * panels.js needs that a stub cannot provide (setAttribute, activeElement,
 * addEventListener) is optional-chained in that file, and this is what keeps
 * it that way.
 */
function stubDocument() {
  var made = {};
  function el() {
    return {
      innerHTML: '', textContent: '', scrollTop: 0, scrollHeight: 0,
      classList: { add: function () {}, remove: function () {}, toggle: function () {} },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      addEventListener: function () {}
    };
  }
  return {
    made: made,
    getElementById: function (id) {
      if (!made[id]) made[id] = el();
      return made[id];
    }
  };
}

/** The Emergency Vote position, captured for the panel render check below. */
var emergency = null;

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

/* ------------------------------------------------------------------- run */

var GAMES = parseInt(process.argv[2], 10) || 36;

async function main() {
  var mod = await import('../src/play/objective.js');
  var objectiveFor = mod.objectiveFor;
  var OBJECTIVE_IDS = mod.OBJECTIVE_IDS;

  /* The routing rule this file asserts against is the module's own export, so
   * a future change to it fails here rather than drifting silently. */
  check(mod.objectFor('acknowledge') === 'bell' && mod.objectFor('nominate') === 'podium',
    'objectFor() no longer routes acknowledge to the bell and decisions to the podium');

  /* --- complete matches, every table size, the human seat rotated --- */
  var gameOvers = 0;
  var purgedHumans = 0;
  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var seed = 1000 + g * 7919;
    var humanIndex = g % count;

    var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: humanIndex, seed: seed });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: humanIndex });
    var decide = scriptedPlayer(g);
    var where = 'seed ' + seed + '/' + count + 'p/seat ' + humanIndex;

    audit(objectiveFor, OBJECTIVE_IDS, G, session, where + ' step 0');
    var guard = 0;
    while (!session.over && guard < 600) {
      guard++;
      var w = session.waitingFor();
      if (w) session.submit(decide(w, session));
      else if (!session.advanceBots()) break;
      audit(objectiveFor, OBJECTIVE_IDS, G, session, where + ' step ' + guard);
    }
    if (G.phase === SD.PHASE.GAME_OVER) gameOvers++;
    if (!G.players[humanIndex].alive) purgedHumans++;
  }
  check(gameOvers === GAMES, 'not every audited match reached game over');
  check(purgedHumans > 0, 'no match purged the human, so the dead line was never produced');

  /* --- the two beats random play does not reliably reach ---------------- */

  /* The human Speaker answering a Block. Built through the engine's own
   * transition (proposeBlock), not by assigning the phase by hand. */
  (function () {
    var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 31337 });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });
    G.seize = 5;
    G.blockUnlocked = true;
    G.speaker = 0;                                  // the human answers
    G.deputy = 1;
    G.lastVote = { aye: [0, 1], nay: [], passed: true, speaker: 0, nominee: 1 };
    G.deputyHand = [SD.TILE.SEIZE, SD.TILE.SEIZE];
    G.phase = SD.PHASE.LEGISLATIVE_DEPUTY;
    SD.proposeBlock(G);
    check(G.phase === SD.PHASE.BLOCK_RESPONSE, 'the constructed Block position did not take');
    audit(objectiveFor, OBJECTIVE_IDS, G, session, 'constructed block_response');
  })();

  /* The human holding a Purge. Random play reaches the third Seize with a human
   * Speaker often enough; the fourth is rarer than 36 matches, so the pending
   * power is built in the shape the engine itself builds (the same idiom
   * test/view.test.js uses, because beginPower is internal to a frozen file). */
  (function () {
    var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 4242 });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });
    G.seize = 4;
    G.speaker = 0;
    G.pendingPower = { kind: 'purge', holder: 0, result: null, resolved: false };
    G.phase = SD.PHASE.POWER;
    var pw = session.waitingFor();
    check(pw && pw.kind === 'power_target' && pw.detail.power === 'purge',
      'the constructed Purge position did not produce a power_target');
    audit(objectiveFor, OBJECTIVE_IDS, G, session, 'constructed purge');
  })();

  /*
   * The human holding the Emergency Vote — the panel step-04.md recorded as
   * never having been seen. Found by search, not by hope: seed 19 at five
   * citizens hands seat 0 the third Seize's power after eleven decisions of
   * options[0] play. The seed is quoted in docs/step-05.md so the browser pass
   * and this test are provably standing on the same position.
   */
  (function () {
    var G = SD.createGame({ names: NAMES.slice(0, 5), humanIndex: 0, seed: 19 });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });
    var guard = 0;
    var found = null;
    while (!session.over && guard++ < 400) {
      var w = session.waitingFor();
      if (w && w.kind === 'power_target' && w.detail.power === 'emergency') { found = w; break; }
      if (w) session.submit(w.options[0]);
      else if (!session.advanceBots()) break;
    }
    if (check(!!found, 'seed 19/5p/seat 0 no longer reaches a human-held Emergency Vote')) {
      audit(objectiveFor, OBJECTIVE_IDS, G, session, 'seed 19 emergency');
      var view = View.viewFor(G, 0, { waitingFor: found });
      var got = objectiveFor(view);
      check(got.id === 'power_target:emergency', 'the Emergency Vote line is ' + got.id);
      check(got.text.indexOf('Emergency Vote') !== -1,
        'the Emergency Vote line does not name the power: "' + got.text + '"');
      check(got.text.indexOf('gavel') !== -1,
        'the Emergency Vote line does not say what the power does: "' + got.text + '"');
      emergency = { view: view, waiting: found, session: session };
    }
  })();

  /* ------------------------------------- and the panel it points at draws
   *
   * The objective can be perfect and the screen still blank. panels.js imports
   * no engine module and reaches the DOM through a handful of elements, so the
   * stub-document idiom from test/view.test.js drives the REAL render path in
   * node — the same code the browser runs.
   *
   * Aimed at the Emergency Vote in particular: docs/step-04.md recorded that no
   * browser match had ever reached it with the human holding it, which meant
   * the only evidence the panel worked was that it compiled.
   */
  if (emergency) {
    var panelsMod = await import('../src/play/panels.js');
    var doc = stubDocument();
    var panels = panelsMod.createPanels(doc, {});
    var opened = panels.open(emergency.view, emergency.waiting);
    var html = doc.made.panel.innerHTML;

    check(opened === true, 'the Emergency Vote panel refused to open');
    check(html.indexOf('Emergency Vote') !== -1,
      'the Emergency Vote panel does not name the power');
    check(html.indexOf('Who takes the gavel next?') !== -1,
      'the Emergency Vote panel does not ask the question');
    check(html.indexOf('id="panel-title"') !== -1,
      'the panel has no labelled title for aria-labelledby to point at');

    /* Every advertised target is on screen by name, AND the value the button
     * carries is the value the session accepts — the step-04 handshake bug one
     * layer further out: a panel may not invent a shape submit() will refuse. */
    emergency.waiting.options.forEach(function (id) {
      var name = emergency.view.players.find(function (p) { return p.id === id; }).name;
      check(html.indexOf('>' + name + ' ') !== -1 || html.indexOf('>' + name + '<') !== -1,
        'the Emergency Vote panel omits target ' + name + ' (seat ' + id + ')');
      check(html.indexOf("data-value='" + JSON.stringify(id) + "'") !== -1,
        'the Emergency Vote panel does not offer seat ' + id + ' as a submittable value');
      check(emergency.session.isLegal(id, emergency.waiting),
        'the session rejects advertised Emergency Vote target ' + id);
    });
    /* The holder is not a legal target, and must not be drawn as one. */
    check(html.indexOf("data-value='0'") === -1,
      'the Emergency Vote panel offers the holder their own seat');

    say('panel         the Emergency Vote screen rendered through the real panels.js: the power,');
    say('              the question, a labelled title and all ' + emergency.waiting.options.length +
        ' targets as submittable values');
  }

  /* --- coverage ---------------------------------------------------------- */
  var REQUIRED = [
    'game_over',
    'acknowledge:morning', 'acknowledge:vote_result', 'acknowledge:chaos',
    'nominate', 'vote', 'speaker_discard', 'deputy_discard', 'block_response',
    'power_target:peek', 'power_target:emergency', 'power_target:purge',
    'power_ack:foresight',
    'dead',
    'bots:nomination', 'bots:legislative_speaker', 'bots:legislative_deputy', 'bots:power'
  ];
  REQUIRED.forEach(function (id) {
    check(idsSeen[id] > 0, 'no state in any audited match produced the "' + id + '" line');
  });
  check(!idsSeen.unknown, 'a state fell through to the generic line ' +
    '(' + idsSeen.unknown + ' times) — every kind and phase must map');

  say('lines         ' + linesSeen + ' objective lines across ' + GAMES +
      ' complete matches (5-10 players, the human seat rotated) plus three constructed beats');
  say('coverage      ' + REQUIRED.length + ' of ' + REQUIRED.length +
      ' reachable states mapped: ' + Object.keys(idsSeen).sort().join(', '));
  say('routing       every line names the bell or the podium, and agrees with the object');
  say('              the interaction system would actually open the panel at');
  say('sweep         no role, team or tile token in any line; no name outside the seats');
  say('              the square has publicly been told about');
  say('permutation   ' + permutationsRun + ' hidden-role permutations left the line identical');

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
