# Salvaged brick stack — accepted by Codex for this phase

Two replacements at the unchanged north-east crate placements. Exactly 32 bricks in four courses of eight. Same foot-centre root and COL_crate bytes, no sockets or interaction.

## Executed and observed

Generation order: native sheet, game-height hero, material-ID, Blender MCP build. Two sheets failed the unchanged two-pixel boundary gate and one hero showed too many top bricks; originals and measurements remain under the reference rejected folder. scripts/measure-rubble-prop-sheet.py reports zero boundary error in all three accepted sheet views at 512 px/m. Counts were inspected separately: front two columns/four courses, side four columns/four courses, top eight faces. No generated sheet was transformed. The tool was requested as GPT Image 2 but did not return a model identifier.

scripts/write-brick-stack-guide.py records all 32 physical bricks. scripts/blender/rubble-heap.py builds the owned source over the original crate collider, sampling a complete brick region of the shared atlas per face. scripts/blender/export-rubble-prop.py exports the root, VIS_brick and COL_crate. test/glb.test.js passes: 1420 total triangles, 1408 visible and 12 collision; 0.675 × 0.620 × 0.675 m; one material and one embedded 1024 albedo. No auxiliary maps. Source collections, calibration capsule, identity transforms and collider bytes are audited.

All six scripts/capture-reviews.mjs fixed captures were produced and inspected. scripts/capture-prop-side.mjs adds an unobscured side. scripts/review-rubble-prop.mjs browser-01 placed its local camera outside the north-east wall; those originals remain. browser-02 uses the explicitly recorded inward offset and shows both instances unobscured in all three states. Both reports passed map decoding, required-node refusal, two-instance capsule fallback and seeded completion. The hero-model image and local views were inspected. npm run verify exited zero; test/content.test.js reported zero findings. Pixel content was inspected separately.

## Measurements

0.00 pp starting allowance was recorded before generation. scripts/measure-rubble-prop-warm-pair.mjs: all three trial instants have exactly zero HUD and scene pixel delta against the original crate GLB at both placements. The resolution remains 0.001 pp. This does not establish warmth at every possible camera.

scripts/capture-rubble-baseline.mjs with scripts/rubble-pixels.mjs, seed 1000/seven players, 1280 × 720:

| State | Warm HUD | Warm scene | Calls | Triangles | Calls / triangles versus baseline |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 363 | 71120 | 0.767442 / 1.032595 |
| dusk | 18.517036% | 19.449870% | 363 | 71120 | 0.767442 / 1.032595 |
| trial | 9.663411% | 9.175347% | 371 | 74408 | 0.771310 / 1.031110 |

scripts/measure-rubble-kit-walk.mjs reports all ten traces and collider/anchor/socket/tuning records equal to phase 1. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs report 32 placement records equal after role normalization and byte-identical fingerprint and full replay to phase 0. scripts/measure-rubble-ground-floor.mjs reports p1 1.2166 and p5 2.7152 versus baseline 1.0762/2.0802, blue-over-red true. The recorded approximately 0.35 luma p5 jitter applies.

## Five visual details and judgment

1. Four clearly divided courses.
2. Two long brick faces across the front.
3. Four shorter ends along the side.
4. Eight broad top faces in a two-by-four layout.
5. Narrow recessed seams and pale rubbed face edges on brown clay forms.

The solid stack silhouette and orderly salvaged-material staging carry across. I accept it for this phase. Wear is substantially quieter and colour browner than the hero; at distance the outer silhouette reads as a compact block, with courses doing the recognition work. Trial is very dark at the north-east corner, an open phase-5 target. These are visual observations, not a test-derived style pass. Final pasted-on comparison at three fog distances remains open. Cart, pump and combined phase-2 delivery are unfinished. Phase 2 remains uncommitted.

Phase-delivery update: all phase-2 assets, including the pump, are now complete. Earlier sequential metrics above remain historical measurements of this asset stage. See ../README.md for the final combined state and remaining whole-pass gaps.
