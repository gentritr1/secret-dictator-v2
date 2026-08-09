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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { SD, AI, Human, View, Floor, Orator } from '../engine/index.js';
import { createController, defaultTuning } from '../walk/controller.js';
import { createCameraRig } from '../walk/camera.js';
import { createBvhWorld } from '../walk/bvh-world.js';
import { buildSquare, seatPosition, SPAWN, DAIS, BELL, BENCH } from './square.js';
import { ENVIRONMENT, loadEnvironment, CHR_CITIZENS, loadCast, variantForSeat } from './assets.js';
import { createInteractions } from './interact.js';
import { createPanels } from './panels.js';
import { objectFor } from './objective.js';
import { createPace, beatKey } from './pace.js';
import { createMurmurs } from './murmur.js';
import { createFloorVoice } from './floor-voice.js';
import {
  createLightingDirector, lightingFor, publicEdges, STING_MS, LIGHT_LEAD_MS
} from './lighting.js';
import { createAudio } from './audio.js';

const NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];
const DEFAULT_SEED = 1000;
const DEFAULT_PLAYERS = 7;
const DEFAULT_HUMAN = 0;

/** How often the loop looks up while it is waiting on the human. */
const IDLE_INTERVAL = 200;
/** How often it looks up while a deliberation beat is running. */
const BEAT_POLL = 60;

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
/*
 * AgX, from Gate 3 (docs/step-07.md).
 *
 * asset-lab.html has reviewed material values under AgX since Gate 2 because
 * the pipeline says to; this page rendered with no tone mapping at all, which
 * meant the instrument and the game were two different images of the same
 * timber and a colour judgement made on one did not transfer to the other. The
 * discrepancy was recorded rather than fixed at the time and this is where it
 * gets closed.
 *
 * What it actually changes, measured rather than asserted (docs/step-07.md):
 * at these levels AgX barely moves the midtones and does its whole job in the
 * highlights. With the shipped rigs, turning it off takes the trial frame from
 * 0.13% to 0.48% of pixels at 250+ — the beam pool stops being amber timber and
 * starts being a white hole. Every intensity in src/play/lighting.js is
 * therefore an AgX number, and there is no second table for the other curve.
 */
/*
 * `?tone=linear` turns it off, the way asset-lab.html's `T` key does. It is
 * here so the decision can be re-examined rather than taken on trust: the
 * before/after in docs/step-07.md is two loads of the same URL, and anybody who
 * thinks the rigs would read better untone-mapped can look instead of arguing.
 */
const TONE_MAPPED = new URLSearchParams(location.search).get('tone') !== 'linear';
renderer.toneMapping = TONE_MAPPED ? THREE.AgXToneMapping : THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });

const scene = new THREE.Scene();

/*
 * The lighting director owns the sun, the ambient, the beam over the dais, the
 * background and the fog — there is no light in this file any more. What state
 * it is in is a pure function of the player-safe view; see src/play/lighting.js
 * for why it may not be a function of anything else.
 */
const lighting = createLightingDirector(scene, {
  focus: { x: DAIS.x, y: DAIS.top, z: DAIS.z }
});
lighting.setState('day', { instant: true });

/*
 * Sound. Nothing is constructed until the first user gesture (autoplay), and
 * every cue is driven by the same public edges the light is.
 */
const audio = createAudio();

/* ------------------------------------------------------------ the ground */

/*
 * The square is built exactly once, and what it is built out of depends on
 * whether the production asset arrived. See buildGround() near the bottom of
 * the file: the page waits for that answer before it deals a match, so there is
 * one code path per boot rather than a graybox that turns into wood a moment
 * later while the player is already standing on it.
 *
 * `world` is a let because it is only known after that answer; everything that
 * consumes it is handed it per call (controller.advance, rig.update), which is
 * the same seam src/walk/controller.js was written around.
 */
let world = null;
/** The load report, for the console and for __play.environment. */
let environment = null;

/*
 * Where the podium's panels open, in world space.
 *
 * The graybox value is the lectern's own position — the same number the
 * procedural box uses, so nothing moved when this became a variable. When
 * env-dais-a loads, SOCKET_podium replaces it: the asset says where its own
 * speaking position is, which is the point of shipping a socket. The
 * interactable reads it through a function (see interact.js: `position` may be
 * one), so the swap needs no re-registration and no ordering rule.
 */
let podiumAnchor = { x: DAIS.x, y: 0, z: DAIS.z - 0.9 };

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

const controller = createController({ tuning });
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

/**
 * The loaded citizen variants, keyed by id. Null until boot() answers.
 *
 * This is a CACHE and the seats are stamped out of it: one merged geometry per
 * variant, shared by every seat that uses it. Nothing below may dispose it.
 */
let castLibrary = null;

/* The capsule the graybox has always used, and now also the per-seat fallback
 * for a citizen whose GLB did not arrive. Sized to the calibration figure. */
const CAPSULE_RADIUS = 0.34;

/* How far below the nameplate a murmur bubble hangs, in metres. Below rather
 * than above because the AYE/NAY badge already owns the space above the name,
 * and 0.45 m is enough that a two-line bubble clears an 11 px nameplate at the
 * distance the camera actually stands at. */
const MURMUR_DROP = 0.45;

function clearCast() {
  for (const c of citizens) {
    c.group.traverse((o) => {
      if (o.isCSS2DObject && o.element && o.element.parentNode) {
        o.element.parentNode.removeChild(o.element);
      }
    });
    /*
     * ONLY what this seat owns.
     *
     * The old version disposed every geometry and material it could reach,
     * which was correct when each capsule built its own. It is now a live
     * hazard: the merged citizen geometry belongs to the cast cache and is
     * shared by two or three seats and by every future restart, so freeing it
     * here would empty the square on the second deal — a bug that appears only
     * after a Restart and looks like a loader failure. Each seat records the
     * resources it made; nothing else is touched.
     */
    for (const g of c.owns.geometries) g.dispose();
    for (const m of c.owns.materials) m.dispose();
  }
  cast.clear();
  citizens = [];
}

/**
 * One figure per bot, plus a floor marker on the human's own spot so the ring
 * of seats reads as complete even though you are off walking around in it.
 *
 * The human is still a capsule, deliberately: the controller's collider IS a
 * capsule, and giving the body a silhouette that disagrees with what it collides
 * with is a decision about the player's own avatar that nobody has made yet.
 */
function setRoster(view) {
  clearCast();
  const n = view.players.length;

  for (const p of view.players) {
    const at = seatPosition(p.id, n);
    const group = new THREE.Group();
    group.position.set(at.x, 0, at.z);
    /*
     * +Z of an object faces the lookAt target, and the World contract makes +Z
     * a model's front — so this one line already points the citizens' faces at
     * the middle of the square, exactly as it pointed the capsules' nose cones.
     * The figures needed no correction; that is what "front = +Z, locked by the
     * front-marker test" was for.
     */
    group.lookAt(0, 0, 0);

    const pose = new THREE.Group();
    group.add(pose);

    const owns = { geometries: [], materials: [] };
    const skins = [];            // this seat's own material clones, for death
    let variant = null;
    let labelY = 1.95;
    let toppleLift = CAPSULE_RADIUS;

    if (!p.isYou) {
      variant = castLibrary ? castLibrary.byId[variantForSeat(p.id).id] : null;
      if (variant) {
        /*
         * The figure. Geometry comes from the cache by reference; the material
         * is cloned per seat, because "grey when purged" writes to it and one
         * shared material would grey every citizen of that variant the first
         * time anybody died. Two clones at most per seat, ten seats — cheaper
         * than the bug.
         */
        for (const part of variant.parts) {
          const material = part.material.clone();
          owns.materials.push(material);
          skins.push({ material, authored: material.color.getHex() });
          const mesh = new THREE.Mesh(part.geometry, material);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          pose.add(mesh);
        }
        labelY = variant.labelY;
        toppleLift = variant.topple;
      } else {
        /* No figure for this seat — the variant's GLB is missing or was
         * refused. The capsule is the fallback per seat rather than per match,
         * so one bad file costs two or three faces and not the whole crowd. */
        const material = new THREE.MeshLambertMaterial({ color: COLOR.citizen });
        const geometry = new THREE.CapsuleGeometry(CAPSULE_RADIUS, 0.86, 6, 16);
        owns.materials.push(material);
        owns.geometries.push(geometry);
        skins.push({ material, authored: COLOR.citizen });
        const body = new THREE.Mesh(geometry, material);
        body.position.y = 0.85;
        body.castShadow = true;
        pose.add(body);

        const noseGeometry = new THREE.ConeGeometry(0.11, 0.24, 12);
        const noseMaterial = new THREE.MeshLambertMaterial({ color: 0xe8ecf4 });
        owns.geometries.push(noseGeometry);
        owns.materials.push(noseMaterial);
        const nose = new THREE.Mesh(noseGeometry, noseMaterial);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 1.05, 0.33);
        pose.add(nose);
      }
    } else {
      /* Your seat: a dim disc, so the ring is not missing a tooth. */
      const geometry = new THREE.RingGeometry(0.3, 0.5, 28);
      const material = new THREE.MeshBasicMaterial({
        color: 0x59617a, transparent: true, opacity: 0.5, side: THREE.DoubleSide
      });
      owns.geometries.push(geometry);
      owns.materials.push(material);
      const spot = new THREE.Mesh(geometry, material);
      spot.rotation.x = -Math.PI / 2;
      spot.position.y = 0.015;
      pose.add(spot);
      labelY = 0.35;
    }

    const ring = ringMesh(COLOR.speaker);
    owns.geometries.push(ring.geometry);
    owns.materials.push(ring.material);
    group.add(ring);

    const nameEl = document.createElement('div');
    nameEl.className = 'tag' + (p.isYou ? ' me' : '');
    nameEl.textContent = p.name + (p.isYou ? ' (you)' : '');
    const nameLabel = new CSS2DObject(nameEl);
    /*
     * SOCKET_label, not a constant. The four figures are 1.48 m to 1.96 m tall
     * and their sockets sit at 1.62 / 1.80 / 1.95 / 2.15 — a single hardcoded
     * height floats over the hunched one and sits inside the tall one's hat.
     * The badge keeps its old 0.40 m clearance above whatever the name does.
     */
    nameLabel.position.set(0, labelY, 0);
    group.add(nameLabel);

    const badgeEl = document.createElement('div');
    badgeEl.className = 'badge hidden';
    const badgeLabel = new CSS2DObject(badgeEl);
    badgeLabel.position.set(0, labelY + 0.40, 0);
    group.add(badgeLabel);

    /*
     * The murmur bubble, and only for a citizen who can murmur.
     *
     * Your own seat gets no node at all rather than a hidden one: "the player
     * speaks for themselves" is a structural fact of this layer, not a flag
     * somebody has to remember to check. It hangs BELOW the nameplate so it
     * cannot collide with the AYE/NAY badge above it, and it is anchored off
     * the same SOCKET_label height as the name, so it sits at the right place
     * on the hunched citizen and the tall one alike.
     */
    let murmurEl = null;
    if (!p.isYou) {
      murmurEl = document.createElement('div');
      murmurEl.className = 'murmur hidden';
      /* So a scripted review can say WHICH citizen a bubble is over. It matters
       * because CSS2DRenderer only appends a label while its figure is inside
       * the frustum: a murmur from somebody behind the camera has no node at
       * all, and without the seat on the node that reads as a lost bubble. */
      murmurEl.dataset.seat = String(p.id);
      const murmurLabel = new CSS2DObject(murmurEl);
      murmurLabel.position.set(0, labelY - MURMUR_DROP, 0);
      group.add(murmurLabel);
    }

    cast.add(group);
    citizens.push({
      id: p.id, isYou: p.isYou, group, pose, ring, skins, owns, nameEl, badgeEl,
      nameLabel, badgeLabel, murmurEl,
      toppled: false, toppleLift,
      variant: variant ? variant.id : null, labelY
    });
  }
}

/** Where this seat's nameplate actually sits, read off the scene graph. */
function labelHeightOf(c) {
  let y = null;
  c.group.traverse((o) => {
    if (o.isCSS2DObject && o.element && o.element.classList.contains('tag')) {
      y = Math.round(o.position.y * 1000) / 1000;
    }
  });
  return y;
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
        /* -90 degrees about X maps the body's +Y to +Z: it falls forward, onto
         * its face, toward the middle of the square. The lift is the figure's
         * own depth (assets.js `topple`), because after that rotation its
         * former depth is what holds it off the floor — a shared constant
         * buried the tall citizen and floated the hunched one. */
        c.pose.rotation.x = -Math.PI / 2;
        c.pose.position.y = c.toppleLift;
        c.toppled = true;
        /* The nameplate follows the body down: a label hovering at standing
         * height over a toppled figure reads as a bug, not as a grave. */
        c.nameLabel.position.y = c.toppleLift + 0.35;
        c.badgeLabel.position.y = c.toppleLift + 0.75;
      }
      for (const skin of c.skins) skin.material.color.setHex(COLOR.dead);
      c.ring.visible = false;
      c.nameEl.classList.add('dead');
      c.badgeEl.className = 'badge hidden';
      /* The dead do not speak. The murmur controller already drops anything
       * cued for a seat that has stopped being alive; this is the second half
       * of the same rule, written where the body falls, so a bubble cannot
       * outlive its citizen by even one frame. */
      if (c.murmurEl) { c.murmurEl.className = 'murmur hidden'; c.murmurEl.textContent = ''; }
      continue;
    }
    c.nameEl.classList.remove('dead');
    /* Back to whatever the .blend said, not to a constant — the figures are
     * CarvedWood and the fallback capsules are the graybox grey. */
    for (const skin of c.skins) skin.material.color.setHex(skin.authored);

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

/*
 * The deliberation clock. See src/play/pace.js for the constraint it is built
 * around: nothing it produces reaches the rules, and it draws from its own
 * stream so the engine's seeded one is untouched.
 */
let pace = createPace(DEFAULT_SEED);
/* The end of the current beat, on the same clock the render loop reads. */
let holdUntil = 0;

/*
 * The square's table-talk. See src/play/murmur.js for the constraint it is
 * built around — it is the same one pace.js has, one layer sharper, because
 * the thing it drives (AI.chatter) draws from the engine's stream when it is
 * handed the engine's game object. It is handed a projection instead.
 */
let murmurs = createMurmurs(DEFAULT_SEED, { chatter: AI.chatter });

/*
 * The floor: bots arguing through the canonical claim schema. See
 * src/play/floor-voice.js. It is handed Floor and Orator rather than importing
 * them, so it stays in the same "imports nothing" family as pace.js and
 * murmur.js — and like both of them it draws only from its own stream, which
 * is why turning it on changes no match.
 */
let floorVoice = null;
/* The bots' minds, kept beside the session so the orator can read them. The
 * session already holds this exact array; hoisting it here reads it, it does
 * not copy it, and nothing writes to it (proved by a Proxy sweep in
 * test/orator.test.js). */
let minds = null;
/*
 * The end of the argument currently being spoken, on the same clock everything
 * else uses. It holds the BOT LOOP only — a floor never blocks a decision the
 * player owns, because being unable to act while other people talk is the worst
 * version of a discussion layer.
 */
let floorUntil = 0;

function floorRemaining() {
  return Math.max(0, floorUntil - performance.now());
}

function holdRemaining() {
  return Math.max(0, holdUntil - performance.now());
}
function holding() {
  return holdRemaining() > 0;
}
/** What the page is doing that the view cannot know. A clock, not game state. */
function presentation() {
  return { holding: holding() };
}

/**
 * Hold the beat after one of YOUR submissions, but only when the rules
 * immediately owe you another decision.
 *
 * Those are the two transitions the owner felt as instant, and they are instant
 * for a structural reason: naming a Deputy and casting a ballot are both a
 * single `Driver.step` triggered by the human's own submission, so the ballot
 * box and the tally were open in the same frame as the click. Every other
 * transition hands over to a bot, and the bot's own delay covers it.
 *
 * The beat is presentation only — the engine has already moved. What it holds
 * back is the *interaction*: the podium and the bell go dark for its duration
 * and the objective line says what the square is busy doing, so there is never
 * a moment where the line points at an object that will not answer.
 */
function beat(nextWaiting) {
  if (!nextWaiting) return;
  holdUntil = performance.now() + pace.beatFor(nextWaiting, speed);
}

/*
 * The ambience's own bookkeeping. All of it is presentation: a clock, the
 * previous projection, and the key of the decision this seat last answered.
 * None of it is game state and none of it can reach any.
 */
/** The view refresh() last saw, so publicEdges() has something to compare to. */
let previousView = null;
/** A tile sting, running until this timestamp. */
let stingUntil = 0;
let stingTile = null;
/** The key of the decision YOU just submitted — your own keystroke. */
let ownSubmission = null;
/** The phase the lighting was last aimed at, so a change can be detected. */
let litPhase = null;
/*
 * Light changes first, people move second (STYLE_BIBLE staging rule 2). On a
 * phase change the re-light goes out immediately and the cast update is held
 * here for LIGHT_LEAD_MS, so the square visibly changes colour before anybody's
 * ring or badge does.
 */
let stagedView = null;
let stagedAt = 0;

function flushCast() {
  if (!stagedView) return false;
  const v = stagedView;
  stagedView = null;
  applyToScene(v);
  return true;
}

/** Run the staged cast update if its lead has elapsed. Called from both loops. */
function pumpCast() {
  if (stagedView && performance.now() >= stagedAt) flushCast();
}

/*
 * Two things that end on a clock and fire no game event when they do — the same
 * shape as the deliberation beat in tick(), and they need the same two callers.
 * requestAnimationFrame does not run in a hidden pane, so a scripted review
 * would otherwise find the square still flashing red minutes later; the
 * setTimeout loop keeps running either way.
 */
let wasHeld = false;

function pumpAmbience() {
  if (!view) return;
  const held = holding();

  /* The beat has just ended: everything the square was told during it happens
   * now, at once. See ambience() for why it waited. */
  if (wasHeld && !held) {
    wasHeld = false;
    const edges = heldEdges || NO_EDGES;
    heldEdges = null;
    applyAmbience(view, edges, null);
    return;
  }
  wasHeld = held;
  if (held) return;

  if (!stingTile || performance.now() < stingUntil) return;
  stingTile = null;
  const state = lightingFor(view, null);
  lighting.setState(state);
  audio.setLighting(state);
}

/*
 * The third thing that ends on a clock, and it gets the same two callers as the
 * other two for the same reason (see pumpAmbience). A bubble appears and expires
 * on wall time and no game event fires when it does.
 */
function pumpMurmurs() {
  if (!view) return;
  if (murmurs.pump(performance.now(), view)) paintMurmurs();
}

/** Put what is being said over the heads of whoever is saying it. */
function paintMurmurs() {
  const live = new Map();
  for (const m of murmurs.visible) live.set(m.playerId, m.text);
  for (const c of citizens) {
    if (!c.murmurEl) continue;
    const text = live.get(c.id) || null;
    if (text) {
      if (c.murmurEl.textContent !== text) c.murmurEl.textContent = text;
      c.murmurEl.className = 'murmur';
    } else if (c.murmurEl.className !== 'murmur hidden') {
      c.murmurEl.className = 'murmur hidden';
      c.murmurEl.textContent = '';
    }
  }
}

const panels = createPanels(document, {
  onSubmit(value) {
    if (!session || !session.waitingFor()) return;
    /* Captured BEFORE the submit, because after it the decision is gone. This
     * is the one thing the ambience knows that the view does not carry, and it
     * is the player's own keystroke — the bell they just rang, the ballot they
     * just sealed. */
    ownSubmission = beatKey(session.waitingFor());
    session.submit(value);
    beat(session.waitingFor());
    refresh();
    ownSubmission = null;
    /*
     * Re-time the loop from NOW.
     *
     * Without this the bots' deliberation does not happen after one of your
     * submissions, and the reason is a timer already in flight. While the rules
     * are waiting on you the loop polls every IDLE_INTERVAL (200 ms) to notice
     * that you have answered; the tick that notices then takes the bot's action
     * immediately and only *afterwards* computes a proper `pace.delayFor`
     * delay. So ringing the morning bell produced a nomination within 200 ms
     * instead of the declared 1500-3000 ms.
     *
     * Found by the Gate 3 capture pass, off the audio timestamps: the bell cue
     * and the gavel cue were 157 ms apart. It is why the dusk state was
     * unreachable — the square went from morning to a ballot without ever
     * gathering. Nothing about the pace BANDS changes here; this only makes the
     * ones docs/step-05.md already declared actually elapse. Timing still
     * cannot change a match: test/pace.test.js hammers the clock at every seam
     * and requires a byte-identical log.
     */
    stopLoop();
    startLoop();
  },
  onClose() { refresh(); }
});

const NO_EDGES = { gavel: false, tally: false, sting: null };
/** Public edges that arrived during a beat and are owed when it ends. */
let heldEdges = null;

/**
 * Point the light and the sound at what the square is now doing.
 *
 * Both take the same two inputs and nothing else: the player-safe view, and
 * `publicEdges(previous, current)` — which notices only things the square was
 * told out loud (a nomination made, ballots opened, a tile enacted). The
 * driver's omniscient event stream is not reachable from here, and that is the
 * whole design: an ambience that could hear it would be a tell.
 */
function applyAmbience(next, edges, own) {
  if (edges.sting) {
    stingTile = edges.sting;
    stingUntil = performance.now() + STING_MS;
  } else if (performance.now() >= stingUntil) {
    stingTile = null;
  }

  const sting = performance.now() < stingUntil ? stingTile : null;
  const state = lightingFor(next, { sting });
  lighting.setState(state);
  audio.setLighting(state);
  audio.fire(edges, own);
  return state;
}

/**
 * The beat holds the ambience too, and this is the sharpest reason the
 * deliberation beat exists at all.
 *
 * Casting a ballot resolves the whole election in the same `Driver.step` — the
 * engine has already counted the votes before the panel has finished closing
 * (docs/step-05.md §7b). So without this, pressing `A` produced the seal, the
 * tally sting and the "the motion carries" light in the same frame, and the
 * player knew the result before walking to the podium to open the ballots. That
 * is not a leak — `view.lastVote` really is public the moment it is written —
 * but it spends the beat that Gate 1.5 built and spoils the panel the player is
 * on their way to open.
 *
 * So during a beat: YOUR OWN cue fires immediately (it is your keystroke, and a
 * silent keypress feels broken), and everything the square is about to announce
 * waits for the square to announce it. Same flag, same clock, and the same
 * property the objective line has — nothing tells the player anything before
 * the object they are walking to would.
 */
function ambience(next) {
  const edges = publicEdges(previousView, next);
  previousView = next;

  if (holding()) {
    heldEdges = {
      gavel: (heldEdges && heldEdges.gavel) || edges.gavel,
      tally: (heldEdges && heldEdges.tally) || edges.tally,
      sting: edges.sting || (heldEdges && heldEdges.sting) || null
    };
    wasHeld = true;
    audio.fire(NO_EDGES, ownSubmission);
    return lighting.target;
  }
  return applyAmbience(next, edges, ownSubmission);
}

function refresh() {
  if (!session) return;
  waiting = session.waitingFor();
  view = View.viewFor(session.G, session.humanId, { waitingFor: waiting });
  objective = panels.renderHud(view, presentation());

  /*
   * The light before the crowd, deliberately in this order and with this delay.
   *
   * On a phase change the re-light goes out first and the cast update waits
   * LIGHT_LEAD_MS. During a beat it waits for the beat as well, and for the
   * same reason the tally sting does: `applyToScene` paints every seat's AYE or
   * NAY badge the instant the phase turns, which would announce the result over
   * the heads of the crowd while the player is still walking to the podium to
   * open the ballots.
   */
  const phaseChanged = litPhase !== null && litPhase !== view.phase;
  litPhase = view.phase;
  /* Captured before ambience(), which is where previousView is advanced — the
   * murmurs read the same two views publicEdges does, and must see the same
   * pair. */
  const spoken = previousView;
  ambience(view);
  /*
   * The talk, cued from the same public transition the light and the sound are
   * cued from, and held back by the same clock. `notBefore` is the end of any
   * deliberation beat in progress: a murmur about a tally the player has not
   * walked to the podium to open yet would announce the result over the crowd's
   * heads, which is exactly what heldEdges exists to stop the audio doing.
   */
  murmurs.observe(spoken, view, {
    now: performance.now(),
    notBefore: Math.max(performance.now(), holdUntil),
    speed
  });
  /*
   * And the floor, on the same cue and the same clock.
   *
   * `floorVoice.observe` folds the public record, files each new driver event
   * into the seat's own private hand memory, and — if a trigger fires and the
   * square is minded to convene — selects the WHOLE argument synchronously and
   * hands back its bubbles already timed. Selecting it all at once is what
   * keeps the utterance record independent of the frame rate: a floor chosen
   * beat by beat off a wall clock would record something different in a
   * background tab than it does on screen.
   *
   * `session.events` is the driver's OMNISCIENT stream, and this is the one
   * place in the play layer it is passed anywhere. What floor-voice does with
   * it is file `hand` and `passedOn` under the seat that actually held them —
   * a citizen's memory of their own hand, which is the thing that makes a lie
   * a lie. `Orator.createMemory()` is the split, and test/orator.test.js asks
   * it for every seat's memory of every government and requires that the seat
   * sat in it.
   */
  if (floorVoice) {
    const said = floorVoice.observe(session.G, session.events, {
      now: performance.now(),
      notBefore: Math.max(performance.now(), holdUntil),
      speed,
      waiting
    });
    if (said.lines.length) {
      murmurs.say(said.lines);
      floorUntil = Math.max(floorUntil, said.until);
    }
  }
  if (phaseChanged || holding()) {
    stagedView = view;
    stagedAt = Math.max(performance.now(), holdUntil) + LIGHT_LEAD_MS;
  } else {
    stagedView = null;
    applyToScene(view);
  }

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
  const dealSeed = (seed >>> 0) || DEFAULT_SEED;

  const G = SD.createGame({
    names: NAMES.slice(0, count),
    humanIndex: human,
    seed: dealSeed
  });
  minds = AI.create(G);
  session = Human.createSession({ G, minds, humanId: human });

  /* A fresh clock per match, seeded from the same integer the deal is — so a
   * replayed seed has the same rhythm as the original. It is salted away from
   * the engine's stream inside pace.js and shares nothing with it. */
  pace = createPace(dealSeed);
  holdUntil = 0;
  /* A fresh mouth for a fresh match, seeded from the same integer, so a
   * replayed seed hears the same square. Rebuilt rather than reset because
   * setRoster is about to throw away every bubble element it was pointing at. */
  murmurs = createMurmurs(dealSeed, { chatter: AI.chatter });
  /* A fresh record for a fresh match, seeded from the same integer, so a
   * replayed seed hears the same argument as well as the same chatter. */
  floorVoice = createFloorVoice({
    Floor, Orator,
    seed: dealSeed,
    humanSeat: human,
    names: NAMES.slice(0, count),
    minds
  });
  floorUntil = 0;

  gameOverShown = false;
  autopilotOn = false;      // a new match is played by hand until asked otherwise
  seated = false;

  /*
   * A fresh match starts in daylight, snapped rather than faded. Crossfading
   * two and a half seconds from the last match's game-over red into the new
   * match's morning is a bug that looks like a mood, and the new deal's first
   * view must not be compared against the old match's last one — publicEdges
   * would read a Seize count dropping to zero as an enactment.
   */
  previousView = null;
  stingTile = null;
  stingUntil = 0;
  ownSubmission = null;
  litPhase = null;
  stagedView = null;
  heldEdges = null;
  wasHeld = false;
  lighting.setState('day', { instant: true });
  audio.setLighting('day');

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
 *
 * Gate 1.5: the interval is no longer one flat number. `pace.delayFor(phase)`
 * gives the bots time proportional to how hard the decision they are making is,
 * read off `view.phase` — which is public, comes from the projection, and is
 * the only thing this loop needs to know about what the square is doing. The
 * pace control still divides it, so 4x is roughly the flat 900 ms Gate 1
 * shipped.
 *
 * Nothing about WHICH action is taken is reachable from here, at any speed.
 * That is the property test/pace.test.js proves by interleaving pace draws
 * between every engine call and requiring an identical event log.
 */
function schedule() {
  timer = setTimeout(() => {
    timer = null;
    tick();
    schedule();
  }, nextDelay());
}

function nextDelay() {
  /* A beat in progress owns the clock: no step is taken and no decision is
   * answerable until it ends. Polled rather than scheduled exactly, so a speed
   * change or a restart lands within a frame or two. */
  if (holding()) return Math.min(holdRemaining(), BEAT_POLL);
  if (session.over) return IDLE_INTERVAL;
  const w = session.waitingFor();
  if (w && !autopilotOn) return IDLE_INTERVAL;
  /* An argument in progress owns the clock the same way a deliberation beat
   * does — but only the bots' half of it. See tick(). */
  const floorLeft = floorRemaining();
  if (!w && floorLeft > 0) return Math.min(floorLeft, BEAT_POLL);
  return pace.delayFor(view ? view.phase : 'nomination', speed);
}

let wasHolding = false;

function tick() {
  /*
   * A beat ends on a clock, and no game event fires when it does. The render
   * loop re-derives the line every frame, which is what a player sees — but
   * requestAnimationFrame stops in a background tab, and it is also not running
   * in a scripted review pane, so the line stayed on "the square is counting
   * them" after the podium had already lit up. Same family as the bug `look()`
   * exists for: anything that only happens on a frame cannot be observed by
   * anything that is not watching the window. This loop is a setTimeout, so it
   * keeps running either way.
   */
  const held = holding();
  if (wasHolding && !held && view) objective = panels.renderObjective(view, presentation());
  wasHolding = held;

  /* All three of these end on a clock too, and for the same reason they are
   * pumped here as well as from the render loop. */
  pumpCast();
  pumpAmbience();
  pumpMurmurs();

  if (session.over || held) return;
  const w = session.waitingFor();
  /*
   * The square does not move on while it is still arguing — but a floor NEVER
   * blocks a decision the player owns. The deliberation beat freezes the podium
   * and the objective line on purpose, because it is the pause before your own
   * next move; a discussion the bots are having is not, and being unable to act
   * while other people talk is the worst possible version of a discussion
   * layer. So this gate is on the bot branch only, and `readyAt` is untouched.
   */
  if (!w && floorRemaining() > 0) return;
  if (!w) { session.advanceBots(); refresh(); }
  else if (autopilotOn) { session.submit(w.options[0]); beat(session.waitingFor()); refresh(); }
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
  power_ack: 'read the deck',
  /* Gate 1.5: the tally opens where the motion was made. */
  'acknowledge:vote_result': 'open the ballots'
};

const BELL_LABEL = {
  morning: 'the morning report',
  chaos: 'chaos takes the deck'
};

/**
 * Which object owes this decision — asked of `objective.js`, which owns the
 * rule, so the interactable and the line on screen physically cannot disagree.
 * Gate 1 kept two copies of it and this is the seam where they would have
 * drifted the first time one moved. One did move, in Gate 1.5.
 */
const opensAt = (ctx) =>
  (ctx.waiting ? objectFor(ctx.waiting.kind, ctx.waiting.gate) : null);

/**
 * Live only when the square is genuinely ready to answer.
 *
 * `!ctx.holding` is the deliberation beat: for its duration the rules already
 * hold the next decision, but the square has not finished producing it, so
 * pressing E would open a panel for something that has not visibly happened
 * yet. It also guarantees the property Gate 1.5 was asked for — the objective
 * line never points at an object that will not answer, because the same flag
 * turns both of them off.
 */
const readyAt = (where) => (ctx) =>
  !!ctx.waiting && !ctx.seated && !ctx.holding && opensAt(ctx) === where;

/* Context-sensitive: the same lectern is the nominee picker, the ballot, the
 * tally, the draft and the power target, because it is where the rules happen.
 * Which panel it opens is read off the pending decision — the object has no
 * idea what any of them are. */
interactions.add({
  id: 'podium',
  /* A function, not a point: the anchor is the graybox lectern until
   * env-dais-a's SOCKET_podium arrives, and reading it late means the two are
   * never out of step. What it must NOT touch is `opensAt` below — where a
   * panel opens is still objectFor(kind, gate), so moving the anchor moves the
   * object and never the routing, and the line on screen cannot start naming
   * something the podium does not do. */
  position: () => podiumAnchor,
  radius: 3.0,
  canInteract: readyAt('podium'),
  getPrompt: (ctx) => {
    const key = ctx.waiting.gate
      ? ctx.waiting.kind + ':' + ctx.waiting.gate : ctx.waiting.kind;
    return `E — ${PODIUM_LABEL[key] || PODIUM_LABEL[ctx.waiting.kind] || ctx.waiting.kind}`;
  },
  interact: (ctx) => panels.open(ctx.view, ctx.waiting)
});

interactions.add({
  id: 'bell',
  position: { x: BELL.x, y: 0, z: BELL.z },
  radius: 2.6,
  canInteract: readyAt('bell'),
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
  return { view, waiting, seated, holding: holding() };
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

/*
 * The autoplay gate, in one place.
 *
 * No AudioContext exists until the player does something, which is the policy
 * every browser enforces and the reason a page that constructs one at load
 * prints a console warning. `start()` is idempotent and cheap after the first
 * call, so hanging it off every gesture is simpler and more reliable than
 * picking one gesture and hoping it happens.
 */
function firstGesture() {
  audio.start();
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

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

  /* The crossfade, and the two things that end on a clock rather than on an
   * event. The light is advanced before anything is drawn. */
  lighting.update(dt);
  pumpCast();
  pumpAmbience();
  pumpMurmurs();

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

  /* The deliberation beat ends on a clock, not on a game event, so nothing
   * calls refresh() when it does. Re-deriving the line here is what makes it
   * flip back from "the square is counting them" to "open them at the podium"
   * at the same instant the podium lights up. It rewrites the DOM only when the
   * sentence actually changes. */
  if (view) objective = panels.renderObjective(view, presentation());

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
  speed: document.getElementById('c-speed'),
  volume: document.getElementById('c-volume'),
  mute: document.getElementById('c-mute')
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

/*
 * Volume and mute.
 *
 * Mute is a button rather than a checkbox because it is the control somebody
 * reaches for in a hurry, and it says what it will do rather than what it is —
 * "mute" / "unmute" — so it needs no legend. Both are inside #controls, which
 * panels.js marks `inert` while a dialog is open; that is correct, since a
 * decision is on screen and the sound has already happened.
 */
if (ui.volume) {
  ui.volume.value = String(Math.round(audio.volume * 100));
  ui.volume.addEventListener('input', () => {
    audio.setVolume(Number(ui.volume.value) / 100);
    if (audio.muted) syncMute(audio.setMuted(false));
  });
}
function syncMute(on) {
  if (!ui.mute) return on;
  ui.mute.textContent = on ? 'Unmute' : 'Mute';
  ui.mute.setAttribute('aria-pressed', on ? 'true' : 'false');
  return on;
}
if (ui.mute) {
  syncMute(false);
  ui.mute.addEventListener('click', () => syncMute(audio.setMuted(!audio.muted)));
}

fillHumanChoices();

/* ---------------------------------------------------------------- boot */

/**
 * Build the ground and the collision world, with or without the asset.
 *
 * The merge is where the two halves become one thing the player can hit: the
 * procedural pieces the graybox still owns, plus every COL_* volume the GLB
 * shipped, baked into world space by the loader. One BVH, one answer to "what
 * am I standing on", exactly as before — the difference is only what went into
 * it.
 */
function buildGround(env) {
  const built = buildSquare(env.replaces.length ? { omit: env.replaces } : undefined);
  scene.add(built.group);

  const parts = [built.colliderGeometry];
  for (const visual of env.visuals) scene.add(visual);
  /* A row that asked for `capsule` and did not load leaves an obvious grey
   * volume rather than a hole. Visual only — see assets.js: a placeholder that
   * blocked the player would turn a missing asset into a movement bug. */
  for (const stand of env.placeholders) scene.add(stand);
  for (const part of env.colliderParts) parts.push(part);
  if (env.sockets.podium) {
    podiumAnchor = { x: env.sockets.podium.x, y: env.sockets.podium.y, z: env.sockets.podium.z };
  }

  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  world = createBvhWorld(merged);
  controller.setWorld(world);
}

/*
 * Nothing is dealt until the asset question is answered, because the two
 * answers build different collision worlds and the player spawns into one of
 * them. `loadEnvironmentAsset` never rejects — a missing file, unreadable bytes
 * or a renamed COL_ node all come back as `{ ok: false }` with one warning —
 * so there is no failure mode here that leaves the page without a square.
 */
async function boot() {
  /*
   * The square and the crowd are asked for together and waited for together,
   * for the same reason Gate 2 waited for the dais: `setRoster` runs once per
   * deal, and a cast that arrived after the deal would mean a ring of capsules
   * that turned into people a moment later, or a second setRoster with a live
   * match already running. One code path per boot.
   *
   * `loadCast` never rejects. A variant that will not load costs the seats that
   * would have used it and nothing else.
   */
  const [env, castResult] = await Promise.all([
    loadEnvironment(ENVIRONMENT),
    loadCast(CHR_CITIZENS)
  ]);
  environment = env;
  castLibrary = castResult;
  buildGround(env);
  restart(DEFAULT_SEED, DEFAULT_PLAYERS, DEFAULT_HUMAN);
  requestAnimationFrame(frame);
  if (castResult.loaded.length) {
    const shown = castResult.variants.filter((v) => v.ok);
    console.info(
      `[cast] ${shown.length} of ${castResult.rows.length} citizen variants loaded — ` +
      shown.map((v) => `${v.id} (${v.stats.triangles} tris, ${v.stats.parts} part` +
        `${v.stats.parts === 1 ? '' : 's'}, label ${v.labelY.toFixed(2)} m)`).join(', ') +
      `; seats take them in order, seat n -> variant n mod ${castResult.rows.length}.`
    );
  }
  for (const asset of env.loaded) {
    console.info(
      `[assets] ${asset.id} loaded — ${asset.stats.visMeshes} visual meshes, ` +
      `${asset.stats.colMeshes} colliders, ${asset.stats.triangles} tris, ` +
      `materials ${asset.stats.materials.join('/')}; placed at ` +
      `(${asset.place.x}, ${asset.place.y}, ${asset.place.z}) yaw ${asset.place.yaw.toFixed(3)}` +
      (asset.sockets.podium
        ? `; podium socket at (${podiumAnchor.x.toFixed(3)}, ${podiumAnchor.y.toFixed(3)}, ${podiumAnchor.z.toFixed(3)})` : '') +
      '.'
    );
  }
}

resize();
boot();

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
   * Walk, on a fixed clock, in world space — the walk.html idiom.
   *
   * `run(mark, seconds)` exists on __walk for the same reason: a measurement
   * that depends on how long the reviewer took to type the next line is not a
   * measurement. The input is a world vector rather than a key, so it does not
   * cross the camera basis; the point of this call is the collision world, and
   * the step-onto-dais proof is `walk(0, 1, 2)` from south of the dais with
   * `y` coming back at the dais top.
   */
  walk(x, z, seconds = 2, dt = 1 / 60) {
    const frames = Math.max(0, Math.round(seconds / dt));
    let peakY = controller.state.position.y;
    for (let i = 0; i < frames; i++) {
      controller.advance(dt, { x, z }, world);
      if (controller.state.position.y > peakY) peakY = controller.state.position.y;
    }
    smoothPrimed = false;
    const snap = controller.snapshot();
    return { frames, peakY, position: snap.position, grounded: snap.grounded, speed: snap.speed };
  },

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

  /*
   * The deliberation clock.
   *
   * `submit()` above deliberately does NOT run a beat: it is the scripted seam,
   * and a scripted sweep that had to sit through 1.7 s of atmosphere per
   * decision would be measuring the clock instead of the game. The keyboard and
   * the panel buttons do run one, so `beat()` is here to drive that path on
   * purpose — press it after a submit and the podium goes dark and the
   * objective line changes for exactly as long as a player would have waited.
   */
  get holding() { return holding(); },
  get holdRemaining() { return Math.round(holdRemaining()); },
  beat() { beat(session ? session.waitingFor() : null); return this.holdRemaining; },
  clearBeat() { holdUntil = 0; return true; },
  get pace() {
    return {
      draws: pace.draws,
      speed,
      bands: pace.bands,
      /* The band for the phase on screen, scaled by the pace control. Reported
       * rather than drawn: a readback that consumed the stream would change the
       * rhythm just by being looked at. */
      band: view && pace.bands[view.phase]
        ? pace.bands[view.phase].map((ms) => Math.round(ms / speed)) : null
    };
  },
  setFraming(fraction) {
    rig.tuning.screenBias = Math.max(0, Math.min(0.45, Number(fraction) || 0));
    return rig.tuning.screenBias;
  },

  /*
   * The square's talk, read back two ways for the same reason the objective
   * line is: the controller's own list says what SHOULD be up, and the DOM says
   * what is. A review that reads only the first is checking the module, not the
   * page. `onScreen` is scraped from the label layer, so a bubble that is
   * display:none does not count as being said.
   */
  get murmurs() {
    /*
     * `display: none` matters as much as the `hidden` class here: CSS2DRenderer
     * appends a label to #labels only while its object is inside the frustum
     * and hides it with an inline display when it leaves, so a bubble on a
     * citizen behind the camera is in the DOM and is not on screen. A readback
     * that ignored that would report talk the player cannot see.
     */
    const nodes = Array.from(document.querySelectorAll('#labels .murmur'))
      .filter((n) => !n.classList.contains('hidden') && n.style.display !== 'none' &&
        n.textContent.trim());
    return {
      visible: murmurs.visible.map((m) => ({
        id: m.id, seat: m.playerId, beat: m.beat, text: m.text
      })),
      onScreen: nodes.map((n) => n.textContent.trim()),
      pending: murmurs.pending,
      draws: murmurs.draws,
      calls: murmurs.calls,
      produced: murmurs.produced,
      beatsSeen: murmurs.beatsSeen
    };
  },

  /* What Tab can reach inside the open panel, in order. */
  get focusOrder() {
    return panels.focusOrder.map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim());
  },
  get focused() {
    const a = document.activeElement;
    return a ? { tag: a.tagName, text: (a.textContent || '').trim().slice(0, 40) } : null;
  },
  /*
   * What the runtime asset loader did, in one object.
   *
   * `ok` false is a complete answer, not an error: it names the reason and the
   * page is running the graybox fallback. The visual group and the geometries
   * are deliberately not exposed — this is a report, and a reviewer who can
   * reach into the scene graph from the console will eventually verify
   * something they changed on the way in.
   */
  get environment() {
    if (!environment) return { ok: false, reason: 'not-loaded-yet' };
    const first = environment.assets[0] || {};
    return {
      /* Gate 2's shape, kept: every browser probe in docs/step-06.md reads
       * `ok`, `reason` and `podiumAnchor` off this object, and a table of
       * assets is not a reason to invalidate a recorded review. `ok` is now
       * "every row arrived"; `reason` is the first row that did not. */
      ok: environment.ok,
      reason: environment.fallbacks.length ? environment.fallbacks[0].reason : null,
      detail: environment.fallbacks.length ? environment.fallbacks[0].detail : null,
      id: first.id || null,
      url: first.url || null,
      place: first.place || null,
      replaces: environment.replaces,
      sockets: environment.sockets,
      nodes: first.nodes || [],
      stats: first.stats || null,
      podiumAnchor: { x: podiumAnchor.x, y: podiumAnchor.y, z: podiumAnchor.z },
      /* The table, which is the part that matters from Gate 3 on. */
      rows: environment.rows,
      loaded: environment.loaded.map((a) => a.id),
      fallbacks: environment.fallbacks
    };
  },

  /*
   * The lighting director, and the style law measured rather than asserted.
   *
   * `lighting()` is a cheap readback of the live rig — the numbers on screen,
   * not the numbers in the table, because a crossfade means those are different
   * things for a couple of seconds. `lighting({ measure: true })` additionally
   * renders the scene into a small offscreen target and counts warm pixels, so
   * "a night frame is under 10% warm" is an observation about the frame and not
   * a claim about the light rig. It is not on the render path: a style gate
   * that cost frame time would be switched off.
   */
  lighting(opts) {
    const snap = lighting.snapshot();
    snap.mapped = view ? lightingFor(view, { sting: stingTile && performance.now() < stingUntil ? stingTile : null }) : null;
    snap.sting = performance.now() < stingUntil ? stingTile : null;
    snap.lead = LIGHT_LEAD_MS;
    snap.castStaged = !!stagedView;
    snap.toneMapping = renderer.toneMapping === THREE.AgXToneMapping ? 'AgX' : 'linear';
    snap.warm = (opts && opts.measure)
      ? lighting.measure(renderer, rig.camera, opts)
      : lighting.lastMeasurement;
    return snap;
  },

  /**
   * Force a lighting state, for a capture pass. The `__lab.mood()` idiom.
   *
   * It does not override the mapping — it aims the rig, and the next refresh()
   * aims it back at whatever the view says. That is on purpose: a debug setter
   * that could hold a state against the view would be a way to photograph a
   * lighting story the game never actually shows.
   */
  setLighting(id, instant = true) {
    lighting.setState(id, { instant: !!instant });
    audio.setLighting(id);
    return lighting.target;
  },

  /*
   * The crowd, as a report.
   *
   * A screenshot shows that somebody is standing in a seat; it cannot show
   * WHICH figure, whether the nameplate is on that figure's own socket or on a
   * constant, or whether a seat fell back to a capsule because its GLB was
   * refused. `cast` answers all three per seat, which is what makes "the
   * mapping is deterministic" checkable from a scripted review rather than
   * from the source.
   */
  get cast() {
    return {
      ok: castLibrary ? castLibrary.ok : false,
      rows: castLibrary ? castLibrary.rows : [],
      loaded: castLibrary ? castLibrary.loaded : [],
      fallbacks: castLibrary ? castLibrary.fallbacks : [],
      variants: castLibrary ? castLibrary.variants.map((v) => (v.ok ? {
        id: v.id, ok: true, triangles: v.stats.triangles, parts: v.stats.parts,
        materials: v.stats.materials, labelY: v.labelY, height: v.height, topple: v.topple
      } : { id: v.id, ok: false, reason: v.reason, detail: v.detail })) : [],
      seats: citizens.map((c) => ({
        id: c.id,
        isYou: c.isYou,
        variant: c.variant,                    // null means this seat is a capsule
        labelY: Math.round(c.labelY * 1000) / 1000,
        toppled: c.toppled,
        toppleLift: Math.round(c.toppleLift * 1000) / 1000,
        /* Read back off the object, not off the record: if the label ever stops
         * being placed where the record says, this is where it shows. */
        labelOnScreen: labelHeightOf(c)
      }))
    };
  },

  /** What the mapping says, for any seat, without a match running. */
  variantForSeat: (seat) => variantForSeat(seat).id,

  /*
   * `renderer.info` for the last painted frame — the pipeline's performance
   * envelope, readable from a review instead of off a screenshot.
   *
   * The caveat from docs/step-06.md still applies and is the reason this says
   * "last painted": the counters only update on a render, and
   * requestAnimationFrame does not run in a hidden pane. A probe that reads
   * this from a background tab is reading whatever was on screen when it was
   * last visible, not the frame it thinks it is measuring.
   */
  get stats() {
    const info = renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : 0
    };
  },

  /*
   * The floor, as a report.
   *
   * The utterance record, the flags with their rules, refs and who has
   * addressed them, the open obligations, and the last dozen things said —
   * rendered in the THIRD person, from the same `text_id` entries the bubbles
   * render in the first, which is the whole reason the record carries an id
   * and not a sentence.
   *
   * Nothing here is on screen beyond the bubbles: the tray, the private card
   * and the ledger are work items 3 and 5. This is the scripted-review surface,
   * and it is deliberately a projection of the record rather than the record —
   * __play has never handed out a live object it did not want written to.
   */
  floor() { return floorVoice ? floorVoice.report() : null; },
  /** Every ledger entry, the pure fold. See src/engine/floor.js. */
  floorLedger() { return floorVoice ? floorVoice.ledger() : null; },
  /** The allowlist instrument, over the live record. Must come back empty. */
  floorAudit() { return floorVoice ? floorVoice.audit() : null; },
  get floorHolding() { return floorRemaining() > 0; },
  get floorRemaining() { return Math.round(floorRemaining()); },

  /** What the ambience would do for the current view, without doing it. */
  edges: () => publicEdges(previousView, view),

  /* Sound, as a report. A scripted review cannot hear a gavel; it can read
   * that one was fired, and when. */
  audio: {
    report: () => audio.report(),
    get log() { return audio.log; },
    cue: (id) => audio.cue(id),
    mute: (on) => syncMute(audio.setMuted(on !== false)),
    volume: (v) => audio.setVolume(v),
    /* The gesture gate, for a headless driver that has no real gesture. */
    start: () => audio.start()
  },

  /** Run the staged cast update now, without waiting out the light's lead. */
  flushCast,

  /*
   * Named spots for a scripted walk-up. `podium` is a STANDING spot on the
   * ground south of the dais and is deliberately still the fixed graybox
   * number, so a review that compares against docs/step-05.md is comparing the
   * same walk; `podiumAnchor` is the live interactable anchor, which is the
   * socket once the asset loads. Standing on one must always target the other,
   * and that is what the browser sweep checks.
   */
  marks: {
    spawn: SPAWN,
    podium: { x: DAIS.x, z: DAIS.z - 2.6 },
    get podiumAnchor() { return { x: podiumAnchor.x, y: podiumAnchor.y, z: podiumAnchor.z }; },
    bell: BELL,
    bench: BENCH,
    /* South of the dais, on the ground, for the step-onto-dais proof. */
    daisApproach: { x: DAIS.x, y: 0, z: DAIS.z - 4.0 }
  }
};

console.info(
  '[play] window.__play ready — state(), waitingFor(), submit(a), step() [bots only], ' +
  'auto() [one decision], autopilot(on), runToEnd(), eventLog, ' +
  'restart(seed, players, humanIndex), teleport(x,y,z), face(x,z), look(), use(), floor(). ' +
  'submit(waitingFor().options[0]) is always legal.'
);
