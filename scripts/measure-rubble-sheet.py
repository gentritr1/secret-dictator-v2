"""Read-only mask measurement of the accepted sheet; never resizes artwork."""
from PIL import Image
import numpy as np,json,hashlib
from pathlib import Path
p=Path('design/references/env-backdrop-a/sheet.png');a=np.asarray(Image.open(p).convert('RGB'),dtype=int)
report={'image':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':[a.shape[1],a.shape[0]],'panelWidthPx':512,'pixelsPerMetre':5,'baselineY':720,'views':{}}
# Isolate blue-filled elevations from the neutral background, excluding guides.
for label,x0,x1 in [('front',54,458),('side',566,970)]:
    crop=a[590:722,x0:x1];mask=(crop[:,:,2]-crop[:,:,0]>10)&(crop[:,:,0]<140)
    ys,xs=np.nonzero(mask)
    bounds=[int(xs.min()+x0),int(ys.min()+590),int(xs.max()+x0),int(ys.max()+590)]
    width=bounds[2]-bounds[0];height=bounds[3]-bounds[1]
    report['views'][label]={'boundsPx':bounds,'widthPx':width,'heightPx':height,'expectedWidthPx':400,'expectedHeightPx':130,'passes':abs(width-400)<=2 and abs(height-130)<=2}
# Top thin lines are dark relative to the flat grey inside this isolated ROI.
mask=(a[298:702,1078:1483].mean(axis=2)<115)
ys,xs=np.nonzero(mask);bounds=[int(xs.min()+1078),int(ys.min()+298),int(xs.max()+1078),int(ys.max()+298)]
report['views']['top']={'boundsPx':bounds,'widthPx':bounds[2]-bounds[0],'heightPx':bounds[3]-bounds[1],'expectedDiameterPx':400,'passes':abs(bounds[2]-bounds[0]-400)<=2 and abs(bounds[3]-bounds[1]-400)<=2}
report['acceptedLayout']=all(v['passes'] for v in report['views'].values())
report['limits']='Bounding boxes validate layout only. Occluded motif counts are checked separately against the authored GLB; this script does not certify semantic sheet accuracy.'
Path('design/reviews/rubble-phase-1/backdrop-sheet-measurements.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
assert report['acceptedLayout']
