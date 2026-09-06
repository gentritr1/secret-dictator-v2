# Rubble Square — the post-war art pass (direction v2)

## Context (you have no access to the conversation that produced this)

Repo: `/Users/gentlegen/Desktop/Projects/secret-dictator-v2` (GitHub `gentritr1/secret-dictator-v2`, branch from `main`). Single-player social deduction in a three.js town: `play.html` is the playable square, `asset-lab.html` the fixed-camera asset review bay, `walk.html` the movement workbench. Rules engine is byte-identical to v1 and must not change. Dev server: `npm run dev` (Vite). Run `export PATH=$HOME/.nvm/versions/node/v20.19.4/bin:$PATH` before every Node command. The full gate is `npm run verify` (19 gates + build); it must stay green after every phase.

Read first, in this order: `docs/STYLE_BIBLE.md`, `docs/BLENDER_PIPELINE.md`, `docs/ASSET_MANIFEST.md`, `src/play/assets.js` (the loader contract: `requiredNodes`, `sockets`, `fallback`, `scenery`), `test/glb.test.js` (what a GLB must satisfy). Then read `design/concepts/rubble/README.md` (the new direction's mood frames).

**What exists today (measured 2026-09-05, play.html at 1280x720):** every asset is flat vertex-colour geometry with zero textures (manifest: `0 textures` on every row). Facades are beige boxes with brown timber strips, the ground is grey slabs, the backdrop is two untextured rings, the sky is a flat grey-blue colour, the four citizen variants are 1.2k-tri blocky figures in one `CarvedWood` material. Lighting, staging, sockets, colliders, HUD, movement and the seeded match all work and are gated. The art pass replaces the surfaces and silhouettes, not the systems.

**Hazards recorded in this project's memory, all of which have bitten before:**
- Blender MCP `transform_apply(scale=True)` bakes LOCATION into vertex data in this build; review renders are the real validator, headless GLB checks miss floating parts; relaunch recipe: `open -a Blender --args --python-expr "import bpy; bpy.ops.blendermcp.start_server()"` then wait 15-25 s before probing port 9876.
- Vite HMR re-deals the match mid-review; re-assert the premise after every edit. A hidden tab freezes rendering and timers; force a paint or read style values.
- The warm budget must be measured on a worktree at the branch point before any change, or a blowout gets blamed on the wrong session.
- Shared GLB materials need per-seat clones for state overlays; merge per material or the draw-call budget blows; a correct `dispose()` on shared cached geometry is fatal on restart.
- Banned tokens in code COMMENTS break the grep gates (four occurrences so far).
- Presentation timing never touches `G.rng()`; the seeded fingerprint (seed 1000, 7 players) must stay byte-identical.
- Parallel agents share one worktree: commit by explicit path, never reset while another agent works.

## The direction change

The style bible's principles stay. The setting moves. Instead of a timeless fairy-tale half-timber town, the square is a small German town in **1946, the rubble years**: a Marktplatz with a bombed church, pocked tenements, salvaged-brick stacks, a tribunal stage built from doors, gas lamps and one jeep searchlight. The game's Reform and Seize tiles become rival paste-up posters in two fictional colours. The bell, the platform, the notice board, the well (now a hand pump) and the citizen ring keep their gameplay positions and sockets exactly.

What carries over unchanged from `STYLE_BIBLE.md`: warm light is scarce and means attention; dark is blue, never black; three lighting states (day, dusk, night trial) and the warm budget; silhouette-first citizens identifiable from a black silhouette at 20 m; toy-theatre staging with painted-flat backdrops; handcraft allowed to show; no PBR gloss, no NPR shaders, no photo textures.

What changes: palette and material vocabulary. Measure the new palette from the accepted mood frames with the project's own histogram classifier and write it into a `STYLE_BIBLE.md` v2 addendum; do not invent hexes. Expected families: soot grey, brick red, plaster ochre, khaki, headscarf cloth colours, gas-lamp amber, night blue.

**Content rules (hard, legal and store-policy):** no swastikas, SS runes, eagle-and-wreath, real party names, real slogans, real occupation-army flags or insignia, real persons or likenesses. All stamps, notices, posters and typography are fictional. No gore. Rubble reads as aftermath and daily life, never as spectacle. A validator greps every texture name, node name, manifest row and comment for a banned-term list you write in `test/content.test.js`.

## The workflow (same as the FUTURISMA pipeline, adapted to this repo)

For every asset, in this order, with files stored under `design/references/<asset-id>/`:

1. **Sheet** with GPT Image 2 — for props, buildings and citizens only. **Ground and other tileable surfaces do not get a turnaround sheet**: they get a seamless 1024x1024 top-down texture (prompt: "orthographic, straight down, no perspective, seamlessly tileable, no lighting direction"), accepted by two measurements, left/right and top/bottom edge mismatch below 8/255 and no spectral-period slope across rows (a slope means the image is a ground-plane view, not top-down). Never rescale or re-lay-out a generated sheet programmatically: a sheet that fails the shared-scale rule is regenerated with a stricter layout prompt (three equal-width panels, fixed pixels-per-metre stated) until it passes, and the failures stay in the folder with a STATUS note.
   Sheet rule for everything else: three true orthographic views (FRONT / SIDE / TOP), same metre scale, shared baseline, flat grey background, 1 m scale bar, exact counts of every part, role in the game, story wear, style, avoid list. Use the template in `design/concepts/rubble/README.md`.
2. **Hero** at game-camera height with GPT Image 2 (the orchestrator supplied FLUX.2 mood frames for the square; per-asset heroes are yours).
3. **Material-ID pass** with GPT Image 2 from the accepted sheet: flat colours, one per material role.
4. **Blender via MCP** following `BLENDER_PIPELINE.md`: metric, Z-up authoring, front on -Y, collections `00_GUIDES / 10_RENDER / 20_COLLISION / 30_SOCKETS / 90_REVIEW`, `VIS_ / COL_ / SOCKET_ / MAT_ / TEX_` names, calibration capsule, bottom-centre pivots, positive unit scale, no default names, no `.001`.
5. **Painted atlas.** New for this repo: each material role gets a hand-painted 1024 albedo atlas (plaster, brick, timber-and-soot, metal, cloth, emissive) with baked ambient occlusion, grime and wear painted in. Vertex colour is for tinting only. No normal, roughness or metallic maps. Six roles maximum, shared across assets.
6. **Export** to `public/assets/models/<category>/<asset-id>.glb`, then `npm run test:glb` style gate for that asset (extend `test/glb.test.js` per asset the way env-dais-a is covered), then the six fixed captures in `asset-lab.html` (front, three-quarter, side, game, silhouette, collider overlay) saved under `design/reviews/<asset-id>/`.
7. **Manifest row** in `docs/ASSET_MANIFEST.md` the moment the file enters the repo, with bounds, tris, materials, textures, status, review images.
8. **Runtime** through `src/play/assets.js` with `requiredNodes`, `sockets` and `fallback` declared; a missing socket must fall back, never crash.

## Phases (one commit per phase, gates green at each)

**0. Baseline and bible addendum.** On a worktree at the branch point, capture the three lighting states at seed 1000 / 7 players from the fixed game camera, run the warm classifier and the draw-call and triangle counts, and store them under `design/reviews/baseline-v2/`. Write the palette addendum from the mood frames. Write `test/content.test.js`.

**1. Ground, sky and backdrop.** Cobbles with weeds and tram-rail scars as a painted atlas on `env-ground-a` (its collider top is the walk plane; do not move it). A one-state 4096x1024 sky panorama per lighting mood is out of scope; instead one dusk panorama plus the existing state tinting, profiled with a per-column warmth and luma script (no 10° window changes warmth by more than 0.05, luma range ≤ 2x). Backdrop rings become painted flats: bombed church spire, pocked rooflines, a water tower, chimneys; silhouettes only, no detail that competes with citizens.

**2. Facades and rubble kit.** Three facade modules on the existing 4.5 m grid replacing `env-facade-a`: intact-but-pocked, half-collapsed with rooms open to the sky, boarded shopfront. Rubble heap (two sizes), salvaged-brick stack, rubble rail cart on 1.2 m of track, hand pump replacing `env-well-a` at the same position and bounds. Every module keeps the wall's collider footprint; the walkable contract table in `BLENDER_PIPELINE.md` is authoritative.

**3. Stage furniture.** The tribunal platform as salvaged doors and beams (same 6.0 x 3.4 m, top at 0.22 m, `COL_dais`, `COL_lectern`, `SOCKET_podium` unchanged), lectern, bell on a scaffold post, notice board with fictional paste-ups where Reform and Seize tiles land as posters, gas lamps replacing `env-lantern-a` with `SOCKET_flame` at the same height, one jeep-searchlight prop as the trial beam source.

**4. Citizens.** Eight silhouettes from the lineup frame: rubble woman, returning soldier (no insignia), black-marketeer, clerk, innkeeper, professor, nurse, teenager with cart. Preserve the shipped contract of `chr-citizen-base` exactly: it has NO armature and NO animation clips, its root is the foot-centre asset root, and its label socket is the lowercase `SOCKET_label` (the earlier wording `SOCKET_Label` and "armature, clip names" was wrong; corrected 2026-09-05). Do not add a rig in this pass; static posed variants as today; keep triangle counts within 1.6k each; painted cloth atlas; one accessory each readable at distance. The player uses the same variants.

**5. Lighting re-measure.** Re-run the warm classifier on the three states; the night trial must stay under the bible's 10% warm ceiling. The floor criterion is **ground-masked luma p1 and p5 no darker than the branch-point baseline**, measured with the same script, mask, camera, seed, lighting state and sampling method for both builds, plus the **blue-not-black hue check on those percentile bands**. Consolidate percentile and hue reporting in `scripts/measure-rubble-ground-floor.mjs` and freeze its definitions before retuning; retain RGB evidence alongside luma so brightness alone cannot pass the hue rule. The historical `(1,11,20)` absolute and single darkest scene/ground pixel are retired as acceptance criteria by the owner's 2026-09-06 review. Keep old measurements as historical evidence, not failing gates. Adjust albedo, not intensity, when the gap is albedo. Retune the existing pink-mauve dusk gradient toward the grey-blue sky hero in this phase, then repeat sky profiles and all state budgets.

**6. Evidence.** Under `design/reviews/rubble-v1/`: hero-versus-model side-by-sides for every asset (five shared details nameable), the silhouette lineup test (a reviewer names all eight citizens from black silhouettes at the 20 m game distance), the pasted-on test (every prop beside the platform at three fog distances), before/after frames per lighting state, the warm and luma numbers with the script that made them, draw calls and triangles before/after, `npm run verify` log, the content-validator log, and the seeded fingerprint check.

## Phase-1 review decisions (2026-09-06)

The owner approved phase 1 as a phase delivery at `16fa8af`, after independent fresh-worktree verification and visual/content review. This does not approve the remaining whole-pass acceptance tests. Keep the current cobble world-size: the smaller stones read as setts rather than the hero's larger flags. Do not double the tile world-size. Keep the current dusk gradient through phases 2–4; its hue retune belongs to phase 5.

**Warm budgets before production, phases 2 and 4.** Every facade module, rubble-heap size, brick stack, cart, pump and each of the eight citizen variants must have its own numeric incremental warm budget recorded in its reference packet before generation/modeling. Start each with **0.00 percentage points of positive trial-warm allowance**, measured at all intended placements (including repeated facade instances and the player variant). A positive allocation must be explicitly funded from measured savings/headroom and recorded in the phase ledger before work; do not assume the entire phase-1 headroom remains available. Use the baseline classifier, record HUD-inclusive and scene-only results, and account for repeat-capture variation. **Resolution ruling (owner, 2026-09-06):** the frozen-scene pair harness is the arbiter of an asset's own cost, and its resolution is not one pixel: HUD deltas for an identical swap varied by up to three pixels between independent runs. A positive delta therefore counts only when it exceeds **0.001 percentage points (nine pixels of 921,600) at any instant**; smaller positives are recorded verbatim as instrument noise, never rounded to zero and never reported as a failed gate. The full-scene capture keeps its own repeat-capture spread (about 0.2 points between trial instants) and is compared only against the 10% ceiling, not against the zero allowance. Check each asset before proceeding to the next, then check the combined scene. Per-asset budgets never override the 10% trial ceiling or other state ceilings. Phase 5 is not a deferred budget check for assets already integrated.

## Acceptance (whole pass)

1. `npm run verify` green; the seed 1000 / 7-player fingerprint byte-identical to baseline.
2. No gameplay measurement changed: every row of the walkable contract table re-measured in `walk.html` and equal.
3. Every shipped GLB passes the GLB gate and has a manifest row with review captures.
4. Warm% per state within the bible rule, measured with the same classifier as baseline; ground-masked trial luma p1 and p5 no darker than the branch-point baseline using the same script, plus blue-not-black hue checks on those percentile bands. Single-pixel minima and the retired absolute floor are not acceptance gates.
5. Silhouette test 8/8; hero-versus-model five details per asset; pasted-on test passed by a reviewer without source access.
6. Content validator finds zero banned terms across textures, nodes, manifest, comments.
7. Draw calls and triangles within 1.5x of baseline; report both.
8. `?tone=linear` and reduced-motion paths still work; mobile is still not claimed.

## Non-goals

No engine, AI, floor, HUD or multiplayer changes. No new mechanics. No NPR shaders. No mobile layout. No real historical iconography of any kind.

## Delivery

Branch `art/rubble-square`. One commit per phase. Push to GitHub. Final report separates executed-and-observed from inferred, names the script behind every number, reconciles sampled metrics against window × expected rate, and lists open gaps. "Tests pass" is not evidence for a visual.
