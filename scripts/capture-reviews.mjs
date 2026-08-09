/*
 * Fixed acceptance captures, through the real browser.
 *
 * BLENDER_PIPELINE.md: "The fixed browser capture is the final truth; a Blender
 * render is a work preview." This script drives asset-lab.html headlessly at
 * the pipeline's 1440x900 and writes the seven required views (the front view
 * doubles as "scale beside capsule/ruler" — the 1.70 m capsule and 0.25 m
 * banded pole are always in the review frames).
 *
 *   node scripts/capture-reviews.mjs <asset-id> [category]
 *   node scripts/capture-reviews.mjs env-dais-a environment
 *
 * Needs `npm run dev` on 5173. Output: design/reviews/<asset-id>/*.png,
 * overwriting previous browser captures (Blender previews live under
 * blender-preview-*.png and are not touched).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const id = process.argv[2] || 'env-dais-a';
const category = process.argv[3] || 'environment';
const outdir = `design/reviews/${id}`;
mkdirSync(outdir, { recursive: true });

const SHOTS = [
  { file: 'front.png',            camera: 'front',         mood: 'day',        collider: false },
  { file: 'three-quarter.png',    camera: 'three-quarter', mood: 'day',        collider: false },
  { file: 'side.png',             camera: 'side',          mood: 'day',        collider: false },
  { file: 'game-camera.png',      camera: 'game',          mood: 'day',        collider: false },
  /* Silhouette uses the LOW front camera on purpose: from the three-quarter
   * view's 35° elevation a short prop can project entirely inside its base's
   * outline and vanish black-on-black (the dais lectern does exactly that).
   * A silhouette only judges shape where the shape breaks the outline. */
  { file: 'silhouette.png',       camera: 'front',         mood: 'silhouette', collider: false },
  { file: 'collider-overlay.png', camera: 'three-quarter', mood: 'day',        collider: true },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });

await page.goto(`http://localhost:5173/asset-lab.html?asset=${category}/${id}.glb`);
await page.waitForFunction(() => window.__lab && window.__lab.report && window.__lab.report.file);

for (const shot of SHOTS) {
  await page.evaluate((s) => {
    window.__lab.camera(s.camera);
    window.__lab.mood(s.mood);
    window.__lab.collider(s.collider);
  }, shot);
  await page.waitForTimeout(250); // let the paint settle
  await page.screenshot({ path: `${outdir}/${shot.file}` });
  const stats = await page.evaluate(() => window.__lab.stats);
  console.log(`${shot.file.padEnd(22)} camera=${shot.camera.padEnd(13)} mood=${shot.mood.padEnd(10)}` +
    ` collider=${shot.collider}  calls=${stats.calls} tris=${stats.triangles}`);
}

console.log('report:', JSON.stringify(await page.evaluate(() => window.__lab.report)));
await browser.close();
