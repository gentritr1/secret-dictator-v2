/*
 * The panels: every pixel of text in the match, built from the view model.
 *
 * The rule this file exists to hold: NOTHING here has a reference to the game
 * object. It is handed `view` — the output of src/engine/view.js for the human's
 * seat — and `waiting`, the pending decision, and it can render nothing it was
 * not given. A panel that wants a name looks it up in `view.players`; there is
 * no `.role` on those entries to reach for by accident, because the projection
 * never put one there.
 *
 * That is the whole trust boundary, and it is enforced by what is in scope
 * rather than by care: this module imports no engine module at all.
 *
 * Deliberately v0 debug quality — plain DOM, no transitions, no layout opinion
 * beyond legibility. Step 4 is about the decisions being real, not about them
 * being pretty.
 *
 * Gate 1 (docs/step-05.md) added two things and no decoration:
 *
 *   - the persistent objective line, from src/play/objective.js, which is a
 *     pure function of the same view and imports no engine module either;
 *   - real dialog semantics on the panel: role="dialog", aria-modal, a labelled
 *     title, focus moved in on open, trapped while open, and returned to
 *     whatever had it when the panel closes.
 *
 * The focus trap is deliberately built twice: Tab is handled here so the cycle
 * is ordered (a focusin guard alone sends Shift+Tab to the wrong end), and a
 * focusin listener on the document is the backstop for a click or a browser
 * shortcut that lands outside. Both are optional-chained through the document
 * they are given, because test/view.test.js drives this file against a stub
 * document with five elements and no event system — that stub is a feature, not
 * an accident, and a panel that only works in a browser cannot be tested where
 * the rest of the game is.
 */

import { objectiveFor } from './objective.js';
import { trayFor, surfaceFor } from './tray.js';
import { cardFor } from './card.js';
import { ledgerFor, WIN_CONDITION } from './ledger.js';
import { seatFromKey, seatKey, seatNumber } from './seat.js';

const TILE_LABEL = { reform: 'REFORM', seize: 'SEIZE' };

const POWER_BLURB = {
  peek: 'You will be told Loyalist or Rebel — not which Rebel.',
  foresight: 'The top three, in order. Then they go back. Nobody is told what you saw.',
  emergency: 'They speak next; afterwards the rotation carries on past you.',
  purge: 'If they are the Dictator, the Loyalists take the Republic at once.'
};

/*
 * The win condition now lives at the top of the ledger, which is where a
 * sentence explaining how you WIN belongs — see src/play/ledger.js. The card
 * keeps it as the role line's tooltip because a tooltip that is a SECOND way to
 * read something is a courtesy, where a tooltip that is the ONLY way is the D3
 * regression this gate fixed. One constant, so the two cannot drift.
 */
const ROLE_BLURB = WIN_CONDITION;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

export function createPanels(doc, { onSubmit, onClose } = {}) {
  const el = {
    card: doc.getElementById('card'),
    tray: doc.getElementById('tray'),
    prompt: doc.getElementById('prompt'),
    panel: doc.getElementById('panel'),
    objective: doc.getElementById('objective'),
    ledger: doc.getElementById('ledger'),
    help: doc.getElementById('help')
  };

  let openKind = null;     // the waitingFor.kind (or 'game_over') on screen
  let lastObjectiveId = null;
  /* The last tray and card actually written to the DOM, as signatures: both are
   * re-derived every frame (the beat, the announcement and the arming all end
   * on a clock rather than on a game event) and neither may rewrite the DOM
   * sixty times a second. */
  let lastTraySig = null;
  let lastCardSig = null;
  let tray = null;
  let card = null;
  /*
   * The tray's contextual row, taken.
   *
   * A tray decision is OFFERED as soon as the rules owe it to you and becomes
   * ARMED when you press E at the object that owes it — the same gesture that
   * used to open a modal. Arming is what makes its keys live, and it is a
   * deliberate act for the same reason opening the panel was: `A` is "Aye" in
   * this game and "strafe left" in this engine, and only one of them can have
   * the key. See handleTrayKey.
   */
  let armed = false;
  /* Whatever had focus when the panel opened, so closing can give it back. */
  let returnFocusTo = null;

  /*
   * The ledger. Open and pinned are the same state — `L` opens the panel and
   * holds the presentation in one gesture, and there is no third thing for a
   * second key to mean.
   *
   * `seen` is the one bit that outlives a close: the tray's hint says what is in
   * the ledger until the ledger has been opened once. It is presentation, it
   * survives a restart on purpose (a player does not become a first-timer again
   * when they deal a new match), and nothing reads it but the hint.
   */
  let ledgerOpen = false;
  let ledgerSeen = false;
  let ledgerState = { flaggedOnly: false, focus: null };
  let ledger = null;
  let lastLedgerSig = null;
  let ledgerReturnFocusTo = null;

  const nameOf = (view, id) => {
    if (id == null) return '—';
    const p = view.players.find((q) => q.id === id);
    return p ? p.name : '#' + id;
  };

  /* ----------------------------------------------------- the private card */

  /**
   * The 232 x 96 card, top-left: number and name, role, who you know, and a
   * fourth line only while you hold tiles.
   *
   * The one element in the game permitted role colour, which it carries as a
   * class on the container — `r-loyalist`, `r-rebel`, `r-dictator`. A class
   * rather than a hex because the role palette and the board palette are the
   * same three colours (the style bible allows no new ones) and only the
   * CHANNEL distinguishes them: a blue Reform track is the board talking, a blue
   * seal is your allegiance. test/hud.test.js sweeps every rendered surface for
   * that channel and requires it nowhere but here.
   */
  function renderCard(view, presentation) {
    if (!el.card) return null;
    card = cardFor(view, presentation);
    const sig = JSON.stringify([card.number, card.name, card.role, card.alive,
      card.knowText, card.hand, card.handKind, card.night]);
    if (sig === lastCardSig) return card;
    lastCardSig = sig;

    const tiles = card.hand
      ? card.hand.map((t) => `<span class="tile t-${esc(t)}">${TILE_LABEL[t] || esc(t)}</span>`).join('')
      : '';

    el.card.className = `r-${esc(card.role)}` +
      (card.night ? ' night' : '') + (card.alive ? '' : ' gone');
    el.card.innerHTML =
      `<div class="who"><span class="num">${esc(card.number)}</span>` +
        `<span class="nm">${esc(String(card.name).toUpperCase())}</span>` +
        '<span class="seal" aria-hidden="true"></span></div>' +
      /* The role blurb — "Five Reforms, or purge the Dictator" — used to be a
       * paragraph under the role on the sidebar card. It is a rules reminder
       * rather than state, and the card has three lines and no room, so it
       * survives as the role line's tooltip rather than being deleted. */
      `<div class="rl" title="${esc(ROLE_BLURB[card.role] || '')}">` +
        `${esc(card.role)}${card.alive ? '' : ' · purged'}</div>` +
      `<div class="know" title="${esc(card.knowText)}">${esc(card.knowText)}</div>` +
      `<div class="hand">${card.hand
        ? `<b>${esc(card.handKind)}</b> ${tiles}` : ''}</div>`;
    return card;
  }

  /* ------------------------------------------------------------- the tray */

  /**
   * The persistent bottom tray: tracks, the contextual row, the ledger hint.
   *
   * Everything it says comes from src/play/tray.js, which is a pure function of
   * the same player-safe view the objective line reads. The never-blank rule is
   * enforced there rather than here — this function has no branch that can
   * produce an empty row, because it is never handed one.
   */
  function renderTray(view, presentation) {
    if (!el.tray) return null;
    tray = trayFor(view, Object.assign({ armed: armed, ledgerSeen: ledgerSeen },
      presentation || {}));
    const sig = JSON.stringify([tray.id, tray.line, tray.note, tray.keys, tray.tracks,
      tray.act, tray.ledger]);
    if (sig === lastTraySig) return tray;
    lastTraySig = sig;

    const track = (name, t, cls) =>
      '<div class="tk">' +
      Array.from({ length: t.of }, (_, i) =>
        `<i class="${cls}${i < t.n ? ' on' : ''}"></i>`).join('') +
      `<span class="n">${t.n}/${t.of}</span>` +
      `<span class="lb">${name}</span></div>`;

    const tracks = tray.tracks
      ? track('reform', tray.tracks.reform, 'reform') +
        track('seize', tray.tracks.seize, 'seize') +
        (tray.tracks.chaos.show ? track('chaos', tray.tracks.chaos, 'chaos') : '')
      : '';

    const keys = tray.keys.map((k) =>
      `<span class="key"><b>${esc(k.key)}</b>${k.label ? ' ' + esc(k.label) : ''}</span>`).join('');

    el.tray.className = tray.kind + (tray.act ? ' act' : '');
    el.tray.innerHTML =
      `<div class="tracks">${tracks}</div>` +
      `<div class="row"><div class="l1">${esc(tray.line)}${keys ? ' ' + keys : ''}</div>` +
      `<div class="l2">${esc(tray.note)}</div></div>` +
      '<div class="hints">' +
        `<span class="hint ${tray.ledger.ready ? '' : 'off'}">` +
          `<b>${esc(tray.ledger.key)}</b> ${esc(tray.ledger.label)}</span>` +
        `<span class="hint"><b>${esc(tray.ledger.keysKey)}</b> ${esc(tray.ledger.keysLabel)}</span>` +
      '</div>';
    return tray;
  }

  /* ----------------------------------------------------------- the ledger */

  /**
   * The 420px right-hand panel: per-citizen entries, and the three promoted
   * rows above them.
   *
   * Everything it says comes from src/play/ledger.js, which is a pure function
   * of the player-safe view and a projection of the public record. This
   * function knows nothing about a flag, a claim or a ballot; it writes rows.
   *
   * The one rule enforced HERE rather than there is the role channel: no
   * `r-loyalist` / `r-rebel` / `r-dictator` class is emitted by this function,
   * in any state, because the private card is the only 2D element in the game
   * permitted role colour. The ledger's warm is `flag` amber and nothing else.
   */
  function renderLedger(view, source) {
    if (!el.ledger) return null;
    if (!ledgerOpen) {
      el.ledger.classList.add('hidden');
      return null;
    }
    ledger = ledgerFor(view, source, ledgerState);
    const sig = JSON.stringify(ledger);
    if (sig === lastLedgerSig) return ledger;
    lastLedgerSig = sig;

    const rowHtml = (r) =>
      `<div class="lr${r.mark ? ' mark' : ''}${r.ref ? ' ref' : ''}"` +
      ` data-trace="${esc(r.trace.join(' '))}">` +
      `<span class="t">${esc(r.text)}</span>` +
      (r.said ? `<span class="s">${esc(r.said)}</span>` : '') +
      '</div>';

    const groupHtml = (g) =>
      `<div class="lg" data-group="${esc(g.id)}">` +
      `<div class="gl">${esc(g.label)}</div>` +
      `<div class="gr">${g.rows.map(rowHtml).join('')}</div></div>`;

    const entryHtml = (c) =>
      `<section class="ent${c.focused ? ' at' : ''}${c.alive ? '' : ' gone'}"` +
      ` id="led-${c.seat}" data-seat="${c.seat}">` +
      '<header><span class="num">' + esc(c.key) + '</span>' +
      `<span class="nm">${esc(String(c.name).toUpperCase())}</span>` +
      (c.you ? '<span class="me">you</span>' : '') +
      (c.dead ? `<span class="out" data-trace="${esc(c.dead.trace.join(' '))}">` +
        `${esc(c.dead.text)}</span>` : '') +
      /* A mark and a count. The rule, the refs and the government are inside
       * the entry; nothing out here characterises anybody. */
      (c.flagCount
        ? `<span class="flag">⚑ ${c.flagCount} flag${c.flagCount > 1 ? 's' : ''}</span>`
        : '') +
      '</header>' + c.groups.map(groupHtml).join('') + '</section>';

    const promoted = ledger.promoted.map((r) =>
      `<div class="pr" data-trace="${esc(r.trace.join(' '))}">` +
      `<span class="pl">${esc(r.label)}</span>` +
      `<span class="pv">${esc(r.text)}</span></div>`).join('');

    el.ledger.classList.remove('hidden');
    el.ledger.className = 'led' + (ledger.flaggedOnly ? ' filtered' : '');
    el.ledger.innerHTML =
      '<header class="lh"><h2 id="ledger-title">the ledger</h2>' +
      `<span class="day">day ${esc(ledger.day)}</span>` +
      /* The word the wireframe puts in the header, so the state is never
       * ambiguous: the square has stopped moving because you asked it to. */
      `<span class="pause">${ledger.paused ? 'paused' : ''}</span></header>` +
      (ledger.objective
        ? `<div class="obj" data-trace="${esc(ledger.objective.trace.join(' '))}">` +
          `<span class="ol">${esc(ledger.objective.label)}</span>` +
          `<span class="ov">${esc(ledger.objective.text)}</span></div>`
        : '') +
      `<div class="prom">${promoted}</div>` +
      `<div class="cits">${ledger.citizens.map(entryHtml).join('')}</div>` +
      '<footer class="lf">' +
      (ledger.flaggedOnly
        ? `<span class="filter">showing ${ledger.flaggedCount} of ` +
          `${ledger.total} — flagged only</span>` : '') +
      ledger.keys.map((k) => `<span class="key"><b>${esc(k.key)}</b> ${esc(k.label)}</span>`)
        .join('') + '</footer>';

    /* Jumping to a citizen has to actually put them in front of the reader;
     * the highlight alone is a jump that did not happen. Guarded, because the
     * headless suites drive this file against a five-element stub document. */
    if (ledgerState.focus !== null && el.ledger.querySelector) {
      const at = el.ledger.querySelector('#led-' + ledgerState.focus);
      if (at && at.scrollIntoView) at.scrollIntoView({ block: 'nearest' });
    }
    return ledger;
  }

  /**
   * Open the ledger, or give the square back.
   *
   * A real dialog — labelled, focusable, focus moved in and handed back — but
   * NOT `aria-modal`, and the outside is not made inert, because the spec is
   * explicit that the tray's contextual row stays live behind it: a decision you
   * own can be answered with the ledger open, which is exactly when you want to
   * answer it. Claiming modality here and then keeping the tray live would be a
   * lie a screen reader repeats.
   */
  function openLedger(view, source) {
    if (ledgerOpen) return false;
    ledgerOpen = true;
    ledgerSeen = true;
    ledgerReturnFocusTo = doc.activeElement || null;
    lastLedgerSig = null;
    if (el.ledger && el.ledger.setAttribute) {
      el.ledger.setAttribute('role', 'dialog');
      el.ledger.setAttribute('aria-labelledby', 'ledger-title');
      el.ledger.setAttribute('tabindex', '-1');
    }
    renderLedger(view, source);
    if (el.ledger && el.ledger.focus) el.ledger.focus();
    return true;
  }

  function closeLedger() {
    if (!ledgerOpen) return false;
    ledgerOpen = false;
    ledger = null;
    lastLedgerSig = null;
    /* The filter and the jump are a reading position, not a setting: the next
     * open starts at the top with everybody, which is where a question starts. */
    ledgerState = { flaggedOnly: false, focus: null };
    if (el.ledger) {
      el.ledger.classList.add('hidden');
      el.ledger.innerHTML = '';
      if (el.ledger.removeAttribute) {
        el.ledger.removeAttribute('role');
        el.ledger.removeAttribute('aria-labelledby');
      }
    }
    const back = ledgerReturnFocusTo;
    ledgerReturnFocusTo = null;
    if (back && back.focus && (!doc.contains || doc.contains(back))) {
      try { back.focus(); } catch (err) { /* a detached node; nothing to give back to */ }
    }
    return true;
  }

  /**
   * Keys while the ledger is open. Same contract as the other two handlers:
   * true means consumed.
   *
   * The digits are the interesting case. `1-9` jumps to a citizen here and
   * names one on an armed tray row, and both are correct — so the ARMED ROW
   * WINS, and the page routes to it first (see src/play/main.js). Arming is a
   * deliberate act taken to answer something; jumping is navigation and has a
   * scroll bar. Esc gives the row back before it closes the ledger, for the
   * same reason.
   */
  function handleLedgerKey(e, view, source) {
    if (!ledgerOpen) return false;
    if (e.key === 'Escape') { closeLedger(); return true; }
    if (/^l$/i.test(e.key)) { closeLedger(); return true; }
    if (/^f$/i.test(e.key)) {
      ledgerState.flaggedOnly = !ledgerState.flaggedOnly;
      lastLedgerSig = null;
      renderLedger(view, source);
      return true;
    }
    const id = seatFromKey(e.key);
    if (id !== null) {
      /* A number that names nobody in this match answers nothing, exactly as it
       * does on the tray and in the panel. It is still their number. */
      if (!view || !view.players.some((p) => p.id === id)) return true;
      ledgerState.focus = id;
      lastLedgerSig = null;
      renderLedger(view, source);
      return true;
    }
    return false;
  }

  /*
   * The objective line. One sentence, always on screen, derived from the safe
   * view by objective.js — see that file for why the signature is the whole
   * defence. Rewritten only when it actually changes, so a screen reader is not
   * re-announcing the same sentence sixty times a second.
   */
  function renderObjective(view, presentation) {
    if (!el.objective) return null;
    const o = objectiveFor(view, presentation);
    if (o.id !== lastObjectiveId || el.objective.textContent !== o.text) {
      lastObjectiveId = o.id;
      el.objective.textContent = o.text;
      el.objective.className = o.act ? 'act' : '';
      if (el.objective.setAttribute) el.objective.setAttribute('data-objective', o.id);
    }
    return o;
  }

  /*
   * The eleven sidebar rows are gone, and only three of them are on screen at
   * all: the two tracks and the chaos promotion in the tray, the role and who
   * you know on the card. `phase`, `nominee` and `alive` died; `day` is the
   * objective line's prefix; `speaker` and `deputy` are brass marks on the
   * nameplates in the world; `deck`, `discard`, `next power`, `chaos` below two
   * and the log are the ledger's, which is the next gate. Nothing routed to the
   * ledger is drawn anywhere else in the meantime — it is readable from
   * `__play.ledger()` and from nowhere on screen, deliberately.
   */
  function renderHud(view, presentation) {
    renderCard(view, presentation);
    renderTray(view, presentation);
    return renderObjective(view, presentation);
  }

  function setPrompt(text) {
    el.prompt.textContent = text || '';
    el.prompt.classList.toggle('hidden', !text);
  }

  /* ------------------------------------------------------ the modal panel */

  function button(label, value, cls) {
    return `<button type="button" class="opt ${cls || ''}" data-value='${esc(JSON.stringify(value))}'>${label}</button>`;
  }

  function tileChip(tile, i) {
    return `<span class="tile t-${esc(tile)}">${TILE_LABEL[tile] || esc(tile)}` +
      (i == null ? '' : `<b>${i + 1}</b>`) + '</span>';
  }

  function names(view, ids) {
    return ids.length ? ids.map((i) => esc(nameOf(view, i))).join(', ') : 'nobody';
  }

  /** Build the body of the panel for whatever is pending. */
  function bodyFor(view, w) {
    if (!w) {
      if (view.phase !== 'game_over') return null;
      const mine = view.winner === view.you.team;
      return {
        title: view.winner === 'loyalist' ? 'The Loyalists hold the Republic' : 'The Rebels take the Republic',
        kicker: mine ? 'You won' : 'You lost',
        body: `<p class="lede">${esc(view.winReason || '')}</p>` +
          '<table class="reveal"><tr><th>seat</th><th>role</th><th></th></tr>' +
          view.reveal.map((r) =>
            `<tr class="r-${esc(r.role)}"><td>${esc(r.name)}${r.id === view.you.id ? ' (you)' : ''}</td>` +
            `<td>${esc(r.role)}</td><td>${r.alive ? '' : 'purged'}</td></tr>`).join('') +
          '</table>',
        actions: ''
      };
    }

    switch (w.kind) {
      case 'acknowledge':
        if (w.gate === 'morning') {
          return {
            kicker: `Day ${w.detail.day}`,
            title: `${esc(nameOf(view, w.detail.speaker))} holds the gavel`,
            body:
              `<p class="lede">Reform ${w.detail.reform}/${view.limits.reformToWin} · ` +
              `Seize ${w.detail.seize}/${view.limits.seizeToWin} · ` +
              `Chaos ${w.detail.chaos}/${view.limits.chaosLimit}` +
              (w.detail.isSpecialElection ? ' · <b>emergency session</b>' : '') + '</p>' +
              (w.detail.termLimited.length
                ? `<p class="lede">Term-limited this session: ${names(view, w.detail.termLimited)}.</p>`
                : '<p class="lede">Nobody is term-limited.</p>') +
              (view.nextPower
                ? `<p class="lede">The next Seize would grant <b>${esc(view.nextPower)}</b>.</p>` : ''),
            actions: button('Continue <kbd>↵</kbd>', null, 'go')
          };
        }
        if (w.gate === 'chaos') {
          return {
            kicker: 'The Chaos Track reaches three',
            title: 'No government. The top tile enacts itself.',
            body: `<div class="tiles">${tileChip(w.detail.tile)}</div>` +
              '<p class="lede">Nobody drew it, nobody chose it. It grants no power, the Chaos ' +
              'Track empties, and every term limit is lifted.</p>',
            actions: button('Continue <kbd>↵</kbd>', null, 'go')
          };
        }
        return {
          kicker: 'The ballots are opened',
          title: w.detail.passed
            ? `Elected ${w.detail.aye.length}–${w.detail.nay.length}.`
            : `The motion fails ${w.detail.aye.length}–${w.detail.nay.length}.`,
          body:
            `<p class="lede"><b>Aye</b> ${names(view, w.detail.aye)}</p>` +
            `<p class="lede"><b>Nay</b> ${names(view, w.detail.nay)}</p>` +
            `<p class="lede">${w.detail.passed
              ? esc(nameOf(view, w.detail.speaker)) + ' and ' + esc(nameOf(view, w.detail.nominee)) + ' withdraw to draft.'
              : 'The gavel moves on. A tie fails.'}</p>`,
          actions: button('Continue <kbd>↵</kbd>', null, 'go')
        };

      case 'nominate':
        return {
          kicker: 'You hold the gavel',
          title: 'Name a Deputy.',
          body: (w.detail.termLimited.length
            ? `<p class="lede">Term-limited: ${names(view, w.detail.termLimited)}.</p>` : ''),
          /* The key is the citizen's PERMANENT number, not their position in
           * this list — see src/play/seat.js. The term-limited are missing from
           * the options, so the offered keys have gaps in them, and that is the
           * point: 3 is Chen on every day of the match. */
          actions: w.options.map((id) =>
            button(`${seatNumber(id)} ${esc(nameOf(view, id))} <kbd>${seatKey(id)}</kbd>`, id)).join('')
        };

      case 'vote':
        return {
          kicker: 'Motion on the floor',
          title: `${esc(nameOf(view, w.detail.speaker))} to govern with ${esc(nameOf(view, w.detail.nominee))}?`,
          body: '<p class="lede">Everyone alive votes at once. A tie fails.</p>',
          actions: button('Aye <kbd>A</kbd>', true, 'aye') + button('Nay <kbd>N</kbd>', false, 'nay')
        };

      case 'speaker_discard':
        return {
          kicker: 'Drawn in private — throw one away',
          title: `The other two go to ${esc(nameOf(view, view.deputy))}.`,
          body: `<div class="tiles">${w.detail.tiles.map(tileChip).join('')}</div>` +
            '<p class="lede">The discard is never revealed to the square.</p>',
          actions: w.detail.tiles.map((t, i) =>
            button(`Throw ${TILE_LABEL[t]} <kbd>${i + 1}</kbd>`, i, 't-' + t)).join('')
        };

      case 'deputy_discard': {
        /* The Block's option value is taken straight out of what waitingFor()
         * advertised — the one choice that is not a tile index. Read from the
         * data rather than duplicated as a constant here, because this module
         * imports no engine module and a copied literal would drift silently. */
        const blockValue = w.options.find((o) => typeof o !== 'number');
        return {
          kicker: 'Passed to you — throw one, enact the other',
          title: 'The square sees only what you enact.',
          body: `<div class="tiles">${w.detail.tiles.map(tileChip).join('')}</div>` +
            (w.detail.canBlock
              ? '<p class="lede">Five Seize are down — you may ask the Speaker to burn both.</p>'
              : '<p class="lede">The discard is never revealed to the square.</p>'),
          /* The values submitted here are the ones waitingFor() advertised —
           * a tile index, or the Block option. The panel does not get to
           * invent a shape the scripted API cannot also use. */
          actions: w.detail.tiles.map((t, i) =>
            button(`Enact ${TILE_LABEL[w.detail.tiles[1 - i]] || '?'} <kbd>${i + 1}</kbd>`,
              i, 't-' + w.detail.tiles[1 - i])).join('') +
            (blockValue !== undefined
              ? button('Move to Block <kbd>B</kbd>', blockValue, 'block') : '')
        };
      }

      case 'block_response':
        return {
          kicker: 'The Deputy moves to Block',
          title: `${esc(nameOf(view, w.detail.deputy))} wants both tiles burned.`,
          body: '<p class="lede">Agreeing passes no law and turns the Chaos Track. ' +
            'Refusing forces them to enact one of the two.</p>',
          actions: button('Agree — burn them <kbd>1</kbd>', true, 'aye') +
            button('Refuse <kbd>2</kbd>', false, 'nay')
        };

      case 'power_target':
        return {
          kicker: `${esc(w.detail.label)} — the ${view.seize}${view.seize === 1 ? 'st' : view.seize === 2 ? 'nd' : view.seize === 3 ? 'rd' : 'th'} Seize grants it to you`,
          title: w.detail.power === 'purge' ? 'Name one citizen to leave the square.'
            : w.detail.power === 'peek' ? 'Whose allegiance do you read?'
            : 'Who takes the gavel next?',
          body: `<p class="lede">${esc(POWER_BLURB[w.detail.power] || '')}</p>`,
          actions: w.options.map((id) =>
            button(`${seatNumber(id)} ${esc(nameOf(view, id))} <kbd>${seatKey(id)}</kbd>`, id,
              w.detail.power === 'purge' ? 'nay' : '')).join('')
        };

      case 'power_ack':
        return {
          kicker: `${esc(w.detail.label)} — for you alone`,
          title: 'The top three, in order.',
          body: `<div class="tiles">${w.detail.tiles.map(tileChip).join('')}</div>` +
            `<p class="lede">${esc(POWER_BLURB.foresight)}</p>`,
          actions: button('Put them back <kbd>↵</kbd>', null, 'go')
        };

      default:
        return null;
    }
  }

  /* ------------------------------------------------------ dialog plumbing */

  /**
   * Everything inside the panel a Tab can land on, in visual order.
   *
   * querySelectorAll returns document order, and the panel's document order IS
   * its visual order — the buttons are emitted into `.row` in the order they
   * are drawn. So no tabindex is set anywhere: a positive tabindex would be a
   * second ordering to keep in sync with the first.
   */
  function focusables() {
    if (!el.panel.querySelectorAll) return [];
    return Array.prototype.slice.call(
      el.panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]')
    ).filter((n) => !n.disabled && n.tabIndex !== -1);
  }

  function focusFirst() {
    const list = focusables();
    if (list.length) { list[0].focus(); return true; }
    /* The result screen has no buttons. Focus the dialog itself so a screen
     * reader announces it and Esc has somewhere to be pressed. */
    if (el.panel.focus) { el.panel.focus(); return true; }
    return false;
  }

  /*
   * The rest of the page while a dialog is open.
   *
   * `inert` is the standard answer and it is a better one than a focus fight:
   * it takes the HUD and the controls out of the tab order and out of the
   * pointer's reach for as long as the modal is up, which is what `aria-modal`
   * is *claiming* anyway. Without it the claim is a lie a screen reader repeats.
   * The canvas is deliberately left alone — it holds no focusable element, and
   * being able to orbit the camera while reading a decision is not a leak of
   * focus, it is the whole point of the camera.
   */
  const OUTSIDE = ['card', 'tray', 'controls', 'ledger'];

  function setOutsideInert(on) {
    for (const id of OUTSIDE) {
      const node = doc.getElementById(id);
      if (!node || !node.setAttribute) continue;
      if (on) { node.setAttribute('inert', ''); node.setAttribute('aria-hidden', 'true'); }
      else { node.removeAttribute('inert'); node.removeAttribute('aria-hidden'); }
    }
  }

  /**
   * The backstop half of the trap: if focus escapes the open panel by a route
   * neither Tab nor `inert` covers, pull it back.
   *
   * Deferred by a tick on purpose. Calling focus() from inside a focusin
   * handler is ignored — the browser is still mid-transfer — and the first
   * version of this looked exactly like a broken trap: the listener ran, the
   * focus() call did nothing, and the seed box kept the keyboard. Found by
   * driving it, not by reading it.
   */
  function onFocusIn(e) {
    if (openKind === null) return;
    if (!e || !e.target || !el.panel.contains) return;
    if (el.panel.contains(e.target)) return;
    setTimeout(() => { if (openKind !== null) focusFirst(); }, 0);
  }
  if (doc.addEventListener) doc.addEventListener('focusin', onFocusIn);

  /**
   * Close the panel.
   *
   * Closing NEVER answers anything. The decision the panel was drawn for is
   * still pending in the session, so reopening it (walk back, press E) rebuilds
   * exactly the same options from exactly the same `waitingFor` — this function
   * touches no game state at all, which is why "Esc must not lose a pending
   * decision" is a property of the design rather than a thing to remember.
   */
  function close() {
    const wasOpen = openKind !== null;
    openKind = null;
    el.panel.classList.add('hidden');
    el.panel.innerHTML = '';
    if (el.panel.removeAttribute) {
      el.panel.removeAttribute('role');
      el.panel.removeAttribute('aria-modal');
      el.panel.removeAttribute('aria-labelledby');
    }
    if (wasOpen) setOutsideInert(false);
    /* Give the keyboard back to whatever had it. Guarded, because the element
     * can have been removed by a restart between opening and closing. */
    const back = returnFocusTo;
    returnFocusTo = null;
    if (wasOpen && back && back.focus && (!doc.contains || doc.contains(back))) {
      try { back.focus(); } catch (err) { /* a detached node; nothing to give back to */ }
    }
    /* Only tell the page something changed if something changed. Firing the
     * callback on a close-that-closed-nothing is how a restart ended up
     * redrawing the scene halfway through rebuilding it. */
    if (wasOpen && onClose) onClose();
  }

  /** Draw (or redraw) the modal for the pending decision. */
  function open(view, w) {
    const spec = bodyFor(view, w);
    if (!spec) { close(); return false; }
    const wasOpen = openKind !== null;
    openKind = w ? w.kind : 'game_over';
    /* Remembered on the way in, and only on the way in: refresh() redraws an
     * open panel in place, and re-reading activeElement there would remember a
     * button inside the panel and hand focus to a node that no longer exists. */
    if (!wasOpen) returnFocusTo = doc.activeElement || null;
    setOutsideInert(true);

    el.panel.classList.remove('hidden');
    el.panel.innerHTML =
      `<div class="kicker">${spec.kicker || ''}</div>` +
      `<h2 id="panel-title">${spec.title}</h2>` +
      (spec.body || '') +
      `<div class="row">${spec.actions || ''}</div>` +
      (w ? '<div class="foot">Tab moves between the answers · Esc closes this — ' +
           'the decision stays open and the square waits as long as you like.</div>' : '');

    /* A modal that only looks modal is a trap for anyone not using a mouse. */
    if (el.panel.setAttribute) {
      el.panel.setAttribute('role', 'dialog');
      el.panel.setAttribute('aria-modal', 'true');
      el.panel.setAttribute('aria-labelledby', 'panel-title');
      el.panel.setAttribute('tabindex', '-1');
    }

    el.panel.querySelectorAll('button.opt').forEach((b) => {
      b.addEventListener('click', () => submit(JSON.parse(b.dataset.value)));
    });
    focusFirst();
    return true;
  }

  function submit(value) {
    close();
    if (onSubmit) onSubmit(value);
  }

  /* ------------------------------------------------------- the tray's keys */

  /**
   * Take the tray's contextual row, or give it back.
   *
   * `arm` is what E does at the podium or the bell when the pending decision is
   * one of the four that live in the tray; `disarm` is Esc, and answers nothing,
   * exactly as closing the panel answers nothing. The decision is still pending
   * afterwards and the row goes back to offering E.
   */
  function arm(view, w) {
    if (!w || surfaceFor(w.kind) !== 'tray') return false;
    armed = true;
    lastTraySig = null;
    renderTray(view, { armed: true });
    return true;
  }

  function disarm(view, presentation) {
    if (!armed) return false;
    armed = false;
    lastTraySig = null;
    if (view) renderTray(view, presentation);
    return true;
  }

  /**
   * Keys while the tray's row is armed. Same contract as handleKey: true means
   * consumed, so the page knows not to also walk with it.
   *
   * The keys are the ones the row is showing and nothing else — what is drawn
   * is what works. A citizen key names that citizen by their permanent number
   * (never their position in the list), Esc gives the row back, and every other
   * key falls through to the page.
   */
  function handleTrayKey(e, view, w) {
    if (!armed) return false;
    if (e.key === 'Escape') { disarm(view); return true; }
    if (!w || surfaceFor(w.kind) !== 'tray') return false;

    if (w.kind === 'vote') {
      if (/^[ay]$/i.test(e.key)) { traySubmit(view, true); return true; }
      if (/^n$/i.test(e.key)) { traySubmit(view, false); return true; }
      return false;
    }
    if (w.kind === 'block_response') {
      if (e.key === '1') { traySubmit(view, w.options[0]); return true; }
      if (e.key === '2') { traySubmit(view, w.options[1]); return true; }
      return false;
    }
    /* nominate and power_target: a citizen, by their own number. */
    const id = seatFromKey(e.key);
    if (id !== null && w.options.indexOf(id) !== -1) { traySubmit(view, id); return true; }
    return false;
  }

  function traySubmit(view, value) {
    armed = false;
    lastTraySig = null;
    if (onSubmit) onSubmit(value);
  }

  /**
   * Keys while a panel is open. Returns true if the key was consumed, which is
   * how the page knows not to also walk with it — A and N are a vote here and
   * strafe-left everywhere else.
   */
  function handleKey(e, view, w) {
    if (!openKind) return false;

    /*
     * Tab cycles inside the panel and cannot leave it.
     *
     * Consuming the key and moving focus by hand is what makes Shift+Tab from
     * the first answer land on the LAST one rather than on the seed box behind
     * the modal. The focusin listener above would catch the escape either way,
     * but it would put focus back at the top, which reads as the key being
     * broken.
     */
    if (e.key === 'Tab') {
      const list = focusables();
      if (!list.length) return true;
      const at = list.indexOf(doc.activeElement);
      const next = e.shiftKey
        ? (at <= 0 ? list.length - 1 : at - 1)
        : (at === -1 || at === list.length - 1 ? 0 : at + 1);
      list[next].focus();
      return true;
    }
    if (e.key === 'Escape') { close(); return true; }
    if (openKind === 'game_over') return false;
    if (!w) return false;

    const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;

    switch (w.kind) {
      case 'acknowledge':
      case 'power_ack':
        if (e.key === 'Enter' || e.key === ' ' || digit === 0) { submit(null); return true; }
        return false;
      case 'vote':
        if (/^[ay]$/i.test(e.key)) { submit(true); return true; }
        if (/^n$/i.test(e.key)) { submit(false); return true; }
        return false;
      case 'block_response':
        if (digit === 0) { submit(true); return true; }
        if (digit === 1) { submit(false); return true; }
        return false;
      case 'deputy_discard': {
        const blockValue = w.options.find((o) => typeof o !== 'number');
        if (/^b$/i.test(e.key) && blockValue !== undefined) { submit(blockValue); return true; }
        if (digit >= 0 && digit < w.detail.tiles.length) { submit(digit); return true; }
        return false;
      }
      case 'speaker_discard':
        if (digit >= 0 && digit < w.detail.tiles.length) { submit(digit); return true; }
        return false;
      default: {
        /*
         * Every other panel picks a CITIZEN, and a citizen is named by their
         * permanent number — so the key is looked up against the option list
         * rather than used as an index into it. A key that names somebody who
         * is not on offer (the term-limited, the dead, yourself) does nothing
         * at all, which is the honest answer: it is still their number.
         */
        const id = seatFromKey(e.key);
        if (id !== null && w.options.indexOf(id) !== -1) { submit(id); return true; }
        return false;
      }
    }
  }

  return {
    renderHud,
    renderObjective,
    renderTray,
    renderCard,
    renderLedger,
    openLedger,
    closeLedger,
    handleLedgerKey,
    get isLedgerOpen() { return ledgerOpen; },
    get ledgerSeen() { return ledgerSeen; },
    get ledger() { return ledger; },
    setPrompt,
    open,
    close,
    handleKey,
    arm,
    disarm,
    handleTrayKey,
    surfaceFor,
    /* For a scripted review: what a Tab press can reach right now. */
    get focusOrder() { return focusables(); },
    get isOpen() { return openKind !== null; },
    get openKind() { return openKind; },
    get isArmed() { return armed; },
    /* What the two permanent surfaces last said, as data — the readback half of
     * the same pair the objective line has: the module's own answer, beside the
     * DOM the page actually wrote. */
    get tray() { return tray; },
    get card() { return card; },
    /* A restart throws the match away, so every cache that stops a surface
     * being rebuilt sixty times a second has to go with it: a new deal can open
     * on the same objective line, the same tray row and the same card the old
     * match ended holding. */
    resetCaches() {
      lastObjectiveId = null;
      lastTraySig = null;
      lastCardSig = null;
      lastLedgerSig = null;
      armed = false;
    }
  };
}
