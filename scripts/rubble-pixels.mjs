// Screenshot classifier copied from scripts/capture-warm.mjs; histogram bins are 16-wide.
export function measurePixels(data, width, height) {
  let warm = 0, lit = 0;
  const histogram = new Map();
  let darkest = { rgb: null, luma: Infinity, x: 0, y: 0 };
  for (let i = 0; i < data.length; i += 4) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (l > 0.14) lit++;
    if (max !== min) {
      const diff = max - min;
      const s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
      let hue;
      if (max === r) hue = (g - b) / diff + (g < b ? 6 : 0);
      else if (max === g) hue = (b - r) / diff + 2;
      else hue = (r - g) / diff + 4;
      hue *= 60;
      if (hue >= 15 && hue <= 70 && s > 0.16 && l > 0.18) warm++;
    }
    const luma = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
    if (luma < darkest.luma) darkest = { rgb, luma, x: (i / 4) % width, y: Math.floor(i / 4 / width) };
    const hex = '#' + rgb.map((v) => (Math.floor(v / 16) * 16 + 8).toString(16).padStart(2, '0')).join('');
    histogram.set(hex, (histogram.get(hex) || 0) + 1);
  }
  const total = data.length / 4;
  return { width, height, total, warm, warmPct: warm / total * 100, litPct: lit / total * 100, darkest,
    histogram: [...histogram].sort((a, b) => b[1] - a[1]).map(([hex, count]) => ({ hex, count, pct: count / total * 100 })) };
}
