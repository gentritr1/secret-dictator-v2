/*
 * Ground-only luma percentiles for the trial frame: the phase-5 floor instrument.
 *
 * The retired absolute floor compared a single darkest pixel, which in both the
 * branch point and phase 1 was the lantern's black cap, not the ground. This
 * script renders a ground ID mask (VIS_cobble_field, VIS_cobble_accent,
 * VIS_tram_scars) with every other mesh occluding, erodes one pixel, and reads
 * the unmodified 1280x720 trial screenshot under that mask. It reports p1, p5
 * and the median of ground luma, the share of ground pixels below luma 4 and 8,
 * the mean colour of the darkest 5% band, and the single-pixel minima kept for
 * continuity with the phase-1 minimum-only version of this script.
 *
 * Acceptance (brief, phase 5): p1 and p5 no darker than the same script on the
 * branch-point worktree, and the p5 band's mean colour bluer than red
 * (b > r) so the dark reads as blue, never black.
 *
 * Usage: REVIEW_URL=http://localhost:5184 node scripts/measure-rubble-ground-floor.mjs <outDir>
 * Vite here binds IPv6 loopback only, so use localhost, not 127.0.0.1.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.REVIEW_URL || 'http://localhost:5184';
const out = process.argv[2] || 'design/reviews/rubble-phase-1';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = { url: base, instrumentation: 'Browser route appends temporary review access; production files are unchanged.', errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.route('**/src/play/main.js*', async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: await r.text() + '\nwindow.__rubbleReview={scene,rig,renderer,lighting,THREE};\n' });
  });
  await page.goto(base + '/play.html');
  await page.waitForFunction(() => window.__rubbleReview && window.__play?.environment.ok);
  await page.waitForTimeout(2400);
  await page.evaluate(() => { window.__play.restart(1000, 7, 0); });
  await page.waitForTimeout(2400);
  await page.evaluate(() => {
    const p = window.__play; p.pause(); p.setLighting('trial', true);
    p.teleport(p.marks.podium.x, 0, p.marks.podium.z); p.face(0, 9);
    for (const id of ['tray', 'card', 'objective', 'controls', 'prompt']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
  });
  await page.waitForTimeout(500);
  const frame = await page.screenshot({ path: out + '/ground-floor-frame.png' });
  report.ground = await page.evaluate(async (data) => {
    const im = new Image(); im.src = data; await im.decode();
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
    const rgb = ctx.getImageData(0, 0, 1280, 720).data;
    const { scene, rig, renderer, THREE } = window.__rubbleReview;
    const changed = []; const fog = scene.fog, background = scene.background;
    scene.fog = null; scene.background = new THREE.Color(0);
    scene.traverse((n) => {
      if (!n.isMesh) return;
      const floor = /VIS_cobble_field|VIS_cobble_accent|VIS_tram_scars/.test(n.name);
      const mat = new THREE.MeshBasicMaterial({ color: floor ? 0xffffff : 0, side: THREE.DoubleSide, toneMapped: false });
      changed.push([n, n.material, mat]); n.material = mat;
    });
    const target = new THREE.WebGLRenderTarget(1280, 720); const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target); renderer.render(scene, rig.camera);
    const mask = new Uint8Array(1280 * 720 * 4); renderer.readRenderTargetPixels(target, 0, 0, 1280, 720, mask);
    renderer.setRenderTarget(previous); target.dispose();
    for (const [n, old, mat] of changed) { n.material = old; mat.dispose(); }
    scene.fog = fog; scene.background = background;
    const samples = []; const minima = [255, 255, 255]; let darkest = null;
    for (let y = 1; y < 719; y++) for (let x = 1; x < 1279; x++) {
      const index = ((719 - y) * 1280 + x) * 4;
      if ([0, -4, 4, -5120, 5120].some((d) => mask[index + d] < 250)) continue;
      const i = (y * 1280 + x) * 4, a = [rgb[i], rgb[i + 1], rgb[i + 2]];
      const l = a[0] * .2126 + a[1] * .7152 + a[2] * .0722;
      samples.push({ l, a });
      for (let k = 0; k < 3; k++) minima[k] = Math.min(minima[k], a[k]);
      if (!darkest || l < darkest.luma) darkest = { rgb: a, luma: l, x, y };
    }
    samples.sort((p, q) => p.l - q.l);
    const at = (f) => samples[Math.floor(f * (samples.length - 1))].l;
    const below = (t) => samples.filter((s) => s.l < t).length / samples.length * 100;
    const band = samples.slice(0, Math.max(1, Math.floor(samples.length * .05)));
    const mean = [0, 1, 2].map((k) => band.reduce((s, v) => s + v.a[k], 0) / band.length);
    return {
      method: 'Ground VIS ID render with all other meshes occluding, eroded one pixel, sampled against the unmodified 1280x720 trial screenshot at the podium mark facing (0,9), seed 1000 / 7 players, HUD hidden.',
      pixels: samples.length,
      p1: at(.01), p5: at(.05), p50: at(.5),
      pctBelowLuma4: below(4), pctBelowLuma8: below(8),
      p5BandMeanRgb: mean, p5BandBlueOverRed: mean[2] > mean[0],
      darkest, channelMinima: minima
    };
  }, 'data:image/png;base64,' + frame.toString('base64'));
  writeFileSync(out + '/ground-floor-measurement.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.ground));
} finally { await browser.close(); }
