# Step 12 — Discussion Gate D4: the ledger

D1 built a fold nobody had ever looked at. D2 filled it with an argument, and
its own open-gaps list said the quiet part: **18% of floor lines never reach the
screen**, and the right fix "is the ledger rather than a wider cap". This gate
is that panel. The lie a player could only *hear* — and only if they were
looking the right way for four seconds — is now something they can look up.

Normative spec: `design/handoff/floor-and-hud/README.md` work item 3, and
wireframe 4C of `Secret Dictator - Build Specs.dc.html`.

```
src/play/ledger.js           the fold, rendered — 420px, per-citizen, no verdicts
src/play/panels.js           +renderLedger, +the dialog, +the three keys
src/play/main.js             the presentation clock, and what pinning stops
test/ledger.test.js          the sixteenth gate — 2,000 checks
scripts/capture-ledger.mjs   the browser acceptance set, screenshots in
                             design/reviews/gate-d4-ledger/
```

---

## 1. What it renders, and what it deliberately does not recompute

`Floor.ledger(record)` has existed and been tested since D1: a per-citizen fold
over utterances plus the public record, ids all the way down. **This gate adds
no arithmetic to it.** `src/play/ledger.js` is handed that fold plus the parts
of the record its ids point into, and turns each entry into rows.

That split is the whole reason the panel is trustworthy, and it is enforced
rather than described. Every row carries `trace` — the ids it was folded from —
and the gate resolves every one of them against the record:

```
40 rows on screen at game over, seed 1006
  utterance 36 · government 43 · power 2 · flag 2 · roster 1 · board 3
  untraced 0
```

A row that traces to nothing is a row the panel invented, and inventing is the
one thing a ledger may not do. Six id shapes and no seventh: `u-*`, `g-*`,
`p-*`, `f-*`, a flag id, `seat:N` (the roster entry itself) and `board` (the
public projection the three promoted rows come from).

**Detection rule that generalises: make provenance a field, not a claim.** The
D3 sweep could only ask "does this surface mention the word deck"; this one asks
"which public event is this sentence *from*", and the answer is checked.

---

## 2. Pinning pauses the presentation, and what that meant in code

The spec's sentence is "bots stop deliberating, light holds, the engine is
untouched". There were two ways to build it and only one of them is honest.

The obvious one is a flag threaded through five functions plus a list of
deadlines to shift on unpin. This page has six of them — the deliberation beat,
the floor's argument, the tray's announcement, the tile sting, the light's
staging lead, and every bubble's own life — and a list of six things to remember
is a list that will be five things after the next feature.

So the clock stopped instead:

```js
let pausedAt = 0;      // wall time the pin happened, 0 when the square runs
let pausedFor = 0;     // total wall time this match has spent pinned
function nowMs() { return (pausedAt || performance.now()) - pausedFor; }
```

Every deadline on the page is compared against `nowMs()`, so freezing it freezes
all six at once: nothing expires unseen, no bubble is dropped, and an argument
halfway through resumes mid-sentence. **Raw `performance.now()` survives in
exactly five places** — inside `nowMs` itself, the pin, the unpin, the readback,
and the render loop's frame delta — and the gate counts them, because a seventh
would be a clock that does not stop.

The engine needs no entry in that paragraph. It has no clock: `Driver.step` is
called by `tick()` and by nothing else, so **pausing is the absence of a call,
not a state the rules can be in**. `tick()` returns on `panels.isLedgerOpen`
before it can reach either the bot branch or the autopilot. `frame()` skips
`lighting.update(dt)`, which is the crossfade's only driver — so "the light
holds" is the fade frozen where it was rather than snapped anywhere — and keeps
rendering, so the page is still alive, it is simply drawing the same square.

**Measured in the browser**, seed 1000, pinned for 60.9 real seconds:

| | before | during | after |
| --- | --- | --- | --- |
| event log | 2850 chars | identical | identical |
| utterances | 6 | 6 | 6 |
| light | `trial` | `trial` | — |
| phase | `vote` | `vote` | — |
| pending decision | `vote` | — | identical |

---

## 3. The decision you own is still yours

The spec is explicit that the tray's contextual row stays live behind the panel,
and it is the part most likely to be quietly dropped, because it is the part
that makes the ledger *not* a modal. So it is not one:
`role="dialog"`, labelled, focus moved in and handed back — and **no
`aria-modal`, and nothing outside made `inert`**. Claiming modality and then
keeping the tray live would be a lie a screen reader repeats.

Photographed at `05-ballot-armed-with-ledger.png` and driven with the real
keyboard: `L` to pin, `E` at the podium to take the ballot row, `A` to cast it.

```
before  { open: true, waiting: 'vote', prompt: 'L or Esc — put the ledger down' }
armed   { open: true, armed: true, row: '3 Chen to govern with 6 Fin?  A Aye  N Nay' }
after   { open: true, waiting: 'acknowledge', ballotsSealed: 7, phase: 'vote_result' }
```

### The one genuine key collision, and how it was resolved

`1–9` names a citizen on an armed nomination row and jumps to a citizen in the
ledger, and **both are right**. The armed row wins, and the page routes to it
first, for the reason the tray's arming exists at all: arming is a deliberate
act taken to answer something, and jumping is navigation with a scroll bar
behind it. A digit the row does *not* accept — somebody term-limited, somebody
dead — falls through and jumps to them instead, which is the more useful of the
two things a dead key could do. `Esc` is the same story: it gives the row back
first and closes the ledger on the second press.

`L` and `Esc` are intercepted in `main.js` rather than inside the panel, because
closing has to stop the pause as well as the panel and the clock is the page's.

### Two dialogs is not a state

A centred card (the three drafts, the three ceremonies, the result screen) is
modal and takes the whole keyboard. Opening one **gives the square back first** —
one Esc, one dialog, one visible "paused". It is the only place the ledger
closes itself.

---

## 4. Flags: a mark, a rule, its refs, and never a verdict

The handoff's own table phrases C3 as "one of the two is lying". That is true,
and it is still not something this panel may print — the moment the ledger
characterises a citizen it has done the player's work, with less information.
So each rule is written as a description of **the record**:

```
⚑ C3 · pair with 6 Fin — two accounts of one government that do not match
```

and the entry header carries a mark and a count and nothing else. The rule, the
referenced utterances and the government are inside the entry.

`test/ledger.test.js` sweeps every word this module writes for 24 verdict words
(`lied`, `guilty`, `trust`, `suspicion`, `score`, `%`, …) — and **only** the
words this module writes. A citizen's own sentence, rendered from its `text_id`
through the D2 table, may accuse whoever it likes: that is the game, and the
ledger doing it is the bug. Every row is tagged `voice: 'record' | 'said'` so
the two are separable mechanically rather than by eye.

### The headline: the caught lie, looked up

`docs/step-10.md` recorded one reproducible lie and said "the flag names the
pair and stops; the player decides". A player could only ever hear it. Seed
1006, seven citizens, seat 0, played to game over — screenshots `02-pair-seat-5`
and `02-pair-seat-6`:

```
flag  C3:u-40:u-42:g-4   class pair   seats [4, 5]

5 EZE                                        ⚑ 1 flag
  claims   d7 · g-4 speaker · drew 1R 2S · passed 1R 1S · enacted SEIZE
           Eze says they drew one Reform and two Seizes and passed on one
           Reform and one Seize.
           ⚑ C3 · pair with 6 Fin — two accounts of one government that do
             not match
             u-40 · 5 Eze   Eze says they drew …
             u-42 · 6 Fin   Fin says they were passed two Seizes and had no
                            choice.
             g-4 · enacted SEIZE

6 FIN                                        ⚑ 1 flag
  claims   d7 · g-5 speaker · drew 3S · passed 2S · enacted SEIZE
           d7 · g-4 deputy · received 2S · enacted SEIZE
           ⚑ C3 · pair with 5 Eze — …same flag, same id, the other way round
```

Same flag id on both entries, both claims readable, `F` narrows the panel to
`2 of 7 — flagged only`, and the verdict sweep over the panel's own rendered
text came back empty (`hits: []` over 2915 characters).

---

## 5. The carried D3 regression: how you win

D3's open-gaps list: *"The role blurb is now a tooltip. Discoverable by hover
only, which is not discoverable."* A sentence that explains how the player
**wins** cannot be behind a mouse.

It is the ledger's first line now — above the promoted rows, above everything
the square said, because it is the question all of that is evidence about. The
private card's tooltip stays and reads the **same constant** (`WIN_CONDITION` in
`ledger.js`, imported by `panels.js`), so a second way to read it cannot drift
from the first. The card is still dimension-locked at 232 × 96 and was not
touched; measured at `{width: 232, height: 96, top: 12, left: 12}` in the same
frames as the ledger.

The Dictator's line gained an actual win condition on the way: the old one
("You are what the Rebels are playing for. Do not get purged.") says what they
are worth to somebody else and never how the match ends.

### How a first-time player finds it

`L ledger` was the only affordance, and `L ledger` does not tell anybody that
the panel contains their objective. The smallest addition that fixes it, and the
one implemented:

- **the hint says what is in it, once.** Until the ledger has been opened for
  the first time, the tray's right-hand region reads `L ledger · how you win`;
  afterwards, and for every match after that, it reads `L ledger`. The bit lives
  on the page (`presentation.ledgerSeen`), never in game state, and survives a
  restart on purpose — a player does not become a first-timer again because they
  dealt another hand. This is the design doc's onboarding rule (no tutorial
  screen, one new concept at a time) applied to one word.
- **the hint is live at all.** D3 drew it dim because the key opened nothing.
- **`?` says it too**: the keys line now names `L`, what the panel holds, and
  that it pauses the square.

Measured on a cold page: `[{"text":"L ledger · how you win","dim":false},
{"text":"? keys","dim":false}]`, and `["L ledger","? keys"]` afterwards.

**What is still not solved**: a player who never presses `?` and never reads the
tray's right-hand corner still never sees it. The honest next step is the
onboarding pass the design doc describes (match 1, one warm object at a time),
not a fourth hint.

---

## 6. Three ambiguities in the spec, resolved

### "A flagged citizen carries a mark **and only a mark**"

Read literally against wireframe 4C, which draws `C3 pair with 4 — Dara differs`
*inside* Chen's entry, the two statements disagree. **Resolved by scope**: the
mark-and-only-a-mark rule governs everything *outside* the entry — the header,
the count, and (next gate) the nameplate's amber dot. Inside the entry, which is
a thing you opened the panel and jumped to a number to read, the flag shows its
rule and its refs, exactly as the wireframe draws it and as the acceptance
criterion for this gate requires ("both claims readable"). The alternative — a
collapsed entry needing a second keypress — would have made the headline proof
of this gate a two-step interaction for no gain.

### Pinned versus open

The spec says `L` to pin, `Esc` to close, and `L` pin/unpin. There is no third
state for a second key to mean, so **open and pinned are the same state**: `L`
opens the panel and holds the presentation in one gesture, `L` or `Esc` gives
both back, and the header's "paused" is therefore not conditional.

### Where the panel actually sits

Wireframe 4C says 420px on the right. At 1280 × 720 that collides with two
things the spec froze elsewhere: the controls bar (top 10, right 10) and the
objective line, whose "position, size and behaviour are unchanged from today" is
a D3 acceptance criterion still in force. **The ledger moved, not them**: it
starts at `top: 112px`, which is the bottom of a **two-line** objective (52 + two
19px lines + 14px of padding + the border) rather than of the one-line case that
happens to be on screen while you are measuring. Measured: ledger 420 × 512 at
top 112 / right 12; objective 52–87; controls 10–48. No overlap in any captured
frame.

---

## 7. The style law, with a fifth surface in the frame

Same instrument as D3 — `scripts/capture-ledger.mjs` counts the composited
screenshot with the project's own classifier (hue 15–70°, saturation > 0.16,
lightness > 0.18) copied out of `lighting.js` line for line — and the same
camera mark, so the numbers are comparable rather than merely similar.

| frame | light | with HUD + ledger | without | cost | budget |
| --- | --- | --- | --- | --- | --- |
| trial, mid-match (D4) | `trial` | **3.62%** | 2.53% | +1.09 pt | 10% |
| trial, mid-match (D3) | `trial` | 3.40% | 2.53% | +0.87 pt | 10% |

The *without* number is identical to D3's to two decimal places, which is what
makes the comparison meaningful: same frame, same scene, one more panel. **The
ledger's own contribution is +0.22 points**, and the whole HUD is 8.9 points
under budget at this mark. The director's offscreen reading of the same moment
(scene only, 128 × 72 probe) is 2.42% — same direction, same order, different
instrument, exactly as in step-11.

The panel earns that by spending warm on one thing: the flag mark and the
objective. Everything else is parchment, `--dim` and brass hairlines. **No new
colours**, and no role channel — the private card is still the only 2D element
in the game permitted `r-loyalist` / `r-rebel` / `r-dictator`, and D3's sweep now
runs with the ledger open over 681 of its 13,628 states to say so.

---

## 8. What was verified, and how

Everything below was executed, not inferred.

- **`npm run verify` — 16 gates green**, including the new one. 2,000 checks in
  `test:ledger`; `test:hud` 133,973; parity exact; `git diff main -- src/engine/`
  empty, so all seven engine modules including the frozen five are byte-identical.
- **The sweep**: 4,306 rows over 24 complete matches with the orator running and
  every trigger convened. 0 orphan rows, 0 verdicts, 0 scores, 0 percentages,
  0 forbidden fields, 0 missing sentences, 12 C3 pairs each on both entries,
  17 purged citizens keeping their entry and their number, 180 jumps by
  permanent number (the dead included) with 0 misses, 16 role rotations leaving
  the **rendered markup** byte-identical.
- **Read-only, over a live session**: 200 renders, 200 jumps and 10 filter
  toggles against a running `Human.createSession` left the event log, the
  utterance record and the pending decision byte-identical.
- **The browser pass**, 1280 × 720 against `npm run dev`: the seed-1006 headline
  above; the 60-second pause; the ballot answered while pinned; the warm pair;
  the boxes; the first-run hint. Eight screenshots in
  `design/reviews/gate-d4-ledger/`.
- **Fingerprint unchanged**: seed 1000 / 7 citizens → 61 steps, 38 human
  decisions, Loyalist win.
- **The other three pages unchanged**: `walk.html` still stops head-on at
  z = 11.6499, still stalls on the 35° ramp at x = 1.8894710530937933 with
  y = 0, still stops at the 0.40 m block at z = −2.3999 and still runs the steps
  at 3.5 m/s; `index.html` still plays seed 1000 at seven citizens to 73 steps
  and a 31,365-character event log; the asset lab still reports `env-dais-a` at
  6.000 × 1.209 × 3.400 m, 11 visual nodes, 1188 triangles, `SOCKET_podium`.
- **Console clean** on all four pages through the whole capture run (the only
  entries are vite's connection debug, the three `[assets]` / `[cast]` info
  lines, and Chromium's own `GPU stall due to ReadPixels` performance warning,
  which is the screenshot instrument and not the page).

---

## 9. Open gaps, stated plainly

- **Nobody has read a whole match's ledger for taste.** The panel is correct,
  traceable and legible in six screenshots; whether nine days of seven citizens
  is a thing a player actually scans, or a wall they scroll past, is a taste
  question with no test. It is the same open question step-10 left about pacing,
  one surface further out.
- **The entry can get long, and nothing summarises it.** By day nine a talkative
  citizen carries a dozen rows; the panel scrolls and the group labels are the
  only structure. Deliberately no collapsing, no sorting and no "most recent" —
  every one of those is a ranking, and a ranking is the first step towards the
  score the spec forbids. If it needs help, the honest help is the `F` filter
  and (next gate) filtering by government.
- **`quiet` and `flags` are unreachable in the sweep.** A citizen with nothing at
  all in their entry, and a flag whose refs contain none of the flagged
  citizen's own claims. Both are rendered by code the sweep exercises; neither is
  produced by 24 complete matches that convene every floor. They are listed in
  the coverage note rather than dropped so the gap is a statement.
- **The pause is a browser fact.** The headless gate proves the panel is
  read-only and reads the loop's gate out of the source; only the 60-second
  browser run proves the clock actually holds. A change to `tick()` that moved
  the gate would fail the source check, but a change to `frame()` that
  reintroduced `lighting.update` while pinned would not — that one is only
  caught by looking.
- **No scroll position is remembered.** Closing resets the filter and the jump;
  the next open starts at the top with everybody. That is deliberate (a question
  starts at the top) and it is a guess about how people use it.
- **The `1–9` fallthrough is undocumented in the UI.** A digit the armed tray row
  refuses jumps in the ledger instead. Correct, useful, and nothing on screen
  says so.
- **Contrast is computed, not sampled.** The ledger's parchment, `--dim` and
  `--chaos` amber are AA against the panel's declared backdrop by the Gate 1
  method. No pixel of a rendered screenshot was colour-picked.
- **No mobile, no reduced-motion pass.** Out of scope, and the panel has no
  animation to reduce.

---

## 10. Notes for the next gate

- **The intent strip is a tray kind, not a panel** (step-11 §10 still holds), and
  it now has a second neighbour: while the strip is up, the ledger's digits must
  lose to it exactly as the armed row's do. The routing order in the keydown
  handler is the one place to change.
- **`presentation` is now `{ holding, armed, announce, night, ledgerSeen }`** and
  `nowMs()` is the seam every future clock should hang off. Anything that reads
  `performance.now()` directly will not pause, and `test/ledger.test.js` counts
  the reads.
- **The council view's amber dot** on a nameplate is `entry.flagCount > 0`, which
  is already in the model, and it is the "and only a mark" half of §6's ruling
  in its literal form.
- **The dead-player ledger** the design doc describes (all roles revealed as
  dramatic irony) is a second `objectiveFor`, not a second panel — but it needs
  an audited disclosure path in `view.js`, and every sweep in this gate assumes
  the panel cannot reach one.
