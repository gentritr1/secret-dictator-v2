/*
 * Sound in three layers: a bed that never changes, a bed that follows the
 * square, and the moments.
 *
 *   1. TOWN     the constant layer. One low filtered breath plus a barely-there
 *               drone, at ONE gain for the whole match, never ramped and never
 *               keyed to anything. This is the room tone of an outdoor place:
 *               it is what makes the square feel like somewhere rather than
 *               like a renderer, and because it is constant it can carry no
 *               information at all. See TOWN below for what it revises.
 *   2. BED      the phase layer. Filtered wind, keyed to the LIGHTING STATE, so
 *               there is exactly one place in the project that decides what the
 *               square is doing. Silent by day — see BED.
 *   3. CUES     the moments. Five one-shots, fired off public edges. Unchanged
 *               by this gate; nothing new was invented, because "deliberate
 *               quiet is required" and a sixth sound with no moment to attach
 *               to would be filler.
 *
 * All three run through one master gain, so the volume slider and the mute
 * button own the whole square and not two thirds of it.
 *
 * THE SAME TRUST BOUNDARY AS THE LIGHT, and for a sharper reason
 * --------------------------------------------------------------
 * A sound is a tell. If the ambience could hear the driver's omniscient event
 * stream, "the lamp buzzes when the Speaker discards a Reform" is a complete
 * solve of the game delivered through the speakers, and it would never appear
 * in a diff as anything but an innocent-looking subscription. So nothing in
 * this file ever sees an event: it is handed the public edges computed by
 * src/play/lighting.js from two player-safe views, plus the key of a decision
 * THIS SEAT just answered — which is the player's own keystroke, not
 * information.
 *
 * Grepping this file for the driver's log accessor returns nothing, and that is
 * a gate: test/ambience.test.js reads the source and fails on the name.
 *
 * WHAT IS REUSED AND WHAT IS NOT
 * ------------------------------
 * v1 (`../secret-dictator/assets/sfx`) ships six Kenney UI Pack sounds, CC0.
 * Two of them fit and four do not, measured rather than guessed — the band
 * energy is in docs/step-07.md. `tap-a` and `tap-b` put 62% and 81% of their
 * energy below 200 Hz with a hard 10-14 ms attack: they are low wooden knocks,
 * which is exactly what a gavel and a seal are. `click-a`, `click-b`,
 * `switch-a` and `switch-b` put 85-91% of theirs above 800 Hz — bright digital
 * UI blips, the opposite register from a hand-carved town square. They are
 * skipped rather than repurposed. A bell, a tally and a wind bed have no
 * candidate in that library at all, so they are synthesised here.
 *
 * EVERY CUE HAS A SYNTHESISED FALLBACK, including the two that ship a file.
 * Same argument as src/play/assets.js: a missing asset is not a broken game.
 * A failed fetch produces one console warning and a WebAudio voice instead, so
 * the acceptance criterion "audible at the right moments" does not depend on
 * the network.
 *
 * AUTOPLAY. No AudioContext is constructed until the first real user gesture.
 * Cues that arrive before it are dropped, not queued — a queue means the first
 * click of the session fires four sounds at once, which is worse than silence.
 * Nothing here logs a warning on a normal load.
 *
 * No randomness: same rule as src/play/pace.js. The platform's unseeded
 * generator is not used anywhere below — the noise the bed and the strike
 * transients are made of comes from the project's own mulberry32, salted to its
 * own constant — so a replayed seed sounds exactly like the original.
 */

import { LIGHTING_IDS } from './lighting.js';

/* --------------------------------------------------------------- the cues */

/**
 * The five moments, and where each one's sound comes from.
 *
 * `url` null means "there is no sample for this, and there is no honest one to
 * borrow" — it is synthesised. `voice` is both the fallback for a sample that
 * fails to load and the primary for everything else.
 */
export const CUES = {
  /* Rung by the player, at the bell, to open the session. The one sound in the
   * game that is a ritual rather than a notification. */
  bell: { url: null, voice: 'bell', gain: 0.55 },
  /* Kenney UI Pack `tap-a`: a low knock. The nomination is made. */
  gavel: { url: '/assets/sfx/tap-a.ogg', voice: 'knock', gain: 0.85 },
  /* Kenney UI Pack `tap-b`: a duller, shorter thump, under a synthesised low
   * drop. Your own ballot going into the box. */
  seal: { url: '/assets/sfx/tap-b.ogg', voice: 'seal', gain: 0.7, layerVoice: true },
  /* The ballots are opened. Deliberately neutral about the outcome — the light
   * already says whether it carried, and two channels saying the same thing at
   * the same instant is one of them being decoration. */
  tally: { url: null, voice: 'tally', gain: 0.5 },
  'tile:reform': { url: null, voice: 'reform', gain: 0.5 },
  'tile:seize': { url: null, voice: 'seize', gain: 0.5 }
};

export const CUE_IDS = Object.keys(CUES);

/**
 * Which cues a moment fires. Pure, and the whole of the trigger logic.
 *
 * @param {{gavel: boolean, tally: boolean, sting: string|null}} edges
 *        from lighting.publicEdges(prevView, nextView) — public state only
 * @param {string|null} own  the key of the decision THIS seat just submitted,
 *        in src/play/pace.js `beatKey` form (`kind` or `kind:gate`). Your own
 *        keystroke; it tells you nothing you did not just do.
 * @returns {string[]} cue ids, in the order they should be fired
 */
export function cuesFor(edges, own) {
  const out = [];
  if (own === 'acknowledge:morning') out.push('bell');
  if (own === 'vote') out.push('seal');
  if (edges) {
    if (edges.gavel) out.push('gavel');
    if (edges.tally) out.push('tally');
    if (edges.sting === 'reform' || edges.sting === 'seize') out.push('tile:' + edges.sting);
  }
  return out;
}

/* ------------------------------------------------------- 1. the constant */

/**
 * The town: the layer that never changes.
 *
 * A very low-passed breath of noise with a faint 62 Hz drone under it, at a
 * fixed gain from the moment the audio starts until the tab closes. It is not
 * keyed to the phase, the state, the weather or anything else — which is the
 * point twice over. Musically it is what stops the day from sounding like a
 * muted renderer; structurally, a layer that is constant is a layer that
 * cannot be a tell, and it is the only part of the ambience about which that
 * is true by construction rather than by argument.
 *
 * WHAT THIS REVISES, said out loud because it was a decided thing.
 * docs/step-07.md chose total silence in daylight, on the reasoning that "the
 * first time the square makes a sound of its own is the first vote". That
 * reasoning survives at the level it was about — the WIND still starts at dusk
 * and the day still has no weather in it (`BED.day.gain` is still exactly 0,
 * and the gate that asserts it is untouched) — but the day is no longer
 * digital silence, because the original design asks for a constant bed and a
 * room tone that switches off in the morning is not one.
 *
 * It is one constant. Setting `gain: 0` here restores the shipped behaviour
 * exactly, and nothing else in the file has to change.
 */
export const TOWN = { gain: 0.014, cutoff: 190, drone: 62, droneGain: 0.006 };

/* ------------------------------------------------------ 2. the phase layer */

/**
 * The ambient bed, one entry per lighting state.
 *
 * It is filtered noise and nothing else: a low wind that gets closer and
 * darker as the square does. `gain: 0` is a real answer and it is the answer
 * for daylight — the brief offered "day birds", there is no bird recording in
 * this project or in v1's library, and a synthesised bird is filler. Silence in
 * the day also buys the night bed its whole effect: the first time the square
 * makes a sound of its own is the first vote.
 *
 * Keyed by lighting state rather than by phase so there is exactly one place
 * that decides what the square is doing — test/ambience.test.js requires an
 * entry for every id in LIGHTING_IDS.
 */
export const BED = {
  day: { gain: 0.0, cutoff: 900 },
  dusk: { gain: 0.035, cutoff: 620 },
  trial: { gain: 0.075, cutoff: 380 },
  'result:passed': { gain: 0.055, cutoff: 460 },
  'result:failed': { gain: 0.085, cutoff: 330 },
  drafting: { gain: 0.065, cutoff: 360 },
  power: { gain: 0.08, cutoff: 340 },
  chaos: { gain: 0.11, cutoff: 300 },
  'enacted:reform': { gain: 0.04, cutoff: 700 },
  'enacted:seize': { gain: 0.09, cutoff: 420 },
  'victory:loyalist': { gain: 0.02, cutoff: 800 },
  'victory:rebel': { gain: 0.05, cutoff: 500 },
  unknown: { gain: 0.0, cutoff: 900 }
};

/** The bed for a lighting state, with the daylight answer as the fallback. */
export function bedFor(lightingId) {
  return BED[lightingId] || BED.day;
}

/* ------------------------------------------------------------- the engine */

const DEFAULT_VOLUME = 0.7;

/**
 * @param {object} [options] `{ context, fetchAudio, warn }` — all injectable so
 *        this file can be driven without a browser.
 */
export function createAudio(options = {}) {
  const warn = options.warn || ((m) => console.warn(m));
  const Ctx = options.Context ||
    (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));

  let ctx = null;
  let master = null;
  let bedGain = null;
  let bedFilter = null;
  let bedSource = null;
  let townGain = null;
  let townSource = null;
  let townDrone = null;
  let started = false;
  let muted = false;
  let volume = DEFAULT_VOLUME;
  let currentBed = 'day';

  const buffers = new Map();     // cue id -> AudioBuffer, once fetched
  const fired = [];              // a rolling log, for a scripted review
  let dropped = 0;               // cues that arrived before the first gesture

  /**
   * Start the audio, from inside a real user gesture and nowhere else.
   *
   * Returns false when there is no gesture yet or no WebAudio at all; every
   * caller treats that as "no sound this time", never as an error.
   */
  function start() {
    if (started) return true;
    if (!Ctx) return false;
    try {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
      buildTown();
      buildBed();
      started = true;
    } catch (error) {
      warn('[audio] no audio context (' + (error && error.message) + ') — the match is silent and playable.');
      return false;
    }
    /* Safari and Chrome both hand back a suspended context if the gesture was
     * not trusted. Resuming inside the same call is the supported path; a
     * rejection here is not an error worth printing. */
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(() => {});
    loadSamples();
    return true;
  }

  /*
   * Layer 1: the town, built once and never touched again.
   *
   * Four seconds rather than the bed's two, and filtered harder, so the two
   * loops do not share a period — a 2 s breath under a 2 s wind beats audibly
   * every two seconds, which is the one way a constant layer can draw attention
   * to itself. Its own salt, for the same reason pace.js has one: two streams
   * from one constant would make the town a delayed copy of the wind.
   *
   * There is no ramp anywhere in here on purpose. `setLighting` does not know
   * this node exists.
   */
  function buildTown() {
    if (TOWN.gain <= 0) return;
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let s = 0xc2b2ae35;
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const white = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
      low = low * 0.985 + white * 0.015;
      data[i] = low * 14;
    }
    const fade = Math.floor(ctx.sampleRate * 0.35);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = data[i] * k + data[data.length - fade + i] * (1 - k);
    }

    townSource = ctx.createBufferSource();
    townSource.buffer = buffer;
    townSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = TOWN.cutoff;
    filter.Q.value = 0.5;

    townGain = ctx.createGain();
    townGain.gain.value = TOWN.gain;
    townSource.connect(filter).connect(townGain).connect(master);
    townSource.start();

    /* The drone: one sine, far enough down that it is felt rather than heard.
     * It is what makes the layer read as a town rather than as tape hiss. */
    townDrone = ctx.createOscillator();
    const droneGain = ctx.createGain();
    townDrone.type = 'sine';
    townDrone.frequency.value = TOWN.drone;
    droneGain.gain.value = TOWN.droneGain;
    townDrone.connect(droneGain).connect(master);
    townDrone.start();
  }

  /* Layer 2. Two seconds of deterministic low noise, looped. Deterministic on purpose:
   * src/play/ contains no unseeded randomness at all — a gate this project has
   * relied on since Step 4 — and a bed built from the platform's generator
   * would be the first. This is the same mulberry32 shape the engine and
   * pace.js use, salted to its own constant. */
  function buildBed() {
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let s = 0x9e3779b9;
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      const white = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
      /* One-pole lowpass in the buffer itself, so the wind has body before the
       * filter node ever sees it. */
      low = low * 0.96 + white * 0.04;
      data[i] = low * 6;
    }
    /* Crossfade the loop seam, or the bed ticks once every two seconds. */
    const fade = Math.floor(ctx.sampleRate * 0.15);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = data[i] * k + data[data.length - fade + i] * (1 - k);
    }

    bedSource = ctx.createBufferSource();
    bedSource.buffer = buffer;
    bedSource.loop = true;

    bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = bedFor(currentBed).cutoff;
    bedFilter.Q.value = 0.7;

    bedGain = ctx.createGain();
    bedGain.gain.value = bedFor(currentBed).gain;

    bedSource.connect(bedFilter).connect(bedGain).connect(master);
    bedSource.start();
  }

  /** Fetch the sampled cues. A failure is one warning and a synthesised voice. */
  function loadSamples() {
    const fetchAudio = options.fetchAudio || defaultFetch;
    for (const id of CUE_IDS) {
      const cue = CUES[id];
      if (!cue.url) continue;
      fetchAudio(cue.url).then(
        (bytes) => ctx.decodeAudioData(bytes,
          (buffer) => buffers.set(id, buffer),
          () => warn(sampleWarning(id, cue, 'the bytes did not decode'))),
        (error) => warn(sampleWarning(id, cue, (error && error.message) || String(error)))
      );
    }
  }

  function defaultFetch(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
      return r.arrayBuffer();
    });
  }

  /* Says all three things, like the asset loader's: which cue, what went wrong,
   * and that the game still makes the sound. */
  function sampleWarning(id, cue, detail) {
    return `[audio] ${id} sample not loaded (${detail}) — ${cue.url} · ` +
      'the cue falls back to its synthesised voice and the match is audible.';
  }

  /* ------------------------------------------------------------- voices */

  function env(node, at, attack, hold, release, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack);
    g.setValueAtTime(Math.max(0.0001, peak), at + attack + hold);
    g.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  }

  function tone(type, freq, at, attack, hold, release, peak, dest) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    env(gain, at, attack, hold, release, peak);
    osc.connect(gain).connect(dest);
    osc.start(at);
    osc.stop(at + attack + hold + release + 0.05);
    return osc;
  }

  /**
   * The synthesised voices.
   *
   * These are not placeholders for samples that never arrived — a bell, a
   * two-note tally and the two tile stings have no candidate in any library
   * this project owns, and inventing them here is cheaper, smaller and more
   * controllable than sourcing five more files.
   */
  const VOICES = {
    /*
     * A town bell: a hum partial an octave down and four inharmonic upper
     * partials, each decaying faster than the one below it. Inharmonic is the
     * whole difference between a bell and an organ — a harmonic stack is a
     * note, and the ratios below are what make it a struck piece of metal.
     */
    bell(at, gain) {
      const f = 330;
      const partials = [
        [0.5, 0.30, 3.2],   // hum
        [1.0, 1.00, 2.6],   // prime
        [2.0, 0.55, 1.7],   // nominal
        [2.98, 0.32, 1.1],
        [4.16, 0.20, 0.7],
        [5.43, 0.12, 0.5]
      ];
      for (const [ratio, level, decay] of partials) {
        tone('sine', f * ratio, at, 0.006, 0.0, decay, gain * level, master);
      }
      /* The strike. Without it the bell fades in like a synthesiser pad. */
      noise(at, 0.055, gain * 0.35, 2600, 'bandpass');
    },

    /* The gavel's fallback: a low body under a short bright rap. */
    knock(at, gain) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, at);
      osc.frequency.exponentialRampToValueAtTime(72, at + 0.07);
      env(g, at, 0.002, 0.0, 0.13, gain);
      osc.connect(g).connect(master);
      osc.start(at); osc.stop(at + 0.2);
      noise(at, 0.018, gain * 0.5, 1800, 'bandpass');
    },

    /* The seal: a slow low press, no transient. Layered under tap-b when the
     * sample is there, alone when it is not. */
    seal(at, gain) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(96, at);
      osc.frequency.exponentialRampToValueAtTime(58, at + 0.28);
      env(g, at, 0.02, 0.05, 0.3, gain);
      osc.connect(g).connect(master);
      osc.start(at); osc.stop(at + 0.45);
    },

    /* Two low knocks and a fifth between them: the ballots being turned out on
     * the desk. Neutral about the result on purpose. */
    tally(at, gain) {
      tone('triangle', 196, at, 0.01, 0.05, 0.22, gain, master);
      tone('triangle', 294, at + 0.16, 0.01, 0.06, 0.32, gain * 0.9, master);
    },

    /* A Reform: a rising fifth, clean and cool. */
    reform(at, gain) {
      tone('sine', 262, at, 0.03, 0.10, 0.45, gain, master);
      tone('sine', 392, at + 0.11, 0.03, 0.14, 0.6, gain * 0.95, master);
      tone('sine', 523, at + 0.22, 0.03, 0.10, 0.7, gain * 0.5, master);
    },

    /* A Seize: a falling minor third over a detuned low pad. Darker, longer,
     * and the only voice in the game with a beat in it. */
    seize(at, gain) {
      tone('sawtooth', 110, at, 0.02, 0.20, 0.7, gain * 0.30, master);
      tone('sawtooth', 110.9, at, 0.02, 0.20, 0.7, gain * 0.30, master);
      tone('triangle', 233, at, 0.02, 0.12, 0.5, gain * 0.7, master);
      tone('triangle', 196, at + 0.18, 0.02, 0.18, 0.7, gain * 0.8, master);
    }
  };

  function noise(at, seconds, gain, freq, type) {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let s = 0x85ebca6b;
    for (let i = 0; i < frames; i++) {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      data[i] = ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1) * (1 - i / frames);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(master);
    src.start(at);
  }

  /* ---------------------------------------------------------------- api */

  /**
   * Fire one cue by id. Silent and harmless before the first user gesture.
   */
  function cue(id) {
    const spec = CUES[id];
    if (!spec) return false;
    if (!started) { dropped++; return false; }
    if (muted) return false;
    const at = ctx.currentTime + 0.005;

    const buffer = buffers.get(id);
    if (buffer) {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buffer;
      g.gain.value = spec.gain;
      src.connect(g).connect(master);
      src.start(at);
      /* Some cues are a sample AND a synthesised body — the seal is tap-b's
       * knock over a low press, which neither half is on its own. */
      if (spec.layerVoice && VOICES[spec.voice]) VOICES[spec.voice](at, spec.gain * 0.8);
    } else if (VOICES[spec.voice]) {
      VOICES[spec.voice](at, spec.gain);
    } else {
      return false;
    }

    fired.push({ id, at: Math.round(at * 1000) });
    if (fired.length > 64) fired.shift();
    return true;
  }

  /** Fire everything a moment produced, in order. */
  function fire(edges, own) {
    const ids = cuesFor(edges, own);
    for (const id of ids) cue(id);
    return ids;
  }

  /**
   * Follow the lighting state with the bed. Ramped over the same kind of time
   * the light takes, so the two arrive together rather than the sound snapping
   * ahead of the picture.
   */
  function setLighting(id) {
    currentBed = BED[id] ? id : 'day';
    if (!started) return currentBed;
    const spec = bedFor(currentBed);
    const now = ctx.currentTime;
    bedGain.gain.cancelScheduledValues(now);
    bedGain.gain.setValueAtTime(bedGain.gain.value, now);
    bedGain.gain.linearRampToValueAtTime(spec.gain, now + 2.4);
    bedFilter.frequency.cancelScheduledValues(now);
    bedFilter.frequency.setValueAtTime(bedFilter.frequency.value, now);
    bedFilter.frequency.linearRampToValueAtTime(spec.cutoff, now + 2.4);
    return currentBed;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (started && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    return volume;
  }

  function setMuted(on) {
    muted = !!on;
    if (started) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
    return muted;
  }

  return {
    start,
    cue,
    fire,
    setLighting,
    setVolume,
    setMuted,
    get started() { return started; },
    get muted() { return muted; },
    get volume() { return volume; },
    get bed() { return currentBed; },
    /* A scripted review needs to know a cue happened without hearing it. */
    get log() { return fired.slice(); },
    get droppedBeforeGesture() { return dropped; },
    get samplesLoaded() { return Array.from(buffers.keys()).sort(); },
    /* For a readback: what the page believes about its own sound. */
    report() {
      return {
        started, muted, volume,
        bed: currentBed,
        bedGain: bedFor(currentBed).gain,
        /* The three layers, named, so a scripted review can say which one it is
         * asking about. `town` is constant by contract — if this number ever
         * differs between two readings of the same session, that is a bug and
         * a potential tell. */
        layers: {
          town: { constant: true, gain: TOWN.gain, live: townGain ? townGain.gain.value : 0 },
          bed: { constant: false, gain: bedFor(currentBed).gain, cutoff: bedFor(currentBed).cutoff },
          cues: CUE_IDS.length
        },
        samples: Array.from(buffers.keys()).sort(),
        expectedSamples: CUE_IDS.filter((id) => CUES[id].url),
        droppedBeforeGesture: dropped,
        contextState: ctx ? ctx.state : 'none',
        recent: fired.slice(-8)
      };
    }
  };
}

/* A structural check, run at import: the bed must answer for every lighting
 * state this project can be in. A new state with no bed is silence by
 * accident, which is indistinguishable from silence on purpose. */
export const BED_COVERS_EVERY_STATE = LIGHTING_IDS.every((id) => !!BED[id]);
