"""Author the pump's physical parts and their three orthographic input projections."""
from pathlib import Path
import json,math
p=Path('design/references/env-well-a');parts=[]
def box(name,role,x0,x1,y0,y1,z0,z1):
 v=[(x,y,z) for z in [z0,z1] for y in [y0,y1] for x in [x0,x1]]
 f=[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
 parts.append({'name':name,'role':role,'vertices':v,'faces':f})
def wheel(name,x,y):
 v=[(xx,y+.12*math.cos(i*math.tau/12),.19+.12*math.sin(i*math.tau/12)) for xx in [x-.04,x+.04] for i in range(12)]
 f=[tuple(range(12)),tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
 parts.append({'name':name,'role':'Metal','vertices':v,'faces':f})
def cylinder(name,role,x,y,rx,ry,z0,z1,n=16):
 v=[(x+rx*math.cos(i*math.tau/n),y+ry*math.sin(i*math.tau/n),z) for z in [z0,z1] for i in range(n)]
 f=[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 parts.append({'name':name,'role':role,'vertices':v,'faces':f})
def prism(name,role,outline,axis,lo,hi):
 n=len(outline)
 if axis=='y':v=[(a,t,b) for t in [lo,hi] for a,b in outline]
 else:v=[(t,a,b) for t in [lo,hi] for a,b in outline]
 f=[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 parts.append({'name':name,'role':role,'vertices':v,'faces':f})
cylinder('plinth','Plaster',0,0,.824999988079071,.8588208556175232,0,.18)
cylinder('pedestal','Plaster',0,0,.72,.72,.18,.90)
cylinder('foot-flange','Metal',0,.30,.23,.23,.90,1.00)
cylinder('body','Metal',0,.30,.12,.12,1.00,2.00)
cylinder('cap','Metal',0,.30,.15,.15,2.00,2.09)
prism('spout','Metal',[(.30,1.70),(-.37,1.70),(-.45,1.62),(-.45,1.48),(-.35,1.48),(-.35,1.59),(.30,1.59)],'x',-.055,.055)
box('lever-bracket','Metal',.08,.29,.255,.345,1.80,1.90)
prism('raised-lever','Metal',[(.23,1.82),(.30,1.81),(.69,2.4908389568328857),(.66,2.5408389568328857),(.60,2.51)],'y',.275,.325)
# One closed shallow bowl: outer wall, rim, interior wall and bottom.
v=[];n=16
for rx,ry,z in [(.42,.30,.90),(.42,.30,1.08),(.34,.22,1.08),(.31,.19,.96)]:
 v.extend([(rx*math.cos(i*math.tau/n),-.35+ry*math.sin(i*math.tau/n),z) for i in range(n)])
f=[tuple(range(n)),tuple(range(3*n,4*n))]
for ring in range(3):
 for i in range(n):f.append((ring*n+i,ring*n+(i+1)%n,(ring+1)*n+(i+1)%n,(ring+1)*n+i))
parts.append({'name':'basin','role':'Plaster','vertices':v,'faces':f})
assert len(parts)==9
(p/'guide-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#b7b7b7"/><path d="M512 0V1024M1024 0V1024" stroke="#999"/><g font-family="sans-serif" font-size="22" text-anchor="middle" fill="#666"><text x="256" y="100">FRONT</text><text x="768" y="100">SIDE</text><text x="1280" y="100">TOP</text></g>']
for view,cx in [('front',256),('side',768),('top',1280)]:
 polygons=[]
 for part in parts:
  for f in part['faces']:
   vs=[part['vertices'][i] for i in f]
   if view=='front':points=[(cx+x*240,850-z*240) for x,y,z in vs];depth=-sum(v[1] for v in vs)/len(vs)
   elif view=='side':points=[(cx+y*240,850-z*240) for x,y,z in vs];depth=sum(v[0] for v in vs)/len(vs)
   else:points=[(cx+x*240,540+y*240) for x,y,z in vs];depth=sum(v[2] for v in vs)/len(vs)
   area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))
   if abs(area)>1:polygons.append((depth,part['role'],points))
 for depth,role,points in sorted(polygons,key=lambda x:x[0]):
  color={'Plaster':'#9a9c92','Metal':'#455766'}[role]
  s.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in points)+f'" fill="{color}" stroke="#283c50" stroke-width="2"/>')
s.append('<path d="M648 950H888M648 940V960M888 940V960" stroke="#555" stroke-width="2"/><text x="768" y="988" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#666">1 m</text></svg>')
(p/'layout-template.svg').write_text(''.join(s))
(p/'sheet-metric.json').write_text(json.dumps({'pixelsPerMetre':240,'views':{'front':[30,210,490,880],'side':[530,210,1010,880],'top':[1050,310,1510,780]}},indent=2)+'\n')
