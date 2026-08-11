/*
 * The Gate 14 acceptance set: the five moments of the design doc's juice map,
 * plus the player's own body.
 *
 *   node scripts/capture-juice.mjs [outdir]
 *
 * Needs `npm run dev` on 5173. 1280 x 720, the same viewport every warm number
 * in docs/ has ever been taken at, because a percentage of a frame is a
 * different number at a different frame size.
 *
 * WHAT A HEADLESS GATE CANNOT ANSWER AND THIS CAN. test/stage.test.js proves the
 * SCHEDULE — that the ballots are 180 ms apart in the plan and the purge
 * declares 800 ms of silence. It cannot prove that the page ran the schedule.
 * The two are different claims and the second one is the one the brief asks for:
 * "the ballot stagger measurable (report the actual inter-ballot ms); purge
 * silence measurable".
 *
 * SO THE CLOCK IS IN THE PAGE. Every timing below is recorded by a
 * requestAnimationFrame loop running inside the page, next to the moments it is
 * measuring — not by the driver polling from outside, which under Playwright
 * samples at 200 ms and would smear a 180 ms stagger into noise. The driver only
 * reads the array afterwards. The browser is launched with background throttling
 * off for the same reason: a throttled page runs its own timers at 200 ms+ and
 * every number here would be a measurement of Chromium's clamp.
 *
 * THE CLASSIFIER IS THE PROJECT'S OWN, copied out of `measure()` in
 * src/play/lighting.js line for line (hue 15-70 degrees, saturation > 0.16,
 * lightness > 0.18) — the same copy scripts/capture-ambience.mjs and
 * scripts/capture-hud.mjs make, for the reason docs/step-11.md records.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-14-juice';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = [];
page.on('console', (m) => { if (!['info', 'debug'].includes(m.type())) msgs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

const log = (tag, value) => console.log(tag.padEnd(20), JSON.stringify(value));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());

/* ------------------------------------------------------ the in-page clock */

async function instrument() {
  await page.evaluate(() => {
    window.__rec = { ballots: [], acc: [], purge: [], curtain: [], tile: [], gain: [], frames: [] };
    /*
     * THE INSTRUMENT'S OWN RESOLUTION, recorded beside every number it takes.
     *
     * Each timing below is "the first frame on which the page had moved on", so
     * every gap carries up to one frame interval of quantisation. A stagger
     * quoted without the frame interval beside it is a percentile over an
     * unverified sample rate: 195 ms against a declared 180 is a 15 ms overrun
     * on a 60 Hz display and inside the noise on a 25 Hz one, and only one of
     * those two readings is a finding.
     */
    let lastFrame = performance.now();
    let lastLanded = -1;
    let lastAcc = null;
    let purge = null;
    let lastTurned = -1;
    let lastTiles = -1;
    const loop = () => {
      requestAnimationFrame(loop);
      if (!window.__play || !window.__play.stage) return;
      const t = Math.round(performance.now());
      const dt = t - lastFrame;
      window.__rec.frames.push(dt);
      if (window.__rec.frames.length > 4000) window.__rec.frames.shift();
      const s = window.__play.stage();
      const gain = window.__play.audio.report().masterGain;

      if (s.ballots) {
        if (s.ballots.now.landed !== lastLanded) {
          lastLanded = s.ballots.now.landed;
          /* The frame interval AT THIS SAMPLE, not the run's median: the
           * reveal lasts 1.3 s and the run spends minutes blocked on
           * screenshots, so a rolling median over the whole session describes
           * the screenshots and not the stagger. This is the resolution of the
           * gap the next line will be used to compute. */
          window.__rec.ballots.push({ t, dt: t - lastFrame, landed: lastLanded,
            aye: s.ballots.now.aye, nay: s.ballots.now.nay });
        }
      } else lastLanded = -1;

      if (s.accusation) {
        const done = Object.keys(s.accusation.done).join(',');
        if (done !== lastAcc) { lastAcc = done; window.__rec.acc.push({ t, done, el: s.accusation.elapsed }); }
      } else lastAcc = null;

      if (s.purge) {
        if (!purge) { purge = { start: t, gav: null }; window.__rec.purge.push({ t, ev: 'start', seat: s.purge.seat, gain }); }
        if (gain !== null) window.__rec.gain.push({ t, since: t - purge.start, gain });
        if (s.purge.gavelled && !purge.gav) {
          purge.gav = t;
          window.__rec.purge.push({ t, ev: 'gavel', sinceStart: t - purge.start, gain });
        }
      } else if (purge) { window.__rec.purge.push({ t, ev: 'end', sinceStart: t - purge.start }); purge = null; }

      if (s.curtain && s.curtain.turned !== lastTurned) {
        lastTurned = s.curtain.turned;
        window.__rec.curtain.push({ t, turned: lastTurned, sealed: s.curtain.sealed, el: s.curtain.elapsed });
      }
      if (s.board && s.board.placed.length !== lastTiles) {
        lastTiles = s.board.placed.length;
        window.__rec.tile.push({ t, placed: lastTiles });
      }
      lastFrame = t;
    };
    requestAnimationFrame(loop);
  });
}

/** Warm pixels over the composited frame, HUD included. The project's rule. */
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
  return {
    name,
    warmPct: +(png.warm / png.total * 100).toFixed(2),
    litPct: +(png.lit / png.total * 100).toFixed(2),
    samples: png.total
  };
}

await instrument();
/* No real gesture exists in a scripted pane, so the audio's own gate is opened
 * explicitly. Without it every silence below reads as `null` — which is not
 * "silent", it is "there was never any sound to take away". */
log('AUDIO STARTED', await page.evaluate(() => window.__play.audio.start()));

/* ============================================ 0. the player's own body ==== */

/*
 * The scene-graph half of the avatar swap. test/glb.test.js proves the MAPPING
 * (seat n -> variant n mod 4, the human taking the same arithmetic as a bot);
 * only a browser can say that the figure is actually hanging on the avatar and
 * that the collider did not move with it.
 */
const bodies = [];
for (const seat of [0, 1, 2, 3]) {
  await page.evaluate((s) => window.__play.restart(1000, 5, s), seat);
  await page.waitForTimeout(900);
  const you = await page.evaluate(() => window.__play.cast.you);
  bodies.push(Object.assign({ seat }, you));
  log('YOUR BODY', bodies[bodies.length - 1]);
  /* Framing: the camera sits 3.5 m behind at 1.8 m. A 2.16 m figure is taller
   * than the 1.7 m capsule was, so each variant is photographed from the
   * default rig with the objective line and the podium in shot. */
  await page.evaluate(() => {
    const m = window.__play.marks.podium;
    window.__play.teleport(m.x, 0, m.z - 3);
    window.__play.face(0, 9);
  });
  await page.waitForTimeout(400);
  await warmOfScreenshot(`00-body-seat${seat}-${you.variant || 'capsule'}`);
}
log('BODIES', bodies.map((b) => ({ seat: b.seat, variant: b.variant, capsule: b.capsule,
  labelY: b.labelY, collider: b.collider })));

/* ============================================= 1. the accusation at you ==== */

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(1600);
/* Played to the trial, so the moment is staged against the night frame the
 * design doc's grammar is about — two lit people in a dark square. */
await page.evaluate(() => window.__play.setSpeed(3));
await page.evaluate(() => window.__play.autopilot(true));
await page.waitForFunction(() => window.__play.lighting().target === 'trial', null, { timeout: 90000 });
await page.evaluate(() => window.__play.autopilot(false));
await page.evaluate(() => window.__play.setSpeed(1));
await page.waitForTimeout(1400);

const accWarmBefore = await warmOfScreenshot('01a-accusation-before');
const accused = await page.evaluate(() => window.__play.accuseMe());
log('ACCUSATION', accused);
await page.waitForTimeout(760);
await warmOfScreenshot('01b-accusation-staged');
const accLive = await page.evaluate(() => ({
  stage: window.__play.stage().accusation,
  framing: window.__play.stage().framing,
  staging: window.__play.lighting().staging,
  lanterns: window.__play.lighting().lanterns.map((l) => ({ n: l.name, i: l.intensity, f: l.focus })),
  objective: window.__play.objective,
  silences: window.__play.audio.report().silences,
  gain: window.__play.audio.report().masterGain
}));
log('ACC LIVE', accLive);
const accWarmDuring = await warmOfScreenshot('01c-accusation-warm');
log('ACC WARM', { before: accWarmBefore.warmPct, during: accWarmDuring.warmPct,
  delta: +(accWarmDuring.warmPct - accWarmBefore.warmPct).toFixed(2) });
log('ACC STEPS', await page.evaluate(() => window.__rec.acc));
await page.evaluate(() => window.__play.releaseAccusation());

/* …and the same moment with reduced motion on. */
await page.evaluate(() => window.__play.setReducedMotion(true));
await page.evaluate(() => { window.__rec.acc.length = 0; });
await page.evaluate(() => window.__play.accuseMe());
await page.waitForTimeout(700);
log('ACC REDUCED', await page.evaluate(() => ({
  stage: window.__play.stage().accusation,
  framing: window.__play.stage().framing,
  rim: window.__play.lighting().staging.rim,
  focus: window.__play.lighting().staging.focus
})));
await warmOfScreenshot('01d-accusation-reduced');
await page.evaluate(() => window.__play.releaseAccusation());
await page.evaluate(() => window.__play.setReducedMotion(null));

/* ================================================= 2. the ballot reveal ==== */

await page.evaluate(() => { window.__rec.ballots.length = 0; window.__rec.frames.length = 0; });
/*
 * Several elections across several seeds, not one election: seven gaps is not a
 * measurement of a 180 ms schedule when the instrument's own resolution is a
 * frame. Every seed is stated and every match is played by `autopilot`, which
 * answers with the first advertised option — deterministic.
 */
for (const seed of [1000, 4242, 7331, 5150]) {
  await page.evaluate((s) => window.__play.restart(s, 7, 0), seed);
  await page.waitForTimeout(900);
  /* The BOTS are hurried, not the reveal: `pace` divides the deliberation
   * bands and `ballotPlanFor` does not read the speed at all, so the 180 ms
   * being measured is the same 180 ms a player sees at 1x. */
  await page.evaluate(() => window.__play.setSpeed(4));
  await page.evaluate(() => window.__play.autopilot(true));
  const target = await page.evaluate(() => window.__rec.ballots.length) + 14;
  await page.waitForFunction((n) => window.__rec.ballots.length >= n ||
    window.__play.state().phase === 'game_over', target, { timeout: 120000 });
  await page.evaluate(() => window.__play.autopilot(false));
  if (await page.evaluate(() => window.__rec.ballots.length) >= 28) break;
}
await page.evaluate(() => window.__play.setSpeed(1));
await page.waitForTimeout(400);
const ballots = await page.evaluate(() => window.__rec.ballots.slice());
const frames = await page.evaluate(() => window.__rec.frames.slice());
frames.sort((a, b) => a - b);
/*
 * Only the gaps BETWEEN ballots of one reveal. The gap into `landed: 0` is the
 * page noticing that a reveal exists, not a stagger, and the gap out of the
 * last one is the next election entirely — including both would report the
 * deliberation beat as part of the stagger.
 */
const gaps = [];
for (let i = 1; i < ballots.length; i++) {
  if (ballots[i].landed <= 1) continue;
  if (ballots[i].landed !== ballots[i - 1].landed + 1) continue;
  gaps.push(ballots[i].t - ballots[i - 1].t);
}
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const revealFrames = ballots.map((b) => b.dt).filter((d) => d > 0).sort((a, b) => a - b);
log('BALLOTS', ballots.slice(0, 16));
log('BALLOT STAGGER', {
  declaredMs: await page.evaluate(() => window.__play.stage().declared.ballot.stagger),
  n: gaps.length,
  meanMs: +mean.toFixed(1),
  medianMs: gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)],
  minMs: Math.min.apply(null, gaps),
  maxMs: Math.max.apply(null, gaps),
  /* The reconciliation, printed beside the number rather than assumed: the
   * frame interval IS the resolution of every gap above. */
  frameMs: {
    /*
     * TWO numbers, because they answer two different questions and only the
     * first one is about the stagger. `duringReveal` is the frame interval
     * sampled ON the frames that recorded a ballot — the actual resolution of
     * every gap above. `wholeRun` is the session median, and it is far worse
     * because the run spends minutes blocked on screenshots and page.evaluate;
     * quoting it beside a 180 ms schedule would make the schedule look
     * unmeasurable when it is not.
     */
    duringReveal: {
      n: revealFrames.length,
      median: revealFrames[Math.floor(revealFrames.length / 2)],
      max: revealFrames[revealFrames.length - 1]
    },
    wholeRun: {
      n: frames.length,
      median: frames[Math.floor(frames.length / 2)],
      p95: frames[Math.floor(frames.length * 0.95)]
    }
  },
  note: 'each gap is quantised by up to one frame interval in each direction; a ' +
    'mean within one frame of the declared 180 ms is the schedule running exactly'
});

/* ================================================== 3. the tile enacted ==== */

await page.evaluate(() => window.__play.restart(4242, 7, 0));
await page.waitForTimeout(1200);
await page.evaluate(() => window.__play.setSpeed(4));
await page.evaluate(() => window.__play.autopilot(true));
await page.waitForFunction(() => window.__play.stage().board.placed.length >= 1, null, { timeout: 120000 });
await page.evaluate(() => window.__play.autopilot(false));
await page.waitForTimeout(200);
log('TILE', await page.evaluate(() => window.__play.stage().board));
await page.evaluate(() => {
  window.__play.teleport(0, 0, 4.6);
  window.__play.face(0, 9);
});
await page.waitForTimeout(600);
await warmOfScreenshot('03-tile-on-the-board');
await page.evaluate(() => window.__play.autopilot(true));
await page.waitForFunction(() => window.__play.stage().board.placed.length >= 4, null, { timeout: 180000 });
await page.evaluate(() => window.__play.autopilot(false));
await page.evaluate(() => window.__play.setSpeed(1));
await page.waitForTimeout(800);
await page.evaluate(() => { window.__play.teleport(0, 0, 4.6); window.__play.face(0, 9); });
await page.waitForTimeout(500);
log('BOARD', await page.evaluate(() => window.__play.stage().board));
await warmOfScreenshot('03b-board-filling');

/* ========================================================= 4. the purge ==== */
/* ==================================================== 5. the curtain call === */

await page.evaluate(() => { window.__rec.purge.length = 0; window.__rec.curtain.length = 0; window.__rec.gain.length = 0; });
let shotPurge = false;
let shotCurtain = false;
/*
 * A purge is a 0-2-a-match event and the design doc says so, so the loop is
 * allowed to deal again. Every seed here is stated, and each one is played by
 * `autopilot`, which answers with the first advertised option — deterministic.
 */
for (const seed of [4242, 1000, 7331, 5150, 2024, 909]) {
  await page.evaluate((s) => window.__play.restart(s, 7, 0), seed);
  await page.waitForTimeout(900);
  /* Hurrying the bots, not the moments: `PURGE.silenceMs` and `CURTAIN.step`
   * are constants and the pace control cannot reach either. */
  await page.evaluate(() => window.__play.setSpeed(4));
  await page.evaluate(() => window.__play.autopilot(true));
  for (let i = 0; i < 900; i++) {
    const s = await page.evaluate(() => ({
      purge: !!window.__play.stage().purge,
      curtain: window.__play.stage().curtain,
      over: window.__play.state().phase === 'game_over'
    }));
    if (s.purge && !shotPurge) {
      shotPurge = true;
      await warmOfScreenshot('04-purge-beam');
      log('PURGE LIVE', await page.evaluate(() => ({
        seat: window.__play.stage().purge.seat,
        stage: window.__play.stage().purge,
        aim: window.__play.lighting().staging.aim,
        gain: window.__play.audio.report().masterGain,
        silences: window.__play.audio.report().silences
      })));
    }
    if (s.curtain && s.curtain.turned >= 2 && s.curtain.turned < s.curtain.of && !shotCurtain) {
      shotCurtain = true;
      await warmOfScreenshot('05a-curtain-turning');
    }
    if (s.curtain && s.curtain.tabled) break;
    if (s.over && !s.curtain) break;
    await page.waitForTimeout(110);
  }
  await page.evaluate(() => window.__play.autopilot(false));
  await page.evaluate(() => window.__play.setSpeed(1));
  if (shotPurge && shotCurtain) break;
  log('SEED DONE', { seed, shotPurge, shotCurtain });
}
await page.waitForTimeout(900);
log('PURGE MARKS', await page.evaluate(() => window.__rec.purge));
log('PURGE GAIN', await page.evaluate(() => window.__rec.gain.slice(0, 40)));
log('CURTAIN MARKS', await page.evaluate(() => window.__rec.curtain));
log('CURTAIN', await page.evaluate(() => window.__play.stage().curtain));
await warmOfScreenshot('05b-curtain-table');
/* The seals with the panel out of the way, which is what the design doc's
 * acceptance criterion is actually about: naming the Dictator without reading. */
await page.evaluate(() => { const n = document.getElementById('panel'); if (n) n.style.visibility = 'hidden'; });
await page.waitForTimeout(300);
await warmOfScreenshot('05c-curtain-seals');
await page.evaluate(() => { const n = document.getElementById('panel'); if (n) n.style.visibility = ''; });

/* ================================================ the warm budget, after === */

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(1600);
await page.evaluate(() => window.__play.pause());
await page.evaluate(() => window.__play.setLighting('trial', true));
await page.waitForTimeout(500);
await page.evaluate(() => {
  const m = window.__play.marks.podium;
  window.__play.teleport(m.x, 0, m.z);
  window.__play.face(0, 9);
});
await page.waitForTimeout(260);
const after = await warmOfScreenshot('06-warm-trial-hud');
await page.evaluate(() => {
  for (const id of ['tray', 'card', 'objective', 'controls', 'prompt', 'tally']) {
    const n = document.getElementById(id);
    if (n) n.style.visibility = 'hidden';
  }
});
await page.waitForTimeout(160);
const afterNoHud = await warmOfScreenshot('06-warm-trial-no-hud');
log('WARM AFTER', {
  camera: 'podium mark facing the dais', state: 'trial (forced)',
  withHudPct: after.warmPct, withoutHudPct: afterNoHud.warmPct,
  hudCostPt: +(after.warmPct - afterNoHud.warmPct).toFixed(2),
  litPct: after.litPct, samples: after.samples, budgetPct: 10
});

/* ------------------------------------------------------------- the fingerprint */

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(700);
log('FINGERPRINT', await page.evaluate(() => window.__play.runToEnd()));

log('CONSOLE', msgs.filter((m) => !/GPU stall/.test(m)));
await browser.close();
