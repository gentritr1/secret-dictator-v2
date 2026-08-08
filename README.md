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
src/engine/engine.js   rules engine — pure state machine, seeded RNG, no DOM, no timers
src/engine/ai.js       bot opponents, driving the engine through the same public API a human would
test/engine.test.js    headless self-test: plays full bot-vs-bot games, asserts the rules at every step
scripts/simulate.js    headless batch simulator: same driver, statistics instead of assertions
docs/step-01.md        learning log for the port
```

Both engine modules are UMD (`module.exports` under Node, `window.SD` /
`window.SDAI` in a browser) and have no dependencies.

## Running

```sh
npm test                                  # 50 bot-vs-bot games + targeted rule tests
npm run simulate                           # 500 games, default seed
npm run simulate -- --seed 42 --games 200  # explicit seed and count
```

`npm test` is a correctness gate: it exits non-zero if any assertion fails.
`npm run simulate` is a balance instrument: it asserts nothing and reports win
rates, ending types, and per-player-count breakdowns.

Both are deterministic — the same arguments always produce the same output.

There is no build step, no bundler and no dependencies. Node only; v20.19.4 is
what this has been run against.
