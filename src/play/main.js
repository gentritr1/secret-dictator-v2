/*
 * play.html — the first human-playable match.
 *
 * One capsule you steer around a graybox square, nine you do not, and a whole
 * game of Secret Dictator played through real decisions: nominate when you hold
 * the gavel, vote on every government, draft when you are elected, aim the
 * powers the Seize board hands you.
 *
 * Four things run here and only one of them decides anything:
 *
 *   render    requestAnimationFrame, whatever the display does. Draws.
 *   movement  a fixed 60 Hz accumulator inside the Step 3 controller.
 *   match     a setTimeout chain. One bot action per tick.
 *   you       no clock at all. When the rules are waiting on this seat, the
 *             match stops and stays stopped. There is no timeout, by design:
 *             a deduction game that plays your turn for you is not one.
 *
 * The one-way flow, unchanged from the playground and tightened by one link:
 *
 *   engine (truth) -> session -> view.js (projection) -> panels / scene
 *
 * The game object appears in this file exactly twice, both times as an argument
 * being handed to `View.viewFor` — it is never read here, and no field of it is
 * ever named. Everything drawn comes from `view`, the player-safe projection
 * for this seat, and src/play/panels.js does not import an engine module at
 * all. That is the whole discipline: the moment a label reaches for
 * `G.players[id].name` it can also reach for `.role`, and that is how a
 * deduction game leaks.
 *
 * Nothing here draws a random number from any source. The engine's seeded
 * stream belongs to the engine, and one draw from the presentation layer would
 * desynchronise every later bot decision from the same seed.
 */

import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { SD, AI, Human, View } from '../engine/index.js';
import { createController, defaultTuning } from '../walk/controller.js';
import { createCameraRig } from '../walk/camera.js';
import { createBvhWorld } from '../walk/bvh-world.js';
import { buildSquare, seatPosition, SPAWN, DAIS, BELL, BENCH } from './square.js';
import { createInteractions } from './interact.js';
import { createPanels } from './panels.js';

const NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
const DEFAULT_SEED = 1000;
const DEFAULT_PLAYERS = 7;
const DEFAULT_HUMAN = 0;

/** Milliseconds between bot actions at 1x. */
const BASE_INTERVAL = 900;
/** How often the loop looks up while it is waiting on the human. */
const IDLE_INTERVAL = 200;

const LN20 = Math.log(20);
const STEP_SMOOTH = 0.07;      // presentation only; see docs/step-03.md

/*
 * The HUD covers the left of the window, so the camera frames the body to the
 * right of centre — otherwise the thing the player is steering spends the match
 * behind a panel of text.
 *
 * HUD_PX is the width in src/play/style.css. Putting the subject in the middle
 * of what is left needs a shift of (HUD_PX / 2) / windowWidth; FRAMING_BIAS is
 * how much of that correction is actually applied, and it is deliberately less
 * than all of it — full correction reads as a camera that is looking somewhere
 * else. Both are here rather than in camera.js because the HUD is this page's
 * problem: `screenBias` defaults to 0 and walk.html never sets it.
 */
const HUD_PX = 330;
const FRAMING_BIAS = 0.6;
const MAX_FRAMING_BIAS = 0.18;   // a narrow window must not swing the camera off

const COLOR = {
  citizen: 0x8d96a8,
  dead: 0x40444d,
  you: 0xd8dee9,
  speaker: 0xffb454,
  nominee: 0x54c8ff,
  deputy: 0x6ddd8c
};

/* ------------------------------------------------------------------ scene */

const stage = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11141a);
scene.fog = new THREE.Fog(0x11141a, 40, 90);

const sun = new THREE.DirectionalLight(0xfff2e0, 2.0);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xa8bee0, 0x3a3630, 1.8));

const { group: square, colliderGeometry } = buildSquare();
scene.add(square);
const world = createBvhWorld(colliderGeometry);

/* ----------------------------------------------------------- your capsule */

const tuning = defaultTuning();
const avatar = new THREE.Group();

const youBody = new THREE.Mesh(
  new THREE.CapsuleGeometry(tuning.radius, tuning.height - tuning.radius * 2, 8, 20),
  new THREE.MeshLambertMaterial({ color: COLOR.you })
);
youBody.position.y = tuning.height / 2;
youBody.castShadow = true;
avatar.add(youBody);

const youNose = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.16, 0.34),
  new THREE.MeshLambertMaterial({ color: 0xe0724f })
);
youNose.position.set(0, tuning.height * 0.72, tuning.radius + 0.1);
youNose.castShadow = true;
avatar.add(youNose);

const youRing = ringMesh(COLOR.speaker);
avatar.add(youRing);

scene.add(avatar);

const controller = createController({ tuning, world });
const rig = createCameraRig();
scene.add(rig.camera);

function ringMesh(color) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.7, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.visible = false;
  return m;
}

/* ------------------------------------------------------------- the crowd */

const cast = new THREE.Group();
scene.add(cast);
let citizens = [];       // one per seat; the human's entry is a floor marker only

function clearCast() {
  for (const c of citizens) {
    c.group.traverse((o) => {
      if (o.isCSS2DObject && o.element && o.element.parentNode) {
        o.element.parentNode.removeChild(o.element);
      }
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  cast.clear();
  citizens = [];
}

/**
 * One capsule per bot, plus a floor marker on the human's own spot so the ring
 * of seats reads as complete even though you are off walking around in it.
 */
function setRoster(view) {
  clearCast();
  const n = view.players.length;

  for (const p of view.players) {
    const at = seatPosition(p.id, n);
    const group = new THREE.Group();
    group.position.set(at.x, 0, at.z);
    group.lookAt(0, 0, 0);            // +Z of a mesh faces the lookAt target

    const pose = new THREE.Group();
    group.add(pose);

    let material = null;
    if (!p.isYou) {
      material = new THREE.MeshLambertMaterial({ color: COLOR.citizen });
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.34, 0.86, 6, 16), material
      );
      body.position.y = 0.85;
      body.castShadow = true;
      pose.add(body);

      const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.24, 12),
        new THREE.MeshLambertMaterial({ color: 0xe8ecf4 })
      );
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 1.05, 0.33);
      pose.add(nose);
    } else {
      /* Your seat: a dim disc, so the ring is not missing a tooth. */
      const spot = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.5, 28),
        new THREE.MeshBasicMaterial({ color: 0x59617a, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
      );
      spot.rotation.x = -Math.PI / 2;
      spot.position.y = 0.015;
      pose.add(spot);
    }

    const ring = ringMesh(COLOR.speaker);
    group.add(ring);

    const nameEl = document.createElement('div');
    nameEl.className = 'tag' + (p.isYou ? ' me' : '');
    nameEl.textContent = p.name + (p.isYou ? ' (you)' : '');
    const nameLabel = new CSS2DObject(nameEl);
    nameLabel.position.set(0, p.isYou ? 0.35 : 1.95, 0);
    group.add(nameLabel);

    const badgeEl = document.createElement('div');
    badgeEl.className = 'badge hidden';
    const badgeLabel = new CSS2DObject(badgeEl);
    badgeLabel.position.set(0, 2.35, 0);
    group.add(badgeLabel);

    cast.add(group);
    citizens.push({ id: p.id, isYou: p.isYou, group, pose, ring, material, nameEl, badgeEl, toppled: false });
  }
}

/** Push the view into the scene. Read-only in `view`, which is already a copy. */
function applyToScene(view) {
  const showNominee = view.phase === 'vote' || view.phase === 'vote_result';
  /* The tally is public the moment the ballots are opened, so the badges come
   * from view.lastVote and never from the driver's event payload. */
  const tally = view.phase === 'vote_result' && view.lastVote ? view.lastVote : null;

  for (const c of citizens) {
    const p = view.players[c.id];
    /* The cast and the view can disagree for one instant during a restart, and
     * a ten-seat cast against a five-seat view used to throw here and leave the
     * page dead. The ordering in restart() makes it not happen; this makes it
     * not matter. */
    if (!p) continue;

    if (!p.alive) {
      if (!c.toppled && !c.isYou) {
        c.pose.rotation.x = -Math.PI / 2;
        c.pose.position.y = 0.34;
        c.toppled = true;
      }
      if (c.material) c.material.color.setHex(COLOR.dead);
      c.ring.visible = false;
      c.nameEl.classList.add('dead');
      c.badgeEl.className = 'badge hidden';
      continue;
    }
    c.nameEl.classList.remove('dead');
    if (c.material) c.material.color.setHex(COLOR.citizen);

    let ringColor = null;
    if (c.id === view.speaker && view.phase !== 'game_over') ringColor = COLOR.speaker;
    if (showNominee && view.nominee === c.id) ringColor = COLOR.nominee;
    else if (view.deputy === c.id && (view.phase === 'legislative_speaker' ||
      view.phase === 'legislative_deputy' || view.phase === 'block_response')) ringColor = COLOR.deputy;

    const target = c.isYou ? youRing : c.ring;
    if (c.isYou) c.ring.visible = false;
    if (ringColor === null) {
      target.visible = false;
    } else {
      target.visible = true;
      target.material.color.setHex(ringColor);
    }

    c.badgeEl.className = 'badge hidden';
    c.badgeEl.textContent = '';
    if (tally) {
      const aye = tally.aye.indexOf(c.id) !== -1;
      const nay = tally.nay.indexOf(c.id) !== -1;
      if (aye || nay) {
        c.badgeEl.textContent = aye ? 'AYE' : 'NAY';
        c.badgeEl.className = 'badge ' + (aye ? 'aye' : 'nay');
      }
    }
  }
  if (view.phase === 'game_over') youRing.visible = false;
}

/* --------------------------------------------------------------- the match */

let session = null;
let view = null;
let waiting = null;
/* The objective line as panels.js last rendered it: { id, text, act, at }. */
let objective = null;
let seated = false;
let speed = 1;
let timer = null;
/* Continuous auto-answering, off unless __play.autopilot(true) turns it on. */
let autopilotOn = false;
/* The result screen opens itself, so without this it also *re*opens itself the
 * moment it is dismissed: Esc closed it, refresh() put it straight back, and it
 * read as a locked screen. Found by pressing Esc, not by reading the code. */
let gameOverShown = false;

const panels = createPanels(document, {
  onSubmit(value) {
    if (!session || !session.waitingFor()) return;
    session.submit(value);
    refresh();
  },
  onClose() { refresh(); }
});

function refresh() {
  if (!session) return;
  waiting = session.waitingFor();
  view = View.viewFor(session.G, session.humanId, { waitingFor: waiting });
  objective = panels.renderHud(view);
  applyToScene(view);

  /* A panel left open on a decision the match has moved past is a lie. */
  if (panels.isOpen && panels.openKind !== 'game_over') {
    if (!waiting || waiting.kind !== panels.openKind) panels.close();
    else panels.open(view, waiting);
  }
  /* The result screen is the one panel that opens itself, so it opens exactly
   * once per match and closing it means closed. */
  if (view.phase === 'game_over' && !gameOverShown) {
    gameOverShown = true;
    panels.open(view, null);
  }
}

function restart(seed = DEFAULT_SEED, playerCount = DEFAULT_PLAYERS, humanIndex = DEFAULT_HUMAN) {
  stopLoop();
  const count = Math.min(10, Math.max(5, playerCount | 0));
  const human = Math.min(count - 1, Math.max(0, humanIndex | 0));

  const G = SD.createGame({
    names: NAMES.slice(0, count),
    humanIndex: human,
    seed: (seed >>> 0) || DEFAULT_SEED
  });
  session = Human.createSession({ G, minds: AI.create(G), humanId: human });

  gameOverShown = false;
  autopilotOn = false;      // a new match is played by hand until asked otherwise
  seated = false;
  controller.teleport(SPAWN.x, SPAWN.y, SPAWN.z);
  smoothPrimed = false;
  rig.reset();

  /* Roster before panels. Closing a panel calls back into refresh(), which
   * draws the scene — so the cast has to match the new view before anything is
   * allowed to close. Written the other way round, restarting from ten seats to
   * five threw inside the redraw and left the page dead. */
  view = View.viewFor(G, human, { waitingFor: session.waitingFor() });
  setRoster(view);
  panels.resetLog();
  panels.close();
  refresh();
  syncControls(G.seed, count, human);
  startLoop();
  return { seed: G.seed, players: count, humanIndex: human };
}

function startLoop() {
  if (timer !== null) return;
  schedule();
}

function stopLoop() {
  if (timer !== null) { clearTimeout(timer); timer = null; }
}

/*
 * The match loop. It decides WHEN a bot acts and never what the action is —
 * that is Driver.step, shared with the parity script. When the human is owed a
 * decision the loop takes no step at all; it just looks up again shortly, so a
 * restart or a submission is noticed without the match ever advancing itself.
 */
function schedule() {
  const idle = session.over || (!!session.waitingFor() && !autopilotOn);
  timer = setTimeout(() => {
    timer = null;
    if (!session.over) {
      const w = session.waitingFor();
      if (!w) { session.advanceBots(); refresh(); }
      else if (autopilotOn) { session.submit(w.options[0]); refresh(); }
    }
    schedule();
  }, idle ? IDLE_INTERVAL : BASE_INTERVAL / speed);
}

/* ------------------------------------------------------- the three things */

const interactions = createInteractions();

const PODIUM_LABEL = {
  nominate: 'name a Deputy',
  vote: 'cast your ballot',
  speaker_discard: 'draft — you drew three',
  deputy_discard: 'draft — you hold two',
  block_response: 'answer the Block',
  power_target: 'use your power',
  power_ack: 'read the deck'
};

const BELL_LABEL = {
  morning: 'the morning report',
  vote_result: 'the ballots are open',
  chaos: 'chaos takes the deck'
};

/* Context-sensitive: the same lectern is the nominee picker, the ballot, the
 * draft and the power target, because it is where the rules happen. Which panel
 * it opens is read off the pending decision — the object has no idea what any
 * of them are. */
interactions.add({
  id: 'podium',
  position: { x: DAIS.x, y: 0, z: DAIS.z - 0.9 },
  radius: 3.0,
  canInteract: (ctx) => !!ctx.waiting && ctx.waiting.kind !== 'acknowledge' && !ctx.seated,
  getPrompt: (ctx) => `E — ${PODIUM_LABEL[ctx.waiting.kind] || ctx.waiting.kind}`,
  interact: (ctx) => panels.open(ctx.view, ctx.waiting)
});

interactions.add({
  id: 'bell',
  position: { x: BELL.x, y: 0, z: BELL.z },
  radius: 2.6,
  canInteract: (ctx) => !!ctx.waiting && ctx.waiting.kind === 'acknowledge' && !ctx.seated,
  getPrompt: (ctx) => `E — ring the bell: ${BELL_LABEL[ctx.waiting.gate] || 'continue'}`,
  interact: (ctx) => panels.open(ctx.view, ctx.waiting)
});

/* Rules-free on purpose. If the contract only ever carried decisions it would
 * be a decision system wearing an interaction system's name. */
interactions.add({
  id: 'bench',
  position: { x: BENCH.x, y: 0, z: BENCH.z },
  radius: 2.4,
  canInteract: () => true,
  getPrompt: (ctx) => (ctx.seated ? 'E — stand up' : 'E — sit down'),
  interact: () => { seated = !seated; keys.clear(); return seated; }
});

function interactionContext() {
  return { view, waiting, seated };
}

/* ------------------------------------------------------------------ input */

const keys = new Set();
const HELD = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight']
};
const MOVE_CODES = [].concat(HELD.forward, HELD.back, HELD.left, HELD.right);
const input = { x: 0, z: 0 };

function readKeyboard() {
  let f = 0, s = 0;
  if (HELD.forward.some((k) => keys.has(k))) f += 1;
  if (HELD.back.some((k) => keys.has(k))) f -= 1;
  if (HELD.right.some((k) => keys.has(k))) s += 1;
  if (HELD.left.some((k) => keys.has(k))) s -= 1;
  input.x = rig.forward.x * f + rig.right.x * s;
  input.z = rig.forward.z * f + rig.right.z * s;
  const len = Math.hypot(input.x, input.z);
  if (len > 1) { input.x /= len; input.z /= len; }
}

window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

  /*
   * While a panel is open it owns the keyboard. That is not tidiness: A is
   * "Aye" in this game and "strafe left" in this engine, and both are correct.
   * The panel gets first refusal and the body does not move behind it.
   */
  if (panels.isOpen) {
    if (panels.handleKey(e, view, waiting)) e.preventDefault();
    return;
  }

  if (e.code === 'KeyE') {
    interactions.activate(interactionContext());
    e.preventDefault();
    return;
  }
  if (MOVE_CODES.includes(e.code)) {
    if (seated) { seated = false; }        // any step gets you off the bench
    keys.add(e.code);
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* Drag to orbit. No pointer lock: the panels are ordinary DOM and want the
 * pointer, and this step is not the one to decide how the finished game holds
 * the mouse. */
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
  rig.tuning.distance = Math.min(10, Math.max(1.2, rig.tuning.distance + Math.sign(e.deltaY) * 0.25));
}, { passive: false });

/* ------------------------------------------------------------- the loop */

const renderPos = new THREE.Vector3();
const smoothed = new THREE.Vector3();
let smoothPrimed = false;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.1, Math.max(0, raw));

  const frozen = panels.isOpen || seated;
  if (frozen) { input.x = 0; input.z = 0; } else readKeyboard();
  controller.advance(dt, input, world);

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
  /* Sitting is flavour: the body drops and the ring goes out. The controller is
   * untouched, so nothing about the simulation depends on it. */
  youBody.position.y = tuning.height / 2 - (seated ? 0.42 : 0);
  youNose.position.y = tuning.height * 0.72 - (seated ? 0.42 : 0);

  rig.update(dt, smoothed, world);

  if (panels.isOpen) {
    panels.setPrompt('');
  } else {
    interactions.update(controller.state.position, controller.state.facing, interactionContext());
    panels.setPrompt(interactions.prompt);
  }

  renderer.render(scene, rig.camera);
  labelRenderer.render(scene, rig.camera);
}

function resize() {
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  rig.resize(w, h);
  /* Recomputed on every resize because the correction is a fraction of the
   * window: the same 330 px is a third of a small window and a fifth of a big
   * one, and a constant bias would be wrong at both. */
  rig.tuning.screenBias = Math.min(MAX_FRAMING_BIAS,
    (HUD_PX / 2) / Math.max(1, w) * FRAMING_BIAS);
}
window.addEventListener('resize', resize);

/* ----------------------------------------------------------- page controls */

const ui = {
  seed: document.getElementById('c-seed'),
  players: document.getElementById('c-players'),
  human: document.getElementById('c-human'),
  restart: document.getElementById('c-restart'),
  speed: document.getElementById('c-speed')
};

/* A restart driven from the console must leave the boxes saying what is
 * actually being played, or the next click of Restart quietly deals a match
 * nobody asked for. */
function syncControls(seed, count, human) {
  if (!ui.seed) return;
  ui.seed.value = String(seed);
  ui.players.value = String(count);
  fillHumanChoices();
  ui.human.value = String(human);
}

function fillHumanChoices() {
  const n = Number(ui.players.value);
  const was = Number(ui.human.value) || 0;
  ui.human.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i} — ${NAMES[i]}`;
    ui.human.appendChild(o);
  }
  ui.human.value = String(Math.min(was, n - 1));
}
ui.players.addEventListener('change', fillHumanChoices);
ui.restart.addEventListener('click', () => {
  restart(Number(ui.seed.value), Number(ui.players.value), Number(ui.human.value));
});
ui.speed.addEventListener('change', () => { speed = Number(ui.speed.value); });
fillHumanChoices();

resize();
restart(DEFAULT_SEED, DEFAULT_PLAYERS, DEFAULT_HUMAN);
requestAnimationFrame(frame);

/* --------------------------------------------------------- review handle */

/**
 * `window.__play` is the scripted way through a whole match.
 *
 * `state()` is exactly what the UI is allowed to see — the same projection, for
 * the same seat — so anything the reviewer cannot find in it is something no
 * panel could have drawn either. `eventLog` is the other thing: the driver's
 * own stream, which is omniscient (ballots, hands, what a Peek found) and is
 * for the console alone. The screen never reads it; view.log is the public one.
 *
 * The live game object is deliberately not exposed. It would make the trust
 * boundary a suggestion.
 */
window.__play = {
  state: () => (session ? View.viewFor(session.G, session.humanId, { waitingFor: session.waitingFor() }) : null),
  waitingFor: () => (session ? session.waitingFor() : null),

  submit(action) {
    if (!session) return null;
    const ev = session.submit(action);
    refresh();
    return ev;
  },

  /**
   * ONE bot action, now, ignoring the timer.
   *
   * Returns null while the human is owed a decision, and never answers on
   * their behalf — an observer loop of `if (waitingFor()) …; else step();`
   * cannot lose a turn through this call.
   */
  step() {
    if (!session) return null;
    const ev = session.advanceBots();
    refresh();
    return ev;
  },

  /**
   * Answer EXACTLY ONE pending decision, with its first advertised option.
   *
   * One call, one decision. The first version of this ran the whole rest of the
   * match, so a reviewer's `if (waitingFor()) { count++; auto(); }` loop counted
   * one decision in a complete game and it looked as though the human had been
   * skipped. It had not been — all 36 decisions were recorded — but a call named
   * `auto` that silently consumes the thing you are trying to observe is a trap,
   * and the fix is the name matching the scope. For continuous play use
   * `autopilot(true)`; to fast-forward, `runToEnd()`.
   */
  auto() {
    if (!session) return null;
    const w = session.waitingFor();
    if (!w) return null;
    const ev = session.submit(w.options[0]);
    refresh();
    return { answered: w.kind, gate: w.gate, with: w.options[0], event: ev };
  },

  /**
   * Continuous mode: while this is on, the match loop answers the human's
   * decisions too, at the same pace the bots act. Explicitly named, explicitly
   * a mode, and off unless somebody turns it on.
   */
  autopilot(on = true) {
    autopilotOn = !!on;
    return autopilotOn;
  },
  get autopiloting() { return autopilotOn; },

  /**
   * Fast-forward to game over, answering every decision with its first
   * advertised option. Deterministic — index 0 is not a choice — and the
   * quickest way to a result screen. Does not touch the autopilot flag.
   */
  runToEnd(limit = 4000) {
    if (!session) return null;
    let guard = 0;
    let answered = 0;
    while (!session.over && guard++ < limit) {
      const w = session.waitingFor();
      if (!w) { if (!session.advanceBots()) break; continue; }
      session.submit(w.options[0]);
      answered++;
    }
    refresh();
    return {
      steps: session.steps, humanDecisions: answered,
      over: session.over, winner: this.state().winner
    };
  },

  get eventLog() { return session ? session.events : []; },
  get actions() { return session ? session.actions : []; },

  restart,
  pause: stopLoop,
  resume: startLoop,
  setSpeed(mult) { speed = mult; return speed; },

  /* Handy for a scripted walk-up: put the body somewhere and read it back. */
  teleport(x, y, z) {
    controller.teleport(x, y, z);
    smoothPrimed = false;
    return controller.snapshot();
  },
  where: () => controller.snapshot(),

  /*
   * Re-run targeting right now and report it.
   *
   * The render loop already does this every frame, but requestAnimationFrame
   * stops in a background tab, so a scripted review that teleported and then
   * read `target` would get whatever the last visible frame decided — a wrong
   * answer that looks like a targeting bug. This makes the check independent of
   * whether anybody is looking at the window.
   */
  look() {
    interactions.update(controller.state.position, controller.state.facing, interactionContext());
    return {
      target: interactions.current ? interactions.current.id : null,
      prompt: interactions.prompt,
      position: controller.state.position,
      facing: controller.state.facing
    };
  },

  /** Press E, without a keyboard. */
  use() { return interactions.activate(interactionContext()); },

  /** Point the body at a world position, so a scripted probe can face a thing. */
  face(x, z) {
    controller.state.facing = Math.atan2(x - controller.state.position.x,
      z - controller.state.position.z);
    return controller.state.facing;
  },

  get prompt() { return interactions.prompt; },
  get target() { return interactions.current ? interactions.current.id : null; },
  get panelOpen() { return panels.isOpen; },
  get panelKind() { return panels.openKind; },
  get seated() { return seated; },

  /*
   * The persistent objective line, as an object AND as the text actually on
   * screen. Both, deliberately: a review that only reads the object is checking
   * the function, and a review that only reads the DOM cannot say which mapping
   * produced it. If these two ever disagree the render is broken, not the
   * mapping.
   */
  get objective() {
    const node = document.getElementById('objective');
    return {
      id: objective ? objective.id : null,
      text: objective ? objective.text : null,
      act: objective ? objective.act : false,
      at: objective ? objective.at : null,
      onScreen: node ? node.textContent : null
    };
  },

  /* The framing bias in use, so a reviewer can see and change it live. */
  get framing() {
    return { screenBias: rig.tuning.screenBias, hudPx: HUD_PX, of: FRAMING_BIAS };
  },
  setFraming(fraction) {
    rig.tuning.screenBias = Math.max(0, Math.min(0.45, Number(fraction) || 0));
    return rig.tuning.screenBias;
  },

  /* What Tab can reach inside the open panel, in order. */
  get focusOrder() {
    return panels.focusOrder.map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim());
  },
  get focused() {
    const a = document.activeElement;
    return a ? { tag: a.tagName, text: (a.textContent || '').trim().slice(0, 40) } : null;
  },
  marks: { spawn: SPAWN, podium: { x: DAIS.x, z: DAIS.z - 2.6 }, bell: BELL, bench: BENCH }
};

console.info(
  '[play] window.__play ready — state(), waitingFor(), submit(a), step() [bots only], ' +
  'auto() [one decision], autopilot(on), runToEnd(), eventLog, ' +
  'restart(seed, players, humanIndex), teleport(x,y,z), face(x,z), look(), use(). ' +
  'submit(waitingFor().options[0]) is always legal.'
);
