// Solar System view, after Terra Invicta's: the Sun in the middle and every body on its orbit,
// to scale in AU (src/sim/orbits.ts places them at the game's date). Orbits are drawn for the
// planets, their moons and the larger dwarf planets; the other dwarf planets, asteroids and
// comets are small pixel-art sprites (smallBodies.ts). Bodies are pixel-art discs (bodyArt.ts) lit from the Sun's real
// direction, at least a fixed size on screen, and at their true size once the camera is close
// enough for that to be bigger. A moon shows once its orbit is wide enough on screen to tell
// it from its planet.
//
// The camera orbits a focused body and follows it along its orbit; clicking a body focuses it.
// The view and the globe are one: the globe is drawn see-through on top of this view, and while
// it has the camera this view follows it frame by frame (followGlobe, through earthFrame.ts), so
// the stars, the Sun and the Moon behind the globe are this view's. Pulling out, the globe fades
// into the Earth's pixel-art disc (drawn from the globe's map at the same size and turned the
// same way), and past GLOBE_FARTHEST Earth radii this view takes the camera; scrolling back in
// (or double-clicking the Earth, which flies home first) hands back. Near the Earth the camera's
// up is the Earth's axis, as on the globe, turning to the ecliptic's further out.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Content, SpaceBodyDef } from "../../sim/content";
import { orbitPath, solarPositions, type Vec3 } from "../../sim/orbits";
import { GLOBE_FADE_FROM, GLOBE_FARTHEST } from "../globe/Globe";
import { bodyMap, canvasSize, drawBody, drawSun, hasMap, hasStyle, sunCanvasSize, type Light, type MapImage, type Orient } from "./bodyArt";
import { bodyToScene, hasFrame } from "./bodyFrames";
import { EARTH_POLE, globeToScene } from "./earthFrame";
import { disposeSmallBodies, makeSmallBodies, setSmallBodiesSun, setSmallBodyShown } from "./smallBodies";

/** Ecliptic coordinates (z north) to the scene's (y up). */
const toScene = (p: Vec3, out = new THREE.Vector3()) => out.set(p.x, p.z, -p.y);

/** CSS pixels per art pixel. */
const PIXEL = 2;
/** Art radius in pixels of the bodies drawn as discs; other dwarf planets, asteroidal moons, asteroids and comets are small sprites (smallBodies.ts). */
const ART_RADIUS: Record<string, number> = {
  Sol: 12,
  Jupiter: 8,
  Saturn: 7,
  Uranus: 5,
  Neptune: 5,
  Earth: 5,
  Venus: 5,
  Mars: 4,
  Mercury: 3,
  Ganymede: 3,
  Titan: 3,
  Callisto: 3,
  Io: 3,
  Luna: 3,
  Europa: 3,
  Triton: 3,
  Pluto: 3,
  Eris: 3,
  Ceres: 2,
  Haumea: 2,
  Makemake: 2,
};
const MOON_RADIUS = 2;
/** The largest art radius a close-up disc is drawn at; past that its pixels grow instead. */
const MAX_ART_RADIUS = 80;
/** Ringed bodies' close art radii: smaller, as their rings make their canvases two to two and a half times as wide. */
const RINGED_CLOSE_ART_RADIUS: Record<string, number> = { Saturn: 160, Uranus: 180, Neptune: 144, Haumea: 152 };
/**
 * Larger for a body drawn from its own map, that the camera can come right down to: a quarter
 * of the map's width, so the middle of the disc shows each map pixel as one art pixel (less for
 * a ringed one).
 */
const CLOSE_ART_RADIUS: Record<string, number> = Object.fromEntries(
  ["Mercury", "Venus", "Luna", "Mars", "Ceres", "Jupiter", "Io", "Europa", "Ganymede", "Callisto", "Saturn", "Mimas", "Enceladus", "Tethys", "Dione", "Rhea", "Titan", "Iapetus", "Uranus", "Miranda", "Ariel", "Umbriel", "Titania", "Oberon", "Neptune", "Triton", "Pluto", "Eris", "Haumea", "Makemake"].map((id) => [
    id,
    RINGED_CLOSE_ART_RADIUS[id] ?? 256,
  ]),
);
/** How close the camera can come to such a body, in its radii (as the globe does the Earth). */
const CLOSE_RADII = 1.35;

const AU_KM = 149597870.7;
const EARTH_RADIUS_AU = 6378.137 / AU_KM;
/** Where the globe and this view meet, in AU from the Earth's centre. */
const HANDOFF = GLOBE_FARTHEST * EARTH_RADIUS_AU;
const MAX_DISTANCE = 160;
/** A moon (asteroidal moons too) shows once its orbit's radius spans this many CSS pixels; a planet or dwarf planet once
 * it is this far from the Sun on screen, and its name once it is LABEL_MIN_PIXELS away (the
 * focused body always shows), so the inner planets don't pile up on the Sun when zoomed out. */
const MOON_MIN_PIXELS = 16;
const PLANET_MIN_PIXELS = 10;
const LABEL_MIN_PIXELS = 30;
/** Planet and dwarf-planet orbits fade in between these camera distances (AU), so close to a body they don't streak across the view. */
const ORBIT_FADE: [number, number] = [0.003, 0.05];
/** Seconds between redraws of the Sun's flames: a few a second, like hand-drawn animation frames; fewer close up, where each costs more. */
const SUN_FRAME = 1 / 10;
const SUN_FRAME_CLOSE = 1 / 6;
/** Seconds the camera takes to swing to a newly focused body, and to fly home to the Earth. */
const FOCUS_SECONDS = 0.6;
const HOME_SECONDS = 1.4;
/** Between these distances from the Earth (AU) the camera's up turns from the Earth's axis to the ecliptic's. */
const UP_TURN: [number, number] = [HANDOFF, 0.05];
const ECLIPTIC_UP = new THREE.Vector3(0, 1, 0);

const ORBIT_COLORS: Record<string, { color: string; opacity: number }> = {
  planet: { color: "#3d74d6", opacity: 0.6 },
  moon: { color: "#3d74d6", opacity: 0.4 },
  dwarf: { color: "#7d8a99", opacity: 0.3 },
};
/** The orbit of a small body (drawn without one), shown while it is selected. */
const SELECTED_ORBIT = { color: "#8fa3b8", opacity: 0.65 };

interface BodyView {
  def: SpaceBodyDef;
  /** Art radius at its smallest, and now (bigger when close enough to show its true size). */
  baseR: number;
  r: number;
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  orbit: THREE.LineLoop | null;
  label: HTMLDivElement;
  /** The size, light direction (and, for the Earth, the turn) the disc was last drawn with, rounded. */
  lightKey: string;
  shown: boolean;
}

function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SolarSystem {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly labels: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly stars: THREE.Points;
  private readonly bodies: BodyView[] = [];
  private readonly byId = new Map<string, BodyView>();
  /** Bodies drawn as small sprites, and their points. */
  private readonly dots: SpaceBodyDef[] = [];
  private readonly dotPoints: THREE.Points;
  /** Whether each dot is drawn: asteroidal moons only once their orbits are wide enough on screen. */
  private readonly dotShown: boolean[] = [];
  /** The selected small body's orbit, and that body. */
  private selectedOrbit: { def: SpaceBodyDef; line: THREE.LineLoop } | null = null;
  /** Scene positions of every body, by id. */
  private readonly positions = new Map<string, THREE.Vector3>();
  private years = Number.NaN;
  private placedYears = Number.NaN;
  private focusId = "Earth";
  private focusFrom: { from: THREE.Vector3; start: number } | null = null;
  private readonly clock = new THREE.Clock();
  /** Surface maps of the bodies that have one (bodyArt.ts), once loaded. */
  private readonly maps = new Map<string, MapImage>();
  /** While the globe has the camera, this view follows it (followGlobe) instead of drawing on its own. */
  private following = false;
  /** A flight home to the Earth, from a distance in AU. */
  private homing: { from: number; start: number } | null = null;
  private frame = 0;
  private downAt: { x: number; y: number } | null = null;
  /** The Sun's direction in the globe's frame, from the game clock, and the globe-to-scene rotation it gives. */
  private readonly sunInGlobe = new THREE.Vector3(1, 0, 0);
  private readonly earthToScene = new THREE.Matrix4();
  /** Called with a body's id when it is clicked. */
  onSelectBody: ((id: string) => void) | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly content: Content,
    /**
     * Called to hand over to the globe, with the camera's direction in the globe's frame, its
     * distance in Earth radii, and whether the globe should glide on in (after a flight home).
     */
    private readonly onEnterEarth: (direction: THREE.Vector3, distance: number, glide: boolean) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.labels = document.createElement("div");
    this.labels.className = "solar-labels";
    container.appendChild(this.labels);
    this.tooltip = document.createElement("div");
    this.tooltip.className = "solar-tooltip";
    container.appendChild(this.tooltip);

    this.camera = new THREE.PerspectiveCamera(40, 1, 1e-5, 1e4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = this.closest("Earth");
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.rotateSpeed = 0.5;
    this.scene.background = new THREE.Color("#05060d");

    this.stars = this.makeStars();
    this.scene.add(this.stars);

    for (const def of content.solarSystem) {
      this.positions.set(def.id, new THREE.Vector3());
      const r = def.type === "star" || def.type === "planet" ? (ART_RADIUS[def.id] ?? 4) : def.type === "moon" ? (ART_RADIUS[def.id] ?? MOON_RADIUS) : ART_RADIUS[def.id];
      if (r === undefined || (def.type === "dwarf" && !hasStyle(def.id))) {
        this.dots.push(def);
        continue;
      }
      this.addBody(def, r);
    }
    this.dotPoints = makeSmallBodies(this.dots, PIXEL * Math.min(window.devicePixelRatio, 2));
    this.dotShown.push(...this.dots.map(() => true));
    this.scene.add(this.dotPoints);

    for (const def of content.solarSystem) {
      if (!hasMap(def.id)) continue;
      void bodyMap(def.id)!.then((map) => {
        this.maps.set(def.id, map);
        const view = this.byId.get(def.id);
        if (view) view.lightKey = "";
      });
    }

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointerup", this.handleUp);
    canvas.addEventListener("pointermove", this.handleMove);
    canvas.addEventListener("pointerleave", this.handleLeave);
    canvas.addEventListener("dblclick", this.handleDoubleClick);
    canvas.addEventListener("wheel", this.handleWheel, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  private addBody(def: SpaceBodyDef, r: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = def.type === "star" ? sunCanvasSize(r) : canvasSize(def.id, r);
    const texture = pixelTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
    sprite.renderOrder = def.type === "star" ? 3 : def.type === "moon" ? 4 : 5;
    this.scene.add(sprite);
    let orbit: THREE.LineLoop | null = null;
    const look = ORBIT_COLORS[def.type];
    if (def.orbit && look) {
      const points = orbitPath(def.orbit, def.type === "moon" ? 128 : 360).map((p) => toScene(p));
      orbit = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: look.color, transparent: true, opacity: look.opacity, depthTest: false, depthWrite: false }),
      );
      orbit.renderOrder = 1;
      this.scene.add(orbit);
    }
    const label = document.createElement("div");
    label.className = `solar-label ${def.type}`;
    label.textContent = def.name;
    this.labels.appendChild(label);
    const view: BodyView = { def, baseR: r, r, sprite, canvas, texture, orbit, label, lightKey: "", shown: true };
    this.bodies.push(view);
    this.byId.set(def.id, view);
  }

  private makeStars(): THREE.Points {
    // Fixed pseudo-random layout on a unit sphere, kept around the camera at any zoom.
    const positions: number[] = [];
    let s = 7654321;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < 2500; i++) {
      const v = new THREE.Vector3(rand(), rand(), rand()).normalize();
      positions.push(v.x, v.y, v.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xc8d0ff, size: 2, sizeAttenuation: false, depthTest: false, depthWrite: false }));
    points.renderOrder = 0;
    return points;
  }

  /** The game's time, in Julian years since J2000, and the Sun's direction in the globe's frame then (Globe.ts sunDirection). */
  setTime(years: number, sunInGlobe: THREE.Vector3): void {
    this.years = years;
    this.sunInGlobe.copy(sunInGlobe);
  }

  /**
   * Draws this view from the globe's camera (in Earth radii, the globe's frame), beneath the
   * globe: called by the globe every frame while it has the camera.
   */
  followGlobe(globeCamera: THREE.PerspectiveCamera): void {
    if (!this.following) {
      this.following = true;
      this.focusId = "Earth";
      this.focusFrom = null;
      this.homing = null;
      this.tooltip.style.display = "none";
    }
    this.place();
    const earth = this.positions.get("Earth")!;
    this.camera.quaternion.setFromRotationMatrix(this.earthToScene).multiply(globeCamera.quaternion);
    this.camera.position.copy(globeCamera.position).applyMatrix4(this.earthToScene).multiplyScalar(EARTH_RADIUS_AU).add(earth);
    this.camera.updateMatrixWorld();
    this.controls.target.copy(earth);
    this.draw();
  }

  /** The closest the camera comes to a body, in AU: for the Earth, where the globe takes over. */
  private closest(id: string): number {
    if (id === "Earth") return HANDOFF * 0.98;
    const body = this.content.solarSystem.find((b) => b.id === id)!;
    return Math.max((id in CLOSE_ART_RADIUS ? CLOSE_RADII : 3) * (body.radiusKm / AU_KM), 2e-6);
  }

  /** Takes over from the globe: focused on the Earth, the camera where the globe's was (direction in the globe's frame, distance in Earth radii). */
  enterFromGlobe(direction: THREE.Vector3, distance: number): void {
    this.following = false;
    this.placedYears = Number.NaN;
    this.place();
    this.focusId = "Earth";
    this.focusFrom = null;
    this.controls.minDistance = this.closest("Earth");
    const at = this.positions.get("Earth")!;
    const offset = direction.clone().transformDirection(this.earthToScene).multiplyScalar(Math.max(distance * EARTH_RADIUS_AU, this.controls.minDistance));
    this.controls.target.copy(at);
    this.camera.position.copy(at).add(offset);
    this.turnUp();
    this.controls.update();
  }

  /** Flies the camera home to the Earth and on into the globe. */
  returnToEarth(): void {
    if (this.following || this.homing) return;
    this.focus("Earth");
    this.homing = { from: this.camera.position.distanceTo(this.controls.target), start: this.clock.getElapsedTime() };
  }

  /** Hands over to the globe, the camera keeping its direction (and its distance, as far as the globe allows). */
  private handBack(glide: boolean): void {
    const offset = this.camera.position.clone().sub(this.positions.get("Earth")!);
    const toGlobe = this.earthToScene.clone().transpose();
    const distance = this.focusId === "Earth" ? offset.length() / EARTH_RADIUS_AU : GLOBE_FARTHEST;
    this.onEnterEarth(offset.transformDirection(toGlobe), Math.min(GLOBE_FARTHEST, distance), glide);
  }

  /**
   * Turns the camera's up from the Earth's axis (as the globe's, so nothing rolls where they
   * meet) near the Earth to the ecliptic's further out. OrbitControls keeps its own copy of up.
   */
  private turnUp(): void {
    const [near, far] = UP_TURN;
    const away = this.camera.position.distanceTo(this.positions.get("Earth")!);
    const t = THREE.MathUtils.clamp(Math.log(away / near) / Math.log(far / near), 0, 1);
    const up = this.camera.up.copy(EARTH_POLE).lerp(ECLIPTIC_UP, t * t * (3 - 2 * t)).normalize();
    const controls = this.controls as unknown as { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion };
    controls._quat.setFromUnitVectors(up, ECLIPTIC_UP);
    controls._quatInverse.copy(controls._quat).invert();
  }

  /** Shows the orbit of the selected body if it is a small one (whose orbit isn't otherwise drawn); null hides it. */
  showOrbitOf(id: string | null): void {
    if (this.selectedOrbit?.def.id === id) return;
    if (this.selectedOrbit) {
      this.scene.remove(this.selectedOrbit.line);
      this.selectedOrbit.line.geometry.dispose();
      (this.selectedOrbit.line.material as THREE.Material).dispose();
      this.selectedOrbit = null;
    }
    const def = id ? this.dots.find((d) => d.id === id) : undefined;
    if (!def?.orbit) return;
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(orbitPath(def.orbit, 360).map((p) => toScene(p))),
      new THREE.LineBasicMaterial({ color: SELECTED_ORBIT.color, transparent: true, opacity: SELECTED_ORBIT.opacity, depthTest: false, depthWrite: false }),
    );
    line.renderOrder = 1;
    this.scene.add(line);
    this.selectedOrbit = { def, line };
  }

  /** Swings the camera to a body, keeping its distance and angle. */
  focus(id: string): void {
    if (id === this.focusId) return;
    this.focusFrom = { from: this.controls.target.clone(), start: this.clock.getElapsedTime() };
    this.focusId = id;
    this.controls.minDistance = this.closest(id);
  }

  /** Moves every body to the current time. */
  private place(): void {
    if (this.years === this.placedYears || Number.isNaN(this.years)) return;
    this.placedYears = this.years;
    for (const [id, p] of solarPositions(this.content, this.years)) toScene(p, this.positions.get(id)!);
    const sunFromEarth = this.positions.get("Sol")!.clone().sub(this.positions.get("Earth")!).normalize();
    globeToScene(this.sunInGlobe, sunFromEarth, this.earthToScene);
    const attr = this.dotPoints.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.dots.forEach((d, i) => {
      const p = this.positions.get(d.id)!;
      attr.setXYZ(i, p.x, p.y, p.z);
    });
    attr.needsUpdate = true;
    this.dotPoints.geometry.computeBoundingSphere();
  }

  /** CSS pixels per scene unit at a point, for this camera. */
  private pixelsPerUnit(at: THREE.Vector3): number {
    const height = this.container.clientHeight;
    return (height / 2) * this.camera.projectionMatrix.elements[5]! / Math.max(1e-12, this.camera.position.distanceTo(at));
  }

  private animate = (): void => {
    this.frame = requestAnimationFrame(this.animate);
    if (this.following) return;
    this.place();
    // Zooming speeds up with distance: as on the globe where they meet, much faster out in the system.
    const away = this.camera.position.distanceTo(this.controls.target);
    this.controls.zoomSpeed = THREE.MathUtils.clamp(1.5 + 2 * Math.log10(Math.max(1, away / HANDOFF)), 1.5, 6);

    // Follow the focused body (swinging over to it after a new pick).
    const target = this.positions.get(this.focusId)!.clone();
    if (this.focusFrom) {
      const t = Math.min(1, (this.clock.getElapsedTime() - this.focusFrom.start) / FOCUS_SECONDS);
      const eased = t * t * (3 - 2 * t);
      target.lerpVectors(this.focusFrom.from, target, eased);
      if (t >= 1) this.focusFrom = null;
    }
    this.camera.position.add(target.clone().sub(this.controls.target));
    this.controls.target.copy(target);
    // Flying home: the distance shrinks evenly on a log scale while the camera swings to the Earth.
    if (this.homing) {
      const t = Math.min(1, (this.clock.getElapsedTime() - this.homing.start) / HOME_SECONDS);
      const eased = t * t * (3 - 2 * t);
      const to = this.controls.minDistance / 0.98;
      const offset = this.camera.position.clone().sub(target);
      offset.setLength(Math.exp(THREE.MathUtils.lerp(Math.log(this.homing.from), Math.log(to), eased)));
      this.camera.position.copy(target).add(offset);
      if (t >= 1) {
        this.homing = null;
        this.controls.update();
        this.handBack(true);
        return;
      }
    }
    this.turnUp();
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.draw();
  };

  /** Sizes, lights and labels the bodies for the camera as it is, and draws the frame. */
  private draw(): void {
    const away = this.camera.position.distanceTo(this.controls.target);
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.camera.near = distance * 1e-3;
    this.camera.far = distance * 1e3 + 500;
    this.camera.updateProjectionMatrix();
    this.stars.position.copy(this.camera.position);
    this.stars.scale.setScalar(distance * 100);

    const height = this.container.clientHeight;
    const unit = 2 / (Math.max(1, height) * this.camera.projectionMatrix.elements[5]!);
    const sun = this.positions.get("Sol")!;
    setSmallBodiesSun(this.dotPoints, sun);
    const view = this.camera.matrixWorldInverse;
    const screen = new THREE.Vector3();
    for (const b of this.bodies) {
      const at = this.positions.get(b.def.id)!;
      b.sprite.position.copy(at);
      // Close up, a body is drawn at its true size.
      const truePixels = (b.def.radiusKm / AU_KM) * this.pixelsPerUnit(at);
      this.resizeArt(b, Math.max(b.baseR, Math.min(CLOSE_ART_RADIUS[b.def.id] ?? MAX_ART_RADIUS, Math.ceil(truePixels / PIXEL))));
      const pixel = Math.max(PIXEL, truePixels / b.r);
      const size = b.canvas.width * pixel;
      b.sprite.scale.set(size * unit, size * unit, 1);
      // Moons show when their orbit is wide enough on screen, planets when clear of the Sun.
      const parent = b.def.parent ? this.positions.get(b.def.parent)! : null;
      const spread = parent ? b.def.orbit!.a * this.pixelsPerUnit(parent) : Infinity;
      const focused = b.def.id === this.focusId;
      b.shown = focused || spread > (b.def.type === "moon" ? MOON_MIN_PIXELS : PLANET_MIN_PIXELS);
      // Under the globe the Earth's disc shows only as the globe fades out, and isn't named.
      const underGlobe = this.following && b.def.id === "Earth";
      const named = b.shown && !underGlobe && (focused || spread > (b.def.type === "moon" ? MOON_MIN_PIXELS : LABEL_MIN_PIXELS));
      b.sprite.visible = b.shown && !(underGlobe && away < GLOBE_FADE_FROM * EARTH_RADIUS_AU);
      if (b.orbit) {
        b.orbit.visible = b.shown;
        if (parent) b.orbit.position.copy(parent);
        const look = ORBIT_COLORS[b.def.type]!;
        const material = b.orbit.material as THREE.LineBasicMaterial;
        const [near, far] = ORBIT_FADE;
        const fade = b.def.type === "moon" ? 1 : THREE.MathUtils.clamp(Math.log(away / near) / Math.log(far / near), 0, 1);
        material.opacity = (focused ? Math.min(1, look.opacity + 0.35) : look.opacity) * fade;
      }
      if (b.shown) {
        if (b.def.type === "star") this.flicker(b);
        else this.relight(b, sun, at, view);
      }
      screen.copy(at).project(this.camera);
      const onScreen = named && screen.z < 1 && Math.abs(screen.x) < 1.1 && Math.abs(screen.y) < 1.1;
      b.label.style.display = onScreen ? "" : "none";
      if (onScreen) {
        const x = ((screen.x + 1) / 2) * this.container.clientWidth;
        // Below the disc; the Sun's, below the usual reach of its flames.
        const y = ((1 - screen.y) / 2) * height + ((b.def.type === "star" ? b.r * 1.4 : b.r) * pixel + 2);
        b.label.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translateX(-50%)`;
        b.label.classList.toggle("focused", focused);
      }
    }
    if (this.selectedOrbit) this.selectedOrbit.line.position.copy(this.positions.get(this.selectedOrbit.def.parent!)!);
    // Asteroidal moons, like the moons, show when their orbits are wide enough on screen.
    this.dots.forEach((d, i) => {
      if (d.type !== "asteroidalMoon") return;
      const shown = d.id === this.focusId || d.orbit!.a * this.pixelsPerUnit(this.positions.get(d.parent!)!) > MOON_MIN_PIXELS;
      if (shown === this.dotShown[i]) return;
      this.dotShown[i] = shown;
      setSmallBodyShown(this.dotPoints, i, shown);
    });
    // The Sun's name gives way to the focused body's when they crowd together on screen.
    const sol = this.byId.get("Sol");
    if (sol && this.focusId !== "Sol") {
      const toSun = this.positions.get(this.focusId)!.distanceTo(sun) * this.pixelsPerUnit(sun);
      if (toSun < LABEL_MIN_PIXELS) sol.label.style.display = "none";
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Gives a disc a new art radius: a new canvas (and texture, as a texture can't change size). */
  private resizeArt(b: BodyView, r: number): void {
    if (r === b.r) return;
    b.r = r;
    b.canvas = document.createElement("canvas");
    b.canvas.width = b.canvas.height = b.def.type === "star" ? sunCanvasSize(r) : canvasSize(b.def.id, r);
    b.texture.dispose();
    b.texture = pixelTexture(b.canvas);
    b.sprite.material.map = b.texture;
    b.lightKey = "";
  }

  /** Redraws the Sun's next animation frame, when it is due (or its size has changed). */
  private flicker(b: BodyView): void {
    const every = b.r > 40 ? SUN_FRAME_CLOSE : SUN_FRAME;
    const frame = Math.floor(this.clock.getElapsedTime() / every);
    const key = `${b.r}:${every}:${frame}`;
    if (key === b.lightKey) return;
    b.lightKey = key;
    drawSun(b.canvas.getContext("2d")!, b.r, frame * every);
    b.texture.needsUpdate = true;
  }

  /** Redraws a disc when its size or the Sun's direction (as seen from the camera) has changed enough, or the Earth has turned. */
  private relight(b: BodyView, sun: THREE.Vector3, at: THREE.Vector3, view: THREE.Matrix4): void {
    const dir = sun.clone().sub(at);
    if (dir.lengthSq() < 1e-20) dir.set(0, 0, 1);
    dir.normalize().transformDirection(view);
    const light: Light = { x: dir.x, y: dir.y, z: dir.z };
    // Finer steps on a big disc, where a jump in the terminator would show.
    const steps = b.r > 12 ? 40 : 8;
    const map = this.maps.get(b.def.id) ?? null;
    let key = `${b.r}:${Math.round(light.x * steps)},${Math.round(light.y * steps)},${Math.round(light.z * steps)}${map ? "m" : ""}`;
    let orient: Orient | null = null;
    let pole: [number, number, number] | undefined;
    const toParent = b.def.parent ? this.positions.get(b.def.parent)!.clone().sub(at) : new THREE.Vector3(1, 0, 0);
    const frame = b.def.id === "Earth" ? this.earthToScene : hasFrame(b.def.id) ? bodyToScene(b.def.id, this.years, toParent) : null;
    if (frame) {
      // View space to the body's own frame (the globe's, for the Earth): camera to scene, then scene to body.
      const m = frame.clone().transpose().multiply(new THREE.Matrix4().extractRotation(this.camera.matrixWorld));
      const e = m.elements;
      // Finer on a big close-up disc, where a coarse step would make it jump as it turns.
      const turnSteps = b.r > MAX_ART_RADIUS ? 1200 : 60;
      key += `|${[0, 1, 2, 4, 5, 6].map((i) => Math.round(e[i]! * turnSteps)).join(",")}`;
      orient = ([x, y, z]) => [e[0]! * x + e[4]! * y + e[8]! * z, e[1]! * x + e[5]! * y + e[9]! * z, e[2]! * x + e[6]! * y + e[10]! * z];
      // The body's north pole in view space (for its rings).
      pole = [e[1]!, e[5]!, e[9]!];
    }
    if (key === b.lightKey) return;
    b.lightKey = key;
    drawBody(b.canvas.getContext("2d")!, b.def.id, b.r, light, map, orient, pole);
    b.texture.needsUpdate = true;
  }

  /** The body under a screen point: the nearest disc or dot within a few pixels of it. */
  private bodyAt(event: PointerEvent | MouseEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const screen = new THREE.Vector3();
    let best: string | null = null;
    let bestDistance = Infinity;
    const consider = (id: string, reach: number) => {
      screen.copy(this.positions.get(id)!).project(this.camera);
      if (screen.z > 1) return;
      const d = Math.hypot(((screen.x + 1) / 2) * rect.width - px, ((1 - screen.y) / 2) * rect.height - py);
      if (d <= reach && d < bestDistance) [best, bestDistance] = [id, d];
    };
    for (const b of this.bodies) if (b.shown) consider(b.def.id, Math.max(8, (b.sprite.scale.y / 2) * (rect.height * this.camera.projectionMatrix.elements[5]! / 2) * 0.85));
    this.dots.forEach((d, i) => this.dotShown[i] && consider(d.id, 6));
    return best;
  }

  private readonly handleDown = (event: PointerEvent): void => {
    this.downAt = { x: event.clientX, y: event.clientY };
  };

  private readonly handleUp = (event: PointerEvent): void => {
    const down = this.downAt;
    this.downAt = null;
    if (!down || Math.abs(event.clientX - down.x) + Math.abs(event.clientY - down.y) > 5) return;
    const id = this.bodyAt(event);
    if (!id) return;
    this.focus(id);
    this.onSelectBody?.(id);
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (this.bodyAt(event) === "Earth") this.returnToEarth();
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (this.downAt) return;
    const id = this.bodyAt(event);
    this.renderer.domElement.style.cursor = id ? "pointer" : "";
    if (!id) {
      this.tooltip.style.display = "none";
      return;
    }
    const def = this.content.solarSystem.find((b) => b.id === id)!;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.tooltip.textContent = def.name;
    this.tooltip.style.display = "";
    this.tooltip.style.transform = `translate(${event.clientX - rect.left + 12}px, ${event.clientY - rect.top - 8}px)`;
  };

  private readonly handleLeave = (): void => {
    this.tooltip.style.display = "none";
  };

  /** Scrolling on in at the closest zoom on the Earth carries on into the globe. */
  private readonly handleWheel = (event: WheelEvent): void => {
    const close = this.camera.position.distanceTo(this.controls.target) <= this.controls.minDistance * 1.02;
    if (event.deltaY < 0 && close && this.focusId === "Earth" && !this.focusFrom && !this.homing) this.handBack(false);
  };

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.handleDown);
    canvas.removeEventListener("pointerup", this.handleUp);
    canvas.removeEventListener("pointermove", this.handleMove);
    canvas.removeEventListener("pointerleave", this.handleLeave);
    canvas.removeEventListener("dblclick", this.handleDoubleClick);
    canvas.removeEventListener("wheel", this.handleWheel);
    this.controls.dispose();
    disposeSmallBodies(this.dotPoints);
    this.scene.traverse((object) => {
      const o = object as THREE.Mesh;
      o.geometry?.dispose();
      const material = o.material as THREE.Material | undefined;
      if (material) {
        (material as THREE.SpriteMaterial).map?.dispose();
        material.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.labels.remove();
    this.tooltip.remove();
  }
}
