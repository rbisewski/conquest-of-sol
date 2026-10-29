// Body-fixed frames of the bodies drawn from a surface map, from the IAU's rotational elements
// (Archinal et al. 2018, the WGCCRE 2015 report): the north pole's right ascension and
// declination, and W, the prime meridian's angle east along the body's equator from the
// equator's ascending node on the celestial (ICRF) equator. A frame's columns are the scene
// directions of longitude 0°, the north pole and longitude 90° west, the globe's convention
// ((cos lat cos lon, sin lat, −cos lat sin lon)) that bodyArt.ts samples maps in. The Earth's
// frame comes from the globe instead (earthFrame.ts). The Moon and the great moons of Jupiter and
// Saturn keep their near sides (longitude 0°) towards their planets as they go round, which the
// IAU's mean rotations only do on average, so their meridians are set from where the planet is.
// Display only.

import * as THREE from "three";

const DEG = Math.PI / 180;
const OBLIQUITY = 23.4392911 * DEG;

interface Rotation {
  /** Pole right ascension and declination (degrees) at J2000 and their drift per Julian century. */
  ra: [number, number];
  dec: [number, number];
  /** Prime meridian at J2000 (degrees) and its turn per day; absent for a body facing its parent. */
  w?: [number, number];
}

/**
 * Mercury: MESSENGER's pole and spin (the small librations are left out). Venus: its pole, but
 * the cloud tops' turn, not the surface's: they race round westward in about four days. Luna:
 * its mean pole, facing the Earth. Mars: the 2009 elements (the small periodic terms left out).
 * Ceres: Dawn's. Jupiter: System III, the turn of its magnetic field (its clouds have no fixed
 * longitudes). Io, Europa, Ganymede, Callisto: their mean poles (the small periodic terms left
 * out), facing Jupiter. Saturn: System III, as Jupiter (its pole also sets the rings' plane).
 * Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus: their mean poles, facing Saturn.
 */
const ROTATIONS: Record<string, Rotation> = {
  Mercury: { ra: [281.0103, -0.0328], dec: [61.4155, -0.0049], w: [329.5988, 6.1385108] },
  Venus: { ra: [272.76, 0], dec: [67.16, 0], w: [0, -90] },
  Luna: { ra: [269.9949, 0.0031], dec: [66.5392, 0.013] },
  Mars: { ra: [317.68143, -0.1061], dec: [52.8865, -0.0609], w: [176.63, 350.89198226] },
  Ceres: { ra: [291.418, 0], dec: [66.764, 0], w: [170.65, 952.1532] },
  Jupiter: { ra: [268.056595, -0.006499], dec: [64.495303, 0.002413], w: [284.95, 870.536] },
  Io: { ra: [268.05, -0.009], dec: [64.5, 0.003] },
  Europa: { ra: [268.08, -0.009], dec: [64.51, 0.003] },
  Ganymede: { ra: [268.2, -0.009], dec: [64.57, 0.003] },
  Callisto: { ra: [268.72, -0.009], dec: [64.83, 0.003] },
  Saturn: { ra: [40.589, -0.036], dec: [83.537, -0.004], w: [38.9, 810.7939024] },
  Mimas: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Enceladus: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Tethys: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Dione: { ra: [40.66, -0.036], dec: [83.52, -0.004] },
  Rhea: { ra: [40.38, -0.036], dec: [83.55, -0.004] },
  Titan: { ra: [39.4827, 0], dec: [83.4279, 0] },
  Iapetus: { ra: [318.16, -3.949], dec: [75.03, -1.143] },
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

/**
 * The rotation taking a body's own frame into the scene, Julian years after J2000. toParent is
 * the scene direction from the body to its parent, for a body that faces it.
 */
export function bodyToScene(id: string, years: number, toParent: THREE.Vector3, target = new THREE.Matrix4()): THREE.Matrix4 {
  const r = ROTATIONS[id]!;
  const centuries = years / 100;
  const ra = (r.ra[0] + r.ra[1] * centuries) * DEG;
  const dec = (r.dec[0] + r.dec[1] * centuries) * DEG;
  // In the ICRF: the pole, the ascending node of the body's equator (90° east of the pole's RA)
  // and the direction 90° on from the node along the equator.
  const pole = new THREE.Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  const p = equatorialToScene(pole.x, pole.y, pole.z);
  let m: THREE.Vector3;
  if (r.w) {
    const w = ((r.w[0] + r.w[1] * years * 365.25) % 360) * DEG;
    const node = new THREE.Vector3(-Math.sin(ra), Math.cos(ra), 0);
    const across = new THREE.Vector3().crossVectors(pole, node);
    const meridian = node.multiplyScalar(Math.cos(w)).addScaledVector(across, Math.sin(w));
    m = equatorialToScene(meridian.x, meridian.y, meridian.z);
  } else {
    // Longitude 0° towards the parent, in the plane of the equator.
    m = toParent.clone().addScaledVector(p, -toParent.dot(p)).normalize();
  }
  const east = new THREE.Vector3().crossVectors(p, m);
  return target.makeBasis(m, p, east.negate());
}
