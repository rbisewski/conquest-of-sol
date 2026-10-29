// Where the camera was when the globe and the Solar System view handed it over: its direction
// from the Earth's centre in the globe's Earth-fixed frame, its distance in Earth radii, and
// whether the globe glides on in (after flying home). Also the Solar System view itself, which
// the globe drives while it has the camera. Plain (not reactive) state shared by GlobeView and
// SolarView.

import * as THREE from "three";
import { GLOBE_FARTHEST } from "../globe/Globe";
import type { SolarSystem } from "./SolarSystem";

export const handoff = {
  direction: new THREE.Vector3(0.9, 1.2, 2.9).normalize(),
  distance: GLOBE_FARTHEST,
  glide: false,
  solar: null as SolarSystem | null,
};
