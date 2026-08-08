# Secret Dictator v2

Single-player social deduction against AI opponents — Speaker/Deputy elections,
Reform/Seize tiles, the power ladder, the Chaos Track. Five to ten citizens, one
of whom is the Dictator.

v2 rebuilds the *presentation* as a 3D town in three.js. The rules do not change.

## Relationship to v1

v1 lives at `../secret-dictator`: the same game as a 2D web UI, complete and
working. Its rules engine is a pure, seeded, DOM-free state machine, so v2
carries it over unchanged rather than rewriting it:

| v1 | v2 | change |
| --- | --- | --- |
| `js/engine.js` | `src/engine/engine.js` | none (byte-identical) |
| `js/ai.js` | `src/engine/ai.js` | none (byte-identical) |
| `test/engine.test.js` | `test/engine.test.js` | `require` paths only |

Nothing else from v1 is ported. The 2D UI, styles and assets stay in v1.

## Layout

```
src/engine/engine.js     rules engine — pure state machine, seeded RNG, no DOM, no timers
src/engine/ai.js         bot opponents, driving the engine through the same public API a human would
src/engine/driver.js     the shared driver: one action per step(), plus a serialisable event
src/engine/index.js      ESM shim — re-exports the UMD globals for the browser build
src/app/                 the 3D playground: three.js scene, match runner, debug overlay
src/walk/                the movement workbench: capsule controller, obstacle course, follow camera
src/walk/controller.js   the kinematic controller — pure logic, no three.js, no DOM, no clock
index.html               Vite entry point for the playground
walk.html                Vite entry point for the workbench
test/engine.test.js      headless self-test: plays full bot-vs-bot games, asserts the rules at every step
test/controller.test.js  headless movement tests: frame-rate independence, slopes, walls, steps, falls
scripts/driver-parity.js proves driver.js reproduces the self-test's numbers exactly
scripts/simulate.js      headless batch simulator: statistics instead of assertions
docs/step-01.md          learning log for the port
docs/step-02.md          learning log for the playground
docs/step-03.md          learning log for the character controller
```

The three engine modules are UMD (`module.exports` under Node, `window.SD` /
`window.SDAI` / `window.SDDriver` in a browser) and have no dependencies.
`engine.js` and `ai.js` are byte-identical to v1 and must stay that way;
`src/engine/index.js` is the ESM adapter that lets a bundler import them without
editing them.

Everything the presentation reads flows one way — `engine → driver.step → event
→ scene`. No code under `src/app/` writes to the game object or draws from its
seeded random stream, which is what keeps a seed reproducible in the browser.

## Running

```sh
npm install                                # three (runtime) and vite (dev) only

npm run dev                                # http://localhost:5173      the bot playground
                                           # http://localhost:5173/walk.html   the movement workbench
npm run build                              # production bundle into dist/ (both entry points)

npm test                                   # 50 bot-vs-bot games + targeted rule tests
npm run test:controller                    # the character controller, headless
npm run parity                             # driver.js vs the self-test's exact numbers
npm run verify                             # all of the above, plus the production build
npm run simulate                           # 500 games, default seed
npm run simulate -- --seed 42 --games 200  # explicit seed and count
```

`npm test` is a correctness gate: it exits non-zero if any assertion fails.
`npm run parity` is the gate on the shared driver — it replays the test's 50
seeds through `driver.js` and fails unless the wins, endings and average step
count come back identical, which is what proves the browser is playing the game
the test proves. `npm run simulate` is a balance instrument: it asserts nothing
and reports win rates, ending types, and per-player-count breakdowns.

`npm run test:controller` is the gate on movement. It runs the same controller
the browser runs, against a closed-form collision world instead of a mesh, and
checks that a scripted input sequence produces the same trajectory at 1/30 and
1/120, that acceleration and stopping hit their stated times, that a wall is
slid along rather than stuck to, and that a 35° slope is refused while a 0.17 m
step is not.

All of these are deterministic — the same arguments always produce the same
output. The Node-side tools are plain CommonJS and need nothing but Node; only
the browser pages need the install. Node v20.19.4 is what this has been run
against.

### The playground

A bot-vs-bot match rendered as capsules on a floor, with a debug overlay:
phase, round, tracks, seed, step count and a scrolling event log, plus
play/pause, single-step, fast-forward, speed (0.25×–4×) and restart-with-seed.
Camera is OrbitControls; drag to orbit, scroll to zoom.

For review tooling the page exposes `window.__gameRef` (the live game object)
and `window.__eventLog` (the driver's events for the current match — a fresh
array per restart, appended to as it plays), and `window.__sd` with
`play/pause/step/runToEnd/restart(seed, players)`.

### The movement workbench

`walk.html` — a kinematic capsule on a test obstacle course: a 1.2 m corridor
with a right-angle turn, a free-standing corner, three 0.17 m steps, a 0.40 m
blocker, a walkable 15° ramp onto a 1.5 m platform with open edges, and a 35°
ramp that refuses to be climbed. WASD or arrows to walk, drag to orbit, wheel to
zoom. There is no jump and no sprint; neither is in the game's design.

The overlay on the right is live tuning — walk speed, acceleration and stop
times, turn time, gravity, slope limit, step height, ground snap, and the
camera's distance, height, aim point, smoothing and field of view — writing
straight into the objects the simulation reads, so a change lands on the next
substep. "reset to defaults" puts everything back.

Movement runs on a fixed 60 Hz accumulator decoupled from the render rate, so
the feel is a function of those numbers and nothing else.
`src/walk/controller.js` holds all of it and imports nothing: no three.js, no
DOM, no clock, no randomness. The collision world is an injected interface of
two functions, which is why the node tests exercise the same code the browser
does.

For review the page exposes `window.__walk`: `teleport(x, y, z)`,
`setInput(x, z)` (a world-space, camera-independent input vector),
`tick(dt, n)` (advance n frames of dt with no wall clock involved), `state()`,
`resume()`, and `run(mark, seconds)` for the named spots in `__walk.marks`.
Calling `teleport` or `setInput` parks the live loop so a scripted measurement
cannot depend on how long you took to type the next line; `resume()` or any
movement key hands it back.
