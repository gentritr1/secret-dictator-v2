# Step 06 — Gate 2: one asset, all the way through

`docs/BLENDER_PIPELINE.md` sets the exit for this gate:

> tracked `.blend`, validated GLB, collider and podium socket from that GLB,
> fixed captures, manifest row, clean console, and green verification.

The `.blend`, the GLB and the captures landed in the previous commit. This is
the other half: the runtime seam that consumes them, the instrument that
reviews them, and the gate that stops a future re-export from quietly breaking
the square.

```
npm run test:glb     # the new gate: 390 checks, in three layers
npm run verify       # ten gates now, all green
```

New: `src/play/assets.js`, `src/lab/` + `asset-lab.html`, `test/glb.test.js`.
Changed: `src/play/square.js` (an `omit` option), `src/play/main.js` (the boot
order and the podium anchor), `vite.config.mjs` (a fourth entry),
`package.json`, `docs/ASSET_MANIFEST.md`, `README.md`. Nothing under
`src/engine/` or `src/walk/` was touched — the controller, the camera and the
BVH world took the asset without a line of change, which is the first real
evidence that the Step 3 seam was cut in the right place.

## 1. The loader seam

`src/play/assets.js` is 250 lines and exists to enforce three rules, each of
which is a way this could have gone wrong quietly.

### Placement lives in the loader, not in the mesh

The asset is authored bottom-centre at its own origin with its front on `+Z` —
the runtime convention, locked by the front-marker test. The square wants it at
`(0, 0, 9)` facing the crowd, which is `-Z`. That is one placement group with a
`position` and a `yaw`, declared next to a comment saying why:

```js
place: { x: 0, y: 0, z: 9, yaw: Math.PI }
```

The tempting alternative — rotate the geometry in Blender until it looks right
in this one scene — is what the pipeline forbids, and the reason is not
tidiness. A dais rotated to suit the square is a dais whose `.blend` no longer
describes the asset; drop it into a second scene, or export a variant, and the
correction is invisible and wrong. The rule that falls out and is now in the
file: **a placement transform is data about a scene, an authored transform is
data about an asset, and they must not be stored in the same place.**

Getting the yaw wrong by π is the failure this invites, and it is not caught by
any bounds check: the asset is symmetric in X and the box is the same box either
way. What catches it is a fact about the game — `test/glb.test.js` requires the
podium socket to land *behind* the lectern, on the far side from the crowd. Flip
the yaw and the speaker is standing in front of their own desk.

### The collider replacement, and why nothing else noticed

The pipeline's own recipe is six steps; the loader does four of them and
`main.js` does two:

1. find and hide every `COL_*` node — hidden rather than deleted, which is the
   pipeline's word, and inert (`castShadow` off, `matrixAutoUpdate` off);
2. clone its geometry and apply the node's `matrixWorld`, so the collider is
   born in world space with the placement already in it;
3. strip everything but position and normal;
4. merge with the graybox pieces and hand the result to `createBvhWorld`.

Step 3 is the one with a story. `mergeGeometries` refuses a set whose attributes
do not match, and the graybox collider is position+normal (`square.js` deletes
its `uv`) while every GLB primitive ships `TEXCOORD_0`. Left alone that is not a
subtle bug — it is a hard failure at boot, on the line that builds the world the
player stands on. It is in the file as a comment because the next asset will
have the same seam and no memory of this one.

`src/play/square.js` gained `buildSquare({ omit })`, which leaves named pieces
out. Called with no argument it builds exactly what it always built — that is
what makes the graybox a fallback rather than a claim — and an unknown name
throws, because the failure it would otherwise cause is a dais rendered twice,
one of them invisible to the collider, which reads as a physics bug and is not
one.

**The square is now built exactly once per boot**, after the asset question is
answered:

```js
async function boot() {
  const env = await loadEnvironmentAsset(ENV_DAIS_A);
  buildGround(env.ok ? env : null);
  restart(...);
  requestAnimationFrame(frame);
}
```

The alternative — build the graybox immediately and swap when the GLB arrives —
was rejected on purpose. It puts two collision worlds in one session, a moment
where the player is standing on one of them and about to be handed the other,
and a class of bug that only appears on a slow network. Waiting costs a few
milliseconds on localhost and produces one code path per boot.

### The socket, and the one thing it must not disturb

`SOCKET_podium` becomes the podium interactable's anchor. Asset-local
`(0, 0.22, 0.35)` arrives in the world at `(0, 0.22, 8.65)`, which is on the
dais, behind the lectern, where a speaker stands. The graybox number it replaces
was `(0, 0, 8.1)`, the lectern box's own centre.

The interactable reads it through a function, because `interact.js` already
allows `position` to be one:

```js
interactions.add({ id: 'podium', position: () => podiumAnchor, radius: 3.0, ... })
```

**What the swap must not touch is the routing**, and this is worth stating
precisely because Gate 1.5 spent a section on it. Where a panel opens is
`objectFor(kind, gate)` in `src/play/objective.js` — one function, read by both
the objective line and the interactable's `canInteract`. The socket changes
*where the podium is*; it cannot change *what the podium answers*, because it is
not consulted about that. So the line and the object still cannot disagree:
they were never agreeing about position in the first place, only about identity.
The browser sweep below re-proves it anyway, at 73 states of a whole match.

The one real consequence is 0.55 m of approach depth. The podium's 3.0 m radius
is now measured from `z = 8.65` instead of `8.1`, so the southern edge of the
reachable zone moved from `z = 5.10` to `z = 5.65`. `__play.marks.podium`
(`z = 6.40`, the scripted standing spot, deliberately left at its graybox value
so a review can be compared with `docs/step-05.md`) keeps 0.75 m of slack.
Measured in the browser rather than reasoned about: the prompt is live at
`z = 5.70` and gone at `z = 5.50`.

### The fallback, proved by taking the file away

Every failure path returns `{ ok: false, reason }` and one console warning.
Nothing throws. Renaming `env-dais-a.glb` out of the way and reloading:

```
[warn] [assets] env-dais-a not loaded (load-failed: Unexpected token '<',
       "<!doctype "... is not valid JSON) — /assets/models/environment/env-dais-a.glb
       · the square falls back to procedural graybox and the match is playable.
```

One warning, no errors, `__play.environment.podiumAnchor` back at `(0, 0, 8.1)`,
the graybox dais still walked onto at `y = 0.220` and `3.4999998 m/s`, and a
whole match played to game over: 61 steps, LOYALIST — the seed-1000 fingerprint
from `docs/step-04.md`, unchanged.

Note what the failure actually was. Vite's dev server answers a missing asset
path with `index.html`, so the file did not 404 — it parsed as HTML and
`GLTFLoader` threw on the first character. A production build would give a real
404. **Both arrive at the same `catch`, which is the argument for catching the
whole load rather than checking the response status:** the two obvious failures
of a missing asset do not look alike, and only one of them is the one you would
have thought to test.

The warning says three things on purpose — which asset, what went wrong, and
that the game is still playable. A warning that only says `404` sends the reader
to the network tab instead of to the manifest.

## 2. `asset-lab.html`

The fourth entry, and the pipeline's review instrument: any GLB under
`public/assets/models/` (dropdown, or `?asset=<path>` for anything at all), the
real `1.70 m` calibration capsule, a 1 m grid and a 0.25 m banded pole, four
fixed cameras on `1`–`4`, four lighting modes on `D`/`U`/`N`/`S`, the collider
overlay on `C`, tone mapping on `T`, and `renderer.info` on screen.

Three decisions in it are worth writing down.

**It is permissive, and therefore independent.** It does not import
`src/play/assets.js`, which would be the obvious reuse. It cannot: the runtime
loader *refuses* an asset with a missing node, and an instrument that can only
display assets which already pass is useless for finding out why one is failing.
So it classifies `VIS_`/`COL_`/`SOCKET_` itself, in about twenty-five lines, and
shows what is in the file — including a file the game would reject. It imports
nothing from the engine at all.

**The collider overlay is drawn from the world-baked clone**, not from the
`COL_` nodes as authored. Those are two different pictures the moment a node
carries a transform, and the one worth seeing is the geometry the BVH is
actually built from. It is the same three lines the runtime loader runs.

**The capsule moves with the camera, which the first version got wrong.** It
was placed one standoff in front of the asset, centred — the honest position for
a player. In the front view it stood squarely in front of the lectern, in the
one view whose entire job is the lectern. It now steps aside for the three
review cameras and stands one body-width off the centre line even in the game
view. Found by looking at the render, which is the only way it could have been
found.

The game camera is the play camera's real numbers — `3.5 m` behind, `1.8 m` up,
looking at `1.2 m`, `60°` — mirrored front-to-back, because the game approaches
the dais from world `-Z` while the lab shows the asset unplaced with its front
on `+Z`.

**A discrepancy the lab makes visible rather than hides:** the pipeline says
review material values under AgX, and the lab defaults to it; `play.html`
renders with no tone mapping at all. `T` toggles, and the current mode is in the
stats block, so a colour judgement always says which image it was made on. Gate
3 owns the decision.

## 3. The gate: `test/glb.test.js`

An art asset is the one kind of source file in this repository that nobody
reads. It is authored in another program, it arrives as bytes, and every
property the game depends on is invisible in a diff — `Bin 0 -> 89732 bytes` is
what a reviewer sees. So the test reads it, in three layers that fail for three
different reasons.

**Layer 1 — the file.** The GLB chunks parsed with no library at all: header,
one asset root at the origin, required node names, no `.001` suffixes or default
Blender names, no `CAL_`/`GUIDE_`/`REVIEW_` leak, no camera or light, every node
classified `VIS_`/`COL_`/`SOCKET_`, single-sided opaque materials with metallic
`0` and roughness in the painted-wood band, embedded images only, bounds
`6.0 × 1.27 × 3.4` and ground contact at `Y = 0` to ±1 cm, `COL_dais` top at
`0.22` and under the `0.25` step limit, `COL_lectern` a genuine blocker standing
on the dais, and the triangle budget.

Two checks in this layer are the ones a bounds test cannot make. Every collision
triangle is checked for winding against its own shading normal and for signed
volume, because **a box of the right size whose faces point inward is a dais the
player walks through and cannot step onto** — three.js's front-face-only
downward raycast turns that into a movement bug with no visual symptom. And the
bounds are measured from the vertices rather than read off `accessor.min/max`,
with the two then compared: an exporter writing a stale bounding box would
otherwise satisfy every dimension check here while telling three.js to cull the
asset wrong.

**Layer 2 — the loader.** `GLTFLoader.parse` on the real bytes, then the game's
own `buildEnvironment()` on the result. This runs headlessly in Node — three and
its addons import fine there, and `parse()` needs no DOM for an asset with no
external textures — so the placement, the harvest and the socket resolution
under test are the ones `play.html` runs, not a re-description of them. It also
asserts what the loader must *not* do: every `VIS_` material is compared against
a second, untouched parse of the same bytes, so a runtime recolour fails the
gate. And it asserts the refusals — renamed collider, renamed socket, no scene,
rejected fetch — each `ok: false`, exactly one warning, nothing thrown.

**Layer 3 — the player.** The harvested colliders are merged with the graybox
square, handed to the real BVH world, and the real controller is walked north
into the dais at full speed. This is the step-onto-dais proof, and it is
headless and reproducible rather than a browser anecdote:

```
step onto   y 0.22 at z 9.571296, 3.5 m/s of 3.5, grounded
control     without the GLB colliders the same walk ends at y 0
lectern     the same walk down the middle stops at z 7.3999, never climbed
reach       standing mark to socket 2.25 m, inside the 3.0 m radius
```

The control line is the point. A walk that ends at `0.22` proves nothing unless
the same walk in a world *without* the asset's colliders ends somewhere else —
otherwise the check might be measuring the graybox that is still in the scene.
It ends at `0`.

The lane matters too, and finding that out was the first thing this suite
taught. The first version walked north at `x = 0`, straight into the lectern; it
climbed the step correctly and then stopped dead, and the "did the step cost
speed" assertion failed at `0 of 3.5 m/s`. **The check was right and the walk
was wrong** — an intentional blocker doing its job. The proof now runs at
`x = 2.0`, clear of the desk, and the blocked walk is a second, separate
assertion.

### Mutation testing

Twelve faults injected one at a time, each restored afterwards. Five into
`src/play/assets.js`:

| injected fault | first failure |
| --- | --- |
| `place.yaw` set to 0 | `placement yaw … got 0, expected 3.141593` (+ 2 more) |
| `COL_` nodes left visible | `2 COL_/SOCKET_ nodes would render` |
| a runtime `material.color` tweak | `VIS_dais_base colour patched at runtime: 879797 vs 819191` (× 11) |
| `applyMatrix4(matrixWorld)` removed | `collider centre Z in the square: got 0, expected 9` (+ 5 more) |
| the required-node refusal removed | `a renamed COL_dais was accepted` |

And seven into fabricated GLBs, rebuilt from the real one in a scratch directory
— the test takes a path argument (`node test/glb.test.js <file>`) so a candidate
re-export can be checked before it is committed:

| mutated GLB | first failure |
| --- | --- |
| `SlateStone` marked `doubleSided` | `opaque material exported double-sided: SlateStone` |
| `COL_dais` renamed `COL_dais.001` | `required node missing: COL_dais`, then a clean stop |
| a `CAL_capsule` node added | `guide geometry leaked into the export: CAL_capsule` |
| a review camera added | `the export contains a camera` |
| `TimberOchre` roughness → 0.25 | `outside the painted-wood/stone band 0.80-0.95` |
| a node transform on `COL_lectern` | `carries a node transform; geometry is expected baked` |
| `COL_dais` accessor max Y → 0.30 | `declared max[1] vs its vertices: got 0.3, expected 0.22` |

The renamed-collider case exposed a defect in the suite itself rather than in
the asset: everything after the name check reads those nodes by name, so a
missing one produced a stack trace instead of a sentence. It now stops with
`stopped  required node(s) missing: COL_dais` and exits 1. **A gate whose
failure mode is a stack trace is a gate somebody will learn to skim.**

## What was verified, and how

Node v20.19.4, macOS. Browser checks in a real Chromium tab at 1440×900 against
`npm run dev`, driving `window.__play` / `window.__lab` / `window.__walk` and
reading results back. Every browser probe re-asserts its own premise first — the
`docs/step-05.md` hazard: an edit between two probes makes Vite reload the page
and re-deal the match underneath a review that thinks it is still driving the
old one.

**All ten gates.** VERIFIED (executed `npm run verify`):

```
node test/engine.test.js 50      OK — 28881 assertions passed
node test/controller.test.js     OK — 50 checks passed
node test/human-driver.test.js   OK — 1055 checks passed
node test/contract.test.js       OK — 6139 checks passed
node test/view.test.js           OK — 198201 checks passed
node test/interact.test.js       OK — 31 checks passed
node test/objective.test.js      OK — 65715 checks passed
node test/pace.test.js           OK — 30582 checks passed
node test/glb.test.js            OK — 390 checks passed        <- Gate 2
node scripts/driver-parity.js    PARITY OK
vite build                       ✓ built, four entry points
```

**The asset in the square.** VERIFIED (executed in the tab, seed 1000, seven
citizens, seat 0). Console on a fresh load, complete:

```
[assets] env-dais-a loaded — 11 visual meshes, 2 colliders, 1188 tris,
         materials SlateStone/TimberOchre/TimberShadow; placed at (0, 0, 9)
         yaw 3.142; podium socket at (0.000, 0.220, 8.650).
[play] window.__play ready — …
```

No errors, no warnings. The plank dais and the lectern render where the graybox
boxes were; the graybox ground, kerbs, bell, bench and grid are untouched.

**The step onto the dais, in the browser.** VERIFIED — identical to the node
numbers, which is the point of running both:

```
clear lane   teleport(2.0, 0, 5.0), walk(0, 1, 1.4)
             -> y 0.2199999988079072, z 9.571296025292328, 3.4999997936150447 m/s, grounded
middle       teleport(0, 0, 5.0),   walk(0, 1, 3)
             -> y 0.22, z 7.3999, speed 0   (the lectern, blocking, peak y 0.22)
across       teleport(2.0, 0, 5.0), walk(0, 1, 3)
             -> peak y 0.22, ends y 0 at z 12.1499 (the north kerb)
```

**The podium anchors at the socket.** VERIFIED, in a live `vote` state:

```
z 6.40 (the standing mark)  target podium   "E — cast your ballot"
z 7.00 (dais south edge)    target podium   "E — cast your ballot"
z 7.30 (at the desk)        target podium   "E — cast your ballot"
z 5.70                      target podium   "E — cast your ballot"
z 5.50                      target null     ""
use() -> panelOpen true, panelKind "vote"
```

**Line and object still cannot disagree.** VERIFIED: a whole match walked, 73
states, every state whose objective line named an object teleported to the
standing mark for it, faced the live anchor, and required `look().target` to be
that object — `badTarget: []`, nine distinct lines, winner LOYALIST.

**A match to game over.** VERIFIED: `runToEnd()` from a fresh load reports 61
steps, 38 human decisions, LOYALIST, 61 events — the exact `docs/step-04.md`
seed-1000 fingerprint.

**The fallback.** VERIFIED (executed with `env-dais-a.glb` renamed away and
restored afterwards): one warning quoted in §1, `environment.ok false`,
`reason "load-failed"`, `podiumAnchor (0, 0, 8.1)`, the graybox dais walked onto
at `y 0.22` and `3.4999998 m/s`, and a full match to the result screen at 61
steps, LOYALIST.

**The lab.** VERIFIED: all four cameras, all four moods, the collider overlay
and the tone toggle driven both by `__lab` and by real `keydown` events —
`1`/`2`/`3`/`4` → front/three-quarter/side/game, `D`/`U`/`N`/`S` →
day/dusk/night/silhouette, `C` and `T` toggling. Console clean. The report reads
`6.000 × 1.209 × 3.400 m`, ground `0.0000 m`, `11 (1188 tris)` visible,
`2 (24 tris)` collision, `SOCKET_podium`, three named materials, `doubleSided
none`, `unnamed none`. A missing asset (`?asset=environment/not-a-thing.glb`)
reports its parse error in the panel instead of failing silently.

Silhouette mode is the incidental proof that colliders never render:
`calls 11, triangles 1188, lines 0` — exactly the eleven `VIS_` meshes and their
triangle count, with the two `COL_` meshes contributing nothing.

**Nothing else regressed.** VERIFIED in the browser:

- `walk.html`: `wallHeadOn` stops at `z = 11.650`; the 35° ramp stalls at
  `x = 1.889`, `y = 0`; the 0.40 m block stops it at `z = -2.400`; the three
  steps reach `y = 0.510` at `3.5000 m/s`; `__walk.camera.screenBias === 0`.
  Every number is the one in `docs/step-03.md` and `docs/step-05.md`.
- `index.html`: seed 1000 at seven citizens runs to 73 steps, LOYALIST, a
  31 365-character event log — the exact `docs/step-02.md` fingerprint.

## Findings about the asset (reported, not fixed)

Blender fixes are the reviewer's lane. Neither of these is a defect against the
gameplay contract, and neither was touched:

- **The lectern collider is 6 cm proud of the visible desk** — `COL_lectern`
  tops out at `1.27 m`, `VIS_lectern_desk` at `1.209 m`, and the collider is
  also slightly deeper in Z. Invisible in play; obvious with the lab's collider
  overlay on. Normal for a simplified blocker, and recorded so the manifest's
  "bounds" figure is understood to be the collision bound.
- **Colour is still uncalibrated.** The manifest already said so at `review`.
  The lab now makes it checkable, and adds the reason it has to be checked
  deliberately: the lab renders under AgX and `play.html` renders under none.

Everything else the contract test looks for came back clean: closed outward
colliders (`4.488 m³` and `0.99225 m³` signed volume, zero degenerate
triangles), `20.400001 m²` of walkable upward-facing area against a `20.4 m²`
dais, exact `6.0 × 1.27 × 3.4` bounds, ground contact at `0`, three named
single-sided materials, no guide leak, no camera, no light, 1212 triangles
against a 8000 review limit.

## Open gaps, stated plainly

- **Nobody has judged how the asset looks.** The gate this document closes is
  structural: it is in the right place, the right size, the right way round, and
  the player can step onto it. Whether the timber reads as the style bible's
  handcrafted stage is an owner call on a screenshot, and the colour is
  explicitly not calibrated yet.
- **The lighting modes are approximations, not the director.** Four groups of
  simple lights, tuned by eye against the mood references. They are good enough
  to ask "does this read at dusk" and are not a preview of what Gate 3 will
  build. `play.html`'s own lighting is unchanged and still generic.
- **The lab's asset list is hand-kept.** `public/` is copied verbatim by Vite and
  cannot be enumerated from JavaScript, so `KNOWN` in `src/lab/main.js` is one
  line per manifest row. `?asset=` loads anything, so a forgotten line costs a
  URL rather than a capability — but the dropdown will drift from the manifest
  unless somebody keeps it.
- **`renderer.info` cannot be read by a scripted probe.** It only updates on a
  render, `requestAnimationFrame` does not run in a hidden pane, and a readback
  therefore reports the last painted frame. The numbers quoted above were read
  off screenshots. Same family as the two hazards in `docs/step-05.md`.
- **The fixed captures in `design/reviews/env-dais-a/` predate the lab.** They
  were rendered in Blender; the pipeline says the fixed browser capture is the
  final truth. Re-taking front/three-quarter/side/game/silhouette/scale/collider
  through `asset-lab.html` is the obvious next housekeeping, and would give the
  next asset a set to be compared against.
- Everything `docs/step-05.md` lists as open is still open, including the one
  that matters most: **the deliberation timings have still never been felt.**
