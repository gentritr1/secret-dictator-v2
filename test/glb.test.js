/*
 * The GLB contract: a re-export that breaks the game fails here, not in a
 * playtest.
 *
 *     node test/glb.test.js            (npm run test:glb)
 *
 * An art asset is the one kind of source file in this repository that nobody
 * reads. It is authored in another program, it arrives as bytes, and every
 * property the game depends on — the height of the step, the name of the
 * socket, which way the front faces — is invisible in a diff. `Bin 0 -> 89732
 * bytes` is what a reviewer sees. So this file reads it instead, in three
 * layers, each of which can fail for a different reason:
 *
 *  1. THE FILE. The raw GLB chunks are parsed with no library at all: header,
 *     node names, material flags, accessor bounds, index winding. This layer
 *     answers "is the export what the pipeline demands" and would still work if
 *     three.js changed under it.
 *
 *  2. THE LOADER. GLTFLoader.parse on the real bytes, then the game's own
 *     src/play/assets.js buildEnvironment() on the result. This layer answers
 *     "does the runtime seam produce the right world" — the documented
 *     placement transform, the world-baked colliders, the socket resolved by
 *     name — using the same function play.html calls, not a re-description of
 *     it. It also asserts the refusals: a renamed COL_ node must fall back.
 *
 *  3. THE PLAYER. The harvested colliders are merged with the graybox square,
 *     handed to the real BVH world, and the real character controller is walked
 *     north into the dais at full speed. The 0.22 m step is the one property of
 *     this asset that gameplay cannot survive losing, and a bounds check does
 *     not prove it: a collider can be the right height and still refuse a
 *     player if its top faces the wrong way. This layer walks up it.
 *
 * The tolerance everywhere is 1 cm unless a tighter one is stated. Blender
 * writes float32 and the exporter rounds; asserting exact equality on geometry
 * would fail on a re-export that changed nothing that matters.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* A candidate re-export can be checked before it is committed:
 *     node test/glb.test.js /path/to/env-dais-a.glb
 * Layers 2 and 3 only run when the file under test IS the shipping one, since
 * they assert this asset's place in this square. */
const SHIPPING = path.join(__dirname, '..', 'public', 'assets', 'models', 'environment', 'env-dais-a.glb');
const GLB = process.argv[2] ? path.resolve(process.argv[2]) : SHIPPING;

/* The gameplay contract, from docs/BLENDER_PIPELINE.md's measurements table and
 * src/play/square.js. These numbers are the reason the test exists; they are
 * written out rather than imported so a change to either side has to be made
 * twice, on purpose. */
const CONTRACT = {
  daisCentre: { x: 0, z: 9 },
  daisSize: { x: 6.0, z: 3.4 },
  daisTop: 0.22,
  stepLimit: 0.25,          // src/walk/controller.js defaultTuning().stepHeight
  assetBounds: { x: 6.0, y: 1.27, z: 3.4 },
  triangleReview: 8000,     // "dais and lectern hero cluster" review limit
  tolerance: 0.01
};

const REQUIRED_NODES = [
  'env-dais-a',
  'COL_dais', 'COL_lectern', 'SOCKET_podium',
  'VIS_dais_base',
  'VIS_dais_plank_1', 'VIS_dais_plank_2', 'VIS_dais_plank_3', 'VIS_dais_plank_4',
  'VIS_dais_plank_5', 'VIS_dais_plank_6', 'VIS_dais_plank_7',
  'VIS_lectern_body', 'VIS_lectern_desk', 'VIS_lectern_foot'
];

/* ------------------------------------------------------------ assertions */

let checks = 0;
const failures = [];
const lines = [];

function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
  return ok;
}
function near(actual, expected, tol, what) {
  const d = Math.abs(actual - expected);
  check(d <= tol, `${what}: got ${fmt(actual)}, expected ${fmt(expected)} +/- ${fmt(tol)} (off by ${fmt(d)})`);
  return d;
}
function fmt(n) {
  return typeof n === 'number' ? (Math.abs(n) < 1e-6 ? '0' : n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')) : String(n);
}
function say(s) { lines.push(s); }

/* ------------------------------------------------- layer 1: the raw file */

/** A GLB reader with no dependencies, so layer 1 cannot be fooled by a loader. */
function readGlb(file) {
  const buf = fs.readFileSync(file);
  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const total = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < total) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.slice(offset + 8, offset + 8 + length);
    if (type === 0x4E4F534A) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004E4942) bin = data;
    offset += 8 + length;
  }
  return { buf, magic, version, total, json, bin };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessor(glb, index) {
  const a = glb.json.accessors[index];
  const view = glb.json.bufferViews[a.bufferView];
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const comps = COMPONENTS[a.type];
  const out = new Array(a.count * comps);
  for (let i = 0; i < out.length; i++) {
    if (a.componentType === 5126) out[i] = glb.bin.readFloatLE(start + i * 4);
    else if (a.componentType === 5123) out[i] = glb.bin.readUInt16LE(start + i * 2);
    else if (a.componentType === 5125) out[i] = glb.bin.readUInt32LE(start + i * 4);
    else if (a.componentType === 5121) out[i] = glb.bin.readUInt8(start + i);
    else throw new Error('unhandled componentType ' + a.componentType);
  }
  return { data: out, comps, count: a.count, min: a.min, max: a.max };
}

function fileLayer(glb) {
  const json = glb.json;

  check(glb.magic === 0x46546C67, 'not a GLB: bad magic');
  check(glb.version === 2, `glTF version: got ${glb.version}, expected 2`);
  check(glb.total === glb.buf.length, 'declared length does not match the file size');
  check(!!json && !!glb.bin, 'GLB is missing its JSON or BIN chunk');
  say(`file          ${(glb.buf.length / 1024).toFixed(1)} KiB · ${json.asset.generator} · glTF ${json.asset.version}`);

  /* -- structure ------------------------------------------------------- */

  check(json.scenes.length === 1, `scenes: got ${json.scenes.length}, expected 1`);
  check(json.scenes[0].nodes.length === 1, 'the scene must have exactly one asset root');
  const rootIndex = json.scenes[0].nodes[0];
  const root = json.nodes[rootIndex];
  check(root.name === 'env-dais-a', `asset root name: got ${root.name}`);
  check(!root.translation && !root.rotation && !root.scale,
    'the asset root must sit at the origin with no transform of its own');

  const names = json.nodes.map((n) => n.name);
  for (const required of REQUIRED_NODES) {
    check(names.indexOf(required) !== -1, `required node missing: ${required}`);
  }
  const absent = REQUIRED_NODES.filter((n) => names.indexOf(n) === -1);
  if (absent.length) {
    /* Everything below this line reads those nodes by name. Stopping here turns
     * a stack trace into a sentence, and the whole point of a gate is that the
     * failure names itself. */
    return { fatal: `required node(s) missing: ${absent.join(', ')}` };
  }

  /* -- naming hygiene --------------------------------------------------- */

  const DEFAULTS = /^(Cube|Sphere|Cylinder|Plane|Cone|Torus|Icosphere|Suzanne|Empty|Material|Object)(\.\d+)?$/i;
  const SUFFIXED = /\.\d{3}$/;
  const everything = []
    .concat(json.nodes.map((n) => ['node', n.name]))
    .concat(json.meshes.map((m) => ['mesh', m.name]))
    .concat(json.materials.map((m) => ['material', m.name]))
    .concat((json.animations || []).map((a) => ['animation', a.name]));
  for (const [kind, name] of everything) {
    check(!!name, `an unnamed ${kind} reached the export`);
    check(!DEFAULTS.test(name || ''), `${kind} has a default name: ${name}`);
    check(!SUFFIXED.test(name || ''), `${kind} has a .00n duplicate suffix: ${name}`);
  }

  /* Guides are never exported. CAL_ is the calibration capsule, GUIDE_/REF_ the
   * rest of 00_GUIDES and 90_REVIEW. */
  const leaks = names.filter((n) => /^(CAL_|GUIDE_|REF_|REVIEW_)/.test(n || ''));
  check(leaks.length === 0, `guide geometry leaked into the export: ${leaks.join(', ')}`);
  check(!json.cameras || json.cameras.length === 0, 'the export contains a camera');
  check(!(json.extensionsUsed || []).some((e) => e === 'KHR_lights_punctual'),
    'the export contains a light');

  /* Every node is either the root, a VIS_, a COL_ or a SOCKET_. Anything else
   * is a node the runtime has no rule for. */
  const unclassified = names.filter((n) =>
    n !== 'env-dais-a' && !/^(VIS_|COL_|SOCKET_)/.test(n || ''));
  check(unclassified.length === 0, `nodes with no runtime role: ${unclassified.join(', ')}`);

  /* -- materials -------------------------------------------------------- */

  for (const m of json.materials) {
    check(m.doubleSided !== true, `opaque material exported double-sided: ${m.name}`);
    check(!m.alphaMode || m.alphaMode === 'OPAQUE', `material is not opaque: ${m.name}`);
    const pbr = m.pbrMetallicRoughness || {};
    check((pbr.metallicFactor || 0) === 0, `${m.name} is metallic (${pbr.metallicFactor})`);
    const rough = pbr.roughnessFactor === undefined ? 1 : pbr.roughnessFactor;
    check(rough >= 0.8 && rough <= 0.95,
      `${m.name} roughness ${rough} is outside the painted-wood/stone band 0.80-0.95`);
  }
  check(json.materials.length <= 3,
    `materials: got ${json.materials.length}, the cluster is budgeted 3`);
  say(`materials     ${json.materials.map((m) => m.name).join(', ')} — all single-sided, metallic 0`);

  /* Embedded, or absent. A URI means an image the build would not ship. */
  for (const image of json.images || []) {
    check(image.bufferView !== undefined, `texture image is external: ${image.uri}`);
  }

  /* -- geometry and bounds ---------------------------------------------- */

  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const perNode = new Map();
  let triangles = 0;

  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    check(!node.translation && !node.rotation && !node.scale,
      `${node.name} carries a node transform; geometry is expected baked in asset-local space`);
    const mesh = json.meshes[node.mesh];
    const local = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const prim of mesh.primitives) {
      check(prim.mode === undefined || prim.mode === 4, `${node.name} is not triangles`);
      const declared = json.accessors[prim.attributes.POSITION];
      check(!!prim.attributes.NORMAL, `${node.name} has no normals`);

      /*
       * Measured from the vertices, not read off accessor.min/max. The two
       * should agree and are checked against each other below — but the whole
       * point of this layer is that nobody reads the file, and an exporter that
       * writes a stale bounding box would otherwise let a mis-scaled asset
       * through every dimension check in this suite while telling three.js to
       * cull it wrong.
       */
      const pos = accessor(glb, prim.attributes.POSITION);
      for (let v = 0; v < pos.count; v++) {
        for (let k = 0; k < 3; k++) {
          const value = pos.data[v * 3 + k];
          local.min[k] = Math.min(local.min[k], value);
          local.max[k] = Math.max(local.max[k], value);
          box.min[k] = Math.min(box.min[k], value);
          box.max[k] = Math.max(box.max[k], value);
        }
      }
      for (let k = 0; k < 3; k++) {
        near(declared.min[k], local.min[k], 1e-4, `${node.name} declared min[${k}] vs its vertices`);
        near(declared.max[k], local.max[k], 1e-4, `${node.name} declared max[${k}] vs its vertices`);
      }

      const index = json.accessors[prim.indices];
      triangles += (index ? index.count : pos.count) / 3;
    }
    perNode.set(node.name, local);
  }

  near(box.max[0] - box.min[0], CONTRACT.assetBounds.x, CONTRACT.tolerance, 'asset width (X)');
  near(box.max[1] - box.min[1], CONTRACT.assetBounds.y, CONTRACT.tolerance, 'asset height (Y)');
  near(box.max[2] - box.min[2], CONTRACT.assetBounds.z, CONTRACT.tolerance, 'asset depth (Z)');
  near(box.min[1], 0, CONTRACT.tolerance, 'ground contact: the lowest vertex must sit on Y=0');
  near((box.min[0] + box.max[0]) / 2, 0, CONTRACT.tolerance, 'X centre of the pivot');
  near((box.min[2] + box.max[2]) / 2, 0, CONTRACT.tolerance, 'Z centre of the pivot');
  check(triangles <= CONTRACT.triangleReview,
    `triangles: ${triangles} is over the ${CONTRACT.triangleReview} review limit for this cluster`);
  say(`bounds        ${fmt(box.max[0] - box.min[0])} × ${fmt(box.max[1] - box.min[1])} × ` +
    `${fmt(box.max[2] - box.min[2])} m, ground contact ${fmt(box.min[1])}, ${triangles} tris`);

  /* -- the colliders ----------------------------------------------------- */

  const dais = perNode.get('COL_dais');
  near(dais.max[1], CONTRACT.daisTop, CONTRACT.tolerance, 'COL_dais top (the step onto the dais)');
  check(dais.max[1] < CONTRACT.stepLimit,
    `COL_dais top ${fmt(dais.max[1])} is not under the ${CONTRACT.stepLimit} m step limit`);
  near(dais.max[0] - dais.min[0], CONTRACT.daisSize.x, CONTRACT.tolerance, 'COL_dais width');
  near(dais.max[2] - dais.min[2], CONTRACT.daisSize.z, CONTRACT.tolerance, 'COL_dais depth');
  near(dais.min[1], 0, CONTRACT.tolerance, 'COL_dais sits on the ground');

  const lectern = perNode.get('COL_lectern');
  check(lectern.max[1] - dais.max[1] > CONTRACT.stepLimit,
    'COL_lectern must be an intentional blocker: taller than the step limit above the dais');
  near(lectern.min[1], CONTRACT.daisTop, CONTRACT.tolerance, 'COL_lectern stands on the dais top');
  check(lectern.min[0] >= dais.min[0] && lectern.max[0] <= dais.max[0] &&
    lectern.min[2] >= dais.min[2] && lectern.max[2] <= dais.max[2],
    'COL_lectern overhangs the dais');

  /* Winding and normals, per collision triangle. This is the check that a
   * bounds test cannot make: a box of the right size whose faces point inward
   * is a dais the player walks through and cannot step onto, and three.js's
   * front-face-only downward raycast is what turns that into a movement bug. */
  for (const name of ['COL_dais', 'COL_lectern']) {
    const node = json.nodes.find((n) => n.name === name);
    const prim = json.meshes[node.mesh].primitives[0];
    const pos = accessor(glb, prim.attributes.POSITION);
    const nrm = accessor(glb, prim.attributes.NORMAL);
    const idx = accessor(glb, prim.indices);
    let volume = 0;
    let upwardArea = 0;
    let degenerate = 0;
    let disagreeing = 0;
    for (let t = 0; t < idx.count / 3; t++) {
      const a = idx.data[t * 3], b = idx.data[t * 3 + 1], c = idx.data[t * 3 + 2];
      const A = [pos.data[a * 3], pos.data[a * 3 + 1], pos.data[a * 3 + 2]];
      const B = [pos.data[b * 3], pos.data[b * 3 + 1], pos.data[b * 3 + 2]];
      const C = [pos.data[c * 3], pos.data[c * 3 + 1], pos.data[c * 3 + 2]];
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const length = Math.hypot(n[0], n[1], n[2]);
      volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) +
        A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
      if (length < 1e-9) { degenerate++; continue; }
      const shading = [nrm.data[a * 3], nrm.data[a * 3 + 1], nrm.data[a * 3 + 2]];
      const dot = (n[0] * shading[0] + n[1] * shading[1] + n[2] * shading[2]) / length;
      if (dot < 0.9) disagreeing++;
      if (n[1] / length > 0.7) upwardArea += length / 2;
    }
    check(degenerate === 0, `${name} has ${degenerate} zero-area triangles`);
    check(disagreeing === 0, `${name} has ${disagreeing} triangles whose winding fights their normal`);
    check(volume > 0, `${name} is inside out (signed volume ${fmt(volume)})`);
    if (name === 'COL_dais') {
      near(upwardArea, CONTRACT.daisSize.x * CONTRACT.daisSize.z, 0.05,
        'COL_dais walkable (upward-facing) area');
    }
    say(`${name.padEnd(13)} closed, outward, volume ${fmt(volume)} m³, walkable ${fmt(upwardArea)} m²`);
  }

  /* -- the socket -------------------------------------------------------- */

  const socket = json.nodes.find((n) => n.name === 'SOCKET_podium');
  check(socket.mesh === undefined, 'SOCKET_podium must be an empty, not a mesh');
  const at = socket.translation || [0, 0, 0];
  check(at[0] >= dais.min[0] && at[0] <= dais.max[0] &&
    at[2] >= dais.min[2] && at[2] <= dais.max[2],
    `SOCKET_podium at (${at.map(fmt).join(', ')}) is off the dais`);
  near(at[1], CONTRACT.daisTop, CONTRACT.tolerance, 'SOCKET_podium stands on the dais top');
  say(`SOCKET_podium asset-local (${at.map(fmt).join(', ')})`);

  return { box, triangles, socket: at, dais, lectern };
}

/* ------------------------------------------------- layer 2: the loader */

async function loaderLayer(glb, fileReport) {
  const THREE = await import('three');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { buildEnvironment, ENV_DAIS_A } = await import('../src/play/assets.js');

  async function parse() {
    const bytes = glb.buf.buffer.slice(glb.buf.byteOffset, glb.buf.byteOffset + glb.buf.byteLength);
    return new Promise((resolve, reject) => new GLTFLoader().parse(bytes, '', resolve, reject));
  }

  const gltf = await parse();
  const env = buildEnvironment(gltf.scene, ENV_DAIS_A);
  check(env.ok === true, `buildEnvironment refused the shipping asset: ${env.reason} ${env.detail || ''}`);
  if (!env.ok) return null;

  /* The placement transform, and what it does to the asset. The World contract
   * says the model's +Z is its front; the square wants it facing the crowd,
   * which is -Z; yaw PI is the whole of the correction and it lives in the
   * loader, not in the mesh. */
  check(env.place.z === CONTRACT.daisCentre.z && env.place.x === CONTRACT.daisCentre.x,
    `placement ${JSON.stringify(env.place)} does not match the dais centre`);
  near(env.place.yaw, Math.PI, 1e-9, 'placement yaw (asset front +Z must face world -Z)');

  /* World bounds of everything the player can hit, i.e. the geometry as it is
   * actually handed to the BVH. This is the check that the placement is real:
   * asset-local numbers said 6.0 x 3.4 about the origin, and these say the same
   * box is centred on the square's dais. */
  const worldBox = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const part of env.colliderParts) {
    const pos = part.getAttribute('position');
    for (let i = 0; i < pos.count; i++) worldBox.expandByPoint(point.fromBufferAttribute(pos, i));
  }
  near((worldBox.min.x + worldBox.max.x) / 2, CONTRACT.daisCentre.x, CONTRACT.tolerance,
    'collider centre X in the square');
  near((worldBox.min.z + worldBox.max.z) / 2, CONTRACT.daisCentre.z, CONTRACT.tolerance,
    'collider centre Z in the square');
  near(worldBox.max.x - worldBox.min.x, CONTRACT.daisSize.x, CONTRACT.tolerance, 'collider width in the square');
  near(worldBox.max.z - worldBox.min.z, CONTRACT.daisSize.z, CONTRACT.tolerance, 'collider depth in the square');
  near(worldBox.min.y, 0, CONTRACT.tolerance, 'colliders sit on the square floor');

  /* Every COL_ node hidden, every socket hidden, nothing else touched. */
  let visibleCol = 0;
  let visMeshes = 0;
  env.visual.traverse((node) => {
    if (/^COL_/.test(node.name) && node.visible) visibleCol++;
    if (/^SOCKET_/.test(node.name) && node.visible) visibleCol++;
    if (/^VIS_/.test(node.name) && node.isMesh) {
      visMeshes++;
      check(node.visible === true, `${node.name} was hidden by the loader`);
      check(node.castShadow === true, `${node.name} does not cast a shadow`);
    }
  });
  check(visibleCol === 0, `${visibleCol} COL_/SOCKET_ nodes would render`);
  check(visMeshes === 11, `visual meshes: got ${visMeshes}, expected 11`);

  /* Materials are the source file's business. Compare what the loader produced
   * against a second, untouched parse of the same bytes. */
  const control = await parse();
  const controlMaterials = new Map();
  control.scene.traverse((n) => {
    if (n.isMesh && n.material && n.material.name) controlMaterials.set(n.name, n.material);
  });
  let compared = 0;
  env.visual.traverse((n) => {
    if (!n.isMesh || !/^VIS_/.test(n.name)) return;
    const before = controlMaterials.get(n.name);
    if (!before) return;
    compared++;
    check(n.material.name === before.name, `${n.name} material renamed`);
    check(n.material.color.getHex() === before.color.getHex(),
      `${n.name} colour patched at runtime: ${n.material.color.getHexString()} vs ${before.color.getHexString()}`);
    check(n.material.roughness === before.roughness, `${n.name} roughness patched at runtime`);
    check(n.material.side === before.side, `${n.name} side patched at runtime`);
    check(n.material.side === THREE.FrontSide, `${n.name} is not single-sided`);
  });
  check(compared === 11, `compared ${compared} materials, expected 11`);

  /* The socket, in world space, is where the podium's panels open. */
  const socket = env.sockets.podium;
  const expectedX = -fileReport.socket[0] + CONTRACT.daisCentre.x;   // yaw PI: x -> -x
  const expectedZ = -fileReport.socket[2] + CONTRACT.daisCentre.z;   //          z -> -z
  near(socket.x, expectedX, 1e-4, 'SOCKET_podium world X');
  near(socket.z, expectedZ, 1e-4, 'SOCKET_podium world Z');
  near(socket.y, CONTRACT.daisTop, CONTRACT.tolerance, 'SOCKET_podium world Y');

  /*
   * Which way round the asset ended up, asserted as a fact about the game
   * rather than about a matrix. The crowd is south (-Z). A speaker stands
   * BEHIND the lectern, so the socket must be north of the lectern's far face
   * and still on the dais. Get the yaw wrong by PI and this flips: the socket
   * lands between the lectern and the crowd, which is in front of the desk.
   */
  const worldBoxes = new Map();
  for (const part of env.colliderParts) {
    const box = new THREE.Box3();
    const pos = part.getAttribute('position');
    for (let i = 0; i < pos.count; i++) box.expandByPoint(point.fromBufferAttribute(pos, i));
    worldBoxes.set(part.name, box);
  }
  const lecternBox = worldBoxes.get('COL_lectern');
  check(socket.z > lecternBox.max.z,
    `the podium socket (z=${fmt(socket.z)}) is on the crowd's side of the lectern ` +
    `(z=${fmt(lecternBox.min.z)}..${fmt(lecternBox.max.z)}) — the asset is facing backwards`);
  check(socket.z < worldBoxes.get('COL_dais').max.z, 'the podium socket is off the back of the dais');
  say(`socket        world (${fmt(socket.x)}, ${fmt(socket.y)}, ${fmt(socket.z)}) — behind the lectern ` +
    `(z ${fmt(lecternBox.min.z)}..${fmt(lecternBox.max.z)}), facing the crowd at -Z`);

  /*
   * The refusals. Each one must return ok:false with the graybox intact, and
   * the warning must be exactly one line — a loader that throws takes the page
   * with it, and a loader that quietly returns half an asset is worse than one
   * that fails.
   */
  const renamed = await parse();
  renamed.scene.traverse((n) => { if (n.name === 'COL_dais') n.name = 'COL_dais_v2'; });
  const warned = [];
  const refused = buildEnvironment(renamed.scene, ENV_DAIS_A);
  check(refused.ok === false, 'a renamed COL_dais was accepted');
  check(refused.reason === 'missing-nodes', `refusal reason: ${refused.reason}`);

  const empty = await parse();
  empty.scene.traverse((n) => { if (/^SOCKET_/.test(n.name)) n.name = 'SOCKET_gone'; });
  const noSocket = buildEnvironment(empty.scene, ENV_DAIS_A);
  check(noSocket.ok === false, 'a renamed SOCKET_podium was accepted');

  const nothing = buildEnvironment(null, ENV_DAIS_A);
  check(nothing.ok === false && nothing.reason === 'no-scene', 'a missing scene was accepted');

  /* And the network path, with the fetch stubbed to fail the way a missing file
   * fails: one warning, ok:false, nothing thrown. */
  const { loadEnvironmentAsset } = await import('../src/play/assets.js');
  const lost = await loadEnvironmentAsset(ENV_DAIS_A, {
    loader: { loadAsync: () => Promise.reject(new Error('404 Not Found')) },
    warn: (m) => warned.push(m)
  });
  check(lost.ok === false && lost.reason === 'load-failed', 'a 404 did not produce a clean refusal');
  check(warned.length === 1, `a failed load warned ${warned.length} times, expected exactly 1`);
  check(/graybox/.test(warned[0] || ''), 'the warning does not say the square falls back to graybox');
  say(`refusals      renamed collider, renamed socket, no scene, 404 — all ok:false, one warning`);

  return { THREE, env };
}

/* ------------------------------------------------- layer 3: the player */

async function playerLayer(built) {
  const { THREE, env } = built;
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
  const { buildSquare } = await import('../src/play/square.js');
  const { createBvhWorld } = await import('../src/walk/bvh-world.js');
  const { createController, defaultTuning } = await import('../src/walk/controller.js');

  const tuning = defaultTuning();
  check(tuning.stepHeight === CONTRACT.stepLimit,
    `the controller's step height moved to ${tuning.stepHeight}; this asset was built against ${CONTRACT.stepLimit}`);

  /* The square exactly as play.html builds it when the asset loads: the
   * procedural pieces minus the two the GLB took over, plus the GLB's own
   * world-baked colliders. */
  const square = buildSquare({ omit: env.replaces });
  check(square.omitted.join(',') === 'dais,lectern', 'the graybox did not drop the dais and lectern');
  const world = createBvhWorld(mergeGeometries(
    [square.colliderGeometry].concat(env.colliderParts), false));

  function walk(from, input, seconds) {
    const c = createController({ tuning, world });
    c.teleport(from.x, from.y, from.z);
    let peakY = from.y;
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      c.advance(dt, input);
      if (c.state.position.y > peakY) peakY = c.state.position.y;
    }
    return { snap: c.snapshot(), peakY };
  }

  /*
   * THE PROOF. South of the dais, walking north at full speed, on a lane clear
   * of the lectern. The controller must climb the 0.22 m collider WITHOUT
   * losing speed and keep going — a step that has to be nudged at, or that
   * costs the player their momentum, is a step the asset broke even though the
   * numbers in the file are right.
   */
  const LANE = 2.0;                                    // clear of the lectern's +/-0.675
  const start = { x: LANE, y: 0, z: CONTRACT.daisCentre.z - 4.0 };
  const southEdge = CONTRACT.daisCentre.z - CONTRACT.daisSize.z / 2;
  const northEdge = CONTRACT.daisCentre.z + CONTRACT.daisSize.z / 2;
  /* 1.4 s is 4 m of walking from 4 m out: past the lip, not yet at the far
   * edge, so the sample is taken standing ON the dais rather than at the exact
   * moment of the step. */
  const north = walk(start, { x: 0, z: 1 }, 1.4);
  near(north.snap.position.y, CONTRACT.daisTop, 0.005, 'walking north onto the dais: standing height');
  check(north.snap.position.z > southEdge && north.snap.position.z < northEdge,
    `the walk did not end on the dais: z=${fmt(north.snap.position.z)} ` +
    `(dais ${fmt(southEdge)}..${fmt(northEdge)})`);
  check(north.snap.grounded, 'the walk ended airborne');
  check(north.snap.speed > tuning.walkSpeed * 0.9,
    `the step cost speed: ${fmt(north.snap.speed)} of ${fmt(tuning.walkSpeed)} m/s`);
  say(`step onto     y ${fmt(north.snap.position.y)} at z ${fmt(north.snap.position.z)}, ` +
    `${fmt(north.snap.speed)} m/s of ${fmt(tuning.walkSpeed)}, grounded — the 0.22 m step survived`);

  /* Carrying on over it and down the far side, so "it steps up" is not quietly
   * "it steps up and then gets stuck on the way off". */
  const across = walk(start, { x: 0, z: 1 }, 3);
  near(across.peakY, CONTRACT.daisTop, 0.005, 'the crossing stood on the dais at some point');
  check(across.snap.position.z > northEdge, `the crossing did not get off the far side ` +
    `(z=${fmt(across.snap.position.z)})`);
  near(across.snap.position.y, 0, 0.005, 'the crossing came back down to the square floor');

  /* The control: the same walk against a world with the asset's colliders left
   * out must NOT end up at 0.22, or the check above is measuring the graybox. */
  const bare = createBvhWorld(square.colliderGeometry);
  const controlController = createController({ tuning, world: bare });
  controlController.teleport(start.x, start.y, start.z);
  for (let i = 0; i < 180; i++) controlController.advance(1 / 60, { x: 0, z: 1 });
  check(Math.abs(controlController.state.position.y - CONTRACT.daisTop) > 0.05,
    'the control walked onto a dais that is not in the world — the proof above proves nothing');
  say(`control       without the GLB colliders the same walk ends at y ` +
    `${fmt(controlController.state.position.y)}, so the proof is measuring the asset`);

  /* The lectern is an intentional blocker, and the same walk down the middle
   * proves it: up the step, then stopped at the desk, never on top of it. */
  const socket = env.sockets.podium;
  const middle = walk({ x: 0, y: 0, z: CONTRACT.daisCentre.z - 4.0 }, { x: 0, z: 1 }, 3);
  near(middle.snap.position.y, CONTRACT.daisTop, 0.005, 'the middle walk also climbed the dais');
  check(middle.snap.position.z < socket.z,
    `the lectern did not block: ended at z=${fmt(middle.snap.position.z)}, socket at ${fmt(socket.z)}`);
  check(middle.snap.position.z + tuning.radius > CONTRACT.daisCentre.z - CONTRACT.daisSize.z / 2,
    'the middle walk was stopped before it even reached the dais');
  check(middle.peakY < CONTRACT.daisTop + tuning.stepHeight,
    `the player climbed the lectern to y=${fmt(middle.peakY)}`);
  say(`lectern       the same walk down the middle stops at z ${fmt(middle.snap.position.z)} ` +
    `(desk face ${fmt(CONTRACT.daisCentre.z - 1.25)}), never climbed`);

  /* The socket has to be reachable: standing on the ground in front of the
   * dais must be inside the podium interactable's radius, facing it. */
  const { createInteractions } = await import('../src/play/interact.js');
  const system = createInteractions();
  system.add({
    id: 'podium',
    position: { x: socket.x, y: socket.y, z: socket.z },
    radius: 3.0,
    canInteract: () => true,
    getPrompt: () => 'E',
    interact: () => 'podium'
  });
  const standing = { x: 0, y: 0, z: CONTRACT.daisCentre.z - 2.6 };   // __play.marks.podium
  const facing = Math.atan2(socket.x - standing.x, socket.z - standing.z);
  check(system.update(standing, facing, {}) !== null,
    `the podium socket is out of reach from the standing mark ` +
    `(${fmt(Math.hypot(socket.x - standing.x, socket.z - standing.z))} m away)`);
  say(`reach         standing mark to socket ` +
    `${fmt(Math.hypot(socket.x - standing.x, socket.z - standing.z))} m, inside the 3.0 m radius`);
}

/* ------------------------------------------------------------------ run */

async function main() {
  const glb = readGlb(GLB);
  const fileReport = fileLayer(glb);
  if (fileReport.fatal) {
    say(`stopped       ${fileReport.fatal} — the layers below read those nodes by name`);
  } else if (GLB === SHIPPING) {
    const built = await loaderLayer(glb, fileReport);
    if (built) await playerLayer(built);
  } else {
    say(`candidate     ${GLB} — file layer only; layers 2 and 3 run on the shipping asset`);
  }

  console.log('\nenv-dais-a — the GLB contract\n');
  for (const line of lines) console.log('  ' + line);
  console.log('');

  if (failures.length) {
    console.error(`FAILED — ${failures.length} of ${checks} checks:\n`);
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`OK — ${checks} checks passed`);
}

main().catch((error) => {
  console.error('glb.test.js threw:', error);
  process.exit(1);
});
