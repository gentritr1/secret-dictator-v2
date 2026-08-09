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

const TILE_LABEL = { reform: 'REFORM', seize: 'SEIZE' };

const POWER_BLURB = {
  peek: 'You will be told Loyalist or Rebel — not which Rebel.',
  foresight: 'The top three, in order. Then they go back. Nobody is told what you saw.',
  emergency: 'They speak next; afterwards the rotation carries on past you.',
  purge: 'If they are the Dictator, the Loyalists take the Republic at once.'
};

const ROLE_BLURB = {
  loyalist: 'Five Reforms, or purge the Dictator. You know nobody.',
  rebel: 'Six Seizes, or seat the Dictator as Deputy once three Seizes are down.',
  dictator: 'You are what the Rebels are playing for. Do not get purged.'
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

export function createPanels(doc, { onSubmit, onClose } = {}) {
  const el = {
    role: doc.getElementById('role'),
    status: doc.getElementById('status'),
    log: doc.getElementById('log'),
    prompt: doc.getElementById('prompt'),
    panel: doc.getElementById('panel'),
    objective: doc.getElementById('objective')
  };

  let openKind = null;     // the waitingFor.kind (or 'game_over') on screen
  let lastLogLength = -1;
  let lastObjectiveId = null;
  /* Whatever had focus when the panel opened, so closing can give it back. */
  let returnFocusTo = null;

  const nameOf = (view, id) => {
    if (id == null) return '—';
    const p = view.players.find((q) => q.id === id);
    return p ? p.name : '#' + id;
  };

  /* ------------------------------------------------------------ the HUD */

  function renderRole(view) {
    const you = view.you;
    const allies = Object.keys(view.known)
      .map(Number)
      .filter((id) => id !== you.id)
      .map((id) => `${esc(nameOf(view, id))} <em>${esc(view.known[id])}</em>`);
    const peeks = Object.keys(view.peeked)
      .map(Number)
      .map((id) => `${esc(nameOf(view, id))} <em>${esc(view.peeked[id])}</em>`);

    el.role.innerHTML =
      `<div class="you r-${esc(you.role)}">` +
        `<span class="nm">${esc(you.name)}</span>` +
        `<span class="rl">${esc(you.role)}</span>` +
        (you.alive ? '' : '<span class="dead">purged</span>') +
      '</div>' +
      `<p class="blurb">${esc(ROLE_BLURB[you.role] || '')}</p>` +
      (allies.length ? `<p class="known"><b>you know</b> ${allies.join(' · ')}</p>` : '') +
      (peeks.length ? `<p class="known"><b>you have read</b> ${peeks.join(' · ')}</p>` : '');
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

  function renderStatus(view) {
    const row = (k, v, cls) =>
      `<div class="${cls || ''}"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
    const track = (n, total, cls) => {
      let out = '';
      for (let i = 0; i < total; i++) out += `<i class="${cls}${i < n ? ' on' : ''}"></i>`;
      return out;
    };
    el.status.innerHTML =
      /* The phase is one of the two loudest things on screen (the objective is
       * the other), so it is marked rather than left to sit at the same weight
       * as the deck count. */
      row('phase', esc(view.phase), 'loud') +
      row('day', view.day) +
      row('reform', track(view.reform, view.limits.reformToWin, 'reform') + ` ${view.reform}/${view.limits.reformToWin}`) +
      row('seize', track(view.seize, view.limits.seizeToWin, 'seize') + ` ${view.seize}/${view.limits.seizeToWin}`) +
      row('chaos', track(view.chaos, view.limits.chaosLimit, 'chaos') + ` ${view.chaos}/${view.limits.chaosLimit}`) +
      row('speaker', esc(nameOf(view, view.speaker))) +
      row('deputy', esc(nameOf(view, view.deputy))) +
      row('nominee', esc(nameOf(view, view.nominee))) +
      row('next power', esc(view.nextPower || '—')) +
      row('deck', `${view.deckCount} · discard ${view.discardCount}`) +
      row('alive', view.players.filter((p) => p.alive).map((p) =>
        esc(p.name) + (p.isYou ? ' (you)' : '')).join(', '));
  }

  /* The public log, and only the public log. `view.log` is the engine's own
   * G.log — the prose the square hears — not the driver's event stream, which
   * carries ballots, hands and Peek results and is for the console alone. */
  function renderLog(view) {
    if (view.log.length === lastLogLength) return;
    lastLogLength = view.log.length;
    el.log.innerHTML = view.log.map((e) =>
      `<li class="k-${esc(e.kind)}"><span class="d">${e.day}</span>${esc(e.text)}</li>`
    ).join('');
    el.log.scrollTop = el.log.scrollHeight;
  }

  function renderHud(view, presentation) {
    renderRole(view);
    renderStatus(view);
    renderLog(view);
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
          actions: w.options.map((id, i) =>
            button(`${esc(nameOf(view, id))} <kbd>${i + 1}</kbd>`, id)).join('')
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
          actions: w.options.map((id, i) =>
            button(`${esc(nameOf(view, id))} <kbd>${i + 1}</kbd>`, id,
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
  const OUTSIDE = ['hud', 'controls'];

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
      default:
        if (digit >= 0 && digit < w.options.length) { submit(w.options[digit]); return true; }
        return false;
    }
  }

  return {
    renderHud,
    renderObjective,
    setPrompt,
    open,
    close,
    handleKey,
    /* For a scripted review: what a Tab press can reach right now. */
    get focusOrder() { return focusables(); },
    get isOpen() { return openKind !== null; },
    get openKind() { return openKind; },
    /* A restart throws the log away, so the cache that stops it being rebuilt
     * sixty times a second has to be thrown away with it. The objective's cache
     * goes with it for the same reason: a new deal can open on the same line
     * the old match ended holding. */
    resetLog() { lastLogLength = -1; lastObjectiveId = null; }
  };
}
