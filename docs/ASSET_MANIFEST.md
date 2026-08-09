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

Known limits at `shipping`: palette colours were set as raw linear values in
Blender, so in-engine colour has still not been calibrated against scene
lighting. ~~its AgX tone mapping is not what `play.html` currently renders
with~~ — **closed 2026-08-09**: `play.html` renders under `AgXToneMapping` as of
Gate 3 (`docs/step-07.md`), so the lab and the game are now the same image and a
colour judgement made in one transfers to the other. What that made visible is
the calibration itself: under the trial beam `TimberOchre` reads as a pale cream
rather than the style bible's `#684828–#783818` warm timber. The runtime beam has
been pulled as low as it can go while still reading as a stage light, so the
remaining suspicion is on the material — a `.blend` fix, not a runtime one. The
lectern collider is a single box `0.06 m` taller and slightly deeper than the
visible desk; harmless in play, visible with the lab's collider overlay on.

Placement is declared as one row of the `ENVIRONMENT` table in
`src/play/assets.js` from Gate 3 on. The next environment assets are one row
each — id, category, position, yaw, required nodes, sockets, and whether a
missing file falls back to the graybox or to a placeholder capsule. See
`docs/step-07.md` §5 for the contract.

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
