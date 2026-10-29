// Body-fixed frames of the bodies drawn from a surface map, from the IAU's rotational elements
// (Archinal et al. 2018, the WGCCRE 2015 report): the north pole's right ascension and
// declination, and W, the prime meridian's angle east along the body's equator from the
// equator's ascending node on the celestial (ICRF) equator. A frame's columns are the scene
// directions of longitude 0°, the north pole and longitude 90° west, the globe's convention
// ((cos lat cos lon, sin lat, −cos lat sin lon)) that bodyArt.ts samples maps in. The Earth's
// frame comes from the globe instead (earthFrame.ts). Display only.

import * as THREE from "three";

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4392911 * DEG;

interface Rotation {
  /** Pole right ascension and declination (degrees) at J2000 and their drift per Julian century. */
  ra: [number, number];
  dec: [number, number];
  /** Prime meridian at J2000 (degrees) and its turn per day. */
  w: [number, number];
}

/** Mercury: MESSENGER's pole and spin (the small librations are left out). */
const ROTATIONS: Record<string, Rotation> = {
  Mercury: { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], w: [329.5988, 6.1385108] },
};

/** ICRF (equatorial) to the scene: equatorial to ecliptic, then the scene's y up (x, z, −y). */
function equatorialToScene(x: number, y: number, z: number): THREE.Vector3 {
  const ye = y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY);
  const ze = -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY);
  return new THREE.Vector3(x, ze, -ye);
}

export function hasFrame(id: string): boolean {
  return id in ROTATIONS;
}

/** The rotation taking a body's own frame into the scene, Julian years after J2000. */
export function bodyToScene(id: string, years: number, target = new THREE.Matrix4()): THREE.Matrix4 {
  const r = ROTATIONS[id]!;
  const centuries = years / 100;
  const ra = (r.ra[0] + r.ra[1] * centuries) * DEG;
  const dec = (r.dec[0] + r.dec[1] * centuries) * DEG;
  const w = ((r.w[0] + r.w[1] * years * 365.25) % 360) * DEG;
  // In the ICRF: the pole, the ascending node of the body's equator (90° east of the pole's RA)
  // and the direction 90° on from the node along the equator.
  const pole = new THREE.Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  const node = new THREE.Vector3(-Math.sin(ra), Math.cos(ra), 0);
  const across = new THREE.Vector3().crossVectors(pole, node);
  const meridian = node.clone().multiplyScalar(Math.cos(w)).addScaledVector(across, Math.sin(w));
  const east = new THREE.Vector3().crossVectors(pole, meridian);
  const m = equatorialToScene(meridian.x, meridian.y, meridian.z);
  const p = equatorialToScene(pole.x, pole.y, pole.z);
  const e = equatorialToScene(east.x, east.y, east.z);
  return target.makeBasis(m, p, e.negate());
}
