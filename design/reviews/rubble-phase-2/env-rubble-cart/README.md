# Rubble rail cart — accepted by Codex for this phase

One replacement at the unchanged south crate position, with its original COL_crate bytes. Exactly 25 parts: bed, four side panels, four wheels, two axles, four uprights, four brick loads, two 1.2 m rails and four sleepers. No sockets or interaction.

## Executed and observed

Native sheet, game-height hero and material-ID preceded Blender modeling. The first sheet failed the two-pixel boundary gate and added divisions; the first hero painted the rails like timber. Both originals are retained with STATUS. The accepted sheet measures one-pixel boundary error in all three views at 360 px/m using scripts/measure-rubble-prop-sheet.py. No sheet was rescaled or rearranged. The corrected hero retains iron rails and timber sleepers. Image generation was requested as GPT Image 2; exact model ID was not returned.

scripts/write-rubble-cart-guide.py records every physical part and the track length. scripts/blender/rubble-cart.py builds the owned source via MCP with shared brick and timber plus the new shared iron atlas. The first model's timber was too pale; its preview and GLB remain in rejected-pale-timber. Only timber tint was changed before integration. scripts/blender/export-rubble-prop.py exports the root, three VIS meshes and original collider. test/glb.test.js passes: 1496 total triangles, 1484 visible and 12 collision, 0.800 × 0.820 × 1.200 m, three shared embedded 1024 albedos and no auxiliary maps. The iron atlas is four UV paint regions, uniformly reduced in Blender from native 1254 square to 1024; it is not a repeating surface texture. metal-atlas.json records the operation. Orthographic sheets were untouched.

All six scripts/capture-reviews.mjs fixed captures were inspected; scripts/capture-prop-side.mjs adds side-unobscured-02.png for the final tint. scripts/review-rubble-prop.mjs produced the hero-model image and day/dusk/trial local views, all inspected. Its report verifies decoded maps, required-node refusal, capsule fallback, seeded completion, linear tone and reduced motion. npm run verify exited zero. Original asset root and five source collections are retained; transforms and collider bytes are audited.

## Measurements

Initial positive allowance 0.00 pp was recorded before generation. scripts/measure-rubble-prop-warm-pair.mjs compares the one intended placement with the original crate GLB. All three trial instants have exactly zero HUD and scene pixel delta; resolution remains 0.001 pp. This is camera-specific evidence, not a guarantee for every possible viewpoint.

scripts/capture-rubble-baseline.mjs with scripts/rubble-pixels.mjs, seed 1000/seven players, 1280 × 720:

| State | Warm HUD | Warm scene | Calls | Triangles | Calls / triangles versus baseline |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 360 | 71956 | 0.761099 / 1.044733 |
| dusk | 18.502496% | 19.532118% | 360 | 71956 | 0.761099 / 1.044733 |
| trial | 9.678819% | 9.121962% | 368 | 75244 | 0.765073 / 1.042695 |

scripts/measure-rubble-kit-walk.mjs: all ten traces and collider/anchor/socket/tuning records equal to phase 1. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs: all 32 placement records equal after role normalization, fingerprint and full replay byte-identical to phase 0. scripts/measure-rubble-ground-floor.mjs: p1 1.2166 and p5 2.7874 against baseline 1.0762/2.0802, blue-over-red true; approximately 0.35 luma p5 jitter applies.

## Five shared details and visual judgment

1. Squat timber box over four exposed wheels.
2. Four broad reddish-brown loads in a two-by-two arrangement.
3. Four cool iron corner uprights.
4. Two long iron rails extending beyond the cart body.
5. Four transverse timber sleepers and open space below the bed.

I accept the cart for this phase. Its corrected grey-green timber and blue iron carry the hero's material separation, while the model's brick wear remains quieter. Its four solid loads are more orderly than the loose heap in the dusk mood frame. Trial at its local corner remains dark. No geometry was moved to improve the review camera. The final pasted-on test at three fog distances and phase-5 lighting remain open, along with the pump and combined phase-2 delivery. Phase 2 is uncommitted.

Phase-delivery update: all phase-2 assets, including the pump, are now complete. Earlier sequential metrics above remain historical measurements of this asset stage. See ../README.md for the final combined state and remaining whole-pass gaps.
