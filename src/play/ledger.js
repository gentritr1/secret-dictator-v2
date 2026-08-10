/*
 * The ledger: 420px on the right, `L` to pin, `Esc` to close.
 *
 * Wireframe 4C of design/handoff/floor-and-hud/Secret Dictator - Build
 * Specs.dc.html, and work item 3 of the handoff README. It is the last of the
 * four surfaces and the only one you open on purpose, which is what earns it
 * the room the other three do not have.
 *
 * WHAT IT IS
 * ----------
 * PER-CITIZEN ENTRIES, NOT A CHRONOLOGICAL SCROLL. Chronology is not what you
 * need at day five: the question a player actually has is "what has 3 Chen
 * said, and does any of it fit together", and a log makes you answer that by
 * scanning nine days of everybody. So the fold is by person, the dead keep
 * their entry and their number, and the three rows D3 routed here — deck and
 * discard, the chaos state, the power the next Seize arms — sit at the top.
 *
 * WHAT IT IS NOT
 * --------------
 * NO SCORE. NO TRUST METER. NO PERCENTAGE. NO HIDDEN STATE. Every row in here
 * is a rendering of something the square heard or something the public record
 * holds, and every row carries the ids it came from in `trace` so that claim is
 * mechanical rather than editorial — test/ledger.test.js resolves every trace
 * against the record and fails on a row that traces to nothing.
 *
 * A FLAG NAMES A RULE AND STOPS. Contradiction flags are evidence, never
 * verdicts: the entry header carries a mark and a count and nothing else, and
 * the flag's own rows say which rule fired and which utterances and government
 * it is built from. C3 in particular CANNOT say which of the two lied — it is
 * on both entries, with the same id, and the player decides. The one word this
 * module may never write is the answer.
 *
 * THE TRUST BOUNDARY, as everywhere else in src/play: this module imports no
 * engine module. It is handed the player-safe view and a projection of the
 * public record (`floorVoice.source()`), and it renders the fold
 * `Floor.ledger()` already computed — it does not recompute it, and it cannot
 * reach a game object to recompute it from.
 *
 * THE ONE THING HERE THAT IS NOT THE SQUARE'S RECORD is the first line: your
 * own standing objective. It was a paragraph on the retired sidebar card, and
 * D3 left it as a hover tooltip on the private card, which is not discoverable
 * — a sentence explaining how you WIN cannot be behind a mouse. It belongs at
 * the top of the panel you open to think, above everything the square said,
 * because it is the question all of that is evidence about.
 */

import { seatKey, seatLabel, seatName, seatNumber } from './seat.js';
import { renderUtterance } from './floor-voice.js';
import { POWER_LABEL } from './tray.js';

/** The declared box. The style sheet reads the same number. */
export const LEDGER_BOX = { width: 420 };

/**
 * How you win, in one line, per role.
 *
 * The strings the retired sidebar carried, moved rather than rewritten — and
 * exported so the private card's tooltip can keep saying the same thing without
 * a second copy to drift. The Dictator's line gained its win condition: the old
 * one said what they are worth to the Rebels and never how the match ends.
 */
export const WIN_CONDITION = {
  loyalist: 'Five Reforms, or purge the Dictator.',
  rebel: 'Six Seizes, or seat the Dictator as Deputy once three Seizes are down.',
  dictator: 'Six Seizes, or take the Deputy\'s chair once three Seizes are down — ' +
    'and never be purged.'
};

/**
 * What each contradiction rule says, written as a description of the RECORD.
 *
 * Not of anybody's honesty. The handoff's own table phrases C3 as "one of the
 * two is lying", which is true and is still not something this panel may print:
 * the moment the ledger characterises a citizen, it has done the player's work
 * and done it with less information. So each line here says what does not add
 * up, names the rule, and stops. test/ledger.test.js sweeps every word this
 * module writes for verdict language.
 */
export const FLAG_RULE = {
  C1: 'passed on more of a tile than they say they drew',
  C2: 'the tile the board shows is not among the ones they say they were passed',
  C3: 'two accounts of one government that do not match',
  C4: 'these claims together draw more tiles than the deck held',
  C5: 'two accounts of one government, and neither amends the other',
  C6: 'an accusation that their own claim about that government argues against'
};

/** The keys the footer offers. `0` names seat 10, as everywhere else. */
export const LEDGER_KEYS = [
  { key: 'L', label: 'pin / unpin' },
  { key: '1–9', label: 'jump to a citizen' },
  { key: 'F', label: 'flagged only' },
  { key: 'Esc', label: 'close' }
];

/** Every group id an entry can carry, in the order they are drawn. */
export const GROUP_IDS = [
  'claims', 'flags', 'accused', 'challenged', 'supported', 'backed', 'asked',
  'silences', 'owed', 'ballots', 'seats', 'unclaimed', 'powers', 'quiet'
];

const TILE_SHORT = { reform: 'R', seize: 'S' };
const RESOLUTION = { failed: 'the motion failed', blocked: 'both tiles burned' };

function ordinal(n) {
  return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
}

/** "1R 2S", "2S", "nothing" — counts, never order, exactly as the schema holds them. */
function counts(c) {
  if (!c) return 'nothing';
  const parts = [];
  for (const tile of ['reform', 'seize']) {
    if (c[tile]) parts.push(c[tile] + TILE_SHORT[tile]);
  }
  return parts.length ? parts.join(' ') : 'nothing';
}

/**
 * One row.
 *
 * `trace` is the point of the whole structure: the ids this row was folded
 * from, so "every ledger row traces to a public utterance or a public record
 * entry" is a thing a test resolves rather than a thing a reviewer reads.
 * Four id shapes, and no fifth: `u-*` an utterance, `g-*` a government, `p-*` a
 * power, `seat:N` the roster entry itself, `board` the public board projection.
 *
 * `voice` says who is talking. `record` is this module; `said` is a citizen,
 * rendered from their `text_id` through the D2 sentence table. The verdict
 * sweep runs over the first and not the second, because a citizen calling
 * somebody a liar is the game and the ledger doing it is the bug.
 */
function row(text, trace, extra) {
  return Object.assign({ text: text, said: null, trace: trace, voice: 'record' },
    extra || {});
}

function group(id, label, rows) {
  return { id: id, label: label, rows: rows };
}

export function ledgerFor(view, source, state) {
  const st = state || {};
  const src = source || {};
  const entries = src.entries || [];
  const utterances = src.utterances || [];
  const governments = src.governments || [];
  const powers = src.powers || [];
  const purges = src.purges || [];
  const flags = src.flags || [];

  const uById = {};
  utterances.forEach((u) => { uById[u.id] = u; });
  const gById = {};
  governments.forEach((g) => { gById[g.id] = g; });
  const fById = {};
  flags.forEach((f) => { fById[f.id] = f; });

  /* Names, for the sentence table only — the record itself is seat numbers all
   * the way down and this is the one place a name is attached to one. */
  const names = [];
  if (view) view.players.forEach((p) => { names[p.id] = p.name; });

  let missing = 0;
  const sentence = (u) => {
    const text = renderUtterance(u, names, 'line');
    if (text === null) { missing++; return null; }
    return text;
  };

  const label = (id) => (view ? seatLabel(view, id) : String(id));

  const entryFor = (e) => buildEntry(e, {
    view, uById, gById, fById, powers, purges, sentence, label
  });

  const citizens = entries.map(entryFor);
  const flagged = citizens.filter((c) => c.flagCount > 0);

  /*
   * The jump wins over the filter.
   *
   * `1-9` names a citizen by their permanent number and must always land on
   * that citizen — including one the flagged-only filter has just hidden.
   * Turning the filter off is the honest answer: a key that silently did
   * nothing would be the same lie as a tray row offering a key that answers
   * nothing.
   */
  let flaggedOnly = !!st.flaggedOnly;
  const focus = st.focus === undefined || st.focus === null ? null : st.focus;
  if (flaggedOnly && focus !== null &&
      flagged.every((c) => c.seat !== focus)) flaggedOnly = false;

  const shown = flaggedOnly ? flagged : citizens;
  shown.forEach((c) => { c.focused = c.seat === focus; });

  return {
    day: view ? view.day : (src.day || 1),
    /* There is no open-but-unpinned state: `L` opens the panel and holds the
     * presentation in one gesture, so the header's word is not conditional. */
    paused: true,
    flaggedOnly: flaggedOnly,
    focus: focus,
    box: LEDGER_BOX,
    objective: objectiveFor(view),
    promoted: promotedFor(view),
    citizens: shown,
    total: citizens.length,
    flaggedCount: flagged.length,
    keys: LEDGER_KEYS,
    /* A `text_id` with no sentence is a hole a sweep can count, never a
     * placeholder shipped to a player. Same rule floor-voice.js holds. */
    missingSentences: missing
  };
}

/* ------------------------------------------------------- the two top blocks */

/**
 * Your own standing objective — the D3 regression, fixed where it belongs.
 *
 * It names no citizen, on purpose: this line is about the board, and a role
 * word beside a name is the one thing every surface in this game is swept for.
 */
function objectiveFor(view) {
  if (!view) return null;
  const role = view.you.role;
  return {
    label: 'you win by',
    text: WIN_CONDITION[role] || '',
    /* Your own seat is a public record entry — that you are in this match at
     * this number is the least private fact there is. What is folded from it
     * is private, which is why it is on the panel you opened and not the tray. */
    trace: ['seat:' + seatNumber(view.you.id)],
    voice: 'record'
  };
}

/** Deck, chaos and the next power: the three rows D3 routed off the screen. */
function promotedFor(view) {
  if (!view) return [];
  const next = view.nextPower
    ? `the ${ordinal(view.seize + 1)} Seize grants ${POWER_LABEL[view.nextPower] || view.nextPower}`
    : `the ${ordinal(view.seize + 1)} Seize grants no power`;
  return [
    row(`${view.deckCount} · discard ${view.discardCount}`, ['board'],
      { id: 'deck', label: 'deck' }),
    row(`${view.chaos}/${view.limits.chaosLimit}`, ['board'],
      { id: 'chaos', label: 'chaos' }),
    row(next, ['board'], { id: 'next', label: 'next' })
  ];
}

/* ------------------------------------------------------------- one citizen */

function buildEntry(e, ctx) {
  const { view, uById, gById, fById, powers, purges, sentence, label } = ctx;
  const seat = e.seat;
  const groups = [];
  const mine = (ids) => ids.map((id) => uById[id]).filter(Boolean);

  /* Which flags are already printed under a claim, so the leftovers can be
   * gathered rather than dropped. A C4 flag can name a claim of somebody
   * else's; a C6 flag is built from an accusation and a claim. */
  const flagsHere = e.flags.map((id) => fById[id]).filter(Boolean);
  const placed = {};

  const flagRows = (f) => {
    const out = [];
    const others = f.seats.filter((s) => s !== seat);
    const cls = f.class + (f.seats.length > 1 && others.length
      ? ' with ' + others.map(label).join(' and ') : '');
    out.push(row(`⚑ ${f.rule} · ${cls} — ${FLAG_RULE[f.rule] || 'the record does not agree'}`,
      [f.id].concat(f.refs.utterances, f.refs.governments),
      { flag: f.id, rule: f.rule, mark: true }));
    f.refs.utterances.forEach((uid) => {
      const u = uById[uid];
      if (!u) return;
      out.push(row(`${uid} · ${label(u.speaker)}`, [uid],
        { said: sentence(u), flag: f.id, ref: true, voice: 'said' }));
    });
    f.refs.governments.forEach((gid) => {
      const g = gById[gid];
      if (!g) return;
      out.push(row(`${gid} · ${boardOf(g)}`, [gid], { flag: f.id, ref: true }));
    });
    /* Public, and not a verdict: the record can say whether they have spoken to
     * it since. It changes nothing about the flag — see docs/step-10.md. */
    if (f.addressed.indexOf(seat) !== -1) {
      out.push(row('they have spoken to this since', [f.id], { flag: f.id, ref: true }));
    }
    return out;
  };

  /* --- claims, with their flags underneath ------------------------------ */

  const claimRows = [];
  mine(e.claims).forEach((u) => {
    const g = gById[u.refs.government];
    const what = u.seat_role === 'speaker'
      ? `drew ${counts(u.drawn)} · passed ${counts(u.passed)}`
      : `received ${counts(u.received)}${u.blocked ? ' · moved the Block' : ''}`;
    claimRows.push(row(
      `d${u.day} · ${u.refs.government} ${u.seat_role} · ${what}${g ? ' · ' + boardOf(g) : ''}`,
      [u.id, u.refs.government], { said: sentence(u) }));
    flagsHere.forEach((f) => {
      if (f.refs.utterances.indexOf(u.id) === -1) return;
      placed[f.id] = 1;
      flagRows(f).forEach((r) => claimRows.push(r));
    });
  });
  if (claimRows.length) groups.push(group('claims', 'claims', claimRows));

  const loose = flagsHere.filter((f) => !placed[f.id]);
  if (loose.length) {
    const rows = [];
    loose.forEach((f) => flagRows(f).forEach((r) => rows.push(r)));
    groups.push(group('flags', 'flagged', rows));
  }

  /* --- what they said about other people -------------------------------- */

  const made = (ids, prefix) => mine(ids).map((u) => row(
    `${prefix} ${label(u.target)} · d${u.day} · ${u.basis || u.about || '—'}` +
    refsOf(u), refTrace(u), { said: sentence(u), voice: 'said' }));

  const against = (ids, prefix) => mine(ids).map((u) => row(
    `${prefix} ${label(u.speaker)} · d${u.day} · ${u.basis || u.about || '—'}` +
    refsOf(u), refTrace(u), { said: sentence(u), voice: 'said' }));

  const accused = made(e.accusations_made, '→');
  if (accused.length) groups.push(group('accused', 'accused', accused));

  const challenged = against(e.accusations_against, '←')
    .concat(against(e.questions_received, '← asked by'));
  if (challenged.length) groups.push(group('challenged', 'challenged', challenged));

  const supported = made(e.supports_given, '→');
  if (supported.length) groups.push(group('supported', 'backed', supported));

  const backed = against(e.supports_received, '←');
  if (backed.length) groups.push(group('backed', 'backed by', backed));

  const asked = made(e.questions_asked, '→');
  if (asked.length) groups.push(group('asked', 'asked', asked));

  /* --- silence, which is a beat that happened --------------------------- */

  const silences = mine(e.silences.explicit).concat(mine(e.silences.timeout));
  if (silences.length) {
    const afterQuestion = silences.filter((u) => u.prompted_by === 'question').length;
    const chosen = e.silences.explicit.length;
    const bits = [];
    if (chosen) bits.push(chosen + ' chosen');
    if (e.silences.timeout.length) bits.push(e.silences.timeout.length + ' ran out');
    if (afterQuestion) bits.push(afterQuestion + ' after a question');
    groups.push(group('silences', 'silences',
      [row(silences.length + (bits.length ? ' · ' + bits.join(' · ') : ''),
        silences.map((u) => u.id))]));
  }

  if (e.obligations_open.length) {
    groups.push(group('owed', 'owes an answer', e.obligations_open.map((uid) => {
      const u = uById[uid];
      return row(uid + (u ? ' · asked d' + u.day + ' by ' + label(u.speaker) : ''),
        [uid], { said: u ? sentence(u) : null });
    })));
  }

  /* --- the public record: ballots, seats, powers ------------------------ */

  const ayes = e.ballots.aye, nays = e.ballots.nay;
  if (ayes.length || nays.length) {
    const parts = [];
    if (ayes.length) parts.push('Aye ' + ayes.join(' '));
    if (nays.length) parts.push('Nay ' + nays.join(' '));
    groups.push(group('ballots', 'ballots', [row(
      parts.join(' · ') + ` — ${ayes.length} Aye · ${nays.length} Nay`,
      ayes.concat(nays))]));
  }

  const seats = [];
  e.governments.speaker.forEach((gid) => seats.push(gid + ' speaker' + tail(gById[gid])));
  e.governments.deputy.forEach((gid) => seats.push(gid + ' deputy' + tail(gById[gid])));
  const nominatedOnly = e.governments.nominated
    .filter((gid) => e.governments.deputy.indexOf(gid) === -1);
  nominatedOnly.forEach((gid) => seats.push(gid + ' nominated' + tail(gById[gid])));
  if (seats.length) {
    groups.push(group('seats', 'sat in', [row(seats.join(' · '),
      e.governments.speaker.concat(e.governments.deputy, nominatedOnly))]));
  }

  if (e.unclaimed.length) {
    /* A government they sat in, resolved, and have never given an account of.
     * The label is one word because the group column is 76px and a three-line
     * label next to a one-line row reads as the row being the label's. */
    groups.push(group('unclaimed', 'unclaimed',
      [row(e.unclaimed.join(' · '), e.unclaimed.slice())]));
  }

  const held = powers.filter((p) => e.powers.indexOf(p.id) !== -1);
  const aimed = powers.filter((p) => e.aimed_at.indexOf(p.id) !== -1);
  const powerRows = held.map((p) => row(
    `held ${POWER_LABEL[p.kind] || p.kind} · d${p.day}` +
    (p.target === null || p.target === undefined ? '' : ' · aimed at ' + label(p.target)),
    [p.id]))
    .concat(aimed.map((p) => row(
      `${POWER_LABEL[p.kind] || p.kind} aimed at them · d${p.day} · by ${label(p.holder)}`,
      [p.id])));
  if (powerRows.length) groups.push(group('powers', 'powers', powerRows));

  /*
   * A citizen who has done nothing yet still gets an entry, and it says so —
   * exactly as the tray's empty state names who the square is waiting for
   * rather than going blank. `seat:N` is the roster entry it is folded from.
   */
  if (!groups.length) {
    groups.push(group('quiet', '', [row('has not spoken, voted or sat in a government',
      ['seat:' + seatNumber(seat)])]));
  }

  const purge = purges.find((p) => p.target === seat) || null;
  const purgePower = powers.find((p) => p.kind === 'purge' && p.target === seat) || null;

  return {
    seat: seat,
    number: seatNumber(seat),
    key: seatKey(seat),
    name: view ? seatName(view, seat) : String(seat),
    you: !!(view && view.you.id === seat),
    alive: e.alive,
    dead: e.alive ? null : {
      text: purge ? 'purged d' + purge.day : 'purged',
      trace: purgePower ? [purgePower.id] : ['seat:' + seatNumber(seat)]
    },
    /* A mark and a count. Everything else about the flag is inside the entry,
     * which is what "opening the citizen" means once the panel is per-citizen. */
    flagCount: flagsHere.length,
    flagIds: flagsHere.map((f) => f.id),
    focused: false,
    groups: groups
  };
}

/** What the board got out of a government, in three words. */
function boardOf(g) {
  if (!g) return '';
  if (g.resolution === 'enacted') return 'enacted ' + String(g.enacted).toUpperCase();
  if (RESOLUTION[g.resolution]) return RESOLUTION[g.resolution];
  return 'unresolved';
}

function tail(g) {
  const b = boardOf(g);
  return b ? ' (' + b + ')' : '';
}

/** The ids an utterance points at, flattened — its own id first. */
function refTrace(u) {
  const out = [u.id];
  Object.keys(u.refs).forEach((k) => {
    const v = u.refs[k];
    (Array.isArray(v) ? v : [v]).forEach((id) => {
      if (typeof id === 'string' && out.indexOf(id) === -1) out.push(id);
    });
  });
  return out;
}

/** "(g-1, g-3)" — what an accusation rests on, so the reader can go and look. */
function refsOf(u) {
  const ids = refTrace(u).slice(1)
    .filter((id) => /^[gup]-\d+$/.test(id));
  return ids.length ? ' (' + ids.join(', ') + ')' : '';
}
