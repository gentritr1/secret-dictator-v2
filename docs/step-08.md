# Step 08 — the square murmurs

Layer 1 of "talk is the core": v1's dormant `AI.chatter` becomes ambient
table-talk — speech bubbles over the carved citizens at public beats, timed
into the deliberation holds. Written by the reviewer from the implementing
session's verified report; the deeper reasoning lives in `src/play/murmur.js`'s
module header and the branch commit body.

## The facade that keeps the rules deaf to the talk

`AI.chatter(G, minds, beat, ctx)` draws from `G.rng()` internally — calling it
with the real match state would shift every downstream engine draw and break
seed replay (the project's oldest law, `docs/step-01.md`). The engine is
byte-frozen, so the fix is caller-side, and the shipped version is stricter
than planned: `murmur.js` never receives `G` at all. It builds a stand-in from
the **player-safe view** (`{players:[{id, alive, isHuman}], seize, rng}`) whose
`rng` is a dedicated salted mulberry32. A module that has no `G` cannot draw
from its stream by accident, and cannot be edited into a leak later.

`minds` is passed as `null` — a mind holds every role that bot is certain of,
which is exactly what the view model exists to keep away from presentation.
Proven safe rather than assumed: chatter was called 3,499 times with `minds`
behind a throwing Proxy and the stand-in deep-frozen. No throw. Chatter reads
`players[].{alive,isHuman,id}`, `seize`, `rng()` — and nothing else.

## The proof (test/murmur.test.js, the 12th verify gate)

- **Three-run invariance**, not two: A = plain match, B = views built at every
  seam, C = views + murmurs on every beat, at 0.5–4×. A≡B proves the projection
  itself is inert before B≡C proves the talk is. 40 matches, 8,552 murmur draws:
  logs, winners, step counts byte-identical.
- **Positive control**: the same matches with chatter handed the real `G` —
  40/40 diverged. The instrument can see the failure it guards against.
- **Leak sweep** over 1,390 generated lines: no role words, no names outside
  the beat's public subjects, no dead or human speakers, no template seams.
  Two lines of v1's purge pool are barred outright (`that was a loyalist…`,
  `if that was the dictator…`) — a bright-line token rule beats a blocklist.
- **Cadence**: 41% of public beats murmur; longest quiet run 7 beats. Scarcity
  is enforced, not hoped for.

## Presentation rules

Bubbles are CSS2D, smaller and dimmer than nameplates (5.55:1 computed
contrast against a blown-out frame), ≤2 concurrent, one per citizen
(mutation-tested), 4–6 s life, dropped rather than shown late (a stale murmur
is worse than silence — which also means throttled/unfocused panes undercount
them; sample with the tab focused). Dead citizens and the human's own seat
never speak. The official "what the square has heard" log is byte-untouched.

## Honest opens carried forward

- Whether ~15 bubbles per match reads as a town or as noise is the owner's
  call; the gates live in one `BEATS` literal.
- No fade in/out yet — the obvious next polish.
- A bubble can overlap a neighbour's nameplate at some angles. Cosmetic.
- Layer 2 (task #11) is where talk becomes *deduction*: bots speaking their
  real claims and suspicions, the player answering through quick intents,
  with the text back end swappable for an LLM later.
