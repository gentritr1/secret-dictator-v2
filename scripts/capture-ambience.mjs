/*
 * The Gate 13 acceptance set: the lanterns, the board as weather, and the warm
 * budget re-measured with real lights hanging in the square.
 *
 *   node scripts/capture-ambience.mjs [outdir]
 *
 * Needs `npm run dev` on 5173. 1280 x 720, the same viewport every warm number
 * in docs/ has ever been taken at, because a percentage of a frame is a
 * different number at a different frame size.
 *
 * What a headless gate cannot answer and this can:
 *
 *   - are the lanterns actually LIT at night and actually OUT by day. The node
 *     gate pins the declared intensities; only a renderer can say what three.js
 *     did with a point light hung on a socket.
 *   - the warm-pixel fraction of a night frame WITH the lanterns burning and
 *     the HUD composited. That is the number the style bible's 10% is about,
 *     and adding two warm lights to the square is exactly the change that could
 *     have spent it.
 *   - the weather: the same camera, the same forced lighting state, the same
 *     seat, photographed at zero, one and two lanterns out — plus the LIT
 *     fraction of each frame, so "the square got darker but stayed readable" is
 *     a measurement beside the screenshots rather than an adjective.
 *   - the Reform response, which is temporal and therefore invisible in a still:
 *     read numerically off the director.
 *
 * THE CLASSIFIER IS THE PROJECT'S OWN, copied out of `measure()` in
 * src/play/lighting.js line for line (hue 15-70 degrees, saturation > 0.16,
 * lightness > 0.18) — the same copy scripts/capture-hud.mjs makes, and for the
 * reason docs/step-11.md records: a plausible rule of one's own gave 5.81% where
 * the project's rule gave 7.29% on the same frame, and only the second number
 * is comparable to the budget.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-13-ambience';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());

/** Warm pixels over the composited frame, HUD included. */
async function warmOfScreenshot(name) {
  const buf = await page.screenshot({ path: `${OUT}/${name}.png` });
  const png = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g2 = c.getContext('2d');
    g2.drawImage(img, 0, 0);
    const d = g2.getImageData(0, 0, c.width, c.height).data;
    let warm = 0;
    let lit = 0;
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
  return {
    name,
    warmPct: +(png.warm / png.total * 100).toFixed(2),
    litPct: +(png.lit / png.total * 100).toFixed(2),
    samples: png.total
  };
}

/** The same frame counted twice, so the HUD's own contribution is measured. */
async function pair(name) {
  const withHud = await warmOfScreenshot(name);
  await page.evaluate(() => {
    for (const id of ['tray', 'card', 'objective', 'controls', 'prompt']) {
      const n = document.getElementById(id);
      if (n) n.style.visibility = 'hidden';
    }
  });
  await page.waitForTimeout(120);
  const without = await warmOfScreenshot(name + '-no-hud');
  await page.evaluate(() => {
    for (const id of ['tray', 'card', 'objective', 'controls', 'prompt']) {
      const n = document.getElementById(id);
      if (n) n.style.visibility = '';
    }
  });
  const own = await page.evaluate(() => {
    const l = window.__play.lighting({ measure: true });
    return {
      light: l.target,
      scene: +(l.warm.warmFraction * 100).toFixed(2),
      budget: l.warm.budget * 100,
      lanternsLit: l.lanterns.filter((x) => x.lit).length,
      lanterns: l.lanterns
    };
  });
  console.log('WARM PAIR'.padEnd(22), JSON.stringify({
    frame: name, light: own.light, lanternsLit: own.lanternsLit,
    withHud: withHud.warmPct, withoutHud: without.warmPct,
    hudCost: +(withHud.warmPct - without.warmPct).toFixed(2),
    sceneOnly: own.scene, budget: own.budget, samples: withHud.samples
  }));
  return { withHud, without, own };
}

async function standAt(mark, face) {
  await page.evaluate(([m, f]) => {
    window.__play.teleport(m.x, 0, m.z);
    window.__play.face(f.x, f.z);
  }, [mark, face]);
  await page.waitForTimeout(160);
}

const light = () => page.evaluate(() => {
  const l = window.__play.lighting();
  return {
    target: l.target, arrived: l.arrived,
    weather: l.weather, weatherMapped: l.weatherMapped,
    lanterns: l.lanterns, flame: l.flame,
    beam: l.beam.intensity, hemi: l.hemi.intensity
  };
});

const podium = await page.evaluate(() => window.__play.marks.podium);
const DAIS = { x: 0, z: 9 };

/* ------------------------------------------------------------- 1. the day */

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(2600);
await standAt(podium, DAIS);
console.log('LANTERNS HUNG'.padEnd(22), JSON.stringify(await page.evaluate(
  () => window.__play.lighting().lanterns.map((l) => ({ name: l.name, at: l.at })))));
const day = await light();
console.log('DAY'.padEnd(22), JSON.stringify({
  state: day.target, lanterns: day.lanterns.map((l) => l.intensity), beam: day.beam
}));
await warmOfScreenshot('01-day-lanterns-off').then((r) => console.log('  frame', JSON.stringify(r)));

/* ------------------------------------------------------------ 2. the night */

/* A real trial, played to rather than forced: the state the budget is about. */
await page.evaluate(() => window.__play.autopilot(true));
await page.waitForFunction(() => window.__play.lighting().target === 'trial', null, { timeout: 60000 });
await page.evaluate(() => window.__play.autopilot(false));
await page.waitForTimeout(2400);
await standAt(podium, DAIS);
const night = await light();
console.log('NIGHT (real trial)'.padEnd(22), JSON.stringify({
  state: night.target, lanterns: night.lanterns.map((l) => ({ lit: l.lit, i: l.intensity })),
  beam: night.beam, flame: night.flame
}));
await pair('02-night-trial-lanterns-lit');

/* ---------------------------------------------------- 3. the board as weather */

/*
 * The same seat, the same camera and the same FORCED lighting state at zero,
 * one and two lanterns out, so the only difference between the three frames is
 * the weather. `setLighting` aims the rig without overriding the mapping (the
 * next refresh aims it back), and the weather is independent of the state — it
 * is a function of the Seize count and nothing else — so this is the honest way
 * to photograph one variable.
 */
async function weatherShot(tag) {
  /*
   * STOP THE MATCH FIRST. `setLighting` aims the rig, and the very next
   * refresh() aims it back — so with the loop running, a bot acting half a
   * second later re-lit the frame and the first version of this script
   * photographed three different lighting states and called them a weather
   * comparison. The giveaway was the lit fraction going 37.9 -> 71.1 -> 25.2,
   * which is not what one lantern going out looks like.
   */
  await page.evaluate(() => window.__play.pause());
  await page.evaluate(() => window.__play.setLighting('trial', true));
  await page.waitForTimeout(420);
  await standAt(podium, DAIS);
  const l = await light();
  const frame = await warmOfScreenshot(tag);
  console.log('WEATHER'.padEnd(22), JSON.stringify({
    frame: tag, seizes: l.weather.seizes, out: l.weather.out, overflow: l.weather.overflow,
    lanterns: l.lanterns.map((x) => (x.lit ? +x.intensity.toFixed(2) : 'OUT')),
    warmPct: frame.warmPct, litPct: frame.litPct
  }));
  return { l, frame };
}

/*
 * A seed that actually puts Seizes on the board. Seat 0 answers with `auto()`,
 * which takes the first advertised option every time — deterministic, and it
 * fails enough governments that the Chaos track enacts.
 */
await page.evaluate(() => window.__play.restart(4242, 7, 0));
await page.waitForTimeout(2400);
const before = await weatherShot('03-weather-0-seizes');

async function playUntilSeizes(n) {
  await page.evaluate(() => window.__play.resume());
  await page.waitForFunction((want) => {
    if (window.__play.state().seize >= want) return true;
    if (window.__play.state().phase === 'game_over') return true;
    const w = window.__play.waitingFor();
    if (w) window.__play.auto(); else window.__play.step();
    return false;
  }, n, { timeout: 120000, polling: 40 });
  await page.waitForTimeout(300);
}

await playUntilSeizes(1);
const one = await weatherShot('04-weather-1-seize');
await playUntilSeizes(2);
const two = await weatherShot('05-weather-2-seizes');

console.log('READABILITY'.padEnd(22), JSON.stringify({
  litPct: [before.frame.litPct, one.frame.litPct, two.frame.litPct],
  warmPct: [before.frame.warmPct, one.frame.warmPct, two.frame.warmPct],
  note: 'same camera, same forced trial state; only the Seize count differs'
}));

/* --------------------------------------------------- 4. the Reform response */

/*
 * Temporal, so it is read rather than photographed: a Reform sets the flame's
 * steadiness to 1 (dead still) and it eases back over REFORM_EASE_MS. Sampled
 * at the moment the tile lands and again after the window.
 */
await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(2200);
await page.waitForFunction(() => {
  if (window.__play.state().reform >= 1) return true;
  const w = window.__play.waitingFor();
  if (w) window.__play.auto(); else window.__play.step();
  return false;
}, null, { timeout: 120000, polling: 40 });
const atReform = await light();
await page.waitForTimeout(1200);
const soonAfter = await light();
await page.waitForTimeout(6000);
const wellAfter = await light();
console.log('REFORM RESPONSE'.padEnd(22), JSON.stringify({
  onEnact: atReform.flame, after1_2s: soonAfter.flame, after7_2s: wellAfter.flame,
  reforms: await page.evaluate(() => window.__play.state().reform)
}));

/* ------------------------------------------------------- 5. the fingerprint */

const fingerprint = await page.evaluate(() => {
  window.__play.restart(1000, 7, 0);
  return window.__play.runToEnd();
});
console.log('FINGERPRINT'.padEnd(22), JSON.stringify(fingerprint));

/* ------------------------------------------------------------ 6. the console */

const noise = msgs.filter((m) => !/\[info\]|vite|Download the React|GPU stall/.test(m));
console.log('CONSOLE'.padEnd(22), noise.length ? JSON.stringify(noise, null, 2) : 'clean');
console.log('INFO LINES'.padEnd(22), JSON.stringify(msgs.filter((m) => /\[lighting\]/.test(m))));

await browser.close();
