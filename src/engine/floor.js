/*
 * Secret Dictator — the floor: speech as canonical engine data.
 *
 * This is the first deliberate ENGINE EXTENSION since the v1 port. The five
 * files beside it (engine.js, ai.js, driver.js, human-driver.js, view.js) are
 * byte-frozen against the v1 oracle and are not touched by anything here; this
 * module only *reads* a game, and only through the public window defined by
 * `publicSnapshot()` below.
 *
 * WHAT THIS FILE IS
 * -----------------
 * A structured claim schema. When a citizen speaks — bot or player — the thing
 * that gets recorded is not prose but a small, validated, ordinal-addressed
 * record:
 *
 *     { id, day, floor, seq, speaker, kind, target, basis, refs, amends, text_id }
 *
 * Seat numbers, never names. Ids, never objects. `text_id`, never a sentence.
 * That makes the utterance stream diffable, translatable, replayable, and — the
 * point — *analysable*: a contradiction between two claims is a pure function
 * over the record, not a string comparison over rendered prose.
 *
 * WHAT THIS FILE IS NOT, AT THIS STAGE
 * ------------------------------------
 * It is not coupled to anything that decides a rule. The handoff's own rationale
 * says speech must eventually influence what bots believe — that is why it is
 * canonical rather than decoration — but its acceptance list for THIS work item
 * demands that a match with the floor disabled produce the same event log as the
 * same seed with it enabled. Both are right, at different stages, and this is
 * the pre-coupling stage:
 *
 *     utterances are canonical, validated, recorded and analysable,
 *     and NO bot rules-decision reads them.
 *
 * So nothing here draws from the game's seeded stream, calls into ai.js, or
 * writes to the game object in any way — and because that claim is enforced by
 * a grep gate in test/floor.test.js, this paragraph cannot spell the forbidden
 * tokens either, which is the third time a comment has broken its own gate.
 * test/floor.test.js proves the claim by playing matches twice — plain, and
 * with the whole layer running — and diffing the event logs, with a positive
 * control that deliberately breaks the rule so the instrument is known to see a
 * violation when there is one. A later gate (belief coupling) will flip that
 * invariance test into a controlled-divergence test on purpose.
 *
 * THE PUBLIC WINDOW
 * -----------------
 * Everything the record is folded from comes through `publicSnapshot(G)`, which
 * is a whitelist: board numbers, seat ids, the ballot tallies the square heard,
 * what went on the board, which power was announced and at whom, and `G.log`'s
 * *kinds and meta* (the same log view.js projects in full). It carries no role,
 * no team, no hand, no deck contents, no peek result, no seed, and no names. A
 * permutation of the roles a seat may not know therefore leaves the snapshot,
 * the whole record, every utterance and every ledger entry byte-identical —
 * asserted, not asserted-in-a-comment, in test/floor.test.js.
 *
 * TWO D2 AMENDMENTS, OWNER-LOCKED
 * -------------------------------
 * D1 shipped two behaviours it explicitly flagged as decisions rather than
 * quotations from the handoff. Both were then decided, against what shipped:
 *
 *   1. A QUESTION is NOT discharged by silence. The obligation persists across
 *      floors — prepended by T6 each time — until the obliged citizen actually
 *      speaks, and every silence in between is recorded on the obligation, so
 *      `basis: silence` accumulates references and evasion gets MORE
 *      referencable rather than quietly settled. See speak() below.
 *   2. A flag is permanent evidence. It never expires and contradictions()
 *      keeps returning it for ever. Being "addressed" — pointed at by a later
 *      utterance of the flagged party's own — changes exactly one thing: the
 *      flag stops LEADING T1's morning ordering. See addressedBy().
 *
 * UMD, like the rest of src/engine: CommonJS under Node, `self.SDFloor` in a
 * browser (where engine.js must already have loaded).
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode ? factory(require('./engine.js')) : factory(root.SD);
  if (isNode) module.exports = api;
  else root.SDFloor = api;
})(typeof self !== 'undefined' ? self : this, function (SD) {
  'use strict';

  /* ------------------------------------------------------------ vocabulary */

  var KIND = {
    CLAIM_HAND: 'CLAIM_HAND',
    ACCUSE: 'ACCUSE',
    SUPPORT: 'SUPPORT',
    QUESTION: 'QUESTION',
    SILENCE: 'SILENCE'
  };

  var SEAT_ROLE = { SPEAKER: 'speaker', DEPUTY: 'deputy' };

  /* The accusation table from the handoff, as data. `refs` names the reference
   * keys each basis requires; `min` is the smallest legal length for a list. */
  var ACCUSE_BASIS = {
    vote_pattern:      { refs: ['governments'], min: 2 },
    contradiction:     { refs: ['utterances', 'flag'], min: 1 },
    claim_consistency: { refs: ['utterances'], min: 2 },
    isolation:         { refs: ['governments'], min: 3 },
    enactment:         { refs: ['government'], min: 1 },
    power_use:         { refs: ['power'], min: 1 },
    silence:           { refs: ['floors'], min: 2 },
    gut:               { refs: [], min: 0 }
  };

  var SUPPORT_BASIS = {
    corroborate:       { refs: ['utterance'], min: 1 },
    partner:           { refs: ['government'], min: 1 },
    vote_pattern:      { refs: ['governments'], min: 2 },
    claim_consistency: { refs: ['utterances'], min: 2 }
  };

  var QUESTION_ABOUT = {
    hand:       { refs: ['government'], min: 1 },
    vote:       { refs: ['government'], min: 1 },
    accusation: { refs: ['utterance'], min: 1 },
    silence:    { refs: ['floors'], min: 1 }
  };

  var PROMPTED_BY = {
    floor_open: { refs: [], min: 0 },
    question:   { refs: ['utterance'], min: 1 },
    accusation: { refs: ['utterance'], min: 1 }
  };

  /* Every key an utterance of each kind may carry. The allowlist is the schema:
   * `role`, `team`, a true hand, `confidence`, `suspicion`, `weight`,
   * `sincerity` and free text are not "discouraged", they are unrepresentable —
   * speak() rejects any key not on this list before anything is appended. */
  var BASE_KEYS = ['id', 'day', 'floor', 'seq', 'speaker', 'kind', 'target',
                   'basis', 'refs', 'amends', 'text_id'];
  var EXTRA_KEYS = {
    CLAIM_HAND: ['seat_role', 'drawn', 'passed', 'received', 'blocked', 'enacted'],
    ACCUSE: [],
    SUPPORT: [],
    QUESTION: ['about'],
    SILENCE: ['prompted_by', 'explicit']
  };

  /* Keys that may never appear anywhere in a record, at any depth. Held as a
   * separate list from the allowlist above on purpose: the allowlist is what the
   * constructor enforces, this is what the audit sweep looks for, and two
   * mechanisms that agree are worth more than one that is trusted. */
  var FORBIDDEN_KEYS = ['role', 'team', 'roles', 'teams', 'hand', 'hands', 'tiles',
                        'confidence', 'suspicion', 'weight', 'sincerity', 'trust',
                        'score', 'text', 'prose', 'sentence', 'seed', 'name',
                        'names', 'peeked', 'deck', 'discard', 'known', 'certainty'];

  /* Values that would be a hidden-state leak wherever they appeared. */
  var FORBIDDEN_VALUES = { loyalist: 1, rebel: 1, dictator: 1 };

  var ID_PATTERN = /^[a-z]+-\d+$/;
  var TEXT_ID_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

  var FLOOR_BEAT_CAP = 6;

  /* The floor-opening triggers, as data. `beats` is the budget the trigger
   * brings; T6 is a carry-over rather than an opener and adds a beat. */
  var TRIGGERS = {
    T1: { beats: 3, when: 'morning report acknowledged, day >= 2' },
    T2: { beats: 2, when: 'a government fails at the ballot' },
    T3: { beats: 3, when: 'a tile is enacted' },
    T4: { beats: 2, when: 'a power\'s public effect announced' },
    T5: { beats: 1, when: 'a citizen is purged' },
    T6: { beats: 1, when: 'an unanswered QUESTION carries over' }
  };

  /* ------------------------------------------------------------- utilities */

  function fail(rule, message) {
    var e = new Error(rule + ': ' + message);
    e.rule = rule;
    return e;
  }

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function counts(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object' || Array.isArray(obj)) return undefined;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== SD.TILE.REFORM && keys[i] !== SD.TILE.SEIZE) return undefined;
      if (!isInt(obj[keys[i]]) || obj[keys[i]] < 0) return undefined;
    }
    return { reform: obj.reform || 0, seize: obj.seize || 0 };
  }

  function total(c) { return c.reform + c.seize; }

  function sameCounts(a, b) {
    return !!a && !!b && a.reform === b.reform && a.seize === b.seize;
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------ the public window */

  /**
   * Everything this module is allowed to see of a live game.
   *
   * A whitelist, deliberately, and the reason the permutation test can pass: no
   * role, no team, no hand, no deck contents, no peek result, no seed, no names.
   * `log` is reduced to kind/day/meta — the prose carries names, and the record
   * addresses citizens by seat number only.
   */
  function publicSnapshot(G) {
    var pp = G.pendingPower;
    return {
      phase: G.phase,
      day: G.day,
      reform: G.reform,
      seize: G.seize,
      chaos: G.chaos,
      speaker: G.speaker,
      nominee: G.nominee,
      deputy: G.deputy,
      lastSpeaker: G.lastSpeaker,
      lastDeputy: G.lastDeputy,
      isSpecialElection: !!G.isSpecialElection,
      returnSeat: G.returnSeat,
      seats: G.players.map(function (p) { return p.id; }),
      alive: G.players.filter(function (p) { return p.alive; })
        .map(function (p) { return p.id; }),
      deckCount: G.deck.length,
      discardCount: G.discard.length,
      blockUnlocked: !!G.blockUnlocked,
      blockProposed: !!G.blockProposed,
      blockRefused: !!G.blockRefused,
      lastVote: G.lastVote ? {
        aye: G.lastVote.aye.slice(),
        nay: G.lastVote.nay.slice(),
        passed: !!G.lastVote.passed,
        speaker: G.lastVote.speaker,
        nominee: G.lastVote.nominee
      } : null,
      lastEnacted: G.lastEnacted ? {
        tile: G.lastEnacted.tile, byChaos: !!G.lastEnacted.byChaos
      } : null,
      /* Turned face up in front of everybody, and only then. */
      chaosTile: G.phase === SD.PHASE.CHAOS ? G.chaosTile : null,
      /* Which power is on the table and who holds it were both announced. What
       * it FOUND was not, so `result` is not copied — not even its targetId,
       * which arrives instead through the public log meta below. */
      pendingPower: pp ? { kind: pp.kind, holder: pp.holder, resolved: !!pp.resolved } : null,
      over: G.phase === SD.PHASE.GAME_OVER,
      winner: G.phase === SD.PHASE.GAME_OVER ? G.winner : null,
      /* The public log, without its prose: every logEvent() in engine.js writes
       * what the square hears, and view.js projects it in full. Only kind, day
       * and meta are needed here, and dropping `text` keeps names out. */
      log: G.log.map(function (e) {
        return { kind: e.kind, day: e.day, meta: e.meta ? clone(e.meta) : null };
      })
    };
  }

  /* ------------------------------------------------------------ the record */

  /**
   * A match record: the public state folded forward, plus the utterance stream.
   *
   * Everything in it is plain JSON and everything in it is derived from
   * `publicSnapshot`, so it survives a replay and a role permutation unchanged.
   */
  function createRecord() {
    return {
      version: 1,
      seats: [],
      alive: [],
      day: 1,
      phase: SD.PHASE.NOMINATION,
      over: false,
      board: { reform: 0, seize: 0, chaos: 0 },
      deckWindow: 0,          // bumped when the discard is shuffled back in
      governments: [],
      powers: [],
      purges: [],
      chaosEnactments: [],
      floors: [],
      utterances: [],
      obligations: [],
      /* What the last public transition was — the input to the trigger table.
       * One observation may produce several public events (a Seize is enacted
       * AND grants a power), so they are held as a list under ONE serial:
       * `serial` counts transitions, and is what enforces "one floor per phase
       * transition" without a clock. */
      lastEvents: [],
      lastEvent: null,
      serial: 0,
      openGovernment: null,   // government id, or null
      openFloor: null,        // floor id, or null
      morningAcknowledged: null,
      _prev: null,
      _logSeen: 0,
      _nextUtterance: 0,
      _nextFloor: 0,
      _nextGovernment: 0,
      _nextPower: 0
    };
  }

  function govById(record, id) {
    for (var i = 0; i < record.governments.length; i++) {
      if (record.governments[i].id === id) return record.governments[i];
    }
    return null;
  }
  function utteranceById(record, id) {
    for (var i = 0; i < record.utterances.length; i++) {
      if (record.utterances[i].id === id) return record.utterances[i];
    }
    return null;
  }
  function floorById(record, id) {
    for (var i = 0; i < record.floors.length; i++) {
      if (record.floors[i].id === id) return record.floors[i];
    }
    return null;
  }
  function powerById(record, id) {
    for (var i = 0; i < record.powers.length; i++) {
      if (record.powers[i].id === id) return record.powers[i];
    }
    return null;
  }
  function isAlive(record, seat) { return record.alive.indexOf(seat) !== -1; }

  function currentGovernment(record) {
    return record.openGovernment ? govById(record, record.openGovernment) : null;
  }
  function currentFloor(record) {
    return record.openFloor ? floorById(record, record.openFloor) : null;
  }

  /* ------------------------------------------------------------- the fold */

  /**
   * Note a public event inside the observation being folded.
   *
   * Events are collected into `pending` and published together at the end of
   * observe() under a single serial. Publishing each one separately would let a
   * Seize that also grants a power count as two phase transitions, and the cap
   * "one floor per phase transition" would quietly allow two.
   */
  function mark(pending, kind, detail) {
    var ev = { kind: kind };
    if (detail) {
      Object.keys(detail).forEach(function (k) {
        /* `kind` is the event's own name and nothing may shadow it. A power's
         * detail once carried `kind: 'purge'`, which silently renamed a
         * `power_announced` event to `purge` and fired T5 twice per purge —
         * caught by counting triggers against recorded purges, not by reading
         * the code. */
        if (k === 'kind' || k === 'serial' || k === 'day') {
          throw new Error('floor: event detail may not shadow "' + k + '"');
        }
        ev[k] = detail[k];
      });
    }
    pending.push(ev);
    return ev;
  }

  function publish(record, pending) {
    if (!pending.length) return record;
    record.serial += 1;
    pending.forEach(function (ev) { ev.serial = record.serial; ev.day = record.day; });
    record.lastEvents = pending;
    record.lastEvent = pending[pending.length - 1];
    return record;
  }

  /**
   * Fold one observation of the public state into the record.
   *
   * Call it once before the first step and once after every step. It reads `G`
   * only through publicSnapshot(), takes no argument that could carry hidden
   * state, and writes nothing anywhere but the record.
   */
  function observe(record, G) {
    var s = publicSnapshot(G);
    var p = record._prev;
    var pending = [];

    record.seats = s.seats.slice();
    record.alive = s.alive.slice();
    record.day = s.day;
    record.phase = s.phase;
    record.over = s.over;
    var boardBefore = record.board.reform + record.board.seize;
    record.board = { reform: s.reform, seize: s.seize, chaos: s.chaos };

    /* New public log entries, for the metadata the scalar state does not
     * carry — chiefly which citizen a power was aimed at. */
    var newLog = s.log.slice(record._logSeen);
    record._logSeen = s.log.length;

    if (!p) {
      record._prev = s;
      return record;
    }

    /* The deck runs low and the discard is shuffled back in: a new window, and
     * the boundary C4 counts claimed draws inside. */
    if (s.deckCount > p.deckCount) record.deckWindow += 1;

    /* --- a government opens ------------------------------------------- */
    if (s.phase === SD.PHASE.VOTE && !record.openGovernment) {
      var g = {
        id: 'g-' + record._nextGovernment++,
        day: s.day,
        speaker: s.speaker,
        nominee: s.nominee,
        deputy: null,
        special: !!s.isSpecialElection,
        /*
         * Stamped when the SPEAKER ACTUALLY DRAWS, not here. See below.
         */
        deck_window: null,
        ballot: null,
        block_available: null,
        block_proposed: false,
        resolved: false,
        resolution: null,
        enacted: null
      };
      record.governments.push(g);
      record.openGovernment = g.id;
      mark(pending, 'nomination', { government: g.id, seat: g.speaker });
    }

    var gov = currentGovernment(record);

    /* --- the ballot closes --------------------------------------------
     * Identified by the tally itself rather than by the phase alone, so an
     * observer that skips a step still attributes the ballot to the right
     * government instead of to whichever one happens to be open. */
    if (gov && !gov.ballot && s.lastVote && s.phase !== SD.PHASE.VOTE &&
        s.lastVote.speaker === gov.speaker && s.lastVote.nominee === gov.nominee) {
      gov.ballot = {
        aye: s.lastVote.aye.slice(),
        nay: s.lastVote.nay.slice(),
        passed: !!s.lastVote.passed
      };
      if (gov.ballot.passed) {
        gov.deputy = gov.nominee;
        mark(pending, 'ballot_passed', { government: gov.id, seat: gov.speaker });
      } else {
        gov.resolved = true;
        gov.resolution = 'failed';
        record.openGovernment = null;
        mark(pending, 'ballot_failed', { government: gov.id, seat: gov.speaker });
      }
    }

    gov = currentGovernment(record);

    /* --- the Speaker draws: which deck window did those three come out of?
     *
     * Stamped HERE rather than when the government opened, and the difference
     * is a real false accusation. A government is created at the ballot and
     * the Speaker draws a phase or two later, and `ensureDeck` can shuffle the
     * discard back in between the two. Attributing the draw to the window the
     * ELECTION happened in piles a government's three tiles into a window
     * whose deck never held them, and C4 — "claimed draws exceed the deck" —
     * then fires on a table where every single claim is true.
     *
     * Found by D2's orator: with real bots claiming the hands they actually
     * held, C4 flagged five and six honest citizens at once, and the arithmetic
     * gave it away — six governments' worth of honest draws (18 tiles) attributed
     * to one window of a 17-tile deck. The window COUNT was right all along
     * (37 reshuffles, 37 windows, over 40 matches); it was the attribution that
     * was off by a phase. C1-C6 are evidence, and evidence that fires on the
     * innocent is worse than no evidence.
     *
     * The deck-window counter above is advanced before this block runs, so by
     * the time the draw is visible the window already includes the reshuffle
     * that fed it. */
    if (gov && s.phase === SD.PHASE.LEGISLATIVE_SPEAKER && gov.deck_window === null) {
      gov.deck_window = record.deckWindow;
    }

    /* --- the Deputy's draft: was a Block on the table for them? -------- */
    if (gov && s.phase === SD.PHASE.LEGISLATIVE_DEPUTY && gov.block_available === null) {
      gov.block_available = !!(s.blockUnlocked && !s.blockRefused);
    }
    if (gov && s.phase === SD.PHASE.BLOCK_RESPONSE) gov.block_proposed = true;

    /* --- something went on the board ---------------------------------- */
    var boardNow = s.reform + s.seize;
    if (boardNow > boardBefore && s.lastEnacted) {
      if (s.lastEnacted.byChaos) {
        record.chaosEnactments.push({ day: s.day, tile: s.lastEnacted.tile });
        mark(pending, 'chaos_enacted', { tile: s.lastEnacted.tile, seat: null });
      } else if (gov) {
        gov.resolved = true;
        gov.resolution = 'enacted';
        gov.enacted = s.lastEnacted.tile;
        if (gov.block_available === null) gov.block_available = false;
        record.openGovernment = null;
        mark(pending, 'enacted', {
          government: gov.id, tile: gov.enacted, seat: gov.speaker, second: gov.deputy
        });
      }
    } else if (gov && s.chaos > p.chaos && gov.ballot && gov.ballot.passed) {
      /* No tile moved and the Chaos Track advanced with a government seated:
       * the Block carried and both tiles burned. */
      gov.resolved = true;
      gov.resolution = 'blocked';
      record.openGovernment = null;
      mark(pending, 'blocked', { government: gov.id, seat: gov.deputy });
    }

    /* --- a power is announced, aimed, and spent ------------------------ */
    if (s.pendingPower && !p.pendingPower) {
      var pw = {
        id: 'p-' + record._nextPower++,
        kind: s.pendingPower.kind,
        holder: s.pendingPower.holder,
        day: s.day,
        target: null,
        resolved: false
      };
      record.powers.push(pw);
      mark(pending, 'power_announced', { power: pw.id, seat: pw.holder, power_kind: pw.kind });
    }
    var live = record.powers.length ? record.powers[record.powers.length - 1] : null;
    for (var i = 0; i < newLog.length; i++) {
      var m = newLog[i].meta;
      if (newLog[i].kind !== 'power' || !m || !m.power) continue;
      if (!live || live.resolved) continue;
      if (m.targetId !== undefined && m.targetId !== null) live.target = m.targetId;
      live.resolved = true;
      if (m.power === 'purge') {
        record.purges.push({ day: s.day, by: live.holder, target: live.target });
        mark(pending, 'purge', { power: live.id, seat: live.holder, target: live.target });
      } else {
        mark(pending, 'power_used', {
          power: live.id, seat: live.holder, target: live.target, power_kind: live.kind
        });
      }
    }

    if (s.over && !p.over) mark(pending, 'game_over', { seat: null });

    record._prev = s;
    publish(record, pending);
    return record;
  }

  /**
   * The morning report is a presentation gate the engine has no phase for
   * (human-driver.js owns it), so T1's condition arrives by hand. Inert: it
   * touches no board state and takes no engine step.
   */
  function acknowledgeMorning(record, day) {
    record.morningAcknowledged = day == null ? record.day : day;
    var pending = [];
    mark(pending, 'morning', { seat: null });
    publish(record, pending);
    return record;
  }

  /* ------------------------------------------------------------ triggers */

  /**
   * Flags that name a living seat and that that seat has not yet ADDRESSED.
   *
   * Owner-locked spec (D2): a flag is permanent evidence. It never expires and
   * `contradictions()` keeps returning it forever. What "addressing" it changes
   * is one thing only — it stops the flag LEADING T1's morning ordering, so the
   * square does not open every single morning by turning to the same citizen
   * about the same two utterances they have already spoken to. The flag is still
   * there, still queryable, still referencable by anybody else.
   */
  function unansweredFlagsBySeat(record) {
    var out = {};
    var flags = contradictions(record);
    for (var i = 0; i < flags.length; i++) {
      for (var j = 0; j < flags[i].seats.length; j++) {
        var seat = flags[i].seats[j];
        if (!isAlive(record, seat)) continue;
        if (flags[i].addressed.indexOf(seat) !== -1) continue;
        out[seat] = (out[seat] || 0) + 1;
      }
    }
    return out;
  }

  function mostFlagged(record) {
    var by = unansweredFlagsBySeat(record);
    var best = null, bestN = 0;
    record.alive.forEach(function (seat) {
      var n = by[seat] || 0;
      if (n > bestN) { bestN = n; best = seat; }
    });
    return best;
  }

  /** Obligations a QUESTION created that its target has not yet discharged. */
  function pendingObligations(record) {
    return record.obligations.filter(function (o) { return !o.discharged; });
  }

  /**
   * May a floor open at all, right now?
   *
   * Never during a vote, never during drafting, never at two alive, never after
   * game over — and never twice on one phase transition, which is what `serial`
   * is for.
   */
  function canOpenFloor(record) {
    if (record.over) return false;
    if (record.openFloor) return false;
    if (record.alive.length <= 2) return false;
    if (record.phase === SD.PHASE.VOTE) return false;
    if (record.phase === SD.PHASE.LEGISLATIVE_SPEAKER) return false;
    if (record.phase === SD.PHASE.LEGISLATIVE_DEPUTY) return false;
    if (record.phase === SD.PHASE.BLOCK_RESPONSE) return false;
    if (record.phase === SD.PHASE.GAME_OVER) return false;
    if (!record.lastEvents.length) return false;
    for (var i = 0; i < record.floors.length; i++) {
      if (record.floors[i].serial === record.serial) return false;
    }
    return true;
  }

  /**
   * Which floor-opening triggers fire on the transition just observed.
   *
   * A pure function of the public record. It DECIDES NOTHING: it hands back the
   * trigger id, its beat budget and whose beat comes first, and a future driver
   * chooses whether to open one. Nothing in this module opens a floor by itself.
   */
  function triggers(record) {
    var out = [];
    if (!canOpenFloor(record) || !record.lastEvents.length) return out;

    function add(id, first, then) {
      if (first !== null && first !== undefined && !isAlive(record, first)) first = null;
      var t = { id: id, beats: TRIGGERS[id].beats, first: first === undefined ? null : first };
      if (then !== undefined && then !== null && isAlive(record, then)) t.then = then;
      out.push(t);
    }

    record.lastEvents.forEach(function (ev) {
      /* T4 fires on the power's public EFFECT, not on the announcement of the
       * slot: "X looks into Y's allegiance" is the beat citizens react to. A
       * purge is a power too, and T5 is the one that owns it. */
      if (ev.kind === 'morning' && record.day >= 2) add('T1', mostFlagged(record));
      if (ev.kind === 'ballot_failed') add('T2', ev.seat);
      if (ev.kind === 'enacted') add('T3', ev.seat, ev.second);
      if (ev.kind === 'power_used') add('T4', ev.seat);
      if (ev.kind === 'purge') add('T5', ev.seat);
    });

    /* T6 is a carry-over, not an opener: it prepends the questioned citizen and
     * adds a beat to whatever floor opens next, rather than opening one of its
     * own. An unanswered QUESTION with nothing else happening therefore waits —
     * which is what "carries over" means. */
    var owed = pendingObligations(record).filter(function (o) {
      return isAlive(record, o.target);
    });
    if (owed.length && out.length) {
      out.forEach(function (t) {
        t.beats = Math.min(t.beats + TRIGGERS.T6.beats * owed.length, FLOOR_BEAT_CAP);
        t.then = t.first;
        t.first = owed[0].target;
        t.carried = owed.map(function (o) { return o.question; });
      });
    }
    return out;
  }

  /**
   * Open a floor. `spec` is one of the entries `triggers()` returned (or the
   * same shape), so the caller cannot invent a budget the table does not allow.
   */
  function openFloorNow(record, spec) {
    if (!canOpenFloor(record)) throw fail('T0', 'the floor cannot open here');
    if (!spec || !TRIGGERS[spec.id]) throw fail('T0', 'unknown trigger ' + (spec && spec.id));
    var owed = pendingObligations(record);
    var beats = spec.beats || TRIGGERS[spec.id].beats;
    beats = Math.min(beats, FLOOR_BEAT_CAP);
    var f = {
      id: 'f-' + record._nextFloor++,
      day: record.day,
      trigger: spec.id,
      serial: record.serial,
      beats: beats,
      first: spec.first === undefined ? null : spec.first,
      /* Whoever was questioned takes the first beat, and may take a second beat
       * on this floor where nobody else may. */
      obliged: owed.map(function (o) { return o.target; }),
      /*
       * The second way a citizen gets a second beat on one floor, and the only
       * other one: an accusation that was answered with silence buys its
       * accuser a follow-up. "The accuser gets a free follow-up beat, appended
       * to this floor. An unanswered accusation is spoken twice."
       *
       * Held as a LIST rather than a flag because the same accuser can be
       * stonewalled twice on one floor, and because the beat budget grows by
       * one for each — see grantFollowUp().
       */
      followUps: [],
      utterances: []
    };
    record.floors.push(f);
    record.openFloor = f.id;
    return f;
  }

  function closeFloor(record) {
    var f = currentFloor(record);
    if (!f) return null;
    /* Anything still owed when the floor closes carries to the next one. */
    record.openFloor = null;
    return f;
  }

  function countIn(list, seat) {
    var n = 0;
    for (var i = 0; list && i < list.length; i++) if (list[i] === seat) n++;
    return n;
  }

  /**
   * Is the floor open to this seat for one more beat?
   *
   * Three caps, all from the handoff: six beats per floor including carry-overs,
   * no citizen takes two beats on one floor unless a QUESTION obliges (or an
   * unanswered accusation of theirs bought them one — see grantFollowUp), and
   * the dead do not speak.
   */
  function floorOpenTo(record, seat) {
    var f = currentFloor(record);
    if (!f) return false;
    if (!isAlive(record, seat)) return false;
    if (f.utterances.length >= Math.min(f.beats, FLOOR_BEAT_CAP)) return false;
    var spoken = 0;
    for (var i = 0; i < f.utterances.length; i++) {
      var u = utteranceById(record, f.utterances[i]);
      if (u && u.speaker === seat) spoken++;
    }
    /* One beat for everybody; one more for a citizen a QUESTION obliged; one
     * more again for each follow-up their own unanswered accusation bought.
     * With no obligation and no follow-up this is exactly the old rule — one
     * beat, and a second only when obliged. */
    var allowance = 1 + (f.obliged.indexOf(seat) !== -1 ? 1 : 0) +
      countIn(f.followUps, seat);
    return spoken < allowance;
  }

  /**
   * An unanswered accusation buys its accuser one more beat on this floor.
   *
   * The handoff's second consequence of silence, and it is deliberately a CALL
   * rather than a rule inside speak(): "what silence costs" is written about
   * the player's turn, and making every bot silence grant a follow-up would
   * rewrite the bot-only record for every seed that already exists. The caller
   * that owns the player's beat (src/play/floor-voice.js) grants it; nothing
   * else does, and test/strip.test.js asserts an all-bot match never sees one.
   *
   * The budget grows with the beat, capped at FLOOR_BEAT_CAP, so the follow-up
   * is genuinely extra rather than taken off somebody else.
   */
  function grantFollowUp(record, seat) {
    var f = currentFloor(record);
    if (!f) return false;
    if (!isAlive(record, seat)) return false;
    if (f.beats >= FLOOR_BEAT_CAP) return false;
    f.followUps.push(seat);
    f.beats = Math.min(f.beats + 1, FLOOR_BEAT_CAP);
    return true;
  }

  /* ---------------------------------------------------------- references */

  function refIdsOk(record, refs) {
    var keys = Object.keys(refs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = refs[k];
      /* A flag id is computed, not ordinal — `C3:u-4:u-7:g-3` — so it is
       * checked against the flags that currently hold, in validateAccuse,
       * rather than against the id pattern here. */
      if (k === 'flag') {
        if (typeof v !== 'string' || !v.length) return 'refs.flag is not a flag id';
        continue;
      }
      var list = Array.isArray(v) ? v : [v];
      for (var j = 0; j < list.length; j++) {
        var id = list[j];
        if (typeof id !== 'string' || !ID_PATTERN.test(id)) return 'refs.' + k + ' is not an id';
        if (id.charAt(0) === 'g' && !govById(record, id)) return 'no such government ' + id;
        if (id.charAt(0) === 'u' && !utteranceById(record, id)) return 'no such utterance ' + id;
        if (id.charAt(0) === 'f' && !floorById(record, id)) return 'no such floor ' + id;
        if (id.charAt(0) === 'p' && !powerById(record, id)) return 'no such power ' + id;
      }
    }
    return null;
  }

  function requireRefs(table, key, refs) {
    var spec = table[key];
    if (!spec) return 'unknown basis ' + key;
    for (var i = 0; i < spec.refs.length; i++) {
      var name = spec.refs[i];
      var v = refs[name];
      if (v === undefined || v === null) return 'basis ' + key + ' needs refs.' + name;
      if (Array.isArray(v) && v.length < spec.min) {
        return 'basis ' + key + ' needs at least ' + spec.min + ' in refs.' + name;
      }
    }
    var allowed = {};
    spec.refs.forEach(function (r) { allowed[r] = 1; });
    var got = Object.keys(refs);
    for (var j = 0; j < got.length; j++) {
      if (!allowed[got[j]]) return 'basis ' + key + ' does not take refs.' + got[j];
    }
    return null;
  }

  function claimsBy(record, seat, govId) {
    return record.utterances.filter(function (u) {
      return u.kind === KIND.CLAIM_HAND && u.speaker === seat &&
        (!govId || u.refs.government === govId);
    });
  }

  function satIn(gov, seat) {
    return gov.speaker === seat || gov.deputy === seat;
  }

  function silencesOnFloor(record, seat, floorId) {
    return record.utterances.filter(function (u) {
      return u.kind === KIND.SILENCE && u.speaker === seat && u.floor === floorId;
    });
  }

  /* --------------------------------------------------------------- speak */

  /**
   * The ONLY constructor. Validates, then assigns the ordinal id, day, floor and
   * beat index and appends — so an invalid utterance is not merely rejected on
   * append, it is never built. Every field is checked against the schema
   * allowlist before anything is written.
   *
   * Throws an Error whose `.rule` names the rule that refused it.
   */
  function speak(record, fields) {
    if (!fields || typeof fields !== 'object') throw fail('V0', 'no utterance given');

    var kind = fields.kind;
    if (!KIND[kind]) throw fail('V0', 'unknown kind ' + kind);

    /* --- the allowlist, before anything else -------------------------- */
    var allowed = {};
    BASE_KEYS.concat(EXTRA_KEYS[kind]).forEach(function (k) { allowed[k] = 1; });
    /* id, day, floor and seq are engine-assigned; a caller may not set them. */
    ['id', 'day', 'floor', 'seq'].forEach(function (k) {
      if (fields[k] !== undefined) throw fail('V0', k + ' is engine-assigned');
    });
    var given = Object.keys(fields);
    for (var i = 0; i < given.length; i++) {
      if (!allowed[given[i]]) throw fail('V0', 'field not in the schema: ' + given[i]);
    }

    var speaker = fields.speaker;
    if (!isInt(speaker) || record.seats.indexOf(speaker) === -1) {
      throw fail('V0', 'speaker must be a seat number');
    }
    if (typeof fields.text_id !== 'string' || !TEXT_ID_PATTERN.test(fields.text_id)) {
      throw fail('V0', 'text_id must be an id like "deny.voted_with_gavel.2", never prose');
    }

    var refs = fields.refs === undefined || fields.refs === null ? {} : fields.refs;
    if (typeof refs !== 'object' || Array.isArray(refs)) throw fail('V0', 'refs must be an object');
    var refErr = refIdsOk(record, refs);
    if (refErr) throw fail('V0', refErr);

    var target = fields.target === undefined ? null : fields.target;
    if (target !== null) {
      if (!isInt(target) || record.seats.indexOf(target) === -1) {
        throw fail('V0', 'target must be a seat number or null');
      }
    }

    var amends = fields.amends === undefined ? null : fields.amends;
    if (amends !== null) {
      var amended = utteranceById(record, amends);
      if (!amended) throw fail('V0', 'amends names no utterance: ' + amends);
      if (amended.speaker !== speaker) throw fail('V0', 'you may only amend your own utterance');
    }

    /* --- V5: a dead citizen makes no claims --------------------------- */
    if (!isAlive(record, speaker)) throw fail('V5', 'seat ' + speaker + ' is dead');

    /* --- V6: the floor is open to that speaker ------------------------ */
    if (!floorOpenTo(record, speaker)) {
      throw fail('V6', 'the floor is not open to seat ' + speaker);
    }

    var u = {
      id: 'u-' + record._nextUtterance,
      day: record.day,
      floor: record.openFloor,
      seq: currentFloor(record).utterances.length,
      speaker: speaker,
      kind: kind,
      target: target,
      basis: null,
      refs: clone(refs),
      amends: amends,
      text_id: fields.text_id
    };

    if (kind === KIND.CLAIM_HAND) validateClaim(record, u, fields);
    else if (kind === KIND.ACCUSE) validateAccuse(record, u, fields);
    else if (kind === KIND.SUPPORT) validateSupport(record, u, fields);
    else if (kind === KIND.QUESTION) validateQuestion(record, u, fields);
    else if (kind === KIND.SILENCE) validateSilence(record, u, fields);

    /* Everything held. Assign the ordinal and append. */
    record._nextUtterance += 1;
    deepFreeze(u);
    record.utterances.push(u);
    var f = currentFloor(record);
    f.utterances.push(u.id);

    /*
     * A QUESTION creates an obligation.
     *
     * OWNER-LOCKED SPEC (D2), and a deliberate reversal of what shipped in D1:
     * **silence does not discharge a question.** D1 discharged the obligation on
     * anything the questioned citizen said next, silence included, on the
     * reading that the handoff's "silence after a QUESTION is recorded
     * distinctly and is the most expensive" implied it still counted as an
     * answer for scheduling. It does not. An obligation persists across floors —
     * prepended by T6 each time — until the obliged citizen actually SPEAKS to
     * it, and every silence in between is recorded on the obligation as well as
     * in the utterance stream. Each of those silences is a floor on which that
     * citizen was SILENT, so `basis: silence` accumulates references and the
     * evasion becomes more referencable the longer it goes on.
     *
     * "Speaks to it" is deliberately any non-SILENCE utterance by the obliged
     * citizen after the question, not one that names the question in its refs.
     * The narrower reading is unimplementable without inventing a reply field
     * the schema does not have, and it would let a citizen answer at length
     * about something else and stay obliged for ever.
     */
    if (kind === KIND.QUESTION) {
      record.obligations.push({
        id: 'o-' + record.obligations.length,
        question: u.id, target: u.target, floor: u.floor,
        discharged: false, answer: null, silences: []
      });
    }
    record.obligations.forEach(function (o) {
      if (o.discharged || o.target !== speaker) return;
      if (u.id === o.question) return;
      if (u.kind === KIND.SILENCE) { o.silences.push(u.id); return; }
      o.discharged = true;
      o.answer = u.id;
    });

    return u;
  }

  /* ------------------------------------------------------- the dry run */

  /**
   * WOULD this utterance be accepted, right now, without recording it?
   *
   * The intent strip's whole safety property is "a slot is offered only if the
   * schema would accept the resulting utterance", and there are two ways to
   * have that. One is to re-derive the validity rules in the strip, which is
   * two implementations of one law and the classic way a fuzz sweep goes green
   * against a strip that is wrong in the same direction as its test. The other
   * is to ask the constructor itself, which is this.
   *
   * It runs the REAL speak() and then unwinds it exactly. That is only honest
   * if the unwind is exhaustive, so here is speak()'s complete list of writes,
   * beside the undo for each:
   *
   *   record._nextUtterance += 1          restored from the mark
   *   record.utterances.push(u)           truncated back
   *   floor.utterances.push(u.id)         truncated back
   *   record.obligations.push(...)        truncated back (QUESTION only)
   *   o.discharged / o.answer             restored per obligation
   *   o.silences.push(u.id)               truncated per obligation
   *
   * Nothing else in speak() writes anywhere. That sentence is the thing that
   * could rot, so test/strip.test.js does not trust it: it JSON-serialises the
   * whole record before and after thousands of attempts and requires it to be
   * byte-identical, which is a statement about the record rather than about
   * this comment.
   *
   * Returns null when the utterance would be accepted, or the Error that
   * refused it (with `.rule`), so a caller can report WHY a slot is missing.
   */
  function attempt(record, fields) {
    var f = currentFloor(record);
    var mark = {
      next: record._nextUtterance,
      utterances: record.utterances.length,
      floor: f ? f.utterances.length : 0,
      obligations: record.obligations.length,
      state: record.obligations.map(function (o) {
        return { discharged: o.discharged, answer: o.answer, silences: o.silences.length };
      })
    };
    var err = null;
    try {
      speak(record, fields);
    } catch (e) {
      err = e;
    }
    record._nextUtterance = mark.next;
    record.utterances.length = mark.utterances;
    if (f) f.utterances.length = mark.floor;
    for (var i = 0; i < mark.state.length; i++) {
      var o = record.obligations[i];
      o.discharged = mark.state[i].discharged;
      o.answer = mark.state[i].answer;
      o.silences.length = mark.state[i].silences;
    }
    record.obligations.length = mark.obligations;
    return err;
  }

  /* --------------------------------------------------------- CLAIM_HAND */

  function validateClaim(record, u, fields) {
    var govId = u.refs.government;
    if (typeof govId !== 'string') throw fail('V0', 'CLAIM_HAND needs refs.government');
    var extra = Object.keys(u.refs).filter(function (k) { return k !== 'government'; });
    if (extra.length) throw fail('V0', 'CLAIM_HAND does not take refs.' + extra[0]);
    var gov = govById(record, govId);

    /* --- V2: the government has resolved ------------------------------ */
    if (!gov.resolved) throw fail('V2', govId + ' has not resolved');

    /* --- V1: the speaker held that seat in that government ------------ */
    var seatRole = fields.seat_role;
    if (seatRole !== SEAT_ROLE.SPEAKER && seatRole !== SEAT_ROLE.DEPUTY) {
      throw fail('V1', 'seat_role must be "speaker" or "deputy"');
    }
    if (seatRole === SEAT_ROLE.SPEAKER && gov.speaker !== u.speaker) {
      throw fail('V1', 'seat ' + u.speaker + ' did not hold the gavel in ' + govId);
    }
    if (seatRole === SEAT_ROLE.DEPUTY && gov.deputy !== u.speaker) {
      throw fail('V1', 'seat ' + u.speaker + ' was not the Deputy in ' + govId);
    }
    /* A government that failed at the ballot handed nobody any tiles. */
    if (gov.resolution === 'failed') {
      throw fail('V1', govId + ' never sat: no hand was held');
    }

    /* --- V3: the counts sum ------------------------------------------- */
    var drawn = counts(fields.drawn);
    var passed = counts(fields.passed);
    var received = counts(fields.received);
    if (drawn === undefined || passed === undefined || received === undefined) {
      throw fail('V3', 'counts must be {reform, seize} non-negative integers');
    }
    if (seatRole === SEAT_ROLE.SPEAKER) {
      if (received !== null) throw fail('V3', 'a Speaker claims drawn and passed, not received');
      if (!drawn || total(drawn) !== 3) throw fail('V3', 'drawn must sum to 3');
      if (!passed || total(passed) !== 2) throw fail('V3', 'passed must sum to 2');
      if (fields.blocked !== undefined && fields.blocked !== null) {
        throw fail('V3', 'blocked is the Deputy\'s field');
      }
    } else {
      if (drawn !== null || passed !== null) {
        throw fail('V3', 'a Deputy claims received, not drawn or passed');
      }
      if (!received || total(received) !== 2) throw fail('V3', 'received must sum to 2');
      if (fields.blocked !== undefined && fields.blocked !== null) {
        if (typeof fields.blocked !== 'boolean') throw fail('V3', 'blocked must be a boolean');
        if (!gov.block_available) throw fail('V3', 'no Block was available in ' + govId);
      }
    }

    /* --- V4: one CLAIM_HAND per speaker per government, unless amended - */
    var prior = claimsBy(record, u.speaker, govId);
    if (prior.length && !u.amends) {
      throw fail('V4', 'seat ' + u.speaker + ' has already claimed ' + govId +
        ' — set amends to change the story');
    }

    /* `enacted` is denormalised from the public record, so it is not a claim at
     * all: it either matches what went on the board or the utterance is a lie
     * about something everybody watched. Rejected rather than flagged. */
    var boardEnacted = gov.resolution === 'enacted' ? gov.enacted : null;
    var claimedEnacted = fields.enacted === undefined ? null : fields.enacted;
    if (claimedEnacted !== null && claimedEnacted !== SD.TILE.REFORM &&
        claimedEnacted !== SD.TILE.SEIZE) {
      throw fail('V2', 'enacted must be a tile or null');
    }
    if (claimedEnacted !== boardEnacted) {
      throw fail('V2', 'enacted must match the public record (' + boardEnacted + ')');
    }

    u.seat_role = seatRole;
    u.drawn = drawn;
    u.passed = passed;
    u.received = received;
    u.blocked = fields.blocked === undefined ? null : fields.blocked;
    u.enacted = boardEnacted;
  }

  /* ------------------------------------------------------------- ACCUSE */

  function livingOther(record, u, what) {
    if (u.target === null) throw fail('V0', what + ' needs a target');
    if (u.target === u.speaker) throw fail('V0', what + ' cannot be aimed at yourself');
    if (!isAlive(record, u.target)) throw fail('V5', what + ' cannot be aimed at the dead');
  }

  function validateAccuse(record, u, fields) {
    livingOther(record, u, 'ACCUSE');
    var basis = fields.basis;
    var err = requireRefs(ACCUSE_BASIS, basis, u.refs);
    if (err) throw fail('V0', err);

    var i;
    if (basis === 'vote_pattern') {
      for (i = 0; i < u.refs.governments.length; i++) {
        var g1 = govById(record, u.refs.governments[i]);
        if (!g1.ballot) throw fail('V0', g1.id + ' has no public tally');
        if (g1.ballot.aye.indexOf(u.target) === -1 && g1.ballot.nay.indexOf(u.target) === -1) {
          throw fail('V0', 'seat ' + u.target + ' cast no ballot in ' + g1.id);
        }
      }
    } else if (basis === 'contradiction') {
      var flags = contradictions(record);
      var held = null;
      for (i = 0; i < flags.length; i++) if (flags[i].id === u.refs.flag) held = flags[i];
      if (!held) throw fail('V0', 'flag ' + u.refs.flag + ' does not currently hold');
      var want = Array.isArray(u.refs.utterances) ? u.refs.utterances : [u.refs.utterances];
      for (i = 0; i < want.length; i++) {
        if (held.refs.utterances.indexOf(want[i]) === -1) {
          throw fail('V0', want[i] + ' is not part of flag ' + held.id);
        }
      }
    } else if (basis === 'claim_consistency') {
      for (i = 0; i < u.refs.utterances.length; i++) {
        var c1 = utteranceById(record, u.refs.utterances[i]);
        if (c1.kind !== KIND.CLAIM_HAND) throw fail('V0', c1.id + ' is not a CLAIM_HAND');
        if (c1.speaker !== u.target) throw fail('V0', c1.id + ' is not seat ' + u.target + '\'s claim');
      }
    } else if (basis === 'isolation') {
      for (i = 0; i < u.refs.governments.length; i++) {
        var g2 = govById(record, u.refs.governments[i]);
        if (satIn(g2, u.target) || g2.nominee === u.target) {
          throw fail('V0', 'seat ' + u.target + ' was in ' + g2.id);
        }
      }
    } else if (basis === 'enactment') {
      var g3 = govById(record, u.refs.government);
      if (!satIn(g3, u.target)) throw fail('V0', 'seat ' + u.target + ' did not sit in ' + g3.id);
      if (g3.resolution !== 'enacted' || g3.enacted !== SD.TILE.SEIZE) {
        throw fail('V0', g3.id + ' enacted no Seize');
      }
    } else if (basis === 'power_use') {
      var pw = powerById(record, u.refs.power);
      if (pw.holder !== u.target) throw fail('V0', 'seat ' + u.target + ' did not hold ' + pw.id);
    } else if (basis === 'silence') {
      for (i = 0; i < u.refs.floors.length; i++) {
        if (!silencesOnFloor(record, u.target, u.refs.floors[i]).length) {
          throw fail('V0', 'seat ' + u.target + ' was not SILENT on ' + u.refs.floors[i]);
        }
      }
    }
    u.basis = basis;
  }

  /* ------------------------------------------------------------ SUPPORT */

  function validateSupport(record, u, fields) {
    livingOther(record, u, 'SUPPORT');
    var basis = fields.basis;
    var err = requireRefs(SUPPORT_BASIS, basis, u.refs);
    if (err) throw fail('V0', err);
    var i;
    if (basis === 'corroborate') {
      var c = utteranceById(record, u.refs.utterance);
      if (c.speaker !== u.target) throw fail('V0', c.id + ' is not seat ' + u.target + '\'s');
    } else if (basis === 'partner') {
      var g = govById(record, u.refs.government);
      if (!satIn(g, u.target) || !satIn(g, u.speaker)) {
        throw fail('V0', 'seats ' + u.speaker + ' and ' + u.target + ' did not share ' + g.id);
      }
    } else if (basis === 'vote_pattern') {
      for (i = 0; i < u.refs.governments.length; i++) {
        if (!govById(record, u.refs.governments[i]).ballot) {
          throw fail('V0', u.refs.governments[i] + ' has no public tally');
        }
      }
    } else if (basis === 'claim_consistency') {
      for (i = 0; i < u.refs.utterances.length; i++) {
        var c2 = utteranceById(record, u.refs.utterances[i]);
        if (c2.kind !== KIND.CLAIM_HAND) throw fail('V0', c2.id + ' is not a CLAIM_HAND');
        if (c2.speaker !== u.target) throw fail('V0', c2.id + ' is not seat ' + u.target + '\'s claim');
      }
    }
    u.basis = basis;
  }

  /* ----------------------------------------------------------- QUESTION */

  function validateQuestion(record, u, fields) {
    livingOther(record, u, 'QUESTION');
    var about = fields.about;
    var err = requireRefs(QUESTION_ABOUT, about, u.refs);
    if (err) throw fail('V0', err);
    if (about === 'hand') {
      var g = govById(record, u.refs.government);
      /* Not aimable at a hand never held. */
      if (!satIn(g, u.target)) throw fail('V0', 'seat ' + u.target + ' held no hand in ' + g.id);
      if (!g.resolved || g.resolution === 'failed') {
        throw fail('V0', g.id + ' handed nobody a hand');
      }
    } else if (about === 'vote') {
      if (!govById(record, u.refs.government).ballot) {
        throw fail('V0', u.refs.government + ' has no public tally');
      }
    } else if (about === 'accusation') {
      var a = utteranceById(record, u.refs.utterance);
      if (a.kind !== KIND.ACCUSE) throw fail('V0', a.id + ' is not an ACCUSE');
      if (a.speaker !== u.target) throw fail('V0', a.id + ' is not seat ' + u.target + '\'s');
    } else if (about === 'silence') {
      for (var i = 0; i < u.refs.floors.length; i++) {
        if (!silencesOnFloor(record, u.target, u.refs.floors[i]).length) {
          throw fail('V0', 'seat ' + u.target + ' was not SILENT on ' + u.refs.floors[i]);
        }
      }
    }
    u.about = about;
  }

  /* ------------------------------------------------------------ SILENCE */

  function validateSilence(record, u, fields) {
    if (u.target !== null) throw fail('V0', 'SILENCE has no target');
    var by = fields.prompted_by;
    var err = requireRefs(PROMPTED_BY, by, u.refs);
    if (err) throw fail('V0', err);
    if (typeof fields.explicit !== 'boolean') {
      throw fail('V0', 'explicit must be true (chosen) or false (the beat ran out)');
    }
    if (by === 'question' || by === 'accusation') {
      var p = utteranceById(record, u.refs.utterance);
      var want = by === 'question' ? KIND.QUESTION : KIND.ACCUSE;
      if (p.kind !== want) throw fail('V0', p.id + ' is not a ' + want);
      if (p.target !== u.speaker) throw fail('V0', p.id + ' was not aimed at seat ' + u.speaker);
    }
    u.prompted_by = by;
    u.explicit = fields.explicit;
  }

  /* ----------------------------------------------------- contradictions */

  /**
   * C1–C6, as pure functions over the utterance record and the public record.
   *
   * A flag names a rule and its refs and STOPS. It never says who lied — in C3
   * it cannot, because the whole point is that one of the two is lying and the
   * record does not know which. There is no verdict field, no confidence, and
   * no ranking anywhere in this function's output.
   */
  function contradictions(record) {
    var flags = [];

    function flag(rule, cls, seats, refs) {
      var us = (refs.utterances || []).slice();
      var gs = (refs.governments || []).slice();
      var id = rule + ':' + us.concat(gs).join(':');
      var named = seats.slice().sort(function (a, b) { return a - b; });
      flags.push({
        id: id,
        rule: rule,
        class: cls,
        seats: named,
        refs: { utterances: us, governments: gs },
        /* Permanent evidence, with one scheduling consequence. See
         * unansweredFlagsBySeat() and addressedBy() below: being addressed does
         * not retire a flag, remove it from this list, or weaken it. It stops
         * it LEADING the morning, and nothing else. */
        addressed: named.filter(function (s) { return addressedBy(record, s, id, us); })
      });
    }

    var claims = record.utterances.filter(function (u) { return u.kind === KIND.CLAIM_HAND; });
    var i, j;

    /* --- C1: passed is not a subset of drawn ------------------------- */
    for (i = 0; i < claims.length; i++) {
      var c = claims[i];
      if (c.seat_role !== SEAT_ROLE.SPEAKER) continue;
      if (c.passed.reform > c.drawn.reform || c.passed.seize > c.drawn.seize) {
        flag('C1', 'self', [c.speaker], { utterances: [c.id], governments: [c.refs.government] });
      }
    }

    /* --- C2: a Deputy's received lacks the tile the board shows ------ */
    for (i = 0; i < claims.length; i++) {
      var d = claims[i];
      if (d.seat_role !== SEAT_ROLE.DEPUTY) continue;
      var g = govById(record, d.refs.government);
      if (!g || g.resolution !== 'enacted') continue;
      if (!d.received[g.enacted]) {
        flag('C2', 'record', [d.speaker], { utterances: [d.id], governments: [g.id] });
      }
    }

    /* --- C3: the Speaker's passed and the Deputy's received disagree - */
    for (i = 0; i < claims.length; i++) {
      if (claims[i].seat_role !== SEAT_ROLE.SPEAKER) continue;
      for (j = 0; j < claims.length; j++) {
        if (claims[j].seat_role !== SEAT_ROLE.DEPUTY) continue;
        if (claims[i].refs.government !== claims[j].refs.government) continue;
        if (superseded(record, claims[i]) || superseded(record, claims[j])) continue;
        if (!sameCounts(claims[i].passed, claims[j].received)) {
          flag('C3', 'pair', [claims[i].speaker, claims[j].speaker], {
            utterances: [claims[i].id, claims[j].id],
            governments: [claims[i].refs.government]
          });
        }
      }
    }

    /* --- C4: claimed draws exceed the deck ---------------------------
     * Deck composition is read off the engine's own constants, never written
     * here as a number: SD.DECK_REFORM / SD.DECK_SEIZE. Counted inside a
     * reshuffle-free window, because once the discard goes back in, tiles are
     * legitimately drawn again. Conservative on purpose — the whole deck only
     * ever holds this many of each tile, so a window total above it is
     * impossible rather than merely suspicious, and the flag cannot fire on an
     * honest table. */
    var deckOf = {};
    deckOf[SD.TILE.REFORM] = SD.DECK_REFORM;
    deckOf[SD.TILE.SEIZE] = SD.DECK_SEIZE;
    var windows = {};
    for (i = 0; i < claims.length; i++) {
      var cw = claims[i];
      if (cw.seat_role !== SEAT_ROLE.SPEAKER) continue;
      var gw = govById(record, cw.refs.government);
      if (!gw) continue;
      var key = String(gw.deck_window);
      if (!windows[key]) windows[key] = { reform: 0, seize: 0, ids: [], govs: [] };
      windows[key].reform += cw.drawn.reform;
      windows[key].seize += cw.drawn.seize;
      windows[key].ids.push(cw.id);
      if (windows[key].govs.indexOf(gw.id) === -1) windows[key].govs.push(gw.id);
      if (windows[key].reform > deckOf[SD.TILE.REFORM] ||
          windows[key].seize > deckOf[SD.TILE.SEIZE]) {
        var seatsW = {};
        windows[key].ids.forEach(function (id) {
          seatsW[utteranceById(record, id).speaker] = 1;
        });
        flag('C4', 'deck', Object.keys(seatsW).map(Number), {
          utterances: windows[key].ids.slice(), governments: windows[key].govs.slice()
        });
        /* One flag per window: reset so a third claim does not re-flag the
         * same overdraw a second time. */
        windows[key] = { reform: 0, seize: 0, ids: [], govs: [] };
      }
    }

    /* --- C5: the story changed without amending ----------------------
     * V4 makes a second claim on one government impossible unless `amends` is
     * set, so the reachable case is an amendment that does not name the claim
     * it contradicts. The `amends === null` branch stays here because this
     * function also runs over records it did not build — a replay, a saved
     * match, a future wire format — and a record that arrives with two
     * unamended claims must still be flagged rather than trusted. */
    for (i = 0; i < claims.length; i++) {
      for (j = i + 1; j < claims.length; j++) {
        var a = claims[i], b = claims[j];
        if (a.speaker !== b.speaker) continue;
        if (a.refs.government !== b.refs.government) continue;
        if (sameClaim(a, b)) continue;
        if (b.amends === a.id) continue;   // properly amended: not a flag
        flag('C5', 'self', [b.speaker], {
          utterances: [a.id, b.id], governments: [b.refs.government]
        });
      }
    }

    /* --- C6: accusing on a basis your own record contradicts ---------
     * Concretely, and only where the record can actually compute it: an
     * accusation over an enacted Seize, aimed at somebody the accuser's own
     * prior claim says had no choice.
     *   C6a  the accuser was the Speaker and claims they passed two Seize —
     *        their own record says the Deputy could enact nothing else.
     *   C6b  the accuser was the Deputy and claims they received one of each —
     *        their own record says the enactment was their own choice.
     */
    var accusations = record.utterances.filter(function (u) {
      return u.kind === KIND.ACCUSE && u.basis === 'enactment';
    });
    for (i = 0; i < accusations.length; i++) {
      var acc = accusations[i];
      var ag = govById(record, acc.refs.government);
      if (!ag || ag.resolution !== 'enacted') continue;
      var own = claimsBy(record, acc.speaker, ag.id);
      for (j = 0; j < own.length; j++) {
        var o = own[j];
        if (superseded(record, o)) continue;
        var hit = false;
        if (o.seat_role === SEAT_ROLE.SPEAKER && acc.target === ag.deputy &&
            o.passed[ag.enacted] === 2) hit = true;
        if (o.seat_role === SEAT_ROLE.DEPUTY && acc.target === ag.speaker &&
            o.received.reform === 1 && o.received.seize === 1) hit = true;
        if (hit) {
          flag('C6', 'self', [acc.speaker], {
            utterances: [o.id, acc.id], governments: [ag.id]
          });
        }
      }
    }

    flags.sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
    return flags;
  }

  function ordinalOf(id) {
    var n = parseInt(String(id).split('-')[1], 10);
    return isFinite(n) ? n : -1;
  }

  /** Does this utterance point at any of `ids`, through its refs or `amends`? */
  function namesAny(u, ids) {
    if (u.amends && ids.indexOf(u.amends) !== -1) return true;
    var keys = Object.keys(u.refs);
    for (var i = 0; i < keys.length; i++) {
      var v = u.refs[keys[i]];
      var list = Array.isArray(v) ? v : [v];
      for (var j = 0; j < list.length; j++) {
        if (ids.indexOf(list[j]) !== -1) return true;
      }
    }
    return false;
  }

  /**
   * Has the flagged citizen SPOKEN TO this flag since it arose?
   *
   * "Addressed" is deliberately narrow: an utterance by the flagged party
   * themselves, later than the last utterance the flag is built from, that
   * points at the flag (`refs.flag`) or at one of the utterances inside it
   * (through any `refs` list, or through `amends`). Somebody else answering on
   * their behalf does not count, and neither does saying something unrelated —
   * "addressed" has to mean the record can show WHICH later utterance did it,
   * or it is a feeling rather than a fold.
   */
  function addressedBy(record, seat, flagId, utteranceIds) {
    var after = -1;
    for (var i = 0; i < utteranceIds.length; i++) {
      var o = ordinalOf(utteranceIds[i]);
      if (o > after) after = o;
    }
    for (var j = 0; j < record.utterances.length; j++) {
      var u = record.utterances[j];
      if (u.speaker !== seat) continue;
      if (ordinalOf(u.id) <= after) continue;
      if (u.refs.flag === flagId) return true;
      if (namesAny(u, utteranceIds)) return true;
    }
    return false;
  }

  /** Has a later utterance by the same speaker amended this one? */
  function superseded(record, u) {
    for (var i = 0; i < record.utterances.length; i++) {
      if (record.utterances[i].amends === u.id) return true;
    }
    return false;
  }

  function sameClaim(a, b) {
    return a.seat_role === b.seat_role &&
      JSON.stringify([a.drawn, a.passed, a.received, a.blocked]) ===
      JSON.stringify([b.drawn, b.passed, b.received, b.blocked]);
  }

  /* -------------------------------------------------------------- ledger */

  /**
   * The per-citizen fold. Utterances plus public record, nothing else — so it
   * rebuilds from a replay and audits under the permutation test.
   *
   * NO SCORE, NO TRUST METER, NO PERCENTAGE. Everything is a list of ids the
   * reader can follow back to a public event; the reader does the arithmetic,
   * not the ledger.
   */
  function ledger(record) {
    var flags = contradictions(record);
    return record.seats.map(function (seat) {
      var mine = record.utterances.filter(function (u) { return u.speaker === seat; });
      var asSpeaker = [], asDeputy = [], nominated = [], aye = [], nay = [], unclaimed = [];
      record.governments.forEach(function (g) {
        if (g.speaker === seat) asSpeaker.push(g.id);
        if (g.deputy === seat) asDeputy.push(g.id);
        if (g.nominee === seat) nominated.push(g.id);
        if (g.ballot) {
          if (g.ballot.aye.indexOf(seat) !== -1) aye.push(g.id);
          if (g.ballot.nay.indexOf(seat) !== -1) nay.push(g.id);
        }
        if (g.resolved && g.resolution !== 'failed' && satIn(g, seat) &&
            !claimsBy(record, seat, g.id).length) {
          unclaimed.push(g.id);
        }
      });
      return {
        seat: seat,
        alive: isAlive(record, seat),
        governments: { speaker: asSpeaker, deputy: asDeputy, nominated: nominated },
        ballots: { aye: aye, nay: nay },
        powers: record.powers.filter(function (p) { return p.holder === seat; })
          .map(function (p) { return p.id; }),
        aimed_at: record.powers.filter(function (p) { return p.target === seat; })
          .map(function (p) { return p.id; }),
        claims: mine.filter(function (u) { return u.kind === KIND.CLAIM_HAND; })
          .map(function (u) { return u.id; }),
        unclaimed: unclaimed,
        accusations_made: mine.filter(function (u) { return u.kind === KIND.ACCUSE; })
          .map(function (u) { return u.id; }),
        accusations_against: record.utterances.filter(function (u) {
          return u.kind === KIND.ACCUSE && u.target === seat;
        }).map(function (u) { return u.id; }),
        supports_given: mine.filter(function (u) { return u.kind === KIND.SUPPORT; })
          .map(function (u) { return u.id; }),
        supports_received: record.utterances.filter(function (u) {
          return u.kind === KIND.SUPPORT && u.target === seat;
        }).map(function (u) { return u.id; }),
        questions_asked: mine.filter(function (u) { return u.kind === KIND.QUESTION; })
          .map(function (u) { return u.id; }),
        questions_received: record.utterances.filter(function (u) {
          return u.kind === KIND.QUESTION && u.target === seat;
        }).map(function (u) { return u.id; }),
        /* Explicit and timed-out silence are different events and stay
         * different here; the spec records them, it never infers them. */
        silences: {
          explicit: mine.filter(function (u) {
            return u.kind === KIND.SILENCE && u.explicit;
          }).map(function (u) { return u.id; }),
          timeout: mine.filter(function (u) {
            return u.kind === KIND.SILENCE && !u.explicit;
          }).map(function (u) { return u.id; })
        },
        obligations_open: record.obligations.filter(function (o) {
          return o.target === seat && !o.discharged;
        }).map(function (o) { return o.question; }),
        flags: flags.filter(function (f) { return f.seats.indexOf(seat) !== -1; })
          .map(function (f) { return f.id; })
      };
    });
  }

  /* --------------------------------------------------------------- audit */

  /**
   * The allowlist instrument, as a function rather than a paragraph.
   *
   * Walks a record (or one utterance) and reports every key that is not in the
   * schema, every forbidden key at any depth, and every hidden-state token used
   * as a value. test/floor.test.js runs it over 50 complete matches and then
   * injects a `role` field to prove it fails when it should.
   */
  function auditUtterance(u, into, where) {
    var out = into || [];
    var at = where || (u && u.id) || '?';
    if (!u || typeof u !== 'object') { out.push(at + ': not an object'); return out; }
    if (!KIND[u.kind]) { out.push(at + ': unknown kind ' + u.kind); return out; }
    var allowed = {};
    BASE_KEYS.concat(EXTRA_KEYS[u.kind]).forEach(function (k) { allowed[k] = 1; });
    Object.keys(u).forEach(function (k) {
      if (!allowed[k]) out.push(at + ': field not in the schema: ' + k);
    });
    BASE_KEYS.forEach(function (k) {
      if (!(k in u)) out.push(at + ': missing field ' + k);
    });
    walkForbidden(u, at, out);
    if (typeof u.text_id !== 'string' || !TEXT_ID_PATTERN.test(u.text_id)) {
      out.push(at + ': text_id is not an id');
    }
    return out;
  }

  function walkForbidden(node, path, out) {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      if (FORBIDDEN_VALUES[node]) out.push(path + ': hidden-state token "' + node + '"');
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walkForbidden(node[i], path + '[]', out);
      return;
    }
    Object.keys(node).forEach(function (k) {
      if (FORBIDDEN_KEYS.indexOf(k) !== -1) out.push(path + '.' + k + ': forbidden field "' + k + '"');
      walkForbidden(node[k], path + '.' + k, out);
    });
  }

  /** Every utterance in a record, plus the ledger it folds to. */
  function auditRecord(record) {
    var out = [];
    record.utterances.forEach(function (u) { auditUtterance(u, out, u.id); });
    ledger(record).forEach(function (e) { walkForbidden(e, 'ledger[' + e.seat + ']', out); });
    return out;
  }

  /* ------------------------------------------------------------ recorder */

  /**
   * The integration seam, and deliberately the whole of it.
   *
   * human-driver.js is frozen, so the play layer cannot be handed a hook inside
   * the session. Instead it builds one of these beside the session, calls
   * `observe(G)` after every step, and asks it what may happen next. Nothing in
   * here drives: opening a floor and choosing what to say are the caller's, and
   * at this stage nothing in src/play calls any of it.
   */
  function createRecorder(opts) {
    var record = (opts && opts.record) || createRecord();
    var api = {
      get record() { return record; },
      observe: function (G) { observe(record, G); return api; },
      acknowledgeMorning: function (day) { acknowledgeMorning(record, day); return api; },
      triggers: function () { return triggers(record); },
      canOpenFloor: function () { return canOpenFloor(record); },
      openFloor: function (spec) { return openFloorNow(record, spec); },
      closeFloor: function () { return closeFloor(record); },
      openTo: function (seat) { return floorOpenTo(record, seat); },
      grantFollowUp: function (seat) { return grantFollowUp(record, seat); },
      attempt: function (fields) { return attempt(record, fields); },
      speak: function (fields) { return speak(record, fields); },
      claimHand: function (f) { f.kind = KIND.CLAIM_HAND; return speak(record, f); },
      accuse: function (f) { f.kind = KIND.ACCUSE; return speak(record, f); },
      support: function (f) { f.kind = KIND.SUPPORT; return speak(record, f); },
      question: function (f) { f.kind = KIND.QUESTION; return speak(record, f); },
      silence: function (f) { f.kind = KIND.SILENCE; return speak(record, f); },
      flags: function () { return contradictions(record); },
      ledger: function () { return ledger(record); },
      audit: function () { return auditRecord(record); }
    };
    return api;
  }

  return {
    KIND: KIND,
    SEAT_ROLE: SEAT_ROLE,
    ACCUSE_BASIS: ACCUSE_BASIS,
    SUPPORT_BASIS: SUPPORT_BASIS,
    QUESTION_ABOUT: QUESTION_ABOUT,
    PROMPTED_BY: PROMPTED_BY,
    TRIGGERS: TRIGGERS,
    FLOOR_BEAT_CAP: FLOOR_BEAT_CAP,
    BASE_KEYS: BASE_KEYS,
    EXTRA_KEYS: EXTRA_KEYS,
    FORBIDDEN_KEYS: FORBIDDEN_KEYS,

    publicSnapshot: publicSnapshot,
    createRecord: createRecord,
    observe: observe,
    acknowledgeMorning: acknowledgeMorning,

    triggers: triggers,
    canOpenFloor: canOpenFloor,
    openFloor: openFloorNow,
    closeFloor: closeFloor,
    floorOpenTo: floorOpenTo,
    grantFollowUp: grantFollowUp,

    attempt: attempt,
    speak: speak,
    contradictions: contradictions,
    ledger: ledger,
    auditUtterance: auditUtterance,
    auditRecord: auditRecord,

    government: govById,
    utterance: utteranceById,
    floor: floorById,
    power: powerById,

    createRecorder: createRecorder
  };
});
