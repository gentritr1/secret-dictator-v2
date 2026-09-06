import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const asset=process.argv[2],out=process.argv[3];
assert.ok(asset&&out,'Asset and evidence folder required');
const read=p=>JSON.parse(readFileSync(p));
const current=read(out+'/contract-after.json'),baseline=read('design/reviews/baseline-v2/contract.json');
const originalId=id=>/^env-facade-[abc]$/.test(id)?'facade-grid-bay':({'env-rubble-small':'env-crate-a','env-rubble-large':'env-barrel-a','env-brick-stack':'env-crate-a','env-rubble-cart':'env-crate-a'}[id]||id);
const normalize=rows=>rows.map(row=>({...row,id:originalId(row.id)}));
assert.deepEqual(normalize(current.placements),normalize(baseline.placements));
assert.deepEqual(current.tuning,baseline.tuning);assert.deepEqual(current.squareConstants,baseline.squareConstants);
assert.ok(readFileSync(out+'/after/fingerprint.json').equals(readFileSync('design/reviews/baseline-v2/fingerprint.json')));
assert.ok(readFileSync(out+'/contract-after-replay.json').equals(readFileSync('design/reviews/baseline-v2/contract-replay.json')));
const pair=read(out+'/paired-01/measurement.json');assert.ok(pair.passesZeroAllowance&&pair.resolutionPp===.001);
assert.ok(read(out+'/walk-01/walk-comparison.json').equal);
const floor=read(out+'/ground-01/ground-floor-measurement.json').ground,oldFloor=read('design/reviews/rubble-phase-1/owner-review/baseline/ground-floor-measurement.json').ground;
assert.ok(floor.p1>=oldFloor.p1&&floor.p5>=oldFloor.p5&&floor.p5BandBlueOverRed);
const measures=read(out+'/after/measurements.json'),old=read('design/reviews/baseline-v2/measurements.json');
const states={};
for(const state of ['day','dusk','trial']) {
 const a=measures.states[state],b=old.states[state];
 assert.ok(a.hud.warmPct<={day:100,dusk:45,trial:10}[state]&&a.scene.warmPct<={day:100,dusk:45,trial:10}[state]);
 assert.ok(a.stats.calls<=b.stats.calls*1.5&&a.stats.triangles<=b.stats.triangles*1.5);
 states[state]={hud:a.hud.warmPct,scene:a.scene.warmPct,calls:a.stats.calls,triangles:a.stats.triangles,callsBaseline:b.stats.calls,trianglesBaseline:b.stats.triangles,callsRatio:a.stats.calls/b.stats.calls,trianglesRatio:a.stats.triangles/b.stats.triangles};
}
const report={asset,states,ground:floor,groundBaseline:oldFloor,p5JitterLuma:.35,walkEqual:true,placementsEqual:current.placements.length,fingerprintByteIdentical:true,replayByteIdentical:true,pairPass:true,trialPairDeltas:pair.pairs.filter(p=>p.state==='trial').map(p=>({index:p.index,deltaPp:p.deltaPp,hudPixels:p.after.hud.warm-p.before.hud.warm,scenePixels:p.after.scene.warm-p.before.scene.warm}))};
assert.ok(!existsSync(out+'/comparison.json'),'Refuse to overwrite comparison');
writeFileSync(out+'/comparison.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
