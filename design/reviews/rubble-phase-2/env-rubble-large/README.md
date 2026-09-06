# Large rubble heap — accepted by Codex for this phase

Replaces four barrel instances at their unchanged positions and yaws. Twelve pieces: six brick fragments, four plaster chunks and two timber ends. The original COL_barrel positions and indices remain byte-identical. No sockets or interaction were added.

## Executed and observed

Native sheet, game-height hero and material-ID were generated before modeling. The first narrow sheet failed scale. A subsequent narrow sheet passed scale, but its hero read as an upright monument; that direction was rejected before modeling. The revised broad design is 1.100 × 0.890 × 1.000 m, with masonry below 0.65 m and an angled timber reaching the peak. Rejected originals, the superseded budget and physical guide remain in the reference packet. scripts/measure-rubble-prop-sheet.py measured the accepted sheet at 400 px/m, with one-pixel boundary error in each view against the unchanged two-pixel tolerance. No generated sheet was transformed.

scripts/blender/rubble-heap.py built the owned source via MCP. scripts/blender/export-rubble-prop.py exported the source root, three VIS meshes and unchanged collider. test/glb.test.js passed 2025 checks across the repository: this asset has 604 total triangles, comprising 576 visible and 28 collision triangles. Its three materials share the approved facade plaster, brick and timber 1024 albedos, with tint-only vertex colours and no auxiliary maps.

scripts/capture-reviews.mjs produced all six fixed lab captures, each inspected. scripts/capture-prop-side.mjs adds an unobscured side capture because the standard calibration figure covers the prop. scripts/review-rubble-prop.mjs produced the game-height model capture and day/dusk/trial local runtime views, inspected separately from the numeric gates. The browser report checks map decoding, required-node refusals and the four-instance capsule fallback with a completed seeded match. npm run verify exited zero in verify.txt.

## Measured budget

The allowance was 0.00 positive trial percentage points before generation. scripts/measure-rubble-prop-warm-pair.mjs compared all four replacements with the retained original barrel GLB. Every one of the three trial instants recorded exactly zero added HUD pixels and zero scene pixels. The rule remains 0.001 pp resolution, with raw differences retained. This camera-specific instrument does not establish warmth at every possible walking viewpoint.

scripts/capture-rubble-baseline.mjs uses the unchanged scripts/rubble-pixels.mjs classifier at seed 1000, seven players, 1280 × 720:

| State | Warm HUD | Warm scene | Calls | Triangles | Calls / triangles versus baseline |
| --- | --- | --- | --- | --- | --- |
| day | 5.841797% | 5.242947% | 373 | 69600 | 0.788584 / 1.010526 |
| dusk | 18.513129% | 19.481445% | 373 | 69600 | 0.788584 / 1.010526 |
| trial | 9.664497% | 9.118707% | 381 | 72888 | 0.792100 / 1.010047 |

scripts/measure-rubble-kit-walk.mjs reports all ten traces equal to phase 1, with collider bounds, anchors, sockets and tuning equal. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs report 32 placement records equal after mapping replacement IDs to their original roles, and both fingerprint and full replay byte-identical to phase 0. scripts/measure-rubble-ground-floor.mjs reports p1 1.2166 and p5 2.4372 against baseline 1.0762 and 2.0802, with blue-over-red true. The recorded approximately 0.35 luma p5 jitter remains applicable.

## Five visual details and judgment

1. A broad brown fragment base supports the compact pile.
2. Four pale plaster masses form the low, broken crown.
3. One steep blue timber end establishes the highest point.
4. A second, nearly horizontal timber crosses the front.
5. Separated base fragments create an irregular footprint and negative spaces, instead of the rejected upright tower.

I accept those forms and the restrained material families for this phase. The model has cleaner bevels and substantially quieter wear than the hero; its side is visibly more block-like. Two adjacent placements partly overlap visually in the west row, while their original colliders remain unchanged. The local trial image is very dark, consistent with the still-open phase-5 lighting target. These are direct visual observations, not conclusions inferred from tests. Final pasted-on review at three fog distances remains open. Brick stack, cart, pump and the combined phase-2 delivery are unfinished; nothing is committed yet.

Phase-delivery update: all phase-2 assets, including the pump, are now complete. Earlier sequential metrics above remain historical measurements of this asset stage. See ../README.md for the final combined state and remaining whole-pass gaps.
