/*
 * The Gate 15 acceptance set: the player's own turn on the floor.
 *
 *   node scripts/capture-strip.mjs [outdir]
 *
 * Needs `npm run dev` on 5173. 1280 x 720, the same viewport every warm number
 * in docs/ has ever been taken at, because a percentage of a frame is a
 * different number at a different frame size.
 *
 * WHAT A HEADLESS GATE CANNOT ANSWER AND THIS CAN. test/strip.test.js proves
 * that the strip's contents are schema-valid, that the order is stable, and that
 * the oil line never touches a rules decision. None of that is evidence that a
 * bot ever actually names YOU in a shipped match, that the Gate 14 staging fires
 * when one does, or that the strip is on screen inside 700 ms of the bubble.
 * Those are the brief's headline and they are browser claims, so they are
 * measured here, in the page, by a requestAnimationFrame loop sitting next to
 * the moment it is timing — not by the driver polling from outside, which under
 * Playwright samples at 200 ms and would smear a 700 ms cap into noise.
 *
 * THE CLASSIFIER IS THE PROJECT'S OWN, copied out of `measure()` in
 * src/play/lighting.js line for line (hue 15-70 degrees, saturation > 0.16,
 * lightness > 0.18) — the same copy scripts/capture-juice.mjs makes, for the
 * reason docs/step-11.md records.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-15-strip';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());
await page.evaluate(() => window.__play.audio.start());

/* ------------------------------------------------------ the in-page clock */

/**
 * One rAF loop, recording the two things the brief actually asks about: when
 * the accusation's staging fired, and when the strip appeared. Every timing is
 * "the first frame on which the page had moved on", so each carries up to one
 * frame interval of quantisation — which is why the frame interval is recorded
 * beside them and printed with them. A 700 ms cap "missed by 9 ms" on a 60 Hz
 * display is inside the instrument.
 */
await page.evaluate(() => {
  window.__rec = { acc: [], strip: [], oil: [], frames: [] };
  let last = performance.now();
  let staged = null;
  let stripUp = false;
  const loop = () => {
    requestAnimationFrame(loop);
    if (!window.__play || !window.__play.stage) return;
    const t = Math.round(performance.now());
    window.__rec.frames.push(t - last);
    last = t;
    const st = window.__play.stage();
    const acc = st.accusation;
    if (acc && !staged) {
      staged = { from: acc.from, at: t };
      window.__rec.acc.push({ mark: 'accusation', t, from: acc.from });
    }
    if (!acc && staged) staged = null;
    const strip = window.__play.strip();
    if (strip && !stripUp) {
      stripUp = true;
      window.__rec.strip.push({
        mark: 'strip', t,
        /*
         * THE AUTHORITATIVE NUMBER is the staging's own `elapsed` — milliseconds
         * since the trigger, computed by the page against the same clock the
         * schedule was built on. `t - staged.at` is this recorder's bookkeeping
         * and is one frame of jitter wider at each end.
         */
        sinceAccusation: acc ? acc.elapsed : null,
        recorderSays: staged ? t - staged.at : null,
        arrival: strip.arrival,
        slots: strip.slots.map((s) => s.id),
        promptKind: strip.promptKind, promptBasis: strip.promptBasis
      });
    }
    if (!strip && stripUp) { stripUp = false; window.__rec.strip.push({ mark: 'gone', t }); }
    if (strip) window.__rec.oil.push({ t, left: strip.oil.left, yours: strip.oil.yours });
  };
  requestAnimationFrame(loop);
});

/* -------------------------------------------------------------- the warm */

/**
 * Warm pixels over the COMPOSITED frame, HUD included — the project's rule, and
 * the same function scripts/capture-juice.mjs uses.
 *
 * It reads the screenshot back rather than the WebGL canvas: the canvas is not
 * preserved after compositing, so a `drawImage` off it returns a blank buffer
 * and 0.00% warm — which is what the first run of this script reported, and it
 * is exactly the kind of measurement that looks like a pass.
 */
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
    litPct: +(png.lit / png.total * 100).toFixed(2)
  };
}

/* -------------------------------------------- find a square that names you */

/**
 * Play real matches until a bot accuses THIS seat and the beat it opened is
 * handed to the strip.
 *
 * "The floor waits for you" is on while hunting for one reason only: the driver
 * is a round trip away and a 12 s oil line would answer the beat before the
 * screenshot could be taken. It is turned off again for the burn measurement
 * below, which is the half that needs the clock.
 */
async function hunt(seeds) {
  for (const seed of seeds) {
    /*
     * The whole hunt runs INSIDE the page, in one call.
     *
     * Polling from the driver puts a round trip between every look and the
     * next, and a match at 4x outruns it: the interesting beat is answered, or
     * the match is over, before the next question arrives. It also answers the
     * strips it is not looking for by SPEAKING rather than by pressing Escape —
     * a player who stays silent piles up obligations, T6 hands them the first
     * beat of every subsequent floor, and they are never the one being answered.
     * Measured: a silent seat is prompted by an accusation a third as often.
     */
    const hit = await page.evaluate(async (s) => {
      const play = window.__play;
      play.setFloorWaits(true);
      play.restart(s, 7, 0);
      play.setSpeed(4);
      play.autopilot(true);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 900; i++) {
        await wait(40);
        const strip = play.strip();
        if (strip) {
          if (strip.promptKind === 'ACCUSE') {
            play.autopilot(false);
            return { strip, stage: play.stage().accusation, state: play.state() };
          }
          /* Answer it and carry on: the first card that is not silence. */
          const card = strip.cards.find((c) => !/⌀/.test(c.label)) || strip.cards[0];
          play.stripKey(card.key);
          if (play.strip() && play.strip().level !== 'top') play.stripKey('E');
        }
        if (play.state().phase === 'game_over') break;
      }
      play.autopilot(false);
      return null;
    }, seed);
    if (hit) return { seed, ...hit };
  }
  return null;
}

const seeds = [];
for (let i = 0; i < 24; i++) seeds.push(1000 + i);
const found = await hunt(seeds);
if (!found) {
  console.error('NO ACCUSATION FOUND — no bot named seat 0 in 24 seeds');
  await browser.close();
  process.exit(1);
}

/*
 * THE SCREENSHOT COMES FIRST. The staging holds for ACCUSE.holdMs (5.2 s) and
 * every page.evaluate below is a round trip; logging first and shooting second
 * would photograph the square after it had already been given back.
 */
const warmStaged = await warmOfScreenshot('01-accused-strip');

log('SEED', found.seed);
log('DAY', found.state.day);
log('ACCUSED BY', found.strip.promptKind + ' / ' + found.strip.promptBasis);
log('STAGING LIVE', found.stage);
log('SLOTS', found.strip.slots.map((s) => `${s.id}:${s.kind}${s.basis ? '(' + s.basis + ')' : ''}`));
log('CARDS', found.strip.cards.map((c) => c.key + ' ' + c.label));
log('SECOND LINE', found.strip.note);
log('ARRIVAL', await page.evaluate(() => ({
  accusation: window.__rec.acc.slice(-1)[0] || null,
  strip: window.__rec.strip.filter((m) => m.mark === 'strip').slice(-1)[0] || null,
  declaredCapMs: window.__play.stage().declared.accusationLastMs,
  frameMs: (() => {
    const f = window.__rec.frames.slice(-120).sort((a, b) => a - b);
    return f.length ? f[Math.floor(f.length / 2)] : null;
  })()
})));

log('WARM STAGED', warmStaged);

/* Every card's full sentence, printed before it can be spoken. */
const sentences = await page.evaluate(() => {
  const out = [];
  const s0 = window.__play.strip();
  for (let i = 0; i < s0.cards.length; i++) {
    window.__play.stripKey('ArrowRight');
    const s = window.__play.strip();
    out.push({ at: s.cards[s.cursor].key, card: s.cards[s.cursor].label, printed: s.note });
  }
  return out;
});
log('READ BEFORE SAID', sentences);

/* The submenu, on the citizens' own permanent numbers. */
const submenu = await page.evaluate(() => {
  const top = window.__play.strip();
  var accuse = top.cards.findIndex((c) => /^Name /.test(c.label));
  if (accuse === -1) accuse = top.cards.findIndex((c) => /▸/.test(c.label));
  if (accuse === -1) return null;
  window.__play.stripKey(top.cards[accuse].key);
  const sub = window.__play.strip();
  const out = { level: sub.level, cards: sub.cards.map((c) => c.key + ' ' + c.label), note: sub.note };
  window.__play.stripKey('Escape');
  out.back = window.__play.strip().level;
  return out;
});
log('SUBMENU', submenu);

/* ------------------------------------------------------------- the oil line */

/*
 * THE BURN, IN TWO PHASES, AND THE FIRST IS THE ONE THE BRIEF ACTUALLY CARES
 * ABOUT.
 *
 * "No rules decision has a clock in either setting." The square is mid-ballot
 * when the hunt stops — the strip is up and the rules are also waiting on this
 * seat — so phase A turns the oil line ON and leaves it there. If the rule
 * moves a pixel, a 12-second clock has just been put on a ballot. Phase B then
 * answers the ballot and measures the burn that follows, which is the slope the
 * player sees rather than OIL.burnMs read back out of the module that declared
 * it.
 */
await page.evaluate(() => { window.__rec.oil.length = 0; window.__play.setFloorWaits(false); });

const owed = await page.evaluate(() => {
  const w = window.__play.waitingFor();
  return w ? (w.gate ? w.kind + ':' + w.gate : w.kind) : null;
});
await sleep(4000);
const heldWhileOwed = await page.evaluate(() => {
  const o = window.__rec.oil;
  const left = o.map((x) => x.left);
  return {
    samples: o.length,
    movedBy: left.length ? +(Math.max(...left) - Math.min(...left)).toFixed(6) : null,
    yoursEver: o.some((x) => x.yours),
    stillUp: !!window.__play.strip()
  };
});
log('OWED MEANWHILE', owed);
log('HELD WHILE OWED', heldWhileOwed);

/*
 * Phase B: give the rules back to the autopilot and let the beat run out.
 *
 * Answering the ONE decision that happened to be pending is not enough — the
 * next one arrives a beat later and the oil line correctly stops again, which
 * is what the first version of this measurement recorded: 54 seconds of wall
 * clock and a single frame in which the beat was the player's. The autopilot
 * answers the rules promptly, so what is left is a beat that is genuinely
 * nobody else's business, which is the only state the rule may burn in.
 */
await page.evaluate(() => { window.__rec.oil.length = 0; window.__play.autopilot(true); });
const burnFrom = Date.now();
let ranOut = false;
for (let i = 0; i < 160; i++) {
  await sleep(200);
  const s = await page.evaluate(() => {
    if (!window.__play || !window.__play.strip) return null;
    const st = window.__play.strip();
    return st ? { left: st.oil.left, burned: st.oil.burned, yours: st.oil.yours } : null;
  });
  if (!s) { ranOut = true; break; }
  if (i === 12) await warmOfScreenshot('02-oil-burning');
}
await page.evaluate(() => window.__play.autopilot(false));
/*
 * WALL CLOCK AND BURNED CLOCK ARE DIFFERENT NUMBERS AND BOTH ARE THE POINT. The
 * beat only burns while nothing else is owed, so a 12 s rule takes longer than
 * 12 s of wall to run out in a running match — and the gap between the two is
 * the rules decisions the autopilot answered in between, every one of which
 * stopped the clock.
 */
log('OIL RAN OUT', { ranOut, wallMs: Date.now() - burnFrom, declaredBurnMs: 12000 });
log('OIL SAMPLES', await page.evaluate(() => {
  const o = window.__rec.oil.filter((x) => x.yours);
  return {
    burning: o.length,
    first: o[0] || null,
    last: o[o.length - 1] || null,
    monotonic: o.every((x, i) => i === 0 || x.left <= o[i - 1].left + 1e-9)
  };
}));
log('SILENCE RECORDED', await page.evaluate(() => {
  const r = window.__play.floor();
  const mine = r.said.filter((s) => s.seat === 0);
  return { last: mine[mine.length - 1] || null, silences: r.silences };
}));

/* ------------------------------------------- "the floor waits for you" */

/*
 * Ten minutes is the brief's number and it is not a wall-clock number here: the
 * page's presentation clock is what the oil line reads, and what has to be true
 * is that ten minutes of it changes nothing. So the beat is left for a real
 * twelve seconds — more than a whole oil line — with the setting on, and the
 * record is compared before and after. The ten-minute claim itself is asserted
 * headlessly in test/strip.test.js, where a clock can actually be moved ten
 * minutes forward.
 */
const waitsBefore = await page.evaluate(() => {
  window.__play.setFloorWaits(true);
  return JSON.stringify(window.__play.floor());
});
await sleep(14000);
const waitsAfter = await page.evaluate(() => JSON.stringify(window.__play.floor()));
log('FLOOR WAITS', {
  unchanged: waitsBefore === waitsAfter,
  stripStillUp: await page.evaluate(() => !!window.__play.strip()),
  oil: await page.evaluate(() => {
    const s = window.__play.strip();
    return s ? s.oil : null;
  })
});

/* ------------------------------------------------------- the night frame */

/*
 * The warm budget with the HUD, at night, with the strip up — the brief's
 * fourth acceptance line. The trial is the darkest lit state the match has and
 * the one every warm number in docs/ is quoted against.
 */
/*
 * THE NIGHT FRAME, the same one every warm number in docs/ is quoted against:
 * the podium mark facing the dais, the `trial` state forced, 1280 x 720, HUD
 * composited. Measured twice on the SAME frame — once with a strip in the tray
 * and once with the tray back to an ordinary row — so what is reported is the
 * strip's own cost rather than two frames of two different squares.
 */
const podium = await page.evaluate(() => window.__play.marks.podium);
await page.evaluate(() => window.__play.setFloorWaits(true));

/* Hunt one more beat so there is a strip to photograph at night. */
const again = await hunt([found.seed + 1, found.seed + 2, found.seed + 3, found.seed + 4]);
log('NIGHT BEAT', again ? { seed: again.seed, prompt: again.strip.promptKind } : null);
/*
 * The order is capture-warm.mjs's order and it is load-bearing: STOP the match
 * first, let whatever the ambience had staged land, and only then force the
 * state. Forcing it while a staged view is still in flight means `pumpAmbience`
 * applies the real lighting a frame later and the frame photographed is
 * whatever the square happened to be doing — which is how the first run of this
 * measured 22% and 32% warm on two frames that were supposed to be the same one.
 */
async function nightFrame(m) {
  await page.evaluate(() => window.__play.pause());
  await sleep(700);
  await page.evaluate(() => window.__play.flushCast());
  await page.evaluate(() => window.__play.setLighting('trial', true));
  await sleep(500);
  await page.evaluate((mark) => {
    window.__play.teleport(mark.x, 0, mark.z);
    window.__play.face(0, 9);
  }, m);
  await sleep(300);
  return page.evaluate(() => window.__play.lighting().target);
}

log('NIGHT STATE', await nightFrame(podium));
const stripThere = await page.evaluate(() => !!window.__play.strip());
const nightWithStrip = await warmOfScreenshot('03-strip-night');
log('WARM NIGHT, STRIP UP', nightWithStrip);
await page.evaluate(() => {
  const s = window.__play.strip();
  if (s) window.__play.stripKey('Escape');
});
log('NIGHT STATE 2', await nightFrame(podium));
const nightNoStrip = await warmOfScreenshot('04-night-no-strip');
log('WARM NIGHT, NO STRIP', nightNoStrip);
log('STRIP COST (pt)', {
  stripWasUp: stripThere,
  delta: +(nightWithStrip.warmPct - nightNoStrip.warmPct).toFixed(2),
  budget: 10
});

/* ------------------------------------------------- how late is the arrival? */

/*
 * THE INSTRUMENT'S OWN RESOLUTION, measured rather than assumed.
 *
 * The brief caps the strip at 700 ms and `arrival.opensAt` proves the SCHEDULE
 * is exactly that. What a screenshot cannot separate is a scheduling defect
 * from a page that is not painting: this browser is headless software GL and
 * its median frame is around 110 ms, so an arrival "918 ms late" is either
 * eight missed frames or a real bug, and one number cannot tell them apart.
 *
 * So the lateness is sampled over a burst of ordinary beats and reported beside
 * the frame interval it was measured at. A distribution that sits inside one
 * frame is the pump keeping up; a distribution that does not is a finding.
 */
const lateness = await page.evaluate(async () => {
  const play = window.__play;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  play.setFloorWaits(true);
  for (const seed of [1002, 1005, 1008, 1011]) {
    play.restart(seed, 7, 0);
    play.setSpeed(4);
    play.autopilot(true);
    for (let i = 0; i < 700 && out.length < 40; i++) {
      await wait(30);
      const s = play.strip();
      if (!s) { if (play.state().phase === 'game_over') break; continue; }
      out.push({ lateBy: s.arrival.lateBy, sinceTrigger: s.arrival.sinceTrigger });
      const card = s.cards.find((c) => !/⌀/.test(c.label)) || s.cards[0];
      play.stripKey(card.key);
      if (play.strip() && play.strip().level !== 'top') play.stripKey('E');
    }
    play.autopilot(false);
    if (out.length >= 40) break;
  }
  const late = out.map((o) => o.lateBy).sort((a, b) => a - b);
  const frames = window.__rec.frames.slice(-400).sort((a, b) => a - b);
  const at = (arr, q) => (arr.length ? arr[Math.floor(arr.length * q)] : null);
  return {
    beats: out.length,
    lateMedianMs: at(late, 0.5),
    lateP95Ms: at(late, 0.95),
    lateMaxMs: late[late.length - 1] || null,
    frameMedianMs: at(frames, 0.5),
    frameP95Ms: at(frames, 0.95),
    /* The reconciliation: lateness expressed in FRAMES of this instrument. */
    lateMedianFrames: at(late, 0.5) !== null && at(frames, 0.5)
      ? +(at(late, 0.5) / at(frames, 0.5)).toFixed(2) : null,
    staged: out.filter((o) => o.sinceTrigger !== null).length
  };
});
log('ARRIVAL LATENESS', lateness);

log('CONSOLE', msgs);
await browser.close();
