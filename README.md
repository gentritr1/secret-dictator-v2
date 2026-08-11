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
src/engine/human-driver.js  the session for a match with a person in it: waitingFor / submit / replay
src/engine/view.js       the player-safe projection — what one seat is allowed to know
src/engine/floor.js      the floor: the structured claim schema — speech as canonical, replayable data
src/engine/orator.js     what a citizen chooses to say: a valid utterance from the record, a mind, and a hand
src/engine/index.js      ESM shim — re-exports the UMD globals for the browser build
src/app/                 the 3D playground: three.js scene, match runner, debug overlay
src/walk/                the movement workbench: capsule controller, obstacle course, follow camera
src/walk/controller.js   the kinematic controller — pure logic, no three.js, no DOM, no clock
src/play/                the square: the first human-playable match
src/play/interact.js     the interaction contract — proximity, facing, one key, no per-object input
src/play/objective.js    the persistent objective line — a pure function of the player-safe view
src/play/seat.js         the one grammar: a permanent number per citizen, from roster order
src/play/tray.js         the tray — 1280x84, three regions, and the rule that it is never blank
src/play/card.js         the private card — 232x96, and the only 2D element with role colour
src/play/ledger.js       the ledger — 420px, per-citizen entries, every row traceable, no verdicts
src/play/pace.js         how long the square takes to answer — a clock, and only a clock
src/play/murmur.js       the square's table-talk, and the queue every bubble shares
src/play/floor-voice.js  the floor out loud: text_id -> prose, and when each beat lands
src/play/assets.js       the runtime asset tables: environment rows and the citizen cast, with per-row fallback
src/play/lighting.js     the lighting director — a pure map from the player-safe view to a named state
src/play/stage.js        the staging director: WHEN the five juice-map moments happen, and in what order
src/play/audio.js        minimal sound: five moments, one bed, and the two silences
src/lab/                 the asset lab: fixed review cameras, moods, collider overlay, stats
index.html               Vite entry point for the playground
walk.html                Vite entry point for the workbench
play.html                Vite entry point for the square
asset-lab.html           Vite entry point for the asset lab
test/engine.test.js      headless self-test: plays full bot-vs-bot games, asserts the rules at every step
test/controller.test.js  headless movement tests: frame-rate independence, slopes, walls, steps, falls
test/human-driver.test.js replay determinism with a human seat, plus a divergence control
test/contract.test.js    the options -> submit round trip: everything advertised must be accepted
test/view.test.js        the leak sweep: what each seat may see, checked three ways
test/interact.test.js    the targeting contract: range, facing, liveness, overlap
test/objective.test.js   the objective line: every state mapped, right object named, nothing leaked
test/pace.test.js        the deliberation clock: timing cannot change a match, at any speed
test/ambience.test.js    the light and the sound: every state mapped, style laws asserted, nothing leaked
test/glb.test.js         the GLB contract: the file, the loader, and the player walking up it
test/floor.test.js       the claim schema: allowlist, permutation, V1-V6, C1-C6, and floor-off invariance
test/orator.test.js      the orator: invariance, read-only minds, zero refusals, and the re-scoped permutation gate
test/murmur.test.js      the bubbles: both voices, one queue, one cap, and no role word in any of it
test/hud.test.js         the HUD: never blank, one card size, one role channel, one number per citizen
test/ledger.test.js      the ledger: every row traced, flags without verdicts, and a render that touches nothing
scripts/driver-parity.js proves driver.js reproduces the self-test's numbers exactly
scripts/simulate.js      headless batch simulator: statistics instead of assertions
scripts/capture-reviews.mjs  the seven fixed asset captures, through asset-lab.html
scripts/capture-cycle.mjs    the Gate 3 acceptance set: one government cycle, through play.html
scripts/capture-hud.mjs      the Gate D3 acceptance set: the tray's phase states, the card's box,
                             and the warm-pixel budget measured with the HUD in the frame
scripts/capture-ledger.mjs   the Gate D4 acceptance set: the caught lie looked up, the 60-second
                             pause, a ballot answered with the panel open
docs/step-01.md          learning log for the port
docs/step-02.md          learning log for the playground
docs/step-03.md          learning log for the character controller
docs/step-04.md          learning log for the first playable match
docs/step-05.md          learning log for Gate 1: objective line, dialog focus, contrast, framing
docs/step-06.md          learning log for Gate 2: the asset loader, the asset lab, the GLB gate
docs/step-07.md          learning log for Gate 3: the lighting director, AgX, sound, the asset table
docs/step-08.md          learning log for the murmur facade and its three-run proof
docs/step-09.md          learning log for Discussion Gate D1: the structured claim schema
docs/step-10.md          learning log for Discussion Gate D2: the bots start speaking
docs/step-11.md          learning log for Discussion Gate D3: the tray, the private card, the sidebar's end
docs/step-12.md          learning log for Discussion Gate D4: the ledger, and what pinning it pauses
docs/STYLE_BIBLE.md      locked visual direction, palette, light meaning and anti-goals
docs/BLENDER_PIPELINE.md one-asset-at-a-time Blender/MCP production and acceptance contract
docs/ASSET_MANIFEST.md   provenance and production status for every visual asset
```

The seven engine modules are UMD (`module.exports` under Node, `window.SD` /
`window.SDAI` / `window.SDDriver` / `window.SDHuman` / `window.SDView` /
`window.SDFloor` / `window.SDOrator` in a browser) and have no dependencies.
`engine.js` and `ai.js` are byte-identical to v1 and must stay that way;
`src/engine/index.js` is the ESM adapter that lets a bundler import them without
editing them.

`floor.js` and `orator.js` are the two deliberate engine *extensions* since the
port. `floor.js` turns speech into canonical data — validated claims,
contradiction flags, floor scheduling, a per-citizen ledger — while reading the
game only through a public whitelist and drawing no randomness at all.
`orator.js` is what fills it in: given the record, a seat, that seat's own
memory of its own hands and that seat's mind, it selects one valid utterance for
one beat. Bots read their minds and may lie about their hands, so **what a
citizen chooses to say correlates with their role, on purpose** — that is the
deduction game, and it is a different thing from the rule that no *presentation*
channel may leak one. What still holds absolutely is that no rules decision
reads a word anybody said: `npm run test:orator` plays fifty seeds twice, floor
off and floor on, and requires byte-identical event logs, with a control that
hands selection the game's own seeded stream and must diverge.

Everything the presentation reads flows one way, with one extra link once a
human is seated:

```
engine (truth) -> driver.step -> event -> scene          (bot playground)
engine (truth) -> session -> view.js -> panels / scene    (the square)
```

No code under `src/app/` or `src/play/` writes to the game object or draws from
its seeded random stream, which is what keeps a seed reproducible in the
browser. Under `src/play/` the game object is never *read* either: every screen
is built from `viewFor(G, seat)`, so hidden information cannot leak by accident
— it would have to be added to `view.js` on purpose.

## Running

```sh
npm install                                # three (runtime) and vite (dev) only

npm run dev                                # http://localhost:5173      the bot playground
                                           # http://localhost:5173/walk.html   the movement workbench
                                           # http://localhost:5173/play.html   the square (playable)
                                           # http://localhost:5173/asset-lab.html   the asset lab
npm run build                              # production bundle into dist/ (all four entry points)

npm test                                   # 50 bot-vs-bot games + targeted rule tests
npm run test:controller                    # the character controller, headless
npm run test:human                         # replay determinism with a human seat
npm run test:contract                      # the options -> submit round trip
npm run test:view                          # the view model's leak sweep
npm run test:interact                      # the interaction contract
npm run test:objective                     # the objective line: mapping, routing, leaks
npm run test:pace                          # the deliberation clock cannot change a match
npm run test:ambience                      # the lighting map and the sound cues: mapped, lawful, leak-free
npm run test:tell                          # no presentation channel correlates with a hidden role
npm run test:stage                         # the five moments' schedule: the 700 ms cap, the 180 ms stagger, the 800 ms silence
npm run test:glb                           # the shipping GLB's contract, three layers deep
npm run test:floor                         # the claim schema: what may be said, and that saying it changes nothing
npm run test:orator                        # the orator: bots speak, some lie, and the match is unchanged
npm run test:hud                           # the tray is never blank, the card never grows, one number per citizen
npm run test:ledger                        # every ledger row traces to a public event, and none of them judges
npm run test:strip                         # the intent strip: the player's turn on the floor, and what silence costs
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

`npm run test:human` is the gate on a match with a person in it: it records a
scripted playthrough, replays the recorded action list from the same seed, and
requires a byte-identical event log — plus a control that forces one different
legal answer and requires the log to *differ*. It also runs 24 all-bot matches
through the session and through `Driver.playOut` and requires them equal, which
is how "seating a human changed nothing about the bot path" stops being a claim.

`npm run test:contract` is the gate on the seam between them: every value
`waitingFor()` advertises in `options` must be accepted by `submit()` verbatim,
for every decision of complete matches. It exists because that handshake was
broken and neither of the two suites either side of it could see the break — one
fed the session its own recorded shape, the other read `options` and never
submitted. It also holds the promise that a bot step never answers for the
human, by refusing to answer and requiring the match to stall for ever.

`npm run test:view` is the gate on hidden information, and it is written as a
security test. Every seat's projection is audited at every step of complete
matches three ways: an explicit path allowlist for every role and tile token, an
exact token count for seats that know only themselves, and — the one that cannot
be fooled by an oversight — a permutation test that rewrites the roles the seat
is not entitled to know and requires the serialised view to come back identical.
It checks positive disclosure too, which the leak checks cannot: every seat's
`known` must equal `SD.knownRoles` exactly, a Rebel's must name every mate and
the Dictator, and the role card must actually render them — driven through the
real `panels.js` against a stub document. A projection that told nobody anything
would pass every leak test ever written and make the Rebel role unplayable.

`npm run test:interact` is the gate on the one key. `src/play/interact.js` holds
no three.js, no DOM and no clock, so range, the facing cone, which of two
overlapping objects wins, and whether a target that went dead can still fire are
all checked in node.

`npm run test:objective` is the gate on the one line of text that is always on
screen. `src/play/objective.js` takes the player-safe view and nothing else, so
every state of complete matches can be checked headlessly: that a line exists,
that its mapping id follows from the pending decision, that the object it tells
you to walk to is the object the interaction system would actually open that
panel at, and — the leak sweep from `test:view` pointed at a string — that it
never says a role, a team or a tile, and never names a citizen the square has
not publicly been told about.

`npm run test:pace` is the gate on the deliberation clock. The bots take
humanlike time to answer, and the one risk in that is timing changing an
outcome: the engine's chance is a single seeded stream, so one draw taken by
the presentation layer would shift every later bot decision. The suite plays
the same seeded match twice with the same human actions — once plainly, once
with the clock hammered at every seam between engine calls at every speed the
page offers — and requires byte-identical event logs. It then proves the probe
can *see* that failure by running the same interleave with a clock that draws
one `G.rng()` per seam and requiring divergence, because a probe that cannot
reach the code it is aimed at reports green.

`npm run test:ambience` is the gate on the light and the sound. Both are pure
functions of the player-safe view — an ambience wired to the driver's omniscient
event stream would be a *tell*, and "the lamp dips whenever the Speaker discards
a Reform" is a complete solve of the game delivered through the atmosphere and
invisible in any diff. So the suite checks the trust boundary twice: the
permutation test from `test:view` (rewrite the roles this seat may not know, the
light must be identical) **and** a recording Proxy that writes down every
property the mapping touches and fails on anything outside eighteen declared
paths — because the permutation only catches a leak that happens to be
role-shaped. It also turns `docs/STYLE_BIBLE.md` into assertions: every night
state declares a warm budget of at most 10%, no night state lights more than one
lantern-warm source, no colour in the table is pure black, and every reachable
state of complete matches maps to a rig somebody designed rather than to the
`unknown` fallthrough. The sound cues are counted against the engine's own
public prose — one sting per tile enacted, one tally per election held, one
gavel per nomination made — which is how a real bug surfaced: two consecutive
elections can produce a byte-identical tally, so an edge keyed on "the tally
changed" silently missed one.

`npm run test:tell` is the law the design review wrote and nothing enforced:
**given the same public record, every presentation channel is byte-identical,
whatever the hidden roles behind it happen to be.** It sweeps all of them at
once — which lanterns burn and at what intensity, the lighting id step by step,
the bed's gain and cutoff, which cues fire and in what order, whether a sting
fired and how long it holds, the bot deliberation band drawn for real, and the
seeded flicker table by checksum — permuting the hidden roles at every moment of
every match and comparing as JSON.

The interesting part is that it does not trust itself. The channels are pure
functions of a player-safe view, so their agreeing under permutation is close to
tautological, and a sweep that only did that would be a green light with nothing
behind it. So it also (a) compares the *view* under permutation, making "the
same public record" a checked fact rather than an assumption, and (b) **mutation-
tests its own detector**: seven deliberately injected tells — the lanterns going
out from the other side when the Dictator sits odd, the bed dropping 40 Hz for a
Rebel nominee, a sting held 200 ms longer, a trial lit as a power play, a
swallowed gavel, a flicker salted with the Dictator's seat, bots deliberating
15% longer over a fellow conspirator — must each be caught, and an eighth
control mutant that changes nothing must be caught by nothing. A gate that
cannot fail is not a gate.

`npm run test:glb` is the gate on the one source file nobody reads. An art asset
is authored in another program and arrives as bytes — `Bin 0 -> 89732 bytes` is
what a reviewer sees in the diff — so the suite reads it in three layers. The
**file**: GLB chunks parsed with no library at all, for required node names,
default/`.001` names, guide or camera leaks, single-sided opaque materials,
bounds and ground contact to ±1 cm, the sacred `0.22 m` dais top under the
`0.25 m` step limit, and — the check a dimension test cannot make — per-triangle
winding, signed volume and walkable area, because a collider of exactly the
right size whose faces point inward is a dais the player walks straight through.
The **loader**: `GLTFLoader.parse` on the real bytes and then the game's own
`buildEnvironment()`, headlessly, so the placement, the collider harvest and the
socket under test are the ones `play.html` runs; plus every refusal, and a
material comparison against an untouched second parse. The **player**: the
harvested colliders merged with the graybox, handed to the real BVH world, and
the real controller walked north onto the dais at full speed — with a control
that runs the same walk in a world without those colliders and requires it to
end somewhere else. And the **cast**: the same file contract over all four
citizen GLBs minus everything about collision, plus the checks a generic sweep
would miss — the *feet* centred rather than the bounding box (one citizen leans
half a metre forward on purpose), no `COL_` volume in an asset the runtime
harvests nothing from, and a label socket that clears the crown — then the
runtime seam that merges and instances them, and the seat mapping.
`node test/glb.test.js <file>` points the file layer at a candidate re-export
before it is committed.

`npm run test:floor` is the gate on what a citizen may say. Speech is data:
`src/engine/floor.js` records a claim as `{speaker: 3, kind: CLAIM_HAND, refs:
{government: "g-6"}, drawn: {reform: 1, seize: 2}, ...}` — seat numbers, never
names; ids, never objects; a `text_id`, never a sentence. The suite is aimed at
the four ways that can be wrong. **It says too much:** a field allowlist over 50
complete matches with synthetic utterance streams, plus the permutation test
from `test:view` extended to speech — the same match folded twice, once with the
roles a seat may not know rotated at every observation, and every utterance,
flag and ledger entry must serialise identically. (Its speaker has no mind and
reads only the public record, which is what makes that last claim testable; the
version of it that survives real bots with minds is `test:orator` §7, below.)
**It accepts a lie about
public fact:** V1–V6 are enforced at construction, so an invalid claim is not
rejected on append, it is never built; each rule is refused by name and a fuzz
sweep of 4000 randomised claims accepts none that an independent re-derivation
calls invalid. **It delivers a verdict:** each of C1–C6 has a triggering fixture
*and* a near-miss, a flag names a rule and its refs and stops, and C3 — where
one of two accounts must be lying and the record cannot know which — is proved
symmetric by swapping the two seats and requiring the same flag. **It changes
the game:** at this stage no bot rules-decision reads a word of it, so every
seed is played twice, plain and with the whole layer running, and the event logs
must be identical — with a control that hands the speech layer the game's own
seeded stream and requires all 50 to diverge, because an invariance result from
an instrument that cannot see a violation is not a result.

`npm run test:orator` is the gate on bots actually speaking it. It carries the
same invariance and the same control, one layer up — selection draws from
`SD.makeRng(seed ^ SALT)` and never from the game's stream — plus three checks
the schema gate cannot make. **Minds are read, not written:** every mind is
handed over behind a Proxy that refuses writes and records reads, and the whole
surface comes back as `id`, `known`, `peeked`, `sus`. **Nothing offered is
refused:** zero schema rejections over fifty complete matches, with a census of
which bases were ever constructed, so an unreachable branch is a measured
finding rather than an assumption. **The human seat is in the conversation:**
D2 kept it out of every target pool and out of the beat order, and said why —
being accused with no way to answer is worse than not being accused. The intent
strip is the way to answer, so that section is *inverted* rather than deleted:
the seat now takes beats and is named, on the same ladder and through the same
constructor as everybody else, and every reference on an accusation aimed at it
is re-resolved against the public record from the outside.

And it is where **D1's permutation claim is re-scoped rather than kept.** With
minds informing choice, a seat's utterance stream is no longer independent of
its role and must not be — so the gate now asserts, in four parts, that the
public fold is blind, that no utterance field carries a role token, that ledger
and flags and audit render identically for rotated roles *given the same
record*, and — as a requirement rather than a deletion — that the argument
**does** change when the roles are dealt differently. A behavioural tell is a
citizen's own choice and is what there is to deduce; a presentation channel is
the renderer telling you something nobody said, and that rule is untouched.
`docs/step-10.md` is the long version.

`npm run test:strip` is the gate on **your** turn. The strip's contents are a
pure function of the public record plus the utterance that prompted you, and its
one safety property is that a slot is offered only if the schema would accept
the resulting utterance — so the suite does not re-derive the rules to check it.
It **speaks every slot**, through the real constructor, into the real record:
zero refusals over fifty matches played by three different players (one that
cycles every intent, one that never says anything, one that always answers). The
dry run that makes that possible (`Floor.attempt`, which runs `speak()` and
unwinds it) is itself checked by serialising the whole record before and after
every strip — thousands of times — and requiring it byte-identical, because the
comment beside the rollback is the thing that could rot.

Then the four claims the brief makes about the moment. **Stable order:** slot 1
is always the answer, the last slot is always silence, and the middle contracts
rather than reorders — asserted on every strip, not on a fixture. **You never
speak something you have not read:** every card of every strip is rendered
through the real tray row, checked against the 34-character truncation, and its
full sentence matched character for character against the second line.
**Silence costs, observably:** logged by name, an accuser bought a second beat,
`basis: silence` made constructible (by constructing one, and refusing the near
miss), and a question left owed — with an all-bot control that must pay none of
it. **No rules decision has a clock:** ten minutes of presentation clock with
"the floor waits for you" on changes nothing, and the page's own eligibility
rule is tabulated so that the one situation where the oil line may burn is the
one where nothing else is owed.

`scripts/capture-strip.mjs` is the half a headless gate cannot reach: it plays
real matches until a bot names *you*, and measures — in the page, off its own
requestAnimationFrame loop — that the Gate 14 staging fired, that the strip was
on screen inside the brief's 700 ms, and that the oil line burns at the slope it
declares. `docs/step-15.md` is the long version.

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

### Art production

The visual direction is locked in `docs/STYLE_BIBLE.md`. Blender and Blender
MCP work follows `docs/BLENDER_PIPELINE.md`: one bounded asset task at a time,
metre-scale source retained in the repo, semantic `VIS_*` / `COL_*` /
`SOCKET_*` nodes, fixed browser captures, a graybox fallback, and manifest plus
verification gates before an asset ships. The existing
`design/pipeline-test/podium-test.glb` proves only that the export route works;
it is deliberately not a runtime asset.

`asset-lab.html` is the review instrument. It loads any GLB under
`public/assets/models/` (a dropdown, or `?asset=<path>` for anything) beside the
real `1.70 m` calibration capsule, a 1 m grid and a 0.25 m banded pole, with
four fixed cameras (`1`–`4`: front, three-quarter, side, and the play camera's
actual `3.5 m` / `1.8 m` / `60°`), four lighting moods (`D`/`U`/`N`/`S`: day,
dusk, night, and an unlit black silhouette on a light background), a collider
overlay (`C`) drawn from the same world-baked geometry the game's BVH is built
from, a tone-mapping toggle (`T`: AgX, which is what the pipeline says to judge
materials under and what `play.html` has rendered under since Gate 3), and
`renderer.info` on screen. Drag to orbit, wheel to zoom; a camera key snaps back
to the fixed view, so a capture is always the same capture. It is deliberately
permissive and imports nothing from the engine or the game: an instrument that
can only display assets which already pass is useless for working out why one is
failing.

`src/play/assets.js` is the runtime half, and from Gate 3 it is two **tables**.
`ENVIRONMENT` is one row per asset — id, category, where it stands, which way it
faces, which graybox pieces it takes over, which nodes it may not arrive
without, which sockets the game asks it for, and what to do when it is missing —
and the URL is derived from the category and the id, because the pipeline fixes
that path. It ships with one row (`env-dais-a`, placed at `(0, 0, 9)` with yaw π
— the documented placement transform, never baked into the mesh), and the point
of the shape is that the lantern, the façade, the ground treatment and the
citizen base are **one row each and no code**.

The loader renders the `VIS_*` nodes in place of the pieces the row replaces,
hides the `COL_*` nodes and feeds their world-baked geometry to the collision
world, and resolves `SOCKET_podium` into the podium interactable's anchor. Every
row can fail independently and none of them throws: a missing file, unreadable
bytes or a renamed required node produce one console warning and either the full
procedural graybox (`fallback: 'graybox'`) or an obvious placeholder capsule at
the asset's place (`fallback: 'capsule'`, for the assets that have no graybox to
fall back to) — visual only, so a missing building never becomes a movement bug.
Materials are never patched at runtime — colour is a decision in the `.blend`,
and `npm run test:glb` fails if the loader touches one.

The second table is the **cast**: `CHR_CITIZENS`, the four carved-wood citizen
variants. A cast member carries no placement — it is loaded once and instanced
onto however many seats the match has — so which figure stands in which seat is
`variantForSeat(seat) = table[seat mod 4]`. Arithmetic, not chance: stable
within a match, across a reload and across a replay, and identical no matter
which seat the human is in, so a recorded review of seed 1000 shows the same
seven people to whoever re-runs it. Each variant's eight meshes are merged into
one draw call at load and shared by every seat that uses it; the nameplate sits
on that figure's own `SOCKET_label` (the four are 1.62 m to 2.15 m apart) and a
purged citizen topples by its own depth rather than by a shared constant. A
variant that will not load costs only the seats that would have used it, which
fall back to the old capsule. The human's avatar stays a capsule on purpose:
the controller's collider is one.

`scripts/capture-cycle.mjs` is the other capture pass: where
`capture-reviews.mjs` photographs an *asset* from fixed cameras, this drives a
whole *match* through the real page and the real keyboard and photographs the
nine fixed moments of one government cycle, with the lighting readback and the
measured warm-pixel fraction printed beside each shot. Output lives in
`design/reviews/gate-3-cycle/`.

### The square

`play.html` — the first playable match. You walk a carved-wood citizen around a
mostly graybox square among a crowd of them and play a whole game through real
decisions:
nominate when you hold the gavel, vote on every government, draft when you are
elected, aim the powers the Seize board grants you. The dais and lectern are
loaded from `env-dais-a.glb` and the ring of bots from the four
`chr-citizen-*.glb` figures (see **Art production**); everything else — ground,
kerbs, bell, bench — is still the procedural graybox of `src/play/square.js`.

The current review target is desktop keyboard and mouse. The HUD is laid out for
1280 px and is not yet responsive, and there is no touch movement/use path;
mobile support is not claimed for this milestone.

**Your body is a citizen, not a capsule** (Gate 14, `docs/step-14.md`). It is
the figure your seat implies, through the same `variantForSeat` arithmetic every
bot goes through, so nothing on screen distinguishes the human's body from a
bot's. The COLLIDER is unchanged and always will be — `src/walk/controller.js`
still collides a 0.35 × 1.7 m capsule, and every Step 3 measurement still holds
to the digit. `?body=capsule` renders the old graybox body, the way
`?tone=linear` turns the tone mapping off: the swap costs +0.37 warm points and
that is a number somebody should be able to check rather than take on trust.

WASD or arrows to walk, drag to orbit, wheel to zoom, **E** to take whatever you
are facing. Then **1–9** names a citizen — *their own permanent number*, the one
on their nameplate — A or Y is Aye, N is Nay, ↵ continues, **Tab** moves between
the answers on a centred card, Esc steps back without answering, and **?**
shows the keys. Whatever holds the decision owns the keyboard while it does — A
is "Aye" here and "strafe left" everywhere else — and the body does not move
behind it.

**Five moments are staged** (Gate 14, `docs/step-14.md`), from the design
review's juice map, in the order it ranked them:

- **The accusation aimed at you.** The murmur bed cuts to near-silence first,
  the accuser's lantern lifts while every other pulls back, a cool rim finds
  your figure from the side the voice is coming from, your figure turns to face
  them without your input, the camera pushes 6% over 400 ms, and the objective
  line becomes *"Chen names you — answer on the floor."* Nothing lands later
  than 620 ms. (Built and reachable, but no bot names you yet: that waits on the
  intent strip — see `docs/step-14.md` §1.)
- **The ballot reveal.** Ballots land one at a time, in seat order, 180 ms
  apart, with the count accumulating beside them — so a viewer with the sound
  off knows the result before the count finishes.
- **The tile enacted.** It travels from the lectern to its slot on the board
  over 520 ms and settles. The empty slots stay visible beside it.
- **The purge.** The beam narrows onto the named citizen, the square is
  completely silent for 800 ms — the bed cuts, it does not fade — then one
  gavel, and nothing else at all.
- **The curtain call.** At game over each figure turns to camera in seat order
  250 ms apart and its role seal presses onto its own nameplate; the Dictator
  turns last and is held alone. Only then does the reveal table appear beneath
  it. It is the one moment role colour is allowed outside the private card.

**Reduced motion is honoured**, from the operating system's
`prefers-reduced-motion` or from the page's own setting, either one. The camera
and the body snap; **the light keeps its crossfade**, because which two people
are lit is the information and information should not snap. Every decision stays
reachable in every mode.

**The HUD is four surfaces** (Gates D3 and D4, `docs/step-11.md` and
`docs/step-12.md`); the 330 px debug sidebar it replaced is gone.

- The **tray**, 1280 × 84 along the bottom, permanent: the Reform and Seize
  tracks on the left, the contextual row in the middle, the ledger and keys
  hints on the right. It is **never blank** — when nothing is being asked of you
  it names who the square is waiting for, in parchment, with no keys beside it,
  so "there is nothing to press" is stated rather than inferred.
- The **private card**, 232 × 96 top-left: your number and name, your role, who
  you know, and a fourth line only while you are holding tiles. It never grows,
  never animates, dims to 35% in the night states, and is the **only 2D element
  in the game permitted role colour**.
- The **centred card** for the three decisions that show you private material —
  the Speaker's three tiles, the Deputy's two, a Foresight read — and for the
  three ceremonies that need a page of public reading.
- The **ledger**, 420 px on the right, opened with **L**: per-citizen entries
  rather than a scroll of everything, the promoted rows (deck and discard, the
  chaos state, what the next Seize arms) above them, and your own win condition
  above those. `1–9` jumps to a citizen by their permanent number, `F` shows the
  flagged only, `L` or `Esc` closes it.

**Pinning the ledger pauses the presentation, not the game.** Bots stop
deliberating, the light holds mid-crossfade, and the header says *paused* — but
the engine has no clock to stop, so nothing is written, nothing expires unseen,
and a decision you own can still be answered on the tray behind the panel.
Measured: pinned for 60.9 s in a live match, the event log, the utterance record
and the pending decision came back byte-identical.

**A flag names a rule and stops.** A flagged citizen carries an amber mark and a
count; the rule and the utterances and government it is built from are inside
the entry. C3 — the Speaker and the Deputy telling two different stories about
one government — is on **both** entries with the same id, because the record
cannot say which of them lied and neither may the panel. Every row carries the
ids it was folded from, and `test/ledger.test.js` resolves all of them: no
score, no trust meter, no percentage, no orphan rows.

**Every citizen owns a number for the whole match**, from the engine's roster
order: stamped in brass on their nameplate, retired when they die, never reused,
never positional. It is the key you press wherever a citizen is named, so the
offered keys can read `2 3 5 6` with gaps where the term-limited sit — and the
gap is information. `src/play/seat.js` is that rule, and `test/hud.test.js`
drives the same key through four input paths and requires them to agree.

A **persistent objective line** sits at the top of the scene and always says
what to do next and which object to do it at ("Day 4 — walk to the bell and ring
it to open the session", "Waiting: Bo is using Peek Allegiance"). It is warm
when the square is waiting on you and quiet when it is not, and like every other
piece of text on the page it is built from `viewFor(G, yourSeat)` alone. **It
did not move a pixel** when the sidebar was retired: its five positioning
declarations are pinned byte for byte and its output is hashed against the value
the pre-Gate-D3 module produced.

Centred cards are real dialogs: focus moves into them, Tab cycles inside them,
the tray, the card and the controls go `inert` behind them, and closing returns
the keyboard to where it was. **Esc never answers anything** — on a card or on
the tray's armed row — so walking back and pressing E offers exactly the same
choices.

Four decisions are answered on the tray itself (nominate, vote, block response,
power target) and three on a centred card, and that split is one function,
`surfaceFor(kind)` in `src/play/tray.js`, asked by both the tray and the E key
so they cannot disagree. A tray row is *offered* as soon as it is yours and
becomes *armed* when you press E at the object that owes it: keys are drawn only
while they are live, and the body is frozen while they are.

The camera frames you dead centre. It aimed right of centre until Gate D3, to
clear the 330 px sidebar; with the sidebar retired `screenBias` is 0 on every
page, which is what the composition change actually asks for.

Three things share one interaction contract (`src/play/interact.js`), which is
how it is known to be a contract and not three handlers:

- the **podium** is context-sensitive — it *is* the nominee picker, the ballot,
  the tally, the draft and the power target, depending on what the rules are
  waiting for;
- the **bell** opens the day and announces the Chaos Track;
- the **bench** sits and stands, and has no effect on the rules at all.

Which object owes a decision is one function, `objectFor(kind, gate)` in
`src/play/objective.js`, and both the interactable and the objective line are
built from it, so they cannot disagree about where to send you.

**The light tells you what the square is doing.** `src/play/lighting.js` maps
the player-safe view to one of thirteen named states and crossfades between them
over about two seconds: soft day for the morning report, an amber dusk while the
gavel looks for a Deputy, and for the vote the trial look from the hero
reference — the ambient drops to deep blue and one warm beam pools on the dais,
with everyone else a silhouette. The result holds that beam and warms or cools
around it, a draft dims the hall and keeps the dais lit, an enacted tile flashes
its own colour for a moment, and the match settles into the winning team's
colour at the end. Phase transitions re-light **before** the crowd changes, per
the style bible's staging rule. Warm light is information and never decoration:
the night states are held to under 10% warm pixels, and
`__play.lighting({ measure: true })` counts them on the real frame rather than
trusting the rig.

The page renders under **AgX** tone mapping, matching `asset-lab.html`, so a
colour judged in the instrument is the colour in the game. `?tone=linear` turns
it off if you want to see the difference.

**Sound** is five moments and one bed: the bell you ring, a gavel when a
nomination is made, a low seal when your own ballot goes in, a tally when the
ballots are opened, and a distinct sting for a Reform and for a Seize. Volume
and mute are in the controls; nothing is constructed until you touch the page,
so there is no autoplay warning. Every cue is driven by the same public state
the light is — see `npm run test:ambience`.

Bots deliberate rather than answering instantly: a nomination takes a second or
three, a legislative draft longer, bookkeeping less, and there is a short beat
after your own submissions when the rules immediately owe you another decision.
The beat holds the *ambience* too — casting a ballot resolves the whole election
in one engine step, so without it the light and the tally sting told you the
result before you had walked back to the podium to open the ballots.
The **bot pace** control scales all of it (4× is roughly instant). None of it
can change what happens — see `npm run test:pace`. When the rules are waiting on
you the match stops and stays stopped; there is no timeout, by design.

Everything on screen is drawn from `viewFor(G, yourSeat)` and nothing else, so
what a panel *can* show is bounded by what the projection carries: your own
role, whatever the rules say you know (Rebels see each other and the Dictator;
the Dictator sees the Rebels only at five or six), your own Peek results, your
own hand while you hold it, and the public board. Everything opens at game over.

For review the page exposes `window.__play`: `state()` (the view model for your
seat), `waitingFor()`, `submit(action)`, `eventLog`, `actions`,
`restart(seed, players, humanIndex)`, plus `objective` (the line as an object
*and* as the text actually in the DOM — if those disagree the render is broken,
not the mapping), `focusOrder` / `focused` for the dialog, `framing` /
`setFraming(f)` for the camera bias, `holding` / `beat()` / `pace` for the
deliberation clock, `environment` for the asset load report (`ok`, the reason if
not, the placement, the resolved sockets and the live podium anchor, plus the
table's rows and any fallbacks), `cast` for the crowd (which variant is in which
seat, each nameplate's height read back off the scene graph, who has toppled,
and which seats fell back to a capsule), `variantForSeat(n)` for the mapping
alone, `stats` for `renderer.info`, `lighting()` for the live rig — and
`lighting({ measure: true })` to render the scene into a small offscreen target
and count the warm pixels for real — `tray` and `card` for the two permanent surfaces — each reported twice, as the
module's own answer and as the DOM the page actually wrote, with the card's
measured box beside its declared one — `ledger()` for the board rows the retirement
table routed off the permanent surfaces (deck, discard, the chaos track below
its promotion point, the next power, the public log), `ledgerPanel` for the
ledger itself — the model beside the DOM, with every rendered row and the ids it
was folded from, so a review can check traceability against the running page —
`pinLedger()` / `unpinLedger()` / `ledgerKey(k)` to drive it without a keyboard,
`arm()` / `disarm()` to take and give back the tray's row without a
keyboard, `edges()` for what the ambience last noticed, `audio.report()` / `audio.log` for what was played and when, and
`setLighting(id)` to force a state for a capture. `setLighting` cannot *hold* a
state: the next refresh aims the rig back at whatever the view says, so it
cannot be used to photograph a lighting story the game never shows.
`submit()` deliberately runs no beat — it is the scripted seam, and a sweep that
had to sit through the atmosphere would be measuring the clock instead of the
game; `beat()` drives that path on purpose. `floor()` is the discussion layer as
a report — how much has been said, which floors convened and which triggers the
square declined, the contradiction flags with their rules, refs and who has
addressed them, the open obligations, and the last dozen utterances rendered in
the *third* person from the same `text_id` entries the bubbles render in the
first. `floorLedger()` is the per-citizen fold and `floorAudit()` runs the
allowlist instrument over the live record; `murmurs.onScreenFloor` reads the
floor bubbles off the class the renderer actually put on the element, because a
distinction that is not in the DOM is not a distinction.

`submit(waitingFor().options[0])` is always a legal move, for every kind — no
special shapes. The four ways to advance say what they do: `step()` takes one
*bot* action and never answers for you, `auto()` answers exactly one pending
decision, `autopilot(true)` turns on continuous play (off after every restart),
and `runToEnd()` fast-forwards to the result screen.

To exercise the interaction system without
a keyboard there is `teleport(x, y, z)`, `face(x, z)`, `look()`, `use()` and
`walk(x, z, seconds)` — `look()` re-runs targeting on demand because
`requestAnimationFrame` stops in a background tab, and a stale `target` reads
exactly like a targeting bug; `walk()` advances the body on a fixed clock, the
`__walk.run` idiom, so "can you still step onto the dais at full speed" is a
measurement rather than a matter of how fast the reviewer types. The
live game object is deliberately not exposed; it would make the trust boundary a
suggestion.
