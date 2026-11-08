<script lang="ts">
  // Orbit panel (upper left, in place of its body's panel): a station orbit round a body or round
  // a Lagrange point of a body and its parent. Its name and what it goes round (a link to the
  // body); its height, period, speed and room for stations; its inclination, sunlight, radiation,
  // interface, natural antimatter and the tech that opens it; what it takes to found a platform
  // there from the Earth; and the stations in it (each opens its Hab panel). Opened from a body's
  // Orbits or Habs list.
  import { baseContent } from "../../content/index";
  import {
    checkFoundHab,
    dateOfDay,
    delivery,
    factionDef,
    formatLongDate,
    foundingCore,
    habTier,
    isBuilt,
    orbitExplored,
    orbitRadius,
    spaceBody,
    sunlight,
    type Breakdown,
    type HabState,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { bodyColor } from "../solar/bodyArt";
  import { orbitFigures } from "../solar/bodyFacts";
  import Emblem from "../ui/Emblem.svelte";
  import Icon from "../ui/Icon.svelte";

  const G = 6.674e-11;
  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const orbit = $derived(baseContent.orbits.find((o) => o.id === game.selectedOrbitId) ?? null);
  const body = $derived(orbit ? spaceBody(baseContent, orbit.body) : null);
  const parent = $derived(body?.parent ? spaceBody(baseContent, body.parent) : null);
  const stations = $derived(orbit ? world.habs.filter((h) => h.orbitId === orbit.id) : []);
  const open = $derived(orbit ? orbitExplored(world, orbit) : false);
  const destination = $derived(orbit ? ({ kind: "orbit", id: orbit.id } as const) : null);
  const core = $derived(destination ? foundingCore(baseContent, destination) : null);
  const sent = $derived(destination && core && faction ? delivery(world, baseContent, faction.id, destination, core) : null);
  const check = $derived(destination && faction ? checkFoundHab(world, baseContent, faction.id, destination) : null);
  /** Sunlight on a station's solar panels there (the hab rule needs only where it is). */
  const light = $derived(orbit ? sunlight(baseContent, { siteId: null, orbitId: orbit.id } as HabState) : 0);

  /** A circular orbit round the body: its period (days) and speed (km/s); round a Lagrange point, the body's own year. */
  const motion = $derived.by(() => {
    if (!orbit || !body) return null;
    if (orbit.lagrange) {
      const figures = orbitFigures(baseContent, body);
      return figures ? { periodDays: figures.periodDays, speedKms: figures.speedKms } : null;
    }
    const r = orbitRadius(baseContent, orbit);
    const mu = G * body.massKg;
    return { periodDays: (2 * Math.PI * Math.sqrt((r * r * r) / mu)) / 86400, speedKms: Math.sqrt(mu / r) / 1000 };
  });

  const number = (n: number, digits = 0) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const period = (days: number) => (days < 1 ? `${number(days * 24, 1)} hours` : days < 1000 ? `${number(days, days < 10 ? 1 : 0)} days` : `${number(days / 365.25, 1)} years`);
  const onDay = (day: number) => formatLongDate(dateOfDay(baseContent.rules.startYear, day));
  const explain = (b: Breakdown, digits: number) => b.terms.map((t) => `${t.label}: ${t.op === "mul" ? "×" : ""}${t.value.toFixed(digits)}`).join("\n");
  /** How each Lagrange point sits: [before the smaller body, between the bodies]. */
  const POINTS: [string, string][] = [["", ""], ["between", "and"], ["beyond", "from"], ["opposite", "round"], ["60° ahead of", "round"], ["60° behind", "round"]];

  function height(): string {
    if (!orbit || !body) return "";
    if (orbit.lagrange) return orbit.semiMajorAxisKm !== undefined ? `${number(orbit.semiMajorAxisKm)} km` : "Halo";
    if (orbit.altitudeKm !== undefined) return `${number(orbit.altitudeKm)} km`;
    return `${number(orbitRadius(baseContent, orbit) / 1000 - body.radiusKm)} km`;
  }
  function found() {
    if (faction && destination) void game.command({ type: "foundHab", factionId: faction.id, destination });
  }
  function toBody(id: string) {
    game.view = "solar";
    game.selectedBodyId = id;
  }
  const close = () => (game.selectedOrbitId = null);
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && !game.habDetailsOpen && close();
</script>

<svelte:window onkeydown={onKey} />

{#if orbit && body}
  <section class="panel orbit-panel">
    <header class="title">
      <h2>{orbit.lagrange ? "Lagrange Point Orbit" : "Orbit"}</h2>
      <button class="icon-button" title="Close (Esc)" onclick={close}><Icon name="close" size={16} /></button>
    </header>

    <div class="identity">
      <span class="name" class:long={orbit.name.length > 22}>{orbit.name}</span>
      <span class="muted small">
        {#if orbit.lagrange && parent}
          At L{orbit.lagrange}, {POINTS[orbit.lagrange]![0]}
          <button class="link" onclick={() => toBody(body.id)}><span class="swatch" style:background={bodyColor(body.id, body.type)}></span>{body.name}</button>
          {POINTS[orbit.lagrange]![1]}
          <button class="link" onclick={() => toBody(parent.id)}><span class="swatch" style:background={bodyColor(parent.id, parent.type)}></span>{parent.name === "Sol" ? "the Sun" : parent.name}</button>
        {:else}
          Round <button class="link" onclick={() => toBody(body.id)}><span class="swatch" style:background={bodyColor(body.id, body.type)}></span>{body.name}</button>
        {/if}
      </span>
      <span class="badges">
        {#if orbit.interface}<span class="badge" title="Interface orbit: where fleets meet the surface"><Icon name="interface" size={13} color="var(--accent)" /> Interface</span>{/if}
        {#if orbit.irradiation}<span class="badge bad" title="Modules built here weigh this much more, the extra paid in base metals"><Icon name="radiation" size={13} color="var(--bad)" /> Radiation ×{orbit.irradiation}</span>{/if}
        {#if orbit.earthLeo}<span class="badge" title="Some modules can be built only here">Low Earth orbit</span>{/if}
      </span>
    </div>

    <div class="figures">
      <div class="figure cell" title={orbit.lagrange ? "Its halo's radius round the point" : "Height above the surface"}><span class="value">{height()}</span><span class="label">{orbit.lagrange ? "Halo" : "Altitude"}</span></div>
      <div class="figure cell" title={orbit.lagrange ? `The point goes round with ${body.name}` : "Time for a station to go round once"}><span class="value">{motion ? period(motion.periodDays) : "?"}</span><span class="label">Period</span></div>
      <div class="figure cell" title="Orbital speed"><span class="value">{motion ? `${number(motion.speedKms, 2)} km/s` : "?"}</span><span class="label">Speed</span></div>
      <div class="figure cell" title="Stations in it / how many it can hold"><span class="value">{stations.length}/{orbit.capacity}</span><span class="label">Stations</span></div>
    </div>

    <dl>
      {#if !orbit.lagrange}<dt>From the centre</dt><dd>{number(orbitRadius(baseContent, orbit) / 1000)} km</dd>{/if}
      <dt>Inclination</dt><dd>{number(orbit.inclinationDeg, 1)}°</dd>
      <dt>Sunlight</dt><dd title="Solar modules here make this share of their power in full sun at the Earth's distance (out of the body's shadow)">{number(light * 100)}%</dd>
      {#if orbit.antimatterUgPerYear}<dt>Antimatter</dt><dd title="Natural antimatter an antimatter trap can collect">{orbit.antimatterUgPerYear} µg a year</dd>{/if}
      <dt>Opened by</dt>
      <dd>{orbit.exploreTech ? baseContent.techs.find((t) => t.id === orbit.exploreTech)?.name : "Open from the start"}{#if orbit.exploreTech}<span class={open ? "good" : "muted"}> · {open ? "done" : "not yet"}</span>{/if}</dd>
    </dl>

    {#if sent && core && check}
      <div class="journey small">
        <span>{core.name} from the Earth:</span>
        <span title={explain(sent.deltaV, 2)}>Δv {sent.deltaV.value.toFixed(1)} km/s</span>
        <span title={sent.boost ? explain(sent.boost, 2) : ""}><Icon name="boost" size={13} />{sent.boost ? sent.boost.value.toFixed(1) : "–"}</span>
        <span class="muted">arrives {onDay(sent.arrivesDay)}</span>
      </div>
      <div class="journey small">
        {#if check.ok}
          <button class="launch" title="Send a {core.name} from the Earth to found a station here" onclick={found}><Icon name="habitat" size={15} />Found a platform here</button>
        {:else}<span class="muted">To found a platform: {check.reason}</span>{/if}
      </div>
    {/if}

    <div class="count">{stations.length} Station{stations.length === 1 ? "" : "s"}</div>
    {#if stations.length > 0}
      <table class="list">
        <tbody>
          {#each stations as h (h.id)}
            <tr>
              <td><Emblem faction={h.factionId} size={14} /> <button class="name-link" title="Open {h.name}" onclick={() => (game.selectedHabId = h.id)}>{h.name}</button></td>
              <td class="muted">{factionDef(baseContent, h.factionId).name}</td>
              <td>{isBuilt(world, h.modules[0]!) ? ["I", "II", "III"][habTier(baseContent, h) - 1] : "Founding"}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted small empty">No station here yet.</p>
    {/if}
  </section>
{/if}

<style>
  .orbit-panel {
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
  .identity {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 10px 8px;
    background: radial-gradient(circle at 30% 40%, #121a26, #070a10 70%);
  }
  .name {
    font-size: 1.8em;
    line-height: 1.05;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .name.long {
    font-size: 1.4em;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text);
  }
  .link:hover {
    color: var(--accent);
  }
  .swatch {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    box-shadow: inset -3px -3px 4px rgba(0, 0, 0, 0.55);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    border: 1px solid var(--border-soft);
    font-size: 0.85em;
  }
  .badge.bad {
    color: var(--bad);
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
    padding: 4px 10px 8px;
    font-size: 0.9em;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .good {
    color: var(--good);
  }
  .small {
    font-size: 0.85em;
  }
  .journey {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    padding: 4px 10px;
  }
  .journey span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .list {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .list td {
    padding: 2px 10px;
    border-top: 1px solid var(--border-soft);
  }
  .list td + td {
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
  .count {
    margin: 6px 4px 2px;
    padding: 3px;
    text-align: center;
    background: var(--header);
    color: var(--header-text);
  }
  .launch {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .empty {
    margin: 4px 10px 10px;
  }
</style>
