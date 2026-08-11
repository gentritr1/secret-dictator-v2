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

import { SD, AI, Human, View, Floor, Orator, Intents } from '../engine/index.js';
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
  createLightingDirector, lightingFor, publicEdges, weatherFor, LANTERN_ORDER,
  STING_MS, LIGHT_LEAD_MS, NIGHT_STATES
} from './lighting.js';
import {
  ACCUSE, ACCUSE_LAST_MS, accusationFrom, accusationPlan,
  BALLOT, ballotPlanFor, ballotCountAt,
  TILE, tilePlanFor, tileEase,
  PURGE, purgeFor, purgePlan,
  CURTAIN, curtainFor,
  OIL, oilAt, oilFading, oilSpent,
  prefersReducedMotion
} from './stage.js';
import { announceFor } from './tray.js';
import { seatNumber } from './seat.js';
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
 * Framing: the sidebar is gone, so the correction it needed is gone with it.
 *
 * Until this gate a fixed 330 px HUD covered the left of the window for the
 * whole match, so a subject centred in the WINDOW was not centred in the part
 * of the window the player could see, and the camera aimed past the body to
 * push it right (`rig.tuning.screenBias`, see src/walk/camera.js).
 *
 * Nothing on screen does that any more. The private card is 232 x 96 px in the
 * top-left corner — it covers 1.9% of a 1280 x 720 frame and none of the band
 * the body walks through — and the tray is 84 px along the bottom, which is a
 * horizontal band and would need a vertical bias the rig does not have and does
 * not want (raising the aim point would tilt the whole square). So the bias is
 * ZERO: play.html now frames exactly as walk.html does, which is what the
 * composition change actually asks for.
 *
 * The number is kept as a named constant rather than deleted so the decision is
 * visible in the file where it was made, and `__play.setFraming()` still exists
 * for a review that wants to argue with it live.
 */
const SCREEN_BIAS = 0;

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

/*
 * YOUR BODY IS A CITIZEN NOW, and the collider is not.
 *
 * Until this gate the player was a white capsule with an orange nose standing in
 * a square full of carved townsfolk — the last primitive on screen, and the most
 * obvious break in the art direction. Gate D3 deferred it on purpose ("swapping
 * the player's visual is a separate decision"); this is that decision taken.
 *
 * The split that makes it safe is the one this file has always had: the CAPSULE
 * IS THE SIMULATION and the figure is a picture of it. `src/walk/controller.js`
 * collides a capsule of `tuning.radius` x `tuning.height` and every Step 3
 * measurement — the wall stop at z = 11.6499, the 0.22 m step onto the dais, the
 * ramp behaviour — is a statement about that capsule. Nothing below touches it:
 * `controller.advance` is called with the same tuning it was called with before,
 * and the figure is parented under `avatarPose`, which is a child of the group
 * the controller's sampled position is copied into. A figure that disagreed with
 * its collider would be a movement bug nobody could see.
 *
 * `avatarPose` exists for the same two reasons the bots' `pose` group does:
 * sitting drops it, and death rotates it. Rotating `avatar` itself would fight
 * `avatar.rotation.y = controller.state.facing` every frame.
 */
const avatarPose = new THREE.Group();
avatar.add(avatarPose);

/** What THIS avatar built and may therefore dispose. Never the cast's cache. */
let avatarOwns = { geometries: [], materials: [] };
/** The material clones the greying-on-death writes to, with their authored colour. */
let avatarSkins = [];
/** Set when the human's variant did not load and the capsule is standing in. */
let avatarIsCapsule = true;
/** The variant id the human is wearing, and where its nameplate socket sits. */
let avatarVariant = null;
let avatarLabelY = 1.95;
let avatarTopple = tuning.radius;
/** How far the body drops when you sit. Presentation only; see frame(). */
const SIT_DROP = 0.42;

const youRing = ringMesh(COLOR.speaker);
avatar.add(youRing);

scene.add(avatar);

/**
 * Build the player's visible body: the citizen their seat implies, or the
 * capsule if that citizen's file did not arrive.
 *
 * WHICH FIGURE, and it is deliberately not a decision: `variantForSeat` is the
 * same deterministic mapping every bot goes through (seat n -> variant
 * n mod 4), asked with the human's own seat. The player looks like the citizen
 * their seat implies rather than like a fifth special-cased model, so nothing on
 * screen distinguishes the human's body from a bot's — which matters in a
 * deduction game where the crowd is the information.
 *
 * The materials are CLONED per build for the same reason the seats clone theirs:
 * greying on death writes to the material, and the cache's copy is shared with
 * every bot wearing the same variant. The geometry is taken by reference and
 * never disposed here — docs/step-08.md's shared-cache hazard, which emptied the
 * square on the second deal the first time somebody disposed correctly.
 */
/*
 * `?body=capsule` puts the graybox capsule back, the way `?tone=linear` puts
 * NoToneMapping back.
 *
 * It is here for the same reason that one is, and docs/step-07.md states it:
 * "so the decision can be re-examined rather than taken on trust". The swap is
 * not free — the citizen figures are painted CarvedWood and the player's own
 * body stands nearer the camera than anything else in the square, so it lands
 * squarely in the frame the style bible's warm budget is measured on. Two loads
 * of the same URL is what turns "the figure costs about a point" into a number
 * (docs/step-14.md §6 measures it at +1.20), and anybody who thinks the capsule
 * read better can look instead of arguing.
 */
const BODY_CAPSULE = new URLSearchParams(location.search).get('body') === 'capsule';

function buildAvatarFigure(seat) {
  for (const child of avatarPose.children.slice()) avatarPose.remove(child);
  for (const g of avatarOwns.geometries) g.dispose();
  for (const m of avatarOwns.materials) m.dispose();
  avatarOwns = { geometries: [], materials: [] };
  avatarSkins = [];
  avatarPose.rotation.x = 0;
  avatarPose.position.y = 0;

  const row = variantForSeat(seat);
  const variant = BODY_CAPSULE || !castLibrary || !row ? null : castLibrary.byId[row.id];

  if (variant) {
    for (const part of variant.parts) {
      const material = part.material.clone();
      avatarOwns.materials.push(material);
      avatarSkins.push({ material, authored: material.color.getHex() });
      const mesh = new THREE.Mesh(part.geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      avatarPose.add(mesh);
    }
    avatarIsCapsule = false;
    avatarVariant = variant.id;
    avatarLabelY = variant.labelY;
    avatarTopple = variant.topple;
    return variant.id;
  }

  /*
   * The fallback, unchanged from every gate before this one: the graybox capsule
   * and its nose cone, sized to the collider. One missing file costs the player
   * their face and nothing else — the match is still completely playable, which
   * is the same rule src/play/assets.js applies per seat.
   */
  const bodyGeometry = new THREE.CapsuleGeometry(
    tuning.radius, tuning.height - tuning.radius * 2, 8, 20);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: COLOR.you });
  avatarOwns.geometries.push(bodyGeometry);
  avatarOwns.materials.push(bodyMaterial);
  avatarSkins.push({ material: bodyMaterial, authored: COLOR.you });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = tuning.height / 2;
  body.castShadow = true;
  avatarPose.add(body);

  const noseGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.34);
  const noseMaterial = new THREE.MeshLambertMaterial({ color: 0xe0724f });
  avatarOwns.geometries.push(noseGeometry);
  avatarOwns.materials.push(noseMaterial);
  const nose = new THREE.Mesh(noseGeometry, noseMaterial);
  nose.position.set(0, tuning.height * 0.72, tuning.radius + 0.1);
  nose.castShadow = true;
  avatarPose.add(nose);

  avatarIsCapsule = true;
  avatarVariant = null;
  avatarLabelY = 1.95;
  avatarTopple = tuning.radius;
  return null;
}

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
    /*
     * The labels, wherever they were hung.
     *
     * Your own plate and badge are parented to the AVATAR rather than to your
     * seat marker (see setRoster), so a sweep of `c.group` alone would leave two
     * live CSS2D nodes on the avatar every time a match is dealt — the leak
     * would be invisible for one restart and a stack of overlapping nameplates
     * by the fifth. Each seat is asked to give back the objects it recorded.
     */
    for (const label of [c.nameLabel, c.badgeLabel]) {
      if (!label) continue;
      if (label.parent) label.parent.remove(label);
      if (label.element && label.element.parentNode) {
        label.element.parentNode.removeChild(label.element);
      }
    }
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
      /*
       * YOUR OWN FIGURE, built here rather than at module load, because which
       * citizen you are is a function of your seat and the seat is only known
       * once a match has been dealt.
       *
       * Your nameplate then hangs off `SOCKET_label` on THAT figure — the same
       * path every other citizen's plate takes — with one difference stated
       * rather than assumed: it is attached to the AVATAR, not to this seat's
       * floor marker. The bots' plates and their bodies are the same object, so
       * "on the socket" and "at the seat" are the same sentence for them. Yours
       * are not: the marker is the empty spot in the ring and the body is off
       * walking around the square. A plate pinned to the marker would name an
       * empty disc, and the old 0.35 m constant was that plate lying flat on the
       * ground to hide the fact. So the plate follows the body, at whatever
       * height the figure's own socket published — 1.62 m on the hunched
       * citizen, 2.36 m on the tall one.
       */
      buildAvatarFigure(p.id);
      labelY = avatarLabelY;
    }

    const ring = ringMesh(COLOR.speaker);
    owns.geometries.push(ring.geometry);
    owns.materials.push(ring.material);
    group.add(ring);

    /*
     * The nameplate, and the one grammar stamped on it.
     *
     * The number in the left third, hairline-separated from the name, is the
     * key you press to name this citizen — the same number the tray offers, the
     * same number the panel's kbd hint shows, and (next gate) the same number
     * the ledger sorts by. It comes from roster order, it never changes, and it
     * is not reused when its owner dies. See src/play/seat.js.
     *
     * Under the name sit at most three marks: gavel, deputy, term-limited. All
     * brass or dim, never coloured — a coloured mark on a plate would be a
     * second channel that could correlate with allegiance, which is the thing
     * the whole HUD spends its palette rules avoiding.
     */
    const nameEl = document.createElement('div');
    nameEl.className = 'tag' + (p.isYou ? ' me' : '');
    nameEl.innerHTML =
      `<span class="num">${seatNumber(p.id)}</span>` +
      `<span class="nm"></span><span class="marks"></span>`;
    nameEl.querySelector('.nm').textContent = p.name + (p.isYou ? ' (you)' : '');
    const markEl = nameEl.querySelector('.marks');
    const nameLabel = new CSS2DObject(nameEl);
    /*
     * SOCKET_label, not a constant. The four figures are 1.48 m to 1.96 m tall
     * and their sockets sit at 1.62 / 1.80 / 1.95 / 2.15 — a single hardcoded
     * height floats over the hunched one and sits inside the tall one's hat.
     * The badge keeps its old 0.40 m clearance above whatever the name does.
     */
    nameLabel.position.set(0, labelY, 0);
    /* Yours rides the body; everybody else's rides their seat. See the branch
     * above for why those are the same rule and not two. */
    (p.isYou ? avatar : group).add(nameLabel);

    const badgeEl = document.createElement('div');
    badgeEl.className = 'badge hidden';
    const badgeLabel = new CSS2DObject(badgeEl);
    badgeLabel.position.set(0, labelY + 0.40, 0);
    (p.isYou ? avatar : group).add(badgeLabel);

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
      markEl, marks: '',
      nameLabel, badgeLabel, murmurEl,
      toppled: false,
      /* Your own topple lift is your FIGURE's depth, read off the same
       * `box.max.z` every bot's is (src/play/assets.js `topple`) — not the
       * collider radius, which is a fact about the simulation and not about the
       * shape that has to rest on the floor. */
      toppleLift: p.isYou ? avatarTopple : toppleLift,
      variant: p.isYou ? avatarVariant : (variant ? variant.id : null),
      labelY
    });
  }
}

/** Has your own figure fallen? Read off the seat record, not off a second flag. */
function avatarToppled() {
  const me = citizens.find((c) => c.isYou);
  return !!(me && me.toppled);
}

/** Where this seat's nameplate actually sits, read off the scene graph. */
function labelHeightOf(c) {
  let y = null;
  /* Yours hangs off the avatar, everybody else's off their seat — the readback
   * has to look where the object actually is or it reports a missing plate. */
  (c.isYou ? avatar : c.group).traverse((o) => {
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

    /*
     * The brass marks, which is where the retired `speaker` and `deputy` rows
     * went: you look at people, not at a row about people.
     *
     * Every mark on a plate is also in the public log — the gavel when the
     * morning report names its holder, the deputy when the ballots pass, the
     * term limits when the session opens — so a plate can say nothing the
     * square has not been told.
     */
    const marks = [];
    if (p.alive) {
      if (c.id === view.speaker && view.phase !== 'game_over') marks.push('gavel');
      if (c.id === view.deputy) marks.push('deputy');
      if (view.termLimited.indexOf(c.id) !== -1) marks.push('limited');
    }
    const markText = marks.join(' · ');
    if (c.marks !== markText) {
      c.marks = markText;
      if (c.markEl) c.markEl.textContent = markText;
    }

    if (!p.alive) {
      if (!c.toppled) {
        /* -90 degrees about X maps the body's +Y to +Z: it falls forward, onto
         * its face, toward the middle of the square. The lift is the figure's
         * own depth (assets.js `topple`), because after that rotation its
         * former depth is what holds it off the floor — a shared constant
         * buried the tall citizen and floated the hunched one.
         *
         * YOUR OWN DEATH TAKES THE SAME PATH. It used to be excluded, because
         * the capsule had nothing to topple onto and no depth of its own worth
         * the name; now that your body is a citizen it falls exactly as one,
         * off exactly the same number. The group that rotates is `avatarPose`
         * for you and `pose` for everybody else — the same relationship in both
         * cases: the child of the object the world position is written to, so
         * the fall cannot fight the facing. */
        const fallen = c.isYou ? avatarPose : c.pose;
        fallen.rotation.x = -Math.PI / 2;
        fallen.position.y = c.toppleLift;
        c.toppled = true;
        /* The nameplate follows the body down: a label hovering at standing
         * height over a toppled figure reads as a bug, not as a grave. */
        c.nameLabel.position.y = c.toppleLift + 0.35;
        c.badgeLabel.position.y = c.toppleLift + 0.75;
      }
      for (const skin of (c.isYou ? avatarSkins : c.skins)) {
        skin.material.color.setHex(COLOR.dead);
      }
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
    for (const skin of (c.isYou ? avatarSkins : c.skins)) {
      skin.material.color.setHex(skin.authored);
    }

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

  }
  paintBadges(view);
  if (view.phase === 'game_over') youRing.visible = false;
}

/**
 * THE BALLOTS LAND ONE AT A TIME — the design doc's rank 2.
 *
 * Split out of `applyToScene` because it is now re-run on a clock rather than
 * on a view change: the tally is public the instant the ballots are opened, and
 * painting every badge in one frame is a number appearing. The doc asks for the
 * opposite — "the count reads as an accumulating fact" — and its acceptance
 * criterion is the reason why: *a viewer with the sound off knows the result
 * before the count finishes.*
 *
 * SEAT ORDER, 180 ms apart, both from src/play/stage.js. A seat whose ballot has
 * not landed yet gets no badge rather than a blank one; a seat that did not vote
 * gets none at all, ever.
 *
 * Without a reveal running — a scripted sweep that jumped straight to the state,
 * a redraw after a panel closed — every badge is painted at once, which is the
 * behaviour every gate before this one had.
 */
function paintBadges(v) {
  const tally = v.phase === 'vote_result' && v.lastVote ? v.lastVote : null;
  const landed = ballotState();
  for (const c of citizens) {
    const p = v.players[c.id];
    if (!p || !p.alive) continue;
    c.badgeEl.className = 'badge hidden';
    c.badgeEl.textContent = '';
    if (!tally) continue;
    const aye = tally.aye.indexOf(c.id) !== -1;
    const nay = tally.nay.indexOf(c.id) !== -1;
    if (!aye && !nay) continue;
    if (landed && !landed.done) {
      const step = ballots.plan.steps.find((s) => s.id === c.id);
      if (step && landed.landed <= ballots.plan.steps.indexOf(step)) continue;
    }
    c.badgeEl.textContent = aye ? 'AYE' : 'NAY';
    c.badgeEl.className = 'badge ' + (aye ? 'aye' : 'nay');
  }
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

/*
 * THE PRESENTATION CLOCK, and the whole of what "pinning pauses the
 * presentation, not the game" means in code.
 *
 * Every clock on this page — the deliberation beat, the floor's argument, the
 * announcement, the tile sting, the light's staging lead, the bubbles — is an
 * absolute timestamp compared against `now`. So there is exactly one honest way
 * to hold all of them at once, and it is to stop the clock they are all read
 * from rather than to remember six deadlines and shift them by hand.
 *
 * `nowMs()` is that clock: wall time minus however long the ledger has been
 * pinned, and frozen entirely while it is pinned. Pin for a minute and every
 * deadline is exactly where it was when you pinned; nothing expires unseen, no
 * bubble is dropped, and the argument the square was halfway through resumes
 * mid-sentence.
 *
 * THE ENGINE IS NOT IN THIS PARAGRAPH. It has no clock — `Driver.step` is
 * called by tick() and by nothing else — so pausing is the absence of a call,
 * not a state the rules can be in. test/pace.test.js has proved since Gate 1.5
 * that stopping and starting this loop cannot change a match, and the new gate
 * re-proves it through the actual pin: open, wait, close, diff the event log.
 *
 * Raw `performance.now()` survives in exactly one place, the render loop's `last`,
 * because that is a frame delta and a frame still happens while paused (the
 * page must keep drawing, it simply must not advance anything).
 */
let pausedAt = 0;      // wall time the pin happened, 0 when the square is running
let pausedFor = 0;     // total wall time this match has spent pinned

function nowMs() {
  return (pausedAt || performance.now()) - pausedFor;
}

function floorRemaining() {
  return Math.max(0, floorUntil - nowMs());
}

function holdRemaining() {
  return Math.max(0, holdUntil - nowMs());
}
function holding() {
  return holdRemaining() > 0;
}

/*
 * The tray's one-beat announcement: the retired "next power" row.
 *
 * When a Seize lands the tray says what the board has just armed, holds it for
 * ANNOUNCE_MS, and then goes back to whatever it was saying. It is presentation
 * only — a sentence and a clock — and it is the third thing on this page that
 * ends on a timer with no game event to mark it, so it is pumped from both
 * loops exactly as the beat, the sting and the murmurs are.
 */
const ANNOUNCE_MS = 3000;
let announceText = null;
let announceUntil = 0;
function announcing() {
  return nowMs() < announceUntil ? announceText : null;
}

/* ------------------------------------------------------------- the ledger */

/**
 * Pin the ledger, or give the square back.
 *
 * Two things happen and no third: the clock stops (see nowMs above) and the bot
 * branch of tick() stops being reached. Nothing is written to the session, no
 * decision is answered or withdrawn, and `waitingFor()` is whatever it was — so
 * a decision you own is still yours while you read, which is the point.
 */
function pinLedger() {
  if (panels.isLedgerOpen) return false;
  pausedAt = performance.now();
  panels.openLedger(view, ledgerSource());
  /* The tray's hint changes the first time this happens, and the tray is
   * signature-cached, so it has to be told. */
  if (view) panels.renderTray(view, presentation());
  return true;
}

function unpinLedger() {
  if (!panels.isLedgerOpen) return false;
  if (pausedAt) { pausedFor += performance.now() - pausedAt; pausedAt = 0; }
  panels.closeLedger();
  if (view) panels.renderTray(view, presentation());
  /* Re-time the loop from now, exactly as a submission does: a timer already in
   * flight was scheduled against a delay computed before the pause. */
  stopLoop();
  startLoop();
  return true;
}

/** What the ledger renders, and it is a projection rather than the record. */
function ledgerSource() {
  return floorVoice ? floorVoice.source() : null;
}

/** What the page is doing that the view cannot know. A clock, not game state. */
function presentation() {
  return {
    holding: holding(),
    announce: announcing(),
    /* One bit of onboarding: the tray's hint says what is in the ledger until
     * the ledger has been opened once. See src/play/tray.js. */
    ledgerSeen: panels.ledgerSeen,
    /* The card dims to 35% in the night states; the light is the only thing
     * that knows which those are. */
    night: NIGHT_STATES.indexOf(lighting.target) !== -1,
    /*
     * Who is naming you, while they are — a SEAT ID, which is the number on
     * their own nameplate, and only once the accusation's staging has reached
     * the beat where the line is meant to swap (ACCUSE.objective). Before that
     * moment the line is whatever it was, which is what makes the swap a beat
     * in the sequence rather than the first thing that happens.
     */
    accusedBy: accusing && accusing.done.objective ? accusing.from : null,
    /* The setting, so the strip can draw a static rule instead of a burning
     * one. It is presentation in the purest sense: it changes no rule, and the
     * only thing it can do is stop a clock. */
    floorWaits
  };
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
  holdUntil = nowMs() + pace.beatFor(nextWaiting, speed);
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
  /*
   * The ballots start landing HERE and nowhere else.
   *
   * This is the moment the square has actually opened them — the deliberation
   * beat has ended and the light has led the crowd by LIGHT_LEAD_MS — and the
   * whole point of the stagger is that it is the reveal rather than a decoration
   * on top of one. Started before `applyToScene`, so the first badge is drawn by
   * the same call that draws everything else.
   */
  if (v.phase === 'vote_result' && v.lastVote && !ballots && litBallots !== voteKey(v)) {
    litBallots = voteKey(v);
    startBallots(v);
  }
  applyToScene(v);
  return true;
}

/*
 * Which tally the ballots were last revealed for.
 *
 * Not "has the phase changed": two CONSECUTIVE elections can produce a
 * byte-identical tally — the same Speaker nominating the same citizen and
 * failing 1-4 twice — which is the bug docs/step-13.md records `publicEdges`
 * hitting with the sting. So the key carries the day as well as the tally, and
 * the day is public.
 */
let litBallots = null;
function voteKey(v) {
  const t = v.lastVote;
  if (!t) return null;
  return `${v.day}:${t.speaker}:${t.nominee}:${t.aye.join(',')}/${t.nay.join(',')}`;
}

/** Run the staged cast update if its lead has elapsed. Called from both loops. */
function pumpCast() {
  if (stagedView && nowMs() >= stagedAt) flushCast();
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

  if (!stingTile || nowMs() < stingUntil) return;
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
  if (murmurs.pump(nowMs(), view)) paintMurmurs();
}

/**
 * Put what is being said over the heads of whoever is saying it.
 *
 * Two classes, not two elements: an idle murmur and a claim on the floor share
 * the one bubble each figure owns, exactly as they share one queue and one cap.
 * `.murmur.floor` is the louder of the two — see style.css for why the
 * difference is contrast and size rather than colour.
 */
function paintMurmurs() {
  const live = new Map();
  for (const m of murmurs.visible) live.set(m.playerId, m);
  for (const c of citizens) {
    if (!c.murmurEl) continue;
    const said = live.get(c.id) || null;
    if (said) {
      const cls = said.floor ? 'murmur floor' : 'murmur';
      if (c.murmurEl.textContent !== said.text) c.murmurEl.textContent = said.text;
      if (c.murmurEl.className !== cls) c.murmurEl.className = cls;
    } else if (c.murmurEl.className !== 'murmur hidden') {
      c.murmurEl.className = 'murmur hidden';
      c.murmurEl.textContent = '';
    }
  }
}

/* ============================================================ the juice map */

/*
 * The five moments the design review ranked as worth the polish budget, driven
 * here and scheduled in src/play/stage.js.
 *
 * Everything below reads the player-safe view and the page's own clock, and
 * nothing else — the same boundary the light and the sound have, and it is
 * sharper here because a camera move is a channel too. "The push-in is 40 ms
 * slower when the accuser is a Rebel" is invisible in a diff and a solve of the
 * game; test/tell.test.js gained four rows for exactly that.
 *
 * ONE CLOCK. Every deadline below is an absolute timestamp on `nowMs()`, which
 * is the clock the ledger's pin freezes (see THE PRESENTATION CLOCK above). So
 * pinning mid-purge holds the silence and the beam exactly where they are, and
 * nothing expires unseen.
 */

/** The page's own reduced-motion setting: null follows the operating system. */
let reducedSetting = null;
const reducedMotion = () => prefersReducedMotion(window, reducedSetting);

/** Moment 1 — { from, plan, staged } while the square is naming you. */
let accusing = null;
/** Moment 2 — { plan, from } while the ballots are landing one at a time. */
let ballots = null;
/** Moment 3 — the tiles on the board, and the one currently in the air. */
let board = null;
let tileFlight = null;
/** Moment 4 — { seat, plan, gavelled } while the beam is on the purged. */
let purging = null;
/** Moment 5 — { plan, from, turned, tabled } while the square takes its bow. */
let curtain = null;

/*
 * YOUR TURN ON THE FLOOR — the beat the square is waiting on you for.
 *
 *   opensAt   when the strip is allowed to appear, on the page's clock: 700 ms
 *             after the accusation's trigger when one staged it, otherwise as
 *             soon as the bubble that prompted you has been read.
 *   burned    how long the beat has ACTUALLY been yours, in ms. Not a deadline
 *             — see the oil line in src/play/stage.js. It only advances while
 *             the beat is genuinely the only thing being asked of you, so a
 *             rules decision, an open card and a pinned ledger all stop it dead
 *             rather than eating into it.
 *   fading    the crowd murmur has been told to go quiet (once, not per frame)
 */
let floorTurn = null;
/**
 * "The floor waits for you" — the setting that replaces the oil line with a
 * static brass rule and holds the beat indefinitely.
 *
 * Off by default and stored on the page, not in the match: it is an
 * accessibility and pace preference, it changes no rule, and with it on the
 * only way to say nothing is to choose to.
 */
let floorWaits = false;

/* ---------------------------------------------- the framing, and only that */

/*
 * THE CAMERA, and the one rule it has: NO CUT, EVER.
 *
 * The design doc is explicit — "no cut, ever — cuts break the toy-theatre
 * staging" — so every framing move below is a push and a small yaw eased over
 * time, applied to the SAME rig the player is steering. It is expressed as an
 * amount in [0, 1] easing toward a want of 0 or 1 rather than as a timeline,
 * for the reason every other blend in this project is exponential: it is
 * frame-rate independent by construction, and it composes with the player
 * dragging the camera instead of fighting them for the yaw.
 *
 * The rig's yaw is private to src/walk/camera.js and is moved only through
 * `orbit()`, which takes pixels. Steering it means converting an angle back into
 * pixels — deliberately, rather than reaching into the module: the workbench's
 * camera is not this gate's to change.
 */
let framingSpec = null;      // { baseDistance, baseYaw, push, yaw }
let framingAmount = 0;
let framingWant = 0;
let framingSeconds = ACCUSE.cameraMs / 1000;

function wrapAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/**
 * Frame the player and one other citizen together.
 *
 * @param {{x:number,z:number}|null} at  where the other party is standing, or
 *        null to hand the camera back.
 */
function frameWith(at, opts = {}) {
  if (!at) {
    framingWant = 0;
    framingSeconds = opts.instant ? 0 : (opts.ms || ACCUSE.cameraMs) / 1000;
    return null;
  }
  const me = controller.state.position;
  /* Yaw toward the MIDPOINT, not toward the accuser: the doc asks for "a small
   * yaw so both of you are in frame", and aiming at either of the two people
   * puts the other one off the edge. */
  const midX = (me.x + at.x) / 2;
  const midZ = (me.z + at.z) / 2;
  /* The rig's yaw convention: yaw = PI puts the camera behind the body looking
   * along +Z (src/walk/camera.js). So the yaw that looks from the body toward a
   * point is atan2 of the vector from the point back to the body. */
  const want = Math.atan2(me.x - midX, me.z - midZ);
  const base = rig.yaw;
  framingSpec = {
    baseDistance: rig.tuning.distance,
    baseYaw: base,
    push: Number.isFinite(opts.push) ? opts.push : ACCUSE.push,
    /* Clamped, because "a small yaw" is the note and a 90-degree swing to catch
     * somebody standing directly behind the camera is not a small yaw — it is
     * the cut the doc bans, arriving slowly. */
    yaw: Math.max(-ACCUSE.yaw, Math.min(ACCUSE.yaw, wrapAngle(want - base)))
  };
  framingWant = 1;
  framingSeconds = opts.instant || reducedMotion() ? 0 : (opts.ms || ACCUSE.cameraMs) / 1000;
  return framingSpec;
}

const DEG = Math.PI / 180;

function updateFraming(dt) {
  if (!framingSpec) return;
  const b = framingSeconds <= 0 ? 1 : 1 - Math.exp(-dt / (framingSeconds / LN20));
  framingAmount += (framingWant - framingAmount) * b;
  rig.tuning.distance = framingSpec.baseDistance * (1 - framingSpec.push * framingAmount);
  const wantYaw = framingSpec.baseYaw + framingSpec.yaw * framingAmount;
  const delta = wrapAngle(wantYaw - rig.yaw);
  /* Not while the player is dragging. Their hand outranks the staging — this is
   * a camera they own, and a moment that wrestled them for it would be worse
   * than no moment. */
  if (!dragging && Math.abs(delta) > 1e-4) {
    rig.orbit(-delta / (rig.tuning.orbitSpeed * DEG), 0);
  }
  if (framingWant === 0 && framingAmount < 0.003) {
    rig.tuning.distance = framingSpec.baseDistance;
    framingSpec = null;
    framingAmount = 0;
  }
}

/** Where a seat is standing, in world space. Public: it is a place, not a fact. */
function seatAt(id) {
  if (!view) return null;
  const c = citizens.find((x) => x.id === id);
  if (c && c.isYou) {
    const p = controller.state.position;
    return { x: p.x, y: 0, z: p.z };
  }
  return seatPosition(id, view.players.length);
}

/** Which lantern is nearest a world point — the one an accuser speaks under. */
function lanternNear(at) {
  const snap = lighting.snapshot();
  let best = null;
  let bestD = Infinity;
  for (const l of snap.lanterns) {
    if (!l.lit) continue;      // a lantern a Seize put out cannot lift
    const d = (l.at.x - at.x) ** 2 + (l.at.z - at.z) ** 2;
    if (d < bestD) { bestD = d; best = l.name; }
  }
  return best;
}

/* -------------------------------------------- 1. the accusation aimed at you */

/**
 * Stage an accusation aimed at this seat.
 *
 * The order is the design, and the brief pins it: the bed cuts FIRST, then the
 * accuser's lantern lifts, then a cooler rim finds your figure, then your figure
 * turns, then the camera settles. Everything is on the page's own clock, so
 * nothing here can be later than `ACCUSE_LAST_MS`, which test/stage.test.js
 * holds to the brief's 700 ms.
 */
function stageAccusation(from) {
  if (from == null || !view) return null;
  const plan = accusationPlan(nowMs(), reducedMotion());
  accusing = { from, plan, done: {} };
  /* The bed, first and at zero. The square going quiet is the pressure. */
  audio.hush('accusation', ACCUSE.hushMs);
  accusing.done.hush = true;
  return plan;
}

function pumpAccusation() {
  if (!accusing) return;
  const t = nowMs();
  const { plan, done } = accusing;
  const at = seatAt(accusing.from);
  const you = seatAt(view ? view.you.id : null);

  if (!done.lantern && t >= plan.lanternAt) {
    done.lantern = true;
    lighting.setFocus({
      name: at ? lanternNear(at) : null,
      lift: ACCUSE.lanternLift,
      pull: ACCUSE.lanternPull
    });
  }
  if (!done.rim && t >= plan.rimAt && you) {
    done.rim = true;
    /*
     * A RIM COMES FROM A DIRECTION.
     *
     * The first version hung the light at the player's own position, which
     * lights the figure evenly from inside itself — a glow, not a rim. Offset
     * toward the accuser and raised to head height it grazes the figure from
     * the side the voice is coming from, so the light says WHO is talking to
     * you as well as that somebody is. With `rimDistance` short it reaches the
     * figure and stops, rather than spilling a second pool onto the cobbles
     * beside the dais beam's.
     */
    const toward = at || you;
    const dx = toward.x - you.x;
    const dz = toward.z - you.z;
    const len = Math.hypot(dx, dz) || 1;
    lighting.setRim({
      at: {
        x: you.x + (dx / len) * ACCUSE.rimOffset,
        y: ACCUSE.rimHeight,
        z: you.z + (dz / len) * ACCUSE.rimOffset
      },
      color: ACCUSE.rimColor,
      intensity: ACCUSE.rimIntensity,
      distance: ACCUSE.rimDistance
    });
  }
  if (!done.turn && t >= plan.turnAt && at) {
    done.turn = true;
    /*
     * "You do not control the turn; you control the answer." The controller's
     * facing is presentation for the avatar — `controller.state.facing` is what
     * `avatar.rotation.y` is copied from, and the collider is a capsule, so
     * turning it moves nothing the simulation depends on. It is written once
     * rather than eased because the controller owns that value every frame and
     * a second writer would be two things steering one body; the turn reads as
     * a turn because the avatar's rotation is copied from it on the next frame
     * and the camera is moving at the same time.
     */
    controller.state.facing = Math.atan2(at.x - controller.state.position.x,
      at.z - controller.state.position.z);
  }
  if (!done.camera && t >= plan.cameraAt && at) {
    done.camera = true;
    frameWith(at, { ms: plan.cameraMs, instant: plan.cameraMs <= 0 });
  }
  if (!done.objective && t >= plan.objectiveAt) {
    done.objective = true;
    if (view) { objective = panels.renderObjective(view, presentation()); }
  }
  if (t >= plan.endsAt) releaseAccusation();
}

function releaseAccusation() {
  if (!accusing) return false;
  accusing = null;
  lighting.setFocus(null);
  lighting.setRim(null);
  frameWith(null);
  if (view) objective = panels.renderObjective(view, presentation());
  return true;
}

/* ------------------------------------------ 1b. your turn on the floor */

/**
 * Take the beat the floor is holding for you.
 *
 * Called once, from refresh(), the moment `floorVoice.pending` appears. It does
 * NOT open the strip: `opensAt` is when the strip is allowed to arrive, and the
 * frame loop is what puts it there — because the arrival is a beat in a
 * sequence ("700 ms: the tray's centre becomes the intent strip") rather than a
 * consequence of the record changing.
 */
function takeFloorTurn(pending) {
  if (!pending || floorTurn) return null;
  floorTurn = {
    seat: pending.seat,
    /*
     * WHEN THE STRIP IS ALLOWED TO ARRIVE, and the brief pins one of the two
     * cases to the millisecond.
     *
     * Staged: **700 ms after the trigger**, full stop — "the tray's centre
     * becomes the intent strip… nothing else appears, ever". The accusation's
     * own schedule has already put the bubble on screen at 300 ms and swapped
     * the objective line at 380, so by 700 the player has read what they are
     * answering. Taking the LATER of this and the bubble's whole layout was the
     * first version, and the acceptance capture measured what it cost: 1970 ms
     * against a 700 ms cap, because a bubble's layout runs to the end of the
     * deliberation gap after it. The cap is not a suggestion.
     *
     * Unstaged — a floor that simply came round to you — there is no schedule to
     * hang it on, so it arrives when the beat before it has been read.
     */
    opensAt: accusing ? accusing.plan.stripAt : (pending.from || nowMs()),
    burned: 0,
    lastAt: null,
    opened: false,
    fading: false
  };
  return floorTurn;
}

/**
 * Is the beat genuinely the only thing being asked of you?
 *
 * THE LINE THE WHOLE SETTING QUESTION TURNS ON. The oil line may only burn
 * while the floor is the one thing on the table. If the rules owe you a
 * decision, if a centred card is open, or if you have pinned the ledger to
 * read, the beat holds — otherwise the clock on the floor would become a clock
 * on a rules decision by the back door, which is the one thing the brief says
 * must never happen in either setting.
 */
function floorBeatIsYours() {
  if (!floorTurn || !floorTurn.opened) return false;
  if (panels.isOpen || panels.isLedgerOpen || panels.isArmed) return false;
  if (waiting) return false;
  return true;
}

/*
 * THE OIL LINE IS FED FROM THE CLOCK, NOT FROM A FRAME DELTA.
 *
 * `pumpStage` is called from three places on purpose — the render loop, the
 * 40 ms stage clock, and the match tick — because requestAnimationFrame does
 * not run in a background tab or in a scripted review pane. A burn measured in
 * frame deltas would therefore be added twice a frame in a visible tab and the
 * beat would run out in six seconds instead of twelve. Measuring it off
 * `nowMs()` makes every extra caller idempotent, and it inherits the ledger's
 * pin for free: that clock stops, so the beat stops with it.
 */
function pumpFloorTurn() {
  if (!floorTurn || !floorVoice) return;
  const now = nowMs();
  const since = floorTurn.lastAt === null ? 0 : Math.max(0, now - floorTurn.lastAt);
  floorTurn.lastAt = now;

  /*
   * The beat can be taken away between one frame and the next: a Purge lands on
   * you mid-floor and the square is not waiting on a dead citizen any more. The
   * schema would refuse every card on the strip (V5), so what would be on
   * screen is a row of keys that do nothing — which is exactly the lie the
   * never-blank rule is about, pointed the other way.
   */
  if (!floorVoice.pending || (view && !view.you.alive)) {
    floorTurn = null;
    panels.closeStrip(view, presentation());
    return;
  }

  if (!floorTurn.opened) {
    if (now < floorTurn.opensAt) return;
    const offered = floorVoice.strip();
    if (!offered || !offered.slots.length) {
      /* Nothing the schema will accept, not even silence — which means the
       * floor is no longer open to this seat. Give the beat back rather than
       * showing an empty row: the tray is never blank, and "no cards" is not a
       * state it has. */
      floorTurn = null;
      return;
    }
    floorTurn.opened = true;
    /* What the arrival actually cost, against the schedule that promised it.
     * Recorded here rather than derived by an observer, because "the first
     * frame on which a poller noticed" is a different number and the brief's
     * cap is on this one. */
    floorTurn.openedAt = now;
    floorTurn.lateBy = Math.round(now - floorTurn.opensAt);
    floorTurn.sinceTrigger = accusing ? Math.round(now - accusing.plan.hushAt) : null;
    panels.openStrip(view, offered, { floorWaits });
    if (view) objective = panels.renderObjective(view, presentation());
    return;
  }

  if (!floorBeatIsYours()) return;
  floorTurn.burned += since;
  panels.setOil(floorTurn.burned, floorWaits);
  panels.renderOil(oilAt(floorTurn.burned, floorWaits), floorWaits);

  /*
   * The pressure, and the whole of it: over the last three seconds the crowd
   * murmur fades out. The rule under the tray does not flash, pulse or change
   * colour — quiet is the instrument, and it costs no pixels.
   */
  if (!floorTurn.fading && oilFading(floorTurn.burned, floorWaits)) {
    floorTurn.fading = true;
    audio.hush('floor', 0);
  }
  if (oilSpent(floorTurn.burned, floorWaits)) answerFloor(null, 'ranOut');
}

/**
 * Answer the floor: speak a card, choose silence, or let the beat run out.
 *
 * One function for all three so the record cannot disagree with the screen
 * about which of them happened — and `explicit` is the field that tells the
 * difference, set by the caller and never inferred.
 */
function answerFloor(fields, how) {
  if (!floorTurn || !floorVoice || !floorVoice.pending) return null;
  /* `notBefore` is the moment the strip actually appeared, so a fast answer is
   * laid out from there rather than from the end of the prompting bubble's own
   * layout — which is a deliberation gap later and would put the reply a second
   * and a half after the key was pressed. */
  const when = { now: nowMs(), notBefore: floorTurn.opensAt, speed };
  const out = how === 'said' && fields
    ? floorVoice.say(fields, when)
    : how === 'ranOut'
      ? floorVoice.runOut(when)
      : floorVoice.sayNothing(when);
  floorTurn = null;
  panels.closeStrip(view, presentation());
  if (out && out.lines.length) {
    murmurs.say(out.lines);
    floorUntil = Math.max(floorUntil, out.until);
  }
  /*
   * The square may have handed the beat straight back, and the commonest way it
   * does is the one that matters most: the right of reply. An accusation aimed
   * at you lands in the middle of THIS run of lines, not in the batch
   * `refresh()` saw, and buys you a beat immediately after the accuser. So the
   * same two questions are asked here — is any of it aimed at me, and did it
   * open a beat — rather than only in refresh(). Missing this is why the first
   * acceptance capture recorded the strip arriving with no staging behind it.
   */
  if (out && out.pending) {
    stageIfNamed(out.lines, out.pending);
    takeFloorTurn(out.pending);
  }
  if (view) objective = panels.renderObjective(view, presentation());
  if (view) panels.renderTray(view, presentation());
  return out;
}

/**
 * MOMENT 1, from either of the two places a floor line can arrive.
 *
 * The accusation and the beat it opened are ONE claim: the objective line the
 * staging swaps in says *answer on the floor*, so staging it without a strip
 * under it would be the square turning to look at you and offering nothing to
 * press. Both halves are checked here, and nowhere else.
 */
function stageIfNamed(said, pending) {
  if (!view || accusing || !pending) return null;
  const aimed = accusationFrom(said, view.you.id);
  if (!aimed) return null;
  if (pending.promptKind !== 'ACCUSE' || pending.promptFrom !== aimed.from) return null;
  const plan = stageAccusation(aimed.from);
  /*
   * THE BEAT MAY HAVE BEEN TAKEN BEFORE THE MOMENT WAS STAGED.
   *
   * `refresh()` and `answerFloor` both call this and then `takeFloorTurn`, but
   * a beat opened on an earlier pass is already sitting there with an `opensAt`
   * derived from the bubble rather than from a schedule — and `takeFloorTurn`
   * will not recompute it, because a beat that re-decided its own arrival every
   * time something else happened would be a moving target. So the schedule
   * takes it back explicitly. Without this the strip arrived at 1691 ms of a
   * 700 ms cap, measured, not guessed: the number came from the acceptance
   * capture's own in-page clock and not from reading the two call sites.
   */
  if (plan && floorTurn && !floorTurn.opened) floorTurn.opensAt = plan.stripAt;
  return plan;
}

/** Everything the floor beat owns, put back. Called on a deal and on a purge. */
function clearFloorTurn() {
  floorTurn = null;
  panels.closeStrip(view, null);
}

/* --------------------------------------------------- 2. the ballot reveal */

/**
 * Start the ballots landing one at a time.
 *
 * Called from the cast update rather than from `refresh()`, because the cast
 * update is already the held path: the badges must not appear until the square
 * has actually opened the ballots, which is what the deliberation beat and
 * `LIGHT_LEAD_MS` between them decide (docs/step-05.md §7b).
 */
function startBallots(v) {
  const plan = ballotPlanFor(v);
  if (!plan.total) { ballots = null; return null; }
  ballots = { plan, from: nowMs() };
  return plan;
}

/** How many ballots have landed, for the badges and for the running count. */
function ballotState() {
  if (!ballots) return null;
  return ballotCountAt(ballots.plan, nowMs() - ballots.from);
}

function pumpBallots() {
  if (!ballots || !view) return;
  const now = nowMs();
  const state = ballotCountAt(ballots.plan, now - ballots.from);
  if (state.landed !== ballots.landed) {
    ballots.landed = state.landed;
    paintBadges(view);
    panels.renderTally(state);
  }
  if (now - ballots.from >= ballots.plan.endsAt) {
    ballots = null;
    panels.renderTally(null);
  }
}

/* ---------------------------------------------------- 3. the tile enacted */

/**
 * The board: one slot per tile the game can enact, laid on the dais in front of
 * the lectern, empty ones outlined and visible beside the full ones.
 *
 * The doc's note is "the empty slots still visible beside it" and that is the
 * whole reason the outlines are built up front rather than appearing with their
 * tile: an empty slot is the score too. Built once per boot, cleared per deal.
 */
const BOARD = {
  reform: { z: DAIS.z - 1.58, of: 5 },
  seize: { z: DAIS.z - 1.24, of: 6 },
  y: DAIS.top + 0.026,
  size: { w: 0.26, h: 0.045, d: 0.20 },
  pitch: 0.30
};

function slotAt(tile, index, of) {
  const row = BOARD[tile];
  const span = (of - 1) * BOARD.pitch;
  return { x: -span / 2 + index * BOARD.pitch, y: BOARD.y, z: row.z };
}

function buildBoard(limits) {
  if (board) {
    scene.remove(board.group);
    for (const g of board.owns.geometries) g.dispose();
    for (const m of board.owns.materials) m.dispose();
  }
  const group = new THREE.Group();
  group.name = 'board';
  const owns = { geometries: [], materials: [] };
  const counts = {
    reform: (limits && limits.reformToWin) || BOARD.reform.of,
    seize: (limits && limits.seizeToWin) || BOARD.seize.of
  };
  const slotGeometry = new THREE.BoxGeometry(BOARD.size.w, BOARD.size.h, BOARD.size.d);
  owns.geometries.push(slotGeometry);
  const outline = new THREE.LineBasicMaterial({ color: 0x2a3040, transparent: true, opacity: 0.75 });
  owns.materials.push(outline);
  const edges = new THREE.EdgesGeometry(slotGeometry);
  owns.geometries.push(edges);
  for (const tile of ['reform', 'seize']) {
    for (let i = 0; i < counts[tile]; i++) {
      const at = slotAt(tile, i, counts[tile]);
      const marker = new THREE.LineSegments(edges, outline);
      marker.position.set(at.x, at.y, at.z);
      group.add(marker);
    }
  }
  scene.add(group);
  board = { group, owns, counts, tiles: [], slotGeometry };
  return board;
}

const TILE_COLOR = { reform: 0x6aa6e6, seize: 0xe8695f };

/**
 * Put a tile on the board — travelling from the lectern if the square has just
 * been told about it, or straight into its slot if this is a redraw.
 *
 * RESTRAINT IS THE BRIEF. An ease-out over 520 ms and 2 cm of settle. No arc, no
 * spin, no particles, no flash on landing: "the restraint is what makes it land,
 * and it is what stops the game reading as arcade" is written about the purge in
 * the same document and it governs here too. The weight is in the deceleration.
 */
function placeTile(tile, index, travel) {
  if (!board) return null;
  const of = board.counts[tile];
  if (index >= of) return null;           // the board is full; the match is over
  const to = slotAt(tile, index, of);
  const material = new THREE.MeshLambertMaterial({ color: TILE_COLOR[tile] });
  board.owns.materials.push(material);
  const mesh = new THREE.Mesh(board.slotGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(to.x, to.y, to.z);
  board.group.add(mesh);
  board.tiles.push({ tile, index, mesh });
  if (!travel) return mesh;

  const from = { x: podiumAnchor.x, y: DAIS.top + TILE.rise, z: podiumAnchor.z };
  mesh.position.set(from.x, from.y, from.z);
  tileFlight = {
    mesh, from, to,
    startedAt: nowMs(),
    plan: { travelMs: reducedMotion() ? 0 : TILE.travelMs, settleMs: TILE.settleMs }
  };
  return mesh;
}

function pumpTile() {
  if (!tileFlight) return;
  const f = tileFlight;
  const t = nowMs() - f.startedAt;
  const travel = f.plan.travelMs;
  if (travel > 0 && t < travel) {
    const e = tileEase(t / travel);
    f.mesh.position.set(
      f.from.x + (f.to.x - f.from.x) * e,
      /* The settle is the last 2 cm and it happens AFTER the travel, so during
       * the travel the tile is held that much high — a thing set down does not
       * arrive at its resting height and then stop, it arrives above it. */
      f.from.y + (f.to.y + TILE.settleDrop - f.from.y) * e,
      f.from.z + (f.to.z - f.from.z) * e
    );
    return;
  }
  const settled = travel + f.plan.settleMs;
  if (t < settled) {
    const k = f.plan.settleMs > 0 ? (t - travel) / f.plan.settleMs : 1;
    f.mesh.position.set(f.to.x, f.to.y + TILE.settleDrop * (1 - k), f.to.z);
    return;
  }
  f.mesh.position.set(f.to.x, f.to.y, f.to.z);
  tileFlight = null;
}

/** Redraw the whole board from the view. Used on a deal and after a restart. */
function syncBoard(v) {
  if (!board || !v) return;
  for (const t of board.tiles) board.group.remove(t.mesh);
  board.tiles.length = 0;
  tileFlight = null;
  for (let i = 0; i < (v.reform || 0); i++) placeTile('reform', i, false);
  for (let i = 0; i < (v.seize || 0); i++) placeTile('seize', i, false);
}

/* ------------------------------------------------------------ 4. the purge */

/**
 * The beam narrows onto the named citizen; total silence; one gavel.
 *
 * Nothing else. The topple is already the cast's (`toppleLift`, off the asset's
 * own depth) and the nameplate already goes dim and stays hanging — this is the
 * framing and the silence around them.
 */
function stagePurge(seat) {
  if (seat == null || !view) return null;
  const at = seatAt(seat);
  if (!at) return null;
  const plan = purgePlan(nowMs(), reducedMotion());
  purging = { seat, plan, gavelled: false };
  lighting.aim({
    at: { x: at.x, y: 0.95, z: at.z },
    height: PURGE.height,
    angleScale: PURGE.angle / 0.34,
    seconds: plan.narrowMs / 1000,
    instant: plan.narrowMs <= 0
  });
  /* THE BED CUTS, NOT FADES. See HUSH in src/play/audio.js for why the purge's
   * silence and the accusation's duck are two different shapes. */
  audio.hush('purge', PURGE.silenceMs);
  return plan;
}

function pumpPurge() {
  if (!purging) return;
  const t = nowMs();
  if (!purging.gavelled && t >= purging.plan.gavelAt) {
    purging.gavelled = true;
    /* One gavel, when the silence ends. It is the existing cue, fired directly
     * rather than through `cuesFor` — that function maps public EDGES to sounds
     * and a purge is not one of its edges; adding it there would change what
     * every other caller of it does. */
    audio.cue('gavel');
  }
  if (t >= purging.plan.endsAt) releasePurge();
}

function releasePurge() {
  if (!purging) return false;
  purging = null;
  /* Back over the dais, at the same speed it left. A snap back would be the cut
   * the doc bans, arriving late. */
  if (!curtain) lighting.aim(null);
  return true;
}

/* ------------------------------------------------------ 5. the curtain call */

/**
 * The reveal, staged as theatre.
 *
 * Each figure turns to camera in seat order 250 ms apart, its role seal presses
 * onto its own nameplate, the Dictator turns last and is held for 1.2 s as the
 * only warm thing in frame, and only then does the existing reveal table appear
 * beneath it.
 *
 * THE ONE PLACE ROLE COLOUR IS ALLOWED ON A NAMEPLATE. Every other gate in this
 * project spends its palette rules keeping allegiance off the plates; this is
 * the moment the engine has already disclosed everything, and `view.reveal` is
 * the one path it comes down (src/engine/view.js). `curtainFor` returns an empty
 * plan whenever `reveal` is null, which is every moment before game over — and
 * that is asserted under hidden-role permutation rather than argued.
 */
function startCurtain(v) {
  const plan = curtainFor(v);
  if (!plan.steps.length) return null;
  curtain = { plan, from: nowMs(), turned: {}, sealed: {}, held: false, tabled: false };
  return plan;
}

function pumpCurtain() {
  if (!curtain || !view) return;
  const t = nowMs() - curtain.from;
  const camera = rig.camera.position;

  for (const step of curtain.plan.steps) {
    if (t >= step.at && !curtain.turned[step.id]) {
      curtain.turned[step.id] = true;
      const c = citizens.find((x) => x.id === step.id);
      /* Your own figure is not turned: you are still steering it, and a body
       * that spun to camera under the player's hand would read as the controls
       * being taken away at the exact moment the game hands them back. */
      if (c && !c.isYou) c.group.lookAt(camera.x, 0, camera.z);
    }
    if (t >= step.sealAt && !curtain.sealed[step.id]) {
      curtain.sealed[step.id] = true;
      const c = citizens.find((x) => x.id === step.id);
      if (c) pressSeal(c, step.role);
    }
  }

  if (!curtain.held && t >= curtain.plan.lastAt && curtain.plan.dictator != null) {
    curtain.held = true;
    const at = seatAt(curtain.plan.dictator);
    if (at) {
      /* "the only warm thing in frame": the beam goes to them and every lantern
       * pulls back. The victory states carry a warm budget of 1.0 — the light is
       * allowed to be an opinion at game over and only then — so this is a
       * composition rather than a budget decision. */
      lighting.aim({ at: { x: at.x, y: 1.0, z: at.z }, height: PURGE.height, angleScale: 0.45 });
      lighting.setFocus({ name: null, lift: 1, pull: 0.35 });
      frameWith(at, { ms: CURTAIN.turnMs, push: 0.05 });
    }
  }

  if (!curtain.tabled && t >= curtain.plan.tableAt) {
    curtain.tabled = true;
    /* …and the table the doc says comes "beneath it", for anyone who wants to
     * read it. It is the panel that has always opened at game over; the only
     * thing this gate changed is WHEN. */
    unpinLedger();
    panels.open(view, null);
    /*
     * …and the square is given back at the same moment.
     *
     * The doc's staging is "the Dictator turns last and is HELD for 1.2 s as the
     * only warm thing in frame. The existing reveal table then appears beneath
     * it" — a hold, not a permanent state. Left running, the beam stayed on one
     * citizen and every lantern stayed at a third for the rest of the session,
     * which quietly contradicts the other half of the same paragraph: "the
     * square already settles into the winning team's colour". The seals stay on
     * the plates, which is the part that was asked to stay.
     */
    lighting.aim(null);
    lighting.setFocus(null);
    frameWith(null);
  }
}

/**
 * The seal, pressed onto a citizen's own nameplate, where it stays.
 *
 * A word and a colour, in the plate's own grammar (the number, the name and the
 * brass marks are already there). It is added rather than replacing anything, so
 * the plate a player has been reading all match is still the plate they are
 * reading — with one more thing on it.
 */
function pressSeal(c, role) {
  if (!c || !c.nameEl || c.nameEl.querySelector('.seal')) return false;
  const seal = document.createElement('span');
  seal.className = 'seal r-' + role;
  seal.textContent = role;
  c.nameEl.appendChild(seal);
  c.nameEl.classList.add('revealed');
  return true;
}

function releaseCurtain() {
  curtain = null;
  return true;
}

/** The living citizen standing closest to you. For a review's default accuser. */
function nearestOther() {
  if (!view) return null;
  const me = controller.state.position;
  let best = null;
  let bestD = Infinity;
  for (const p of view.players) {
    if (p.isYou || !p.alive) continue;
    const at = seatPosition(p.id, view.players.length);
    const d = (at.x - me.x) ** 2 + (at.z - me.z) ** 2;
    if (d < bestD) { bestD = d; best = p.id; }
  }
  return best;
}

/**
 * THE MOMENTS GET THEIR OWN CLOCK, and it is a third one on purpose.
 *
 * They are pumped from the render loop and from the match loop, for the reason
 * pumpAmbience and pumpMurmurs are: requestAnimationFrame stops in a background
 * tab and in a scripted review pane. But neither of those two is fast enough on
 * its own to run a 180 ms schedule:
 *
 *   the render loop  is whatever the display and the scene cost. The headless
 *                    capture pane renders this square at a median frame interval
 *                    of 143 ms at 1280x720 — the same order as the stagger being
 *                    measured, which is how the first measurement of it came
 *                    back agreeing with the schedule for the wrong reason.
 *   the match loop   is 200 ms while the rules are waiting on the human, which
 *                    is EXACTLY when the ballots land.
 *
 * THE FIRST ATTEMPT AT THIS WAS WRONG AND IS WORTH RECORDING: it shortened
 * `nextDelay()` while a moment was running. That interval is not a polling rate,
 * it is how long the bots take to think — so a reveal did not get pumped faster,
 * it made the bots act every 40 ms, and under autopilot the match raced through
 * whole days during a ballot reveal. The reveal stopped appearing at all. A
 * presentation clock must never be spent on the loop that advances the game;
 * that is the same rule src/play/pace.js was written around, arriving from the
 * other direction.
 *
 * So it is its own timer, it only ever pumps, and it cannot reach `Driver.step`.
 * 25 Hz is a quarter of the tightest gap any of the five moments declares. It
 * respects the ledger's pin the same way everything else does — by reading
 * `nowMs()`, which is frozen while pinned, so a pinned square's moments do not
 * advance even though the timer keeps firing.
 */
const STAGE_POLL = 40;
let stageTimer = null;

function startStageClock() {
  if (stageTimer !== null) return;
  stageTimer = setInterval(() => {
    if (panels.isLedgerOpen) return;
    pumpStage();
  }, STAGE_POLL);
}

/** Is any of the five moments running? For a readback, and for the tests. */
function staging() {
  return !!(accusing || ballots || purging || curtain || tileFlight);
}

/** All five moments, pumped from all three loops. See pumpAmbience for why. */
function pumpStage() {
  pumpAccusation();
  pumpFloorTurn();
  pumpBallots();
  pumpTile();
  pumpPurge();
  pumpCurtain();
}

/** Everything the staging owns, put back. Called on a deal. */
function clearStage() {
  accusing = null;
  clearFloorTurn();
  ballots = null;
  purging = null;
  curtain = null;
  tileFlight = null;
  /*
   * THE CAMERA'S OWN DISTANCE GOES BACK, and this line is not bookkeeping.
   *
   * `updateFraming` restores `rig.tuning.distance` when the push has eased back
   * to nothing — but a restart happens mid-push, so without this the boom keeps
   * whatever the last staged moment left it at and every subsequent match is
   * played 5% closer than the rig declares. It was found by the warm budget and
   * not by looking: the trial frame measured 9.31% after a capture run that
   * ended on a curtain call and 8.44% on a fresh load of the same seed, same
   * camera mark and same forced state. A camera that is quietly nearer is
   * exactly the kind of thing that reads as "the square got warmer".
   */
  if (framingSpec) rig.tuning.distance = framingSpec.baseDistance;
  framingSpec = null;
  framingAmount = 0;
  framingWant = 0;
  lighting.release(true);
  panels.renderTally(null);
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
  onClose() { refresh(); },
  /* The intent strip's two exits: a card was spoken, or the top level was
   * dismissed. Both go through one function so a keypress, a mouse click and
   * the oil line running out cannot take three different paths. */
  onFloorSay(fields) { answerFloor(fields, 'said'); },
  onFloorSilence() { answerFloor(null, 'chose'); }
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
    stingUntil = nowMs() + STING_MS;
    /*
     * The tray's one beat of news, cued off the same public edge the light and
     * the sound are: a Seize has landed, and the board has armed whatever that
     * Seize grants. `edges.granted` is what the PREVIOUS view called
     * `nextPower` — the power for seize + 1, which is exactly the one that just
     * came due — captured before the projection moved on. Every word of it is
     * already in the public log the moment the power is granted.
     */
    if (edges.sting === 'seize') {
      announceText = announceFor(next.seize, edges.granted || null);
      announceUntil = nowMs() + ANNOUNCE_MS;
    }
  } else if (nowMs() >= stingUntil) {
    stingTile = null;
  }

  /*
   * THE BOARD IS THE WEATHER. One line, and it is a read of `view.seize` — the
   * count everybody in the square can already see. Set here rather than in
   * refresh() on purpose: applyAmbience is the HELD path, so a lantern goes out
   * when the square is told about the Seize, not when the engine happens to
   * have written it. Same clock as the sting, the tally and the murmurs.
   *
   * `lighting.lanternCount` rather than the declared order's length, so a
   * square whose lantern asset did not load saturates at the lanterns it
   * actually has instead of pretending to put out lights that were never hung.
   */
  lighting.setWeather(weatherFor(next, lighting.lanternCount));

  /*
   * And the Reform's answer, which adds no light: it holds the flames that are
   * still burning still, for REFORM_STEADY_MS. See lighting.js for why this one
   * of the three candidate responses. It is fired from the same public edge the
   * sting is — a tile went on the board and the square was told which.
   */
  if (edges.sting === 'reform') lighting.steadyFlame();

  /*
   * THE TILE TRAVELS — moment 3, and it is cued off exactly the same public
   * edge the sting and the weather are: a tile went on the board and the square
   * was told which one. The slot it lands in is the board's own count
   * (`view.reform` / `view.seize`), so the tile and the number beside it on the
   * tray cannot disagree.
   */
  if (edges.sting) {
    const plan = tilePlanFor(next, edges.sting);
    if (plan) placeTile(plan.tile, plan.index, true);
  }

  /*
   * THE PURGE — moment 4. `purgeFor` is two player-safe views compared, exactly
   * as `publicEdges` is: a seat that was standing and is not. Whether somebody
   * is standing is the most public fact in the square.
   */
  const purged = purgeFor(prevForPurge, next);
  prevForPurge = next;
  if (purged != null) stagePurge(purged);

  const sting = nowMs() < stingUntil ? stingTile : null;
  const state = lightingFor(next, { sting });
  lighting.setState(state);
  audio.setLighting(state);
  audio.fire(edges, own);
  return state;
}

/*
 * The projection the purge is measured against.
 *
 * Deliberately NOT `previousView`: that one advances in `ambience()` on every
 * refresh, including the refreshes that happen while a deliberation beat is
 * holding everything back, so by the time the held edges were applied the two
 * views being compared were both post-purge and the moment never fired. Held
 * back on the same clock as everything else the square is about to be told.
 */
let prevForPurge = null;

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
  /* Which power the Seize now landing grants, read off the view being replaced
   * — `nextPower` is the power for seize + 1, so the outgoing projection is the
   * only one that still knows. Captured here because previousView advances on
   * the next line and a held edge can be applied seconds later. */
  edges.granted = previousView ? previousView.nextPower : null;
  previousView = next;

  if (holding()) {
    heldEdges = {
      gavel: (heldEdges && heldEdges.gavel) || edges.gavel,
      tally: (heldEdges && heldEdges.tally) || edges.tally,
      sting: edges.sting || (heldEdges && heldEdges.sting) || null,
      granted: edges.granted || (heldEdges && heldEdges.granted) || null
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
  /* The ledger reads the record, and the record has just moved: answering a
   * decision with the panel open must update what is in front of you rather
   * than leaving a stale fold on screen with the word "paused" over it. */
  if (panels.isLedgerOpen) panels.renderLedger(view, ledgerSource());

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
    now: nowMs(),
    notBefore: Math.max(nowMs(), holdUntil),
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
      now: nowMs(),
      notBefore: Math.max(nowMs(), holdUntil),
      speed,
      waiting
    });
    if (said.lines.length) {
      murmurs.say(said.lines);
      floorUntil = Math.max(floorUntil, said.until);
      /*
       * MOMENT 1 — is any of it aimed at you?
       *
       * Read off the lines that are about to be spoken, and the only two fields
       * it reads are who is speaking and whom the utterance publicly named. Both
       * are said out loud, in the middle of the square, in front of everybody.
       *
       * D2 said of this line: "in a shipped match this is null every time,
       * because src/engine/orator.js excludes the human seat from every target
       * pool". That exclusion is lifted, so it fires for real now.
       *
       * IT FIRES ONLY WHEN THERE IS SOMETHING TO PRESS. The objective line the
       * staging swaps in says *answer on the floor*, and a square that turned
       * to look at you, went quiet, lit you, and then offered you no way to
       * answer would be the D2 problem arriving through a different door. So
       * the trigger is the accusation AND the beat it opened — which the right
       * of reply in src/engine/orator.js makes the ordinary case rather than
       * the lucky one. `__play.accuseMe()` still drives the staging alone, for
       * a review that wants the moment without the record.
       */
      stageIfNamed(said.lines, floorVoice.pending);
    }
    /* The beat itself, staged or not: a floor that simply came round to you is
     * still your turn, and the strip arrives for it without the ceremony. */
    if (floorVoice.pending) takeFloorTurn(floorVoice.pending);
  }
  if (phaseChanged || holding()) {
    stagedView = view;
    stagedAt = Math.max(nowMs(), holdUntil) + LIGHT_LEAD_MS;
  } else {
    stagedView = null;
    applyToScene(view);
  }

  /* A panel left open on a decision the match has moved past is a lie. */
  if (panels.isOpen && panels.openKind !== 'game_over') {
    if (!waiting || waiting.kind !== panels.openKind) panels.close();
    else panels.open(view, waiting);
  }
  /* And the same rule for the tray's row: a row still holding live keys for a
   * decision that has been answered would offer a key that submits into the
   * next one. Disarming answers nothing — the decision, if it is still pending,
   * simply goes back to offering E. */
  if (panels.isArmed && (!waiting || panels.surfaceFor(waiting.kind) !== 'tray')) {
    panels.disarm(view, presentation());
  }
  /* The result screen is the one panel that opens itself, so it opens exactly
   * once per match and closing it means closed. It is a modal, so it gives the
   * square back first — see takeDecision. */
  if (view.phase === 'game_over' && !gameOverShown) {
    gameOverShown = true;
    /*
     * MOMENT 5 — the curtain call comes first and the table comes after it.
     *
     * The doc is explicit about the order: the figures turn, the seals press
     * onto their own plates, the Dictator is held alone, and "the existing
     * reveal table THEN appears beneath it for anyone who wants to read it". So
     * the panel is opened by `pumpCurtain` at `plan.tableAt` rather than here.
     * If the curtain cannot be staged — a projection with no reveal in it, which
     * should be impossible at game over and is guarded anyway — the table opens
     * immediately, which is exactly the behaviour every gate before this had.
     */
    if (!startCurtain(view)) {
      unpinLedger();
      panels.open(view, null);
    }
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
  /*
   * A fresh presentation clock for a fresh match. Closed through the panel
   * rather than through unpinLedger(), because that one re-times the match loop
   * and restart() is in the middle of tearing the loop down. `panels.ledgerSeen`
   * is deliberately NOT reset: a player does not become a first-timer again
   * because they dealt another hand.
   */
  panels.closeLedger();
  pausedFor = 0;
  pausedAt = 0;
  /* A fresh mouth for a fresh match, seeded from the same integer, so a
   * replayed seed hears the same square. Rebuilt rather than reset because
   * setRoster is about to throw away every bubble element it was pointing at. */
  murmurs = createMurmurs(dealSeed, { chatter: AI.chatter });
  /* A fresh record for a fresh match, seeded from the same integer, so a
   * replayed seed hears the same argument as well as the same chatter. */
  floorVoice = createFloorVoice({
    Floor, Orator, Intents,
    seed: dealSeed,
    humanSeat: human,
    names: NAMES.slice(0, count),
    minds
  });
  floorUntil = 0;

  gameOverShown = false;
  autopilotOn = false;      // a new match is played by hand until asked otherwise
  seated = false;
  announceText = null;
  announceUntil = 0;

  /*
   * A fresh match starts in daylight, snapped rather than faded. Crossfading
   * two and a half seconds from the last match's game-over red into the new
   * match's morning is a bug that looks like a mood, and the new deal's first
   * view must not be compared against the old match's last one — publicEdges
   * would read a Seize count dropping to zero as an enactment.
   */
  previousView = null;
  prevForPurge = null;
  stingTile = null;
  stingUntil = 0;
  ownSubmission = null;
  litPhase = null;
  stagedView = null;
  heldEdges = null;
  wasHeld = false;
  litBallots = null;
  /* A fresh square takes its own staging back: no accusation half-lit, no beam
   * left on a citizen who is alive again in the new deal, no tile in the air.
   * `lighting.release(true)` snaps rather than eases for the same reason the
   * state below is snapped — a two-second travel from the last match's purge
   * into the new match's morning is a bug that looks like a mood. */
  clearStage();
  lighting.setState('day', { instant: true });
  /*
   * A new deal re-lights the square, and it is the only thing in the game that
   * does. The weather is `view.seize` and the new board is empty, so this is
   * bookkeeping rather than a rule — but it has to happen BEFORE the first
   * refresh(), or one frame of the new match is lit by the old match's board.
   *
   * The flame is reseeded from the same integer the pace and the mouth are, so
   * a replayed seed flickers, talks and waits identically.
   */
  lighting.setWeather(weatherFor(null, lighting.lanternCount));
  lighting.setSeed(dealSeed);
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
  /* The board, rebuilt for this deal's own limits and then filled from the view
   * rather than from a counter of its own — a new deal has an empty board, and
   * a restart in the middle of one must not leave last match's tiles lying on
   * the dais. */
  buildBoard(view.limits);
  syncBoard(view);
  panels.resetCaches();
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
   * The ledger is pinned: the square holds.
   *
   * Everything below this line is either a clock being pumped or a bot being
   * asked to move, and the pin means neither happens. It is one `return` rather
   * than a flag threaded through five functions because that is exactly what
   * "the presentation pauses" is — the loop stops calling, and the engine, which
   * has no clock of its own, therefore cannot advance. The player's own path
   * (the keyboard, panels.onSubmit, refresh) does not come through here, which
   * is why a decision you own is still answerable with the ledger open.
   */
  if (panels.isLedgerOpen) return;

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
  if (wasHolding && !held && view) {
    const p = presentation();
    objective = panels.renderObjective(view, p);
    panels.renderTray(view, p);
  }
  wasHolding = held;
  /* The announcement beat is the same shape: it ends on a clock, in a pane that
   * may not be painting. The tray is re-derived here so a scripted review sees
   * it expire on time. */
  if (view && !held) panels.renderTray(view, presentation());

  /* All three of these end on a clock too, and for the same reason they are
   * pumped here as well as from the render loop. */
  pumpCast();
  pumpAmbience();
  pumpMurmurs();
  /* And the five moments, for the same reason: every one of them ends on a
   * clock and fires no game event when it does, and requestAnimationFrame does
   * not run in a background tab or in a scripted review pane. */
  pumpStage();

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
 * What E does, now that there are two surfaces to open onto.
 *
 * The routing rule is src/play/tray.js's `surfaceFor`, and it is asked rather
 * than restated: four decisions (nominate, vote, block response, power target)
 * take the tray's contextual row, and the three that show you private material
 * — the Speaker's three tiles, the Deputy's two, a Foresight read — plus the
 * three acknowledgement ceremonies take the middle of the screen and a
 * deliberate close.
 *
 * Either way the gesture is the same one it has always been: walk to the object
 * the objective line names, press E. What changes is where the answer is given,
 * not how you ask for it.
 */
function takeDecision(ctx) {
  if (!ctx.waiting) return false;
  if (panels.surfaceFor(ctx.waiting.kind) === 'tray') {
    /* The ledger stays pinned: this is the case the spec names — a decision you
     * own, answered on the tray, with the ledger open in front of you. */
    return panels.arm(ctx.view, ctx.waiting);
  }
  /*
   * A centred card is a modal dialog and takes the whole keyboard, so it cannot
   * share the screen with the ledger's own dialog: two dialogs, one Esc, and a
   * pause nobody can see the header of. Opening one gives the square back
   * first. Deliberate, and the only place the ledger closes itself.
   */
  unpinLedger();
  return panels.open(ctx.view, ctx.waiting);
}

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
  interact: (ctx) => takeDecision(ctx)
});

interactions.add({
  id: 'bell',
  position: { x: BELL.x, y: 0, z: BELL.z },
  radius: 2.6,
  canInteract: readyAt('bell'),
  getPrompt: (ctx) => `E — ring the bell: ${BELL_LABEL[ctx.waiting.gate] || 'continue'}`,
  interact: (ctx) => takeDecision(ctx)
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
const help = document.getElementById('help');
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

  /*
   * The armed tray row owns the keyboard for exactly the keys it is showing.
   *
   * Same rule the panel has and the same reason: A is "Aye" here and "strafe
   * left" in the controller. The row is armed only because the player pressed E
   * at the object that owes the decision, the body is frozen while it is, and
   * Esc gives both back without answering anything.
   */
  if (panels.isArmed) {
    if (panels.handleTrayKey(e, view, waiting)) { e.preventDefault(); return; }
  }

  /*
   * THE INTENT STRIP owns the keyboard while it is up, and it is deliberately
   * BELOW the armed row and above everything else.
   *
   * Below the armed row, because arming is a deliberate act taken to answer a
   * RULES decision, and a rules decision outranks a beat on the floor by the
   * same rule that stops the oil line burning while one is pending. Above the
   * ledger and the walk, because the strip is the square standing in front of
   * you with a clock running and `1`, `E` and `Esc` all mean something else
   * everywhere else on this page.
   *
   * `L` and `?` are let through on purpose — the ledger is what a player opens
   * to decide WHAT to say, and pinning it stops the clock (see nowMs), so
   * reading is free. That is the one collision worth resolving in favour of the
   * thing that is not the strip.
   */
  if (panels.isStripOpen && !/^l$/i.test(e.key) && e.key !== '?') {
    if (panels.handleStripKey(e)) {
      if (view) panels.renderTray(view, presentation());
      e.preventDefault();
      return;
    }
  }

  /*
   * The ledger, which is open because the player asked for it.
   *
   * It comes AFTER the armed row on purpose, and that ordering is the answer to
   * the one genuine key collision in this gate: `1-9` names a citizen on an
   * armed nomination row and jumps to a citizen here, and both are right. The
   * row wins, because arming is a deliberate act taken to answer something and
   * jumping is navigation with a scroll bar behind it. A digit the row does not
   * accept — somebody term-limited, somebody dead — falls through and jumps to
   * them instead, which is the more useful of the two things a dead key could
   * do. `Esc` is the same story: it gives the row back first, and closes the
   * ledger on the second press.
   *
   * `L` and `Esc` are intercepted here rather than inside the panel because
   * closing has to stop the pause as well as the panel, and the clock is this
   * file's.
   */
  if (panels.isLedgerOpen) {
    if (e.key === 'Escape' || /^l$/i.test(e.key)) {
      unpinLedger();
      e.preventDefault();
      return;
    }
    if (panels.handleLedgerKey(e, view, ledgerSource())) { e.preventDefault(); return; }
  } else if (/^l$/i.test(e.key)) {
    pinLedger();
    e.preventDefault();
    return;
  }

  /* The keys line, on demand. `?` is offered by the tray's right-hand region,
   * beside the `L` that opens the ledger. */
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    if (help) help.classList.toggle('shown');
    e.preventDefault();
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

  /*
   * The crossfade, and the two things that end on a clock rather than on an
   * event. The light is advanced before anything is drawn.
   *
   * All four are skipped while the ledger is pinned, which is what "the light
   * holds" means: `lighting.update` is the crossfade's only driver, so not
   * calling it freezes the state mid-fade rather than snapping it anywhere. The
   * page keeps drawing — the frame is still rendered at the bottom of this
   * function — it simply draws the same square each time.
   */
  const pinned = panels.isLedgerOpen;
  if (!pinned) {
    lighting.update(dt);
    pumpCast();
    pumpAmbience();
    pumpMurmurs();
    pumpStage();
    /* The framing is the one part of the staging that is a per-frame blend
     * rather than a scheduled step, so it lives here and not in pumpStage: it
     * needs `dt`, and it has to run before the rig is updated below or the push
     * lands one frame late. Frozen with everything else while pinned. */
    updateFraming(dt);
  }

  /* An armed tray row freezes the body exactly as an open panel does. It is the
   * same contract — while a decision has the keyboard, the character does not —
   * and it is what makes it impossible to strafe left into an Aye. The pinned
   * ledger is the third: WASD behind an open dialog would walk the body out of
   * range of the very decision the ledger says is still yours to answer. */
  const frozen = panels.isOpen || panels.isArmed || seated || pinned;
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
  /*
   * Sitting is flavour: the body drops and the ring goes out. The controller is
   * untouched, so nothing about the simulation depends on it.
   *
   * The drop moved from the two capsule meshes onto `avatarPose`, which is what
   * makes it work for a carved figure as well as for the capsule — one group,
   * one number, whatever shape is hanging off it. It is skipped once you are
   * toppled, because that same group is holding the fall and lowering a corpse
   * another 42 cm would bury it.
   */
  if (!avatarToppled()) avatarPose.position.y = seated ? -SIT_DROP : 0;

  rig.update(dt, smoothed, world);

  if (panels.isOpen) {
    panels.setPrompt('');
  } else if (pinned && !panels.isArmed) {
    /* Same grammar the armed row uses: what is on screen is what works, and
     * what is left to say is the way out. */
    panels.setPrompt('L or Esc — put the ledger down');
  } else if (panels.isArmed) {
    /* The row has been taken: the offer to take it would be a second thing to
     * press for something already pressed. What is left to say is the way out,
     * which is the same sentence the panel's footer has always carried. */
    panels.setPrompt('Esc — step back without answering');
  } else {
    interactions.update(controller.state.position, controller.state.facing, interactionContext());
    panels.setPrompt(interactions.prompt);
  }

  /* The deliberation beat ends on a clock, not on a game event, so nothing
   * calls refresh() when it does. Re-deriving the line here is what makes it
   * flip back from "the square is counting them" to "open them at the podium"
   * at the same instant the podium lights up. It rewrites the DOM only when the
   * sentence actually changes.
   *
   * The tray and the card are re-derived on the same terms and for the same
   * reason, with two more clocks of their own: the announcement beat expires
   * without a game event, and so does the night dimming when the light finishes
   * crossfading. Both are signature-cached, so an unchanged tray costs a
   * JSON.stringify and no DOM write. */
  if (view) {
    const p = presentation();
    objective = panels.renderObjective(view, p);
    panels.renderTray(view, p);
    panels.renderCard(view, p);
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
  /* No sidebar, no correction. See SCREEN_BIAS at the top of this file: the
   * body is framed dead centre, exactly as walk.html frames it. */
  rig.tuning.screenBias = SCREEN_BIAS;
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
  /*
   * Real lights on the lantern posts, hung on the sockets the asset published.
   *
   * Handed the whole socket map rather than two named entries, because which
   * lanterns exist is `LANTERN_ORDER`'s business and not this file's — a third
   * lantern is a placement row and a string in lighting.js, and nothing here
   * changes. If the lantern GLB did not load there are no sockets, the director
   * hangs nothing, and the square is exactly the square it was before this gate.
   */
  const hung = lighting.attachLanterns(env.sockets, env.loaded);
  if (hung.length < LANTERN_ORDER.length) {
    console.warn(
      `[lighting] ${hung.length} of ${LANTERN_ORDER.length} declared lantern sockets got a light ` +
      `(${LANTERN_ORDER.filter((n) => hung.indexOf(n) === -1).join(', ')} absent) — ` +
      'the square is lit and playable; the weather saturates at the lanterns that exist.'
    );
  } else {
    console.info(
      `[lighting] ${hung.length} lantern lights hung on ${hung.join(', ')}; ` +
      'every Seize puts one out, in that order, for the rest of the match.'
    );
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
  /* The third clock. See STAGE_POLL: it only pumps, it never steps the game. */
  startStageClock();
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

  /*
   * The tray, both ways, for the same reason the objective line is reported
   * both ways: the module's own answer beside the DOM the page actually wrote.
   * If these disagree the render is broken, not the mapping.
   */
  get tray() {
    const node = document.getElementById('tray');
    const t = panels.tray;
    return {
      id: t ? t.id : null,
      kind: t ? t.kind : null,
      line: t ? t.line : null,
      note: t ? t.note : null,
      keys: t ? t.keys.map((k) => k.key + (k.label ? ' ' + k.label : '')) : [],
      act: t ? t.act : false,
      tracks: t ? t.tracks : null,
      waitingOn: t ? t.waitingOn : [],
      armed: panels.isArmed,
      onScreen: node ? node.textContent.replace(/\s+/g, ' ').trim() : null,
      /* The row, as the player reads it: line one, with its keys. */
      row: node && node.querySelector('.l1')
        ? node.querySelector('.l1').textContent.replace(/\s+/g, ' ').trim() : null
    };
  },

  /*
   * The private card, the same way, plus the one measurement its acceptance
   * criterion is about: the box on screen, in pixels, in whatever state the
   * match is in. A card that grew when the tiles arrived would show up here as
   * two different heights.
   */
  get card() {
    const node = document.getElementById('card');
    const c = panels.card;
    const box = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    return {
      number: c ? c.number : null,
      name: c ? c.name : null,
      role: c ? c.role : null,
      know: c ? c.knowText : null,
      hand: c ? c.hand : null,
      lines: c ? c.lines : null,
      night: c ? c.night : false,
      declared: c ? c.box : null,
      measured: box
        ? { width: Math.round(box.width), height: Math.round(box.height),
            top: Math.round(box.top), left: Math.round(box.left) }
        : null,
      onScreen: node ? node.textContent.replace(/\s+/g, ' ').trim() : null
    };
  },

  /**
   * Everything the retirement table routed to the ledger, which is the NEXT
   * gate and is therefore on screen nowhere.
   *
   * This is the deliberate half of "the sidebar is gone": deck, discard, the
   * chaos track below its promotion point, the next power and the public log
   * are all still readable — they are simply not furniture. When the ledger
   * lands it is a fold over exactly this, and the acceptance test for THIS gate
   * is that none of it appears on screen in the meantime.
   */
  ledger() {
    if (!view) return null;
    return {
      deck: view.deckCount,
      discard: view.discardCount,
      chaos: { n: view.chaos, of: view.limits.chaosLimit },
      nextPower: view.nextPower,
      log: view.log.map((e) => ({ day: e.day, kind: e.kind, text: e.text }))
    };
  },

  /*
   * The ledger panel, both ways, exactly as the tray and the objective line are
   * reported both ways: the module's own model beside the DOM the page wrote.
   *
   * `rows` is every row on screen with the ids it was folded from, which is how
   * a review checks "every row traces to a public utterance or public record
   * entry" against the live page rather than against a fixture.
   */
  get ledgerPanel() {
    const node = document.getElementById('ledger');
    const l = panels.ledger;
    const rowsIn = (sel) => (node && node.querySelectorAll
      ? Array.from(node.querySelectorAll(sel)) : []);
    return {
      open: panels.isLedgerOpen,
      paused: !!(l && l.paused),
      pausedFor: Math.round(pausedFor + (pausedAt ? performance.now() - pausedAt : 0)),
      day: l ? l.day : null,
      flaggedOnly: l ? l.flaggedOnly : false,
      focus: l ? l.focus : null,
      shown: l ? l.citizens.length : 0,
      total: l ? l.total : 0,
      flaggedCount: l ? l.flaggedCount : 0,
      missingSentences: l ? l.missingSentences : 0,
      objective: l && l.objective ? l.objective.text : null,
      promoted: l ? l.promoted.map((r) => r.label + ' ' + r.text) : [],
      citizens: l ? l.citizens.map((c) => ({
        number: c.number, name: c.name, alive: c.alive, flags: c.flagIds,
        groups: c.groups.map((g) => g.id)
      })) : [],
      /* Read off the elements, because a row that is in the model and not in
       * the DOM is not on screen — the step-10 lesson about the bubble class. */
      rows: rowsIn('.lr, .pr, .obj').map((n) => ({
        trace: (n.getAttribute('data-trace') || '').split(' ').filter(Boolean),
        text: n.textContent.replace(/\s+/g, ' ').trim()
      })),
      marks: rowsIn('.ent .flag').map((n) => n.textContent.trim()),
      /* The rule the whole HUD is swept for, asked of the live ledger. */
      roleColour: rowsIn('[class*="r-loyalist"],[class*="r-rebel"],[class*="r-dictator"]')
        .map((n) => n.className),
      onScreen: node && !node.classList.contains('hidden')
        ? node.textContent.replace(/\s+/g, ' ').trim() : null
    };
  },
  /** Pin the ledger and unpin it, without a keyboard. */
  pinLedger,
  unpinLedger,
  /** Jump, filter — the two keys, for a scripted review. */
  ledgerKey(key) {
    if (!panels.isLedgerOpen) return false;
    return panels.handleLedgerKey({ key: String(key) }, view, ledgerSource());
  },

  /** Press E on a tray decision, and give the row back, without a keyboard. */
  arm() { return panels.arm(view, waiting); },
  disarm() { return panels.disarm(view, presentation()); },
  get armed() { return panels.isArmed; },

  /* The framing bias in use, so a reviewer can see and change it live. Zero
   * since the sidebar was retired — see SCREEN_BIAS. */
  get framing() {
    return { screenBias: rig.tuning.screenBias, declared: SCREEN_BIAS };
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
    const floorNodes = nodes.filter((n) => n.classList.contains('floor'));
    return {
      visible: murmurs.visible.map((m) => ({
        id: m.id, seat: m.playerId, beat: m.beat, floor: m.floor, text: m.text
      })),
      /* Authored lines refused at the bright line. Must stay zero, and it is a
       * readback rather than a check so a review can see it is not merely
       * untested. */
      barred: murmurs.barred,
      onScreen: nodes.map((n) => n.textContent.trim()),
      /* Which of them are the floor's, read off the class the renderer actually
       * put on the element — the distinction is only real if it is in the DOM. */
      onScreenFloor: floorNodes.map((n) => n.textContent.trim()),
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
    snap.mapped = view ? lightingFor(view, { sting: stingTile && nowMs() < stingUntil ? stingTile : null }) : null;
    /* What the weather WOULD be for the current view, beside what the rig is
     * actually doing (`snap.weather`). They differ for exactly as long as a
     * deliberation beat holds the Seize back, which is the one place the
     * difference is the feature. */
    snap.weatherMapped = view ? weatherFor(view, lighting.lanternCount) : null;
    snap.sting = nowMs() < stingUntil ? stingTile : null;
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
      /*
       * The player's own body, reported separately because it is the one seat a
       * screenshot cannot settle: the figure walks, so "is that a citizen or the
       * capsule" is a question about a thing that is rarely in the same place
       * twice. `variant` null with `capsule` true is the honest degraded state —
       * the human's GLB did not arrive and the match is still playable.
       */
      you: {
        variant: avatarVariant,
        capsule: avatarIsCapsule,
        labelY: Math.round(avatarLabelY * 1000) / 1000,
        toppleLift: Math.round(avatarTopple * 1000) / 1000,
        /* The collider, unchanged and printed beside the figure so a review can
         * see that the swap did not move it. */
        collider: { radius: tuning.radius, height: tuning.height }
      },
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

  /*
   * THE JUICE MAP, as a report.
   *
   * A screenshot can show that the square is dark and somebody is lit; it cannot
   * show that the bed cut before the light moved, that the ballots were 180 ms
   * apart, or that the silence was 800 ms and not 780. Every one of the five
   * moments is a schedule, and a schedule is only checkable from a readback.
   *
   * `declared` is what src/play/stage.js says the moment is; `live` is what the
   * page is actually doing right now. A review compares them.
   */
  stage() {
    const t = nowMs();
    return {
      reducedMotion: reducedMotion(),
      reducedSetting,
      declared: {
        accusation: ACCUSE, accusationLastMs: ACCUSE_LAST_MS,
        ballot: BALLOT, tile: TILE, purge: PURGE, curtain: CURTAIN
      },
      accusation: accusing
        ? {
          from: accusing.from, done: Object.assign({}, accusing.done),
          /* Every step as an offset from the trigger, which is the form the
           * brief's "nothing later than 700 ms" is stated in. */
          offsets: {
            hush: 0,
            lantern: Math.round(accusing.plan.lanternAt - (accusing.plan.hushAt)),
            rim: Math.round(accusing.plan.rimAt - accusing.plan.hushAt),
            turn: Math.round(accusing.plan.turnAt - accusing.plan.hushAt),
            camera: Math.round(accusing.plan.cameraAt - accusing.plan.hushAt),
            bubble: Math.round(accusing.plan.bubbleAt - accusing.plan.hushAt),
            objective: Math.round(accusing.plan.objectiveAt - accusing.plan.hushAt),
            strip: Math.round(accusing.plan.stripAt - accusing.plan.hushAt),
            last: Math.round(accusing.plan.lastAt - accusing.plan.hushAt)
          },
          /* Whether the strip the objective line promises is actually up. The
           * two are one claim — "answer on the floor" with nothing to press is
           * the moment failing — so they are read back together. */
          stripUp: panels.isStripOpen,
          elapsed: Math.round(t - accusing.plan.hushAt),
          reduced: accusing.plan.reduced
        }
        : null,
      ballots: ballots
        ? {
          stagger: BALLOT.stagger,
          plan: ballots.plan.steps.map((s) => ({ seat: s.seat, at: s.at, aye: s.aye, nay: s.nay })),
          elapsed: Math.round(t - ballots.from),
          now: ballotCountAt(ballots.plan, t - ballots.from)
        }
        : null,
      board: board
        ? {
          counts: board.counts,
          placed: board.tiles.map((x) => ({ tile: x.tile, index: x.index })),
          inFlight: tileFlight
            ? { elapsed: Math.round(t - tileFlight.startedAt), travelMs: tileFlight.plan.travelMs,
              at: { x: +tileFlight.mesh.position.x.toFixed(3), y: +tileFlight.mesh.position.y.toFixed(3),
                z: +tileFlight.mesh.position.z.toFixed(3) } }
            : null
        }
        : null,
      purge: purging
        ? {
          seat: purging.seat, gavelled: purging.gavelled,
          silenceMs: PURGE.silenceMs,
          elapsed: Math.round(t - purging.plan.silenceFrom),
          gavelAtMs: PURGE.gavelAt
        }
        : null,
      curtain: curtain
        ? {
          of: curtain.plan.of,
          step: CURTAIN.step,
          dictator: curtain.plan.dictator,
          order: curtain.plan.steps.map((s) => ({ seat: s.id, at: s.at, last: s.last })),
          turned: Object.keys(curtain.turned).length,
          sealed: Object.keys(curtain.sealed).length,
          tabled: curtain.tabled,
          elapsed: Math.round(t - curtain.from),
          /* The seals as they are ON THE PLATES, read off the DOM — a seal in
           * the model and not in the element is not on screen. */
          onPlates: citizens.map((c) => {
            const s = c.nameEl ? c.nameEl.querySelector('.seal') : null;
            return s ? { seat: c.id, text: s.textContent, cls: s.className } : null;
          }).filter(Boolean)
        }
        : null,
      framing: framingSpec
        ? {
          amount: +framingAmount.toFixed(3), want: framingWant,
          push: framingSpec.push, yaw: +framingSpec.yaw.toFixed(4),
          baseDistance: +framingSpec.baseDistance.toFixed(3),
          distance: +rig.tuning.distance.toFixed(3)
        }
        : { amount: 0, want: 0, distance: +rig.tuning.distance.toFixed(3) },
      /* The count on screen, beside the module's own answer. Same pair every
       * other surface is reported as. */
      tally: (() => {
        const node = document.getElementById('tally');
        return {
          model: panels.tally,
          onScreen: node && !node.classList.contains('hidden')
            ? node.textContent.replace(/\s+/g, ' ').trim() : null
        };
      })()
    };
  },

  /**
   * Reduced motion, for a review that cannot change a system preference.
   *
   * `null` gives the operating system its answer back. The page's own setting
   * wins when it is set, because a player who wants this game's camera to stop
   * moving should not have to change a system preference to say so.
   */
  setReducedMotion(on) {
    reducedSetting = on === null || on === undefined ? null : !!on;
    return { setting: reducedSetting, effective: reducedMotion() };
  },

  /**
   * "The floor waits for you" — the oil line off.
   *
   * The brief's own wording, and the whole of what it does: the rule under the
   * tray becomes static brass, the beat holds indefinitely, and silence must
   * then be CHOSEN. Nothing else changes — bots keep their own pace, the record
   * is the same record, and no rules decision has a clock in either setting.
   */
  setFloorWaits(on) {
    floorWaits = !!on;
    panels.setOil(floorTurn ? floorTurn.burned : 0, floorWaits);
    if (view) panels.renderTray(view, presentation());
    return floorWaits;
  },
  get floorWaits() { return floorWaits; },

  /**
   * Your turn on the floor, as data: what is offered, what is highlighted, and
   * how much of the oil line is left. A projection, and the readback half of
   * the strip — the module's own answer beside the DOM the page wrote.
   */
  strip() {
    if (!panels.isStripOpen) return null;
    const s = panels.strip;
    const st = panels.stripState;
    return {
      level: st.level,
      cursor: st.cursor,
      prompt: s.prompt,
      promptKind: s.promptKind,
      promptBasis: s.promptBasis,
      slots: s.slots.map((x) => ({
        id: x.id, kind: x.kind, basis: x.basis, target: x.target,
        text_id: x.text_id, sentence: x.sentence,
        options: (x.options || []).length
      })),
      cards: panels.tray && panels.tray.cards
        ? panels.tray.cards.map((c) => ({
          key: c.key, label: c.label, sentence: c.sentence, at: !!c.at
        })) : [],
      note: panels.tray ? panels.tray.note : null,
      /* When the row was promised, when it actually arrived, and how far apart
       * those two are — the brief's 700 ms is a claim about the second one. */
      arrival: floorTurn ? {
        opensAt: Math.round(floorTurn.opensAt),
        openedAt: floorTurn.openedAt === undefined ? null : Math.round(floorTurn.openedAt),
        lateBy: floorTurn.lateBy === undefined ? null : floorTurn.lateBy,
        sinceTrigger: floorTurn.sinceTrigger === undefined ? null : floorTurn.sinceTrigger
      } : null,
      oil: {
        burnMs: OIL.burnMs,
        burned: floorTurn ? Math.round(floorTurn.burned) : 0,
        left: oilAt(floorTurn ? floorTurn.burned : 0, floorWaits),
        waits: floorWaits,
        yours: floorBeatIsYours()
      }
    };
  },
  /** Press a key on the strip, for a scripted review. */
  stripKey(key) {
    if (!panels.isStripOpen) return null;
    const consumed = panels.handleStripKey({ key: String(key) });
    if (view) panels.renderTray(view, presentation());
    return consumed;
  },

  /**
   * Stage an accusation aimed at this seat, for a review.
   *
   * IT IS A REVIEW HANDLE AND IT IS NOT THE GAME. The trigger in `refresh()`
   * reads the floor's own lines and fires this same function with the same
   * argument; what does not happen in a shipped match is a bot ever naming you,
   * because src/engine/orator.js excludes the human seat from every target pool
   * (see `accusationFrom` in src/play/stage.js). So this drives the staging
   * through its real path and does NOT fabricate an utterance: no bubble is
   * invented, nothing is written to the floor's record, and `__play.floor()`
   * still reports exactly what the square really said.
   */
  accuseMe(fromSeat) {
    if (!view) return null;
    const from = fromSeat === undefined ? nearestOther() : Number(fromSeat);
    if (from == null) return null;
    return { from, plan: stageAccusation(from) };
  },
  releaseAccusation,

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
