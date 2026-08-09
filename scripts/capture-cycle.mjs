/*
 * The Gate 3 acceptance set: one government cycle, captured at 1x through the
 * real page and the real keyboard.
 *
 * docs/BLENDER_PIPELINE.md's Gate 3 exit is "the cycle reads without debug
 * explanation", and the only way to ask that question is to look at it. This is
 * the companion to scripts/capture-reviews.mjs — that one photographs an asset
 * from fixed cameras, this one photographs a MATCH from fixed moments:
 *
 *   morning day -> dusk gathering -> cold vote with the beam on the dais ->
 *   the beat (the square counting) -> the result -> the draft -> the tile sting
 *   -> the settle -> game over
 *
 *   node scripts/capture-cycle.mjs [outdir]
 *
 * Needs `npm run dev` on 5173. It drives the same fixture the rest of the
 * project reviews against — seed 1000, seven citizens, seat 0 — and rings the
 * bell and casts the ballot with real key events rather than through
 * `__play.submit`, because the deliberation beat only runs on the panel path
 * and the beat is half of what this is photographing.
 *
 * The lighting readback is printed beside each shot: which state the director
 * has arrived at, which it is aiming for, and the measured warm-pixel fraction
 * against the state's declared budget. A capture with no numbers next to it
 * cannot settle an argument about whether the frame obeys the style bible.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] || 'design/reviews/gate-3-cycle';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const msgs = [];
page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:5173/play.html');
await page.waitForFunction(() => window.__play && window.__play.state());

/* Stand west of the dais looking north-east at it, so the body is clear of the
 * platform and the beam pool is not behind the player's own capsule. */
async function stand(at) {
  await page.evaluate((spot) => {
    window.__play.teleport(spot.x, 0, spot.z);
    window.__play.face(spot.lx, spot.lz);
  }, at || { x: -4.2, z: 4.6, lx: 0.8, lz: 9.2 });
  await page.waitForTimeout(160);
}

/* The whole ring, from outside it looking north — the shot that answers "is the
 * crowd made of people". The dais frames are too close to the platform to show
 * more than two or three of them. */
const FROM_THE_SOUTH = { x: 0, z: -11.2, lx: 0, lz: 6 };

async function shot(name, at) {
  await stand(at);
  const info = await page.evaluate(() => {
      const l = window.__play.lighting({ measure: true });
      const cast = window.__play.cast;
      return { phase: window.__play.state().phase, state: l.state, target: l.target,
        label: l.label, tone: l.toneMapping,
        warm: +(l.warm.warmFraction * 100).toFixed(2),
        budget: l.warm.budget * 100,
        /* The crowd, beside the light: how many seats are real figures, how
         * many fell back to a capsule, and how many are lying down. A
         * screenshot cannot distinguish "a figure" from "a figure whose
         * nameplate is on a hardcoded height", and this can. */
        figures: cast.seats.filter((s) => s.variant).length,
        capsules: cast.seats.filter((s) => !s.variant && !s.isYou).length,
        toppled: cast.seats.filter((s) => s.toppled).length,
        labels: cast.seats.filter((s) => !s.isYou).map((s) => s.labelOnScreen),
        calls: window.__play.stats.calls, tris: window.__play.stats.triangles,
        objective: window.__play.objective.onScreen };
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name.padEnd(22), JSON.stringify(info));
}

await page.evaluate(() => window.__play.restart(1000, 7, 0));
await page.waitForTimeout(300);
console.log('premise', JSON.stringify(await page.evaluate(() => {
  const s = window.__play.state();
  return { players: s.players.length, you: s.you.name, phase: s.phase, day: s.day,
    waiting: window.__play.waitingFor() && window.__play.waitingFor().gate };
})));

await page.waitForTimeout(2600);
await shot('01-morning-day');

/* Ring the bell for real, then catch dusk before the nomination lands. */
await page.evaluate(() => {
  const b = window.__play.marks.bell;
  window.__play.teleport(b.x, 0, b.z - 1.6); window.__play.face(b.x, b.z);
});
await page.waitForTimeout(120);
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForTimeout(1900);
await shot('02-nomination-dusk');

await page.waitForFunction(() => {
  const w = window.__play.waitingFor(); return w && w.kind === 'vote';
}, null, { timeout: 30000 });
await page.waitForTimeout(5200);
await shot('03-vote-trial');

/* Vote at the podium with the real keys, so the beat runs. */
await page.evaluate(() => {
  const m = window.__play.marks.podium;
  window.__play.teleport(m.x, 0, m.z); window.__play.face(0, 9);
});
await page.waitForTimeout(120);
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await page.keyboard.press('KeyA');
/* Mid-beat: the square must NOT have told us the answer yet. */
await page.waitForTimeout(700);
await shot('04-beat-counting');
await page.waitForTimeout(4200);
await shot('05-result');

/* Open the ballots and let the draft happen. */
await page.evaluate(() => {
  const m = window.__play.marks.podium;
  window.__play.teleport(m.x, 0, m.z); window.__play.face(0, 9);
});
await page.waitForTimeout(200);
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
await page.keyboard.press('Enter');
await page.waitForFunction(() => /legislative/.test(window.__play.state().phase), null, { timeout: 30000 })
  .catch(() => {});
await page.waitForTimeout(4000);
await shot('06-drafting');

/* Ride out to the tile, and catch the sting inside its window. */
const before = await page.evaluate(() => { const s = window.__play.state(); return s.reform + s.seize; });
await page.waitForFunction((n) => {
  const s = window.__play.state();
  const w = window.__play.waitingFor();
  if (w) window.__play.submit(w.options[0]);
  return s.reform + s.seize > n;
}, before, { timeout: 40000, polling: 120 }).catch((e) => console.log('sting wait:', e.message));
await page.waitForTimeout(420);
await shot('07-enacted-sting');

await page.waitForTimeout(2600);
await shot('08-settled-next-morning');

await page.evaluate(() => window.__play.runToEnd());
await page.waitForTimeout(3200);
await shot('09-game-over');

/*
 * The crowd, on its own terms. Two shots from outside the ring:
 *
 *   10  the whole square at the end of the match, in daylight, so every seat is
 *       legible at once — who is standing, who is face-down, and the nameplates
 *       at four different socket heights.
 *   11  the same ring under the trial beam, which is the frame the Gate 3
 *       lighting was built for and the one where the silhouette gate earns its
 *       keep: the citizens are shapes, and they have to still be different.
 */
/* Esc the result screen first — it is a modal in the middle of the frame, and
 * the whole question these two shots ask is what is behind it. */
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.evaluate(() => window.__play.flushCast());
await page.evaluate(() => window.__play.setLighting('day', true));
await page.waitForTimeout(400);
await shot('10-the-ring', FROM_THE_SOUTH);
await page.evaluate(() => window.__play.setLighting('trial', true));
await page.waitForTimeout(400);
await shot('11-the-ring-at-trial', FROM_THE_SOUTH);

console.log('\ncast', JSON.stringify(await page.evaluate(() => {
  const c = window.__play.cast;
  return { ok: c.ok, loaded: c.loaded, fallbacks: c.fallbacks,
    seats: c.seats.map((s) => `${s.id}:${s.variant || (s.isYou ? 'you(capsule)' : 'capsule')}` +
      `@${s.labelOnScreen}${s.toppled ? ' toppled' : ''}`) };
})));

console.log('\nconsole:');
for (const l of msgs) console.log('  ' + l);
await browser.close();
