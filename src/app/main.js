/*
 * Entry point: wires the match runner to the scene and to the debug overlay.
 *
 * The direction of flow is one-way and worth stating plainly, because it is the
 * whole point of this step:
 *
 *     engine (truth)  ->  driver.step  ->  event  ->  scene.apply / overlay
 *
 * Nothing on the presentation side writes to the game object, and nothing on
 * the presentation side asks the game a question it cannot answer by reading a
 * field. Above all, no code under src/app draws from the game's seeded random
 * stream — that stream belongs to the engine and the bots, and a single stray
 * draw from the UI would desynchronise every later decision from the same seed.
 * The check is a grep for a call to that generator across src/app: it must find
 * nothing, including in comments like this one.
 */
import { SD } from '../engine/index.js';
import { Match, DEFAULT_SEED, DEFAULT_PLAYERS } from './match.js';
import { Playground } from './scene.js';

const el = (id) => document.getElementById(id);

const stage = el('stage');
const view = new Playground(stage, el('labels'));

const readouts = {
  phase: el('r-phase'), day: el('r-day'), reform: el('r-reform'),
  seize: el('r-seize'), chaos: el('r-chaos'), step: el('r-step'),
  seed: el('r-seed'), speaker: el('r-speaker'), deputy: el('r-deputy')
};
const winnerEl = el('r-winner');
const logEl = el('log');
const playBtn = el('c-play');

const LOG_LIMIT = 400; // DOM rows only; match.events keeps everything

/* ------------------------------------------------------------------ view */

function nameOf(G, id) {
  return id == null ? '—' : G.players[id].name;
}

function paintReadout(G) {
  readouts.phase.textContent = G.phase;
  readouts.day.textContent = G.day;
  readouts.reform.textContent = G.reform + ' / ' + SD.REFORM_TO_WIN;
  readouts.seize.textContent = G.seize + ' / ' + SD.SEIZE_TO_WIN;
  readouts.chaos.textContent = G.chaos + ' / ' + SD.CHAOS_LIMIT;
  readouts.step.textContent = match.steps;
  readouts.seed.textContent = G.seed;
  readouts.speaker.textContent = nameOf(G, G.speaker);
  readouts.deputy.textContent = nameOf(G, G.deputy);

  if (G.winner) {
    winnerEl.textContent = G.winner.toUpperCase() + ' win — ' + G.winReason;
    winnerEl.classList.remove('hidden');
  } else {
    winnerEl.classList.add('hidden');
  }
  playBtn.textContent = match.playing ? 'Pause' : 'Play';
  playBtn.disabled = match.over;
  el('c-step').disabled = match.over;
  el('c-end').disabled = match.over;
}

function appendLogRow(ev) {
  const li = document.createElement('li');
  const n = document.createElement('span');
  n.className = 'n';
  n.textContent = String(ev.n).padStart(3, '0');
  const ph = document.createElement('span');
  ph.className = 'ph';
  ph.textContent = ev.action;
  li.append(n, ph, document.createTextNode(ev.text));
  if (ev.gameOver) li.classList.add('over');
  logEl.appendChild(li);
  while (logEl.childElementCount > LOG_LIMIT) logEl.removeChild(logEl.firstChild);
}

function repaintLog(events) {
  logEl.textContent = '';
  for (const ev of events.slice(-LOG_LIMIT)) appendLogRow(ev);
}

/* Called last, after the readout has been painted: showing the winner banner
 * grows the panel, and a scrollTop set before that reflow lands short. */
function scrollLogToEnd() {
  logEl.scrollTop = logEl.scrollHeight;
}

/* ----------------------------------------------------------------- match */

const match = new Match((G, ev, reason) => {
  if (reason === 'restart') {
    view.setRoster(G);
    logEl.textContent = '';
    /* A fresh array reference per match: two runs of the same seed are then
     * comparable whole (JSON.stringify(__eventLog) before and after). Within a
     * match it is only ever appended to. */
    window.__eventLog = match.events;
    window.__gameRef = G;
  } else if (reason === 'fastforward') {
    repaintLog(match.events);
  } else if (ev) {
    appendLogRow(ev);
  }
  view.apply(G, ev);
  paintReadout(G);
  scrollLogToEnd();
});

/* --------------------------------------------------------------- controls */

playBtn.addEventListener('click', () => {
  match.toggle();
  paintReadout(match.G);
});

el('c-step').addEventListener('click', () => {
  match.pause();
  match.step();
  paintReadout(match.G);
});

el('c-end').addEventListener('click', () => {
  match.runToEnd();
});

el('c-restart').addEventListener('click', () => {
  restartFromControls(match.seed);
});

el('c-seedgo').addEventListener('click', () => {
  const raw = parseInt(el('c-seed').value, 10);
  restartFromControls(Number.isFinite(raw) ? raw : DEFAULT_SEED);
});

el('c-speed').addEventListener('change', (e) => {
  match.setSpeed(parseFloat(e.target.value));
});

el('c-players').addEventListener('change', () => {
  restartFromControls(match.seed);
});

function restartFromControls(seed) {
  const count = parseInt(el('c-players').value, 10) || DEFAULT_PLAYERS;
  el('c-seed').value = String(seed);
  match.restart(seed, count);
}

/* ------------------------------------------------------- the render loop */

/*
 * Separate from the match loop on purpose. This runs as often as the display
 * allows and only draws; the match advances on its own timer in match.js. The
 * frame rate is therefore not an input to the game — a slow frame delays a
 * picture, never a decision.
 */
function frame(t) {
  view.render(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* --------------------------------------------------------- review tooling */

/*
 * Handles for driving the playground from the console or from an automated
 * check. `runToEnd` takes the same steps a timed playthrough would, with the
 * waiting removed, which is what makes the determinism check quick:
 *
 *   __sd.restart(1234); __sd.runToEnd(); const a = JSON.stringify(__eventLog);
 *   __sd.restart(1234); __sd.runToEnd(); const b = JSON.stringify(__eventLog);
 *   a === b   // must be true
 */
window.__sd = {
  match,
  view,
  play: () => match.play(),
  pause: () => match.pause(),
  step: () => match.step(),
  runToEnd: () => match.runToEnd(),
  restart: (seed = match.seed, players = match.playerCount) => {
    el('c-seed').value = String(seed);
    el('c-players').value = String(players);
    return match.restart(seed, players);
  },
  get seed() { return match.seed; },
  get steps() { return match.steps; },
  get phase() { return match.G.phase; }
};

match.restart(DEFAULT_SEED, DEFAULT_PLAYERS);
