<script lang="ts">
  // Celestial Body panel (upper left in the Solar System view), after Terra Invicta's
  // "Terrestrial Planet: Venus": the body's class, a large pixel-art portrait lit from the
  // upper left, surface gravity and name, what it orbits, then Terra Invicta's four figures
  // (distance from its parent, orbital period, escape velocity, diameter), its orbit, its
  // distance from the Earth now and the next launch window from the Earth (src/sim/transfers.ts).
  // Below, the lists: Moons (name and type; a name opens that moon here), Sites (its hab sites'
  // monthly yields, estimated until a probe we launch from here prospects them; a site picked
  // turns the portrait to it, the sites marked on it), Orbits (for stations), and Stations and
  // Fleets (still to come). Opened by clicking a body.
  import { untrack } from "svelte";
  import { baseContent } from "../../content/index";
  import {
    bodyExplored,
    checkFoundHab,
    checkLaunchProbe,
    dateOfDay,
    delivery,
    formatLongDate,
    foundingCore,
    habBodyId,
    habTier,
    isBuilt,
    MINED_RESOURCES,
    orbitExplored,
    probeDays,
    probeTo,
    siteEstimate,
    transferFromEarth,
    yearsSinceJ2000,
    type Breakdown,
    type Destination,
    type HabOrbitDef,
    type HabSiteDef,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { bodyMap, bodyReach, bodyRelief, canvasSize, drawBody, drawComet, drawRock, drawSun, hasMap, isSphere, SUN_REACH, type MapImage, type Orient, type Relief } from "../solar/bodyArt";
  import { bodyClass, distanceFromEarth, escapeVelocity, moonsOf, orbitFigures, surfaceGravity } from "../solar/bodyFacts";
  import { scientific } from "../ui/format";
  import Emblem from "../ui/Emblem.svelte";
  import Icon from "../ui/Icon.svelte";
  import type { IconName } from "../ui/icons";
  import { drawSprite, SITE_MARKER, SITE_PALETTES } from "../ui/pixelArt";
  import { SPACE_RESOURCE_NAMES } from "../ui/resourceNames";

  const AU_KM = 149597870.7;
  /** Art radius of the portrait, drawn at 2× like the other pixel art. */
  const PORTRAIT_RADIUS = 40;
  const EARTH_MASS_KG = 5.972e24;
  /** Bodies whose mass reads better in kilograms than in Earths, and dwarf planets lighter than this many Earths (all but Pluto and Eris). */
  const SMALL_BODIES = new Set(["asteroid", "asteroidalMoon", "comet"]);
  const SMALL_DWARF_EARTHS = 0.001;
  const DEG = Math.PI / 180;
  /** Sites this near the portrait's limb or beyond are left unmarked. */
  const LIMB = 0.2;

  const body = $derived(baseContent.solarSystem.find((b) => b.id === game.selectedBodyId) ?? null);
  const parent = $derived(body?.parent ? baseContent.solarSystem.find((b) => b.id === body.parent) : null);
  const years = $derived(game.state ? yearsSinceJ2000(baseContent.rules.startYear, game.state.dayIndex, game.dayFraction) : 30);
  const gravity = $derived(body ? surfaceGravity(body) : null);
  const escape = $derived(body ? escapeVelocity(body) : null);
  const figures = $derived(body ? orbitFigures(baseContent, body) : null);
  const fromEarth = $derived(body && body.id !== "Earth" ? distanceFromEarth(baseContent, body.id, years) : null);
  const launch = $derived(body ? transferFromEarth(baseContent, body.id, years) : null);
  const moons = $derived(body ? moonsOf(baseContent, body.id) : []);
  /** What the list holds: the Sun's are planets, asteroids and comets, not moons. */
  const noun = $derived(body?.type === "star" ? ["Body", "Bodies"] : ["Moon", "Moons"]);
  /** The open list; kept from body to body, as in Terra Invicta. */
  let tab = $state<"moons" | "sites" | "orbits" | "stations" | null>(null);

  const world = $derived(game.state);
  const faction = $derived(world?.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const sites = $derived(body ? baseContent.habSites.filter((s) => s.body === body.id) : []);
  /** The body's own orbits, lowest first, then those round its Lagrange points with its parent. */
  const orbits = $derived(body ? baseContent.orbits.filter((o) => o.body === body.id).sort((a, b) => (a.lagrange ?? 0) - (b.lagrange ?? 0)) : []);
  const explored = $derived(body !== null && world !== null && bodyExplored(world, baseContent, body.id));
  const prospected = $derived(body !== null && !!faction?.prospected.includes(body.id));
  const probe = $derived(body && faction ? probeTo(faction, body.id) : undefined);
  const probeCheck = $derived(body && world && faction && sites.length > 0 ? checkLaunchProbe(world, baseContent, faction.id, body.id) : null);
  /** The day a probe launched now would arrive. */
  const probeArrives = $derived(probeCheck?.ok ? world!.dayIndex + Math.max(1, Math.ceil(probeDays(world!, baseContent, faction!.id, body!.id))) : null);
  const probeCost = Object.entries(baseContent.rules.space.probeCost) as [IconName, number][];
  const techName = (id: string | undefined) => baseContent.techs.find((t) => t.id === id)?.name ?? "";
  const onDay = (day: number) => formatLongDate(dateOfDay(baseContent.rules.startYear, day));

  /** Sending a core from the Earth, and whether we can found a hab there now. All of a body's sites share the same journey. */
  function journey(destination: Destination) {
    const core = foundingCore(baseContent, destination);
    return { core, sent: delivery(world!, baseContent, faction!.id, destination, core), check: checkFoundHab(world!, baseContent, faction!.id, destination) };
  }
  /** The site picked in the Sites list, which the portrait turns to: at first the first one with a place on the map. */
  let siteId = $state<string | null>(null);
  $effect(() => {
    const first = sites.find((s) => s.lat !== undefined)?.id ?? null;
    untrack(() => (siteId = first));
  });
  /** The site an outpost would be founded at: the one picked in the list, else the first free one. */
  const foundSiteId = $derived(siteId ?? sites.find((s) => !world?.habs.some((h) => h.siteId === s.id))?.id ?? sites[0]?.id ?? null);
  const siteJourney = $derived(world && faction && foundSiteId ? journey({ kind: "site", id: foundSiteId }) : null);
  /** Every faction's habs on or round this body. */
  const habsHere = $derived(body && world ? world.habs.filter((h) => habBodyId(baseContent, h) === body.id) : []);
  const holder = (siteId: string) => world?.habs.find((h) => h.siteId === siteId) ?? null;
  function found(destination: Destination) {
    if (faction) void game.command({ type: "foundHab", factionId: faction.id, destination });
  }
  function openHab(id: string) {
    game.selectedHabId = id;
    game.selectedCouncilorId = null;
    game.selectedArmyId = null;
  }
  /** A breakdown's terms, a line each, for a tooltip. */
  const explain = (b: Breakdown, digits: number) => b.terms.map((t) => `${t.label}: ${t.op === "mul" ? "×" : ""}${t.value.toFixed(digits)}`).join("\n");

  /** Where the portrait turns to face, while the Sites list is open on a round body: the picked site. */
  const facing = $derived.by(() => {
    if (tab !== "sites" || !body || !isSphere(body.id)) return null;
    const site = sites.find((s) => s.id === siteId);
    return site?.lat !== undefined && site.lon !== undefined ? { lat: site.lat, lon: site.lon } : null;
  });

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
      const r = Math.floor(PORTRAIT_RADIUS / bodyReach(body.id));
      if (facing === null) {
        drawBody(ctx, body.id, r, LIGHT, maps[body.id] ?? null, null, undefined, reliefs[body.id] ?? null);
        return;
      }
      // Turned about its pole and tipped so the picked site faces us (the unturned portrait faces 90° W, north up).
      const turn = (facing.lon + 90) * DEG;
      const tip = facing.lat * DEG;
      const [c, s, ct, st] = [Math.cos(turn), Math.sin(turn), Math.cos(tip), Math.sin(tip)];
      // View to the globe's frame: tip back about the view's x axis, then turn about the pole; and back again.
      const orient: Orient = ([x, y, z]) => {
        const [ty, tz] = [ct * y + st * z, -st * y + ct * z];
        return [c * x + s * tz, ty, -s * x + c * tz];
      };
      const toView: Orient = ([x, y, z]) => {
        const [vx, vz] = [c * x - s * z, s * x + c * z];
        return [vx, ct * y - st * vz, st * y + ct * vz];
      };
      drawBody(ctx, body.id, r, LIGHT, maps[body.id] ?? null, orient, undefined, reliefs[body.id] ?? null);
      markSites(ctx, sites, r, toView);
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
    return onDay(Math.floor(game.state.dayIndex + game.dayFraction + yearsAhead * 365.25));
  }

  /** Pixel-art markers on the portrait for the sites on the side facing us, the picked one on top. */
  function markSites(ctx: CanvasRenderingContext2D, list: HabSiteDef[], r: number, toView: Orient) {
    const centre = ctx.canvas.width / 2;
    const ordered = [...list].sort((a, b) => Number(a.id === siteId) - Number(b.id === siteId));
    for (const site of ordered) {
      if (site.lat === undefined || site.lon === undefined) continue;
      const lat = site.lat * DEG;
      const lon = site.lon * DEG;
      // The globe's convention: (cos lat cos lon, sin lat, −cos lat sin lon).
      const [x, y, z] = toView([Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)]);
      if (z < LIMB) continue;
      const palette = SITE_PALETTES[site.id === siteId ? "selected" : prospected ? "prospected" : "unknown"];
      drawSprite(ctx, SITE_MARKER, palette, centre + x * r, centre - y * r);
    }
  }

  /** A site's monthly yield, or "–" for none. */
  const amount = (v: number) => (v === 0 ? "–" : v.toFixed(v < 100 ? 1 : 0));
  /** Height for a body's orbit, its radius for a Lagrange point's, or what kind it is. */
  function altitude(o: HabOrbitDef): string {
    if (o.altitudeKm !== undefined) return `${number(o.altitudeKm)} km`;
    if (o.semiMajorAxisKm !== undefined && o.lagrange) return `${number(o.semiMajorAxisKm)} km round L${o.lagrange}`;
    if (o.semiMajorAxisKm !== undefined) return `${number(o.semiMajorAxisKm - body!.radiusKm)} km`;
    return o.synchronous ? "Synchronous" : "Parking";
  }

  function launchProbe() {
    if (body && faction) void game.command({ type: "launchProbe", factionId: faction.id, bodyId: body.id });
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

    {#if launch?.window}
      <p class="window small">
        Earth Launch Window: <strong>{launch.window.inYears < 1 / 365.25 ? "open now" : dateIn(launch.window.inYears)}</strong>
        <span class="muted">· {period(launch.transferYears * 365.25)} transfer</span>
      </p>
    {:else if launch}
      <p class="window small">Transfer from Earth: <strong>{period(launch.transferYears * 365.25)}</strong> <span class="muted">· no launch window needed</span></p>
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
        <dt>Inclination</dt><dd>{number(body.orbit.localI ?? body.orbit.i, 1)}°</dd>
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
      <button class:active={tab === "sites" && sites.length > 0} disabled={sites.length === 0} onclick={() => (tab = tab === "sites" ? null : "sites")}>{sites.length} {sites.length === 1 ? "Site" : "Sites"}</button>
      <button class:active={tab === "orbits" && orbits.length > 0} disabled={orbits.length === 0} onclick={() => (tab = tab === "orbits" ? null : "orbits")}>{orbits.length} {orbits.length === 1 ? "Orbit" : "Orbits"}</button>
      <button class:active={tab === "stations" && habsHere.length > 0} disabled={habsHere.length === 0} onclick={() => (tab = tab === "stations" ? null : "stations")}>{habsHere.length} {habsHere.length === 1 ? "Hab" : "Habs"}</button>
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

    {#if tab === "sites" && sites.length > 0 && world}
      <div class="prospect small">
        {#if !explored}
          <span class="muted">Opens to probes and bases with {techName(body.exploreTech)}</span>
        {:else if prospected}
          <span class="good">Prospected: the yields below are known</span>
        {:else if probe}
          <span class="en-route"><Icon name="probe" size={16} />Our probe arrives on {onDay(probe.arrivesDay)}</span>
        {:else if probeCheck}
          <button class="launch" disabled={!probeCheck.ok} title={probeCheck.ok ? "Launch a probe from the Earth to prospect the sites and learn their yields" : probeCheck.reason} onclick={launchProbe}>
            <Icon name="probe" size={18} />Launch Probe
            {#each probeCost as [resource, amount] (resource)}<span class="cost"><Icon name={resource} size={13} />{amount}</span>{/each}
          </button>
          {#if probeArrives !== null}<span class="muted">Arrives {onDay(probeArrives)}</span>{:else if !probeCheck.ok}<span class="bad">{probeCheck.reason}</span>{/if}
        {/if}
      </div>
      {#if siteJourney}
        {@const { core, sent, check } = siteJourney}
        <div class="journey small">
          <span>{core.name} to the surface:</span>
          <span class="figure-inline" title={explain(sent.deltaV, 2)}>Δv {sent.deltaV.value.toFixed(1)} km/s</span>
          <span class="figure-inline" title={sent.boost ? explain(sent.boost, 2) : check.ok ? "" : check.reason}><Icon name="boost" size={13} />{sent.boost ? sent.boost.value.toFixed(1) : "–"}</span>
          <span class="muted">arrives {onDay(sent.arrivesDay)}</span>
        </div>
        <div class="journey small">
          {#if check.ok}
            <button class="launch" title="Send an {core.name} from the Earth to found a base here" onclick={() => found({ kind: "site", id: foundSiteId! })}>
              <Icon name="habitat" size={15} />Found an outpost at {sites.find((s) => s.id === foundSiteId)!.name}
            </button>
          {:else}<span class="muted">To found an outpost at {sites.find((s) => s.id === foundSiteId)!.name}: {check.reason}</span>{/if}
        </div>
      {/if}
      <table class="list sites">
        <thead>
          <tr>
            <th>Site</th>
            {#each MINED_RESOURCES as r (r)}<th title={SPACE_RESOURCE_NAMES[r]}><Icon name={r} size={14} /></th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each sites as s (s.id)}
            {@const yields = prospected ? world.siteYields[s.id]! : siteEstimate(baseContent, world.difficulty, s.id)}
            <tr class:picked={s.id === siteId}>
              <td>
                <button class="name-link" onclick={() => (siteId = s.id)}>{s.name}</button>
                {#if holder(s.id)}{@const h = holder(s.id)!}<button class="holder" title={h.name} onclick={() => h.factionId === faction?.id && openHab(h.id)}><Emblem faction={h.factionId} size={14} /></button>{/if}
              </td>
              {#each MINED_RESOURCES as r (r)}<td class:estimate={!prospected}>{!prospected && yields[r] > 0 ? "~" : ""}{amount(yields[r])}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="note small muted">{prospected ? "What a mine at each site yields a month." : "Estimated monthly yields; a probe finds the real ones."}</p>
    {/if}

    {#if tab === "orbits" && orbits.length > 0 && world && faction}
      <table class="list">
        <thead>
          <tr><th>Orbit</th><th>Altitude</th><th title="Δv from low Earth orbit, km/s">Δv</th><th title="Boost to send a Platform Core from the Earth"><Icon name="boost" size={13} /></th><th title="Stations in it / how many it can hold">Stations</th><th></th></tr>
        </thead>
        <tbody>
          {#each orbits as o (o.id)}
            {@const open = orbitExplored(world, o)}
            {@const { core, sent, check } = journey({ kind: "orbit", id: o.id })}
            <tr class:locked={!open} class:ready={check.ok} title={`${core.name} arrives ${onDay(sent.arrivesDay)}. ${check.ok ? "We can found a platform here." : `To found a platform: ${check.reason}.`}`}>
              <td>
                {o.name}
                {#if o.interface}<span class="tag" title="Interface orbit: where fleets meet the surface">Interface</span>{/if}
                {#if o.irradiation}<span class="tag bad" title="Radiation: modules built here weigh this much more">Radiation ×{o.irradiation}</span>{/if}
              </td>
              <td>{altitude(o)}</td>
              <td title={explain(sent.deltaV, 2)}>{sent.deltaV.value.toFixed(1)}</td>
              <td title={sent.boost ? explain(sent.boost, 2) : ""}>{sent.boost ? sent.boost.value.toFixed(1) : "–"}</td>
              <td>{world.habs.filter((h) => h.orbitId === o.id).length}/{o.capacity}</td>
              <td>{#if check.ok}<button class="found" title="Send a {core.name} from the Earth to found a station here" onclick={() => found({ kind: "orbit", id: o.id })}>+</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if tab === "stations" && habsHere.length > 0 && world}
      <table class="list">
        <thead>
          <tr><th>Hab</th><th>Where</th><th>Tier</th></tr>
        </thead>
        <tbody>
          {#each habsHere as h (h.id)}
            <tr>
              <td>
                <Emblem faction={h.factionId} size={14} />
                {#if h.factionId === faction?.id}<button class="name-link" onclick={() => openHab(h.id)}>{h.name}</button>{:else}{h.name}{/if}
              </td>
              <td>{h.siteId ? sites.find((s) => s.id === h.siteId)?.name : baseContent.orbits.find((o) => o.id === h.orbitId)?.name}</td>
              <td>{isBuilt(world, h.modules[0]!) ? ["I", "II", "III"][habTier(baseContent, h) - 1] : "Founding"}</td>
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
    grid-template-columns: repeat(5, 1fr);
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
  .name-link:disabled {
    color: inherit;
    cursor: default;
  }
  .prospect,
  .journey {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 10px;
    border-top: 1px solid var(--border-soft);
  }
  .launch,
  .en-route,
  .cost {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .cost {
    gap: 2px;
    margin-left: 4px;
    color: var(--muted);
  }
  .good {
    color: var(--good);
  }
  .bad {
    color: var(--bad);
  }
  .sites th + th,
  .sites td + td {
    padding: 1px 4px;
  }
  .sites .estimate {
    color: var(--muted);
  }
  .sites tr.picked td {
    background: rgba(255, 211, 122, 0.08);
  }
  .sites tr.picked .name-link {
    color: #ffd37a;
  }
  .note {
    margin: 0;
    padding: 4px 10px 8px;
  }
  .locked {
    color: var(--muted);
  }
  .ready td:first-child {
    color: var(--good);
  }
  .journey {
    border-top: none;
    padding-top: 0;
  }
  .figure-inline {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .holder {
    margin-left: 4px;
    padding: 0;
    border: 0;
    background: none;
    vertical-align: middle;
  }
  .found {
    min-width: 20px;
    padding: 0 5px;
    line-height: 1.2;
    color: var(--good);
  }
  .tag {
    margin-left: 6px;
    padding: 0 4px;
    border: 1px solid var(--border-soft);
    font-size: 0.8em;
    color: var(--accent);
  }
  .tag.bad {
    color: var(--bad);
  }
</style>
