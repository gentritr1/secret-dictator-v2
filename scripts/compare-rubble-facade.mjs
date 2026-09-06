import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='design/reviews/rubble-phase-2/env-facade-a';
const read=p=>JSON.parse(readFileSync(p));
const before=read(out+'/before-contract.json'),after=read(out+'/after-contract.json');
const branch=read('design/reviews/baseline-v2/contract.json');
for(const key of ['placements','tuning','squareConstants']) {
  assert.deepEqual(after[key],before[key]);assert.deepEqual(after[key],branch[key]);
}
for(const [a,b] of [
  [out+'/after-contract-replay.json','design/reviews/baseline-v2/contract-replay.json'],
  [out+'/after/fingerprint.json','design/reviews/baseline-v2/fingerprint.json'],
  [out+'/after/fingerprint.json',out+'/before/fingerprint.json']
])assert.ok(readFileSync(a).equals(readFileSync(b)));
const original=read('design/reviews/baseline-v2/measurements.json');
const previous=read(out+'/before/measurements.json'),current=read(out+'/after/measurements.json');
const states={};
for(const state of ['day','dusk','trial']) {
  const a=original.states[state],b=previous.states[state],c=current.states[state];
  const ceiling={day:100,dusk:45,trial:10}[state];
  assert.ok(c.hud.warmPct<=ceiling&&c.scene.warmPct<=ceiling);
  assert.ok(c.stats.calls<=1.5*a.stats.calls&&c.stats.triangles<=1.5*a.stats.triangles);
  states[state]={warmCeiling:ceiling,
    warmHudBefore:b.hud.warmPct,warmHudAfter:c.hud.warmPct,rawHudDeltaPp:c.hud.warmPct-b.hud.warmPct,
    warmSceneBefore:b.scene.warmPct,warmSceneAfter:c.scene.warmPct,rawSceneDeltaPp:c.scene.warmPct-b.scene.warmPct,
    callsBranchPoint:a.stats.calls,callsBefore:b.stats.calls,callsAfter:c.stats.calls,callsRatio:c.stats.calls/a.stats.calls,
    trianglesBranchPoint:a.stats.triangles,trianglesBefore:b.stats.triangles,trianglesAfter:c.stats.triangles,trianglesRatio:c.stats.triangles/a.stats.triangles};
}
const paired=read(out+'/paired-warm/measurement.json');
const trialPairs=paired.pairs.filter(p=>p.state==='trial');
assert.ok(trialPairs.every(p=>p.after.hud.warmPct<10&&p.after.scene.warmPct<10));
const floorBefore=read(out+'/before-ground/ground-floor-measurement.json').ground;
const floorAfter=read(out+'/after-ground/ground-floor-measurement.json').ground;
const floorBranch=read('design/reviews/rubble-phase-1/owner-review/baseline/ground-floor-measurement.json').ground;
assert.ok(floorAfter.p1>=floorBranch.p1&&floorAfter.p5>=floorBranch.p5&&floorAfter.p5BandBlueOverRed);
assert.ok(read(out+'/walk-comparison.json').equal);
const paths=['art/blender/environment/env-facade-a/env-facade-a.blend','public/assets/models/environment/env-facade-a.glb','public/assets/textures/rubble/TEX_Plaster_Facade.png','public/assets/textures/rubble/TEX_Brick.png','public/assets/textures/rubble/TEX_TimberSoot_Backdrop.png','src/play/assets.js','test/glb.test.js'];
const report={asset:'env-facade-a',placements:7,colliderSocketPlacementsEqual:after.placements.length,replayByteIdentical:true,browserFingerprintByteIdentical:true,replaySha256:after.replaySha256,
  sampling:'One 1280x720 frame =921600 spatial pixel samples per HUD/state condition. Renderer counters include shadow passes, not FPS. No timed rate is inferred.',states,
  incrementalWarm:{allowancePp:0,script:'scripts/measure-facade-warm-pair.mjs',trialPairs:trialPairs.map(p=>({index:p.index,deltaPp:p.deltaPp,afterHud:p.after.hud.warmPct,afterScene:p.after.scene.warmPct,camera:p.count.camera})),passes:paired.passesZeroAllowance,
    caveat:'Raw independent screenshots include animation/framing jitter. The raw HUD delta is retained above; zero allowance is resolved by paired renders at the same frozen instant with all seven old/new placements. Absolute ceilings use the separate unmodified capture instrument as well.'},
  ground:{script:'scripts/measure-rubble-ground-floor.mjs',branchPoint:floorBranch,before:floorBefore,after:floorAfter,p5JitterLuma:.35,visualAdequacyApproved:false},
  walkInstrumentEqual:true,artifactSha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
writeFileSync(out+'/comparison.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({states,incrementalWarm:report.incrementalWarm,replayByteIdentical:true,walkInstrumentEqual:true},null,2));
assert.ok(paired.passesZeroAllowance, 'Strict zero allowance remains unmet; failed evidence is written above');
