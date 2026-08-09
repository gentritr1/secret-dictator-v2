/*
 * The runtime asset seam: one production GLB in place of two graybox boxes.
 *
 * This is the module `docs/BLENDER_PIPELINE.md` asks for at Gate 2 — the thing
 * that turns a validated export into geometry the player can see and walk on,
 * without the rest of the page learning that an asset exists:
 *
 *   1. find and hide every COL_* node;
 *   2. clone its geometry and apply the node's matrixWorld;
 *   3. remove visual-only attributes and merge the pieces;
 *   4. send the result to createBvhWorld;                (main.js does 3 and 4)
 *   5. resolve required SOCKET_* nodes by exact name;
 *   6. refuse the production asset and keep the graybox fallback if a required
 *      node is missing.
 *
 * Three rules this file exists to enforce, all of them from the pipeline:
 *
 * PLACEMENT LIVES HERE, NOT IN THE MESH. The asset is authored in its own
 * space with a bottom-centre pivot at (0,0,0) and its front on +Z — the runtime
 * convention, locked by the front-marker test. The square wants it at (0, 0, 9)
 * facing the crowd, which is -Z. So the loader parents the imported scene under
 * one group carrying `position` and `yaw`, and that group is the only transform
 * in the chain. Nobody may "fix" an orientation by rotating vertices in Blender
 * to suit one placement: the same dais dropped into a second scene would then
 * be wrong, and the .blend would no longer describe the asset.
 *
 * MATERIALS ARE NOT PATCHED AT RUNTIME. Nothing below reads, clones or writes
 * `mesh.material`. Colour, roughness and single-sidedness are decisions made in
 * the source file and validated on export; a runtime tweak here would mean the
 * .blend and the game disagree about what the asset looks like, and the asset
 * lab (asset-lab.html) would be reviewing something the player never sees.
 * `castShadow` / `receiveShadow` ARE set — those are scene-graph facts about
 * how this asset sits in this square's lighting, not properties of the art.
 *
 * A MISSING ASSET IS NOT A BROKEN GAME. Every failure path — file missing,
 * bytes unparseable, a required node renamed by a careless re-export — returns
 * a plain `{ ok: false, reason }` and one console warning. It never throws. The
 * caller builds the procedural square exactly as it did before this file
 * existed, and the match is fully playable.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * The dais-and-lectern cluster: the first production asset, and the whole of
 * the Gate 2 runtime contract in one object literal.
 *
 * `place` is the documented placement transform the pipeline demands instead of
 * a silent correction. yaw = PI turns the asset's authored front (+Z) to face
 * world -Z, which is south, which is where the ring of citizens and the player
 * spawn are. `(0, 0, 9)` is the dais centre from the gameplay measurements
 * table, and the asset's pivot is bottom-centre, so the two agree by
 * construction rather than by adjustment.
 */
export const ENV_DAIS_A = {
  id: 'env-dais-a',
  url: '/assets/models/environment/env-dais-a.glb',

  place: { x: 0, y: 0, z: 9, yaw: Math.PI },

  /* Which pieces of the procedural square this asset takes over. The graybox
   * still builds everything else — ground, kerbs, bell, bench, grid. */
  replaces: ['dais', 'lectern'],

  /*
   * Refuse the asset unless all of these are present, by exact name.
   *
   * The list is deliberately the load-bearing subset rather than every node in
   * the file: these are the ones something in the game reads. A re-export that
   * renames a plank is a review problem; a re-export that renames COL_dais is a
   * player falling through the floor, and it must fail loudly enough to fall
   * back instead.
   */
  requiredNodes: ['COL_dais', 'COL_lectern', 'SOCKET_podium'],

  /* Logical name -> node name. The game asks for `podium`; the asset decides
   * what it calls the empty. */
  sockets: { podium: 'SOCKET_podium' }
};

/**
 * Build the runtime environment from an already-parsed glTF scene.
 *
 * Split out from the network so it can be driven headlessly: test/glb.test.js
 * calls GLTFLoader.parse on the real bytes and then this, which means the node
 * gate exercises the placement, the harvest and the socket resolution that the
 * browser runs — not a re-description of them.
 *
 * @param {THREE.Object3D} gltfScene  gltf.scene as GLTFLoader returned it
 * @param {object} spec               ENV_DAIS_A or another of the same shape
 * @returns {object} `{ ok: true, ... }` or `{ ok: false, reason, detail }`
 */
export function buildEnvironment(gltfScene, spec) {
  if (!gltfScene) return fail(spec, 'no-scene', 'the parsed glTF had no scene');

  const place = spec.place || { x: 0, y: 0, z: 0, yaw: 0 };

  /* The one transform in the chain. Named for the asset so it is obvious in a
   * scene-graph dump which group is placement and which is authored. */
  const visual = new THREE.Group();
  visual.name = spec.id;
  visual.position.set(place.x || 0, place.y || 0, place.z || 0);
  visual.rotation.y = place.yaw || 0;
  visual.add(gltfScene);
  visual.updateMatrixWorld(true);

  const byName = new Map();
  const colMeshes = [];
  const visMeshes = [];
  const socketNodes = [];
  const strays = [];

  visual.traverse((node) => {
    if (node === visual) return;
    if (node.name) byName.set(node.name, node);
    if (node.isLight || node.isCamera) { strays.push(node); return; }
    if (node.name.indexOf('COL_') === 0) colMeshes.push(node);
    else if (node.name.indexOf('SOCKET_') === 0) socketNodes.push(node);
    else if (node.name.indexOf('VIS_') === 0 && node.isMesh) visMeshes.push(node);
  });

  const missing = (spec.requiredNodes || []).filter((n) => !byName.has(n));
  if (missing.length) {
    return fail(spec, 'missing-nodes', `required node(s) absent: ${missing.join(', ')}`);
  }

  /*
   * A GLB is not allowed to bring its own lighting into a square that has a
   * lighting story. The exporter recipe excludes review lights and cameras;
   * this is the belt to that braces, because an authored point light arriving
   * unnoticed is exactly the kind of thing nobody sees until the night mood is
   * wrong and nobody knows why.
   */
  for (const stray of strays) {
    if (stray.parent) stray.parent.remove(stray);
  }

  /* -------------------------------------------------------- collision */

  const colliderParts = [];
  for (const mesh of colMeshes) {
    /* Hidden, and kept in the graph rather than deleted: the pipeline's own
     * wording is "find and hide", and a reviewer looking for COL_dais in a
     * scene dump should find it switched off rather than wonder where it
     * went. It is inert — no shadows, no matrix updates. */
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    if (!mesh.isMesh || !mesh.geometry) continue;

    const baked = mesh.geometry.clone();
    baked.applyMatrix4(mesh.matrixWorld);
    /*
     * Strip everything the collider does not use. Two reasons, and the second
     * one is the one that bites: the BVH needs positions, and mergeGeometries
     * refuses a set of geometries whose attributes do not match — the graybox
     * collider is position+normal (src/play/square.js deletes its uv), so a
     * TEXCOORD_0 riding along in the GLB would make the merge fail at boot.
     */
    for (const attribute of Object.keys(baked.attributes)) {
      if (attribute !== 'position' && attribute !== 'normal') baked.deleteAttribute(attribute);
    }
    baked.morphAttributes = {};
    baked.name = mesh.name;
    colliderParts.push(baked);
  }

  if (!colliderParts.length) {
    return fail(spec, 'no-collision', 'no COL_* geometry to build a collision world from');
  }

  /* ----------------------------------------------------------- sockets */

  const sockets = {};
  const world = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  for (const [logical, nodeName] of Object.entries(spec.sockets || {})) {
    const node = byName.get(nodeName);
    if (!node) return fail(spec, 'missing-socket', `socket ${nodeName} absent`);
    node.visible = false;
    node.getWorldPosition(world);
    node.getWorldQuaternion(quat);
    euler.setFromQuaternion(quat, 'YXZ');
    sockets[logical] = { x: world.x, y: world.y, z: world.z, yaw: euler.y, node: nodeName };
  }

  /* ------------------------------------------------------------ visual */

  let triangles = 0;
  const materials = new Set();
  for (const mesh of visMeshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute('position');
    triangles += (index ? index.count : (position ? position.count : 0)) / 3;
    /* Read only. See the header: no material is written here, ever. */
    const m = mesh.material;
    if (Array.isArray(m)) for (const one of m) materials.add(one.name || one.uuid);
    else if (m) materials.add(m.name || m.uuid);
  }

  return {
    ok: true,
    id: spec.id,
    url: spec.url,
    place,
    replaces: (spec.replaces || []).slice(),
    visual,
    colliderParts,
    sockets,
    nodes: Array.from(byName.keys()),
    stats: {
      visMeshes: visMeshes.length,
      colMeshes: colliderParts.length,
      sockets: Object.keys(sockets).length,
      triangles,
      materials: Array.from(materials).sort(),
      strays: strays.length
    }
  };
}

/**
 * Load the asset over the network and build it. Never throws, never rejects.
 *
 * @param {object} spec       ENV_DAIS_A by default
 * @param {object} [options]  `{ loader, warn }` — both injectable for tests
 * @returns {Promise<object>} the buildEnvironment result, ok true or false
 */
export async function loadEnvironmentAsset(spec = ENV_DAIS_A, options = {}) {
  const warn = options.warn || ((message) => console.warn(message));
  let gltf = null;

  try {
    const loader = options.loader || new GLTFLoader();
    gltf = await loader.loadAsync(spec.url);
  } catch (error) {
    const detail = (error && error.message) ? error.message : String(error);
    const result = fail(spec, 'load-failed', detail);
    warn(graybox(spec, result));
    return result;
  }

  const built = buildEnvironment(gltf.scene, spec);
  if (!built.ok) warn(graybox(spec, built));
  return built;
}

function fail(spec, reason, detail) {
  return { ok: false, id: spec && spec.id, url: spec && spec.url, reason, detail };
}

/* One sentence, and it has to say all three things: which asset, what went
 * wrong, and that the game is still playable. A warning that only says
 * "404" sends the reader to the network tab instead of to the manifest. */
function graybox(spec, result) {
  return `[assets] ${spec.id} not loaded (${result.reason}: ${result.detail}) — ` +
    `${spec.url} · the square falls back to procedural graybox and the match is playable.`;
}
