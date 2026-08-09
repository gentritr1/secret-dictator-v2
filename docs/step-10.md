# Step 10 — Discussion Gate D2: the bots start speaking

Work item 2 of `design/handoff/floor-and-hud/README.md`. D1 built a claim schema
and nothing filled it in; its own open-gaps list opened with **"nobody has read
a claim"**. This gate answers that: floors open at real triggers during a real
match, bots choose what to say from the public record and their own minds, some
of them lie about their hands, the contradiction rules catch some of the lies,
and all of it arrives over the citizens' heads in the bubbles Step 8 built.

```
npm run test:orator    # the new gate
npm run verify         # fourteen now; parity and the frozen five unchanged
```

New: `src/engine/orator.js`, `src/play/floor-voice.js`, `test/orator.test.js`.
Amended: `src/engine/floor.js` (two owner-locked spec changes), `src/play/main.js`,
`src/play/murmur.js`, `src/play/style.css`, `src/engine/index.js`,
`test/floor.test.js`, `test/murmur.test.js`.

---

## 1. The subtlest thing in this gate: what the permutation test now means

D1's permutation gate asserted this:

> rewrite the roles a seat may not know → its utterance stream and every ledger
> entry serialise identically.

**That is now false, deliberately, and it had to become false for the feature to
exist at all.** A bot that chooses what to say without consulting what it knows
is not playing a deduction game; it is generating filler. The moment a Rebel
Deputy declines to accuse a team-mate, or claims it had no choice about a Seize
it did in fact choose, its utterance stream depends on its role.

So the claim had to be split into the part that must stay true and the part that
must now be false. The distinction is not "leak versus no leak" — it is
**behavioural tell versus presentation channel**:

- A **behavioural tell** is a citizen's own choice: whom they accuse, what they
  claim, when they go quiet. It is information the square earned by watching
  somebody act, it is what there is to deduce, and a game without it is a game
  where speech is decoration. Bots have always had them — `ai.js` has voted
  differently by role since v1. D2 gives them one more channel: their mouths.
- A **presentation channel** is the page: animation, lighting, timing,
  nameplate colour, bubble style, how long a beat takes. None of these may
  correlate with a role, because they are not choices anybody made — they are
  the renderer telling you something the citizen did not. That rule is
  untouched, and `.murmur.floor` is styled with contrast and size rather than
  colour for exactly this reason.

`test/orator.test.js` section 7 is the re-scoped gate, in four parts:

| | claim | result |
| --- | --- | --- |
| 7a | the public **fold** is blind: no speech, roles rotated at every observation | 16 matches, 647 rotations, public record byte-identical |
| 7b | no utterance **field** carries a role token | clean over 50 matches, and three faults injected into a *real* orator utterance are all caught |
| 7c | ledger, flags and audit **render** identically for rotated roles, GIVEN the same record | 16 matches, every legal rotation, byte-identical |
| 7d | the utterance **stream** DOES change when the roles are dealt differently | 16/16 matches diverged |

7d is the part worth arguing about, and it is written as a *requirement* rather
than deleted. If a permuted deal argued identically, minds would not be
informing anything and the whole feature would be inert decoration that passed
its tests. A deleted assertion leaves a silent hole; an inverted one leaves a
statement.

D1's own permutation section in `test/floor.test.js` is kept, unchanged, with a
paragraph at the top saying what it is: its synthetic speaker has no mind and
reads only the public record, so it is the control proving the *schema* and the
*public window* are still why nothing leaks. Both suites are now honest about
which claim they hold.

---

## 2. Two owner decisions, now spec

D1 shipped two behaviours it explicitly flagged as decisions rather than
quotations from the handoff. Both were decided the other way.

### Silence does not discharge a question

An obligation persists across floors — prepended by T6 each time — until the
obliged citizen actually speaks. Every silence in between is recorded on the
obligation as well as in the stream.

The consequence is the reason for the rule: three silences over two floors leave
`basis: silence` **constructible** against that citizen, where the old behaviour
quietly settled the matter. Evasion now gets more referencable the longer it
goes on, which is what makes staying quiet a move with a cost rather than a way
out. Fixtures: persistence through two floors, the accumulating `basis: silence`
accusation, and discharge by an actual answer (which also records *which*
utterance discharged it).

"Speaks to it" is any non-`SILENCE` utterance by the obliged citizen after the
question, not one that names it in `refs`. The narrower reading needs a reply
field the schema does not have, and would let a citizen answer at length about
something else and stay obliged for ever.

### Flags are permanent evidence

`contradictions()` returns a flag for ever, with the same rule, class, seats and
refs, and it stays on both ledger entries. What "addressing" it changes is one
thing: the flag stops **leading T1's morning ordering**, so the square does not
open every morning by turning to the same citizen about the same two utterances
they have already spoken to.

"Addressed" is a fold, not a feeling: a later utterance *of the flagged party's
own* that points at the flag id (`refs.flag`), at one of the utterances inside
it (through any `refs` list), or `amends` one. Somebody else answering on their
behalf does not count, and neither does changing the subject. Fixtures:
leads-before, stops-leading-after, still-queryable-always, and the case where
both parties have spoken and T1 has nobody to lead with.

**One honest edge.** Amending a claim *does* remove a C3 flag, because
`contradictions()` skips superseded claims — the evidence itself was withdrawn
and replaced, which is a different mechanism from expiry and is guarded by C5
(an amendment that names the wrong utterance is a changed story wearing a
correction's clothes). It is pre-existing D1 behaviour, it is not what "flags
never expire" is about, and it is left alone rather than quietly widened.

---

## 3. The orator, and the lying

`src/engine/orator.js` is given the public record, one seat, that seat's private
memory of its **own** hands, and that seat's mind, and returns one valid
utterance for one beat.

### Determinism: three streams, none of them the game's

The oldest law in this project is that the engine's chance is one seeded stream
and only the bots draw from it. Selection takes its randomness from
`SD.makeRng(seed ^ SALT)` — engine-grade, derived from the match seed, salted
away from everything else. `pace.js`, `murmur.js` and now `floor-voice.js` each
carry their own salt for the same reason, and all four differ so the rhythm, the
chatter, the argument and the argument's timing are not one sequence read four
times.

```
invariance    50 matches played twice, floor off and floor on: identical event
              logs, winners and step counts, 4657 utterances over 1459 floors
probe         50/50 matches DIVERGED when SELECTION was handed the game's own
              seeded stream
```

The probe is the whole point. A green invariance result from an instrument that
cannot see a stream draw is the step-04 lesson repeating, and this is the fourth
suite in this repo to carry the same control.

### The private hand memory, and why the lie is real

The public record cannot say what anybody drew — that is the entire premise of
`CLAIM_HAND`. So an orator with only the public record cannot tell the truth
either; it can only fabricate, and two independently fabricated accounts of one
government disagree almost every time, which would make C3 fire on every
honest pair and turn flags into noise.

`Orator.createMemory()` is the fix and the hazard. It folds the driver's
**omniscient** event stream into per-seat rows — `hand` and `passedOn` filed
under the seat that actually held them — and `forSeat()` hands back one seat's
rows and nothing else. That is a citizen knowing their own hand, which is
legitimate; the split is the safety, and the suite proves it by asking for every
seat's memory of every government and requiring that the seat sat in it. It is
also the one place in `src/play/` that `session.events` is passed anywhere, and
the wiring says so out loud.

A truthful bot claims what it holds. A Rebel-side bot with something to cover
claims the version where it had no choice. Liars here are competent about the
things that would give them away for nothing — never a hand impossible on its
face (C1), never a hand missing the tile the whole square watched land (C2) —
and **incompetent about C6 on purpose**, because a Speaker who says they were
forced and then blames the Deputy is the overreach the ledger exists to show.

```
lying         704 private hand rows, each held only by the seat that held it;
              594 claims matched the hand their speaker actually had, 28 did not,
              and 22 of those were named by a contradiction rule
```

28 lies against 594 truths is deliberate. A square where everybody lies has
nothing to deduce.

### One reproducible caught lie

Quoted in three places that must agree — here, `test/orator.test.js`, and the
review report — so a reviewer reproduces *the* lie rather than a lie like it.

```
seed 1000, seven citizens, seat 0 human, day 3

  truth    Chen (seat 2), Deputy of g-2, was passed  {reform 1, seize 1}
  claim    u-17  "I was handed two Seizes. Look at what that leaves me."
                 received {reform 0, seize 2}   text_id claim.deputy.no_choice
  against  u-18  Dara (seat 3), Speaker of g-2, passed on {reform 1, seize 1}
  flag     C3:u-18:u-17:g-2   class pair   seats [2, 3]
```

The flag names the pair and stops. It cannot say which of them lied, and that is
the design: the player decides.

### The distribution bug worth recording

The first selection policy was a ladder of thresholds — `if (roll < 0.6) claim;
if (roll < 0.78) accuse; …`. It produced **68% accusations** over fifty matches,
because a seat with no unexplained hand of its own (which is most seats, most of
the time) fell straight into the accuse band and took the whole of it. A square
where two thirds of every sentence is an accusation is not a square. It is now a
weighted menu renormalised over whatever is actually on offer, so removing a
branch redistributes it instead of handing it to whichever branch is next in the
list:

```
kinds  {ACCUSE 1754, QUESTION 889, SUPPORT 786, CLAIM_HAND 622, SILENCE 606}
```

**Detection rule that generalises: a fallthrough ladder is a distribution, and
nobody reads it as one.** Print the census next to the claim.

---

## 4. The floor, out loud

`src/play/floor-voice.js` is the third module in the `pace.js` / `murmur.js`
family: it imports nothing, is handed `Floor` and `Orator` rather than importing
them, and owns its own clock and vocabulary.

**Two streams, and why they are two.** *What* is said comes from the orator's
stream; *when* it appears, and *whether* a trigger is worth convening for, comes
from this file's. That split is what makes the record independent of the frame
rate: a floor's whole argument is selected and written **synchronously, the
moment the floor opens**, and only its display is spread over the next few
seconds. A floor chosen beat by beat off a wall clock would record a different
match in a background tab than on screen.

**Scarcity is a presentation decision, not a rule.** `triggers()` reports every
floor the record allows, and D1's sweeps opened one for every report — about
thirty a match. `CONVENE` turns that into thirteen. It is the same shape as
`BEATS` in `murmur.js`, it is one object literal, and it is a taste dial.

The consequence worth stating plainly: **the utterance record a browser match
produces is not the record `test/orator.test.js` produces for the same seed**,
because the harness convenes every floor. Both are deterministic; they are
deterministic functions of different things.

**One sentence table, rendered twice.** First person for the bubble over the
speaker's head, third person for a log or a ledger, from one `text_id` entry.
That is the whole reason the record carries an id instead of a string, and it is
now load-bearing rather than aspirational. 24 ids, each swept for a role word,
for a rendering hole, and for a name outside the speaker and the seat the
utterance is aimed at.

**One queue, not two.** Floor speech goes through `murmur.js`'s existing queue
via `say()`, so both voices share one answer to "how many bubbles are up", one
bubble per citizen, one rule about the dead and the human's own seat, and one
"dropped rather than shown late". Two queues with two sets of caps would be two
answers, and the first thing that goes wrong with two answers is that they
disagree — which is exactly the bug the one-bubble-per-citizen hold was added
for in Step 8.

**An argument holds the bots, never the player.** `floorUntil` gates the bot
branch of `tick()` only. The deliberation beat freezes the podium on purpose,
because it is the pause before your own next move; a discussion the bots are
having is not, and being unable to act while other people talk is the worst
possible version of a discussion layer.

**The human seat is not in this conversation.** 0 beats taken and 0 aimed at
them over 50 matches. Work item 4 is what gives them a way to answer, and being
accused with no way to answer is worse than not being accused. Enforced in one
place — `targets()` in the orator — and swept from three.

---

## 5. Verification, and what it was run against

Node v20.19.4, macOS. Browser checks in a real Chromium tab against
`npm run dev`, driving `window.__play` and reading results back.

**The frozen five are untouched.** `git diff main..HEAD` over `engine.js`,
`ai.js`, `driver.js`, `human-driver.js`, `view.js` is empty, and `diff` against
the v1 oracle (`../secret-dictator/js/`) is empty for both files it covers —
md5 `48371790f0ea17bacfc3116c7722bcaf` and `598b210781140213e8a5039dccf3873d`.

**Fourteen gates, all green.**

```
npm test                28881 assertions
test:controller            50
test:human               1055
test:contract            6139
test:view              198201
test:interact              31
test:objective          65715
test:pace               30590
test:murmur             15308        <- extended: the second voice, and the sentence table
test:ambience           15535
test:glb                 1283
test:floor              17296        <- extended: obligations persist, flags are permanent
test:orator              4246        <- new
parity                  PARITY OK — driver.js reproduces the self-test baseline exactly
build                   four entry points
```

### Three instrument failures, recorded

All three are the same shape this project keeps meeting: **a probe that cannot
reach the thing it is aimed at reports a plausible number.**

1. **"81% of floor lines never reached the screen."** The bubble regression's
   first version advanced a fixed 6.5 s window per beat. An argument runs up to
   six beats at ~2 s each, so more than half of every floor was scheduled past
   the end of the window and counted as never shown. In the running page the bot
   loop is held for exactly that window, so pumping to the horizon is what the
   game actually does and a fixed window is what nothing does. Real answer: 18%.

2. **The same sweep then still read 81%.** The shown-bubble set was keyed on the
   controller's bubble id, and every match builds a fresh controller whose ids
   restart at 1 — so eight matches of bubbles collided into one match's worth.
   The drop rate was measuring the key. **Detection rule: an identity that is
   only unique within a run must be namespaced by the run before it is counted
   across runs.**

3. **Zero floor bubbles observed in the browser, with nine in the record.** The
   probe read `__play.murmurs.visible`, which did not project the `floor` flag,
   so `v.floor` was `undefined` for every bubble. The readback now carries it —
   and, separately, `paintMurmurs()` genuinely *was* writing `class="murmur"`
   for floor speech, so the visual distinction existed in the stylesheet and
   nowhere else. One of the two was a broken instrument and one was a real bug,
   and the instrument was hiding the bug. `__play.murmurs.onScreenFloor` now
   reads the class off the element, because a distinction that is not in the DOM
   is not a distinction.

---

## 6. Open gaps, stated plainly

- **Nobody has judged the pacing.** Thirteen floors a match at ~2 s a beat is
  roughly 80 s of added deliberation on top of the ~88 s `docs/step-05.md`
  measured for seven citizens. Whether that reads as "the square is arguing" or
  as "the game is slow" is a taste question with no test, and it is the same
  question §7b of step-05 left open about bot deliberation — now with a second
  clock stacked on it. `CONVENE` and `FLOOR_BEAT_MS` are one object literal
  each, and the pace control still divides everything.
- **18% of floor lines never reach the screen.** They are in the record and in
  `__play.floor()`, and the player never hears them. That is the honest cost of
  a 2-bubble cap against a 6-beat floor, and the right fix is the ledger (work
  item 5) rather than a wider cap.
- **A silence renders as `…`.** It is a beat that happened, so it gets a bubble;
  prose would put words in the mouth of somebody who declined to speak, and
  nothing at all would make an answered question indistinguishable from a
  skipped turn. A proper visual for a refusal belongs to the tray.
- **Three accusation bases are never constructed in practice** — `isolation`,
  `power_use` and `silence` — because a stronger basis is nearly always
  available and the orator takes the strongest. They are implemented, validated
  and fixture-tested; they are simply unreachable under this policy. The census
  is printed so this is a measured finding rather than an assumption.
- **`support.claim_consistency` is likewise unreached**, for the same reason.
- **C6 is still two concrete cases**, unchanged from D1: `basis: enactment`
  only. It fires a great deal now (52 flags over 50 matches) because the orator
  overreaches exactly where D1 predicted, but the rule is still
  under-implemented rather than guessed at.
- **C4 names everybody in the window.** Several liars each claiming three Seizes
  eventually exceed the deck, and the flag correctly names all of them, because
  the record cannot say whose claim was the false one. It is right and it reads
  as noise; whether a five-seat flag is useful evidence or clutter is a question
  for the ledger's design.
- **The bots still do not BELIEVE anything anybody says.** Rules decisions read
  zero utterances — the invariance test enforces it. Belief coupling is a later
  gate, and it is the one that flips `invariance` into a controlled-divergence
  test. The probe beside it stays.
- **`self.SDFloor` is defined in the page now.** Step 9's boundary statement
  ("the layer is not merely quiet, it is not there") no longer holds and should
  not — the layer is loaded and running. What replaces it as the boundary is the
  invariance test and the fact that `G.log` is byte-untouched.
- **No screenshot has been colour-sampled.** `.murmur.floor`'s 12.1:1 worst-case
  ratio is computed from the declared tokens, like every other ratio in
  `style.css` since Gate 1.

## 7. Notes for later steps

- The intent strip (work item 4) is where the human seat enters `targets()`.
  When it does, the human-never-targeted sweep in `test/orator.test.js` §5 is the
  check to change, and `SILENCE { explicit: false }` becomes reachable for the
  first time — bots always choose their silence, so only a player's clock running
  out can produce a timeout.
- A new `text_id` needs an entry in `SENTENCES` with **both** renderings; the
  murmur suite fails on a missing sentence rather than shipping a placeholder.
- `Orator.governmentFor()` exists because "whatever government was open before
  the observation" is correct only when exactly one step happened since the last
  fold — true of `refresh()`, false of `runToEnd()`. Both callers share the one
  function rather than each keeping their own idea of the answer.
