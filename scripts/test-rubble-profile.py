"""Positive/negative controls for the spectral-period measurement."""
import json,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
results={}
with tempfile.TemporaryDirectory() as directory:
 for name,perspective in [('constant',False),('perspective',True)]:
  w=h=1024;x=np.linspace(0,1,w);y=np.linspace(0,1,h)
  cycles=(4+5*y)[:,None] if perspective else np.full((h,1),6.)
  a=128+50*np.sin(2*np.pi*x[None,:]*cycles)
  image=Path(directory)/(name+'.png');Image.fromarray(np.repeat(a[:,:,None],3,axis=2).astype('uint8')).save(image)
  run=subprocess.run(['python3','scripts/profile-rubble-texture.py',str(image)],capture_output=True,text=True)
  r=json.loads(run.stdout);results[name]=r['spectral']|{'noSpectralPeriodSlope':r['noSpectralPeriodSlope']}
assert results['constant']['noSpectralPeriodSlope']
assert not results['perspective']['noSpectralPeriodSlope']
Path('design/reviews/rubble-phase-1/profile-controls.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
