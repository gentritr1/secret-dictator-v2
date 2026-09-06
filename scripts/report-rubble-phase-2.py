"""Consolidate the final scene's two captures without rounding gate inputs."""
from pathlib import Path
import json
root=Path('design/reviews/rubble-phase-2');out=root/'combined/measurements.json';assert not out.exists(),'Refusing to overwrite evidence'
final=json.loads((root/'env-well-a/after/measurements.json').read_text());repeat=json.loads((root/'combined/repeat-01/measurements.json').read_text());comparison=json.loads((root/'env-well-a/comparison.json').read_text());baseline=json.loads(Path('design/reviews/baseline-v2/measurements.json').read_text())
for folder in [root/'env-well-a/after',root/'combined/repeat-01']:
 assert (folder/'fingerprint.json').read_bytes()==Path('design/reviews/baseline-v2/fingerprint.json').read_bytes()
 assert len(list(folder.glob('*-hud.png')))==6
report={'sources':['scripts/capture-rubble-baseline.mjs','scripts/rubble-pixels.mjs','scripts/compare-rubble-prop.mjs'],'sampling':'Two static capture runs, three states per run, two HUD modes per state: 12 images. Each image has 1280 × 720 = 921600 classified pixels. This is not a frame-rate or duration benchmark. Per-asset pairs use five frozen instants, including three trial instants, each rendered before/after with/without HUD: 20 images per asset.','states':{},'fingerprintsByteIdentical':True,'walkEqual':comparison['walkEqual'],'replayByteIdentical':comparison['replayByteIdentical'],'ground':comparison['ground'],'baselineGround':comparison['groundBaseline'],'p5JitterLuma':.35,'historicalTrialSpreadPp':.2}
for state in ['day','dusk','trial']:
 v=final['states'][state];w=repeat['states'][state];b=baseline['states'][state]
 assert v['stats']['calls']==w['stats']['calls'] and v['stats']['triangles']==w['stats']['triangles']
 data={'calls':v['stats']['calls'],'triangles':v['stats']['triangles'],'baselineCalls':b['stats']['calls'],'baselineTriangles':b['stats']['triangles'],'warm':{}}
 for kind in ['hud','scene']:
  samples=[]
  for capture in [v,w]:
   m=capture[kind];assert m['total']==921600 and m['width']==1280 and m['height']==720
   assert abs(m['warm']/m['total']*100-m['warmPct'])<1e-10
   samples.append({'pixels':m['warm'],'total':m['total'],'percentage':m['warmPct']})
  percentages=[s['percentage'] for s in samples];data['warm'][kind]={'samples':samples,'min':min(percentages),'max':max(percentages),'spread':max(percentages)-min(percentages)}
  assert max(percentages)<=dict(day=100,dusk=45,trial=10)[state]
 data['callsRatio']=data['calls']/data['baselineCalls'];data['trianglesRatio']=data['triangles']/data['baselineTriangles'];assert data['callsRatio']<=1.5 and data['trianglesRatio']<=1.5
 report['states'][state]=data
out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
