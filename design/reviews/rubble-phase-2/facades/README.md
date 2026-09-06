# Facade modules B and C: review checkpoint

The half-collapsed building and boarded shopfront are built, gated, manifested and integrated on the unchanged seven-bay grid: A3/B2/C2. A remains owner-approved at ae6a31a. B/C owner measurements are approved and Codex accepted their visuals; see ACCEPTANCE.md. This facade-only checkpoint was captured uncommitted at ae6a31a. Its numeric results are historical; the completed kit and pump and final phase-2 evidence are in ../README.md. Main’s unrelated corner source was not touched.

Open index.html through the local dev server. It places each generated hero beside its actual game-height model capture and includes the four mood frames, all twelve fixed captures and final eye-height day/dusk/trial views. The image files are originals; CSS only sizes their presentation. The native turnaround sheets were never resampled or rearranged.

## Executed evidence

- [B evidence](../env-facade-b/README.md), [C evidence](../env-facade-c/README.md): generation provenance, exact part counts, five visual comparisons each, measured budgets and limitations.
- scripts/measure-facade-warm-pair.mjs: B adds zero scene pixels and removes two HUD pixels at each of three trial instants; C adds zero HUD and scene pixels throughout. Each swaps its two placements against the approved A GLB with other assets fixed. Zero allocation; ae6a31a tolerance 0.001 pp; raw values retained.
- scripts/capture-rubble-baseline.mjs and unchanged scripts/rubble-pixels.mjs: final mixed-row numbers below, seed 1000 / seven players. Full-scene trial ceiling is 10%; no pair allowance is inferred from headroom.
- scripts/measure-facade-walk.mjs: all ten trajectories equal to phase 1. scripts/measure-rubble-contract.mjs and scripts/compare-facade-variant.mjs: all 32 collider/socket placement records, tuning and anchors equal to the phase-0 contract, with only facade IDs normalized. Fingerprint and full replay byte-identical.
- scripts/measure-rubble-ground-floor.mjs: final ground p1 1.2166 and p5 2.4332 versus branch-point 1.0762 and 2.0802; low-five-percent mean is blue-over-red. Recorded p5 jitter about 0.35 remains; this is not a claim that the dark tail looks adequately lit.
- test/glb.test.js: B 1602 total triangles / C 2440, including 12 collider triangles each; three roles with three embedded 1024 albedos each. scripts/audit-facade-shared-atlases.py: all three images byte-identical to approved A. Source audits confirm collections and transforms.
- npm run verify exited 0; env-facade-c/verify.txt. The final standalone test/content.test.js output is content-gate.txt. Generated references, rejected images and review captures were inspected separately for prohibited marks; none observed.

| State | Warm HUD | Warm scene | Calls | Triangles | Calls / phase 0 | Triangles / phase 0 |
| --- | --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 380 | 70140 | 0.803383 | 1.018367 |
| dusk | 18.417426% | 19.452908% | 380 | 70140 | 0.803383 | 1.018367 |
| trial | 9.695421% | 9.039171% | 388 | 73428 | 0.806653 | 1.017530 |

The three frozen final-C trial captures range 9.545464–9.719401% HUD and 8.951172–9.125217% scene. The standard capture above uses its own animation instant. All observed samples are under 10%; this is not a bound on every possible animation frame. Counts are below the 1.5× limits in all states.

## Visual judgment and open gaps

I inspected the twelve fixed views, both game-height model captures and the three-state eye-height sets. B’s incomplete crown and two exposed floors separate it from the complete gables; C’s six boards, crossed braces and blank fascia identify the shopfront. The ochre exterior, blue joinery and muted brick are consistent with the accepted A atlas. This is my interpretation of the frames, not owner approval.

The models are cleaner than their heroes: less plaster wear, less legible brick mortar, simple fascia edges and thin roof caps. The brick patches can read as applied shapes at game distance. B’s floor beams project more strongly than the hero; the final pasted-on review must revisit these details. Trial ground remains visually very dark. Existing corner walls, furniture and citizens still make the overall square a mixed production stage.

Open: owner visual review of B/C; the remaining phase-2 rubble kit and hand pump; stage furniture; eight static citizen variants and their 8/8 silhouette test; dusk/trial retune and warm budget across those future assets; final distance pasted-on review; phase-6 evidence; the phase-2 commit and eventual branch push. No final art-pass acceptance is claimed.

## Reproducibility

B captures are the sequential A5/B2 stage. C captures are the final A3/B2/C2 stage; C comparison.json contains current runtime hashes. Earlier A-only and B-stage hashes remain historical. facades/checkpoint.json is the current explicit-path overlay manifest for ae6a31a. The external archive contains owned phase-2 changes only, without node_modules, Git metadata or backup blend files. It does not alter the user-owned main checkout.

Use the specified Node20 PATH before every Node command. Serve the art worktree on 5184 with npm run dev and the phase-1 comparison worktree on 5185. See the named scripts for their exact invocation and configuration. The walk harness uses actual walk.html modules and records its temporary review-scene injection; production walk.html is unchanged.
