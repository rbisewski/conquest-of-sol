<script lang="ts">
  // Councilor panel (lower right, under Faction Assets), after Terra Invicta's: portrait with
  // the faction logo and XP, name and profession, the attribute row, and the current mission
  // with its target country. Missions are picked from the hex bar at the bottom of the screen.
  // During a council phase a slider spends resources on the mission's odds, as in Terra Invicta.
  import { baseContent } from "../../content/index";
  import { assessMission, ATTRIBUTES, committedResources, factionDef, MISSION_NAMES, missionCost, nationDef, professionDef, regionDef, spendSteps, type Mission } from "../../sim/index";
  import { game } from "../game.svelte";
  import { describeTarget, shownLocation } from "../missionTargets";
  import Emblem from "../ui/Emblem.svelte";
  import Icon from "../ui/Icon.svelte";
  import { attributeColor, attributeIcons, missionIcons } from "../ui/icons";
  import Portrait from "../ui/Portrait.svelte";
  import Num from "./Num.svelte";

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const councilor = $derived(faction?.councilors.find((c) => c.id === game.selectedCouncilorId) ?? null);
  const location = $derived(councilor ? shownLocation(world, councilor) : null);
  const underway = $derived(councilor ? world.scheduledMissions.some((s) => s.councilorId === councilor.id) : false);
  const assessment = $derived(councilor?.mission && faction ? assessMission(world, baseContent, faction.id, councilor, councilor.mission) : null);

  const steps = $derived(faction ? spendSteps(world, baseContent, faction.id) : baseContent.rules.missions.spend.steps);
  const costRule = $derived(councilor?.mission ? (baseContent.rules.missions.costs[councilor.mission.type] ?? null) : null);
  const cost = $derived(councilor?.mission ? missionCost(baseContent, councilor.mission) : null);
  /** The spend can change until the faction ends its council phase. */
  const canSpend = $derived(costRule?.spend === true && world.phase === "council" && faction !== null && !faction.councilDone && !underway);
  /** Highest slider step the faction can afford on top of its other councilors' missions. */
  const maxStep = $derived.by(() => {
    if (!costRule || !faction || !councilor) return 0;
    const available = faction.resources[costRule.resource] - committedResources(baseContent, faction, councilor.id)[costRule.resource] - (costRule.fixed ?? 0);
    return Math.max(0, steps.filter((s) => s <= available).length - 1);
  });

  /** Sets the spend to a slider step, held to what the faction can afford; returns the step used. */
  function setSpend(index: number): number {
    const clamped = Math.min(index, maxStep);
    if (!faction || !councilor?.mission) return clamped;
    const mission: Mission = { ...councilor.mission, spend: steps[clamped] ?? 0 };
    void game.command({ type: "assignMission", factionId: faction.id, councilorId: councilor.id, mission });
    return clamped;
  }
</script>

{#if councilor && faction}
  <section class="panel councilor">
    <header class="section-title head">
      <span class="label"><Icon name="person" size={14} /> Councilor</span>
      <button class="icon-button close" title="Close" onclick={() => (game.selectedCouncilorId = null)}><Icon name="close" size={14} /></button>
    </header>

    <div class="summary">
      <button class="frame" title="Open the councilor summary" onclick={() => (game.summaryCouncilorId = councilor.id)}>
        <Portrait {councilor} factionId={faction.id} variant="full" scale={1} />
        <span class="logo"><Emblem faction={faction.id} size={22} /></span>
        {#if councilor.spottedBy.length > 0}
          <span class="spotted" class:raised={councilor.detainedPhases > 0} title="Known to {councilor.spottedBy.map((id) => factionDef(baseContent, id).name).join(', ')}">
            {#each councilor.spottedBy as id (id)}<Emblem faction={id} size={18} />{/each}
          </span>
        {/if}
        {#if councilor.detainedPhases > 0}<span class="detained">Detained</span>{/if}
      </button>

      <div class="identity">
        <h2>{councilor.name}</h2>
        <div class="muted">{professionDef(baseContent, councilor.professionId).name}</div>
        {#if location}<div class="small">In {regionDef(baseContent, location.regionId).name}, {nationDef(baseContent, location.nationId).name}</div>{/if}
        <span class="xp">{councilor.xp} XP</span>
      </div>
    </div>

    <table class="attributes">
      <tbody>
        <tr>
          {#each ATTRIBUTES as attr (attr)}
            {@const Glyph = attributeIcons[attr]}
            <td title={attr[0]!.toUpperCase() + attr.slice(1) + (attr === "loyalty" ? " (as it appears to us)" : "")}>
              <span style:color={attributeColor[attr]}><Glyph size={14} strokeWidth={2} /></span>
            </td>
          {/each}
        </tr>
        <tr class="abbr">
          {#each ATTRIBUTES as attr (attr)}<td>{attr.slice(0, 3).toUpperCase()}</td>{/each}
        </tr>
        <tr class="values">
          {#each ATTRIBUTES as attr (attr)}<td>{attr === "loyalty" ? councilor.apparentLoyalty : councilor.attributes[attr]}</td>{/each}
        </tr>
      </tbody>
    </table>

    <div class="mission">
      {#if councilor.detainedPhases > 0}
        <span class="bad">Detained for {councilor.detainedPhases} more council phase{councilor.detainedPhases > 1 ? "s" : ""}</span>
      {:else if councilor.mission}
        {@const Glyph = missionIcons[councilor.mission.type]}
        <span class="mission-name"><Glyph size={15} strokeWidth={1.75} /> {MISSION_NAMES[councilor.mission.type]}</span>
        <span>{describeTarget(world, councilor.mission)}</span>
        {#if underway}
          <span class="muted small">
            Under way{#if assessment?.ok && assessment.contested} – <strong class="good" title="Current odds; they are re-checked when the mission resolves">{Math.round(assessment.odds.chance * 100)}%</strong>{/if}
          </span>
        {:else if assessment?.ok && assessment.contested}
          <span class="small">
            <Num breakdown={assessment.odds.attack} /> vs <Num breakdown={assessment.odds.defense} /> →
            <strong class="good">{Math.round(assessment.odds.chance * 100)}%</strong>
          </span>
        {/if}
        {#if canSpend && costRule}
          {@const index = Math.max(0, steps.indexOf(councilor.mission.spend ?? 0))}
          <label class="spend small" title="Resources spent improve the odds, and are lost whatever the outcome">
            Spend
            <input type="range" min="0" max={steps.length - 1} step="1" value={index} oninput={(e) => (e.currentTarget.value = String(setSpend(Number(e.currentTarget.value))))} />
            <span class="amount">{steps[index]} <Icon name={costRule.resource} size={12} /></span>
          </label>
          {#if maxStep < steps.length - 1}<span class="muted small">Up to {steps[maxStep]} affordable</span>{/if}
        {:else if cost}
          <span class="small">{costRule?.spend ? "Spent" : "Costs"} {cost.amount} <Icon name={cost.resource} size={12} /></span>
        {/if}
      {:else}
        <span class="muted">{world.phase === "council" ? "Choose a mission below" : "No mission"}</span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .councilor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }
  .head {
    padding-right: 3px;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .close {
    min-width: 20px;
    min-height: 20px;
    padding: 1px;
  }
  .summary {
    display: flex;
    gap: 8px;
    margin: 4px;
  }
  .frame {
    position: relative;
    display: block;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    background: #0f171f;
    flex: none;
    cursor: zoom-in;
  }
  .frame:hover {
    border-color: var(--border-strong);
  }
  .logo {
    position: absolute;
    top: 3px;
    left: 3px;
  }
  /* Factions this councilor knows have intel on them (not shown on the summary screen). */
  .spotted {
    position: absolute;
    right: 3px;
    bottom: 3px;
    display: flex;
    gap: 1px;
  }
  .spotted.raised {
    bottom: 24px;
  }
  .xp {
    align-self: flex-start;
    margin-top: 4px;
    padding: 1px 6px;
    background: rgba(10, 16, 22, 0.75);
    border: 1px solid var(--border-soft);
    color: #cde59a;
    font-size: 0.85em;
  }
  .detained {
    position: absolute;
    bottom: 3px;
    left: 3px;
    padding: 1px 6px;
    background: rgba(90, 30, 28, 0.9);
    color: #ffd0c8;
    font-size: 0.85em;
  }
  .identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding-top: 2px;
  }
  .identity h2 {
    margin: 0 0 2px;
    font-size: 1.1em;
    line-height: 1.2;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .attributes {
    width: calc(100% - 8px);
    margin: 0 4px;
    border-collapse: collapse;
    table-layout: fixed;
    text-align: center;
  }
  .attributes td {
    padding: 1px 0;
    border-left: 1px solid var(--border-soft);
  }
  .attributes td:first-child {
    border-left: none;
  }
  .abbr td {
    font-size: 0.72em;
    color: var(--muted);
  }
  .values td {
    font-size: 1.05em;
  }
  .mission {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    margin: 4px;
    padding: 5px 6px;
    text-align: center;
    background: var(--cell);
    border: 1px solid var(--border-soft);
  }
  .mission-name {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--accent);
  }
  .small {
    font-size: 0.85em;
  }
  .spend {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }
  .spend input {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
  }
  .amount {
    min-width: 3.2em;
    text-align: right;
  }
</style>
