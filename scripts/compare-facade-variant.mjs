import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const asset=process.argv[2];assert.ok(['env-facade-b','env-facade-c'].includes(asset));
const out=`design/reviews/rubble-phase-2/${asset}`;
const read=p=>JSON.parse(readFileSync(p));
const after=read(out+'/after-contract.json'),before=read(out+'/before-contract.json'),baseline=read('design/reviews/baseline-v2/contract.json');
const normalize=p=>p.map(v=>({...v,id:/^env-facade-[abc]$/.test(v.id)?'facade-grid-bay':v.id}));
for(const ref of [before,baseline]){
  assert.deepEqual(normalize(after.placements),normalize(ref.placements));
  assert.deepEqual(after.tuning,ref.tuning);assert.deepEqual(after.squareConstants,ref.squareConstants);
}
assert.ok(readFileSync(out+'/after/fingerprint.json').equals(readFileSync('design/reviews/baseline-v2/fingerprint.json')));
assert.ok(readFileSync(out+'/after-contract-replay.json').equals(readFileSync('design/reviews/baseline-v2/contract-replay.json')));
const original=read('design/reviews/baseline-v2/measurements.json'),current=read(out+'/after/measurements.json');
const states={};
for(const state of ['day','dusk','trial']){
  const b=original.states[state],a=current.states[state],ceiling={day:100,dusk:45,trial:10}[state];
  states[state]={hud:a.hud.warmPct,scene:a.scene.warmPct,ceiling,calls:a.stats.calls,triangles:a.stats.triangles,callsBaseline:b.stats.calls,trianglesBaseline:b.stats.triangles,callsRatio:a.stats.calls/b.stats.calls,trianglesRatio:a.stats.triangles/b.stats.triangles};
  assert.ok(a.hud.warmPct<=ceiling&&a.scene.warmPct<=ceiling);
  assert.ok(a.stats.calls<=1.5*b.stats.calls&&a.stats.triangles<=1.5*b.stats.triangles);
}
const paired=read(out+'/paired-warm/measurement.json');assert.equal(paired.resolutionPp,.001);
const floor=read(out+'/after-ground/ground-floor-measurement.json').ground;
const baseFloor=read('design/reviews/rubble-phase-1/owner-review/baseline/ground-floor-measurement.json').ground;
assert.ok(floor.p1>=baseFloor.p1&&floor.p5>=baseFloor.p5&&floor.p5BandBlueOverRed);
const walk=read(out+'/walk-comparison.json');assert.ok(walk.equal);
const paths=[`art/blender/environment/${asset}/${asset}.blend`,`public/assets/models/environment/${asset}.glb`,'src/play/assets.js','test/glb.test.js'];
const report={asset,states,pairResolutionPp:.001,pairPasses:paired.passesZeroAllowance,trialPairs:paired.pairs.filter(p=>p.state==='trial').map(p=>({index:p.index,deltaPp:p.deltaPp,after:p.after})),ground:floor,groundBaseline:baseFloor,p5JitterLuma:.35,walkEqual:true,placementsEqual:32,comparison:'Facade IDs change; all world collider and socket records, tuning and anchors are equal.',fingerprintByteIdentical:true,replayByteIdentical:true,sha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
writeFileSync(out+'/comparison.json',JSON.stringify(report,null,2)+'\n');assert.ok(paired.passesZeroAllowance);console.log(JSON.stringify(report));
