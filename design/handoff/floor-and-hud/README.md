# Handoff: The Floor, the Council View, and the Product HUD

Target repo: `gentritr1/secret-dictator-v2` (branch `main`). Everything here is
additive to a finished, deterministic game engine. **No rule in this document
changes.**

---

## Overview

Three bodies of work, in dependency order:

1. **The structured claim schema** — bot and player speech becomes canonical,
   deterministic, replayable data in the engine. Everything else depends on this.
2. **The discussion layer ("the floor")** — event-driven speech beats between
   phases; bots speak from real internal suspicion, the player answers through
   quick intents on a bottom tray, never free text.
3. **The HUD replacement** — the current 330px debug sidebar is retired in favour
   of a hybrid: public state in the 3D world, private state on a small carved
   card, actions on a persistent bottom tray, history in a pinnable ledger.

A fourth, **the council view**, is a second camera (fixed miniature-theatre
framing) that shares one interaction grammar with the existing walking camera.
It is being A/B tested by hand and is built as a toggle. Do not remove the
walking camera.

---

## About the design files

The `.dc.html` files in this bundle are **design references written in HTML**.
They are prototypes of intent — layout, wording, timing, exact values — not
production code to lift. The game is a browser three.js app; the task is to
implement these designs inside that codebase, using its existing systems
(`view.js`, `lighting.js`, `panels.js`, `objective.js`, `style.css`) and its
existing test discipline.

Open them directly in a browser; `support.js` must sit beside them.

| File | What it is |
| --- | --- |
| `Secret Dictator - Build Specs.dc.html` | **The primary spec.** Council view, claim schema, the player's turn, tray/card/ledger. Every ASCII wireframe and acceptance checklist lives here. |
| `Secret Dictator - Design Doc.dc.html` | The prior round: discussion rationale, juice map, onboarding, retention, dead-player experience. Contains a **live interactive demo** of the intent strip (click it, press 1–5 / ← → / E / Esc). |
| `Square HUD v0.dc.html` | Pixel-perfect recreation of the **current** debug HUD, overlaid on the real `design/reviews/gate-3-cycle/03-vote-trial.png` capture. This is the "before". |
| `github.md` | Source association and screen map. |
| `design/reviews/gate-3-cycle/*.png` | Real captures from the repo, for reference. |

---

## Fidelity

**Mixed, deliberately, and it matters which is which.**

- **Hi-fi and exact:** the claim schema (section 2), all camera arithmetic
  (section 1), all timings in milliseconds (section 3), every acceptance
  checklist. These are specifications — implement them literally.
- **Lo-fi wireframes:** every ASCII box. They fix *composition, hierarchy,
  wording and keyboard mapping*, not pixels. The visual styling comes from the
  game's own locked art direction and `docs/STYLE_BIBLE.md`, not from the
  monospace boxes.
- **The design doc's HTML chrome** (Spectral serif, the dark document palette)
  is documentation styling. It is **not** the game's UI language. Do not port it.

---

## The game's art direction (locked — read the style bible before styling)

> "A handcrafted small-town stage at dusk, where warm lantern light is attention
> and cold blue dark is suspicion."

| Token | Value | Rule |
| --- | --- | --- |
| Lantern glow | `#f8d868` | **Scarce.** Warm light always means information. |
| Timber | `#684828` – `#783818` | Frames only, never fills. |
| Slate | `#384848` | |
| Night ambient | `#181828` | Dark is blue, never black. |
| Reform | blue (`#6aa6e6` in mocks) | Board/track only. |
| Seize | rust (`#e8695f` in mocks) | Board/track only. |
| Parchment | `#d8d4c8` | Reading surfaces, low opacity. |
| Brass | hairline edges | Never a fill. |

Hard constraints: **no new colours**; a night frame including HUD measures
**under 10% warm pixels**; role colour appears on exactly one 2D element (the
private card) and nowhere else.

---

## Work item 1 — The structured claim schema

Build first. Everything downstream reads it.

### Envelope

```
Utterance {
  id        "u-14"        match-unique, ordinal, engine-assigned
  day       4
  floor     "f-6"
  seq       2             beat index within the floor
  speaker   3             SEAT NUMBER, never a name
  kind      CLAIM_HAND | ACCUSE | SUPPORT | QUESTION | SILENCE
  target    5 | null
  basis     <enum> | null
  refs      { … }         IDS ONLY: government_id, utterance_id, power_id, floor_id
  amends    "u-9" | null
  text_id   "deny.voted_with_gavel.2"
}
```

**Forbidden at schema level, enforced by an allowlist test:** `role`, `team`,
true hand, `confidence`, `suspicion`, `weight`, `sincerity`, free text, and
anything derived from `G` that `view.js` would not disclose.

`text_id` rather than a string: keeps the record small, translatable and
diffable, and lets bubble / log / ledger render the same utterance without three
copies of the prose drifting.

### CLAIM_HAND

The only kind asserting a fact about hidden material, so the only kind that can
be caught lying.

```
refs.government  "g-3"    must be RESOLVED
seat_role        speaker | deputy     must match public record
drawn            {reform, seize}      speaker only; counts, never order
passed           {reform, seize}      speaker only
received         {reform, seize}      deputy only
blocked          bool                 deputy only, only if Block was available
enacted          REFORM | SEIZE|null  denormalised from public record
```

Validity — a claim failing any of these **cannot be constructed**:

- V1 speaker held that seat in that government (public)
- V2 the government has resolved
- V3 counts sum: drawn = 3, passed = 2, received = 2
- V4 one CLAIM_HAND per speaker per government unless `amends` is set
- V5 a dead citizen makes no claims
- V6 the floor is open to that speaker

### Contradiction rules — evidence, never verdicts

| Rule | Condition | Flag |
| --- | --- | --- |
| C1 | speaker's `passed` not a subset of `drawn` | self · impossible |
| C2 | deputy's `received` lacks the enacted tile | record · contradicts the board |
| C3 | speaker's `passed` ≠ deputy's `received`, same government | pair · one of the two is lying |
| C4 | claimed draws exceed deck composition (read from engine, not hard-coded) | deck · over-claimed |
| C5 | later claim differs from earlier, `amends` unset | self · changed story |
| C6 | accuses on a basis their own prior claims contradict | self · argues against own record |

A flag names a rule and its refs and **stops**. It never says who lied. In C3 it
cannot — the pair is flagged, the player decides.

### Other kinds

```
ACCUSE { target, basis, refs }
  basis              required refs           valid when
  vote_pattern       governments[] ≥ 2       tallies public
  contradiction      utterances[] + flag id  flag currently holds
  claim_consistency  utterances[] ≥ 2        both prior claims
  isolation          governments[] ≥ 3       target in none
  enactment          government              target sat in it, Seize enacted
  power_use          power                   target held it
  silence            floors[] ≥ 2            target SILENT on each
  gut                {}                      always; weakest, reads as weak

SUPPORT { target, basis, refs }
  basis: corroborate(utterance) · partner(government) · vote_pattern · claim_consistency
  Living target, not you. Supporting a flagged claim is itself referencable later.

QUESTION { target, about, refs }
  about: hand(government) · vote(government) · accusation(utterance) · silence(floors[])
  Creates an OBLIGATION: target takes the first beat of the next floor.
  Not aimable at the dead, or at a hand never held.

SILENCE { prompted_by, explicit }
  prompted_by: floor_open | question(utterance) | accusation(utterance)
  explicit: true if chosen, false if the beat ran out.
  Both public, and DIFFERENT events. Recorded, never inferred.
```

### Floor-opening triggers

| Id | Condition | Beats | First beat |
| --- | --- | --- | --- |
| T1 | morning report acknowledged, day ≥ 2 | 3 | most unanswered flags |
| T2 | a government fails at the ballot | 2 | the rejected Speaker |
| T3 | a tile is enacted | 3 | Speaker, then Deputy |
| T4 | a power's public effect announced | 2 | the power holder |
| T5 | a citizen is purged | 1 | whoever aimed it |
| T6 | an unanswered QUESTION carries over | +1 | the questioned citizen, prepended |

**Never opens** during a vote, during drafting, at two alive, or after game over.
**Caps:** six beats per floor including carry-overs; one floor per phase
transition; no citizen takes two beats on one floor unless a QUESTION obliges.

### Ledger entry

A pure fold over utterances + public record, nothing else — so it rebuilds from a
replay and audits under the existing permutation test. **No score, no trust
meter, no percentage.** See wireframe in section 2 of the spec file.

### Acceptance

- Field allowlist test over 50 complete matches passes; fails when a `role`
  field is added on purpose.
- Permutation test extends to speech: rewrite roles a seat may not know → its
  utterance stream and every ledger entry serialise identically.
- Each of C1–C6 has a triggering fixture and a near-miss fixture.
- Constructor rejects V1–V6; a fuzz sweep accepts no invalid claim.
- Ledger rebuilt from replay is byte-identical to the live one.
- **A match with the floor disabled produces the same event log as the same seed
  with it enabled** — proof speech changed no rule.

---

## Work item 2 — The player's turn on the floor

### Arrival order (hard timings)

```
   0 ms  murmur bed cuts out — silence is the first signal
   0 ms  accuser's lantern lifts; cooler warm rim finds YOUR figure
 200 ms  your figure turns to face them (not player-steered)
 400 ms  camera settles, both in frame        [instant if reduced motion]
 400 ms  bubble readable above the accuser
 600 ms  objective line swaps: "Chen names you — answer on the floor."
 700 ms  tray centre becomes the intent strip (140 ms ease-out, 44 px rise)
 700 ms  the oil line begins to burn
──────   nothing appears after 700 ms. Ever.
```

The strip is a **change of contents in the existing tray**, not a new panel.
That is why it can arrive this fast without startling.

### The strip

Four to six slots, filled by a pure function of the public record plus the
prompting utterance. A slot is offered only if the schema would accept the
resulting utterance — so the strip **cannot** produce an invalid claim, and its
contents are testable without a renderer.

| Slot | Kind | Offered when |
| --- | --- | --- |
| 1 | answer the charge | always, when something was said to you; sentence chosen by the accusation's *basis* |
| 2 | ACCUSE ▸ | some citizen has a basis stronger than `gut`; basis auto-selected as strongest, and shown |
| 3 | CLAIM_HAND ▸ | you held a seat in a resolved, unclaimed government (V1–V4); submenu is counts, not citizens |
| 4 | QUESTION ▸ | a living citizen has an unclaimed hand or unexplained ballot |
| 5 | SUPPORT ▸ | someone backed you or shares a government; **dropped rather than padded** |
| 6 | SILENCE ⌀ | always, always last, always the same key position |

**Stable order is what makes the expert fast.** Slot 1 is always the answer, the
last slot is always silence, the middle *contracts* rather than reorders.

Cards show the sentence truncated at 34 chars; the highlighted card's full
sentence is printed verbatim on the tray's second line. **You never speak
something you have not read.**

Keys: `1–9` pick · `← →` move highlight · `E` speak highlighted · `Esc` back one
step (never answers) — except at the top level of the strip, where Esc is
silence. Target submenus use **the citizens' own permanent numbers**.

### The oil line

2px brass-gold rule under the tray, burning down over ~12s. It does **not**
flash, pulse or change colour. Pressure is carried by sound: over the last three
seconds the crowd murmur fades out. Running out is an answer —
`SILENCE, explicit: false`.

**Setting: "The floor waits for you"** replaces it with a static brass rule and
holds the beat indefinitely; silence must then be chosen. Nothing else changes.
**No rules decision has a clock in either setting.**

### What silence costs (observable only, no hidden number)

- Log records it by name: `Alice said nothing.`
- The accuser gets a free follow-up beat, appended to this floor.
- Two silences make you a legal target for `basis: silence`.
- Silence after a QUESTION is recorded distinctly and is the most expensive.

### Acceptance

- First-time player, uninstructed, answers within **10 s** (bubble → keypress,
  ten testers).
- Third-match player answers within **2 s** at least half the time.
- Nothing appears later than 700 ms after the bubble.
- Every speakable sentence is printed in full on screen before it is spoken.
- Fuzzed over 50 matches: zero schema-rejected submissions from the strip.
- With "the floor waits for you" on, a match left ten minutes is unchanged and
  the log shows no silences.

---

## Work item 3 — Tray, private card, ledger

### The one grammar (governs everything)

**Every citizen owns a number for the whole match.** Stamped on their nameplate,
it is the key you press to name them, identical in both cameras. Numbers are
**never positional** — they come from the engine's roster order, never change on
death, and dead numbers are retired, never reused.

### Retiring the eleven sidebar rows

| Row | Verdict | Why |
| --- | --- | --- |
| phase | **dies** | light and objective line both say it, better |
| day | objective line | already the prefix: "Day 4 — …" |
| reform / seize | **world + tray** | deliberately redundant; the one number you must never squint at |
| chaos | ledger, promotes to tray at 2/3 | irrelevant at 0, loudest thing on screen at 2 |
| speaker / deputy | world (brass nameplate mark) | you look at people, not a row about people |
| nominee | **dies** | nomination reframes them to centre screen |
| next power | ledger + one tray beat | announced for one beat when a Seize lands |
| deck / discard | ledger | once-a-day number; also input to C4 |
| alive | **dies** | the ring is the roster; dark plates are the dead |
| role + known | **private card** | only private thing on screen |
| the log | ledger | rebuilt as per-citizen entries, not a scroll |

Eleven permanent rows → two permanent readouts, brass marks on people, one panel
opened on purpose.

### Tray — 1280 × 84px, persistent

```
┌─ 240 ────────┬─ flexible ─────────────────────────┬─ 200 ──────────┐
│ the tracks   │ the contextual row                 │ ledger · keys  │
└──────────────┴────────────────────────────────────┴────────────────┘
```

**Never blank.** The empty state names who the square is waiting for, in dim
parchment, with no keys offered — so "nothing to press" is unmistakable. See the
spec file for all four phase states rendered.

**Tray vs centred card:** if a decision requires showing you **private material**
(three tiles, two tiles, a Foresight read) it takes a centred card — private
material deserves the middle of the screen and a deliberate close. Everything
else is a tray row. Four in the tray (nominate, vote, block response, power
target), three on a card (speaker draft, deputy draft, foresight).

### Private card — 232 × 96px, top-left

Three lines at rest (number + name, role, who you know); a fourth appears while
holding tiles and is removed the instant you enact. **Never grows, never
animates, never asks for a click.** Dims to 35% during night states. The only 2D
element permitted role colour.

### Ledger — 420px right, `L` to pin, `Esc` to close

Per-citizen entries, not a chronological scroll — chronology is not what you need
at day five. Promoted rows (deck, chaos, next power) sit at the top. Flagged
citizens carry an amber mark **and only a mark**. The dead keep their entry and
their number.

Keys: `L` pin/unpin · `1–9` jump to citizen · `F` flagged only · `Esc` close.

**Pinning pauses the presentation, not the game.** Bots stop deliberating, light
holds, the engine is untouched. The word "paused" sits in the header. The tray's
contextual row stays live behind it — a decision you own can be answered with the
ledger open.

### Acceptance

- Every phase of a complete match has a defined tray state and none is blank
  (headless sweep, 50 matches).
- Private card pixel dimensions identical in every state, tiles or no tiles,
  both cameras.
- Nothing outside the private card carries role colour (sample the rendered UI
  layer for the role palette).
- Open ledger → wait a minute → close produces a byte-identical event log.
- Every ledger row traces to a public utterance or public record entry; a
  permutation of unknown roles leaves the ledger identical.
- **The objective line's position, size and behaviour are unchanged from today,
  in both cameras.**

---

## Work item 4 — The council view (behind a toggle)

Composition is one number. Ring radius `r` grows with the table; every other
value derives from it, so a 5-seat and a 10-seat frame are the same photograph
with more people in it.

```
r       = 2.60 m + 0.24 m × (seats − 5)
dolly   = r × 3.40          camera distance from ring centre
height  = r × 1.95
pitch   = −30°              fixed, every table size
fov     = 30° vertical      the compression (walking mode is 60°)
aim     = ring centre, 1.05 m up
roll    = 0
near/far= 0.5 / 60
```

Player's seat at screen-bottom-centre, back three-quarters to camera; others
clockwise in roster order from your left; board at ring centre on the dais.
Drag yaws ±18° and springs back over 600 ms; pitch locked; **wheel inert**.

Nameplates: **fixed 88 × 34px, never scaled by distance** (theatre labels, not
world signage). Number in brass in the left third, hairline-separated — that is
the key you press. At most three marks beneath the name (gavel, deputy,
term-limited), all brass or dim, **never coloured** — colour on a plate would be a
channel that could leak allegiance. Your ledger flags show as a single amber dot.
Dead plates stay, struck through, number retired. `SOCKET_label` per cast variant
still decides anchor height.

### Input parity

| Input | Council | Walking |
| --- | --- | --- |
| `1–9` | name that citizen / tray action | identical |
| click a plate | same as its number; hover previews the sentence | identical |
| `E` | open the pending decision, wherever it lives | use what you are facing (existing contract) |
| `Esc` | back one step, never answers | identical |
| `L` | pin ledger, presentation pauses | identical |
| WASD | see flagged issue 3 | walk |
| drag / wheel | yaw ±18°, springs back; wheel inert | free orbit and zoom |

### Reframes (light first, then camera, then people — never cuts)

| Trigger | Council | Walking | Timing |
| --- | --- | --- | --- |
| nomination opens | yaw to centre gavel-holder, dolly in 10% | push 6%, yaw to podium | 520 ms ease-in-out |
| vote opens | two-shot Speaker + nominee, others to silhouette | trial rig, no camera move | light 2 s, camera 520 ms |
| drafting begins | dolly in 22% on the lectern | hall dims, dais lit | 700 ms |
| accusation lands on you | yaw until accuser + your seat both framed, 6% push | 6% push + yaw, figure turns | 400 ms |
| power aimed / purge | beam narrows, **camera holds** | identical | 800 ms hold |
| resolved | return to neutral frame | return to follow camera | 400 ms |

**Reduced motion** (setting + `prefers-reduced-motion`): every camera move
becomes an instant set of the destination framing. **Light keeps its 2 s
crossfade — light is information and information should not snap.** Bubbles and
tray appear without sliding. Nothing is removed.

### Acceptance

- At 1280 × 720, all 10 nameplates at a 10-seat table are legible and none
  overlaps another by a pixel.
- 5-seat and 10-seat neutral frames overlaid: board at the same size, same place.
- "Accuse citizen 4" is one keystroke in both cameras, and the same citizen.
- Every plate mark on screen also appears in the public log.
- Reduced motion: no camera property animates beyond one frame; every decision
  still opens.
- Night trial frame under 10% warm pixels in council view as in walking view.

---

## Flagged: where the two cameras genuinely cannot share a grammar

Do not force these. Each is a small honest branch.

1. **The objective line's verb.** "Walk to the podium and name a Deputy" is a lie
   in council view. Keep the id and the named object in `objective.js`; split
   only the verb clause into a table of two phrasings per id, selected by camera
   mode. The existing objective test then asserts both columns are total.
   *This is the one file the camera decision genuinely reaches into.*
2. **Proximity, facing, the bench.** Range, facing cone and overlap-resolution
   have no meaning when you are not in the square — do not simulate them with a
   cursor. In council view `E` opens whatever is pending, full stop. The bench
   has no council equivalent: sitting out becomes tray action `0` (say nothing
   this session).
3. **WASD in council view.** A player who has walked will press W. Doing nothing
   is bad; repurposing the keys is worse (muscle memory returns on switch back).
   Proposal: W nudges camera yaw 6° and springs back — acknowledges the press,
   changes nothing, cannot be mistaken for walking. Delete it if the A/B settles
   on council-only.

---

## Related design work (context, not this build)

`Secret Dictator - Design Doc.dc.html` carries the rationale plus three things
that inform priorities:

- **Juice map**, ranked: (1) accusation aimed at you, (2) ballot reveal —
  ballots land one at a time, 180 ms apart, tilt-shift for the count,
  (3) tile enacted — **every Seize permanently extinguishes one street lantern**,
  so the board becomes weather, (4) purge — beam narrows, 800 ms total silence,
  one gavel, nothing else, (5) reveal at game over as a curtain call.
- **Onboarding**: no tutorial screen. During match 1 only, exactly one object in
  the square is warm at a time and it is the object the objective line names. One
  new concept per day.
- **Dead-player experience**: one panel at the moment you topple offering "keep
  your eyes shut" or "open the ledger" (all roles revealed — dramatic irony beats
  suspense for a spectator). Requires an audited disclosure path in `view.js`.

---

## Assets

No new assets. The four PNGs under `design/reviews/gate-3-cycle/` are existing
repo captures, included as reference for the current state. Typography and colour
come from the repo's `src/play/style.css` and `docs/STYLE_BIBLE.md`.

---

## Suggested build order

1. Claim schema + validity + contradiction rules + the allowlist and permutation
   tests. Nothing renders yet.
2. Floor triggers and beat scheduling; bots speak into existing bubbles.
3. Tray (all phase states, empty states) + private card; retire the sidebar rows
   per the table.
4. Intent strip + oil line + the silence recording.
5. Ledger.
6. Council view behind a toggle; the three flagged branches.
