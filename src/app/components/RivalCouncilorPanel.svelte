<script lang="ts">
  // Rival Councilor (upper left), opened by clicking another faction's councilor on the globe.
  // It shows only what our intel reveals, by Terra Invicta's levels as in the intelligence file
  // (CouncilorSummary): located at 10% (grey on the map, nothing but where they are), identity
  // at 25%, attributes, traits and orgs at 50%, the current mission at 75% and true Loyalty at
  // 100%. "Intelligence File" opens the full screen once they are identified.
  import { baseContent } from "../../content/index";
  import {
    ATTRIBUTES,
    effectiveAttributes,
    factionDef,
    findAnyCouncilor,
    intelOn,
    MISSION_NAMES,
    nationDef,
    orgDef,
    professionDef,
    regionDef,
    traitDef,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { describeTarget } from "../missionTargets";
  import Emblem from "../ui/Emblem.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";
  import { attributeColor, attributeIcons } from "../ui/icons";
  import Portrait from "../ui/Portrait.svelte";

  const world = $derived(game.state!);
  const rules = baseContent.rules.missions;
  const found = $derived(game.rivalCouncilorId ? findAnyCouncilor(world, game.rivalCouncilorId) : null);
  const intel = $derived(found && game.playerFactionId ? intelOn(world, game.playerFactionId, found.councilor.id) : 0);
  const identified = $derived(intel >= rules.intelToTarget);
  const reveal = $derived({ stats: intel >= 0.5, mission: intel >= 0.75, loyalty: intel >= 1 });
  /** The next thing more intel would reveal, as a hint. */
  const next = $derived(
    !identified ? `Identity at ${Math.round(rules.intelToTarget * 100)}% intel` : !reveal.stats ? "Attributes, traits and orgs at 50% intel" : !reveal.mission ? "Current mission at 75% intel" : !reveal.loyalty ? "True Loyalty at 100% intel" : null,
  );

  const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const close = () => (game.rivalCouncilorId = null);
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && !game.summaryCouncilorId && close();
</script>

<svelte:window onkeydown={onKey} />

<section class="panel rival">
  <header class="title">
    <Emblem faction={found && identified ? found.factionId : null} size={26} title={found && identified ? factionDef(baseContent, found.factionId).name : "Unknown faction"} />
    <h2>{found && identified ? found.councilor.name : "Unidentified Councilor"}</h2>
    <button class="icon-button" title="Close (Esc)" onclick={close}><Icon name="close" size={16} /></button>
  </header>

  {#if !found}
    <p class="muted body">This councilor is no longer in play.</p>
  {:else}
    {@const c = found.councilor}
    <div class="body">
      <div class="identity">
        {#if identified}
          <Portrait councilor={c} factionId={found.factionId} variant="full" scale={1} />
        {:else}
          <div class="unknown" aria-label="Unknown face">?</div>
        {/if}
        <dl>
          <dt>Faction</dt><dd>{identified ? factionDef(baseContent, found.factionId).name : "Unknown"}</dd>
          <dt>Profession</dt><dd>{identified ? professionDef(baseContent, c.professionId).name : "Unknown"}</dd>
          <dt>Location</dt>
          <dd><Flag nationId={c.locationId} height={12} /> {regionDef(baseContent, c.regionId).name}, {nationDef(baseContent, c.locationId).name}</dd>
          <dt>Mission</dt>
          <dd>
            {#if !reveal.mission}<span class="muted">Unknown</span>
            {:else if c.mission}{MISSION_NAMES[c.mission.type]} ({describeTarget(world, c.mission)})
            {:else}Idle{/if}
          </dd>
        </dl>
      </div>

      <div class="intel" title="Our intel on this councilor">
        <span>Intel</span>
        <span class="bar"><span style:width="{intel * 100}%"></span></span>
        <span>{Math.round(intel * 100)}%</span>
      </div>
      {#if next}<p class="muted small">{next}.</p>{/if}

      {#if reveal.stats}
        {@const effective = effectiveAttributes(baseContent, c)}
        <h3 class="section-title">Attributes</h3>
        <ul class="attributes">
          {#each ATTRIBUTES as attr (attr)}
            {@const Glyph = attributeIcons[attr]}
            <li title={title(attr)}>
              <span style:color={attributeColor[attr]}><Glyph size={14} strokeWidth={2} /></span>
              {attr === "loyalty" && !reveal.loyalty ? "?" : effective[attr]}
            </li>
          {/each}
        </ul>
        <h3 class="section-title">Traits</h3>
        <ul class="tags">
          {#each c.traits as id (id)}
            {@const t = traitDef(baseContent, id)}
            <li class={t.kind} title={t.description}>{t.name}</li>
          {:else}
            <li class="muted">No notable traits</li>
          {/each}
        </ul>
        <h3 class="section-title">Orgs</h3>
        <ul class="tags">
          {#each c.orgs as id (id)}
            <li>{orgDef(baseContent, id).name}</li>
          {:else}
            <li class="muted">None</li>
          {/each}
        </ul>
      {/if}

      {#if identified}
        <button class="file" onclick={() => (game.summaryCouncilorId = c.id)}>Intelligence File</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .rival {
    display: flex;
    flex-direction: column;
    width: 340px;
    max-height: 100%;
    overflow-y: auto;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border-soft);
  }
  .title h2 {
    flex: 1;
    margin: 0;
    font-size: 1.05em;
    font-weight: 500;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
  }
  .identity {
    display: flex;
    gap: 10px;
  }
  .unknown {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 80px;
    border: 1px solid var(--border-soft);
    background: #2a3138;
    color: var(--muted);
    font-size: 2em;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    align-content: start;
    gap: 2px 8px;
    margin: 0;
    font-size: 0.9em;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .intel {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9em;
  }
  .intel .bar {
    flex: 1;
    height: 6px;
    background: #1d2833;
  }
  .intel .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .attributes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px 8px;
    margin: 0;
    padding: 0 4px;
    list-style: none;
  }
  .attributes li {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0 4px;
    list-style: none;
    font-size: 0.85em;
  }
  .tags li:not(.muted) {
    padding: 1px 6px;
    border: 1px solid var(--border-soft);
  }
  .tags .positive {
    color: var(--good);
  }
  .tags .negative {
    color: var(--bad);
  }
  .file {
    align-self: center;
    margin-top: 4px;
  }
  .small {
    margin: 0;
    font-size: 0.85em;
  }
</style>
