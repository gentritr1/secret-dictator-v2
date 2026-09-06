"""Compare native prop-sheet boundaries with their authored metre-scale guide."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image
asset=sys.argv[1]
folder=Path('design/references')/asset
config=json.loads((folder/'sheet-metric.json').read_text())
images=[]
for name in ['layout-template.png','sheet.png']:
    im=Image.open(folder/name).convert('RGB')
    assert im.size==(1536,1024)
    images.append(np.array(im).astype(float))
report={'asset':asset,'method':'Native blue-dark object-edge bounds against authored guide. No resampling or relayout. Internal part counts inspected separately.','pixelsPerMetre':config['pixelsPerMetre'],'tolerancePixels':2,'views':[]}
for name,roi in config['views'].items():
    x0,y0,x1,y1=roi;bounds=[]
    for im in images:
        crop=im[y0:y1,x0:x1];ys,xs=np.where((crop.mean(2)<95)&(crop[:,:,2]>crop[:,:,0]))
        assert len(xs)>0
        bounds.append([int(xs.min()+x0),int(ys.min()+y0),int(xs.max()+x0),int(ys.max()+y0)])
    error=max(abs(a-b) for a,b in zip(*bounds))
    report['views'].append({'view':name,'template':bounds[0],'generated':bounds[1],'maxError':error})
report['passes']=all(v['maxError']<=2 for v in report['views'])
Path(f'design/reviews/rubble-phase-2/{asset}/sheet-measurement.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report));assert report['passes']
