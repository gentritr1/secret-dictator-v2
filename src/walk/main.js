/*
 * walk.html — the movement workbench.
 *
 * Separate entry point from index.html on purpose. The bot playground is the
 * engine's window and has nothing to do with locomotion; keeping them apart
 * means neither can break the other, and neither carries the other's bundle.
 *
 * Three clocks, and only one of them decides anything:
 *
 *   render    requestAnimationFrame, whatever the display does. Draws.
 *   sim       a fixed 60 Hz accumulator inside the controller. Moves the body.
 *   camera    render rate, but exponential smoothing, so frame-rate agnostic.
 *
 * Nothing under src/walk draws a random number, from any source. The seeded
 * stream belongs to the engine, and the movement sim has to be replayable from
 * a scripted input list for review; both reasons point the same way. The check
 * is a grep across src/walk for a call to the engine's generator or to the
 * platform one, and it has to come back empty — including out of comments,
 * which is why this one names neither.
 */

import * as THREE from 'three';
import { createController, defaultTuning } from './controller.js';
import { createBvhWorld } from './bvh-world.js';
import { buildCourse, MARKS, COURSE_FACTS } from './course.js';
import { createCameraRig, defaultCameraTuning } from './camera.js';
import { createHud } from './hud.js';

const LN20 = Math.log(20);

/* ------------------------------------------------------------------ scene */

const stage = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft is deprecated in this three
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11141a);
scene.fog = new THREE.Fog(0x11141a, 45, 90);

const sun = new THREE.DirectionalLight(0xfff2e0, 2.2);
sun.position.set(14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xa8bee0, 0x3a3630, 1.9));

const { group: course, colliderGeometry } = buildCourse();
scene.add(course);
const world = createBvhWorld(colliderGeometry);

/* ---------------------------------------------------------------- avatar */

const tuning = defaultTuning();
const avatar = new THREE.Group();

const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(tuning.radius, tuning.height - tuning.radius * 2, 8, 20),
  new THREE.MeshLambertMaterial({ color: 0xd8dee9 })
);
body.position.y = tuning.height / 2;     // capsule geometry is centred on its origin
body.castShadow = true;
avatar.add(body);

/* A nose, so facing is readable. Without it a capsule turning is invisible and
 * "turn time" cannot be judged by eye, which is what this step is for. */
const nose = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.16, 0.34),
  new THREE.MeshLambertMaterial({ color: 0xe0724f })
);
nose.position.set(0, tuning.height * 0.72, tuning.radius + 0.1);
nose.castShadow = true;
avatar.add(nose);

/* A ring on the floor under the feet: with a plain capsule it is otherwise hard
 * to see exactly where the body is standing, which matters at ledges. */
const shadowRing = new THREE.Mesh(
  new THREE.RingGeometry(tuning.radius * 0.9, tuning.radius, 24),
  new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
);
shadowRing.rotation.x = -Math.PI / 2;
shadowRing.position.y = 0.01;
avatar.add(shadowRing);

scene.add(avatar);

const controller = createController({ tuning, world });
controller.teleport(MARKS.spawn.at[0], MARKS.spawn.at[1], MARKS.spawn.at[2]);

const rig = createCameraRig();
scene.add(rig.camera);

/* ----------------------------------------------------------------- input */

const keys = new Set();
const HELD = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight']
};

/*
 * Two input modes.
 *
 *   live      keyboard, camera-relative, advanced by wall-clock frame time
 *   scripted  a fixed vector set from the console, advanced ONLY by __walk.tick
 *
 * The second exists because a review has to be able to say "walk into that wall
 * for exactly two seconds of simulated time and tell me where you stopped". If
 * the render loop kept feeding real frame time into the sim while a scripted
 * run was in progress, the answer would depend on how long the reviewer took to
 * type the next line. Calling teleport() or setInput() therefore parks the live
 * loop; any key press, or __walk.resume(), starts it again.
 */
let mode = 'live';
const scriptedInput = { x: 0, z: 0 };
const input = { x: 0, z: 0 };

function readKeyboard() {
  let f = 0, s = 0;
  if (HELD.forward.some((k) => keys.has(k))) f += 1;
  if (HELD.back.some((k) => keys.has(k))) f -= 1;
  if (HELD.right.some((k) => keys.has(k))) s += 1;
  if (HELD.left.some((k) => keys.has(k))) s -= 1;

  /* Camera-relative: forward is the camera's forward flattened onto the floor. */
  input.x = rig.forward.x * f + rig.right.x * s;
  input.z = rig.forward.z * f + rig.right.z * s;
  const len = Math.hypot(input.x, input.z);
  if (len > 1) { input.x /= len; input.z /= len; }
  return len > 1e-6;
}

window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const all = [].concat(HELD.forward, HELD.back, HELD.left, HELD.right);
  if (all.includes(e.code)) {
    keys.add(e.code);
    if (mode !== 'live') setMode('live');
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* Drag to orbit. No pointer lock — see camera.js for why. */
let dragging = false;
let lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  rig.orbit(e.clientX - lastX, e.clientY - lastY);
  lastX = e.clientX; lastY = e.clientY;
});
const endDrag = () => { dragging = false; };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  rig.tuning.distance = Math.min(10, Math.max(1, rig.tuning.distance + Math.sign(e.deltaY) * 0.25));
  hud.refresh();
}, { passive: false });

/* ------------------------------------------------------------------- hud */

const hud = createHud(document, {
  walkTuning: tuning,
  cameraTuning: rig.tuning,
  onReset() {
    Object.assign(tuning, defaultTuning());
    Object.assign(rig.tuning, defaultCameraTuning());
    rig.resize(stage.clientWidth, stage.clientHeight);
  },
  onChange(key) {
    if (key === 'fov') rig.resize(stage.clientWidth, stage.clientHeight);
  }
});

function setMode(next) {
  if (mode === next) return;
  mode = next;
  if (next === 'live') scriptedInput.x = scriptedInput.z = 0;
}

/* -------------------------------------------------------------- the loop */

const renderPos = new THREE.Vector3();
const smoothed = new THREE.Vector3();
let smoothPrimed = false;
let last = performance.now();

/*
 * Step-ups move the foot by up to stepHeight in a single substep — the sim is
 * meant to be crisp, and a stair is a discontinuity. Only the drawing is
 * filtered: the height the avatar and the camera are shown at chases the height
 * the sim computed, with a short time constant. It is presentation only, and
 * __walk.state() always reports the real value.
 */
const STEP_SMOOTH = 0.07;

function frame(now) {
  requestAnimationFrame(frame);

  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.1, Math.max(0, raw));   // a stalled tab is not a long frame

  if (mode === 'live') {
    readKeyboard();
    controller.advance(dt, input, world);
  }

  controller.sample(renderPos);
  if (!smoothPrimed) {
    smoothed.copy(renderPos);
    smoothPrimed = true;
  } else {
    smoothed.x = renderPos.x;
    smoothed.z = renderPos.z;
    const b = 1 - Math.exp(-dt / (STEP_SMOOTH / LN20));
    smoothed.y += (renderPos.y - smoothed.y) * b;
    if (Math.abs(renderPos.y - smoothed.y) < 0.001) smoothed.y = renderPos.y;
  }

  avatar.position.copy(smoothed);
  avatar.rotation.y = controller.state.facing;
  shadowRing.visible = controller.state.grounded;

  rig.update(dt, smoothed, world);

  hud.tick(dt, controller.snapshot(), mode);
  renderer.render(scene, rig.camera);
}

function resize() {
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  /* updateStyle must stay on: with it off the canvas has no CSS size and is
   * laid out at its backing-store size, which on a 2x display renders the whole
   * scene at double scale. */
  renderer.setSize(w, h);
  rig.resize(w, h);
}
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

/* --------------------------------------------------------- review handle */

window.__walk = {
  /*
   * Put the capsule somewhere, at rest, and park the live loop.
   *
   * The scripted input is cleared too. A teleport that left the previous
   * scenario's direction held would make every scenario depend on the one
   * before it, which is exactly the kind of hidden coupling that makes a
   * scripted review untrustworthy.
   */
  teleport(x, y, z) {
    controller.teleport(x, y, z);
    scriptedInput.x = 0;
    scriptedInput.z = 0;
    smoothPrimed = false;
    setMode('scripted');
    return this.state();
  },

  /* A world-space unit input vector. Camera-independent by design: a scripted
   * scenario must not change meaning because the camera happens to be facing
   * somewhere else. */
  setInput(x, z) {
    const len = Math.hypot(x, z);
    scriptedInput.x = len > 1 ? x / len : x;
    scriptedInput.z = len > 1 ? z / len : z;
    setMode('scripted');
    return { x: scriptedInput.x, z: scriptedInput.z };
  },

  /* Advance the sim n frames of dt seconds, right now, with no wall clock
   * involved. Goes through the same accumulator the render loop uses. */
  tick(dt, n) {
    const steps = Math.max(1, Math.floor(n === undefined ? 1 : n));
    const h = dt === undefined ? 1 / 60 : dt;
    setMode('scripted');
    let substeps = 0;
    for (let i = 0; i < steps; i++) substeps += controller.advance(h, scriptedInput, world);
    controller.sample(renderPos);
    smoothed.copy(renderPos);
    return { frames: steps, dt: h, substeps, state: this.state() };
  },

  state() {
    return controller.snapshot();
  },

  /* Hand control back to the keyboard and the wall clock. */
  resume() {
    setMode('live');
    last = performance.now();
    return mode;
  },

  get mode() { return mode; },

  /* Named places on the course, with the input that exercises each. */
  marks: MARKS,
  facts: COURSE_FACTS,

  /* Live tuning objects — same references the sim reads. */
  tuning,
  camera: rig.tuning,
  resetTuning() {
    Object.assign(tuning, defaultTuning());
    Object.assign(rig.tuning, defaultCameraTuning());
    hud.refresh();
    return { tuning, camera: rig.tuning };
  },

  /* Convenience for a scripted scenario: go to a mark, walk its direction for
   * `seconds` of simulated time, report where it ended up. */
  run(markName, seconds) {
    const m = MARKS[markName];
    if (!m) throw new Error('unknown mark: ' + markName);
    this.teleport(m.at[0], m.at[1], m.at[2]);
    this.tick(1 / 60, 30);                    // half a second to settle on the floor
    this.setInput(m.go[0], m.go[1]);
    const out = this.tick(1 / 60, Math.round((seconds === undefined ? 3 : seconds) * 60));
    this.setInput(0, 0);
    return { mark: markName, note: m.note, ...out };
  }
};

console.info(
  '[walk] window.__walk ready — teleport(x,y,z), setInput(x,z), tick(dt,n), state(), ' +
  'resume(), run(mark, seconds). Marks: ' + Object.keys(MARKS).join(', ')
);
