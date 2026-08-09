/*
 * The lighting director: what the square looks like is decided by what the
 * square is doing.
 *
 * `docs/STYLE_BIBLE.md` gives this file its one sentence — "a handcrafted
 * small-town stage at dusk, where warm lantern light is attention and cold blue
 * dark is suspicion" — and two laws that fall out of a measurement rather than
 * a taste:
 *
 *   WARM IS SCARCE. In the chosen concept the amber family is under 5% of the
 *   frame. Warm light means information. A night frame that is more than about
 *   10% warm pixels has lost the language. Enforced twice below: as a declared
 *   budget per state that test/ambience.test.js asserts, and as a real pixel
 *   measurement the page can take of itself (`measure()`).
 *
 *   DARK IS BLUE, NEVER BLACK. Every ambient in the table sits in the #181828
 *   family. There is no 0x000000 anywhere in this file.
 *
 * And one staging rule from the pipeline: **light changes first, people move
 * second.** The mapping below is evaluated the instant the phase changes;
 * src/play/main.js holds the cast update back by LIGHT_LEAD_MS so the re-light
 * visibly leads the crowd.
 *
 * THE SIGNATURE IS THE TRUST BOUNDARY, exactly as src/play/objective.js
 * ---------------------------------------------------------------------
 * `lightingFor(view, presentation)` takes the player-safe projection and
 * nothing else. It may not read the driver's event stream: that stream is
 * omniscient (ballots, hands, what a Peek found) and a light cue driven by it
 * would be a tell — the square would visibly know something the player is not
 * entitled to. This is not hypothetical. "The lamp dips whenever the Speaker
 * discards a Reform" is a complete solve of the game, delivered by the
 * atmosphere, and nobody would ever see it in a diff.
 *
 * The whitelist, and it is the whole of it:
 *
 *   view.phase                announced to the square
 *   view.winner               revealed at game over and only then
 *   view.waitingFor.kind      this seat's own pending decision
 *   view.waitingFor.gate
 *   view.lastVote.passed      announced when the ballots were opened
 *
 * `publicEdges` reads four more, all of them things the square was told out
 * loud: `nominee`, `lastEnacted`, `reform`, `seize`. test/ambience.test.js
 * proves the list by handing the mapping a recording Proxy and failing on any
 * path outside it — so this comment cannot drift away from the code.
 *
 * Nothing here draws a random number. Same rule as src/play/pace.js: the
 * engine's seeded stream belongs to the engine, and `src/play/` contains no
 * unseeded randomness at all.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------- the states */

/**
 * Every lighting state this module can be in.
 *
 * `unknown` is the defensive branch — a phase this file has not been taught —
 * and it is deliberately NOT a mood: it is daylight, because a state nobody
 * designed should be legible rather than atmospheric. test/ambience.test.js
 * requires that a real match never produces it, and that every other id here is
 * reached.
 */
export const LIGHTING_IDS = [
  'day',
  'dusk',
  'trial',
  'result:passed',
  'result:failed',
  'drafting',
  'power',
  'chaos',
  'enacted:reform',
  'enacted:seize',
  'victory:loyalist',
  'victory:rebel',
  'unknown'
];

/**
 * Which of them are night frames, and therefore bound by the warm budget.
 *
 * `dusk` is not one. The dusk reference is an amber sky over the whole square:
 * the warm there is the sun, not a lantern, and it is not carrying information
 * about anybody. The budget exists for the trial look, where a single pool of
 * amber is the only thing in the frame that means something.
 */
export const NIGHT_STATES = ['trial', 'result:passed', 'result:failed', 'drafting', 'power', 'chaos'];

/**
 * The rigs.
 *
 * Three lights and no more, because the style bible allows one dominant light
 * story per scene and a fourth light is how a second one gets in:
 *
 *   hemi   the ambient. Sky over ground — the "dark is blue" colour lives here.
 *   sun    the sky's own light. High and soft by day, low and amber at dusk,
 *          almost out at night (a cold moon rim, not a second story).
 *   beam   THE warm one. A spot hung over the dais, pooled on the platform,
 *          which is the hero reference's entire composition. It is the only
 *          light in this file in the lantern-glow family, and at night it is
 *          the only one with any intensity worth the name.
 *
 * `warmBudget` is the fraction of the frame the amber family may occupy, per
 * STYLE_BIBLE ("under 5% when possible and never more than 10%"). It is a
 * declared contract: the node gate asserts night states declare <= 0.10, and
 * `measure()` below counts the real pixels and warns when a state overspends.
 *
 * The intensities are AgX numbers. play.html renders with THREE.AgXToneMapping
 * as of Gate 3 (docs/step-07.md) and AgX compresses highlights hard; the same
 * rigs under NoToneMapping are blown out. There is no separate untone-mapped
 * table, on purpose — two tables is how the game and the asset lab end up
 * disagreeing about what a colour is.
 */
export const LIGHTING_STATES = {
  /*
   * Soft overcast day — mood-day-discussion. No lit lanterns at all: the beam
   * is off, which is the whole reason a beam appearing later reads as an event.
   */
  day: {
    label: 'soft day',
    hemi: { sky: 0xcfe0ea, ground: 0x6d6a5c, intensity: 2.3 },
    sun: { color: 0xfff4e2, intensity: 2.1, dir: [0.34, 0.86, 0.38] },
    beam: { intensity: 0, angle: 0.30, penumbra: 0.5 },
    background: 0x8e9fa9,
    fog: { color: 0x94a5ae, near: 44, far: 115 },
    warmBudget: 1.0
  },

  /*
   * Dusk gathering — mood-dusk-gathering. A low amber sun raking across the
   * square from the west, a teal sky bounce above it, and the first suggestion
   * of the beam over the dais. The amber-to-teal gradient the reference is
   * built on is the hemisphere's two colours, which is as much sky as a
   * fog-and-flat-background scene can carry until the backdrop flats exist.
   */
  dusk: {
    label: 'dusk gathering',
    hemi: { sky: 0x748ab0, ground: 0x9a6428, intensity: 3.4 },
    sun: { color: 0xffa657, intensity: 7.5, dir: [-0.62, 0.20, 0.56] },
    beam: { intensity: 14, angle: 0.30, penumbra: 0.6 },
    background: 0x6a6076,
    fog: { color: 0x63566a, near: 30, far: 92 },
    warmBudget: 0.45
  },

  /*
   * The trial — mood-night-trial, and the signature image of the game.
   *
   * Near-monochrome deep blue, one dominant warm beam pooled on the platform,
   * everybody else a rim-lit silhouette. The sun is left barely alive and cold
   * so the citizens read as shapes against the dark rather than as black
   * cut-outs; the reference has exactly that faint blue edge on the watchers.
   */
  trial: {
    label: 'night trial',
    hemi: { sky: 0x505a8a, ground: 0x38385c, intensity: 1.35 },
    sun: { color: 0x35507e, intensity: 0.45, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 190, angle: 0.34, penumbra: 0.42 },
    background: 0x181828,
    fog: { color: 0x181828, near: 20, far: 66 },
    warmBudget: 0.10
  },

  /* The beam is HELD through the result — the reference's staging is that the
   * accused stays in the pool while the verdict lands. What moves is the
   * temperature around it. */
  'result:passed': {
    label: 'the motion carries',
    hemi: { sky: 0x5c6492, ground: 0x4c4260, intensity: 1.7 },
    sun: { color: 0x50648c, intensity: 0.55, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 235, angle: 0.30, penumbra: 0.5 },
    background: 0x1d1c2e,
    fog: { color: 0x1d1c2e, near: 22, far: 70 },
    warmBudget: 0.10
  },
  'result:failed': {
    label: 'the motion fails',
    hemi: { sky: 0x3e4a7a, ground: 0x2a2a48, intensity: 1.1 },
    sun: { color: 0x2a3f68, intensity: 0.30, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 140, angle: 0.22, penumbra: 0.35 },
    background: 0x141426,
    fog: { color: 0x141426, near: 18, far: 60 },
    warmBudget: 0.10
  },

  /*
   * The draft. Two people have withdrawn and the square is standing about in
   * the dark waiting for a law: a dim hall with a lit dais. The ambient drops
   * below the trial's and the beam narrows, so the pool is smaller and harder —
   * the light is on the desk, not on a person.
   */
  drafting: {
    label: 'dim hall, lit dais',
    hemi: { sky: 0x44507e, ground: 0x30304e, intensity: 1.15 },
    sun: { color: 0x2c4570, intensity: 0.28, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 165, angle: 0.20, penumbra: 0.30 },
    background: 0x161626,
    fog: { color: 0x161626, near: 18, far: 62 },
    warmBudget: 0.10
  },

  /* A power is being aimed at somebody. The trial's pressure with the ambient
   * pulled colder — this is the moment the square is at its least friendly. */
  power: {
    label: 'the board grants a power',
    hemi: { sky: 0x48548c, ground: 0x323054, intensity: 1.25 },
    sun: { color: 0x2f4a80, intensity: 0.40, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 178, angle: 0.24, penumbra: 0.34 },
    background: 0x16182c,
    fog: { color: 0x16182c, near: 19, far: 64 },
    warmBudget: 0.10
  },

  /*
   * Chaos: three failed governments and the deck governs instead. Nobody is
   * speaking, so there is nobody for the beam to be about — it goes down to an
   * ember. This is the darkest state in the game and it is still blue.
   */
  chaos: {
    label: 'chaos takes the deck',
    hemi: { sky: 0x3a4066, ground: 0x282840, intensity: 1.0 },
    sun: { color: 0x243354, intensity: 0.22, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 34, angle: 0.20, penumbra: 0.7 },
    background: 0x121222,
    fog: { color: 0x121222, near: 16, far: 56 },
    warmBudget: 0.10
  },

  /*
   * The two stings. A tile went on the board and the square is told which one;
   * the light says it before the log does.
   *
   * These are the only states with a colour that is not sky, lantern or slate,
   * and they are deliberately transient — STING_MS below. A permanent red hall
   * would be decoration; a red flash is the announcement. The colours are the
   * HUD's own `--reform` and `--seize` after the Gate 1 contrast pass, so the
   * board, the log and the sky all say "Seize" in the same red.
   */
  'enacted:reform': {
    label: 'a Reform is enacted',
    hemi: { sky: 0x6aa6e6, ground: 0x24405e, intensity: 1.7 },
    sun: { color: 0x9cc6f0, intensity: 0.9, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 110, angle: 0.30, penumbra: 0.5 },
    background: 0x24384e,
    fog: { color: 0x24384e, near: 24, far: 78 },
    transient: true,
    /* A sting has to ARRIVE, and at the mood crossfade's 2.4 s it never does:
     * the state is only ~40% of the way there when STING_MS takes it away
     * again, which reads as the square going slightly blue for a moment. A
     * sting snaps in and the base state fades back at the normal speed. */
    transition: 0.3,
    warmBudget: 0.10
  },
  'enacted:seize': {
    label: 'a Seize is enacted',
    hemi: { sky: 0x8a2f28, ground: 0x2c1418, intensity: 2.0 },
    sun: { color: 0xe8695f, intensity: 1.2, dir: [0.30, 0.55, -0.78] },
    beam: { intensity: 110, angle: 0.30, penumbra: 0.5 },
    background: 0x3a1a1e,
    fog: { color: 0x3a1a1e, near: 24, far: 78 },
    transient: true,
    transition: 0.3,
    warmBudget: 0.10
  },

  /* Game over. The square settles into the winning team's colour and stays
   * there — the one time in the match the light is allowed to be an opinion. */
  'victory:loyalist': {
    label: 'the Loyalists hold the Republic',
    hemi: { sky: 0x5a7cae, ground: 0x2a3040, intensity: 2.0 },
    sun: { color: 0x9cc6f0, intensity: 1.6, dir: [0.20, 0.70, 0.30] },
    beam: { intensity: 60, angle: 0.32, penumbra: 0.6 },
    background: 0x2b3a52,
    fog: { color: 0x2b3a52, near: 34, far: 96 },
    warmBudget: 1.0
  },
  'victory:rebel': {
    label: 'the Rebels take the Republic',
    hemi: { sky: 0x7e3630, ground: 0x2a1a20, intensity: 1.9 },
    sun: { color: 0xe8695f, intensity: 1.7, dir: [0.20, 0.70, 0.30] },
    beam: { intensity: 60, angle: 0.32, penumbra: 0.6 },
    background: 0x422026,
    fog: { color: 0x422026, near: 34, far: 96 },
    warmBudget: 1.0
  },

  /* The defensive branch. Daylight, because a state nobody designed should be
   * readable rather than moody. Never produced by a real match — asserted. */
  unknown: {
    label: 'undesigned',
    hemi: { sky: 0xcfe0ea, ground: 0x6d6a5c, intensity: 2.3 },
    sun: { color: 0xfff4e2, intensity: 2.1, dir: [0.34, 0.86, 0.38] },
    beam: { intensity: 0, angle: 0.30, penumbra: 0.5 },
    background: 0x8e9fa9,
    fog: { color: 0x94a5ae, near: 44, far: 115 },
    warmBudget: 1.0
  }
};

/* ---------------------------------------------------------- the mapping */

/**
 * What the light is doing, from what the square is doing.
 *
 * @param {object} view  the player-safe projection for this seat, with
 *                       `waitingFor` populated by the session
 * @param {object} [presentation] `{ sting }` — the page's own clock, exactly
 *                       like the `{ holding }` objective.js takes. It carries
 *                       no ids, no roles and no rules; the only thing it can do
 *                       is say that a tile went down a moment ago, which the
 *                       view already announced (see publicEdges).
 * @returns {string} an id from LIGHTING_IDS
 */
export function lightingFor(view, presentation) {
  /* No match yet — the page opens on daylight rather than on the dark, so a
   * slow first load is not indistinguishable from a broken renderer. */
  if (!view) return 'day';

  /* The sting outranks everything except the end of the match: it is an
   * announcement, and it is over in a second. */
  if (presentation && presentation.sting) {
    return presentation.sting === 'seize' ? 'enacted:seize' : 'enacted:reform';
  }

  if (view.phase === 'game_over') {
    return view.winner === 'rebel' ? 'victory:rebel' : 'victory:loyalist';
  }

  /*
   * The morning report is a gate the session owns, and it fires while the
   * engine is already in `nomination` (src/engine/human-driver.js). So it has
   * to be read BEFORE the phase, or the day never happens: the square would
   * open every morning at dusk.
   */
  const w = view.waitingFor;
  if (w && w.kind === 'acknowledge' && w.gate === 'morning') return 'day';

  switch (view.phase) {
    case 'nomination': return 'dusk';
    case 'vote': return 'trial';
    case 'vote_result':
      /* lastVote is announced the moment the ballots are opened. Guarded
       * because a view can reach this phase with the tally not yet written,
       * and "hold the trial look" is the right answer for that instant. */
      if (!view.lastVote) return 'trial';
      return view.lastVote.passed ? 'result:passed' : 'result:failed';
    case 'legislative_speaker':
    case 'legislative_deputy':
    case 'block_response': return 'drafting';
    case 'power': return 'power';
    case 'chaos': return 'chaos';
    default: return 'unknown';
  }
}

/**
 * What changed between two views, in public terms only.
 *
 * This is the whole of the ambience's event sense, and it is deliberately
 * derived from two projections rather than subscribed to the driver's stream.
 * Everything it can notice was announced out loud:
 *
 *   gavel   a nomination was made — `nominee` went from nobody to somebody
 *   tally   the ballots were opened — `lastVote` changed
 *   sting   a tile went on the board — the Reform/Seize counts moved, and
 *           `lastEnacted` says which one. (Counts AND lastEnacted, because
 *           `lastEnacted` alone repeats when the same tile is enacted twice.)
 *
 * @returns {{gavel: boolean, tally: boolean, sting: ('reform'|'seize'|null)}}
 */
export function publicEdges(prev, next) {
  const none = { gavel: false, tally: false, sting: null };
  if (!next) return none;
  if (!prev) return none;   // the first view of a match announces nothing

  const gavel = prev.nominee == null && next.nominee != null;

  /*
   * The ballots are opened when the square enters `vote_result`, and that is
   * the primary test rather than a change in `lastVote`.
   *
   * The content test was the first version and it is quietly wrong: two
   * CONSECUTIVE elections can produce a byte-identical tally. Seed 3210 at five
   * citizens does it — the same Speaker nominates the same citizen on two
   * successive days and it fails 1-4 both times — and the second tally simply
   * never fired. Found by test/ambience.test.js counting stings against the
   * engine's own public prose instead of against a restatement of this
   * function; a check derived from the same fields would have agreed with the
   * bug. The content test is kept as the second half of the OR so a caller that
   * misses the transition entirely still hears the tally.
   */
  const enteredResult = prev.phase !== 'vote_result' && next.phase === 'vote_result';
  const tally = enteredResult || (voteStamp(prev) !== voteStamp(next) && !!next.lastVote);

  let sting = null;
  const before = (prev.reform || 0) + (prev.seize || 0);
  const after = (next.reform || 0) + (next.seize || 0);
  if (after > before && next.lastEnacted) sting = next.lastEnacted.tile;

  return { gavel, tally, sting };
}

function voteStamp(view) {
  const v = view.lastVote;
  if (!v) return '';
  return `${v.speaker}:${v.nominee}:${v.passed ? 1 : 0}:${v.aye.length}/${v.nay.length}`;
}

/* --------------------------------------------------------------- the rig */

/** How long a state takes to arrive, in seconds. Exponential, never linear. */
export const TRANSITION_SECONDS = 1.9;
/** How long a tile sting holds before the base state takes back over. */
export const STING_MS = 1400;
/**
 * How long the light leads the crowd on a phase change, in milliseconds.
 *
 * STYLE_BIBLE staging rule 2: "phase transitions re-light it before they move
 * anyone. Light changes first, people move second." src/play/main.js holds the
 * cast update back by this much; the value is here so the rule lives next to
 * the thing it is a rule about.
 */
export const LIGHT_LEAD_MS = 260;

/**
 * Build the rig and drive it.
 *
 * @param {THREE.Scene} scene
 * @param {{focus?: {x,y,z}, height?: number}} [options]  where the beam pools —
 *        the dais, in world space. Passed in rather than imported so this file
 *        has no opinion about the square's measurements.
 */
export function createLightingDirector(scene, options = {}) {
  const focus = options.focus || { x: 0, y: 0.22, z: 9 };
  const beamHeight = options.height || 7.4;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  /*
   * The beam. Hung high over the dais and aimed at the platform top, which is
   * the hero reference's composition read literally: the lamp is in frame, the
   * cone is visible, and the pool is the only lit ground in the square.
   *
   * `decay: 1` rather than the physical 2 on purpose. At the real distance a
   * quadratic falloff puts the whole usable range inside a few units of
   * intensity, and the pool edge lands wherever the numbers happen to; at 1 the
   * cone angle is what decides where the light stops, which is the thing a
   * staging decision is actually about.
   */
  const beam = new THREE.SpotLight(0xf8d868, 0, 34, 0.3, 0.5, 1);
  beam.position.set(focus.x, beamHeight, focus.z + 0.7);
  beam.target.position.set(focus.x, focus.y, focus.z - 0.4);
  beam.castShadow = true;
  beam.shadow.mapSize.set(1024, 1024);
  beam.shadow.camera.near = 1;
  beam.shadow.camera.far = 26;
  beam.shadow.bias = -0.0015;
  scene.add(beam);
  scene.add(beam.target);

  /* Live values, lerped toward the target every frame. Colours are three.js
   * Colors so the interpolation happens in the renderer's linear working space
   * rather than in sRGB, where a blue-to-amber crossfade goes through mud. */
  const live = blank();
  const target = blank();

  let currentId = null;
  let targetId = null;
  let arrived = true;

  /* The offscreen target `measure()` renders into. Built on first use — a page
   * that never asks for a measurement never allocates it. */
  let probe = null;
  let probeBuffer = null;
  let lastMeasurement = null;

  function blank() {
    return {
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0,
      sunColor: new THREE.Color(), sunIntensity: 0, sunDir: new THREE.Vector3(0, 1, 0),
      beamIntensity: 0, beamAngle: 0.3, beamPenumbra: 0.5,
      background: new THREE.Color(), fog: new THREE.Color(), fogNear: 40, fogFar: 100
    };
  }

  function readInto(slot, id) {
    const s = LIGHTING_STATES[id] || LIGHTING_STATES.unknown;
    slot.hemiSky.setHex(s.hemi.sky);
    slot.hemiGround.setHex(s.hemi.ground);
    slot.hemiIntensity = s.hemi.intensity;
    slot.sunColor.setHex(s.sun.color);
    slot.sunIntensity = s.sun.intensity;
    slot.sunDir.set(s.sun.dir[0], s.sun.dir[1], s.sun.dir[2]).normalize();
    slot.beamIntensity = s.beam.intensity;
    slot.beamAngle = s.beam.angle;
    slot.beamPenumbra = s.beam.penumbra;
    slot.background.setHex(s.background);
    slot.fog.setHex(s.fog.color);
    slot.fogNear = s.fog.near;
    slot.fogFar = s.fog.far;
    return slot;
  }

  function push() {
    hemi.color.copy(live.hemiSky);
    hemi.groundColor.copy(live.hemiGround);
    hemi.intensity = live.hemiIntensity;

    sun.color.copy(live.sunColor);
    sun.intensity = live.sunIntensity;
    sun.position.set(live.sunDir.x * 26, live.sunDir.y * 26, live.sunDir.z * 26);
    sun.target.position.set(0, 0, 0);

    beam.intensity = live.beamIntensity;
    beam.angle = live.beamAngle;
    beam.penumbra = live.beamPenumbra;

    if (!scene.background) scene.background = new THREE.Color();
    scene.background.copy(live.background);
    if (!scene.fog) scene.fog = new THREE.Fog(0x000000, live.fogNear, live.fogFar);
    scene.fog.color.copy(live.fog);
    scene.fog.near = live.fogNear;
    scene.fog.far = live.fogFar;
  }

  /**
   * Aim at a state.
   *
   * @param {string} id            one of LIGHTING_IDS
   * @param {{instant?: boolean}} [opts]  snap rather than fade — used on a
   *        restart, where a two-second crossfade from the last match's game-over
   *        colour into the new match's morning is a bug that looks like a mood.
   */
  function setState(id, opts = {}) {
    const next = LIGHTING_STATES[id] ? id : 'unknown';
    if (next === targetId && !opts.instant) return false;
    targetId = next;
    readInto(target, next);
    if (opts.instant || currentId === null) {
      copy(target, live);
      currentId = next;
      arrived = true;
      push();
      return true;
    }
    /* In transit, and honestly so. Leaving `currentId` on the last arrived
     * state made the readback say `day` while the screen was most of the way
     * into the trial look — a readback that disagrees with the picture is the
     * kind of thing a review quotes and gets wrong. */
    currentId = null;
    arrived = false;
    return true;
  }

  function copy(from, to) {
    to.hemiSky.copy(from.hemiSky);
    to.hemiGround.copy(from.hemiGround);
    to.hemiIntensity = from.hemiIntensity;
    to.sunColor.copy(from.sunColor);
    to.sunIntensity = from.sunIntensity;
    to.sunDir.copy(from.sunDir);
    to.beamIntensity = from.beamIntensity;
    to.beamAngle = from.beamAngle;
    to.beamPenumbra = from.beamPenumbra;
    to.background.copy(from.background);
    to.fog.copy(from.fog);
    to.fogNear = from.fogNear;
    to.fogFar = from.fogFar;
  }

  /**
   * Advance the crossfade.
   *
   * Exponential, and frame-rate independent by construction: the same
   * `1 - exp(-dt / tau)` the avatar's step smoothing uses in main.js, so a 30 Hz
   * display and a 144 Hz display cross the same fade in the same wall-clock
   * time. A linear lerp on `dt` does not have that property and looks different
   * on every machine.
   */
  function update(dt) {
    if (arrived) return false;
    /* A state may ask to arrive faster than the mood crossfade — the two tile
     * stings do, because a 1.4 s announcement inside a 2.4 s fade is not an
     * announcement. Read off the TARGET, so the snap belongs to the state being
     * gone to and the settle back afterwards runs at the normal speed. */
    const seconds = (LIGHTING_STATES[targetId] || {}).transition || TRANSITION_SECONDS;
    const tau = seconds / Math.log(20);
    const b = 1 - Math.exp(-Math.max(0, dt) / tau);

    live.hemiSky.lerp(target.hemiSky, b);
    live.hemiGround.lerp(target.hemiGround, b);
    live.hemiIntensity += (target.hemiIntensity - live.hemiIntensity) * b;
    live.sunColor.lerp(target.sunColor, b);
    live.sunIntensity += (target.sunIntensity - live.sunIntensity) * b;
    live.sunDir.lerp(target.sunDir, b).normalize();
    live.beamIntensity += (target.beamIntensity - live.beamIntensity) * b;
    live.beamAngle += (target.beamAngle - live.beamAngle) * b;
    live.beamPenumbra += (target.beamPenumbra - live.beamPenumbra) * b;
    live.background.lerp(target.background, b);
    live.fog.lerp(target.fog, b);
    live.fogNear += (target.fogNear - live.fogNear) * b;
    live.fogFar += (target.fogFar - live.fogFar) * b;

    /*
     * "Close enough" has to be measured on the loudest channel or the state
     * readback lies for several seconds after the picture has stopped moving.
     * Intensity is that channel: a beam going 0 -> 140 is still visibly moving
     * when every colour has long since converged.
     *
     * The tolerance is RELATIVE, which the first version got wrong. A flat
     * 0.5 means a beam crossing 140 units needs 4.6 time-constants to "arrive"
     * while a hemisphere crossing 3 needs 1.8, so `state` reported the old
     * state for seconds after the screen had stopped changing — and a readback
     * that disagrees with the picture is worse than no readback.
     */
    if (near(live.beamIntensity, target.beamIntensity, 0.5) &&
        near(live.hemiIntensity, target.hemiIntensity, 0.01) &&
        near(live.sunIntensity, target.sunIntensity, 0.01) &&
        live.background.getHex() === target.background.getHex()) {
      copy(target, live);
      arrived = true;
      currentId = targetId;
    }
    push();
    return true;
  }

  /**
   * Count the warm pixels in the frame the player is actually looking at.
   *
   * THE CHOICE, since the brief allowed either: this is a real pixel readback,
   * not state-based bookkeeping. Bookkeeping would only ever re-report the
   * numbers in the table above, and the table is exactly the thing that could
   * be wrong — an intensity that looks reasonable in a literal can still light
   * half the square. The style bible's rule is about the FRAME, so the check
   * has to read the frame.
   *
   * It renders the live scene into a small offscreen target (128 x 72 by
   * default, ~9200 samples) with the same tone mapping the canvas uses, reads
   * it back, and classifies each pixel in HSL: the amber family is hue 15-70
   * degrees with enough saturation to be a colour and enough lightness to read
   * as light rather than as a dark surface that happens to be brownish.
   *
   * On demand only, never per frame — `readRenderTargetPixels` stalls the
   * pipeline, and a style gate that costs frame time would be turned off.
   */
  function measure(renderer, camera, opts = {}) {
    const w = opts.width || 128;
    const h = opts.height || 72;
    if (!probe || probe.width !== w || probe.height !== h) {
      if (probe) probe.dispose();
      probe = new THREE.WebGLRenderTarget(w, h);
      /* The canvas is sRGB-encoded; a render target is linear unless told
       * otherwise, and classifying linear values against an sRGB rule would
       * report a completely different picture from the one on screen. */
      probe.texture.colorSpace = THREE.SRGBColorSpace;
      probeBuffer = new Uint8Array(w * h * 4);
    }

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(probe);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(probe, 0, 0, w, h, probeBuffer);
    renderer.setRenderTarget(previous);

    let warm = 0;
    let lit = 0;
    for (let i = 0; i < probeBuffer.length; i += 4) {
      const r = probeBuffer[i] / 255;
      const g = probeBuffer[i + 1] / 255;
      const b = probeBuffer[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      if (l > 0.14) lit++;
      if (max === min) continue;
      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      let hue;
      if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue >= 15 && hue <= 70 && s > 0.16 && l > 0.18) warm++;
    }

    const total = w * h;
    const state = LIGHTING_STATES[currentId || targetId || 'unknown'];
    lastMeasurement = {
      state: currentId || targetId,
      samples: total,
      warm,
      warmFraction: warm / total,
      litFraction: lit / total,
      budget: state.warmBudget,
      withinBudget: warm / total <= state.warmBudget,
      method: 'offscreen ' + w + 'x' + h + ' readback, HSL hue 15-70, s>0.16, l>0.18'
    };

    /*
     * The style law, said out loud when it is broken. A warning rather than a
     * throw: an over-lit frame is a thing to fix in the table, not a reason to
     * take the player's game away.
     */
    if (!lastMeasurement.withinBudget) {
      console.warn(
        `[lighting] ${lastMeasurement.state} is ${(lastMeasurement.warmFraction * 100).toFixed(1)}% ` +
        `warm pixels against a declared budget of ${(state.warmBudget * 100).toFixed(0)}% — ` +
        'STYLE_BIBLE: warm light is information, and a night frame over ~10% has lost the language.'
      );
    }
    return lastMeasurement;
  }

  return {
    setState,
    update,
    measure,
    /** The state on screen right now — the target only once the fade lands. */
    get state() { return currentId; },
    get target() { return targetId; },
    get arrived() { return arrived; },
    get lastMeasurement() { return lastMeasurement; },
    /** For a readback: the live numbers, not the ones in the table. */
    snapshot() {
      return {
        state: currentId,
        target: targetId,
        arrived,
        label: (LIGHTING_STATES[targetId] || LIGHTING_STATES.unknown).label,
        hemi: {
          sky: '#' + live.hemiSky.getHexString(),
          ground: '#' + live.hemiGround.getHexString(),
          intensity: round(live.hemiIntensity)
        },
        sun: {
          color: '#' + live.sunColor.getHexString(),
          intensity: round(live.sunIntensity)
        },
        beam: {
          color: '#' + beam.color.getHexString(),
          intensity: round(live.beamIntensity),
          angle: round(live.beamAngle),
          at: { x: beam.target.position.x, y: beam.target.position.y, z: beam.target.position.z }
        },
        background: '#' + live.background.getHexString(),
        fog: { color: '#' + live.fog.getHexString(), near: round(live.fogNear), far: round(live.fogFar) },
        budget: (LIGHTING_STATES[targetId] || LIGHTING_STATES.unknown).warmBudget
      };
    },
    dispose() {
      if (probe) probe.dispose();
      probe = null;
      probeBuffer = null;
    }
  };
}

function round(n) { return Math.round(n * 1000) / 1000; }

/** Within `floor`, or within 1.5% of the target's own size — whichever is looser. */
function near(a, b, floor) {
  return Math.abs(a - b) <= Math.max(floor, Math.abs(b) * 0.015);
}
