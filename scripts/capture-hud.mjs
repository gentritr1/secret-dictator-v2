/*
 * The Gate D3 acceptance set: the tray's phase states, the private card, and
 * the style law measured with the HUD actually in frame.
 *
 *   node scripts/capture-hud.mjs [outdir]
 *
 * Needs `npm run dev` on 5173. The viewport is 1280 x 720 on purpose: the tray
 * is specified as 1280 x 84, so this is the width at which the composition is
 * the one the wireframe drew (240 / flexible / 200) rather than an
 * interpretation of it.
 *
 * What a headless test cannot answer and this can:
 *
 *   - the private card's MEASURED box, in both states, tiles and no tiles. The
 *     node gate pins the declaration; only a browser can say what the element
 *     did with it.
 *   - the warm-pixel fraction of a NIGHT FRAME INCLUDING THE HUD. The engine's
 *     own `lighting({measure:true})` renders the scene into an offscreen target
 *     and therefore cannot see a single DOM pixel; this counts the composited
 *     screenshot, which is the frame the style bible is actually about.
 *   - that a whole government cycle can be played through the tray with real
 *     keys — E to take the row, then the citizen's own number, A, N.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-d3-hud';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());

/*
 * Warm pixels over the COMPOSITED frame, HUD included.
 *
 * THE CLASSIFIER IS THE PROJECT'S OWN, copied out of `measure()` in
 * src/play/lighting.js line for line: hue between 15 and 70 degrees, saturation
 * above 0.16, lightness above 0.18. That matters more than it looks — a
 * plausible-looking RGB rule of one's own produces a completely different
 * number, and the whole point of measuring here is to compare against the same
 * 10% budget the lighting director declares. What this adds is the only thing
 * the director cannot do: it counts the screenshot, so the tray, the card and
 * the objective line are in the frame, and `measure()` renders the scene into
 * an offscreen target where no DOM pixel exists.
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
    let warm = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
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
    return { warm, total: d.length / 4 };
  }, 'data:image/png;base64,' + buf.toString('base64'));
  return { name, pct: +(png.warm / png.total * 100).toFixed(2) };
}

/*
 * The style law, measured as a PAIR.
 *
 * "A night frame including the HUD is under 10% warm" is a statement about the
 * composited frame, so the same frame is counted twice — once as the player
 * sees it, once with the four DOM surfaces hidden — and the difference is the
 * HUD's own contribution rather than an assumption about it. Hiding by
 * `visibility` rather than `display` so nothing reflows between the two counts.
 */
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
    return { light: l.target, scene: +(l.warm.warmFraction * 100).toFixed(2),
      budget: l.warm.budget * 100 };
  });
  console.log('WARM PAIR'.padEnd(24), JSON.stringify({
    frame: name, light: own.light, withHud: withHud.pct, withoutHud: without.pct,
    hudCost: +(withHud.pct - without.pct).toFixed(2),
    /* The director's own offscreen reading of the same moment, for scale: it
     * sees the scene only, and at a 128x72 probe rather than 1280x720. */
    sceneOnly: own.scene, budget: own.budget
  }));
  return { withHud: withHud.pct, without: without.pct };
}

async function report(label) {
  return page.evaluate(() => ({
    phase: window.__play.state().phase,
    waiting: window.__play.waitingFor()
      ? window.__play.waitingFor().kind + (window.__play.waitingFor().gate
        ? ':' + window.__play.waitingFor().gate : '') : null,
    tray: {
      id: window.__play.tray.id,
      row: window.__play.tray.row,
      note: window.__play.tray.note,
      keys: window.__play.tray.keys,
      armed: window.__play.tray.armed
    },
    card: {
      measured: window.__play.card.measured,
      lines: window.__play.card.lines,
      hand: window.__play.card.hand,
      night: window.__play.card.night,
      text: window.__play.card.onScreen
    },
    objective: window.__play.objective.onScreen,
    light: window.__play.lighting().target,
    /* The rule a screenshot cannot check: no element outside the private card
     * carries the role channel. Asked of the live DOM. */
    roleOutside: Array.from(document.querySelectorAll('[class*="r-loyalist"],' +
      '[class*="r-rebel"],[class*="r-dictator"]'))
      .filter((n) => n.id !== 'card' && !document.getElementById('card').contains(n))
      .map((n) => (n.id || n.tagName) + '.' + n.className),
    sidebar: !!document.getElementById('hud')
  }));
}

async function shot(name, label) {
  const r = await report(label);
  const warm = await warmOfScreenshot(name);
  console.log(name.padEnd(24), JSON.stringify({ ...r, warm: warm.pct }));
  return r;
}

async function standAt(mark, face) {
  await page.evaluate(([m, f]) => {
    window.__play.teleport(m.x, 0, m.z);
    window.__play.face(f.x, f.z);
  }, [mark, face]);
  await page.waitForTimeout(140);
}

const podium = await page.evaluate(() => window.__play.marks.podium);
const bell = await page.evaluate(() => window.__play.marks.bell);

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(2600);

/* 1 — the empty state, and the morning ceremony pending at the bell. */
await standAt({ x: bell.x, z: bell.z - 1.6 }, bell);
await shot('01-card-morning');

/* Ring the bell for real. */
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);
await shot('02-tray-empty-nomination');

/* 2 — a motion on the floor: the vote row, offered then armed. */
await page.waitForFunction(() => {
  const w = window.__play.waitingFor(); return w && w.kind === 'vote';
}, null, { timeout: 30000 });
await page.waitForTimeout(3800);
await standAt(podium, { x: 0, z: 9 });
await shot('03-tray-vote-offered');
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);
await shot('04-tray-vote-armed');
await pair('04b-night-trial');
await page.keyboard.press('KeyA');
await page.waitForTimeout(700);
await shot('05-tray-beat-counting');

/* The tally, which is a centred ceremony, then on to the draft. */
await page.waitForTimeout(2600);
await standAt(podium, { x: 0, z: 9 });
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);
await shot('06-panel-tally');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
await shot('07-tray-empty-drafting');

/*
 * 3 — the two states that need the human in a particular chair.
 *
 * Rather than playing until the gavel happens to come round, the nomination row
 * is captured from a deal that opens with it: seed 1006 at seven citizens hands
 * seat 0 the gavel on day one. It is the wireframe's headline state — the keys
 * have gaps in them where the term-limited sit — and it is answered here with a
 * citizen's own number, off the tray's own offer, through the real keyboard.
 */
await page.evaluate(() => window.__play.restart(1006, 7, 0));
await page.waitForTimeout(2200);
await standAt({ x: bell.x, z: bell.z - 1.6 }, bell);
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);
await standAt(podium, { x: 0, z: 9 });
await shot('08-tray-nominate-offered');
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);
await shot('09-tray-nominate-armed');
await pair('09b-dusk-armed');
const key = await page.evaluate(() => window.__play.tray.keys[1].split(' ')[0]);
const named = await page.evaluate((k) => window.__play.tray.keys.find((x) => x[0] === k), key);
await page.keyboard.press(key);
await page.waitForTimeout(1800);
const nominated = await shot('10-after-nomination');
console.log('answered the nomination with key', key, '=', named,
  '-> nominee', await page.evaluate(() => window.__play.state().nominee));

/* The tiles state: the card's fourth line, and the box that may not change. */
await page.waitForFunction(() => {
  const w = window.__play.waitingFor();
  if (w && w.kind !== 'speaker_discard' && w.kind !== 'deputy_discard') {
    window.__play.submit(w.kind === 'vote' ? true : w.options[0]);
    return false;
  }
  return !!w;
}, null, { timeout: 60000, polling: 200 }).catch((e) => console.log('draft wait:', e.message));
await standAt(podium, { x: 0, z: 9 });
const holding = await shot('11-card-holding-tiles');
await page.keyboard.press('KeyE');
await page.waitForTimeout(250);
await shot('12-panel-draft');
await page.keyboard.press('Digit1');
await page.waitForTimeout(2200);
const afterEnact = await shot('13-after-enact');

/*
 * 4 — the frame the style law is actually about: a real trial, reached by
 * playing to a vote rather than by forcing the rig, because `setLighting` is
 * aimed back at whatever the view says on the next refresh and a forced state
 * photographs a lighting story the game does not show.
 */
await page.waitForFunction(() => {
  const w = window.__play.waitingFor();
  if (w && w.kind !== 'vote') { window.__play.submit(w.options[0]); return false; }
  return !!w && w.kind === 'vote';
}, null, { timeout: 60000, polling: 200 }).catch((e) => console.log('trial wait:', e.message));
await page.waitForTimeout(2500);
await standAt({ x: -4.2, z: 4.6 }, { x: 0.8, z: 9.2 });
const night = await shot('14-night-with-hud');
await pair('14-night-with-hud');

/* The card's box in both states, which is the acceptance criterion. */
console.log('\ncard box  resting', JSON.stringify(afterEnact.card.measured),
  ' holding tiles', JSON.stringify(holding.card.measured),
  ' night', JSON.stringify(night.card.measured));
console.log('role colour outside the card:',
  JSON.stringify(night.roleOutside), ' sidebar present:', night.sidebar);

/* The fingerprint the whole project reviews against. */
const fp = await page.evaluate(() => {
  window.__play.restart(1000, 7, 0);
  const r = window.__play.runToEnd();
  return { steps: r.steps, humanDecisions: r.humanDecisions, winner: r.winner };
});
console.log('\nseed 1000 / 7p fingerprint:', JSON.stringify(fp));

console.log('\nconsole:');
for (const l of msgs) console.log('  ' + l);
await browser.close();
