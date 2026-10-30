// Body-fixed frames of the bodies drawn from a surface map, from the IAU's rotational elements
// (Archinal et al. 2018, the WGCCRE 2015 report): the north pole's right ascension and
// declination, and W, the prime meridian's angle east along the body's equator from the
// equator's ascending node on the celestial (ICRF) equator. A frame's columns are the scene
// directions of longitude 0°, the north pole and longitude 90° west, the globe's convention
// ((cos lat cos lon, sin lat, −cos lat sin lon)) that bodyArt.ts samples maps in. The Earth's
// frame comes from the globe instead (earthFrame.ts). The Moon, the great moons of Jupiter,
// Saturn and Uranus, and Triton keep their near sides (longitude 0°) towards their planets as
// they go round, which the IAU's mean rotations only do on average, so their meridians are set
// from where the planet is.
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
  /**
   * The pole's swing with a precessing node N (degrees at J2000 and per Julian century): the
   * right ascension gains ra[k] sin((k+1)N) and the declination dec[k] cos((k+1)N), degrees.
   */
  swing?: { node: [number, number]; ra: number[]; dec: number[] };
}

/**
 * Mercury: MESSENGER's pole and spin (the small librations are left out). Venus: its pole, but
 * the cloud tops' turn, not the surface's: they race round westward in about four days. Luna:
 * its mean pole, facing the Earth. Mars: the 2009 elements (the small periodic terms left out).
 * Ceres: Dawn's. Jupiter: System III, the turn of its magnetic field (its clouds have no fixed
 * longitudes). Io, Europa, Ganymede, Callisto: their mean poles (the small periodic terms left
 * out), facing Jupiter. Saturn: System III, as Jupiter (its pole also sets the rings' plane).
 * Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus: their mean poles, facing Saturn.
 * Uranus: its interior's turn (Voyager's radio period). Its pole lies almost in its orbit, and
 * the IAU's north is the one on the north side of the Solar System, so it turns backwards (W
 * falls). Miranda, Ariel, Umbriel, Titania, Oberon: their mean poles (Miranda's 4° wobble left
 * out), facing Uranus. Neptune: its interior's turn, its pole nodding a little with Triton's
 * precessing orbit. Triton: its pole swings round with that orbit, by up to 32°, so its swing is
 * kept; facing Neptune. Pluto: the IAU's (the right-hand rule's north, longitude 0° facing Charon).
 * Eris: locked to Dysnomia, so its pole is Dysnomia's orbit pole (Holler et al. 2021) and its day
 * Dysnomia's 15.79 days. Haumea: the pole of its ring and of Hi'iaka's orbit (Ortiz et al. 2017),
 * its 3.92-hour day. Makemake: its 22.83-hour day (Hromakina et al. 2019); its pole is unknown,
 * so it is put square to our line of sight (its moon's orbit is seen edge-on) as near the
 * ecliptic's pole as that allows. Eris's, Haumea's and Makemake's prime meridians are unknown
 * and set at 0° at J2000.
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
  Uranus: { ra: [257.311, 0], dec: [-15.175, 0], w: [203.81, -501.1600928] },
  Miranda: { ra: [257.43, 0], dec: [-15.08, 0] },
  Ariel: { ra: [257.43, 0], dec: [-15.1, 0] },
  Umbriel: { ra: [257.43, 0], dec: [-15.1, 0] },
  Titania: { ra: [257.43, 0], dec: [-15.1, 0] },
  Oberon: { ra: [257.43, 0], dec: [-15.1, 0] },
  Neptune: { ra: [299.36, 0], dec: [43.46, 0], w: [249.978, 541.1397757], swing: { node: [357.85, 52.316], ra: [0.7], dec: [-0.51] } },
  Triton: {
    ra: [299.36, 0],
    dec: [41.17, 0],
    swing: { node: [177.85, 52.316], ra: [-32.35, -6.28, -2.08, -0.74, -0.28, -0.11, -0.07, -0.02, -0.01], dec: [22.55, 2.1, 0.55, 0.16, 0.05, 0.02, 0.01] },
  },
  Pluto: { ra: [132.993, 0], dec: [-6.163, 0], w: [302.695, 56.3625225] },
  Eris: { ra: [36.17, 0], dec: [44.51, 0], w: [0, 22.805163] },
  Haumea: { ra: [285.1, 0], dec: [-10.6, 0], w: [0, 2206.704346] },
  Makemake: { ra: [325.9, 0], dec: [56.2, 0], w: [0, 378.505778] },
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
  let raDeg = r.ra[0] + r.ra[1] * centuries;
  let decDeg = r.dec[0] + r.dec[1] * centuries;
  if (r.swing) {
    const node = (r.swing.node[0] + r.swing.node[1] * centuries) * DEG;
    r.swing.ra.forEach((a, k) => (raDeg += a * Math.sin((k + 1) * node)));
    r.swing.dec.forEach((a, k) => (decDeg += a * Math.cos((k + 1) * node)));
  }
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
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
