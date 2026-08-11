# Step 14 — the juice map, and the player stops being a capsule

The five moments the design review ranked as worth the polish budget, built in
rank order; plus the last primitive on screen, retired.

Branch `juice-map`, off `20c84df`. The parallel asset session was working in the
same tree throughout and landed two commits onto this branch while it ran
(`0a68ae4` citizen trades, `0ee39c9` barrels and crates) — which matters for
§6, because it means the warm baseline taken at the start of this gate and the
one taken at the end are not measurements of the same square.

---

## 1. The five moments, and what each one actually does

The schedule for all five is one pure module, `src/play/stage.js`, and the
machinery is `src/play/main.js`. That split is the point: **a screenshot cannot
check a schedule.** It can show that somebody is lit. It cannot show that the
bed cut before the light moved, that the ballots were 180 ms apart, or that the
silence was 800 ms and not 780. Every number below is a constant in that module,
asserted by `npm run test:stage` (gate 12) and swept for role correlation by
`npm run test:tell` (gate 11).

### 1 — the accusation aimed at you

| beat | ms | what |
| --- | --- | --- |
| hush | **0** | the murmur bed ducks to a tenth. **First.** |
| lantern | 60 | the accuser's lantern lifts ×1.35, every other pulls to ×0.55 |
| rim | 140 | a cool rim finds your figure, from the accuser's side |
| turn | 200 | your figure turns to face them, over 420 ms. Not player-steered. |
| camera | 220 | a 6% push and ≤0.16 rad of yaw, eased over 400 ms |
| bubble | 300 | the utterance |
| objective | 380 | the line swaps to *"Dara names you — answer on the floor."* |
| **last** | **620** | the camera settles. The brief's cap is 700. |

The order is the design and the brief pins the first item: the bed cuts to
silence **first**, because the square going quiet is the pressure. If it arrived
after the light it would read as a consequence of the light rather than as the
cause of the attention.

**The honest gap, and it is the largest one in this gate.** `src/engine/orator.js`
excludes the human seat from every target pool and from every beat order — "in
D2 the player has no voice yet… being accused with no way to answer is worse
than not being accused". So **no bot ever names you in a shipped match, and this
moment never fires on its own.** That exclusion is a design decision tied to the
intent strip, which is the design doc's work item 4 and is not this gate; the
engine was not to be touched. What is built here is the staging, the trigger that
reads the floor's own lines (`accusationFrom`, which asks only who is speaking
and whom the utterance publicly named), and `__play.accuseMe()`, which drives the
identical code path for a review. Turning the moment on is one boolean in
`orator.js` plus the strip — nothing here changes.

### 2 — the ballot reveal

Ballots land **one at a time, seat order, 180 ms apart**, started from the cast
flush and nowhere else — that is the moment the square has actually opened them,
after the deliberation beat and `LIGHT_LEAD_MS`. A running count reads beside
them (`#tally`, under the objective line): two numbers and an "n of m".

The doc's acceptance criterion is *"a viewer with the sound off knows the result
before the count finishes"*, and it is the reason for the stagger rather than a
consequence of it. A number that appears is a fact you are told; a number that
accumulates is a fact you watch happen, and by the fourth of seven you know.

**Seat order** is the only order it could be: the numbers are already stamped on
the nameplates, the tray and the ledger. An order derived from anything else —
who voted Aye, who is alive, the order the engine happened to write the tally in
— would be a second ordering to learn and a channel that could correlate.

**Depth of field: NOT BUILT, deliberately.** The style bible asks for tilt-shift
here ("the town momentarily a model on a table") and the brief forbids adding a
post-processing chain. Those cannot both be satisfied: a shallow depth of field
is a per-pixel circle-of-confusion computed from a depth buffer, and there is no
way to fake it in a forward renderer without one — fog is distance haze and
changes colour rather than focus, and it is also a lighting-director channel with
a measured warm budget attached. So it was skipped rather than approximated. See
§8.

### 3 — the tile enacted

The tile travels from the lectern to a slot on the board: **520 ms of cubic
ease-out, then 110 ms of 2 cm settle.** The board is a row of outlined slots on
the dais in front of the lectern — 5 Reform, 6 Seize, read off `view.limits` —
and the empty ones stay visible beside the full ones, which is the doc's note and
is the score.

Restraint is the whole brief for it: no arc, no spin, no particles, no flash on
landing. An ease-out and nothing else, because it leaves fast and arrives slowly,
which is what a heavy thing set down by a hand does. An ease-in-out reads as a UI
transition and a linear travel reads as a sprite.

The slot index is the board's own count after the enactment (`view.reform` /
`view.seize`), so the tile and the number beside it on the tray cannot disagree.

**No new sound.** The design doc asks for "a physical thump" and this gate did
not add one, for the reason `docs/step-13.md` refused a sixth cue: the existing
`tile:reform` / `tile:seize` sting already fires on exactly this edge, and
`test/ambience.test.js` asserts that `cuesFor` fires the five moments *and
nothing else* with an exact string comparison. A thump wants to be the sting
re-voiced, not a seventh cue layered over it, and re-voicing a shipped cue is a
different decision from staging a tile.

### 4 — the purge

The beam travels off the dais onto the named citizen over 620 ms and narrows to
a cone of 0.11 against the trial's 0.34. **800 ms of total silence — the master
gain is stamped to zero at `now`, so the bed stops between two samples.** Then
one gavel. Then nothing, for 2.4 s, and the beam goes home.

The cut is not a fade and that is a code-level distinction, not a description:
`setTargetAtTime` would be a 20 ms ramp and the entire point of the moment is
that it is not one. The gavel is fired *after* the silence rather than scheduled
inside it, where it would be muted — 800 ms of silence with a swallowed gavel is
800 ms of silence and no gavel.

The topple already existed (Gate 2, off the asset's own `box.max.z`) and the
nameplate already dims and stays hanging. This gate is the framing and the
silence around them.

### 5 — the curtain call

Each figure turns to camera in **seat order, 250 ms apart**; its role seal
presses onto its own nameplate 160 ms after it turns and stays there; **the
Dictator turns last** and is held for **1.2 s** with the beam on them and every
lantern pulled to a third; and *then* the reveal table appears, which is the
doc's "beneath it". At `tableAt` the beam and the lanterns are given back, so
the square settles into the winning team's colour — the other half of the same
paragraph.

**This is the one place role colour is allowed outside the private card.** Every
other surface in the project spends its palette rules keeping allegiance off the
plates. `view.reveal` is null in every projection before game over, so
`curtainFor` returns an empty plan at every other moment of the match — and that
is asserted rather than argued (§5).

Your own figure is **not** turned: you are still steering it, and a body that
spun to camera under the player's hand would read as the controls being taken
away at the exact moment the game hands them back.

---

## 2. The measurements, and what they can and cannot resolve

Everything in this section was executed. Where an instrument cannot resolve a
number, that is said instead of a number being quoted.

### The purge silence — RESOLVED

`master.gain.value` sampled inside the page during two real purges:

```
since   0 ms   gain 0        ← the cut
since 175 ms   gain 0
since 338 ms   gain 0
since 495 ms   gain 0
since 649 ms   gain 0
since 800 ms   gain 0.0008   ← the ramp back begins; the one gavel fires here
since 958 ms   gain 0.1272
since 1749 ms  gain 0.7      ← the square is given back
```

**800 ms of exactly zero, measured on the gain the whole square runs through**,
and the gavel at 800 ms (the other purge in the same run: 920 ms, one sample
late). `audio.report().silences` records every one with its declared length and
whether it was hard.

### The ballot stagger — CONSISTENT WITH, NOT RESOLVED

Declared 180 ms. Observed, sampled by a requestAnimationFrame loop *inside* the
page across four seeds:

| run | n gaps | mean | median | min | max | frame interval during the reveal |
| --- | --- | --- | --- | --- | --- | --- |
| A | 30 | 183.8 | 179 | 158 | 317 | median 179 |
| B | 23 | 193.9 | 195 | 168 | 220 | median 196 |

**The instrument's resolution is the same order as the thing being measured, so
these numbers do not confirm 180 ms — they are merely consistent with it.** The
headless capture pane renders this square at a median frame interval of 143–196
ms, and a sampler at 190 ms cannot distinguish a 180 ms schedule from a 150 or a
210 ms one. Quoting "mean 183.8 against a declared 180" as a confirmation would
be a percentile over an unverified sample rate.

What *is* resolvable is the **span**, because the quantisation errors telescope:
the error over six gaps is one frame, not six.

| reveal | ballots | declared span | observed span | per ballot |
| --- | --- | --- | --- | --- |
| seed 1000 | 1 → 7 | 1080 ms | 1157 ms | 192.8 |
| seed 1000, next day | 1 → 6 | 900 ms | 909 ms | 181.8 |
| pooled | 11 gaps | 1980 ms | 2066 ms | **187.8** |

So: the schedule is exactly 180 ms and `npm run test:stage` proves that against
the plan at exact arithmetic; the page runs it at 182–193 ms per ballot in a pane
rendering at 5–7 fps. **A reviewer on a real 60 Hz display should re-take this
number; it will be tighter, and this one cannot be tightened by trying harder.**

### The accusation's schedule — RESOLVED as a plan, coarse as an observation

`__play.stage().accusation.offsets` reports every beat as an offset from the
trigger, live: `{hush 0, lantern 60, rim 140, turn 200, camera 220, bubble 300,
objective 380, last 620}`. The 700 ms cap is asserted in two gates, as the
*maximum over every offset* rather than against the beat somebody believes is
last — the failure mode is a sixth beat at 900 ms passing a check written about
`camera`.

Observed in the browser, the beats fire in order and the objective line does swap
to `accused`; the elapsed times at which the sampler notices them are 300–2000 ms
because the pane's main thread blocks on the renderer for over a second at a
time. That is the instrument, not the schedule.

### The curtain call — RESOLVED

Seven figures, declared last bow at 1500 ms. Observed across two matches:
1519 ms and 1617 ms. Seals on all seven plates, read off the DOM:

```
seat 0 rebel · seat 1 rebel · seat 2 DICTATOR · seat 3 loyalist ·
seat 4 loyalist · seat 5 loyalist · seat 6 loyalist
```

and the Dictator (seat 2) is last in the order with `last: true`, with every
other seat in seat order.

---

## 3. Reduced motion: the framing snaps, the light does not

Both sources are honoured and either one is a yes: the operating system's
`prefers-reduced-motion` and the page's own setting (`__play.setReducedMotion`),
because a player who wants *this game's* camera to stop moving should not have to
change a system preference to say so. The page's setting wins when it is set,
in both directions.

| what | motion on | reduced |
| --- | --- | --- |
| camera push | eased over 400 ms | snaps |
| body turn | eased over 420 ms | snaps |
| purge beam travel | 620 ms | snaps |
| tile travel | 520 ms | snaps |
| **lantern lift / pull** | crossfades | **crossfades** |
| **the cool rim** | crossfades | **crossfades** |
| **the silences** | 800 / 2600 ms | **800 / 2600 ms** |
| accusation's last beat | 620 ms | 380 ms |

**Light is information here and information should not snap.** Which two people
are lit is the entire content of the accusation; a snap is a thing that can be
missed between two frames. Motion is not information, so motion goes. Asserted as
an ordering — reduced can only ever be EARLIER, never later — rather than as a
second table of numbers to disagree with the first one.

Verified in four configurations (OS off / OS reduce / page on / page off
overriding the OS). In all four: rim intensity still ramping at the sample after
it was set, and a complete match played through to `61 steps, 38 human decisions,
Loyalist` — **every decision still reachable in every mode**, console clean.

---

## 4. The player is a citizen now, and the collider is not

Gate D3 deferred this ("swapping the player's visual is a separate decision I am
not making today"). The capsule was the last primitive on screen.

**The split that makes it safe is the one this file has always had: the capsule
is the simulation and the figure is a picture of it.** `src/walk/controller.js`
collides a capsule of `radius 0.35 × height 1.7`, and every Step 3 measurement is
a statement about that capsule. Nothing in this gate touches it — the figure is
parented under `avatarPose`, a child of the group the controller's sampled
position is written into.

**Which figure**: `variantForSeat(seat)`, the same deterministic arithmetic every
bot goes through — seat n → variant n mod 4. No special case, and that matters
beyond tidiness: in a deduction game, a body that was visibly the odd one out
would be a channel.

| the human sits at | figure | `SOCKET_label` | topple lift |
| --- | --- | --- | --- |
| seat 0 | `chr-citizen-base` | 1.950 | 0.258 |
| seat 1 | `chr-citizen-stout` | 1.800 | 0.494 |
| seat 2 | `chr-citizen-tall` | 2.297 | 0.270 |
| seat 3 | `chr-citizen-hunched` | 1.620 | 0.499 |

Collider in all four: `radius 0.35, height 1.7`, printed beside the figure in
`__play.cast.you` so a review can see the swap did not move it.

**The nameplate now comes off the same `SOCKET_label` path every citizen uses**,
with one difference stated rather than assumed: it is attached to the **avatar**,
not to this seat's floor marker. For a bot the plate and the body are the same
object, so "on the socket" and "at the seat" are one sentence. For you they are
not — the marker is the empty spot in the ring and the body is off walking around
the square. A plate pinned to the marker would name an empty disc, and the old
hardcoded 0.35 m was that plate lying flat on the ground to hide it.

**Death takes the same path.** It used to be excluded (`!c.toppled && !c.isYou`);
now your figure falls off `box.max.z` exactly as everybody else's does, greys to
`COLOR.dead`, and its plate follows it down.

**The fallback still works.** No variant, or `?body=capsule`, and the capsule is
back — per seat, so one missing file costs the player their face and nothing
else.

### walk.html regression — every number unchanged

`walk.html` imports nothing this gate touched (`src/walk/*` and
`src/walk/course.js` only), which is the structural argument; the numbers were
taken rather than reasoned to.

| mark | result | the documented Step 3 value |
| --- | --- | --- |
| wallHeadOn | z = **11.6499** | stops at z = 11.65 |
| corridor | z = **11.6499** | wall dead ahead at z = 12.00 |
| corner | x **6.3499**, z **3.5001** | settles at x 6.35, z 3.50 |
| wallDiagonal | x 10.721, z 5.9889 | slides east along corner-a |
| ramp15 | y = **1.5005** at x 11.80 | climbs to y = 1.50 |
| ramp35 | x = **1.8895**, y = 0 | stalls at x 1.89 with y = 0 |
| onRamp35 | x = 1.8895, y = 0 | slides back to the foot |
| obstacle | z = **-2.3999** | must stop at z = -2.40 |
| steps | x = -13.2079 | walks off the landing |
| platformEdge | x = 21.707, y = 0 | falls 1.50 m |

Tuning read back off the live page: `height 1.7, radius 0.35, stepHeight 0.25,
maxSlopeDeg 30` — unchanged.

### Framing: does the tall figure block the view?

The camera sits 3.5 m behind at 1.8 m, looking at a pivot 1.2 m up. At that boom
and a 60° field of view the frame covers about 4.0 m vertically at the subject,
so the figures occupy:

| figure | height | ≈ fraction of frame height |
| --- | --- | --- |
| the old capsule | 1.700 | 42% |
| hunched | 1.481 | 37% |
| stout | 1.565 | 39% |
| base | 1.725 | 43% |
| **tall** | **2.157** | **53%** |

The tall variant is +0.46 m over the capsule — visibly more of the frame, and
**it does not block anything that has to be read.** The objective line, the tray,
the private card and the prompt are DOM overlays and cannot be occluded by
geometry at all; the dais, the lectern and the crowd are visible past the figure
on both sides. Screenshots per variant:
`design/reviews/gate-14-juice/00-body-seat{0,1,2,3}-*.png`. Nothing was silently
shrunk.

---

## 5. The anti-tell gate, extended — and a row that had never fired

`test/tell.test.js` said this in its own last paragraph before this gate:

> a future animation, camera move or shader that took a role would need its own
> row here.

The juice map is that future arriving. Four rows added — **framing, stagger,
silence, curtain** — and five mutants:

| injected tell | channel | caught |
| --- | --- | --- |
| the camera pushes 20% further when the accuser is a Rebel | framing | 596 |
| the ballots land Rebels first (times unchanged, only the ORDER) | stagger | 982 |
| the purge silence runs 120 ms longer when a Loyalist is taken | silence | 335 |
| the reveal warms up early while the Dictator is Speaker | curtain | 294 |
| the tile travels 90 ms slower under the Dictator's gavel | framing | 294 |

with the eight existing mutants still caught and the control still caught 0.
Final: **1,769 moments, 1,024 permutations, 0 channel differences, every read
inside 32 declared public paths.**

The stagger mutant is deliberately the subtle one: it reorders the **seats** and
leaves the **times** where they were, so a gate that measured only milliseconds
would sail straight past it.

**THE CURTAIN ROW FOUND A HOLE IN THE SWEEP ITSELF.** The match loop exits the
instant `session.over` turns true, so it never projected a game-over view — the
curtain channel was swept 1,769 times and produced a plan **zero** times. A row
that is only ever checked in its empty state proves that the empty state is empty
and nothing else. It was caught by the exercise floor (`curtainsSeen > 0`), not
by reading the loop, which is the same class of miss `docs/step-13.md` recorded
for the mutation ordering. There is now one more projection after each match, and
the shape is checked there: everybody named exactly once, the Dictator last, seat
order otherwise, 24 of 24.

Plus the structural assertion the row exists for, checked **on every step against
the phase** rather than only under permutation — a permutation compares two runs
and would happily agree that both leaked. 0 curtain calls staged before game
over, over 1,769 moments and again over 30 more matches in `test:stage`.

### The whitelist grew, and by how much

Six new public paths, all of them things the square was told out loud or can see
by looking: `players` / `.id` / `.seat` / `.alive`, `limits.*`, and `reveal.*`.
`reveal` is the only role-shaped entry on the list, it is null in every
projection before game over, and the curtain mutant exists to prove it cannot be
read a moment early.

Two functions in `stage.js` copy arrays with a loop instead of `.slice()`, and
that is not style: the recording Proxy records `players.slice` as a read, so a
method name would have to be whitelisted beside the fields — which makes the list
about JavaScript rather than about what the square is allowed to know, and buries
the one line that would matter if it ever appeared.

### What these four rows still cannot see

The same gap, one level up. They read the channels the **staging** produces. A
tell delivered through a channel no row enumerates — a shader, a material, an
animation curve, the ORDER bubbles are queued in, how long a bubble lives — would
pass. The mutants prove the harness can catch a role reaching these four; they
prove nothing about a fifth.

And one specific blind spot worth naming: **`accusationFrom` is swept only in its
null branch**, because no bot ever names the human (§1). Its non-null path is
covered by unit assertions in `test/stage.test.js` and by `__play.accuseMe()` in
the browser, not by the permutation sweep.

---

## 6. The warm budget, before and after — and a camera that lied

`docs/step-13.md` left the budget with ~2.3 points of headroom and two claimants,
and told the next gate to measure its own baseline rather than quote last week's.
Same camera (the podium mark, facing the dais), same 1280 × 720 frame, same
forced `trial` state, HUD composited, 921,600 samples, and the project's own
classifier copied out of `measure()` in `lighting.js` line for line.

| frame | warm % with HUD | without | HUD's cost | budget |
| --- | --- | --- | --- | --- |
| **baseline, before this gate** | **8.08** | 7.42 | +0.66 | 10 |
| **shipped, after this gate** | **8.43** | 7.80 | +0.63 | 10 |

**+0.35 points, and it is almost entirely the player's own body.** Measured
directly, two loads of the same URL on the same tree — `?body=capsule` against
the plain URL, which is why that switch exists (`scripts/capture-warm-body.mjs`):

| the player's body | warm % | lit % |
| --- | --- | --- |
| the graybox capsule | **8.07** | 26.77 |
| `chr-citizen-base` | **8.44** | 23.71 |
| | **+0.37** | −3.06 |

So the five moments themselves cost about **0.0** points at rest, which is what
"three overrides with a null resting state" is supposed to mean, and the figure
costs 0.37. The HUD's own contribution is +0.63, against +0.68 in step-13 and
+0.68 in step-11 for the same frame — a small independent sign that the
instrument did not drift.

**A camera that lied, and how it was caught.** The first "after" reading was
**9.31%** — +1.23 points, which would have been the whole remaining headroom and
would have been blamed on the parallel session's new plaster, barrels and crates.
It was none of those. A restart during a staged framing left `rig.tuning.distance`
at the pushed-in value for the rest of the session, so the trial frame was being
photographed 5% closer than the rig declares. A camera that is quietly nearer
reads exactly like a square that got warmer. Fixed in `clearStage()`; the same
frame then read 8.43. **Found by the budget, not by looking**, which is the third
time in this project's memory that a warm number has been the thing that noticed
a bug in something else.

**The accusation's own cost, measured rather than argued.** The staged frame
against the frame before it, same camera, same match: **+0.10 points**. The
lift-and-pull is a net reduction in lit lantern-warm (one at ×1.35 against four
at ×0.55 is 3.55 lantern-units where the square had 5), and the rim is hue 218,
outside the amber band. But the rim still lifts the painted **timber** it lands on
over the classifier's saturation and lightness floors, and timber is amber — so
"a cool light cannot spend a warm budget" is wrong, and an earlier version of the
comment in `stage.js` said so before this was measured. At `rimIntensity: 5.2`
the same comparison was −0.15; at 14 it is +0.10. 14 is the value that makes the
second figure actually read as lit.

**Headroom left: 1.57 points.** Two claimants again.

---

## 7. What was verified, and how

Everything below was executed, not inferred.

- **`npm run verify` — 18 gates green**, exit 0, including the new
  `test:stage` (4,657 checks) and the extended `test:tell` (1,172 checks).
  `test:ambience` 31,306; `test:hud` 133,973; `test:view` 198,201; parity exact;
  build clean.
- **The frozen five are byte-identical**: `git diff 20c84df -- src/engine/` is
  empty. No engine file was touched at all.
- **Fingerprint unchanged**: seed 1000 / 7 citizens → **61 steps, 38 human
  decisions, Loyalist**, taken from the live page in five separate runs including
  all four reduced-motion configurations.
- **The purge silence**: `master.gain` sampled at 0 through 649 ms and 0.0008 at
  800 ms, on two real purges.
- **The curtain call**: 7 of 7 figures turned, 7 of 7 seals on the plates read
  off the DOM, Dictator last, table opened after.
- **The other three pages**: `walk.html` unchanged on all ten marks (§4);
  `index.html` and `asset-lab.html` load with their review handles intact and no
  page errors. The only console line on any of them is a pre-existing three.js
  deprecation warning on `index.html`.
- **Console clean** through the whole acceptance run on `play.html`: the capture
  script's `CONSOLE` line is `[]`.
- **`git status` clean, branch `juice-map`, nothing pushed.** No file from the
  parallel session's ownership list was touched: `git diff 20c84df --name-only`
  contains no `src/play/assets.js`, no `art/`, no `public/assets/models/`, no
  `docs/ASSET_MANIFEST.md`, and no existing `design/reviews/` folder —
  `design/reviews/gate-14-juice/` is new and is this gate's.

### Screenshots — `design/reviews/gate-14-juice/`

| file | what it shows |
| --- | --- |
| `00-body-seat{0,1,2,3}-*.png` | the player as each of the four citizens |
| `01a-accusation-before.png` | the trial, before |
| `01b-accusation-staged.png` | **moment 1** — the accuser's lantern up, the cool rim on your figure, the square dark, the line swapped |
| `01d-accusation-reduced.png` | the same with reduced motion |
| `03-tile-on-the-board.png` / `03b-board-filling.png` | **moment 3** — the tiles in their slots, empty slots beside them |
| `04-purge-beam.png` | **moment 4** — the beam narrowed onto the named citizen |
| `05a-curtain-turning.png` | **moment 5** — mid-curtain-call |
| `05b-curtain-table.png` | …and the table, after |
| `05c-curtain-seals.png` | the seals on the plates, panel hidden |
| `06-warm-trial-*.png` | the warm frames, with and without the HUD |
| `07-body-capsule.png` / `07-body-figure.png` | the A/B behind §6 |

`scripts/capture-juice.mjs` reproduces all of it; `scripts/capture-warm.mjs` and
`scripts/capture-warm-body.mjs` reproduce the budget numbers.

---

## 8. What was skipped, and why

1. **Depth of field / tilt-shift on the ballot count.** The brief forbids a post
   chain and there is no honest approximation: a shallow depth of field needs a
   depth buffer and a per-pixel blur. Fog is distance haze — it changes colour,
   not focus, it cannot make the NEAR field soft, and it is a lighting-director
   channel with a measured budget attached. Skipped rather than faked. It wants
   an `EffectComposer` with a bokeh pass, which is a decision about the render
   pipeline and not about a moment.
2. **A thump for the tile.** See §1.3 — it wants the existing sting re-voiced,
   and re-voicing a shipped cue is a different decision from staging a tile.
3. **The accusation's oil line and the intent strip.** The design doc's §1 gives
   the floor a ~12 s oil line and five intent cards. That is work item 4 and is
   why the accusation cannot fire in a real match today (§1).
4. **Turning your own figure at the curtain call.** You are still steering it.

---

## 9. Open gaps, stated plainly

- **The accusation has never fired in a real match**, and cannot until the D2
  target exclusion in `src/engine/orator.js` is lifted. Everything downstream of
  the trigger is built, tested and photographed through `__play.accuseMe()`; the
  trigger reads real floor lines and is exercised only in its null branch by the
  sweep. This is the single largest thing a reviewer should weigh.
- **Nobody has watched any of this at 60 fps.** Every browser observation here
  was taken in a pane rendering at 5–7 fps, which is why §2 refuses to claim the
  stagger is confirmed. The moments run off a dedicated 40 Hz timer now precisely
  so they do not degrade to the frame rate, but "it reads as an accusation"
  remains a taste question a stall-ridden capture cannot answer.
- **The cool rim reads as much on the ground as on the figure.** At 14 it is
  clearly visible and the frame has two lit areas, which is the grammar the doc
  asks for. Whether it reads as a *rim* rather than as a second small pool wants
  thirty seconds of the owner's eyes, and it is one constant
  (`ACCUSE.rimIntensity`) and one offset (`ACCUSE.rimOffset`) to turn.
- **The tile's board is procedural and sits where this gate put it** — a row on
  the dais in front of the lectern, at `z = DAIS.z - 1.58` and `- 1.24`. If the
  asset session ever ships a real board asset with its own sockets, `BOARD` in
  `main.js` should read them the way the lanterns read theirs, and the two rows
  of outlined boxes should go.
- **`?body=capsule` is a live URL switch** and is not covered by a gate. It
  exists for the §6 measurement and for anybody who wants to argue with the swap;
  if the argument is settled it should be deleted rather than left as a way to
  play a different-looking game.
- **The framing override and the wheel disagree.** `frameWith` records
  `rig.tuning.distance` when a moment starts and restores it when the moment
  ends; a player who zooms the wheel *during* a staged moment has their zoom
  overwritten when it finishes. It is two or three seconds, it is bounded, and
  the fix (track the delta rather than the value) was not worth the complexity
  this gate — but it is a real, findable behaviour.
