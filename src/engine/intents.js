/*
 * Secret Dictator — the intent strip's contents, as data.
 *
 * src/engine/floor.js gave speech a schema; src/engine/orator.js fills it in for
 * the bots. This is the third mouth in the square and the only one attached to a
 * person: given the public record, the player's seat and the utterance that
 * prompted them, it returns the four to six things that seat may say next.
 *
 * IT RENDERS NOTHING AND KNOWS NO KEY. Every slot is a `text_id` plus a complete
 * `Floor.speak` fields object. The sentence, the 34-character truncation, the
 * highlight and the oil line all live in src/play; the acceptance criterion
 * "its contents are testable without a renderer" is this file's whole shape.
 *
 * THE SAFETY PROPERTY, AND HOW IT IS HELD
 * ---------------------------------------
 * "A slot is offered only if the schema would accept the resulting utterance —
 * so the strip cannot produce an invalid claim." There are two ways to have
 * that. One is to re-derive the validity rules here, which is two
 * implementations of one law and exactly how a fuzz sweep goes green against a
 * strip that is wrong in the same direction as its test. The other is to ask the
 * constructor, which is what `Floor.attempt` is: it runs the real `speak()` and
 * unwinds it exactly, so every candidate below has already been accepted by the
 * same code that will accept it for real, on the same record, in the same beat.
 *
 * Nothing is offered that was not attempted, and nothing is attempted twice.
 *
 * THE SAME LADDERS THE BOTS WALK
 * ------------------------------
 * "The strongest basis the record supports" is one question with one answer, so
 * `Orator.accuseBasisFor` / `supportBasisFor` / `questionAboutFor` are shared
 * rather than copied. What this file adds is the part that is only true of a
 * person: it enumerates every legal TARGET instead of choosing one, because the
 * player chooses, and it enumerates the COUNTS a hand claim could carry, because
 * the player may lie and a bot's lie is a different decision made elsewhere.
 *
 * WHAT IT MAY READ
 * ----------------
 * The record (which came through `Floor.publicSnapshot` and carries nothing
 * hidden), the prompting utterance, and — for one branch only — `opts.memory`,
 * which is THIS SEAT'S OWN memory of THEIR OWN hands, the same object that fills
 * the private card. It is used to offer a truthful answer to an `enactment`
 * charge and nowhere else, and when it is absent the slot falls back to a
 * question rather than to a fabrication.
 *
 * UMD, like the rest of src/engine: CommonJS under Node, `self.SDIntents` in a
 * browser (where engine.js, floor.js and orator.js must already have loaded).
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode
    ? factory(require('./engine.js'), require('./floor.js'), require('./orator.js'))
    : factory(root.SD, root.SDFloor, root.SDOrator);
  if (isNode) module.exports = api;
  else root.SDIntents = api;
})(typeof self !== 'undefined' ? self : this, function (SD, Floor, Orator) {
  'use strict';

  var KIND = Floor.KIND;
  var SEAT_ROLE = Floor.SEAT_ROLE;

  /**
   * THE STABLE ORDER, and it is the only thing on this screen that never moves.
   *
   * "Slot 1 is always the answer, the last slot is always silence, the middle
   * contracts rather than reorders." So the builders are held as a LIST in that
   * order and the strip is that list with the nulls removed — there is no branch
   * anywhere below that can put silence anywhere but last or the answer anywhere
   * but first, because the order is not decided anywhere below.
   */
  var SLOT_ORDER = ['answer', 'accuse', 'claim', 'question', 'support', 'silence'];

  /* Every legal hand a Speaker could claim, once C1 is excluded: `passed` is a
   * subset of `drawn`. The schema would ACCEPT a passed that is not a subset —
   * C1 is a flag, not a rejection — but offering a card that flags its speaker
   * the instant they play it is offering them a trap, and the strip is a
   * keyboard rather than an opponent. In canonical order, not the player's:
   * their own hand is on their own card, and a submenu that reordered itself to
   * put the truth first would be a submenu whose shape says what they held. */
  var SPEAKER_HANDS = [
    { drawn: { reform: 3, seize: 0 }, passed: { reform: 2, seize: 0 } },
    { drawn: { reform: 2, seize: 1 }, passed: { reform: 2, seize: 0 } },
    { drawn: { reform: 2, seize: 1 }, passed: { reform: 1, seize: 1 } },
    { drawn: { reform: 1, seize: 2 }, passed: { reform: 1, seize: 1 } },
    { drawn: { reform: 1, seize: 2 }, passed: { reform: 0, seize: 2 } },
    { drawn: { reform: 0, seize: 3 }, passed: { reform: 0, seize: 2 } }
  ];
  var DEPUTY_HANDS = [
    { reform: 2, seize: 0 },
    { reform: 1, seize: 1 },
    { reform: 0, seize: 2 }
  ];

  function copy(c) { return { reform: c.reform, seize: c.seize }; }
  function satIn(g, seat) { return g.speaker === seat || g.deputy === seat; }

  function livingOthers(record, seat) {
    return record.alive.filter(function (s) { return s !== seat; });
  }

  /** The one gate every candidate passes through. Returns the fields, or null. */
  function offer(record, fields) {
    return Floor.attempt(record, fields) ? null : fields;
  }

  /* -------------------------------------------------- what a claim would say */

  /**
   * Which sentence a hand claim carries, keyed off the counts themselves.
   *
   * The same rule src/engine/orator.js uses for a bot's claim, so the player and
   * the bots say the same sentence about the same hand — a square where "I had
   * no choice" reads differently depending on who is speaking would be a tell
   * built out of prose.
   */
  function claimTextId(fields) {
    if (fields.seat_role === SEAT_ROLE.SPEAKER) {
      return fields.passed.seize === 2 && fields.drawn.seize === 3
        ? 'claim.speaker.forced' : 'claim.speaker.choice';
    }
    if (fields.blocked) return 'claim.deputy.blocked';
    return (fields.received.reform === 0 || fields.received.seize === 0)
      ? 'claim.deputy.no_choice' : 'claim.deputy.choice';
  }

  function claimOn(record, seat, gov, hand, blocked) {
    var fields = {
      kind: KIND.CLAIM_HAND,
      speaker: seat,
      refs: { government: gov.id },
      enacted: gov.resolution === 'enacted' ? gov.enacted : null,
      blocked: blocked ? true : null,
      drawn: null, passed: null, received: null,
      seat_role: gov.speaker === seat ? SEAT_ROLE.SPEAKER : SEAT_ROLE.DEPUTY,
      text_id: 'claim.speaker.choice'
    };
    if (fields.seat_role === SEAT_ROLE.SPEAKER) {
      fields.drawn = copy(hand.drawn);
      fields.passed = copy(hand.passed);
      fields.blocked = null;              // the Deputy's field, and V3 refuses it
    } else {
      fields.received = copy(hand);
    }
    fields.text_id = claimTextId(fields);
    return fields;
  }

  /** The governments this seat sat in, resolved, and has not yet claimed. */
  function unclaimedSeats(record, seat) {
    return record.governments.filter(function (g) {
      return g.resolved && g.resolution !== 'failed' && satIn(g, seat) &&
        !Orator.hasClaimed(record, seat, g.id);
    });
  }

  /* ------------------------------------------------------------ slot 1 */

  /**
   * ANSWER THE CHARGE — "always, when something was said to you; the sentence is
   * chosen by the accusation's basis".
   *
   * The schema has five kinds and none of them is called "denial", so an answer
   * has to BE one of the five. Which one is decided by what was said to you, and
   * the table below is the whole of that decision:
   *
   *   an ACCUSE over a government you sat in     a hand claim, the answer being
   *   and have not claimed, with your own        your hand — but only when your
   *   memory of it                               own memory has the row, never a
   *                                              fabrication wearing an answer's
   *                                              clothes
   *   any other ACCUSE                           a QUESTION back at the accuser
   *                                              about the accusation itself.
   *                                              It is the strongest legal reply
   *                                              a schema of five kinds has: it
   *                                              names them, it obliges them to
   *                                              take the first beat of the next
   *                                              floor, and the sentence differs
   *                                              per basis so a vote charge gets
   *                                              an answer about votes
   *   a QUESTION about your hand                 the claim it asked for
   *   any other QUESTION                         a QUESTION back
   *   a SUPPORT                                  a SUPPORT back
   *
   * Every branch is a chain of candidates and the first one the schema ACCEPTS
   * wins; if the chain empties, there is no slot 1 and the strip contracts —
   * which is the stable-order rule working, not an exception to it.
   */
  function answerSlot(record, seat, prompt, memory) {
    if (!prompt) return null;
    var them = prompt.speaker;
    var chain = [];

    /*
     * ONE SENTENCE PER PROMPT, whatever kind the answer turns out to be.
     *
     * The spec's rule is about what the player READS — "the sentence is chosen
     * by the accusation's basis" — not about which of the five kinds carries
     * it. So the `text_id` is fixed here, off the prompt, and the candidates
     * below all wear it; which one the schema accepts changes the mechanics of
     * the reply and not a word of it.
     */
    var textId = prompt.kind === KIND.ACCUSE
      ? 'answer.' + prompt.basis
      : prompt.kind === KIND.QUESTION
        ? 'answer.question.' + prompt.about
        : 'answer.support';

    function questionBack(about, refs) {
      chain.push({
        kind: KIND.QUESTION, speaker: seat, target: them, about: about,
        refs: refs, text_id: textId
      });
    }

    /** The hand you actually held there, when your own memory has the row. */
    function claimTheHand(gov) {
      var row = gov ? memory && memory[gov.id] : null;
      if (!gov || !row || !satIn(gov, seat)) return;
      chain.push(row.seat_role === SEAT_ROLE.SPEAKER
        ? claimOn(record, seat, gov, { drawn: row.drawn, passed: row.passed }, false)
        : claimOn(record, seat, gov, row.received, !!row.blocked));
      /* A Deputy who really did move to Block may find `blocked` refused if the
       * record never saw one on the table. Say the same thing without it rather
       * than losing the answer. */
      if (row.seat_role === SEAT_ROLE.DEPUTY && row.blocked) {
        chain.push(claimOn(record, seat, gov, row.received, false));
      }
    }

    /* Their own last accusation, and the last tally the square opened: the two
     * subjects a question back can always be about, in that order, because
     * turning somebody's own accusation on them is sharper than a ballot. */
    var theirAccusations = record.utterances.filter(function (u) {
      return u.kind === KIND.ACCUSE && u.speaker === them;
    });
    var tallied = record.governments.filter(function (g) { return !!g.ballot; });

    if (prompt.kind === KIND.ACCUSE) {
      if (prompt.basis === 'enactment') {
        claimTheHand(Floor.government(record, prompt.refs.government));
      }
      questionBack('accusation', { utterance: prompt.id });
    } else if (prompt.kind === KIND.QUESTION) {
      if (prompt.about === 'hand') {
        claimTheHand(Floor.government(record, prompt.refs.government));
      }
      if (prompt.about === 'vote' && prompt.refs.government) {
        questionBack('vote', { government: prompt.refs.government });
      }
      if (theirAccusations.length) {
        questionBack('accusation', {
          utterance: theirAccusations[theirAccusations.length - 1].id
        });
      }
    } else if (prompt.kind === KIND.SUPPORT) {
      chain.push({
        kind: KIND.SUPPORT, speaker: seat, target: them, basis: 'corroborate',
        refs: { utterance: prompt.id }, text_id: textId
      });
    }
    /* The last resort for every prompt: their ballot, which is on the record
     * whatever else is not. */
    if (tallied.length) {
      questionBack('vote', { government: tallied[tallied.length - 1].id });
    }

    for (var i = 0; i < chain.length; i++) {
      var ok = offer(record, chain[i]);
      if (ok) {
        return {
          id: 'answer', kind: ok.kind, fields: ok, text_id: ok.text_id,
          basis: ok.basis || ok.about || null, target: ok.target === undefined ? null : ok.target,
          options: null
        };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------ slot 2 */

  /**
   * ACCUSE — offered "when at least one citizen has a basis stronger than gut",
   * with "the basis auto-selected as the strongest the record supports, and
   * shown".
   *
   * Every living citizen is in the submenu, keyed by their own permanent number,
   * because a submenu that hid the people you have nothing on would tell you
   * something about them by omission. The SLOT is what the gut rule governs:
   * with nothing but feelings available the strip does not offer the row at all.
   */
  function accuseSlot(record, seat) {
    var options = [];
    livingOthers(record, seat).forEach(function (t) {
      var pick = Orator.accuseBasisFor(record, seat, t);
      if (!pick) return;
      var fields = offer(record, {
        kind: KIND.ACCUSE, speaker: seat, target: t, basis: pick.basis,
        refs: pick.refs, text_id: 'accuse.' + pick.basis
      });
      if (!fields) return;
      options.push({ target: t, basis: pick.basis, text_id: fields.text_id, fields: fields });
    });
    if (!options.length) return null;

    var strongest = null;
    var rank = Infinity;
    options.forEach(function (o) {
      var r = Orator.ACCUSE_STRENGTH.indexOf(o.basis);
      if (r !== -1 && r < rank) { rank = r; strongest = o; }
    });
    if (!strongest || strongest.basis === 'gut') return null;

    return {
      id: 'accuse', kind: KIND.ACCUSE, fields: null, text_id: null,
      basis: strongest.basis, target: strongest.target,
      preview: strongest, options: options
    };
  }

  /* ------------------------------------------------------------ slot 3 */

  /**
   * CLAIM_HAND — "only when you held a seat in a resolved government you have
   * not yet claimed (V1–V4). The submenu is the counts, not citizens."
   *
   * The freshest such government, because that is what the square is arguing
   * about, and one government at a time: a submenu that had to name both a
   * government and a hand would be two keystrokes wearing one card.
   */
  function claimSlot(record, seat) {
    var pool = unclaimedSeats(record, seat);
    if (!pool.length) return null;
    var gov = pool[pool.length - 1];
    var options = [];

    if (gov.speaker === seat) {
      SPEAKER_HANDS.forEach(function (hand) {
        var fields = offer(record, claimOn(record, seat, gov, hand, false));
        if (fields) options.push({ text_id: fields.text_id, fields: fields });
      });
    } else {
      DEPUTY_HANDS.forEach(function (received) {
        /* A Block that was put to the square is public, so a Deputy who moved
         * one says so — claiming otherwise is a lie about something everybody
         * watched. When the record will not carry the field, the same counts go
         * without it rather than the option being lost. */
        var fields = gov.block_proposed
          ? (offer(record, claimOn(record, seat, gov, received, true)) ||
             offer(record, claimOn(record, seat, gov, received, false)))
          : offer(record, claimOn(record, seat, gov, received, false));
        if (fields) options.push({ text_id: fields.text_id, fields: fields });
      });
    }
    if (!options.length) return null;
    return {
      id: 'claim', kind: KIND.CLAIM_HAND, fields: null, text_id: null,
      basis: null, target: null, government: gov.id,
      preview: options[0], options: options
    };
  }

  /* ------------------------------------------------------------ slot 4 */

  /**
   * QUESTION — "when a living citizen has an unclaimed hand or an unexplained
   * ballot. Costs you nothing and obliges them next floor."
   *
   * The slot is gated on a hand or a ballot being on offer; the submenu carries
   * everybody the record will let you ask anything at all, so the key that names
   * a citizen always names that citizen.
   */
  function questionSlot(record, seat) {
    var options = [];
    var pointed = false;
    livingOthers(record, seat).forEach(function (t) {
      var pick = Orator.questionAboutFor(record, seat, t);
      if (!pick) return;
      var fields = offer(record, {
        kind: KIND.QUESTION, speaker: seat, target: t, about: pick.about,
        refs: pick.refs, text_id: 'question.' + pick.about
      });
      if (!fields) return;
      if (pick.about === 'hand' || pick.about === 'vote') pointed = true;
      options.push({ target: t, basis: pick.about, text_id: fields.text_id, fields: fields });
    });
    if (!options.length || !pointed) return null;
    var first = options[0];
    for (var i = 0; i < options.length; i++) {
      if (options[i].basis === 'hand') { first = options[i]; break; }
    }
    return {
      id: 'question', kind: KIND.QUESTION, fields: null, text_id: null,
      basis: first.basis, target: first.target, preview: first, options: options
    };
  }

  /* ------------------------------------------------------------ slot 5 */

  /**
   * SUPPORT — "only when someone has publicly backed you or shares a government
   * with you. Dropped rather than padded when nobody qualifies."
   *
   * So the submenu is that set and not the roster: this is the one slot the
   * spec asks to be narrow, and padding it with everybody would make backing
   * somebody mean nothing.
   */
  function supportSlot(record, seat) {
    var backed = {};
    record.utterances.forEach(function (u) {
      if (u.kind === KIND.SUPPORT && u.target === seat) backed[u.speaker] = 1;
    });
    var options = [];
    livingOthers(record, seat).forEach(function (t) {
      var shares = record.governments.some(function (g) {
        return satIn(g, t) && satIn(g, seat);
      });
      if (!backed[t] && !shares) return;
      var pick = Orator.supportBasisFor(record, seat, t);
      if (!pick) return;
      var fields = offer(record, {
        kind: KIND.SUPPORT, speaker: seat, target: t, basis: pick.basis,
        refs: pick.refs, text_id: 'support.' + pick.basis
      });
      if (!fields) return;
      options.push({ target: t, basis: pick.basis, text_id: fields.text_id, fields: fields });
    });
    if (!options.length) return null;
    return {
      id: 'support', kind: KIND.SUPPORT, fields: null, text_id: null,
      basis: options[0].basis, target: options[0].target,
      preview: options[0], options: options
    };
  }

  /* ------------------------------------------------------------ slot 6 */

  /**
   * SILENCE — "always, always last, always the same key position."
   *
   * What it is PROMPTED BY is not a taste decision: the schema records the three
   * kinds separately and never infers them, and the handoff makes silence after
   * a QUESTION the most expensive of the three. So an open obligation outranks
   * the utterance that happens to be on the floor, an accusation aimed at you
   * outranks a floor that simply came round to you, and the fallback names
   * nothing because nothing was said to you.
   */
  function silenceFields(record, seat, prompt, explicit) {
    var chain = [];
    function silence(by, refs, textId) {
      chain.push({
        kind: KIND.SILENCE, speaker: seat, prompted_by: by, refs: refs,
        explicit: !!explicit, text_id: textId
      });
    }

    if (prompt && prompt.kind === KIND.QUESTION && prompt.target === seat) {
      silence('question', { utterance: prompt.id }, 'silence.question');
    }
    for (var i = record.obligations.length - 1; i >= 0; i--) {
      var o = record.obligations[i];
      if (o.target === seat && !o.discharged) {
        silence('question', { utterance: o.question }, 'silence.question');
        break;
      }
    }
    if (prompt && prompt.kind === KIND.ACCUSE && prompt.target === seat) {
      silence('accusation', { utterance: prompt.id }, 'silence.accusation');
    }
    for (var j = record.utterances.length - 1; j >= 0; j--) {
      var u = record.utterances[j];
      if (u.kind === KIND.ACCUSE && u.target === seat) {
        silence('accusation', { utterance: u.id }, 'silence.accusation');
        break;
      }
    }
    silence('floor_open', {}, 'silence.floor_open');

    for (var k = 0; k < chain.length; k++) {
      if (offer(record, chain[k])) return chain[k];
    }
    return null;
  }

  function silenceSlot(record, seat, prompt) {
    var fields = silenceFields(record, seat, prompt, true);
    if (!fields) return null;
    return {
      id: 'silence', kind: KIND.SILENCE, fields: fields, text_id: fields.text_id,
      basis: fields.prompted_by, target: null, options: null
    };
  }

  /* ---------------------------------------------------- what prompted you */

  /**
   * The utterance this seat is answering, if there is one.
   *
   * "Always, when something was said to you" needs a definition of *said to
   * you*, and it is two things in order:
   *
   *   1. the last thing aimed at you ON THIS FLOOR, because that is what the
   *      square is looking at you about right now;
   *   2. failing that, the QUESTION behind any obligation you still owe — an
   *      obligation persists across floors by owner ruling, and a strip that
   *      forgot the question you dodged yesterday would be the one surface in
   *      the game that let you off.
   *
   * A SILENCE aimed at nobody is never a prompt, and neither is your own
   * utterance: you cannot be prompted by yourself.
   */
  function promptFor(record, seat) {
    var f = record.openFloor ? Floor.floor(record, record.openFloor) : null;
    if (f) {
      for (var i = f.utterances.length - 1; i >= 0; i--) {
        var u = Floor.utterance(record, f.utterances[i]);
        if (!u || u.speaker === seat) continue;
        if (u.target === seat) return u;
      }
    }
    for (var j = record.obligations.length - 1; j >= 0; j--) {
      var o = record.obligations[j];
      if (o.target !== seat || o.discharged) continue;
      var q = Floor.utterance(record, o.question);
      if (q) return q;
    }
    return null;
  }

  /* ------------------------------------------------------------- the strip */

  /**
   * The four to six things this seat may say, in the one order they ever appear.
   *
   * @param {object} record  the floor's record — public, and the only state
   * @param {number} seat    the player's seat
   * @param {object} [opts]
   *        prompt   the utterance that prompted this beat, or null when the
   *                 floor simply came round to you
   *        memory   this seat's own memory of their own hands, or null
   * @returns {{seat:number, floor:string|null, prompt:string|null,
   *            promptKind:string|null, promptBasis:string|null, slots:Array}}
   */
  function stripFor(record, seat, opts) {
    opts = opts || {};
    var prompt = opts.prompt || null;
    var out = {
      seat: seat,
      floor: record.openFloor,
      prompt: prompt ? prompt.id : null,
      promptKind: prompt ? prompt.kind : null,
      promptBasis: prompt ? (prompt.basis || prompt.about || null) : null,
      slots: []
    };
    /* No floor, no beat, no strip. Asked at any other moment this is empty
     * rather than wrong, and every branch below would have been refused by
     * `Floor.attempt` anyway — this is the cheap answer, not a second rule. */
    if (!Floor.floorOpenTo(record, seat)) return out;

    var built = {
      answer: answerSlot(record, seat, prompt, opts.memory || null),
      accuse: accuseSlot(record, seat),
      claim: claimSlot(record, seat),
      question: questionSlot(record, seat),
      support: supportSlot(record, seat),
      silence: silenceSlot(record, seat, prompt)
    };
    SLOT_ORDER.forEach(function (id) {
      if (built[id]) out.slots.push(built[id]);
    });
    return out;
  }

  return {
    SLOT_ORDER: SLOT_ORDER,
    SPEAKER_HANDS: SPEAKER_HANDS,
    DEPUTY_HANDS: DEPUTY_HANDS,

    stripFor: stripFor,
    promptFor: promptFor,
    silenceFields: silenceFields,
    claimTextId: claimTextId,

    /* Exported so the suite can sweep each slot on its own. */
    answerSlot: answerSlot,
    accuseSlot: accuseSlot,
    claimSlot: claimSlot,
    questionSlot: questionSlot,
    supportSlot: supportSlot,
    silenceSlot: silenceSlot
  };
});
