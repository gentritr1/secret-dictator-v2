# Step 01 — port the v1 engine, prove it headlessly

## What was ported, and why unchanged

Three files came across from `../secret-dictator`:

| from | to | change |
| --- | --- | --- |
| `js/engine.js` | `src/engine/engine.js` | none — `diff` is empty |
| `js/ai.js` | `src/engine/ai.js` | none — `diff` is empty |
| `test/engine.test.js` | `test/engine.test.js` | two `require` paths |

`engine.js` is a closed state machine: it touches no DOM, sets no timers, and
draws no randomness except through its own seeded generator. Its whole surface is
a function table returned from a UMD factory — the UI calls actions and reads
fields off the game object. That is precisely the property that makes a 3D
front-end possible without touching rules, so rewriting it would only risk
losing correctness the v1 self-test already proved.

`ai.js` needed no edit at all. Its factory line is:

```js
factory(typeof module === 'object' && module.exports ? require('./engine.js') : root.SD)
```

`./engine.js` is a sibling reference, and the port kept the two files siblings
(`src/engine/`), so the require resolves as before. Only the test, which reached
up into `../js/`, had to be repointed at `../src/engine/`.

Deliberately not ported: the 2D UI (`index.html`, `style.css`, `support.js`),
assets, and design docs. v2's presentation is a separate build.

## How the seeded determinism works

The mechanism is entirely inside `src/engine/engine.js`.

`makeRng(seed)` returns a closure over a single 32-bit integer `s`, advanced per
call by `s = (s + 0x6d2b79f5) | 0` and mixed with `Math.imul` shifts (a
`mulberry32`-family generator). It has no global state and no entropy source: the
sequence is a pure function of the initial `seed`. A seed of `0` is rewritten to
`0x9e3779b9` so the degenerate state cannot occur.

`createGame(opts)` takes `opts.seed >>> 0`, builds `var rng = makeRng(seed)`, and
stores that closure on the game object as `G.rng`. Every subsequent decision that
needs chance calls `G.rng()` and nothing else:

- `shuffle(arr, rng)` — Fisher–Yates, used by `buildDeck(rng)` for the 6 Reform /
  11 Seize deck, by `dealRoles(count, rng)` for the role assignment, and by
  `ensureDeck(G, needed)` when discards are shuffled back in.
- `randomHallCode(rng)` — the four-letter hall code.
- `G.speaker = Math.floor(rng() * players.length)` — the opening gavel.
- The bots in `ai.js`, which never create a generator of their own; they call
  `G.rng()` (in `chooseNominee`, `chooseVote`, `chooseSpeakerDiscard`,
  `chooseDeputyDiscard`, `pick`, `chatter`) and so consume from the same stream.

Because bot decisions draw from the same stream as the deck, the seed fixes the
entire match, not just the shuffle — but only if the *sequence of calls* is also
fixed. That is why `scripts/simulate.js` copies the test's driver loop rather
than inventing its own: a driver that called the AI hooks in a different order,
or called `AI.chatter` (the test does not), would consume the stream differently
and diverge on identical seeds.

The one non-deterministic path in the engine is the seed default:

```js
var seed = opts.seed == null ? (Math.random() * 0xffffffff) >>> 0 : opts.seed >>> 0;
```

Both the test and the simulator always pass an explicit seed, so this branch is
never taken by either. It is the only `Math.random` in the repo, and there is no
`Date.now`, `performance.now` or `process.hrtime` anywhere in `src/`, `test/` or
`scripts/` (verified by grep).

## What the test asserts

`test/engine.test.js` mixes two things: nine targeted rule tests, and 50 complete
bot-vs-bot games with invariants checked before *every* step.

Per-step invariants (`assertInvariants`):

- `reform` within `0..5`, `seize` within `0..6`.
- Chaos Track within `0..2`, except during `PHASE.CHAOS` where `3` is legal —
  the track is emptied the moment the chaos tile enacts itself.
- At least one player alive; exactly one Dictator.
- The gavel is never held by a dead player (outside `GAME_OVER`).
- Tile conservation (below).

Per-phase assertions inside the driver: nominees are never term-limited, never
the Speaker, never dead; ballots close and a tie never passes; a successful
election clears the Chaos Track, draws exactly three tiles, and moves no track;
a failed election advances the Chaos Track; discard indices are in range; a
Block is never proposed before five Seize; chaos empties the track and lifts both
term limits; every granted power is a known power with a legal target; Foresight
shows exactly three tiles; a Purge removes exactly one player.

Per-game, at the end: the game terminated inside 4000 steps, a winner exists, and
the declared winner matches the board that produced it (five Reform ⇒ Loyalists,
six Seize ⇒ Rebels, dead Dictator ⇒ Loyalists).

Targeted tests: role counts and the Dictator's rebel-knowledge cutoff for all six
player counts; the power ladder; ties failing; the Dictator-as-Deputy win firing
at 3 Seize and *not* at 2; purging the Dictator; chaos lifting term limits; Peek
never repeating on the same citizen; and the Block-once-per-session regression
(a refused Block used to loop forever) including that an accepted Block burns
both tiles and advances the track.

Finally the suite requires that across the 50 games all four documented endings
(`reform`, `seize`, `purged`, `deputy`) actually occurred, plus at least one
chaos enactment and one Emergency Vote — otherwise whole branches of the rules
would be dead code that no assertion ever touched.

### Why tile conservation matters

```js
var inPlay = G.deck.length + G.discard.length + G.hand.length + G.deputyHand.length +
  G.reform + G.seize + (G.chaosTile ? 1 : 0);
check(inPlay === SD.DECK_REFORM + SD.DECK_SEIZE, ...)   // 6 + 11 = 17
```

Every tile is either in the deck, in the discard, in the Speaker's hand of three,
in the Deputy's hand of two, on a track, or held as the pending chaos tile. The
sum must always be 17.

It is the cheapest possible check on the whole legislative pipeline, and it
catches the failures that are otherwise silent: a `splice` that removes the wrong
count, a discard that never gets pushed, a Block that burns one tile instead of
two, a reshuffle in `ensureDeck` that concatenates the discard without clearing
it (which would *duplicate* tiles), or a chaos tile drawn and then dropped. None
of those throw. All of them corrupt the deck's Reform/Seize ratio, which is the
game's central balance lever — a leak here would quietly change every win rate
without ever producing an error. Asserting it before every step means a break is
located at the exact phase that caused it.

## Commands run, and their observed output

Node v20.19.4, macOS (darwin 25.5.0).

**Ports are identical to v1:**

```
$ diff /Users/gentlegen/Desktop/secret-dictator/js/engine.js src/engine/engine.js
$ diff /Users/gentlegen/Desktop/secret-dictator/js/ai.js src/engine/ai.js
```

Both produced no output (exit 0).

**Self-test:**

```
$ npm test
games             50 (5–10 players, cycled)
assertions        28875
avg steps/game    59.9
wins              { loyalist: 29, rebel: 21 }
ending            { reform: 21, seize: 7, purged: 8, deputy: 14 }
chaos enactments  40 | blocks carried 2 | emergency votes 44

OK — 28881 assertions passed.
```

(The two counts differ because the `assertions` line prints before the six
end-of-run "every ending occurred" checks run.)

This is byte-for-byte the same output as `node test/engine.test.js 50` in v1 —
verified by diffing the two runs' stdout. Three consecutive v2 runs all reported
28881; the count is fixed because the game seeds are hardcoded (`1000 + i * 7919`)
and the player count cycles `5 + (i % 6)`, so nothing about the run depends on
the clock or on unseeded randomness.

**Simulator, run twice with the same arguments:**

```
$ npm run simulate -- --seed 42 --games 200
Secret Dictator — batch simulation
games 200  seed 42  players 5–10 (cycled)

wins
  loyalist     133  66.5%
  rebel         67  33.5%

endings
  reform        87  43.5%
  seize         21  10.5%
  purged        46  23.0%
  deputy        46  23.0%

averages per game
  steps        57.59
  rounds       13.10
  chaos enactments   0.81
  blocks carried     0.07
  emergency votes    0.79
  purges             0.64

by player count
  players  games   loy   reb  reform seize purged deputy   steps  rounds
        5     34    23    11      14     1      9     10    51.4    11.4
        6     34    26     8      20     2      6      6    59.6    13.7
        7     33    22    11      11     1     11     10    50.6    11.0
        8     33    25     8      18     3      7      5    67.9    15.9
        9     33    13    20       8    12      5      8    59.0    13.5
       10     33    24     9      16     2      8      7    57.1    13.1

errors 0
```

`diff` of the two runs' stdout was empty: byte-identical. Both factions win
non-trivially (133 / 67) and all four endings occur. A different seed gives
different numbers (`--seed 7 --games 200` → loyalist 125 / rebel 75), confirming
the seed is actually being threaded through rather than ignored.

## Notes for later steps

- The simulator is *not* a rules check. It catches only thrown exceptions,
  non-termination (4000-step cap) and winner-less games. Correctness lives in
  `npm test`; keep both green.
- If a future step drives the engine from 3D presentation code, that driver must
  consume `G.rng()` in the same order as `test/engine.test.js` for a seed to
  reproduce a match. Note that `AI.chatter` also draws from the stream and is
  currently called by neither the test nor the simulator — wiring it into the UI
  will shift every downstream draw.
- Rebel win rate sits around 33–37% across seeds at these AI settings. Recorded
  as an observation, not a target; nobody has decided what it should be.
