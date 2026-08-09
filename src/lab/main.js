/*
 * asset-lab.html — the review instrument docs/BLENDER_PIPELINE.md asks for
 * before an asset is allowed near the game.
 *
 * "Fixed acceptance captures" is a list of seven views, and every one of them
 * is a decision about where the camera is and what the light is doing. Taken by
 * hand they are seven different decisions every time, which makes two reviews
 * of two assets incomparable — and the whole point of the gate is comparison.
 * So they are keys here: 1-4 for the cameras, D/U/N/S for the moods, C for the
 * collider overlay.
 *
 * Three deliberate properties:
 *
 * IT IS PERMISSIVE. It loads any GLB under public/assets/models/ and shows what
 * is actually in the file, including a file the runtime loader would refuse. An
 * instrument that can only display assets that already pass cannot be used to
 * find out why one is failing.
 *
 * IT IS INDEPENDENT. No engine import, no rules, no session, and no import from
 * src/play/ either — see above; if it shared the runtime loader it would
 * inherit the runtime loader's refusals. What it does share is the *contract*:
 * the same VIS_/COL_/SOCKET_ naming, the same world-baked collider harvest, and
 * the same play-camera numbers, all restated here in a form small enough to
 * read in one sitting.
 *
 * IT IS UNSTYLED. The one and only reason to look at this page is to judge an
 * asset. Any pixel spent making the page itself attractive is a pixel arguing
 * with the thing being judged.
 *
 * The lighting modes approximate the three STYLE_BIBLE moods with a handful of
 * lights. They are not the Gate 3 lighting director and must not become it —
 * they exist so that "does the timber read at dusk" can be asked before the
 * director exists.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/*
 * Assets the dropdown offers, relative to /assets/models/.
 *
 * Hand-kept, and it has to be: `public/` is copied verbatim by Vite and cannot
 * be enumerated from JavaScript at build time. One line per row of
 * docs/ASSET_MANIFEST.md. `?asset=<path>` loads anything at all, so a file that
 * is not on this list is still one URL away.
 */
const KNOWN = [
  'environment/env-dais-a.glb'
];

const ASSET_ROOT = '/assets/models/';

/* The play camera, from src/walk/camera.js defaultCameraTuning(). Restated
 * rather than imported so the lab has no opinion about the game's modules —
 * but they are the same numbers, and if the game's change these must too. */
const PLAY_CAMERA = { distance: 3.5, height: 1.8, pivotHeight: 1.2, fov: 60 };
/* How far in front of the asset a player would stand to use it. */
const STANDOFF = 1.0;

/* The calibration capsule from the World contract: 1.70 m tall, 0.70 m wide. */
const CAPSULE = { height: 1.70, width: 0.70 };

const REVIEW_FOV = 35;   // front / side / three-quarter: less perspective lie

/* ---------------------------------------------------------------- scene */

const stage = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
/* PCF, not PCFSoft: three r185 deprecated the soft variant and warns on it, and
 * a tool page that prints a warning teaches the reviewer to ignore warnings.
 * This is also what play.html uses, so the lab's shadows are the game's. */
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(REVIEW_FOV, 1, 0.05, 400);

/* --------------------------------------------------------------- guides */

const guides = new THREE.Group();
guides.name = 'guides';
scene.add(guides);

/* 1 m grid, 20 m across. The ruler in "meter-ruler grid". */
const grid = new THREE.GridHelper(20, 20, 0x6a7488, 0x39404e);
grid.position.y = 0.001;
grid.material.transparent = true;
grid.material.opacity = 0.55;
guides.add(grid);

/* The real calibration capsule, and a 2 m pole banded every 0.25 m beside it.
 * Both are guides: they are hidden in the silhouette mode, which is the one
 * mode where anything that is not the asset is a lie. */
const capsule = new THREE.Mesh(
  new THREE.CapsuleGeometry(CAPSULE.width / 2, CAPSULE.height - CAPSULE.width, 8, 20),
  new THREE.MeshLambertMaterial({ color: 0xb9c2d2 })
);
capsule.position.y = CAPSULE.height / 2;
capsule.castShadow = true;
guides.add(capsule);

const pole = new THREE.Group();
for (let i = 0; i < 8; i++) {
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.25, 0.06),
    new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe8ecf4 : 0x2a2f3a })
  );
  band.position.y = 0.125 + i * 0.25;
  pole.add(band);
}
guides.add(pole);

/* -------------------------------------------------------------- lighting */

/*
 * Four moods, four groups, one visible at a time. Each is a handful of lights
 * approximating a STYLE_BIBLE reference — day/discussion, dusk/gathering,
 * night/trial — plus the silhouette gate, which is not a mood at all: it is an
 * unlit black override on a light background, so only the outline survives.
 */
const MOODS = {
  day: { label: 'day', background: 0x9fb0b8, lights: dayLights() },
  dusk: { label: 'dusk', background: 0x2e2740, lights: duskLights() },
  night: { label: 'night', background: 0x181828, lights: nightLights() },
  silhouette: { label: 'silhouette', background: 0xe6e6e6, lights: new THREE.Group() }
};
for (const mood of Object.values(MOODS)) {
  mood.lights.visible = false;
  scene.add(mood.lights);
}

const SILHOUETTE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x000000 });

function dayLights() {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0xc4d6e4, 0x6b6a58, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(6, 11, 7);
  shadowed(key, 10);
  g.add(key);
  return g;
}

function duskLights() {
  const g = new THREE.Group();
  /* Amber above, teal bounce below: the dusk reference's whole gradient in one
   * light, which is as much as a lab needs. */
  g.add(new THREE.HemisphereLight(0x4a5a80, 0x40301c, 1.0));
  const sun = new THREE.DirectionalLight(0xffb066, 2.6);
  sun.position.set(-9, 3.0, 8);        // low, raking, long shadows
  shadowed(sun, 10);
  g.add(sun);
  return g;
}

function nightLights() {
  const g = new THREE.Group();
  /* Dark is blue, never black. */
  g.add(new THREE.HemisphereLight(0x28304a, 0x141420, 0.55));
  /* One dominant warm beam — the hero reference's trial staging, and the only
   * warm light in the frame, because warm is information. */
  const beam = new THREE.SpotLight(0xf8d868, 60, 18, Math.PI / 7, 0.45, 1.6);
  beam.position.set(1.6, 6.0, 4.2);
  beam.target.position.set(0, 0.6, 0);
  beam.castShadow = true;
  beam.shadow.mapSize.set(1024, 1024);
  g.add(beam);
  g.add(beam.target);
  return g;
}

function shadowed(light, extent) {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -extent;
  light.shadow.camera.right = extent;
  light.shadow.camera.top = extent;
  light.shadow.camera.bottom = -extent;
  light.shadow.camera.far = 40;
  light.shadow.bias = -0.0008;
  return light;
}

/* ----------------------------------------------------------- the asset */

const loader = new GLTFLoader();

let assetGroup = null;      // the loaded gltf.scene, unplaced, at the origin
let overlay = null;         // COL_ wireframes, built from world-baked geometry
let socketMarks = null;     // SOCKET_ pins
let bounds = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
let report = {};

function clearAsset() {
  for (const group of [assetGroup, overlay, socketMarks]) {
    if (!group) continue;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== SILHOUETTE_MATERIAL) {
        for (const m of [].concat(o.material)) m.dispose();
      }
    });
    scene.remove(group);
  }
  assetGroup = overlay = socketMarks = null;
}

async function loadAsset(path) {
  clearAsset();
  const url = ASSET_ROOT + path;
  let gltf = null;
  try {
    gltf = await loader.loadAsync(url);
  } catch (error) {
    report = { file: path, error: (error && error.message) ? error.message : String(error) };
    drawReport();
    return;
  }

  assetGroup = gltf.scene;
  assetGroup.updateMatrixWorld(true);
  scene.add(assetGroup);

  overlay = new THREE.Group();
  overlay.name = 'collider-overlay';
  overlay.visible = colliderOn;
  scene.add(overlay);

  socketMarks = new THREE.Group();
  socketMarks.name = 'sockets';
  scene.add(socketMarks);

  const vis = [];
  const col = [];
  const sockets = [];
  const other = [];
  const materials = new Map();
  let triangles = 0;
  let colTriangles = 0;

  assetGroup.traverse((node) => {
    if (node === assetGroup) return;
    const name = node.name || '(unnamed)';
    const isCol = name.indexOf('COL_') === 0;
    const isSocket = name.indexOf('SOCKET_') === 0;
    const isVis = name.indexOf('VIS_') === 0;

    if (node.isMesh) {
      const index = node.geometry.getIndex();
      const position = node.geometry.getAttribute('position');
      const tris = (index ? index.count : (position ? position.count : 0)) / 3;
      /* COL_ meshes carry no authored material — glTF gives them the default,
       * and listing that default's uuid as a material of the asset is a lie the
       * review would have to learn to ignore. */
      if (!isCol) {
        for (const m of [].concat(node.material)) {
          if (m) materials.set(m.name || '(unnamed)', m);
        }
      }

      if (isCol) {
        colTriangles += tris;
        col.push(name);
        /* Hidden exactly as the runtime hides it. The overlay below is drawn
         * from a world-baked CLONE, which is the geometry the game's BVH is
         * actually built from — a wireframe of the node as authored would hide
         * a bad node transform, which is the defect most worth catching. */
        node.visible = false;
        const baked = node.geometry.clone();
        baked.applyMatrix4(node.matrixWorld);
        const wire = new THREE.LineSegments(
          new THREE.WireframeGeometry(baked),
          new THREE.LineBasicMaterial({ color: 0x54c8ff })
        );
        overlay.add(wire);
        baked.dispose();
      } else {
        triangles += tris;
        if (isVis) vis.push(name); else other.push(name);
        node.castShadow = true;
        node.receiveShadow = true;
      }
    } else if (isSocket) {
      sockets.push(name);
      const at = node.getWorldPosition(new THREE.Vector3());
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x6ddd8c })
      );
      pin.position.copy(at);
      socketMarks.add(pin);
      node.visible = false;
    } else if (node.isLight || node.isCamera) {
      other.push(name + ' (' + node.type + ')');
    }
  });

  /* Bounds from the VISIBLE geometry only: a collider that overshoots must not
   * silently reframe every review camera. */
  bounds = new THREE.Box3();
  assetGroup.traverse((node) => {
    if (node.isMesh && node.visible) bounds.expandByObject(node);
  });
  if (bounds.isEmpty()) bounds.setFromObject(assetGroup);

  const size = bounds.getSize(new THREE.Vector3());
  const doubleSided = Array.from(materials.values())
    .filter((m) => m.side === THREE.DoubleSide).map((m) => m.name || '(unnamed)');

  report = {
    file: path,
    bounds: `${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)} m`,
    ground: bounds.min.y.toFixed(4) + ' m',
    vis: `${vis.length} (${triangles} tris)`,
    col: `${col.length} (${colTriangles} tris)`,
    sockets: sockets.length ? sockets.join(', ') : 'none',
    materials: Array.from(materials.keys()).join(', ') || 'none',
    doubleSided: doubleSided.length ? doubleSided.join(', ') : 'none',
    unnamed: other.length ? other.join(', ') : 'none'
  };

  applyCamera(cameraMode);
  drawReport();
}

/**
 * Where the calibration capsule stands, which is not one place.
 *
 * On the `game` camera it has to be where a player would actually be: on the
 * +Z side, which the World contract calls the model's front, one standoff clear
 * of the asset — the whole point of that view is the approach. On the three
 * review cameras it has to be somewhere it is NOT standing in front of the
 * thing being reviewed, which the first version got wrong: dead centre at the
 * front, occluding the lectern in the front view, in the one view whose job is
 * the lectern.
 */
function placeGuides() {
  const centre = bounds.getCenter(new THREE.Vector3());
  const inFront = cameraMode === 'game';
  /* Stepped one body-width off the centre line even in the game view. The
   * play camera has its own reason to put the body off-centre (a 330 px HUD on
   * the left, see src/walk/camera.js screenBias) which does not apply to a page
   * whose panel is on the right — but the consequence has to: a capsule dead
   * ahead hides the lectern, in the one view whose question is what the lectern
   * looks like from where the player reads it. */
  const x = inFront ? centre.x + CAPSULE.width * 1.3 : bounds.max.x + CAPSULE.width;
  const z = inFront ? bounds.max.z + STANDOFF : bounds.max.z - CAPSULE.width;
  capsule.position.set(x, CAPSULE.height / 2, z);
  pole.position.set(x + CAPSULE.width, 0, z);
}

/* --------------------------------------------------------------- cameras */

const CAMERAS = ['front', 'three-quarter', 'side', 'game'];
let cameraMode = 'front';
/* Orbit is a nudge on top of the fixed view, not a replacement for it: any
 * camera key snaps back, so a capture is always the same capture. */
let orbitYaw = 0;
let orbitPitch = 0;
let zoom = 1;

function applyCamera(mode) {
  cameraMode = mode;
  placeGuides();

  if (mode === 'game') {
    /*
     * The play camera, exactly: 3.5 m behind the body, 1.8 m up, looking at a
     * point 1.2 m up it, 60 degrees. Mirrored front-to-back against
     * src/walk/camera.js because the game approaches the dais from world -Z
     * while the lab shows the asset unplaced with its front on +Z — same
     * geometry, same numbers, the asset is simply not rotated into the square.
     */
    camera.fov = PLAY_CAMERA.fov;
    const target = new THREE.Vector3(capsule.position.x, PLAY_CAMERA.pivotHeight, capsule.position.z);
    const eye = new THREE.Vector3(
      capsule.position.x,
      PLAY_CAMERA.height,
      capsule.position.z + PLAY_CAMERA.distance
    );
    aim(eye, target);
    return;
  }

  camera.fov = REVIEW_FOV;
  const dir = mode === 'front' ? new THREE.Vector3(0, 0.12, 1)
    : mode === 'side' ? new THREE.Vector3(1, 0.12, 0)
      : new THREE.Vector3(0.85, 0.45, 1);
  dir.normalize();

  /* Framed on the asset AND the capsule, because "scale beside capsule/ruler"
   * is one of the seven required captures and a frame that cuts the ruler off
   * cannot be it. */
  const framed = bounds.clone()
    .expandByPoint(new THREE.Vector3(capsule.position.x - CAPSULE.width, 0, capsule.position.z))
    .expandByPoint(new THREE.Vector3(pole.position.x + CAPSULE.width, 2.0, pole.position.z));
  const centre = framed.getCenter(new THREE.Vector3());
  const size = framed.getSize(new THREE.Vector3());
  const radius = Math.max(0.5, framed.getBoundingSphere(new THREE.Sphere()).radius);

  /* Fit the bounding sphere with a margin, so front/side/three-quarter of two
   * different assets are the same shot at two different scales. */
  const distance = (radius / Math.sin((REVIEW_FOV * Math.PI / 180) / 2)) * 1.12;
  const target = new THREE.Vector3(centre.x, Math.max(size.y * 0.45, 0.5), centre.z);
  aim(target.clone().addScaledVector(dir, distance), target);
}

const eyeBase = new THREE.Vector3();
const targetBase = new THREE.Vector3();

function aim(eye, target) {
  eyeBase.copy(eye);
  targetBase.copy(target);
  orbitYaw = 0;
  orbitPitch = 0;
  zoom = 1;
  updateCamera();
}

function updateCamera() {
  const offset = eyeBase.clone().sub(targetBase);
  const radius = offset.length() * zoom;
  let yaw = Math.atan2(offset.x, offset.z) + orbitYaw;
  let pitch = Math.asin(Math.min(1, Math.max(-1, offset.y / offset.length()))) + orbitPitch;
  pitch = Math.min(1.45, Math.max(-1.2, pitch));
  const cp = Math.cos(pitch);
  camera.position.set(
    targetBase.x + Math.sin(yaw) * cp * radius,
    targetBase.y + Math.sin(pitch) * radius,
    targetBase.z + Math.cos(yaw) * cp * radius
  );
  camera.lookAt(targetBase);
  camera.updateProjectionMatrix();
}

/* -------------------------------------------------------------- controls */

let mood = 'day';
let colliderOn = false;
let agx = true;

function applyMood(next) {
  mood = next;
  for (const [name, m] of Object.entries(MOODS)) m.lights.visible = name === next;
  scene.background = new THREE.Color(MOODS[next].background);

  const silhouette = next === 'silhouette';
  scene.overrideMaterial = silhouette ? SILHOUETTE_MATERIAL : null;
  guides.visible = !silhouette;
  if (socketMarks) socketMarks.visible = !silhouette;
  if (overlay) overlay.visible = colliderOn && !silhouette;
  drawButtons();
}

function applyCollider(on) {
  colliderOn = on;
  if (overlay) overlay.visible = on && mood !== 'silhouette';
  drawButtons();
}

function applyTone(on) {
  agx = on;
  /* The pipeline says review material values under AgX. play.html currently
   * renders with no tone mapping at all, and Gate 3 owns that decision — so the
   * toggle is here and the mode is on screen, rather than the lab quietly
   * showing a different image from the game and nobody knowing which. */
  renderer.toneMapping = on ? THREE.AgXToneMapping : THREE.NoToneMapping;
  drawButtons();
}

/* ------------------------------------------------------------- the panel */

const ui = {
  asset: document.getElementById('c-asset'),
  cameras: document.getElementById('cameras'),
  lights: document.getElementById('lights'),
  collider: document.getElementById('c-collider'),
  tone: document.getElementById('c-tone'),
  stats: document.getElementById('stats'),
  report: document.getElementById('report')
};

const params = new URLSearchParams(location.search);
const requested = (params.get('asset') || '').replace(/^\/+/, '').replace(/^assets\/models\//, '');
const choices = KNOWN.slice();
if (requested && choices.indexOf(requested) === -1) choices.push(requested);

for (const path of choices) {
  const option = document.createElement('option');
  option.value = path;
  option.textContent = path;
  ui.asset.appendChild(option);
}
ui.asset.value = requested || KNOWN[0];
ui.asset.addEventListener('change', () => loadAsset(ui.asset.value));

const cameraButtons = CAMERAS.map((mode, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `${mode} <span class="keys">${i + 1}</span>`;
  b.addEventListener('click', () => applyCamera(mode));
  ui.cameras.appendChild(b);
  return { mode, b };
});

const MOOD_KEYS = { day: 'D', dusk: 'U', night: 'N', silhouette: 'S' };
const moodButtons = Object.keys(MOODS).map((name) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `${name} <span class="keys">${MOOD_KEYS[name]}</span>`;
  b.addEventListener('click', () => applyMood(name));
  ui.lights.appendChild(b);
  return { name, b };
});

ui.collider.addEventListener('click', () => applyCollider(!colliderOn));
ui.tone.addEventListener('click', () => applyTone(!agx));

function drawButtons() {
  for (const { mode, b } of cameraButtons) b.classList.toggle('on', mode === cameraMode);
  for (const { name, b } of moodButtons) b.classList.toggle('on', name === mood);
  ui.collider.classList.toggle('on', colliderOn);
  ui.tone.classList.toggle('on', agx);
  ui.tone.innerHTML = `${agx ? 'AgX' : 'linear'} <span class="keys">T</span>`;
}

function drawReport() {
  ui.report.innerHTML = '';
  for (const [key, value] of Object.entries(report)) {
    const row = document.createElement('div');
    if (key === 'error') row.className = 'warn';
    if (key === 'doubleSided' || key === 'unnamed') row.className = value === 'none' ? 'ok' : 'warn';
    row.innerHTML = `<span>${key}</span><b>${value}</b>`;
    ui.report.appendChild(row);
  }
}

function drawStats() {
  const info = renderer.info;
  const rows = {
    calls: info.render.calls,
    triangles: info.render.triangles,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs ? info.programs.length : 0,
    camera: `${cameraMode} · ${camera.fov.toFixed(0)}°`,
    tone: agx ? 'AgX' : 'linear'
  };
  ui.stats.innerHTML = '';
  for (const [key, value] of Object.entries(rows)) {
    const row = document.createElement('div');
    row.innerHTML = `<span>${key}</span><b>${value}</b>`;
    ui.stats.appendChild(row);
  }
}

/* ---------------------------------------------------------------- input */

window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const index = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (index !== -1) { applyCamera(CAMERAS[index]); drawButtons(); return; }
  if (e.code === 'KeyD') applyMood('day');
  else if (e.code === 'KeyU') applyMood('dusk');
  else if (e.code === 'KeyN') applyMood('night');
  else if (e.code === 'KeyS') applyMood('silhouette');
  else if (e.code === 'KeyC') applyCollider(!colliderOn);
  else if (e.code === 'KeyT') applyTone(!agx);
});

let dragging = false;
let lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw -= (e.clientX - lastX) * 0.005;
  orbitPitch += (e.clientY - lastY) * 0.005;
  lastX = e.clientX; lastY = e.clientY;
  updateCamera();
});
const endDrag = () => { dragging = false; };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.min(4, Math.max(0.25, zoom * (1 + Math.sign(e.deltaY) * 0.1)));
  updateCamera();
}, { passive: false });

/* ----------------------------------------------------------------- loop */

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function frame() {
  requestAnimationFrame(frame);
  renderer.render(scene, camera);
  drawStats();
}

resize();
applyMood('day');
applyTone(true);
applyCollider(false);
drawButtons();
loadAsset(ui.asset.value);
requestAnimationFrame(frame);

/* A handle for a scripted capture pass, same idea as __play and __walk. */
window.__lab = {
  load: (path) => loadAsset(path),
  /* The live scene and camera, for scripted review probes (capture scripts,
   * pixel-level checks). An instrument that can be read but not interrogated
   * ends every disagreement at a screenshot. */
  probe: () => ({ scene, camera }),
  camera: (mode) => { applyCamera(mode); drawButtons(); return cameraMode; },
  mood: (name) => { applyMood(name); return mood; },
  collider: (on) => { applyCollider(!!on); return colliderOn; },
  tone: (on) => { applyTone(!!on); return agx; },
  get report() { return Object.assign({}, report); },
  get stats() {
    return {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures
    };
  },
  get state() {
    return { asset: ui.asset.value, camera: cameraMode, mood, collider: colliderOn, agx };
  }
};

console.info('[lab] window.__lab ready — load(path), camera(1-4 name), mood(day|dusk|night|silhouette), collider(on), tone(on), report, stats.');
