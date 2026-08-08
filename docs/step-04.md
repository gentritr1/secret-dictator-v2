# Step 04 — one human decision boundary: the square, the projection, the key

A third entry point, `play.html`. You walk a capsule around a graybox square
among six bot capsules and play a whole match through real decisions: nominate
when you hold the gavel, vote on every government, draft when you are elected,
aim whatever the Seize board hands you. No art, no audio, no chatter — this
step is about three seams and nothing else:

1. **the driver stopping** where a person has to answer,
2. **the projection** that decides what that person is allowed to see,
3. **one key** that works on three unrelated objects.

```
npm run dev              # http://localhost:5173/play.html
npm run test:human       # replay determinism with a human seated
npm run test:view        # the leak sweep
npm run test:interact    # the targeting contract
npm run verify           # all of it, plus the engine suite, parity and a build
```

`index.html` and `walk.html` are untouched and still reproduce their recorded
numbers (below). The only edits outside `src/play/` and `src/engine/` are
`vite.config.mjs` (a third build input) and `package.json` (three more gates in
`verify`).

## The human-in-the-loop driver: extended, not wrapped

Both, in different places, and the split is the point.

**`driver.js` was extended, minimally.** `step(G, minds, opts)` takes an
optional `{ humanId, action }`. Every place the switch asked the AI for a
decision now asks first whether that decision belongs to the human:

```js
var pickId = G.speaker === humanId ? action : AI.chooseNominee(G, minds, G.speaker);
...
var aye = p.id === humanId ? action : AI.chooseVote(G, minds, p.id);
```

`humanId` defaults to **−1**, and no seat id is ever negative, so with no `opts`
every one of those comparisons is false and the all-bot path is the code it has
always been, calling the same hooks in the same order. That is not an argument;
it is what `scripts/driver-parity.js` still checks, and it still comes back with
the same 29/21, the same four endings and the same 59.9.

The alternative — a `human-driver.js` that reimplemented the phase switch —
would have been a *third* copy of the call order, which is the exact thing
`driver.js` was extracted in Step 2 to prevent. The event-building is long,
fiddly and load-bearing (Step 2's `null` Deputy bug lived in it), and two copies
of it drift.

**`human-driver.js` was added for the state**, because `driver.js` is stateless
by design and a match with a person in it is not. It owns the session: the
pending decision, the recorded action list, the event stream, and the one gate
the engine has no phase for.

### Why replay determinism holds

The engine's whole notion of chance is one seeded stream, and the bots draw from
it. A match is therefore a pure function of *(seed, roster, the order of calls
into engine and AI)*. Seating a human changes exactly one thing: at that seat,
an AI call is replaced by a value handed in from outside. **The human draws
nothing.** So a match with a human is a pure function of

```
(seed, roster, humanIndex, the ordered list of human actions)
```

and replaying that list reproduces it byte for byte.

Two details make that true rather than nearly true:

- **The vote is one step, and the human's ballot replaces only their own AI
  call.** The bots still seal in ascending seat order, skipping the human —
  which is precisely what v1 did (`js/main.js` filters `!p.isHuman` and loops).
  Because the human consumes no stream, *when* their ballot arrives relative to
  the bot draws cannot matter, and nothing in `AI.chooseVote` reads `G.votes`.
- **The acknowledge beats are inert.** `vote_result`, `chaos`, the Foresight
  "put them back" and the morning report all take a decision with exactly one
  legal answer. They advance the match but cannot shift a draw, which is the
  only reason it is safe to have invented one of them.

The morning report *is* invented — the engine has no phase for the top of a day.
It lives in the session (`morningDay`) rather than the driver, because
acknowledging it takes no engine step at all. It still goes into the recorded
action list so a replay stays aligned.

`test/human-driver.test.js` proves it over 120 matches, rotating every seat
through the human chair, with a scripted player that is deterministic but not
constant (always answering "option 0" would drive every match down one branch
and never move a Block or vote Nay):

```
replay        120 matches, every seat rotated through the human chair
              4902 human decisions recorded and replayed byte-identically
              decision kinds: {"acknowledge":3020,"nominate":194,"vote":1457,
                               "speaker_discard":83,"power_target":22,
                               "deputy_discard":113,"power_ack":13}
control       120 matches forked at a real choice and diverged
coverage      human purged in 5 matches; winners {"loyalist":51,"rebel":69}
all-bot       24 matches: session log === Driver.playOut log, no human ever asked
guards        illegal actions and idle submits throw; the morning gate takes no step
block         a bot Deputy's Block stops on the human Speaker; both answers replay
```

The **control** line is the half that makes it a test. A determinism check that
only ever compares equal things passes just as happily when the "replay" is
secretly the same object, so each match is also re-run with one human action
forced to a different legal answer, and the log **must** differ. The kinds are
asserted, not merely printed: a replay proof over decisions the human never
faced is worth very little.

`block_response` is the one branch random play will not reach — it needs a
five-Seize board *and* a bot Deputy holding two of them, which turned up once in
300 matches. Rather than leave it to luck it gets a constructed position (the
same idiom `test/engine.test.js` uses for the same rule), driven through the
session so the human path is what runs.

And the chain closes across the runtime boundary. A match played by hand in a
Chromium tab, its 38 recorded actions pasted into a node script:

```
node   events 61 chars 25810 hash 758b16b0 winner loyalist
browser events 61 chars 25810 hash 758b16b0
MATCH — the browser played the match node replays from the same script
```

## The view model: a trust boundary, tested like one

`src/engine/view.js` is one function, `viewFor(G, playerId)`, returning plain
JSON. The match page reads it and nothing else: `src/play/panels.js` — every
pixel of text in the game — imports no engine module at all, and `main.js`
mentions the game object exactly twice, both times as an argument being handed
to `viewFor`.

### Why bother, when the "server" is the same tab

Not because somebody might open the console. That is unpreventable here and
always will be. The failure this prevents is the ordinary one: a panel that
needs a name reaches for `G.players[id]`, gets `.role` for free, and six months
later a tooltip or a debug line prints it. Every leak in a deduction game has
that shape. Routing the UI through a projection means the leak has to be *added
to view.js*, where it is one obvious line rather than an accident.

It is also the shape multiplayer needs: when `G` lives on a server, this
function is what goes down the wire, and the leak test is what says it is safe
to send. Building it now costs a file; retrofitting it costs the whole UI.

### What it does and does not carry

Disclosure is read off `engine.js` rather than reimplemented —
`SD.knownRoles(G, v)` is the engine's own answer to "whose role may this seat
see" (a Rebel sees the other Rebels and the Dictator; the Dictator sees the
Rebels only at five or six). A Peek result is read from the viewer's own
`peeked` map and nobody else's. The three tiles a Speaker drew, the two a Deputy
holds and the three Foresight showed arrive only inside `waitingFor.detail` —
i.e. only at the moment that seat has to act on them, and never afterwards. Deck
and discard are counts. `G.seed` is never projected: it is not a role, but it
regenerates the whole deal from one integer.

### What the leak test sweeps

Three mechanisms, deliberately overlapping, run at every step of complete
matches for every seat, alive and dead:

1. **The permutation test** — the strongest, and the only one that is not a list
   of things somebody remembered to forbid. Build a seat's view; rewrite the
   roles of every player that seat is not entitled to know, keeping the multiset
   legal; build it again. If the projection depends on hidden state in *any*
   way — a field, a derived boolean, a sort order, a string — the two
   serialisations differ. Skipped at game over, and only there, because the
   reveal is supposed to depend on every hidden role by then.
2. **The path walk** — every role/team and every tile token in the serialised
   view is collected *with its JSON path* and matched against an explicitly
   computed allowlist. This catches what the permutation cannot: another seat's
   recorded Peek results are history rather than role, so they survive a role
   permutation unchanged.
3. **The blunt sweep** — for a seat that knows only itself, the exact number of
   occurrences of each role token is computed and asserted. Value-matched, not
   substring-matched: the track counters are *named* `reform` and `seize`, so a
   naive scan for `"seize"` reports a leak on every view ever built.

```
views         12760 projections audited across 24 complete matches, every seat, every step
permutation   8724 role permutations left the view byte-identical
sweep         8724 single-knowledge seats carried exactly their own role token
peek          1349 seat-states held a private Peek result
rules         disclosure checked by name: Rebels, the Dictator at 5/6 vs 7+, Peek,
              Foresight, both legislative hands, and the game-over reveal
OK — 197194 checks passed.
```

**The suite was checked against injected leaks rather than assumed to work.**
Five were added to `view.js` one at a time and the file restored after each:

| injected leak | caught by | first failure |
| --- | --- | --- |
| `players[].role` | path walk + explicit field check | seed 1000, step 0 |
| every seat's `peeked` map | path walk | seed 1000, step 7 |
| the deck contents | path walk + explicit check | seed 1000, step 0 |
| `dictatorAlive: boolean` — no token anywhere | **permutation only** | seed 8919, step 56 |
| `seed` | explicit check | seed 1000, step 0 |

The fourth is the one that matters. It carries no role string, no tile string
and no name; a blacklist would never have found it, and it tells you whether the
Dictator is still standing.

One consequence worth stating: the on-screen event log is `view.log`, which is
`G.log` — the prose the square actually hears. It is **not** the driver's event
stream, which is omniscient (ballots, hands, what a Peek found) and reaches only
`window.__play.eventLog`. Rendering driver events into a visible log would have
leaked every Peek result the human's own power produced.

## One key, three objects

`src/play/interact.js` is the whole input surface for interaction: targeting,
prompting and E. An interactable contributes three functions and no listeners.

```js
{ id, position, canInteract(ctx), getPrompt(ctx), interact(ctx) }
```

Three objects prove the seam is in the right place, because they share every
line of that file and no line of each other:

| object | what it is | live when |
| --- | --- | --- |
| **the podium** | context-sensitive: it *is* the nominee picker, the ballot, the draft and the power target | a decision is pending that is not an acknowledge |
| **the bell** | acknowledge and continue | the morning report, the ballot tally or the Chaos screen is waiting |
| **the bench** | sit and stand. No rules effect whatsoever | always |

The bench is not decoration in the test sense. If the contract only ever carried
decisions it would be a decision system wearing an interaction system's name;
the thing that proves genericity is the object with nothing to do with the
rules.

### Why not three handlers

Three objects with three key listeners is the same amount of code on day one and
a different amount on day ten. Every object added afterwards has to re-answer
questions that are nothing to do with what it does: how close is close enough,
must you be facing it, what happens when two are in range, does the prompt hide
while a panel is open, is E swallowed or does it also walk. Answered per object,
those answers drift, and the drift is felt as *"sometimes E doesn't work"* — the
classic unreproducible bug.

So the rules live once and are testable in node, because `interact.js` holds no
three.js, no DOM and no clock:

```
contract      a half-built interactable, a nameless one and a duplicate id are all refused
range         2.4 m reach, measured on the floor plane; the prompt clears with the target
facing        60 deg cone, verified north and east independently (a sign flip fails one)
close range   inside 0.9 m the facing cone is dropped, so a small turn cannot flicker it
liveness      canInteract() is re-checked at the key press, not trusted from the last frame
overlap       nearest wins; turning between two neighbours hands the prompt over
context       whatever the page passes reaches all three hooks and nothing else does
purity        no DOM, no clock, no randomness — and no mention of podium, bell or bench
```

Two of those are scars rather than tidiness. **Facing is asserted against
compass directions, twice, north and east independently** — Step 3 shipped an
A/D swap that every green test agreed with because the tests and the code shared
one sign convention, and the only defence is to assert against something outside
it. **`canInteract` is re-checked at the key press**, not trusted from the last
frame, because the match runs on its own timer: the podium can go dark between
the frame that targeted it and the key that fires it.

The last line is a grep on the module text: `interact.js` must not contain the
words podium, bell or bench. It failed the first time — the header comment named
all three while explaining how generic the file was.

## The square, the panels, the keyboard collision

`src/play/square.js` follows `course.js`: every piece declared once, building
both the visible mesh and the merged collider, so the two cannot drift. Ground,
a kerb so walking off the edge is not a way to fall out of the game, a dais, a
lectern, a bell post, a bench.

The dais top is **0.22 m**, deliberately under the controller's 0.25 m step
height, so it is stepped onto at full walking speed. A 0.30 m dais would refuse
the player and nobody would understand why.

The bell was moved from the far side of the square to within sight of the dais
during the browser pass. The morning report and the tally are acknowledged
*every single day*: a fifteen-second walk between two things you must both do
every round is not pacing, it is a chore. The bench is the one thing you never
have to visit, so it stays out west.

**A and N are both correct and both mean different things.** A is "Aye" in this
game (v1's binding) and "strafe left" in this engine. The resolution is that a
panel owns the keyboard while it is open, first refusal on every key, and the
body does not move behind it. That also means the match cannot be walked away
from mid-decision — which is right: the square waits indefinitely either way.

The result screen is the only panel that opens itself. Which is how it became
the only bug worth recording here: closing it called `refresh()`, which saw
`phase === 'game_over'` with no panel open and put it straight back. Esc did
nothing, forever. **Found by pressing Esc, not by reading the code**, and fixed
with a once-per-match flag.

## Driving it from the console

`window.__play`:

| call | what it does |
| --- | --- |
| `state()` | the view model for your seat — exactly what the UI is allowed to see |
| `waitingFor()` | the pending decision, or null |
| `submit(action)` | answer it |
| `step()` | one bot action now, ignoring the timer |
| `auto(limit)` | answer everything with its first legal option, to the end |
| `eventLog`, `actions` | the driver's omniscient stream; the recorded human script |
| `restart(seed, players, humanIndex)` | deal a new match |
| `teleport(x,y,z)`, `face(x,z)`, `look()`, `use()` | walk up to something and press E, without a keyboard |
| `where()`, `prompt`, `target`, `seated`, `panelKind` | readbacks |

`look()` exists for a reason worth knowing: `requestAnimationFrame` stops in a
background tab, so a scripted review that teleported and then read `target`
would get whatever the last *visible* frame decided — a wrong answer that looks
exactly like a targeting bug. It cost half an hour before it was diagnosed.
`look()` re-runs targeting on demand and makes the check independent of whether
anybody is watching the window.

The live game object is deliberately **not** exposed. It would make the trust
boundary a suggestion.

## What was verified, and how

Node v20.19.4, macOS. Browser checks against `npm run dev` in a real Chromium
tab, driving `window.__play` and reading results back.

**The frozen pair is untouched.** `diff` against v1 (`../secret-dictator/js/`) is
empty for both `engine.js` and `ai.js` — including `ai.js`, whose 19 lines of
drift recorded in `docs/step-02.md` were resolved by commit `2f5380d` before this
step. `git diff HEAD` on both files is empty.

**The all-bot path did not move.**

```
$ npm test
OK — 28881 assertions passed.       wins { loyalist: 29, rebel: 21 }
$ node scripts/driver-parity.js
PARITY OK — driver.js reproduces the self-test baseline exactly.
```

Plus 24 matches run both ways in `test/human-driver.test.js` — `Driver.playOut`
against a session with `humanId: -1` — event for event identical, with the
session never asking a human anything.

**A whole match, played through the real UI.** Seed 1000, seven citizens, as
Alice (a Rebel, correctly shown Bo as a Rebel and Chen as the Dictator). Bell →
morning report → bots nominate → podium lights up with "cast your ballot" → A →
elected 5–2 → bell → tally → podium → the two Seizes she was passed. Then
`auto()` to the end: 61 steps, LOYALIST on the fifth Reform, an 81-line public
log, the reveal table showing all seven roles. Seed 1019 was used to reach the
panels a single match does not: nominee picker, Speaker's three, Foresight's
three, and a Purge target list — each opened by walking to the right object and
pressing E, each showing the right prompt. Seed 1001 reached the Chaos screen.
The bench sits and stands and changes no phase.

**Every panel was opened through the interaction system, not called directly.**

| decision | object | prompt |
| --- | --- | --- |
| morning report | bell | `E — ring the bell: the morning report` |
| ballot tally | bell | `E — ring the bell: the ballots are open` |
| chaos | bell | `E — ring the bell: chaos takes the deck` |
| nominate | podium | `E — name a Deputy` |
| vote | podium | `E — cast your ballot` |
| Speaker's draft | podium | `E — draft — you drew three` |
| Deputy's draft | podium | `E — draft — you hold two` |
| Foresight | podium | `E — read the deck` |
| Purge | podium | `E — use your power` |
| bench | bench | `E — sit down` / `E — stand up` |

**Movement, on the seam the tests cannot cross.** Holding W moved the body
+0.454 m along +Z at 3.20 m/s; holding D moved it −0.402 m along X — world −X,
which is screen-right at the default yaw, matching the basis Step 3 records.
Both were driven as key events into the page's own handler, so the whole
keyboard → camera-basis → controller path ran. (Keys were injected rather than
typed by a hand — the browser pane cannot hold a key down. It is the same seam
`__walk.basis()` reads back; nobody's fingers have been on it yet.)

**No randomness in the presentation layer.**
`grep -rn "rng(\|Math.random" src/play/ play.html` returns nothing, including
out of comments.

**Nothing else regressed.**

- `walk.html`: basis `forward (0,0,1)`, `right (−1,0,0)`, camera
  `(0, 1.80, −3.50)`; wall head-on stops at z = 11.650; the 35° ramp stalls at
  x = 1.889 with y = 0.000000; the 0.40 m block stops it at z = −2.400; the three
  steps reach y = 0.510 at 3.4998 m/s. Every number is the one in
  `docs/step-03.md`. (The `steps` mark reads y = 0 at 3 s — its own note says
  "walk off it after 2 s", and at 0.8–1.5 s it is on the landing. Not a
  regression; the recorded figure was taken inside that window.)
- `index.html`: seed 1000 at seven citizens still runs to 73 steps, LOYALIST,
  a 31 365-character log — the exact `docs/step-02.md` fingerprint.
- Console clean on a fresh load of all three pages.

**All three entry points build.** `npm run build` emits `dist/index.html`,
`dist/walk.html` and `dist/play.html` sharing one three.js chunk. `npm run
verify` chains the engine suite, the controller suite, the three new suites,
parity and the build.

## Open gaps, stated plainly

- **Nobody has played this with their hands.** Every browser check above was
  scripted or key-injected. Whether walking to a bell fifteen times in a match
  is *pleasant* is a question no assertion can answer, and it is the first thing
  that should be tried on a keyboard.
- **The bots have no collision.** You walk straight through the crowd. The
  square's collider is the ground, the kerb, the dais, the bell post and the
  bench; the citizens are decoration the physics has never heard of.
- **The morning gate is invented, and its cost is real.** It adds roughly
  fifteen bell trips to a match. It earns its place in this step (it is what
  gives the bell a job every round) but it is a pacing decision nobody has
  approved.
- **Ballots-sealed is always 0 of N.** The driver casts every ballot in one
  step, so there is no state in which some are in and some are not. v1 had a
  counter ticking up; recovering it means splitting the vote phase, which would
  change the call order and re-baseline every number in this document.
- **A Peek result gets no beat of its own.** The driver resolves and finishes a
  power in one step, so the result appears in the role card (`you have read X
  rebel`) rather than as a screen. v1 had a "Read in private" panel.
- **The view model is not a wire format yet.** It is JSON and it is safe to
  send, which is the hard half; it has no versioning, no diffing and no
  identity, and it re-serialises the entire log on every call.
- **`interact.js` targeting is horizontal only.** Height is ignored, which is
  fine on a flat square with a 0.22 m dais and wrong the moment there is a
  balcony.
- **Two panels are unproven on screen**: `block_response` has only ever been
  driven headlessly (its constructed position is a node test), and no match in
  the browser reached an Emergency Vote with the human holding it.

## Notes for later steps

- `humanTurn()` is the whole contract between the rules and any front end. A new
  screen should need `kind`, `options` and `detail` and nothing else; if it
  needs to read `G` to draw itself, that is a missing field in `humanTurn`, not
  a licence.
- The `acknowledge` beats are free to move. They consume nothing, so pacing —
  auto-advance, a timer, dropping the morning report entirely — can be changed
  without touching a single number in the determinism proof.
- `view.js` is where multiplayer starts. When `G` moves to a server this is the
  payload; `test/view.test.js` is already the gate on it. Anything added to the
  projection needs a line in the allowlist of the path walk, and the permutation
  test will catch it if it does not.
- Adding chatter still re-baselines everything: `AI.chatter` draws from the
  stream. It is now worse than in Step 2, because the recorded human action
  lists in this document would stop replaying too.
- The badge/ring idiom is copied from `src/app/scene.js` rather than shared. Two
  copies is fine; three is not. When the town square arrives, extract it.
