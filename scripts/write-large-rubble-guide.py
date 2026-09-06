"""Author the twelve-piece large-heap dimension guide with explicit occlusion order."""
from pathlib import Path
import json
p=Path('design/references/env-rubble-large');parts=[]
def prism(name,role,y0,y1,outline):parts.append({'name':name,'role':role,'y':[y0,y1],'xz':outline})
prism('brick-left','Brick',-.12,.15,[(-.55,0),(-.22,0),(-.23,.18),(-.47,.22)])
prism('brick-front','Brick',-.50,-.22,[(-.23,0),(.13,0),(.1,.2),(-.2,.16)])
prism('brick-right','Brick',-.13,.15,[(.18,0),(.55,0),(.51,.24),(.23,.18)])
prism('brick-rear','Brick',.24,.50,[(-.18,0),(.18,0),(.14,.2),(-.15,.18)])
prism('brick-front-right','Brick',-.33,-.12,[(.10,.08),(.37,.08),(.32,.3),(.15,.27)])
prism('brick-back-left','Brick',.11,.32,[(-.38,.09),(-.12,.09),(-.16,.31),(-.33,.27)])
prism('plaster-left','Plaster',-.12,.17,[(-.33,.18),(0,.18),(-.02,.47),(-.20,.52),(-.31,.39)])
prism('plaster-rear','Plaster',.13,.32,[(-.08,.18),(.26,.18),(.23,.4),(.09,.56),(-.065,.5)])
prism('plaster-front','Plaster',-.3,-.11,[(-.03,.18),(.33,.18),(.31,.34),(.13,.41),(-.01,.35)])
prism('plaster-cap','Plaster',-.075,.135,[(-.11,.35),(.18,.35),(.15,.55),(-.045,.64),(-.1,.56)])
prism('timber-high','TimberSoot',-.13,-.085,[(-.38,.12),(-.325,.095),(.15,.86),(.10,.89)])
prism('timber-low','TimberSoot',-.25,-.20,[(-.28,.3),(-.27,.35),(.50,.48),(.49,.43)])
(p/'guide-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#b7b7b7"/><path d="M512 0V1024M1024 0V1024" stroke="#999"/><g font-family="sans-serif" font-size="22" text-anchor="middle" fill="#666"><text x="256" y="100">FRONT</text><text x="768" y="100">SIDE</text><text x="1280" y="100">TOP</text></g>']
for view,cx in [('front',256),('side',768),('top',1280)]:
 order=sorted(parts,key=lambda p: max(v[0] for v in p['xz']) if view=='side' else max(v[1] for v in p['xz']) if view=='top' else -p['y'][0])
 for part in order:
  xs=[v[0] for v in part['xz']];zs=[v[1] for v in part['xz']];y0,y1=part['y']
  if view=='front':coords=[(cx+x*400,850-z*400) for x,z in part['xz']]
  elif view=='side':coords=[(cx+y*400,850-z*400) for y,z in [(y0,min(zs)),(y1,min(zs)),(y1,max(zs)),(y0,max(zs))]]
  else:coords=[(cx+x*400,540+y*400) for x,y in [(min(xs),y0),(max(xs),y0),(max(xs),y1),(min(xs),y1)]]
  color={'Brick':'#846451','Plaster':'#9a9c92','TimberSoot':'#455766'}[part['role']]
  s.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in coords)+f'" fill="{color}" stroke="#283c50" stroke-width="2"/>')
s.append('<path d="M568 950H968M568 940V960M968 940V960" stroke="#555" stroke-width="2"/><text x="768" y="988" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#666">1 m</text></svg>')
(p/'layout-template.svg').write_text(''.join(s))
(p/'sheet-metric.json').write_text(json.dumps({'pixelsPerMetre':400,'views':{'front':[20,440,500,880],'side':[535,440,1000,880],'top':[1030,310,1530,770]}},indent=2)+'\n')
