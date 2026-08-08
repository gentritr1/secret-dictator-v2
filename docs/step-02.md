# Step 02 — the first 3D artifact: a playground the engine drives

A three.js scene where a complete bot-vs-bot match plays out: one capsule per
citizen on a flat floor, a gavel ring on the Speaker, ballots flashed over each
head, the two tracks in the middle, and a debug overlay with the live engine
state and a scrolling event log. No human player, no town, no audio — this step
exists to make one thing visible and testable: **the engine owns the truth and
the scene is a function of it.**

```
npm run dev      # http://localhost:5173
npm run parity   # proves the shared driver still plays the tested game
```

## The UMD/ESM problem, and the shim

`engine.js` and `ai.js` are held byte-identical to v1 — that is what lets v1's
self-test go on proving them. They are UMD, and their entire module system is a
ternary evaluated at load time:

```js
// engine.js
if (typeof module === 'object' && module.exports) module.exports = api;
else root.SD = Object.assign(root.SD || {}, api);

// ai.js
var api = factory(typeof module === 'object' && module.exports ? require('./engine.js') : root.SD);
```

Under Node the first branch runs. In a browser there is no `module`, so each
file hangs itself off the global object instead: `self.SD`, `self.SDAI`. A
bundler cannot see those as exports — `import { SD } from './engine.js'` yields
nothing, because there is no `export` anywhere in the file.

Rewriting them into ESM was never an option; that is the one thing this project
has decided not to do. So `src/engine/index.js` is a shim: it imports the three
UMD files for their side effects, then re-exports the globals they installed.

```js
import * as engineModule from './engine.js';
import * as aiModule from './ai.js';
import * as driverModule from './driver.js';

export const SD = g.SD || engineModule.default || engineModule;
export const AI = g.SDAI || aiModule.default || aiModule;
export const Driver = g.SDDriver || driverModule.default || driverModule;
```

Three details make it work rather than nearly work:

- **Import order is load-bearing.** `ai.js` reads `root.SD` *while it is being
  evaluated*, not later — its UMD head calls the factory immediately. So
  `engine.js` must have run first. ESM evaluates imports top-to-bottom in source
  order, which is exactly the guarantee needed, but it also means reordering
  those three lines silently breaks the app.
- **Namespace imports, not bare `import './engine.js'`.** The exported constants
  reference `engineModule.default`, so the import is provably used and cannot be
  tree-shaken away in a production build. A bare side-effect import is a bet on
  the bundler's side-effect heuristics.
- **The `.default` fallbacks are for the CommonJS-interop case.** If a bundler
  ever decides these files are CommonJS it will define `module`, the UMD head
  will take the Node branch, and the API arrives as a default export instead of
  a global. Both paths land on the same object, so the shim does not care which
  happened. (With Vite 8 and the default `commonjsOptions`, source files are not
  transformed and the global path is the one taken — verified by the app
  running at all.)
- **Node must never load `index.js`.** `package.json` is `"type": "commonjs"`,
  so this ESM `.js` would be a syntax error under `require`. Node code requires
  the UMD files by exact path and never the directory.

`vite.config.mjs` has the same `.mjs` reasoning: a bare `vite.config.js` would
be parsed as CommonJS and `export default` would throw.

## Why the driver is shared, not copied

The engine's randomness is a single seeded stream, and the bots draw from that
same stream. A seed therefore fixes a match only if the *sequence of calls into
the engine and the AI* is fixed too. Step 1 already had two hand-copied drivers
(`test/engine.test.js` and `scripts/simulate.js`) kept in step by discipline
alone. The 3D app would have been a third copy — and the one most likely to
drift, since it is the one under pressure to insert a call for a nice animation.

So `src/engine/driver.js` is that sequence, extracted:

- `step(G, minds)` advances the game by exactly **one** action and returns a
  plain, JSON-serialisable event. Its phase switch is a transcription of the
  test's, hook for hook.
- It renders nothing, touches no DOM, sets no timer.
- Building the event only *reads* state. It adds no call into the AI that the
  test does not make. In particular `AI.chatter` is still not called: it draws
  from the stream, and wiring it in would shift every later draw.

The proof is `scripts/driver-parity.js`, which replays the test's exact 50
seed/player-count pairs through the driver:

```
$ node scripts/driver-parity.js
games             50 (5–10 players, cycled)
avg steps/game    59.9
wins              { loyalist: 29, rebel: 21 }
ending            { reform: 21, seize: 7, purged: 8, deputy: 14 }
chaos enactments  40 | blocks carried 2 | emergency votes 44

PARITY OK — driver.js reproduces the self-test baseline exactly.
```

Every number matches `npm test` — the same wins, the same four endings, the same
59.9 average, and the same 40/2/44 sanity counters. Those numbers are a
fingerprint of one exact call order; reproducing them is what says the driver
plays *the game that is tested*, not merely a game. The script exits non-zero on
any drift, and it says in its own failure message: fix the driver, never the
engine.

One bug this shook out immediately: the driver's first draft reported the
elected Deputy as `G.lastVote.deputy`, which does not exist — the engine records
`nominee` there, because a nominee only becomes Deputy if the vote carries. The
log read "Gita and null take office" until it was corrected. Worth noting that
the parity numbers did *not* catch this: the event payload is not part of the
fingerprint. Only reading the running screen did.

## State → presentation

The whole data flow is one-way:

```
engine (truth) → driver.step → event → scene.apply / overlay
```

- **The engine owns truth.** `G` is the only state. Nothing under `src/app`
  writes to it.
- **The scene is a pure function of `G` plus the last event.**
  `Playground.apply(G, ev)` reads fields and pushes them into materials,
  positions and labels. Per-*state* things come from `G` — who holds the gavel,
  who is nominated, who is dead, how many tiles are on each track. Per-*event*
  things come from `ev` and are cleared by the next step — the AYE/NAY badges
  over each head, the PURGE/PEEK flash on a power target. That split is why the
  scene never has to remember anything: any state can be redrawn from `G`, and
  anything that cannot be is by definition a flash, not a state.
- **No presentation code draws from the seeded stream.** The check is a grep for
  a call to that generator across `src/app/`; it must find nothing, including in
  comments. One stray draw from the UI would desynchronise every later decision
  from the same seed — the failure would look like "the same seed plays
  differently in the browser than in the test", which is a miserable thing to
  debug after the fact and a trivial thing to prevent with a grep.

Name labels are `CSS2DRenderer` objects rather than sprites: they are ordinary
DOM nodes, so they stay crisp at any zoom, cost no texture memory, and are
styled in `style.css` instead of being redrawn into a canvas whenever a name or
a badge changes. The trade is that they do not occlude behind geometry — for a
debug tool, always-readable is the better failure mode.

## Two loops, on purpose

| loop | where | rate | job |
| --- | --- | --- | --- |
| render | `main.js`, `requestAnimationFrame` | display refresh | draw the current state |
| match | `match.js`, `setTimeout` chain | `850ms / speed` | one `driver.step` per tick |

They are deliberately not the same loop. If steps were taken per frame, the
frame rate would become an input to the game: a slow machine, a background tab
or a 120 Hz display would reach a different point in the match at the same wall
clock, and "the same seed plays the same match" would quietly become "the same
seed on the same hardware". Keeping them apart is what makes *the timer decides
when, never what* true rather than aspirational.

The render loop is allowed exactly one thing that moves on its own — a slow
pulse on lit rings, so it is obvious the app is alive while paused. It reads the
clock; it does not touch the game.

`Match.runToEnd()` is the same steps with the waiting removed. That it produces
an identical log to a timed playthrough is the cleanest statement of the
separation, and it is checked (below).

## What was verified, and how

Node v20.19.4, macOS. Browser checks were run against `npm run dev` on
`localhost:5173` in a real Chromium tab, driving the app through
`window.__sd` / `window.__eventLog` and reading back results.

**The ports are still identical to v1 — `engine.js` yes, `ai.js` no longer.**
`diff` of `src/engine/engine.js` against `../secret-dictator/js/engine.js` is
empty. `ai.js` is **not** empty any more, and this step did not cause it: v1's
`js/ai.js` was edited on disk at 21:06 on 2026-08-08, ten minutes after the
Step 1 port was committed, and v2's copy has not changed since (`git diff` on it
is empty). The drift is 19 diff lines, all inside `fill()` and `chatter()` —
duplicate-line suppression and punctuation tidying in the bot small talk.
`fill` and `pick` are called from nowhere but `chatter`, and `chatter` is called
by neither the test, the simulator, the driver nor the app. So it cannot affect
a rule, a seed or a number. It is recorded here rather than fixed, because
"make v2 match v1" and "make v1 match v2" are different decisions and neither is
this step's to take.

**The engine is untouched and still passes:**

```
$ npm test
games             50 (5–10 players, cycled)
assertions        28875
avg steps/game    59.9
wins              { loyalist: 29, rebel: 21 }
ending            { reform: 21, seize: 7, purged: 8, deputy: 14 }
OK — 28881 assertions passed.
```

Identical to the Step 1 baseline.

**The browser plays the same match as Node.** This is the check that actually
matters, and it is stronger than "the same seed twice in the browser". For four
seed/roster pairs, the driver's full event log was serialised and hashed in Node
and again in the browser:

| seed | citizens | steps | winner | SHA-256 (first 16) |
| --- | --- | --- | --- | --- |
| 1000 | 7 | 73 | loyalist | `e711e4168b6c30e5` |
| 2024 | 5 | 52 | loyalist | `9241552168a1bcf3` |
| 31337 | 10 | 64 | loyalist | `1717017d76607949` |
| 42 | 9 | 43 | rebel | `8bc9be5578981f16` |

All four hashes matched between Node and the browser, byte for byte. Since the
Node side of that comparison is the same `driver.js` the parity script proves
against the test, the chain closes: browser log = Node log = tested game.

**Same seed twice in the browser is identical; a different seed is not.**
Restarting with seed 1000 at seven citizens and running to the end twice
produced the same 73 events and the same 31 365-character JSON; seed 2024 at the
same roster size produced 66 steps and a 28 598-character log that differs.
(A determinism check that only ever compares equal things proves
nothing — the negative control is the half that makes it a test.)

**Pace does not change the match.** Seed 42, nine citizens, run two ways: pure
fast-forward, and then a second time where the real `setTimeout` loop took the
first 10 steps at 4× before fast-forwarding the remaining 33. Both logs hashed
to `8bc9be5578981f16` — the same value Node produced. Timing shifted; the game
did not.

**A match completes visually.** Observed in the browser, not inferred: seed 1000
with seven citizens plays to `game_over` with the Loyalist banner and the fifth
Reform tile lit; seed 31337 with ten citizens shows Dara toppled and greyed with
a struck-through name label and a PURGE flash after `Alice purges Dara`, the
Speaker ringed in amber, and the tracks reading 3 Reform / 4 Seize in both the
scene and the overlay. Mid-vote, all seven ballots appear as green AYE / red NAY
badges matching the event payload, with the nominee ringed in cyan.

**No randomness in the presentation layer.** A grep for a call to the seeded
generator across `src/app/` returns nothing; so does a grep for `Math.random`.

## Notes for later steps

- The event payload is *not* covered by the parity fingerprint. Parity proves
  the call order; it says nothing about whether `ev.detail` is right. The `null`
  Deputy bug proves the gap is real. Any future step that starts *reading* event
  detail (rather than just printing it) needs its own check.
- `AI.chatter` is still unused and still un-callable without shifting the stream.
  When speech bubbles arrive, that is a deliberate re-baselining of every number
  in this document, not a small addition. Budget for it.
- The camera re-frames itself on every restart, which is right for a debug tool
  and will be wrong the moment there is a player character.
- Labels are DOM nodes and do not occlude. Fine now; a town with buildings will
  make names visible through walls, which will need solving.
- `dist/` is a real build target now (`npm run build` succeeds, ~589 kB, mostly
  three.js). Nothing is deployed anywhere.
