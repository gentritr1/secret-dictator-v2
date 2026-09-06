# First facade: ochre revision — approved

Current status: owner approved at ae6a31a. The old one-pixel failure below is historical; the recorded 0.001 pp pair resolution closes it. The checkpoint and comparison hashes in this folder describe the earlier A-only archive, not the subsequent mixed-facade runtime. See ../facades/ for the current review.

I chose the hero's warm ochre plaster. Only the plaster image changed in the
exported GLB; the geometry, UVs, vertex tints, brick and timber are unchanged.
This is an uncommitted first-asset review checkpoint on art/rubble-square at
73a154c. Phase 1 is closed. Phase 2 is incomplete; no new commit, push or merge
is claimed. Main's unrelated corner source remains untouched.

Open index.html through the dev server for hero/model, grey/ochre, all four mood
frames, the six fixed lab views, and the actual square in three states.
The original cold candidate and its evidence are retained under cold-candidate/;
its earlier full archive remains separate. Historical A-only artifact hashes are in
comparison.json and checkpoint.json.

## Executed and observed

npm run verify exited 0; verify.txt retains the output. A final standalone
content run is in content-gate.txt. Both report zero findings. This is separate
from my inspection of the generated textures and browser images: no prohibited
marks were observed. No generated sheet was changed or rescaled.

scripts/blender/ochre-rubble-facade.py replaced and packed the plaster through
Blender MCP, uniformly reducing the native 1254-square source to 1024. It asserts
source geometry, transforms, UVs and tints are equal before/after. Attempt 06
passed source and atlas profiles; five failed ochre originals and every prompt
remain in the reference packet. Attempt 05 passed its source profile but failed
after production reduction. No measurement thresholds or images were repaired.

scripts/compare-facade-atlas-only.py compares the retained grey GLB and current
export. All 19 accessor payloads and metadata are byte-equal, as are nodes,
meshes, materials, samplers and scenes. Only TEX_Plaster_Facade image bytes
differ. The other two embedded images are byte-identical.

The GLB remains 4.5 × 7.8 × 1.5 m, 2548 triangles (2536 visible + 12 collision),
three visible primitives, three material roles, three embedded 1024 albedos.
These are gated by test/glb.test.js and reported by scripts/capture-reviews.mjs.
The original COL_wall bytes and SOCKET_lamp are pinned. No light or runtime
production code changed for this correction. The earlier assets.js change is
still only the first facade's required-node declaration.

scripts/review-rubble-facade.mjs repeated decoded-texture checks on seven
placements, missing-node refusals, missing-file capsule fallbacks, linear tone,
reduced motion, and eye-height views. No page errors were recorded. Expected
missing-file and GPU readback warnings are retained. scripts/capture-reviews.mjs
replaced all six fixed asset-lab captures; I inspected all six.

## Warmth and performance

Unchanged scripts/capture-rubble-baseline.mjs and scripts/rubble-pixels.mjs,
1280 × 720, seed 1000 / seven players, standard state/camera history:

| State | Warm HUD | Warm scene | Calls | Triangles |
| --- | ---: | ---: | ---: | ---: |
| Day | 5.895% | 5.297% | 381 | 74389 |
| Dusk | 19.446% | 20.893% | 381 | 74389 |
| Trial | 9.673% | 9.166% | 389 | 77677 |

Dusk scene warmth was 5.121% on the cold candidate and is now 20.893%; the
approved phase-1 capture was 18.961%. The dusk mood frame is 15.902% under the
same classifier. This restores the plaster's response to the existing dusk
light, but does not claim a mood-frame match. The sky gradient retune remains
in phase 5. All absolute state ceilings pass.

Compared with the phase-0 branch point, day/dusk calls are 381 / 473 = 0.805×
and triangles 74389 / 68875 = 1.080×; trial calls are 389 / 481 = 0.809× and
triangles 77677 / 72163 = 1.076×. scripts/compare-rubble-facade.mjs checks both
against 1.5×. These are renderer counters including shadow passes, not FPS.

The per-asset positive trial allowance remains **0.00 pp**. The unchanged
classifier in scripts/measure-facade-warm-pair.mjs was run in two configurations:

- Full facade versus immutable phase 1: scene deltas at three frozen trial
  instants were 0, 0, +1 pixel; HUD deltas were −3, −3, −2 pixels. The +1 scene
  pixel is +0.000108507 pp. **The strict zero-allowance gate fails.**
- Plaster correction only, versus retained grey facade: all three trial
  instants were exactly 0 pixels, HUD and scene. This diagnostic uses the same
  harness with explicit PAIR_REFERENCE and PAIR_OUTPUT; it does not replace
  the full-asset test.

scripts/locate-facade-warm-delta.py locates the full-asset threshold crossing at
(38,298), RGB (58,46,33) → (58,47,34). It is visibly on a citizen's hat edge.
The localization script checks its totals against the unchanged browser
classifier. The pixel's HSL lightness crosses 0.18. No positive allowance was
funded or rounded away. The pair and comparison scripts retain nonzero exit
status for this failure; comparison now writes the failed report before
asserting, so current evidence cannot silently remain the older passing report.

## Ground, replay and movement

scripts/measure-rubble-ground-floor.mjs reports p1 **1.2166**, p5 **2.5054**,
versus branch-point 1.0762 / 2.0802. Lowest-five-percent mean RGB is
(0.9475,1.5996,6.0967), B > R. The recorded 0.35-luma jitter still applies;
no small improvement is claimed. Trial ground still looks nearly black.

scripts/measure-rubble-contract.mjs and compare-rubble-facade.mjs rechecked
all 32 placement/collider/socket records, tuning, constants and replay bytes.
The seed-1000 / seven-player browser fingerprint is byte-identical to phase 0.
Full replay SHA-256 remains
9313643a2934c2c74eeb64eb79eeeaaf75ab2e31744502b0bb6307e1f2c459a7.

**Walk contract is closed by the owner's independent review.** The prior
scripts/measure-facade-walk.mjs evidence retains all ten equal traces and the
actual-square collision world in walk.html. That trace run was not repeated for
this atlas-only edit; new source/GLB byte comparisons prove the geometry and
socket inputs it exercised remain identical. This distinguishes carried-forward
owner evidence from a fresh run.

## Texture and visual judgment

scripts/profile-rubble-texture.py reports production opposite-edge mismatch
4.6012 / 5.2279 on the 0–255 scale, relative spectral drift
0.048377, permutation p 0.904564: both frozen gates pass.
The native source also passes; both JSONs use the plaster-ochre prefix. Older
plaster-source.png and plaster profile files describe the retained cold version.
Brick and timber profiles remain applicable to their unchanged image bytes.

Observed beside the hero: warm dusty plaster now contrasts with blue joinery.
The steep gable, six two-pane windows, five-board door, six brick exposures and
blank notice still carry across. The replacement plaster has quieter, broader
wear than the hero's flaking. The brick stays browner than the hero, unchanged
as requested. I inspected the roof at eye-height dusk; its thin cap remains.
Against the four mood frames, this is a closer colour direction; that is my
visual judgment, not an owner's approval or a measurement of style quality.

## Open gaps

The full-asset strict zero-warm failure above remains open despite the passing
plaster-only diagnostic. Its cause being a threshold/edge sensitivity rather
than a new warm pool is an inference, not a closed gate. Owner visual review
of the ochre result is pending. All seven placements still repeat one module;
the other two modules, rubble kit and pump are not started. Thin theatre depth,
simple roof grain and fine silhouette seams are unchanged.

Later phases remain open: stage furniture, eight static citizens, lighting
retune, full-cast 8/8 silhouette identification, human pasted-on review at three
fog distances, and final evidence. No claim of whole-phase or whole-brief
completion is made. Verification passing is not evidence for those visuals.

## Owner approval and resolution ruling, ae6a31a

The owner independently approved the ochre facade, including its quieter wear, brown brick and thin roof. The old one-pixel failure described above is historical: ae6a31a defines 0.001 pp pair resolution. Existing raw counts were retained and re-evaluated under that rule; the pair passes. The walk contract remains closed. Roof depth is to be watched in the final distance review.
