/*
 * Secret Dictator — rules engine.
 *
 * Pure state machine: no DOM, no timers, no randomness beyond the seeded RNG.
 * The UI drives it by calling actions; every action returns the (possibly new)
 * phase. Everything the screens need to draw is readable off the game object.
 *
 * Rules follow the tutorial copy in the design doc (screen 8a) verbatim:
 *   - Five to ten citizens.
 *   - Elect a government: the Speaker names a Deputy, everyone alive votes at
 *     once, a tie fails, the gavel moves on.
 *   - Pass a law: Speaker draws three tiles and throws one away; the Deputy sees
 *     the other two, throws one away and enacts the last.
 *   - Powers follow the Seize board: Peek Allegiance, Foresight, Emergency Vote,
 *     then Purge, and Block once five are down.
 *   - Loyalists win on five Reform or by purging the Dictator. Rebels win on six
 *     Seize, or by getting the Dictator elected Deputy once three Seize are down.
 *   - Three failed elections in a row: the top tile enacts itself, nobody gets a
 *     power for it, the Chaos Track empties and every term limit is lifted.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SD = Object.assign(root.SD || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- constants */

  var ROLE = { LOYALIST: 'loyalist', REBEL: 'rebel', DICTATOR: 'dictator' };
  var TEAM = { LOYALIST: 'loyalist', REBEL: 'rebel' };
  var TILE = { REFORM: 'reform', SEIZE: 'seize' };

  var REFORM_TO_WIN = 5;
  var SEIZE_TO_WIN = 6;
  var CHAOS_LIMIT = 3;
  var DECK_REFORM = 6;
  var DECK_SEIZE = 11;

  /* The design states one power table for every player count — see 8a:
   * "Each Seize tile lights the next slot: Peek Allegiance, Foresight,
   *  Emergency Vote, then Purge, and Block once five are down." */
  var POWER_BY_SLOT = {
    1: 'peek',
    2: 'foresight',
    3: 'emergency',
    4: 'purge',
    5: 'purge'
  };
  var BLOCK_UNLOCKED_AT = 5;
  var DICTATOR_DEPUTY_WIN_AT = 3;

  var POWER_LABEL = {
    peek: 'Peek Allegiance',
    foresight: 'Foresight',
    emergency: 'Emergency Vote',
    purge: 'Purge'
  };

  /* Loyalists / Rebels / Dictator. The Dictator is counted separately, matching
   * the lobby copy in 7c: "Loyalists 4  Rebels 2  The Dictator 1" at seven. */
  var SETUP = {
    5:  { loyalists: 3, rebels: 1 },
    6:  { loyalists: 4, rebels: 1 },
    7:  { loyalists: 4, rebels: 2 },
    8:  { loyalists: 5, rebels: 2 },
    9:  { loyalists: 5, rebels: 3 },
    10: { loyalists: 6, rebels: 3 }
  };

  /* At five or six the Dictator also sees the Rebels; from seven up they do not.
   * 7c: "Rebels will know each other. The Dictator will not know them." */
  var DICTATOR_SEES_REBELS_UP_TO = 6;

  var PHASE = {
    NOMINATION: 'nomination',
    VOTE: 'vote',
    VOTE_RESULT: 'vote_result',
    LEGISLATIVE_SPEAKER: 'legislative_speaker',
    LEGISLATIVE_DEPUTY: 'legislative_deputy',
    BLOCK_RESPONSE: 'block_response',
    POWER: 'power',
    CHAOS: 'chaos',
    GAME_OVER: 'game_over'
  };

  /* ---------------------------------------------------------------------- rng */

  function makeRng(seed) {
    var s = seed >>> 0;
    if (s === 0) s = 0x9e3779b9;
    return function () {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function randomHallCode(rng) {
    var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O — they read as 1 and 0
    var out = '';
    for (var i = 0; i < 4; i++) out += letters[Math.floor(rng() * letters.length)];
    return out;
  }

  /* -------------------------------------------------------------------- setup */

  function buildDeck(rng) {
    var deck = [];
    var i;
    for (i = 0; i < DECK_REFORM; i++) deck.push(TILE.REFORM);
    for (i = 0; i < DECK_SEIZE; i++) deck.push(TILE.SEIZE);
    return shuffle(deck, rng);
  }

  function dealRoles(count, rng) {
    var setup = SETUP[count];
    if (!setup) throw new Error('Secret Dictator seats five to ten, got ' + count);
    var roles = [ROLE.DICTATOR];
    var i;
    for (i = 0; i < setup.rebels; i++) roles.push(ROLE.REBEL);
    for (i = 0; i < setup.loyalists; i++) roles.push(ROLE.LOYALIST);
    return shuffle(roles, rng);
  }

  function teamOf(role) {
    return role === ROLE.LOYALIST ? TEAM.LOYALIST : TEAM.REBEL;
  }

  /**
   * @param {{names: string[], humanIndex?: number, seed?: number, hallCode?: string}} opts
   */
  function createGame(opts) {
    var names = opts.names.slice();
    var seed = opts.seed == null ? (Math.random() * 0xffffffff) >>> 0 : opts.seed >>> 0;
    var rng = makeRng(seed);
    var roles = dealRoles(names.length, rng);
    var humanIndex = opts.humanIndex == null ? 0 : opts.humanIndex;

    var players = names.map(function (name, i) {
      return {
        id: i,
        seat: i + 1,
        name: name,
        role: roles[i],
        team: teamOf(roles[i]),
        alive: true,
        isHuman: i === humanIndex,
        /* what this player has been told by a Peek Allegiance */
        peeked: {}
      };
    });

    var G = {
      seed: seed,
      rng: rng,
      hallCode: opts.hallCode || randomHallCode(rng),
      players: players,
      humanId: humanIndex,

      reform: 0,
      seize: 0,
      chaos: 0,
      day: 1,

      deck: buildDeck(rng),
      discard: [],

      speaker: 0,
      nominee: null,
      deputy: null,
      lastSpeaker: null,
      lastDeputy: null,

      /* set by Emergency Vote: the seat the gavel returns to afterwards */
      returnSeat: null,
      /* true while the current Speaker holds the gavel via Emergency Vote */
      isSpecialElection: false,

      votes: {},
      lastVote: null,          // { aye:[ids], nay:[ids], passed:bool, speaker, deputy }

      hand: [],                // the three the Speaker drew
      deputyHand: [],          // the two the Deputy received
      blockProposed: false,
      blockRefused: false,     // a Block may only be moved once per session
      blockUnlocked: false,

      pendingPower: null,      // { kind, holder, result? }
      lastEnacted: null,       // { tile, byChaos }
      chaosTile: null,

      winner: null,            // TEAM.* once decided
      winReason: null,
      phase: PHASE.NOMINATION,
      log: []
    };

    G.speaker = Math.floor(rng() * players.length);
    logEvent(G, 'system', 'The hall is sealed. ' + players[G.speaker].name + ' takes the gavel.');
    return G;
  }

  /* ---------------------------------------------------------------------- log */

  function logEvent(G, kind, text, meta) {
    G.log.push({ kind: kind, text: text, day: G.day, meta: meta || null });
    return G.log[G.log.length - 1];
  }

  function say(G, playerId, text) {
    return logEvent(G, 'chat', text, { speakerId: playerId });
  }

  /* --------------------------------------------------------------- selectors */

  function alivePlayers(G) {
    return G.players.filter(function (p) { return p.alive; });
  }

  function aliveCount(G) {
    return alivePlayers(G).length;
  }

  function player(G, id) {
    return G.players[id];
  }

  function dictator(G) {
    return G.players.find(function (p) { return p.role === ROLE.DICTATOR; });
  }

  /**
   * Who the Speaker may name as Deputy. Term limits bite the previous elected
   * government; with five or fewer still standing only the last Deputy is
   * blocked, so a nomination is always possible.
   */
  function eligibleDeputies(G) {
    var n = aliveCount(G);
    return alivePlayers(G).filter(function (p) {
      if (p.id === G.speaker) return false;
      if (G.lastDeputy != null && p.id === G.lastDeputy) return false;
      if (n > 5 && G.lastSpeaker != null && p.id === G.lastSpeaker) return false;
      return true;
    });
  }

  function termLimited(G) {
    var n = aliveCount(G);
    var out = [];
    if (G.lastDeputy != null && player(G, G.lastDeputy).alive) out.push(G.lastDeputy);
    if (n > 5 && G.lastSpeaker != null && player(G, G.lastSpeaker).alive &&
        out.indexOf(G.lastSpeaker) === -1) out.push(G.lastSpeaker);
    return out;
  }

  /** Roles a given player is allowed to see, as { playerId: role }. */
  function knownRoles(G, viewerId) {
    var viewer = player(G, viewerId);
    var known = {};
    known[viewerId] = viewer.role;
    if (viewer.role === ROLE.REBEL) {
      G.players.forEach(function (p) {
        if (p.role === ROLE.REBEL || p.role === ROLE.DICTATOR) known[p.id] = p.role;
      });
    } else if (viewer.role === ROLE.DICTATOR && G.players.length <= DICTATOR_SEES_REBELS_UP_TO) {
      G.players.forEach(function (p) {
        if (p.role === ROLE.REBEL) known[p.id] = p.role;
      });
    }
    return known;
  }

  function powerForNextSeize(G) {
    return POWER_BY_SLOT[G.seize + 1] || null;
  }

  /* ---------------------------------------------------------------- deck ops */

  function ensureDeck(G, needed) {
    if (G.deck.length >= needed) return false;
    G.deck = shuffle(G.deck.concat(G.discard), G.rng);
    G.discard = [];
    logEvent(G, 'system', 'The deck runs low. Discards are shuffled back in.');
    return true;
  }

  function drawTiles(G, n) {
    ensureDeck(G, n);
    return G.deck.splice(0, n);
  }

  function peekTop(G, n) {
    ensureDeck(G, n);
    return G.deck.slice(0, n);
  }

  /* ------------------------------------------------------------- win checks */

  function endGame(G, team, reason) {
    G.winner = team;
    G.winReason = reason;
    G.phase = PHASE.GAME_OVER;
    logEvent(G, 'result', reason);
    return G.phase;
  }

  function checkTrackWin(G) {
    if (G.reform >= REFORM_TO_WIN) {
      return endGame(G, TEAM.LOYALIST, 'The fifth Reform is signed into law. The Loyalists hold the Republic.');
    }
    if (G.seize >= SEIZE_TO_WIN) {
      return endGame(G, TEAM.REBEL, 'The sixth Seize is enacted. The Rebels take the Republic.');
    }
    return null;
  }

  /* --------------------------------------------------------------- rotation */

  function nextAliveSeatAfter(G, id) {
    var n = G.players.length;
    for (var step = 1; step <= n; step++) {
      var cand = (id + step) % n;
      if (G.players[cand].alive) return cand;
    }
    return id;
  }

  function advanceSpeaker(G) {
    if (G.returnSeat != null) {
      /* Emergency Vote is over. The gavel rejoins the regular rotation *past*
       * the citizen who called it — they do not get a second session. */
      var back = G.returnSeat;
      G.returnSeat = null;
      G.isSpecialElection = false;
      G.speaker = nextAliveSeatAfter(G, back);
    } else {
      G.isSpecialElection = false;
      G.speaker = nextAliveSeatAfter(G, G.speaker);
    }
  }

  function beginNomination(G) {
    G.nominee = null;
    G.deputy = null;
    G.votes = {};
    G.hand = [];
    G.deputyHand = [];
    G.blockProposed = false;
    G.pendingPower = null;
    G.phase = PHASE.NOMINATION;
    logEvent(G, 'phase', 'Day ' + G.day + ' — the Speaker rises. ' +
      player(G, G.speaker).name + ' holds the gavel.');
    return G.phase;
  }

  function nextRound(G) {
    if (G.winner) return G.phase;
    G.day += 1;
    advanceSpeaker(G);
    return beginNomination(G);
  }

  /* ---------------------------------------------------------------- actions */

  /** Speaker names a Deputy. */
  function nominate(G, nomineeId) {
    if (G.phase !== PHASE.NOMINATION) throw new Error('not in nomination');
    if (!eligibleDeputies(G).some(function (p) { return p.id === nomineeId; })) {
      throw new Error('ineligible nominee: ' + nomineeId);
    }
    G.nominee = nomineeId;
    G.votes = {};
    G.phase = PHASE.VOTE;
    logEvent(G, 'phase', player(G, G.speaker).name + ' nominated ' +
      player(G, nomineeId).name + ' as Deputy. The lamps are lit.',
      { speakerId: G.speaker, nomineeId: nomineeId });
    return G.phase;
  }

  function castVote(G, playerId, aye) {
    if (G.phase !== PHASE.VOTE) throw new Error('not in vote');
    if (!player(G, playerId).alive) throw new Error('the dead do not vote');
    G.votes[playerId] = !!aye;
    return G.phase;
  }

  function ballotsSealed(G) {
    return Object.keys(G.votes).length;
  }

  function allVotesIn(G) {
    return ballotsSealed(G) >= aliveCount(G);
  }

  /** Resolve the simultaneous vote. A tie fails. */
  function resolveVote(G) {
    if (G.phase !== PHASE.VOTE) throw new Error('not in vote');
    if (!allVotesIn(G)) throw new Error('ballots still open');

    var aye = [], nay = [];
    alivePlayers(G).forEach(function (p) {
      (G.votes[p.id] ? aye : nay).push(p.id);
    });
    var passed = aye.length > nay.length; // a tie fails
    G.lastVote = {
      aye: aye, nay: nay, passed: passed,
      speaker: G.speaker, nominee: G.nominee
    };
    G.phase = PHASE.VOTE_RESULT;

    if (passed) {
      G.deputy = G.nominee;
      logEvent(G, 'phase', 'Government elected ' + aye.length + '–' + nay.length + '. ' +
        player(G, G.speaker).name + ' and ' + player(G, G.deputy).name + ' withdraw.',
        { aye: aye.length, nay: nay.length });
    } else {
      logEvent(G, 'phase', 'The motion fails ' + aye.length + '–' + nay.length + '. ' +
        'The gavel moves on.', { aye: aye.length, nay: nay.length });
    }
    return G.phase;
  }

  /**
   * Leave the vote-result beat. Called once the UI has shown the tally.
   * This is where the Dictator-as-Deputy win and the Chaos Track are settled.
   */
  function afterVote(G) {
    if (G.phase !== PHASE.VOTE_RESULT) throw new Error('not at vote result');
    var v = G.lastVote;

    if (v.passed) {
      G.chaos = 0;
      if (G.seize >= DICTATOR_DEPUTY_WIN_AT && player(G, G.deputy).role === ROLE.DICTATOR) {
        return endGame(G, TEAM.REBEL,
          'The Dictator was seated as Deputy with ' + G.seize + ' Seize on the board. The Rebels take the Republic.');
      }
      G.lastSpeaker = G.speaker;
      G.lastDeputy = G.deputy;
      G.hand = drawTiles(G, 3);
      G.phase = PHASE.LEGISLATIVE_SPEAKER;
      logEvent(G, 'phase', player(G, G.speaker).name + ' draws three tiles in private.');
      return G.phase;
    }

    G.chaos += 1;
    if (G.chaos >= CHAOS_LIMIT) return enterChaos(G);
    logEvent(G, 'system', 'The Chaos Track advances to ' + G.chaos + ' of ' + CHAOS_LIMIT + '.');
    return nextRound(G);
  }

  /* -------------------------------------------------------------- chaos */

  function enterChaos(G) {
    var tile = drawTiles(G, 1)[0];
    G.chaosTile = tile;
    G.phase = PHASE.CHAOS;
    logEvent(G, 'phase', 'Third election failed. Chaos takes the deck.');
    return G.phase;
  }

  /** Acknowledge the chaos screen: the top tile enacts itself, no power granted. */
  function resolveChaos(G) {
    if (G.phase !== PHASE.CHAOS) throw new Error('not in chaos');
    var tile = G.chaosTile;
    G.chaosTile = null;
    if (tile === TILE.REFORM) G.reform += 1; else G.seize += 1;
    G.lastEnacted = { tile: tile, byChaos: true };
    G.chaos = 0;
    G.lastSpeaker = null;   // every term limit is lifted
    G.lastDeputy = null;
    G.blockUnlocked = G.seize >= BLOCK_UNLOCKED_AT;
    logEvent(G, 'enact', 'Nobody drew it. Nobody chose it. A ' +
      (tile === TILE.REFORM ? 'Reform' : 'Seize') +
      ' goes on the board and grants no power. Every term limit is lifted.',
      { tile: tile, byChaos: true });

    if (checkTrackWin(G)) return G.phase;
    return nextRound(G);
  }

  /* -------------------------------------------------------- legislative */

  /** Speaker throws one of the three away; the Deputy receives the other two. */
  function speakerDiscard(G, index) {
    if (G.phase !== PHASE.LEGISLATIVE_SPEAKER) throw new Error('not the Speaker\'s draft');
    if (index < 0 || index >= G.hand.length) throw new Error('no such tile');
    var thrown = G.hand.splice(index, 1)[0];
    G.discard.push(thrown);
    G.deputyHand = G.hand.slice();
    G.hand = [];
    G.blockProposed = false;
    G.blockRefused = false;
    G.phase = PHASE.LEGISLATIVE_DEPUTY;
    logEvent(G, 'phase', player(G, G.speaker).name + ' passes two tiles to ' +
      player(G, G.deputy).name + '. The discard is never revealed to the square.');
    return G.phase;
  }

  /** Deputy throws one away and enacts the last. */
  function deputyDiscard(G, index) {
    if (G.phase !== PHASE.LEGISLATIVE_DEPUTY) throw new Error('not the Deputy\'s draft');
    if (index < 0 || index >= G.deputyHand.length) throw new Error('no such tile');
    var thrown = G.deputyHand.splice(index, 1)[0];
    G.discard.push(thrown);
    var enacted = G.deputyHand[0];
    G.deputyHand = [];
    return enactTile(G, enacted, false);
  }

  /**
   * May the Deputy move to Block? Only once five Seize are down, and only once
   * per session — a Speaker who refuses cannot be asked again.
   */
  function canProposeBlock(G) {
    return G.phase === PHASE.LEGISLATIVE_DEPUTY && G.blockUnlocked && !G.blockRefused;
  }

  /** Deputy asks the Speaker to Block. Only once five Seize are down. */
  function proposeBlock(G) {
    if (G.phase !== PHASE.LEGISLATIVE_DEPUTY) throw new Error('not the Deputy\'s draft');
    if (!G.blockUnlocked) throw new Error('Block is not unlocked');
    if (G.blockRefused) throw new Error('the Block was already refused this session');
    G.blockProposed = true;
    G.phase = PHASE.BLOCK_RESPONSE;
    logEvent(G, 'phase', player(G, G.deputy).name + ' moves to Block. ' +
      player(G, G.speaker).name + ' must agree.');
    return G.phase;
  }

  /** Speaker agrees to the Block (both tiles burn) or refuses (Deputy must enact). */
  function respondBlock(G, accept) {
    if (G.phase !== PHASE.BLOCK_RESPONSE) throw new Error('no Block on the table');
    if (accept) {
      G.discard = G.discard.concat(G.deputyHand);
      G.deputyHand = [];
      G.blockProposed = false;
      logEvent(G, 'phase', 'The Block carries. Both tiles burn and no law is passed.');
      G.chaos += 1;
      if (G.chaos >= CHAOS_LIMIT) return enterChaos(G);
      logEvent(G, 'system', 'The Chaos Track advances to ' + G.chaos + ' of ' + CHAOS_LIMIT + '.');
      return nextRound(G);
    }
    G.blockProposed = false;
    G.blockRefused = true;
    G.phase = PHASE.LEGISLATIVE_DEPUTY;
    logEvent(G, 'phase', player(G, G.speaker).name + ' refuses the Block. ' +
      player(G, G.deputy).name + ' must enact one of the two.');
    return G.phase;
  }

  function enactTile(G, tile, byChaos) {
    if (tile === TILE.REFORM) G.reform += 1; else G.seize += 1;
    G.lastEnacted = { tile: tile, byChaos: !!byChaos };
    G.blockUnlocked = G.seize >= BLOCK_UNLOCKED_AT;
    logEvent(G, 'enact', 'A ' + (tile === TILE.REFORM ? 'Reform' : 'Seize') + ' is enacted.',
      { tile: tile, byChaos: !!byChaos });

    if (checkTrackWin(G)) return G.phase;

    if (tile === TILE.SEIZE) {
      var kind = POWER_BY_SLOT[G.seize];
      if (kind) return beginPower(G, kind);
    }
    return nextRound(G);
  }

  /* -------------------------------------------------------------- powers */

  function beginPower(G, kind) {
    G.pendingPower = {
      kind: kind,
      holder: G.speaker,
      result: null,
      resolved: false
    };
    G.phase = PHASE.POWER;
    logEvent(G, 'phase', POWER_LABEL[kind] + ' — the ' + G.seize +
      (G.seize === 1 ? 'st' : G.seize === 2 ? 'nd' : G.seize === 3 ? 'rd' : 'th') +
      ' Seize grants it to ' + player(G, G.speaker).name + '.', { power: kind });

    if (kind === 'foresight') {
      /* No target: the holder simply looks at the top three. */
      G.pendingPower.result = { tiles: peekTop(G, 3) };
    }
    return G.phase;
  }

  /** Who the current power may be aimed at. */
  function powerTargets(G) {
    if (!G.pendingPower) return [];
    var kind = G.pendingPower.kind;
    var holder = G.pendingPower.holder;
    if (kind === 'foresight') return [];
    return alivePlayers(G).filter(function (p) {
      if (p.id === holder) return false;
      /* Peek Allegiance never repeats on the same citizen. */
      if (kind === 'peek' && player(G, holder).peeked[p.id]) return false;
      return true;
    });
  }

  /** Aim the power. `targetId` is ignored by Foresight. */
  function usePower(G, targetId) {
    if (G.phase !== PHASE.POWER) throw new Error('no power pending');
    var pp = G.pendingPower;
    if (pp.resolved) throw new Error('power already used');
    var holder = player(G, pp.holder);

    if (pp.kind === 'foresight') {
      pp.resolved = true;
      logEvent(G, 'power', holder.name + ' consults the deck.', { power: 'foresight' });
      return G.phase;
    }

    if (!powerTargets(G).some(function (p) { return p.id === targetId; })) {
      throw new Error('illegal target');
    }
    var target = player(G, targetId);

    if (pp.kind === 'peek') {
      holder.peeked[targetId] = target.team;
      pp.result = { targetId: targetId, team: target.team };
      pp.resolved = true;
      logEvent(G, 'power', holder.name + ' looks into ' + target.name + '’s allegiance.',
        { power: 'peek', targetId: targetId });
      return G.phase;
    }

    if (pp.kind === 'emergency') {
      pp.result = { targetId: targetId };
      pp.resolved = true;
      G.returnSeat = pp.holder;      // gavel comes back here afterwards
      G.isSpecialElection = true;
      logEvent(G, 'power', holder.name + ' calls an Emergency Vote. ' + target.name +
        ' takes the gavel for one session.', { power: 'emergency', targetId: targetId });
      return G.phase;
    }

    if (pp.kind === 'purge') {
      target.alive = false;
      pp.result = { targetId: targetId, wasDictator: target.role === ROLE.DICTATOR };
      pp.resolved = true;
      logEvent(G, 'power', target.name + ' is purged and leaves the square.',
        { power: 'purge', targetId: targetId });
      if (target.role === ROLE.DICTATOR) {
        return endGame(G, TEAM.LOYALIST,
          'The Dictator is purged. The Loyalists hold the Republic.');
      }
      return G.phase;
    }

    throw new Error('unknown power ' + pp.kind);
  }

  /** Dismiss the power screen and move to the next round. */
  function finishPower(G) {
    if (G.phase !== PHASE.POWER) throw new Error('no power pending');
    var pp = G.pendingPower;
    if (!pp.resolved) throw new Error('power not used yet');

    if (pp.kind === 'emergency') {
      var target = pp.result.targetId;
      G.pendingPower = null;
      G.day += 1;
      G.speaker = target;             // returnSeat already parked
      return beginNomination(G);
    }
    G.pendingPower = null;
    return nextRound(G);
  }

  /* ------------------------------------------------------------- reveal */

  /** Everything, for the game-over screen only. */
  function fullReveal(G) {
    return G.players.map(function (p) {
      return { id: p.id, name: p.name, role: p.role, team: p.team, alive: p.alive };
    });
  }

  /* ----------------------------------------------------------- serialise */

  function snapshot(G) {
    return JSON.parse(JSON.stringify({
      seed: G.seed, reform: G.reform, seize: G.seize, chaos: G.chaos, day: G.day,
      phase: G.phase, speaker: G.speaker, deputy: G.deputy, nominee: G.nominee,
      winner: G.winner, deck: G.deck.length, discard: G.discard.length,
      alive: alivePlayers(G).map(function (p) { return p.id; })
    }));
  }

  return {
    ROLE: ROLE, TEAM: TEAM, TILE: TILE, PHASE: PHASE,
    POWER_BY_SLOT: POWER_BY_SLOT, POWER_LABEL: POWER_LABEL, SETUP: SETUP,
    REFORM_TO_WIN: REFORM_TO_WIN, SEIZE_TO_WIN: SEIZE_TO_WIN, CHAOS_LIMIT: CHAOS_LIMIT,
    DECK_REFORM: DECK_REFORM, DECK_SEIZE: DECK_SEIZE,
    BLOCK_UNLOCKED_AT: BLOCK_UNLOCKED_AT, DICTATOR_DEPUTY_WIN_AT: DICTATOR_DEPUTY_WIN_AT,
    DICTATOR_SEES_REBELS_UP_TO: DICTATOR_SEES_REBELS_UP_TO,

    makeRng: makeRng, shuffle: shuffle, randomHallCode: randomHallCode,
    createGame: createGame,

    alivePlayers: alivePlayers, aliveCount: aliveCount, player: player, dictator: dictator,
    eligibleDeputies: eligibleDeputies, termLimited: termLimited, knownRoles: knownRoles,
    powerForNextSeize: powerForNextSeize, powerTargets: powerTargets,
    ballotsSealed: ballotsSealed, allVotesIn: allVotesIn, fullReveal: fullReveal,
    snapshot: snapshot, logEvent: logEvent, say: say, peekTop: peekTop,

    nominate: nominate, castVote: castVote, resolveVote: resolveVote, afterVote: afterVote,
    speakerDiscard: speakerDiscard, deputyDiscard: deputyDiscard,
    proposeBlock: proposeBlock, respondBlock: respondBlock, canProposeBlock: canProposeBlock,
    resolveChaos: resolveChaos, usePower: usePower, finishPower: finishPower,
    beginNomination: beginNomination, nextRound: nextRound
  };
});
