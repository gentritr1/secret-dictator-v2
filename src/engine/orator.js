/*
 * Secret Dictator — the orator: what a citizen actually says.
 *
 * src/engine/floor.js gave speech a schema. Nothing had ever filled it in: every
 * utterance in every D1 sweep came from a synthetic speaker written for the
 * test, and "whether the schema can express what a bot actually wants to say"
 * was the first line of that gate's open-gaps list. This file is the answer.
 *
 * Given the public record, one seat, that seat's own private memory of its own
 * hands, and that seat's mind, it selects ONE valid utterance for one beat:
 * a CLAIM_HAND about a government it sat in, an ACCUSE on the strongest basis
 * the public record will actually support, a SUPPORT, a QUESTION, or SILENCE
 * when there is nothing worth saying.
 *
 * THREE THINGS THAT MAKE THIS SAFE, AND ONE THAT DELIBERATELY IS NOT
 * ------------------------------------------------------------------
 *
 * 1. NO DRAW FROM THE GAME'S STREAM. The engine's whole notion of chance is one
 *    seeded stream and the bots draw from it; one draw taken here would shift
 *    every later bot decision and break seed replay, which is this project's
 *    oldest law. So this module has no game object, is never handed one, and
 *    takes its randomness as `ctx.draw` — a function the caller supplies, built
 *    by `streamFor(seed)` below out of `SD.makeRng(seed ^ SALT)`. Same match
 *    seed, same argument; replays reproduce the words as well as the moves.
 *    test/orator.test.js proves it by playing fifty seeds twice, floor off and
 *    floor on, and diffing the event logs — with a positive control that hands
 *    selection the game's own stream and must diverge.
 *
 * 2. NO WRITE, ANYWHERE. It reads the record and the mind and returns a plain
 *    object of fields. The mind arrives behind a throwing Proxy in the test
 *    suite, which also records every property read: the whole surface is
 *    `mind.id`, `mind.known`, `mind.peeked` and `mind.sus`, asserted rather
 *    than described.
 *
 * 3. NOTHING HIDDEN CAN REACH THE RECORD. Not because this file is careful —
 *    because floor.js's allowlist makes it unrepresentable. There is no field
 *    on any utterance that could carry an allegiance, a certainty or a
 *    sentence, so a bot informed by its mind still cannot state what it knows.
 *
 * 4. AND THE ONE THAT IS NOT SAFE, ON PURPOSE: **utterance CHOICE correlates
 *    with role.** A citizen who knows they are on the losing side of a Seize
 *    they helped enact may claim they had no choice; a citizen who knows their
 *    team-mates does not accuse them. That is the deduction game — behavioural
 *    tells are what there is to read — and it is a different thing from the
 *    anti-tell rule, which bans PRESENTATION channels (light, animation,
 *    timing) from leaking allegiance. D1's permutation test asserted that a
 *    seat's utterance STREAM survives a rotation of the roles it may not know.
 *    That is now false by design, and the gate has been re-scoped to what must
 *    stay true: no field carries a role token, and the ledger renders
 *    identically for permuted roles GIVEN the same utterance record. See
 *    docs/step-10.md.
 *
 * LYING
 * -----
 * A CLAIM_HAND is the only kind that asserts a fact about hidden material, so
 * it is the only kind that can be caught. `ctx.memory` is this seat's own
 * memory of its own hands — a citizen knows what they were dealt — and it is
 * the caller's job to hand each seat only its own rows (createMemory().forSeat
 * does exactly that, and the suite checks it). A truthful bot claims what it
 * holds; a bot with something to cover claims the version where it had no
 * choice. The second is a real lie against a real fact, which is what makes C3
 * (the Speaker's `passed` against the Deputy's `received`) fire on a natural
 * table instead of on a fixture.
 *
 * Liars here are competent about the things that would give them away for
 * nothing: they never claim a hand that is impossible on its face (C1) and
 * never claim a hand missing the tile the whole square watched go on the board
 * (C2). They are not competent about C6 — a Speaker who says they were forced
 * and then blames the Deputy is arguing against their own record — because
 * that is the overreach the ledger exists to show.
 *
 * UMD, like the rest of src/engine: CommonJS under Node, `self.SDOrator` in a
 * browser (where engine.js and floor.js must already have loaded).
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode
    ? factory(require('./engine.js'), require('./floor.js'))
    : factory(root.SD, root.SDFloor);
  if (isNode) module.exports = api;
  else root.SDOrator = api;
})(typeof self !== 'undefined' ? self : this, function (SD, Floor) {
  'use strict';

  var KIND = Floor.KIND;

  /**
   * The salt that separates selection's stream from the game's.
   *
   * An arbitrary constant, and it must stay one: it is not derived from
   * anything, so the same match seed produces the same argument for ever, and
   * it is nowhere near the engine's own generator. src/play/pace.js and
   * src/play/murmur.js each carry their own for the same reason; this is the
   * third, and all three differ so the rhythm, the chatter and the argument are
   * not one sequence read three times.
   */
  var SALT = 0x2f6b8d13;

  /** The dedicated stream. Engine-grade — the same mulberry32 the engine uses. */
  function streamFor(seed) {
    return SD.makeRng(((seed >>> 0) ^ SALT) >>> 0);
  }

  function pick(draw, arr) { return arr[Math.floor(draw() * arr.length)]; }

  function tally(tiles) {
    var out = { reform: 0, seize: 0 };
    (tiles || []).forEach(function (t) {
      if (t === SD.TILE.REFORM) out.reform += 1;
      else if (t === SD.TILE.SEIZE) out.seize += 1;
    });
    return out;
  }

  function copyCounts(c) { return { reform: c.reform, seize: c.seize }; }

  /* ------------------------------------------------------- private memory */

  /**
   * What each citizen remembers of their OWN hands.
   *
   * Built from the driver's event stream, which is omniscient — so the whole
   * point of this object is the split. `note()` files a row under the seat that
   * actually took the action, and `forSeat()` hands back a copy of that seat's
   * rows and nothing else. A caller cannot ask for somebody else's hand, and
   * the suite proves it by asking for every seat's memory of every government
   * and requiring the seat to have sat in it.
   *
   * It is not part of the record and never enters one. A hand becomes public
   * only when its holder chooses to claim it — truthfully or otherwise.
   */
  function createMemory() {
    var bySeat = {};

    function row(seat, govId) {
      if (!bySeat[seat]) bySeat[seat] = {};
      if (!bySeat[seat][govId]) bySeat[seat][govId] = { government: govId };
      return bySeat[seat][govId];
    }

    return {
      /**
       * @param {object} ev     one driver event
       * @param {string} govId  the government open when it happened — read off
       *                        the record BEFORE the observation that resolves
       *                        it, which is the only moment it is still open.
       */
      note: function (ev, govId) {
        if (!ev || !govId || ev.actor === null || ev.actor === undefined) return;
        var d = ev.detail || {};
        var r;
        if (ev.action === 'speaker_discard') {
          r = row(ev.actor, govId);
          r.seat_role = Floor.SEAT_ROLE.SPEAKER;
          r.drawn = tally(d.hand);
          r.passed = tally(d.passedOn);
        } else if (ev.action === 'propose_block') {
          r = row(ev.actor, govId);
          r.seat_role = Floor.SEAT_ROLE.DEPUTY;
          r.received = tally(d.hand);
          r.blocked = true;
        } else if (ev.action === 'deputy_discard') {
          r = row(ev.actor, govId);
          r.seat_role = Floor.SEAT_ROLE.DEPUTY;
          r.received = tally(d.hand);
          /* A refused Block still happened, and it is public that it did. */
          r.blocked = !!r.blocked;
        }
      },
      forSeat: function (seat) {
        return JSON.parse(JSON.stringify(bySeat[seat] || {}));
      },
      get seats() { return Object.keys(bySeat).map(Number); }
    };
  }

  /* --------------------------------------------------------- reading a mind */

  /*
   * Four accessors, and they are the whole of this module's contact with a
   * mind. Each tolerates a missing mind and returns the neutral answer, so an
   * orator with no mind at all is a valid orator that argues from the public
   * record alone — which is what the invariance and permutation sweeps use when
   * they want selection held constant.
   */

  function ownSideRebel(mind) {
    if (!mind || !mind.known) return false;
    var own = mind.known[mind.id];
    return own === SD.ROLE.REBEL || own === SD.ROLE.DICTATOR;
  }

  function isTeammate(mind, id) {
    if (!mind || !mind.known || id === mind.id) return false;
    var k = mind.known[id];
    return k === SD.ROLE.REBEL || k === SD.ROLE.DICTATOR;
  }

  /** What this mind is CERTAIN of about `id`, if anything. */
  function readsAs(mind, id) {
    if (!mind) return null;
    var k = mind.known ? mind.known[id] : null;
    if (k) return k === SD.ROLE.LOYALIST ? SD.TEAM.LOYALIST : SD.TEAM.REBEL;
    return (mind.peeked ? mind.peeked[id] : null) || null;
  }

  function suspicionOf(mind, id) {
    var hard = readsAs(mind, id);
    if (hard === SD.TEAM.REBEL) return 100;
    if (hard === SD.TEAM.LOYALIST) return -100;
    return (mind && mind.sus ? mind.sus[id] : 0) || 0;
  }

  /* ------------------------------------------------------------- the pools */

  /**
   * Everybody this seat may aim something at.
   *
   * The human seat is excluded here and nowhere else, so there is exactly one
   * place for the D2 rule "the player is never targeted" to be true. In D2 the
   * player has no voice yet — the intent strip is work item 4 — and being
   * accused with no way to answer is worse than not being accused.
   */
  function targets(record, seat, ctx) {
    return record.alive.filter(function (s) {
      return s !== seat && s !== ctx.humanSeat;
    });
  }

  /**
   * Whom to accuse.
   *
   * A citizen aims at whoever their own reading makes the most dangerous, and
   * "most dangerous" is not the same sentence for both sides: a Loyalist aims
   * at the seat that reads most like a Rebel, and a Rebel aims at the seat that
   * reads least like one — the citizen it most wants out of the square. That is
   * the behavioural tell, and it is deliberate; see the header.
   */
  function accuseTarget(record, seat, ctx) {
    var pool = targets(record, seat, ctx).filter(function (s) {
      return !isTeammate(ctx.mind, s);
    });
    if (!pool.length) return null;
    var flip = ownSideRebel(ctx.mind) ? -1 : 1;
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < pool.length; i++) {
      var score = flip * suspicionOf(ctx.mind, pool[i]) + ctx.draw() * 0.75;
      if (score > bestScore) { bestScore = score; best = pool[i]; }
    }
    return best;
  }

  /** Whom to back. A team-mate first, then whoever reads friendliest. */
  function supportTarget(record, seat, ctx) {
    var pool = targets(record, seat, ctx);
    if (!pool.length) return null;
    var mates = pool.filter(function (s) { return isTeammate(ctx.mind, s); });
    if (mates.length) return pick(ctx.draw, mates);
    var flip = ownSideRebel(ctx.mind) ? 1 : -1;
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < pool.length; i++) {
      var score = flip * suspicionOf(ctx.mind, pool[i]) + ctx.draw() * 0.75;
      if (score > bestScore) { bestScore = score; best = pool[i]; }
    }
    return best;
  }

  /* ------------------------------------------------------------- the facts */

  function hasClaimed(record, seat, govId) {
    return record.utterances.some(function (u) {
      return u.kind === KIND.CLAIM_HAND && u.speaker === seat &&
        u.refs.government === govId;
    });
  }

  function satIn(g, seat) { return g.speaker === seat || g.deputy === seat; }

  function seatedGovernments(record, seat) {
    return record.governments.filter(function (g) {
      return g.resolved && g.resolution !== 'failed' && satIn(g, seat);
    });
  }

  function claimsOf(record, seat) {
    return record.utterances.filter(function (u) {
      return u.kind === KIND.CLAIM_HAND && u.speaker === seat;
    });
  }

  function silentFloorsOf(record, seat) {
    var out = [];
    record.utterances.forEach(function (u) {
      if (u.kind !== KIND.SILENCE || u.speaker !== seat) return;
      if (out.indexOf(u.floor) === -1) out.push(u.floor);
    });
    return out;
  }

  /* ------------------------------------------------------ what to claim */

  /** Two tiles that certainly include `tile` (or a mixed pair if there is none). */
  function twoWith(tile) {
    if (tile === SD.TILE.SEIZE) return { reform: 1, seize: 1 };
    if (tile === SD.TILE.REFORM) return { reform: 1, seize: 1 };
    return { reform: 1, seize: 1 };
  }

  /**
   * Has this citizen got something to cover on this government?
   *
   * Only a Rebel-side citizen, only where a Seize went on the board, and only
   * where the truth says they had a choice — a claim of "no choice" that is
   * already true is not a lie, it is a report.
   */
  function wantsCover(ctx, g, truth) {
    if (!ownSideRebel(ctx.mind)) return false;
    if (g.resolution !== 'enacted' || g.enacted !== SD.TILE.SEIZE) return false;
    if (!truth) return false;
    if (truth.seat_role === Floor.SEAT_ROLE.SPEAKER) {
      return !!truth.passed && truth.passed.reform > 0;
    }
    return !!truth.received && truth.received.reform > 0;
  }

  function claimFields(record, seat, ctx) {
    var pool = seatedGovernments(record, seat).filter(function (g) {
      return !hasClaimed(record, seat, g.id);
    });
    if (!pool.length) return null;
    /* The freshest business, because that is what the square is arguing about.
     * A fifth of the time an older unclaimed government instead, so a citizen
     * who was quiet for a day can still be brought back to it. */
    var g = pool[pool.length - 1];
    if (pool.length > 1 && ctx.draw() < 0.2) g = pick(ctx.draw, pool.slice(0, -1));

    var enacted = g.resolution === 'enacted' ? g.enacted : null;
    var truth = ctx.memory ? ctx.memory[g.id] : null;
    var lie = wantsCover(ctx, g, truth);

    var f = {
      kind: KIND.CLAIM_HAND,
      speaker: seat,
      refs: { government: g.id },
      enacted: enacted,
      blocked: null,
      text_id: null
    };

    if (g.speaker === seat) {
      f.seat_role = Floor.SEAT_ROLE.SPEAKER;
      var drawn, passed;
      if (truth && truth.drawn && truth.passed) {
        drawn = copyCounts(truth.drawn);
        passed = copyCounts(truth.passed);
      } else {
        passed = twoWith(enacted);
        drawn = { reform: passed.reform, seize: passed.seize + 1 };
      }
      if (lie) {
        /* "There was nothing else in my hand." Internally possible (C1 stays
         * quiet), consistent with the board (the Seize is there) — and flatly
         * at odds with what the Deputy was actually passed, which is C3. */
        drawn = { reform: 0, seize: 3 };
        passed = { reform: 0, seize: 2 };
      }
      f.drawn = drawn;
      f.passed = passed;
      f.received = null;
      f.text_id = passed.seize === 2 && drawn.seize === 3
        ? 'claim.speaker.forced' : 'claim.speaker.choice';
    } else {
      f.seat_role = Floor.SEAT_ROLE.DEPUTY;
      var received;
      if (truth && truth.received) received = copyCounts(truth.received);
      else received = twoWith(enacted);
      if (lie) received = { reform: 0, seize: 2 };
      /* Never claim a pair that lacks the tile the square watched land: that is
       * C2, and it is a lie that catches itself for nothing. */
      if (enacted && !received[enacted]) received = twoWith(enacted);
      f.drawn = null;
      f.passed = null;
      f.received = received;
      /* `blocked` is the Deputy's field and only exists where a Block was on
       * the table. Set only when it is true; V3 refuses it otherwise. */
      if (g.block_available && truth && truth.blocked) f.blocked = true;
      f.text_id = f.blocked ? 'claim.deputy.blocked'
        : (received.reform === 0 || received.seize === 0)
          ? 'claim.deputy.no_choice' : 'claim.deputy.choice';
    }
    return f;
  }

  /* ------------------------------------------------------ what to accuse */

  /**
   * The strongest basis the public record will actually support, in the
   * handoff's own order of strength. `gut` is last and is meant to read as
   * weak — a citizen with nothing but a feeling says so.
   */
  function accuseFields(record, seat, ctx) {
    var target = accuseTarget(record, seat, ctx);
    if (target === null) return null;

    function out(basis, refs) {
      return {
        kind: KIND.ACCUSE, speaker: seat, target: target, basis: basis,
        refs: refs, text_id: 'accuse.' + basis
      };
    }

    var i;

    /* contradiction — a flag that currently holds and names them. */
    var flags = Floor.contradictions(record);
    for (i = 0; i < flags.length; i++) {
      if (flags[i].seats.indexOf(target) === -1) continue;
      if (!flags[i].refs.utterances.length) continue;
      return out('contradiction', {
        utterances: flags[i].refs.utterances.slice(), flag: flags[i].id
      });
    }

    /* claim_consistency — two of their own claims, side by side. */
    var theirClaims = claimsOf(record, target);
    if (theirClaims.length >= 2) {
      return out('claim_consistency', {
        utterances: theirClaims.slice(-2).map(function (u) { return u.id; })
      });
    }

    /* enactment — they sat in a government that put a Seize on the board. */
    var seizes = record.governments.filter(function (g) {
      return g.resolution === 'enacted' && g.enacted === SD.TILE.SEIZE && satIn(g, target);
    });
    if (seizes.length) {
      return out('enactment', { government: seizes[seizes.length - 1].id });
    }

    /* vote_pattern — two tallies they are recorded in. */
    var voted = record.governments.filter(function (g) {
      return g.ballot && (g.ballot.aye.indexOf(target) !== -1 ||
                          g.ballot.nay.indexOf(target) !== -1);
    });
    if (voted.length >= 2) {
      return out('vote_pattern', {
        governments: voted.slice(-2).map(function (g) { return g.id; })
      });
    }

    /* power_use — a power they held. */
    var held = record.powers.filter(function (p) { return p.holder === target; });
    if (held.length) return out('power_use', { power: held[held.length - 1].id });

    /* isolation — three governments they were nowhere near. */
    var away = record.governments.filter(function (g) {
      return !satIn(g, target) && g.nominee !== target;
    });
    if (away.length >= 3) {
      return out('isolation', {
        governments: away.slice(-3).map(function (g) { return g.id; })
      });
    }

    /* silence — two floors they said nothing on. */
    var quiet = silentFloorsOf(record, target);
    if (quiet.length >= 2) return out('silence', { floors: quiet.slice(-2) });

    return out('gut', {});
  }

  /* ----------------------------------------------------- what to support */

  function supportFields(record, seat, ctx) {
    var target = supportTarget(record, seat, ctx);
    if (target === null) return null;

    function out(basis, refs) {
      return {
        kind: KIND.SUPPORT, speaker: seat, target: target, basis: basis,
        refs: refs, text_id: 'support.' + basis
      };
    }

    var shared = record.governments.filter(function (g) {
      return satIn(g, target) && satIn(g, seat);
    });
    if (shared.length) return out('partner', { government: shared[shared.length - 1].id });

    var theirs = record.utterances.filter(function (u) {
      return u.speaker === target && u.kind !== KIND.SILENCE;
    });
    if (theirs.length) return out('corroborate', { utterance: theirs[theirs.length - 1].id });

    var theirClaims = claimsOf(record, target);
    if (theirClaims.length >= 2) {
      return out('claim_consistency', {
        utterances: theirClaims.slice(-2).map(function (u) { return u.id; })
      });
    }

    var tallied = record.governments.filter(function (g) { return !!g.ballot; });
    if (tallied.length >= 2) {
      return out('vote_pattern', {
        governments: tallied.slice(-2).map(function (g) { return g.id; })
      });
    }
    return null;
  }

  /* ---------------------------------------------------- what to ask about */

  function questionFields(record, seat, ctx) {
    var pool = targets(record, seat, ctx);
    if (!pool.length) return null;

    /* Ask whoever is sitting on an unexplained hand; otherwise ask whoever
     * reads worst. Both are public-record moves — the choice of WHOM is the
     * part a mind informs. */
    var owing = pool.filter(function (s) {
      return seatedGovernments(record, s).some(function (g) {
        return !hasClaimed(record, s, g.id);
      });
    });
    var target = owing.length ? owing[0] : null;
    if (target === null) target = accuseTarget(record, seat, ctx);
    if (target === null) return null;

    function out(about, refs) {
      return {
        kind: KIND.QUESTION, speaker: seat, target: target, about: about,
        refs: refs, text_id: 'question.' + about
      };
    }

    var unclaimed = seatedGovernments(record, target).filter(function (g) {
      return !hasClaimed(record, target, g.id);
    });
    if (unclaimed.length) {
      return out('hand', { government: unclaimed[unclaimed.length - 1].id });
    }

    var theirAccusations = record.utterances.filter(function (u) {
      return u.kind === KIND.ACCUSE && u.speaker === target;
    });
    if (theirAccusations.length) {
      return out('accusation', { utterance: theirAccusations[theirAccusations.length - 1].id });
    }

    var quiet = silentFloorsOf(record, target);
    if (quiet.length) return out('silence', { floors: quiet.slice(-2) });

    var tallied = record.governments.filter(function (g) { return !!g.ballot; });
    if (tallied.length) return out('vote', { government: tallied[tallied.length - 1].id });

    return null;
  }

  /* ------------------------------------------------------- saying nothing */

  function silenceFields(record, seat, ctx) {
    var i, u;
    /* A silence that answers something names what it is answering, because the
     * handoff records it distinctly and does not infer it. */
    for (i = record.obligations.length - 1; i >= 0; i--) {
      var o = record.obligations[i];
      if (o.target === seat && !o.discharged) {
        return {
          kind: KIND.SILENCE, speaker: seat, prompted_by: 'question',
          refs: { utterance: o.question }, explicit: true,
          text_id: 'silence.question'
        };
      }
    }
    for (i = record.utterances.length - 1; i >= 0; i--) {
      u = record.utterances[i];
      if (u.kind === KIND.ACCUSE && u.target === seat) {
        return {
          kind: KIND.SILENCE, speaker: seat, prompted_by: 'accusation',
          refs: { utterance: u.id }, explicit: true,
          text_id: 'silence.accusation'
        };
      }
    }
    return {
      kind: KIND.SILENCE, speaker: seat, prompted_by: 'floor_open',
      refs: {}, explicit: true, text_id: 'silence.floor_open'
    };
  }

  /* ------------------------------------------------------------- the beat */

  function obligationFor(record, seat) {
    for (var i = 0; i < record.obligations.length; i++) {
      var o = record.obligations[i];
      if (o.target === seat && !o.discharged) return o;
    }
    return null;
  }

  /**
   * One beat.
   *
   * Returns a fields object for `Floor.speak`, never a spoken utterance —
   * choosing and saying are kept apart so a caller can inspect a choice without
   * committing it, and so this whole module can be swept without a record to
   * write into.
   *
   * `explicit: true` on every silence a bot produces is deliberate: a bot that
   * says nothing has CHOSEN to. `explicit: false` is the player's clock running
   * out, and only the intent strip (work item 4) can produce one.
   */
  function chooseUtterance(record, seat, ctx) {
    var owed = obligationFor(record, seat);

    if (owed) {
      /*
       * Somebody asked. A citizen with nothing to hide answers; a citizen with
       * something to hide sometimes does not — and since D2 a silence no longer
       * settles the question, so the evasion is still owed on the next floor
       * and the record grows a second floor of silence to point at. That is the
       * whole reason the discharge rule changed.
       */
      if (ownSideRebel(ctx.mind) && ctx.draw() < 0.4) {
        return silenceFields(record, seat, ctx);
      }
      return firstOf([claimFields, accuseFields, supportFields, questionFields],
        record, seat, ctx) || silenceFields(record, seat, ctx);
    }

    var owns = seatedGovernments(record, seat).some(function (g) {
      return !hasClaimed(record, seat, g.id);
    });

    /*
     * A weighted menu rather than a ladder of thresholds.
     *
     * The first version of this was a ladder — `if (roll < 0.6) claim; if (roll
     * < 0.78) accuse; …` — and it produced 68% accusations over fifty matches,
     * because a seat with no unexplained hand of its own (which is most seats,
     * most of the time) fell straight into the accuse band and took the whole
     * of it. A square where two thirds of every sentence is an accusation is
     * not a square. The weights are renormalised over whatever is actually on
     * offer, so removing a branch redistributes it instead of handing it to
     * whichever branch happens to be next in the list.
     */
    var menu = [];
    if (owns) menu.push([0.42, claimFields]);
    menu.push([0.23, accuseFields]);
    menu.push([0.15, questionFields]);
    menu.push([0.13, supportFields]);
    menu.push([0.07, silenceFields]);

    var total = 0, i;
    for (i = 0; i < menu.length; i++) total += menu[i][0];
    var roll = ctx.draw() * total;
    for (i = 0; i < menu.length; i++) {
      roll -= menu[i][0];
      if (roll <= 0) {
        var chosen = menu[i][1](record, seat, ctx);
        if (chosen) return chosen;
        break;
      }
    }
    return firstOf([claimFields, accuseFields, questionFields, supportFields],
      record, seat, ctx) || silenceFields(record, seat, ctx);
  }

  function firstOf(makers, record, seat, ctx) {
    for (var i = 0; i < makers.length; i++) {
      var f = makers[i](record, seat, ctx);
      if (f) return f;
    }
    return null;
  }

  /**
   * Who speaks, in what order, on this floor.
   *
   * The trigger's first speaker, then whoever it names second, then anybody a
   * QUESTION obliged gets their SECOND beat queued right there — appending them
   * at the end instead looks tidier and never fires, which is exactly how D1's
   * obligation cap went 498 floors without being exercised. Then the ring,
   * starting after the first speaker so the same neighbour does not always take
   * the second beat.
   *
   * The human seat is not in this list, at all, in D2.
   */
  function beatOrder(record, f, ctx) {
    var out = [];
    function once(s) {
      if (s === null || s === undefined) return;
      if (s === ctx.humanSeat) return;
      if (record.alive.indexOf(s) === -1) return;
      if (out.indexOf(s) === -1) out.push(s);
    }
    once(f.first);
    once(f.then);
    f.obliged.forEach(function (s) {
      if (s !== ctx.humanSeat && out.indexOf(s) !== -1) out.push(s);
    });
    var ring = record.alive.filter(function (s) { return s !== ctx.humanSeat; });
    var start = f.first === null || f.first === undefined ? 0 : ring.indexOf(f.first) + 1;
    if (start < 0) start = 0;
    for (var i = 0; i < ring.length; i++) once(ring[(start + i) % ring.length]);
    return out;
  }

  /**
   * Open a floor and fill it.
   *
   * The one code path. src/play drives this and so does the test suite, for the
   * reason step-09 wrote down about the recorder facade: a convenient second
   * door is a second answer waiting to happen.
   *
   * A refusal is REPORTED, not thrown and not swallowed. `rejected` staying
   * empty over fifty matches is this gate's version of "zero schema-rejected
   * submissions from the strip", one work item early; a caught exception that
   * nobody counts would turn that into a green light.
   */
  function holdFloor(record, spec, ctx) {
    var f = Floor.openFloor(record, spec);
    var order = beatOrder(record, f, ctx);
    var said = [];
    var rejected = [];
    for (var i = 0; i < order.length; i++) {
      var seat = order[i];
      if (!Floor.floorOpenTo(record, seat)) continue;
      var seatCtx = contextFor(ctx, seat);
      var fields = chooseUtterance(record, seat, seatCtx);
      if (!fields) continue;
      try {
        said.push(Floor.speak(record, fields));
      } catch (e) {
        rejected.push({ seat: seat, kind: fields.kind, rule: e.rule || '?', why: e.message });
      }
    }
    Floor.closeFloor(record);
    return { floor: f, utterances: said, rejected: rejected };
  }

  /** One seat's view of the shared context: its own mind, its own memory. */
  function contextFor(ctx, seat) {
    return {
      draw: ctx.draw,
      humanSeat: ctx.humanSeat === undefined ? null : ctx.humanSeat,
      mind: ctx.minds ? ctx.minds[seat] : (ctx.mind || null),
      memory: ctx.memory
        ? (typeof ctx.memory.forSeat === 'function' ? ctx.memory.forSeat(seat) : ctx.memory)
        : null
    };
  }

  return {
    SALT: SALT,
    streamFor: streamFor,
    createMemory: createMemory,

    chooseUtterance: chooseUtterance,
    beatOrder: beatOrder,
    holdFloor: holdFloor,
    contextFor: contextFor,

    /* Exported for the suite, which sweeps each builder on its own. */
    claimFields: claimFields,
    accuseFields: accuseFields,
    supportFields: supportFields,
    questionFields: questionFields,
    silenceFields: silenceFields,
    targets: targets
  };
});
