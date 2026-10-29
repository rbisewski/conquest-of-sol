// The Solar System's small bodies (asteroids, comets, asteroidal moons, the dwarf planets too
// small for a disc of their own) as one set of pixel-art point sprites. Rocks come from bodyArt.ts's atlas: lumpy
// for asteroids, round and icy for dwarf planets, tinted per body, and lit in the shader from the
// Sun's real direction in view space, in the same shade steps as the discs, so they show phases.
// A comet is an icy nucleus that, inside COMET_ACTIVE AU of the Sun, grows a coma and two tails
// streaming away from it on screen: a straight blue ion tail and a paler, wider dust tail
// curving off it, longer the nearer the Sun (and shorter seen end-on).

import * as THREE from "three";
import type { SpaceBodyDef } from "../../sim/content";
import { ROCK_CELL, rockAtlas, rockCell } from "./bodyArt";

/** Art pixels across a comet's sprite, room for its tails. */
const COMET_CELL = 32;
/** Comets have a coma and tails within this many AU of the Sun, at full length within COMET_FULL. */
const COMET_ACTIVE = 6;
const COMET_FULL = 1;

/** Asteroid tints by kind (carbonaceous, stony, metallic), and the small dwarf planets' (icy, reddish, pale). */
const ROCK_TINTS = ["#9a948c", "#c4a682", "#b4b6bd"];
const DWARF_TINTS = ["#dcd6cf", "#cfa088", "#ece8e2"];
const COMET_TINT = "#c9d6de";

const vertexShader = /* glsl */ `
  uniform vec3 sun;
  uniform float pixel;
  attribute float cell;
  attribute float radius;
  attribute float comet;
  attribute float shown;
  attribute vec3 tint;
  varying float vCell;
  varying float vRadius;
  varying float vComet;
  varying vec3 vTint;
  varying vec3 vLight;
  varying vec2 vTail;
  varying float vTailLength;
  varying float vActivity;

  void main() {
    if (shown < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vec3 sunView = (viewMatrix * vec4(sun, 1.0)).xyz;
    vLight = normalize(sunView - view.xyz);
    vCell = cell;
    vRadius = radius;
    vComet = comet;
    vTint = tint;
    // Tails stream away from the Sun, foreshortened when it is behind or in front of the comet.
    float sunDistance = length(position - sun);
    vActivity = clamp((${COMET_ACTIVE.toFixed(1)} - sunDistance) / (${COMET_ACTIVE.toFixed(1)} - ${COMET_FULL.toFixed(1)}), 0.0, 1.0);
    vec2 away = -vLight.xy;
    float across = length(away);
    vTail = across > 1e-4 ? away / across : vec2(0.0, -1.0);
    // Shortened less than in truth when seen end-on, so a comet still reads as one.
    vTailLength = 15.0 * vActivity * clamp(across * 1.6, 0.5, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = (comet > 0.5 ? ${COMET_CELL.toFixed(1)} : ${ROCK_CELL.toFixed(1)}) * pixel;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D atlas;
  uniform float cells;
  varying float vCell;
  varying float vRadius;
  varying float vComet;
  varying vec3 vTint;
  varying vec3 vLight;
  varying vec2 vTail;
  varying float vTailLength;
  varying float vActivity;

  // Ordered dither, 0-1, from a pixel's coordinates.
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

  // The discs' shade steps (bodyArt.ts shade).
  float shade(float lambert) { return lambert > 0.4 ? 1.0 : lambert > 0.12 ? 0.8 : lambert > 0.0 ? 0.55 : 0.2; }

  // A sphere's lighting at an offset from its centre, in radii (y up).
  float lit(vec2 q) {
    float z = sqrt(max(0.0, 1.0 - dot(q, q)));
    return shade(dot(normalize(vec3(q, max(z, 0.05))), vLight));
  }

  void main() {
    if (vComet < 0.5) {
      vec2 px = floor(gl_PointCoord * ${ROCK_CELL.toFixed(1)});
      vec4 texel = texture2D(atlas, (vec2(vCell * ${ROCK_CELL.toFixed(1)}, 0.0) + px + 0.5) / vec2(cells * ${ROCK_CELL.toFixed(1)}, ${ROCK_CELL.toFixed(1)}));
      if (texel.a < 0.5) discard;
      vec2 q = (px + 0.5 - ${(ROCK_CELL / 2).toFixed(1)}) / vRadius;
      gl_FragColor = vec4(vTint * texel.r * lit(vec2(q.x, -q.y)), 1.0);
      return;
    }
    vec2 px = floor(gl_PointCoord * ${COMET_CELL.toFixed(1)});
    vec2 p = px + 0.5 - ${(COMET_CELL / 2).toFixed(1)};
    p.y = -p.y;
    float d = length(p);
    // The nucleus, lit like the rocks, but glowing in its coma when active.
    if (d < 1.5) {
      gl_FragColor = vec4(vActivity > 0.0 ? vec3(0.95, 0.99, 1.0) : vTint * lit(p / 1.5), 1.0);
      return;
    }
    if (vActivity <= 0.0) discard;
    // Coma: a small glow round the nucleus.
    float glow = 0.85 * vActivity * (1.0 - d / (1.8 + 1.6 * vActivity));
    // Ion tail: straight away from the Sun, narrow.
    float along = dot(p, vTail);
    float off = abs(p.x * vTail.y - p.y * vTail.x);
    float ion = 0.0;
    if (along > 0.0 && along < vTailLength) {
      float width = 0.7 + along * 0.12;
      if (off < width) ion = (1.0 - along / vTailLength) * (1.0 - 0.4 * off / width);
    }
    // Dust tail: shorter and wider, curving off to one side of the ion tail.
    vec2 bend = vec2(vTail.x * 0.94 - vTail.y * 0.34, vTail.x * 0.34 + vTail.y * 0.94);
    float dustLength = vTailLength * 0.65;
    float dAlong = dot(p, bend);
    float dOff = abs(p.x * bend.y - p.y * bend.x - dAlong * dAlong * 0.02);
    float dust = 0.0;
    if (dAlong > 0.0 && dAlong < dustLength) {
      float width = 0.9 + dAlong * 0.3;
      if (dOff < width) dust = 0.8 * (1.0 - dAlong / dustLength) * (1.0 - 0.6 * dOff / width);
    }
    float level = floor(max(glow, max(ion, dust)) * 3.0 + bayer4(px));
    if (level < 1.0) discard;
    vec3 color = dust > ion && dust > glow
      ? (level >= 3.0 ? vec3(1.0, 0.97, 0.88) : level >= 2.0 ? vec3(0.86, 0.82, 0.72) : vec3(0.55, 0.52, 0.46))
      : (level >= 3.0 ? vec3(0.9, 0.97, 1.0) : level >= 2.0 ? vec3(0.62, 0.83, 1.0) : vec3(0.31, 0.53, 0.78));
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** A hex colour as 0–1 sRGB, written straight to the screen (the shader skips colour management). */
function srgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

/** The small bodies, in the order given; their positions are set (and updated) by the caller. */
export function makeSmallBodies(bodies: SpaceBodyDef[], pixel: number): THREE.Points {
  const cells: number[] = [];
  const radii: number[] = [];
  const comets: number[] = [];
  const tints: number[] = [];
  bodies.forEach((b, i) => {
    const comet = b.type === "comet";
    const { cell, radius } = rockCell(b.id, b.type, b.radiusKm);
    cells.push(cell);
    radii.push(radius);
    comets.push(comet ? 1 : 0);
    const palette = b.type === "dwarf" ? DWARF_TINTS : ROCK_TINTS;
    tints.push(...srgb(comet ? COMET_TINT : palette[(i * 7 + cell) % palette.length]!));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(bodies.length * 3), 3));
  geometry.setAttribute("cell", new THREE.Float32BufferAttribute(cells, 1));
  geometry.setAttribute("radius", new THREE.Float32BufferAttribute(radii, 1));
  geometry.setAttribute("comet", new THREE.Float32BufferAttribute(comets, 1));
  geometry.setAttribute("tint", new THREE.Float32BufferAttribute(tints, 3));
  geometry.setAttribute("shown", new THREE.Float32BufferAttribute(new Float32Array(bodies.length).fill(1), 1));
  const canvas = rockAtlas();
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      atlas: { value: atlas },
      cells: { value: canvas.width / ROCK_CELL },
      sun: { value: new THREE.Vector3() },
      pixel: { value: pixel },
    },
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 2;
  return points;
}

/** Tells the small bodies where the Sun is (scene coordinates), for their lighting and tails. */
export function setSmallBodiesSun(points: THREE.Points, sun: THREE.Vector3): void {
  ((points.material as THREE.ShaderMaterial).uniforms.sun!.value as THREE.Vector3).copy(sun);
}

/** Shows or hides one small body (by its index in the order given to makeSmallBodies). */
export function setSmallBodyShown(points: THREE.Points, index: number, shown: boolean): void {
  const attr = points.geometry.getAttribute("shown") as THREE.BufferAttribute;
  attr.setX(index, shown ? 1 : 0);
  attr.needsUpdate = true;
}

/** Frees the atlas (the scene's disposal frees the geometry and material). */
export function disposeSmallBodies(points: THREE.Points): void {
  ((points.material as THREE.ShaderMaterial).uniforms.atlas!.value as THREE.Texture).dispose();
}
