# Step 15 — Discussion Gate D4: the intent strip, and the exclusion that came off

Work item 2 of `design/handoff/floor-and-hud/README.md`, "The player's turn on
the floor". D2 gave the square a mouth and left one seat out of the
conversation, with the reason written into the code beside the exclusion:

> The human seat is excluded here and nowhere else… In D2 the player has no
> voice yet — the intent strip is work item 4 — and being accused with no way to
> answer is worse than not being accused.

This gate is the way to answer. Two lines came out of `src/engine/orator.js`,
and everything else in this document is what had to exist for them to come out
safely.

```
npm run test:strip     # the new gate
npm run verify         # nineteen now; parity and the frozen five unchanged
node scripts/capture-strip.mjs   # the browser half, with npm run dev on 5173
```

New: `src/engine/intents.js`, `test/strip.test.js`, `scripts/capture-strip.mjs`.
Amended: `src/engine/{floor,orator,index}.js`, `src/play/{floor-voice,murmur,
audio,tray,panels,main,stage,style.css}`, `play.html`,
`test/{orator,murmur,tell,stage}.test.js`, `package.json`, `README.md`.

---

## 1. What the exclusion was actually holding shut

It was two lines in two functions, and lifting them was thirty seconds. What it
unblocked, and what it broke, is the gate.

**Unblocked.** `src/play/stage.js` has carried this paragraph since Gate 14:

> THE HONEST GAP, stated here rather than found later: `src/engine/orator.js`
> excludes the human seat from every target pool… so in a shipped match this
> returns null every time. The staging is built, tested and reachable; what is
> missing is the accusation, and it is one boolean in a file this gate is not
> allowed to touch.

The design doc's rank-1 juice moment — the accusation aimed at you, the bed
cutting to silence, the accuser's lantern lifting, a cool rim finding your
figure, your body turning without your input — has been complete and unreachable
for a whole gate. It is reachable now, and `scripts/capture-strip.mjs` plays
real matches until it happens rather than driving it with `__play.accuseMe()`.

**Broke, and this is the part worth writing down.** Four things went wrong that
the exclusion had been hiding, and none of them was in the two lines:

| what | how it surfaced |
| --- | --- |
| the player's own bubble was silently discarded | `test/murmur.test.js`'s drop rate went from 20% to 35% |
| the player was accused after their turn was spent, four times in five | measured, not guessed: 221 of 269 accusations over 40 matches |
| a floor could no longer be selected in one synchronous burst | the beat has to wait for a person |
| the seed-1000 fingerprint moved | every ordinal after seat 0's first utterance |

---

## 2. The bubble that was thrown away at the pump

`src/play/murmur.js` decided who may hold a bubble with one predicate:

```js
const alive = (id) => {
  const p = view.players[id];
  return !!(p && p.alive && !p.isYou);
};
```

`!p.isYou` is correct for an idle murmur — the square muttering about itself is
not something you overhear yourself saying — and it was written when nothing
else went through that queue. With the exclusion lifted, every one of the
player's own answers was cued into the queue and then dropped at the pump,
counted as "a line that never reached the screen".

The number is the finding. `test/murmur.test.js` asserts that no more than 25%
of floor lines are lost to the two-bubble cap, and it went to 35%. The first
three things tried were all wrong and all plausible:

```
beat 1500-2600  life 4200-5400  ->  35% dropped   (shipping bands)
beat 1800-2800  life 3600-4600  ->  33% dropped
beat 2000-3000  life 3400-4400  ->  30% dropped
```

Retuning the deliberation bands barely moved it, which is what said the cap was
not the problem. Turning the strip off and re-running gave **30%** — still over
the threshold — so the regression was not the strip either: it was the human
seat being in the argument at all, and a third of that argument going into a
predicate that threw it away.

One line fixed it, and the fix is a rule rather than an exception: **your own
figure may hold a floor bubble and may never hold an idle murmur.** The drop
rate came back to 20%, below where it was before the gate.

> **pattern → detection rule.** A predicate written for one producer, reused by
> a second producer added later. The detection rule that caught it was already
> in place and is worth naming: a suite that reports a RATE rather than a
> boolean. "35% of floor lines never reached the screen" is a sentence; "the
> bubble cap holds" would have been green.

---

## 3. The right of reply, which is a decision this gate made

Not in the handoff. Written down here because it changed the shape of the
record.

The strip's whole premise is the objective line the staging swaps in — *Chen
names you — answer on the floor.* `beatOrder` gives everybody one turn in seat
order, so being named after your turn is spent is the ordinary case, not the
edge. Measured over 40 matches with the player answering:

```
accusations aimed at the human seat        269
…that arrived while they still had a beat   39
```

Four times in five the square would have turned to look at you, gone quiet, lit
you, told you to answer — and offered nothing to press. That is the exact
failure D2 refused to ship, arriving through a different door.

So an accusation aimed at a seat a person is sitting in buys that seat a beat,
immediately after the accuser, **once per floor**. It is the same mechanism and
the same budget rule the handoff already blesses in the other direction — "the
accuser gets a free follow-up beat, appended to this floor" when the answer is
silence — pointed at the person instead of at the bot. With it, 99 of 269.

Two things keep it honest:

- `Floor.grantFollowUp` grows the floor's beat budget (capped at six) rather
  than taking the beat off somebody else;
- it is gated on `ctx.awaitHuman`, which only the caller that is actually going
  to show somebody a strip and wait ever sets. **An all-bot match cannot reach
  it**, and `test/strip.test.js` asserts that against 552 all-bot floors rather
  than against the flag.

The staging fires only when the beat exists. An accusation that opened no beat
gets its bubble and nothing else — no hush, no rim, no line promising an answer
that is not on offer.

---

## 4. The strip: a choice function, not a form

`src/engine/intents.js` is a pure function of the public record plus the
utterance that prompted you, returning four to six slots. It renders nothing and
knows no key: each slot is a `text_id` and a complete `Floor.speak` fields
object, so the acceptance line "its contents are testable without a renderer" is
the module's shape rather than a property of the tests.

### The safety property, and the two ways to have it

> A slot is offered only if the schema would accept the resulting utterance — so
> the strip cannot produce an invalid claim.

There are two ways to hold that. Re-derive the validity rules in the strip — two
implementations of one law, and the classic way a fuzz sweep goes green against
a strip that is wrong in the same direction as its test. Or ask the constructor.

`Floor.attempt(record, fields)` runs the **real** `speak()` and unwinds it
exactly. Every candidate below has therefore already been accepted by the same
code that will accept it for real, on the same record, in the same beat.

The unwind is the hazard: it is only honest if it is exhaustive, and the list of
what `speak()` writes is a comment, and comments rot. So `test/strip.test.js`
does not trust it. It serialises the whole record before and after every strip —
1,109 of them — and requires it byte-identical. That is a statement about the
record rather than about the paragraph beside the rollback.

An earlier version cloned the record per candidate. With ~25 candidates a beat
and a record that grows all match, that is a JSON round trip through a 30 KB
object twenty-five times per beat. The mark-and-restore is O(1) in the record's
size and is what makes the fuzz sweep run in seconds.

### The six slots

| slot | kind | offered when |
| --- | --- | --- |
| answer | varies | something was said to you, and one of the candidates validates |
| accuse | ACCUSE | some citizen has a basis stronger than `gut` |
| claim | CLAIM_HAND | you sat in a resolved government you have not claimed |
| question | QUESTION | someone has an unclaimed hand or an unexplained ballot |
| support | SUPPORT | someone backed you or shares a government with you |
| silence | SILENCE | always, always last |

The order is not decided anywhere in the builders: they are held as a list in
that order and the strip is that list with the nulls removed. There is no branch
below that can put silence anywhere but last.

**Slot 1 is the interesting one.** The schema has five kinds and none of them is
called "denial", so an answer has to *be* one of the five. Which one is decided
by what was said to you: an accusation over a government you sat in and have not
claimed is answered with **your hand** (from your own private memory, never a
fabrication — no memory row, no claim); everything else is answered with a
**QUESTION back at the accuser about the accusation itself**, which is the
strongest legal reply a schema of five kinds has. It names them, and it obliges
them to take the first beat of the next floor.

The sentence is fixed off the prompt's basis and does not change when the
mechanics do, which is what the brief asks for — "a `vote_pattern` charge gets
an answer about votes" — and what the promise requires: what you read is what
you said.

**The three ladders are shared, not copied.** "The strongest basis the record
supports" is one question with one answer, so `accuseBasisFor`,
`supportBasisFor` and `questionAboutFor` were split out of `src/engine/orator.js`
and both callers walk them. `accuseFields` picks *who* with a mind and a draw;
the strip picks *what*, from the public record alone, and takes neither.

### One thing deliberately not done

The counts submenu is in canonical order and does not put the truthful hand
first, and does not mark it. Reordering by truth is the player's own information
and would leak nothing — but the *shape* of a submenu that reorders itself is a
channel, and the private card already shows your hand while you hold it. Fixed
order, learnable, no channel.

---

## 5. The oil line, and the line drawn once

A 2px brass rule under the tray, burning down over 12s. It does not flash, pulse
or change colour: there is exactly one declaration in the style sheet that ever
moves, a width, and there is no transition, no animation and no second colour in
the block. The pressure is `HUSH.floor` — the crowd murmur fading out over the
last three seconds, which is the one thing in `src/play/audio.js` with a
`fadeMs`, because a 120 ms duck is an event and this is a slope.

**The clock is fed from `nowMs()`, not from a frame delta.** `pumpStage` is
called from three places on purpose — the render loop, the 40 ms stage clock,
and the match tick — because `requestAnimationFrame` does not run in a
background tab or a scripted review pane. A burn measured in frame deltas would
be added twice a frame in a visible tab and the beat would run out in six
seconds instead of twelve. Measuring elapsed clock makes every extra caller
idempotent, and it inherits the ledger's pin for free: that clock stops, so the
beat stops with it.

**And the line the whole setting question turns on.** The beat only burns while
the floor is the one thing on the table:

```
waiting on a rules decision   the beat holds
a centred card is open        the beat holds
the ledger is pinned          the beat holds
an armed tray row             the beat holds
nothing else owed             the beat burns
```

That is what makes "no rules decision has a clock in either setting" true rather
than asserted. Without it, an accusation landing while you owe a ballot would
put a 12-second clock on the ballot by the back door. `test/strip.test.js`
tabulates all ten situations; `scripts/capture-strip.mjs` is what proves the page
runs the table.

"The floor waits for you" replaces the rule with static brass and holds the beat
indefinitely. Ten minutes of presentation clock, sampled every 250 ms: zero
expiries, zero fades, zero shortenings, record byte-identical.

---

## 5b. The browser half: what `scripts/capture-strip.mjs` measured

Everything above is headless. None of it is evidence that a bot ever names YOU
in a shipped match, that the Gate 14 staging fires when one does, or that the
strip is on screen when the schedule says. So the capture plays real matches
until it happens, and measures the rest in the page.

**The headline, reproducible.** `design/reviews/gate-15-strip/01-accused-strip.png`
— **seed 1002, 7 citizens, seat 0, day 2**: Chen names you on `basis: gut`, the
staging runs its whole schedule, and the strip is in the tray with the answer
highlighted.

```
STAGING LIVE   from seat 2, done { hush, lantern, rim, turn, camera, objective },
               offsets { hush 0, lantern 60, rim 140, turn 200, camera 220,
                         bubble 300, objective 380, strip 700, last 700 },
               stripUp true
SLOTS          answer:QUESTION(accusation) · question:QUESTION(hand) · silence
CARDS          1 "A feeling. That is all you brough…"  2 "Ask 3 Chen ▸"  3 "Say nothing ⌀"
SECOND LINE    "A feeling. That is all you brought, and you know it."  ·  basis: accusation
SUBMENU        2 Bo · 3 Chen · 4 Dara · 5 Eze · 6 Fin · 7 Gita   (1 is you, not offered)
```

**The 700 ms cap, and the instrument that could not answer it in one number.**
`arrival.opensAt` is the trigger plus exactly 700 ms on every staged beat, which
is the schedule. What the page then does with it is a different claim, and a
single reading of "918 ms late" on a headless browser whose median frame is
145 ms is eight frames, not a finding. So the lateness was sampled over a burst
of ordinary beats and reported against the frame interval it was taken at:

```
ARRIVAL LATENESS   33 beats: median 60 ms late, p95 184 ms, max 2580 ms
                   frame median 145 ms, p95 169 ms
                   -> median lateness = 0.41 of one frame
```

The pump keeps up: the typical arrival is inside half a frame of its mark. **The
tail is real and it is not a defect**: the maximum is the case where the
accusation staged while a *previous* beat was still on screen, and a second
strip cannot open until the first is answered. That is the right behaviour and
the wrong number to quote as "the arrival", which is why the median and the
frame interval are printed beside it.

**The oil line, both halves.**

```
OWED MEANWHILE    "vote"          the rules were waiting on this seat too
HELD WHILE OWED   24 samples, the rule moved by 0.000000, never once the player's
OIL RAN OUT       true, 22.4 s of wall clock for a 12 s rule
OIL SAMPLES       78 burning samples, monotonic, 0.94 -> 0.008
SILENCE RECORDED  u-6 SILENCE prompted_by accusation, explicit FALSE,
                  "Alice said nothing."   silences { explicit 0, timeout 1 }
```

The first block is the acceptance line for "no rules decision has a clock": a
ballot was owed, the strip was up, and the rule did not move a pixel. The second
is the burn — and **22.4 seconds of wall clock for a 12-second rule** is the same
statement from the other side: the beat only burns while nothing else is owed,
and the ten seconds of difference are the rules decisions that stopped it.

**"The floor waits for you."** Setting on, beat left alone for 14 s — more than a
whole oil line — the record byte-identical before and after, the strip still up,
`left: 1`.

**The warm budget, measured on the same frame twice.**

| night frame, `trial` forced, podium mark, HUD composited | warm % | lit % |
| --- | --- | --- |
| with the intent strip in the tray | **8.93** | 22.51 |
| the same frame, strip answered | 7.83 | 22.97 |
| | **+1.10** | |

Under the 10% ceiling with 1.07 points to spare. The strip's own cost is 1.10
points, and it is spent almost entirely on one thing: the highlighted card is
`--gold` on a brass hairline, which is the style bible's rule (warm light is
attention) pointed at the one card `E` will speak. Everything else on the row is
parchment, and the oil line is a 2px brass rule.

**Console clean** apart from four Chromium `GPU stall due to ReadPixels`
warnings, which are the screenshot reading the buffer and not the page.

---

## 6. What silence costs, and what the control is

Four consequences, all observable, no hidden number:

| cost | how it is checked |
| --- | --- |
| logged by name | the ledger's own fold, split by `explicit` — 825 of 825 |
| the accuser gets a free follow-up beat | granted on the floor, matched per floor to a stonewalled accusation |
| two silences make you a legal target for `basis: silence` | **by constructing one**, mid-floor, through the real constructor |
| silence after a QUESTION does not discharge it | 141 questions still owed after being met with silence |

The third one is the one that needed thinking about. "An accusation that could
not otherwise be constructed" is a claim about **constructibility**, not about
bots choosing it — the accuse ladder prefers a ballot to a silence, so a bot
actually picked `basis: silence` once in twenty matches. Asserting on the bot's
choice would have been asserting on the ladder's ordering. So the probe builds
the accusation itself, inside a live floor, and reads the *reason* for a refusal
rather than the yes/no: a refusal on "the floor is not open to seat 3" says
nothing about the basis. What must be true is that the basis is never the thing
that refuses a pair of floors the player really was quiet on (781 accepted) and
always the thing that refuses one they were not (648 refused).

**The control is the sharper half.** A free beat changes the shape of a floor,
so what has to be true is not only "silence buys one" but "nothing else does".
552 all-bot floors over the same seeds granted zero, and in a played match every
follow-up is matched *per floor* to its justification — an accuser's second beat
to a silence that stonewalled them, a right of reply to an accusation aimed at
the player. A total that agreed without a per-floor match would let a free beat
appear somewhere nobody was stonewalled, which is how the first version of this
check passed while the two mechanisms were indistinguishable in one list.

---

## 7. The fingerprint moved, and why that is the expected answer

`docs/step-10.md` quotes `C3:u-18:u-17:g-2` for seed 1000, 7 citizens. That id is
now historical. The new one is **`C3:u-22:u-16:g-2`**.

The lie is the same lie:

```
seed 1000, 7 citizens: Chen (seat 2) was passed {reform 1, seize 1} as Deputy of
g-2 and claimed {reform 0, seize 2} — "no choice". The Speaker's own account
disagrees, and C3 flags the pair [2,3] without saying which of them lied.
```

Same citizen, same government, same rule, same pair, same class. Only the
*address* changed, which is exactly what an ordinal is: seat 0 is declared human
in that check, the human seat now speaks and is spoken to on the same floors, and
every utterance ordinal after the first of them shifts by however many beats seat
0 took.

**What did not change:** the engine. `test/orator.test.js`'s invariance sweep
still plays fifty seeds twice, floor off and floor on, and requires byte-identical
event logs, winners and step counts — 4,646 utterances over 1,459 floors on the
"on" side, and the positive control that hands selection the game's own stream
still diverges on 50 of 50. `npm run parity` reproduces the self-test baseline
exactly. The five frozen engine files are byte-identical to
`../secret-dictator/js/`. Speech still changes no rule.

**What did change and is expected to:** with `humanSeat` set, the utterance
record differs from D2's, because a seat that used to be silent and untargeted
now takes beats and is named. Any all-bot record — anything without `humanSeat`,
which is every headless sweep and every seed fingerprint in the repo — is
untouched, because `targets()` and `beatOrder()` with `humanSeat: null` were
already the unfiltered versions.

---

## 8. Detection rules this gate leaves behind

- **A predicate written for one producer, inherited by a second.** `!p.isYou`
  was right for idle chatter and silently wrong for the player's own answer.
  → When a queue gains a second producer, re-read every filter on the CONSUMER
  side, not only the producer's own path.
- **A rate is a finding; a boolean is a green light.** The bubble regression was
  found by a suite that reports "35% dropped", not by one that asserts "the cap
  holds". → A cap with a budget under it should report the budget.
- **Two mechanisms in one list are indistinguishable in a total.** The follow-up
  list holds both the cost of silence and the right of reply. A count that
  matched in total hid twelve unjustified beats. → Match per occurrence, and
  name what each occurrence is for.
- **A dry run is only as honest as its unwind.** → Never trust the list of what
  a function writes; serialise the whole structure before and after and diff it.
- **A clock fed by a frame delta, pumped from more than one loop, runs at N×.**
  → Feed presentation clocks from elapsed time, never from deltas, whenever more
  than one caller may pump them.
- **A claim about "constructible" is not a claim about "chosen".** → Probe by
  constructing, and read the reason for a refusal rather than the refusal.
- **Vite HMR destroys the page's execution context mid-capture.** Third
  occurrence in this project (see `browser-review-hazards`). Two runs of
  `scripts/capture-strip.mjs` died on "Execution context was destroyed" because
  source files were being edited while it hunted. → Finish the edits, then
  capture.
- **A WebGL canvas read after compositing is blank.** The first version of the
  capture's warm measurement did `drawImage` off `#stage canvas` and reported
  **0.00% warm** — a number that looks exactly like a pass. → Read the
  screenshot back, which is also the only way to include the DOM HUD the budget
  is actually about.
- **A forced lighting state applied while a staged view is in flight is
  overwritten a frame later.** The night frames came back 22% and 32% warm on
  two shots that were supposed to be the same frame. → Stop the match, let the
  staging land, then force the state — the order `scripts/capture-warm.mjs`
  already had.
- **Two projections of one object, handed out from two places, drift.**
  `floor-voice` returned `{ seat, from }` from `say()` and the full pending
  shape from its getter, so the page's "did this accusation open a beat" check
  read `undefined` on the commonest path there is. It cost two acceptance runs.
  → One shape, one function, handed to both callers.
- **A single timing reading on a 9 fps page is not a measurement.** "918 ms late
  of a 700 ms cap" was eight frames. → Sample the distribution and print it
  beside the frame interval; report lateness in FRAMES as well as milliseconds.

---

## 9. Open verification gaps

Stated rather than closed.

- **The strip's arrival is verified against its own schedule, not against a
  60 fps display.** `arrival.opensAt` is trigger + 700 ms exactly, and the
  observed lateness over 33 beats is a median of 60 ms against a 145 ms frame —
  inside half a frame of the instrument. Every measurement in this gate was
  taken in headless software GL at ~7 fps. **UNVERIFIED on real hardware**; it
  needs one capture on a machine painting at 60 Hz, or an eyeball.
- **The 44 px rise and the 140 ms ease are CSS and have never been watched.**
  They are asserted as declarations (`ACCUSE.stripMs`, `ACCUSE.stripRise`) and
  the keyframe is in the style sheet, but "does the strip rise or does it pop"
  is a taste question that a screenshot cannot answer. **Needs an eyeball.**

- **The two human acceptance criteria are not measurable here.** "A first-time
  player, uninstructed, answers within 10 s, over ten testers" and "a third-match
  player answers within 2 s at least half the time" need ten testers. Everything
  the strip can do to earn them is in place — stable order, slot 1 is always the
  answer, the sentence printed before it is spoken — and none of it is evidence
  that a person is fast. **UNVERIFIED, and it needs playtesting, not a test.**
- **The slot count is 2 to 6, not 4 to 6.** The brief says four to six. Early in
  a match, before any government has resolved and before anybody has spoken,
  there is genuinely nothing to accuse on and nothing to claim: 27 of 1,109
  strips offered two cards. Padding them would mean offering an intent the record
  does not support, which is the one thing the strip may not do. Reported rather
  than fixed.
- **`basis: silence` is constructible but almost never chosen.** The accuse
  ladder prefers `vote_pattern` to `silence`, so a citizen who never speaks is
  usually named for how they voted instead. The cost of silence is real and
  reachable; the bots are not yet built to reach for it. That is an orator
  question, not a strip question.
- **The strip does not offer the `amends` path.** A player who claimed a hand and
  wants to change their story cannot, because the strip only offers governments
  they have not claimed. C5 exists for exactly that case and the schema supports
  it. Deliberately out of scope; it is a seventh slot.
