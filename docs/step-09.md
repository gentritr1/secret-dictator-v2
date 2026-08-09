# Step 09 — Discussion Gate D1: the structured claim schema

The first work item of `design/handoff/floor-and-hud/README.md`. Speech becomes
canonical engine data: validated claims, contradiction flags, floor scheduling
and a per-citizen ledger, all replayable from a seed and all invisible to the
running game.

```
npm run test:floor     # the whole gate
npm run verify         # thirteen gates now; parity and the frozen five unchanged
```

Nothing renders. Nothing in `src/play/` imports it. `play.html` is byte-for-byte
the game it was yesterday, which is a requirement of this stage rather than an
omission — see the staging note below.

## The engine-extension decision

`src/engine/` has been byte-frozen since Step 1. Two files (`engine.js`,
`ai.js`) are held identical to v1 so the v1 self-test still proves them; three
more (`driver.js`, `human-driver.js`, `view.js`) were written here but are held
by `scripts/driver-parity.js`, which replays the self-test's exact fifty
seed/player-count pairs and fails unless the wins, endings and average step
count come back identical.

This gate is the first deliberate **extension**, and it is a new file rather
than an edit: `src/engine/floor.js`, UMD like its siblings, requiring
`./engine.js` and nothing else.

**What parity still guards, and what it cannot see.** Parity is a statement
about the all-bot call order into the engine and the AI. It would catch this
module if it drew from the seeded stream, called an AI hook, or wrote to the
game object — every one of those shifts a later draw. It cannot see anything
else. It has no opinion on whether a claim is valid, whether a flag is a
verdict, whether the ledger is a fold or a store, or whether the record leaks a
role. So the module is guarded by three things parity does not provide:

- a grep gate on the module text (no `Math.random`, no clock, no `.role`, no
  `.team`, no `.peeked`, no `fullReveal`, no `knownRoles`, no seed, no hand, no
  deck contents, and no reach into `ai.js`/`driver.js`/`view.js`);
- a **public window** — everything the record is folded from arrives through one
  whitelist function, `publicSnapshot(G)`, so a leak has to be added there on
  purpose, exactly the argument `view.js` is built on;
- the permutation test, extended from `test/view.test.js` to the whole record.

The grep gate failed on its first run, on this file's own header comment, which
spelled the forbidden token while explaining that the code never uses it. That
is the **third** time a banned token in a comment has broken its own gate in
this project. The comment now says so out loud, in the comment.

## The staging amendment — and the contradiction it resolves

The handoff carries a latent contradiction, and it is worth stating rather than
resolving:

- its rationale says speech must eventually influence what bots believe — that
  is *why* it is canonical data rather than decoration;
- its acceptance list for this work item demands that "a match with the floor
  disabled produces the same event log as the same seed with it enabled".

Both are right, at different stages. **This is the pre-coupling stage.**
Utterances are canonical, validated, recorded and analysable, and no bot
rules-decision reads them. The invariance test is therefore the load-bearing
acceptance here: fifty seeds played twice, plain and with the whole layer
running, event log for event log identical.

A later gate (belief coupling) will **deliberately flip that test into a
controlled-divergence test**: the same fifty seeds, and the logs must then
differ, in a bounded and stated way. When that day comes, the check to change is
`invariance` in `test/floor.test.js`, and the thing that must not change with it
is the probe beside it — the control that hands the speech layer the game's own
seeded stream. That control proves the comparison can see a difference at all,
and it stays useful in either direction.

The practical consequence for this stage: `src/engine/floor.js` never receives
`minds`, never calls `ai.js`, and draws no randomness whatsoever. Every random
choice in the sweeps comes from the test's own generator. That is the same
discipline `src/play/murmur.js` follows for the same reason, one layer down.

## Schema decisions worth remembering

**Seat numbers, ids, `text_id` — never names, objects or prose.** An utterance is

```js
{ id: "u-14", day: 4, floor: "f-6", seq: 2, speaker: 3, kind: "CLAIM_HAND",
  target: null, basis: null, refs: { government: "g-3" }, amends: null,
  text_id: "claim.speaker.honest",
  seat_role: "speaker", drawn: {reform:1,seize:2}, passed: {reform:1,seize:1},
  received: null, blocked: null, enacted: "seize" }
```

`text_id` rather than a sentence keeps the record small, translatable and
diffable, and means the bubble, the log and the ledger render one utterance
without three copies of the prose drifting. It is validated against a pattern
(`^[a-z0-9_]+(\.[a-z0-9_]+)*$`), so prose cannot be smuggled through the field
that exists to keep prose out.

**The allowlist is the schema, not a policy.** `speak()` rejects any key that is
not on the per-kind list before it writes anything, so `role`, `team`, a true
hand, `confidence`, `suspicion`, `weight` and `sincerity` are unrepresentable
rather than discouraged. A second, deliberately overlapping mechanism —
`auditRecord()` — walks the whole record for forbidden keys at any depth and for
hidden-state tokens used as values. Two mechanisms that agree are worth more
than one that is trusted; the sweep is mutation-tested with five injected faults
and reports all five.

**`id`, `day`, `floor` and `seq` are engine-assigned.** A caller that supplies
one is refused. Ordinals are the record's identity and a caller that can pick
them can forge a reference.

**Validity is construction, not validation.** V1–V6 are checked before the
utterance object is appended, and V5 (dead) and V6 (the floor is not open to
you) are checked *first*. That ordering is right — a dead citizen's malformed
claim is refused for being a dead citizen's — and it is a trap for tests: the
first version of the V3/V4 rejection block reused one seat that had already
spoken, so three assertions expecting `V3` and `V4` were quietly reading `V6`
and passing for the wrong reason. Every rejection now runs on a fresh floor.

**Two spec ambiguities, resolved explicitly.**

*C4, "claimed draws exceed deck composition".* The deck reshuffles: `ensureDeck`
puts the discard back when it runs low, so a running total across a whole match
would false-positive on an honest table. Resolved as: count claimed draws inside
a **reshuffle-free window** (the discard going back in is publicly visible as
`deckCount` rising) and flag when the window total exceeds the engine's own
`SD.DECK_REFORM` / `SD.DECK_SEIZE`. That bound is conservative — the whole deck
never holds more than that of each tile — so the flag cannot fire on an honest
table, which is the right side to err on for evidence. The alternative was a
per-claim bound, which is vacuous: a three-tile draw can never exceed six.

*C5 versus V4.* V4 forbids a second `CLAIM_HAND` on one government unless
`amends` is set, which makes C5's literal condition ("later claim differs,
`amends` unset") unreachable through the constructor. Resolved as: C5 fires when
a later claim differs from an earlier one by the same speaker on the same
government **and `amends` does not name that earlier claim** — an amendment that
points somewhere else is a changed story wearing a correction's clothes. The
literal unamended case is kept in the flag engine, because `contradictions()`
also runs over records it did not build (a replay, a saved match, a future wire
format), and it has its own fixture built by pushing an utterance into the
record from outside. The alternative — deleting C5 as unreachable — would have
left a rule in the spec with no code and no test.

**A flag names a rule and its refs and stops.** There is no verdict field, no
confidence and no ranking. The strongest statement of that is a check rather
than a comment: the C3 fixture is run again with the two accounts' seats
swapped, and must produce the same flag. If the flag could name a liar, the
mirror would disagree.

**The ledger is lists, not numbers.** Every field is a list of ids that traces
back to a public utterance or a public record entry — governments sat in,
ballots cast, claims made, accusations given and received, questions, explicit
silences and timed-out silences kept apart, open obligations, flags. The test
asserts the *shape*: no ledger entry may carry a number except `seat`. "No score,
no trust meter, no percentage" is then a property of the data rather than a
promise in a doc comment.

## What the fold reads, and how it is cross-checked

The engine has no notion of a "government": there is a phase machine, a
`lastVote`, a `lastEnacted` and a log. `observe(record, G)` folds those public
scalars plus `G.log`'s kinds and meta (the same log `view.js` projects in full,
minus its prose, which carries names) into a public record of governments,
powers, purges, chaos enactments and deck windows.

That fold is checked against a **different representation**: the driver's own
event stream, built by different code from different fields at a different
moment. Speaker, nominee, resolution and enacted tile must agree for every
government of every match, the record's enactment count must equal the board,
and its purge count must equal the dead. A fold checked against itself agrees
with its own bugs — the same lesson `test/view.test.js` learned about
cross-checking disclosure against the engine's own answer rather than a
re-derivation.

### The bug that fold found, and what caught it

`mark(pending, 'power_announced', { power, seat, kind: pw.kind })` — the detail
key `kind` overwrote the event's own `kind`, silently renaming a
`power_announced` event to `purge` and firing T5 twice for every purge. Nothing
threw. The event stream looked plausible. It was caught by counting trigger
firings against recorded purges and finding 34 against 20.

`mark()` now throws if a detail key would shadow `kind`, `serial` or `day`. The
detection rule that generalises: **when a count and its cause can be counted two
ways, count them two ways** — a plausible-looking derived stream is not evidence
that the derivation is right.

## Three more instrument failures, recorded

1. **The invariance test failed on all fifty seeds, for a formatting reason.**
   `Driver.playOut` stamps `ev.n` on every event; the floor-enabled run stepped
   the driver by hand and did not. Both logs were correct games. Had the shapes
   matched by luck instead, a real divergence could have hidden behind the same
   difference. The comparison now stamps `n` itself, with a comment saying why.

2. **T4 and T5 opened zero floors** across fifty matches while powers and purges
   happened on every seed. The harness acknowledged the morning report *before*
   running the floor for the transition that had just happened; acknowledging
   publishes a new transition, and the power or purge was swallowed by it. The
   floor for the event that just happened now runs first. The scheduling line in
   the output prints the per-trigger counts precisely so a zero is visible.

3. **The obligation cap was never exercised.** A citizen may take a second beat
   on one floor only if a QUESTION obliged them, and 498 floors opened with an
   obliged citizen without a single second beat being taken: the synthetic
   speaker appended the obliged seat at the *end* of the beat order, and a
   three-beat floor with seven citizens is full long before the tail. Appending
   at the end looks tidier and tests nothing.

All three are the same shape, and it is the shape Step 4 wrote down: **a probe
that cannot reach the code it is aimed at reports green.** The defence used
throughout this suite is to print the count next to the claim — 50/50 diverged,
1459 floors by trigger, 405 second beats and every one obliged, 478 of 4000
fuzzed claims accepted — so an inert probe reads as a zero rather than as a pass.

## The integration seam

`human-driver.js` is frozen, so there is no hook inside the session. The play
layer gets a companion object instead:

```js
const rec = Floor.createRecorder();
rec.observe(G);                 // after every step
rec.acknowledgeMorning(day);    // the session's own gate, for T1
rec.triggers();                 // which floors may open, and whose beat is first
rec.openFloor(spec);            // nothing opens one by itself
rec.speak({ ... });             // validated, appended, frozen
rec.flags(); rec.ledger(); rec.audit();
```

Nothing in `src/play/` calls any of it this stage. What the suite checks is that
the facade is the *same code path* as the functional API — a whole match run
through the recorder must produce a byte-identical record and ledger — so a
future caller cannot get a second answer from the convenient door.

`triggers()` is deliberately a report, not an action: it hands back the trigger
id, its beat budget and whose beat comes first, and something else decides. T6
is not an opener at all — it prepends the questioned citizen and buys a beat on
whatever floor opens next, which is what "carries over" means.

## Verification, and what it was run against

Node v20.19.4, macOS. Browser check in a real Chromium tab against `npm run dev`.

**The frozen five are untouched.** `git diff main..HEAD` over
`engine.js`, `ai.js`, `driver.js`, `human-driver.js`, `view.js` is empty, and
`diff` against the v1 oracle (`../secret-dictator/js/`) is empty for both files
it covers — md5 `48371790f0ea17bacfc3116c7722bcaf` and
`598b210781140213e8a5039dccf3873d`, identical on both sides.

**Thirteen gates, all green.**

```
npm test                28881 assertions
test:controller            50 checks
test:human               1055
test:contract            6139
test:view              198201
test:interact              31
test:objective          65715
test:pace               30588
test:murmur              1522
test:ambience           15535
test:glb                 1283
test:floor              16966          <- new
parity                  PARITY OK — driver.js reproduces the self-test baseline exactly
build                   four entry points
```

`test:floor`'s own summary:

```
fold          50 matches: 693 governments, 169 powers, 30 purges — cross-checked
              against the driver's own event stream
allowlist     4303 utterances over 50 matches and 1459 floors
              kinds {ACCUSE:1443, CLAIM_HAND:328, QUESTION:873, SILENCE:840, SUPPORT:819}
mutation      five injected faults, all five reported
permutation   24 matches folded twice (977 role rotations, 1970 utterances):
              stream, ledger, flags and public record byte-identical; control diverged
validity      4000 fuzzed claims: 478 accepted and independently re-derived as valid,
              3522 refused {V1:919, V2:876, V0:721, V3:621, V5:385}
contradiction C1-C6 each fired on its fixture and stayed silent on its near miss
replay        12 human-seated matches recorded and replayed: 948 utterances and every
              ledger entry byte-identical; a differently-played fork diverged
invariance    50 matches played twice, floor off and floor on: identical event logs,
              winners and step counts, 4303 utterances spoken on the "on" side
probe         50/50 matches DIVERGED when the speech layer was handed the game's
              own seeded stream
scheduling    1459 floors {T3:328, T4:139, T1:643, T2:327, T5:22}: six beats per floor,
              one per phase transition, 405 second beats, every one obliged by a QUESTION
seam          the recorder facade built a byte-identical record and ledger
module        no randomness, no clock, loads only engine.js, names no hidden state
```

**The game is unchanged, checked at the runtime rather than in the diff.** Seed
1000, seven citizens, human at seat 0, `auto()` to the end:

```
node     steps 61  decisions 38  winner loyalist  log 81 lines
browser  steps 61  decisions 38  winner loyalist  log 81 lines   (play.html, Chromium)
self.SDFloor === undefined                                        (the layer is not loaded)
```

which is the `docs/step-04.md` fingerprint exactly. `self.SDFloor` being
undefined in the page is the positive statement of this stage's boundary: the
utterance layer is not merely quiet in the running game, it is not there.

## Open gaps, stated plainly

- **Nobody has read a claim.** Every utterance in every sweep came from a
  synthetic speaker written for the test. Whether the schema can express what a
  bot actually wants to say is D2's question and is not answered here.
- **C6 is two concrete cases, not the rule.** "Accuses on a basis their own prior
  claims contradict" is implemented for `basis: enactment` only — the Speaker who
  says they passed two Seize and then blames the Deputy, and the Deputy who says
  they held a choice and then blames the Speaker. Other bases have no computable
  self-contradiction yet. The rule is under-implemented, deliberately, rather
  than guessed at.
- **T1's "most unanswered flags" counts flags, not answers.** A flag is
  "unanswered" here if it names a living seat; nothing marks a flag as addressed
  when its subject speaks to it. That needs a definition the handoff does not
  give.
- **The obligation discharge rule is a decision, not a quotation.** Anything the
  questioned citizen says discharges the obligation, silence included — the
  handoff says silence after a QUESTION is "recorded distinctly and is the most
  expensive", which implies it counts as an answer for scheduling. It is recorded
  distinctly; whether it should also *carry* is a design call nobody has made.
- **Floor scheduling has never run against a clock.** The triggers, the caps and
  the beat order are pure functions and are tested as such. What a six-beat floor
  *feels* like at the pace `src/play/pace.js` sets is unknown and unknowable from
  here.
- **The ledger has no wire format.** Like `view.js` before it, it is plain JSON
  and safe to send, which is the hard half; it has no versioning, no diffing and
  no identity, and `ledger()` recomputes every flag on every call.
- **`publicSnapshot` re-serialises the whole log on every observation.** Fifty
  matches take under a second, so it has cost nothing yet. It is O(log length)
  per step and the log grows all match.

## Notes for later steps

- The invariance test is the one to change at belief coupling, and only that one.
  The probe beside it stays.
- A new utterance kind means a new entry in `EXTRA_KEYS` and a new validator —
  `speak()` refuses any field not on the per-kind allowlist, so a kind that
  forgets to declare its fields fails loudly at the first construction rather
  than quietly at the first leak.
- The fixture idiom (`fixture()` / `openSix()` / `nextBeat()` in the test) pokes
  the record's fields directly. That is deliberate and safe *because* the record
  is plain JSON with no private state — the same property that makes it
  replayable. If the record ever grows a closure, the fixtures break, and that
  break is the warning.
- `refs.flag` is the one reference that is not an ordinal id: flag ids are
  computed (`C3:u-4:u-7:g-3`) and are validated against the flags that currently
  hold rather than against the id pattern. A flag id is stable for a given
  record, but it is not an address — do not persist one.
