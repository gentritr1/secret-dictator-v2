# Small rubble heap — accepted by Codex for this phase

One six-piece replacement for the crate at (-11.6, 0, 4.1), yaw0.2. Three brick fragments, two pale plaster chunks and one diagonal timber splinter. Same foot-centre root convention; unchanged COL_crate bytes; no sockets or interaction. A/B/C facade geometry and atlases are unchanged.

## Executed and observed

Generation order was sheet, hero, material-ID, then Blender modeling and atlas reuse. Four scale/part failures are retained in the reference rejected folder. The fifth sheet passed scale but had a side-occlusion mistake in the authored guide, discovered by reviewing the actual model. That whole reference set is retained as superseded. The corrected sixth sheet, second hero and second material-ID were regenerated without any image relayout. Geometry did not change for the reference correction. scripts/measure-rubble-prop-sheet.py reports front/side/top boundary errors 0/0/1 pixels at512px/m, within the unchanged2px tolerance. Internal projections were visually checked separately; a boundary pass alone had missed the side error.

scripts/blender/rubble-small.py builds only the owned source via MCP, appending the approved plaster, brick and timber materials. scripts/blender/export-rubble-prop.py exports root, three merged VIS meshes and the retained collider. The first GLB failed because the bevel shortened width by0.001736m and the collider retained an extra material. Source corrections restored the measured envelope and assigned an existing material to the collider, without changing its geometry; the rejected gate log remains. Final test/glb.test.js passes:312 total triangles,300 visible and12 collision;0.675 ×0.620 ×0.675m;three1024 embedded albedos and three materials, no auxiliary maps. The source keeps all five pipeline collections and the .7 ×1.7m calibration capsule.

scripts/capture-reviews.mjs produced all six fixed1440×900 lab captures. I inspected each. The standard side view is obstructed by the lab capsule; scripts/capture-prop-side.mjs adds side-unobscured.png using the same camera with guides hidden, leaving the original intact. scripts/review-rubble-prop.mjs adds the game-height hero/model image and three runtime views, checks all maps decode, required-node refusals, capsule fallback with a completed seeded match, linear tone and reduced motion. browser-01/browser-review.json records no page errors and the expected deliberate failed-load warnings.

npm run verify exited0 in verify.txt. test/content.test.js reported zero findings in content-gate.txt; generated images were separately visually inspected for prohibited marks, with none observed.

## Measured runtime budget

Initial allowance0.00pp recorded before generation. scripts/measure-rubble-prop-warm-pair.mjs swaps the actual replacement against previous.glb, the original crate, at the same placement. Three trial instants: zero added HUD pixels and zero scene pixels at each. This passes the ae6a31a0.001pp resolution rule. Note the fixed podium-camera measurement does not demonstrate visibility or lighting at every possible player viewpoint; the extra eye-height captures show its actual local appearance.

scripts/capture-rubble-baseline.mjs and the unchanged scripts/rubble-pixels.mjs classifier, seed1000/seven players,1280×720:

| State | Warm HUD | Warm scene | Calls | Triangles | Call / triangle baseline ratio |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 377 | 69792 | 0.797040 / 1.013314 |
| dusk | 18.481120% | 19.554253% | 377 | 69792 | 0.797040 / 1.013314 |
| trial | 9.783637% | 9.085286% | 385 | 73080 | 0.800416 / 1.012707 |

scripts/measure-rubble-kit-walk.mjs: ten traces equal to phase1, plus all collider bounds, anchors, sockets and tuning; output is walk-01. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs:32 placement records equal to phase0 after mapping replacement IDs to original IDs; fingerprint and full replay byte-identical. scripts/measure-rubble-ground-floor.mjs: p1=1.2166,p5=2.3649999999999998 against1.0762/2.0802; blue-over-red true. The approximately0.35-luma p5 jitter and the visibly dark trial tail remain lighting-phase limitations.

## Five visual details and judgment

1. Tall pale rear chunk gives the asymmetric crown in both hero and model.
2. Low pale front-left chunk sits on the left brick.
3. Three brown base fragments include the single high right wedge, with no extra horizontal joint.
4. One blue diagonal timber splinter bridges the front centre toward the right.
5. From the side, the high right brick hides the lower interior, leaving the pale cap and short blue board end visible.

I accept the compact salvaged-masonry silhouette and palette for this phase. Production wear is substantially quieter and bevels cleaner than the hero; the source reuses the approved role atlases instead of introducing a separate texture set. The pile is partly screened by the neighbouring barrels until the large-heap replacements land. This is a visual judgment, not a test-derived style pass. Final pasted-on review at three fog distances remains open, as do the remaining four phase-2 assets and subsequent art phases.

New kit measurement tools require explicit output directories and reject an existing output directory. They do not default to any earlier facade folder. Phase2 remains uncommitted until the pump and the combined phase gates are complete.

Phase-delivery update: all phase-2 assets, including the pump, are now complete. Earlier sequential metrics above remain historical measurements of this asset stage. See ../README.md for the final combined state and remaining whole-pass gaps.
