"""Write the phase delivery page and script-attributed report from recorded evidence."""
from pathlib import Path
import json,html
root=Path('design/reviews/rubble-phase-2');m=json.loads((root/'combined/measurements.json').read_text())
assets=[('env-facade-a','A · Pocked facade'),('env-facade-b','B · Open floors'),('env-facade-c','C · Boarded shop'),('env-rubble-small','Small rubble heap'),('env-rubble-large','Large rubble heap'),('env-brick-stack','Salvaged brick stack'),('env-rubble-cart','Rail cart'),('env-well-a','Hand pump')]
s='''# Rubble square — phase 2 delivery

The three facades, two heap sizes, brick stack, rail cart and hand pump are built, gated, manifested and integrated on art/rubble-square. This is one phase delivery; phases 3–6 and whole-pass acceptance are not complete. The main worktree and its unrelated modified corner source remain untouched.

## Executed and observed

All eight assets have native generated orthographic sheets, game-height heroes and material-ID passes, owned Blender sources, packed shared 1024 albedos, GLB gates, six fixed asset-lab captures, manifest rows and runtime declarations. Failed sheets and heroes remain with STATUS notes. No generated sheet was rescaled or rearranged. A/B/C retain their approved source and GLB bytes: scripts/audit-rubble-phase-2.py checks them against the pre-kit facade checkpoint. That script also verifies four shared image roles across the eight final assets. Iron is the only new role after the approved facades. All static props keep root conventions and empty socket declarations; existing wall lamp nodes and original colliders remain intact.

npm run verify exited zero with all assets integrated: combined/verify-final.txt. test/content.test.js reports zero findings in combined/content-final.txt; this is a text/metadata gate. Generated images, model captures and the owned source audits were reviewed separately. test/glb.test.js pins original collider position/index bytes, facade lamp sockets, exact required nodes, visual envelopes, triangle budgets and albedo-only materials.

scripts/measure-rubble-kit-walk.mjs compares actual walk.html traces with the phase-1 runtime: all ten traces, collider bounds, anchors, sockets and tuning are equal. scripts/measure-rubble-contract.mjs and scripts/compare-rubble-prop.mjs confirm 32 placement records equal after replacement-role normalization, plus fingerprint and complete replay byte-identical to phase 0. See env-well-a/walk-01/ and env-well-a/comparison.json. No collider footprint, socket height, dais size or passage width changed.

## Final scene measurements

scripts/capture-rubble-baseline.mjs uses the same scripts/rubble-pixels.mjs classifier as phase 0, seed 1000/seven players, 1280 × 720. scripts/report-rubble-phase-2.py consolidates the final pump-stage capture and an independent repeat in combined/repeat-01/. Each percentage is reconciled against its raw count out of 921600 pixels in combined/measurements.json. Two runs × three states × two HUD modes = 12 scene images; this is not a duration or frame-rate benchmark.

| State | Warm HUD range | Warm scene range | Calls before → after | Triangles before → after | Calls / triangles ratio |
| --- | --- | --- | --- | --- | --- |
'''
for state,v in m['states'].items():
 h=v['warm']['hud'];c=v['warm']['scene'];s+=f"| {state} | {h['min']:.6f}–{h['max']:.6f}% | {c['min']:.6f}–{c['max']:.6f}% | {v['baselineCalls']} → {v['calls']} | {v['baselineTriangles']} → {v['triangles']} | {v['callsRatio']:.6f} / {v['trianglesRatio']:.6f} |\n"
s+='''
Both final captures pass the day/dusk/trial ceilings and the 1.5× draw/triangle limits. Their narrow observed trial spread does not replace the previously recorded approximately 0.2 pp variation across trial instants. scripts/measure-rubble-prop-warm-pair.mjs measured every intended kit placement: all five kit assets added exactly zero HUD and scene pixels at each of three trial instants. Each pair packet has five frozen instants × before/after × two HUD modes = 20 images. B/C also remain zero in the owner-approved scene comparisons; A's original +1 scene pixel is retained below the unchanged 0.001 pp resolution. No asset received a positive allocation. See WARM-BUDGETS.md and each raw paired packet.

scripts/measure-rubble-ground-floor.mjs reports final trial ground p1 1.2166 and p5 2.7152 versus branch-point 1.0762 and 2.0802, with blue-over-red true. RGB band evidence and mask are retained. The approximately 0.35 luma p5 jitter remains applicable. A channel-order pass does not make this dark tail visually bright.

## Visual judgment, separate from tests

I accepted B/C after the owner's measured approval, then accepted both heaps, stack, cart and pump after inspecting the six fixed lab views, extra unobscured side views, hero/model captures and local three-state runtime images. Each asset README names five shared details and visible differences. The review page presents references beside actual model captures and links native sheets without transforming them.

The strongest remaining differences are cleaner geometry and quieter wear on the heaps and brick stack; brown rather than orange brick; the facade roof caps; the cart's orderly four loads; and the pump's broad base and raised lever required by the original bounds. The square's existing corner modules, furniture and citizens still belong to earlier art work. This is a visual judgment of this phase, not a test-derived whole-pass style approval.

## Open gaps

- Phase 3 stage furniture and lighting props are not delivered.
- Phase 4's eight static painted citizens, shipped root/socket contract and 8/8 silhouette review are not delivered.
- Phase 5's dusk hue retune and visibly brighter dark ground tail remain open; no lighting intensities were changed in phase 2.
- Phase 6's full pasted-on test at three fog distances and independent reviewer acceptance without source access remain open. The per-asset five-detail comparisons are recorded, but do not substitute for that review.
- Generated references were requested as GPT Image 2, but the tool did not expose an actual model identifier.
- Numeric warmth is measured at the frozen review camera and instants, not every possible walking viewpoint. Mobile remains unclaimed.

Earlier facade and per-asset packets are sequential historical evidence; their sourceCommit records the parent because the work was uncommitted when captured. The final combined asset audit and delivery commit identify the delivered files. No merge into main is part of this delivery.
'''
(root/'README.md').write_text(s)
def fig(path,label):return f'<figure><a href="{path}"><img src="{path}" alt="{html.escape(label)}" loading="lazy"></a><figcaption>{html.escape(label)}</figcaption></figure>'
p=['''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rubble square · Phase 2</title><style>body{margin:0;background:#14232c;color:#e2dfd3;font:17px/1.55 system-ui}main{max-width:1400px;margin:auto;padding:32px}h1{font-size:40px}h2{margin-top:52px}p{max-width:1000px}a{color:#dbc18e}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}figure{margin:0;background:#22353e}img{display:block;width:100%;height:440px;object-fit:contain}figcaption{padding:12px}nav{display:flex;gap:16px;flex-wrap:wrap}table{border-collapse:collapse}td,th{padding:10px 16px;border-bottom:1px solid #53636b;text-align:left}.states img{height:auto}@media(max-width:750px){.grid{grid-template-columns:1fr}main{padding:18px}img{height:auto}}</style><main><p>ART / RUBBLE SQUARE · PHASE 2 DELIVERY</p><h1>The town walls and salvage kit</h1><p>Three facades, two heaps, brick stacks, a rail cart and a hand pump. Measured gates pass. The visual differences and later-phase gaps remain explicit in the evidence report.</p><nav><a href="README.md">Evidence and open gaps</a><a href="WARM-BUDGETS.md">Warm ledger</a><a href="combined/measurements.json">Raw final numbers</a><a href="combined/asset-audit.json">Asset hashes</a><a href="/play.html">Live square</a></nav><h2>Final measured scene</h2><table><tr><th>State</th><th>Warm HUD / scene range</th><th>Calls</th><th>Triangles</th></tr>''']
for state,v in m['states'].items():
 h=v['warm']['hud'];c=v['warm']['scene'];p.append(f"<tr><td>{state}</td><td>{h['min']:.4f}–{h['max']:.4f}% / {c['min']:.4f}–{c['max']:.4f}%</td><td>{v['baselineCalls']} → {v['calls']}</td><td>{v['baselineTriangles']} → {v['triangles']}</td></tr>")
p.append('</table><p>Two static capture runs. Scripts, classifier, pixel counts and measurement limits are named in the evidence report. Later lighting and whole-pass visual acceptance are still open.</p>')
for asset,title in assets:
 model=f'{asset}/hero-model.png' if asset.startswith('env-facade') else f'{asset}/browser-02/hero-model.png' if asset=='env-brick-stack' else f'{asset}/browser-01/hero-model.png'
 assert (root/model).exists()
 p.append(f'<h2 id="{asset}">{title}</h2><nav><a href="{asset}/README.md">Five details and limitations</a><a href="/design/references/{asset}/sheet.png">Native orthographic sheet</a><a href="/design/references/{asset}/material-id.png">Material ID</a><a href="/asset-lab.html?asset=environment/{asset}.glb">Live asset lab</a></nav><div class="grid">'+fig(f'/design/references/{asset}/hero.png','Generated hero')+fig(model,'Actual model · eye-height browser capture')+'</div><p>Fixed views: ')
 p.append(' · '.join(f'<a href="/design/reviews/{asset}/{name}.png">{name}</a>' for name in ['front','three-quarter','side','game-camera','silhouette','collider-overlay'])+'</p>')
 if not asset.startswith('env-facade'):
  folder='browser-02' if asset=='env-brick-stack' else 'browser-01';p.append('<p>Local runtime: '+' · '.join(f'<a href="{asset}/{folder}/eye-height-{state}.png">{state}</a>' for state in ['day','dusk','trial'])+'</p>')
p.append('<h2>Final square and mood frames</h2><div class="states">')
for state in ['day','dusk','trial']:p.append(fig(f'env-well-a/after/{state}-no-hud.png',f'{state} · actual final square'))
p.append('</div><div class="grid">')
for name in ['day-queue-notice-board','square-dusk-rubble','night-tribunal-searchlight','citizens-lineup-1946']:p.append(fig(f'/design/concepts/rubble/{name}.png',name))
p.append('</div><h2>Still open</h2><p>Stage furniture; eight painted citizens and their silhouette review; dusk/trial lighting; the full three-distance pasted-on review. Quieter wear and clean edges on several props remain visible differences. Green tests do not establish those visual outcomes.</p></main></html>')
(root/'index.html').write_text(''.join(p))
