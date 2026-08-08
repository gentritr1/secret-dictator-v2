/*
 * The match runner: owns the game object, the bot minds and the event log, and
 * decides WHEN a step happens. It never decides what a step does — that is
 * driver.step, shared byte for byte with the headless parity script.
 *
 * The separation that matters here:
 *
 *   match loop   a setTimeout chain. One driver.step per tick. The interval is
 *                whatever the speed control says.
 *   render loop  requestAnimationFrame in main.js. Draws the current state as
 *                often as the display allows.
 *
 * They are deliberately not the same loop. If steps were taken per frame, the
 * frame rate would become an input to the game: a slow machine, a background
 * tab, or a different refresh rate would produce a different number of steps in
 * the same wall-clock time — and, because the app can be fast-forwarded, a
 * different *point in the match* for the same seed. Keeping them apart is what
 * makes "the timer changes when, never what" true rather than aspirational.
 *
 * Restarting with a seed rebuilds the game from that seed alone, so the same
 * seed always replays the same match no matter what the speed control did.
 */
import { SD, AI, Driver } from '../engine/index.js';

export const NAMES = ['Alice', 'Bo', 'Chen', 'Dara', 'Eze', 'Fin', 'Gita', 'Hale', 'Ivo', 'Juno'];

export const DEFAULT_SEED = 1000;
export const DEFAULT_PLAYERS = 7;

/** Base milliseconds between steps at 1x. */
const BASE_INTERVAL = 850;

export class Match {
  constructor(onStep) {
    /** called after every step (and after a restart, with a null event) */
    this.onStep = onStep;
    this.speed = 1;
    this.playing = false;
    this._timer = null;
    this.seed = DEFAULT_SEED;
    this.playerCount = DEFAULT_PLAYERS;
    this.G = null;
    this.minds = null;
    this.events = [];
    this.steps = 0;
  }

  /* ------------------------------------------------------------- lifecycle */

  /**
   * Throw the current match away and deal a new one.
   * @param {number} seed        uint32; the whole match is a function of this
   * @param {number} playerCount 5..10
   */
  restart(seed, playerCount) {
    this.pause();
    this.seed = (seed >>> 0) || DEFAULT_SEED;
    this.playerCount = playerCount || this.playerCount;

    this.G = SD.createGame({
      names: NAMES.slice(0, this.playerCount),
      humanIndex: -1,            // bot-vs-bot: nobody is the human yet
      seed: this.seed
    });
    this.minds = AI.create(this.G);

    /* A fresh array per match, so two runs of the same seed can be compared
     * whole. Within a match it is only ever appended to. */
    this.events = [];
    this.steps = 0;

    this.onStep(this.G, null, 'restart');
    return this.G;
  }

  get over() {
    return !this.G || this.G.phase === SD.PHASE.GAME_OVER;
  }

  /* ------------------------------------------------------------------ step */

  /** Advance exactly one action. Returns the event, or null if already over. */
  step() {
    if (this.over) {
      this.pause();
      return null;
    }
    const ev = Driver.step(this.G, this.minds);
    if (!ev) {
      this.pause();
      return null;
    }
    ev.n = this.steps;
    this.steps++;
    this.events.push(ev);
    this.onStep(this.G, ev, 'step');
    if (this.over) this.pause();
    return ev;
  }

  /**
   * Fast-forward to the end without any waiting. Same calls in the same order
   * as stepping by hand — only the delay is skipped — so the resulting event
   * log is identical to the one a slow playthrough would produce. This is what
   * the determinism check drives.
   */
  runToEnd(cap = Driver.STEP_LIMIT) {
    this.pause();
    let guard = 0;
    while (!this.over && guard < cap) {
      const ev = Driver.step(this.G, this.minds);
      if (!ev) break;
      ev.n = this.steps;
      this.steps++;
      this.events.push(ev);
      guard++;
    }
    this.onStep(this.G, this.events[this.events.length - 1] || null, 'fastforward');
    return this.steps;
  }

  /* --------------------------------------------------------- the match loop */

  play() {
    if (this.playing || this.over) return;
    this.playing = true;
    this._schedule();
  }

  pause() {
    this.playing = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(mult) {
    this.speed = mult;
    /* Take effect on the next tick rather than mid-wait: rescheduling here
     * would let a speed change insert or skip a step. */
  }

  _schedule() {
    if (!this.playing) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this.playing) return;
      this.step();
      this._schedule();
    }, BASE_INTERVAL / this.speed);
  }
}
