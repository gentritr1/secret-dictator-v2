"""Author the fixed 32-brick stack guide; no generated images are transformed."""
from pathlib import Path
import json
p=Path('design/references/env-brick-stack');parts=[]
for course in range(4):
 for row in range(4):
  for column in range(2):
   x0=-.3375+column*.34;x1=x0+.335
   y0=-.3375+row*.17;y1=y0+.165
   z0=course*.157;z1=z0+.149
   parts.append({'name':f'brick-{course+1}-{row+1}-{column+1}', 'role':'Brick', 'y':[y0,y1], 'xz':[(x0,z0),(x1,z0),(x1,z1),(x0,z1)]})
(p/'guide-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#b7b7b7"/><path d="M512 0V1024M1024 0V1024" stroke="#999"/><g font-family="sans-serif" font-size="22" text-anchor="middle" fill="#666"><text x="256" y="100">FRONT</text><text x="768" y="100">SIDE</text><text x="1280" y="100">TOP</text></g>']
for view,cx in [('front',256),('side',768),('top',1280)]:
 order=sorted(parts,key=lambda p: max(v[0] for v in p['xz']) if view=='side' else max(v[1] for v in p['xz']) if view=='top' else -p['y'][0])
 for part in order:
  xs=[v[0] for v in part['xz']];zs=[v[1] for v in part['xz']];y0,y1=part['y']
  if view=='front':coords=[(cx+x*512,850-z*512) for x,z in part['xz']]
  elif view=='side':coords=[(cx+y*512,850-z*512) for y,z in [(y0,min(zs)),(y1,min(zs)),(y1,max(zs)),(y0,max(zs))]]
  else:coords=[(cx+x*512,540+y*512) for x,y in [(min(xs),y0),(max(xs),y0),(max(xs),y1),(min(xs),y1)]]
  color={'Brick':'#846451','Plaster':'#9a9c92','TimberSoot':'#455766'}[part['role']]
  s.append('<polygon points="'+' '.join(f'{x:.2f},{y:.2f}' for x,y in coords)+f'" fill="{color}" stroke="#283c50" stroke-width="2"/>')
s.append('<path d="M512 950H1024M512 940V960M1024 940V960" stroke="#555" stroke-width="2"/><text x="768" y="988" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#666">1 m</text></svg>')
(p/'layout-template.svg').write_text(''.join(s))
(p/'sheet-metric.json').write_text(json.dumps({'pixelsPerMetre':512,'views':{'front':[50,500,465,880],'side':[565,500,975,880],'top':[1080,330,1490,750]}},indent=2)+'\n')
