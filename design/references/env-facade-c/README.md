# Boarded shopfront references

Created for this project. Built-in image generation was requested as GPT Image 2; the tool did not return a model identifier, so that identifier is unverified. Every prompt is retained beside its output. Native image sizes: {"hero.png": [1024, 1536], "material-id.png": [1536, 1024], "layout-template.png": [1536, 1024], "sheet.png": [1536, 1024]}.

Order executed: budget and exact PARTS contract; authored layout-template.svg rendered with scripts/capture-facade-template.mjs; generated sheet; generated hero at 1.7 m camera height; generated material-ID pass; Blender construction and export; GLB gate; six fixed lab captures; manifest entry; runtime integration and measurements.

The accepted sheet has three equal 512-pixel panels at 80 pixels per metre. scripts/measure-facade-variant-sheet.py compares its native blue-dark boundary against the authored template including stroke width. Maximum front/side/top errors: 2, 2, 1 pixels, tolerance 2. No generated sheet was rescaled, rearranged or repaired. Failed originals and reasons remain under rejected/STATUS.md. This boundary check establishes overall scale, not the accuracy of every internal stroke; part counts were separately inspected and recorded in PARTS.md and build.json.

The three material-ID colours map plaster, brick and timber/soot. Production uses the exact approved A plaster, brick and timber albedos, each 1024, packed in the source and embedded in the GLB. scripts/audit-facade-shared-atlases.py proves the three embedded images are byte-identical across A/B/C. No new material role or auxiliary map was introduced.

scripts/blender/open-rubble-facade-c.py opens an owned copy of the approved A source. scripts/blender/rubble-facade-c.py constructs the model through Blender MCP with baked mesh coordinates and preserved COL_wall/SOCKET_lamp. scripts/blender/export-rubble-facade-variant.py validates collections and exports only the six production nodes. Source audit, build transcript, fixed captures and runtime evidence are under design/reviews/rubble-phase-2/env-facade-c/. Repeated lamps are authored sockets but not logically claimed; a failed load uses the declared capsule fallback.

Visual review compares the hero with hero-model.png and the four rubble mood frames, not a prose-only target. See the review README for five details and acknowledged differences. Owner acceptance of B/C is not claimed.
