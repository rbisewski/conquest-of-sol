<script lang="ts">
  // Earth's climate, after Terra Invicta's Intel view: the Global Temperature Anomaly and what
  // drives it, the sea level and the ice still to melt, the GDP it costs, and the biggest emitters.
  import { baseContent } from "../../content/index";
  import {
    annualGdpDamage,
    GASES,
    isExtant,
    nationDef,
    nationEmissions,
    sustainability,
    temperatureAnomaly,
    temperatureParts,
    vulnerabilities,
    type Gases,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";

  const rules = baseContent.rules.climate;
  const world = $derived(game.state!);
  const climate = $derived(world.climate);
  const anomaly = $derived(temperatureAnomaly(baseContent, climate));
  const parts = $derived(temperatureParts(baseContent, climate));
  /** The atmosphere a year ago (or as far back as we have). */
  const yearAgo = $derived<Gases | null>(climate.history[0] ?? null);
  const anomalyYearAgo = $derived(yearAgo ? temperatureAnomaly(baseContent, yearAgo) : null);

  const ROWS: { id: keyof Gases; name: string; digits: number }[] = [
    { id: "co2", name: "Carbon dioxide (CO₂)", digits: 1 },
    { id: "ch4", name: "Methane (CH₄)", digits: 3 },
    { id: "n2o", name: "Nitrous oxide (N₂O)", digits: 4 },
    { id: "aerosols", name: "Excess stratospheric aerosols", digits: 4 },
  ];

  /** The ten biggest emitters, in Gt of CO₂ a year. */
  const emitters = $derived.by(() => {
    const v = vulnerabilities(world, baseContent);
    return world.nations
      .filter(isExtant)
      .map((n) => ({ nation: n, tonnes: nationEmissions(baseContent, n, v.get(n.id)) }))
      .sort((a, b) => b.tonnes - a.tonnes)
      .slice(0, 10);
  });
  const total = $derived.by(() => {
    const v = vulnerabilities(world, baseContent);
    return world.nations.filter(isExtant).reduce((sum, n) => sum + nationEmissions(baseContent, n, v.get(n.id)), 0);
  });

  const signed = (n: number, digits: number) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const close = () => (game.climateOpen = false);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && game.climateOpen && close()} />

{#if game.climateOpen}
  <div class="overlay">
    <section class="panel sheet" aria-label="Climate">
      <h3 class="section-title">
        <span class="title"><Icon name="climate" size={15} />Climate</span>
        <button class="icon-button flat" title="Close (Esc)" onclick={close}><Icon name="close" size={14} /></button>
      </h3>

      <div class="headline">
        <div class="stat cell">
          <span class="muted small">Global Temperature Anomaly</span>
          <strong class:bad={anomaly >= 2} class:warn={anomaly >= 1.5 && anomaly < 2}>{signed(anomaly, 2)}°C</strong>
          <span class="small muted">
            {signed(anomaly * 1.8, 2)}°F{#if anomalyYearAgo !== null} · {signed(anomaly - anomalyYearAgo, 3)}°C since {climate.history.length === 12 ? "a year ago" : `${climate.history.length} month${climate.history.length === 1 ? "" : "s"} ago`}{/if}
          </span>
        </div>
        <div class="stat cell">
          <span class="muted small"><Icon name="seaLevel" size={13} color="var(--accent)" /> Global Sea Level Anomaly</span>
          <strong>{signed(climate.seaLevel, 1)} cm</strong>
          <span class="small muted">{climate.seaLevel >= rules.seaLevel.visibleAt ? "Coastlines are retreating" : `Visible from +${rules.seaLevel.visibleAt} cm`} · it never falls back</span>
        </div>
        <div class="stat cell">
          <span class="muted small">GDP lost each year</span>
          <strong>{pct(annualGdpDamage(baseContent, anomaly, 4))}</strong>
          <span class="small muted">for a nation at Inequality 4 · ×1.14 per point more, ×2 in vulnerable regions, none in protected ones</span>
        </div>
      </div>

      <h4 class="section-title">Atmosphere</h4>
      <table class="rows">
        <thead>
          <tr><th></th><th class="num">Now (ppm)</th><th class="num">A year ago</th><th class="num">Warming</th></tr>
        </thead>
        <tbody>
          {#each ROWS as row (row.id)}
            <tr>
              <td>{row.name}</td>
              <td class="num">{climate[row.id].toFixed(row.digits)}</td>
              <td class="num muted">{yearAgo ? yearAgo[row.id].toFixed(row.digits) : "–"}</td>
              <td class="num" class:good={parts[row.id] < 0} class:bad={parts[row.id] > 0.5}>{signed(parts[row.id], 3)}°C</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="note muted small">
        Greenhouse gases warm the Earth above {rules.gases.co2.baseline} ppm CO₂, {rules.gases.ch4.baseline} ppm CH₄ and {rules.gases.n2o.baseline} ppm N₂O; volcanoes and nuclear weapons
        load the stratosphere with aerosols that cool it for a few years. The Spoils priority adds to the gases, and the Environment priority cuts a nation's pollution, and at 10 Sustainability takes them back out of the air.
      </p>

      <div class="columns">
        <div>
          <h4 class="section-title">Biggest emitters <span class="small">{(total / 1e9).toFixed(1)} Gt CO₂/yr</span></h4>
          <table class="rows">
            <tbody>
              {#each emitters as e (e.nation.id)}
                <tr>
                  <td><button class="link" onclick={() => (game.selectedNationId = e.nation.id)}><Flag nationId={e.nation.id} height={12} /> {nationDef(baseContent, e.nation.id).name}</button></td>
                  <td class="num">{(e.tonnes / 1e9).toFixed(2)} Gt</td>
                  <td class="num muted" title="Sustainability">
                    <Icon name="sustainability" size={12} color="var(--good)" />
                    {sustainability(e.nation).toFixed(2)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div>
          <h4 class="section-title">Ice</h4>
          <table class="rows">
            <tbody>
              {#each rules.melts as m (m.name)}
                {@const gone = climate.melted.includes(m.name)}
                <tr class:gone>
                  <td>{m.name}</td>
                  <td class="num">{gone ? "Collapsed" : `at +${m.degrees}°C`}</td>
                  <td class="num muted">{m.cm > 0 ? `+${m.cm} cm` : ""}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 42px 6px 6px;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    pointer-events: none;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: min(860px, 100%);
    max-height: 100%;
    overflow-y: auto;
    padding-bottom: 8px;
    pointer-events: auto;
    background: var(--panel-solid);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .headline {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 0 6px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 10px;
  }
  .stat strong {
    font-size: 1.6em;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .warn {
    color: #ff9a5a;
  }
  .rows {
    width: calc(100% - 12px);
    margin: 0 6px;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  .rows th {
    font-weight: 400;
    color: var(--muted);
    font-size: 0.85em;
  }
  .rows td,
  .rows th {
    padding: 2px 8px;
    border-bottom: 1px solid var(--border-soft);
  }
  .num {
    text-align: right;
    white-space: nowrap;
  }
  .note {
    margin: 0 12px;
  }
  .columns {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 6px;
  }
  .columns h4 {
    margin: 0 6px 2px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    background: transparent;
    border-color: transparent;
    text-align: left;
  }
  tr.gone td {
    color: var(--bad);
  }
</style>
