// Globe View (SPEC 2.12.2): the pixel-art Earth with regions tinted by who controls them.
// Textures come from tools/data/build_world.py:
//   earth.png    pixel-art colour map
//   regions.png  region id per texel (R + G·256 = region index + 1, 0 = sea)
//   borders.png  region borders (RGBA); its brighter nation borders are the starting ones
// A small data texture maps each region index to a tint colour, so ownership changes only
// rewrite that texture. Another holds each region's nation, and the shader draws national
// borders wherever neighbouring texels belong to different nations, so they follow regions
// as they change hands. A third holds each region's night-light density.
//
// The sun follows the game clock (taken as UTC): the night side is dark with pixel city
// lights, and a thin atmosphere glows on the lit side of the limb. A handful of
// semi-transparent pixel clouds drift in a shell just above the ground. Stratospheric aerosols (setHaze) grey the whole look as in Terra Invicta: the
// ground dims and washes out, clouds turn ashen and the limb goes from blue to pale grey.
//
// Councilors travelling to a mission in another country fly once along a dotted
// great-circle arc as a tiny pixel airplane; on landing the airplane goes and the trail
// fades out (setFlights).
//
// A nuclear strike flies as a pixel missile along a high ballistic arc from the launcher's
// capital and bursts into a pixel mushroom cloud on impact (launchMissile).
//
// Armies stand on their regions as pixel tanks in their commander's colour, with a health
// bar, and slide along a dotted route while they move (setArmies, setGameMinute). Navies
// sailing go to the nearest coast, turn into pixel warships and keep to the water
// (seaRoutes.ts) until they land again; airlifted armies fly home as pixel helicopters. Occupied
// regions are hatched with the occupier's colour (setOccupation).
//
// Councilors on a mission stand on its region as small pixel people in their faction's colour
// (grey when we haven't identified them), above the armies; ours appear once their airplane
// lands (setCouncilors).

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildSeaMap, seaRoute, type SeaMap, type SeaRoute } from "./seaRoutes";

export interface LatLon {
  lat: number;
  lon: number;
}

/** A councilor flying between countries. */
export interface Flight {
  /** Identifies the flight across updates, so one already flown isn't flown again. */
  id: string;
  from: LatLon;
  to: LatLon;
  color: string;
}

/** An army on the map. Positions are region centres; times are game minutes (see setGameMinute). */
export interface ArmyMarker {
  id: string;
  at: LatLon;
  /** Set while the army moves. Airlifts fly an arc even for armies with a navy. */
  move: { to: LatLon; departAt: number; arriveAt: number; naval: boolean; airlift: boolean } | null;
  color: string;
  health: number;
  navy: boolean;
  selected: boolean;
  /** Position in the stack of armies standing in the same region (0 = centre). */
  slot: number;
  /** Set while the army fights an enemy army in its region: the way its gun points (1 = right). */
  fighting: { facing: 1 | -1 } | null;
}

/** A councilor on the map, standing on a region centre. */
export interface CouncilorMarker {
  id: string;
  at: LatLon;
  /** Faction colour, or null for a councilor we haven't identified (drawn grey). */
  color: string | null;
  selected: boolean;
  /** Position among the councilors standing in the same region (0 = centre). */
  slot: number;
  /** The flight taking them there: they appear once it lands. */
  flightId: string | null;
}

export interface RegionTint {
  /** CSS colour, or null for no tint. */
  color: string | null;
  /** 0–1 tint strength. */
  strength: number;
}

const RADIUS = 1;
/** The atmosphere shell sits just above the surface: a thin wisp, not a thick halo. */
const ATMOSPHERE_RADIUS = 1.022;
/** Clouds float just above the ground, under the army markers. */
const CLOUD_RADIUS = 1.005;
/** Turns of the cloud shell per second (eastward drift). */
const CLOUD_DRIFT = 0.0012;
const OBLIQUITY = (23.44 * Math.PI) / 180;

/**
 * Direction from Earth's centre to the sun in globe coordinates, for a day of the year
 * (0 = 1 January) and a time of day as a fraction of 24 h UTC. Ignores the equation of
 * time, which shifts noon by at most ~16 minutes.
 */
export function sunDirection(dayOfYear: number, dayFraction: number, target = new THREE.Vector3()): THREE.Vector3 {
  const declination = -OBLIQUITY * Math.cos(((2 * Math.PI) / 365.25) * (dayOfYear + dayFraction + 10));
  // At 12:00 UTC the sun is overhead at 0°; it moves 15° west per hour.
  const longitude = -(dayFraction - 0.5) * 2 * Math.PI;
  // The texture starts at −180°, so (lat, lon) maps to (cos lat cos lon, sin lat, −cos lat sin lon).
  return target.set(Math.cos(declination) * Math.cos(longitude), Math.sin(declination), -Math.cos(declination) * Math.sin(longitude));
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D earth;
  uniform sampler2D regions;
  uniform sampler2D borders;
  uniform sampler2D tints;
  uniform sampler2D lights;
  uniform sampler2D occupation;
  uniform sampler2D owners;
  uniform float tintCount;
  uniform vec2 mapSize;
  uniform vec3 sunDirection;
  uniform float haze;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Night-light density of the region under a map coordinate (0 at sea).
  float lightDensity(vec2 uv) {
    vec4 t = texture2D(regions, uv);
    float id = floor(t.r * 255.0 + 0.5) + floor(t.g * 255.0 + 0.5) * 256.0;
    return id > 0.5 ? texture2D(lights, vec2((id + 0.5) / tintCount, 0.5)).r : 0.0;
  }

  // Region id of a map texel (integer coordinates).
  float regionAt(vec2 cell) {
    vec4 t = texture2D(regions, (cell + 0.5) / mapSize);
    return floor(t.r * 255.0 + 0.5) + floor(t.g * 255.0 + 0.5) * 256.0;
  }

  // The nation holding a region, as an index + 1.
  float ownerOf(float id) {
    vec4 o = texture2D(owners, vec2((id + 0.5) / tintCount, 0.5));
    return floor(o.r * 255.0 + 0.5) + floor(o.g * 255.0 + 0.5) * 256.0;
  }

  void main() {
    vec3 base = texture2D(earth, vUv).rgb;
    vec4 idTexel = texture2D(regions, vUv);
    float id = floor(idTexel.r * 255.0 + 0.5) + floor(idTexel.g * 255.0 + 0.5) * 256.0;
    if (id > 0.5) {
      vec4 tint = texture2D(tints, vec2((id + 0.5) / tintCount, 0.5));
      base = mix(base, tint.rgb, tint.a);
      // Occupied ground: diagonal pixel hatching in the occupier's colour, denser as it spreads.
      vec4 occ = texture2D(occupation, vec2((id + 0.5) / tintCount, 0.5));
      if (occ.a > 0.0) {
        vec2 px = floor(vUv * mapSize);
        float stripe = mod(px.x + px.y, 4.0) < 2.0 ? 1.0 : 0.0;
        base = mix(base, occ.rgb * 1.25, stripe * (0.45 + 0.5 * occ.a));
      }
    }
    // Every texel on a region edge is marked in borders.png (against its right or lower
    // neighbour, as build_world.py draws them); it is a national border if that neighbour
    // now belongs to another nation. Colours are build_world.py's, in linear space.
    vec4 border = texture2D(borders, vUv);
    if (border.a > 0.0 && id > 0.5) {
      vec2 cell = floor(vUv * mapSize);
      float own = ownerOf(id);
      float right = regionAt(vec2(mod(cell.x + 1.0, mapSize.x), cell.y));
      // The texture is flipped, so the image row below is the texel row under this one.
      float below = cell.y > 0.0 ? regionAt(vec2(cell.x, cell.y - 1.0)) : id;
      bool national = (right > 0.5 && ownerOf(right) != own) || (below > 0.5 && ownerOf(below) != own);
      border = national ? vec4(1.0, 1.0, 1.0, 230.0 / 255.0) : vec4(0.652, 0.797, 1.0, 90.0 / 255.0);
    }
    base = mix(base, border.rgb, border.a * 0.8);
    // Hovered nation (the lights texture's green channel): a soft glow, brighter on its borders.
    float hover = id > 0.5 ? texture2D(lights, vec2((id + 0.5) / tintCount, 0.5)).g : 0.0;

    // Day/night with a soft terminator. The night side stays dim rather than black so the
    // strategic map (tints and borders) is still readable.
    float sun = dot(normalize(vNormal), normalize(sunDirection));
    float day = smoothstep(-0.10, 0.12, sun);
    vec3 lit = base * (0.62 + 0.55 * clamp(sun, 0.0, 1.0));
    vec3 night = base * vec3(0.16, 0.18, 0.28) + border.rgb * border.a * 0.12;
    vec3 color = mix(night, lit, day);
    // Warm band along the terminator.
    float twilight = exp(-pow(sun / 0.08, 2.0));
    color += vec3(0.32, 0.12, 0.02) * twilight * 0.18;
    color = mix(color, vec3(0.92, 0.97, 1.0), hover * (0.14 + 0.3 * border.a));

    // City lights: sparse pixel lights, as before, but each one is a small round dot at a
    // jittered spot in its map texel rather than a filled square. Neighbouring texels are
    // checked too, so a dot's soft edge can spill past its own texel and the grid doesn't show.
    // Lit texels rise steeply with density, so only crowded, wealthy regions read as bright.
    float night_ = 1.0 - day;
    if (night_ > 0.0) {
      vec2 p = vUv * mapSize;
      vec2 cell = floor(p);
      float lightSum = 0.0;
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 c = cell + vec2(float(x), float(y));
          c.x = mod(c.x, mapSize.x);
          float chance = 0.22 * pow(lightDensity((c + 0.5) / mapSize), 2.5);
          if (hash(c) <= 1.0 - chance) continue;
          vec2 center = c + 0.5 + (vec2(hash(c + 3.1), hash(c + 7.7)) - 0.5) * 0.6;
          vec2 offset = p - center;
          // Wrap the distance at the 180° seam.
          offset.x -= mapSize.x * floor(offset.x / mapSize.x + 0.5);
          float brightness = 0.5 + 0.5 * hash(c + 17.0);
          lightSum += brightness * exp(-dot(offset, offset) / 0.22);
        }
      }
      color += vec3(1.0, 0.78, 0.42) * min(lightSum, 1.2) * night_ * 1.05;
    }

    // Aerosols: a dim, washed-out grey veil, darker on the night side, city lights muted.
    float grey = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 veil = mix(vec3(grey), vec3(0.46, 0.44, 0.42) * (0.25 + 0.75 * day), 0.45);
    color = mix(color, veil * 0.85, haze * 0.75);

    // Atmospheric haze toward the limb, on the lit side only: blue, turning pale grey with aerosols.
    float rim = pow(1.0 - abs(normalize(vViewNormal).z), 3.0);
    vec3 rimColor = mix(vec3(0.30, 0.55, 1.0), vec3(0.62, 0.62, 0.62), haze);
    color += rimColor * rim * (0.30 + 0.25 * haze) * smoothstep(-0.25, 0.35, sun);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const atmosphereVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewNormal;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Drawn from the inside of a slightly larger sphere (back faces) with additive blending.
// Where the shell rises off the planet's edge, the back-face normal turns from facing away
// (just above the surface) to side-on (the shell's outer edge), so the glow is brightest
// at the surface and fades to nothing a thin band above it.
const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform float edge;
  uniform float haze;
  varying vec3 vNormal;
  varying vec3 vViewNormal;
  void main() {
    float height = clamp(-normalize(vViewNormal).z / edge, 0.0, 1.0);
    // Aerosols thicken the layer a little: the glow reaches further up.
    float glow = pow(height, 1.6 - 0.6 * haze);
    float sun = dot(normalize(vNormal), normalize(sunDirection));
    float lit = smoothstep(-0.30, 0.25, sun);
    // Blue by day, reddening at the terminator; aerosols turn both a pale ashen grey.
    vec3 color = mix(vec3(0.95, 0.45, 0.20), vec3(0.35, 0.62, 1.0), smoothstep(-0.05, 0.35, sun));
    color = mix(color, vec3(0.58, 0.57, 0.55), haze * 0.85);
    gl_FragColor = vec4(color * glow * (0.06 + 1.3 * lit), 1.0);
  }
`;

const cloudVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Clouds are made here rather than from a texture: 3D noise sampled at each point of the
// sphere, so they keep their shape everywhere (an equirectangular cloud map pinches into
// streaks at the poles). Each fragment snaps to the map's pixel grid first, so the clouds
// share the ground's pixel art. A warped, east–west stretched fractal gives wispy decks and
// streaks; a second sample a little toward the sun shades each cloud's far side, and the
// light is cut into a few tones.
const cloudFragmentShader = /* glsl */ `
  uniform float drift;
  uniform vec2 grid;
  uniform vec3 sunDirection;
  uniform float haze;
  varying vec2 vUv;

  float sq(float x) {
    return x * x;
  }

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), u.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), u.x), u.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), u.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), u.x), u.y),
      u.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float total = 0.0;
    for (int i = 0; i < 7; i++) {
      if (i >= octaves) break;
      sum += amp * noise(p);
      total += amp;
      p = p * 2.03 + 17.1;
      amp *= 0.52;
    }
    return sum / total;
  }

  // Rotates about the polar axis, adding a to the longitude.
  vec3 rotY(vec3 v, float a) {
    return vec3(v.x * cos(a) + v.z * sin(a), v.y, -v.x * sin(a) + v.z * cos(a));
  }

  // Cloud density at a point of the unit sphere, after the warp, in standard deviations of
  // the fractal (which clusters tightly around 0.5), so cut-offs read as shares of the sky.
  float density(vec3 p, float lat) {
    // A gentle preference for the tropics' convergence zone and the storm tracks near ±55°,
    // fewer clouds over the subtropical deserts, and thin, scattered ones over the poles.
    float a = abs(lat);
    float band = 0.3 * exp(-sq(lat / 0.14)) + 0.35 * exp(-sq((a - 0.96) / 0.25)) - 0.35 * exp(-sq((a - 0.45) / 0.15)) - 0.5 * smoothstep(1.15, 1.5, a);
    return (fbm(vec3(p.x, p.y * 2.0, p.z) * 5.5, 7) - 0.5) / 0.085 + band;
  }

  void main() {
    // The centre of this fragment's map pixel; the clouds' noise turns under it with the drift.
    vec2 cell = (floor(vUv * grid) + 0.5) / grid;
    // The sphere's u starts at −180°, as the map does (see latLonToVector).
    float lon = cell.x * 6.2831853 - 3.1415927;
    float lat = (cell.y - 0.5) * 3.1415927;
    vec3 world = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
    float turn = -drift * 6.2831853;
    vec3 p = rotY(world, turn);
    // Warp the sampling point for curling, streaky shapes.
    vec3 warp = vec3(fbm(p * 2.2 + 3.7, 3), fbm(p * 2.2 + 11.3, 3), fbm(p * 2.2 + 23.9, 3)) - 0.5;
    vec3 q = p + warp * 0.35;
    float d = density(q, lat);
    // Coverage: about one sky in six.
    const float edge = 1.3;
    if (d < edge) discard;
    float thick = smoothstep(edge, edge + 1.2, d);

    // Self-shadowing: more cloud toward the sun means this side faces away from it.
    vec3 sunDir = normalize(sunDirection);
    vec3 toward = rotY(normalize(sunDir - dot(sunDir, world) * world + 1e-5), turn);
    float ahead = density(q + toward * 0.025, lat);
    float light = clamp(0.55 + (d - ahead) * 0.6 + thick * 0.3, 0.0, 1.0);
    // Four tones, pixel-art style: shadowed underside, mid, lit, bright top.
    float tone = floor(light * 3.99) / 3.0;
    vec3 base = mix(vec3(0.58, 0.63, 0.72), vec3(1.0, 1.0, 1.0), tone);

    float sun = dot(world, sunDir);
    float day = smoothstep(-0.12, 0.15, sun);
    vec3 lit = base * (0.6 + 0.5 * clamp(sun, 0.0, 1.0));
    // Sunset pink along the terminator.
    lit = mix(lit, lit * vec3(1.15, 0.78, 0.62), exp(-sq(sun / 0.12)) * 0.6);
    vec3 color = mix(vec3(0.07, 0.08, 0.13), lit, day);
    // Aerosols: ashen, a little thicker.
    color = mix(color, color * vec3(0.66, 0.63, 0.6), haze);
    // Thin fringes, denser cores; in two steps so edges stay crisp.
    float alpha = thick > 0.35 ? 0.62 : 0.36;
    gl_FragColor = vec4(color, alpha * (1.0 + 0.3 * haze) * (0.45 + 0.55 * day));
  }
`;

/** Unit vector for a latitude and longitude in degrees, matching the texture (see sunDirection). */
function latLonToVector(p: LatLon, target = new THREE.Vector3()): THREE.Vector3 {
  const lat = (p.lat * Math.PI) / 180;
  const lon = (p.lon * Math.PI) / 180;
  return target.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}

const FLIGHT_SEGMENTS = 96;
/** Seconds the trail takes to fade after landing. */
const TRAIL_FADE = 0.8;
/** Airplane sprite size in CSS px; a whole multiple of its 11 px art so it stays crisp. */
const PLANE_PIXELS = 22;
/** A top-down airliner pointing up: long fuselage, swept wings, tailplane, darker outline. */
const PLANE_ART = [
  ".....#.....",
  "....#o#....",
  "....#o#....",
  "...##o##...",
  "..#ooooo#..",
  ".#ooooooo#.",
  "#oo##o##oo#",
  "##..#o#..##",
  "....#o#....",
  "...#ooo#...",
  "...##.##...",
];

/** Crisp (nearest-filtered) texture from a canvas. */
function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Texture from pixel art rows: each character is looked up in the palette; "." is clear. */
function artTexture(art: string[], palette: Record<string, string>): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(...art.map((row) => row.length));
  canvas.height = art.length;
  const ctx = canvas.getContext("2d")!;
  art.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "." || !palette[c]) return;
      ctx.fillStyle = palette[c];
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  return pixelTexture(canvas);
}

function makePlaneTexture(): THREE.Texture {
  return artTexture(PLANE_ART, { o: "#ffffff", "#": "#5a6470" });
}

/** One flight's arc, its flown part, and the airplane, which flies it once. */
class FlightPath {
  readonly group = new THREE.Group();
  readonly key: string;
  readonly id: string;
  readonly plane: THREE.Sprite;
  private readonly points: THREE.Vector3[] = [];
  private readonly route: THREE.Points;
  private readonly flown: THREE.Points;
  /** Seconds to fly the arc; longer for longer flights. */
  private readonly duration: number;

  constructor(
    flight: Flight,
    planeTexture: THREE.Texture,
    /** Clock time in seconds when the flight takes off. */
    private readonly start: number,
  ) {
    this.key = JSON.stringify(flight);
    this.id = flight.id;
    const a = latLonToVector(flight.from);
    const b = latLonToVector(flight.to);
    const angle = a.angleTo(b);
    this.duration = 1.5 + 2 * angle;
    // Higher arcs for longer flights, so they read as flights rather than surface lines.
    const peak = 0.012 + 0.09 * (angle / Math.PI);
    const axis = new THREE.Vector3().crossVectors(a, b);
    if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0).cross(a);
    axis.normalize();
    for (let i = 0; i <= FLIGHT_SEGMENTS; i++) {
      const t = i / FLIGHT_SEGMENTS;
      const p = a.clone().applyAxisAngle(axis, angle * t);
      this.points.push(p.multiplyScalar(RADIUS + 0.004 + peak * Math.sin(Math.PI * t)));
    }
    // Every other point, for a dotted trail.
    const geometry = new THREE.BufferGeometry().setFromPoints(this.points.filter((_, i) => i % 2 === 0));
    const color = new THREE.Color(flight.color);
    const dots = (opacity: number) => new THREE.PointsMaterial({ color, size: 2, sizeAttenuation: false, transparent: true, opacity, depthWrite: false });
    this.route = new THREE.Points(geometry, dots(0.3));
    this.flown = new THREE.Points(geometry, dots(1));
    this.plane = new THREE.Sprite(new THREE.SpriteMaterial({ map: planeTexture, color: color.clone().lerp(new THREE.Color("#ffffff"), 0.55), sizeAttenuation: false, depthWrite: false }));
    this.plane.renderOrder = 1;
    this.group.add(this.route, this.flown, this.plane);
  }

  /** Whether the airplane has landed by a time in seconds. */
  landed(seconds: number): boolean {
    return seconds - this.start >= this.duration;
  }

  /** Moves the airplane along the arc for a time in seconds, heading it on screen. */
  update(seconds: number, camera: THREE.Camera, aspect: number): void {
    const t = Math.min(1, Math.max(0, seconds - this.start) / this.duration);
    // Landed: the airplane goes and the trail fades out.
    this.plane.visible = t < 1;
    const fade = 1 - Math.min(1, Math.max(0, seconds - this.start - this.duration) / TRAIL_FADE);
    this.group.visible = fade > 0;
    if (!this.group.visible) return;
    (this.route.material as THREE.PointsMaterial).opacity = 0.3 * fade;
    (this.flown.material as THREE.PointsMaterial).opacity = fade;
    const f = t * FLIGHT_SEGMENTS;
    const i = Math.min(FLIGHT_SEGMENTS - 1, Math.floor(f));
    const here = this.points[i]!.clone().lerp(this.points[i + 1]!, f - i);
    this.plane.position.copy(here);
    this.flown.geometry.setDrawRange(0, Math.floor(f / 2) + 1);
    const p0 = here.clone().project(camera);
    const p1 = this.points[i + 1]!.clone().project(camera);
    this.plane.material.rotation = Math.atan2(p1.y - p0.y, (p1.x - p0.x) * aspect) - Math.PI / 2;
  }

  dispose(): void {
    for (const child of this.group.children) {
      const object = child as THREE.Points | THREE.Sprite;
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
  }
}

/** Missile sprite size in CSS px (twice its 7 × 14 art). */
const MISSILE_PIXELS = 28;
/** A missile pointing up: white body, red nose band and fins, exhaust flame. */
const MISSILE_ART = [
  "...#...",
  "..#r#..",
  "..#r#..",
  "..#w#..",
  "..#w#..",
  "..#w#..",
  "..#w#..",
  "..#w#..",
  ".##w##.",
  "#r#w#r#",
  "#r#w#r#",
  "#.#y#.#",
  "..yoy..",
  "...o...",
];
/** Mushroom cloud: frames of BLAST_SIZE px art, drawn BLAST_PIXELS tall. */
const BLAST_SIZE = 32;
const BLAST_FRAMES = 12;
const BLAST_PIXELS = 64;
/** Seconds the cloud takes to rise and fade. */
const BLAST_SECONDS = 2.6;

/**
 * The mushroom cloud's frames side by side, generated pixel by pixel: a white-hot flash, then
 * a stem rising under a billowing cap that cools from yellow through orange to grey smoke,
 * over a spreading ring of dust, fading out at the end. Dithered shading keeps it pixel-art.
 */
function makeBlastTexture(): THREE.CanvasTexture {
  const S = BLAST_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = S * BLAST_FRAMES;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const ease = (t: number) => 1 - (1 - t) * (1 - t);
  const hot = ["#ffffff", "#fff3a0", "#ffd04a", "#ff8a2a", "#d8452a", "#8a3a32"];
  const smoke = ["#d9d2c8", "#a89f96", "#78706a", "#4e4844"];
  for (let f = 0; f < BLAST_FRAMES; f++) {
    const t = f / (BLAST_FRAMES - 1);
    const cx = f * S + S / 2;
    const ground = S - 2;
    const rise = ease(Math.min(1, t * 1.25));
    // Heat cools with time: an index into the hot palette, then into smoke.
    const heat = t * 7;
    const shade = (k: number, x: number, y: number) => {
      const i = Math.floor(heat + k + ((x + y) % 2) * 0.5);
      return i < hot.length ? hot[Math.max(0, i)]! : smoke[Math.min(smoke.length - 1, i - hot.length)]!;
    };
    ctx.globalAlpha = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    if (t < 0.12) {
      // The flash: a white-hot ball on the ground.
      const r = 3 + t * 50;
      for (let y = 0; y < S; y++)
        for (let x = -S / 2; x < S / 2; x++) {
          const d = Math.hypot(x, (y - ground) * 1.2);
          if (d > r) continue;
          ctx.fillStyle = d < r * 0.5 ? "#ffffff" : d < r * 0.8 ? "#fff3a0" : "#ffb03a";
          ctx.fillRect(cx + x, y, 1, 1);
        }
      continue;
    }
    const top = ground - 4 - 17 * rise;
    const capRx = 4 + 8 * rise;
    const capRy = 2.5 + 3.5 * rise;
    const stemW = 1.5 + 1.2 * rise;
    const dustRx = 3 + 12 * rise;
    for (let y = 0; y < S; y++)
      for (let x = -S / 2; x < S / 2; x++) {
        let color: string | null = null;
        // Dust ring spreading along the ground.
        const dust = (x / dustRx) ** 2 + ((y - ground) / 1.8) ** 2;
        if (dust <= 1) color = shade(1.5 + dust, x, y);
        // The stem, narrowing upward.
        const along = (ground - y) / Math.max(1, ground - top);
        if (y <= ground && y >= top && Math.abs(x + 0.5) <= stemW * (1.2 - 0.4 * along)) color = shade(1 + along, x, y);
        // The cap: a flattened ball with a rolled-under rim and a hotter core.
        const cap = ((x + 0.5) / capRx) ** 2 + ((y - top) / capRy) ** 2;
        if (cap <= 1 && !(y > top + capRy * 0.4 && Math.abs(x + 0.5) < capRx * 0.45 && cap > 0.55)) {
          color = shade(cap < 0.35 ? 0 : cap < 0.75 ? 1 : 2.2, x, y);
        }
        if (cap > 0.86 && cap <= 1 && y < top) color = shade(3, x, y);
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(cx + x, y, 1, 1);
      }
  }
  return pixelTexture(canvas);
}

/** One nuclear strike: the missile's flight along a high arc, then the mushroom cloud where it lands. */
class MissileStrike {
  readonly group = new THREE.Group();
  readonly missile: THREE.Sprite;
  readonly blast: THREE.Sprite;
  /** Seconds from launch to impact. */
  readonly duration: number;
  private readonly points: THREE.Vector3[] = [];
  private readonly route: THREE.Points;
  private readonly flown: THREE.Points;
  private readonly blastMap: THREE.Texture;
  private readonly normal: THREE.Vector3;

  constructor(
    from: LatLon,
    to: LatLon,
    color: string,
    missileTexture: THREE.Texture,
    blastTexture: THREE.Texture,
    private readonly start: number,
  ) {
    const a = latLonToVector(from);
    const b = latLonToVector(to);
    this.normal = b.clone();
    const angle = a.angleTo(b);
    this.duration = 2 + 1.5 * angle;
    // A ballistic arc: much higher than a flight.
    const peak = 0.04 + 0.3 * (angle / Math.PI);
    const axis = new THREE.Vector3().crossVectors(a, b);
    if (axis.lengthSq() < 1e-12) axis.set(0, 1, 0).cross(a);
    axis.normalize();
    for (let i = 0; i <= FLIGHT_SEGMENTS; i++) {
      const t = i / FLIGHT_SEGMENTS;
      this.points.push(a.clone().applyAxisAngle(axis, angle * t).multiplyScalar(RADIUS + 0.004 + peak * Math.sin(Math.PI * t)));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(this.points.filter((_, i) => i % 2 === 0));
    const trail = new THREE.Color(color).lerp(new THREE.Color("#ff5a3a"), 0.5);
    const dots = (opacity: number) => new THREE.PointsMaterial({ color: trail, size: 2, sizeAttenuation: false, transparent: true, opacity, depthWrite: false });
    this.route = new THREE.Points(geometry, dots(0.25));
    this.flown = new THREE.Points(geometry, dots(1));
    this.missile = new THREE.Sprite(new THREE.SpriteMaterial({ map: missileTexture, sizeAttenuation: false, depthWrite: false }));
    this.missile.renderOrder = 2;
    this.blastMap = blastTexture.clone();
    this.blastMap.repeat.set(1 / BLAST_FRAMES, 1);
    this.blastMap.needsUpdate = true;
    // Drawn over the globe (it sits on the surface), and hidden while on the far side.
    this.blast = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.blastMap, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
    this.blast.center.set(0.5, 0.06);
    this.blast.position.copy(b).multiplyScalar(RADIUS + 0.002);
    this.blast.renderOrder = 3;
    this.blast.visible = false;
    this.group.add(this.route, this.flown, this.missile, this.blast);
  }

  /** True once the cloud has faded. */
  done(seconds: number): boolean {
    return seconds - this.start > this.duration + BLAST_SECONDS;
  }

  update(seconds: number, camera: THREE.Camera, aspect: number, pixelScale: number): void {
    const elapsed = seconds - this.start;
    const t = Math.min(1, Math.max(0, elapsed / this.duration));
    // Slow off the pad, fast on the way down.
    const eased = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
    this.missile.visible = elapsed >= 0 && t < 1;
    const f = eased * FLIGHT_SEGMENTS;
    const i = Math.min(FLIGHT_SEGMENTS - 1, Math.floor(f));
    const here = this.points[i]!.clone().lerp(this.points[i + 1]!, f - i);
    this.missile.position.copy(here);
    this.missile.scale.set(pixelScale * MISSILE_PIXELS * 0.5, pixelScale * MISSILE_PIXELS, 1);
    const p0 = here.clone().project(camera);
    const p1 = this.points[i + 1]!.clone().project(camera);
    this.missile.material.rotation = Math.atan2(p1.y - p0.y, (p1.x - p0.x) * aspect) - Math.PI / 2;
    this.flown.geometry.setDrawRange(0, Math.floor(f / 2) + 1);
    // The trail fades as the cloud rises.
    const after = Math.max(0, elapsed - this.duration);
    const fade = 1 - Math.min(1, after / (BLAST_SECONDS * 0.6));
    (this.route.material as THREE.PointsMaterial).opacity = 0.25 * fade;
    (this.flown.material as THREE.PointsMaterial).opacity = fade;

    const facing = this.normal.dot(camera.position.clone().normalize()) > 0.05;
    this.blast.visible = t >= 1 && facing && after < BLAST_SECONDS;
    if (!this.blast.visible) return;
    const frame = Math.min(BLAST_FRAMES - 1, Math.floor((after / BLAST_SECONDS) * BLAST_FRAMES));
    this.blastMap.offset.x = frame / BLAST_FRAMES;
    // The sprite's rotation stays 0, so the cloud always stands upright on screen.
    this.blast.scale.set(pixelScale * BLAST_PIXELS, pixelScale * BLAST_PIXELS, 1);
  }

  dispose(): void {
    this.route.geometry.dispose();
    (this.route.material as THREE.Material).dispose();
    (this.flown.material as THREE.Material).dispose();
    this.missile.material.dispose();
    this.blast.material.dispose();
    this.blastMap.dispose();
  }
}

/** A pixel tank, 11 × 7: c = commander colour, # = outline, d = tracks. */
const TANK_ART = [
  "...####....",
  "..#cccc####",
  "..#cccc#...",
  "###########",
  "#ccccccccc#",
  "#d#d#d#d#d#",
  ".#########.",
];
/** A pixel warship, 11 × 7, bow to the right: c = commander colour, # = outline. */
const BOAT_ART = [
  "....#......",
  "...#c#.....",
  "..#ccc#.##.",
  "#########c#",
  "#ccccccccc#",
  ".#ccccccc#.",
  "..#######..",
];
/**
 * A pixel helicopter, 11 × 7, nose to the right: c = commander colour, # = outline, w = window.
 * Row 0 is the rotor, drawn from HELICOPTER_ROTOR as it spins.
 */
const HELICOPTER_ART = [
  "...........",
  ".....#.....",
  "#...#####..",
  "#####ccc#w#",
  "#...#ccccc#",
  "....#######",
  "...#######.",
];
const HELICOPTER_ROTOR = ["###########", "...#####..."];
/** Rotor frames per second. */
const ROTOR_RATE = 10;

/** What an army is drawn as: a tank on land, a warship at sea, a helicopter when airlifted. */
type Vehicle = "tank" | "boat" | "helicopter";
const VEHICLE_ART: Record<Vehicle, string[]> = { tank: TANK_ART, boat: BOAT_ART, helicopter: HELICOPTER_ART };
/**
 * The sprite's canvas: the tank (or warship, or helicopter) with a 1 px margin, a health bar and a navy stripe below, and
 * FLASH_PAD px either side for the muzzle flash when it fires.
 */
const FLASH_PAD = 3;
const ARMY_W = 13 + 2 * FLASH_PAD;
const ARMY_H = 11;
/** Armies are drawn at 2× their pixel art at the starting zoom and closer, shrinking to 1× as the camera pulls out. */
const ARMY_SCALE = 2;
const ARMY_SCALE_MIN = 0;
/** The camera's distance from the Earth's centre at the start, in Earth radii. */
const CAMERA_START_DISTANCE = Math.hypot(0.9, 1.2, 2.9);

/** Stack slots 1, 2, 3… alternate right and left of the centre, in tank widths. */
export function slotOffset(slot: number): number {
  return slot === 0 ? 0 : (slot % 2 === 1 ? 1 : -1) * Math.ceil(slot / 2);
}

/** A tank's firing cycle: idle, recoiling with a muzzle flash, then a puff of smoke. */
type Shot = "idle" | "flash" | "smoke";
/** Seconds between shots, and how long the flash and smoke last. */
const FIRE_PERIOD = 1.4;
const FLASH_TIME = 0.09;
const SMOKE_TIME = 0.28;
/** Muzzle flash and smoke pixels, as [x, y, colour] past the barrel tip (x = 0 is the first pixel beyond it). */
const FLASH_ART: [number, number, string][] = [
  [0, 1, "#fff6c2"],
  [1, 1, "#ffd23f"],
  [2, 1, "#ff8a2a"],
  [1, 0, "#ff8a2a"],
  [1, 2, "#ff8a2a"],
];
const SMOKE_ART: [number, number, string][] = [
  [0, 1, "#c9cdd1"],
  [1, 0, "#9aa1a8"],
  [2, 1, "#7d858c"],
];

function drawArmy(ctx: CanvasRenderingContext2D, color: string, health: number, navy: boolean, selected: boolean, facing: 1 | -1, shot: Shot, vehicle: Vehicle, rotor: number): void {
  ctx.clearRect(0, 0, ARMY_W, ARMY_H);
  const outline = selected ? "#ffffff" : "#141a20";
  // Mirrored when facing left; the hull rocks back a pixel as it fires.
  const recoil = shot === "flash" ? -facing : 0;
  const px = (x: number) => FLASH_PAD + 1 + (facing === 1 ? x : 10 - x);
  const art = vehicle === "helicopter" ? [HELICOPTER_ROTOR[rotor]!, ...HELICOPTER_ART.slice(1)] : VEHICLE_ART[vehicle];
  art.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ".") return;
      ctx.fillStyle = c === "c" ? color : c === "d" ? "#9aa4ad" : c === "w" ? "#9fd8ff" : outline;
      ctx.fillRect(px(x) + recoil, y + 1, 1, 1);
    }),
  );
  if (shot !== "idle" && vehicle === "tank") {
    // The barrel tip is the last pixel of row 1 of the art.
    for (const [dx, dy, c] of shot === "flash" ? FLASH_ART : SMOKE_ART) {
      ctx.fillStyle = c;
      ctx.fillRect(px(10) + recoil + facing * (dx + 1), dy + 1, 1, 1);
    }
  }
  const left = FLASH_PAD + 1;
  ctx.fillStyle = "#141a20";
  ctx.fillRect(left, 8, 11, 2);
  const filled = Math.max(1, Math.round(health * 11));
  ctx.fillStyle = health > 0.6 ? "#6fd36a" : health > 0.3 ? "#e8c84a" : "#ff5a4a";
  ctx.fillRect(left, 8, filled, 1);
  if (navy) {
    ctx.fillStyle = "#5fb4ff";
    for (let x = 0; x < 11; x += 2) ctx.fillRect(left + x, 10, 1, 1);
  }
}

/** A stable 0–1 phase per army, so tanks in a battle don't all fire at once. */
function firePhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Degrees between samples of a sea route. */
const TRACK_STEP = 0.5;

/** A sea route as points close together, straight in map space between its turns (as seaRoutes.ts plans them). */
function sampleTrack(route: SeaRoute): { points: THREE.Vector3[]; lengths: number[]; sea: boolean[]; lon: number[] } {
  const points: THREE.Vector3[] = [];
  const lengths: number[] = [];
  const sea: boolean[] = [];
  const lon: number[] = [];
  const add = (p: LatLon, onWater: boolean) => {
    const v = latLonToVector(p).multiplyScalar(RADIUS + 0.006);
    lengths.push(points.length ? lengths[lengths.length - 1]! + v.distanceTo(points[points.length - 1]!) : 0);
    points.push(v);
    sea.push(onWater);
    lon.push(p.lon);
  };
  add(route.points[0]!, route.embark === 0);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    const dLon = ((b.lon - a.lon + 540) % 360) - 180;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dLon), Math.abs(b.lat - a.lat)) / TRACK_STEP));
    const onWater = i > route.embark && i <= route.disembark;
    for (let k = 1; k <= steps; k++) {
      const lonK = a.lon + (dLon * k) / steps;
      add({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lon: ((lonK + 540) % 360) - 180 }, onWater || (k === steps && i === route.embark));
    }
  }
  return { points, lengths, sea, lon };
}

/** One army's sprite and, while it moves, its dotted route. */
class ArmySprite {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement("canvas");
  private readonly texture: THREE.CanvasTexture;
  private look = "";
  private routeKey = "";
  route: THREE.Points | null = null;
  marker!: ArmyMarker;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  /** A navy's route by sea, sampled along its length; null for overland moves and arcs. */
  private track: { points: THREE.Vector3[]; lengths: number[]; sea: boolean[]; lon: number[] } | null = null;
  /** What the army is drawn as now, and the way a warship or helicopter points (1 = east). */
  private vehicle: Vehicle = "tank";
  private heading: 1 | -1 = 1;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly seaRouteFor: (from: LatLon, to: LatLon) => SeaRoute | null,
  ) {
    this.canvas.width = ARMY_W;
    this.canvas.height = ARMY_H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, sizeAttenuation: false, depthWrite: false }));
    this.sprite.renderOrder = 2;
    scene.add(this.sprite);
  }

  set(marker: ArmyMarker): void {
    this.marker = marker;
    this.sprite.renderOrder = marker.selected ? 3 : 2;
    // Stacked armies sit side by side, a tank's width (plus a little) apart.
    const offset = (slotOffset(marker.slot) * 1.05 * 13) / ARMY_W;
    this.sprite.center.set(0.5 - offset, 0.5);
    latLonToVector(marker.at, this.from);
    const key = marker.move ? JSON.stringify([marker.at, marker.move]) : "";
    if (key !== this.routeKey) {
      this.routeKey = key;
      this.clearRoute();
      if (marker.move) {
        latLonToVector(marker.move.to, this.to);
        this.heading = ((marker.move.to.lon - marker.at.lon + 540) % 360) - 180 >= 0 ? 1 : -1;
        const sea = marker.navy && marker.move.naval && !marker.move.airlift ? this.seaRouteFor(marker.at, marker.move.to) : null;
        this.track = sea ? sampleTrack(sea) : null;
        const points: THREE.Vector3[] = [];
        if (this.track) for (let i = 0; i < this.track.points.length; i += 3) points.push(this.track.points[i]!);
        else for (let i = 0; i <= 24; i++) points.push(this.pointAt(i / 24));
        this.route = new THREE.Points(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.PointsMaterial({ color: new THREE.Color(marker.color), size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false }),
        );
        this.scene.add(this.route);
      }
    }
  }

  /** Plans the route again, e.g. once the sea map has loaded. */
  replan(): void {
    this.routeKey = "";
    this.set(this.marker);
  }

  /** A point along the route, t = 0–1. Sea moves bow out a little. */
  private pointAt(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = this.from.angleTo(this.to);
    const s = Math.sin(angle);
    if (s < 1e-6) target.copy(this.from);
    else target.copy(this.from).multiplyScalar(Math.sin((1 - t) * angle) / s).addScaledVector(this.to, Math.sin(t * angle) / s);
    const lift = this.marker.move?.naval ? 0.03 * (angle / Math.PI) * Math.sin(Math.PI * t) : 0;
    return target.normalize().multiplyScalar(RADIUS + 0.006 + lift);
  }

  /** Redraws the canvas if the army's look or the firing cycle changed. */
  private redraw(shot: Shot, rotor: number): void {
    const m = this.marker;
    const facing = this.vehicle === "tank" ? (m.fighting?.facing ?? 1) : this.heading;
    const look = `${m.color}|${Math.round(m.health * 11)}|${m.navy}|${m.selected}|${facing}|${shot}|${this.vehicle}|${rotor}`;
    if (look === this.look) return;
    this.look = look;
    drawArmy(this.canvas.getContext("2d")!, m.color, m.health, m.navy, m.selected, facing, shot, this.vehicle, rotor);
    this.texture.needsUpdate = true;
  }

  /** Places the army for a game minute (along its route while it moves) and, in battle, fires its gun. */
  update(minute: number, scale: number, seconds: number): void {
    const move = this.marker.move;
    const t = move ? Math.min(1, Math.max(0, (minute - move.departAt) / Math.max(1, move.arriveAt - move.departAt))) : 0;
    if (move && this.track) this.followTrack(t);
    else {
      this.vehicle = move?.airlift && t < 1 ? "helicopter" : "tank";
      this.pointAt(t, this.sprite.position);
    }
    const rotor = this.vehicle === "helicopter" ? Math.floor(seconds * ROTOR_RATE) % HELICOPTER_ROTOR.length : 0;
    if (this.marker.fighting) {
      const t = (seconds / FIRE_PERIOD + firePhase(this.marker.id)) % 1 * FIRE_PERIOD;
      this.redraw(t < FLASH_TIME ? "flash" : t < FLASH_TIME + SMOKE_TIME ? "smoke" : "idle", rotor);
    } else this.redraw("idle", rotor);
    this.sprite.scale.set(scale * (ARMY_W / ARMY_H), scale, 1);
  }

  /** Places the army a share t of the way along its sea route, as a warship while on the water. */
  private followTrack(t: number): void {
    const { points, lengths, sea, lon } = this.track!;
    const at = t * lengths[lengths.length - 1]!;
    let lo = 0;
    let hi = lengths.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid]! <= at) lo = mid;
      else hi = mid;
    }
    const span = lengths[hi]! - lengths[lo]!;
    this.sprite.position.copy(points[lo]!).lerp(points[hi]!, span > 0 ? (at - lengths[lo]!) / span : 0);
    this.vehicle = sea[lo]! && sea[hi]! ? "boat" : "tank";
    const east = ((lon[hi]! - lon[lo]! + 540) % 360) - 180;
    if (Math.abs(east) > 1e-9) this.heading = east > 0 ? 1 : -1;
  }

  private clearRoute(): void {
    this.track = null;
    if (!this.route) return;
    this.scene.remove(this.route);
    this.route.geometry.dispose();
    (this.route.material as THREE.Material).dispose();
    this.route = null;
  }

  dispose(): void {
    this.clearRoute();
    this.scene.remove(this.sprite);
    this.sprite.material.dispose();
    this.texture.dispose();
  }
}

/** A pixel person, 7 × 11: c = faction colour, s = skin, # = outline. */
const PERSON_ART = [
  "..###..",
  ".#sss#.",
  ".#sss#.",
  "..#s#..",
  ".#ccc#.",
  "#ccccc#",
  "#ccccc#",
  "s#ccc#s",
  ".#c#c#.",
  ".#c#c#.",
  ".##.##.",
];
/** The person's canvas: the art with a 1 px margin. */
const PERSON_W = 9;
const PERSON_H = 13;
/** An unidentified councilor's grey clothes and skin. */
const UNKNOWN_COLOR = "#8d969e";
const UNKNOWN_SKIN = "#b9c0c6";

function drawPerson(ctx: CanvasRenderingContext2D, color: string | null, selected: boolean): void {
  ctx.clearRect(0, 0, PERSON_W, PERSON_H);
  const outline = selected ? "#ffffff" : "#141a20";
  PERSON_ART.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ".") return;
      ctx.fillStyle = c === "c" ? (color ?? UNKNOWN_COLOR) : c === "s" ? (color ? "#e2b48c" : UNKNOWN_SKIN) : outline;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }),
  );
}

/** One councilor's sprite, standing just above the region's armies. */
class CouncilorSprite {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement("canvas");
  private readonly texture: THREE.CanvasTexture;
  private look = "";
  marker!: CouncilorMarker;

  constructor(private readonly scene: THREE.Scene) {
    this.canvas.width = PERSON_W;
    this.canvas.height = PERSON_H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, sizeAttenuation: false, depthWrite: false }));
    scene.add(this.sprite);
  }

  set(marker: CouncilorMarker): void {
    this.marker = marker;
    this.sprite.renderOrder = marker.selected ? 5 : 4;
    // Side by side, a person's width apart; feet a little above the centre so tanks there stay clear.
    this.sprite.center.set(0.5 - slotOffset(marker.slot) * 1.1, -0.45);
    latLonToVector(marker.at, this.sprite.position).multiplyScalar(RADIUS + 0.006);
    const look = `${marker.color}|${marker.selected}`;
    if (look !== this.look) {
      this.look = look;
      drawPerson(this.canvas.getContext("2d")!, marker.color, marker.selected);
      this.texture.needsUpdate = true;
    }
  }

  /** Sizes the person to match the armies' pixels (scale is ARMY_H pixels); hidden while their flight is in the air. */
  update(scale: number, flying: boolean): void {
    this.sprite.visible = !flying;
    this.sprite.scale.set((scale * PERSON_W) / ARMY_H, (scale * PERSON_H) / ARMY_H, 1);
  }

  dispose(): void {
    this.scene.remove(this.sprite);
    this.sprite.material.dispose();
    this.texture.dispose();
  }
}

function loadTexture(url: string, data: boolean): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url).then((texture) => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    // Id maps must be read back exactly, so no colour-space conversion.
    texture.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    return texture;
  });
}

/** CPU copy of the region id map, for picking. */
async function loadIdMap(url: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
}

export class Globe {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly earth: THREE.Mesh;
  private readonly tintData: Uint8Array;
  private readonly tintTexture: THREE.DataTexture;
  private readonly lightData: Uint8Array;
  private readonly lightTexture: THREE.DataTexture;
  private readonly occupationData: Uint8Array;
  private readonly occupationTexture: THREE.DataTexture;
  private readonly ownerData: Uint8Array;
  private readonly ownerTexture: THREE.DataTexture;
  private armies = new Map<string, ArmySprite>();
  private gameMinute = 0;
  /** Called with an army's id when its marker is clicked. */
  onSelectArmy: ((id: string) => void) | null = null;
  onSelectCouncilor: ((id: string) => void) | null = null;
  private councilors = new Map<string, CouncilorSprite>();
  private readonly sun = new THREE.Vector3(1, 0, 0);
  private idMap: { width: number; height: number; data: Uint8ClampedArray } | null = null;
  private seaMap: SeaMap | null = null;
  /** Sea routes already planned, by their ends. */
  private readonly seaRoutes = new Map<string, SeaRoute | null>();
  private frame = 0;
  private downAt: { x: number; y: number } | null = null;
  private hovered = -1;
  private readonly planeTexture = makePlaneTexture();
  private flights: FlightPath[] = [];
  private readonly missileTexture = artTexture(MISSILE_ART, { "#": "#5a6470", w: "#f2f4f6", r: "#e0453a", y: "#ffe27a", o: "#ff8a2a" });
  private readonly blastTexture = makeBlastTexture();
  private strikes: MissileStrike[] = [];
  private readonly clouds: THREE.Mesh;
  /** Shared uniforms: how much aerosol haze greys the globe (0–1), and the clouds' drift (turns). */
  private readonly haze = { value: 0 };
  private readonly drift = { value: 0 };
  private readonly clock = new THREE.Clock();
  private attracting = false;

  constructor(
    private readonly container: HTMLElement,
    regionCount: number,
    private readonly onSelectRegion: (regionIndex: number | null) => void,
    private readonly onHoverRegion: (regionIndex: number | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0.9, 1.2, 2.9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.35;
    this.controls.maxDistance = 6;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.8;

    this.scene.background = new THREE.Color("#05060d");

    // Index 0 is the sea; regions are 1..regionCount.
    const tintCount = regionCount + 1;
    this.tintData = new Uint8Array(tintCount * 4);
    this.tintTexture = new THREE.DataTexture(this.tintData, tintCount, 1, THREE.RGBAFormat);
    this.tintTexture.magFilter = THREE.NearestFilter;
    this.tintTexture.minFilter = THREE.NearestFilter;
    this.tintTexture.needsUpdate = true;
    this.lightData = new Uint8Array(tintCount * 4);
    this.lightTexture = new THREE.DataTexture(this.lightData, tintCount, 1, THREE.RGBAFormat);
    this.lightTexture.magFilter = THREE.NearestFilter;
    this.lightTexture.minFilter = THREE.NearestFilter;
    this.lightTexture.needsUpdate = true;
    this.occupationData = new Uint8Array(tintCount * 4);
    this.occupationTexture = new THREE.DataTexture(this.occupationData, tintCount, 1, THREE.RGBAFormat);
    this.occupationTexture.magFilter = THREE.NearestFilter;
    this.occupationTexture.minFilter = THREE.NearestFilter;
    this.occupationTexture.needsUpdate = true;
    this.ownerData = new Uint8Array(tintCount * 4);
    this.ownerTexture = new THREE.DataTexture(this.ownerData, tintCount, 1, THREE.RGBAFormat);
    this.ownerTexture.magFilter = THREE.NearestFilter;
    this.ownerTexture.minFilter = THREE.NearestFilter;
    this.ownerTexture.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        earth: { value: null },
        regions: { value: null },
        borders: { value: null },
        tints: { value: this.tintTexture },
        lights: { value: this.lightTexture },
        occupation: { value: this.occupationTexture },
        owners: { value: this.ownerTexture },
        tintCount: { value: tintCount },
        mapSize: { value: new THREE.Vector2(2048, 1024) },
        sunDirection: { value: this.sun },
        haze: this.haze,
      },
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 128, 64), material);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(ATMOSPHERE_RADIUS, 128, 64),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          sunDirection: { value: this.sun },
          // How far from side-on the back-face normal is at the planet's edge: sqrt(1 − (R / Ratm)²).
          edge: { value: Math.sqrt(1 - (RADIUS / ATMOSPHERE_RADIUS) ** 2) },
          haze: this.haze,
        },
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(CLOUD_RADIUS, 128, 64),
      new THREE.ShaderMaterial({
        vertexShader: cloudVertexShader,
        fragmentShader: cloudFragmentShader,
        // The cloud pixel grid matches the map's until the map loads (see below).
        uniforms: { grid: { value: new THREE.Vector2(2048, 1024) }, drift: this.drift, sunDirection: { value: this.sun }, haze: this.haze },
        transparent: true,
        depthWrite: false,
      }),
    );
    // Before the other see-through things, so markers above the clouds draw over them.
    this.clouds.renderOrder = -1;
    this.scene.add(this.earth, atmosphere, this.clouds, this.makeStars());

    const base = import.meta.env.BASE_URL;
    void Promise.all([
      loadTexture(`${base}map/earth.png`, false),
      loadTexture(`${base}map/regions.png`, true),
      loadTexture(`${base}map/borders.png`, false),
      loadIdMap(`${base}map/regions.png`),
    ]).then(([earth, regions, borders, idMap]) => {
      material.uniforms.earth!.value = earth;
      const image = earth.image as { width: number; height: number };
      material.uniforms.mapSize!.value.set(image.width, image.height);
      (this.clouds.material as THREE.ShaderMaterial).uniforms.grid!.value.set(image.width, image.height);
      material.uniforms.regions!.value = regions;
      material.uniforms.borders!.value = borders;
      this.idMap = idMap;
      this.seaMap = buildSeaMap(idMap);
      for (const a of this.armies.values()) a.replan();
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointerup", this.handleUp);
    canvas.addEventListener("pointermove", this.handleMove);
    canvas.addEventListener("pointerleave", this.handleLeave);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  private makeStars(): THREE.Points {
    // Fixed pseudo-random layout; the renderer does not need the simulation's RNG.
    const positions: number[] = [];
    let s = 1234567;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3(rand(), rand(), rand()).normalize().multiplyScalar(40);
      positions.push(v.x, v.y, v.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc8d0ff, size: 2, sizeAttenuation: false }));
  }

  /** Sets the tint of every region, indexed like regions.json. */
  setTints(tints: RegionTint[]): void {
    const color = new THREE.Color();
    tints.forEach((tint, i) => {
      const o = (i + 1) * 4;
      if (tint.color) {
        color.set(tint.color);
        this.tintData[o] = Math.round(color.r * 255);
        this.tintData[o + 1] = Math.round(color.g * 255);
        this.tintData[o + 2] = Math.round(color.b * 255);
      }
      this.tintData[o + 3] = tint.color ? Math.round(tint.strength * 255) : 0;
    });
    this.tintTexture.needsUpdate = true;
  }

  /** Night-light density (0–1) of every region, indexed like regions.json. */
  setLights(densities: number[]): void {
    densities.forEach((d, i) => (this.lightData[(i + 1) * 4] = Math.round(Math.min(1, Math.max(0, d)) * 255)));
    this.lightTexture.needsUpdate = true;
  }

  /** Glows the given regions (indexed like regions.json) to show they can be clicked. */
  setHover(regionIndices: number[]): void {
    for (let k = 1; k * 4 < this.lightData.length; k++) this.lightData[k * 4 + 1] = 0;
    for (const i of regionIndices) this.lightData[(i + 1) * 4 + 1] = 255;
    this.lightTexture.needsUpdate = true;
    this.renderer.domElement.style.cursor = regionIndices.length > 0 ? "pointer" : "";
  }

  /** Occupation of every region (indexed like regions.json): the occupier's colour and share. */
  /** Sets the nation (an index into nations.json) holding every region, indexed like regions.json. */
  setOwners(nations: number[]): void {
    nations.forEach((nation, i) => {
      const o = (i + 1) * 4;
      this.ownerData[o] = (nation + 1) & 0xff;
      this.ownerData[o + 1] = ((nation + 1) >> 8) & 0xff;
      this.ownerData[o + 3] = 255;
    });
    this.ownerTexture.needsUpdate = true;
  }

  setOccupation(occupation: RegionTint[]): void {
    const color = new THREE.Color();
    occupation.forEach((o, i) => {
      const k = (i + 1) * 4;
      if (o.color) {
        color.set(o.color);
        this.occupationData[k] = Math.round(color.r * 255);
        this.occupationData[k + 1] = Math.round(color.g * 255);
        this.occupationData[k + 2] = Math.round(color.b * 255);
      }
      this.occupationData[k + 3] = o.color ? Math.max(1, Math.round(o.strength * 255)) : 0;
    });
    this.occupationTexture.needsUpdate = true;
  }

  /** A navy's route between two region centres; null (an arc instead) until the map has loaded. */
  private readonly seaRouteFor = (from: LatLon, to: LatLon): SeaRoute | null => {
    if (!this.seaMap) return null;
    const key = `${from.lat},${from.lon}|${to.lat},${to.lon}`;
    if (!this.seaRoutes.has(key)) this.seaRoutes.set(key, seaRoute(this.seaMap, from, to));
    return this.seaRoutes.get(key)!;
  };

  /** Sets the armies shown. Markers are kept by id, so moving armies don't flicker. */
  setArmies(markers: ArmyMarker[]): void {
    const next = new Map<string, ArmySprite>();
    for (const marker of markers) {
      const sprite = this.armies.get(marker.id) ?? new ArmySprite(this.scene, this.seaRouteFor);
      this.armies.delete(marker.id);
      sprite.set(marker);
      next.set(marker.id, sprite);
    }
    for (const old of this.armies.values()) old.dispose();
    this.armies = next;
  }

  /** Sets the councilors shown on the map, kept by id. */
  setCouncilors(markers: CouncilorMarker[]): void {
    const next = new Map<string, CouncilorSprite>();
    for (const marker of markers) {
      const sprite = this.councilors.get(marker.id) ?? new CouncilorSprite(this.scene);
      this.councilors.delete(marker.id);
      sprite.set(marker);
      next.set(marker.id, sprite);
    }
    for (const old of this.councilors.values()) old.dispose();
    this.councilors = next;
  }

  /** Turns the globe (keeping the zoom) so a point faces the camera. */
  lookAt(p: LatLon): void {
    const distance = this.camera.position.length();
    this.camera.position.copy(latLonToVector(p).multiplyScalar(distance));
    this.controls.update();
  }

  /**
   * Title-screen mode: no mouse control, the camera close in and slowly circling the Earth,
   * with the sun kept behind the viewer's shoulder so the side in view stays in daylight.
   */
  attract(): void {
    this.attracting = true;
    this.controls.enabled = false;
    this.controls.enableDamping = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.camera.position.set(0.55, 0.62, 1.5).setLength(1.95);
    this.controls.update();
  }

  /** The game clock in minutes since the campaign start, for armies on the move. */
  setGameMinute(minute: number): void {
    this.gameMinute = minute;
  }

  /** How grey stratospheric aerosols make the atmosphere: 0 clear, 1 a full ashen veil. */
  setHaze(haze: number): void {
    this.haze.value = THREE.MathUtils.clamp(haze, 0, 1);
  }

  /** Places the sun for a day of the year (0 = 1 January) and time of day (fraction of 24 h UTC). */
  setTime(dayOfYear: number, dayFraction: number): void {
    sunDirection(dayOfYear, dayFraction, this.sun);
  }

  /**
   * Sets the flights shown. Flights already shown keep their progress; new ones take off
   * now, staggered a little when several start together.
   */
  setFlights(flights: Flight[]): void {
    const kept = new Map(this.flights.map((f) => [f.key, f]));
    const now = this.clock.getElapsedTime();
    let started = 0;
    const next = flights.map((flight) => {
      const existing = kept.get(JSON.stringify(flight));
      if (existing) {
        kept.delete(existing.key);
        return existing;
      }
      const path = new FlightPath(flight, this.planeTexture, now + 0.4 * started++);
      this.scene.add(path.group);
      return path;
    });
    for (const f of kept.values()) {
      this.scene.remove(f.group);
      f.dispose();
    }
    this.flights = next;
    if (started > 0) this.sizePlanes();
  }

  /**
   * Fires a missile from one point to another; a mushroom cloud rises where it lands.
   * Returns the seconds until impact.
   */
  launchMissile(from: LatLon, to: LatLon, color: string): number {
    const strike = new MissileStrike(from, to, color, this.missileTexture, this.blastTexture, this.clock.getElapsedTime());
    this.scene.add(strike.group);
    this.strikes.push(strike);
    return strike.duration;
  }

  /** Keeps the airplanes PLANE_PIXELS tall on screen whatever the canvas size. */
  private sizePlanes(): void {
    const height = this.container.clientHeight;
    if (height === 0) return;
    // A non-attenuated sprite of scale s spans s · projection[1][1] in clip space (2 = full height).
    const scale = (2 * PLANE_PIXELS) / (height * this.camera.projectionMatrix.elements[5]!);
    for (const f of this.flights) f.plane.scale.set(scale, scale, 1);
  }

  private aim(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
  }

  /** The marker (army or councilor) under a screen point, ignoring those behind the Earth. */
  private markerAt<T extends { sprite: THREE.Sprite }>(event: PointerEvent, markers: Map<string, T>): string | null {
    this.aim(event);
    const sprites = [...markers.values()].map((a) => a.sprite).filter((sprite) => sprite.visible);
    const hit = this.raycaster.intersectObjects(sprites, false)[0];
    if (!hit) return null;
    const ground = this.raycaster.intersectObject(this.earth)[0];
    if (ground && ground.distance < hit.distance - 0.02) return null;
    for (const [id, a] of markers) if (a.sprite === hit.object) return id;
    return null;
  }

  /** Region index under a screen point, or null for sea and space. */
  private regionAt(event: PointerEvent): number | null {
    if (!this.idMap) return null;
    this.aim(event);
    const uv = this.raycaster.intersectObject(this.earth)[0]?.uv;
    if (!uv) return null;
    const { width, height, data } = this.idMap;
    const x = Math.min(width - 1, Math.floor(uv.x * width));
    const y = Math.min(height - 1, Math.floor((1 - uv.y) * height));
    const o = (y * width + x) * 4;
    const id = data[o]! + data[o + 1]! * 256;
    return id > 0 ? id - 1 : null;
  }

  private readonly handleDown = (event: PointerEvent): void => {
    this.downAt = { x: event.clientX, y: event.clientY };
  };

  private readonly handleUp = (event: PointerEvent): void => {
    const down = this.downAt;
    this.downAt = null;
    // Dragging rotates the globe; only a near-stationary press counts as a click.
    if (!down || Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y) > 5) return;
    // Councilors stand in front of the armies, so they are picked first.
    const councilor = this.onSelectCouncilor ? this.markerAt(event, this.councilors) : null;
    const army = !councilor && this.onSelectArmy ? this.markerAt(event, this.armies) : null;
    if (councilor) this.onSelectCouncilor!(councilor);
    else if (army) this.onSelectArmy!(army);
    else this.onSelectRegion(this.regionAt(event));
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (this.downAt) return;
    const region = this.regionAt(event) ?? -1;
    if (region !== this.hovered) {
      this.hovered = region;
      this.onHoverRegion(region >= 0 ? region : null);
    }
  };

  private readonly handleLeave = (): void => {
    this.hovered = -1;
    this.onHoverRegion(null);
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.sizePlanes();
  }

  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.attracting) {
      const right = new THREE.Vector3().crossVectors(this.camera.up, this.camera.position).normalize();
      this.sun.copy(this.camera.position).normalize().addScaledVector(right, -0.45).normalize();
    }
    const seconds = this.clock.getElapsedTime();
    this.drift.value = (seconds * CLOUD_DRIFT) % 1;
    for (const f of this.flights) f.update(seconds, this.camera, this.camera.aspect);
    if (this.strikes.length > 0) {
      // Clip-space height of one CSS pixel for a non-attenuated sprite (see sizePlanes).
      const pixel = 2 / (Math.max(1, this.container.clientHeight) * this.camera.projectionMatrix.elements[5]!);
      for (const s of this.strikes) s.update(seconds, this.camera, this.camera.aspect, pixel);
      for (const s of this.strikes.filter((x) => x.done(seconds))) {
        this.scene.remove(s.group);
        s.dispose();
      }
      this.strikes = this.strikes.filter((x) => !x.done(seconds));
    }
    // Same on-screen size at any canvas size, as for the airplanes, but smaller when zoomed out.
    const height = this.container.clientHeight;
    if (height > 0) {
      const zoomOut = (1.7*this.camera.position.length() - CAMERA_START_DISTANCE) / (this.controls.maxDistance - CAMERA_START_DISTANCE);
      const pixels = ARMY_SCALE - (ARMY_SCALE - ARMY_SCALE_MIN) * THREE.MathUtils.clamp(zoomOut, 0, 1);
      const armyScale = (2 * ARMY_H * pixels) / (height * this.camera.projectionMatrix.elements[5]!);
      for (const a of this.armies.values()) a.update(this.gameMinute, armyScale, seconds);
      const flying = new Set(this.flights.filter((f) => !f.landed(seconds)).map((f) => f.id));
      for (const c of this.councilors.values()) c.update(armyScale, c.marker.flightId !== null && flying.has(c.marker.flightId));
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.handleDown);
    canvas.removeEventListener("pointerup", this.handleUp);
    canvas.removeEventListener("pointermove", this.handleMove);
    canvas.removeEventListener("pointerleave", this.handleLeave);
    this.controls.dispose();
    this.setFlights([]);
    this.setArmies([]);
    this.setCouncilors([]);
    for (const s of this.strikes) s.dispose();
    this.planeTexture.dispose();
    this.missileTexture.dispose();
    this.blastTexture.dispose();
    this.clouds.geometry.dispose();
    (this.clouds.material as THREE.Material).dispose();
    this.renderer.dispose();
    // Free the context now rather than at garbage collection: browsers cap live WebGL
    // contexts, and dev hot reloads create a new globe each time.
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}
