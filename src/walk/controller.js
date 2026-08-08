/*
 * Kinematic capsule controller — pure logic, no three.js, no DOM, no clock.
 *
 * The rule this module exists to enforce: *movement is a function of input and
 * dt, nothing else*. It holds no scene object, reads no global, and asks the
 * world only two questions, both injected:
 *
 *   world.deepestContact(ax,ay,az, bx,by,bz, radius, out) -> boolean
 *       The capsule is the set of points within `radius` of the segment
 *       a->b (a is the lower sphere centre, b the upper). Fill `out` with the
 *       single deepest overlap and return true, or return false if there is
 *       none. `out.nx/ny/nz` is a unit normal pointing *out of the surface and
 *       towards the capsule* — i.e. the direction the capsule must move to stop
 *       overlapping — and `out.depth` is how far it must move (metres).
 *
 *   world.raycastDown(x, y, z, maxDist, out) -> boolean
 *       Cast straight down from (x,y,z) at most maxDist metres. Fill
 *       `out.distance` and `out.nx/ny/nz` (the surface normal at the hit) and
 *       return true, or return false for a miss.
 *
 * Two implementations satisfy that interface: src/walk/bvh-world.js (a merged
 * three.js mesh through three-mesh-bvh, used by the browser) and the analytic
 * plane/box world in test/controller.test.js (used by node). The controller
 * cannot tell them apart, which is the whole point — the same code that runs in
 * the browser is the code the unit tests exercise.
 *
 * Position is the FOOT of the capsule: the point the character stands on, not
 * the capsule centre. Facing is a yaw in radians, atan2(vx, vz), so that a
 * three.js object with rotation.y = facing points along the movement direction.
 */

const DEG = Math.PI / 180;

/*
 * ln(20) turns a "time to get there" into an exponential time constant.
 * An exponential approach covers 1 - e^(-t/tau) of the gap; at t = tau*ln(20)
 * that is exactly 95%. So a tuning value of accelTime = 0.25 means literally
 * "0.25 s to reach 95% of walk speed", not "some constant that feels like it".
 * Every smoothing in this file uses the same convention, and the unit test
 * measures against it.
 */
const LN20 = Math.log(20);

export function defaultTuning() {
  return {
    /* --- the body ------------------------------------------------------- */
    height: 1.70,          // m, total capsule height (foot to crown)
    radius: 0.35,          // m

    /* --- locomotion ----------------------------------------------------- */
    walkSpeed: 3.5,        // m/s, horizontal, on the flat and up walkable slopes
    accelTime: 0.25,       // s from rest to 95% of walkSpeed
    stopTime: 0.15,        // s from walkSpeed down to 5% of it
    turnTime: 0.20,        // s to complete 95% of a turn towards the heading
    airControl: 0.35,      // fraction of the ground blend applied when airborne
    restSpeed: 0.02,       // m/s below which a decelerating body is parked at 0
    turnMinSpeed: 0.05,    // m/s below which facing stops chasing velocity

    /* --- the world ------------------------------------------------------ */
    gravity: 22.0,         // m/s^2 — heavier than earth on purpose: "controlled
                           // physicality", falls read as decisive, not floaty
    maxFallSpeed: 28.0,    // m/s terminal
    slideFallSpeed: 4.0,   // m/s cap while in contact with a too-steep surface,
                           // so a slide is a slide and not a launch

    /* --- ground rules --------------------------------------------------- */
    maxSlopeDeg: 30,       // steeper than this is not ground; it is a wall you
                           // slide down. The course has a 15 deg and a 35 deg
                           // ramp; this sits between them on purpose.
    stepHeight: 0.25,      // m, the tallest ledge that is stepped up rather
                           // than walked into (course steps rise 0.17 m, the
                           // low obstacle is 0.40 m and must block)
    toeReach: 0.06,        // m past the capsule's own radius that the toe probe
                           // looks ahead for a ledge; must exceed the distance
                           // at which the bottom sphere fouls a step edge
    snapDistance: 0.30,    // m, how far down the feet reach to stay glued to
                           // ground when walking downhill or down steps

    /* --- solver --------------------------------------------------------- */
    skin: 1e-4,            // m of clearance left after a push-out
    resolveIterations: 6   // depenetration passes per move
  };
}

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createController(options = {}) {
  const tuning = Object.assign(defaultTuning(), options.tuning || {});
  const fixedDt = options.fixedDt || 1 / 60;
  const maxSubsteps = options.maxSubsteps || 8;

  const state = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    facing: 0,
    grounded: false,
    groundNormal: { x: 0, y: 1, z: 0 },
    slopeAngle: 0,     // deg, the ground you are standing on (0 when airborne)
    surfaceAngle: 0,   // deg, whatever is under the feet, walkable or not
    airTime: 0,        // s since last grounded
    substeps: 0        // total fixed steps integrated, for the overlay
  };

  let world = options.world || null;
  let accumulator = 0;

  /* Scratch. Nothing in the hot path allocates: this runs 60 times a second
   * and calls into a BVH several times per run. */
  const contact = { nx: 0, ny: 0, nz: 0, depth: 0 };
  const hit = { distance: 0, nx: 0, ny: 0, nz: 0 };
  const trial = { x: 0, y: 0, z: 0 };
  const plain = { x: 0, y: 0, z: 0 };
  const previous = { x: 0, y: 0, z: 0 };

  /* What the last resolve() pass touched. */
  const WALL_SLOTS = 6;
  const walls = [];
  for (let i = 0; i < WALL_SLOTS; i++) walls.push({ x: 0, y: 0, z: 0 });
  let wallCount = 0;
  let steepTouch = false;
  let ceilingTouch = false;
  let groundTouch = false;
  let steppedUp = false;
  let gnx = 0, gny = 1, gnz = 0;

  function clearRecords() {
    wallCount = 0;
    steepTouch = false;
    ceilingTouch = false;
    groundTouch = false;
  }

  function recordWall(nx, ny, nz) {
    for (let i = 0; i < wallCount; i++) {
      const w = walls[i];
      if (w.x * nx + w.y * ny + w.z * nz > 0.98) return;
    }
    if (wallCount < WALL_SLOTS) {
      const w = walls[wallCount++];
      w.x = nx; w.y = ny; w.z = nz;
    }
  }

  /*
   * Push the capsule out of anything it overlaps.
   *
   * Deepest contact first, then re-query. Resolving every contact in one batch
   * over-pushes in a corner (both walls move you the full depth, so you pop out
   * diagonally and then get pushed back next frame — that is exactly the corner
   * jitter the narrow passage in the course is there to catch). One at a time
   * converges instead, because each push is measured against the position the
   * previous push produced.
   *
   * mode: 0 = do not record, 1 = record, 2 = reset the records then record.
   */
  function resolve(p, mode) {
    if (mode === 2) clearRecords();
    if (!world) return;

    const r = tuning.radius;
    const top = tuning.height - r;
    const cosMax = Math.cos(tuning.maxSlopeDeg * DEG);

    for (let i = 0; i < tuning.resolveIterations; i++) {
      if (!world.deepestContact(p.x, p.y + r, p.z, p.x, p.y + top, p.z, r, contact)) break;
      if (contact.depth <= 1e-7) break;

      const push = contact.depth + tuning.skin;

      if (contact.ny >= cosMax) {
        /* Walkable ground: push straight out along the surface normal. */
        p.x += contact.nx * push;
        p.y += contact.ny * push;
        p.z += contact.nz * push;
        if (mode) {
          /* Prefer the STEEPEST walkable contact as "the ground". At the foot
           * of a ramp the capsule touches both the flat floor (ny = 1) and the
           * ramp (ny = 0.966); taking the ramp is what makes the transition
           * smooth, because the next step's movement is projected onto the
           * surface it is about to be on rather than the one behind it. */
          if (!groundTouch || contact.ny < gny) {
            gnx = contact.nx; gny = contact.ny; gnz = contact.nz;
          }
          groundTouch = true;
        }
      } else {
        const hl = Math.hypot(contact.nx, contact.nz);
        if (hl > 1e-4) {
          /* Too steep to stand on, so it is a wall: push out HORIZONTALLY,
           * never along the normal.
           *
           * This one line is what makes a 35 deg ramp unclimbable. Pushing out
           * along the normal would lift the capsule by depth*cos(theta) every
           * time it walked into the slope, which is not "being blocked", it is
           * a very slow staircase. Pushing horizontally by depth/|n_h| removes
           * exactly the same overlap with zero height gain, so walking uphill
           * into a steep face makes no progress at all. */
          const t = Math.min(push / hl, push * 8);
          p.x += (contact.nx / hl) * t;
          p.z += (contact.nz / hl) * t;
        } else {
          /* A ceiling: nothing horizontal to push along. */
          p.y += contact.ny * push;
        }
        if (mode) {
          recordWall(contact.nx, contact.ny, contact.nz);
          if (contact.ny > 0.1) steepTouch = true;
          if (contact.ny < -0.1) ceilingTouch = true;
        }
      }
    }
  }

  /*
   * Where the capsule's axis sits when it is resting on a plane.
   *
   * `position` is the foot: the axis point one radius below the lower sphere's
   * centre. That is the surface height only on level ground. On a slope the
   * sphere touches the plane at a point off to the side, and the axis floats
   * radius*(1/ny - 1) above whatever is directly underneath — 1.3 cm on a 15
   * degree ramp. Snapping the foot to the raw height under the axis instead
   * would bury the capsule by that much every substep and then push it back
   * out, which reads as a ramp that costs you 5% of your speed for no reason.
   */
  function restingY(surfaceY, ny) {
    return surfaceY + tuning.radius * (1 / Math.max(ny, 1e-3) - 1);
  }

  /*
   * Look for a ledge in front of the feet.
   *
   * The ray starts stepHeight above the foot and reaches down exactly that far,
   * so by construction it can only find surfaces the capsule is allowed to step
   * onto — anything lower is out of reach and anything higher is above the ray
   * origin. Returns the resting height for that ledge, or NaN.
   */
  function toeProbe(x, y, z, ux, uz) {
    if (!world) return NaN;
    const ahead = tuning.radius + tuning.toeReach;
    const originY = y + tuning.stepHeight + 2e-3;
    const reach = tuning.stepHeight + 3e-3;
    if (!world.raycastDown(x + ux * ahead, originY, z + uz * ahead, reach, hit)) return NaN;
    if (hit.ny < Math.cos(tuning.maxSlopeDeg * DEG)) return NaN;
    return restingY(originY - hit.distance, hit.ny);
  }

  /*
   * Horizontal movement, with one attempt to step up whatever blocked it.
   *
   * dy is not gravity — it is the vertical part of following the ground plane
   * (walking up a ramp is a horizontal delta plus the height that plane demands).
   *
   * The step-up is deliberately *not* the textbook "lift, move forward, drop a
   * ray from the new centre". That fails on exactly the case it exists for: a
   * capsule walking at a 0.17 m step is held 0.30 m away from it by its own
   * bottom sphere fouling the step's top edge, so the raised capsule's axis is
   * still short of the step and a ray under it finds the floor again, not the
   * step. The probe therefore looks a whole radius *ahead* of the axis, which
   * is where the ledge actually is when the capsule first jams on it.
   */
  function moveHorizontal(p, dx, dy, dz, wasGrounded) {
    const sx = p.x, sy = p.y, sz = p.z;
    const wanted = Math.hypot(dx, dz);

    p.x += dx; p.y += dy; p.z += dz;
    resolve(p, 2);
    steppedUp = false;

    if (wanted < 1e-9 || tuning.stepHeight <= 0 || !wasGrounded || !world) return;

    /* Only geometry too steep to stand on can justify a step-up. A walkable
     * ramp already slows the move down (the push-out is along its normal, so
     * some of the requested metres go into height instead of ground), and
     * lifting the capsule for that would put a 10 cm hop at the foot of every
     * gentle slope. */
    if (wallCount === 0) return;

    /* How much of the requested move actually happened, measured along the
     * requested direction (so sliding sideways along a wall does not count).
     *
     * There is deliberately no "only bother if badly blocked" threshold here.
     * The substep in which the bottom sphere first grazes a step's edge is
     * barely slowed at all — but it is the substep whose contact normal, left
     * to run, projects the forward velocity to nothing. Waiting one more
     * substep to notice the step therefore costs the whole approach speed and
     * the character re-accelerates on every stair. Attempting the step on first
     * contact keeps the momentum; the attempt is one ray and it fails fast on
     * anything that is not a ledge. */
    const progress = ((p.x - sx) * dx + (p.z - sz) * dz) / wanted;
    plain.x = p.x; plain.y = p.y; plain.z = p.z;

    const ledge = toeProbe(sx, sy, sz, dx / wanted, dz / wanted);
    if (!(ledge > sy + 1e-3)) return;      // nothing to climb (NaN falls out here)

    /* Lift to the ledge, then redo the move from there. */
    trial.x = sx; trial.y = ledge; trial.z = sz;
    resolve(trial, 0);
    if (trial.y > ledge + 1e-3 || trial.y < ledge - 1e-3) return;   // no headroom
    trial.x += dx; trial.z += dz;
    resolve(trial, 0);
    const stepped = ((trial.x - sx) * dx + (trial.z - sz) * dz) / wanted;
    if (stepped <= progress + 1e-4) return;                          // still blocked

    p.x = trial.x; p.y = trial.y; p.z = trial.z;
    /* Re-record from scratch: the failed ground-level attempt logged a wall
     * normal, and if that survived, the velocity projection below would kill
     * the speed of a character who successfully climbed the step. */
    resolve(p, 2);
    steppedUp = true;
  }

  /* One fixed integration step. Never called with a variable dt from the render
   * loop — advance() is the only thing that decides how many of these run. */
  function step(h, input, w) {
    if (w !== undefined) world = w;

    const T = tuning;
    const S = state;
    const p = S.position;
    const v = S.velocity;
    const cosMax = Math.cos(T.maxSlopeDeg * DEG);
    const wasGrounded = S.grounded;

    previous.x = p.x; previous.y = p.y; previous.z = p.z;

    /* --- 1. horizontal velocity ----------------------------------------
     *
     * The velocity chases its target exponentially, and the displacement over
     * the step is the exact integral of that exponential rather than
     * (new velocity x h). It costs one extra multiply and buys a real property:
     * the total distance covered while stopping is v0 * tau no matter what h
     * is, so "stop in 0.15 s" is a claim about metres on the floor and not
     * about the integrator. Plain Euler undershoots that by ~16% at 60 Hz and
     * by a different amount at every other rate. */
    let ix = input && input.x || 0;
    let iz = input && input.z || 0;
    const inLen = Math.hypot(ix, iz);
    if (inLen > 1) { ix /= inLen; iz /= inLen; }
    const wants = inLen > 1e-6;

    const targetX = ix * T.walkSpeed;
    const targetZ = iz * T.walkSpeed;
    /* Air control lengthens the time constant instead of scaling the blend,
     * which keeps the response a true exponential and so keeps the closed form
     * above valid in the air as well as on the ground. */
    const tau = (wants ? T.accelTime : T.stopTime) / LN20 /
                (S.grounded ? 1 : Math.max(T.airControl, 1e-3));
    const blend = 1 - Math.exp(-h / Math.max(tau, 1e-6));

    const dispX = targetX * h + (v.x - targetX) * tau * blend;
    const dispZ = targetZ * h + (v.z - targetZ) * tau * blend;
    v.x += (targetX - v.x) * blend;
    v.z += (targetZ - v.z) * blend;
    if (!wants && Math.hypot(v.x, v.z) < T.restSpeed) { v.x = 0; v.z = 0; }

    /* --- 2. facing ------------------------------------------------------ */
    const speed = Math.hypot(v.x, v.z);
    if (speed > T.turnMinSpeed) {
      const want = Math.atan2(v.x, v.z);
      const turn = 1 - Math.exp(-h / Math.max(T.turnTime / LN20, 1e-6));
      S.facing = wrapPi(S.facing + wrapPi(want - S.facing) * turn);
    }

    /* --- 3. gravity -----------------------------------------------------
     * Trapezoid on the vertical too: for a constant acceleration the average
     * of the before and after velocities is the exact displacement, so a fall
     * covers the same metres per second of sim regardless of h. */
    let dyGrav = 0;
    if (S.grounded) {
      v.y = 0;
    } else {
      const vy0 = v.y;
      v.y -= T.gravity * h;
      if (v.y < -T.maxFallSpeed) v.y = -T.maxFallSpeed;
      dyGrav = 0.5 * (vy0 + v.y) * h;
    }

    /* --- 4. move -------------------------------------------------------- */
    const dx = dispX, dz = dispZ;
    let dy = 0;
    if (S.grounded && S.groundNormal.y > 1e-4) {
      /* Follow the ground plane. Horizontal speed is preserved exactly, so a
       * walkable ramp costs no ground speed — you cover the same metres per
       * second of map whether it is flat or tilted, which is what "15 deg is
       * walkable at full speed" has to mean if the number is to be checkable. */
      dy = -(dx * S.groundNormal.x + dz * S.groundNormal.z) / S.groundNormal.y;
    }

    moveHorizontal(p, dx, dy, dz, wasGrounded);

    if (!S.grounded) {
      p.y += dyGrav;
      resolve(p, 1);
    }

    /* --- 5. what are we standing on -------------------------------------
     *
     * One ray straight down the capsule's axis. It answers two questions that
     * have to stay separate: *am I supported* (used for gravity and control)
     * and *should I be pulled down onto it* (used to stay glued to descending
     * ground). A step-up just happened means the answer to the second is no,
     * because the axis has not caught up with the ledge the feet are on yet and
     * the floor the ray still sees would undo the step immediately. */
    let suppressDrop = steppedUp;
    if (!suppressDrop && wasGrounded) {
      const sp2 = Math.hypot(v.x, v.z);
      if (sp2 > 1e-4) {
        /* A ledge at the current height directly ahead means the feet are
         * already on it even if the axis is not over it yet. */
        suppressDrop = !isNaN(toeProbe(p.x, p.y, p.z, v.x / sp2, v.z / sp2));
      }
    }

    const rayY = p.y + T.radius;
    const reach = T.radius + T.snapDistance + 1e-3;
    let grounded = false;
    let nx = 0, ny = 1, nz = 0;

    S.surfaceAngle = 0;
    if (world && world.raycastDown(p.x, rayY, p.z, reach, hit)) {
      S.surfaceAngle = Math.acos(Math.min(1, Math.max(-1, hit.ny))) / DEG;
      const landedY = restingY(rayY - hit.distance, hit.ny);
      /* Snapping down is only allowed if we were already on the ground: it is
       * "stay glued while walking downhill or down a step", not "get sucked to
       * the floor mid-fall". */
      const limit = T.radius + (wasGrounded ? T.snapDistance : 1e-3);
      if (hit.ny >= cosMax && hit.distance <= limit) {
        grounded = true;
        nx = hit.nx; ny = hit.ny; nz = hit.nz;
        if (landedY < p.y && !suppressDrop) p.y = landedY;
      }
    }
    if (groundTouch) {
      /* An actual overlap beats a probe — this is the landing case, and the
       * case where the feet are on a ramp the centre ray has not reached yet. */
      grounded = true;
      nx = gnx; ny = gny; nz = gnz;
    }

    S.grounded = grounded;
    if (grounded) {
      S.groundNormal.x = nx; S.groundNormal.y = ny; S.groundNormal.z = nz;
      S.slopeAngle = Math.acos(Math.min(1, Math.max(-1, ny))) / DEG;
      S.airTime = 0;
      if (v.y < 0) v.y = 0;               // land without a bounce
    } else {
      S.slopeAngle = 0;
      S.airTime += h;
    }

    /* --- 6. velocity against what we hit -------------------------------- */
    for (let i = 0; i < wallCount; i++) {
      const w = walls[i];
      const hl = Math.hypot(w.x, w.z);
      if (hl > 1e-4) {
        /* Horizontal projection only, for the same reason the push-out is
         * horizontal: projecting the full 3-vector onto a 35 deg plane turns a
         * forward push into an upward one, and the capsule strolls up a slope
         * it was supposed to be refused by. */
        const ux = w.x / hl, uz = w.z / hl;
        const into = v.x * ux + v.z * uz;
        if (into < 0) { v.x -= ux * into; v.z -= uz * into; }
      }
      if (w.y < -0.1 && v.y > 0) v.y = 0;
    }
    if (steepTouch && v.y < -T.slideFallSpeed) v.y = -T.slideFallSpeed;

    S.substeps++;
  }

  /*
   * The only entry point the render loop is allowed to use.
   *
   * Frame time goes into an accumulator and comes out as whole fixed steps. The
   * feel of the character therefore depends on `fixedDt` and the tuning values
   * and on nothing else — not on the refresh rate, not on whether the tab was
   * throttled, not on how heavy the frame was. The leftover is exposed as
   * alpha() so the renderer can interpolate and still look smooth at 144 Hz.
   */
  function advance(dt, input, w) {
    if (w !== undefined) world = w;
    if (!(dt > 0)) return 0;

    accumulator += dt;
    let n = 0;
    while (accumulator >= fixedDt && n < maxSubsteps) {
      step(fixedDt, input);
      accumulator -= fixedDt;
      n++;
    }
    /* A frame so long that it would need more than maxSubsteps is a stall, not
     * a slow frame. Dropping the remainder loses time rather than entering a
     * spiral where each catch-up frame is longer than the last. */
    if (accumulator >= fixedDt) accumulator = 0;
    return n;
  }

  function teleport(x, y, z) {
    state.position.x = x; state.position.y = y; state.position.z = z;
    previous.x = x; previous.y = y; previous.z = z;
    state.velocity.x = 0; state.velocity.y = 0; state.velocity.z = 0;
    state.grounded = false;
    state.groundNormal.x = 0; state.groundNormal.y = 1; state.groundNormal.z = 0;
    state.slopeAngle = 0;
    state.surfaceAngle = 0;
    state.airTime = 0;
    accumulator = 0;
    clearRecords();
  }

  /* Render position: the fixed sim is behind the display by whatever is left in
   * the accumulator, so interpolate the gap instead of showing a stale step. */
  function sample(out) {
    const a = Math.min(1, accumulator / fixedDt);
    out.x = previous.x + (state.position.x - previous.x) * a;
    out.y = previous.y + (state.position.y - previous.y) * a;
    out.z = previous.z + (state.position.z - previous.z) * a;
    return out;
  }

  function snapshot() {
    const p = state.position, v = state.velocity;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      speed: Math.hypot(v.x, v.z),
      verticalSpeed: v.y,
      facing: state.facing,
      grounded: state.grounded,
      groundNormal: {
        x: state.groundNormal.x, y: state.groundNormal.y, z: state.groundNormal.z
      },
      slopeAngle: state.slopeAngle,
      surfaceAngle: state.surfaceAngle,
      airTime: state.airTime,
      substeps: state.substeps
    };
  }

  return {
    tuning,
    state,
    fixedDt,
    step,
    advance,
    teleport,
    sample,
    snapshot,
    alpha: () => Math.min(1, accumulator / fixedDt),
    setWorld: (w) => { world = w; },
    resetTuning: () => Object.assign(tuning, defaultTuning())
  };
}
