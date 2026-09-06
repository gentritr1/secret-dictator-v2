"""Measure native generated view bounds against the authored stroked template."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

asset = sys.argv[1]
assert asset in ['env-facade-b', 'env-facade-c']
root = Path('design/references') / asset
views = [('front', (50, 200, 480, 880)), ('side', (675, 200, 860, 880)), ('top', (1070, 390, 1490, 600))]
report = {'asset': asset, 'pixelsPerMetre': 80, 'panelWidth': 512, 'tolerancePixels': 2,
          'method': 'Native blue-dark outline bounding boxes against authored template, including stroke width. No transforms.', 'views': []}
pixels = []
for name in ['layout-template.png', 'sheet.png']:
    image = Image.open(root / name).convert('RGB')
    assert image.size == (1536, 1024)
    pixels.append(np.array(image).astype(float))
for name, (x0, y0, x1, y1) in views:
    bounds = []
    for image in pixels:
        p = image[y0:y1, x0:x1]
        y, x = np.where((p.mean(2) < 95) & (p[:, :, 2] > p[:, :, 0]))
        bounds.append([int(x.min()+x0), int(y.min()+y0), int(x.max()+x0), int(y.max()+y0)])
    error = max(abs(a-b) for a, b in zip(*bounds))
    report['views'].append({'view': name, 'template': bounds[0], 'generated': bounds[1], 'maxError': error})
report['passes'] = all(v['maxError'] <= 2 for v in report['views'])
Path(f'design/reviews/rubble-phase-2/{asset}/sheet-measurement.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
assert report['passes']
