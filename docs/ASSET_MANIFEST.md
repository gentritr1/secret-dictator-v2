# Asset manifest

Every asset in this repo: where it came from, its license, and where it is used.
Add a row the moment an asset enters the repo — no orphan files.

Production status uses `draft`, `review`, `approved`, `shipping`, or `retired`.
Keep retired rows so provenance is never lost. The complete source, export,
review, naming, scale, and validation rules live in
[`BLENDER_PIPELINE.md`](./BLENDER_PIPELINE.md).

## Concept art (reference only — never shipped in builds)

Generated 2026-08-08 via Higgsfield (user's own account) for the Step 5 style
bible. AI-generated concept reference; used to direct hand-made 3D work, not as
shipped game art.

| file | model | job id | prompt theme |
| --- | --- | --- | --- |
| design/concepts/square-A-storybook-painterly.png | soul_location | 1b2fee5a-66cf-42be-810e-abcc4166c63c | town square dusk, painterly gouache storybook |
| design/concepts/square-B-stylized-game.png | soul_location | bf042c0c-5790-4289-b458-bf9946951f59 | town square dusk, stylized low-poly painterly game look |
| design/concepts/square-C-woodcut-ink.png | soul_location | 116d7a68-25bb-43ed-ba08-c3d3520546d0 | town square dusk, dark woodcut ink, propaganda-poster mood |
| design/concepts/square-D-toy-theater.png | soul_location | 446d3b9d-5974-4b75-8a58-c878746b6e6e | town square as miniature theater diorama, tilt-shift |
| design/concepts/citizens-A-storybook.png | recraft_v4_1 | cb1e85f4-020e-4a5f-af19-31312da718c1 | 8-citizen lineup, storybook gouache |
| design/concepts/citizens-B-woodcut.png | recraft_v4_1 | e0053169-fe6d-4a49-a0ec-a76942c4b7f3 | 8-citizen lineup, woodcut ink |

All four square concepts share one content brief (platform + gavel stand,
lanterns, half-timbered facades, well, tree, 7 gathered citizens, dusk) so the
choice between them isolates *treatment*, not content.

### Style-bible round (direction locked: B base + D staging + woodcut citizens)

| file | model | job id | prompt theme |
| --- | --- | --- | --- |
| design/concepts/mood-day-discussion.png | soul_location | d539cd8a-ae90-4ef3-ab20-d264a5d13cf0 | B-style square, overcast day, discussion |
| design/concepts/mood-dusk-gathering.png | soul_location | ed21fad8-0e8b-48f0-9911-91027a865eab | B-style square, golden dusk, gathering |
| design/concepts/mood-night-trial.png | soul_location | 02b209ac-5b5a-4da1-8efd-3d0543966e8e | B-style square, night trial, stage beam (hero) |
| design/concepts/citizens-sculpt-reference.png | recraft_v4_1 | 373ecc9e-65c2-4730-adb2-0e8d8b2174b6 | carved-figurine citizen lineup, 3D sculpt target (hero) |

### Direction v2 round (2026-09-05): the rubble-years square

Generated on the owner's Higgsfield account with FLUX.2 pro as direction targets for the
post-war art pass in `docs/briefs/RUBBLE-SQUARE-ART-PASS.md`. Reference only, never
shipped. Caveats (a cap star on the soldier, placeholder poster symbols) are recorded in
`design/concepts/rubble/README.md` and must not be reproduced.

| file | model | job id | prompt theme |
| --- | --- | --- | --- |
| design/concepts/rubble/square-dusk-rubble.png | flux_2 | 2c80b136-49fa-4193-ace2-daca59166adf | 1946 market square at dusk, door-built tribunal platform, bombed church, brick stacks (base look) |
| design/concepts/rubble/night-tribunal-searchlight.png | flux_2 | 77d7a916-71a0-4da6-95be-31ffaf20997b | night trial under one searchlight pool, rim-lit watchers, painted-flat skyline (hero) |
| design/concepts/rubble/day-queue-notice-board.png | flux_2 | ddbcccae-bcd8-4950-b055-273474a2cf46 | overcast day, ration queue at the notice board, brick chain, half-collapsed tenement |
| design/concepts/rubble/citizens-lineup-1946.png | flux_2 | 74d9f325-2640-4699-ae84-7c54aeca8e26 | carved-figurine citizen lineup, 1946 trades (hero for finish and proportion; six of eight figures) |

## Pipeline test artifacts

| file | source | license | used for | status / known limits |
| --- | --- | --- | --- | --- |
| design/pipeline-test/podium-test.glb | authored in Blender 5.2 via MCP, 2026-08-09; source `.blend` is not in the repository | ours | Blender→glTF→three.js transport proof (2 hex meshes, TimberOchre + SlateStone materials); loaded successfully via GLTFLoader through Vite | pipeline test only — not shipped; approx. `2.77 x 0.42 x 3.20 m`, no asset root, collider, sockets, or metadata; default mesh datablock names; opaque materials are double-sided |
| design/pipeline-test/front-marker.glb | authored in Blender 5.2 via MCP, 2026-08-09 | ours | axis-convention proof: Nose cube at Blender `(0,-1,0.25)` / Tail at `(0,+1,0.25)` arrive in three.js at `(0,0.25,+1)` / `(0,0.25,-1)` — locks Blender `-Y` = runtime `+Z` front (BLENDER_PIPELINE.md World contract) | pipeline test only — not shipped |

## Production assets

Add a row at `draft` as soon as production work starts. For an external asset,
`origin / license` must include the source URL, creator, licence, download date,
and modifications. Work authored for this project should say “authored for this
project via Blender MCP; ours.”

| asset ID | source `.blend` | runtime GLB | origin / license | bounds | tris / materials / textures | status | used by | review images |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| env-dais-a | art/blender/environment/env-dais-a/env-dais-a.blend | public/assets/models/environment/env-dais-a.glb | authored for this project via Blender MCP; ours | 6.0 × 1.27 × 3.4 m (collision; visible art tops out at 1.209 — the lectern collider is 6 cm proud of the desk. dais top 0.22) | 1212 tris total: 1188 visible + 24 collision / 3 materials (TimberOchre, TimberShadow, SlateStone) / 0 textures | shipping | play.html square — `src/play/assets.js` places it at `(0, 0, 9)` with yaw π, replacing the procedural `dais` and `lectern` pieces of `src/play/square.js`; `COL_dais` and `COL_lectern` are the player's collision there and `SOCKET_podium` is the podium interactable's anchor | design/reviews/env-dais-a/ |
| env-lantern-a | art/blender/environment/env-lantern-a/env-lantern-a.blend | public/assets/models/environment/env-lantern-a.glb | authored for this project via Blender MCP; ours | 0.340 × 2.440 × 0.340 m | 408 tris: 396 visible + 12 collision / 4 materials (SlateStone, TimberShadow, IronDark, LanternGlass) / 0 textures | shipping | `play.html` — two placements flanking the dais at (±4.2, 0, 8.2), declared as two rows of the `ENVIRONMENT` table in `src/play/assets.js`. `COL_post` is the player's collision; `SOCKET_flame` is reserved for the lighting director and carries no light yet — the glass's authored emissive does the glow. A missing file degrades each placement to a labelled capsule | design/reviews/env-lantern-a/ |
| env-ground-a legacy (branch point f738316) | art/blender/environment/env-ground-a/env-ground-a.blend | public/assets/models/environment/env-ground-a.glb | authored for this project via Blender MCP; ours | 27.800 × 0.072 × 27.800 m visible (COL_ground extends to −0.5) | 4740 tris: 4728 visible + 12 collision / 3 materials (CobbleSlate, CobbleWarm, KerbStone) / 0 textures | retired | `play.html` — one placement at the origin replacing the graybox `ground`. **It carries that ground's collision**: `COL_ground`'s top face IS the walk plane at y=0 and the stones hang below it, because a visible surface laid over the walk plane sinks the player's feet into it by the stones' own height. The graybox kerb walls are not replaced and still bound the square. Deterministic scatter (fixed seed 20260810): ~1.3 m slabs, brick-offset rows, per-stone jitter in size and height for grout shadow, and a second near-slate tone — the first pass used #4a4038 and read as a red-brown pattern rather than weathering, so the accent is now #3e4244. Second half of Gate 3's albedo answer, with env-facade-a | design/reviews/env-ground-a/ |
| env-backdrop-a legacy (branch point f738316) | art/blender/environment/env-backdrop-a/env-backdrop-a.blend | public/assets/models/environment/env-backdrop-a.glb | authored for this project via Blender MCP; ours | 107.7 × 25.8 × 107.1 m (two rings, radius 26 m and 40 m) | 429 tris / 2 materials (BackdropNear, BackdropFar) / 0 textures | retired | `play.html` — one placement at the origin. The style bible's "backdrop, not skybox realism": rooftop cut-outs as painted flats, two depth rings with the near ring darker so the far one falls back. **Declared `scenery: true`** — it stands beyond anything the player can reach, so it carries no collider and the loader's no-collision refusal is waived for it by that flag rather than by a token COL_ box. Its fallback is `omit`: a placeholder capsule standing where a 60 m horizon should be would be worse than the honest absence. **Documented contract exception: both materials are double-sided.** A painted cut-out is not a solid, and a flat whose normal happened to face outward would simply vanish; at 429 tris the cost is nil. Every other production asset remains single-sided. Height is load-bearing, not decorative: from 1.6 m eye height the 6 m town wall at 13.6 m occludes everything below ~10 m at 26 m distance, so the near ring starts at 10.5 m. The first two exports were invisible — the second because the profiles, already built upright in the XZ plane, were then rotated 90° about X and laid flat on the ground | design/reviews/env-backdrop-a/ |
| env-well-a legacy (branch point f738316) | art/blender/environment/env-well-a/env-well-a.blend | public/assets/models/environment/env-well-a.glb | authored for this project via Blender MCP; ours | 1.650 × 2.541 × 1.718 m | 1168 tris: 1140 visible + 28 collision / 3 materials (SlateStone, TimberShadow, WellDark) / 0 textures | retired in phase 2; pump replacement below | `play.html` — one placement at (−7.6, 0, 1.4). `COL_well` is the drum only, so the roof passes over your head. Not interactive. The water is `WellDark` (#181828, the night-ambient hex) rather than black, per the style bible's one absolute | design/reviews/env-well-a/ |
| env-tree-a | art/blender/environment/env-tree-a/env-tree-a.blend | public/assets/models/environment/env-tree-a.glb | authored for this project via Blender MCP; ours | 4.102 × 5.284 × 2.506 m | 368 tris: 340 visible + 28 collision / 3 materials (TimberShadow, FoliageMoss, FoliageDeep) / 0 textures | shipping | `play.html` — one placement at (8.2, 0, −1.2), opposite the well so the square is not symmetrical. `COL_trunk` only: you walk under the canopy. Faceted crown masses in the citizens' carved language rather than a foliage card. `FoliageMoss`/`FoliageDeep` are the style bible's day-mood "muted greens", desaturated far enough to sit beside slate | design/reviews/env-tree-a/ |
| env-barrel-a | art/blender/environment/env-barrel-a/env-barrel-a.blend | public/assets/models/environment/env-barrel-a.glb | authored for this project via Blender MCP; ours | 0.637 × 0.890 × 0.670 m | 652 tris: 624 visible + 28 collision / 2 materials (TimberOchre, IronDark) / 0 textures | shipping | `play.html` — four placements in `dressingRows()`. Staves belly outward so it reads as a barrel rather than a drum | design/reviews/env-barrel-a/ |
| env-crate-a | art/blender/environment/env-crate-a/env-crate-a.blend | public/assets/models/environment/env-crate-a.glb | authored for this project via Blender MCP; ours | 0.675 × 0.620 × 0.675 m | 660 tris: 648 visible + 12 collision / 1 material (TimberShadow) / 0 textures | shipping | `play.html` — four placements in `dressingRows()`. Corner battens and a band, so it is a crate and not a cube. Its first export sat 1 cm under the floor — the bevel rounded the bottom edges outward — and was lifted by the measured amount rather than a guessed one | design/reviews/env-crate-a/ |
| env-bell-a | art/blender/environment/env-bell-a/env-bell-a.blend | public/assets/models/environment/env-bell-a.glb | authored for this project via Blender MCP; ours | 1.850 × 3.077 × 1.528 m | 1292 tris: 1280 visible + 12 collision / 4 materials (TimberShadow, BellBrass, SlateStone, RopeHemp) / 0 textures | shipping | `play.html` — one placement at (5.5, 0, 5.5), replacing the graybox `bell-post` and `bell`. The player rings it every morning of every match, so it is built to read as a destination from across the square: a timber A-frame under a slate cap, and the only brass in the town | design/reviews/env-bell-a/ |
| env-bench-a | art/blender/environment/env-bench-a/env-bench-a.blend | public/assets/models/environment/env-bench-a.glb | authored for this project via Blender MCP; ours | 2.300 × 0.800 × 0.690 m | 876 tris: 864 visible + 12 collision / 2 materials (TimberOchre, SlateStone) / 0 textures | shipping | `play.html` — one placement at (−9, 0, 0) turned a quarter so the seat runs along Z, the axis `BENCH` in square.js describes. Replaces the three graybox bench pieces | design/reviews/env-bench-a/ |
| env-board-a | art/blender/environment/env-board-a/env-board-a.blend | public/assets/models/environment/env-board-a.glb | authored for this project via Blender MCP; ours | 2.350 × 2.405 × 0.140 m | 1848 tris: 1836 visible + 12 collision / 3 materials (SlateStone, TimberShadow, SlotDark) / 0 textures | shipping | `play.html` — one placement at (0, 0, 11.0) yaw π, standing behind the dais facing the crowd. Five Reform slots above six Seize slots, the same order the tray reads them. Carries eleven `SOCKET_reform_n` / `SOCKET_seize_n` empties for enacted tiles to be seated in; **nothing fills them yet** and the slots read as recesses, which is what an empty board looks like. They are deliberately unclaimed in the row's `sockets` map — that map allows one claimant per logical name, and eleven names for one feature belong to whatever wires the tiles | design/reviews/env-board-a/ |
| env-tile-a | art/blender/environment/env-tile-a/env-tile-a.blend | public/assets/models/environment/env-tile-a.glb | authored for this project via Blender MCP; ours | 0.88 × 0.23 × 0.045 m (both faces side by side in one file) | 456 tris / 3 materials (ReformBlue, SeizeRust, TimberShadow) / 0 textures | shipping | `play.html` — loaded once by `loadTiles()` and cloned per enacted law into `env-board-a`'s eleven sockets by `seatTiles()` in main.js. Not an ENVIRONMENT row: a tile is stamped into a socket, not placed, the same shape of thing the cast is. **The only asset carrying `ReformBlue` (#6aa6e6) and `SeizeRust` (#e8695f)** — the handoff palette allows those two hexes on the board and the track and nowhere else, and this asset is the board | design/reviews/env-tile-a/ |
| env-corner-a | art/blender/environment/env-corner-a/env-corner-a.blend | public/assets/models/environment/env-corner-a.glb | authored for this project via Blender MCP; ours | 3.919 × 6.927 × 2.436 m | 1200 tris: 1188 visible + 12 collision / 3 materials (PlasterWarm, TimberShadow, SlateStone) / 0 textures | shipping | `play.html` — four placements at (±13.6, 0, ±13.6) from `facadeRow()`. A bay is one flat face, so two of them turning a right angle left an open joint visible from any oblique view. Same four hexes and the same 6 m eaves as `env-facade-a`, with a hipped cap, so the roofline runs through the turn rather than ending at it — a corner that did not match the bays it joins would be worse than the gap | design/reviews/env-corner-a/ |
| env-facade-a | art/blender/environment/env-facade-a/env-facade-a.blend | public/assets/models/environment/env-facade-a.glb | authored for this project via Blender MCP; ours | 4.500 × 6.666 × 1.528 m | 1224 tris: 1212 visible + 12 collision / 4 materials (PlasterWarm, TimberShadow, SlateStone, WindowGlass) / 0 textures | retired at 73a154c; replacement below | `play.html` — seven placements forming the town wall (three north behind the dais at z 13.6, two each east and west turned inward), generated by `facadeRow()` in `src/play/assets.js`. `COL_wall` is the player's collision; `SOCKET_lamp` is authored but deliberately unclaimed (two rows may not claim one logical socket name). Answers Gate 3's measured finding that the day/dusk gap against the concept art was albedo, not light: `PlasterWarm` (#cbb794) is a light tint of the style bible's timber-ochre family — the first pass used parchment #d8d4c8 and rendered grey. A missing file degrades every bay to a capsule | design/reviews/env-facade-a/ |

Owner approved the review captures on 2026-08-09; the row moved `review` →
`shipping` when the runtime loader landed the same day.

Review images: the browser captures in `design/reviews/env-dais-a/` (front /
three-quarter / side / game-camera / silhouette / collider-overlay, 1440×900,
taken by `scripts/capture-reviews.mjs` through `asset-lab.html`) are the final
truth per the pipeline; `blender-preview-*.png` are retained work previews.
The front view doubles as the scale view (capsule + banded ruler in frame).

Gated by `npm run test:glb` (`test/glb.test.js`), which reads the bytes: the
required node names, single-sided opaque materials, bounds and the `0.22 m` dais
top to ±1 cm, closed outward-facing colliders, and then the real controller
walked up the step at full speed. A re-export that breaks any of that fails
`npm run verify` rather than a playtest.

~~Palette colours were set as raw linear values in Blender~~ — **closed
2026-08-09**: the three materials now carry properly sRGB-to-linear converted
values (e.g. TimberOchre 0.408/0.282/0.157 → 0.138/0.065/0.021), so the
displayed colour matches the style-bible hex; under the Gate 3 trial beam the
timber reads warm ochre rather than pale cream (re-verified in the cycle
captures). ~~its AgX tone mapping is not what `play.html` currently renders
with~~ — **closed 2026-08-09**: `play.html` renders under `AgXToneMapping` as of
Gate 3 (`docs/step-07.md`), so the lab and the game are now the same image and a
colour judgement made in one transfers to the other. What that made visible is
the calibration itself: under the trial beam `TimberOchre` reads as a pale cream
rather than the style bible's `#684828–#783818` warm timber. The runtime beam has
been pulled as low as it can go while still reading as a stage light, so the
remaining suspicion is on the material — a `.blend` fix, not a runtime one. The
lectern collider is a single box `0.06 m` taller and slightly deeper than the
visible desk; harmless in play, visible with the lab's collider overlay on.

| chr-citizen-base | art/blender/characters/chr-citizen-base/chr-citizen-base.blend | public/assets/models/characters/chr-citizen-base.glb | authored for this project via Blender MCP; ours | 0.861 × 1.725 × 0.515 m (1.70 body, hat crown +0.025 from the head-lift fix) | 1272 tris / 1 material (CarvedWood) / 0 textures | shipping | `play.html` — the ring of citizens. `src/play/assets.js` declares it as a row of the `CHR_CITIZENS` table; `variantForSeat(seat) = table[seat mod 4]` puts it in seats 0, 4, 8. Loaded once and instanced per seat, merged to one draw call, `SOCKET_label` is the nameplate height (1.95 m) and the asset's own max Z (0.258 m) is the topple lift. A missing file degrades only the seats that would use it, to a capsule | design/reviews/chr-citizen-base/ |

| chr-citizen-stout | art/blender/characters/chr-citizen-stout/chr-citizen-stout.blend | public/assets/models/characters/chr-citizen-stout.glb | parametric variant of chr-citizen-base via Blender MCP; ours | 1.102 × 1.565 × 0.626 m | 1272 tris / 1 material / 0 textures | shipping | `play.html` — the ring of citizens. `src/play/assets.js` declares it as a row of the `CHR_CITIZENS` table; `variantForSeat(seat) = table[seat mod 4]` puts it in seats 1, 5, 9. Loaded once and instanced per seat, merged to one draw call, `SOCKET_label` is the nameplate height (1.80 m) and the asset's own max Z (0.313 m) is the topple lift. A missing file degrades only the seats that would use it, to a capsule | design/reviews/chr-citizen-stout/ |
| chr-citizen-tall | art/blender/characters/chr-citizen-tall/chr-citizen-tall.blend | public/assets/models/characters/chr-citizen-tall.glb | parametric variant of chr-citizen-base via Blender MCP; ours | 0.689 × 1.957 × 0.478 m | 1208 tris / 1 material / 0 textures | shipping | `play.html` — the ring of citizens. `src/play/assets.js` declares it as a row of the `CHR_CITIZENS` table; `variantForSeat(seat) = table[seat mod 4]` puts it in seats 2, 6. Loaded once and instanced per seat, merged to one draw call, `SOCKET_label` is the nameplate height (2.15 m) and the asset's own max Z (0.239 m) is the topple lift. A missing file degrades only the seats that would use it, to a capsule | design/reviews/chr-citizen-tall/ |
| chr-citizen-hunched | art/blender/characters/chr-citizen-hunched/chr-citizen-hunched.blend | public/assets/models/characters/chr-citizen-hunched.glb | parametric variant of chr-citizen-base via Blender MCP; ours | 0.861 × 1.481 × 0.679 m | 1240 tris / 1 material / 0 textures | shipping | `play.html` — the ring of citizens. `src/play/assets.js` declares it as a row of the `CHR_CITIZENS` table; `variantForSeat(seat) = table[seat mod 4]` puts it in seats 3, 7. Loaded once and instanced per seat, merged to one draw call, `SOCKET_label` is the nameplate height (1.62 m) and the asset's own max Z (0.499 m) is the topple lift. A missing file degrades only the seats that would use it, to a capsule | design/reviews/chr-citizen-hunched/ |


Placement is declared as one row of the `ENVIRONMENT` table in
`src/play/assets.js` from Gate 3 on. The next environment assets are one row
each — id, category, position, yaw, required nodes, sockets, and whether a
missing file falls back to the graybox or to a placeholder capsule. See
`docs/step-07.md` §5 for the contract.

The citizens are the second table, `CHR_CITIZENS`, and a fifth variant is one
row and no code: nothing in the game names any of the four ids, because
`variantForSeat` reads the length of the table. A cast member carries no
placement — it is instanced per seat rather than placed once — which is why it
is a separate table rather than an `ENVIRONMENT` row with a `place` it would
never read. See `docs/step-07.md` §5b.

Gated by `npm run test:glb`, which now sweeps all four citizen files with the
dais's file contract minus collision, plus three checks a generic sweep would
miss: the **feet** must be centred rather than the bounding box (`-hunched`
leans 0.50 m forward on purpose), the export must ship **no** `COL_` volume (the
runtime harvests none, so one would be invisible dead weight in every copy), and
`SOCKET_label` must clear the crown and sit in a 1.50–2.30 m band.

Known limits at `shipping`: the blockouts are approved as blockouts. Silhouette
separation was judged from `design/reviews/chr-citizen-*/silhouette.png` at
review distance, not in a crowd — the pipeline's "test all accepted citizens
together" gate is answered by `design/reviews/gate-3-cycle/11-the-ring-at-trial.png`
and has not had an owner eyeball. A dead citizen's nameplate stays at its
standing socket height while the body lies on the floor; that convention
predates the figures and now reads as a label hovering over nothing.


### The cast's trades (2026-08-11)

The four citizen variants stopped being proportion studies and became people.
Each carries one distinctive accessory from `citizens-sculpt-reference.png`, per
the style bible's "one distinctive accessory per citizen, readable at distance":

| variant | trade | accessory | height | materials |
| --- | --- | --- | --- | --- |
| chr-citizen-base | messenger | satchel and strap | 1.725 m | CarvedWood, Leather |
| chr-citizen-stout | baker | a loaf held at the chest | 1.565 m | CarvedWood, Crust |
| chr-citizen-tall | clockmaker | stovepipe crown, watch on a chain | 2.067 m | CarvedWood, BrassDull |
| chr-citizen-hunched | elder | shawl and cane | 1.481 m | CarvedWood, ShawlSlate |

`npm run test:glb` held the work to the contract four times over and every fix
respected the rule rather than widening it: the elder's cane became CarvedWood
because a cane is wood and never needed a material of its own; the baker's apron
was cut because the budget is body plus ONE accessory material and the loaf is
what reads at distance; the clockmaker's stovepipe was trimmed from +0.20 to
+0.11 when it pushed the figure past the 2.1 m citizen band, and its brass was
dulled to 0.85 roughness to sit inside the painted-wood band rather than being
exempted from it. One check was rescoped rather than obeyed — the feet-centring
rule now ignores `VIS_acc_*`, because the elder's cane reaches the ground 0.34 m
to one side on purpose and the rule always meant "the body stands where the seat
puts it".

## Audio

Two sounds are files and the rest are synthesised at runtime. The split is a
measurement, not a preference: `src/play/audio.js` and `docs/step-07.md` carry
the band-energy table that decided it. Nothing is hotlinked from v1 — the two
files below are copies, at their original Kenney names so this row maps one to
one onto the source pack.

| file | source / license | origin | used by | status |
| --- | --- | --- | --- | --- |
| public/assets/sfx/tap-a.ogg | **Kenney UI Pack** (<https://kenney.nl/assets/ui-pack>), **CC0 1.0 Universal**, public domain dedication — no attribution required, given anyway | copied 2026-08-09 from v1 `../secret-dictator/assets/sfx/tap-a.ogg` (see that repo's `assets/CREDITS.md`); unmodified | `play.html` — the `gavel` cue in `src/play/audio.js`, fired when a nomination is made | shipping |
| public/assets/sfx/tap-b.ogg | **Kenney UI Pack** (<https://kenney.nl/assets/ui-pack>), **CC0 1.0 Universal** | copied 2026-08-09 from v1 `../secret-dictator/assets/sfx/tap-b.ogg`; unmodified | `play.html` — the `seal` cue, layered under a synthesised low press when you submit your own ballot | shipping |

`click-a`, `click-b`, `switch-a` and `switch-b` from the same v1 folder were
**inspected and skipped**: 85–91% of their energy sits above 800 Hz, which is a
bright digital UI blip and the wrong register for a hand-carved town square.
They are not in this repo.

| generated | origin / license | used by | status |
| --- | --- | --- | --- |
| bell, tally, `tile:reform`, `tile:seize`, the ambient bed, and the fallback voices for `gavel` and `seal` | authored for this project as WebAudio graphs in `src/play/audio.js`; ours. No file, no download, deterministic (the noise comes from the project's own mulberry32, salted, so a replayed seed sounds identical) | `play.html` | shipping |

No candidate for a bell, a tally or an ambient bed exists in v1's library or in
this repo, which is why they are synthesised rather than sourced. Daylight has
**no** bed at all: there is no bird recording to use and a synthesised bird would
be filler.

Known limit: the two Kenney files were selected on spectral evidence, not by
listening. Every cue carries a synthesised voice, so swapping either back out is
one field in `CUES`.

## Code dependencies

| package | license | used for |
| --- | --- | --- |
| three | MIT | 3D rendering |
| vite | MIT | dev server / build |

## Rubble phase 1 reference drafts — unaccepted

| Files | Origin | Use | Status / review |
| --- | --- | --- | --- |
| design/references/env-ground-a/rejected/sheet-01.png through sheet-04.png | built-in imagegen, requested GPT Image 2, 2026-09-05; generated for this project; tool did not disclose model identifier | reference attempts only, never runtime textures | draft; all rejected for orthographic orientation or common-scale failures; see design/references/env-ground-a/README.md |

### Phase 1 ground, sky and painted backdrop

| Asset / files | Origin | Bounds / triangles / materials / textures | Status | Review |
| --- | --- | --- | --- | --- |
| env-ground-a replacement; art/blender/environment/env-ground-a/env-ground-a.blend; public/assets/models/environment/env-ground-a.glb | authored for this project via Blender MCP; ours; cobble albedo generated through built-in imagegen | 27.8 × 0.5 × 27.8 m including unchanged collider; visual top -0.001 m; 28 triangles (16 visible, 12 collision); MAT_Plaster mineral-masonry role; one embedded 1024 atlas | review; replaces the retired ground row; phase-1 review packet below | design/reviews/env-ground-a/; design/reviews/rubble-phase-1/ |
| public/assets/textures/rubble/TEX_Plaster_Cobble.png | generated for this project, uniformly reduced from 1254-square to 1024-square in Blender; no seam repair or projection rectification | one shared mineral-masonry albedo role, sRGB; source and production atlas both profiled | review; packed into the ground source and embedded GLB | design/reviews/rubble-phase-1/cobble-atlas-profile.json |
| design/references/env-ground-a/cobble-source.png, hero.png, material-id.png | built-in imagegen, requested GPT Image 2; prompts adjacent; model identifier not returned | reference only | accepted as ground texture direction, game-height hero and one-role material assignment; not geometric dimensions for other assets | design/references/env-ground-a/ |
| env-backdrop-a; art/blender/environment/env-backdrop-a/env-backdrop-a.blend; public/assets/models/environment/env-backdrop-a.glb | authored for this project via Blender MCP; ours; generated painted albedo | 80 × 26 × 80 m; base 0 m, tip 26 m; 163 triangles, sixteen flats in radius-26/40 m octagons; one MAT_TimberSoot / one embedded 1024 PNG | review; scenery, no collider or sockets; required sixteen VIS nodes; fallback omit; double-sided paper-flat exception retained | design/reviews/env-backdrop-a/; design/reviews/rubble-phase-1/ |
| public/assets/textures/rubble/TEX_TimberSoot_Backdrop.png | generated for this project; uniformly reduced from 1254-square to 1024-square in Blender | shared timber-and-soot role; pale paint with authored blue albedo multiplier receives runtime state tint; no auxiliary maps | review; packed source and embedded GLB | design/reviews/rubble-phase-1/backdrop-atlas-profile.json |
| env-sky-dusk; art/blender/environment/env-sky-dusk/env-sky-dusk.blend; public/assets/textures/rubble/TEX_Emissive_DuskPanorama.png | generated for this project through built-in imagegen; image library authored via Blender MCP; ours | 4096 × 1024 sRGB PNG; no added geometry/material draw; existing sky dome samples panorama luminance under its three state gradients | review; assets.js SKY_PANORAMA declares empty nodes/sockets and gradient fallback; special panorama dimensions from brief, not a 1024 role atlas | design/reviews/rubble-phase-1/sky-runtime-profile.json |
| design/references/env-sky-dusk/panorama-source.png, hero.png, material-id.png | built-in imagegen, requested GPT Image 2; exact prompts adjacent; actual model identifier not returned | reference/source; original panorama 1774 × 887 resampled in Blender to the required production dimensions; no generated sheet | review; quiet sky direction, one-role ID; sky colour remains controlled by existing state gradients | design/reviews/rubble-phase-1/sky-source-profile.json |
| design/references/env-backdrop-a/sheet.png, hero.png, material-id.png, atlas-source.png | built-in imagegen, requested GPT Image 2; prompts adjacent; actual model identifier not returned | unmodified sheet 1536 × 1024, three equal 512 px panels, 5 px/m; generated from authored layout/outline inputs; hero at 1.7 m | review; layout measured, motif counts checked on GLB; visible hero features reviewed in phase-1 packet | design/reviews/rubble-phase-1/backdrop-sheet-measurements.json |
| design/references/env-backdrop-a/layout-template.svg and .png; outline-template.svg and .png; raised-outline-template.svg and .png | authored exact dimension guides; browser-rendered PNG input to imagegen; ours | reference templates only; no generated sheet pixels altered | retained provenance | scripts/capture-rubble-template.mjs |
| design/references/env-backdrop-a/rejected/sheet-01.png through sheet-06.png; raised-hero.png; raised-material-id.png; atlas-01.png and atlas-02.png | built-in imagegen; prompts adjacent; generated for this project | rejected direction attempts, never runtime art | retired; layout or period-drift failures listed in STATUS.md | design/references/env-backdrop-a/STATUS.md |

### Phase 2 first facade — production started

| Asset / files | Origin | Contract / budget | Status | Review |
| --- | --- | --- | --- | --- |
| env-facade-a replacement; art/blender/environment/env-facade-a/env-facade-a.blend; public/assets/models/environment/env-facade-a.glb | authored for this project via isolated Blender MCP; ours | 4.5 × 7.8 × 1.5 m visual envelope; 2548 triangles (2536 visible + 12 collision); three materials MAT_Plaster / MAT_Brick / MAT_TimberSoot; three embedded 1024 albedos | owner approved at ae6a31a; verify and GLB gates green; one-pixel pair delta retained below the recorded 0.001 pp resolution; three current placements (original approval measured all seven); 0.00 pp positive trial-warm allowance; unchanged COL_wall and SOCKET_lamp | design/reviews/rubble-phase-2/env-facade-a/; design/reviews/env-facade-a/ |
| design/references/env-facade-a/sheet.png, hero.png, material-id.png, plaster-source.png, plaster-ochre-source.png, brick-source.png and rejected/ | built-in imagegen, requested GPT Image 2; exact prompts adjacent; tool did not return a model identifier | native 1536 × 1024 sheet at 80 px/m, no image relayout; hero at 1.7 m; three-role ID; native texture sources 1254 square; failed originals retained with STATUS | reference/source; sheet scale and both texture profiles measured | design/reviews/rubble-phase-2/env-facade-a/ |
| public/assets/textures/rubble/TEX_Plaster_Facade.png; public/assets/textures/rubble/TEX_Brick.png | generated albedos uniformly reduced to 1024 in Blender; ours | two role atlases shared by later facade/rubble assets; timber atlas reused unchanged from phase 1; no auxiliary maps | shipping in phase 2; packed source and embedded GLB | design/reviews/rubble-phase-2/env-facade-a/plaster-ochre-atlas-profile.json; brick-atlas-profile.json |
| design/references/env-facade-a/layout-template.svg and .png | authored dimension guide, browser-rendered input to imagegen; ours | three equal 512 px panels, shared baseline, 80 px/m | retained provenance | scripts/capture-facade-template.mjs |

| env-facade-b; art/blender/environment/env-facade-b/env-facade-b.blend; public/assets/models/environment/env-facade-b.glb | authored via isolated Blender MCP from generated native sheet, hero and material-ID; ours | 4.5 × 6.4 × 1.5 m; 1602 triangles (1590 visible +12 collider); three roles, three shared embedded1024 albedos; unchanged COL_wall and SOCKET_lamp | GLB gated, six fixed captures and runtime budget passed; owner measurements approved; Codex visually accepted; 0.00 pp allowance, 0.001 pp resolution, two placements | design/reviews/env-facade-b/; design/reviews/rubble-phase-2/env-facade-b/ |
| env-facade-c; art/blender/environment/env-facade-c/env-facade-c.blend; public/assets/models/environment/env-facade-c.glb | authored via isolated Blender MCP from native generated sheet, hero and material-ID; ours | 4.5 × 7.2 × 1.5 m; 2440 triangles (2428 visible + 12 collider); three roles, three shared embedded 1024 albedos; unchanged COL_wall and SOCKET_lamp | GLB gated, six fixed captures and runtime budget passed; owner measurements approved; Codex visually accepted; 0.00 pp allowance, 0.001 pp resolution, two placements | design/reviews/env-facade-c/; design/reviews/rubble-phase-2/env-facade-c/ |
| design/references/env-facade-b/ and design/references/env-facade-c/ | built-in image generation requested as GPT Image 2; model ID unreported; exact prompts and rejected originals retained | native 1536 × 1024 sheets at 80 px/m; heroes at 1.7 m; three-role ID passes; no sheet transformation | sheet measurements passed; visual comparison recorded | design/reviews/rubble-phase-2/facades/ |
| env-rubble-small; art/blender/environment/env-rubble-small/env-rubble-small.blend; public/assets/models/environment/env-rubble-small.glb | authored via isolated Blender MCP from generated native sheet, hero and material-ID; ours | 0.675 × 0.620 × 0.675 m; 312 triangles (300 visible + 12 unchanged COL_crate); three shared 1024 albedos / three roles; no sockets | GLB gate and six fixed captures complete; runtime budget passed; Codex visually accepted; 0.00 pp starting allowance, 0.001 pp resolution; one original crate placement | design/reviews/env-rubble-small/; design/reviews/rubble-phase-2/env-rubble-small/ |
| env-rubble-large; art/blender/environment/env-rubble-large/env-rubble-large.blend; public/assets/models/environment/env-rubble-large.glb | authored via isolated Blender MCP from native generated sheet, hero and material-ID; ours | 1.100 × 0.890 × 1.000 m; 604 triangles (576 visible + 28 unchanged COL_barrel); three shared 1024 albedos / three roles; no sockets | GLB gated and six fixed captures complete; runtime budget passed; Codex visually accepted with quieter-wear limitation; 0.00 pp starting allowance, 0.001 pp resolution; four original barrel placements | design/reviews/env-rubble-large/; design/reviews/rubble-phase-2/env-rubble-large/ |
| env-brick-stack; art/blender/environment/env-brick-stack/env-brick-stack.blend; public/assets/models/environment/env-brick-stack.glb | authored via isolated Blender MCP from native generated sheet, hero and material-ID; ours | 0.675 × 0.620 × 0.675 m; 1420 triangles (1408 visible + 12 unchanged COL_crate); one shared 1024 brick albedo; no sockets | GLB gated and six fixed captures complete; runtime budget passed; Codex visually accepted with quieter-wear limitation; 0.00 pp allowance, 0.001 pp resolution; two original crate placements | design/reviews/env-brick-stack/; design/reviews/rubble-phase-2/env-brick-stack/ |
| env-rubble-cart; art/blender/environment/env-rubble-cart/env-rubble-cart.blend; public/assets/models/environment/env-rubble-cart.glb | authored via isolated Blender MCP from native generated references; ours | 0.800 × 0.820 × 1.200 m including track; 1496 triangles (1484 visible + 12 unchanged COL_crate); three shared 1024 role albedos; no sockets | GLB gated and six fixed captures complete; runtime budget passed; Codex visually accepted; 0.00 pp allowance, 0.001 pp resolution; one original crate placement | design/reviews/env-rubble-cart/; design/reviews/rubble-phase-2/env-rubble-cart/ |
| public/assets/textures/rubble/TEX_Metal.png; design/references/env-rubble-cart/metal-atlas-source.png | built-in image generation, requested GPT Image 2; model ID unreported; uniform Blender reduction from native 1254 square to 1024 | one shared iron role, four UV paint regions; albedo only, no auxiliary maps | packed and embedded in cart; intended for pump reuse | design/reviews/rubble-phase-2/env-rubble-cart/metal-atlas.json |
| env-well-a pump replacement; art/blender/environment/env-well-a/env-well-a.blend; public/assets/models/environment/env-well-a.glb | authored via isolated Blender MCP from native generated sheet, hero and material-ID; ours | original 1.649999976 × 2.540838957 × 1.717641711 m envelope; 1592 triangles (1564 visible + 28 unchanged COL_well); two shared 1024 albedos; no sockets | GLB gated and six fixed captures complete; runtime budget passed; Codex visually accepted; 0.00 pp allowance, 0.001 pp resolution; original well position and yaw | design/reviews/env-well-a/; design/reviews/rubble-phase-2/env-well-a/ |
