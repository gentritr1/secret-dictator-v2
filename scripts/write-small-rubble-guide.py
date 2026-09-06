"""Author a dimension guide; never transform generated image pixels."""
from pathlib import Path
import json
p=Path('design/references/env-rubble-small')
parts=[
 {'name':'brick-left','role':'Brick','y':[-.3375,.3375],'xz':[[-.3375,0],[-.09,0],[-.09,.14],[-.31,.14]]},
 {'name':'brick-centre','role':'Brick','y':[-.3375,.15],'xz':[[-.09,0],[.12,0],[.12,.14],[-.09,.14]]},
 {'name':'brick-right','role':'Brick','y':[-.3375,.3375],'xz':[[.12,0],[.3375,0],[.30,.24],[.21,.38],[.12,.30]]},
 {'name':'plaster-tall','role':'Plaster','y':[-.05,.22],'xz':[[-.20,.14],[.03,.14],[.01,.55],[-.12,.62],[-.16,.57]]},
 {'name':'plaster-low','role':'Plaster','y':[-.31,-.05],'xz':[[-.31,.14],[-.03,.14],[-.02,.24],[-.11,.29],[-.30,.27]]},
 {'name':'timber','role':'TimberSoot','y':[-.3375,-.27],'xz':[[-.06,.13],[0,.11],[.23,.43],[.17,.46]]}
]
(p/'guide-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#b7b7b7"/><path d="M512 0V1024M1024 0V1024" stroke="#999"/><g font-family="sans-serif" font-size="22" text-anchor="middle" fill="#666"><text x="256" y="100">FRONT</text><text x="768" y="100">SIDE</text><text x="1280" y="100">TOP</text></g>']
for view,cx in [('front',256),('side',768),('top',1280)]:
 for part in (sorted(parts,key=lambda p:max(v[0] for v in p['xz'])) if view=='side' else parts):
  xs=[v[0] for v in part['xz']];zs=[v[1] for v in part['xz']];y0,y1=part['y']
  if view=='front':coords=[(cx+x*512,850-z*512) for x,z in part['xz']]
  elif view=='side':coords=[(cx+y*512,850-z*512) for y,z in [(y0,min(zs)),(y1,min(zs)),(y1,max(zs)),(y0,max(zs))]]
  else:coords=[(cx+x*512,540+y*512) for x,y in [(min(xs),y0),(max(xs),y0),(max(xs),y1),(min(xs),y1)]]
  color={'Brick':'#846451','Plaster':'#9a9c92','TimberSoot':'#455766'}[part['role']]
  s.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in coords)+f'" fill="{color}" stroke="#283c50" stroke-width="2"/>')
s.append('<path d="M512 950H1024M512 940V960M1024 940V960" stroke="#555" stroke-width="2"/><text x="768" y="988" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#666">1 m</text></svg>')
(p/'layout-template-v2.svg').write_text(''.join(s))
