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

No production asset has passed the pipeline yet.

## Code dependencies

| package | license | used for |
| --- | --- | --- |
| three | MIT | 3D rendering |
| vite | MIT | dev server / build |
