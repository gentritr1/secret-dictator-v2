/*
 * The staging director: WHEN the five moments happen, and in what order.
 *
 * `design/handoff/floor-and-hud/Secret Dictator - Design Doc.dc.html` §3 ranks
 * five moments by how often they happen multiplied by how much they decide, and
 * says the honest thing about four of them: they are the trial beam pointed
 * somewhere new. This file is the schedule for all five. It owns no three.js
 * object, no DOM node and no sound — src/play/main.js reads these plans and
 * moves the rig. Keeping the schedule separate from the machinery is what makes
 * "nothing appears later than 700 ms" a number a test can assert rather than a
 * claim about a diff.
 *
 * THE SIGNATURE IS THE TRUST BOUNDARY, exactly as src/play/lighting.js and
 * src/play/objective.js
 * ---------------------------------------------------------------------------
 * Every function here takes the PLAYER-SAFE view (and, where a moment has a
 * clock, the page's own presentation clock) and nothing else. It may not read
 * the driver's stream and it may not read the game.
 *
 * That boundary is sharper for staging than it was for the ambience, because a
 * camera move is a channel too. "The push-in is 40 ms slower when the accuser is
 * a Rebel" is invisible in a diff, invisible in a screenshot, and a solve of the
 * game to anybody who notices — which is precisely why test/tell.test.js was
 * written with a row per channel and why this gate adds four more rows to it
 * (framing, stagger, silence, curtain).
 *
 * The whitelist this file adds to the ambience's, and it is the whole of it:
 *
 *   view.you.id             your own seat
 *   view.players            id / seat / alive / isYou — the roster the square
 *                           can see, used for seat ORDER and for who is still
 *                           standing. Never a role: there is none in it.
 *   view.lastVote.aye       announced when the ballots were opened
 *   view.lastVote.nay
 *   view.reform             the board, announced
 *   view.seize
 *   view.reveal             NULL until game over, and the engine's own
 *                           disclosure at it (src/engine/view.js). The curtain
 *                           call is the one moment role identity is allowed on
 *                           screen, and `reveal` is the one path it comes down.
 *
 * `curtainFor` is the only function here that can see a role, it can only see
 * one at game over, and it returns an EMPTY plan whenever `view.reveal` is null.
 * That is asserted under role permutation rather than argued.
 *
 * Nothing here draws a random number, from any source. Same rule as
 * src/play/pace.js and src/play/lighting.js: the engine's seeded stream belongs
 * to the engine, and src/play/ contains no unseeded randomness at all. Where a
 * moment needs a per-match variation it takes it from `salted()` below, which is
 * this file's own mulberry32 on its own salt.
 */

/* ------------------------------------------------- 1. the accusation at you */

/**
 * THE ACCUSATION AIMED AT YOU — the design doc's rank 1, and the moment the
 * discussion layer has to sell.
 *
 * The doc gives the vocabulary ("the lighting director already owns it"): the
 * speaker's lantern warms, a second and COOLER rim falls on your figure, and
 * everyone else stays cold — two lit people in a dark square is the grammar of
 * an accusation. Then a 6% push and a small yaw so both of you are in frame,
 * over 400 ms, eased. Your figure turns to face the speaker without your input.
 * The murmur bed lifts and drops out under the bubble. The objective line
 * swaps.
 *
 * THE ORDER IS THE DESIGN, and the brief pins it: the bed cuts to silence
 * FIRST. The square going quiet is the pressure; if it arrived after the light
 * it would read as a consequence of the light rather than as the cause of the
 * attention. Everything else is stacked so that the LAST thing to arrive lands
 * at `ACCUSE.last`, which the brief caps at 700 ms and test/stage.test.js
 * asserts.
 *
 * All offsets are milliseconds from the trigger.
 */
export const ACCUSE = {
  /** The bed cuts — not fades. First, and at zero. */
  hush: 0,
  /** How long the square stays under the cut before the bed is given back. */
  hushMs: 2600,
  /** The accuser's lantern lifts, and every other lantern pulls back. */
  lantern: 60,
  /** How much brighter the accuser's own lantern burns. */
  lanternLift: 1.35,
  /**
   * How far every OTHER lantern pulls back.
   *
   * The lift and the pull are one gesture, and the pull is the half that keeps
   * the warm budget honest: the square at the branch point measured 8.08% warm
   * against a 10% ceiling (docs/step-14.md), so a moment that only ADDED a warm
   * pool would have spent most of the remaining 1.9 points on the most frequent
   * beat in the game. Four lanterns at 0.55 against one at 1.35 is a net
   * REDUCTION in lit lantern-warm, which is also the right picture: "everyone
   * else stays cold" is a statement about the rest of the square going dark.
   */
  lanternPull: 0.55,
  /** A cooler rim finds your figure. */
  rim: 140,
  /**
   * The rim's colour, and it is deliberately NOT in the amber family.
   *
   * The doc calls it a "cool warm rim", and the reading that matters is the
   * first word: hue 218 degrees, outside the 15-70 the style bible's warm
   * classifier counts, so the second lit figure in the frame costs nothing
   * against the budget. It is also the correct picture — the accuser is lit by
   * the town, and you are lit by being looked at.
   */
  rimColor: 0x9db6e0,
  /*
   * MEASURED AGAINST THE PICTURE, not chosen.
   *
   * The first value was 5.2, which is roughly what a lantern burns at — and at
   * a lantern's brightness, from a metre away with a physical falloff, the
   * second figure in the frame stayed a silhouette. "Two lit people in a dark
   * square is the grammar of an accusation" is the whole of this moment, and a
   * rim nobody can see is the moment not happening. 14 is what made the player's
   * own figure read as LIT against the trial's dark in the acceptance frame
   * (design/reviews/gate-14-juice/01b-accusation-staged.png).
   *
   * WHAT IT COSTS, corrected by the measurement rather than argued from the
   * hue. At 5.2 the staged frame measured 0.15 points COLDER than the frame
   * before it, and the obvious conclusion — a cool light cannot spend a warm
   * budget — is wrong. At 14 the same comparison is +0.10: hue 218 means the
   * rim's own pixels are not counted, but the light still lifts the painted
   * TIMBER it lands on over the classifier's saturation and lightness floors,
   * and timber is amber. It is a tenth of a point on a frame with 1.6 points of
   * margin, and the composited trial frame is 8.43% against a ceiling of 10 —
   * so it is affordable, and it is affordable as a fact rather than as a
   * property of the colour wheel.
   */
  rimIntensity: 14,
  /*
   * Short, and it is the number that keeps this a RIM rather than a second
   * stage light. From a source at head height a metre in front of the figure,
   * 3.4 m reaches the figure and the ground it is standing on, and stops well
   * short of the dais pool — so the frame has two lit people in it and not two
   * competing light stories, which the style bible bans.
   */
  rimDistance: 3.4,
  /* How far toward the accuser the source sits, in metres, and how high. A rim
   * comes from a direction: the light says who is talking to you as well as
   * that somebody is. */
  rimOffset: 1.05,
  rimHeight: 1.72,
  /** Your figure begins turning to face the accuser. You do not steer it. */
  turn: 200,
  turnMs: 420,
  /** The camera push begins. */
  camera: 220,
  cameraMs: 400,
  /** 6% closer, per the doc. A push, not a cut — there is never a cut. */
  push: 0.06,
  /** …and a small yaw, so both of you are in frame. Radians, signed by side. */
  yaw: 0.16,
  /** The bubble. */
  bubble: 300,
  /** The objective line swaps. */
  objective: 380,
  /**
   * THE TRAY'S CENTRE BECOMES THE INTENT STRIP — and this is the last thing
   * that ever arrives. The brief's own rule under the schedule is "nothing
   * else appears, ever. If it is not here by 700 ms it is not coming", so the
   * strip lands exactly ON the cap rather than near it.
   *
   * It is a CHANGE OF CONTENTS in an element that has been at the bottom of
   * the screen all match, which is why it can arrive this fast without
   * startling — a new panel at 700 ms would be a jump scare.
   */
  strip: 700,
  /** …rising 44 px into place over 140 ms, eased out. Both from the brief. */
  stripMs: 140,
  stripRise: 44,
  /** How long the whole staging holds before the square is given back. */
  holdMs: 5200
};

/**
 * The last thing the accusation puts on screen, in ms. The brief caps it at 700
 * and the strip now sits on the cap, so this is the strip.
 *
 * Written as a maximum over the schedule rather than as "the one I believe is
 * last", for the reason test/stage.test.js gives: the failure mode is somebody
 * adding a beat at 900 ms and every assertion still passing because it was
 * written against `camera`.
 */
export const ACCUSE_LAST_MS = Math.max(
  ACCUSE.camera + ACCUSE.cameraMs, ACCUSE.objective, ACCUSE.bubble, ACCUSE.strip
);

/* ------------------------------------------------------------ the oil line */

/**
 * THE OIL LINE: a 2px brass rule under the tray, burning down over ~12 s.
 *
 * "It does not flash, pulse, or change colour. The pressure is carried by sound
 * instead: over the last three seconds the crowd murmur fades out, so the
 * square goes quiet around you." So there is exactly one number that moves here
 * — a width — and everything else about the rule is constant. The fade is
 * `HUSH.floor` in src/play/audio.js and is the only other thing this moment
 * does.
 *
 * AND THE LINE THAT IS DRAWN ONCE AND HELD EVERYWHERE: this is the only clock
 * in the game, and it is not on a rules decision. Nominate, vote, draft, aim a
 * power — all of them halt for ever, exactly as they always have. The floor is
 * not a rules decision; running out of it is an ANSWER (`SILENCE, explicit:
 * false`) and the record knows the difference between that and pressing the
 * silence key.
 */
export const OIL = {
  /** How long the beat lasts, at 1x, in ms. */
  burnMs: 12000,
  /** The murmur begins fading this long before the end. */
  fadeMs: 3000,
  /** The rule's height in px. Two, and it never changes. */
  height: 2
};

/**
 * How much of the oil line is left, as a fraction from 1 (full) to 0 (out).
 *
 * A pure function of ELAPSED time rather than of a deadline, because the beat
 * only burns while it is genuinely yours: the page stops feeding it while a
 * panel is open, while the ledger is pinned, and while the rules are waiting on
 * you for something else. A deadline would keep running through all three and
 * would put a clock on a rules decision by the back door.
 *
 * @param {number} burned  ms the beat has actually been the player's
 * @param {boolean} waits  the "floor waits for you" setting
 */
export function oilAt(burned, waits) {
  if (waits) return 1;
  const left = 1 - (burned || 0) / OIL.burnMs;
  return left < 0 ? 0 : left > 1 ? 1 : left;
}

/** Is the square about to go quiet around you? Never true when it waits. */
export function oilFading(burned, waits) {
  if (waits) return false;
  return (burned || 0) >= OIL.burnMs - OIL.fadeMs;
}

/** Has the beat run out? Never, with "the floor waits for you" on. */
export function oilSpent(burned, waits) {
  return !waits && (burned || 0) >= OIL.burnMs;
}

/**
 * Who is naming you, out of the floor lines that are about to be spoken.
 *
 * `lines` are the bubbles src/play/floor-voice.js has already selected and
 * timed — each carries the seat speaking and the seat the utterance publicly
 * named. Both are public: the bubble says the target's name out loud, in the
 * middle of the square, in front of everybody.
 *
 * Returns null when nothing is aimed at this seat, which is the ordinary case.
 *
 * THE HONEST GAP, stated here rather than found later: `src/engine/orator.js`
 * excludes the human seat from every target pool ("in D2 the player has no
 * voice yet… being accused with no way to answer is worse than not being
 * accused"), so in a shipped match this returns null every time. That exclusion
 * is a design decision tied to the intent strip, which is work item 4 and is not
 * this gate. The staging is built, tested and reachable; what is missing is the
 * accusation, and it is one boolean in a file this gate is not allowed to touch.
 * `__play.accuseMe()` drives the same path for a review.
 */
export function accusationFrom(lines, youSeat) {
  if (!lines || youSeat === null || youSeat === undefined) return null;
  for (const line of lines) {
    if (!line || line.target !== youSeat) continue;
    if (line.playerId === youSeat) continue;   // you cannot name yourself
    return { from: line.playerId, at: line.at || 0, until: line.until || 0, id: line.id || null };
  }
  return null;
}

/**
 * The accusation's schedule, in absolute page time.
 *
 * @param {number} now      when the trigger fired, on the page's own clock
 * @param {boolean} reduced honour reduced motion
 *
 * REDUCED MOTION, and the one rule that is not "turn everything off": the
 * FRAMING snaps and the LIGHT keeps its crossfade. Light is information here —
 * which two people are lit is the entire content of the moment — and
 * information should not snap, because a snap is a thing that can be missed
 * between two frames. Motion is not information, so motion goes.
 */
export function accusationPlan(now, reduced) {
  const t = (ms) => now + ms;
  return {
    reduced: !!reduced,
    hushAt: t(ACCUSE.hush),
    hushMs: ACCUSE.hushMs,
    lanternAt: t(ACCUSE.lantern),
    rimAt: t(ACCUSE.rim),
    turnAt: t(reduced ? ACCUSE.turn : ACCUSE.turn),
    turnMs: reduced ? 0 : ACCUSE.turnMs,
    cameraAt: t(ACCUSE.camera),
    cameraMs: reduced ? 0 : ACCUSE.cameraMs,
    bubbleAt: t(ACCUSE.bubble),
    objectiveAt: t(ACCUSE.objective),
    /* The strip rises into the tray. Reduced motion removes the RISE, not the
     * arrival: the contents still change at 700 ms, they simply do not travel
     * 44 px to get there. */
    stripAt: t(ACCUSE.strip),
    stripMs: reduced ? 0 : ACCUSE.stripMs,
    /* The last thing to arrive, absolute. Reduced motion can only make this
     * earlier, never later — asserted. */
    lastAt: t(reduced
      ? Math.max(ACCUSE.objective, ACCUSE.camera, ACCUSE.strip)
      : ACCUSE_LAST_MS),
    endsAt: t(ACCUSE.holdMs)
  };
}

/* --------------------------------------------------- 2. the ballot reveal */

/**
 * THE BALLOT REVEAL — the design doc's rank 2.
 *
 * "Ballots land on the lectern one at a time, seat order, 180 ms apart… and the
 * running count reads beside them." The acceptance criterion is the one worth
 * quoting, because it is what the stagger is FOR: *a viewer with the sound off
 * knows the result before the count finishes.* A number that appears is a fact
 * you are told. A number that accumulates is a fact you watch happen, and by the
 * fourth of seven ballots you already know.
 *
 * Today the whole election resolves inside one `Driver.step` and the pace layer
 * holds a beat so the light does not spoil it (docs/step-05.md). This spends
 * that beat properly.
 */
export const BALLOT = {
  /** Before the first ballot lands, so the stagger is not on top of the beat. */
  lead: 120,
  /** The gap between one ballot and the next. The doc's number. */
  stagger: 180,
  /** How long the running count stays after the last one lands. */
  linger: 1400
};

/**
 * Which ballot lands when, and what the count reads as each one does.
 *
 * SEAT ORDER, and it is the only order it could be: the seat numbers are stamped
 * on the nameplates, the tray and the ledger (src/play/seat.js), and a reveal
 * ordered by anything else — by who voted Aye, by who is alive, by the order the
 * engine happened to write the tally in — would be a second ordering the player
 * has to learn, and a channel that could correlate with something.
 *
 * A seat that did not vote is not in the plan at all rather than in it with a
 * blank: the dead do not vote, and a slot that lands empty reads as a bug.
 *
 * @param {object} view  the player-safe projection; `lastVote` and `players`
 * @returns {{steps: Array, total: number, aye: number, nay: number,
 *            lastAt: number, endsAt: number}} offsets in ms from the trigger
 */
export function ballotPlanFor(view) {
  const empty = { steps: [], total: 0, aye: 0, nay: 0, lastAt: 0, endsAt: 0 };
  if (!view || !view.lastVote) return empty;
  const aye = view.lastVote.aye || [];
  const nay = view.lastVote.nay || [];
  const cast = {};
  for (const id of aye) cast[id] = 'aye';
  for (const id of nay) cast[id] = 'nay';

  const steps = [];
  let a = 0;
  let n = 0;
  /*
   * `view.players` is already in seat order — src/engine/view.js maps
   * `G.players`, and src/play/square.js seats them by the same index. Sorted by
   * `seat` anyway, because "already in order" is the sort of thing that stays
   * true until it does not.
   *
   * Copied with a loop rather than with `.slice()`, and that is not style: the
   * anti-tell gate drives this whole file through a recording Proxy and fails on
   * any read outside a declared list of PUBLIC PATHS. `view.players.slice()`
   * records a read of `players.slice`, so a method name would have to be
   * whitelisted beside the fields — which makes the list about JavaScript rather
   * than about what the square is allowed to know, and buries the one line that
   * would matter if it ever appeared.
   */
  const roster = [];
  for (const p of view.players) roster.push(p);
  roster.sort((p, q) => p.seat - q.seat);
  for (const p of roster) {
    const vote = cast[p.id];
    if (!vote) continue;
    if (vote === 'aye') a++; else n++;
    steps.push({
      id: p.id,
      seat: p.seat,
      vote,
      at: BALLOT.lead + steps.length * BALLOT.stagger,
      aye: a,
      nay: n
    });
  }
  const lastAt = steps.length ? steps[steps.length - 1].at : 0;
  return {
    steps,
    total: steps.length,
    aye: a,
    nay: n,
    lastAt,
    endsAt: lastAt + BALLOT.linger
  };
}

/**
 * The count as it reads while the ballots are still landing.
 *
 * @param {object} plan  from ballotPlanFor
 * @param {number} elapsed  ms since the reveal began
 */
export function ballotCountAt(plan, elapsed) {
  let aye = 0;
  let nay = 0;
  let landed = 0;
  if (plan) {
    for (const step of plan.steps) {
      if (elapsed < step.at) break;
      aye = step.aye;
      nay = step.nay;
      landed++;
    }
  }
  return { aye, nay, landed, of: plan ? plan.total : 0, done: !!plan && landed >= plan.total };
}

/* ------------------------------------------------------ 3. the tile enacted */

/**
 * THE TILE ENACTED — the design doc's rank 3, "low effort, high return".
 *
 * "The Deputy's figure walks the tile to the board and sets it in a slot: a
 * physical thump, the empty slots still visible beside it." The weather half of
 * this item — every Seize permanently extinguishing a street lantern — shipped
 * in docs/step-13.md. What was missing is the MOMENT: the tile is announced by a
 * red flash in the sky and the board's numbers change, and nothing physical ever
 * happens.
 *
 * So the tile travels. Restrained, and that is the whole brief for it: an
 * ease-out over 520 ms and then 2 cm of settle, no arc, no spin, no particles.
 * The weight is in the deceleration and in the fact that it stops dead.
 */
export const TILE = {
  /** How high above the lectern the tile starts. */
  rise: 0.55,
  travelMs: 520,
  /** The settle: the last 2 cm, after the travel has stopped. */
  settleMs: 110,
  settleDrop: 0.022,
  /** The board's slot pitch and where the row sits, in metres. */
  slot: { pitch: 0.30, y: 0.62, z: -1.62, rowGap: 0.34 }
};

/**
 * Where this tile is going, and how long it takes to get there.
 *
 * The slot index is the board's own count AFTER the enactment, minus one —
 * `view.reform` and `view.seize` are both public and both already on the
 * ambience's whitelist, and they are what the board on the tray is drawn from,
 * so the slot a tile lands in cannot disagree with the number beside it.
 */
export function tilePlanFor(view, tile) {
  if (!view || (tile !== 'reform' && tile !== 'seize')) return null;
  const count = (tile === 'reform' ? view.reform : view.seize) || 0;
  const of = tile === 'reform'
    ? (view.limits ? view.limits.reformToWin : 5)
    : (view.limits ? view.limits.seizeToWin : 6);
  if (count < 1) return null;
  return {
    tile,
    index: count - 1,
    count,
    of,
    travelMs: TILE.travelMs,
    settleMs: TILE.settleMs,
    endsAt: TILE.travelMs + TILE.settleMs
  };
}

/**
 * The travelled fraction, eased.
 *
 * A cubic ease-OUT and nothing else: it leaves fast and arrives slowly, which
 * is what a heavy thing set down by a hand does. An ease-in-out would read as a
 * UI transition, and a linear travel reads as a sprite.
 */
export function tileEase(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - x, 3);
}

/* ------------------------------------------------------------- 4. the purge */

/**
 * THE PURGE — the design doc's rank 4, and the one built entirely out of taking
 * things away.
 *
 * "The beam narrows onto the named citizen until it is the only light in the
 * square. Total silence for 800 ms — the bed cuts, not fades. One gavel. The
 * figure topples by its own depth, which the cast already supports… Nothing
 * else: no particles, no shake, no red. The restraint is what makes it land, and
 * it is what stops the game reading as arcade."
 *
 * The topple shipped in Gate 2 (src/play/main.js, `toppleLift` off the asset).
 * This is the framing and the silence around it.
 */
export const PURGE = {
  /** How long the beam takes to travel off the dais and onto the citizen. */
  narrowMs: 620,
  /** How tight it gets. The trial's cone is 0.34; this is a third of it. */
  angle: 0.11,
  /** How high above the citizen the beam hangs while it is on them. */
  height: 6.2,
  /** TOTAL silence — the master cuts, it does not fade. The doc's number. */
  silenceMs: 800,
  /** One gavel, when the silence ends. Nothing else, at any point. */
  gavelAt: 800,
  /** How long the square is held on them before the beam goes back. */
  holdMs: 2400
};

/**
 * Who has just been purged, in public terms only.
 *
 * A seat that was alive in the previous projection and is not alive in this one.
 * That is the whole of it, and it is the same shape as `publicEdges` in
 * src/play/lighting.js: derived from two player-safe views rather than
 * subscribed to anything. Whether somebody is standing is the most public fact
 * in the square.
 *
 * Returns the seat id, or null. Only ever one: the rules purge one citizen at a
 * time, and if that ever stops being true the first one is the one the beam
 * finds — a plan that tried to light two people would light neither.
 */
export function purgeFor(prev, next) {
  if (!prev || !next || !prev.players || !next.players) return null;
  const was = {};
  for (const p of prev.players) was[p.id] = p.alive;
  for (const p of next.players) {
    if (was[p.id] === true && p.alive === false) return p.id;
  }
  return null;
}

/** The purge's schedule, absolute. Reduced motion snaps the beam, not the silence. */
export function purgePlan(now, reduced) {
  const t = (ms) => now + ms;
  return {
    reduced: !!reduced,
    narrowAt: now,
    narrowMs: reduced ? 0 : PURGE.narrowMs,
    silenceFrom: now,
    silenceMs: PURGE.silenceMs,
    gavelAt: t(PURGE.gavelAt),
    endsAt: t(PURGE.gavelAt + PURGE.holdMs)
  };
}

/* -------------------------------------------------------- 5. the curtain call */

/**
 * THE REVEAL AT GAME OVER — the design doc's rank 5, staged as theatre rather
 * than as a results table.
 *
 * "Each figure turns to camera in seat order, 250 ms apart, and their role seal
 * presses onto their own nameplate where it stays. The Dictator turns last and
 * is held for 1.2 s as the only warm thing in frame. The existing reveal table
 * then appears beneath it for anyone who wants to read it. Acceptance: the
 * player can name the Dictator without reading a word."
 *
 * THE ONE PLACE ROLE COLOUR IS ALLOWED. Every other surface in this project
 * spends its palette rules avoiding a channel that could correlate with
 * allegiance — the nameplate marks are brass or dim and never coloured, the
 * ledger is swept for role classes, the tray has no team token. At game over the
 * engine discloses everything (`SD.fullReveal`, projected as `view.reveal`), and
 * this is the moment that disclosure is allowed to be a picture.
 *
 * THE STRUCTURAL GUARANTEE, and it is why this function is shaped the way it is:
 * `view.reveal` is null in every projection before game over, so the plan is
 * EMPTY at every other moment of the match, whatever the roles behind it happen
 * to be. There is no branch below that can produce a step without it. That is
 * asserted under hidden-role permutation in test/tell.test.js rather than argued
 * here — a curtain call that leaked one step early would be the largest tell the
 * game could possibly have.
 */
export const CURTAIN = {
  /** Between one figure turning and the next. The doc's number. */
  step: 250,
  /** How long one figure takes to turn to camera. */
  turnMs: 380,
  /** How long after a figure turns before its seal presses onto the plate. */
  sealAt: 160,
  /** The Dictator is held, alone and warm, for this long. */
  dictatorHold: 1200,
  /** …and then the table the doc says comes "beneath it". */
  tableAfter: 300
};

/**
 * The curtain call, in order.
 *
 * Seat order, with the Dictator moved to the END — which is the one deviation
 * from seat order in the whole project and is exactly what the doc asks for.
 * Every other figure keeps its seat rank, so the sequence is still the ring the
 * player has been looking at all match, with one figure held back.
 *
 * @param {object} view  the player-safe projection
 * @returns {{steps: Array, dictator: number|null, lastAt: number,
 *            holdUntil: number, tableAt: number, of: number}}
 *          offsets in ms from the trigger. Empty before game over, always.
 */
export function curtainFor(view) {
  const empty = { steps: [], dictator: null, lastAt: 0, holdUntil: 0, tableAt: 0, of: 0 };
  if (!view || !view.reveal || !view.reveal.length) return empty;

  /* Copied with a loop, not `.slice()` — see ballotPlanFor for why the recording
   * Proxy makes that the difference between a whitelist about the game and a
   * whitelist about JavaScript. */
  const ranked = [];
  for (const r of view.reveal) ranked.push(r);
  ranked.sort((a, b) => a.id - b.id);
  const order = [];
  let dictator = null;
  for (const r of ranked) if (r.role !== 'dictator') order.push(r);
  for (const r of ranked) {
    if (r.role !== 'dictator') continue;
    if (dictator === null) dictator = r.id;
    order.push(r);
  }

  const steps = order.map((r, i) => ({
    id: r.id,
    role: r.role,
    team: r.team || null,
    alive: !!r.alive,
    last: i === order.length - 1,
    at: i * CURTAIN.step,
    sealAt: i * CURTAIN.step + CURTAIN.sealAt
  }));
  const lastAt = steps.length ? steps[steps.length - 1].at : 0;
  const holdUntil = lastAt + CURTAIN.turnMs + CURTAIN.dictatorHold;
  return {
    steps,
    dictator,
    of: steps.length,
    lastAt,
    holdUntil,
    tableAt: holdUntil + CURTAIN.tableAfter
  };
}

/* ------------------------------------------------------------- the small print */

/**
 * This file's own generator, for the same reason src/play/pace.js,
 * src/play/murmur.js and src/play/floor-voice.js each have one: a fourth salt on
 * the same mulberry32, so a draw taken here cannot be a draw taken there even by
 * accident, and a replayed seed stages identically.
 *
 * Nothing in the five moments uses it today — every timing above is a declared
 * constant, because a staged beat that varied would be a beat the player cannot
 * learn. It is here so that the FIRST piece of presentation variation somebody
 * adds has an obvious place to come from that is not the platform's generator.
 */
export function salted(seed) {
  let s = ((seed >>> 0) ^ 0x27d4eb2f) >>> 0;
  if (s === 0) s = 0x165667b1;
  return function nextUnit() {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Does this machine want less motion?
 *
 * Two sources, either of which is a yes: the operating system's own
 * `prefers-reduced-motion`, and the page's own setting — because a player who
 * wants the camera to stop moving in THIS game should not have to change a
 * system preference to say so.
 */
export function prefersReducedMotion(win, setting) {
  if (setting === true) return true;
  if (setting === false) return false;
  if (!win || !win.matchMedia) return false;
  const q = win.matchMedia('(prefers-reduced-motion: reduce)');
  return !!(q && q.matches);
}
