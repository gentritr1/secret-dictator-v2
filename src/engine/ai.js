/*
 * Secret Dictator — the other citizens.
 *
 * Each bot keeps a "mind": what it has been told for certain (its own role, its
 * team-mates, anything a Peek Allegiance revealed to it) and a running suspicion
 * score for everybody else built from what the square can actually observe —
 * who sat in a government, what came out of it, and who voted it in.
 *
 * Bots never read hidden state directly. Everything they know arrives through
 * the observe* hooks below, so a Loyalist bot is working from the same
 * information a Loyalist human has.
 */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./engine.js') : root.SD);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SDAI = api;
})(typeof self !== 'undefined' ? self : this, function (SD) {
  'use strict';

  var ROLE = SD.ROLE, TEAM = SD.TEAM, TILE = SD.TILE;

  /* ------------------------------------------------------------------ minds */

  function create(G) {
    return G.players.map(function (p) {
      var known = SD.knownRoles(G, p.id);
      var sus = {};
      G.players.forEach(function (q) { sus[q.id] = 0; });
      return {
        id: p.id,
        known: known,           // { playerId: role } — certain knowledge
        peeked: {},             // { playerId: team } — from Peek Allegiance
        sus: sus,               // higher = reads as Rebel
        /* claims a bot has made out loud, so it does not contradict itself */
        claimed: {}
      };
    });
  }

  function isTeammate(mind, G, id) {
    var me = G.players[mind.id];
    if (me.team === TEAM.LOYALIST) return false;
    return mind.known[id] === ROLE.REBEL || mind.known[id] === ROLE.DICTATOR;
  }

  /** What this mind believes about `id`: 'rebel', 'loyalist' or null. */
  function reads(mind, G, id) {
    if (mind.known[id]) return mind.known[id] === ROLE.LOYALIST ? TEAM.LOYALIST : TEAM.REBEL;
    if (mind.peeked[id]) return mind.peeked[id];
    return null;
  }

  function suspicion(mind, G, id) {
    var hard = reads(mind, G, id);
    if (hard === TEAM.REBEL) return 100;
    if (hard === TEAM.LOYALIST) return -100;
    return mind.sus[id] || 0;
  }

  /* -------------------------------------------------------------- observing */

  /**
   * A government enacted something. This is the main signal in the game:
   * a Seize out of a government stains both seats, worst for the Speaker who
   * saw three tiles, and lightly stains everyone who voted the pair in.
   */
  function observeEnact(minds, G, info) {
    if (info.byChaos) return;
    var seize = info.tile === TILE.SEIZE;
    var votedAye = (info.aye || []);
    minds.forEach(function (mind) {
      if (mind.id === info.speaker || mind.id === info.deputy) return;
      var d = seize ? 1 : -1;
      bump(mind, info.speaker, d * 2.0);
      bump(mind, info.deputy, d * 1.4);
      votedAye.forEach(function (v) {
        if (v !== info.speaker && v !== info.deputy) bump(mind, v, d * 0.25);
      });
    });
  }

  /** A failed election tells you a little about who wanted that pairing. */
  function observeVote(minds, G, vote) {
    if (vote.passed) return;
    minds.forEach(function (mind) {
      vote.aye.forEach(function (v) {
        if (v === mind.id) return;
        /* wanting a government that most of the square distrusted */
        bump(mind, v, 0.2 * suspicionSign(mind, vote.nominee));
      });
    });
  }

  function suspicionSign(mind, id) {
    var s = mind.sus[id] || 0;
    return s > 1 ? 1 : s < -1 ? -1 : 0;
  }

  function observePeek(minds, G, holderId, targetId, team) {
    var mind = minds[holderId];
    if (!mind) return;
    mind.peeked[targetId] = team;
  }

  /** A purge is public: what the purger chose says something about the purger. */
  function observePurge(minds, G, holderId, targetId) {
    minds.forEach(function (mind) {
      if (mind.id === holderId) return;
      var t = suspicion(mind, G, targetId);
      /* purging somebody the square already distrusted reads clean */
      bump(mind, holderId, t > 1 ? -1.2 : t < -1 ? 1.8 : 0.2);
    });
  }

  function bump(mind, id, amount) {
    if (id == null) return;
    mind.sus[id] = (mind.sus[id] || 0) + amount;
  }

  /* ------------------------------------------------------------- decisions */

  function rank(mind, G, ids) {
    return ids.slice().sort(function (a, b) {
      return suspicion(mind, G, a) - suspicion(mind, G, b);
    });
  }

  /** Speaker picks a Deputy. */
  function chooseNominee(G, minds, botId) {
    var mind = minds[botId];
    var me = G.players[botId];
    var pool = SD.eligibleDeputies(G).map(function (p) { return p.id; });
    if (!pool.length) return null;

    if (me.team === TEAM.REBEL) {
      var dict = SD.dictator(G);
      /* The win the Rebels are actually playing for. */
      if (G.seize >= SD.DICTATOR_DEPUTY_WIN_AT && mind.known[dict.id] &&
          pool.indexOf(dict.id) !== -1) {
        return dict.id;
      }
      /* Early on, a Rebel Speaker wants a team-mate they can pass Seizes with —
       * but not so obviously that the square reads the pairing. */
      var mates = pool.filter(function (id) { return isTeammate(mind, G, id); });
      if (mates.length && (G.seize < 3 || G.rng() < 0.6)) {
        return rank(mind, G, mates)[0];
      }
      /* Otherwise pick a clean-looking Loyalist to launder the government. */
      return rank(mind, G, pool)[0];
    }

    /* Loyalist and an out-of-the-loop Dictator both nominate who reads cleanest. */
    var ordered = rank(mind, G, pool);
    if (ordered.length > 1 && G.rng() < 0.2) return ordered[1];
    return ordered[0];
  }

  /** Aye or Nay on the government on the floor. */
  function chooseVote(G, minds, botId) {
    var mind = minds[botId];
    var me = G.players[botId];
    var sId = G.speaker, nId = G.nominee;

    if (me.team === TEAM.REBEL) {
      var dict = SD.dictator(G);
      /* Seat the Dictator and win outright. */
      if (G.seize >= SD.DICTATOR_DEPUTY_WIN_AT && nId === dict.id) return true;
      /* Never seat the Dictator early — an unlucky Purge ends the game. */
      var friendly = isTeammate(mind, G, sId) || sId === botId;
      var friendlyDep = isTeammate(mind, G, nId) || nId === botId;
      if (friendly && friendlyDep) return true;
      if (friendly || friendlyDep) return G.rng() < 0.8;
      /* Two Loyalists with Reform on the board: let it through sometimes so the
       * Rebels do not read as a bloc, but stall when Reform is close. */
      if (G.reform >= 3) return G.rng() < 0.2;
      /* Chaos is good for the Rebels — the deck is mostly Seize. */
      if (G.chaos === SD.CHAOS_LIMIT - 1) return G.rng() < 0.3;
      return G.rng() < 0.45;
    }

    var sSus = suspicion(mind, G, sId);
    var nSus = suspicion(mind, G, nId);
    if (nSus >= 100 || sSus >= 100) return false;      // confirmed Rebel, never
    if (nSus <= -100 && sSus <= -100) return true;     // both confirmed clean

    /* With three Seize down, seating an unknown is how the Rebels win. */
    var caution = G.seize >= SD.DICTATOR_DEPUTY_WIN_AT ? 1.6 : 0;
    var score = -(sSus * 1.0 + nSus * 1.3) - caution;

    /* Nobody wants a third failed election unless the pair looks poisonous. */
    if (G.chaos === SD.CHAOS_LIMIT - 1) score += 2.2;
    /* A Speaker naming themselves a friend they just governed with is fine. */
    if (sId === botId || nId === botId) score += 1.5;

    return score + (G.rng() - 0.5) > 0;
  }

  /** Speaker throws one of three away. */
  function chooseSpeakerDiscard(G, minds, botId) {
    var me = G.players[botId];
    var hand = G.hand;
    var idxOf = function (t) { return hand.indexOf(t); };
    var reformIdx = idxOf(TILE.REFORM), seizeIdx = idxOf(TILE.SEIZE);
    var reforms = hand.filter(function (t) { return t === TILE.REFORM; }).length;

    if (me.team === TEAM.LOYALIST) {
      return seizeIdx !== -1 ? seizeIdx : 0;
    }

    /* Rebel or Dictator. One Reform from a Rebel Speaker sometimes buys cover,
     * but never when the board is one Seize from the win. */
    if (G.seize === SD.SEIZE_TO_WIN - 1 && seizeIdx !== -1) {
      return reformIdx !== -1 ? reformIdx : 0;
    }
    if (reforms === 3) return 0;                 // forced: all Reform
    if (reformIdx !== -1) {
      /* Keep two Seizes if we can, so the Deputy has no choice at all. */
      if (reforms === 1) return reformIdx;
      /* Two Reforms and a Seize: passing a Reform up is decent cover early. */
      if (G.seize < 3 && G.rng() < 0.3) return seizeIdx;
      return reformIdx;
    }
    return 0;
  }

  /** Deputy throws one of two away and enacts the last. */
  function chooseDeputyDiscard(G, minds, botId) {
    var me = G.players[botId];
    var hand = G.deputyHand;
    var reformIdx = hand.indexOf(TILE.REFORM);
    var seizeIdx = hand.indexOf(TILE.SEIZE);

    if (me.team === TEAM.LOYALIST) {
      return seizeIdx !== -1 ? seizeIdx : 0;
    }
    if (G.reform === SD.REFORM_TO_WIN - 1 && reformIdx !== -1) return reformIdx;
    if (reformIdx !== -1 && seizeIdx !== -1) {
      /* Almost always take the Seize; occasionally pass a Reform for cover. */
      return G.seize < 3 && G.rng() < 0.2 ? seizeIdx : reformIdx;
    }
    return 0;
  }

  /** Deputy decides whether to move to Block. */
  function chooseProposeBlock(G, minds, botId) {
    if (!SD.canProposeBlock(G)) return false;
    var me = G.players[botId];
    var hand = G.deputyHand;
    var allSeize = hand.every(function (t) { return t === TILE.SEIZE; });
    if (me.team === TEAM.LOYALIST) {
      /* Blocking is the only way out of two Seizes at 5–x. */
      return allSeize;
    }
    /* A Rebel Deputy blocks only to deny a forced Reform. */
    return hand.every(function (t) { return t === TILE.REFORM; });
  }

  /** Speaker answers the Block. */
  function chooseRespondBlock(G, minds, botId) {
    var me = G.players[botId];
    if (me.team === TEAM.LOYALIST) return true;
    /* A Rebel Speaker refuses if refusing forces a Seize through. */
    var hand = G.deputyHand;
    if (hand.every(function (t) { return t === TILE.SEIZE; })) return false;
    return true;
  }

  /** Aim a power. */
  function choosePowerTarget(G, minds, botId) {
    var mind = minds[botId];
    var me = G.players[botId];
    var pool = SD.powerTargets(G).map(function (p) { return p.id; });
    if (!pool.length) return null;
    var kind = G.pendingPower.kind;

    if (me.team === TEAM.REBEL) {
      var dict = SD.dictator(G);
      if (kind === 'purge') {
        /* Never purge the Dictator; take out whoever the square trusts most. */
        var safe = pool.filter(function (id) { return id !== dict.id && !isTeammate(mind, G, id); });
        if (!safe.length) safe = pool.filter(function (id) { return id !== dict.id; });
        if (!safe.length) safe = pool;
        return rank(mind, G, safe)[safe.length - 1] != null
          ? rank(mind, G, safe)[0]        // lowest suspicion = most trusted Loyalist
          : safe[0];
      }
      if (kind === 'emergency') {
        var mates = pool.filter(function (id) { return isTeammate(mind, G, id); });
        if (G.seize >= SD.DICTATOR_DEPUTY_WIN_AT && pool.indexOf(dict.id) !== -1 && me.id !== dict.id) {
          /* Hand the gavel to a team-mate who can then seat the Dictator. */
          if (mates.length) return mates[0];
        }
        return mates.length ? mates[0] : pool[0];
      }
      if (kind === 'peek') {
        var unknown = pool.filter(function (id) { return !isTeammate(mind, G, id); });
        return (unknown.length ? unknown : pool)[0];
      }
      return pool[0];
    }

    /* Loyalist / uninformed Dictator. */
    var ordered = rank(mind, G, pool);
    if (kind === 'purge' || kind === 'peek') return ordered[ordered.length - 1]; // most suspicious
    if (kind === 'emergency') return ordered[0];                                 // most trusted
    return ordered[0];
  }

  /* ------------------------------------------------------------------- chat */

  var LINES = {
    nomination: [
      '{speaker} with the gavel again. watch what comes out of it.',
      'fine. {nominee} has been quiet enough to be useful.',
      'who else is left that isn’t term-limited?',
      '{nominee}? after last session? really.',
      'i’ll hear it. talk first, {nominee}.'
    ],
    voteOpen: [
      'seal it and stop talking.',
      'count the board before you vote.',
      'nay from me and i’ll say why after.',
      'one more seize and they take the Republic.',
      'i want {nominee} on record first.'
    ],
    seizeEnacted: [
      'that pair passed a seize. remember it.',
      'i was handed two seizes. count the deck.',
      '{speaker} drew three and this is what we get?',
      'so one of those two is lying. probably both.',
      'the deck is thick with seize. that proves nothing.'
    ],
    reformEnacted: [
      'good. that’s one back.',
      'a reform. doesn’t clear either of them.',
      'they had to pass it, the draw forced it.',
      'i’ll take it. keep them paired.'
    ],
    voteFailed: [
      'that’s the track climbing and nobody cares.',
      'stall again and chaos picks for us.',
      'who voted aye on that? i want names.',
      'the gavel moves. next.'
    ],
    chaos: [
      'nobody drew it. nobody chose it. wonderful.',
      'that one is on all of us.',
      'term limits are gone. pick better this time.'
    ],
    purge: [
      'well. that settles nothing.',
      '{target} is gone and we still don’t know.',
      'that was a loyalist and you know it.',
      'if that was the dictator we’d be done.'
    ],
    danger: [
      'one more and they take the Republic.',
      'we are one tile from losing this.',
      'stop seating strangers. count the board.'
    ]
  };

  function pick(G, arr) {
    return arr[Math.floor(G.rng() * arr.length)];
  }

  function fill(text, ctx) {
    var out = text.replace(/\{(\w+)\}/g, function (_, k) { return ctx[k] == null ? '' : ctx[k]; });
    /* A line whose name slot was empty reads as "talk first, ." — tidy the
       leftover punctuation rather than shipping the seam. */
    return out.replace(/[,:]\s*([.?!])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Produce 0–2 lines of square chatter for the given beat.
   * Returns [{ playerId, text }].
   */
  function chatter(G, minds, beat, ctx) {
    var bank = LINES[beat];
    if (!bank) return [];
    var speakers = SD.alivePlayers(G).filter(function (p) { return !p.isHuman; });
    if (!speakers.length) return [];

    var n = G.rng() < 0.45 ? 2 : 1;
    var out = [];
    var used = {};
    var saidLines = {};
    for (var i = 0; i < n && i < speakers.length; i++) {
      var p;
      var guard = 0;
      do { p = speakers[Math.floor(G.rng() * speakers.length)]; guard++; }
      while (used[p.id] && guard < 12);
      if (used[p.id]) break;
      used[p.id] = true;

      var pool = bank;
      /* Somebody who is genuinely one tile from losing says so. */
      if (beat === 'seizeEnacted' && G.seize === SD.SEIZE_TO_WIN - 1 && G.rng() < 0.6) {
        pool = LINES.danger;
      }
      /* Two citizens must not say the same sentence in the same breath. */
      var text, tries = 0;
      do { text = fill(pick(G, pool), ctx || {}); tries++; }
      while (saidLines[text] && tries < 8);
      if (saidLines[text]) continue;
      saidLines[text] = true;
      out.push({ playerId: p.id, text: text });
    }
    return out;
  }

  return {
    create: create,
    observeEnact: observeEnact,
    observeVote: observeVote,
    observePeek: observePeek,
    observePurge: observePurge,
    suspicion: suspicion,
    reads: reads,
    chooseNominee: chooseNominee,
    chooseVote: chooseVote,
    chooseSpeakerDiscard: chooseSpeakerDiscard,
    chooseDeputyDiscard: chooseDeputyDiscard,
    chooseProposeBlock: chooseProposeBlock,
    chooseRespondBlock: chooseRespondBlock,
    choosePowerTarget: choosePowerTarget,
    chatter: chatter
  };
});
