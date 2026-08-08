/*
 * Headless batch simulator: plays complete bot-vs-bot games and reports
 * statistics. This is the sibling of test/engine.test.js — same driver, but it
 * gathers numbers instead of asserting rules. Use the test to know the engine
 * is correct; use this to know how the game actually plays out.
 *
 *   node scripts/simulate.js [--games N] [--seed S]
 *
 * Deterministic by construction: every game's seed is derived from --seed, the
 * engine's randomness is the seeded RNG in engine.js, and nothing here reads
 * Math.random or the clock. The same arguments always print the same bytes.
 */
'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');

var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];

var MIN_PLAYERS = 5;
var MAX_PLAYERS = 10;
var STEP_LIMIT = 4000;
/* Same stride the self-test uses, so seeds spread across the RNG's state. */
var SEED_STRIDE = 7919;

/* ------------------------------------------------------------------- args */

function parseArgs(argv) {
  var opts = { games: 500, seed: 1000 };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    var m = /^--(games|seed)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error('unknown argument: ' + a);
    var raw = m[2] != null ? m[2] : argv[++i];
    var val = parseInt(raw, 10);
    if (!isFinite(val)) throw new Error('--' + m[1] + ' needs a number, got: ' + raw);
    opts[m[1]] = val;
  }
  if (opts.games < 1) throw new Error('--games must be at least 1');
  return opts;
}

/* ----------------------------------------------------------------- driver */

/*
 * Drives one complete game exactly the way test/engine.test.js drives it:
 * the same phase switch, the same AI hooks in the same order. Only the
 * assertions are gone. Keeping the two in step matters — a simulator that
 * drove the engine differently would be reporting on a game nobody tests.
 */
function playGame(seed, playerCount) {
  var names = NAMES.slice(0, playerCount);
  var G = SD.createGame({ names: names, humanIndex: -1, seed: seed });
  var minds = AI.create(G);
  var steps = 0;

  while (G.phase !== SD.PHASE.GAME_OVER && steps < STEP_LIMIT) {
    steps++;

    switch (G.phase) {
      case SD.PHASE.NOMINATION: {
        SD.nominate(G, AI.chooseNominee(G, minds, G.speaker));
        break;
      }
      case SD.PHASE.VOTE: {
        SD.alivePlayers(G).forEach(function (p) {
          SD.castVote(G, p.id, AI.chooseVote(G, minds, p.id));
        });
        SD.resolveVote(G);
        break;
      }
      case SD.PHASE.VOTE_RESULT: {
        AI.observeVote(minds, G, G.lastVote);
        SD.afterVote(G);
        break;
      }
      case SD.PHASE.LEGISLATIVE_SPEAKER: {
        SD.speakerDiscard(G, AI.chooseSpeakerDiscard(G, minds, G.speaker));
        break;
      }
      case SD.PHASE.LEGISLATIVE_DEPUTY: {
        if (AI.chooseProposeBlock(G, minds, G.deputy)) {
          SD.proposeBlock(G);
          break;
        }
        var gov = { speaker: G.speaker, deputy: G.deputy, aye: G.lastVote.aye };
        SD.deputyDiscard(G, AI.chooseDeputyDiscard(G, minds, G.deputy));
        AI.observeEnact(minds, G, {
          speaker: gov.speaker, deputy: gov.deputy,
          tile: G.lastEnacted.tile, byChaos: false, aye: gov.aye
        });
        break;
      }
      case SD.PHASE.BLOCK_RESPONSE: {
        SD.respondBlock(G, AI.chooseRespondBlock(G, minds, G.speaker));
        break;
      }
      case SD.PHASE.CHAOS: {
        SD.resolveChaos(G);
        break;
      }
      case SD.PHASE.POWER: {
        var pp = G.pendingPower;
        if (pp.kind === 'foresight') {
          SD.usePower(G, null);
        } else {
          var tId = AI.choosePowerTarget(G, minds, pp.holder);
          SD.usePower(G, tId);
          if (pp.kind === 'purge') AI.observePurge(minds, G, pp.holder, tId);
          if (pp.kind === 'peek') AI.observePeek(minds, G, pp.holder, tId, pp.result.team);
        }
        if (G.phase === SD.PHASE.POWER) SD.finishPower(G);
        break;
      }
      default:
        return { G: G, steps: steps, stuck: true };
    }
  }

  return { G: G, steps: steps, stuck: steps >= STEP_LIMIT };
}

/** Which of the four documented endings closed this game. */
function endingOf(G) {
  if (G.reform >= SD.REFORM_TO_WIN) return 'reform';
  if (G.seize >= SD.SEIZE_TO_WIN) return 'seize';
  if (!SD.dictator(G).alive) return 'purged';
  return 'deputy';
}

/* ------------------------------------------------------------------ tally */

function newTally() {
  return {
    games: 0,
    wins: { loyalist: 0, rebel: 0 },
    endings: { reform: 0, seize: 0, purged: 0, deputy: 0 },
    steps: 0,
    days: 0,
    chaosEnactments: 0,
    blocksCarried: 0,
    emergencyVotes: 0,
    purges: 0
  };
}

function record(tally, G, steps) {
  tally.games++;
  if (G.winner) tally.wins[G.winner]++;
  tally.endings[endingOf(G)]++;
  tally.steps += steps;
  tally.days += G.day;
  G.log.forEach(function (e) {
    if (/Chaos takes the deck/.test(e.text)) tally.chaosEnactments++;
    if (/Block carries/.test(e.text)) tally.blocksCarried++;
    if (e.kind === 'power' && e.meta) {
      if (e.meta.power === 'emergency') tally.emergencyVotes++;
      if (e.meta.power === 'purge') tally.purges++;
    }
  });
}

/* --------------------------------------------------------------- printing */

function pad(s, w) {
  s = String(s);
  while (s.length < w) s = ' ' + s;
  return s;
}

function padRight(s, w) {
  s = String(s);
  while (s.length < w) s += ' ';
  return s;
}

function pct(n, total) {
  return total ? (100 * n / total).toFixed(1) + '%' : '—';
}

function printSummary(opts, overall, byCount, errors) {
  console.log('Secret Dictator — batch simulation');
  console.log('games ' + opts.games + '  seed ' + opts.seed +
    '  players ' + MIN_PLAYERS + '–' + MAX_PLAYERS + ' (cycled)');
  console.log('');

  console.log('wins');
  console.log('  loyalist  ' + pad(overall.wins.loyalist, 6) + '  ' + pct(overall.wins.loyalist, overall.games));
  console.log('  rebel     ' + pad(overall.wins.rebel, 6) + '  ' + pct(overall.wins.rebel, overall.games));
  console.log('');

  console.log('endings');
  ['reform', 'seize', 'purged', 'deputy'].forEach(function (k) {
    console.log('  ' + padRight(k, 9) + ' ' + pad(overall.endings[k], 6) + '  ' + pct(overall.endings[k], overall.games));
  });
  console.log('');

  console.log('averages per game');
  console.log('  steps     ' + pad((overall.steps / overall.games).toFixed(2), 8));
  console.log('  rounds    ' + pad((overall.days / overall.games).toFixed(2), 8));
  console.log('  chaos enactments ' + pad((overall.chaosEnactments / overall.games).toFixed(2), 6));
  console.log('  blocks carried   ' + pad((overall.blocksCarried / overall.games).toFixed(2), 6));
  console.log('  emergency votes  ' + pad((overall.emergencyVotes / overall.games).toFixed(2), 6));
  console.log('  purges           ' + pad((overall.purges / overall.games).toFixed(2), 6));
  console.log('');

  console.log('by player count');
  console.log('  players  games   loy   reb  reform seize purged deputy   steps  rounds');
  for (var n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    var t = byCount[n];
    if (!t || !t.games) continue;
    console.log('  ' + pad(n, 7) + pad(t.games, 7) + pad(t.wins.loyalist, 6) + pad(t.wins.rebel, 6) +
      pad(t.endings.reform, 8) + pad(t.endings.seize, 6) + pad(t.endings.purged, 7) + pad(t.endings.deputy, 7) +
      pad((t.steps / t.games).toFixed(1), 8) + pad((t.days / t.games).toFixed(1), 8));
  }
  console.log('');

  if (errors.length) {
    console.log('errors ' + errors.length);
    errors.slice(0, 10).forEach(function (e) {
      console.log('  seed ' + e.seed + ' (' + e.players + 'p): ' + e.message);
    });
  } else {
    console.log('errors 0');
  }
}

/* ------------------------------------------------------------------- main */

function main() {
  var opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('usage: node scripts/simulate.js [--games N] [--seed S]');
    process.exit(2);
    return;
  }

  var overall = newTally();
  var byCount = {};
  var errors = [];

  for (var i = 0; i < opts.games; i++) {
    var count = MIN_PLAYERS + (i % (MAX_PLAYERS - MIN_PLAYERS + 1));
    /* >>> 0 keeps the seed a uint32, the shape makeRng() expects. */
    var seed = (opts.seed + i * SEED_STRIDE) >>> 0;
    if (!byCount[count]) byCount[count] = newTally();

    var res;
    try {
      res = playGame(seed, count);
    } catch (err) {
      errors.push({ seed: seed, players: count, message: err.message });
      continue;
    }
    if (res.stuck || !res.G.winner) {
      errors.push({
        seed: seed, players: count,
        message: res.stuck ? 'did not terminate within ' + STEP_LIMIT + ' steps'
                           : 'ended with no winner in phase ' + res.G.phase
      });
      continue;
    }
    record(overall, res.G, res.steps);
    record(byCount[count], res.G, res.steps);
  }

  if (!overall.games) {
    console.error('no games completed');
    process.exit(1);
    return;
  }

  printSummary(opts, overall, byCount, errors);
  if (errors.length) process.exit(1);
}

main();
