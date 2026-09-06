# Boarded shopfront: review candidate

C was measured after replacing two remaining A placements, with B already present. Its after/ captures and comparison.json describe the final A3/B2/C2 row. Base branch ae6a31a, art/rubble-square. Phase 2 is still uncommitted so it can remain one commit at the end. Owner approved its measurements; Codex accepts it visually under the owner’s delegated decision. See ../facades/ACCEPTANCE.md. Open ../facades/index.html for the paired images and complete row.

## Executed and observed

The native sheet, hero and material-ID were generated in order, then the model was built and exported via isolated Blender MCP. Reference provenance and rejected originals are in design/references/env-facade-c/. build.json records exact parts; source-audit.json records the production hierarchy, collections, packed images and unchanged collider/socket. test/glb.test.js gates envelope, all three 1024 albedos, roles, UVs/tints, transforms, collision bytes and socket position. Full verify exited 0 (verify.txt); the content gate reported zero findings. Tests do not validate appearance.

scripts/capture-reviews.mjs produced all six fixed asset-lab views under design/reviews/env-facade-c/; I inspected each. scripts/review-facade-variant.mjs additionally captured hero-model.png and three eye-height runtime views, verified both placements decode their three 1024 maps, refused each missing required node, and ran the seeded match with two capsule fallbacks after intentionally blocking the GLB. No page errors; expected failed-load and GPU readback warnings are retained in browser-review.json. Linear tone and reduced motion were exercised.

scripts/audit-facade-shared-atlases.py establishes byte-identical image payloads across A/B/C. Three atlas roles total for these facades. No production lighting or engine changes were made.

## Runtime warmth and performance

scripts/capture-rubble-baseline.mjs with the unchanged scripts/rubble-pixels.mjs classifier, seed 1000 / seven players, 1280 × 720 and the recorded state/camera history produced after/measurements.json. Calls and triangles include the full scene. Baseline is phase 0; both ratios must be at most 1.5.

| State | Warm HUD | Warm scene | Calls / baseline | Triangles / baseline | Call / triangle ratio |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 380 / 473 | 70140 / 68875 | 0.803383 / 1.018367 |
| dusk | 18.417426% | 19.452908% | 380 / 473 | 70140 / 68875 | 0.803383 / 1.018367 |
| trial | 9.695421% | 9.039171% | 388 / 481 | 73428 / 72163 | 0.806653 / 1.017530 |

Per-asset initial positive allowance is 0.00 pp, assigned before generation in BUDGET.md. scripts/measure-facade-warm-pair.mjs swaps only this asset’s two intended placements against previous-facade.glb (approved A), holding lights, camera, animation instant and other assets fixed. Positive deltas count only above 0.001 pp at any instant per ae6a31a; every smaller result is retained verbatim. All three trial pairs pass. The HUD and scene classifiers each see 921600 pixels.

| Trial instant | HUD pixel delta | Scene pixel delta | HUD delta pp, raw | Scene delta pp, raw |
| --- | --- | --- | --- | --- |
| 2 | 0 | 0 | 0 | 0 |
| 3 | 0 | 0 | 0 | 0 |
| 4 | 0 | 0 | 0 | 0 |

Full-scene warmth is a separate 10% ceiling, with variation over capture instants. The frozen after captures range from 9.545464% to 9.719401% HUD and 8.951172% to 9.125217% scene. These are observed samples, not a worst-case bound.

## Movement, floor and replay

scripts/measure-facade-walk.mjs compared the phase-1 runtime with this candidate in walk.html: all ten traces equal, including dais, boundaries, passages, bench and bell approaches. Facade IDs alone are normalized in the comparison; collider bounds, sockets, anchors, tuning and trajectories are not. Raw before/after records remain in walk-comparison.json. scripts/measure-rubble-contract.mjs and scripts/compare-facade-variant.mjs also compare all 32 placement records against the branch-point contract. Seed-1000/seven-player fingerprint and complete replay are byte-identical to phase 0.

scripts/measure-rubble-ground-floor.mjs measured trial ground-only p1=1.2166, p5=2.4332, versus branch-point 1.0762/2.0802. Lowest-five-percent mean RGB is [0.9345462781216971, 1.5941416276611808, 6.0529971312094215]; blue-over-red true. The owner’s approximately 0.35-luma p5 jitter remains applicable. The dark tail still looks nearly black; a passing channel-order flag does not close the phase-5 visual retune.

## Five hero-to-model details, visually inspected

1. **Two-slope gable.** The complete gable contrasts with B’s missing roof; its thin edge remains a distance-review risk.
2. **Four upper windows.** Two rows of two windows retain one mullion and two dark panes per opening.
3. **Boarded display.** Six horizontal boards and two crossed braces remain individually modeled inside the four-rail frame.
4. **Right-hand five-board door.** The separate door and its three-piece frame preserve the reference layout.
5. **Blank fascia and four brick exposures.** The horizontal board has no lettering. Four exposures occupy the reference regions; their mortar detail is much less apparent than in the hero.

## Inference and open gaps

My visual judgment is that the modules now break the identical-gable repetition while retaining the approved A palette. That judgment is not an automated pass or owner acceptance. Plaster wear is quieter, brick mortar loses definition and the roofs are thin. B’s exposed floor projection is more pronounced; C’s fascia has simpler edge treatment. Context cobbles, curb and distant buildings in the heroes are not extra geometry in these modules. The fixed silhouette views establish recognizable envelopes; they are not the later eight-citizen silhouette test.

Owner taste review of B/C, the final distance pasted-on review (especially brick patches and roof caps), the remaining rubble kit and hand pump, subsequent stage furniture, eight static citizens, lighting retune and phase-6 evidence remain open. The old huge corner/background walls and unfinished stage furniture still dominate parts of the square. No claim of final mood-frame equivalence, final phase-2 delivery, commit, push or merge is made.
