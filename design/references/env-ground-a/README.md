# Ground texture and retained sheet failures

The owner's 2026-09-05 correction replaces the ground turnaround requirement
with a top-down tile. The four original sheets remain rejected and unmodified.
No programmatic sheet rescaling, rectification or layout repair was performed.

| File | Observed failure |
| --- | --- |
| rejected/sheet-01.png | Upright front and side; wrong floor orientation and scale bar. |
| rejected/sheet-02.png | View widths and scale bar disagree. |
| rejected/sheet-03.png | Top substantially wider than front/side; scale bar too long. |
| rejected/sheet-04.png | Top over-shrunk relative to the strips; inconsistent scale bar. |

`cobble-source.png` is the replacement texture, followed by `hero.png` at game
height and the one-role `material-id.png`. Exact prompts are adjacent. Generated
through built-in imagegen, requesting GPT Image 2; the tool did not disclose the
actual model identifier. The original tile is 1254 square, uniformly reduced to
1024 in Blender. The source and final atlas pass the read-only seam and spectral
checks in `scripts/profile-rubble-texture.py`. No seam repair was applied.

Final physical parts: one continuous 27.8 × 27.8 m painted slab and two thin
parallel tram-scar ribbons in one mesh. Sparse weeds/grime are painted texture
detail, not separate geometry or an eight-patch placement contract. Slab top
-0.002 m, scars -0.001 m, bottom -0.072 m. The original collider remains exactly
unchanged, with its walk plane at y=0. One shared MAT_Plaster mineral role,
1024 albedo only; the exported albedo multiplier (0.8,0.9,1) cools the measured
night spill without changing any light.

Source reconstruction: run `scripts/blender/rubble-ground.py` through MCP on the
branch-point ground source, then `rubble-ground-tint.py` on that saved scene.
The second script also replaces the initial ellipsoid guide with a true capsule.
The fixed browser captures and phase report are the review evidence.
