/*
 * Driver parity proof.
 *
 * test/engine.test.js is the correctness oracle, and its numbers are a
 * fingerprint of one exact sequence of calls into the engine and the AI: the
 * bots draw from the same seeded stream as the deck, so any driver that calls
 * the hooks in a different order plays a different game from the same seed.
 *
 * src/engine/driver.js is that same sequence, factored out so the browser
 * playground can share it. This script replays the test's exact 50
 * seed/player-count pairs through the driver and prints the same summary. The
 * numbers must be identical to the test's:
 *
 *   wins            { loyalist: 29, rebel: 21 }
 *   ending          { reform: 21, seize: 7, purged: 8, deputy: 14 }
 *   avg steps/game  59.9
 *
 * A mismatch means the driver's call order drifted from the test's. Fix the
 * driver — never the engine.
 *
 *   node scripts/driver-parity.js [games]
 */
'use strict';

var SD = require('../src/engine/engine.js');
var AI = require('../src/engine/ai.js');
var Driver = require('../src/engine/driver.js');

/* Same roster, same seeds, same player-count cycle as the test. */
var NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
var GAMES = parseInt(process.argv[2], 10) || 50;

var EXPECTED = {
  wins: { loyalist: 29, rebel: 21 },
  ending: { reform: 21, seize: 7, purged: 8, deputy: 14 },
  avgSteps: '59.9'
};

var wins = { loyalist: 0, rebel: 0 };
var reasons = { reform: 0, seize: 0, purged: 0, deputy: 0 };
var totalSteps = 0;
var chaosSeen = 0, blockSeen = 0, emergencySeen = 0;
var problems = [];

for (var i = 0; i < GAMES; i++) {
  var count = 5 + (i % 6);
  var seed = 1000 + i * 7919;
  var G = SD.createGame({ names: NAMES.slice(0, count), humanIndex: -1, seed: seed });
  var minds = AI.create(G);

  var run = Driver.playOut(G, minds);
  totalSteps += run.steps;

  if (run.stuck) problems.push('seed ' + seed + ' (' + count + 'p): did not terminate');
  if (!G.winner) problems.push('seed ' + seed + ' (' + count + 'p): no winner');
  else wins[G.winner]++;
  reasons[Driver.endingOf(G)]++;

  /* Same log scan the test uses, so the sanity counters are comparable too. */
  G.log.forEach(function (e) {
    if (/Chaos takes the deck/.test(e.text)) chaosSeen++;
    if (/Block carries/.test(e.text)) blockSeen++;
    if (e.kind === 'power' && e.meta && e.meta.power === 'emergency') emergencySeen++;
  });

  /* The driver's own event stream must account for every step it took. */
  if (run.events.length !== run.steps) {
    problems.push('seed ' + seed + ': ' + run.events.length + ' events for ' + run.steps + ' steps');
  }
  try {
    JSON.stringify(run.events);
  } catch (err) {
    problems.push('seed ' + seed + ': events are not serialisable — ' + err.message);
  }
}

var avgSteps = (totalSteps / GAMES).toFixed(1);

console.log('games            ', GAMES, '(5–10 players, cycled)');
console.log('avg steps/game   ', avgSteps);
console.log('wins             ', wins);
console.log('ending           ', reasons);
console.log('chaos enactments ', chaosSeen, '| blocks carried', blockSeen, '| emergency votes', emergencySeen);

if (GAMES !== 50) {
  console.log('\n(parity baseline is defined for 50 games only — skipping the comparison)');
  process.exit(problems.length ? 1 : 0);
}

function same(got, want) {
  return Object.keys(want).every(function (k) { return got[k] === want[k]; });
}

var mismatches = [];
if (!same(wins, EXPECTED.wins)) mismatches.push('wins ' + JSON.stringify(wins) + ' ≠ ' + JSON.stringify(EXPECTED.wins));
if (!same(reasons, EXPECTED.ending)) mismatches.push('ending ' + JSON.stringify(reasons) + ' ≠ ' + JSON.stringify(EXPECTED.ending));
if (avgSteps !== EXPECTED.avgSteps) mismatches.push('avg steps ' + avgSteps + ' ≠ ' + EXPECTED.avgSteps);

if (mismatches.length || problems.length) {
  console.error('\nPARITY FAILED:');
  mismatches.forEach(function (m) { console.error('  ' + m); });
  problems.slice(0, 10).forEach(function (p) { console.error('  ' + p); });
  console.error('\nThe driver is calling the engine/AI hooks in a different order than');
  console.error('test/engine.test.js. Fix src/engine/driver.js.');
  process.exit(1);
}

console.log('\nPARITY OK — driver.js reproduces the self-test baseline exactly.');
