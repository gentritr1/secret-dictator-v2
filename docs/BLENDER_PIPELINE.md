# Blender and MCP production pipeline

This is the working contract for turning the direction in
[`STYLE_BIBLE.md`](./STYLE_BIBLE.md) into reproducible Blender source files and
small, testable glTF assets for the three.js square.

The governing rule is **one asset, one question, one acceptance gate**. Do not
ask Blender MCP to build the town, the cast, and the lighting in one pass. A
finished asset is one that fits the game, survives the browser review, and can
be revised later—not merely one that exported successfully.

## Current verdict — 2026-08-09

The project is ready for a deliberate art pass, but not for bulk asset
production.

What is already solid:

- The complete rules path is human-playable and deterministic.
- Hidden information reaches the presentation only through the player-safe
  view model.
- Movement, camera collision, interaction targeting, and the decision contract
  have strong automated gates.
- The style direction is unusually specific: stylized-game construction,
  toy-theater staging, carved woodcut-like citizens, and warm light as scarce
  information.
- The square already has real metre measurements and stable gameplay anchors.
- Blender 5.2 to GLB 2.0 to three.js has been proven once.

What the proof does **not** establish:

- `design/pipeline-test/podium-test.glb` has no tracked `.blend` source, asset
  root, collider, sockets, or runtime loader.
- Its approximate `2.77 x 0.42 x 3.20 m` bounds match neither the existing dais
  nor the lectern, so it is a transport test, not production art.
- It contains default mesh datablock names and exports opaque materials as
  double-sided. Both should fail a production review.
- The shipped square is still procedural graybox geometry with generic
  lighting. No production GLB is used by `src/` yet.
- The playable is currently a desktop instrument. At `390 x 844`, the fixed
  `330 px` HUD leaves only `60 px` of unobscured scene, controls overflow, and
  there is no touch movement/use path. Do not describe it as mobile-supported.
- A first-time player is not persistently told to visit the bell or podium, and
  decision panels still need proper dialog/focus semantics before visual polish
  can make the experience feel finished.

The next useful proof is therefore not “make more models.” It is “replace one
gameplay anchor through the complete source → export → validation → runtime
loop.” Use the dais and lectern pair first.

## Authority and ownership

When instructions disagree, use this order:

1. The current, explicitly approved asset task.
2. [`STYLE_BIBLE.md`](./STYLE_BIBLE.md).
3. The hero references in `design/concepts/`.
4. This pipeline.
5. The current graybox proportions.

Gameplay measurements remain authoritative until a gameplay task deliberately
changes them. Blender is not allowed to make a passage narrower, a step higher,
or an interaction unreachable just because the composition looks better.

Only one Blender MCP process owns a `.blend` file at a time. Other work may
continue in other files, but two processes must never save the same source
scene. Preserve unrelated objects and collections; do not perform broad scene
cleanup unless the task explicitly owns it.

## Repository paths

Use these paths when the first production asset is created:

```text
art/blender/<category>/<asset-id>/<asset-id>.blend   editable source of truth
public/assets/models/<category>/<asset-id>.glb       runtime export
design/reviews/<asset-id>/                           fixed review captures
docs/ASSET_MANIFEST.md                               provenance and status
```

Examples:

```text
art/blender/environment/env-dais-a/env-dais-a.blend
public/assets/models/environment/env-dais-a.glb
design/reviews/env-dais-a/night-game-camera.png
```

Keep the `.blend` source. If source files eventually require Git LFS, adopt it
as a deliberate repository change; do not solve size pressure by keeping the
only editable copy outside the project.

## World contract

### Units, axes, and calibration

- Blender units: **Metric**, unit scale `1.0`; one Blender unit is one metre.
- Author in Blender's Z-up space. Export with glTF **Y Up** enabled; three.js is
  Y-up at runtime.
- Runtime ground axes are `+X` east and `+Z` north.
- The runtime convention treats a model's `+Z` as its front.
- The Blender authoring front is `-Y` — **locked 2026-08-09 by the
  front-marker test**: `design/pipeline-test/front-marker.glb` places a Nose
  cube at Blender `(0, -1, 0.25)` and a Tail at `(0, +1, 0.25)`; loaded through
  GLTFLoader they arrive at three.js `(0, 0.25, +1)` and `(0, 0.25, -1)`, so
  Blender `-Y` is runtime `+Z` (front) and Blender `+Z` is runtime `+Y` (up).
- Every working scene includes a non-exported `1.70 m` tall, `0.70 m` wide
  calibration capsule.
- Apply rotation and scale before export. Shipping nodes use positive scale,
  ideally `(1, 1, 1)`; do not export negative mirror transforms.

Do not repair a bad scale or orientation with an undocumented transform in
three.js. Fix the source or document an intentional placement transform next to
the loader.

### Existing gameplay measurements

These values come from the playable square and controller:

| Item | Contract |
| --- | --- |
| Walkable boundary | approximately `-13…+13 m` on X and Z |
| Dais | centre `(0, 9)`, `6.0 x 3.4 m`, top at `0.22 m` |
| Lectern | `1.2 x 1.05 x 0.55 m`, centred near `(0, 8.1)` |
| Citizen ring | radius `6.0 m` |
| Bell | `(5.5, 5.5)` |
| Bench | `(-9, 0)` |
| Player spawn | `(0, 0, 2)` |
| Player body | `1.70 m` tall, `0.35 m` radius |
| Comfortable main passage | at least `1.2 m` wide |
| Normal walkable ledge | no higher than `0.22 m` |
| Intentional blocker | higher than the `0.25 m` step limit |
| Walkable slope | no steeper than `30°` |

### Origins and pivots

- Every GLB has one named asset root at `(0, 0, 0)`.
- Freestanding props use a bottom-centre pivot on the ground plane.
- Citizens use foot centre for the root and armature, with feet on `Z=0` in
  Blender.
- Façade modules use the lower-left-front grid corner, with width on Blender
  `+X` and the façade facing `-Y`.
- A whole-square scene uses the three.js square origin.
- A local environment cluster, such as the dais and lectern, uses a clearly
  stated placement anchor. Its task packet must include the runtime position.
- Hinged objects place the pivot on the hinge. Handled props place it at the
  intended grip or interaction pivot.

## File, object, and collection naming

Use lowercase kebab-case for files:

```text
env-dais-a.blend
env-dais-a.glb
prop-lantern-a.blend
chr-blacksmith-a.blend
```

Use semantic names inside Blender and the GLB:

```text
ENV_Dais_A                 one asset root
VIS_Dais_Base              rendered mesh
COL_Dais                   collision mesh
SOCKET_PodiumInteract      interaction anchor
SOCKET_Label               character label anchor
SOCKET_LanternLight        runtime light position
MAT_Timber_Ochre           material
TEX_Dais_BaseColor         texture
RIG_Citizen                armature
```

Rename both the Blender object and its mesh datablock. A production validator
must reject `.001`, `Cube`, `Cylinder`, and other accidental defaults.

Each source file uses this small collection structure:

```text
00_GUIDES       scale capsule, ruler, and gameplay anchors; never exported
10_RENDER       shipping VIS_* meshes and asset root
20_COLLISION    simple COL_* meshes
30_SOCKETS      named SOCKET_* empties
90_REVIEW       review cameras and temporary lights; never exported
```

Add `SOURCE_HIGH` only when a real sculpt or bake workflow needs it. Do not add
folders or naming layers pre-emptively.

## Runtime data in a GLB

Keep runtime metadata small and explicit:

- `VIS_*` nodes are rendered.
- `COL_*` nodes are hidden and converted to collision geometry.
- `SOCKET_*` empties expose positions and orientations for interaction, labels,
  lights, cameras, or effects.
- Stable semantic animation clip names are part of the runtime API.

Custom properties may be exported as glTF `extras` only when code consumes
them. Start with none. If a proven need appears, prefer a minimal root
`sd_asset_id` and node `sd_role` over a general data system.

Never put role truth, secret state, random choices, rules, or timing in an art
asset. Lighting, sound, animation, and materials must respond to the safe view
or a deliberately public presentation event—not the omniscient driver log.

## Geometry and collision

The style is carried by silhouette, chunky planes, intentional bevels, and
painted value grouping. It is not carried by high polygon count.

- Review the exported triangle and vertex counts. glTF triangulates quads and
  n-gons, and UV seams or hard edges may split vertices.
- Apply or explicitly export required modifiers.
- Use bevels large enough to read at the real game camera; remove bevel loops
  that disappear at that distance.
- Keep visible art and its collision in the same source and GLB so one asset
  declaration continues to build what the player sees and what they hit.
- Collision meshes are simple, closed volumes with positive scale, outward
  normals, and no bevels, textures, tiny cobble relief, or decorative holes.
- Walkable triangles face upward. Do not use a detailed visual mesh as the
  controller collider.
- Decorative citizens remain non-colliding until gameplay deliberately changes
  that rule. Their placement must not visually promise a blocked route the
  player can walk through.

The environment loader should eventually:

1. Find and hide every `COL_*` node.
2. Clone its geometry and apply the node's `matrixWorld`.
3. Remove visual-only attributes and merge the pieces.
4. Send the result to `createBvhWorld`.
5. Resolve required `SOCKET_*` nodes by exact name.
6. Refuse the production asset and keep the graybox fallback if a required node
   is missing.

The asset cache—not each visual clone—owns shared geometry, textures, and
materials. A cast member may clone a scene and own its animation mixer, but it
must not dispose cached GPU resources or recolour a material shared by every
citizen. Keep gameplay rings, badges, labels, and state overlays separate from
the imported visual so they can change without duplicating the model.

After every environment export, recheck the `0.22 m` dais step, `1.2 m`
passages, camera pull-in, spawn, bell, bench, and interaction reachability.

## Materials, texture, and ambience

The locked sentence is: **a handcrafted small-town stage at dusk, where warm
lantern light is attention and cold blue dark is suspicion.**

### Material rules

- Use glTF-compatible Principled BSDF materials. Bake Blender-only procedural
  networks before export.
- Opaque and single-sided is the default.
- Painted wood, stone, and plaster: metallic `0`, roughness roughly
  `0.8–0.95`; avoid clearcoat, transmission, and polished PBR gloss.
- Prefer hand-painted base colour and readable geometry before normal maps.
- Base-colour textures are sRGB. Normal, roughness, metallic, and AO inputs are
  non-colour data.
- Use masked transparency only when its silhouette value justifies the cost.
- A small prop normally has one material. A citizen normally has at most two.
  A lantern may use one body material and one emissive material.

### Palette and light meaning

- Lantern: `#f8d868`; hottest highlight: `#f8e888`.
- Timber ochre: `#684828–#783818`; timber shadow: `#583828`.
- Slate stone: `#384848`.
- Night ambient: `#181828` / `#182828`; lifted dark: `#282838`.
- Never use pure black for the environment.
- Warm light is information, not decoration. At night it should occupy less
  than about `5%` of the frame when possible and never more than `10%`.
- Do not paint amber illumination into albedo. Export a separate emissive
  surface and `SOCKET_LanternLight` so the game can control the light by phase.
- Use one dominant light story. More fill is not automatically more legible.

Use AgX in Blender review scenes and use three.js `AgXToneMapping` in the future
asset lab before approving final material values. The fixed browser capture is
the final truth; a Blender render is a work preview.

### Starting texture limits

| Asset | Starting limit |
| --- | --- |
| Small prop | `256–512 px` |
| Hero prop, citizen, or façade atlas | `1024 px` |
| Shared environment atlas | `2048 px` only after an in-game need is shown |

Use PNG for alpha, masks, or lossless painted details. JPEG is acceptable for a
large opaque backdrop after a visual comparison. Do not introduce KTX2, Draco,
or Meshopt into the first production export. Add compression only with its
runtime decoder, a measured size benefit, and a regression check.

## Character silhouette gate

A citizen is not accepted because the sculpt looks good close up.

- Require one dominant body mass and one unmistakable accessory.
- Test front, side, and three-quarter views.
- Render it as a black silhouette with name labels hidden.
- Review with the real 60° game camera from `20 m`, or at approximately `80 px`
  tall.
- Test all accepted citizens together. Each must remain identifiable without
  colour.
- Make thin accessories thick enough to survive at game distance; do not depend
  on fingers, facial microdetail, or noisy cloth folds.
- Export `SOCKET_Label` above the actual head instead of relying on the current
  fixed capsule label height.

The first reusable citizen needs only these clips:

```text
Idle
Walk
Vote_Aye
Vote_Nay
```

Add `Accuse`, `Sit`, `Stand`, or `Topple` only when a polished game beat uses
them. Loop clips must start and end cleanly, and every exported action must have
a stable semantic name.

## Provisional performance envelope

These are review rails for the first vertical slice, not targets to fill. Revise
them from browser measurements after the first integrated assets.

| Item | Target | Mandatory review |
| --- | ---: | ---: |
| Visible scene | `<250k` triangles | `350k` triangles |
| Draw calls | `<100` | `150` |
| Shadow-casting geometry | `<120k` triangles | — |
| Estimated resident textures | `<128 MiB` | — |
| Initial model and texture download | `<15 MB` | — |
| Ordinary prop | about `1k` triangles | `3k` |
| Dais and lectern hero cluster | about `5k` | `8k` |
| Citizen LOD0 | about `8k` | `12k` |
| Façade module | about `5k` | `8k` |

Only the stage key, citizens, and large architecture should normally cast
shadows. Lantern point lights should normally be unshadowed.

Do not create LOD variants because a table mentions them. Profile first. If the
citizens prove expensive, try approximately `5k` triangles beyond `8 m` and
`1k` beyond `18 m`, preserving body mass and signature accessory before surface
detail. Distant buildings should become painted backdrop flats before they
become elaborate LOD systems.

## GLB export recipe

For the first production assets:

- Format: binary glTF `.glb`.
- Export only the asset root and its render, collision, and socket children.
- Apply modifiers on export.
- Export normals and UVs.
- Export tangents only when a normal map needs them.
- Embed textures.
- Exclude guide/review cameras, lights, rulers, and calibration meshes.
- Keep opaque materials single-sided.
- Use Y Up.
- Export animation actions only when the asset owns approved clips.
- Export custom properties only when runtime code already consumes them.
- Do not use Draco for the first pass.

The official Blender exporter reference is the source of truth for the
available settings: [Blender glTF 2.0 manual](https://docs.blender.org/manual/en/3.3/addons/import_export/scene_gltf2.html).

## The MCP loop

Every Blender MCP task follows the same bounded loop:

1. **Inspect.** Open the exact source file, list relevant collections, objects,
   dimensions, transforms, materials, and missing inputs. Change nothing.
2. **Restate.** Report the asset goal, owned files, measurements, budget, and
   acceptance gate in a few lines.
3. **Block out.** Build only scale, silhouette, pivot, collider, and sockets.
4. **Review.** Save and return front, side, three-quarter, game-distance,
   silhouette, scale, and collision-overlay captures.
5. **Polish.** Add only the approved geometry and material treatment.
6. **Validate.** Run the Blender and GLB checks below; report exact counts and
   paths.
7. **Export.** Save the `.blend` before writing the `.glb`.
8. **Integrate.** Load behind a graybox fallback and verify it in the browser.
9. **Record.** Add or update the asset manifest row and review images.

An unexpected scene state is a reason to inspect, not a reason to issue more
commands.

### Blender-side gate

Fail the task on:

- wrong unit settings or dimensions;
- a missing asset root, required collider, or socket;
- unapplied or negative scale;
- default or `.001` names on objects, mesh datablocks, materials, or actions;
- accidental hidden objects in the export;
- missing image paths or oversized textures;
- unsupported material nodes or excess material slots;
- triangle budget overrun without approval;
- non-manifold collision, zero-area faces, inward normals, or geometry below the
  intended ground plane.

### GLB report

Report:

- exporter/generator, glTF version, and file size;
- world bounds and ground contact;
- node, primitive, triangle, material, texture, and animation counts;
- required `COL_*` and `SOCKET_*` nodes;
- unexpected cameras or lights;
- opaque materials marked `doubleSided`;
- embedded and missing images.

### Runtime gate

Accept only when:

- `GLTFLoader` imports with no console warning;
- size and orientation are correct beside the `1.70 m` capsule;
- visible and collider overlays align;
- walking, stepping, sliding, and camera collision still behave;
- every interaction socket is reachable;
- fixed day, dusk, and night captures match the style rules;
- render statistics fit the current envelope; and
- `npm run verify` passes.

The loader reference is [three.js GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader).

## Fixed acceptance captures

Store captures under `design/reviews/<asset-id>/` at `1440 x 900`.

For every asset:

- front;
- three-quarter;
- side;
- game camera at real distance;
- black silhouette;
- scale beside capsule/ruler;
- collider overlay.

For a square pass, use the identical locked camera for day, dusk, night trial,
and a top-down collision/navigation view. Also test the playable UI separately
at a narrow viewport; asset approval must not hide an already unusable HUD.

## Calculated production sequence

### Gate 1 — lock player readability and pacing

Play a complete keyboard match at `5`, `7`, and `10` citizens. Record match
length, missed prompts, camera discomfort, unnecessary walking, and every time
the morning bell feels repetitive. Exercise the Emergency Vote screen. Decide
whether the morning acknowledgement remains physical, auto-advances, or is
reserved for important reports.

Before new art, add a persistent one-line objective, accessible dialog/focus
behaviour, contrast fixes, and camera framing that accounts for the left HUD.
State the current keyboard-and-mouse desktop support boundary explicitly;
responsive/touch controls are a later product milestone, not partial support to
smuggle into this pass.

**Exit:** a first-time desktop player reaches every required object without
verbal coaching, there is one written pacing decision, and no interaction is
required solely to justify an asset.

### Gate 2 — prove one production asset

Build a tiny `asset-lab.html` with the real capsule/ruler, fixed cameras,
day/dusk/night/silhouette modes, collider overlay, and three.js render stats.
Then remake only the dais and lectern through this pipeline. Load it through a
small dedicated module with the procedural graybox as fallback.

**Exit:** tracked `.blend`, validated GLB, collider and podium socket from that
GLB, fixed captures, manifest row, clean console, and green verification.

### Gate 3 — polish one government cycle

Polish only `morning → nomination → vote → result → enacted tile`. Add one
lantern, one cobble/ground treatment, one modular façade, one citizen base with
a few silhouette variations, one view-driven lighting director, and minimal
sound.

**Exit:** the cycle reads without debug explanation, secret information stays
inside the safe view, frame time is stable, and a hands-on pass approves it.

### Gate 4 — expand only proven patterns

Build the rest of the small town kit in this order:

1. bell and bench;
2. one `4 m` half-timber façade bay, corner, gable/roof cap, door, and window;
3. two or three painted rooftop silhouette flats;
4. one distinctive final citizen;
5. only then façade variants, remaining citizens, well, tree, barrels, crates,
   and dressing.

Do not model the full town or full cast in one task. Duplicate simple modules
until a real repeated pattern earns an abstraction.

## Copyable Blender MCP task packet

Use this at the start of every asset task:

```text
Task ID:
Asset ID:
Stage: blockout | silhouette | material | integration | final

Modify only:
Source .blend:
Export .glb:
Review folder:
Do not touch:

References:
- Primary:
- Secondary:
- Anti-goals:

World fit:
- Units: metres, unit scale 1.0
- Required dimensions:
- Runtime position, if placed environment:
- Pivot:
- Blender front: -Y (locked — see World contract, front-marker test)
- Ground plane: Z=0

Required hierarchy:
- Root:
- VIS_*:
- COL_*:
- SOCKET_*:
- Materials:

Visual goal:
- Dominant silhouette:
- Distinctive feature:
- Palette role:
- Finish:
- Lighting remains runtime-controlled:

Budgets:
- Triangle target / review limit:
- Material limit:
- Texture limit:

Collision:
- Walkable faces:
- Intentional blockers:
- Required clearances:

Deliverables:
- Saved .blend
- Exported .glb
- Blender and GLB validation report
- Front / side / three-quarter / game-distance / silhouette / collision captures
- Proposed manifest row

Acceptance:
- Exact measurements
- Style-reference comparison
- Runtime scale and orientation
- Collision alignment
- Socket reachability
- No validation failures

Stop conditions:
- Existing object count or names differ from this packet
- A required reference or source file is missing
- An operation creates unexpected duplicate objects
- A change conflicts with gameplay measurements
- The requested operation would touch an unowned file or collection
```

The MCP task should inspect and report first, block out second, save, return
review captures, and wait for approval before the material/final pass. This is
the main protection against a fast sequence of plausible but compounding
mistakes.
