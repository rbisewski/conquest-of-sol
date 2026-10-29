// The globe's Earth-fixed frame (y through the North Pole, longitude 0 along x; see
// latLonToVector in Globe.ts) and the Solar System scene's frame (ecliptic, y up) are matched
// by two directions both know: the Earth's North Pole and the Sun. The globe's Sun comes from
// the game clock (sunDirection), the scene's from the Earth's orbit, so a camera carried
// across keeps seeing the same face of the Earth, lit the same way.

import * as THREE from "three";

const OBLIQUITY = (23.44 * Math.PI) / 180;
/**
 * The Earth's North Pole in the scene. It points to ecliptic longitude 90°, latitude 90° − ε:
 * ecliptic (0, sin ε, cos ε), which is (0, cos ε, −sin ε) with the scene's y up.
 */
export const EARTH_POLE = new THREE.Vector3(0, Math.cos(OBLIQUITY), -Math.sin(OBLIQUITY));
const UP = new THREE.Vector3(0, 1, 0);

/** An orthonormal basis: the pole, the Sun's direction square to it, and their cross product. */
function basis(pole: THREE.Vector3, sun: THREE.Vector3): THREE.Matrix4 {
  const e1 = pole.clone().normalize();
  const e2 = sun.clone().addScaledVector(e1, -sun.dot(e1));
  if (e2.lengthSq() < 1e-12) e2.set(1, 0, 0).addScaledVector(e1, -e1.x);
  e2.normalize();
  const e3 = new THREE.Vector3().crossVectors(e1, e2);
  return new THREE.Matrix4().makeBasis(e1, e2, e3);
}

/** The rotation taking globe directions into the scene, given the Sun's direction in each. */
export function globeToScene(sunInGlobe: THREE.Vector3, sunInScene: THREE.Vector3, target = new THREE.Matrix4()): THREE.Matrix4 {
  return target.multiplyMatrices(basis(EARTH_POLE, sunInScene), basis(UP, sunInGlobe).transpose());
}
