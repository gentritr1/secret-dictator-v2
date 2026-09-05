"""Read-only seam and perspective measurements. Requires Pillow and numpy."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('image')
parser.add_argument('--output')
args = parser.parse_args()
a = np.asarray(Image.open(args.image).convert('RGB'), dtype=float)
h, w, _ = a.shape
# Boundary pairs are compared channel-by-channel, without alignment or repair.
lr = float(np.abs(a[:, 0] - a[:, -1]).mean())
tb = float(np.abs(a[0] - a[-1]).mean())
luma = a @ np.array([.2126, .7152, .0722])
# Average horizontal power over 16 independent horizontal bands. Restrict to
# broad cobble structure (3..24 cycles per width); brush grain is not a stone.
periods = []
for band in np.array_split(luma, 16):
    centred = band - band.mean(axis=1, keepdims=True)
    power = (np.abs(np.fft.rfft(centred * np.hanning(w), axis=1)) ** 2).mean(axis=0)
    k = int(np.argmax(power[3:25])) + 3
    # Sub-bin peak position avoids turning a slow perspective drift into steps.
    p = np.log(np.maximum(power[k-1:k+2], 1e-12))
    offset = .5 * (p[0] - p[2]) / (p[0] - 2*p[1] + p[2])
    offset = float(np.clip(offset, -.5, .5))
    periods.append(float(w / (k + offset)))
x = np.linspace(0, 1, len(periods))
y = np.asarray(periods)
pairs = [(i,j) for i in range(len(y)) for j in range(i+1,len(y))]
def trend(values):
    return float(np.median([(values[j]-values[i])/(x[j]-x[i]) for i,j in pairs]))
slope = trend(y)
fraction = float(slope / np.median(y))
rng = np.random.default_rng(1946)
permutations = 4096
p_value = (1 + sum(abs(trend(rng.permutation(y))) >= abs(slope) for _ in range(permutations))) / (permutations + 1)
# Theil-Sen resists occasional harmonic switches. Reject a systematic trend
# at two-sided 1%, or a robust >10% end-to-end period change.
no_slope = p_value >= .01 and abs(fraction) < .10
report = dict(image=args.image, sha256=hashlib.sha256(Path(args.image).read_bytes()).hexdigest(),
    width=w, height=h, edgeMeanAbsoluteRGB255=dict(leftRight=lr, topBottom=tb),
    spectral=dict(bands=16, frequencyRange=[3,24], periodsPx=periods,
        slopePixelsPerImageHeight=float(slope), relativeDrift=fraction,
        permutationP=p_value, permutations=permutations, pLimit=.01, relativeDriftLimit=.10),
    seamless=lr < 8 and tb < 8, noSpectralPeriodSlope=no_slope,
    accepted=lr < 8 and tb < 8 and no_slope)
text = json.dumps(report, indent=2) + '\n'
if args.output: Path(args.output).write_text(text)
print(text)
raise SystemExit(0 if report['accepted'] else 1)
