# Backdrop generation review

All generated sheets are retained at their native dimensions. The SVG/PNG
layout and outline templates were authored as INPUTS to generation; they do
not rearrange or resample generated artwork.

| Attempt | Status and observed reason |
| --- | --- |
| rejected/sheet-01.png | Rejected: perspective elevations and filled circular floor; scale mismatch. |
| rejected/sheet-02.png | Rejected: differing elevation widths despite dimension labels; top has extraneous forms. |
| rejected/sheet-03.png | Rejected: elevation width improves, but the spire exceeds the scale envelope. |
| rejected/sheet-04.png | Layout passed, but the derived model showed floating strips at eye height. Retired design; raised hero and ID retained too. |
| rejected/sheet-05.png | Rejected: lower edge overshoots the baseline and background becomes white. |
| rejected/sheet-06.png | Rejected: bottom and baseline move; shared physical height fails. |
| sheet.png (attempt 7) | Layout accepted: elevations 401 × 130 px against expected 400 × 130; top 399 × 399 against 400 × 400. |
| rejected/atlas-01.png | Rejected: edge means pass, robust relative period drift -0.1876 exceeds 0.10. |
| rejected/atlas-02.png | Rejected: edge means pass, source relative drift 0.100716 exceeds 0.10. |
| atlas-source.png (attempt 3) | Source and production atlas pass unchanged thresholds. |

The accepted sheet constrains 16 paper-thin flats in two octagons: radius 26 m
and 40 m, base 0 m, highest spire 26 m. The part schedule is one broken spire,
one four-legged water tower, six chimneys, eight damaged gables. The top view
shows two eight-sided rings. The elevations overlap parts, so they do not
independently prove every hidden motif count; the GLB gate checks the complete
schedule. Layout acceptance is narrower than semantic certification.

Hero and material-ID follow the seventh sheet; exact prompts are adjacent.
The retired raised hero contains distance annotations; the final hero has no text. One timber-and-soot role is mapped to all flats; the
pale brush atlas and authored blue multiplier receive the runtime depth/state tint. Double
siding is the existing paper-flat contract exception. No collider or sockets.

Source: `scripts/blender/rubble-backdrop.py` through isolated Blender MCP.
The first tessellation attempt returned indices in this build and stopped;
the script was adapted before export. Rebuilding purges unused owned data to
keep canonical names. Source and GLB are reviewed in the phase-1 packet.
Actual image-generation model identifier was not returned by the tool.

Eye-height correction extends only the visual lower edges to y=0. Ring radii,
upper silhouettes, exact part counts and all gameplay contracts are unchanged.
The derived early render is retained as backdrop-raised-failure.png.
