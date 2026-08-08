/*
 * The interaction contract, in node.
 *
 *     node test/interact.test.js        (npm run test:interact)
 *
 * src/play/interact.js holds no three.js, no DOM and no clock, so the whole
 * targeting rule — range, facing, which of two overlapping things wins, and
 * whether E does anything — is testable headlessly. That matters more than it
 * looks: "sometimes E doesn't work" is the classic unreproducible bug, and it
 * is almost always a targeting rule nobody could run.
 *
 * Facing is checked against compass directions rather than against the system's
 * own arithmetic. Step 3 shipped an A/D swap that every green test agreed with,
 * because the tests and the code shared the same sign convention; the only
 * defence is to assert against something outside it.
 */

'use strict';

let checks = 0;
const failures = [];
const lines = [];

function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
  return ok;
}
function say(s) { lines.push(s); }

const NORTH = 0;                 // facing = atan2(vx, vz): +Z is 0
const EAST = Math.PI / 2;
const SOUTH = Math.PI;
const WEST = -Math.PI / 2;

/** A minimal interactable that records what happened to it. */
function stub(id, position, opts = {}) {
  return {
    id,
    position,
    radius: opts.radius,
    facingDot: opts.facingDot,
    live: opts.live !== false,
    fired: 0,
    canInteract() { return this.live; },
    getPrompt() { return opts.prompt || `use ${id}`; },
    interact() { this.fired++; return id; }
  };
}

const ORIGIN = { x: 0, y: 0, z: 0 };

async function main() {
  const { createInteractions } = await import('../src/play/interact.js');

  /* ------------------------------------------------------------ contract */
  {
    const sys = createInteractions();
    let threw = 0;
    try { sys.add({ id: 'x' }); } catch (e) { threw++; }
    try { sys.add({ position: ORIGIN, canInteract() {}, getPrompt() {}, interact() {} }); } catch (e) { threw++; }
    sys.add(stub('a', ORIGIN));
    try { sys.add(stub('a', ORIGIN)); } catch (e) { threw++; }
    check(threw === 3, `the contract should reject a missing method, a missing id and a duplicate id — rejected ${threw} of 3`);
    say('contract      a half-built interactable, a nameless one and a duplicate id are all refused');
  }

  /* --------------------------------------------------------------- range */
  {
    const sys = createInteractions({ radius: 2.4 });
    const bell = sys.add(stub('bell', { x: 0, y: 0, z: 3 }));

    check(sys.update({ x: 0, y: 0, z: 1.0 }, NORTH, {}) === bell, 'in range and facing: no target');
    check(sys.prompt === 'use bell', `prompt should be the item's own, got "${sys.prompt}"`);
    check(sys.update({ x: 0, y: 0, z: 0.5 }, NORTH, {}) === null, 'out of range (2.5 m) still targeted');
    check(sys.prompt === '', 'the prompt survived losing the target');

    /* Range is horizontal: standing on a platform above it must not reach. */
    check(sys.update({ x: 0, y: 9, z: 1.0 }, NORTH, {}) === bell,
      'height should not affect range in this graybox — state the rule, do not discover it');
    say('range         2.4 m reach, measured on the floor plane; the prompt clears with the target');
  }

  /* -------------------------------------------------------------- facing */
  {
    const sys = createInteractions({ radius: 3 });
    sys.add(stub('north', { x: 0, y: 0, z: 2 }));

    check(sys.update(ORIGIN, NORTH, {}) !== null, 'facing straight at it: not targeted');
    check(sys.update(ORIGIN, SOUTH, {}) === null, 'back turned: still targeted');
    check(sys.update(ORIGIN, EAST, {}) === null, 'side on (90 deg): still targeted');
    check(sys.update(ORIGIN, Math.PI / 4, {}) !== null, '45 deg off: dropped, but 60 deg is the cone');

    /* And the same rule pointed the other way, so a sign error cannot pass. */
    const east = createInteractions({ radius: 3 });
    east.add(stub('east', { x: 2, y: 0, z: 0 }));
    check(east.update(ORIGIN, EAST, {}) !== null, 'facing +X (east) does not see a thing at +X');
    check(east.update(ORIGIN, WEST, {}) === null, 'facing -X (west) sees a thing at +X');
    check(east.update(ORIGIN, NORTH, {}) === null, 'facing +Z sees a thing at +X');
    say('facing        60 deg cone, verified north and east independently (a sign flip fails one)');
  }

  /* Very close up, facing stops mattering — you are standing on it. */
  {
    const sys = createInteractions({ radius: 3 });
    sys.add(stub('under', { x: 0, y: 0, z: 0.4 }));
    check(sys.update(ORIGIN, SOUTH, {}) !== null,
      'at 0.4 m with your back turned the prompt should hold, not flicker');
    say('close range   inside 0.9 m the facing cone is dropped, so a small turn cannot flicker it');
  }

  /* ------------------------------------------------------------ liveness */
  {
    const sys = createInteractions();
    const podium = sys.add(stub('podium', { x: 0, y: 0, z: 1 }, { live: false }));
    check(sys.update(ORIGIN, NORTH, {}) === null, 'a dead interactable was targeted');
    podium.live = true;
    check(sys.update(ORIGIN, NORTH, {}) === podium, 'a live interactable was not targeted');

    /* The match runs on its own timer, so the thing can go dead between the
     * frame that targeted it and the key press. That must not fire it. */
    podium.live = false;
    check(sys.activate({}) === null, 'a target that went dead since the last frame still fired');
    check(podium.fired === 0, 'interact() ran on a dead interactable');
    podium.live = true;
    check(sys.activate({}) === 'podium', 'a live target did not fire');
    check(podium.fired === 1, `interact() should have run once, ran ${podium.fired}`);
    say('liveness      canInteract() is re-checked at the key press, not trusted from the last frame');
  }

  /* ----------------------------------------------- two things in reach */
  {
    const sys = createInteractions({ radius: 4 });
    sys.add(stub('near', { x: 0, y: 0, z: 1.2 }));
    sys.add(stub('far', { x: 0, y: 0, z: 3.0 }));
    check(sys.update(ORIGIN, NORTH, {}).id === 'near',
      'with two in the cone the nearer should win');

    /* Turning away from the near one hands over rather than going blank. */
    const pair = createInteractions({ radius: 4 });
    pair.add(stub('north', { x: 0, y: 0, z: 1.5 }));
    pair.add(stub('east', { x: 1.5, y: 0, z: 0 }));
    check(pair.update(ORIGIN, NORTH, {}).id === 'north', 'facing north picked the wrong one');
    check(pair.update(ORIGIN, EAST, {}).id === 'east', 'turning east did not hand over');
    say('overlap       nearest wins; turning between two neighbours hands the prompt over');
  }

  /* ------------------------------------------------ the context is opaque */
  {
    const sys = createInteractions();
    let sawCan = null, sawPrompt = null, sawInteract = null;
    sys.add({
      id: 'spy',
      position: { x: 0, y: 0, z: 1 },
      canInteract(ctx) { sawCan = ctx; return ctx.open; },
      getPrompt(ctx) { sawPrompt = ctx; return `phase ${ctx.phase}`; },
      interact(ctx) { sawInteract = ctx; return ctx.phase; }
    });
    const ctx = { open: true, phase: 'vote' };
    sys.update(ORIGIN, NORTH, ctx);
    check(sawCan === ctx && sawPrompt === ctx, 'the context did not reach canInteract/getPrompt');
    check(sys.prompt === 'phase vote', 'the prompt did not come from the context');
    check(sys.activate(ctx) === 'vote' && sawInteract === ctx, 'the context did not reach interact()');
    say('context       whatever the page passes reaches all three hooks and nothing else does');
  }

  /* ---------------------------------------------------- no hidden inputs */
  {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'play', 'interact.js'), 'utf8');
    check(!/Math\.random/.test(src), 'interact.js contains Math.random');
    check(!/\brng\s*\(/.test(src), 'interact.js draws from the seeded stream');
    check(!/document|window|addEventListener/.test(src), 'interact.js reaches for the DOM');
    check(!/Date\.now|performance\.now/.test(src), 'interact.js reads a clock');
    check(!/podium|bell|bench/i.test(src),
      'interact.js knows the name of one of the objects it is supposed to be generic over');
    say('purity        no DOM, no clock, no randomness — and no mention of podium, bell or bench');
  }

  console.log(lines.join('\n'));
  console.log('');
  if (failures.length) {
    console.error(`FAILED — ${failures.length} of ${checks} checks:`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`OK — ${checks} checks passed.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
