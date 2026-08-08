/*
 * The debug overlay: live readout on the left, tuning sliders on the right.
 *
 * The sliders write straight into the same objects the controller and the
 * camera read every frame, so a change lands on the next substep with no
 * rebuild and no reload. That is the whole point of the step — feel is decided
 * by moving a slider and walking, not by editing a constant and refreshing.
 *
 * Every slider carries the unit and a one-line note in its title attribute,
 * because a number called "accel" is useless six weeks later.
 */

const F = (n, d = 2) => (n === undefined || n === null || Number.isNaN(n) ? '—' : n.toFixed(d));

/* [key, label, min, max, step, unit, what it does] */
const WALK_SLIDERS = [
  ['walkSpeed', 'walk speed', 1.0, 8.0, 0.1, 'm/s', 'flat-ground top speed'],
  ['accelTime', 'accel', 0.05, 1.0, 0.01, 's', 'time to reach 95% of walk speed from rest'],
  ['stopTime', 'stop', 0.02, 1.0, 0.01, 's', 'time to fall to 5% of walk speed; stop distance = speed x time / 3'],
  ['turnTime', 'turn', 0.02, 1.0, 0.01, 's', 'time to complete 95% of a turn towards the heading'],
  ['airControl', 'air control', 0.0, 1.0, 0.05, '', 'how much of the ground response survives while airborne'],
  ['gravity', 'gravity', 5, 40, 0.5, 'm/s2', 'higher is snappier and less floaty; earth is 9.81'],
  ['maxSlopeDeg', 'max slope', 5, 60, 1, 'deg', 'steeper than this is a wall you slide down'],
  ['stepHeight', 'step height', 0.0, 0.6, 0.01, 'm', 'tallest ledge stepped up instead of blocked'],
  ['snapDistance', 'ground snap', 0.0, 0.8, 0.01, 'm', 'how far the feet reach down to stay glued going downhill']
];

const CAM_SLIDERS = [
  ['distance', 'distance', 1.0, 10.0, 0.1, 'm', 'how far behind the character'],
  ['height', 'height', 0.2, 5.0, 0.1, 'm', 'boom anchor height above the feet'],
  ['pivotHeight', 'look at', 0.0, 3.0, 0.1, 'm', 'height up the body the camera aims at'],
  ['followTime', 'follow', 0.0, 0.8, 0.01, 's', 'position smoothing — how hard the camera chases'],
  ['aimTime', 'aim', 0.0, 0.8, 0.01, 's', 'rotation smoothing — how hard the view chases'],
  ['fov', 'fov', 35, 100, 1, 'deg', 'field of view'],
  ['orbitSpeed', 'mouse', 0.05, 1.0, 0.01, 'deg/px', 'drag sensitivity']
];

export function createHud(root, opts) {
  const { walkTuning, cameraTuning, onReset, onChange } = opts;

  const readout = root.querySelector('#readout');
  const sliderHost = root.querySelector('#sliders');
  const rows = {};
  const inputs = [];

  function addRow(key, label) {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `<span class="k"></span><span class="v"></span>`;
    el.querySelector('.k').textContent = label;
    readout.appendChild(el);
    rows[key] = el.querySelector('.v');
  }

  [
    ['mode', 'sim'], ['fps', 'fps'], ['substeps', 'substeps'],
    ['position', 'position'], ['velocity', 'velocity'], ['speed', 'speed'],
    ['vertical', 'vertical'], ['grounded', 'grounded'], ['slope', 'slope'],
    ['surface', 'under feet'], ['facing', 'facing'], ['air', 'airborne']
  ].forEach(([k, l]) => addRow(k, l));

  function addGroup(title, list, target) {
    const h = document.createElement('h2');
    h.textContent = title;
    sliderHost.appendChild(h);
    for (const [key, label, min, max, step, unit, note] of list) {
      const wrap = document.createElement('label');
      wrap.className = 'slider';
      wrap.title = note;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = label;
      const value = document.createElement('span');
      value.className = 'val';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step;
      input.value = target[key];

      const paint = () => {
        value.textContent = `${(+target[key]).toFixed(step < 0.1 ? 2 : 1)}${unit ? ' ' + unit : ''}`;
        input.value = target[key];
      };
      input.addEventListener('input', () => {
        target[key] = parseFloat(input.value);
        paint();
        if (onChange) onChange(key);
      });
      paint();
      inputs.push(paint);

      wrap.appendChild(name);
      wrap.appendChild(input);
      wrap.appendChild(value);
      sliderHost.appendChild(wrap);
    }
  }

  addGroup('movement', WALK_SLIDERS, walkTuning);
  addGroup('camera', CAM_SLIDERS, cameraTuning);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.id = 'reset-defaults';
  reset.textContent = 'reset to defaults';
  reset.addEventListener('click', () => {
    if (onReset) onReset();
    inputs.forEach((p) => p());
  });
  sliderHost.appendChild(reset);

  /* FPS over a one-second window rather than 1/dt, which is unreadable noise. */
  let frames = 0;
  let fpsClock = 0;
  let fps = 0;

  return {
    refresh() { for (const paint of inputs) paint(); },

    tick(dt, state, mode) {
      frames++;
      fpsClock += dt;
      if (fpsClock >= 0.5) {
        fps = frames / fpsClock;
        frames = 0;
        fpsClock = 0;
      }
      const p = state.position, v = state.velocity;
      rows.mode.textContent = mode;
      rows.mode.className = 'v ' + (mode === 'live' ? 'ok' : 'hot');
      rows.fps.textContent = F(fps, 0);
      rows.substeps.textContent = state.substeps;
      rows.position.textContent = `${F(p.x, 2)}  ${F(p.y, 2)}  ${F(p.z, 2)}`;
      rows.velocity.textContent = `${F(v.x, 2)}  ${F(v.y, 2)}  ${F(v.z, 2)}`;
      rows.speed.textContent = `${F(state.speed, 2)} m/s`;
      rows.vertical.textContent = `${F(v.y, 2)} m/s`;
      rows.grounded.textContent = state.grounded ? 'yes' : 'no';
      rows.grounded.className = 'v ' + (state.grounded ? 'ok' : 'hot');
      rows.slope.textContent = state.grounded ? `${F(state.slopeAngle, 1)}°` : '—';
      rows.surface.textContent = `${F(state.surfaceAngle, 1)}°`;
      rows.facing.textContent = `${F((state.facing * 180) / Math.PI, 0)}°`;
      rows.air.textContent = state.grounded ? '—' : `${F(state.airTime, 2)} s`;
    }
  };
}
