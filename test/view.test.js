/*
 * The trust boundary: what src/engine/view.js is allowed to tell one seat.
 *
 *     node test/view.test.js [games]        (npm run test:view)
 *
 * This is a security test, not a formatting test. In a deduction game, hidden
 * information IS the game, and the projection in view.js is what a multiplayer
 * server would put on the wire. So it is checked three ways, deliberately
 * overlapping, because each catches a different kind of mistake:
 *
 *  1. THE PERMUTATION TEST — the strongest of the three, and the only one that
 *     is not a list of things somebody remembered to forbid. Take a live game,
 *     build a seat's view, then rewrite the roles of every player that seat is
 *     not entitled to know, and build the view again. If the projection depends
 *     on hidden state in ANY way — a field, a derived boolean, a sort order, a
 *     string — the two serialisations differ. It cannot be fooled by a leak
 *     nobody thought to blacklist.
 *
 *  2. THE PATH WALK — every role/team token and every tile token in the
 *     serialised view is collected with its JSON path and matched against an
 *     explicitly computed allowlist. This is what catches a leak in a place the
 *     permutation cannot reach: another seat's recorded Peek results, which are
 *     history rather than role, and so survive a role permutation unchanged.
 *
 *  3. THE BLUNT SWEEP — for a Loyalist mid-game, the string "rebel" and the
 *     string "dictator" must not occur as a value anywhere in the serialised
 *     view, and "loyalist" only where their own role belongs.
 *
 * Run at every step of complete matches, for every seat, alive and dead.
 */

'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Driver = require('../src/engine/driver.js');
var Human = require('../src/engine/human-driver.js');
var View = require('../src/engine/view.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
var ROLE_TOKENS = { loyalist: 1, rebel: 1, dictator: 1 };
var TILE_TOKENS = { reform: 1, seize: 1 };

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

/* --------------------------------------------------------------- 1. walk */

/** Every string value in `obj`, as [path, value]. */
function walk(obj, path, out) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj === 'string') { out.push([path, obj]); return out; }
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) walk(obj[i], path + '[]', out);
    return out;
  }
  if (typeof obj === 'object') {
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) walk(obj[keys[k]], path + '.' + keys[k], out);
  }
  return out;
}

/**
 * The paths a role/team token may legally sit at, for this seat in this state.
 * Anything else is a leak, by definition.
 */
function allowedRolePaths(G, v) {
  var over = G.phase === SD.PHASE.GAME_OVER;
  var ok = {
    '.you.role': 1,
    '.you.team': 1
  };
  /* The engine's own disclosure rule decides which .known entries exist. */
  Object.keys(SD.knownRoles(G, v)).forEach(function (id) { ok['.known.' + id] = 1; });
  /* The viewer's own Peek results, and only theirs. */
  Object.keys(G.players[v].peeked).forEach(function (id) { ok['.peeked.' + id] = 1; });
  /* A Peek result travels to the holder while the power is on the table. */
  if (G.pendingPower && G.pendingPower.holder === v) ok['.power.result.team'] = 1;
  if (over) {
    ok['.winner'] = 1;
    ok['.reveal[].role'] = 1;
    ok['.reveal[].team'] = 1;
  }
  return ok;
}

/** The paths a tile token may legally sit at. */
function allowedTilePaths(G, v) {
  var ok = {
    '.lastEnacted.tile': 1,     // what went on the board is always public
    '.log[].meta.tile': 1       // enactments are logged in public prose
  };
  /* Chaos turns the top tile face up in front of everybody. */
  if (G.phase === SD.PHASE.CHAOS) {
    ok['.chaosTile'] = 1;
    ok['.waitingFor.detail.tile'] = 1;
  }
  /* Private hands reach their owner only through the decision they must make. */
  var w = Driver.humanTurn(G, v);
  if (w && (w.kind === 'speaker_discard' || w.kind === 'deputy_discard' || w.kind === 'power_ack')) {
    ok['.waitingFor.detail.tiles[]'] = 1;
  }
  if (G.pendingPower && G.pendingPower.holder === v) ok['.power.result.tiles[]'] = 1;
  return ok;
}

function auditPaths(G, v, view, where) {
  var roleOk = allowedRolePaths(G, v);
  var tileOk = allowedTilePaths(G, v);
  var strings = walk(view, '', []);
  var bad = [];
  for (var i = 0; i < strings.length; i++) {
    var path = strings[i][0], value = strings[i][1];
    if (ROLE_TOKENS[value] && !roleOk[path]) bad.push(path + ' = "' + value + '"');
    if (TILE_TOKENS[value] && !tileOk[path]) bad.push(path + ' = "' + value + '"');
  }
  check(bad.length === 0, where + ': view leaked ' + bad.slice(0, 4).join(', '));
  return bad.length === 0;
}

/* ------------------------------------------------------- 2. permutation */

/**
 * Rewrite the roles this seat is not entitled to know, keeping the multiset
 * intact so the game stays a legal deal, and hand back an undo.
 *
 * The rotation is by one position among the unknown seats — a pure index shift,
 * no generator involved, because a test that drew from one would be testing the
 * generator.
 */
function permuteHidden(G, v) {
  var known = SD.knownRoles(G, v);
  var hidden = G.players.filter(function (p) { return !known[p.id]; });
  if (hidden.length < 2) return null;

  var before = hidden.map(function (p) { return { id: p.id, role: p.role, team: p.team }; });
  var distinct = {};
  before.forEach(function (b) { distinct[b.role] = 1; });
  /* Rotating a list whose entries are all the same role changes nothing, and a
   * test that cannot fail is worse than no test — say so by returning null. */
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

/* ------------------------------------------------------------- 3. sweep */

/**
 * Paths in a view whose *value* is a tile token.
 *
 * Deliberately not a substring search for `"seize"`: the track counters are
 * named `reform` and `seize`, so a naive scan matches the key and reports a
 * leak on every view ever built. Values only.
 */
function tileValuePaths(view) {
  return walk(view, '', []).filter(function (pv) { return TILE_TOKENS[pv[1]]; })
    .map(function (pv) { return pv[0]; });
}

/** Count occurrences of a quoted JSON value, e.g. `"dictator"`. */
function countValue(json, token) {
  var needle = '"' + token + '"';
  var n = 0, at = 0;
  while ((at = json.indexOf(needle, at)) !== -1) { n++; at += needle.length; }
  return n;
}

/* ------------------------------------------------------------------- run */

var GAMES = parseInt(process.argv[2], 10) || 24;

var viewsBuilt = 0;
var permutationsRun = 0;
var permutationsSkipped = 0;
var sweepsRun = 0;
var gameOversSeen = 0;
var peekedSeatsSeen = 0;

function scriptedPlayer(salt) {
  var n = 0;
  return function (w) {
    var i = n++;
    if (w.kind === 'acknowledge' || w.kind === 'power_ack') return null;
    if (w.kind === 'vote') return ((i + salt) % 3) !== 0;
    if (w.kind === 'block_response') return ((i + salt) % 2) === 0;
    if (w.kind === 'deputy_discard') return { discard: w.options[(i + salt) % w.options.length] };
    return w.options[(i + salt) % w.options.length];
  };
}

/** Audit every seat's view of the current position. */
function auditAll(G, where) {
  for (var v = 0; v < G.players.length; v++) {
    var view = View.viewFor(G, v);
    viewsBuilt++;

    /* --- the walk --- */
    auditPaths(G, v, view, where + ' seat ' + v);

    /* The projection must never carry the seed (it regenerates the whole deal),
     * the deck, the discard pile, or anyone else's Peek record. */
    var json = JSON.stringify(view);
    check(view.seed === undefined, where + ' seat ' + v + ': the seed is in the view');
    check(!Array.isArray(view.deck) && !Array.isArray(view.discard),
      where + ' seat ' + v + ': deck or discard contents are in the view');
    check(typeof view.deckCount === 'number' && typeof view.discardCount === 'number',
      where + ' seat ' + v + ': deck/discard counts missing');
    view.players.forEach(function (p) {
      check(p.role === undefined && p.team === undefined && p.peeked === undefined,
        where + ' seat ' + v + ': players[] carries role/team/peeked');
    });

    /* --- the blunt sweep, for a seat that knows only itself --- */
    var known = SD.knownRoles(G, v);
    if (Object.keys(known).length === 1 && G.phase !== SD.PHASE.GAME_OVER) {
      sweepsRun++;
      var mine = G.players[v].role;
      var expected = { loyalist: 0, rebel: 0, dictator: 0 };
      expected[mine] += 2;                          // you.role and you.team...
      if (mine === SD.ROLE.DICTATOR) {
        expected.dictator -= 1; expected.rebel += 1;  // ...the Dictator's team is rebel
      }
      expected[mine] += 1;                          // known[self]
      Object.keys(G.players[v].peeked).forEach(function (id) {
        expected[G.players[v].peeked[id]] += 1;
      });
      if (G.pendingPower && G.pendingPower.holder === v && G.pendingPower.result &&
          G.pendingPower.result.team) {
        expected[G.pendingPower.result.team] += 1;
      }
      Object.keys(ROLE_TOKENS).forEach(function (tok) {
        var got = countValue(json, tok);
        check(got === expected[tok],
          where + ' seat ' + v + ' (' + mine + '): "' + tok + '" appears ' + got +
          ' times, expected ' + expected[tok]);
      });
    }
    if (Object.keys(G.players[v].peeked).length) peekedSeatsSeen++;

    /* --- the permutation ---
     * Skipped at game over, and only there: the reveal is *supposed* to depend
     * on every hidden role by then, so the test would be asserting the opposite
     * of the rule. Everything up to that point is fair game. */
    if (G.phase === SD.PHASE.GAME_OVER) { permutationsSkipped++; continue; }
    var undo = permuteHidden(G, v);
    if (!undo) { permutationsSkipped++; continue; }
    permutationsRun++;
    var again = JSON.stringify(View.viewFor(G, v));
    undo();
    var restored = JSON.stringify(View.viewFor(G, v));
    check(again === json,
      where + ' seat ' + v + ': the view changed when hidden roles were permuted');
    check(restored === json, where + ' seat ' + v + ': the permutation undo did not restore');
  }
}

for (var g = 0; g < GAMES; g++) {
  var count = 5 + (g % 6);
  var seed = 1000 + g * 7919;
  var humanIndex = g % count;

  var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: humanIndex, seed: seed });
  var minds = AI.create(G);
  var session = Human.createSession({ G: G, minds: minds, humanId: humanIndex });
  var decide = scriptedPlayer(g);

  auditAll(G, 'seed ' + seed + ' step 0');

  var guard = 0;
  while (!session.over && guard < 600) {
    guard++;
    var w = session.waitingFor();
    if (w) session.submit(decide(w, session));
    else if (!session.advanceBots()) break;
    auditAll(G, 'seed ' + seed + ' step ' + guard);
  }
  if (G.phase === SD.PHASE.GAME_OVER) gameOversSeen++;
}

check(gameOversSeen === GAMES, 'not every audited match reached game over');
check(peekedSeatsSeen > 0, 'no Peek result was ever held by anybody — the private-result path is untested');

say('views         ' + viewsBuilt + ' projections audited across ' + GAMES +
    ' complete matches, every seat, every step');
say('permutation   ' + permutationsRun + ' role permutations left the view byte-identical' +
    (permutationsSkipped ? ' (' + permutationsSkipped + ' seats had nothing to permute)' : ''));
say('sweep         ' + sweepsRun + ' single-knowledge seats carried exactly their own role token');
say('peek          ' + peekedSeatsSeen + ' seat-states held a private Peek result');

/* --------------------------------------- POSITIVE disclosure, by the rule
 *
 * Everything above is negative: it proves the view says too little nowhere. On
 * its own that is only half a test, and the wrong half to be confident about —
 * a viewFor() that returned `known: {}` for everybody would sail through every
 * leak check in this file while making the Rebel role unplayable, because a
 * Rebel who cannot see their team-mates or the Dictator has no game to play.
 *
 * So the same rule is asserted from the other side: every seat's `known` must
 * be exactly SD.knownRoles for that seat — no more, and no less.
 */

var positiveSeats = 0;
var rebelViewsChecked = 0;

for (var n = 5; n <= 10; n++) {
  for (var trial = 0; trial < 4; trial++) {
    var PG = SD.createGame({
      names: NAMES.slice(0, n), humanIndex: 0, seed: 20260809 + n * 31 + trial
    });

    for (var seat = 0; seat < n; seat++) {
      positiveSeats++;
      var pv = View.viewFor(PG, seat);
      var expectKnown = SD.knownRoles(PG, seat);

      /* Exact equality, both directions. */
      check(JSON.stringify(pv.known) === JSON.stringify(expectKnown),
        n + 'p seat ' + seat + ': known is ' + JSON.stringify(pv.known) +
        ', the engine says ' + JSON.stringify(expectKnown));
      check(pv.known[seat] === PG.players[seat].role,
        n + 'p seat ' + seat + ': the view does not tell you your own role');
      check(pv.you.role === PG.players[seat].role && pv.you.team === PG.players[seat].team,
        n + 'p seat ' + seat + ': you.role/you.team wrong');

      var role = PG.players[seat].role;

      if (role === SD.ROLE.REBEL) {
        rebelViewsChecked++;
        /* Every other Rebel, by name, and the Dictator. This is the assertion
         * that would fail if the projection were tightened into uselessness. */
        var mates = PG.players.filter(function (p) {
          return p.role === SD.ROLE.REBEL && p.id !== seat;
        });
        mates.forEach(function (m) {
          check(pv.known[m.id] === SD.ROLE.REBEL,
            n + 'p: Rebel ' + seat + ' cannot see fellow Rebel ' + m.id);
        });
        check(pv.known[SD.dictator(PG).id] === SD.ROLE.DICTATOR,
          n + 'p: Rebel ' + seat + ' cannot see the Dictator');
        check(Object.keys(pv.known).length === mates.length + 2,
          n + 'p: Rebel ' + seat + ' sees ' + Object.keys(pv.known).length +
          ' roles, expected ' + (mates.length + 2) + ' (self + mates + Dictator)');
        /* And the names are resolvable from the same view, or the role card
         * cannot be drawn from it. */
        Object.keys(pv.known).map(Number).forEach(function (id) {
          check(!!pv.players.find(function (q) { return q.id === id; }),
            n + 'p: known names seat ' + id + ' that players[] does not list');
        });
      }

      if (role === SD.ROLE.DICTATOR) {
        var sees = Object.keys(pv.known).length > 1;
        check(sees === (n <= SD.DICTATOR_SEES_REBELS_UP_TO),
          n + 'p: the Dictator ' + (sees ? 'sees' : 'does not see') +
          ' the Rebels, which is wrong for this table size');
        if (n <= SD.DICTATOR_SEES_REBELS_UP_TO) {
          var rebels = PG.players.filter(function (p) { return p.role === SD.ROLE.REBEL; });
          rebels.forEach(function (r) {
            check(pv.known[r.id] === SD.ROLE.REBEL,
              n + 'p: the Dictator cannot see Rebel ' + r.id + ' at a small table');
          });
        }
      }

      if (role === SD.ROLE.LOYALIST) {
        check(Object.keys(pv.known).length === 1,
          n + 'p: Loyalist ' + seat + ' sees ' + Object.keys(pv.known).length + ' roles');
      }
    }
  }
}

check(rebelViewsChecked > 0, 'no Rebel view was ever checked');
say('disclosure    ' + positiveSeats + ' seats across 5-10 players: known === SD.knownRoles exactly,');
say('              ' + rebelViewsChecked + ' Rebel views named every mate and the Dictator');

/* ----------------------------------------- the disclosure rules, by name */

(function () {

  /* A Peek result reaches the holder and nobody else — including the target.
   * beginPower() is internal to the engine (not exported, and the engine is
   * frozen), so the pending power is set up in the shape the engine itself
   * builds and then driven through the exported usePower(). */
  var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 555 });
  G.seize = 1;
  G.speaker = 0;
  G.pendingPower = { kind: 'peek', holder: 0, result: null, resolved: false };
  G.phase = SD.PHASE.POWER;
  var target = SD.powerTargets(G)[0].id;
  SD.usePower(G, target);

  var holderView = View.viewFor(G, 0);
  check(holderView.power && holderView.power.result &&
        holderView.power.result.team === G.players[target].team,
    'the Peek holder was not told what they read');
  check(holderView.peeked[target] === G.players[target].team,
    'the Peek result was not recorded in the holder\'s own peeked map');

  for (var other = 1; other < G.players.length; other++) {
    var ov = View.viewFor(G, other);
    check(!ov.power || ov.power.result === null,
      'seat ' + other + ' was handed somebody else\'s Peek result');
    check(Object.keys(ov.peeked).length === 0,
      'seat ' + other + ' was handed the holder\'s peeked map');
    check(ov.power && ov.power.kind === 'peek' && ov.power.holder === 0,
      'seat ' + other + ' cannot see that a Peek is on the table at all');
  }

  /* Foresight's three tiles are the holder's alone, and the deck stays shut. */
  var F = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 777 });
  F.seize = 2;
  F.speaker = 0;
  F.pendingPower = { kind: 'foresight', holder: 0, resolved: false,
                     result: { tiles: SD.peekTop(F, 3) } };
  F.phase = SD.PHASE.POWER;
  var fHolder = View.viewFor(F, 0);
  check(fHolder.waitingFor && fHolder.waitingFor.kind === 'power_ack' &&
        fHolder.waitingFor.detail.tiles.length === 3,
    'the Foresight holder was not shown three tiles');
  var fOther = View.viewFor(F, 1);
  check(!fOther.power || fOther.power.result === null,
    'a bystander was shown what Foresight found');
  check(fOther.waitingFor === null, 'a bystander was handed the holder\'s pending decision');
  check(tileValuePaths(fOther).length === 0,
    'a bystander\'s view carries tile values during Foresight: ' +
    tileValuePaths(fOther).join(', '));

  /* The Speaker's three are not the Deputy's business, and vice versa. */
  var L = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 999 });
  L.speaker = 0; L.deputy = 1;
  L.hand = [SD.TILE.SEIZE, SD.TILE.SEIZE, SD.TILE.REFORM];
  L.phase = SD.PHASE.LEGISLATIVE_SPEAKER;
  var spk = View.viewFor(L, 0);
  check(spk.waitingFor && spk.waitingFor.detail.tiles.length === 3,
    'the Speaker cannot see the three tiles they drew');
  for (var s2 = 1; s2 < L.players.length; s2++) {
    var svPaths = tileValuePaths(View.viewFor(L, s2));
    check(svPaths.length === 0,
      'seat ' + s2 + ' can see the Speaker\'s hand at ' + svPaths.join(', '));
  }

  SD.speakerDiscard(L, 0);
  var dep = View.viewFor(L, 1);
  check(dep.waitingFor && dep.waitingFor.detail.tiles.length === 2,
    'the Deputy cannot see the two tiles they were passed');
  /* And the discard the Speaker threw is gone from every view, theirs included
   * — "the discard is never revealed to the square" is the engine's own line. */
  var spkPaths = tileValuePaths(View.viewFor(L, 0));
  check(spkPaths.length === 0,
    'the Speaker still sees tiles after passing them on (incl. the discard): ' +
    spkPaths.join(', '));

  /* Everything opens at game over, and not one beat before. */
  var E = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 4242 });
  check(View.viewFor(E, 0).reveal === null, 'the reveal is populated mid-game');
  /* endGame() is internal too; the state it leaves is what matters here. */
  E.winner = SD.TEAM.LOYALIST;
  E.winReason = 'test';
  E.phase = SD.PHASE.GAME_OVER;
  var ev = View.viewFor(E, 0);
  check(Array.isArray(ev.reveal) && ev.reveal.length === 7,
    'the reveal is missing at game over');
  check(ev.reveal.every(function (r) { return typeof r.role === 'string'; }),
    'the reveal does not carry roles');

  say('rules         disclosure checked by name: Rebels, the Dictator at 5/6 vs 7+, Peek,');
  say('              Foresight, both legislative hands, and the game-over reveal');
})();

/* ------------------------------------------- and the panel actually draws it
 *
 * A projection that carries the Rebels' knowledge and a role card that never
 * renders it are the same thing from the player's chair. src/play/panels.js
 * holds no engine import and reaches the DOM through exactly five elements, so
 * a stub document is enough to drive the real render path in node — the same
 * code the browser runs, not a re-description of it.
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

async function renderCheck() {
  var mod = await import('../src/play/panels.js');
  var doc = stubDocument();
  var panels = mod.createPanels(doc, {});

  /* A table where the human is a Rebel, so there is something to render. */
  var G = null;
  for (var s = 1; s < 400 && !G; s++) {
    var cand = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: s });
    if (cand.players[0].role === SD.ROLE.REBEL) G = cand;
  }
  if (!check(!!G, 'could not deal a Rebel human in 400 seeds')) return;

  var v = View.viewFor(G, 0);
  panels.renderHud(v);
  /*
   * The private card, which is where the sidebar's role block went in Gate D3.
   * Same question as before, one element further on: does the projection's
   * knowledge actually reach the screen, and does it reach only the seat
   * entitled to it. The card is also the only 2D element in the game allowed to
   * carry role colour, so it is the only place this can be asked.
   */
  var card = doc.made.card.innerHTML;

  /* Matched against the markup, not the prose: the Loyalist blurb contains the
   * literal words "You know nobody", so a /you know/i probe passes on the one
   * card that must NOT have the line. Wrong assertion, not wrong code — but a
   * test that green-lights the opposite of what it claims is worth naming. */
  check(card.indexOf('class="know"') !== -1,
    'the private card does not render the "who you know" line at all');
  check(card.indexOf('>rebel<') !== -1, 'the private card does not show the viewer their own role');

  var allies = Object.keys(v.known).map(Number).filter(function (id) { return id !== 0; });
  check(allies.length > 0, 'the Rebel view carried no allies to render');
  allies.forEach(function (id) {
    var name = v.players.find(function (p) { return p.id === id; }).name;
    check(card.indexOf((id + 1) + ' ' + name) !== -1,
      'the private card omits ally ' + name + ' (seat ' + id + ', number ' + (id + 1) + ')');
  });
  /*
   * The Dictator, by mark rather than by word.
   *
   * The card has 232 px and one line for this, so "3 Chen dictator" does not
   * fit and the Dictator carries a brass mark instead — which is the thing a
   * Rebel scans for anyway. The assertion is therefore that the mark sits on
   * the Dictator and on nobody else, which is a stronger statement than the old
   * "the word appears somewhere in the card".
   */
  var dictName = G.players[SD.dictator(G).id].name;
  check(card.indexOf(dictName + ' ✦') !== -1,
    'the private card does not mark the Dictator to a Rebel');
  allies.forEach(function (id) {
    if (id === SD.dictator(G).id) return;
    var name = v.players.find(function (p) { return p.id === id; }).name;
    check(card.indexOf(name + ' ✦') === -1,
      'the private card marks ' + name + ' as the Dictator');
  });

  /* The mirror image: a Loyalist's card must name nobody but themselves. */
  var LG = null;
  for (var t = 1; t < 400 && !LG; t++) {
    var c2 = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: t });
    if (c2.players[0].role === SD.ROLE.LOYALIST) LG = c2;
  }
  if (check(!!LG, 'could not deal a Loyalist human in 400 seeds')) {
    panels.renderHud(View.viewFor(LG, 0));
    var lcard = doc.made.card.innerHTML;
    /* The line is always there — a card whose third line came and went would be
     * a card that changes height — so what it says is the assertion. */
    check(lcard.indexOf('you know nobody') !== -1,
      'a Loyalist\'s private card does not say they know nobody');
    check(lcard.indexOf('✦') === -1, 'a Loyalist\'s private card marks a Dictator');
    check(lcard.indexOf('>loyalist<') !== -1,
      'a Loyalist\'s private card does not show their own role');
    LG.players.forEach(function (p) {
      if (p.id === 0) return;
      check(lcard.indexOf(p.name) === -1,
        'a Loyalist\'s private card names ' + p.name);
    });
  }

  say('private card  rendered through the real panels.js: a Rebel\'s card names every ally by');
  say('              their permanent number and marks the Dictator; a Loyalist\'s names nobody');
}

/* ------------------------------------------------------------------- out */

renderCheck().then(function () {
  console.log(lines.join('\n'));
  console.log('');
  if (failures.length) {
    console.error('FAILED — ' + failures.length + ' of ' + checks + ' checks:');
    failures.slice(0, 12).forEach(function (f) { console.error('  - ' + f); });
    process.exit(1);
  }
  console.log('OK — ' + checks + ' checks passed.');
}, function (err) {
  console.error(err);
  process.exit(1);
});
