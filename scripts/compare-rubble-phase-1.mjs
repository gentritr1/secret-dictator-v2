import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root='design/reviews/';
const read=p=>JSON.parse(readFileSync(root+p));
const before=read('baseline-v2/contract.json'),after=read('rubble-phase-1/contract.json');
assert.deepEqual(after.placements,before.placements,'Every placed collider and socket must equal baseline');
assert.deepEqual(after.tuning,before.tuning);assert.deepEqual(after.squareConstants,before.squareConstants);
assert.equal(readFileSync(root+'baseline-v2/contract-replay.json','utf8'),readFileSync(root+'rubble-phase-1/contract-replay.json','utf8'));
assert.equal(readFileSync(root+'baseline-v2/fingerprint.json','utf8'),readFileSync(root+'rubble-phase-1/square/fingerprint.json','utf8'));
const base=read('baseline-v2/measurements.json'),now=read('rubble-phase-1/square/measurements.json');
const states={};
for(const name of ['day','dusk','trial']){
 const a=base.states[name],b=now.states[name];const ceiling={day:100,dusk:45,trial:10}[name];
 states[name]={warmHudBefore:a.hud.warmPct,warmHudAfter:b.hud.warmPct,warmSceneBefore:a.scene.warmPct,warmSceneAfter:b.scene.warmPct,ceiling,
 callsBefore:a.stats.calls,callsAfter:b.stats.calls,callsRatio:b.stats.calls/a.stats.calls,trianglesBefore:a.stats.triangles,trianglesAfter:b.stats.triangles,trianglesRatio:b.stats.triangles/a.stats.triangles};
 assert.ok(b.stats.calls<=a.stats.calls*1.5 && b.stats.triangles<=a.stats.triangles*1.5);
 assert.ok(b.scene.warmPct<=ceiling && b.hud.warmPct<=ceiling,`${name}: both warm measurements must meet ceiling`);
}
const report={colliderSocketPlacementsEqual:after.placements.length,tuningEqual:true,squareConstantsEqual:true,replayByteIdentical:true,replaySha256:after.replaySha256,browserFingerprintByteIdentical:true,
 sampling:'One fixed frame per state and HUD setting, 1280 × 720 = 921600 pixel samples each. Spatial percentages, not a timed rate. Renderer counters are one paint including shadow passes, not FPS.',states};
report.artifactSha256=Object.fromEntries(['public/assets/models/environment/env-ground-a.glb','public/assets/models/environment/env-backdrop-a.glb','public/assets/textures/rubble/TEX_Emissive_DuskPanorama.png','src/play/assets.js','src/play/lighting.js','src/play/main.js'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
writeFileSync(root+'rubble-phase-1/comparison.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
