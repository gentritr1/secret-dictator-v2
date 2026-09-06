# Rubble square — phase 2 delivery

The three facades, two heap sizes, brick stack, rail cart and hand pump are built, gated, manifested and integrated on art/rubble-square. This is one phase delivery; phases 3–6 and whole-pass acceptance are not complete. The main worktree and its unrelated modified corner source remain untouched.

## Executed and observed

All eight assets have native generated orthographic sheets, game-height heroes and material-ID passes, owned Blender sources, packed shared 1024 albedos, GLB gates, six fixed asset-lab captures, manifest rows and runtime declarations. Failed sheets and heroes remain with STATUS notes. No generated sheet was rescaled or rearranged. A/B/C retain their approved source and GLB bytes: scripts/audit-rubble-phase-2.py checks them against the pre-kit facade checkpoint. That script also verifies four shared image roles across the eight final assets. Iron is the only new role after the approved facades. All static props keep root conventions and empty socket declarations; existing wall lamp nodes and original colliders remain intact.

npm run verify exited zero with all assets integrated: combined/verify-final.txt. test/content.test.js reports zero findings in combined/content-final.txt; this is a text/metadata gate. Generated images, model captures and the owned source audits were reviewed separately. test/glb.test.js pins original collider position/index bytes, facade lamp sockets, exact required nodes, visual envelopes, triangle budgets and albedo-only materials.

scripts/measure-rubble-kit-walk.mjs compares actual walk.html traces with the phase-1 runtime: all ten traces, collider bounds, anchors, sockets and tuning are equal. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs confirm 32 placement records equal after replacement-role normalization, plus fingerprint and complete replay byte-identical to phase 0. See env-well-a/walk-01/ and env-well-a/comparison.json. No collider footprint, socket height, dais size or passage width changed.

## Final scene measurements

scripts/capture-rubble-baseline.mjs uses the same scripts/rubble-pixels.mjs classifier as phase 0, seed 1000/seven players, 1280 × 720. scripts/report-rubble-phase-2.py consolidates the final pump-stage capture and an independent repeat in combined/repeat-01/. Each percentage is reconciled against its raw count out of 921600 pixels in combined/measurements.json. Two runs × three states × two HUD modes = 12 scene images; this is not a duration or frame-rate benchmark.

| State | Warm HUD range | Warm scene range | Calls before → after | Triangles before → after | Calls / triangles ratio |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797–5.841797% | 5.242947–5.242947% | 473 → 353 | 68875 → 72380 | 0.746300 / 1.050889 |
| dusk | 18.510308–18.510634% | 19.513889–19.518989% | 473 → 353 | 68875 → 72380 | 0.746300 / 1.050889 |
| trial | 9.673937–9.688585% | 9.119575–9.141059% | 481 → 361 | 72163 → 75668 | 0.750520 / 1.048571 |

Both final captures pass the day/dusk/trial ceilings and the 1.5× draw/triangle limits. Their narrow observed trial spread does not replace the previously recorded approximately 0.2 pp variation across trial instants. scripts/measure-rubble-prop-warm-pair.mjs measured every intended kit placement: all five kit assets added exactly zero HUD and scene pixels at each of three trial instants. Each pair packet has five frozen instants × before/after × two HUD modes = 20 images. B/C also remain zero in the owner-approved scene comparisons; A's original +1 scene pixel is retained below the unchanged 0.001 pp resolution. No asset received a positive allocation. See WARM-BUDGETS.md and each raw paired packet.

scripts/measure-rubble-ground-floor.mjs reports final trial ground p1 1.2166 and p5 2.7152 versus branch-point 1.0762 and 2.0802, with blue-over-red true. RGB band evidence and mask are retained. The approximately 0.35 luma p5 jitter remains applicable. A channel-order pass does not make this dark tail visually bright.

## Visual judgment, separate from tests

I accepted B/C after the owner's measured approval, then accepted both heaps, stack, cart and pump after inspecting the six fixed lab views, extra unobscured side views, hero/model captures and local three-state runtime images. Each asset README names five shared details and visible differences. The review page presents references beside actual model captures and links native sheets without transforming them.

The strongest remaining differences are cleaner geometry and quieter wear on the heaps and brick stack; brown rather than orange brick; the facade roof caps; the cart's orderly four loads; and the pump's broad base and raised lever required by the original bounds. The square's existing corner modules, furniture and citizens still belong to earlier art work. This is a visual judgment of this phase, not a test-derived whole-pass style approval.

## Open gaps

- Phase 3 stage furniture and lighting props are not delivered.
- Phase 4's eight static painted citizens, shipped root/socket contract and 8/8 silhouette review are not delivered.
- Phase 5's dusk hue retune and visibly brighter dark ground tail remain open; no lighting intensities were changed in phase 2.
- Phase 6's full pasted-on test at three fog distances and independent reviewer acceptance without source access remain open. The per-asset five-detail comparisons are recorded, but do not substitute for that review.
- Generated references were requested as GPT Image 2, but the tool did not expose an actual model identifier.
- Numeric warmth is measured at the frozen review camera and instants, not every possible walking viewpoint. Mobile remains unclaimed.

Earlier facade and per-asset packets are sequential historical evidence; their sourceCommit records the parent because the work was uncommitted when captured. The final combined asset audit and delivery commit identify the delivered files. No merge into main is part of this delivery.
