/*
 * Third-person follow camera.
 *
 * Two smoothers, on purpose and separately tunable:
 *
 *   follow    where the boom is anchored — how hard the camera chases the body
 *   aim       where the camera looks — how hard the view chases the body
 *
 * They are different feelings. A slow follow with a fast aim keeps the character
 * pinned in frame while the world swings; a fast follow with a slow aim glides.
 * Collapsing them into one number, which is the usual shortcut, removes the only
 * dial that separates "heavy" from "floaty", so both are exposed on the overlay.
 *
 * Orbit is drag-to-look with no pointer lock. That is a deliberate choice for
 * this step: the page is a tuning instrument with a dozen sliders on it, and
 * pointer lock would mean releasing and re-acquiring the pointer every time the
 * owner wants to move one. The game will want pointer lock; the workbench does
 * not.
 *
 * No shake, no bob, no motion blur, no FOV kick. This step is about reading the
 * movement honestly.
 */

import * as THREE from 'three';

export function defaultCameraTuning() {
  return {
    distance: 3.5,      // m behind the character
    height: 1.8,        // m above its feet — roughly head height plus a little
    pivotHeight: 1.2,   // m up the body that the camera actually looks at
    followTime: 0.12,   // s for the boom anchor to cover 95% of a gap
    aimTime: 0.08,      // s for the look target to cover 95% of a gap
    fov: 60,
    minPitch: -60,      // deg, looking down
    maxPitch: 35,       // deg, looking up
    orbitSpeed: 0.28,   // deg of yaw per pixel dragged
    collisionPad: 0.20, // m the camera keeps off any surface it would enter
    minDistance: 0.6,   // m — never end up inside the character
    /*
     * Screen-space framing bias: how far RIGHT of centre the subject sits, as a
     * fraction of the viewport width. 0 is dead centre and is the default
     * everywhere — walk.html never sets it, and the branch below is skipped
     * entirely at 0, so the workbench runs the arithmetic it always ran.
     *
     * play.html sets it because a fixed 330 px HUD covers the left of the
     * scene, and a subject centred in the WINDOW is not centred in the part of
     * the window the player can see. Expressed as a screen fraction rather than
     * as metres on purpose: the world offset that produces it depends on the
     * boom distance, the field of view and the aspect ratio, all three of which
     * move (the wheel zooms, the window resizes), and a constant in metres
     * would silently mean something different at every zoom level.
     */
    screenBias: 0
  };
}

const LN20 = Math.log(20);
const DEG = Math.PI / 180;

export function createCameraRig(options = {}) {
  const tuning = Object.assign(defaultCameraTuning(), options.tuning || {});
  const camera = new THREE.PerspectiveCamera(tuning.fov, 1, 0.1, 500);

  /* Yaw = PI puts the camera on the -Z side looking along +Z, over the
   * character's shoulder. Pitch starts flat so the default really is "3.5 m
   * behind, 1.8 m above": the downward tilt you see comes from looking at the
   * pivot at 1.2 m rather than from an angle baked into the boom. */
  let yaw = Math.PI;
  let pitch = 0;

  const lookAt = { point: new THREE.Vector3(), initialised: false };
  const follow = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const boom = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const flatForward = new THREE.Vector3();
  const flatRight = new THREE.Vector3();
  let primed = false;

  function blend(dt, time) {
    if (time <= 1e-4) return 1;
    return 1 - Math.exp(-dt / (time / LN20));
  }

  function orbit(dxPixels, dyPixels) {
    yaw -= dxPixels * tuning.orbitSpeed * DEG;
    pitch -= dyPixels * tuning.orbitSpeed * DEG;
    const lo = tuning.minPitch * DEG, hi = tuning.maxPitch * DEG;
    pitch = Math.min(hi, Math.max(lo, pitch));
    if (yaw > Math.PI) yaw -= Math.PI * 2;
    if (yaw < -Math.PI) yaw += Math.PI * 2;
  }

  /*
   * target is the character's FOOT position. dt is real frame time — the camera
   * is presentation, not simulation, so it is allowed to run at render rate.
   * Its smoothers are exponential, which is frame-rate independent by
   * construction, so a 30 Hz frame and two 60 Hz frames land in the same place.
   */
  function update(dt, target, world) {
    aim.set(target.x, target.y + tuning.pivotHeight, target.z);
    desired.set(target.x, target.y + tuning.height, target.z);

    if (!primed) {
      follow.copy(desired);
      primed = true;
    } else {
      follow.lerp(desired, blend(dt, tuning.followTime));
    }

    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    boom.set(Math.sin(yaw) * cp, -sp, Math.cos(yaw) * cp);   // points backwards
    let distance = tuning.distance;

    if (world && world.raycast) {
      dir.copy(boom).normalize();
      const hit = world.raycast(follow, dir, distance + tuning.collisionPad);
      if (hit) distance = Math.max(tuning.minDistance, hit.distance - tuning.collisionPad);
    }

    camera.position.copy(follow).addScaledVector(boom, distance);

    /*
     * Framing bias, if the page asked for one.
     *
     * Moving the CAMERA sideways does not move the subject in frame — the look
     * target moves with it and the subject stays centred. What moves the
     * subject is aiming past it: shifting the look point to the LEFT of the
     * character puts the character to the RIGHT of centre, which is where the
     * unobscured half of play.html's window is.
     *
     * The conversion is the half-width of the view frustum at the boom
     * distance, so a bias of 0.5 would put the subject exactly on the right
     * edge and the number means the same thing at every zoom and aspect.
     *
     * Guarded rather than multiplied by zero so walk.html executes the same
     * instructions it did before this existed.
     */
    if (tuning.screenBias) {
      const halfWidth = Math.tan((tuning.fov * DEG) / 2) * distance * camera.aspect;
      /* The camera's flat right, recomputed here because flatRight below still
       * holds the previous frame's value at this point in the function. */
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const shift = 2 * halfWidth * tuning.screenBias;
      aim.x -= rx * shift;
      aim.z -= rz * shift;
    }

    /* Aim is its own smoother, applied to the point being looked at rather than
     * to the camera's quaternion: smoothing the quaternion drifts off the
     * subject during a fast orbit, smoothing the target does not. */
    if (!lookAt.initialised) {
      lookAt.point.copy(aim);
      lookAt.initialised = true;
    } else {
      lookAt.point.lerp(aim, blend(dt, tuning.aimTime));
    }
    camera.lookAt(lookAt.point);

    /* The ground-plane basis the controller's input is expressed in. Forward is
     * the camera's own forward flattened onto the floor, so "up" on the
     * keyboard means "away from the camera" no matter where it is pointing. */
    flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    /* right = forward × up. The first version had the signs flipped, which
     * swapped A/D — caught by hand, not by tests, because the scripted review
     * API feeds the sim directly and never crosses this keyboard→camera seam. */
    flatRight.set(-flatForward.z, 0, flatForward.x);
  }

  function resize(width, height) {
    camera.aspect = width / Math.max(1, height);
    camera.fov = tuning.fov;
    camera.updateProjectionMatrix();
  }

  function reset() {
    yaw = Math.PI;
    pitch = 0;
    primed = false;
    lookAt.initialised = false;
  }

  return {
    camera,
    tuning,
    orbit,
    update,
    resize,
    reset,
    forward: flatForward,
    right: flatRight,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    get distance() { return camera.position.distanceTo(lookAt.point); },
    resetTuning: () => Object.assign(tuning, defaultCameraTuning())
  };
}
