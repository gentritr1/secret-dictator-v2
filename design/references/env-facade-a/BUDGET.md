# First phase-2 asset — budget before production

Asset: env-facade-a, intact but pocked frontage. Recorded before reference
production on 2026-09-06 at branch head 73a154c. First-asset review point only;
remaining facade variants and rubble/pump work follow the review.

Trial incremental warm allowance: **0.00 percentage points**, both HUD-inclusive
and scene-only, across all seven current placements. No emissive window panes,
lamps, glowing signs or baked warm illumination. No positive allocation is
borrowed from the remaining headroom. Day/dusk must also remain inside their
existing state ceilings. Source: paired captures using
scripts/capture-rubble-baseline.mjs and its unchanged rubble-pixels classifier.
Capture the existing scene before any GLB replacement, then the full repeated
candidate; retain both. Repeat borderline readings to distinguish capture jitter.

Collision: preserve COL_wall positions AND indices byte-for-byte, dimensions
4 × 6 × 0.4 m. Preserve root identity and SOCKET_lamp at runtime
(1.4500000477, 2.5999999046, 0.3199999928), unclaimed by the logical socket map.
Seven placements and the 4.5 m grid remain unchanged. No corner asset edits.

Visual envelope: 4.5 m wide, 7.8 m high, 1.5 m deep; wall eaves at 6 m.
The taller visual gable is scenery, not a change to the six-metre collider.
Exact parts: one wall shell including gable ends; two roof slopes; six window
frames each with one vertical mullion and two unlit panes; one central door
with five salvaged boards and a three-piece frame; six exposed brick patches;
one blank fictional paper notice. No shutters, dormers, chimney or balcony.
Surface pits/cracks are paint rather than additional physical pieces.

Material roles: plaster, brick, timber-and-soot. New 1024 plaster and brick
atlases will be shared by the later facade modules and rubble kit. Reuse the
existing timber-and-soot atlas with tint. The approved cobble atlas remains
unchanged; it is a separate mineral surface in the same plaster role. No new
role beyond the six-role vocabulary; no auxiliary texture maps. Merge visible
geometry by role; target below 5k triangles and the overall 1.5× branch-point
rendering limits. No lighting, engine or controller changes.

Ground: use the owner's consolidated percentile script for paired evidence.
Do not call a p5 shortfall below 0.35 luma a regression. A blue-over-red flag is
not a visual claim that the darkest ground is sufficiently visible; that
remains the phase-5 retune target. Keep current sett scale and dusk hue.

Ochre revision result: allocation remains 0.00 pp. Direct ochre-versus-cold isolation is zero trial warm pixels at all three instants, HUD and scene. Full facade-versus-73a154c isolation has one additional scene warm pixel at one instant (0.000108507 pp); the owner ruling at ae6a31a accepts this sub-resolution positive without spending a warm allowance. See paired-warm/ and paired-ochre-versus-cold/ in the phase-2 review packet.
