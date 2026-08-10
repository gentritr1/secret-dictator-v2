# Step 13 — the board becomes weather

Real lights on the lantern posts; every Seize puts one out for good; a third
audio layer that never changes; and the anti-tell law turned into a gate that
can fail.

Branch `ambience-weather`, off `3bd5aa2` (the brief named `0ed3016`; the
parallel asset session had landed `env-ground-a` on top of it by the time this
one branched, and branching off the older commit would have measured the warm
budget against a square that no longer exists).

---

## 1. What was built

| thing | where |
| --- | --- |
| lantern practicals, hung on the published sockets | `src/play/lighting.js` |
| the extinguish ORDER, as data | `LANTERN_ORDER` |
| the weather: `view.seize` -> lanterns out | `weatherFor`, `lanternPlanFor` |
| the flame: seeded flicker, and the Reform's answer | `flickerTable`, `REFORM_STEADY_MS` |
| the constant audio layer | `TOWN` in `src/play/audio.js` |
| the anti-tell sweep, mutation-tested | `test/tell.test.js` (gate 17) |
| the browser acceptance pass | `scripts/capture-ambience.mjs` |

No engine file was touched (`git diff 3bd5aa2 -- src/engine/` is empty). No file
from the parallel session's ownership list was touched.

---

## 2. The warm budget, measured before and after

This is the part of the gate that nearly went wrong, and the reason it did not
is that the baseline was measured on a **worktree at the branch point** rather
than assumed from `docs/step-11.md`.

The first attempt — a 9 m point light with a `decay` of 1.4 on each post, which
looked entirely reasonable in the table — took the composited trial frame from
7.21% warm to **21.80%**, against a 10% ceiling. Attributing that to the parallel
session's new warm plaster and cobbles would have been the easy and completely
wrong conclusion; the worktree said the square was at 7.21% *without a single
lantern hung*, so all 14.6 points were mine.

Same camera (podium mark, facing the dais), same 1280 x 720 frame, same
classifier, HUD composited, 921,600 samples:

| lantern rig | warm % | vs baseline | verdict |
| --- | --- | --- | --- |
| none (worktree at `3bd5aa2`) | **7.21** | — | the square before this gate |
| distance 9, decay 1.4 | 21.80 | +14.59 | blowout |
| distance 9, decay 2 | 9.19 | +1.98 | inside, 0.8 pt of margin |
| distance 6.5, decay 1.6 | 9.40 | +2.19 | inside, 0.6 pt of margin |
| **distance 6.5, decay 2** | **7.77** | **+0.56** | **shipped** |
| distance 4.2, decay 2 | 7.36 | +0.15 | too tight to read as a light |

So the lantern is a **physical** falloff inside a hard 6.5 m — deliberately
unlike the beam's `decay: 1`, and for the opposite reason. The beam is the
composition and wants its edge decided by staging; a practical that reaches the
far façade stops being a lamp on a post and becomes a second key light.

The shipped frame, counted twice with the HUD shown and hidden:

| frame | light | with HUD | without | HUD's cost | budget |
| --- | --- | --- | --- | --- | --- |
| trial, both lanterns lit | `trial` | **7.74%** | 7.06% | +0.68 pt | 10% |

The HUD's own contribution is +0.68 points, which is the same figure
`docs/step-11.md` measured for the same frame before any of this — a small
independent sign that the instrument did not drift. The director's own offscreen
probe of the same moment reads 6.84% over 9,216 samples: same direction, same
order, different instrument.

**Classifier**: the project's own, copied out of `measure()` in `lighting.js`
line for line — hue 15-70 degrees, saturation > 0.16, lightness > 0.18. Not a
second one. `docs/step-11.md` records why that detail is load-bearing: a
plausible rule of one's own gave 5.81% where the project's rule gave 7.29% on
the same frame, and only the second number is comparable to the budget.

---

## 3. The weather rule, and its readability floor

> **Every Seize enacted permanently extinguishes one lantern. Reforms do not
> bring one back.**

The whole of its state is `view.seize`. That count is public, was already on the
whitelist, and is **monotonic within a match** — which is what makes
"permanently" free: there is no timer, no latch and nothing to reset, because
the number the square can already read never goes down. A new deal starts it at
zero and the lanterns are lit again, which is the only re-light in the game.

`LANTERN_ORDER` is data: `['lanternWest', 'lanternEast']`. West goes first
because the dusk sun rakes in from the west, so the first Seize takes the light
off the side of the square the eye is already using. A third lantern is one
placement row in `assets.js` (owned elsewhere) and one string here — no code
below names a lantern.

**Degrading sanely.** `out = min(seizes, lanterns that actually exist)`, and the
remainder is reported as `overflow` rather than dropped or spent on something
else. Five Seizes against two lanterns is two lanterns out and an overflow of
three; nothing gets darker for the third. A square whose lantern GLB did not
load saturates at zero and is exactly the square it was before this gate.

**The readability floor is structural, not a promise.** The style bible's
three-way split — atmospheric darkness may deepen, but citizens, board and
interactables keep controlled rim light and readable silhouettes — is guaranteed
by the shape of the code: `lanternPlanFor` returns lantern entries and nothing
else, and there is no line in the director's `push()` loop that can reach the
hemisphere, the sun, the beam, the fog or the background. `test/ambience.test.js`
composes **every state at every weather level from 0 to 8 Seizes (117
compositions)** and compares the non-lantern channels byte for byte; all 117
were unchanged. No number of Seizes can take the square below its own darkest
*designed* frame, which is `chaos`, and `chaos` was already reviewed as readable.

Measured, same camera, same forced `trial` state, only the Seize count differing:

| Seizes | lanterns | warm % | **lit %** (lightness > 0.14) |
| --- | --- | --- | --- |
| 0 | both burning | 8.53 | 27.44 |
| 1 | west out | 7.76 | 26.21 |
| 2 | both out | 5.28 | 22.61 |

Monotonic in both, and the square loses 4.8 points of lit pixels across two
Seizes — visibly darker, nowhere near dark. Screenshots
`03-weather-0-seizes` / `05-weather-2-seizes`.

**The flame's body, and a hazard.** A light going out is not enough: the lantern
asset ships a `LanternGlass` material with an emissive strength of 3.75, so the
first version put out the *light* and left the *flame* burning — a post whose
pool has gone and whose lamp is still lit, which reads as a rendering bug rather
than as a town losing a lamp. The director now claims the flame body too, and
the hazard is the one the cast hit with geometry: **two placements of one GLB
share the loader's cached material**, so writing the original would have put out
both lanterns on the first Seize. It clones per placement, disposes only what it
cloned, finds the emissive by *having an emissive* rather than by the node name
`VIS_glass`, and never edits `assets.js` — which states in its own header that
it writes no material.

---

## 4. The Reform's answer: steady the flame

Three were offered — steady a flicker, settle the ambient bed, a clear bell
tone. **Steadying the flicker** was chosen, and the reason is not taste:

- It is **budget-neutral by construction.** The flicker is one-sided: the
  multiplier is `1 - amplitude * sample` with the sample in [0, 1], so a
  flickering source is never *brighter* than the number in the table. Steadying
  it therefore cannot add a warm pixel the state's `warmBudget` has not already
  accounted for. A positive response that cannot brighten the square is exactly
  what "the reward is the absence of reward" asks for.
- It speaks the **same physical vocabulary as the Seize**. The Seize takes a
  flame away; the Reform holds the remaining flames still. One channel, two
  directions.
- A bell tone would have been a second announcement over the tile sting that
  already fires; settling the bed is a channel the player has no reason to
  associate with the board.

A Reform sets steadiness to 1 (dead still) for 6 s and eases back over the last
2 s — a flame that resumed flickering on a single frame would read as a glitch.
A second Reform inside the window restarts it rather than stacking, because
"steadier than still" is not a thing. The beam is in the channel too, at a third
of the lanterns' amplitude, so the response is still visible when both lanterns
have been put out.

Observed in the browser (seed 1000, the first Reform enacted):

```
onEnact     steadiness 1,    5.73 s left, multiplier lantern 1.000 / beam 1.000
after 1.2s  steadiness 1,    4.78 s left, multiplier lantern 1.000 / beam 1.000
after 7.2s  steadiness 0,    0.00 s left, multiplier lantern 0.918 / beam 0.974
```

**Its honest weakness**: it is a temporal effect and does not show in a still.
`__play.lighting().flame` reports it numerically for exactly that reason.

---

## 5. The third audio layer, and a decision revised

Three layers now, named in `audio.js`:

1. **TOWN** — the constant bed. Low filtered noise plus a 62 Hz drone, at one
   gain for the whole match, never ramped, keyed to nothing.
2. **BED** — the phase layer. The existing filtered wind, keyed to the lighting
   state. Unchanged.
3. **CUES** — the five one-shots. Unchanged; nothing new was invented, because
   deliberate quiet is required and a sixth sound with no moment to attach to
   would be filler.

All three run through the one master gain, so the volume slider and the mute
button still own the whole square.

**What this revises, said out loud.** `docs/step-07.md` chose total silence in
daylight — "the first time the square makes a sound of its own is the first
vote". That reasoning survives at the level it was about: the wind still starts
at dusk, `BED.day.gain` is still exactly 0, and the gate asserting it is
untouched. But the day is no longer digital silence, because a room tone that
switches off in the morning is not a constant bed. `TOWN.gain = 0` restores the
shipped behaviour exactly and nothing else has to change.

There is a second, structural reason the constant layer is the one allowed to
play in daylight: **a layer that is constant is a layer that cannot be a tell**,
by construction rather than by argument. It is the only part of the ambience
about which that is true.

---

## 6. The anti-tell sweep — what it sees, and what it cannot

The design review made this law and until this gate nothing enforced it. It is
now gate 17, `npm run test:tell`.

> Given the same public record, every presentation channel is byte-identical,
> whatever the hidden roles behind it happen to be.

Swept together, because a tell in any one of them is a solve: lantern states,
the lighting id sequence, bed selection, cues, sting timing, the pace bands
drawn for real, and the seeded flicker table by checksum. Over 24 complete
matches: **1,769 moments, 1,024 hidden-role permutations, 0 channel differences.**

**The weakness, stated before it is discovered.** The production channels are
pure functions of a player-safe view, and a player-safe view does not carry
hidden roles — so their agreeing under permutation is close to *tautological*. A
sweep that only did that would be a green light with nothing behind it. So it
does three things:

1. **The premise is checked, not assumed.** The view itself is compared under
   permutation, byte for byte: 0 of 1,024 differed. "The same public record" is
   a verified fact, and if a future engine change ever let a role reach the
   projection this fails first and loudest.
2. **The detector is mutation-tested.** Seven injected tells, each reaching for
   the omniscient `G` that the real code never receives, each of which must be
   caught — plus a control mutant that changes nothing and must be caught by
   nothing:

   | injected tell | channel | caught |
   | --- | --- | --- |
   | control — no tell at all | — | **0** (required) |
   | lanterns go out from the other side when the Dictator sits odd | lantern states | 809 |
   | the west lantern dims while a Rebel holds the floor | lantern states | 81 |
   | the bed drops 40 Hz when the nominee is a Rebel | bed selection | 335 |
   | the sting holds 200 ms longer for the Dictator's Seize | sting timing | 29 |
   | the trial is lit as a power play when the Speaker is the Dictator | light sequence | 53 |
   | the gavel is swallowed when a Loyalist is nominated | cues | 101 |
   | the flicker is salted with the Dictator's seat | flame | 964 |
   | bots deliberate 15% longer over a fellow conspirator | pace | 228 |

   The mutation test **found its own bug on the first run**: all seven mutants
   were applied *after* the permutation, so both copies saw the same permuted
   game, every mutant agreed with itself, and the harness reported all seven
   clean. A mutation test that cannot fail is precisely the thing it exists to
   rule out, and only the `caught > 0` expectations caught it.
3. **The reads are audited.** The whole composed pipeline is driven through a
   recording Proxy, 300 times, and every read must fall inside the 18 declared
   public paths — because a tell need not be role-shaped. "The beam brightens
   when the deck runs low" would sail through the permutation.

**What it cannot see.** A tell delivered through a channel this file does not
enumerate. It reads the channels the *ambience* produces; a future animation,
camera move, shader or bubble-timing that took a role would need its own row.
That gap is why the row list is written out in full at the top of the file.

The whitelist was **not extended** by this gate: the weather needed exactly one
field, `seize`, which had been on the list since the file was written. The
audit asserts that `weatherFor` reads that and nothing else.

---

## 7. What was verified, and how

Everything below was executed, not inferred.

- **`npm run verify` — 17 gates green**, including the new one. `test:ambience`
  29,983 checks; `test:tell` 1,040; `test:hud` 133,973; parity exact;
  `git diff 3bd5aa2 -- src/engine/` empty, so all seven engine modules including
  the frozen five are byte-identical.
- **The warm budget**, 1280 x 720, HUD composited, project classifier: baseline
  **7.21%** on a worktree at the branch point, shipped rig **7.74%**, budget 10%.
  The before number is what makes the after number mean anything.
- **The weather**, same camera and same forced state at 0 / 1 / 2 Seizes:
  8.53 / 7.76 / 5.28% warm, 27.44 / 26.21 / 22.61% lit. Both monotonic.
  Screenshots show both lantern heads bright at 0 and dark at 2, with the dais
  pool and the citizens' silhouettes still reading.
- **The lanterns by day**: intensity 0, beam 0, glass dark — read off the rig,
  not off the table.
- **The Reform response**: steadiness 1 at enactment, still 1 after 1.2 s, 0
  after 7.2 s, multipliers never above 1.0 at any sample.
- **Fingerprint unchanged**: seed 1000 / 7 citizens -> 61 steps, 38 human
  decisions, Loyalist win.
- **The other three pages unchanged**: `walk.html` still stops head-on at
  z = 11.6499; `index.html` still plays seed 1000 at seven citizens to 73 steps,
  a Loyalist win and a 31,365-character event log; the asset lab still reports
  `env-dais-a` at 6.000 × 1.209 × 3.400 m, 11 visual nodes / 1188 triangles,
  `SOCKET_podium`. Zero page errors on any of them. (Neither `lighting.js` nor
  `audio.js` is imported by those three pages — checked by grep — but the
  numbers were taken rather than reasoned to.)
- **Console clean** through the whole capture run; the only new line is the
  `[lighting] 2 lantern lights hung on lanternWest, lanternEast` info.

---

## 8. The placement rows this gate would want, stated not made

`src/play/assets.js`, `art/`, `public/assets/models/` and
`docs/ASSET_MANIFEST.md` are a parallel session's. Two things were wanted and
worked around rather than taken:

1. **More lantern placements.** The design doc's image is "by the fifth the
   square is nearly dark"; with two sockets the fifth Seize has nothing left to
   take. Three more rows would make the weather a five-step curve, and cost
   three strings in `LANTERN_ORDER` and no code:

   ```js
   { id: 'env-lantern-a', category: 'environment',
     place: { x: -9.4, y: 0, z: 2.0, yaw: 0 },
     requiredNodes: ['COL_post', 'SOCKET_flame'],
     sockets: { lanternSouthWest: 'SOCKET_flame' }, fallback: 'capsule' },
   { id: 'env-lantern-a', category: 'environment',
     place: { x: 9.4, y: 0, z: 2.0, yaw: 0 },
     requiredNodes: ['COL_post', 'SOCKET_flame'],
     sockets: { lanternSouthEast: 'SOCKET_flame' }, fallback: 'capsule' },
   { id: 'env-lantern-a', category: 'environment',
     place: { x: 0, y: 0, z: -6.0, yaw: Math.PI },
     requiredNodes: ['COL_post', 'SOCKET_flame'],
     sockets: { lanternGate: 'SOCKET_flame' }, fallback: 'capsule' }
   ```

   The extinguish order would then be west, east, south-west, south-east, gate —
   near the dais first, so the square darkens inward toward the player last.
   Nothing in `lighting.js` changes except that list, and the warm budget would
   have to be re-measured, because three more practicals is another 0.5-1.5
   points on a frame with 2.3 to spend.

2. **No manifest row is needed.** No file was added: the town layer is
   synthesised, for the same reason `audio.js` already synthesises the bell and
   the two stings. If a real wind recording is ever sourced, it wants a row in
   `docs/ASSET_MANIFEST.md` under the same provenance rules as the Kenney
   samples, and `TOWN` would become a `url` + synthesised fallback exactly like
   `gavel` is.

---

## 9. Open gaps, stated plainly

- **Nobody has watched the flicker.** It is one-sided, seeded, bounded and
  reported numerically, and the Reform's steadying is verifiable from the
  readback — but whether a 16% dip at 7.5 Hz reads as a flame or as a flickering
  monitor is a taste question a screenshot cannot answer. It wants thirty
  seconds of the owner's eyes on a live trial, and a single constant
  (`FLICKER.lantern`) to turn if the answer is no.
- **The town layer is a decision, not a measurement.** `TOWN.gain = 0.014` was
  chosen to sit under the quietest phase bed and was never listened to on real
  speakers by anyone. It is one constant, and zero restores the shipped silence.
- **Two lanterns is not the design doc's image.** See §8. The mechanism is
  built and saturates honestly; the *drama* of it needs the placements.
- **The warm budget has 2.3 points of headroom and two claimants.** This gate
  spent 0.56 of it and the parallel session's albedo work is still landing. The
  next thing that adds warm to a night frame should measure the baseline first —
  on a worktree, the way §2 did — because "it was under budget last week" is now
  a claim about somebody else's commits.
