/*
 * The browser's implementation of the controller's collision world.
 *
 * The controller (src/walk/controller.js) knows nothing about three.js. It asks
 * two questions — "what am I overlapping most" and "what is straight below" —
 * and this module answers them against a single merged, static triangle mesh
 * using three-mesh-bvh. The node tests answer the identical two questions with
 * closed-form maths over planes and boxes. Neither implementation can influence
 * the movement rules, which is what makes a node assertion mean something about
 * the browser.
 *
 * Everything here is read-only and allocation-light: it runs six or so times per
 * fixed substep, sixty substeps a second.
 */

import { Vector3, Line3, Box3, Ray, FrontSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export function createBvhWorld(geometry) {
  /* SAH builds a slower tree to build and a faster one to query. The course is
   * static and built once, so that trade is free here. */
  const bvh = new MeshBVH(geometry);

  const segment = new Line3();
  const bounds = new Box3();
  const triPoint = new Vector3();
  const capPoint = new Vector3();
  const bestTri = new Vector3();
  const bestCap = new Vector3();
  const bestNormal = new Vector3();
  const normal = new Vector3();
  const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));

  return {
    bvh,

    /*
     * Deepest overlap between the capsule and the mesh.
     *
     * The push direction is the line from the closest point on the triangle to
     * the closest point on the capsule's axis — not the triangle's face normal.
     * On a flat face the two are the same, but on an edge or a corner only the
     * former is right: a capsule catching the lip of a step is pushed away from
     * the lip, which is how the controller gets a normal that rotates smoothly
     * as it rolls over an edge instead of flipping between two face normals.
     */
    deepestContact(ax, ay, az, bx, by, bz, radius, out) {
      segment.start.set(ax, ay, az);
      segment.end.set(bx, by, bz);
      bounds.makeEmpty();
      bounds.expandByPoint(segment.start);
      bounds.expandByPoint(segment.end);
      bounds.min.addScalar(-radius);
      bounds.max.addScalar(radius);

      let closest = radius;
      let found = false;

      bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(bounds),
        intersectsTriangle: (tri) => {
          const dist = tri.closestPointToSegment(segment, triPoint, capPoint);
          if (dist < closest) {
            closest = dist;
            found = true;
            bestTri.copy(triPoint);
            bestCap.copy(capPoint);
            tri.getNormal(bestNormal);
          }
          return false;
        }
      });

      if (!found) return false;

      normal.subVectors(bestCap, bestTri);
      const len = normal.length();
      if (len > 1e-6) {
        normal.multiplyScalar(1 / len);
      } else {
        /* Axis exactly on the surface: no direction to recover, fall back to
         * the face it landed on. */
        normal.copy(bestNormal);
      }
      out.nx = normal.x; out.ny = normal.y; out.nz = normal.z;
      out.depth = radius - closest;
      return out.depth > 0;
    },

    /*
     * First front-facing triangle straight below (x, y, z), within maxDist.
     *
     * Front-facing matters: the toe probe deliberately starts its ray inside
     * anything taller than a step, and culling back faces makes that a clean
     * miss rather than a hit on the inside of the obstacle's underside.
     */
    raycastDown(x, y, z, maxDist, out) {
      ray.origin.set(x, y, z);
      ray.direction.set(0, -1, 0);
      const hit = bvh.raycastFirst(ray, FrontSide, 0, maxDist);
      if (!hit) return false;
      out.distance = hit.distance;
      out.nx = hit.face.normal.x;
      out.ny = hit.face.normal.y;
      out.nz = hit.face.normal.z;
      return true;
    },

    /* Used by the camera for its pull-back, not by the controller. */
    raycast(origin, direction, maxDist) {
      ray.origin.copy(origin);
      ray.direction.copy(direction);
      return bvh.raycastFirst(ray, FrontSide, 0, maxDist);
    }
  };
}
