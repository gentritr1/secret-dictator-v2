# Step 07 — Gate 3: the light tells you what the square is doing

`docs/BLENDER_PIPELINE.md` sets this gate's exit:

> the cycle reads without debug explanation, secret information stays inside
> the safe view, frame time is stable, and a hands-on pass approves it.

This is the code half of it: a **view-driven lighting director**, **AgX** in
`play.html`, **minimal sound**, and the **asset placement table** the reviewer's
Blender lane will add rows to. No new geometry — the lantern, the façade, the
ground treatment and the citizen base are the other half of the gate and belong
to Blender.

```
npm run test:ambience   # the new gate: every reachable state has a light
npm run verify          # eleven gates now, all green
node scripts/capture-cycle.mjs    # the acceptance set, at 1x, through the real page
```

New: `src/play/lighting.js`, `src/play/audio.js`, `test/ambience.test.js`,
`scripts/capture-cycle.mjs`, `public/assets/sfx/`,
`design/reviews/gate-3-cycle/`. Changed: `src/play/main.js` (the director, the
sound, the cast lead, AgX, one loop fix), `src/play/assets.js` (the table),
`play.html` + `src/play/style.css` (volume and mute), `package.json`, `README`,
`docs/ASSET_MANIFEST.md`. Nothing under `src/engine/` or `src/walk/` was
touched.

## 1. The lighting director

### The mapping, and why its signature is the whole design

`lightingFor(view, presentation)` is a pure function from the **player-safe
projection** to one of thirteen named states. It is built exactly like
`objectiveFor` in `src/play/objective.js`, and for a sharper version of the same
reason.

An ambience wired to the driver's event stream would be a **tell**. That stream
is omniscient — ballots, hands, what a Peek found — and "the lamp dips whenever
the Speaker discards a Reform" is a complete solve of the game, delivered
through the atmosphere, and invisible in every diff anyone would ever read. So
the director is handed the projection and nothing else, and
`grep -rn "eventLog" src/play/lighting.js src/play/audio.js` returns nothing.

The states:

| state | when | look |
| --- | --- | --- |
| `day` | the morning report gate | soft overcast, beam off — the only state with no warm light at all |
| `dusk` | `nomination` | low amber sun raking west, teal bounce, the beam just alight |
| `trial` | `vote` | deep blue, ONE warm beam pooled on the dais — the hero reference |
| `result:passed` | `vote_result`, carried | the beam is HELD and warms; the ambient lifts |
| `result:failed` | `vote_result`, failed | the beam narrows and cools; the ambient drops |
| `drafting` | `legislative_*`, `block_response` | dim hall, lit dais — the pool is on the desk, not on a person |
| `power` | `power` | the trial's pressure, colder |
| `chaos` | `chaos` | nobody is speaking, so the beam goes to an ember |
| `enacted:reform` | a Reform lands | a cool blue lift, 1.4 s |
| `enacted:seize` | a Seize lands | a red push, 1.4 s |
| `victory:loyalist` / `victory:rebel` | game over | the winning team's colour, and it stays |
| `unknown` | a phase this file has not been taught | daylight — a state nobody designed should be legible, not moody |

Two details in that table are decisions rather than transcription.

**The morning gate is read before the phase.** The session's morning report
fires while the engine is already in `nomination`
(`src/engine/human-driver.js`), so a mapping that switched on `view.phase`
first would make `day` unreachable and open every morning at dusk. The gate is
tested first, and `test/ambience.test.js` asserts it: *"the morning report is
lit as X rather than as day"*.

**`unknown` is daylight, not a mood.** It is the defensive branch, and the gate
requires that a real match never produces it — which is the difference between
"every state maps" and "every state maps to something somebody chose".

### The whitelist, and why the permutation test was not enough

`test/ambience.test.js` checks the trust boundary two ways, because one of them
is weak on its own.

The **permutation** check is the `test/view.test.js` idiom: rewrite the roles
this seat may not know, rebuild the state, require it identical. 1934 of them
per run. It only fails if a leak is *role-shaped* — "the beam brightens when the
deck runs low" would sail straight through it.

So the second check is a **recording Proxy**. The view is wrapped so every
property read is written down by dotted path, and the set must be a subset of
eighteen declared paths. That is the check that survives a future edit, and it
is why the whitelist in the module header cannot drift away from the code:

```
phase · winner · waitingFor.kind · waitingFor.gate · lastVote.passed
nominee · reform · seize · lastEnacted.tile        (publicEdges only)
```

Injecting `&& view.you.role` into one branch fails with
`lightingFor read fields outside the whitelist: you, you.role`.

### The style bible as assertions

`docs/STYLE_BIBLE.md`'s rules are measurements, not adjectives, so they are
checkable. Three of them are now assertions on the table:

- **every night state declares a warm budget ≤ 0.10** ("if a night scene is more
  than ~10% warm pixels, it has lost the language");
- **at most one lantern-warm source per night state**, where "lantern-warm" is
  hue 20–65° with saturation over 0.25 — deliberately not "more red than blue",
  because the Seize sting's `#e8695f` sits at about 4° and a red alarm is not a
  lamp. Getting that distinction wrong would either ban the sting or wave a
  second lamp through;
- **no pure black anywhere** in any colour in the table.

And the budget is then **measured**, not just declared.
`__play.lighting({ measure: true })` renders the live scene into a 128×72
offscreen target with the same tone mapping the canvas uses, reads it back, and
classifies each pixel in HSL (hue 15–70°, s > 0.16, l > 0.18).

**That was the choice, and it was the right one**: state-based bookkeeping can
only ever re-report the numbers in the table, and the table is exactly the thing
that could be wrong. A plausible-looking intensity can still light half the
square. The rule is about the *frame*, so the check reads the frame. It is on
demand only — `readRenderTargetPixels` stalls the pipeline, and a style gate
that cost frame time would be switched off. Over-budget prints a warning naming
the state, the measurement and the rule; it does not throw, because an over-lit
frame is a thing to fix in a table, not a reason to take the match away.

Measured through the shipped page at 1440×900, seed 1000:

| state | warm % of frame | budget |
| --- | ---: | ---: |
| day | 2.30 | — |
| dusk | 3.31 | 45 |
| **trial** | **2.30–2.47** | **10** |
| result:passed | 1.53 | 10 |
| result:failed | 0.94 | 10 |
| drafting | 0.46 | 10 |
| power | 1.23 | 10 |
| chaos | 0.52 | 10 |
| enacted:seize | 1.46 | 10 |

### Light changes first, people move second

Staging rule 2 of the style bible, implemented rather than intended: on a phase
change `refresh()` re-aims the director immediately and **stages** the cast
update for `LIGHT_LEAD_MS` (260 ms). The square changes colour before anybody's
ring or badge does.

It also waits for the deliberation beat, and that turned out to matter more than
the lead did. See §2.

### Transitions

Exponential, `1 - exp(-dt / tau)` with `TRANSITION_SECONDS = 1.9` — the same
frame-rate-independent idiom the avatar's step smoothing uses, so a 30 Hz and a
144 Hz display cross the same fade in the same wall-clock time.

Two things about it were wrong first and are worth keeping written down.

**A sting needs its own speed.** At the mood crossfade a 1.4 s tile sting never
*arrived*: it got about 40% of the way there and was taken away again, which
reads as the square going slightly blue for a moment. The two `enacted:*` states
declare `transition: 0.3` and the settle back afterwards runs at the normal
speed, because the override is read off the *target*.

**"Arrived" has to be a relative test.** The first version required the beam
within 0.5 units of target. A beam crossing 140 units needs 4.6 time-constants
to satisfy that; a hemisphere crossing 3 needs 1.8. So `__play.lighting().state`
reported the *old* state for seconds after the screen had stopped changing. It
is now within 1.5% of the target's own size, and a state that is interrupted
mid-fade reports `state: null` rather than the last one it fully arrived at —
a readback that disagrees with the picture is worse than no readback.

## 2. The beat holds the ambience, and that is the sharpest finding in this gate

Casting a ballot resolves the whole election inside one `Driver.step` — the
engine has counted the votes before the panel has finished closing
(`docs/step-05.md` §7b). Without a hold, pressing `A` produced, in the same
frame:

- the seal sound (correct — it is your keystroke),
- the tally sound,
- the light going to `result:passed`,
- and `applyToScene` painting every seat's **AYE / NAY badge**.

The player therefore knew the result before walking to the podium to open the
ballots. **This is not a leak** — `view.lastVote` genuinely is public the moment
it is written, and the whitelist test is right to allow it. It is worse in a
duller way: it spends the beat Gate 1.5 built and spoils the panel the player is
on their way to open.

So during a beat, `ambience()` fires **your own** cue immediately and queues
everything the square is about to announce; `pumpAmbience()` releases the lot
when the beat ends, and the staged cast update waits for the beat too. Measured
through the real keyboard, the audio clock says it worked:

```
before   seal at 1131 ms, tally at 1131 ms      (same frame)
after    seal at 3082 ms, tally at 4812 ms      (1730 ms apart; the beat is 1700)
```

The mid-beat capture (`design/reviews/gate-3-cycle/04-beat-counting.png`) shows
`state: trial`, `target: trial`, and the objective line still reading *"The
ballots are sealed — the square is counting them."*

### The loop fix that made `dusk` reachable at all

The first cycle capture showed the square going from morning straight to a
ballot: `dusk` never happened. The audio timestamps found it — **the bell cue
and the gavel cue were 157 ms apart**, against a declared nomination band of
1500–3000 ms.

The cause is a timer already in flight. While the rules wait on the human the
match loop polls every `IDLE_INTERVAL` (200 ms) to notice an answer; the tick
that notices then takes the bot's action **immediately** and only afterwards
computes a proper `pace.delayFor` delay. So every human submission was followed
by a bot action within 200 ms, at every speed, since Gate 1.5.

`panels.onSubmit` now re-times the loop from the submission. **No pace band
changed** — this only makes the ones `docs/step-05.md` already declared actually
elapse, and `npm run test:pace` still holds the property that timing cannot
change a match. It is a deviation from this gate's "no pacing changes" non-goal,
taken deliberately and flagged: without it the gate's own acceptance criterion
(*a full cycle at 1× shows the light story*) is unreachable, because one of the
five states in that story never appears.

## 3. AgX

`play.html` had no tone mapping; `asset-lab.html` has used AgX since Gate 2
because the pipeline says to review material values under it. Two images of the
same timber, and a colour judgement made on one did not transfer to the other.
`docs/step-06.md` recorded the discrepancy and left it to this gate.

The page now uses `THREE.AgXToneMapping`, and `?tone=linear` turns it off — the
same affordance as the lab's `T` key, so the decision can be re-examined rather
than taken on trust.

**What it actually changes, measured rather than asserted.** With the shipped
rigs, at 1440×900, scene region only (HUD cropped):

| state | mean RGB | p99 RGB | pixels ≥ 250 |
| --- | --- | --- | ---: |
| day, linear | (91, 101, 112) | (177, 159, 169) | 0.13% |
| day, AgX | (94, 106, 117) | (169, 159, 169) | 0.13% |
| dusk, linear | (74, 67, 82) | (199, 144, 144) | 0.22% |
| dusk, AgX | (74, 69, 86) | (183, 149, 150) | 0.13% |
| **trial, linear** | (18, 21, 37) | (146, 140, 90) | **0.48%** |
| **trial, AgX** | (15, 18, 34) | (148, 141, 104) | **0.13%** |

At these levels AgX barely moves the midtones and does its whole job in the
highlights: turning it off nearly quadruples the clipped fraction of the trial
frame, and the beam pool stops being amber timber and starts being a white hole.
That is a smaller claim than "the old rig reads flat and washed", which is what
this section said before the numbers were taken — the honest version is that
**AgX is a highlight decision, and the beam is the only highlight in the game.**

Every intensity in `src/play/lighting.js` is an AgX number and there is no
second table for the other curve; two tables is how the instrument and the game
end up disagreeing again.

### Retuning the rigs, and one thing that is not tone mapping

The first AgX pass produced ground pixels at `(3, 3, 4)` — effectively black,
against the bible's "dark is blue, never black". Raising the hemisphere
*intensity* four-fold barely moved it, and the reason is worth writing down:
**intensity multiplies a colour, and the colour was already nearly black.**
`#1d2440` at 2.3 is still `#1d2440`-ish. The fix was the ambient's *hue and
value* — a mid blue (`#505a8a` over `#38385c`) at a lower intensity. The darkest
scene pixel in the trial frame is now `(1, 11, 20)`: a blue, not a black.

`scene.background`, incidentally, is **not** tone mapped — the trial background
measures exactly `(24, 24, 40)` = `#181828`, the bible's own value, while the
geometry beside it goes through the curve. That mismatch is why the ground
needed lifting at all, and it is a fact about three.js worth remembering before
the next colour argument.

### Against the references, in numbers

Same warm classifier, run over the concept art and over the game:

| | warm % | mean L |
| --- | ---: | ---: |
| `mood-night-trial.png` (hero) | 4.46 | 0.047 |
| **game, `trial`** | **3.43** | **0.107** |
| `mood-dusk-gathering.png` | 48.37 | 0.287 |
| game, `dusk` | 3.56 | 0.302 |
| `mood-day-discussion.png` | 25.23 | 0.258 |
| game, `day` | 2.88 | 0.417 |

The trial is close on both axes and that is the one that matters — it is the
signature image. The dusk and day gaps are almost entirely **albedo, not
light**: the references are full of amber plaster, timber and cobbles, and the
square is still grey boxes. That is the reviewer's Blender lane, and it is the
single best argument for the façade and ground treatment being next. The day
frame is also brighter than the reference mean, because the reference has a
skyline of dark buildings and the graybox has a flat sky band.

## 4. Sound

### What was reused, measured rather than guessed

v1 (`../secret-dictator/assets/sfx`) ships six Kenney UI Pack sounds, CC0. The
band energy decides which of them fit:

| file | <200 Hz | 200–800 | 0.8–3k | 3–8k | >8k | verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `tap-a` | **62.2%** | 8.9 | 18.8 | 9.2 | 1.0 | **kept — the gavel** |
| `tap-b` | **81.2%** | 7.0 | 10.3 | 1.1 | 0.5 | **kept — under the seal** |
| `click-b` | 1.1 | 11.6 | 80.6 | 5.6 | 1.1 | skipped |
| `switch-a` | 0.0 | 3.3 | 44.7 | 47.7 | 4.3 | skipped |
| `switch-b` | 0.0 | 4.2 | 28.0 | 59.7 | 8.1 | skipped |
| `click-a` | 0.1 | 0.6 | 8.1 | 62.2 | 29.1 | skipped |

`tap-a` and `tap-b` put most of their energy below 200 Hz behind a 10–14 ms
attack: they are low wooden knocks, which is what a gavel and a seal are. The
other four put 85–91% above 800 Hz — bright digital UI blips, the opposite
register from a hand-carved town square. They are skipped rather than
repurposed, which is the brief's own instruction: silence beats filler.

**Stated as an inference, not an observation: this is a spectrum judgement, not
a listening one.** Nothing in this session heard the files. Both cues carry a
synthesised fallback voice, so swapping either back out is one field in `CUES`.

A bell, a tally and an ambient bed have **no candidate in that library at all**,
so they are synthesised in `audio.js`: an inharmonic six-partial bell with a
noise strike, a two-knock rising fifth for the tally, a rising fifth for a
Reform and a falling minor third over a detuned pad for a Seize.

### The wiring

| cue | fired by | source |
| --- | --- | --- |
| bell | **your** morning acknowledge | your keystroke |
| gavel | a nomination made | `publicEdges` — `nominee` went from nobody to somebody |
| seal | **your** ballot | your keystroke |
| tally | the ballots opened | `publicEdges` — the square entered `vote_result` |
| tile:reform / tile:seize | a tile reached the board | `publicEdges` — the Reform/Seize counts moved |

The bed is **filtered noise and nothing else**, one entry per lighting state,
`gain: 0` for daylight. That is a real answer, not an omission: the brief
offered "day birds", there is no bird recording in this project or in v1's
library, and a synthesised bird is filler. Silence in the day also buys the
night bed its whole effect — the first time the square makes a sound of its own
is the first vote.

The tally is deliberately **neutral about the outcome**. The light already says
whether the motion carried, and two channels announcing the same thing in the
same instant is one of them being decoration.

### Autoplay, and the deliberate non-queue

No `AudioContext` exists until the first real gesture; `start()` hangs off both
`pointerdown` and `keydown` because it is idempotent and cheap, which is more
reliable than picking one gesture and hoping. Cues before that are **dropped,
not queued** — a queue means the first click of the session fires four sounds at
once, which is worse than silence.

Verified with a trusted click under `--autoplay-policy=user-gesture-required`:

```
before any gesture   started:false  contextState:"none"  droppedBeforeGesture:0
after one click      started:true   contextState:"running"  samples:["gavel","seal"]
console               clean — no warnings, no errors
```

And every cue carries a synthesised voice, including the two that ship a file,
for the same reason `src/play/assets.js` keeps the graybox: a missing asset is
not a broken game. A failed fetch is one warning and a WebAudio voice.

## 5. The asset placement table

`src/play/assets.js` now declares the square as a table — `ENVIRONMENT` — and
`loadEnvironment()` walks it. Every row is loaded in parallel and every row may
fail independently: a missing lantern must not cost the square its dais.

**The contract for the incoming assets**, which is the whole point of the
refactor. Each of `env-lantern-a`, `env-facade-a`, the ground treatment and the
citizen base is **one row and no code**:

```js
{ id: 'env-lantern-a', category: 'environment',
  place: { x: 5.5, y: 0, z: 5.5, yaw: 0 },
  replaces: [],                                   // graybox pieces it takes over
  requiredNodes: ['COL_post', 'SOCKET_LanternLight'],
  sockets: { lantern: 'SOCKET_LanternLight' },
  fallback: 'capsule' }
```

- `url` is **derived** from `category` and `id` — the pipeline fixes that path,
  so writing it per row is one more thing that can disagree.
- `fallback: 'graybox'` means the procedural square keeps the pieces in
  `replaces` (the Gate 2 behaviour, unchanged for `env-dais-a`).
  `fallback: 'capsule'` draws a labelled grey volume at `place` — **visual
  only**, contributing no collision, because a placeholder that blocked the
  player would turn a missing asset into a movement bug. That is the answer for
  a citizen or a façade, which have no graybox to fall back to and would
  otherwise be an invisible hole nobody notices until a review asks where the
  building went.
- Sockets merge into one flat map and a second row claiming a name an earlier
  row already took **throws** — the same reasoning as `buildSquare`'s unknown
  `omit` name. The failure it would otherwise cause is a podium anchored to the
  wrong asset, which reads as a targeting bug and is not one.

The single-asset entry points (`ENV_DAIS_A`, `buildEnvironment`,
`loadEnvironmentAsset`) are unchanged and are still what `test/glb.test.js`
drives, so the Gate 2 gate did not move. The table ships with **one row**, on
purpose: inventing rows for assets that do not exist would be inventing the
assets.

## 6. The gate: `test/ambience.test.js`

15 535 checks over 36 complete matches, in five parts:

```
table         13 states, 6 of them night frames: warm budget <= 0.10,
              one lantern-warm source each, no pure black
sound         6 cues, every one reachable and every one with a voice;
              bed covers all 13 lighting states, silent by day
coverage      12 of 12 reachable states, over 2661 states of 36 complete matches
leak          400 whitelist audits (every read inside 18 allowed paths),
              1934 hidden-role permutations left the light identical
edges         512 gavels / 512 tallies / 128 Reform + 142 Seize stings,
              each matching a fact the rules confirm
purity        neither module imports the engine, draws from its stream,
              uses the platform generator or names the driver's log
```

### The bug the gate found, and how

`publicEdges`'s tally started as *"`lastVote` changed"*. It is quietly wrong:
**two consecutive elections can produce a byte-identical tally.** Seed 3210 at
five citizens does it — the same Speaker nominates the same citizen on two
successive days and it fails 1–4 both times — and the second tally simply never
fired.

What found it is worth more than the fix. The first version of the edge check
counted nominations by watching `view.nominee` go from null to a seat, which is
character-for-character what `publicEdges` does; it agreed with the bug
perfectly. Rewriting the independent count to come from the **engine's own
public prose** (`view.log`: `/ nominated /`, `/^Government elected /`,
`/^The motion fails /`) made the disagreement appear immediately as
`tally stings 510 vs elections held 512`.

**The rule: a cross-check derived from the same fields as the thing it checks is
not a cross-check.**

The tally now fires on entering `vote_result`, with the content test kept as the
second half of an `OR` so a caller that misses the transition still hears it.

### Mutation testing

Nine faults, one at a time, each restored:

| injected fault | first failure |
| --- | --- |
| `vote` lit as dusk | `a vote is lit as dusk` |
| the mapping reads `view.you.role` | `lightingFor read fields outside the whitelist: you, you.role` |
| the tally back to the content-only test | `tally stings 510 vs elections held 512` |
| the trial's warm budget raised to 30% | `trial declares a warm budget of 0.3, over the 0.10 night ceiling` |
| the trial's sun turned lantern-warm | `trial lights 2 lantern-warm sources; the night states get one` |
| the trial background set to pure black | `trial uses pure black, which STYLE_BIBLE reserves for nothing` |
| a bed under the daylight | `daylight is not silent — the day bed is the one that must be` |
| the ballot fires no cue | `sealing a ballot did not fire the seal` |
| `chaos` falls through | `phase chaos fell through to the undesigned state` |

One of them, **the tally mutant, survives at 12 games and dies at the default
36** — the colliding seed is game 30. The default game count is therefore
load-bearing, and lowering it to make the suite faster would silently disarm
that check. Recorded here so nobody does it.

## What was verified, and how

Node v20.19.4, macOS. Browser checks in headless Chromium at 1440×900 against
`npm run dev`, driving `window.__play` and reading results back. Every capture
re-asserts its premise first (the `docs/step-05.md` hazard).

**All eleven gates.** VERIFIED — executed `npm run verify`:

```
node test/engine.test.js 50      OK — 28881 assertions passed
node test/controller.test.js     OK — 50 checks passed
node test/human-driver.test.js   OK — 1055 checks passed
node test/contract.test.js       OK — 6139 checks passed
node test/view.test.js           OK — 198201 checks passed
node test/interact.test.js       OK — 31 checks passed
node test/objective.test.js      OK — 65715 checks passed
node test/pace.test.js           OK — 30586 checks passed
node test/ambience.test.js       OK — 15535 checks passed        <- Gate 3
node test/glb.test.js            OK — 390 checks passed
node scripts/driver-parity.js    PARITY OK
vite build                       ✓ built, four entry points
```

**The cycle, at 1×, through the real keyboard.** VERIFIED — executed
`node scripts/capture-cycle.mjs`; images in `design/reviews/gate-3-cycle/`. The
bell is rung and the ballot cast with real key events, so the beat runs:

```
01-morning-day      nomination  state day    target day             warm 2.65%
02-nomination-dusk  nomination  state -      target dusk            warm 3.14%
03-vote-trial       vote        state trial  target trial           warm 2.30% of 10%
04-beat-counting    vote_result state trial  target trial           "the square is counting them"
05-result           vote_result state result:passed                 warm 1.53% of 10%
06-drafting         legislative_deputy  state drafting              warm 0.46% of 10%
07-enacted-sting    vote        state enacted:seize                 warm 1.46% of 10%
08-settled          vote        target trial (settling back)        warm 2.29%
09-game-over        game_over   target victory:loyalist             warm 0.80%
```

Every state's objective line was read out of the DOM in the same probe and is
printed beside each shot. **Judging whether it *looks* right is the owner's
call, and it has not been made** — see the open gaps.

**Sound, through real gestures.** VERIFIED — executed under
`--autoplay-policy=user-gesture-required`; the ordering is quoted in §2, the
autoplay behaviour in §4. Mute: clicking `#c-mute` set `aria-pressed="true"`,
relabelled to `Unmute`, and a cue fired while muted produced **0** voices;
clicking again produced 1.

**Nothing leaks and nothing draws.** VERIFIED — executed:

```
grep -rn "eventLog" src/play/lighting.js src/play/audio.js   -> nothing (exit 1)
grep -rn "rng(\|Math.random" src/play/                       -> nothing (exit 1)
```

**A whole match, unchanged.** VERIFIED in the browser: seed 1000, seven
citizens, seat 0, `runToEnd()` → **61 steps, 38 human decisions, LOYALIST, 61
events** — the exact `docs/step-04.md` / `docs/step-06.md` fingerprint. Console
on a fresh load is clean: the `[play] window.__play ready` banner and the
`[assets] env-dais-a loaded …` line, no warnings, no errors.

**The fallback.** VERIFIED — executed with `env-dais-a.glb` renamed away and
restored afterwards:

```
[assets] env-dais-a not loaded (load-failed: Unexpected token '<', "<!doctype "…)
         · the square falls back to procedural graybox and the match is playable.
environment.ok false, fallbacks [{ id: env-dais-a, fallback: "graybox" }]
podiumAnchor (0, 0, 8.1)
step onto the graybox dais  y 0.2199999988079072 at z 9.571296, 3.4999997936150447 m/s
lighting  state day, target day, warm 0.65%, tone AgX
match     61 steps, 38 human decisions, LOYALIST
```

The lighting is unaffected by the asset question, which is the point of the
director being independent of what is in the scene.

**Nothing else regressed.** VERIFIED in the browser:

- `walk.html`: `wallHeadOn` stops at `z = 11.6499`, `__walk.camera.screenBias
  === 0` — the `docs/step-03.md` numbers.
- `index.html`: loads with its handles intact (`__sd`, `__eventLog`,
  `__gameRef`). Its one console warning (`PCFSoftShadowMap has been
  deprecated`) is pre-existing and belongs to `src/app/`.
- `asset-lab.html`: report unchanged — `6.000 × 1.209 × 3.400 m`, ground
  `0.0000 m`, `11 (1188 tris)` visible, `2 (24 tris)` collision,
  `SOCKET_podium`, three named materials, `doubleSided none`, `unnamed none`.
  Console clean.

## Findings reported, not fixed

- **The lectern collider is still 6 cm proud of the visible desk** — carried
  over from `docs/step-06.md`; Blender's lane.
- **The dais timber under AgX.** Judged on the trial capture, `TimberOchre`
  reads as a pale cream in the beam pool rather than as the bible's
  `#684828–#783818` warm timber. That could be the beam (a runtime number, mine)
  or the albedo (a `.blend` value, the reviewer's). The beam has been pulled
  down as far as it can go while still reading as a stage light, so **the
  remaining suspicion is on the material, and calibrating it is explicitly the
  reviewer's lane.** Flagged, not touched — `src/play/assets.js` still patches
  no material at runtime and `npm run test:glb` still fails if it does.
- **The bot deliberation hole**, fixed for the panel path (§2) but described
  here because it existed since Gate 1.5 and every pacing measurement in
  `docs/step-05.md` §7b was taken *without* it: the per-match totals there
  understate the real elapsed time by up to 200 ms per human submission.

## Open gaps, stated plainly

- **Nobody has judged how any of this looks or sounds.** Every number above is
  a measurement; whether the trial frame reads as the hero reference, whether
  the bell reads as a bell, and whether ~2 s of light transition feels like a
  town or like lag are owner calls on the capture set and a hands-on pass. The
  gate's own exit says "a hands-on pass approves it", and that has not happened.
- **The v1 samples were chosen on a spectrum, not by ear.** §4 says so at the
  point of the claim. If `tap-a` turns out to sound like a plastic tick, the fix
  is `url: null` on that cue and its synthesised knock takes over.
- **`dusk` is a swell, not a held state.** With the loop fixed it lasts the
  bot's 1500–3000 ms nomination band against a 1.9 s crossfade, so it reaches
  roughly 55–95% before the trial pulls it cold. When the human holds the gavel
  it lasts as long as they take. Whether that reads as "the square gathering" or
  as "a colour wobble" is the same taste question.
- **The dusk and day frames are far less warm than their references (3.6% and
  2.9% against 48% and 25%), and the reason is albedo.** No amount of lighting
  will close that on grey boxes. It is the strongest argument for the façade and
  the ground treatment being the next assets.
- **`litFraction` in the measurement is a crude number** and flips on the
  background band: `#181828` sits just under the 0.14 lightness threshold and
  `#1d1c2e` just over it, so `trial` reports 14–21% and `result:passed` reports
  55%. It is informational; `warmFraction` is the one the rule is about.
- **Frame time has not been measured.** The gate's exit says "frame time is
  stable" and this pass added a second shadow-casting light (the beam, 1024²)
  and one more material-free pass. `renderer.info` cannot be read by a scripted
  probe (`docs/step-06.md`), so this needs an eyes-on FPS check on the owner's
  machine.
- **The two shadow maps are always on**, including at day when the beam is at
  zero intensity. Toggling `castShadow` at runtime forces a shader recompile and
  a visible hitch, so it was left alone; if the profile says otherwise, the
  answer is a threshold with hysteresis, not a per-frame toggle.
- **`__play.setLighting(id)` can force a state**, for capture passes. It does not
  override the mapping — the next `refresh()` aims the rig back at whatever the
  view says — which is deliberate: a debug setter that could hold a state against
  the view would be a way to photograph a lighting story the game never shows.
- Everything `docs/step-06.md` lists as open is still open.
