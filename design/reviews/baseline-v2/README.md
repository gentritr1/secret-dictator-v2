# Rubble phase 0 evidence

Branch point: `f73831687cf20171643f8e31acb63dc7543d384c` on main.
Captured from detached `/private/tmp/rubble-square-baseline`, served by
`npm run dev -- --host 127.0.0.1 --port 5183 --strictPort`.
The original checkout's edited corner Blender source was excluded and preserved.

## Executed and observed

`scripts/capture-rubble-baseline.mjs`: seed 1000, seven players, human seat 0,
1280×720, reduced motion, podium mark facing the dais, default chase framing.
Each state restarts the match, waits, pauses progression, forces the lighting
state, restores the camera and captures the painted browser frame.
The no-HUD images hide the same five elements as `scripts/capture-warm.mjs`;
world name labels remain. Zero browser page errors were reported.

| State | Warm including HUD | Warm scene | Draw calls | Triangles | 1.5× call ceiling | 1.5× triangle ceiling |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Day | 6.176975% | 5.605143% | 473 | 68,875 | 709.5 | 103,312.5 |
| Dusk | 22.649197% | 24.720812% | 473 | 68,875 | 709.5 | 103,312.5 |
| Trial | 8.246853% | 7.681749% | 481 | 72,163 | 721.5 | 108,244.5 |

`scripts/rubble-pixels.mjs` uses the existing warm classifier verbatim in
thresholds and HSL conversion. Each screenshot contributes exactly
1280×720 = 921,600 spatial pixel samples. There is one stats observation per
state, not a timed performance sample: no FPS, frame-time percentile or
window×rate estimate is claimed. Stats are the last painted renderer counters,
including whatever shadow passes the renderer counts.

The trial frame's globally darkest pixel is (0,0,1) at (130,173).
This is not a ground-only measurement and cannot be equated with the recorded
Gate 3 ground floor (1,11,20). Ground-specific validation is still required.

`verify-baseline.txt` and `verify-phase-0.txt` record successful full verification.
The existing bundle-size advisory remains. These are functional evidence only.

`scripts/measure-rubble-contract.mjs` measured 32 environment placements,
world collider vertex bounds/hashes, every exported socket, controller tuning
and square constants. Baseline and phase-0 JSON files compare byte-identically.
The script also saves complete deterministic replay events/actions; baseline
and phase-0 replay bytes compare identically, SHA-256
`9313643a2934c2c74eeb64eb79eeeaaf75ab2e31744502b0bb6307e1f2c459a7`.
The browser's existing fingerprint is 61 steps, 38 human decisions, over=true,
winner=loyalist, stored in `fingerprint.json`.

`test/content.test.js` is now the first verify gate. It scans source and script
text including comments, manifest text, asset paths, and complete GLB JSON
metadata. Its policy list alone is exempt inside the test. The existing
rejection-filter regex uses Unicode escapes to preserve its exact behavior
without the literal historical name in source. A grep does not review pixels,
recognize arbitrary real persons, or inspect binary Blender internals.

## Inferred and unresolved

Histogram bin counts are observed; the palette's material-role assignments are
interpretations. The references contain documented content caveats. They are
not proof that any resulting asset meets the hard content rule.

Blender MCP read-only library inspection found zero armatures and zero actions
in the tracked `chr-citizen-base.blend`, with `SOCKET_label` rather than the
brief's differently cased spelling. Resolving that source mismatch is pending.
The active Blender scene was unsaved, with five objects; it was not replaced.

The walk.html entry point is a separate movement course. The collider snapshot
above is not a claim that every square-contract row was walked in that page.
No new art asset or visual acceptance is claimed by phase 0.
