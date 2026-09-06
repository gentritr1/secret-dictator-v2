"""Author the cart's physical parts and their three orthographic input projections."""
from pathlib import Path
import json,math
p=Path('design/references/env-rubble-cart');parts=[]
def box(name,role,x0,x1,y0,y1,z0,z1):
 v=[(x,y,z) for z in [z0,z1] for y in [y0,y1] for x in [x0,x1]]
 f=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
 parts.append({'name':name,'role':role,'vertices':v,'faces':f})
def wheel(name,x,y):
 v=[(xx,y+.12*math.cos(i*math.tau/12),.19+.12*math.sin(i*math.tau/12)) for xx in [x-.04,x+.04] for i in range(12)]
 f=[tuple(range(12)),tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
 parts.append({'name':name,'role':'Metal','vertices':v,'faces':f})
for i,y in enumerate([-.5,-.17,.17,.5]):box(f'sleeper-{i+1}','TimberSoot',-.4,.4,y-.045,y+.045,0,.035)
for i,x in enumerate([-.29,.29]):box(f'rail-{i+1}','Metal',x-.02,x+.02,-.6,.6,.035,.07)
for i,y in enumerate([-.29,.29]):
 box(f'axle-{i+1}','Metal',-.34,.34,y-.025,y+.025,.165,.215)
 for j,x in enumerate([-.29,.29]):wheel(f'wheel-{i+1}-{j+1}',x,y)
box('bed','TimberSoot',-.36,.36,-.43,.43,.30,.36)
box('panel-front','TimberSoot',-.36,.36,-.43,-.39,.36,.74)
box('panel-back','TimberSoot',-.36,.36,.39,.43,.36,.74)
box('panel-left','TimberSoot',-.36,-.32,-.39,.39,.36,.74)
box('panel-right','TimberSoot',.32,.36,-.39,.39,.36,.74)
for i,x in enumerate([-.34,.34]):
 for j,y in enumerate([-.41,.41]):box(f'upright-{i+1}-{j+1}','Metal',x-.025,x+.025,y-.025,y+.025,.30,.76)
for i,x in enumerate([-.15,.15]):
 for j,y in enumerate([-.19,.19]):box(f'load-{i+1}-{j+1}','Brick',x-.14,x+.14,y-.17,y+.17,.36,.82)
assert len(parts)==25
(p/'guide-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#b7b7b7"/><path d="M512 0V1024M1024 0V1024" stroke="#999"/><g font-family="sans-serif" font-size="22" text-anchor="middle" fill="#666"><text x="256" y="100">FRONT</text><text x="768" y="100">SIDE</text><text x="1280" y="100">TOP</text></g>']
for view,cx in [('front',256),('side',768),('top',1280)]:
 polygons=[]
 for part in parts:
  for f in part['faces']:
   vs=[part['vertices'][i] for i in f]
   if view=='front':points=[(cx+x*360,850-z*360) for x,y,z in vs];depth=-sum(v[1] for v in vs)/len(vs)
   elif view=='side':points=[(cx+y*360,850-z*360) for x,y,z in vs];depth=sum(v[0] for v in vs)/len(vs)
   else:points=[(cx+x*360,540+y*360) for x,y,z in vs];depth=sum(v[2] for v in vs)/len(vs)
   area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))
   if abs(area)>1:polygons.append((depth,part['role'],points))
 for depth,role,points in sorted(polygons,key=lambda x:x[0]):
  color={'Brick':'#846451','TimberSoot':'#6b716e','Metal':'#455766'}[role]
  s.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in points)+f'" fill="{color}" stroke="#283c50" stroke-width="2"/>')
s.append('<path d="M588 950H948M588 940V960M948 940V960" stroke="#555" stroke-width="2"/><text x="768" y="988" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#666">1 m</text></svg>')
(p/'layout-template.svg').write_text(''.join(s))
(p/'sheet-metric.json').write_text(json.dumps({'pixelsPerMetre':360,'views':{'front':[60,530,470,880],'side':[525,530,1010,880],'top':[1070,300,1500,780]}},indent=2)+'\n')
