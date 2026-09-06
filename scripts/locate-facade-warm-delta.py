"""Read-only pixel localization; gate totals still come from rubble-pixels.mjs."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path('design/reviews/rubble-phase-2/env-facade-a')

def warm(image):
    rgb = image[:, :, :3].astype(float) / 255
    red, green, blue = rgb.transpose(2, 0, 1)
    high, low = rgb.max(2), rgb.min(2)
    difference = high - low
    lightness = (high + low) / 2
    with np.errstate(divide='ignore', invalid='ignore'):
        saturation = np.where(lightness > .5, difference / (2 - high - low), difference / (high + low))
        hue = np.where(high == red, (green - blue) / difference + np.where(green < blue, 6, 0),
                       np.where(high == green, (blue - red) / difference + 2, (red - green) / difference + 4)) * 60
    return (difference > 0) & (hue >= 15) & (hue <= 70) & (saturation > .16) & (lightness > .18)

measurement = json.loads((OUT / 'paired-warm/measurement.json').read_text())
results = []
for pair in measurement['pairs']:
    if pair['state'] != 'trial':
        continue
    prefix = str(pair['index']) + '-trial-'
    before = np.array(Image.open(OUT / 'paired-warm' / (prefix + 'before-scene.png')))
    after = np.array(Image.open(OUT / 'paired-warm' / (prefix + 'after-scene.png')))
    first, second = warm(before), warm(after)
    assert int(first.sum()) == pair['before']['scene']['warm']
    assert int(second.sum()) == pair['after']['scene']['warm']
    result = {'index': pair['index']}
    for name, mask in [('gained', second & ~first), ('lost', first & ~second)]:
        result[name] = [{'x': int(x), 'y': int(y), 'before': before[y, x, :3].tolist(),
                         'after': after[y, x, :3].tolist()} for y, x in np.argwhere(mask)]
    results.append(result)
(OUT / 'warm-delta-pixels.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results))
