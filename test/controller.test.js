/*
 * Unit tests for the kinematic capsule controller.
 *
 *     node test/controller.test.js          (npm run test:controller)
 *
 * These run in plain node with no three.js and no renderer. That is possible
 * because src/walk/controller.js asks the world only two questions —
 * deepestContact() and raycastDown() — and both are injected. The browser
 * satisfies that interface with a BVH over the course mesh
 * (src/walk/bvh-world.js); this file satisfies it with closed-form maths over
 * half-spaces and axis-aligned boxes. It is the same controller either way,
 * which is the only reason a node assertion says anything about what happens
 * on screen.
 *
 * This file is CommonJS (the repo's package.json is "type": "commonjs" for the
 * engine's sake) and reaches the ESM controller through a dynamic import;
 * src/walk/package.json marks that directory as ESM.
 */

'use strict';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------ assertions */

let checks = 0;
const failures = [];

function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
}

function near(actual, expected, tol, what) {
  const d = Math.abs(actual - expected);
  check(d <= tol, `${what}: got ${fmt(actual)}, expected ${fmt(expected)} +/- ${fmt(tol)} (off by ${fmt(d)})`);
  return d;
}

function fmt(n) {
  return typeof n === 'number' ? (Math.abs(n) < 1e-4 ? n.toExponential(2) : n.toFixed(6)) : String(n);
}

const lines = [];
function say(s) { lines.push(s); }

/* ------------------------------------------------------- analytic world */
/*
 * Two primitives, both exact for a vertical capsule:
 *
 *   plane { n, d }   the half-space n.x >= d is free; the surface is n.x == d
 *   box   { min, max }  axis-aligned, solid
 *
 * deepestContact returns the single largest overlap, which is exactly the
 * contract the controller relies on (it resolves one contact at a time and
 * re-queries).
 */
function makeWorld(shapes) {
  function planeContact(s, ax, ay, az, bx, by, bz, radius, out) {
    const da = s.n[0] * ax + s.n[1] * ay + s.n[2] * az;
    const db = s.n[0] * bx + s.n[1] * by + s.n[2] * bz;
    const lo = Math.min(da, db);
    const depth = s.d - (lo - radius);
    if (depth <= 0) return false;
    out.nx = s.n[0]; out.ny = s.n[1]; out.nz = s.n[2]; out.depth = depth;
    return true;
  }

  function boxContact(s, ax, ay, az, bx, by, bz, radius, out) {
    /* The capsule segment is vertical (ax === bx, az === bz), so the closest
     * pair separates per axis and this is exact, not an approximation. */
    const cx = Math.min(Math.max(ax, s.min[0]), s.max[0]);
    const cz = Math.min(Math.max(az, s.min[2]), s.max[2]);
    let sy, cy;
    if (by < s.min[1]) { sy = by; cy = s.min[1]; }
    else if (ay > s.max[1]) { sy = ay; cy = s.max[1]; }
    else { sy = Math.min(Math.max((ay + by) / 2, s.min[1]), s.max[1]); cy = sy; }

    const dx = ax - cx, dy = sy - cy, dz = az - cz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist >= radius) return false;
    if (dist > 1e-9) {
      out.nx = dx / dist; out.ny = dy / dist; out.nz = dz / dist;
      out.depth = radius - dist;
      return true;
    }
    /* Segment inside the box: leave along the shallowest face. */
    const cand = [
      [s.min[0] - ax - radius, -1, 0, 0], [ax - s.max[0] - radius, 1, 0, 0],
      [s.min[1] - sy - radius, 0, -1, 0], [sy - s.max[1] - radius, 0, 1, 0],
      [s.min[2] - az - radius, 0, 0, -1], [az - s.max[2] - radius, 0, 0, 1]
    ];
    let best = null;
    for (const c of cand) {
      const depth = -c[0];
      if (best === null || depth < best[0]) best = [depth, c[1], c[2], c[3]];
    }
    out.depth = best[0]; out.nx = best[1]; out.ny = best[2]; out.nz = best[3];
    return true;
  }

  function planeRayDown(s, x, y, z, maxDist, out) {
    if (s.n[1] <= 1e-6) return false;
    const t = (s.n[0] * x + s.n[1] * y + s.n[2] * z - s.d) / s.n[1];
    if (t < 0 || t > maxDist) return false;
    out.distance = t; out.nx = s.n[0]; out.ny = s.n[1]; out.nz = s.n[2];
    return true;
  }

  function boxRayDown(s, x, y, z, maxDist, out) {
    if (x < s.min[0] || x > s.max[0] || z < s.min[2] || z > s.max[2]) return false;
    const t = y - s.max[1];
    if (t < 0 || t > maxDist) return false;
    out.distance = t; out.nx = 0; out.ny = 1; out.nz = 0;
    return true;
  }

  const tmp = { nx: 0, ny: 0, nz: 0, depth: 0 };
  const tmpHit = { distance: 0, nx: 0, ny: 0, nz: 0 };

  return {
    deepestContact(ax, ay, az, bx, by, bz, radius, out) {
      let found = false;
      let deepest = 0;
      for (const s of shapes) {
        const got = s.kind === 'plane'
          ? planeContact(s, ax, ay, az, bx, by, bz, radius, tmp)
          : boxContact(s, ax, ay, az, bx, by, bz, radius, tmp);
        if (got && tmp.depth > deepest) {
          deepest = tmp.depth;
          out.nx = tmp.nx; out.ny = tmp.ny; out.nz = tmp.nz; out.depth = tmp.depth;
          found = true;
        }
      }
      return found;
    },
    raycastDown(x, y, z, maxDist, out) {
      let found = false;
      let best = Infinity;
      for (const s of shapes) {
        const got = s.kind === 'plane'
          ? planeRayDown(s, x, y, z, maxDist, tmpHit)
          : boxRayDown(s, x, y, z, maxDist, tmpHit);
        if (got && tmpHit.distance < best) {
          best = tmpHit.distance;
          out.distance = tmpHit.distance;
          out.nx = tmpHit.nx; out.ny = tmpHit.ny; out.nz = tmpHit.nz;
          found = true;
        }
      }
      return found;
    }
  };
}

const ground = { kind: 'plane', n: [0, 1, 0], d: 0 };

/* A plane tilted `deg` about the Z axis so that it rises towards +X, meeting
 * y = 0 at x = x0. Normal (-sin, cos, 0), offset chosen so the surface passes
 * through (x0, 0, 0). */
function ramp(deg, x0) {
  const a = deg * DEG;
  const n = [-Math.sin(a), Math.cos(a), 0];
  return { kind: 'plane', n, d: n[0] * x0 };
}

/* A vertical wall whose face is at x = wx, free space on the -X side. */
function wallAt(wx) {
  return { kind: 'plane', n: [-1, 0, 0], d: -wx };
}

function box(minX, minY, minZ, maxX, maxY, maxZ) {
  return { kind: 'box', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/* ---------------------------------------------------------------- tests */

async function main() {
  const { createController, defaultTuning } = await import('../src/walk/controller.js');
  const T = defaultTuning();
  const LN20 = Math.log(20);

  /* Every test starts from a controller dropped on flat ground and settled, so
   * none of them measure the first-frame landing transient by accident. */
  function spawn(shapes, x, y, z, tuning) {
    const c = createController({ world: makeWorld(shapes), tuning });
    c.teleport(x === undefined ? 0 : x, y === undefined ? 0 : y, z === undefined ? 0 : z);
    return c;
  }

  function settle(c, seconds) {
    const n = Math.round((seconds || 0.5) / c.fixedDt);
    for (let i = 0; i < n; i++) c.step(c.fixedDt, { x: 0, z: 0 });
  }

  /* ============================================================ 1. dt */
  say('1  frame-rate independence');
  {
    /* A scripted 4 s of input with turns, a reversal and a pause, replayed at
     * two very different frame rates against identical geometry. */
    const schedule = (t) => {
      if (t < 1.0) return { x: 0, z: 1 };
      if (t < 1.6) return { x: 1, z: 0 };
      if (t < 2.2) return { x: -0.7071, z: -0.7071 };
      if (t < 2.6) return { x: 0, z: 0 };
      return { x: 0.6, z: 0.8 };
    };
    const shapes = () => [ground, wallAt(2.2), box(-1.2, 0, 2.6, 1.2, 0.17, 3.4)];

    function run(dt) {
      const c = spawn(shapes(), 0, 0, 0);
      settle(c, 0.5);
      const frames = Math.round(4 / dt);
      for (let i = 0; i < frames; i++) c.advance(dt, schedule(i * dt));
      return c.snapshot();
    }

    const a = run(1 / 30);
    const b = run(1 / 120);
    const dp = Math.hypot(
      a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
    say(`   1/30 vs 1/120  end (${a.position.x.toFixed(4)}, ${a.position.y.toFixed(4)}, ${a.position.z.toFixed(4)})`);
    say(`                  end (${b.position.x.toFixed(4)}, ${b.position.y.toFixed(4)}, ${b.position.z.toFixed(4)})`);
    say(`                  position delta ${(dp * 1000).toFixed(4)} mm   speed ${a.speed.toFixed(6)} vs ${b.speed.toFixed(6)}`);
    check(dp <= 0.01, `dt independence: position delta ${dp} m exceeds 1 cm`);
    const rel = Math.abs(a.speed - b.speed) / Math.max(a.speed, 1e-6);
    check(rel <= 0.01, `dt independence: speed differs by ${(rel * 100).toFixed(3)}%`);
    check(a.substeps === b.substeps, `dt independence: substep counts ${a.substeps} vs ${b.substeps}`);

    /* Those two rates are both exact multiples of the 60 Hz substep, so they
     * are expected to agree to the bit. That proves the accumulator exists but
     * would also pass if the accumulator were the only thing that worked, so
     * two more comparisons follow: awkward frame rates that land mid-substep,
     * and the accumulator removed entirely. */
    function runConst(dt, seconds) {
      const c = spawn(shapes(), 0, 0, 0);
      settle(c, 0.5);
      const frames = Math.round(seconds / dt);
      for (let i = 0; i < frames; i++) c.advance(dt, { x: 0.6, z: 0.8 });
      return c.snapshot();
    }
    const c1 = runConst(1 / 45, 4);
    const c2 = runConst(1 / 144, 4);
    const dc = Math.hypot(
      c1.position.x - c2.position.x, c1.position.y - c2.position.y, c1.position.z - c2.position.z);
    /* An accumulator can only ever be out by whatever is still sitting in it,
     * so the honest tolerance here is one substep of travel, not 1 cm. */
    const oneSubstep = T.walkSpeed / 60;
    say(`   1/45 vs 1/144  position delta ${(dc * 1000).toFixed(3)} mm  (one substep of travel = ${(oneSubstep * 1000).toFixed(1)} mm)`);
    check(dc <= oneSubstep, `awkward frame rates drifted ${dc} m, more than one substep of travel`);
    check(Math.abs(c1.substeps - c2.substeps) <= 1,
      `awkward frame rates ran ${c1.substeps} vs ${c2.substeps} substeps`);

    /* Same input driven straight through step() with no accumulator at all. */
    const direct = spawn(shapes(), 0, 0, 0);
    settle(direct, 0.5);
    for (let i = 0; i < 240; i++) direct.step(direct.fixedDt, schedule(i * direct.fixedDt));
    const d = direct.snapshot();
    const dd = Math.hypot(
      d.position.x - a.position.x, d.position.y - a.position.y, d.position.z - a.position.z);
    say(`   raw step() x240 vs advance(1/30) x120  delta ${(dd * 1000).toFixed(4)} mm`);
    check(dd <= 1e-9, `accumulator changed the trajectory by ${dd} m`);
  }

  /* ====================================================== 2. accel/stop */
  say('2  acceleration and stopping');
  {
    const dt = 1 / 240;
    const c = spawn([ground], 0, 0, 0);
    settle(c, 0.5);

    const target = 0.95 * T.walkSpeed;
    let t = 0, reached = -1;
    while (t < 2) {
      c.advance(dt, { x: 0, z: 1 });
      t += dt;
      if (reached < 0 && c.snapshot().speed >= target) reached = t;
    }
    /* The sim only changes speed on a substep boundary, so the finest this can
     * be measured is 1/60 s = 16.7 ms; that is 6.7% of the 250 ms target and
     * sits well inside the +/-20% band being asserted. */
    say(`   time to 95% of ${T.walkSpeed} m/s: ${(reached * 1000).toFixed(1)} ms  (target ${(T.accelTime * 1000).toFixed(0)} ms, resolution 16.7 ms)`);
    near(reached, T.accelTime, T.accelTime * 0.2, 'time to 95% of walk speed');

    const full = c.snapshot();
    near(full.speed, T.walkSpeed, T.walkSpeed * 0.02, 'top speed on the flat');

    const x0 = full.position.x, z0 = full.position.z;
    let stopT = 0;
    const fivePct = 0.05 * T.walkSpeed;
    let toFivePct = -1;
    while (stopT < 2) {
      c.advance(dt, { x: 0, z: 0 });
      stopT += dt;
      const s = c.snapshot();
      if (toFivePct < 0 && s.speed <= fivePct) toFivePct = stopT;
      if (s.speed === 0) break;
    }
    const end = c.snapshot();
    const dist = Math.hypot(end.position.x - x0, end.position.z - z0);
    /* An exponential approach with time constant tau covers exactly v0*tau of
     * ground before it settles, and the controller integrates that exponential
     * in closed form, so this is a real prediction rather than a fitted band. */
    const tauStop = T.stopTime / LN20;
    const predicted = T.walkSpeed * tauStop;
    say(`   time to 5% of walk speed: ${(toFivePct * 1000).toFixed(1)} ms  (target ${(T.stopTime * 1000).toFixed(0)} ms)`);
    say(`   stop distance: ${dist.toFixed(4)} m  (v0*tau = ${predicted.toFixed(4)} m)`);
    near(toFivePct, T.stopTime, T.stopTime * 0.2, 'time to 5% of walk speed');
    near(dist, predicted, predicted * 0.05, 'stop distance vs v0*tau');
    check(end.speed === 0, 'the character actually came to rest');
  }

  /* ========================================================= 3. turning */
  say('3  turning');
  {
    const dt = 1 / 240;
    const c = spawn([ground], 0, 0, 0);
    settle(c, 0.5);
    for (let i = 0; i < 240 * 2; i++) c.advance(dt, { x: 0, z: 1 });
    near(c.snapshot().facing, 0, 0.02, 'facing while running +Z');

    /* Reverse. Velocity must never teleport: check every substep that the
     * horizontal velocity changed by no more than the acceleration allows. */
    let prev = c.snapshot();
    let maxJump = 0;
    let turned = -1;
    let t = 0;
    while (t < 1.5) {
      c.advance(dt, { x: 0, z: -1 });
      t += dt;
      const s = c.snapshot();
      const jump = Math.hypot(s.velocity.x - prev.velocity.x, s.velocity.z - prev.velocity.z);
      if (jump > maxJump) maxJump = jump;
      prev = s;
      if (turned < 0 && Math.abs(Math.abs(s.facing) - Math.PI) < 0.05 * Math.PI) turned = t;
    }
    say(`   180 deg reversal: facing settled at ${(turned * 1000).toFixed(0)} ms; largest per-substep velocity jump ${maxJump.toFixed(4)} m/s`);
    check(turned > 0, '180 degree reversal completed');
    /* One substep at the fastest blend can change speed by at most
     * walkSpeed*2 * (1 - e^(-h/tau_stop)); anything larger is a hard switch. */
    const bound = 2 * T.walkSpeed * (1 - Math.exp(-(1 / 60) / (T.stopTime / LN20)));
    check(maxJump <= bound + 1e-9,
      `velocity switched instantly: jump ${maxJump} m/s exceeds the ${bound.toFixed(4)} m/s a single substep allows`);
  }

  /* ====================================================== 4. wall slide */
  say('4  wall slide');
  {
    const wx = 2.0;
    const c = spawn([ground, wallAt(wx)], 0, 0, 0);
    settle(c, 0.5);
    const input = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
    for (let i = 0; i < 240; i++) c.advance(1 / 60, input);
    const s = c.snapshot();
    say(`   pos x ${s.position.x.toFixed(6)} (wall face ${wx}, capsule radius ${T.radius})`);
    say(`   velocity (${s.velocity.x.toFixed(6)}, ${s.velocity.y.toFixed(6)}, ${s.velocity.z.toFixed(6)})`);

    check(s.position.x <= wx - T.radius + 1e-3,
      `capsule penetrated the wall: x = ${s.position.x}, limit ${wx - T.radius}`);
    check(s.position.x >= wx - T.radius - 0.02,
      `capsule stopped short of the wall: x = ${s.position.x}, expected about ${wx - T.radius}`);
    near(s.velocity.x, 0, 1e-6, 'into-wall velocity component');
    /* Tangential is untouched by the projection, so it converges on the full
     * tangential part of the target — not on some fraction of it. */
    near(s.velocity.z, T.walkSpeed * Math.SQRT1_2, T.walkSpeed * 0.01, 'along-wall velocity component');

    /* No sticking: the along-wall speed must not decay while pressed in. */
    const before = c.snapshot().velocity.z;
    for (let i = 0; i < 120; i++) c.advance(1 / 60, input);
    const after = c.snapshot().velocity.z;
    say(`   along-wall speed after another 2 s: ${after.toFixed(6)} (was ${before.toFixed(6)})`);
    check(after >= before - 1e-6, `stuck to the wall: along-wall speed fell from ${before} to ${after}`);

    /* Corner: two walls at 90 degrees, driven into the corner for 4 s. The
     * position must converge, not oscillate. */
    const corner = spawn([ground, wallAt(2.0), { kind: 'plane', n: [0, 0, -1], d: -2.0 }], 0, 0, 0);
    settle(corner, 0.5);
    for (let i = 0; i < 180; i++) corner.advance(1 / 60, input);
    const settled = corner.snapshot().position;
    let jitter = 0;
    for (let i = 0; i < 120; i++) {
      corner.advance(1 / 60, input);
      const p = corner.snapshot().position;
      jitter = Math.max(jitter, Math.hypot(p.x - settled.x, p.y - settled.y, p.z - settled.z));
    }
    say(`   corner: settled at (${settled.x.toFixed(4)}, ${settled.z.toFixed(4)}), wander over the next 2 s ${(jitter * 1000).toFixed(4)} mm`);
    check(jitter <= 0.001, `corner jitter of ${jitter * 1000} mm`);
  }

  /* ======================================================= 5. the ramps */
  say('5  ramps');
  {
    /* 15 degrees: walkable, and walkable at full speed. */
    const c = spawn([ground, ramp(15, 1.0)], 0, 0, 0);
    settle(c, 0.5);
    for (let i = 0; i < 60; i++) c.advance(1 / 60, { x: 1, z: 0 });   // get on it
    const a = c.snapshot();
    for (let i = 0; i < 120; i++) c.advance(1 / 60, { x: 1, z: 0 });
    const b = c.snapshot();
    const dxr = b.position.x - a.position.x;
    const dyr = b.position.y - a.position.y;
    say(`   15 deg: 2 s of uphill covered dx ${dxr.toFixed(4)} m, dy ${dyr.toFixed(4)} m, slope reads ${b.slopeAngle.toFixed(2)} deg, grounded ${b.grounded}`);
    check(b.grounded, '15 degree ramp is walkable');
    near(b.slopeAngle, 15, 0.5, 'reported slope on the 15 degree ramp');
    near(dxr / 2, T.walkSpeed, T.walkSpeed * 0.03, 'horizontal speed up the 15 degree ramp');
    near(dyr / dxr, Math.tan(15 * DEG), 0.01, 'climb rate matches the ramp');

    /* 35 degrees, standing ON the plane (the brief's case): 2 s of uphill
     * input must produce no net upward progress. Nothing but the ramp exists in
     * this world, so there is nowhere to be except on it. */
    const s = spawn([ramp(35, 0)], 3, 3 * Math.tan(35 * DEG) + 0.02, 0);
    settle(s, 0.4);
    const start = s.snapshot();
    let peak = start.position.y;
    for (let i = 0; i < 120; i++) {
      s.advance(1 / 60, { x: 1, z: 0 });
      peak = Math.max(peak, s.snapshot().position.y);
    }
    const e = s.snapshot();
    say(`   35 deg (standing on it): y ${start.position.y.toFixed(4)} -> ${e.position.y.toFixed(4)} (peak ${peak.toFixed(4)}), x ${start.position.x.toFixed(4)} -> ${e.position.x.toFixed(4)}, grounded ${e.grounded}, surface reads ${e.surfaceAngle.toFixed(2)} deg`);
    check(e.position.y <= start.position.y + 1e-3,
      `climbed the 35 degree ramp: y went ${start.position.y} -> ${e.position.y}`);
    check(peak <= start.position.y + 1e-3,
      `crept up the 35 degree ramp mid-run: peak ${peak} vs start ${start.position.y}`);
    check(!e.grounded, '35 degree ramp must not read as ground');
    near(e.surfaceAngle, 35, 0.5, 'reported surface angle on the 35 degree ramp');
    check(e.position.x < start.position.x - 0.05,
      `a too-steep face should slide the capsule back down (x ${start.position.x} -> ${e.position.x})`);
    say(`   35 deg: slid ${(start.position.x - e.position.x).toFixed(4)} m downhill in 2 s`);

    /* And walking into the foot of it from flat ground gains no height at all. */
    const foot = spawn([ground, ramp(35, 1.0)], 0, 0, 0);
    settle(foot, 0.5);
    let footPeak = 0;
    for (let i = 0; i < 240; i++) {
      foot.advance(1 / 60, { x: 1, z: 0 });
      footPeak = Math.max(footPeak, foot.snapshot().position.y);
    }
    const f = foot.snapshot();
    say(`   35 deg (walked into from flat): stalls at x ${f.position.x.toFixed(4)}, y ${f.position.y.toFixed(4)} (peak ${footPeak.toFixed(6)})`);
    check(footPeak <= 1e-3, `walked up the foot of the 35 degree ramp: peak y ${footPeak}`);
    check(f.position.x < 1.0, `pushed past the foot of the 35 degree ramp: x = ${f.position.x}`);
  }

  /* ======================================================== 6. steps */
  say('6  steps and low obstacles');
  {
    /* Three 0.17 m steps, 0.35 m treads, ascending towards +X. */
    const rise = 0.17, tread = 0.35;
    const stairs = [ground];
    for (let i = 0; i < 3; i++) {
      stairs.push(box(1 + i * tread, -1, -2, 40, rise * (i + 1), 2));
    }
    const c = spawn(stairs, 0, 0, 0);
    settle(c, 0.5);
    /* Momentum must survive the climb. Attempting the step only once the move
     * is *badly* blocked loses the whole approach speed on every stair, because
     * the substep that first grazes the edge projects the velocity away before
     * anything notices there is a step there. Watching the minimum speed over
     * the climb is what catches that. */
    let slowest = Infinity;
    for (let i = 0; i < 180; i++) {
      c.advance(1 / 60, { x: 1, z: 0 });
      const now = c.snapshot();
      if (now.position.x > 0.9 && now.position.x < 2.2) slowest = Math.min(slowest, now.speed);
    }
    const s = c.snapshot();
    say(`   slowest speed while climbing: ${slowest.toFixed(4)} m/s (walk speed ${T.walkSpeed})`);
    check(slowest >= T.walkSpeed * 0.97,
      `stairs cost momentum: dropped to ${slowest} m/s of ${T.walkSpeed}`);
    say(`   3 x ${rise} m steps: ended at x ${s.position.x.toFixed(4)}, y ${s.position.y.toFixed(4)}, grounded ${s.grounded}`);
    near(s.position.y, rise * 3, 0.01, 'height after climbing three steps');
    check(s.position.x > 1 + 3 * tread, `did not clear the stairs: x = ${s.position.x}`);
    check(s.grounded, 'grounded on the top of the stairs');

    /* A 0.40 m obstacle is above stepHeight (0.25) and must simply block. */
    const wallLike = spawn([ground, box(2, -1, -2, 2.5, 0.40, 2)], 0, 0, 0);
    settle(wallLike, 0.5);
    for (let i = 0; i < 240; i++) wallLike.advance(1 / 60, { x: 1, z: 0 });
    const w = wallLike.snapshot();
    say(`   0.40 m obstacle: ended at x ${w.position.x.toFixed(4)}, y ${w.position.y.toFixed(4)} (face at x = 2)`);
    check(w.position.y <= 1e-3, `climbed the 0.40 m obstacle: y = ${w.position.y}`);
    check(w.position.x <= 2 - T.radius + 1e-2, `penetrated the 0.40 m obstacle: x = ${w.position.x}`);
    check(w.position.x >= 2 - T.radius - 0.03, `stopped short of the 0.40 m obstacle: x = ${w.position.x}`);
  }

  /* ================================================= 7. falling/landing */
  say('7  edges, falling and landing');
  {
    const top = 2.0;
    const platform = box(-40, -1, -40, 1.0, top, 40);
    const c = spawn([ground, platform], 0, top, 0);
    settle(c, 0.5);
    check(c.snapshot().grounded, 'standing on the platform');

    let leftAt = -1, landedAt = -1, minY = Infinity;
    let t = 0;
    let wasGrounded = true;
    while (t < 3) {
      c.advance(1 / 60, { x: 1, z: 0 });
      t += 1 / 60;
      const s = c.snapshot();
      minY = Math.min(minY, s.position.y);
      if (leftAt < 0 && !s.grounded) leftAt = t;
      if (leftAt > 0 && landedAt < 0 && s.grounded) landedAt = t;
      wasGrounded = s.grounded;
    }
    const s = c.snapshot();
    say(`   walked off a ${top} m ledge at t=${leftAt.toFixed(3)}s, landed at t=${landedAt.toFixed(3)}s, lowest y ${minY.toFixed(6)}`);
    say(`   final y ${s.position.y.toFixed(6)}, vertical speed ${s.verticalSpeed.toFixed(6)}, grounded ${s.grounded}`);
    check(leftAt > 0, 'left the platform edge');
    check(landedAt > 0, 'landed on the ground below');
    check(minY >= -1e-3, `sank through the floor to y = ${minY}`);
    near(s.position.y, 0, 1e-3, 'resting height after landing');
    check(s.verticalSpeed === 0, `bounced on landing: vertical speed ${s.verticalSpeed}`);
    check(wasGrounded, 'stayed grounded after landing');

    /* Free-fall timing is the textbook one, which is the cheap check that the
     * trapezoid integration of gravity is right. */
    const drop = spawn([ground], 0, 5, 0);
    let ft = 0;
    while (!drop.snapshot().grounded && ft < 5) { drop.advance(1 / 60, { x: 0, z: 0 }); ft += 1 / 60; }
    const expect = Math.sqrt(2 * 5 / T.gravity);
    say(`   free fall from 5 m: ${ft.toFixed(4)} s (sqrt(2h/g) = ${expect.toFixed(4)} s)`);
    near(ft, expect, 0.03, 'free-fall time from 5 m');
  }

  /* =========================================================== 8. purity */
  say('8  determinism');
  {
    const schedule = (i) => (i < 90 ? { x: 1, z: 0.3 } : { x: -0.4, z: 1 });
    function run() {
      const c = spawn([ground, wallAt(2.2), ramp(15, -1)], 0, 0, 0);
      settle(c, 0.5);
      for (let i = 0; i < 240; i++) c.advance(1 / 60, schedule(i));
      return JSON.stringify(c.snapshot());
    }
    const a = run(), b = run();
    check(a === b, 'two identical runs produced different results');
    say(`   two identical runs hash the same snapshot: ${a === b}`);

    /* Nothing here consumed a random number, and nothing may: a stray draw in
     * presentation code would desynchronise the engine's seeded stream. This is
     * a belt-and-braces check on the module text itself. */
    const fs = require('fs');
    const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'walk', 'controller.js'), 'utf8');
    check(!/Math\.random/.test(src), 'controller.js contains Math.random');
    check(!/\brng\s*\(/.test(src), 'controller.js draws from the engine rng');
    check(!/Date\.now|performance\.now/.test(src), 'controller.js reads a clock');
    say('   controller.js contains no Math.random, no rng() and no clock read');
  }

  /* --------------------------------------------------------------- out */
  console.log(lines.join('\n'));
  console.log('');
  if (failures.length) {
    console.error(`FAILED — ${failures.length} of ${checks} checks:`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`OK — ${checks} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
