/*
 * The tray: 1280 x 84px, along the bottom, there for the whole match.
 *
 * It replaces the eleven-row debug sidebar, and it replaces it with two
 * permanent readouts and one row that changes. Three regions, from
 * design/handoff/floor-and-hud/README.md and wireframe 4A:
 *
 *   |-- 240 --------|-- flexible ------------------------|-- 200 --------|
 *   | the tracks    | the contextual row                 | ledger · keys |
 *
 * THE RULE THIS FILE EXISTS TO HOLD: **never blank.** Every phase of a complete
 * match has a defined state, and the state for "nothing is being asked of you"
 * NAMES who the square is waiting for, in dim parchment, with no keys offered —
 * so "there is nothing to press" is a thing the tray says rather than a thing
 * the player infers from an empty box. test/hud.test.js sweeps 50 complete
 * matches and fails on a single state whose line is empty or whose id this
 * module does not admit to.
 *
 * Like src/play/objective.js, THE SIGNATURE IS THE TRUST BOUNDARY: it is handed
 * the player-safe projection and a presentation clock, and it imports no engine
 * module, so it can leak nothing it was never given. The presentation argument
 * carries no ids, no roles and no rules — it is two booleans and a sentence the
 * page already put on screen.
 *
 * What it deliberately does NOT carry, and where those went instead:
 *
 *   deck / discard   the ledger (next gate). Reachable meanwhile through
 *                    `__play.ledger()`, and absent from the screen on purpose.
 *   the log          the ledger, rebuilt as per-citizen entries.
 *   chaos            the ledger, PROMOTED into the tracks at 2 of 3 — irrelevant
 *                    at nought, the loudest thing on screen at two.
 *   next power       the ledger, plus one announcement beat when a Seize lands
 *                    (`presentation.announce`, held by the page for 3 s).
 *   role / known     the private card. See src/play/card.js.
 *   phase / nominee / alive / speaker / deputy / day
 *                    dead, or in the world, or already in the objective line.
 *
 * TRAY VERSUS CENTRED CARD. If a decision requires showing you private material
 * — three tiles, two tiles, a Foresight read — it takes the middle of the screen
 * and a deliberate close. Everything else is a row here. `surfaceFor` below is
 * that rule, and src/play/main.js routes the E key through it, so the tray and
 * the panel cannot disagree about who owns a decision.
 */

import { seatKey, seatLabel, seatList, seatName } from './seat.js';

/**
 * Which decisions live in the tray, and which take the centre of the screen.
 *
 * Four in the tray (nominate, vote, block response, power target) and three on
 * a card (speaker draft, deputy draft, foresight), exactly as the spec splits
 * them. `acknowledge` is the fourth card kind and is not in the spec's list of
 * seven because it is not a decision — it is the morning report, the Chaos
 * screen and the ballot tally: three ceremonies with a page of public reading
 * apiece and a single Continue. They keep the centre of the screen and the bell
 * and podium trips Gate 1.5 tuned; the tray announces that they are pending.
 */
export const TRAY_DECISIONS = ['nominate', 'vote', 'block_response', 'power_target'];
export const CARD_DECISIONS = ['speaker_discard', 'deputy_discard', 'power_ack', 'acknowledge'];

/** Where a pending decision is answered: 'tray' or 'card'. */
export function surfaceFor(kind) {
  return TRAY_DECISIONS.indexOf(kind) === -1 ? 'card' : 'tray';
}

/**
 * Every id this module can return, in the same spirit as OBJECTIVE_IDS: the
 * mapping is the contract and the prose is not, so a test can assert WHICH
 * state was chosen without matching a sentence.
 */
export const TRAY_IDS = [
  /* a decision you own that is answered here — offered, then taken */
  'own:nominate', 'own:vote', 'own:block_response', 'own:power_target',
  'armed:nominate', 'armed:vote', 'armed:block_response', 'armed:power_target',
  /* a decision you own that is answered on a centred card */
  'card:speaker_discard', 'card:deputy_discard', 'card:power_ack:foresight',
  'card:acknowledge:morning', 'card:acknowledge:chaos', 'card:acknowledge:vote_result',
  'card:unknown',
  /* the square is busy producing something for you (the deliberation beat) */
  'beat:vote', 'beat:acknowledge:vote_result', 'beat:acknowledge:chaos',
  'beat:acknowledge:morning', 'beat:nominate', 'beat:speaker_discard',
  'beat:deputy_discard', 'beat:block_response', 'beat:power_target',
  'beat:power_ack:foresight', 'beat:unknown',
  /* one beat of news, then back to whatever was there */
  'announce',
  /*
   * Nothing is being asked of you: who the square is waiting for.
   *
   * Three of these are the defensive branch rather than a coverage target, for
   * the same reason src/play/objective.js stars three of its own ids: a living
   * seat always owes a ballot in the vote phase, and both acknowledgement gates
   * fire for every seat whether it is alive or not. `empty:vote`,
   * `empty:vote_result` and `empty:chaos` are therefore unreachable while you
   * are still in the game — a dead seat reaches `dead` first — and they exist so
   * that a future change to humanTurn() cannot produce a blank tray.
   */
  'empty:nomination', 'empty:vote', 'empty:vote_result',
  'empty:legislative_speaker', 'empty:legislative_deputy', 'empty:block_response',
  'empty:chaos', 'empty:power', 'empty:unknown',
  'dead',
  'over'
];

/* The dim second line of an empty state. The wireframe's four dots: something
 * is there, and it is deliberately not a sentence. */
const QUIET = '····';

/*
 * The powers, in one line each.
 *
 * Deliberately written without a role word in it. The panel's longer blurbs say
 * "you will be told Loyalist or Rebel", which is correct rules copy on a screen
 * you opened on purpose — but the tray is PERMANENT, and a permanent surface
 * that can print a role word is one keystroke of carelessness away from
 * printing one next to a name. So the words are simply not available here, and
 * test/hud.test.js sweeps every tray state in fifty matches to keep it that way.
 */
const POWER_NOTE = {
  peek: 'You are told which side they are on — and nothing about anybody else.',
  foresight: 'The top three, in order, then they go back.',
  emergency: 'They speak next; the rotation carries on past you afterwards.',
  purge: 'If they are the one the plot is built around, the Republic holds at once.'
};

/*
 * What the square is producing during the beat after one of your own
 * submissions. Short, because this is a row and not a paragraph, and specific,
 * because "please wait" is the thing a beat exists to avoid. Keyed by the
 * decision now owed — src/play/pace.js's `beatKey` — so the length of the pause
 * and the sentence describing it cannot drift apart.
 */
const BEAT_LINE = {
  vote: 'The square is taking its seats to vote.',
  'acknowledge:vote_result': 'The ballots are sealed — the square is counting them.',
  'acknowledge:chaos': 'No government again — the deck is taking over.',
  'acknowledge:morning': 'The square is gathering for the new session.',
  nominate: 'The square settles, and the gavel comes to you.',
  speaker_discard: 'Three tiles are being dealt to you.',
  deputy_discard: 'Two tiles are being passed to you.',
  block_response: 'The Deputy is putting the Block to you.',
  power_target: 'The board is granting you the power.',
  'power_ack:foresight': 'The board is granting you the power.'
};

const OBJECT_LABEL = { bell: 'at the bell', podium: 'at the podium' };

/*
 * The four powers, by name.
 *
 * A copy of the engine's `SD.POWER_LABEL`, and a copy on purpose: this module
 * imports no engine module, which is the whole trust boundary. A copy can
 * drift, so test/hud.test.js requires this table and the engine's to be equal
 * key for key rather than trusting that nobody renames a power.
 */
export const POWER_LABEL = {
  peek: 'Peek Allegiance',
  foresight: 'Foresight',
  emergency: 'Emergency Vote',
  purge: 'Purge'
};

function ordinal(n) {
  return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
}

/**
 * The one-beat announcement, when a Seize lands: what the board just armed.
 *
 * The retired "next power" row, spent as news rather than as furniture. Pure so
 * the page can hold it on a clock without this module owning one, and so the
 * sentence is testable without a renderer.
 *
 * @param {number} seize      the Seize count AFTER the tile landed
 * @param {string|null} power the power that Seize granted, or null for none
 */
export function announceFor(seize, power) {
  const which = 'The ' + ordinal(seize) + ' Seize';
  return power && POWER_LABEL[power]
    ? `${which} grants ${POWER_LABEL[power]}.`
    : `${which} grants no power.`;
}

/** Which object a decision opens at. The same rule src/play/objective.js owns. */
function objectFor(kind, gate) {
  if (kind !== 'acknowledge') return 'podium';
  return gate === 'vote_result' ? 'podium' : 'bell';
}

function keyRow(key, label, value) {
  return { key: key, label: label, value: value };
}

/** The permanent left cluster: the two numbers you must never squint at. */
function tracksFor(view) {
  if (!view) return null;
  return {
    reform: { n: view.reform, of: view.limits.reformToWin },
    seize: { n: view.seize, of: view.limits.seizeToWin },
    /*
     * Chaos is a ledger row that PROMOTES here at two of three. It is
     * meaningless at nought — nobody has failed to govern — and at two it is the
     * single most important number on the board, because the next failure hands
     * the deck the law. On screen only when it is true.
     */
    chaos: {
      n: view.chaos, of: view.limits.chaosLimit,
      show: view.chaos >= view.limits.chaosLimit - 1
    }
  };
}

/** The ledger affordance. `ready` is false until the next gate builds it. */
function ledgerHint() {
  return { key: 'L', label: 'ledger', ready: false, keysKey: '?', keysLabel: 'keys' };
}

function make(tracks, id, kind, line, note, keys, act, waitingOn) {
  return {
    id: id,
    kind: kind,
    line: line,
    note: note || '',
    keys: keys || [],
    act: !!act,
    tracks: tracks,
    waitingOn: waitingOn || [],
    ledger: ledgerHint()
  };
}

/**
 * @param {object} view  the player-safe projection, `waitingFor` populated
 * @param {object} [presentation]
 *        `{ holding, armed, announce }` — a clock and two flags, no game state.
 *        `holding`  the deliberation beat is running (src/play/pace.js)
 *        `armed`    you have taken the pending tray decision (pressed E at the
 *                   object that owes it), so its keys are live
 *        `announce` a sentence the page is holding for one beat, or null
 * @returns {{id:string, kind:string, line:string, note:string, keys:Array,
 *            act:boolean, tracks:object, waitingOn:number[], ledger:object}}
 */
export function trayFor(view, presentation) {
  const p = presentation || {};
  const tracks = tracksFor(view);

  if (!view) {
    return make(tracks, 'empty:unknown', 'empty', 'Dealing a new match…', QUIET, [], false, []);
  }

  /* The end of the match outranks everything else on screen. */
  if (view.phase === 'game_over') {
    const won = view.winner && view.winner === view.you.team;
    return make(tracks, 'over', 'over',
      `The match is over — ${won ? 'you won' : 'you lost'}.`,
      'Restart, top right, deals a new one.', [], false, []);
  }

  const owed = view.waitingFor;

  /*
   * One beat of news. It outranks the empty state and never a decision.
   *
   * This is the retired "next power" row: when a Seize lands the tray says what
   * the board has just armed, holds it for three seconds, and hands the number
   * back to the ledger. The page owns the clock; this module owns only the fact
   * that news displaces quiet and not work.
   */
  if (p.announce && !owed) {
    return make(tracks, 'announce', 'announce', p.announce, QUIET, [], false, []);
  }

  /* The deliberation beat: the rules already owe you something, the square has
   * not visibly produced it yet, and no key will answer until it has. */
  if (p.holding && owed) {
    const key = owed.gate ? owed.kind + ':' + owed.gate : owed.kind;
    return make(tracks, BEAT_LINE[key] ? 'beat:' + key : 'beat:unknown', 'beat',
      BEAT_LINE[key] || 'The square is answering.', QUIET, [], false, []);
  }

  if (owed) return decision(view, owed, p, tracks);

  if (!view.you.alive) {
    return make(tracks, 'dead', 'dead',
      'You were purged — nothing more is asked of you.',
      'The square goes on without you.', [], false, []);
  }

  return empty(view, tracks);
}

/* ------------------------------------------------------ a decision you own */

/** The id for a pending decision on a centred card: by gate, else by kind. */
function cardId(w, key) {
  if (TRAY_IDS.indexOf('card:' + key) !== -1) return 'card:' + key;
  if (TRAY_IDS.indexOf('card:' + w.kind) !== -1) return 'card:' + w.kind;
  return 'card:unknown';
}

function decision(view, w, p, tracks) {
  const key = w.gate ? w.kind + ':' + w.gate : w.kind;
  const where = OBJECT_LABEL[objectFor(w.kind, w.gate)];

  /* Private material takes the middle of the screen. The tray says what is
   * pending and which object opens it, and offers the one key that does. */
  if (surfaceFor(w.kind) === 'card') {
    const spec = CARD_LINE[key] || CARD_LINE[w.kind];
    return make(tracks, cardId(w, key), 'card',
      spec ? spec.line(view, w) : 'The square is waiting on you.',
      spec ? spec.note(view, w) : '',
      [keyRow('E', where, null)], true, []);
  }

  /*
   * A tray decision, in its two states.
   *
   * OFFERED: the row names the decision and offers `E` at the object that owes
   * it — the walking square's contract is unchanged, you still go there.
   * ARMED: you pressed it, and the row now carries the keys that answer. Keys
   * are shown only while they are live, which is the same grammar the empty
   * state uses in the other direction: what is on the tray is what works.
   */
  const row = TRAY_LINE[w.kind];
  const armed = !!p.armed;
  return make(tracks, (armed ? 'armed:' : 'own:') + w.kind,
    armed ? 'armed' : 'offered',
    row.line(view, w), row.note(view, w),
    armed ? row.keys(view, w) : [keyRow('E', where, null)],
    true, []);
}

/*
 * The four tray decisions. `keys` is what the player may press once the row is
 * theirs, and every citizen key is that citizen's PERMANENT number — so the
 * offered keys can be 2, 3, 5, 6 with gaps where the term-limited sit, which is
 * the whole point of the one grammar and is exactly what wireframe 4A draws.
 */
const TRAY_LINE = {
  nominate: {
    line: () => 'Name a Deputy:',
    note: (view, w) => (w.detail.termLimited.length
      ? seatList(view, w.detail.termLimited) +
        (w.detail.termLimited.length === 1 ? ' is' : ' are') + ' term-limited today.'
      : 'Nobody is term-limited today.'),
    keys: (view, w) => w.options.map((id) => keyRow(seatKey(id), seatName(view, id), id))
  },
  vote: {
    line: (view, w) => `${seatLabel(view, w.detail.speaker)} to govern with ` +
      `${seatLabel(view, w.detail.nominee)}?`,
    note: () => 'Everyone alive votes at once. A tie fails.',
    keys: () => [keyRow('A', 'Aye', true), keyRow('N', 'Nay', false)]
  },
  block_response: {
    line: (view, w) => `${seatLabel(view, w.detail.deputy)} moves to Block — burn both tiles?`,
    note: () => 'Agreeing passes no law and turns the Chaos Track.',
    keys: (view, w) => [
      keyRow('1', 'Agree', w.options[0]),
      keyRow('2', 'Refuse', w.options.length > 1 ? w.options[1] : false)
    ]
  },
  power_target: {
    line: (view, w) => `${w.detail.label}: ` + (w.detail.power === 'purge'
      ? 'name one citizen to leave the square.'
      : w.detail.power === 'peek'
        ? 'whose allegiance do you read?'
        : 'who takes the gavel next?'),
    note: (view, w) => POWER_NOTE[w.detail.power] || '',
    keys: (view, w) => w.options.map((id) => keyRow(seatKey(id), seatName(view, id), id))
  }
};

/* The four that open a centred card. The tray still names them, because a tray
 * that went quiet while the square was waiting on you would be lying about
 * whose move it is. */
const CARD_LINE = {
  speaker_discard: {
    line: () => 'You drew three — throw one away.',
    note: (view) => `The other two go to ${seatLabel(view, view.deputy)}.`
  },
  deputy_discard: {
    line: () => 'Two were passed to you — enact one.',
    note: (view, w) => (w.detail.canBlock
      ? 'Five Seize are down — you may ask the Speaker to burn both.'
      : 'The square sees only what you enact.')
  },
  power_ack: {
    line: (view, w) => `${w.detail.label || 'Foresight'} — for you alone.`,
    note: () => 'The top three, in order. Nobody is told what you saw.'
  },
  'acknowledge:morning': {
    line: (view, w) => `Day ${w.detail.day} — ring the bell to open the session.`,
    note: (view, w) => (w.detail.isSpecialElection
      ? 'An emergency session: the gavel did not simply rotate.'
      : `${seatLabel(view, w.detail.speaker)} holds the gavel.`)
  },
  'acknowledge:chaos': {
    line: () => 'Three failed governments — chaos takes the deck.',
    note: () => 'Nobody drew it, nobody chose it, and it grants no power.'
  },
  'acknowledge:vote_result': {
    line: () => 'The ballots are sealed — open them.',
    note: () => 'Where the motion was made, and where you voted.'
  }
};

/* ---------------------------------------------------------- nobody's move */

/**
 * The empty state, which is the one the never-blank rule is actually about.
 *
 * Every branch names a citizen by number wherever the square is waiting on a
 * particular citizen, and says "the square" only where it genuinely is waiting
 * on everybody at once. `waitingOn` carries the ids so a test can check the
 * sentence against them rather than against a copy of the prose.
 */
function empty(view, tracks) {
  const line = (id, text, on, note) =>
    make(tracks, 'empty:' + id, 'empty', text, note || QUIET, [], false, on);

  switch (view.phase) {
    case 'nomination':
      return line('nomination',
        `${seatLabel(view, view.speaker)} holds the gavel and is naming a Deputy.`,
        [view.speaker]);
    case 'vote':
      return line('vote', 'The square is sealing its ballots.', [],
        `${view.ballotsSealed} of ${view.aliveCount} are in.`);
    case 'vote_result':
      return line('vote_result', 'The ballots are being opened.', []);
    case 'legislative_speaker':
      return line('legislative_speaker',
        `${seatLabel(view, view.speaker)} and ${seatLabel(view, view.deputy)} ` +
        'have withdrawn to draft.', [view.speaker, view.deputy]);
    case 'legislative_deputy':
      return line('legislative_deputy',
        `${seatLabel(view, view.deputy)} is choosing which law to enact.`, [view.deputy]);
    case 'block_response':
      return line('block_response',
        `${seatLabel(view, view.speaker)} is answering ` +
        `${seatLabel(view, view.deputy)}'s Block.`, [view.speaker, view.deputy]);
    case 'chaos':
      return line('chaos', 'Chaos takes the deck.', []);
    case 'power': {
      const holder = view.power ? view.power.holder : view.speaker;
      const label = view.power ? view.power.label : 'the power the board granted';
      return line('power', `${seatLabel(view, holder)} is using ${label}.`, [holder]);
    }
    default:
      return line('unknown', `The square is in ${view.phase}.`, []);
  }
}
