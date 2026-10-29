<script lang="ts">
  // Mission hexes along the bottom centre, as in Terra Invicta: shown during a council phase
  // while a councilor who can act is selected. Picking a hex opens its targets with odds, or,
  // for missions aimed at a country or a region, lets the player aim it on the globe.
  import { untrack } from "svelte";
  import { baseContent } from "../../content/index";
  import { availableMissions, MISSION_NAMES, MISSION_TYPES, type Mission, type MissionType } from "../../sim/index";
  import { game } from "../game.svelte";
  import { missionKey, missionTargets, type MissionTarget } from "../missionTargets";
  import Icon from "../ui/Icon.svelte";
  import { missionIcons } from "../ui/icons";

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const councilor = $derived(faction?.councilors.find((c) => c.id === game.selectedCouncilorId) ?? null);
  const visible = $derived(world.phase === "council" && faction !== null && !faction.councilDone && councilor !== null && councilor.detainedPhases === 0);

  /** The mission hexes this councilor gets: their profession's, traits' and orgs' missions. */
  const types = $derived(councilor ? MISSION_TYPES.filter((t) => availableMissions(baseContent, councilor).has(t)) : []);
  const targets = $derived.by(() => {
    const out = {} as Record<MissionType, MissionTarget[]>;
    if (!visible || !faction || !councilor) return out;
    for (const t of types) out[t] = missionTargets(world, faction.id, councilor, t, game.selectedNationId);
    return out;
  });

  let open = $state<MissionType | null>(null);
  let filter = $state("");
  const shown = $derived(open ? (targets[open] ?? []).filter((t) => t.label.toLowerCase().includes(filter.trim().toLowerCase())) : []);

  /** Missions aimed at a region or a whole nation are picked on the globe instead of from a list. */
  const REGION_MISSIONS: MissionType[] = ["surveilLocation", "goToGround", "increaseUnrest"];
  const NATION_MISSIONS: MissionType[] = ["controlNation", "defendInterests", "coup", "publicCampaign", "stabilizeNation", "advise", "setPolicy"];
  const onGlobe = (t: MissionType | null) => t !== null && (REGION_MISSIONS.includes(t) || NATION_MISSIONS.includes(t));

  function globePick(t: MissionType) {
    const scope: "region" | "nation" = REGION_MISSIONS.includes(t) ? "region" : "nation";
    const byKey = new Map((targets[t] ?? []).map((target) => [scope === "region" && "regionId" in target.mission ? target.mission.regionId : target.mission.nationId, target]));
    return { type: t, scope, targets: byKey };
  }

  function setOpen(t: MissionType | null) {
    open = t;
    game.globePick = t && onGlobe(t) ? globePick(t) : null;
  }

  // Keep the globe's targets (and their odds) current while picking.
  $effect(() => {
    const t = open;
    void targets;
    if (t && onGlobe(t) && untrack(() => game.globePick)) game.globePick = globePick(t);
  });

  // Close the target list when the councilor changes or the bar hides.
  $effect(() => {
    void game.selectedCouncilorId;
    if (!visible) setOpen(null);
  });
  // A target clicked on the globe assigns the mission and ends picking (as does Cancel).
  $effect(() => {
    if (game.globePick === null && onGlobe(open)) open = null;
  });

  function assign(mission: Mission | null) {
    if (!faction || !councilor) return;
    void game.command({ type: "assignMission", factionId: faction.id, councilorId: councilor.id, mission });
    setOpen(null);
  }

  function toggle(t: MissionType) {
    filter = "";
    setOpen(open === t ? null : t);
  }

  const pct = (c: number | null) => (c === null ? "Always" : `${Math.round(c * 100)}%`);
  const tone = (c: number | null) => (c === null || c >= 0.7 ? "good" : c >= 0.4 ? "" : "bad");
</script>

{#if visible && councilor}
  <div class="bar">
    {#if open && !onGlobe(open)}
      <div class="targets panel">
        <header class="section-title">
          <span>{MISSION_NAMES[open]} — choose a target</span>
          <button class="icon-button flat" title="Close" onclick={() => setOpen(null)}><Icon name="close" size={14} /></button>
        </header>
        <input class="filter" placeholder="Filter…" bind:value={filter} />
        <ul>
          {#each shown as t (missionKey(t.mission))}
            <li>
              <button class="target" class:current={councilor.mission !== null && missionKey(councilor.mission) === missionKey(t.mission)} onclick={() => assign(t.mission)}>
                <span class="name">{t.label}</span>
                <span class="odds {tone(t.chance)}">{pct(t.chance)}</span>
              </button>
            </li>
          {:else}
            <li class="muted empty">No valid targets.</li>
          {/each}
        </ul>
      </div>
    {/if}
    <div class="hexes">
      {#each types as t (t)}
        {@const Glyph = missionIcons[t]}
        {@const count = targets[t]?.length ?? 0}
        <button
          class="hex"
          class:active={councilor.mission?.type === t}
          class:open={open === t}
          disabled={count === 0}
          title="{MISSION_NAMES[t]}{count === 0 ? ' (no valid targets)' : ''}"
          onclick={() => toggle(t)}
        >
          <Glyph size={24} strokeWidth={1.6} />
        </button>
      {/each}
      {#if councilor.mission}
        <button class="hex clear" title="Cancel mission" onclick={() => assign(null)}><Icon name="close" size={22} /></button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .hexes {
    display: flex;
    gap: 6px;
  }
  .hex {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 54px;
    padding: 0;
    border: none;
    color: #e6f1f6;
    background: #4d6b78;
    clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  }
  .hex:hover:not(:disabled) {
    background: #6a8d9b;
  }
  .hex.open {
    background: #7fa6b4;
  }
  .hex.active {
    background: #3f8a5e;
    color: #fff;
  }
  .hex:disabled {
    background: #2a3a44;
    color: #6d7f8c;
  }
  .hex.clear {
    background: #6a3a36;
  }
  .targets {
    width: 440px;
    max-height: 340px;
    display: flex;
    flex-direction: column;
  }
  .filter {
    margin: 4px;
    cursor: text;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 4px 4px;
    overflow-y: auto;
  }
  .target {
    display: flex;
    width: 100%;
    gap: 8px;
    margin-top: 2px;
    padding: 3px 8px;
    text-align: left;
    background: rgba(10, 16, 22, 0.75);
    border-color: var(--border-soft);
  }
  .target.current {
    border-color: var(--good);
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .odds {
    min-width: 4em;
    text-align: right;
  }
  .flat {
    background: transparent;
    border-color: transparent;
  }
  .empty {
    padding: 6px;
  }
</style>
