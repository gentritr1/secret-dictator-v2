/*
 * The persistent objective line: one sentence that always says what to do next.
 *
 * Gate 1 exists because a first-time player is never told to visit the bell or
 * the podium. The prompt only appears once you are already standing in front of
 * the right object, which is the one moment you no longer need it. This line is
 * the opposite: it is on screen the whole time, and it names the object.
 *
 * THE SIGNATURE IS THE TRUST BOUNDARY. `objectiveFor(view)` takes the
 * player-safe projection and nothing else — no game object, no session, no
 * driver event. It cannot leak what it was never handed, exactly like
 * panels.js, and for the same reason: this string is the single most-read piece
 * of text on the screen, so it is the worst possible place for an accidental
 * `G.players[id].role`.
 *
 * Everything it reads is already public to this seat:
 *
 *   view.waitingFor   the pending decision for THIS seat (kind, gate, detail)
 *   view.phase        announced to the square
 *   view.speaker / .deputy / .nominee / .power.holderName   announced
 *   view.you.alive    your own state
 *   view.winner       revealed at game over and only then
 *
 * It deliberately never prints a tile, a role or a team token. The three tiles
 * a Speaker drew are legitimately in `waitingFor.detail` for that seat, but a
 * line that lives permanently on screen is not where a private hand belongs —
 * the panel you opened on purpose is. test/objective.test.js sweeps every line
 * of complete matches for role and tile tokens, and for any player name that is
 * not publicly involved in the current beat.
 *
 * Every line names the object to walk to, and the two objects are the two the
 * interaction system routes to (src/play/main.js):
 *
 *   acknowledge  -> the bell     (interact.js: kind === 'acknowledge')
 *   everything else -> the podium (kind !== 'acknowledge')
 *
 * That correspondence is asserted rather than trusted: a line that says "bell"
 * for a decision the bell cannot open is a lie the player pays for by walking.
 *
 * `id` is the mapping key, returned alongside the text so a test can assert
 * WHICH line was chosen without matching prose. Prose changes; the mapping is
 * the contract.
 */

/**
 * Every id this module can return.
 *
 * The starred ones are unreachable with a seat actually seated, and are here as
 * the defensive branch rather than as coverage targets:
 *
 *   bots:vote          a living seat always owes a ballot in the vote phase
 *   bots:vote_result   both acknowledge gates fire for every seat, alive or not
 *   bots:chaos
 *   unknown            a decision kind or phase this file has not been taught
 *
 * A dead seat reaches `dead` before any of the bots:* lines, so those three can
 * only be produced by a future change to humanTurn(). test/objective.test.js
 * asserts the REACHABLE set is completely covered and that nothing outside this
 * list is ever returned.
 */
export const OBJECTIVE_IDS = [
  'game_over',
  'acknowledge:morning',
  'acknowledge:vote_result',
  'acknowledge:chaos',
  'nominate',
  'vote',
  'speaker_discard',
  'deputy_discard',
  'block_response',
  'power_target:peek',
  'power_target:emergency',
  'power_target:purge',
  'power_ack:foresight',
  'dead',
  'bots:nomination',
  'bots:vote',
  'bots:vote_result',
  'bots:legislative_speaker',
  'bots:legislative_deputy',
  'bots:block_response',
  'bots:chaos',
  'bots:power',
  'unknown',
  /* The deliberation beats, one per decision that can immediately follow one
   * of your own submissions. See BEAT_LINE and src/play/pace.js. */
  'beat:vote',
  'beat:acknowledge:vote_result',
  'beat:acknowledge:chaos',
  'beat:acknowledge:morning',
  'beat:nominate',
  'beat:speaker_discard',
  'beat:deputy_discard',
  'beat:block_response',
  'beat:power_target',
  'beat:power_ack'
];

/**
 * Which object a given decision is opened at. **This is the routing rule
 * itself, not a copy of it** — src/play/main.js registers the podium and the
 * bell by calling this function, so the line and the interactable cannot
 * disagree. Gate 1 had the rule written out twice and the test asserting
 * against the copy; that is a bug waiting for someone to change one of them.
 *
 * Gate 1.5 moved one gate. The owner played and reported the bell as a chore,
 * and the measurement agreed: it was visited more often than the podium at
 * every table size, because a day costs two trips to it. The ballots now open
 * where the motion was made and where the player is already standing — they
 * voted at the podium a moment ago. The morning report and the Chaos screen
 * stay at the bell: one ritual trip a day, and one piece of news big enough to
 * be worth the walk. See docs/step-05.md.
 */
export function objectFor(kind, gate) {
  if (kind !== 'acknowledge') return 'podium';
  return gate === 'vote_result' ? 'podium' : 'bell';
}

function nameOf(view, id) {
  if (id == null) return 'nobody';
  const p = view.players.find((q) => q.id === id);
  return p ? p.name : '#' + id;
}

/* "Bo with Alice" is a sentence about somebody else even when Alice is the
 * person reading it. Only two lines can name your own seat — the ballot and
 * the draft you are waiting to be handed — and both read better this way. */
function seatName(view, id) {
  return id != null && id === view.you.id ? 'you' : nameOf(view, id);
}

/**
 * What the square is doing during the beat between your submission and the
 * decision it produced becoming answerable (see src/play/pace.js).
 *
 * Keyed by the decision now OWED, because that is what the square is busy
 * producing — the same key `pace.beatKey` builds, so the length of the pause
 * and the sentence describing it cannot drift apart.
 *
 * None of these is filler. "The square is thinking" would be filler; each of
 * these names the specific thing that has to happen before you can act, which
 * is the property the owner's "it is intuitive overall what to do" was about.
 */
const BEAT_LINE = {
  vote: 'The nomination stands — the square is taking its seats to vote.',
  'acknowledge:vote_result': 'The ballots are sealed — the square is counting them.',
  'acknowledge:chaos': 'No government again — the deck is taking over.',
  'acknowledge:morning': 'The square is gathering for the new session.',
  nominate: 'The square settles, and the gavel comes to you.',
  speaker_discard: 'You withdraw to draft — three tiles are being dealt to you.',
  deputy_discard: 'The Speaker throws one away and passes two to you.',
  block_response: 'The Deputy is putting the Block to you.',
  power_target: 'The board is granting you the power.',
  power_ack: 'The board is granting you the power.'
};

/**
 * @param {object} view  the output of View.viewFor for this seat, with
 *                       `waitingFor` populated by the session
 * @param {object} [presentation] `{ holding }` — true while the page is holding
 *                       the deliberation beat after your own submission. It is
 *                       a clock, not game state: it carries no ids, no roles
 *                       and no rules, and the only thing it can do is choose a
 *                       sentence from BEAT_LINE above. The view stays the sole
 *                       source of everything the line SAYS.
 * @returns {{id: string, text: string, act: boolean, at: string|null}}
 *          `act` is true when the square is waiting on YOU — the page uses it
 *          to make the line warm, because warm means attention.
 */
export function objectiveFor(view, presentation) {
  if (!view) return { id: 'unknown', text: 'Dealing a new match…', act: false, at: null };

  const line = (id, text, at) => ({ id, text, act: at !== null, at: at || null });

  /* The beat comes before everything except the end of the match: while it is
   * running the decision exists but cannot be opened, and a line telling the
   * player to go and press E on something inert is the stale instruction this
   * gate exists to avoid. */
  if (presentation && presentation.holding && view.waitingFor &&
      view.phase !== 'game_over') {
    const w = view.waitingFor;
    const key = w.gate ? w.kind + ':' + w.gate : w.kind;
    return line('beat:' + key, BEAT_LINE[key] || 'The square is answering.', null);
  }

  /* The end comes first: at game over there is nothing left to owe. */
  if (view.phase === 'game_over') {
    const won = view.winner && view.winner === view.you.team;
    return line('game_over',
      `The match is over — ${won ? 'you won' : 'you lost'}. Restart, top right, deals a new one.`,
      null);
  }

  const w = view.waitingFor;

  if (w) {
    switch (w.kind) {
      case 'acknowledge':
        if (w.gate === 'morning') {
          /* The emergency session is announced in the public log the moment the
           * power is spent, so naming it here tells nobody anything new — but
           * it is the one morning where the gavel did not simply rotate, and a
           * first-time player has no other way to notice. */
          const special = w.detail.isSpecialElection ? ' (emergency session)' : '';
          return line('acknowledge:morning',
            `Day ${w.detail.day}${special} — walk to the bell and ring it to open the session.`,
            'bell');
        }
        if (w.gate === 'chaos') {
          return line('acknowledge:chaos',
            'Three failed governments — walk to the bell; chaos takes the deck.', 'bell');
        }
        return line('acknowledge:vote_result',
          'The ballots are sealed — open them at the podium, where you voted.', 'podium');

      case 'nominate':
        return line('nominate',
          'You hold the gavel — walk to the podium and name a Deputy.', 'podium');

      case 'vote':
        return line('vote',
          `A government is on the floor — go to the podium and cast your ballot on ` +
          `${seatName(view, w.detail.speaker)} governing with ` +
          `${seatName(view, w.detail.nominee)}.`, 'podium');

      case 'speaker_discard':
        return line('speaker_discard',
          'You were dealt three tiles — go to the podium and throw one away.', 'podium');

      case 'deputy_discard':
        return line('deputy_discard',
          'You were passed two tiles — go to the podium and enact one of them.', 'podium');

      case 'block_response':
        return line('block_response',
          `${nameOf(view, w.detail.deputy)} moves to Block — go to the podium and answer it.`,
          'podium');

      case 'power_target': {
        const label = w.detail.label || w.detail.power;
        const what = w.detail.power === 'purge'
          ? 'name one citizen to leave the square'
          : w.detail.power === 'peek'
            ? 'choose whose allegiance you read'
            : w.detail.power === 'emergency'
              ? 'choose who takes the gavel next'
              : 'aim it';
        return line('power_target:' + w.detail.power,
          `${label} is yours — go to the podium and ${what}.`, 'podium');
      }

      case 'power_ack':
        return line('power_ack:' + (w.gate || w.detail.power || 'foresight'),
          `${w.detail.label || 'Foresight'} is yours — go to the podium to read the top of the deck.`,
          'podium');

      default:
        /* A decision kind nobody has written a line for still gets the object
         * right, because the routing rule is the decision and not the prose. */
        return line('unknown',
          `The square is waiting on you — go to the ${objectFor(w.kind, w.gate)}.`,
          objectFor(w.kind, w.gate));
    }
  }

  /* Nothing is owed. Either you are out of the game, or the bots are working. */
  if (!view.you.alive) {
    return line('dead',
      'You were purged — nothing more is asked of you. Watch how it ends.', null);
  }

  switch (view.phase) {
    case 'nomination':
      return line('bots:nomination',
        `Waiting: ${nameOf(view, view.speaker)} holds the gavel and is naming a Deputy.`, null);
    case 'vote':
      return line('bots:vote', 'Waiting: the square is sealing its ballots.', null);
    case 'vote_result':
      return line('bots:vote_result', 'Waiting: the ballots are being opened.', null);
    case 'legislative_speaker':
      /* If you are the Deputy, the useful thing to say is not who withdrew —
       * it is that the tiles are on their way to you. The rule is public. */
      if (view.deputy === view.you.id) {
        return line('bots:legislative_speaker',
          `Waiting: ${nameOf(view, view.speaker)} is drafting — two of the three ` +
          'tiles come to you next.', null);
      }
      return line('bots:legislative_speaker',
        `Waiting: ${nameOf(view, view.speaker)} and ${nameOf(view, view.deputy)} ` +
        'have withdrawn to draft a law.', null);
    case 'legislative_deputy':
      return line('bots:legislative_deputy',
        `Waiting: ${nameOf(view, view.deputy)} is choosing which law to enact.`, null);
    case 'block_response':
      return line('bots:block_response',
        `Waiting: ${nameOf(view, view.speaker)} is answering ` +
        `${nameOf(view, view.deputy)}'s Block.`, null);
    case 'chaos':
      return line('bots:chaos', 'Waiting: chaos takes the deck.', null);
    case 'power':
      return line('bots:power',
        `Waiting: ${view.power ? view.power.holderName : nameOf(view, view.speaker)} is using ` +
        `${view.power ? view.power.label : 'the power the board granted'}.`, null);
    default:
      return line('unknown', `Waiting: the square is in ${view.phase}.`, null);
  }
}
