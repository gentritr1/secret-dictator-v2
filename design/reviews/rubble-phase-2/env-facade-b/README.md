# Half-collapsed facade: review candidate

B was measured after replacing two approved A placements; C was still A. Its runtime-file hashes describe that sequential checkpoint, not the final mixed row. Base branch ae6a31a, art/rubble-square. Phase 2 is still uncommitted so it can remain one commit at the end. Owner approved its measurements; Codex accepts it visually under the owner’s delegated decision. See ../facades/ACCEPTANCE.md. Open ../facades/index.html for the paired images and complete row.

## Executed and observed

The native sheet, hero and material-ID were generated in order, then the model was built and exported via isolated Blender MCP. Reference provenance and rejected originals are in design/references/env-facade-b/. build.json records exact parts; source-audit.json records the production hierarchy, collections, packed images and unchanged collider/socket. test/glb.test.js gates envelope, all three 1024 albedos, roles, UVs/tints, transforms, collision bytes and socket position. Full verify exited 0 (verify.txt); the content gate reported zero findings. Tests do not validate appearance.

scripts/capture-reviews.mjs produced all six fixed asset-lab views under design/reviews/env-facade-b/; I inspected each. scripts/review-facade-variant.mjs additionally captured hero-model.png and three eye-height runtime views, verified both placements decode their three 1024 maps, refused each missing required node, and ran the seeded match with two capsule fallbacks after intentionally blocking the GLB. No page errors; expected failed-load and GPU readback warnings are retained in browser-review.json. Linear tone and reduced motion were exercised.

scripts/audit-facade-shared-atlases.py establishes byte-identical image payloads across A/B/C. Three atlas roles total for these facades. No production lighting or engine changes were made.

## Runtime warmth and performance

scripts/capture-rubble-baseline.mjs with the unchanged scripts/rubble-pixels.mjs classifier, seed 1000 / seven players, 1280 × 720 and the recorded state/camera history produced after/measurements.json. Calls and triangles include the full scene. Baseline is phase 0; both ratios must be at most 1.5.

| State | Warm HUD | Warm scene | Calls / baseline | Triangles / baseline | Call / triangle ratio |
| --- | --- | --- | --- | --- | --- |
| day | 5.867947% | 5.269097% | 380 / 473 | 70572 / 68875 | 0.803383 / 1.024639 |
| dusk | 18.936740% | 19.798286% | 380 / 473 | 70572 / 68875 | 0.803383 / 1.024639 |
| trial | 9.835829% | 9.110569% | 388 / 481 | 73860 / 72163 | 0.806653 / 1.023516 |

Per-asset initial positive allowance is 0.00 pp, assigned before generation in BUDGET.md. scripts/measure-facade-warm-pair.mjs swaps only this asset’s two intended placements against previous-facade.glb (approved A), holding lights, camera, animation instant and other assets fixed. Positive deltas count only above 0.001 pp at any instant per ae6a31a; every smaller result is retained verbatim. All three trial pairs pass. The HUD and scene classifiers each see 921600 pixels.

| Trial instant | HUD pixel delta | Scene pixel delta | HUD delta pp, raw | Scene delta pp, raw |
| --- | --- | --- | --- | --- |
| 2 | -2 | 0 | -0.00021701388888928363 | 0 |
| 3 | -2 | 0 | -0.00021701388888750728 | 0 |
| 4 | -2 | 0 | -0.00021701388888928363 | 0 |

Full-scene warmth is a separate 10% ceiling, with variation over capture instants. The frozen after captures range from 9.637478% to 9.846571% HUD and 9.043294% to 9.252387% scene. These are observed samples, not a worst-case bound.

## Movement, floor and replay

scripts/measure-facade-walk.mjs compared the phase-1 runtime with this candidate in walk.html: all ten traces equal, including dais, boundaries, passages, bench and bell approaches. Facade IDs alone are normalized in the comparison; collider bounds, sockets, anchors, tuning and trajectories are not. Raw before/after records remain in walk-comparison.json. scripts/measure-rubble-contract.mjs and scripts/compare-facade-variant.mjs also compare all 32 placement records against the branch-point contract. Seed-1000/seven-player fingerprint and complete replay are byte-identical to phase 0.

scripts/measure-rubble-ground-floor.mjs measured trial ground-only p1=1.2166, p5=2.5014000000000003, versus branch-point 1.0762/2.0802. Lowest-five-percent mean RGB is [0.9426241884342443, 1.601238109617998, 6.100256681262268]; blue-over-red true. The owner’s approximately 0.35-luma p5 jitter remains applicable. The dark tail still looks nearly black; a passing channel-order flag does not close the phase-5 visual retune.

## Five hero-to-model details, visually inspected

1. **Single surviving left roof fragment.** The sloping left crown survives; the right roof is absent. The cap is thin, as in the accepted A.
2. **Two stacked left windows.** Both openings, their centre mullions and four dark panes remain visible.
3. **Two exposed floor levels.** Both ledges and three joists beneath each are modeled. Their projection is more emphatic than the hero’s near-frontal view.
4. **Five-board lower door.** The door sits below the surviving windows, with a three-piece frame.
5. **Broken plaster around a grey-green interior.** The open right half, low broken sill and three brick exposures are present. Wear is quieter and the brick reads as brown patches at game distance.

## Inference and open gaps

My visual judgment is that the modules now break the identical-gable repetition while retaining the approved A palette. That judgment is not an automated pass or owner acceptance. Plaster wear is quieter, brick mortar loses definition and the roofs are thin. B’s exposed floor projection is more pronounced; C’s fascia has simpler edge treatment. Context cobbles, curb and distant buildings in the heroes are not extra geometry in these modules. The fixed silhouette views establish recognizable envelopes; they are not the later eight-citizen silhouette test.

Owner taste review of B/C, the final distance pasted-on review (especially brick patches and roof caps), the remaining rubble kit and hand pump, subsequent stage furniture, eight static citizens, lighting retune and phase-6 evidence remain open. The old huge corner/background walls and unfinished stage furniture still dominate parts of the square. No claim of final mood-frame equivalence, final phase-2 delivery, commit, push or merge is made.
