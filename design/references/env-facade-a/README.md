# First facade reference packet

Budget was recorded in BUDGET.md before generation at 73a154c: seven placements,
0.00 pp positive trial-warm allowance in both HUD and scene-only measurements.

Production order: authored layout template → sheet attempts 1–3 → hero →
material-ID → Blender blockout → plaster/brick atlas generation and profiling →
painted export → GLB gate → six lab captures → surface refinement → gate and
captures again → runtime/contract/budget review. The saved source is the refined
candidate. The per-phase commit remains pending until phase 2 is complete.

All raster references were generated through built-in imagegen, requested as
GPT Image 2. Exact prompts are adjacent. The tool did not return a model
identifier; no stronger model-version claim is made. Originals were copied
without alteration. Rejected files remain under rejected/ with STATUS.md.

Accepted sheet.png is native 1536 × 1024. Three equal 512 px panels at 80 px/m;
front/side share the baseline. scripts/measure-facade-sheet.py measures the
native blue-dark outlines: maximum edge error 2 px, including antialiasing and
the generated door's bottom edge. No generated sheet was rescaled or rearranged.
The authored layout-template.svg/.png is an input, not a repaired output.

The sheet and material-ID show six windows in two columns of three, each with
one vertical mullion and two unlit panes; one five-board door and three-piece
frame; six brick patches; one blank notice; one gabled shell and two roof slopes.
Counts were visually checked. The Blender construction report records those
counts; they are not inferred from a triangle total. The hero's street curb is
context, not an added base or a changed collider.

Material assignment: plaster shell/notice, brick exposures, timber-and-soot
roof/joinery/panes. New TEX_Plaster_Facade and TEX_Brick atlases are 1024 square,
reduced uniformly in Blender from accepted 1254-square sources. They are shared
resources for later facade/rubble work. TEX_TimberSoot_Backdrop is reused
unchanged, with vertex tints. There are three roles in this asset; the approved
ground keeps its separate cobble atlas within the mineral/plaster role. No
normal, roughness, metallic or separate AO maps. All painted role images are
packed in the source and embedded in the GLB.

Rebuild in the isolated Blender MCP instance with this source open, in order:
scripts/blender/rubble-facade.py, paint-rubble-facade.py,
refine-rubble-facade.py. The latter two refine a fresh preceding stage and must
not be repeatedly applied to an already-refined scene. The blockout script
preserves the existing COL_wall and SOCKET_lamp directly; no transform_apply.
scripts/blender/audit-rubble-facade.py is read-only.

Review packet: design/reviews/rubble-phase-2/env-facade-a/README.md and index.html.
The six fixed captures remain under design/reviews/env-facade-a/.

Ochre correction after owner review: plaster-source.png is the retained cold source from the first candidate, now rejected for hue. The current production plaster comes from plaster-ochre-source.png (attempt 06; prompt-6). Five failed ochre originals and all prompts are retained. Run scripts/blender/ochre-rubble-facade.py after the three original build stages to reproduce the current source/export. This last stage is repeatable and preserves geometry, transforms, UVs, tints and the other two embedded images. The blank notice keeps its existing single-texel UV and therefore now samples ochre pigment. Current profile files are plaster-ochre-source-profile.json and plaster-ochre-atlas-profile.json; the older plaster profiles describe the retained cold material.
