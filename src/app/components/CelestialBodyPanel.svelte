<script lang="ts">
  // Celestial Body panel (upper left in the Solar System view), after Terra Invicta's
  // "Terrestrial Planet: Venus": the body's class, a large pixel-art portrait lit from the
  // upper left, surface gravity and name, what it orbits, then Terra Invicta's four figures
  // (distance from its parent, orbital period, escape velocity, diameter), its orbit, its
  // distance from the Earth now and
  // the next launch window from the Earth (bodyFacts.ts). Opened by clicking a body.
  import { baseContent } from "../../content/index";
  import { dateOfDay, yearsSinceJ2000 } from "../../sim/index";
  import { game } from "../game.svelte";
  import { drawBody, drawSun, earthMap, SUN_REACH, type MapImage } from "../solar/bodyArt";
  import { bodyClass, distanceFromEarth, escapeVelocity, launchWindow, moonsOf, orbitFigures, surfaceGravity } from "../solar/bodyFacts";
  import Icon from "../ui/Icon.svelte";

  const AU_KM = 149597870.7;
  /** Art radius of the portrait, drawn at 2× like the other pixel art. */
  const PORTRAIT_RADIUS = 40;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const body = $derived(baseContent.solarSystem.find((b) => b.id === game.selectedBodyId) ?? null);
  const parent = $derived(body?.parent ? baseContent.solarSystem.find((b) => b.id === body.parent) : null);
  const years = $derived(game.state ? yearsSinceJ2000(baseContent.rules.startYear, game.state.dayIndex, game.dayFraction) : 30);
  const gravity = $derived(body ? surfaceGravity(body) : null);
  const escape = $derived(body ? escapeVelocity(body) : null);
  const figures = $derived(body ? orbitFigures(baseContent, body) : null);
  const fromEarth = $derived(body && body.id !== "Earth" ? distanceFromEarth(baseContent, body.id, years) : null);
  const launch = $derived(body ? launchWindow(baseContent, body.id, years) : null);
  const moons = $derived(body ? moonsOf(baseContent, body.id) : []);

  let canvas = $state<HTMLCanvasElement>();
  let map = $state<MapImage | null>(null);
  void earthMap().then((m) => (map = m));

  /** Seconds between frames of the Sun's flames, as in the Solar System view. */
  const SUN_FRAME = 1 / 10;

  $effect(() => {
    if (!canvas || !body) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (body.type !== "star") {
      drawBody(ctx, body.id, PORTRAIT_RADIUS, { x: -0.55, y: 0.35, z: 0.76 }, map);
      return;
    }
    // The Sun's portrait burns on, its flames reaching to the frame.
    const start = performance.now();
    const timer = setInterval(() => drawSun(ctx, (PORTRAIT_RADIUS + 1) / SUN_REACH, (performance.now() - start) / 1000), SUN_FRAME * 1000);
    drawSun(ctx, (PORTRAIT_RADIUS + 1) / SUN_REACH, 0);
    return () => clearInterval(timer);
  });

  const number = (n: number, digits = 0) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  /** Distance from the parent: AU around the Sun, km around a planet. */
  const reach = (a: number) => (parent?.type === "star" ? `${number(a, a < 10 ? 2 : 1)} AU` : `${number(a * AU_KM)} km`);
  const period = (days: number) => (days < 1000 ? `${number(days, days < 10 ? 1 : 0)} days` : `${number(days / 365.25, 1)} years`);
  /** The game date a number of years from now. */
  function dateIn(yearsAhead: number): string {
    if (!game.state) return "";
    const day = game.state.dayIndex + game.dayFraction + yearsAhead * 365.25;
    const d = dateOfDay(baseContent.rules.startYear, Math.floor(day));
    return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
  }

  const close = () => (game.selectedBodyId = null);
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && !game.summaryCouncilorId && close();
</script>

<svelte:window onkeydown={onKey} />

{#if body}
  <section class="panel body-panel">
    <header class="title">
      <h2>{bodyClass(body)}</h2>
      <button class="icon-button" title="Close (Esc)" onclick={close}><Icon name="close" size={16} /></button>
    </header>

    <div class="hero">
      <canvas bind:this={canvas} width={2 * PORTRAIT_RADIUS + 2} height={2 * PORTRAIT_RADIUS + 2}></canvas>
      <div class="identity">
        {#if gravity !== null}<span class="gravity" title="Surface gravity">{number(gravity, 2)} g</span>{/if}
        <span class="name">{body.name}</span>
        <span class="muted small">
          {#if !parent}The centre of the Solar System{:else if parent.type === "star"}Orbits the Sun{:else}Moon of {parent.name}{/if}
        </span>
      </div>
    </div>

    {#if launch}
      <p class="window small">
        Earth Launch Window: <strong>{launch.inYears < 1 / 365.25 ? "open now" : dateIn(launch.inYears)}</strong>
        <span class="muted">· {period(launch.transferYears * 365.25)} transfer</span>
      </p>
    {/if}

    {#if body.orbit && figures}
      <div class="figures">
        <div class="figure cell" title="Semi-major axis: average distance from {parent?.name === 'Sol' ? 'the Sun' : parent?.name}">
          <span class="value">{reach(body.orbit.a)}</span><span class="label">Distance</span>
        </div>
        <div class="figure cell" title="Orbital period">
          <span class="value">{period(figures.periodDays)}</span><span class="label">Year</span>
        </div>
        <div class="figure cell" title="Escape velocity from the surface">
          <span class="value">{escape === null ? "?" : `${number(escape, escape < 1 ? 2 : 1)} kps`}</span><span class="label">Escape</span>
        </div>
        <div class="figure cell" title="Diameter">
          <span class="value">{number(body.radiusKm * 2)} km</span><span class="label">Diameter</span>
        </div>
      </div>
    {:else}
      <div class="figures">
        <div class="figure cell wide" title="Diameter">
          <span class="value">{number(body.radiusKm * 2)} km</span><span class="label">Diameter</span>
        </div>
      </div>
    {/if}

    <dl>
      {#if figures}
        <dt>Orbital speed</dt><dd>{number(figures.speedKms, 1)} km/s</dd>
      {/if}
      {#if body.orbit}
        <dt>Eccentricity</dt><dd>{number(body.orbit.e, 3)}</dd>
        <dt>Inclination</dt><dd>{number(body.orbit.i, 1)}°</dd>
      {/if}
      {#if fromEarth !== null}
        <dt>From Earth now</dt><dd>{fromEarth < 0.05 ? `${number(fromEarth * AU_KM)} km` : `${number(fromEarth, 2)} AU`} <span class="muted">· light takes {fromEarth * 499 < 120 ? `${number(fromEarth * 499, 1)} s` : `${number((fromEarth * 499) / 60, 1)} min`}</span></dd>
      {/if}
      {#if body.massKg}
        <dt>Mass</dt><dd>{(body.massKg / 5.972e24).toPrecision(3)} Earths</dd>
      {/if}
      {#if moons.length > 0}
        <dt>Moons</dt><dd>{moons.map((m) => m.name).join(", ")}</dd>
      {/if}
    </dl>
  </section>
{/if}

<style>
  .body-panel {
    display: flex;
    flex-direction: column;
    width: 360px;
    max-height: 100%;
    overflow-y: auto;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: var(--header);
  }
  .title h2 {
    flex: 1;
    margin: 0;
    font-size: 0.95em;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--header-text);
  }
  .hero {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 10px;
    background: radial-gradient(circle at 30% 40%, #121a26, #070a10 70%);
  }
  canvas {
    width: 164px;
    height: 164px;
    image-rendering: pixelated;
  }
  .identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 6px;
  }
  .gravity {
    color: var(--muted);
    font-size: 0.9em;
  }
  .name {
    font-size: 2em;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .window {
    margin: 0;
    padding: 6px 10px;
    border-top: 1px solid var(--border-soft);
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 6px 8px;
  }
  .figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 2px;
  }
  .figure.wide {
    grid-column: 1 / -1;
  }
  .value {
    font-size: 0.95em;
    white-space: nowrap;
  }
  .label {
    color: var(--muted);
    font-size: 0.75em;
    text-transform: uppercase;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    padding: 4px 10px 10px;
    font-size: 0.9em;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .small {
    font-size: 0.85em;
  }
</style>
