/*
 * The warm budget, before and after — nothing else.
 *
 *   node scripts/capture-warm.mjs [outdir] [tag]
 *
 * The same 1280 x 720 frame, the same camera (the podium mark, facing the
 * dais), the same forced `trial` state and the same CLASSIFIER as every warm
 * number in docs/: the project's own, copied out of `measure()` in
 * src/play/lighting.js line for line (hue 15-70 degrees, saturation > 0.16,
 * lightness > 0.18). docs/step-11.md records why a second rule of one's own is
 * not comparable to the budget.
 *
 * It exists because docs/step-13.md left the budget with ~2.3 points of
 * headroom and two claimants, and said the next thing to add warm to a night
 * frame must measure its own baseline rather than quote last week's.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-14-juice';
const TAG = process.argv[3] || 'warm';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());

async function warmOf(name) {
  const buf = await page.screenshot({ path: `${OUT}/${name}.png` });
  return page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g2 = c.getContext('2d');
    g2.drawImage(img, 0, 0);
    const d = g2.getImageData(0, 0, c.width, c.height).data;
    let warm = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l > 0.14) lit++;
      if (max === min) continue;
      const diff = max - min;
      const s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
      let hue;
      if (max === r) hue = ((g - b) / diff + (g < b ? 6 : 0));
      else if (max === g) hue = (b - r) / diff + 2;
      else hue = (r - g) / diff + 4;
      hue *= 60;
      if (hue >= 15 && hue <= 70 && s > 0.16 && l > 0.18) warm++;
    }
    return { warm, lit, total: d.length / 4 };
  }, 'data:image/png;base64,' + buf.toString('base64'));
}

const podium = await page.evaluate(() => window.__play.marks.podium);

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(2400);
await page.evaluate(() => window.__play.pause());
await page.evaluate(() => window.__play.setLighting('trial', true));
await page.waitForTimeout(420);
await page.evaluate((m) => { window.__play.teleport(m.x, 0, m.z); window.__play.face(0, 9); }, podium);
await page.waitForTimeout(200);

const withHud = await warmOf(`${TAG}-trial-hud`);
await page.evaluate(() => {
  for (const id of ['tray', 'card', 'objective', 'controls', 'prompt']) {
    const n = document.getElementById(id);
    if (n) n.style.visibility = 'hidden';
  }
});
await page.waitForTimeout(140);
const noHud = await warmOf(`${TAG}-trial-no-hud`);

const own = await page.evaluate(() => {
  const l = window.__play.lighting({ measure: true });
  return { state: l.target, scene: +(l.warm.warmFraction * 100).toFixed(2),
    budget: l.warm.budget * 100, samples: l.warm.samples,
    lanternsLit: l.lanterns.filter((x) => x.lit).length };
});

const pct = (o) => +(o.warm / o.total * 100).toFixed(2);
console.log(JSON.stringify({
  tag: TAG, camera: 'podium mark facing the dais', frame: '1280x720', state: own.state,
  lanternsLit: own.lanternsLit,
  warmWithHudPct: pct(withHud), warmNoHudPct: pct(noHud),
  hudCostPt: +(pct(withHud) - pct(noHud)).toFixed(2),
  litWithHudPct: +(withHud.lit / withHud.total * 100).toFixed(2),
  samples: withHud.total,
  offscreenProbePct: own.scene, budgetPct: own.budget
}, null, 2));
console.log('CONSOLE', JSON.stringify(msgs.filter((m) => !/\[info\]/.test(m))));
await browser.close();
