<script lang="ts">
  // Celestial Body panel (upper left in the Solar System view), after Terra Invicta's
  // "Terrestrial Planet: Venus": the body's class, a large pixel-art portrait lit from the
  // upper left, surface gravity and name, what it orbits, then Terra Invicta's four figures
  // (distance from its parent, orbital period, escape velocity, diameter), its orbit, its
  // distance from the Earth now and
  // the next launch window from the Earth (bodyFacts.ts). Below, Terra Invicta's four lists:
  // Moons (name and type; a name opens that moon here), Orbits, Stations and Fleets (still to
  // come). Opened by clicking a body.
  import { untrack } from "svelte";
  import { baseContent } from "../../content/index";
  import { dateOfDay, yearsSinceJ2000 } from "../../sim/index";
  import { game } from "../game.svelte";
  import { bodyMap, bodyReach, bodyRelief, canvasSize, drawBody, drawComet, drawRock, drawSun, hasMap, SUN_REACH, type MapImage, type Relief } from "../solar/bodyArt";
  import { bodyClass, distanceFromEarth, escapeVelocity, launchWindow, moonsOf, orbitFigures, surfaceGravity } from "../solar/bodyFacts";
  import { scientific } from "../ui/format";
  import Icon from "../ui/Icon.svelte";

  const AU_KM = 149597870.7;
  /** Art radius of the portrait, drawn at 2× like the other pixel art. */
  const PORTRAIT_RADIUS = 40;
  const EARTH_MASS_KG = 5.972e24;
  /** Bodies whose mass reads better in kilograms than in Earths, and dwarf planets lighter than this many Earths (all but Pluto and Eris). */
  const SMALL_BODIES = new Set(["asteroid", "asteroidalMoon", "comet"]);
  const SMALL_DWARF_EARTHS = 0.001;
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
  /** What the list holds: the Sun's are planets, asteroids and comets, not moons. */
  const noun = $derived(body?.type === "star" ? ["Body", "Bodies"] : ["Moon", "Moons"]);
  /** The open list; kept from body to body, as in Terra Invicta. */
  let tab = $state<"moons" | null>(null);

  let canvas = $state<HTMLCanvasElement>();
  /** The surface map of the body shown, by id, once loaded (only that one, so the others' memory can go). */
  let maps = $state<Record<string, MapImage>>({});
  /** And a lumpy body's relief. */
  let reliefs = $state<Record<string, Relief>>({});
  $effect(() => {
    const id = body?.id;
    if (id && !maps[id]) void bodyMap(id)?.then((m) => { if (body?.id === id) maps = { [id]: m }; });
    if (id && !reliefs[id]) void bodyRelief(id)?.then((r) => { if (body?.id === id) reliefs = { [id]: r }; });
  });

  /** Seconds between frames of the Sun's flames, as in the Solar System view, and of a comet's tails. */
  const SUN_FRAME = 1 / 10;
  const COMET_FRAME = 1 / 8;
  /** The portrait's light, from the upper left. */
  const LIGHT = { x: -0.55, y: 0.35, z: 0.76 };

  $effect(() => {
    if (!canvas || !body) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Small bodies are lumpy rocks, but for those drawn from maps of their own (the moons of Mars, a few asteroids).
    if ((body.type === "asteroid" || body.type === "asteroidalMoon") && !hasMap(body.id)) {
      drawRock(ctx, body.id, body.type, PORTRAIT_RADIUS, LIGHT);
      return;
    }
    if (body.type === "comet") {
      // The comet's tails stream on, like the Sun's flames; its nucleus drawn from its maps once
      // they are loaded, if it has them (a little larger than the rock, for its lumps reach out).
      const id = body.id;
      let nucleus: HTMLCanvasElement | null = null;
      if (maps[id] && reliefs[id]) {
        const r = Math.floor((PORTRAIT_RADIUS * 0.42) / 1.3);
        nucleus = document.createElement("canvas");
        nucleus.width = nucleus.height = canvasSize(id, r);
        drawBody(nucleus.getContext("2d")!, id, r, LIGHT, maps[id], null, undefined, reliefs[id]);
      }
      const start = performance.now();
      const timer = setInterval(() => drawComet(ctx, id, PORTRAIT_RADIUS, LIGHT, (performance.now() - start) / 1000, nucleus), COMET_FRAME * 1000);
      drawComet(ctx, id, PORTRAIT_RADIUS, LIGHT, 0, nucleus);
      return () => clearInterval(timer);
    }
    if (body.type !== "star") {
      // A ringed planet is drawn smaller, so its rings fit the frame.
      drawBody(ctx, body.id, Math.floor(PORTRAIT_RADIUS / bodyReach(body.id)), LIGHT, maps[body.id] ?? null, null, undefined, reliefs[body.id] ?? null);
      return;
    }
    // The Sun's portrait burns on, its flames reaching to the frame.
    const start = performance.now();
    // Turned and spotted as at the game's date, read as each frame is drawn (the clock ticking
    // mustn't restart the animation).
    const timer = setInterval(() => drawSun(ctx, (PORTRAIT_RADIUS + 1) / SUN_REACH, (performance.now() - start) / 1000, years), SUN_FRAME * 1000);
    drawSun(ctx, (PORTRAIT_RADIUS + 1) / SUN_REACH, 0, untrack(() => years));
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
        <span class="name" class:long={body.name.length > 14}>{body.name}</span>
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
        <dt>Mass</dt><dd>{SMALL_BODIES.has(body.type) || (body.type === "dwarf" && body.massKg < SMALL_DWARF_EARTHS * EARTH_MASS_KG) ? `${scientific(body.massKg)} kg` : `${(body.massKg / EARTH_MASS_KG).toPrecision(3)} Earths`}</dd>
      {/if}
    </dl>

    <nav class="tabs">
      <button class:active={tab === "moons" && moons.length > 0} disabled={moons.length === 0} onclick={() => (tab = tab === "moons" ? null : "moons")}>{moons.length} {moons.length === 1 ? noun[0] : noun[1]}</button>
      <button disabled title="Still to come">Orbits</button>
      <button disabled title="Still to come">Stations</button>
      <button disabled title="Still to come">Fleets</button>
    </nav>

    {#if tab === "moons" && moons.length > 0}
      <table class="list">
        <thead>
          <tr><th>{body.type === "star" ? "Name" : "Moon Name"}</th><th>Type</th></tr>
        </thead>
        <tbody>
          {#each moons as m (m.id)}
            <tr>
              <td><button class="name-link" onclick={() => (game.selectedBodyId = m.id)}>{m.name}</button></td>
              <td>{m.composition ?? bodyClass(m)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<style>
  .body-panel {
    display: flex;
    flex-direction: column;
    width: 440px;
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
    min-width: 0;
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
    overflow-wrap: anywhere;
  }
  .name.long {
    font-size: 1.5em;
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
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid var(--border-soft);
  }
  .tabs button {
    border: none;
    border-right: 1px solid var(--border-soft);
    background: rgba(48, 64, 80, 0.55);
    padding: 5px 4px;
  }
  .tabs button:last-child {
    border-right: none;
  }
  .tabs button.active {
    background: var(--button-hover);
    color: var(--accent);
  }
  .tabs button:disabled {
    color: var(--muted);
  }
  .list {
    width: 100%;
    border-collapse: collapse;
    border-top: 1px solid var(--border-soft);
    font-size: 0.9em;
  }
  .list th {
    font-weight: 400;
    color: var(--muted);
    text-align: left;
    padding: 4px 10px;
  }
  .list td {
    padding: 1px 10px;
    border-top: 1px solid var(--border-soft);
  }
  .list td + td,
  .list th + th {
    text-align: center;
  }
  .name-link {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-align: left;
  }
  .name-link:hover {
    color: var(--accent);
  }
</style>
