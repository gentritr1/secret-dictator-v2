/*
 * Secret Dictator — the player-safe view model.
 *
 * `viewFor(G, playerId)` projects the game object down to what ONE seat is
 * allowed to know, as plain JSON. It is the only thing the match page reads:
 * no screen, panel or label under src/play touches `G`.
 *
 * Why bother, in a single-player game where the "server" is the same tab
 * ---------------------------------------------------------------------
 * Because the interesting failure is not somebody opening the console — that is
 * unpreventable here and always will be. It is the ordinary one: a panel that
 * needs a name reaches for `G.players[id]`, gets `.role` for free, and six
 * months later a tooltip, a label or a debug line prints it. Every leak of
 * hidden information in a deduction game has that shape. Routing the whole UI
 * through a projection means the leak has to be *added to this file*, where it
 * is one obvious line rather than an accident.
 *
 * It is also the shape multiplayer needs. When the game object lives on a
 * server, this function is what gets serialised down the wire to each client,
 * and the leak test is what says it is safe to send. Building it now costs a
 * file; retrofitting it later costs the whole UI.
 *
 * The rules of disclosure, read off engine.js rather than assumed:
 *
 *   - SD.knownRoles(G, v) is the engine's own answer to "whose role may v see":
 *     always their own; a Rebel sees the other Rebels and the Dictator; the
 *     Dictator sees the Rebels only at five or six players
 *     (SD.DICTATOR_SEES_REBELS_UP_TO). Nothing here re-derives that.
 *   - A Peek Allegiance result is private to the holder. The engine stores it
 *     on the holder (`player.peeked`), so `viewFor` reads only the viewer's own
 *     map and never anyone else's.
 *   - Foresight's three tiles, the Speaker's three and the Deputy's two are
 *     private to whoever is holding them, and they arrive only through
 *     `waitingFor.detail` — i.e. only at the moment that seat has to act on
 *     them.
 *   - The deck and the discard pile are counts, never contents. The engine
 *     itself says the Speaker's discard "is never revealed to the square".
 *   - `G.seed` is never projected. It is not a role, but it regenerates the
 *     whole deal — deck order and every allegiance — from one integer.
 *   - `G.log` is public in full: every logEvent() in engine.js writes prose the
 *     square hears. (A Peek is logged as "X looks into Y's allegiance" and
 *     never as what was found.) test/view.test.js sweeps it anyway rather than
 *     taking this paragraph's word for it.
 *   - Everything is revealed at game over, and only then.
 *
 * UMD, like the rest of src/engine: CommonJS under Node, `self.SDView` in a
 * browser (where engine.js, ai.js and driver.js must already have loaded).
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = isNode
    ? factory(require('./engine.js'), require('./driver.js'))
    : factory(root.SD, root.SDDriver);
  if (isNode) module.exports = api;
  else root.SDView = api;
})(typeof self !== 'undefined' ? self : this, function (SD, Driver) {
  'use strict';

  function copyMap(src) {
    var out = {};
    if (!src) return out;
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    return out;
  }

  /**
   * @param {object} G        the live game
   * @param {number} playerId the seat this view belongs to
   * @param {object} [opts]   { waitingFor } — override the pending decision, so
   *                          a session that owns extra gates (the morning
   *                          report) can put its own answer in. Default is the
   *                          driver's, for this seat only.
   * @returns {object} plain JSON — no functions, no references into G
   */
  function viewFor(G, playerId, opts) {
    var me = G.players[playerId];
    if (!me) throw new Error('no such seat: ' + playerId);

    var over = G.phase === SD.PHASE.GAME_OVER;
    var waiting = opts && 'waitingFor' in opts
      ? opts.waitingFor
      : Driver.humanTurn(G, playerId);

    var pp = G.pendingPower;
    var power = null;
    if (pp) {
      /* Which power is on the table and who holds it were both announced. What
       * it *found* was not, so the result travels only to the holder. */
      power = {
        kind: pp.kind,
        label: SD.POWER_LABEL[pp.kind] || pp.kind,
        holder: pp.holder,
        holderName: G.players[pp.holder].name,
        resolved: !!pp.resolved,
        result: null
      };
      if (pp.holder === playerId && pp.result) {
        power.result = {
          targetId: pp.result.targetId == null ? null : pp.result.targetId,
          team: pp.result.team || null,
          tiles: pp.result.tiles ? pp.result.tiles.slice() : null
        };
      }
    }

    var view = {
      /* --- who you are ------------------------------------------------- */
      you: {
        id: me.id,
        seat: me.seat,
        name: me.name,
        alive: me.alive,
        role: me.role,
        team: me.team
      },
      /* The engine's own disclosure rule, not a re-derivation of it. */
      known: copyMap(SD.knownRoles(G, playerId)),
      /* Your own Peek Allegiance results, and nobody else's. */
      peeked: copyMap(me.peeked),

      /* --- the square, as anybody standing in it sees it ---------------- */
      players: G.players.map(function (p) {
        return {
          id: p.id,
          seat: p.seat,
          name: p.name,
          alive: p.alive,
          isYou: p.id === playerId
        };
      }),
      hallCode: G.hallCode,
      phase: G.phase,
      day: G.day,
      reform: G.reform,
      seize: G.seize,
      chaos: G.chaos,
      limits: {
        reformToWin: SD.REFORM_TO_WIN,
        seizeToWin: SD.SEIZE_TO_WIN,
        chaosLimit: SD.CHAOS_LIMIT,
        blockUnlockedAt: SD.BLOCK_UNLOCKED_AT,
        dictatorDeputyWinAt: SD.DICTATOR_DEPUTY_WIN_AT
      },

      speaker: G.speaker,
      nominee: G.nominee,
      deputy: G.deputy,
      lastSpeaker: G.lastSpeaker,
      lastDeputy: G.lastDeputy,
      isSpecialElection: !!G.isSpecialElection,
      returnSeat: G.returnSeat,
      eligible: SD.eligibleDeputies(G).map(function (p) { return p.id; }),
      termLimited: SD.termLimited(G),
      aliveCount: SD.aliveCount(G),

      /* Counts, never contents. */
      deckCount: G.deck.length,
      discardCount: G.discard.length,
      /* How many ballots are in — never whose, and never which way. */
      ballotsSealed: SD.ballotsSealed(G),

      blockUnlocked: !!G.blockUnlocked,
      blockProposed: !!G.blockProposed,
      blockRefused: !!G.blockRefused,
      nextPower: SD.powerForNextSeize(G),

      /* Announced when the ballots were opened. */
      lastVote: G.lastVote ? {
        aye: G.lastVote.aye.slice(),
        nay: G.lastVote.nay.slice(),
        passed: !!G.lastVote.passed,
        speaker: G.lastVote.speaker,
        nominee: G.lastVote.nominee
      } : null,
      /* What went on the board is the one thing the square always sees. */
      lastEnacted: G.lastEnacted ? { tile: G.lastEnacted.tile, byChaos: !!G.lastEnacted.byChaos } : null,
      /* Turned face up in front of everyone when the Chaos Track fills. */
      chaosTile: G.phase === SD.PHASE.CHAOS ? G.chaosTile : null,

      power: power,

      /* --- the end ------------------------------------------------------ */
      winner: over ? G.winner : null,
      winReason: over ? G.winReason : null,
      reveal: over ? SD.fullReveal(G) : null,

      /* --- what the square has heard ------------------------------------ */
      log: G.log.map(function (e) {
        return { kind: e.kind, text: e.text, day: e.day, meta: e.meta || null };
      }),

      /* --- what you may do right now ------------------------------------ */
      waitingFor: waiting || null
    };

    /* A round trip guarantees two things the rest of this file only intends:
     * the projection is genuinely JSON (no functions, no cycles), and it shares
     * no array or object with G, so a careless panel cannot write through it
     * into the game. */
    return JSON.parse(JSON.stringify(view));
  }

  return { viewFor: viewFor };
});
