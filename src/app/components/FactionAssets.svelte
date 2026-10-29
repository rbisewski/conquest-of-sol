<script lang="ts">
  // Faction Assets (right side): our councilors, then the armies we command (through the CPs
  // they answer to). Spacecraft and Habitats have tabs ready for when space exists.
  // Tabs filter the list; the search box filters by name. A councilor who knows another faction
  // has intel on them shows that faction's logo on their portrait in the councilor panel.
  // With a free council seat, the recruit button opens the Recruiting screen.
  import { baseContent } from "../../content/index";
  import { armyActivity, armyCommander, armyName, councilSize, MISSION_NAMES, regionDef } from "../../sim/index";
  import { game } from "../game.svelte";
  import Icon from "../ui/Icon.svelte";
  import { missionIcons } from "../ui/icons";
  import Portrait from "../ui/Portrait.svelte";
  import Flag from "../ui/Flag.svelte";
  import { shownLocation } from "../missionTargets";

  type Filter = "all" | "councilors" | "armies" | "spacecraft" | "habitats";
  let filter = $state<Filter>("all");
  let searching = $state(false);
  let query = $state("");

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const scheduled = $derived(new Set(world.scheduledMissions.map((s) => s.councilorId)));

  const matches = (text: string) => query.trim() === "" || text.toLowerCase().includes(query.trim().toLowerCase());

  const councilors = $derived(faction ? faction.councilors.filter((c) => matches(c.name)) : []);
  const armies = $derived(
    faction
      ? world.armies.filter((a) => armyCommander(world, a) === faction.id).map((a) => ({ army: a, name: armyName(world, baseContent, a) })).filter((a) => matches(a.name))
      : [],
  );

  function selectArmy(id: string) {
    game.selectedArmyId = game.selectedArmyId === id ? null : id;
    const army = world.armies.find((a) => a.id === id);
    if (game.selectedArmyId && army) {
      const region = regionDef(baseContent, army.move?.toRegionId ?? army.regionId);
      game.focus = { lat: region.lat, lon: region.lon };
    }
    game.selectedCouncilorId = null;
    game.armyMoveMode = false;
  }
</script>

{#if faction}
  <section class="panel assets">
    <header class="head">
      <span class="label">Faction Assets</span>
      {#if faction.councilors.length < councilSize(world, baseContent, faction)}
        <button class="icon-button recruit" title="Recruit councilors ({faction.councilors.length}/{councilSize(world, baseContent, faction)} seats filled)" onclick={() => (game.recruitingOpen = true)}>
          <Icon name="recruit" size={15} />
        </button>
      {/if}
      <button class="icon-button" class:active={searching} title="Search" onclick={() => ((searching = !searching), (query = ""))}>
        <Icon name="search" size={15} />
      </button>
    </header>
    {#if searching}
      <input class="search" placeholder="Filter by name…" bind:value={query} />
    {/if}
    <nav class="filters">
      <button class:active={filter === "councilors"} title="Councilors" onclick={() => (filter = filter === "councilors" ? "all" : "councilors")}>
        <Icon name="person" size={16} />
      </button>
      <button class:active={filter === "armies"} title="Armies" onclick={() => (filter = filter === "armies" ? "all" : "armies")}>
        <Icon name="army" size={16} />
      </button>
      <button class:active={filter === "spacecraft"} title="Spacecraft" onclick={() => (filter = filter === "spacecraft" ? "all" : "spacecraft")}>
        <Icon name="spacecraft" size={16} />
      </button>
      <button class:active={filter === "habitats"} title="Habitats" onclick={() => (filter = filter === "habitats" ? "all" : "habitats")}>
        <Icon name="habitat" size={16} />
      </button>
    </nav>

    <ul class="list">
      {#if filter === "all" || filter === "councilors"}
        {#each councilors as c (c.id)}
          {@const MissionGlyph = c.mission ? missionIcons[c.mission.type] : null}
          <li>
            <button
              class="row"
              class:selected={game.selectedCouncilorId === c.id}
              onclick={() => ((game.selectedCouncilorId = game.selectedCouncilorId === c.id ? null : c.id), (game.selectedArmyId = null), (game.armyMoveMode = false))}
            >
              <Portrait councilor={c} factionId={faction.id} size={28} />
              <span class="name">{c.name}</span>
              <Flag nationId={shownLocation(world, c).nationId} height={12} />
              <span
                class="status"
                class:assigned={c.mission !== null}
                class:detained={c.detainedPhases > 0}
                title={c.detainedPhases > 0
                  ? "Detained"
                  : c.mission
                    ? `${MISSION_NAMES[c.mission.type]}${scheduled.has(c.id) ? " (under way)" : ""}`
                    : "No mission"}
              >
                {#if c.detainedPhases > 0}
                  <Icon name="close" size={13} color="#ff6a5a" />
                {:else if MissionGlyph}
                  <MissionGlyph size={13} strokeWidth={1.75} />
                {:else}
                  <Icon name="pending" size={13} color="#5d6f80" />
                {/if}
              </span>
            </button>
          </li>
        {/each}
      {/if}
      {#if filter === "all" || filter === "armies"}
        {#each armies as a (a.army.id)}
          <li>
            <button class="row" class:selected={game.selectedArmyId === a.army.id} title={armyActivity(world, baseContent, a.army)} onclick={() => selectArmy(a.army.id)}>
              <span class="glyph shield"><Icon name="army" size={15} color="#9fc58a" /></span>
              <span class="name">{a.name}</span>
              {#if a.army.navy}<Icon name="navy" size={12} color="#5fb4ff" />{/if}
              <span class="health" title="Strength {Math.round(a.army.health * 100)}%"><span style:width="{a.army.health * 100}%"></span></span>
            </button>
          </li>
        {/each}
      {/if}
      {#if filter === "spacecraft"}
        <li class="empty muted">No spacecraft yet.</li>
      {:else if filter === "habitats"}
        <li class="empty muted">No habitats yet.</li>
      {:else if councilors.length + armies.length === 0}
        <li class="empty muted">Nothing matches.</li>
      {/if}
    </ul>
  </section>
{/if}

<style>
  .assets {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 100%;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px 4px 8px;
    border-bottom: 1px solid var(--border-soft);
  }
  .label {
    flex: 1;
    font-size: 1.1em;
    color: var(--header-text);
  }
  .active {
    color: var(--accent);
    border-color: var(--border-strong);
  }
  .search {
    margin: 4px;
    cursor: text;
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
    padding: 4px;
  }
  .filters button {
    display: flex;
    justify-content: center;
    padding: 4px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0 4px 4px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    margin-top: 2px;
    padding: 3px 6px 3px 4px;
    text-align: left;
    background: rgba(10, 16, 22, 0.75);
    border-color: var(--border-soft);
  }
  .row.selected {
    border-color: var(--accent);
    background: rgba(60, 90, 115, 0.55);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .recruit {
    color: var(--good);
  }
  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    background: #2d3d4c;
    color: var(--muted);
  }
  .status.assigned {
    background: #3f6a52;
    color: #e6f5ea;
  }
  .status.detained {
    background: #5a2c2a;
  }
  .glyph {
    display: inline-flex;
    width: 26px;
    justify-content: center;
  }
  .shield {
    height: 24px;
    align-items: center;
    clip-path: polygon(0 0, 100% 0, 100% 65%, 50% 100%, 0 65%);
    background: #233328;
  }
  .health {
    width: 34px;
    height: 5px;
    background: #1d2833;
  }
  .health span {
    display: block;
    height: 100%;
    background: var(--good);
  }
  .empty {
    padding: 6px;
  }
</style>
