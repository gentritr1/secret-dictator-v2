# Phase-2 warm allocation ledger

Owner ruling ae6a31a: each phase-2 asset starts with 0.00 pp positive trial-warm allocation. A positive frozen-pair delta counts only above 0.001 pp at any instant. Values below resolution are retained verbatim. Full-scene warmth has its own 10% trial ceiling and observed spread. No asset gains an allowance from a negative delta or from remaining full-scene headroom.

| Asset | Current placements | Initial allowance | Frozen trial scene pixel deltas | Frozen trial HUD pixel deltas | Status |
| --- | --- | --- | --- | --- | --- |
| A, ochre | 3 (original approval measured all 7) | 0.00 pp | 0, 0, +1 across the recorded instants | -3, -3, -2 | Owner approved at ae6a31a; raw earlier records retained |
| B, collapsed | 2: north x -4.5 and east z +4.5 | 0.00 pp | 0, 0, 0 | -2, -2, -2 | Owner measurements approved; Codex visually accepted |
| C, boarded shop | 2: north x +4.5 and west z -4.5 | 0.00 pp | 0, 0, 0 | 0, 0, 0 | Owner measurements approved; Codex visually accepted |

Source: scripts/measure-facade-warm-pair.mjs and each asset’s paired-warm/measurement.json. B/C reference GLBs are approved ochre A at their respective two placements. Remaining facade placements are held fixed. Exact percentage-point values are in those JSON files; the table reports integer pixel counts, not rounded percentages. Every source prompt, generation budget, sheet, hero and material-ID preceded its build.

The original facade checkpoint preceded the rubble kit. Each kit asset now has a recorded 0.00 pp allowance in its own reference BUDGET.md before generation. Completed results follow below. All five kit assets are now built and measured; final combined evidence is under combined/. Phase 4 likewise starts at zero per asset. No light settings changed.

Small heap: one original crate replacement at(-11.6,4.1), initial0.00pp; measured HUD/scene trial deltas0/0 at all three instants. scripts/measure-rubble-prop-warm-pair.mjs, env-rubble-small/paired-01. Final scene and trace evidence in its README. Large heap, stack, cart and pump budgets are now recorded in their own BUDGET.md files before generation.

Large heap completed: four placements, starting allowance 0.00 pp; three frozen trial instants each 0 HUD / 0 scene pixels. Full trial capture 9.664497% HUD / 9.118707% scene. Scripts and raw evidence: env-rubble-large/README.md and paired-01/. No positive allowance allocated.

Brick stack completed: two placements, starting allowance 0.00 pp; all three trial instants 0 HUD / 0 scene pixels. Full trial capture 9.663411% HUD / 9.175347% scene. Source scripts and raw evidence in env-brick-stack/README.md and paired-01/. No positive allocation.

Cart completed: one placement, starting allowance 0.00 pp; all three trial instants 0 HUD / 0 scene pixels. Full trial capture 9.678819% HUD / 9.121962% scene. Scripts and raw evidence in env-rubble-cart/README.md and paired-01/. No positive allocation.

Pump completed: one placement, starting allowance 0.00 pp; all three trial instants 0 HUD / 0 scene pixels. Full trial capture 9.673937% HUD / 9.119575% scene; final repeat 9.688585% HUD / 9.141059% scene. Scripts and raw evidence in env-well-a/README.md, paired-01/ and combined/. No positive allocation. All phase-2 assets are complete; phase-5 lighting and phase-6 visual acceptance remain open.
