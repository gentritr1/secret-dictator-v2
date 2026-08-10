/*
 * The Gate D4 acceptance set: the ledger, the pause, and the lie you can look up.
 *
 *   node scripts/capture-ledger.mjs [outdir]
 *
 * Needs `npm run dev` on 5173. 1280 x 720, the width the wireframes are drawn
 * at: a 420 px panel on the right of that frame is a third of the screen, which
 * is the composition the spec is describing rather than an interpretation of it.
 *
 * What a headless gate cannot answer and this can:
 *
 *   - THE HEADLINE. Seed 1006, seven citizens, seat 0, played to game over. The
 *     C3 pair flag on seats 4 and 5 over government g-4 — the caught lie
 *     docs/step-10.md recorded and could only put in a bubble — is now something
 *     a player looks up, on BOTH entries, with both claims readable and no
 *     verdict anywhere on the panel.
 *   - THE PAUSE. Pin, wait sixty real seconds, unpin: the event log, the
 *     utterance record and the pending decision byte-identical, measured off the
 *     running page rather than argued from the source.
 *   - THE DECISION YOU OWN. A ballot answered with the ledger open, through the
 *     real keyboard: E to take the row, A to cast it, and the panel still up.
 *   - THE STYLE LAW with a fifth surface in the frame: a night trial counted
 *     twice, HUD and ledger visible, then hidden.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-d4-ledger';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());

const HUD_IDS = ['tray', 'card', 'objective', 'controls', 'prompt', 'ledger'];

/*
 * The first-run affordance, read BEFORE anything opens the ledger — it is the
 * one thing in this script that cannot be measured twice in a session, because
 * seeing it once is what turns it off.
 */
console.log('first-run hint        ', JSON.stringify(await page.evaluate(() =>
  Array.from(document.querySelectorAll('#tray .hint'))
    .map((n) => ({ text: n.textContent.trim(), dim: n.classList.contains('off') })))));

/* The project's own warm classifier, copied out of src/play/lighting.js line
 * for line — see scripts/capture-hud.mjs for why that detail is load-bearing. */
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

async function pair(name) {
  const withHud = await warmOfScreenshot(name);
  await page.evaluate((ids) => {
    for (const id of ids) {
      const n = document.getElementById(id);
      if (n) n.style.visibility = 'hidden';
    }
  }, HUD_IDS);
  await page.waitForTimeout(150);
  const without = await warmOfScreenshot(name + '-no-hud');
  await page.evaluate((ids) => {
    for (const id of ids) {
      const n = document.getElementById(id);
      if (n) n.style.visibility = '';
    }
  }, HUD_IDS);
  const own = await page.evaluate(() => {
    const l = window.__play.lighting({ measure: true });
    return { light: l.target, scene: +(l.warm.warmFraction * 100).toFixed(2),
      budget: l.warm.budget * 100 };
  });
  console.log('WARM PAIR'.padEnd(22), JSON.stringify({
    frame: name, light: own.light, withHud: withHud.pct, withoutHud: without.pct,
    hudCost: +(withHud.pct - without.pct).toFixed(2),
    sceneOnly: own.scene, budget: own.budget
  }));
}

const led = () => page.evaluate(() => window.__play.ledgerPanel);

/* ==================================================================== */
/* 1 — THE HEADLINE: the lie you could only hear, looked up             */
/* ==================================================================== */

await page.evaluate(() => { window.__play.restart(1006, 7, 0); window.__play.setSpeed(4); });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__play.autopilot(true));
await page.waitForFunction(() => window.__play.state().phase === 'game_over',
  null, { timeout: 180000, polling: 400 });
await page.waitForTimeout(1500);

const flags = await page.evaluate(() => window.__play.floor().flags);
console.log('seed 1006 flags       ', JSON.stringify(flags));

/* The result screen opened itself. Esc closes it — the decision it was drawn
 * for is over, and closing has never answered anything. */
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.keyboard.press('KeyL');
await page.waitForTimeout(400);

const open = await led();
console.log('ledger open           ', JSON.stringify({
  open: open.open, paused: open.paused, day: open.day,
  shown: open.shown, total: open.total, flagged: open.flaggedCount,
  objective: open.objective, promoted: open.promoted,
  missingSentences: open.missingSentences, roleColour: open.roleColour
}));
console.log('entries               ');
for (const c of open.citizens) {
  console.log('  ', String(c.number).padStart(2), c.name.padEnd(6),
    c.alive ? 'alive' : 'dead ', JSON.stringify(c.flags), c.groups.join(','));
}
await warmOfScreenshot('01-ledger-game-over');

/* The pair, on both entries. */
const pairFlag = flags.find((f) => f.rule === 'C3');
if (pairFlag) {
  const on = open.citizens.filter((c) => c.flags.includes(pairFlag.id));
  console.log('C3 pair               ', JSON.stringify({
    flag: pairFlag.id, seats: pairFlag.seats,
    onEntries: on.map((c) => c.number + ' ' + c.name),
    marks: open.marks
  }));
  /* Jump to each of the two by their own permanent number and photograph the
   * entry — the two claims, the rule, the refs, and nothing that says who. */
  for (const seat of pairFlag.seats) {
    await page.keyboard.press('Digit' + (seat + 1));
    await page.waitForTimeout(250);
    const at = await led();
    const entry = at.citizens.find((c) => c.number === seat + 1);
    const rows = at.rows.filter((r) => r.text.includes('C3') ||
      r.trace.some((t) => pairFlag.refs.utterances.includes(t)));
    console.log(`jump ${seat + 1}                `, JSON.stringify({
      focus: at.focus, entry: entry && entry.name, flags: entry && entry.flags,
      rows: rows.map((r) => r.text)
    }));
    await warmOfScreenshot(`02-pair-seat-${seat + 1}`);
  }
}

/* F: the flagged only. */
await page.keyboard.press('KeyF');
await page.waitForTimeout(250);
const filtered = await led();
console.log('flagged only          ', JSON.stringify({
  shown: filtered.shown, total: filtered.total,
  who: filtered.citizens.map((c) => c.number + ' ' + c.name)
}));
await warmOfScreenshot('03-flagged-only');

/* Every row on screen traces to something in the record, read off the DOM. */
const traces = await page.evaluate(() => {
  const l = window.__play.ledgerPanel;
  const f = window.__play.floor();
  const rows = l.rows;
  return {
    rows: rows.length,
    untraced: rows.filter((r) => !r.trace.length).map((r) => r.text),
    kinds: rows.reduce((acc, r) => {
      r.trace.forEach((t) => {
        const k = /^u-/.test(t) ? 'utterance' : /^g-/.test(t) ? 'government'
          : /^p-/.test(t) ? 'power' : /^f-/.test(t) ? 'floor'
          : /^seat:/.test(t) ? 'roster' : t === 'board' ? 'board' : 'flag';
        acc[k] = (acc[k] || 0) + 1;
      });
      return acc;
    }, {}),
    utterancesInRecord: f.utterances
  };
});
console.log('traceability          ', JSON.stringify(traces));

/* And the words the panel may not say, asked of the pixels' own text. */
const words = await page.evaluate(() => {
  const t = (document.getElementById('ledger').textContent || '').toLowerCase();
  const banned = ['lied', 'lying', 'liar', 'guilty', 'trust', 'suspicion', 'score', '%'];
  return { hits: banned.filter((w) => t.includes(w)), length: t.length };
});
console.log('verdict sweep         ', JSON.stringify(words));

await page.keyboard.press('Escape');
await page.waitForTimeout(200);
console.log('after Esc             ', JSON.stringify(await led()).slice(0, 90) + '…');

/* ==================================================================== */
/* 2 — THE PAUSE: sixty seconds, and nothing moved                      */
/* ==================================================================== */

await page.evaluate(() => { window.__play.restart(1000, 7, 0); window.__play.setSpeed(2); });
await page.waitForTimeout(1200);
await page.evaluate(() => window.__play.autopilot(true));
await page.waitForTimeout(14000);
await page.evaluate(() => window.__play.autopilot(false));
await page.waitForTimeout(2500);

const before = await page.evaluate(() => ({
  log: JSON.stringify(window.__play.eventLog),
  phase: window.__play.state().phase,
  day: window.__play.state().day,
  waiting: JSON.stringify(window.__play.waitingFor()),
  floor: JSON.stringify(window.__play.floor().said),
  utterances: window.__play.floor().utterances,
  light: window.__play.lighting().target
}));
await page.keyboard.press('KeyL');
await page.waitForTimeout(500);
const pinnedAt = await led();
console.log('pinned                ', JSON.stringify({
  open: pinnedAt.open, paused: pinnedAt.paused, day: pinnedAt.day
}));
await warmOfScreenshot('04-pinned-mid-match');

console.log('waiting 60 s with the square held…');
await page.waitForTimeout(60000);

const during = await page.evaluate(() => ({
  log: JSON.stringify(window.__play.eventLog),
  phase: window.__play.state().phase,
  utterances: window.__play.floor().utterances,
  light: window.__play.lighting().target,
  pausedFor: window.__play.ledgerPanel.pausedFor
}));
await page.keyboard.press('KeyL');
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  log: JSON.stringify(window.__play.eventLog),
  waiting: JSON.stringify(window.__play.waitingFor()),
  floor: JSON.stringify(window.__play.floor().said),
  utterances: window.__play.floor().utterances,
  open: window.__play.ledgerPanel.open
}));

console.log('pause                 ', JSON.stringify({
  heldFor: during.pausedFor,
  logIdenticalDuring: before.log === during.log,
  logIdenticalAfter: before.log === after.log,
  logChars: before.log.length,
  utterances: [before.utterances, during.utterances, after.utterances],
  lightHeld: before.light === during.light,
  lightBefore: before.light, lightDuring: during.light,
  phase: [before.phase, during.phase],
  waitingIdentical: before.waiting === after.waiting,
  floorIdentical: before.floor === after.floor,
  reopened: after.open
}));

/* ==================================================================== */
/* 3 — A DECISION YOU OWN, ANSWERED WITH THE LEDGER OPEN                */
/* ==================================================================== */

const podium = await page.evaluate(() => window.__play.marks.podium);
await page.waitForFunction(() => {
  const w = window.__play.waitingFor();
  if (w && w.kind !== 'vote') { window.__play.submit(w.kind === 'vote' ? true : w.options[0]); return false; }
  return !!w && w.kind === 'vote';
}, null, { timeout: 120000, polling: 300 }).catch((e) => console.log('vote wait:', e.message));
await page.waitForTimeout(2200);
await page.evaluate((m) => { window.__play.teleport(m.x, 0, m.z); window.__play.face(0, 9); }, podium);
await page.waitForTimeout(300);

await page.keyboard.press('KeyL');
await page.waitForTimeout(400);
const beforeBallot = await page.evaluate(() => ({
  open: window.__play.ledgerPanel.open,
  waiting: window.__play.waitingFor().kind,
  tray: window.__play.tray.row,
  prompt: document.getElementById('prompt').textContent
}));
await page.keyboard.press('KeyE');          // take the row — the ledger stays up
await page.waitForTimeout(300);
const armed = await page.evaluate(() => ({
  open: window.__play.ledgerPanel.open,
  armed: window.__play.armed,
  row: window.__play.tray.row
}));
await warmOfScreenshot('05-ballot-armed-with-ledger');
await page.keyboard.press('KeyA');          // and cast it
await page.waitForTimeout(1200);
const answered = await page.evaluate(() => ({
  open: window.__play.ledgerPanel.open,
  waiting: window.__play.waitingFor() ? window.__play.waitingFor().kind : null,
  ballots: window.__play.state().ballotsSealed,
  phase: window.__play.state().phase
}));
console.log('answered while pinned ', JSON.stringify({ beforeBallot, armed, answered }));

/* ==================================================================== */
/* 4 — THE STYLE LAW with a fifth surface in the frame                  */
/* ==================================================================== */

await page.evaluate(() => window.__play.autopilot(false));
await page.waitForFunction(() => {
  const w = window.__play.waitingFor();
  if (w && w.kind !== 'vote') { window.__play.submit(w.options[0]); return false; }
  return !!w && w.kind === 'vote';
}, null, { timeout: 120000, polling: 300 }).catch((e) => console.log('trial wait:', e.message));
await page.waitForTimeout(2600);
await page.evaluate(() => { window.__play.teleport(-4.2, 0, 4.6); window.__play.face(0.8, 9.2); });
await page.waitForTimeout(400);
if (!(await page.evaluate(() => window.__play.ledgerPanel.open))) {
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(400);
}
console.log('night light           ', await page.evaluate(() => window.__play.lighting().target));
await pair('06-night-trial-with-ledger');

const box = await page.evaluate(() => {
  const n = document.getElementById('ledger').getBoundingClientRect();
  const c = window.__play.card.measured;
  return { ledger: { width: Math.round(n.width), height: Math.round(n.height),
    top: Math.round(n.top), right: Math.round(window.innerWidth - n.right) }, card: c };
});
console.log('boxes                 ', JSON.stringify(box));

/* The tray's hint, before and after the ledger has ever been opened. */
const hint = await page.evaluate(() => {
  const hints = Array.from(document.querySelectorAll('#tray .hint'))
    .map((n) => n.textContent.trim());
  return hints;
});
console.log('tray hints            ', JSON.stringify(hint));

/* ==================================================================== */
/* 5 — the fingerprint, and the three other pages                       */
/* ==================================================================== */

const fp = await page.evaluate(() => {
  window.__play.restart(1000, 7, 0);
  const r = window.__play.runToEnd();
  return { steps: r.steps, humanDecisions: r.humanDecisions, winner: r.winner };
});
console.log('\nseed 1000 / 7p        ', JSON.stringify(fp));

await page.goto('http://localhost:5173/walk.html');
await page.waitForFunction(() => window.__walk);
const walk = await page.evaluate(() => ({
  wall: window.__walk.run('wallHeadOn', 2),
  ramp: window.__walk.run('ramp35', 2),
  block: window.__walk.run('obstacle', 2),
  steps: window.__walk.run('steps', 2)
}));
console.log('walk.html             ', JSON.stringify(walk));

await page.goto('http://localhost:5173/index.html');
await page.waitForFunction(() => !!window.__sd);
await page.waitForTimeout(800);
const idx = await page.evaluate(() => {
  if (!window.__sd) return 'no scripted handle';
  window.__sd.restart(1000, 7);
  window.__sd.runToEnd();
  return { steps: window.__sd.steps, phase: window.__sd.phase,
    logChars: JSON.stringify(window.__eventLog).length };
});
console.log('index.html            ', JSON.stringify(idx));

await page.goto('http://localhost:5173/asset-lab.html');
await page.waitForTimeout(2500);
const lab = await page.evaluate(() => (window.__lab
  ? { report: window.__lab.report, stats: window.__lab.stats } : 'no scripted handle'));
console.log('asset-lab.html        ', JSON.stringify(lab).slice(0, 240));

console.log('\nconsole:');
for (const l of msgs) console.log('  ' + l);

await browser.close();
