"""Read native sheet pixels; never resample or alter a reference."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'design/references/env-facade-a/sheet.png'
pixels = np.asarray(Image.open(source).convert('RGB')).astype(float)
views = [
    ('front', (50, 200, 465, 880), (76, 226, 436, 850)),
    ('side', (685, 200, 850, 880), (708, 226, 828, 850)),
    ('top', (1070, 400, 1480, 580), (1100, 430, 1460, 550)),
]
report = {'source': str(source.relative_to(root)), 'size': list(Image.open(source).size),
          'pixelsPerMetre': 80, 'panelWidth': 512, 'edgeTolerancePixels': 2,
          'method': 'Bounding blue-dark outline pixels: mean RGB <95 and B>R inside fixed view regions. Native image; no transforms.', 'views': []}
assert report['size'] == [1536, 1024]
for name, crop, expected in views:
    x0, y0, x1, y1 = crop
    p = pixels[y0:y1, x0:x1]
    y, x = np.where((p.mean(2) < 95) & (p[:, :, 2] > p[:, :, 0]))
    bounds = [int(x.min()+x0), int(y.min()+y0), int(x.max()+x0), int(y.max()+y0)]
    error = max(abs(a-b) for a, b in zip(bounds, expected))
    report['views'].append({'name': name, 'bounds': bounds, 'expected': expected, 'maxEdgeError': error})
    assert error <= 2, (name, bounds)
output = root / 'design/reviews/rubble-phase-2/env-facade-a/sheet-measurement.json'
output.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
