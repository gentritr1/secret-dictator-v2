/*
 * The graybox town square.
 *
 * Same discipline as src/walk/course.js and for the same reason: every piece is
 * declared once, and that one list builds both the meshes you see and the merged
 * triangle geometry the collider's BVH is built from. There is no second list to
 * drift out of step, so what you walk into is always what you can see.
 *
 * Primitives only. This is Step 4 — the point is a place to stand while making
 * real decisions, not a place worth looking at. Materials, proportions and
 * anything with an opinion belong to the art pass.
 *
 *   ground     40 x 40, with a low kerb wall on all four sides so walking off
 *              the edge is not a way to fall out of the game
 *   dais       a 0.22 m platform at the north end — under the step height, so
 *              it is walked up rather than walked into, which is the one
 *              movement rule this square exercises on purpose
 *   lectern    the box on the dais; the podium interactable's anchor
 *   bell post  east, a column with a block on top
 *   bench      west, a slab on two legs
 *
 * Coordinates match the workbench: +X east, +Z north, the square's centre is
 * the origin, and the player spawns south of it facing the dais.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const COLORS = {
  ground: 0x3b4250,
  kerb: 0x5a6274,
  dais: 0x59617a,
  lectern: 0x8a7a4c,
  post: 0x6d7789,
  bell: 0xb08a3c,
  bench: 0x7a6a52
};

/* Half-extent of the walkable floor, and where the kerb sits. */
const HALF = 20;
const KERB = 13;

export const DAIS = { x: 0, z: 9, top: 0.22 };
/* The bell sits within sight of the dais rather than across the square: the
 * morning report and the ballot tally are acknowledged at it every single day,
 * and a fifteen-second walk between two things you must both do every round is
 * not pacing, it is a chore. The bench is deliberately further out — it is the
 * one thing you never have to visit. */
export const BELL = { x: 5.5, z: 5.5 };
export const BENCH = { x: -9, z: 0, seatY: 0.45 };
export const SPAWN = { x: 0, y: 0, z: 2.0 };

/* Where the citizens stand. A ring around the origin, wide enough that the
 * player can walk between the crowd and the dais without shouldering through
 * anybody. */
export const RING_RADIUS = 6.0;

/**
 * A bot's standing spot. Deterministic in the seat index and the roster size —
 * nothing here may vary between two runs of the same seed, and the cheapest way
 * to guarantee that is arithmetic with no state in it.
 *
 * Seat 0 is due south (nearest the camera at spawn) and the ring runs clockwise,
 * so the seating order on screen is the seating order in the rules.
 */
export function seatPosition(index, count) {
  const angle = Math.PI + (index / count) * Math.PI * 2;
  return {
    x: Math.sin(angle) * RING_RADIUS,
    y: 0,
    z: Math.cos(angle) * RING_RADIUS
  };
}

const PIECES = [
  /* name, size [x,y,z], pos [x,y,z] (centre), colour */
  { name: 'ground', size: [HALF * 2, 0.5, HALF * 2], pos: [0, -0.25, 0], color: COLORS.ground },

  { name: 'kerb-n', size: [KERB * 2 + 1.0, 1.1, 1.0], pos: [0, 0.55, KERB], color: COLORS.kerb },
  { name: 'kerb-s', size: [KERB * 2 + 1.0, 1.1, 1.0], pos: [0, 0.55, -KERB], color: COLORS.kerb },
  { name: 'kerb-e', size: [1.0, 1.1, KERB * 2 + 1.0], pos: [KERB, 0.55, 0], color: COLORS.kerb },
  { name: 'kerb-w', size: [1.0, 1.1, KERB * 2 + 1.0], pos: [-KERB, 0.55, 0], color: COLORS.kerb },

  /* The dais top sits at 0.22 m: below the controller's 0.25 m step height, so
   * it is stepped onto at full walking speed. A 0.30 m dais would refuse the
   * player and nobody would understand why. */
  { name: 'dais', size: [6.0, DAIS.top, 3.4], pos: [DAIS.x, DAIS.top / 2, DAIS.z], color: COLORS.dais },
  { name: 'lectern', size: [1.2, 1.05, 0.55], pos: [DAIS.x, DAIS.top + 0.525, DAIS.z - 0.9], color: COLORS.lectern },

  { name: 'bell-post', size: [0.34, 2.2, 0.34], pos: [BELL.x, 1.1, BELL.z], color: COLORS.post },
  { name: 'bell', size: [0.7, 0.6, 0.7], pos: [BELL.x, 2.5, BELL.z], color: COLORS.bell },

  { name: 'bench-seat', size: [0.7, 0.14, 2.6], pos: [BENCH.x, BENCH.seatY, BENCH.z], color: COLORS.bench },
  { name: 'bench-leg-a', size: [0.5, BENCH.seatY, 0.2], pos: [BENCH.x, BENCH.seatY / 2, BENCH.z - 1.0], color: COLORS.bench },
  { name: 'bench-leg-b', size: [0.5, BENCH.seatY, 0.2], pos: [BENCH.x, BENCH.seatY / 2, BENCH.z + 1.0], color: COLORS.bench }
];

/**
 * Build the square.
 * @returns {{ group: THREE.Group, colliderGeometry: THREE.BufferGeometry }}
 */
export function buildSquare() {
  const group = new THREE.Group();
  group.name = 'square';
  const colliderParts = [];

  for (const piece of PIECES) {
    const geom = new THREE.BoxGeometry(piece.size[0], piece.size[1], piece.size[2]);
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: piece.color }));
    mesh.name = piece.name;
    mesh.position.set(piece.pos[0], piece.pos[1], piece.pos[2]);
    mesh.castShadow = piece.name !== 'ground';
    mesh.receiveShadow = true;
    group.add(mesh);

    /* Flat lambert on flat colours reads as one blob from across the square,
     * and this is a square you have to judge distances across. */
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: 0x0d0f13, transparent: true, opacity: 0.5 })
    );
    edges.position.copy(mesh.position);
    group.add(edges);

    mesh.updateMatrix();
    const baked = geom.clone();
    baked.applyMatrix4(mesh.matrix);
    baked.deleteAttribute('uv');
    colliderParts.push(baked);
  }

  const colliderGeometry = mergeGeometries(colliderParts, false);
  for (const g of colliderParts) g.dispose();

  const grid = new THREE.GridHelper(HALF * 2, HALF * 2, 0x445066, 0x333a46);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  group.add(grid);

  return { group, colliderGeometry };
}
