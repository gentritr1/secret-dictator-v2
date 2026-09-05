import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { measurePixels } from './rubble-pixels.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5183';
const out = process.argv[3] || 'design/reviews/baseline-v2';
const source = process.argv[4] || '/private/tmp/rubble-square-baseline';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/play.html');
  await page.waitForFunction(() => window.__play?.state());
  await page.waitForTimeout(2500);
  await page.addScriptTag({ content: 'window.measureRubblePixels = ' + measurePixels.toString() + ';' });
  async function pixels(bytes) {
    return page.evaluate(async (src) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      return window.measureRubblePixels(context.getImageData(0, 0, image.width, image.height).data, image.width, image.height);
    }, 'data:image/png;base64,' + bytes.toString('base64'));
  }
  const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source }).toString().trim(),
    sourceWorktree: source, url, seed: 1000, players: 7, human: 0, reducedMotion: true,
    classifier: 'scripts/rubble-pixels.mjs (same HSL thresholds as scripts/capture-warm.mjs)',
    camera: 'podium mark facing (0,9), default chase framing', states: {}, moods: {} };
  for (const state of ['day', 'dusk', 'trial']) {
    await page.evaluate(() => window.__play.restart(1000, 7, 0));
    await page.waitForTimeout(2400);
    await page.evaluate((state) => {
      const p = window.__play; p.pause(); p.setLighting(state, true);
      p.teleport(p.marks.podium.x, 0, p.marks.podium.z); p.face(0, 9);
    }, state);
    await page.waitForTimeout(500);
    await page.bringToFront();
    const hud = await pixels(await page.screenshot({ path: `${out}/${state}-hud.png` }));
    await page.evaluate(() => {
      for (const id of ['tray', 'card', 'objective', 'controls', 'prompt']) {
        const el = document.getElementById(id); if (el) el.style.visibility = 'hidden';
      }
    });
    await page.waitForTimeout(140);
    const scene = await pixels(await page.screenshot({ path: `${out}/${state}-no-hud.png` }));
    const stats = await page.evaluate(() => window.__play.stats);
    const lighting = await page.evaluate(() => window.__play.lighting({ measure: true }));
    report.states[state] = { hud, scene, stats, lighting };
    await page.evaluate(() => {
      for (const id of ['tray', 'card', 'objective', 'controls', 'prompt']) {
        const el = document.getElementById(id); if (el) el.style.visibility = '';
      }
    });
    console.log(state, JSON.stringify({ warmHud: hud.warmPct, warmScene: scene.warmPct, stats, darkest: scene.darkest }));
  }
  for (const name of ['square-dusk-rubble', 'night-tribunal-searchlight', 'day-queue-notice-board', 'citizens-lineup-1946']) {
    report.moods[name] = await pixels(readFileSync(`${source}/design/concepts/rubble/${name}.png`));
  }
  await page.evaluate(() => window.__play.restart(1000, 7, 0));
  await page.waitForTimeout(700);
  const fingerprint = await page.evaluate(() => window.__play.runToEnd());
  writeFileSync(`${out}/fingerprint.json`, JSON.stringify(fingerprint) + '\n');
  report.errors = errors;
  writeFileSync(`${out}/measurements.json`, JSON.stringify(report, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
