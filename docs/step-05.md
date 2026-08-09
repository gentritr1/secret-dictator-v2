# Step 05 — Gate 1: told where to go, and able to get there without a mouse

`docs/BLENDER_PIPELINE.md` puts one gate in front of the art pass:

> Before new art, add a persistent one-line objective, accessible dialog/focus
> behaviour, contrast fixes, and camera framing that accounts for the left HUD.

This is that work. **No new geometry, no materials, no lighting, no audio, no
touch support.** The square looks the same; it just stops assuming you already
know how to play it.

```
npm run test:objective   # the new gate: every state maps to a correct line
npm run verify           # eight gates now, all green
```

Changed: `src/play/objective.js` (new), `src/play/panels.js`,
`src/play/main.js`, `src/play/style.css`, `play.html`, `src/walk/camera.js`
(one defaulted-off tuning field), `test/objective.test.js` (new),
`package.json`. Nothing under `src/engine/` was touched — no defect in the
rules, the driver or the session was found by this pass.

## 1. The persistent objective line

One sentence, always on screen, at the top of the **unobscured** scene region:
`left: 346px` (the 330 px HUD plus a gutter), `top: 52px` (clear of the
controls bar), centred in what is left. "Top centre" means the centre of what
the player can actually see, which is not the centre of the page.

### Where it comes from, and why that is the whole design

`objectiveFor(view)` takes **the player-safe projection and nothing else** — no
game object, no session, no driver event — exactly like `panels.js`, and for
the same reason. This is the single most-read piece of text on the screen and
therefore the worst possible place for an accidental `G.players[id].role`. A
leak here would have to be added to `view.js` on purpose first.

It reads only things the square has already been told: the pending decision for
this seat, the phase, who holds the gavel, who was nominated, who is Deputy,
who was handed a power, whether you are alive, and — at game over and only then
— the winner. It deliberately never prints a tile or a role token at all. The
Speaker's three tiles are legitimately in `waitingFor.detail` for that seat, but
a line that lives permanently on screen is not where a private hand belongs; the
panel you opened on purpose is.

### The mapping

Every `waitingFor` kind and gate, and every waiting-on-bots phase. `id` is
returned next to the text so a test can assert *which* line was chosen without
matching prose — prose changes, the mapping is the contract.

| state | id | line | walk to |
| --- | --- | --- | --- |
| `acknowledge` / `morning` | `acknowledge:morning` | Day 4 (emergency session) — walk to the bell and ring it to open the session. | bell |
| `acknowledge` / `vote_result` | `acknowledge:vote_result` | The ballots are sealed — walk to the bell to open them. | bell |
| `acknowledge` / `chaos` | `acknowledge:chaos` | Three failed governments — walk to the bell; chaos takes the deck. | bell |
| `nominate` | `nominate` | You hold the gavel — walk to the podium and name a Deputy. | podium |
| `vote` | `vote` | A government is on the floor — go to the podium and cast your ballot on Bo governing with you. | podium |
| `speaker_discard` | `speaker_discard` | You were dealt three tiles — go to the podium and throw one away. | podium |
| `deputy_discard` | `deputy_discard` | You were passed two tiles — go to the podium and enact one of them. | podium |
| `block_response` | `block_response` | Bo moves to Block — go to the podium and answer it. | podium |
| `power_target` / peek | `power_target:peek` | Peek Allegiance is yours — go to the podium and choose whose allegiance you read. | podium |
| `power_target` / emergency | `power_target:emergency` | Emergency Vote is yours — go to the podium and choose who takes the gavel next. | podium |
| `power_target` / purge | `power_target:purge` | Purge is yours — go to the podium and name one citizen to leave the square. | podium |
| `power_ack` / foresight | `power_ack:foresight` | Foresight is yours — go to the podium to read the top of the deck. | podium |
| nothing pending, you are purged | `dead` | You were purged — nothing more is asked of you. Watch how it ends. | — |
| bots, nomination | `bots:nomination` | Waiting: Bo holds the gavel and is naming a Deputy. | — |
| bots, legislative speaker | `bots:legislative_speaker` | Waiting: Bo and Gita have withdrawn to draft a law. / *(if you are the Deputy)* Waiting: Bo is drafting — two of the three tiles come to you next. | — |
| bots, legislative deputy | `bots:legislative_deputy` | Waiting: Gita is choosing which law to enact. | — |
| bots, block response | `bots:block_response` | Waiting: Bo is answering Gita's Block. | — |
| bots, power | `bots:power` | Waiting: Bo is using Peek Allegiance. | — |
| game over | `game_over` | The match is over — you won. Restart, top right, deals a new one. | — |

Three ids exist as defensive branches and are unreachable with a seat actually
seated: `bots:vote`, `bots:vote_result`, `bots:chaos`. A living seat always owes
a ballot in the vote phase, both acknowledge gates fire for every seat alive or
dead, and a dead seat reaches `dead` first. They are listed in `OBJECTIVE_IDS`
and excluded from the coverage assertion rather than quietly counted as covered.

### The check that has teeth

Naming an object is the useful half of the line and the easy half to get wrong,
because it duplicates a routing rule that lives somewhere else. The interaction
system decides where a panel opens purely from the decision kind
(`src/play/main.js`: the bell takes `acknowledge`, the podium takes everything
else). So `test/objective.test.js` asserts the line's object against that same
rule, and the browser pass asserts it against the running game: for every state
of a whole match, teleport to the object the line names, face it, and require
`look().target` to be that object. A line that sends a player to the wrong side
of the square is worse than no line — they walk, and then they are stuck with no
prompt and no explanation.

The leak sweep is the `view.test.js` idiom pointed at a string: no role, team or
tile token, and **no player name that is not publicly involved in the current
beat** (a whitelist computed from speaker/nominee/deputy/power holder/you). Plus
the permutation check — rewrite the roles this seat may not know, rebuild the
line, require it byte-identical.

Mutation-tested, because a suite nobody has tried to break is a suite nobody
knows the strength of. Five faults injected into `objective.js` one at a time,
the file restored after each:

| injected fault | caught by | first failure |
| --- | --- | --- |
| `acknowledge` routed to the podium | routing + the `objectFor` assertion | `does not name the bell — "Day 1 — walk to the podium…"` |
| `nominate` returns the vote line | kind/id agreement | `pending nominate produced the vote line` |
| the line prints your own role | the token sweep | `the line says "dictator"` |
| the line names an uninvolved seat | the name whitelist | `names Fin (seat 5), who is not publicly involved` |
| a phase falls through to the generic line | the waiting-line shape check | `nobody owes anything and the line is not a waiting line` |

## 2. Dialog semantics

The panel is now a real dialog: `role="dialog"`, `aria-modal="true"`,
`aria-labelledby` pointing at the title, focus moved to the first answer on
open, trapped while open, and returned to whatever had it when it closes.

Three details are worth stating because each was a decision:

- **The trap is built twice.** Tab is handled in `panels.handleKey` so the cycle
  is *ordered* (a focusin guard alone sends Shift+Tab from the first answer to
  the first answer), and a `focusin` listener on the document is the backstop
  for anything Tab does not cover.
- **`inert` on the HUD and the controls** while a dialog is open. `aria-modal`
  is a claim about the rest of the page; without `inert` it is a claim a screen
  reader repeats and the tab order contradicts. The canvas is deliberately left
  alone — it holds nothing focusable, and orbiting the camera while reading a
  decision is the point of the camera.
- **Refocusing from inside a `focusin` handler is ignored**, because the browser
  is still mid-transfer. The first version of the backstop looked exactly like a
  broken trap: the listener ran, `focus()` did nothing, and the seed box kept the
  keyboard. Deferring by a tick fixes it. **Found by driving it, not by reading
  it** — the code was obviously correct and obviously did not work.

**Esc cannot lose a pending decision, structurally rather than carefully.**
`close()` touches no game state at all; the decision is still pending in the
session, so walking back and pressing E rebuilds the same options from the same
`waitingFor`. Verified in the browser: Esc on an open ballot, zero `vote`
actions recorded, `waitingFor()` byte-identical before and after, reopened panel
offering the same two answers.

Every existing shortcut still works exactly as before: 1–9, A/Y, N, ↵, Esc. The
number-key hints went from `opacity: 0.55` to `0.8` — at 0.55 they read as
decoration, and they are how a player learns the shortcuts exist.

## 3. Contrast and hierarchy

Inside the existing tokens; no new fonts, no layout rework.

The rule applied: **every ratio is computed against the worst case, a blown-out
white scene behind the translucent surface**, not against `--bg`. `--bg` is only
what is behind the HUD when the camera happens to be pointing at the sky, and no
foreground colour can meet a ratio against a backdrop that moves.

| change | why | worst-case ratio |
| --- | --- | --- |
| HUD backdrop `0.93→0.78` becomes `0.97→0.93` | at 0.78 the right edge of the HUD sat over the lit graybox | `--dim` 6.44:1 |
| panel backdrop `0.94` → `0.96` | same | `--dim` 6.37:1 |
| log day column `#5d6577` → `#8a93a8` | **failed AA at 3.10:1** | 5.88:1 |
| panel footnote `#5d6577` → `#8a93a8` | **failed AA at 2.85:1** | 5.42:1 |
| `--reform` `#4a90d9` → `#6aa6e6` | 4.99:1 on the panel, under AA on a bright frame | 6.52:1 |
| `--seize` `#d9524a` → `#e8695f` | 4.17:1 on the panel | 5.26:1 |
| `#help` given its own backdrop | it sat directly on the 3D scene with no chip at all | 6.15:1 |
| key hints `opacity: 0.55` → `0.8` | legibility, and they teach the keyboard | 8.17:1 |

Nothing on the HUD, in a panel, in the objective line, in the prompt or on a 3D
name tag is now below **5.2:1** in the worst case; AA needs 4.5:1.

Hierarchy: the objective line (14 px) and the phase (13 px, gold, bold) are the
two loudest elements; every other status value stepped down to `#c6ccd9` and the
keys stayed `--dim`. Warm means "the square is waiting on you" — the
`STYLE_BIBLE` rule that warm light is attention, spent on type instead of
lanterns, since lanterns are Gate 3.

## 4. Camera framing with the HUD

`src/walk/camera.js` gained one tuning field, **`screenBias`, default `0`**, and
the branch that uses it is guarded rather than multiplied by zero, so
`walk.html` executes the instructions it always did. It is not on the workbench's
slider list (`CAM_SLIDERS` is explicit), so that overlay is unchanged too.

`play.html` sets it from the HUD width on every resize:

```js
screenBias = min(0.18, (HUD_PX / 2) / windowWidth * FRAMING_BIAS)
           = min(0.18, (330 / 2) / 1440 * 0.6) = 0.0687   // at 1440 x 900
```

Centring the subject in the *visible* half needs `(HUD/2)/width`; `FRAMING_BIAS
= 0.6` applies six tenths of that, because full correction reads as a camera
looking somewhere else. At 1440 px that is **99 px right of centre**, measured
on screen and matching the arithmetic.

The mechanism is worth writing down because the obvious version does nothing:
**moving the camera sideways does not move the subject in frame** — the look
target moves with it and the subject stays centred. What moves the subject is
*aiming past* it. So the bias shifts the look point to the left of the
character, which puts the character to the right of centre. The conversion is
the frustum half-width at the boom distance
(`tan(fov/2) · distance · aspect`), so the number means the same thing at every
zoom level and aspect ratio; a constant in metres would have meant something
different after every scroll of the wheel.

The point of interest is not separately framed. The player walks to the podium
or the bell, so once the decision is live both are in the same region; a
POI-weighted target is a Gate 3 staging question, not a readability fix.

## 5. Pacing, and the morning bell

Gate 1 asks for one written pacing decision. The decision it produced was
"leave the bell alone until Gate 3", with the cost measured rather than
guessed — over 200 matches per table size with a scripted player:

| table | days | engine steps | human decisions | bell trips | podium trips |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 | 9.3 | 44.6 | 32.2 | **18.8** | 13.4 |
| 7 | 10.6 | 49.0 | 35.4 | **21.5** | 13.9 |
| 10 | 13.8 | 59.9 | 44.9 | **28.4** | 16.5 |

**The owner then played it, and the measurement was right.** Verdict: "it is
intuitive overall what to do" — the objective line did its job — but "it feels
like a chore going to the bell", and the match is "a bit repetitive but okay",
with their own diagnosis that the bots answer instantly where real people take
time.

That is a better input than any of the arithmetic above, and Gate 1.5 acts on
it. See §8.

## 6. The Emergency Vote, on screen at last

`docs/step-04.md` closed with "no match in the browser has reached an Emergency
Vote with the human holding it". The power is the third Seize's, and it is
granted to whoever is Speaker when that Seize is enacted, so random play has to
put the human in the chair at exactly the right moment.

Found by search rather than by hope — a headless sweep of seeds 1–4000 across
every table size and seat, playing `options[0]`:

```
seed 19, five citizens, seat 0 (Alice) — the Emergency Vote after 11 decisions, day 3
```

That seed is now quoted in three places that must agree: this document,
`test/objective.test.js`, and the browser pass below. Driven through the real
UI — walk to the podium, `E`, press `2`:

```
prompt     E — use your power
panel      role=dialog, aria-modal=true, labelled by "Who takes the gavel next?"
kicker     Emergency Vote — the 3rd Seize grants it to you
blurb      They speak next; afterwards the rotation carries on past you.
answers    Bo 1 · Chen 2 · Dara 3 · Eze 4     (focus starts on Bo)
after "2"  speaker 0 -> 2, isSpecialElection true, returnSeat 0, day 3 -> 4
public log "Alice calls an Emergency Vote. Chen takes the gavel for one session."
           "Day 4 — the Speaker rises. Chen holds the gavel."
morning    "Reform 0/5 · Seize 3/6 · Chaos 0/3 · emergency session"
```

**What the pass found: nothing broken.** The panel, the targets, the special
election, the parked return seat and the morning report were all already
correct — the path had simply never been looked at. That is a real outcome and
worth recording as one: the value of the pass was converting an untested claim
into an observation, not a fix.

Three things were added so it stays that way. The constructed-position case in
`test/objective.test.js` asserts the seed still reaches the power and that the
line names both the power and what it does. The same suite then renders the
panel **through the real `panels.js` against the stub document** — the same code
the browser runs — and asserts the power is named, the question is asked, the
title carries the id `aria-labelledby` points at, and every advertised target
appears by name *with the value `submit()` accepts*, which is step-04's
`options`-handshake bug one layer further out: a panel may not invent a shape
the scripted API cannot use. Mutation-tested three ways:

| injected fault | first failure |
| --- | --- |
| the title loses its `id` | `the panel has no labelled title for aria-labelledby to point at` |
| the power panel draws no targets | `the Emergency Vote panel omits target Bo (seat 1)` |
| the panel wraps targets in `{ target: id }` | `does not offer seat 1 as a submittable value` |

And the screenshot in this pass.
The objective line for it gained the emergency-session marker on the following
morning, because that is the one morning where the gavel did not simply rotate
and a first-time player has no other way to notice.

## 7. Gate 1.5 — the chore, and the instant square

A surgical follow-up after the owner's hands-on pass. Two changes, one of which
is a routing edit and one of which is a clock. No new art, no ambience; Gate 3
still owns everything atmospheric.

### 7a. The ballots open at the podium

**Revised pacing decision**, replacing §5's:

| beat | opens at | why |
| --- | --- | --- |
| morning report | **bell** (unchanged) | one ritual trip a day; it is what opens the session |
| **ballot tally** | **podium** (moved) | you voted there thirty seconds ago; the ballots open where the motion was made |
| Chaos | **bell** (unchanged) | three failed governments is news worth the walk |

The routing rule now lives in exactly one place — `objectFor(kind, gate)` in
`src/play/objective.js` — and `main.js` builds the podium and the bell out of
it. Gate 1 had the rule written twice, with the test asserting against the
copy; this is the first time one of the two moved, and it is the seam where
they would have drifted.

Measured over the same 200 matches per table size:

| table | bell trips | podium trips | bell↔podium crossings | walking |
| --- | ---: | ---: | ---: | ---: |
| 5 | 18.8 → **9.4** (−50%) | 13.4 → 22.8 | 22.1 → 17.7 (−20%) | 123 m → 99 m |
| 7 | 21.5 → **10.9** (−49%) | 13.9 → 24.5 | 24.0 → 20.3 (−16%) | 134 m → 113 m |
| 10 | 28.4 → **14.6** (−49%) | 16.5 → 30.3 | 29.6 → 26.8 (−10%) | 165 m → 149 m |

**Both numbers are reported because they say different things, and the second
one is less flattering.** Trips *to the bell* halve, which is the thing the
owner named. Total *crossings* fall only 10–20%, because the morning bell still
bookends every day: the shape of a day was bell → podium → bell → podium →
bell, and it is now bell → podium → podium → bell. What disappeared is the
mid-day bounce — voting at the podium, walking to the bell for the tally, and
walking back to the podium to draft.

The remaining bell load is now almost exactly the day count (9.4 trips over 9.3
days at five, 14.6 over 13.8 at ten), which is the "one ritual trip per day"
the change was aimed at. If it still reads as a chore after Gate 3 has given
the bell something to be, the next lever is auto-advancing the morning report —
and the `acknowledge` beats remain free to move, because they consume nothing
from the seeded stream.

### 7b. The square takes time to answer

Gate 1 ran the bots on a flat 900 ms and, worse, on nothing at all in two
places: naming a Deputy opened the ballot box in the same frame, and casting a
ballot had the tally ready before the panel finished closing. Both are one
`Driver.step` triggered by the human's own submission, so no timer was involved.

`src/play/pace.js` is the clock. Bots deliberate per phase, longest where the
decision is hardest and most private:

| phase | at 1× | at 4× |
| --- | --- | --- |
| legislative draft (either side) | 2200–3400 ms | 550–850 ms |
| power | 1800–3000 ms | 450–750 ms |
| nomination | 1500–3000 ms | 375–750 ms |
| block response | 1600–2600 ms | 400–650 ms |
| vote | 1400–2200 ms | 350–550 ms |
| bookkeeping (tally, chaos, end) | 600–1000 ms | 150–250 ms |

And a **deliberation beat** covers the two instant transitions: after one of
your own submissions, if the rules immediately owe you another decision, the
page holds for 0.9–1.7 s. During it the object goes dark *and the objective
line stops naming one* — "The ballots are sealed — the square is counting
them." One flag drives both, which is what makes "the line never points at
something that will not answer" structural rather than remembered.

The cost, since a pacing change that only adds time should say how much:

| table | bot deliberation | beats | total, 1× | was (flat 900 ms) | at 4× |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5 | 55 s | 24 s | **80 s** | 20 s | 20 s |
| 7 | 61 s | 27 s | **88 s** | 22 s | 22 s |
| 10 | 72 s | 35 s | **107 s** | 26 s | 27 s |

4× reproduces Gate 1's pace almost exactly, so the old behaviour is still on
the page rather than replaced. **Whether ~66 s of added deliberation reads as
"the square is thinking" or as "the game is slow" is a taste question nobody
has answered yet** — it is the first thing the next hands-on pass should
judge, and the bands are one object literal to change.

### 7c. Timing must not be able to change a match

This is the sharp edge of 7b. The engine's chance is one seeded stream and the
bots draw from it, so one draw taken by the presentation layer would shift
every later bot decision — silently, and only for seeds somebody re-runs.

Three defences, in order of strength:

1. **`pace.js` cannot reach the rules.** It imports nothing, is handed a plain
   integer, and returns numbers that only ever become `setTimeout` durations.
2. **It owns its own generator.** `Math.random` is deliberately *not* used: the
   same mulberry32 the engine uses, salted to a different seed in a different
   closure. So there is still no `Math.random` and no `.rng(` anywhere under
   `src/play/` — the grep gate this project has relied on since Step 4 stays
   meaningful — and a replayed seed now replays its *rhythm* too.
3. **`test/pace.test.js` tries to break it.** The same seeded match is played
   twice with an identical scripted player: once plainly, once with the clock
   hammered at every seam between engine calls, at every speed the page offers.
   The event log, the action log, the winner and the step count must be
   byte-identical.

And the third defence gets its own control, because **a probe that cannot see
the failure it is aimed at reports green** — the step-04 lesson. The same
interleave is run once more with a clock that draws a single `G.rng()` per
seam, and the log *must* diverge. It does, in 40 of 40 matches. Only then is
"28 496 pace draws changed nothing" worth anything.

## What was verified, and how

Node v20.19.4, macOS. Browser checks in a real Chromium tab at 1440×900 against
`npm run dev`, driving `window.__play` and reading results back.

**All nine gates.** VERIFIED (executed `npm run verify`):

```
node test/engine.test.js 50      OK — 28881 assertions passed
node test/controller.test.js     OK — 50 checks passed
node test/human-driver.test.js   OK — 1055 checks passed
node test/contract.test.js       OK — 6139 checks passed
node test/view.test.js           OK — 198201 checks passed
node test/interact.test.js       OK — 31 checks passed
node test/objective.test.js      OK — 65715 checks passed      <- Gate 1, extended in 1.5
node test/pace.test.js           OK — 30580 checks passed      <- Gate 1.5
node scripts/driver-parity.js    PARITY OK
vite build                       ✓ built, three entry points
```

The pace suite's own report:

```
invariance    40 complete matches played twice: 28496 pace draws interleaved
              between every engine call, at 0.5x, 1x, 2x, 4x — event log, action
              log, winner and step count byte-identical every time
probe         40/40 matches DIVERGED when the same clock drew one G.rng() per
              seam, so the check above can see the failure it is aimed at
control       40 matches forked at a real choice and diverged
purity        pace.js imports nothing, names no game object and uses no
              Math.random; no file under src/play/ draws from the engine stream
numbers       every band respected over 200 draws each; a legislative draft
              deliberates longer than a nomination, bookkeeping shorter; speed is
              an exact divisor and 4x is within the 900 ms Gate 1 shipped
rhythm        the same seed replays the same rhythm; a different seed does not
```

The objective suite's own report:

```
lines         2451 objective lines across 36 complete matches (5-10 players, the
              human seat rotated) plus three constructed beats
coverage      18 of 18 reachable states mapped
routing       every line names the bell or the podium, and agrees with the object
              the interaction system would actually open the panel at
sweep         no role, team or tile token in any line; no name outside the seats
              the square has publicly been told about
permutation   1814 hidden-role permutations left the line identical
```

**A whole match, in the browser, objective read at every state.** VERIFIED
(executed in the tab, seed 1000, seven citizens, seat 0): 74 states walked;
`mismatch: 0` between what `objectiveFor` returned and what was in the DOM;
`badTarget: 0` — for every state whose line named an object, teleporting to that
object and facing it produced that object as `look().target`. Ten distinct lines
appeared, including `bots:power` ("Waiting: Bo is using Peek Allegiance") and
the result line.

**Dialog behaviour.** VERIFIED (executed, keys dispatched into the page's own
handler so the real path runs):

```
role=dialog  aria-modal=true  aria-labelledby=panel-title  h2#panel-title present
focus on open            "Aye A"
Tab / Tab                "Nay N" -> wraps to "Aye A"
Shift+Tab / Shift+Tab    "Nay N" -> wraps to "Aye A"
#hud inert=true  #controls inert=true while open, both removed on close
focus stolen to #c-seed  -> pulled back to "Aye A"
Esc  -> panel closed, focus returned to #c-restart, inert removed,
        0 vote actions recorded, waitingFor() unchanged
reopen (E) -> same kind, same two answers
key "a"    -> vote submitted as true, 1 action recorded
result screen (no buttons) -> focus lands on the dialog itself, Esc returns focus
```

**Framing.** VERIFIED: `__play.framing` reports `screenBias 0.0687` at 1440 px,
and the capsule sits ~99 px right of centre in the screenshot, matching
`0.0687 × 1440`.

**Gate 1.5, in the browser.** VERIFIED (executed in the tab, premise re-asserted
after every restart per the hazard note below):

- *Routing.* Seed 1000, seven citizens: 74 states walked, and for every line
  that named an object, teleporting there and facing it produced that object as
  `look().target` — `bad: []`. `acknowledge:vote_result` now reports
  `podium`, with the prompt `E — open the ballots`.
- *The beat.* Voting with the `a` key: during the hold, `holding: true`,
  objective `beat:acknowledge:vote_result` ("The ballots are sealed — the square
  is counting them"), and `look().target === null` — the podium is dark. After
  it: `holding: false`, objective back to `acknowledge:vote_result` ("open them
  at the podium, where you voted"), `target: "podium"`, prompt restored. The
  line and the object turn on together.
- *Determinism through the real timer path.* Seed 4242, seven citizens, human
  decisions answered with `options[0]` both ways. `runToEnd()` with no timers at
  all hashes `6291469d` over 40 events, reproducibly. Autopilot driven **by the
  actual `setTimeout` loop** at **4×** produced 23 events hashing `79cbcd53`,
  identical to the first 23 of the untimed log; at **0.5×** it produced 10
  events hashing `52ac46d5`, identical to the first 10. Prefixes rather than
  whole matches because a hidden browser pane clamps `setTimeout` to about a
  second, which makes a full 1× match take minutes — the exhaustive multi-speed
  proof is the node suite; this is the proof that the page's own loop is the
  same loop.

**Wall-clock pacing is calculated, not stopwatched.** The bands and beats were
read back live (`__play.pace.band`, `__play.holdRemaining` — 1233 ms remaining
on a 1700 ms beat when sampled ~350 ms in), and the per-match totals in §7b are
those numbers multiplied by measured bot-step counts. Nobody has sat through an
unthrottled 1× match end to end.

**No randomness in the presentation layer.** VERIFIED:
`grep -rn "rng(\|Math.random" src/play/` returns nothing.

**Nothing else regressed.** VERIFIED in the browser:

- `walk.html`: basis `forward (0,0,1)`, `right (−1,0,0)`, camera
  `(0, 1.80, −3.50)`; `__walk.camera.screenBias === 0`; wall head-on stops at
  z = 11.650; the 35° ramp stalls at x = 1.889, y = 0.000000; the 0.40 m block
  stops it at z = −2.400; the three steps reach y = 0.510 at 3.5000 m/s. Every
  number is the one in `docs/step-03.md`.
- `index.html`: seed 1000 at seven citizens still runs to 73 steps, LOYALIST,
  a 31 365-character event log — the exact `docs/step-02.md` fingerprint.
- Console clean on a fresh load of `play.html`; the only output is the
  `[play] window.__play ready` banner.

### A verification hazard worth naming

Half an hour was spent chasing a "role changed mid-match" bug: the human read as
a Loyalist at the Emergency Vote and as a Rebel at game over, in what looked like
one continuous browser session. Nothing was wrong. **Editing a source file
between two console probes makes Vite reload the page**, which re-deals the
default match (seed 1000, seven citizens) underneath a review that believes it is
still driving seed 19. The tell was the fingerprint: 61 steps and a Loyalist win
is the seed-1000 record from `docs/step-04.md`, printed verbatim.

The rule that falls out: **a scripted browser review must re-assert its own
premise after any edit** — read the seed, the roster and the seat back, not just
the thing being measured. `__play.state()` carries all three. Every Gate 1.5
browser probe above opens by doing exactly that.

Gate 1.5 turned up a second one of the same family. The deliberation beat ends
on a clock, and nothing calls `refresh()` when it does; the render loop
re-derives the objective every frame, which is what a player sees. But
`requestAnimationFrame` does not run in a hidden pane, so the first scripted
check found the podium lit and the line still saying "the square is counting
them" — a bug that does not exist for a human and does exist for every
automated check. Fixed by re-deriving the line from the `setTimeout` loop as
well, which runs either way. **The general rule: state that changes on a frame
cannot be observed by anything that is not watching the window** — the same
reason `look()` exists.

## Open gaps, stated plainly

- **The deliberation timings have never been felt.** ~66 s of added waiting per
  seven-player match is a real change to how the game plays, and whether it
  reads as thoughtfulness or as lag is a taste question with no test. This is
  the one thing the next hands-on pass must answer; the bands are a single
  object literal in `src/play/pace.js`, and 2× or 4× is the escape hatch
  meanwhile.
- **Moving the tally cut crossings by 10–20%, not by half.** Bell *visits*
  halved, which is what the owner named, but the morning bell still bookends
  every day. If "chore" survives Gate 3, auto-advancing the morning report is
  the remaining lever.
- **Gate 1's exit condition is now partly met.** The owner played and reported
  "it is intuitive overall what to do" — that is the "reaches every required
  object without verbal coaching" criterion, answered by a person. What has not
  been re-played is the *revised* routing and the new pacing.
- **The contrast ratios are computed, not sampled.** They are exact for the
  colours declared in `style.css` over the stated backdrops, including the
  blown-out worst case — but no screenshot has been colour-sampled, and a
  browser's compositing of a `0.97` alpha over a tone-mapped WebGL canvas is not
  something arithmetic can promise byte for byte.
- **`inert` is Chrome/Safari/Firefox-current.** There is no polyfill; on an old
  browser the modal falls back to the Tab trap plus the focusin backstop, which
  is the behaviour before this change plus one improvement, not a break.
- **The objective is one line.** At a narrow window it wraps to two and the chip
  grows downward into the scene. It does not overlap the controls or the HUD at
  1440×900 or at 1024×768; below that the page is already outside the stated
  desktop support boundary.
- **`bots:vote`, `bots:vote_result` and `bots:chaos` are untested branches**,
  because no seated human can reach them. They exist so a future change to
  `humanTurn()` degrades to a correct sentence instead of a blank bar.
- Everything `docs/step-04.md` lists as open is still open: the bots have no
  collision, ballots-sealed is always 0 of N, a Peek result gets no beat of its
  own, and `applyToScene` is not node-testable.
