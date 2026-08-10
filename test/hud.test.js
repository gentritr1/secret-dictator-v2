/*
 * The product HUD: the tray, the private card, and the one grammar.
 *
 *     node test/hud.test.js [games]        (npm run test:hud)
 *
 * Gate D3 retired the 330 px debug sidebar. What replaced it is two permanent
 * surfaces and a rule apiece, and this file is where the rules are enforced
 * rather than asserted in a comment:
 *
 *  1. NEVER BLANK. Every state of every phase of complete matches produces a
 *     tray whose id this module admits to and whose line is not empty — and the
 *     states where nothing is being asked of you NAME who the square is waiting
 *     for and offer no keys at all. Swept over 50 matches, both cameras' worth
 *     of states (armed and offered), with a coverage requirement so "every
 *     phase maps" is measured rather than hoped.
 *
 *  2. THE CARD NEVER GROWS. Its declared box is one constant, the style sheet
 *     declares the same numbers, no other rule touches its width or height, and
 *     the fourth line's row exists in every state — so tiles or no tiles, it is
 *     232 x 96. (The measured box in a real browser is the review's job and is
 *     reported in docs/step-11.md; this is the half that can fail in CI.)
 *
 *  3. ROLE COLOUR, ONCE. Every rendered surface of every state is swept for the
 *     role CHANNEL — the r-loyalist / r-rebel / r-dictator classes and the three
 *     role words — and it may appear nowhere but the private card. The one
 *     exception is the game-over reveal, where every role is public by
 *     definition, and the sweep asserts that exception is the only one.
 *
 *  4. THE ONE GRAMMAR. A citizen's number comes from roster order, never
 *     changes, is retired when they die and is never reused — and the SAME
 *     number names the SAME citizen through every input path there is: the
 *     tray's keys, the panel's kbd hints, the panel's key handler and the
 *     tray's key handler are all driven here and required to agree.
 *
 *  5. THE OBJECTIVE LINE IS UNTOUCHED. Its five positioning declarations are
 *     pinned byte for byte, and its behaviour is pinned by a fingerprint of 466
 *     lines over four fixed matches — a number produced by running the module as
 *     it stood at commit 02e44a6, BEFORE this gate. See the note at the check.
 *
 *  6. NOTHING SMUGGLED BACK. The rows the retirement table routed to the ledger
 *     — deck, discard, the log, the chaos track below its promotion point, the
 *     next power — appear on no surface, in any state.
 *
 * Everything here runs headlessly against real matches through the REAL render
 * path: src/play/panels.js drives a stub document, the same idiom
 * test/view.test.js has used since Step 4.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Human = require('../src/engine/human-driver.js');
var View = require('../src/engine/view.js');
var Floor = require('../src/engine/floor.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
var ROLE_WORDS = ['loyalist', 'rebel', 'dictator'];
var ROLE_CLASSES = ['r-loyalist', 'r-rebel', 'r-dictator'];

var checks = 0;
var failures = [];
var lines = [];

function check(ok, what) {
  checks++;
  if (!ok && failures.length < 40) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

/* The five elements panels.js reaches for, with just enough of a DOM to be
 * written to. Same stub as test/view.test.js, plus a record of what was
 * written, because what this file checks is the markup. */
function stubDocument() {
  var made = {};
  function el() {
    return {
      innerHTML: '', textContent: '', className: '', scrollTop: 0, scrollHeight: 0,
      classList: { add: function () {}, remove: function () {}, toggle: function () {} },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      setAttribute: function () {}, removeAttribute: function () {},
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

/**
 * Every surface the page renders, as one string, for the leak sweeps.
 *
 * D4 added the fifth. `ledger` is the whole panel and `ledgerCitizens` is the
 * block of it that names people: the ledger's first line is your own win
 * condition and is the one place in the game outside the private card and the
 * game-over reveal where a role word is legitimate — so the CHANNEL rule is
 * asked of the whole panel and the WORD rule is asked of the part that names
 * citizens. See test/ledger.test.js, which owns the rest of that surface.
 */
function surfaces(doc) {
  var ledger = doc.made.ledger
    ? doc.made.ledger.innerHTML + ' ' + (doc.made.ledger.className || '') : '';
  var from = ledger.indexOf('<div class="cits">');
  var to = ledger.indexOf('<footer');
  return {
    card: doc.made.card ? doc.made.card.innerHTML + ' ' + (doc.made.card.className || '') : '',
    tray: doc.made.tray ? doc.made.tray.innerHTML + ' ' + (doc.made.tray.className || '') : '',
    panel: doc.made.panel ? doc.made.panel.innerHTML : '',
    objective: doc.made.objective ? doc.made.objective.textContent : '',
    prompt: doc.made.prompt ? doc.made.prompt.textContent : '',
    ledger: ledger,
    ledgerCitizens: from === -1 ? '' : ledger.slice(from, to === -1 ? undefined : to)
  };
}

/*
 * The permutation idiom from test/view.test.js, one layer out.
 *
 * Rewrite the roles this seat is not entitled to know and rebuild the surface:
 * if the tray or the card depends on hidden state in ANY way — a field, a sort
 * order, a derived boolean, a string — the two serialisations differ. It is the
 * only check here that is not a list of things somebody remembered to forbid.
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

var GAMES = parseInt(process.argv[2], 10) || 50;

async function main() {
  var trayMod = await import('../src/play/tray.js');
  var cardMod = await import('../src/play/card.js');
  var seatMod = await import('../src/play/seat.js');
  var panelsMod = await import('../src/play/panels.js');
  var objectiveMod = await import('../src/play/objective.js');

  var trayFor = trayMod.trayFor;
  var cardFor = cardMod.cardFor;
  var TRAY_IDS = trayMod.TRAY_IDS;
  var seatKey = seatMod.seatKey;
  var seatNumber = seatMod.seatNumber;
  var seatFromKey = seatMod.seatFromKey;

  /* ------------------------------------------------------- 0. the grammar */

  (function () {
    for (var id = 0; id < 10; id++) {
      check(seatNumber(id) === id + 1, 'seat ' + id + ' is not numbered ' + (id + 1));
      check(seatFromKey(seatKey(id)) === id,
        'the key for seat ' + id + ' does not name seat ' + id + ' again');
    }
    check(seatKey(9) === '0', 'seat 10 is not reachable by the 0 key');
    check(seatFromKey('x') === null && seatFromKey('') === null && seatFromKey('12') === null,
      'a key that names nobody is being read as a citizen');
    /* Numbers are a property of the person, not of a list: a filtered options
     * array must never renumber anybody. */
    var keys = [3, 5, 7].map(seatKey);
    check(keys.join(',') === '4,6,8',
      'a filtered list of citizens is being numbered by position: ' + keys.join(','));

    /* The engine's power names and the tray's copy of them. The tray imports no
     * engine module by design, so the copy can drift; this is the gate. */
    Object.keys(SD.POWER_LABEL).forEach(function (k) {
      check(trayMod.POWER_LABEL[k] === SD.POWER_LABEL[k],
        'the tray calls the ' + k + ' power "' + trayMod.POWER_LABEL[k] +
        '" and the engine calls it "' + SD.POWER_LABEL[k] + '"');
    });
    check(Object.keys(trayMod.POWER_LABEL).length === Object.keys(SD.POWER_LABEL).length,
      'the tray knows a different number of powers than the engine does');
  })();

  /* ------------------------------------------------- 1-4. the match sweep */

  var idsSeen = {};
  var states = 0;
  var blankRows = 0;
  var keyedStates = 0;
  var handStates = 0;
  var roleColourOutside = [];
  var ledgerLeaks = [];
  var deaths = 0;
  var permutations = 0;
  var ledgerStates = 0;

  var doc = stubDocument();
  var submitted = [];
  var panels = panelsMod.createPanels(doc, {
    onSubmit: function (v) { submitted.push(v); }
  });

  /** One audited state: derive, render, and ask every question of it. */
  function audit(G, session, humanId, where, record) {
    var waiting = session.waitingFor();
    var view = View.viewFor(G, humanId, { waitingFor: waiting });
    var over = view.phase === 'game_over';

    /*
     * Every presentation the page can be in for this state. The tray has three
     * clocks on it — the deliberation beat, the announcement and the arming —
     * and each one is a different row, so each one is swept.
     */
    var modes = [
      { holding: false },
      { holding: true },
      { holding: false, armed: true },
      { holding: false, announce: trayMod.announceFor(view.seize || 1, 'purge') }
    ];

    modes.forEach(function (mode) {
      var tray = trayFor(view, mode);
      states++;
      idsSeen[tray.id] = (idsSeen[tray.id] || 0) + 1;

      /* 1. NEVER BLANK. */
      if (!tray.line || !String(tray.line).trim()) {
        blankRows++;
        check(false, 'a blank tray row at ' + where + ' (' + tray.id + ')');
      }
      check(TRAY_IDS.indexOf(tray.id) !== -1,
        'the tray returned an id it does not admit to: ' + tray.id + ' at ' + where);
      check(!!tray.tracks && tray.tracks.reform.of === view.limits.reformToWin,
        'the tray lost its tracks at ' + where);
      check(tray.tracks.chaos.show === (view.chaos >= view.limits.chaosLimit - 1),
        'the chaos track promotes at the wrong count at ' + where);

      /* The empty state names who the square is waiting for and offers nothing
       * to press. Both halves, because either one alone is a different rule. */
      if (tray.kind === 'empty' || tray.kind === 'beat' ||
          tray.kind === 'announce' || tray.kind === 'dead' || tray.kind === 'over') {
        check(tray.keys.length === 0,
          'a tray state with nothing to do is offering keys at ' + where + ' (' + tray.id + ')');
        check(tray.act === false,
          'a tray state with nothing to do is drawn warm at ' + where + ' (' + tray.id + ')');
      }
      tray.waitingOn.forEach(function (id) {
        check(tray.line.indexOf(seatNumber(id) + ' ') !== -1,
          'the empty tray row does not name citizen ' + seatNumber(id) + ' at ' + where +
          ': "' + tray.line + '"');
      });
      if (tray.keys.length) keyedStates++;

      /* A key that is offered must be one a player can actually press, and a
       * citizen key must name a citizen who is genuinely on offer. */
      tray.keys.forEach(function (k) {
        check(typeof k.key === 'string' && k.key.length === 1,
          'the tray offers a key that is not a keypress: ' + JSON.stringify(k.key));
        var named = seatFromKey(k.key);
        if (named !== null && waiting &&
            (waiting.kind === 'nominate' || waiting.kind === 'power_target')) {
          check(waiting.options.indexOf(named) !== -1,
            'the tray offers key ' + k.key + ' for a citizen who is not an option at ' + where);
          check(k.value === named,
            'the tray key ' + k.key + ' does not carry citizen ' + named + ' at ' + where);
        }
      });

      /* 6. Nothing routed to the ledger is on screen. */
      var said = tray.line + ' ' + tray.note;
      if (/\bdeck\b|\bdiscard(ed)?\b/i.test(said) && tray.id !== 'card:acknowledge:chaos' &&
          tray.id !== 'beat:acknowledge:chaos' && tray.id !== 'empty:chaos') {
        ledgerLeaks.push(where + ': ' + said);
      }
      if (view.chaos < view.limits.chaosLimit - 1 && tray.tracks.chaos.show) {
        ledgerLeaks.push(where + ': the chaos track is on screen at ' + view.chaos);
      }

      /* No hidden role reaches the tray, ever — including at game over, where
       * the roles are public but the tray is not the reveal. */
      ROLE_WORDS.forEach(function (word) {
        check(said.toLowerCase().indexOf(word) === -1,
          'the tray says "' + word + '" at ' + where + ': ' + said);
      });
    });

    /* 2. THE CARD. */
    var card = cardFor(view, { night: true });
    check(card.box.width === 232 && card.box.height === 96,
      'the private card box is no longer 232 x 96');
    check(card.number === seatNumber(humanId),
      'the private card shows the wrong seat number at ' + where);
    check(card.role === view.you.role, 'the private card lost the role at ' + where);
    check(!!card.knowText && card.knowText.length > 0,
      'the private card has an empty third line at ' + where);
    var holding = waiting && ['speaker_discard', 'deputy_discard', 'power_ack']
      .indexOf(waiting.kind) !== -1;
    check(!!card.hand === !!holding,
      'the private card ' + (card.hand ? 'shows' : 'hides') + ' tiles at the wrong time at ' + where);
    check(card.lines === (holding ? 4 : 3),
      'the private card claims ' + card.lines + ' lines at ' + where);
    if (holding) handStates++;
    if (!view.you.alive) deaths++;

    /* 3. ROLE COLOUR, and 4. the panel's keys — both through the real render.
     * The ledger is opened over the top of a sample of the states, because
     * "nothing outside the private card carries role colour" has to hold with
     * every surface on screen and this is the gate that says so. */
    panels.renderHud(view, { holding: false, night: false });
    var withLedger = record && states % 5 === 0;
    if (withLedger) {
      panels.openLedger(view, {
        day: record.day, entries: Floor.ledger(record),
        utterances: record.utterances, governments: record.governments,
        powers: record.powers, purges: record.purges, floors: record.floors,
        flags: Floor.contradictions(record)
      });
      ledgerStates++;
    }
    if (waiting) panels.open(view, waiting);
    else if (over) panels.open(view, null);
    var s = surfaces(doc);

    /*
     * Two different rules, and conflating them is how this check would end up
     * either toothless or wrong.
     *
     * THE CHANNEL — the r-* classes, which is what "role colour" actually means
     * once the palette forbids new colours — is absolute: the private card and
     * nowhere else, in any state, including the game-over reveal's own table
     * (which uses the same classes and is inside the panel).
     *
     * THE WORDS are absolute on the three PERMANENT surfaces, because a surface
     * that is always on screen is one careless edit away from printing a role
     * beside a name. On the panel, which you opened on purpose, they are
     * legitimate rules copy — "you will be told Loyalist or Rebel" — so the rule
     * there is the one that matters: a role word may not appear within 40
     * characters of any citizen's name.
     */
    ROLE_CLASSES.forEach(function (cls) {
      ['tray', 'objective', 'prompt', 'ledger'].forEach(function (name) {
        if (s[name].indexOf(cls) !== -1) roleColourOutside.push(where + ' ' + name + ': ' + cls);
      });
      if (!over && s.panel.indexOf(cls) !== -1) {
        roleColourOutside.push(where + ' panel: ' + cls);
      }
    });
    ROLE_WORDS.forEach(function (word) {
      ['tray', 'objective', 'prompt', 'ledgerCitizens'].forEach(function (name) {
        if (s[name].toLowerCase().indexOf(word) !== -1) {
          roleColourOutside.push(where + ' ' + name + ': the word "' + word + '"');
        }
      });
      if (over) return;
      var hay = s.panel.toLowerCase();
      var at = hay.indexOf(word);
      while (at !== -1) {
        var near = hay.slice(Math.max(0, at - 40), at + word.length + 40);
        view.players.forEach(function (q) {
          if (near.indexOf(q.name.toLowerCase()) !== -1) {
            roleColourOutside.push(where + ' panel: "' + word + '" beside ' + q.name);
          }
        });
        at = hay.indexOf(word, at + 1);
      }
    });
    /* The card is where role colour lives, and it must genuinely be there. */
    check(ROLE_CLASSES.indexOf('r-' + view.you.role) !== -1 &&
      (doc.made.card.className || '').indexOf('r-' + view.you.role) !== -1,
      'the private card is not carrying its role class at ' + where);

    /* The log never reaches a permanent surface. */
    view.log.slice(-6).forEach(function (e) {
      if (e.text.length > 12 && (s.tray + s.card).indexOf(e.text) !== -1) {
        ledgerLeaks.push(where + ': the log is on the ' +
          (s.tray.indexOf(e.text) !== -1 ? 'tray' : 'card'));
      }
    });

    if (waiting) panels.close();
    if (withLedger) panels.closeLedger();

    /* The permutation, on a sample of states — it rewrites the game object and
     * rebuilds two surfaces, so it is run one state in seven rather than on all
     * of them. Both surfaces, because the card is the one that legitimately
     * reads hidden fields and is therefore the one that could read the wrong
     * ones. */
    if (states % 7 === 0) {
      var undo = permuteHidden(G, humanId);
      if (undo) {
        var v2 = View.viewFor(G, humanId, { waitingFor: waiting });
        var t2 = JSON.stringify(trayFor(v2, { holding: false, armed: true }));
        var c2 = JSON.stringify(cardFor(v2, { night: false }));
        undo();
        var v1 = View.viewFor(G, humanId, { waitingFor: waiting });
        check(t2 === JSON.stringify(trayFor(v1, { holding: false, armed: true })),
          'the tray changed when roles this seat may not know were rewritten, at ' + where);
        check(c2 === JSON.stringify(cardFor(v1, { night: false })),
          'the private card changed when roles this seat may not know were rewritten, at ' + where);
        permutations++;
      }
    }
    return { view: view, waiting: waiting };
  }

  var gameOvers = 0;
  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var seed = 1000 + g * 7919;
    var humanIndex = g % count;
    var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: humanIndex, seed: seed });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: humanIndex });
    var decide = scriptedPlayer(g);
    var where = 'seed ' + seed + '/' + count + 'p/seat ' + humanIndex;

    /* The public fold, beside the match, so the ledger has something real to
     * render. No speech: this suite is about the surfaces, and test/ledger.
     * test.js is the one that plays with an orator running. */
    var record = Floor.createRecord();
    Floor.observe(record, G);
    audit(G, session, humanIndex, where + ' step 0', record);
    var guard = 0;
    while (!session.over && guard < 600) {
      guard++;
      var w = session.waitingFor();
      if (w) session.submit(decide(w, session));
      else if (!session.advanceBots()) break;
      Floor.observe(record, G);
      audit(G, session, humanIndex, where + ' step ' + guard, record);
    }
    if (G.phase === SD.PHASE.GAME_OVER) gameOvers++;
  }
  check(gameOvers === GAMES, 'not every swept match reached game over');
  check(blankRows === 0, blankRows + ' tray states were blank');
  check(deaths > 0, 'no swept match purged the human, so the dead row was never produced');
  check(handStates > 0, 'no swept state put tiles in the human hand');
  check(roleColourOutside.length === 0,
    'role colour outside the private card: ' + roleColourOutside.slice(0, 3).join(' · '));
  check(ledgerLeaks.length === 0,
    'something routed to the ledger is on screen: ' + ledgerLeaks.slice(0, 3).join(' · '));
  check(permutations > 200, 'only ' + permutations + ' hidden-role permutations were run');
  check(ledgerStates > 500, 'only ' + ledgerStates + ' states were swept with the ledger open');

  /*
   * Coverage is checked at the very bottom of this file, after the constructed
   * positions below have contributed their rows — the Block and the Foresight
   * read are rarer than a scripted sweep, and a coverage gate that ran before
   * them would either be weaker or would fail honestly and uselessly.
   */
  /*
   * The REACHABLE set. `empty:vote`, `empty:vote_result` and `empty:chaos` are
   * deliberately absent: a living seat always owes a ballot in the vote phase
   * and both acknowledgement gates fire for every seat, so those three rows can
   * only be produced by a future change to humanTurn() — exactly the three
   * starred ids src/play/objective.js carries for the same reason. They are
   * still admitted ids, so the never-blank rule covers them if they ever fire.
   */

  /* ------------------------------- 4a. the tray row random play never sees */

  /*
   * The Block, constructed.
   *
   * A human Speaker answering a Block is the fourth tray decision and it is
   * rarer than fifty matches of scripted play — the same hole test/objective.
   * test.js fills the same way, through the engine's own transition rather than
   * by assigning a phase by hand. Without this, the row that carries the two
   * keys that are neither a citizen nor a ballot would ship untested.
   */
  (function () {
    var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 31337 });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });
    G.seize = 5;
    G.blockUnlocked = true;
    G.speaker = 0;
    G.deputy = 1;
    G.lastVote = { aye: [0, 1], nay: [], passed: true, speaker: 0, nominee: 1 };
    G.deputyHand = [SD.TILE.SEIZE, SD.TILE.SEIZE];
    G.phase = SD.PHASE.LEGISLATIVE_DEPUTY;
    SD.proposeBlock(G);
    if (!check(G.phase === SD.PHASE.BLOCK_RESPONSE, 'the constructed Block did not take')) return;

    var w = session.waitingFor();
    var v = View.viewFor(G, 0, { waitingFor: w });
    var offered = trayFor(v, {});
    var armedRow = trayFor(v, { armed: true });
    idsSeen[offered.id] = (idsSeen[offered.id] || 0) + 1;
    idsSeen[armedRow.id] = (idsSeen[armedRow.id] || 0) + 1;

    check(offered.id === 'own:block_response' && offered.keys.length === 1 &&
      offered.keys[0].key === 'E', 'the offered Block row does not offer E: ' + offered.id);
    check(offered.line.indexOf('2 Bo') !== -1,
      'the Block row does not name the Deputy by number: "' + offered.line + '"');
    check(armedRow.id === 'armed:block_response' && armedRow.keys.length === 2,
      'the armed Block row does not carry two keys');
    check(armedRow.keys[0].key === '1' && armedRow.keys[0].value === w.options[0] &&
      armedRow.keys[1].key === '2' && armedRow.keys[1].value === w.options[1],
      'the armed Block row keys do not carry the options the session advertised');

    submitted.length = 0;
    panels.arm(v, w);
    panels.handleTrayKey({ key: '1' }, v, w);
    check(submitted.length === 1 && submitted[0] === w.options[0],
      'pressing 1 on the armed Block row did not agree to it');
    check(panels.isArmed === false, 'the Block row stayed armed after it was answered');

    /* Esc gives the row back and answers nothing — the same property the panel
     * has, one surface further out. */
    submitted.length = 0;
    panels.arm(v, w);
    panels.handleTrayKey({ key: 'Escape' }, v, w);
    check(submitted.length === 0 && panels.isArmed === false,
      'Esc on an armed tray row either answered something or did not disarm');
    check(session.waitingFor() !== null, 'stepping back from the tray lost the decision');
    say('block         the constructed Block row: offered, armed, answered with 1, and stepped');
    say('              back out of with Esc — the decision still pending afterwards');
  })();

  /* ------------------------------------------- 4b. one number, every path */

  /*
   * The strongest form of the one grammar: the same key, pressed in the two
   * places a citizen can be named, submits the same citizen — and it is the
   * citizen's own permanent number rather than their position in a filtered
   * list. Driven through the real handlers with a real submit callback, not
   * read off the markup.
   */
  (function () {
    var found = 0;
    var mismatches = 0;
    for (var g2 = 0; g2 < 24 && found < 12; g2++) {
      var count2 = 5 + (g2 % 6);
      var G2 = SD.createGame({
        names: NAMES.slice(0, count2), humanIndex: g2 % count2, seed: 4242 + g2 * 131
      });
      var s2 = Human.createSession({
        G: G2, minds: AI.create(G2), humanId: g2 % count2
      });
      var guard2 = 0;
      while (!s2.over && guard2++ < 400) {
        var w2 = s2.waitingFor();
        if (w2 && (w2.kind === 'nominate' || w2.kind === 'power_target')) {
          var v2 = View.viewFor(G2, g2 % count2, { waitingFor: w2 });
          var pick = w2.options[w2.options.length - 1];
          var key = seatKey(pick);

          /* the tray's own offer */
          var t2 = trayFor(v2, { armed: true });
          var offered = t2.keys.filter(function (k) { return k.key === key; });
          if (offered.length !== 1 || offered[0].value !== pick) mismatches++;

          /* the panel's kbd hint */
          panels.open(v2, w2);
          var html = doc.made.panel.innerHTML;
          if (html.indexOf('<kbd>' + key + '</kbd>') === -1) mismatches++;

          /* the panel's key handler */
          submitted.length = 0;
          panels.handleKey({ key: key }, v2, w2);
          if (submitted.length !== 1 || submitted[0] !== pick) mismatches++;

          /* the tray's key handler, after E */
          submitted.length = 0;
          panels.arm(v2, w2);
          panels.handleTrayKey({ key: key }, v2, w2);
          if (submitted.length !== 1 || submitted[0] !== pick) mismatches++;

          /* a key naming somebody who is not on offer answers nothing */
          var absent = null;
          for (var a = 0; a < count2; a++) if (w2.options.indexOf(a) === -1) absent = a;
          if (absent !== null) {
            submitted.length = 0;
            panels.arm(v2, w2);
            panels.handleTrayKey({ key: seatKey(absent) }, v2, w2);
            if (submitted.length !== 0) mismatches++;
            panels.disarm(v2);
          }
          found++;
        }
        if (w2) s2.submit(w2.kind === 'vote' ? true : w2.options[0]);
        else if (!s2.advanceBots()) break;
      }
    }
    check(found >= 12, 'only ' + found + ' citizen-naming decisions were reachable to drive');
    check(mismatches === 0, mismatches + ' input paths disagreed about which citizen a key names');
    say('grammar       ' + found + ' citizen-naming decisions driven through four input paths');
    say('              (tray offer, panel hint, panel keys, tray keys) — one number each');
  })();

  /* ---------------------------------- 4c. permanent, retired, never reused */

  (function () {
    var reused = 0;
    var moved = 0;
    for (var g3 = 0; g3 < 12; g3++) {
      var count3 = 5 + (g3 % 6);
      var G3 = SD.createGame({
        names: NAMES.slice(0, count3), humanIndex: 0, seed: 777 + g3 * 9173
      });
      var s3 = Human.createSession({ G: G3, minds: AI.create(G3), humanId: 0 });
      /* Which number each NAME held, at every step. It may never change, and a
       * dead citizen's number may never appear against anybody else. */
      var held = {};
      var guard3 = 0;
      while (!s3.over && guard3++ < 600) {
        var v3 = View.viewFor(G3, 0, { waitingFor: s3.waitingFor() });
        var byNumber = {};
        v3.players.forEach(function (p) {
          var n = seatNumber(p.id);
          if (held[p.name] === undefined) held[p.name] = n;
          else if (held[p.name] !== n) moved++;
          if (byNumber[n] !== undefined) reused++;
          byNumber[n] = p.name;
        });
        /* The dead keep their entry and their number. */
        v3.players.filter(function (p) { return !p.alive; }).forEach(function (p) {
          if (byNumber[seatNumber(p.id)] !== p.name) reused++;
        });
        var w3 = s3.waitingFor();
        if (w3) s3.submit(w3.kind === 'vote' ? true : w3.options[0]);
        else if (!s3.advanceBots()) break;
      }
    }
    check(moved === 0, moved + ' citizens changed number during a match');
    check(reused === 0, reused + ' numbers were shared by two citizens or handed on at a death');
    say('numbers       permanent across 12 matches, retired on death, never reused, never');
    say('              positional (a filtered option list renumbers nobody)');
  })();

  /* --------------------------------------------- 5. the objective line */

  (function () {
    var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'style.css'), 'utf8');
    var block = css.match(/#objective \{[\s\S]*?\n\}/);
    if (!check(!!block, 'the #objective rule is gone from style.css')) return;
    var frozen = [
      'position: fixed; top: 52px; left: 346px; right: 16px;',
      'font-size: 14px; line-height: 1.35; letter-spacing: 0.01em;',
      'width: fit-content;',
      'max-width: min(760px, 100%);',
      'padding: 7px 16px;'
    ];
    frozen.forEach(function (decl) {
      check(block[0].indexOf(decl) !== -1,
        'the objective line moved or resized — "' + decl + '" is no longer declared');
    });
    /* And no second rule is allowed to move it from somewhere else. */
    var others = css.split('#objective').length - 1;
    check(others === 3, 'the objective line is now styled from ' + others +
      ' places — it had three (the rule, :empty, .act)');

    /*
     * Behaviour, pinned rather than described.
     *
     * The fingerprint below is 466 lines — id, act, object and full text for
     * every state of four fixed matches, with and without the deliberation beat
     * — and its value was produced by running src/play/objective.js AS IT STOOD
     * AT COMMIT 02e44a6, before this gate touched anything. Reproducible:
     *
     *   git show 02e44a6:src/play/objective.js > /tmp/pre.mjs
     *   (and run this same fold against it)
     *
     * So "the objective line's behaviour is unchanged" is a measurement against
     * the pre-gate module, not a claim about a diff.
     */
    var out = [];
    [[1000, 7, 0], [19, 5, 0], [31337, 7, 3], [4242, 9, 8]].forEach(function (fx) {
      var G4 = SD.createGame({
        names: NAMES.slice(0, fx[1]), humanIndex: fx[2], seed: fx[0]
      });
      var s4 = Human.createSession({ G: G4, minds: AI.create(G4), humanId: fx[2] });
      var guard4 = 0;
      var push = function () {
        var v4 = View.viewFor(G4, fx[2], { waitingFor: s4.waitingFor() });
        [false, true].forEach(function (hold) {
          var o = objectiveMod.objectiveFor(v4, { holding: hold });
          out.push([fx[0], fx[1], fx[2], guard4, hold ? 1 : 0, o.id,
            o.act ? 1 : 0, o.at, o.text].join('|'));
        });
      };
      push();
      while (!s4.over && guard4++ < 600) {
        var w4 = s4.waitingFor();
        if (w4) s4.submit(w4.options[0]);
        else if (!s4.advanceBots()) break;
        push();
      }
    });
    var digest = crypto.createHash('sha256').update(out.join('\n')).digest('hex');
    check(out.length === 466, 'the objective fold produced ' + out.length + ' lines, not 466');
    check(digest === 'af70565f766b7265c0a0ed403dd1103311a6251d0de367af615498892196aa99',
      'the objective line changed behaviour: ' + digest);
    say('objective     unchanged — five positioning declarations pinned, and ' + out.length +
        ' lines over four');
    say('              fixed matches hash to the value the pre-gate module produced');
  })();

  /* ------------------------------------------------- 2b. the card in CSS */

  (function () {
    var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'style.css'), 'utf8');
    var block = css.match(/#card \{[\s\S]*?\n\}/);
    if (!check(!!block, 'the #card rule is gone from style.css')) return;
    check(/width:\s*232px/.test(block[0]) && /height:\s*96px/.test(block[0]),
      'the private card no longer declares 232 x 96 px');
    check(/overflow:\s*hidden/.test(block[0]),
      'the private card can be pushed open by its own contents');
    /* Nothing else may set its size — "never grows" has to be structural. */
    var rules = css.split('\n');
    var offenders = [];
    var inCard = false;
    rules.forEach(function (l) {
      if (/^#card[.:# ]/.test(l) || /^#card\b/.test(l)) inCard = /\{/.test(l) ? true : inCard;
      if (inCard && /^#card[^ ]* \{/.test(l) === false && /\}/.test(l)) inCard = false;
      if (/^#card[.:]\S*\s*\{/.test(l) && /(width|height)\s*:/.test(l)) offenders.push(l.trim());
    });
    check(offenders.length === 0,
      'a second rule sizes the private card: ' + offenders.join(' · '));
    /* The one thing that may change with state is opacity, and only at night. */
    check(/#card\.night \{ opacity: 0\.35; \}/.test(css),
      'the private card does not dim to 35% in the night states');

    /* And the sidebar really is gone. */
    check(css.indexOf('#hud') === -1, 'the 330 px sidebar is still styled');
    var html = fs.readFileSync(path.join(__dirname, '..', 'play.html'), 'utf8');
    check(html.indexOf('id="hud"') === -1, 'play.html still carries the sidebar');
    check(html.indexOf('id="card"') !== -1 && html.indexOf('id="tray"') !== -1,
      'play.html is missing the card or the tray');

    /* The nameplate carries the same number the tray and the panel do — the
     * stamp itself is three.js and cannot run here, so the wiring is read. */
    var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'main.js'), 'utf8');
    check(/seatNumber\(p\.id\)/.test(mainSrc),
      'the nameplate is not stamped with the citizen\'s permanent number');
    check(/class="num"/.test(mainSrc), 'the nameplate has no number element');
    check(/marks\.push\('gavel'\)/.test(mainSrc) && /marks\.push\('deputy'\)/.test(mainSrc),
      'the retired speaker/deputy rows did not become brass marks on the plates');
    check(!/screenBias\s*=\s*Math\.min/.test(mainSrc),
      'the camera is still correcting for a sidebar that no longer exists');
  })();

  var REQUIRED = [
    'own:nominate', 'own:vote', 'own:power_target',
    'armed:nominate', 'armed:vote', 'armed:power_target',
    'card:speaker_discard', 'card:deputy_discard',
    'card:acknowledge:morning', 'card:acknowledge:vote_result',
    'beat:vote', 'beat:nominate', 'beat:acknowledge:morning',
    'beat:speaker_discard', 'beat:deputy_discard',
    'own:block_response', 'armed:block_response',
    'card:power_ack:foresight',
    'empty:nomination', 'empty:legislative_speaker', 'empty:legislative_deputy',
    'empty:power', 'empty:block_response',
    'announce', 'dead', 'over'
  ];
  REQUIRED.forEach(function (id) {
    check(idsSeen[id] > 0, 'no state in ' + GAMES + ' matches produced the "' + id + '" tray row');
  });
  check(!idsSeen['card:unknown'] && !idsSeen['beat:unknown'] && !idsSeen['empty:unknown'],
    'a state fell through to a generic tray row — every phase and kind must map');

  say('sweep         ' + states + ' tray states over ' + GAMES +
      ' complete matches (5-10 players, the human seat');
  say('              rotated), four presentations each: offered, armed, beat, announcement');
  say('never blank   0 empty rows; ' + keyedStates + ' states offered keys and every state that');
  say('              offered none said who the square was waiting for instead');
  say('card          232 x 96 in every state; ' + handStates +
      ' states held tiles and added the fourth line');
  say('ledger        opened over ' + ledgerStates + ' of them and swept with the rest');
  say('role colour   swept the tray, the objective, the prompt, the panel and the ledger');
  say('              in ' + states + ' states:');
  say('              nowhere but the private card, the game-over reveal excepted');
  say('permutation   ' + permutations + ' hidden-role permutations left the tray and the card');
  say('              byte-identical');
  say('routed        deck, discard, the log and the chaos track below 2/3 appear on no');
  say('              permanent surface — they are the ledger\'s, and only the ledger\'s');
  say('coverage      ' + Object.keys(idsSeen).length + ' distinct tray rows: ' +
      Object.keys(idsSeen).sort().join(', '));

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
