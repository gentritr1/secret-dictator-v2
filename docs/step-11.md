# Step 11 — Discussion Gate D3: the product HUD

The 330 px debug sidebar is gone. What replaced it is three surfaces, a rule
apiece, and one grammar underneath all of them.

Normative spec: `design/handoff/floor-and-hud/README.md` work item 3, and
Specification 4 of `Secret Dictator - Build Specs.dc.html` (wireframes 4A and
4B). The ledger — wireframe 4C — is the next gate; only its *affordance* is
here, and it is drawn dim because it does nothing yet.

```
src/play/seat.js    the one grammar: a permanent number per citizen
src/play/tray.js    1280 x 84, three regions, the never-blank rule
src/play/card.js    232 x 96, three lines and a fourth while you hold tiles
test/hud.test.js    the fifteenth gate — 133,972 checks
scripts/capture-hud.mjs   the browser acceptance set, and the style law measured
                          with the HUD actually in frame
```

---

## 1. Where the eleven rows went, and what proves it

| row | verdict | where it is now |
| --- | --- | --- |
| phase | **dies** | the light and the objective line both said it already |
| day | objective line | it was always that sentence's prefix |
| reform / seize | world + tray | the tray's left cluster, 240 px, permanent |
| chaos | ledger, **promotes at 2/3** | `tray.tracks.chaos.show` |
| speaker / deputy | world | brass marks under the name on the nameplate |
| nominee | **dies** | the vote row names both citizens |
| next power | ledger + one beat | a 3 s announcement when a Seize lands |
| deck / discard | ledger | `__play.ledger()`, on screen nowhere |
| alive | **dies** | the ring is the roster; dark plates are the dead |
| role + known | private card | the only private thing on screen |
| the log | ledger | `__play.ledger().log`, on screen nowhere |

The half of that table that is easy to get wrong is the ledger column, because
"routed to a panel that does not exist yet" and "quietly kept in the tray
because the tray had room" look identical in a screenshot. So the sweep asserts
the absence: in every state of 50 complete matches, no rendered surface contains
the words deck or discard, the chaos track is absent below 2 of 3, and no entry
of `view.log` appears on the tray or the card. `__play.ledger()` returns all of
it, which is what makes the absence a routing decision rather than a data loss.

**Measured in the browser**: `deckOnScreen: false` while `__play.ledger()`
returned `{deck: 11, discard: 3, log: 13}`.

---

## 2. The one grammar, and the bug it exists to prevent

Every citizen owns a number from roster order for the whole match. It is stamped
on the nameplate in brass in the left third, hairline-separated from the name;
it is the key you press to name them; it is retired when they die and never
reused. `src/play/seat.js` is four functions and it is a file of its own because
the tray, the card, the plates and (next gate) the ledger and the intent strip
all have to agree.

The bug it prevents is not hypothetical — it is what the code did before this
gate. The nomination panel drew `<kbd>${i + 1}</kbd>`, an index into the
*options*, and the options exclude the term-limited. So `2` was Chen on Monday
and Eze on Tuesday, and a player who had learned the square had learned nothing.
The wireframe makes the fix visible: the offered keys are `2 3 5 6` **with gaps
in them**, and a gap is information.

Seat 10 gets the `0` key. That is the whole of the exception.

**The test with teeth** is not that the markup contains a number. It is that the
same key, pressed in each of the four places a citizen can be named, submits the
same citizen: the tray's offer, the panel's `kbd` hint, `panels.handleKey` and
`panels.handleTrayKey` are all driven with a real submit callback across 13
citizen-naming decisions, and a key naming somebody who is *not* on offer must
answer nothing. In the browser: pressing `3` on the armed nomination row put
citizen 3 (Chen, roster id 2) in the ballot — `nominee: 2`.

---

## 3. Tray versus centred card, and the thing the spec did not say

The spec's rule: if a decision requires showing you **private material** — three
tiles, two tiles, a Foresight read — it takes the middle of the screen and a
deliberate close. Everything else is a tray row. Four in the tray (nominate,
vote, block response, power target), three on a card.

`surfaceFor(kind)` in `tray.js` **is** that rule, and both the tray and the `E`
key ask it, so they cannot disagree — the same shape `objectFor` has had since
Gate 1, where the objective line and the interactable share one routing
function rather than two copies of it.

### Ambiguity 1 — the acknowledgements are not in either list

`acknowledge` (morning report, Chaos screen, ballot tally) appears in neither
the spec's four nor its three, because it is not a decision: it is a ceremony
with a page of public reading and a single Continue.

**Resolved:** they keep the centre of the screen, and the tray announces that
they are pending. Reasons: the tally is a list of every Aye and Nay and does not
fit a row; the morning report carries term limits and the board; and Gate 1.5
tuned exactly where each one opens (`docs/step-05.md` — the tally moved to the
podium, the morning stayed at the bell) and this gate has no business
re-litigating that. **The alternative** — one-line tray rows with `↵` — would
have deleted the two most ceremonial beats in the match to save two keypresses.

### Ambiguity 2 — when do the tray's keys become live?

The wireframe draws `Name a Deputy: 2 Bo 3 Chen …` as though the keys are always
armed. In the walking camera that cannot be literally true: `A` is "Aye" in this
game and "strafe left" in this engine, so always-live tray keys mean walking
past the podium during your own ballot can cast it.

**Resolved: the row is offered, and `E` takes it.** The gesture is the one the
player already has — walk to the object the objective line names, press `E` —
and what changed is where the answer is given, not how you ask for it. So the
row has two states:

```
offered   Name a Deputy:                    E at the podium
armed     Name a Deputy:  2 Bo  3 Chen  5 Eze  6 Fin
```

Keys are shown only while they are live, which is the same grammar the empty
state uses from the other side: **what is on the tray is what works.** While
armed the body is frozen exactly as it is behind an open panel, `Esc` gives the
row back and answers nothing, and the interaction prompt stops offering `E` and
says what is left to press.

This is also forward-compatible with the council view, where the flagged
divergence in the handoff says `E` opens whatever decision is pending, full
stop — there, arming is the whole of the interaction and the wireframe is
literal.

**The alternative** (always-live keys) is one line of code away and is the right
answer the moment the walking camera is not the only one. It was rejected here
because an irreversible ballot cast by a strafe is the kind of bug you only find
by playing, and the fix would have been this anyway.

### Ambiguity 3 — the private card grows in the wireframe

Wireframe 4B draws the tiles state as a taller box; the acceptance checklist
says "the private card's pixel dimensions are identical in every state of every
match, tiles or no tiles". The acceptance list wins: the box is a fixed
232 x 96, `overflow: hidden`, and the fourth line's row is present in the layout
whether or not anything is in it. A HUD element that changes size is one the eye
has to re-find. Measured in the browser at `{width: 232, height: 96, top: 12,
left: 12}` in every state photographed — resting, holding three tiles, holding
two, and dimmed at night.

---

## 4. Role colour: what the rule actually constrains

"Role colour appears on exactly one 2D element and nowhere else" cannot be
enforced by sampling hexes, and the reason is the palette law itself. No new
colours are allowed, so the role palette and the board palette are **the same
three colours**: Reform blue is `--reform` and a Loyalist is `--reform`; Seize
rust is `--seize` and a Rebel is `--seize`. A pixel sweep for "the role palette"
would flag the Reform track, the tile chips, the warm objective line and the
lantern beam.

What distinguishes them is the **channel**, so that is what is enforced: the
card carries `r-loyalist` / `r-rebel` / `r-dictator` as a class, and the sweep
requires that class to appear nowhere else, in any state, in any surface. In the
browser the same question is asked of the live DOM —
`querySelectorAll('[class*="r-rebel"]…')` outside `#card` — and came back empty
in every frame captured.

The role **words** get a second, different rule. On the three permanent surfaces
(tray, objective line, prompt) they are banned outright, which cost two
rewrites: the Peek note and the Purge note in `tray.js` are written without
them. On the panel — which you opened on purpose — they are legitimate rules
copy ("you will be told Loyalist or Rebel"), so the rule there is the one that
matters: **a role word may not appear within 40 characters of any citizen's
name.** The game-over reveal is the single exception and the sweep asserts that
it is the only one.

The card's own line 3 lost something in the move and it is worth recording:
"3 Chen dictator" does not fit 232 px, so the Dictator now carries a brass ✦
mark. `test/view.test.js` was updated to assert the mark sits on the Dictator
**and on nobody else**, which is a stronger statement than the old "the word
appears somewhere on the card".

---

## 5. `screenBias`: what the composition change did to the camera

Before this gate the camera aimed *past* the body so the subject sat right of
centre, because a fixed 330 px panel covered the left of the window for the
whole match (`rig.tuning.screenBias`, recomputed on every resize).

**Now it is zero.** Nothing on screen is a full-height obstruction any more: the
private card is 232 x 96 in a corner — 1.9% of a 1280 x 720 frame, and none of
the band the body walks through — and the tray is a horizontal strip along the
bottom, which would want a *vertical* bias the rig does not have and should not
grow (raising the aim point tilts the whole square). So `play.html` now frames
exactly as `walk.html` does, which is the honest consequence of the composition
change rather than a tuning decision.

`walk.html` is untouched: `screenBias` was always 0 there, the branch that uses
it is guarded rather than multiplied by zero, and the three other pages were
re-loaded and screenshotted with no console errors.

The constant is kept named (`SCREEN_BIAS = 0`) rather than deleted so the
decision is visible where it was made, and `__play.setFraming()` still exists
for a review that wants to argue with it live.

---

## 6. The objective line did not move, and that is a measurement

The acceptance criterion is that "the objective line's position, size and
behaviour are unchanged". Its five positioning declarations are byte-identical
to the sidebar era — `top: 52px; left: 346px; right: 16px`, 14 px, the same
`fit-content` chip — and the arithmetic still holds: the private card ends at
244 px, so a bar starting at 346 px is as clear of it as it was of the 330 px
sidebar. `test/hud.test.js` pins those five declarations and requires that only
three rules in the whole stylesheet mention `#objective`.

Behaviour is pinned harder than a diff can pin it. The test folds 466 objective
lines — id, warmth, named object and full text for every state of four fixed
matches, with and without the deliberation beat — and hashes them against

```
af70565f766b7265c0a0ed403dd1103311a6251d0de367af615498892196aa99
```

which was produced by running `src/play/objective.js` **as it stood at commit
02e44a6**, before this gate. Reproducible with
`git show 02e44a6:src/play/objective.js`. A fingerprint generated after a change
proves nothing about the change; this one was not.

---

## 7. The style law, with the HUD in the frame

`__play.lighting({ measure: true })` renders the *scene* into an offscreen
target, so it structurally cannot see a single pixel of the HUD — which means it
cannot answer this gate's question. `scripts/capture-hud.mjs` counts the
composited screenshot instead, **using the project's own classifier copied out
of `lighting.js` line for line** (hue 15–70°, saturation > 0.16, lightness
> 0.18). That detail is load-bearing: a plausible RGB rule of one's own gave
5.81% where the project's rule gives 7.29% on the same frame, and only the
second number is comparable to the 10% budget.

Measured at 1280 x 720, same frame counted twice, HUD visible and HUD hidden:

| frame | light | with HUD | without | HUD's cost | budget |
| --- | --- | --- | --- | --- | --- |
| trial, ballot armed | `trial` | **7.29%** | 6.61% | +0.68 pt | 10% |
| trial, mid-match | `trial` | **3.40%** | 2.53% | +0.87 pt | 10% |
| dusk, nomination armed | `dusk` | 14.30% | 14.42% | −0.12 pt | 45% |

The night frames pass with 2.7 points of margin, and the HUD's own contribution
is under a point in both. The dusk row is not a night frame — `lighting.js`
exempts it by name, because dusk's warm is an amber *sky* and not a lantern —
and its budget is 45%; it is here because it is the warmest state the tray is
ever drawn over, and the answer is that the HUD makes no measurable difference
there at all (the −0.12 is the tray covering scene pixels that were themselves
warm, not a reduction).

Scale check, because a percentage without its sample is not a measurement: the
composited numbers are over 921,600 pixels; the director's own reading of the
same moment is over a 9,216-pixel probe of the scene alone and gave 6.04% and
2.42% respectively — same direction, same order, different instruments.

---

## 8. What was verified, and how

Everything below was executed, not inferred.

- **`npm run verify` — 15 gates green**, including the new one. 133,972 checks
  in `test:hud`; parity exact; `git diff 02e44a6 -- src/engine/` is empty, so all
  seven engine modules including the frozen five are byte-identical.
- **A government cycle played through the tray with real keys** in
  `scripts/capture-hud.mjs`: `E` then `A` on the ballot, `E` then `Enter` at the
  bell and on the tally, `E` then `3` on the nomination row, `E` then `1` on the
  draft card. Twenty screenshots in `design/reviews/gate-d3-hud/`.
- **All four tray phase states plus the empty state**, photographed:
  `08/09` nomination offered and armed (the wireframe's headline state, with
  its keys), `03/04` the motion on the floor, `02` and `13` the empty state
  naming who the square is waiting for, `08-…` the one-beat announcement ("The
  3rd Seize grants Emergency Vote."), `05` the deliberation beat.
- **The private card readable in day and night**: `01` and `08` in daylight,
  `04` and `11` under the trial beam at 35%. Box identical in all of them.
- **Nameplates** read back off the live DOM mid-government:
  `3 Chen — gavel · limited`, `6 Fin — deputy · limited`, everyone else
  unmarked, numbers matching the roster.
- **`?` toggles the keys line** (`display` went `none` → `block`); **`L` does
  nothing**, as drawn.
- **No console errors** on `play.html` through a full capture run, nor on
  `walk.html`, `index.html` or `asset-lab.html`.
- **Fingerprint unchanged**: seed 1000 / 7 citizens → 61 steps, 38 human
  decisions, Loyalist win.

---

## 9. Open gaps, stated plainly

- **The `A` key is still a strafe key.** Arming means it cannot be pressed
  accidentally while walking, but a player who arms the ballot and then wants to
  move must press `Esc` first. That is the honest cost of one keyboard serving
  two grammars, and it disappears in council view rather than being fixed here.
- **The card's third line can run out of room.** Allies, the Dictator's mark and
  Peek results share one 232 px line with `text-overflow: ellipsis`. Two allies
  and one read fit; a Loyalist with three Peeks would clip. The full string is on
  the element's `title` and in `__play.card`, and the ledger is where this
  genuinely belongs next gate.
- **The role blurb is now a tooltip.** "Five Reforms, or purge the Dictator"
  used to be a paragraph on the sidebar card; the card has three lines and no
  room, so it survives as the role line's `title`. Discoverable by hover only,
  which is not discoverable.
- **The centred-panel bodies for the four tray decisions still exist** in
  `panels.js` and are no longer reached by the page — `E` routes them to the
  tray. They are kept because `panels.open` is public API and
  `test/objective.test.js` still renders the Emergency Vote panel through it, so
  deleting them would delete a recorded review artifact. If the council view
  does not want them either, that is the gate to delete them in.
- **Contrast is computed, not sampled.** The tray's parchment and the card's
  10 px lines are AA against their own declared backdrops by the Gate 1 method;
  no pixel of a rendered screenshot was colour-picked.
- **One camera position per lighting state.** The warm measurements are from the
  standard review marks; a frame with the beam filling more of the screen would
  measure higher. The budget has 2.7 points of margin at the worst one
  photographed, which is not the same as a proof over every camera.
- **No mobile, no reduced-motion pass.** Both are out of scope for this gate and
  neither was looked at. The card's only animation is a 900 ms opacity fade.

---

## 10. Notes for the next gate

- The ledger is a fold over exactly what `__play.ledger()` returns plus
  `__play.floorLedger()`. The `L` hint is already drawn; making it live means
  flipping `tray.ledger.ready` and giving the key a handler.
- `presentation` is now `{ holding, armed, announce, night }` and is the seam any
  future clock hangs off. `L` pinning the ledger "pauses the presentation, not
  the game" — that is a fifth flag, and `test/pace.test.js` already proves that
  stopping and starting the clock cannot change a match.
- The intent strip replaces the tray's **contextual row contents**, not the tray.
  `trayFor` returns `kind` for exactly that reason: the strip is one more kind,
  with the same never-blank obligation and the same coverage gate.
- `empty:vote`, `empty:vote_result` and `empty:chaos` are admitted ids that a
  living seat cannot reach, exactly like `objective.js`'s three starred ids. If
  `humanTurn()` ever stops owing a ballot to every living seat, they become
  reachable and the coverage list should grow to match.
