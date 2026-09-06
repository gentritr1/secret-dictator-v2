# Hand pump — accepted by Codex for this phase

Replaces the well at its original position and yaw, retaining env-well-a, the foot-centre root, no sockets and the exact original COL_well bytes. Nine pieces: stone plinth, pedestal and basin; iron flange, body, cap, spout, bracket and raised lever. The large base and raised lever retain the authoritative original visual envelope rather than reducing the landmark's bounds.

## Executed and observed

Native sheet, game-height hero and material-ID preceded Blender modeling. scripts/measure-rubble-prop-sheet.py reports zero boundary error in all three views at 240 px/m, against the unchanged two-pixel tolerance. The first hero duplicated the spout projection as an extra fitting; it is retained with STATUS. The corrected hero has one spout. Exact prompts and original images remain in the reference packet. No generated sheet was transformed. GPT Image 2 was requested; the tool did not report its actual model identifier.

scripts/write-pump-guide.py records nine physical parts. scripts/blender/rubble-pump.py builds the owned source through MCP, using shared plaster and iron atlases. The inherited source review camera cropped the tall lever; that render is retained in rejected-framing. Widening the source camera and browser hero camera corrected framing without moving geometry. scripts/blender/export-rubble-prop.py exports the root, two VIS meshes and original collider. test/glb.test.js passes: 1592 total triangles, 1564 visible and 28 collision; exact reference envelope 1.649999976 × 2.540838957 × 1.717641711 m within 0.001 m gate tolerance; two embedded shared 1024 albedos and no auxiliary maps. The old collider remains 1.6 m across and 0.95 m high. Original collider accessor byte hashes, five collections, source calibration and identity transforms are audited.

All six scripts/capture-reviews.mjs fixed captures were produced and inspected. scripts/capture-prop-side.mjs adds an unobscured side. scripts/review-rubble-prop.mjs produced the full eye-height model image and local three-state views, all inspected. Its report verifies two decoded maps, required-node refusals, capsule fallback with seeded completion, linear tone and reduced motion. npm run verify exited zero.

## Measurements

Starting allowance 0.00 pp preceded production. scripts/measure-rubble-prop-warm-pair.mjs compares the original well GLB with the pump at its one unchanged placement. Each of three trial instants records exactly zero HUD and scene pixel delta. The threshold remains 0.001 pp, and this remains camera-specific evidence.

scripts/capture-rubble-baseline.mjs with scripts/rubble-pixels.mjs, seed 1000/seven players, 1280 × 720:

| State | Warm HUD | Warm scene | Calls | Triangles | Calls / triangles versus baseline |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 353 | 72380 | 0.746300 / 1.050889 |
| dusk | 18.510634% | 19.513889% | 353 | 72380 | 0.746300 / 1.050889 |
| trial | 9.673937% | 9.119575% | 361 | 75668 | 0.750520 / 1.048571 |

scripts/measure-rubble-kit-walk.mjs: ten walking traces and collider/anchor/socket/tuning records equal to phase 1. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs: 32 placement records equal after role normalization, fingerprint and full replay byte-identical to phase 0. scripts/measure-rubble-ground-floor.mjs: p1 1.2166, p5 2.7152 versus baseline 1.0762/2.0802, blue-over-red true. The approximately 0.35 luma p5 jitter applies. The final combined capture repeat is separately reported in ../combined/measurements.json.

## Five shared details and judgment

1. Broad stepped stone base.
2. Shallow front basin on the pedestal.
3. Tall cool iron body behind the basin.
4. One downturned spout reaching over the bowl.
5. Raised diagonal lever above the cap and its short side bracket.

I accept the pump for this phase. The model is cleaner than the hero, with quieter stone wear and less pronounced body fluting. Its raised lever and bulky base differ from the small pump in the mood frame because the old well's full bounds are authoritative. At the unchanged runtime yaw, the spout reads end-on from the first local camera; the lab three-quarter shows its length. Trial has a warm rim and a very dark blue front. These observations are distinct from passing numeric gates. The final three-distance pasted-on test, later furniture and citizen work, and dusk/trial lighting remain open. This is a phase delivery, not whole-pass acceptance.
