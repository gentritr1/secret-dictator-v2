"""Read-only panoramic warmth/luma gate with the baseline HSL classifier."""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('--output');args=p.parse_args()
a=np.asarray(Image.open(args.image).convert('RGB'),dtype=float)/255
h,w,_=a.shape
r,g,b=a[:,:,0],a[:,:,1],a[:,:,2]
hi=a.max(axis=2);lo=a.min(axis=2);diff=hi-lo;l=(hi+lo)/2
s=np.divide(diff,np.where(l>.5,2-hi-lo,hi+lo),out=np.zeros_like(l),where=diff>0)
hue=np.zeros_like(l)
np.divide(g-b,diff,out=hue,where=(hi==r)&(diff>0));hue+=np.where((hi==r)&(g<b),6,0)
mask=(hi!=r)&(hi==g)&(diff>0);hue[mask]=(b[mask]-r[mask])/diff[mask]+2
mask=(hi!=r)&(hi!=g)&(diff>0);hue[mask]=(r[mask]-g[mask])/diff[mask]+4
hue*=60
warm=((diff>0)&(hue>=15)&(hue<=70)&(s>.16)&(l>.18)).mean(axis=0)
luma=(a @ np.array([.2126,.7152,.0722])).mean(axis=0)
span=max(1,round(w*10/360))
windows=np.lib.stride_tricks.sliding_window_view(np.concatenate([warm,warm[:span-1]]),span)
internal=float(np.ptp(windows,axis=1).max())
means=windows.mean(axis=1);adjacent=float(np.abs(means-np.roll(means,span)).max())
ratio=float(luma.max()/luma.min())
report=dict(image=args.image,sha256=hashlib.sha256(Path(args.image).read_bytes()).hexdigest(),width=w,height=h,
 classifier='HSL hue 15..70 inclusive, saturation>.16, lightness>.18',
 windowDegrees=10,windowColumns=span,maxWithinWindowWarmChange=internal,maxAdjacentWindowWarmChange=adjacent,
 columnLumaRatio=ratio,leftRightMeanAbsoluteRGB255=float(abs(a[:,0]-a[:,-1]).mean()*255),
 columns=[dict(x=i,warm=float(warm[i]),luma=float(luma[i])) for i in range(w)],
 accepted=internal<=.05 and adjacent<=.05 and ratio<=2)
text=json.dumps(report,indent=2)+'\n'
if args.output:Path(args.output).write_text(text)
print(json.dumps({k:v for k,v in report.items() if k!='columns'},indent=2))
raise SystemExit(0 if report['accepted'] else 1)
