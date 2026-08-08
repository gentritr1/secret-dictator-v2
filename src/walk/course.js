/*
 * The test obstacle course.
 *
 * Every piece is a box, declared once in PIECES below with its world transform.
 * The same list builds two things: the meshes you see, and one merged triangle
 * geometry that becomes the collider's BVH. They cannot drift apart, because
 * there is no second list.
 *
 * Nothing here is decorative. Each piece exists to make one movement rule
 * visible and testable:
 *
 *   corridor     1.20 m clear between walls, with a right-angle turn — no
 *                jitter in the passage, clean slide around both corners
 *   corner       a free-standing 90 degree corner in the open, for the same
 *                test without the passage's second wall helping
 *   ramp 15      walkable: full walk speed up it, no height cost
 *   ramp 35      not walkable: refused, slides back down
 *   steps        three 0.17 m risers — climbed without losing speed
 *   obstacle     0.40 m, above the 0.25 m step height — must block, not climb
 *   platform     top of the 15 degree ramp, 1.50 m up, with three open edges
 *                to walk off and fall from
 *
 * Coordinates: +X east, +Z north, spawn at the origin facing +Z.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;

/* --- the two ramps, derived rather than eyeballed -------------------------
 *
 * A ramp is a box rotated about Z, so it rises towards +X. Given the angle, the
 * horizontal run and where the low edge should meet the floor, there is exactly
 * one centre that puts the top face's low corner on y = 0 — so it is computed,
 * not guessed. Guessing leaves the ramp either floating or buried, and a buried
 * ramp starts with an unwalkable lip that quietly invalidates a "ramps work"
 * claim. */
function rampBox(deg, x0, run, z, width, thickness) {
  const a = deg * DEG;
  const len = run / Math.cos(a);           // length along the ramp's own axis
  const half = len / 2;
  const t = thickness / 2;
  /* Offset from the box centre to the low corner of its top face. */
  const ox = -half * Math.cos(a) - t * Math.sin(a);
  const oy = -half * Math.sin(a) + t * Math.cos(a);
  return {
    size: [len, thickness, width],
    pos: [x0 - ox, -oy, z],
    rot: [0, 0, a],
    rise: run * Math.tan(a)
  };
}

const RAMP15 = rampBox(15, 3.0, 5.6, -4.0, 3.0, 0.4);
const RAMP35 = rampBox(35, 2.0, 3.0, -10.0, 3.0, 0.4);

const PLATFORM_TOP = RAMP15.rise;          // 1.5002 m — the ramp lands flush

const COLORS = {
  ground: 0x3b4250,
  wall: 0x6d7789,
  walkable: 0x4f7f5a,
  steep: 0x8a4a49,
  step: 0x4a6a86,
  block: 0x9a7a3c,
  platform: 0x6a5a80
};

export const PIECES = [
  { name: 'ground', size: [80, 1, 80], pos: [0, -0.5, 0], color: COLORS.ground },

  /* Corridor: 1.20 m clear, running +Z then turning +X. */
  { name: 'corridor-w', size: [0.30, 2.5, 8.30], pos: [-0.75, 1.25, 8.15], color: COLORS.wall },
  { name: 'corridor-e', size: [0.30, 2.5, 6.80], pos: [0.75, 1.25, 7.40], color: COLORS.wall },
  { name: 'corridor-n', size: [8.90, 2.5, 0.30], pos: [3.55, 1.25, 12.15], color: COLORS.wall },
  { name: 'corridor-s', size: [7.40, 2.5, 0.30], pos: [4.30, 1.25, 10.65], color: COLORS.wall },

  /* A free-standing right angle, open on two sides. */
  { name: 'corner-a', size: [4.00, 2.0, 0.30], pos: [5.00, 1.00, 3.00], color: COLORS.wall },
  { name: 'corner-b', size: [0.30, 2.0, 4.00], pos: [6.85, 1.00, 5.00], color: COLORS.wall },

  /* Steps: three 0.17 m risers on 0.40 m treads, then a landing. */
  { name: 'step-1', size: [0.40, 0.17, 3.0], pos: [-4.20, 0.085, 0], color: COLORS.step },
  { name: 'step-2', size: [0.40, 0.34, 3.0], pos: [-4.60, 0.170, 0], color: COLORS.step },
  { name: 'step-3', size: [0.40, 0.51, 3.0], pos: [-5.00, 0.255, 0], color: COLORS.step },
  { name: 'step-landing', size: [2.80, 0.51, 3.0], pos: [-6.60, 0.255, 0], color: COLORS.step },

  /* 0.40 m: taller than the 0.25 m step height, so it blocks. */
  { name: 'low-obstacle', size: [3.0, 0.40, 0.5], pos: [0, 0.20, -3.0], color: COLORS.block },

  /* 15 degrees, and the platform it lands on. */
  { name: 'ramp-15', size: RAMP15.size, pos: RAMP15.pos, rot: RAMP15.rot, color: COLORS.walkable },
  {
    name: 'platform',
    size: [4.40, PLATFORM_TOP, 5.00],
    pos: [10.80, PLATFORM_TOP / 2, -4.0],
    color: COLORS.platform
  },

  /* 35 degrees, and the ledge it would reach if you could climb it. */
  { name: 'ramp-35', size: RAMP35.size, pos: RAMP35.pos, rot: RAMP35.rot, color: COLORS.steep },
  {
    name: 'steep-ledge',
    size: [2.00, RAMP35.rise, 3.00],
    pos: [6.00, RAMP35.rise / 2, -10.0],
    color: COLORS.steep
  }
];

/*
 * Named spots, so a scripted review does not have to re-derive the geometry.
 * Each is a place to teleport to, with the input that exercises the feature.
 */
export const MARKS = {
  spawn: { at: [0, 0, 0], go: [0, 1], note: 'open floor, facing the corridor' },
  corridor: { at: [0, 0, 5.0], go: [0, 1], note: '1.2 m passage, wall dead ahead at z = 12.00' },
  corridorCorner: { at: [0, 0, 10.0], go: [0, 1], note: 'runs into the far wall, then slide +X' },
  wallHeadOn: { at: [0, 0, 10.0], go: [0, 1], note: 'stops at z = 11.65 (12.00 minus the radius)' },
  wallDiagonal: { at: [3.5, 0, 1.0], go: [0.707, 0.707], note: 'slides east along corner-a (face z = 2.85)' },
  corner: {
    at: [4.0, 0, 5.0],
    go: [0.707, -0.707],
    note: 'wedges into the inside of the right angle; settles at x 6.35, z 3.50'
  },
  ramp15: { at: [1.6, 0, -4.0], go: [1, 0], note: 'walkable, climbs to y = 1.50 at x = 8.60' },
  ramp35: { at: [0.8, 0, -10.0], go: [1, 0], note: 'refused; stalls at x 1.89 with y = 0' },
  onRamp35: { at: [3.5, 1.15, -10.0], go: [1, 0], note: 'dropped onto the 35 deg face; slides back to the foot' },
  steps: { at: [-3.0, 0, 0], go: [-1, 0], note: '3 x 0.17 m, landing at y = 0.51 (walk off it after 2 s)' },
  obstacle: { at: [0, 0, -1.6], go: [0, -1], note: '0.40 m block, must stop at z = -2.40' },
  platformEdge: { at: [11.5, PLATFORM_TOP, -4.0], go: [1, 0], note: 'walk off the +X edge, fall 1.50 m' }
};

export const COURSE_FACTS = {
  platformTop: PLATFORM_TOP,
  ramp15Rise: RAMP15.rise,
  ramp35Rise: RAMP35.rise,
  corridorWidth: 1.2,
  stepRise: 0.17,
  obstacleHeight: 0.4
};

/*
 * Build the scene graph and the collider in one pass.
 *
 * The collider geometry is baked into world space (each box's matrix applied to
 * its vertices) and merged into one buffer. One mesh, one BVH, identity
 * transform — so the controller's world-space queries need no matrix work at
 * all, which is the difference between a clean collision module and one that
 * quietly transforms a segment six times per substep.
 */
export function buildCourse() {
  const group = new THREE.Group();
  group.name = 'course';
  const colliderParts = [];

  for (const piece of PIECES) {
    const geom = new THREE.BoxGeometry(piece.size[0], piece.size[1], piece.size[2]);
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: piece.color }));
    mesh.name = piece.name;
    mesh.position.set(piece.pos[0], piece.pos[1], piece.pos[2]);
    if (piece.rot) mesh.rotation.set(piece.rot[0], piece.rot[1], piece.rot[2]);
    mesh.castShadow = piece.name !== 'ground';
    mesh.receiveShadow = true;
    group.add(mesh);

    /* Wireframe edges: flat lambert on flat colours reads as one blob from a
     * distance, and this is a course you have to judge distances against. */
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: 0x0d0f13, transparent: true, opacity: 0.55 })
    );
    edges.position.copy(mesh.position);
    edges.rotation.copy(mesh.rotation);
    group.add(edges);

    mesh.updateMatrix();
    const baked = geom.clone();
    baked.applyMatrix4(mesh.matrix);
    baked.deleteAttribute('uv');
    colliderParts.push(baked);
  }

  const colliderGeometry = mergeGeometries(colliderParts, false);
  for (const g of colliderParts) g.dispose();

  const grid = new THREE.GridHelper(80, 80, 0x445066, 0x333a46);
  grid.position.y = 0.002;               // just above the floor, no z-fighting
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  group.add(grid);

  return { group, colliderGeometry };
}
