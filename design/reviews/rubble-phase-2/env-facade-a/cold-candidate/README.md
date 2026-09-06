# First phase-2 asset: env-facade-a

Review candidate on art/rubble-square, based on 73a154c. Phase 1 remains closed.
This packet stops at the requested first-asset review point. The other facade
modules, rubble kit and pump have not been started. Changes are in the art
worktree, uncommitted, preserving the brief's one commit per completed phase.
No phase-2 push or merge is claimed. Main's unrelated corner source is untouched.

Open index.html through the dev server for the hero/model comparison, all four
mood frames, the six lab views and the three scene states. Fixed captures are
in ../../env-facade-a/. The supplemental hero-model camera is recorded in
browser-review.json; it does not replace the fixed game camera.

## Executed and observed

npm run verify exited 0 on this candidate; complete output is in verify.txt.
The content gate in that run reported 234 paths, 147 text files, 18 GLB metadata
chunks and **zero findings** across 26 rules. The source and image review above
remains a separate claim from this grep result.

The reference budget preceded generation: **0.00 pp positive trial allowance**,
all seven existing placements, both HUD-inclusive and scene-only. The native
sheet, hero, three-role ID, failed originals and exact prompts are retained in
../../../references/env-facade-a/. The sheet was never rescaled or rearranged.
scripts/measure-facade-sheet.py reports a maximum two-pixel outline error at
80 px/m. Part counts were checked visually against the sheet and ID.

The facade was authored through an isolated Blender MCP process. Source,
export and source-audit.json are present. The exported asset is **4.5 × 7.8 ×
1.5 m**, **2548 triangles: 2536 visible + 12 collision**, three visible
primitives and three material roles, each with an embedded 1024 albedo. Source
numbers come from scripts/blender/audit-rubble-facade.py and
refine-rubble-facade.py; exported counts come from test/glb.test.js and
scripts/capture-reviews.mjs. No light intensity or runtime lighting code changed.

test/glb.test.js now gates this facade's root/hierarchy, baked transforms,
dimensions, triangle/draw budget, normals, UVs, vertex tints, three matte roles,
embedded PNG sizes, zero emission, no clips/cameras/lights, and exact collision
position/index hashes. COL_wall and SOCKET_lamp equal the original bytes/values.
The visual gable is taller; the original 4 × 6 × 0.4 m collider is unchanged.

scripts/review-rubble-facade.mjs observed all seven runtime placements with
three decoded 1024 maps each. Each required node was removed in turn and the
loader refused it. A forced missing GLB produced seven capsule fallbacks and a
complete seeded match. Linear tone and reduced motion ran successfully. No page
errors or GLTF warnings were observed; browser ReadPixels performance warnings
and the deliberate missing-file warnings are retained in browser-review.json.

scripts/capture-reviews.mjs produced all six 1440 × 900 asset-lab captures.
I inspected those, the Blender previews, the supplemental hero model, and the
actual square frames. The paper notice is blank. No prohibited marks were
observed in any generated image, including the rejected attempts. The content
grep is separately logged; it does not certify pixels.

## Warm budget and performance

The following numbers come from the unchanged
scripts/capture-rubble-baseline.mjs, using scripts/rubble-pixels.mjs. “Before”
is the approved phase-1 scene at 73a154c; “after” includes all seven replacements.
These are percentages of 921600 pixels per 1280 × 720 frame. Draw counters are
per paint including shadow passes; no frame-rate or timed throughput is inferred.

| State | Warm HUD before → after | Warm scene before → after | Calls before → after | Triangles before → after |
| --- | ---: | ---: | ---: | ---: |
| Day | 6.136 → 5.835% | 5.571 → 5.235% | 475 → 381 | 53865 → 74389 |
| Dusk | 18.177 → 5.237% | 18.961 → 5.121% | 475 → 381 | 53865 → 74389 |
| Trial | 9.715 → 9.739% | 9.221 → 9.186% | 483 → 389 | 57153 → 77677 |

Relative to the original phase-0 branch point, calls are 0.805× day/dusk and
0.809× trial; triangles are 1.080× day/dusk and 1.076× trial. Original counts
were 473/68875 and 481/72163 respectively. Both remain below 1.5×. All state
ceilings pass. scripts/compare-rubble-facade.mjs asserts these comparisons and
records the final artifact hashes in comparison.json.

The independent trial HUD pair has a **+0.023329 pp raw difference**. It is not
silently rounded to zero. To isolate the asset from capture variation,
scripts/measure-facade-warm-pair.mjs substitutes the immutable pre-asset GLB
and candidate at all seven placements in the same frozen scene/camera/light
instant, redrawing shadows and using the same classifier. It follows the
baseline day → dusk → trial history and records the actual camera transform.

At three trial instants, each candidate-minus-original result is **−3 HUD warm
pixels (−0.000326 pp), and 0 scene-only warm pixels (0.000000 pp)**. Thus the
asset uses no positive trial allocation. The candidate HUD readings range
9.648–9.847%; the smallest observed ceiling margin is only **0.153 pp**. This
is a measured margin, not funding granted to another asset. The full-scene
standard capture and frozen isolation captures remain separate evidence.

The first isolation harness reopened the page for each state and therefore
used a different chase-camera history. It is retained under
paired-warm-rejected-camera-sequence/ and is excluded from acceptance.

## Ground and movement

scripts/measure-rubble-ground-floor.mjs is the owner's unchanged instrument.
The branch-point p1/p5 are 1.0762/2.0802. The paired pre-asset results are
1.2166/2.5094; the candidate is **1.2166/2.7152**. The darkest-five-percent mean
RGB is **(0.9591, 1.6049, 6.1091)**, B > R. The p5 change is smaller than the
recorded 0.35-luma capture jitter: no meaningful brightening is claimed. These
values meet the relative numerical floor and still look nearly black. The
phase-5 visibility retune remains necessary.

scripts/measure-rubble-contract.mjs and compare-rubble-facade.mjs confirm all
32 placed collider/socket records, controller tuning and square constants equal
the branch point and pre-asset scene. Both the full replay bytes and browser
seed-1000 / seven-player fingerprint are identical. Full replay SHA-256:
9313643a2934c2c74eeb64eb79eeeaaf75ab2e31744502b0bb6307e1f2c459a7.

scripts/measure-facade-walk.mjs runs walk.html with a **temporary browser-route
substitution of the real square and its GLB collision world** for the normal
obstacle course. It compares the approved phase-1 runtime and candidate using
the same workbench controller. All ten deterministic traces and geometry/socket
measurements are equal: spawn, dais step, four boundaries, two passage paths,
bench and bell approaches. Dais top is 0.219999999 m; boundary capsule centres
stop at ±12.1499 m; the player is 1.70 m tall with 0.35 m radius, 0.25 m step
limit and 30° slope limit. Passage path centres are 1.2 m apart and both clear
the approach. This is not a claim of human keyboard/camera comfort testing or
an exhaustive measurement of every possible route. The initial harness allowed
too little acceleration time for its passage assertion; its failure log is
retained, and the corrected trace uses 0.6 seconds on both builds.

## Texture evidence

scripts/profile-rubble-texture.py measures the accepted original and production
images. Production edge mean absolute RGB differences (0–255 scale):

| Atlas | Left/right | Top/bottom | Relative spectral drift | Permutation p |
| --- | ---: | ---: | ---: | ---: |
| Plaster | 5.691 | 7.243 | −0.0503 | 0.8038 |
| Brick | 3.556 | 4.019 | 0.0320 | 0.7693 |

Both pass the frozen instrument. A numerically passing plaster attempt was
nevertheless rejected for a regular dot pattern. The accepted sources are
1254 square, uniformly reduced to 1024 in Blender, without seam repair. The
three roles are plaster, brick and timber-and-soot. The ground retains its
separate approved cobble image in the mineral/plaster role; the backdrop timber
atlas is reused byte-identically. No claim of only three texture files across
the whole project is made.

## Visual judgment and open gaps

Five details shared by hero and model, visible in index.html: the steep narrow
gable/two-slope roof; six unlit two-pane windows with one vertical mullion;
five salvaged door boards; six irregular brick exposures; the small blank
notice beside the door. Both also use pocked plaster and subdued blue joinery.
Those are my observed correspondences, **not the owner's visual approval**.

Against square-dusk-rubble and day-queue-notice-board, the candidate replaces
the timber braces with damaged plaster and brick exposures. Against
night-tribunal-searchlight, its unlit windows preserve the platform's attention
role. Against citizens-lineup-1946, its bevelled forms and painted surfaces use
the same broad handcrafted language. This last style-fit judgment is an
inference; the actual comparison images are supplied for review.

Open: owner taste review of the first facade, including the fairly uniform
plaster wear and the deliberately thin theatre depth; roof grain is simpler
than the hero. The lab silhouette reveals fine bevel/recess seams; it is not
the later citizen silhouette test. Existing corners retain their earlier
appearance and lower roofs, and all seven placements currently repeat this
single candidate. Two later modules will provide the planned variation.

Also open for later phases: remaining phase-2 assets, stage furniture, eight
static citizens, the dusk/trial retune, full-cast 8/8 silhouette identification,
human pasted-on review at three fog distances, and the complete phase-6 packet.
Neither numeric floor passage nor green verification is evidence that those
visual tasks are finished. No mobile support is claimed. No phase-2 commit or
push until the phase is complete; the first-asset checkpoint is reviewable in
this worktree and its local review archive.
