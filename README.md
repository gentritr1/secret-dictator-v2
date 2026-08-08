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
index.html               Vite entry point for the playground
test/engine.test.js      headless self-test: plays full bot-vs-bot games, asserts the rules at every step
scripts/driver-parity.js proves driver.js reproduces the self-test's numbers exactly
scripts/simulate.js      headless batch simulator: statistics instead of assertions
docs/step-01.md          learning log for the port
docs/step-02.md          learning log for the playground
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

npm run dev                                # 3D playground at http://localhost:5173
npm run build                              # production bundle into dist/

npm test                                   # 50 bot-vs-bot games + targeted rule tests
npm run parity                             # driver.js vs the self-test's exact numbers
npm run simulate                           # 500 games, default seed
npm run simulate -- --seed 42 --games 200  # explicit seed and count
```

`npm test` is a correctness gate: it exits non-zero if any assertion fails.
`npm run parity` is the gate on the shared driver — it replays the test's 50
seeds through `driver.js` and fails unless the wins, endings and average step
count come back identical, which is what proves the browser is playing the game
the test proves. `npm run simulate` is a balance instrument: it asserts nothing
and reports win rates, ending types, and per-player-count breakdowns.

All three are deterministic — the same arguments always produce the same output.
The Node-side tools are plain CommonJS and need nothing but Node; only the
playground needs the install. Node v20.19.4 is what this has been run against.

### The playground

A bot-vs-bot match rendered as capsules on a floor, with a debug overlay:
phase, round, tracks, seed, step count and a scrolling event log, plus
play/pause, single-step, fast-forward, speed (0.25×–4×) and restart-with-seed.
Camera is OrbitControls; drag to orbit, scroll to zoom.

For review tooling the page exposes `window.__gameRef` (the live game object)
and `window.__eventLog` (the driver's events for the current match — a fresh
array per restart, appended to as it plays), and `window.__sd` with
`play/pause/step/runToEnd/restart(seed, players)`.
