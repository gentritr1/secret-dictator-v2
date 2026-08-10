/*
 * The ledger: the panel where the evidence becomes reviewable.
 *
 *     node test/ledger.test.js [games]        (npm run test:ledger)
 *
 * Gate D4 turns `Floor.ledger()` — a fold that has existed and been tested
 * since D1 and had never been looked at — into 420 px of panel. Which means the
 * question this file has to answer is not "is the fold right" (test/floor.test.js
 * owns that) but "does the RENDER say anything the record does not":
 *
 *  1. NO ORPHAN ROWS. Every row carries `trace`, the ids it was folded from,
 *     and every one of those ids resolves against the record it came from: an
 *     utterance, a government, a power, a flag, the citizen's own roster entry,
 *     or the public board. A row that traces to nothing is a row the panel
 *     invented, and inventing is the one thing a ledger may not do.
 *
 *  2. NO SCORE, NO TRUST METER, NO PERCENTAGE, NO HIDDEN STATE. Swept as words
 *     over everything the panel writes, and as KEYS over the model, using
 *     src/engine/floor.js's own forbidden list rather than a second copy of it.
 *
 *  3. A FLAG NAMES A RULE AND STOPS. Every flag row is swept for verdict
 *     language over the text THIS MODULE writes — never over the sentences
 *     citizens say, because a citizen calling somebody a liar is the game and
 *     the ledger doing it is the bug. And C3, which structurally cannot say
 *     which of the two lied, appears on BOTH entries with the same id.
 *
 *  4. THE RENDER IS BLIND. A permutation of the roles this seat may not know
 *     leaves the rendered markup byte-identical GIVEN THE SAME RECORD — the
 *     re-scoped claim of docs/step-10.md §1, carried one layer out from the fold
 *     to the pixels.
 *
 *  5. IT TOUCHES NOTHING. Opening the panel, jumping around it, filtering it
 *     and closing it leaves the session's event log and the utterance record
 *     byte-identical. The pause itself is a browser fact and is reported in
 *     docs/step-12.md; what is provable here is that the render and its three
 *     keys are read-only, and that the loop's bot branch is gated on the panel.
 *
 *  6. ROLE COLOUR, STILL ONCE. D3's sweep, extended: the r-* channel appears
 *     nowhere in the ledger in any state, and the role WORDS appear only in the
 *     one block that is about you and names no citizen.
 *
 * Everything runs headlessly against real matches through the REAL render path
 * — src/play/panels.js driving a stub document, the idiom every UI suite in
 * this repo has used since Step 4 — with real utterance records produced by the
 * real orator.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Human = require('../src/engine/human-driver.js');
var View = require('../src/engine/view.js');
var Driver = require('../src/engine/driver.js');
var Floor = require('../src/engine/floor.js');
var Orator = require('../src/engine/orator.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
var ROLE_WORDS = ['loyalist', 'rebel', 'dictator'];
var ROLE_CLASSES = ['r-loyalist', 'r-rebel', 'r-dictator'];

/*
 * Verdict language: what a panel of evidence may not say.
 *
 * Every one of these is a word that does the reader's work for them — it either
 * names who lied, or attaches a number to a person. `%` is in the list because
 * the handoff's own line about this panel is "no score, no trust meter, no
 * suspicion 68%", and a percentage is the shape that claim is about.
 */
var VERDICT_WORDS = [
  'lied', 'lying', 'liar', 'lies', 'dishonest', 'honest', 'guilty', 'innocent',
  'trust', 'trustworthy', 'suspicion', 'suspicious', 'suspect', 'confidence',
  'sincerity', 'probably', 'certainly', 'must be', 'verdict', 'score', 'likely',
  'rating', 'meter', '%'
];

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

/* The document panels.js reaches for. Same stub as test/hud.test.js. */
function stubDocument() {
  var made = {};
  function el() {
    return {
      innerHTML: '', textContent: '', className: '', scrollTop: 0, scrollHeight: 0,
      classList: { add: function () {}, remove: function () {}, toggle: function () {} },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      setAttribute: function () {}, removeAttribute: function () {},
      addEventListener: function () {}, focus: function () {}
    };
  }
  return {
    made: made,
    activeElement: null,
    getElementById: function (id) {
      if (!made[id]) made[id] = el();
      return made[id];
    }
  };
}

/*
 * A match with a real argument in it.
 *
 * The same order test/orator.test.js's harness uses, and for the same reason:
 * fold, file the event into the seat's own hand memory, run the floor for the
 * transition that just happened, and only THEN acknowledge the morning. Every
 * trigger is convened here rather than sampled — the browser's `CONVENE` gate is
 * a taste dial and a test that wants flags wants the floors.
 */
function playWithOrator(seed, count, humanSeat) {
  var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: 0, seed: seed });
  var minds = AI.create(G);
  var record = Floor.createRecord();
  var memory = Orator.createMemory();
  var ctx = {
    draw: Orator.streamFor(seed), minds: minds, memory: memory,
    humanSeat: humanSeat === undefined ? null : humanSeat
  };
  var day = G.day;
  var guard = 0;

  function floorNow() {
    var ts = Floor.triggers(record);
    if (ts.length) Orator.holdFloor(record, ts[0], ctx);
  }

  Floor.observe(record, G);
  while (G.phase !== SD.PHASE.GAME_OVER && guard < 4000) {
    var ev = Driver.step(G, minds);
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
  return { G: G, record: record, steps: guard };
}

/** The permutation idiom, from test/orator.test.js §7. */
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

/**
 * The projection the page hands the panel, built here the same way
 * src/play/floor-voice.js's `source()` builds it — entries from `Floor.ledger`,
 * which is the fold the panel RENDERS and does not recompute.
 */
function sourceOf(record) {
  var copy = function (v) { return JSON.parse(JSON.stringify(v)); };
  return {
    day: record.day,
    entries: Floor.ledger(record),
    utterances: copy(record.utterances),
    governments: copy(record.governments),
    powers: copy(record.powers),
    purges: copy(record.purges),
    floors: copy(record.floors),
    flags: copy(Floor.contradictions(record))
  };
}

/** Every row in a model, flattened, with where it came from. */
function allRows(model) {
  var out = [];
  if (model.objective) out.push({ where: 'objective', row: model.objective });
  model.promoted.forEach(function (r) { out.push({ where: 'promoted', row: r }); });
  model.citizens.forEach(function (c) {
    c.groups.forEach(function (g) {
      g.rows.forEach(function (r) {
        out.push({ where: 'seat ' + c.number + '/' + g.id, row: r });
      });
    });
    if (c.dead) out.push({ where: 'seat ' + c.number + '/dead', row: c.dead, text: c.dead.text });
  });
  return out;
}

/*
 * The record's forbidden-key list, minus the seven that are about a RECORD
 * being free of prose, names and board scalars rather than about hidden state.
 *
 * A ledger is a rendering: it is made of text and it names people, which is
 * exactly what an utterance may never do. What it may not hold is what nobody
 * on the square can see — a role, a team, a hand, or anything weighted.
 */
var RENDER_ALLOWED = ['text', 'prose', 'sentence', 'name', 'names', 'deck', 'discard'];
var HIDDEN_KEYS = Floor.FORBIDDEN_KEYS.filter(function (k) {
  return RENDER_ALLOWED.indexOf(k) === -1;
});

/** Walk any structure for a hidden-state KEY, using the engine's own list. */
function forbiddenKeys(node, at, out) {
  out = out || [];
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(function (v, i) { forbiddenKeys(v, at + '[' + i + ']', out); });
    return out;
  }
  Object.keys(node).forEach(function (k) {
    if (HIDDEN_KEYS.indexOf(k) !== -1) out.push(at + '.' + k);
    forbiddenKeys(node[k], at + '.' + k, out);
  });
  return out;
}

var GAMES = parseInt(process.argv[2], 10) || 24;

async function main() {
  var ledgerMod = await import('../src/play/ledger.js');
  var panelsMod = await import('../src/play/panels.js');
  var seatMod = await import('../src/play/seat.js');
  var trayMod = await import('../src/play/tray.js');
  var voiceMod = await import('../src/play/floor-voice.js');

  var ledgerFor = ledgerMod.ledgerFor;
  var seatNumber = seatMod.seatNumber;
  var seatKey = seatMod.seatKey;

  /* ------------------------------------------------- 0. the module's shape */

  (function () {
    ROLE_WORDS.forEach(function (role) {
      var text = ledgerMod.WIN_CONDITION[role];
      check(typeof text === 'string' && text.length > 20,
        'the ' + role + ' has no win condition in the ledger');
    });
    ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].forEach(function (rule) {
      check(typeof ledgerMod.FLAG_RULE[rule] === 'string' &&
        ledgerMod.FLAG_RULE[rule].length > 10,
        'contradiction rule ' + rule + ' has no description in the ledger');
    });
    var keys = ledgerMod.LEDGER_KEYS.map(function (k) { return k.key; }).join(' ');
    check(keys === 'L 1–9 F Esc', 'the ledger offers the wrong keys: ' + keys);
    check(ledgerMod.LEDGER_BOX.width === 420, 'the ledger is no longer 420px');

    /* The affordance the tray draws is live now, in every state — D3 drew it
     * dim on purpose because the key opened nothing. */
    check(trayMod.trayFor(null, {}).ledger.ready === true,
      'the tray still draws the ledger hint as an affordance that does nothing');
    check(trayMod.trayFor(null, {}).ledger.label.indexOf('win') !== -1,
      'the tray hint does not say what is in the ledger before it has been opened');
    check(trayMod.trayFor(null, { ledgerSeen: true }).ledger.label === 'ledger',
      'the tray hint keeps explaining the ledger after it has been opened');
  })();

  /* ---------------------------------------------------- 1-6. the sweep */

  var doc = stubDocument();
  var panels = panelsMod.createPanels(doc, { onSubmit: function () {} });

  var groupsSeen = {};
  var rowsChecked = 0;
  var orphans = [];
  var verdicts = [];
  var scores = [];
  var hidden = [];
  var roleChannel = [];
  var roleWords = [];
  var pairs = 0;
  var pairsSplit = [];
  var flaggedEntries = 0;
  var deadEntries = 0;
  var jumps = 0;
  var jumpMisses = 0;
  var permutations = 0;
  var missingSentences = 0;
  var matchesWithFlags = 0;

  for (var g = 0; g < GAMES; g++) {
    var count = 5 + (g % 6);
    var seed = 1000 + g * 7919;
    var seat = g % count;
    var m = playWithOrator(seed, count, g % 3 === 0 ? seat : null);
    var record = m.record;
    var src = sourceOf(record);
    var view = View.viewFor(m.G, seat, { waitingFor: null });
    var where = 'seed ' + seed + '/' + count + 'p/seat ' + seat;

    /* Every id the record can be traced back to. */
    var known = {};
    record.utterances.forEach(function (u) { known[u.id] = 1; });
    record.governments.forEach(function (x) { known[x.id] = 1; });
    record.powers.forEach(function (x) { known[x.id] = 1; });
    record.floors.forEach(function (x) { known[x.id] = 1; });
    src.flags.forEach(function (f) { known[f.id] = 1; });
    view.players.forEach(function (p) { known['seat:' + seatNumber(p.id)] = 1; });
    known.board = 1;

    var model = ledgerFor(view, src, {});
    missingSentences += model.missingSentences;

    /* --- 1. the fold is RENDERED, not recomputed --------------------- */
    check(model.citizens.length === src.entries.length,
      'the ledger shows ' + model.citizens.length + ' entries for ' +
      src.entries.length + ' in the fold at ' + where);
    check(model.citizens.map(function (c) { return c.seat; }).join(',') ===
      src.entries.map(function (e) { return e.seat; }).join(','),
      'the ledger reordered or dropped a citizen at ' + where);

    /* --- 1. no orphan rows ------------------------------------------- */
    allRows(model).forEach(function (item) {
      rowsChecked++;
      var r = item.row;
      if (!r.trace || !r.trace.length) {
        orphans.push(where + ' ' + item.where + ': "' + (r.text || '') + '" traces to nothing');
        return;
      }
      r.trace.forEach(function (id) {
        if (!known[id]) orphans.push(where + ' ' + item.where + ': trace ' + id +
          ' is in no public record');
      });
    });

    /* --- 2. and 3. what the panel is allowed to say ------------------- */
    allRows(model).forEach(function (item) {
      var r = item.row;
      var text = String(r.text || '');
      /* The verdict sweep runs over the panel's OWN voice. `said` rows are
       * citizens speaking, rendered from their text_id, and a citizen may
       * accuse whoever they like — that is the game. */
      if (r.voice === 'record') {
        VERDICT_WORDS.forEach(function (w) {
          if (text.toLowerCase().indexOf(w) !== -1) {
            verdicts.push(where + ' ' + item.where + ': "' + w + '" in "' + text + '"');
          }
        });
      }
      /* A number attached to a person is banned in every voice. */
      if (/\d\s*%/.test(text) || /\b(score|trust meter|suspicion)\b/i.test(text) ||
          /\d\s*%/.test(String(r.said || ''))) {
        scores.push(where + ' ' + item.where + ': ' + text);
      }
    });
    hidden = hidden.concat(forbiddenKeys(model, where));

    /* --- 3. flags: a mark, a rule, its refs, and no more -------------- */
    var flagsOf = {};
    src.flags.forEach(function (f) { flagsOf[f.id] = f; });
    if (src.flags.length) matchesWithFlags++;
    model.citizens.forEach(function (c) {
      if (!c.flagCount) return;
      flaggedEntries++;
      check(c.flagIds.length === c.flagCount,
        'the entry mark and the flag list disagree at ' + where);
      c.flagIds.forEach(function (id) {
        check(!!flagsOf[id], 'the ledger shows a flag the record does not hold at ' + where);
        var f = flagsOf[id];
        check(f.seats.indexOf(c.seat) !== -1,
          'flag ' + id + ' is on an entry it does not name at ' + where);
        /* The rule line and one row per reference must all be present. */
        var rows = [];
        c.groups.forEach(function (gr) {
          gr.rows.forEach(function (r) { if (r.flag === id) rows.push(r); });
        });
        check(rows.some(function (r) { return r.mark && r.text.indexOf(f.rule) !== -1; }),
          'flag ' + id + ' is on the entry without naming its rule at ' + where);
        f.refs.utterances.forEach(function (uid) {
          check(rows.some(function (r) { return r.trace.indexOf(uid) !== -1; }),
            'flag ' + id + ' does not show its reference ' + uid + ' at ' + where);
        });
        f.refs.governments.forEach(function (gid) {
          check(rows.some(function (r) { return r.trace.indexOf(gid) !== -1; }),
            'flag ' + id + ' does not show its government ' + gid + ' at ' + where);
        });
      });
    });

    /* C3 is a PAIR and cannot say which of the two lied — so it must be on
     * both entries, with the same id, in every match that produces one. */
    src.flags.filter(function (f) { return f.rule === 'C3'; }).forEach(function (f) {
      pairs++;
      var on = model.citizens.filter(function (c) { return c.flagIds.indexOf(f.id) !== -1; });
      if (on.length !== f.seats.length) {
        pairsSplit.push(where + ': ' + f.id + ' is on ' + on.length + ' of ' +
          f.seats.length + ' entries');
      }
    });

    /* --- the dead keep their entry and their number ------------------- */
    view.players.filter(function (p) { return !p.alive; }).forEach(function (p) {
      var e = model.citizens.filter(function (c) { return c.seat === p.id; });
      check(e.length === 1 && e[0].number === seatNumber(p.id) && e[0].alive === false,
        'a purged citizen lost their ledger entry or their number at ' + where);
      if (e.length) deadEntries++;
    });

    model.citizens.forEach(function (c) {
      c.groups.forEach(function (gr) {
        groupsSeen[gr.id] = (groupsSeen[gr.id] || 0) + 1;
        check(ledgerMod.GROUP_IDS.indexOf(gr.id) !== -1,
          'the ledger produced a group it does not admit to: ' + gr.id);
      });
    });

    /* --- 6. role colour and role words, through the real render ------- */
    panels.openLedger(view, src);
    var html = doc.made.ledger.innerHTML;
    ROLE_CLASSES.forEach(function (cls) {
      if (html.indexOf(cls) !== -1) roleChannel.push(where + ': ' + cls);
    });
    /*
     * The words are a different rule, and the split is structural rather than a
     * character count: the ONE block allowed to say "Dictator" is the block
     * about you, which names no citizen — and the block that names every
     * citizen may not say it at all. Stronger than the panel's 40-character
     * proximity rule and it needs no arithmetic.
     */
    var objBlock = html.slice(html.indexOf('<div class="obj"'), html.indexOf('<div class="prom">'));
    var citBlock = html.slice(html.indexOf('<div class="cits">'), html.indexOf('<footer'));
    ROLE_WORDS.forEach(function (w) {
      if (citBlock.toLowerCase().indexOf(w) !== -1) {
        roleWords.push(where + ': the word "' + w + '" beside the citizens');
      }
    });
    view.players.forEach(function (p) {
      if (objBlock.indexOf(p.name) !== -1) {
        roleWords.push(where + ': ' + p.name + ' is named in the objective block');
      }
    });
    check(html.indexOf('paused') !== -1, 'the ledger header does not say "paused" at ' + where);
    check(citBlock.indexOf('⚑') !== -1 || !src.flags.length,
      'a match with flags rendered no mark at ' + where);

    /* --- 1-9 jumps to the citizen owning that number, dead included --- */
    view.players.forEach(function (p) {
      var consumed = panels.handleLedgerKey({ key: seatKey(p.id) }, view, src);
      var landed = panels.ledger.citizens.filter(function (c) { return c.focused; });
      jumps++;
      if (!consumed || landed.length !== 1 || landed[0].seat !== p.id ||
          landed[0].number !== seatNumber(p.id)) jumpMisses++;
    });

    /* --- F shows the flagged only, and the jump overrides it ---------- */
    panels.handleLedgerKey({ key: 'f' }, view, src);
    var filtered = panels.ledger;
    check(filtered.flaggedOnly === true || filtered.focus !== null,
      'F did not filter at ' + where);
    check(filtered.citizens.every(function (c) { return c.flagCount > 0; }) ||
      filtered.flaggedOnly === false,
      'the flagged-only filter is showing unflagged citizens at ' + where);
    panels.handleLedgerKey({ key: 'f' }, view, src);

    /* --- 4. the render is blind, GIVEN the record --------------------- */
    panels.handleLedgerKey({ key: seatKey(0) }, view, src);
    var before = doc.made.ledger.innerHTML;
    var undo = permuteHidden(m.G, seat);
    if (undo) {
      var v2 = View.viewFor(m.G, seat, { waitingFor: null });
      panels.closeLedger();
      panels.openLedger(v2, sourceOf(record));
      panels.handleLedgerKey({ key: seatKey(0) }, v2, sourceOf(record));
      var after = doc.made.ledger.innerHTML;
      undo();
      check(after === before,
        'the ledger rendered differently for roles this seat may not know, at ' + where);
      permutations++;
    }
    panels.closeLedger();
  }

  check(orphans.length === 0,
    orphans.length + ' ledger rows trace to nothing: ' + orphans.slice(0, 3).join(' · '));
  check(verdicts.length === 0,
    'the ledger reached a verdict: ' + verdicts.slice(0, 3).join(' · '));
  check(scores.length === 0,
    'the ledger put a number on a person: ' + scores.slice(0, 3).join(' · '));
  check(hidden.length === 0,
    'a forbidden field reached the ledger model: ' + hidden.slice(0, 3).join(' · '));
  check(roleChannel.length === 0,
    'the role channel is in the ledger: ' + roleChannel.slice(0, 3).join(' · '));
  check(roleWords.length === 0,
    'a role word is beside a citizen in the ledger: ' + roleWords.slice(0, 3).join(' · '));
  check(pairsSplit.length === 0,
    'a C3 pair is not on both entries: ' + pairsSplit.slice(0, 3).join(' · '));
  check(pairs > 0, 'no C3 pair flag was produced in ' + GAMES + ' matches — §3 is vacuous');
  check(flaggedEntries > 0, 'no flagged entry was rendered — the mark is untested');
  check(deadEntries > 0, 'no citizen was purged — the dead entry is untested');
  check(jumpMisses === 0, jumpMisses + ' of ' + jumps + ' jumps landed on the wrong citizen');
  check(permutations > 10, 'only ' + permutations + ' role permutations were rendered');
  check(missingSentences === 0,
    missingSentences + ' utterances rendered without a sentence in the table');

  /*
   * Coverage. Two group ids are deliberately not required:
   *
   *   `quiet` — a citizen who has done nothing at all. Every seat in a sweep
   *             that convenes every floor has spoken or voted by the end.
   *   `flags` — the fallback bucket for a flag whose references include none of
   *             this citizen's own claims. Every rule the engine produces puts
   *             the flagged seat's own utterance in `refs`, so every flag is
   *             placed under the claim it is about and the bucket stays empty.
   *             It is kept because `contradictions()` also runs over records
   *             this repo did not build — a replay, a future wire format — and
   *             a flag with nowhere to go must not vanish.
   *
   * Both are reachable and both are rendered by code the sweep exercises; they
   * are listed rather than dropped so the gap is a statement, not a silence.
   */
  var REQUIRED = ['claims', 'accused', 'challenged', 'supported', 'backed',
    'asked', 'silences', 'ballots', 'seats', 'unclaimed', 'powers'];
  REQUIRED.forEach(function (id) {
    check(groupsSeen[id] > 0, 'no entry in ' + GAMES + ' matches produced the "' + id + '" group');
  });

  /* ------------------------------------------------- 5. it touches nothing */

  /*
   * The half of "pinning pauses the presentation, not the game" that a headless
   * suite can prove: the panel, its three keys and its render are READ-ONLY.
   *
   * A real session is played to the middle of a match, its event log and the
   * utterance record are hashed, and then the ledger is opened, jumped around,
   * filtered, re-rendered two hundred times and closed. If anything in the
   * render path could reach the session, this is where it would show. The other
   * half — that the LOOP stops calling the engine — is asserted against the
   * source below and measured in the browser (docs/step-12.md).
   */
  (function () {
    var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 1006 });
    var session = Human.createSession({ G: G, minds: AI.create(G), humanId: 0 });
    var record = Floor.createRecord();
    var memory = Orator.createMemory();
    var ctx = { draw: Orator.streamFor(1006), minds: session.minds || AI.create(G),
      memory: memory, humanSeat: 0 };
    var guard = 0;
    Floor.observe(record, G);
    while (guard++ < 40 && !session.over) {
      var w = session.waitingFor();
      if (w) session.submit(w.kind === 'vote' ? true : w.options[0]);
      else if (!session.advanceBots()) break;
      Floor.observe(record, G);
      var ts = Floor.triggers(record);
      if (ts.length) Orator.holdFloor(record, ts[0], ctx);
    }
    var view = View.viewFor(G, 0, { waitingFor: session.waitingFor() });
    var src = sourceOf(record);
    var logBefore = j(G.log);
    var recordBefore = j(record);
    var waitingBefore = j(session.waitingFor());

    var doc2 = stubDocument();
    var p2 = panelsMod.createPanels(doc2, { onSubmit: function () {} });
    p2.openLedger(view, src);
    for (var i = 0; i < 200; i++) {
      p2.handleLedgerKey({ key: String((i % 7) + 1) }, view, src);
      if (i % 20 === 0) p2.handleLedgerKey({ key: 'f' }, view, src);
      p2.renderLedger(view, src);
    }
    p2.closeLedger();

    check(j(G.log) === logBefore, 'the event log changed while the ledger was open');
    check(j(record) === recordBefore, 'the utterance record changed while the ledger was open');
    check(j(session.waitingFor()) === waitingBefore,
      'the pending decision changed while the ledger was open');
    check(p2.isLedgerOpen === false, 'the ledger did not close');
    say('read-only     200 renders, 200 jumps and 10 filter toggles over a live session:');
    say('              event log, utterance record and pending decision byte-identical');
  })();

  /* ------------------------------------------- the wiring, read from source */

  (function () {
    var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'ledger.js'), 'utf8');
    /* The trust boundary is what is in scope, exactly as it is for tray.js,
     * card.js and objective.js: this module cannot leak what it cannot reach. */
    var imports = src.match(/^import .*$/gm) || [];
    imports.forEach(function (line) {
      check(!/engine|\.\.\//.test(line),
        'the ledger imports outside src/play: ' + line);
    });
    check(!/\bG\.|session|submit\(/.test(src),
      'the ledger reaches for the game object');

    var main = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'main.js'), 'utf8');
    /* The pause, as the loop sees it: tick() returns before it can ask a bot to
     * move, and the presentation clock is frozen rather than the deadlines
     * being shifted by hand. */
    check(/function tick\(\)\s*\{[\s\S]{0,1200}?if \(panels\.isLedgerOpen\) return;/.test(main),
      'the match loop still advances the bots while the ledger is pinned');
    check(/function nowMs\(\)\s*\{\s*return \(pausedAt \|\| performance\.now\(\)\) - pausedFor;/
      .test(main), 'the presentation clock is not the paused one');
    /* And nothing but the render loop's frame delta reads the wall clock. */
    var raw = main.split('\n')
      .filter(function (l) { return !/^\s*\*/.test(l); })
      .join('\n').match(/performance\.now\(\)/g);
    check((raw || []).length === 5, 'wall-clock reads in main.js: ' + (raw || []).length +
      ' (expected 5 — nowMs itself, the pin, the unpin, the readback, and the frame' +
      ' delta; everything else must go through nowMs so the pause holds it)');

    var css = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'style.css'), 'utf8');
    var block = css.match(/#ledger \{[\s\S]*?\n\}/);
    if (check(!!block, 'the #ledger rule is gone from style.css')) {
      check(/width:\s*420px/.test(block[0]), 'the ledger no longer declares 420px');
      check(/right:\s*12px/.test(block[0]), 'the ledger is no longer on the right');
    }
    /* The role channel may not be styled into it from the sheet either. */
    var ledgerRules = css.split('\n').filter(function (l) { return /^#ledger/.test(l); });
    check(ledgerRules.every(function (l) { return !/r-(loyalist|rebel|dictator)/.test(l); }),
      'the stylesheet gives the ledger a role colour');

    var html = fs.readFileSync(path.join(__dirname, '..', 'play.html'), 'utf8');
    check(html.indexOf('id="ledger"') !== -1, 'play.html has no ledger');
    check(/<b>L<\/b>/.test(html), 'the keys line does not mention L');
  })();

  /* --------------------------------------------- the win condition, moved */

  (function () {
    /*
     * D3's carried regression: the role's win condition survived only as the
     * private card's `title`, which is discoverable by hover and therefore not
     * discoverable. It is the ledger's first line now — and the card's tooltip
     * reads the SAME constant, so the two cannot drift.
     */
    var panelsSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'play', 'panels.js'), 'utf8');
    check(/ROLE_BLURB = WIN_CONDITION/.test(panelsSrc),
      'the card tooltip and the ledger keep two copies of the win condition');

    var G = SD.createGame({ names: NAMES.slice(0, 7), humanIndex: 0, seed: 1000 });
    ROLE_WORDS.forEach(function (role) {
      G.players[0].role = role;
      G.players[0].team = role === 'loyalist' ? SD.TEAM.LOYALIST : SD.TEAM.REBEL;
      var v = View.viewFor(G, 0, { waitingFor: null });
      var model = ledgerFor(v, sourceOf(Floor.createRecord()), {});
      check(model.objective.text === ledgerMod.WIN_CONDITION[role],
        'the ledger shows the wrong win condition for a ' + role);
      check(model.objective.trace.length === 1 &&
        model.objective.trace[0] === 'seat:1',
        'the win condition traces to nothing');
      /* It is about the board, and names nobody. */
      v.players.forEach(function (p) {
        check(model.objective.text.indexOf(p.name) === -1,
          'the win condition names a citizen');
      });
    });
  })();

  say('sweep         ' + rowsChecked + ' rows over ' + GAMES +
      ' complete matches (5-10 citizens, the viewing seat');
  say('              rotated), every trigger convened — ' + matchesWithFlags +
      ' of them produced flags');
  say('trace         every row resolved to an utterance, a government, a power, a flag,');
  say('              a roster entry or the board — 0 orphans');
  say('flags         ' + flaggedEntries + ' flagged entries: rule named, every ref shown, ' +
      pairs + ' C3 pairs');
  say('              on both entries; 0 verdicts, 0 scores, 0 percentages');
  say('dead          ' + deadEntries + ' purged citizens kept their entry and their number');
  say('keys          ' + jumps + ' jumps by permanent number, dead included, 0 misses');
  say('permutation   ' + permutations + ' role rotations left the RENDERED markup byte-identical');
  say('role colour   the r-* channel appears nowhere in the panel; the role words appear');
  say('              only in the block that is about you and names nobody');
  say('coverage      ' + Object.keys(groupsSeen).length + ' distinct groups: ' +
      Object.keys(groupsSeen).sort().join(', '));

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
