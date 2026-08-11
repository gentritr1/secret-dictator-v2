/*
 * The player's own body, weighed against the warm budget.
 *
 *   node scripts/capture-warm-body.mjs [outdir]
 *
 * One frame, two loads of the same URL: `?body=capsule` renders the graybox
 * capsule the player used to be and the plain URL renders the carved citizen
 * they are now. Same seed, same camera (the podium mark facing the dais), same
 * forced `trial` state, same classifier — the project's own, copied out of
 * `measure()` in src/play/lighting.js line for line.
 *
 * It exists because docs/step-13.md left the budget with ~2.3 points of
 * headroom and two claimants, and because attributing a warm change to the
 * wrong commit is the specific mistake that gate recorded nearly making. A
 * before/after taken across a branch says "something got warmer"; this says
 * which thing.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-14-juice';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function measure(query, tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://localhost:5173/play.html' + query);
  await page.waitForFunction(() => window.__play && window.__play.state());
  await page.evaluate(() => window.__play.restart(1000, 7, 0));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__play.pause());
  await page.evaluate(() => window.__play.setLighting('trial', true));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const m = window.__play.marks.podium;
    window.__play.teleport(m.x, 0, m.z);
    window.__play.face(0, 9);
  });
  await page.waitForTimeout(300);
  const body = await page.evaluate(() => window.__play.cast.you);
  const buf = await page.screenshot({ path: `${OUT}/${tag}.png` });
  const px = await page.evaluate(async (dataUrl) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g2 = c.getContext('2d'); g2.drawImage(img, 0, 0);
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
  await page.close();
  return { tag, body: body.variant || 'capsule', capsule: body.capsule,
    warmPct: +(px.warm / px.total * 100).toFixed(2),
    litPct: +(px.lit / px.total * 100).toFixed(2), samples: px.total };
}

const capsule = await measure('?body=capsule', '07-body-capsule');
const figure = await measure('', '07-body-figure');
console.log(JSON.stringify({ capsule, figure,
  deltaPt: +(figure.warmPct - capsule.warmPct).toFixed(2), budgetPct: 10 }, null, 2));
await browser.close();
