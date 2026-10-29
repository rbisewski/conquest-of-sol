<script lang="ts">
  // Army panel (lower right, in place of the councilor panel), after Terra Invicta's army
  // view: who commands it, its strength and where it is, and, for armies we command, the
  // Deploy (move), Airlift Home and Annex Region operations. Destinations can also be picked
  // on the globe.
  import { baseContent } from "../../content/index";
  import {
    armyActivity,
    armyCommander,
    armyMiltech,
    armyName,
    atWar,
    checkAirlift,
    checkAnnex,
    checkMove,
    commanderName,
    MINUTES_PER_DAY,
    nationDef,
    regionDef,
    regionOwner,
    type MoveCheck,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import Emblem from "../ui/Emblem.svelte";
  import Icon from "../ui/Icon.svelte";

  const world = $derived(game.state!);
  const army = $derived(world.armies.find((a) => a.id === game.selectedArmyId) ?? null);
  const commander = $derived(army ? armyCommander(world, army) : null);
  const ours = $derived(commander !== null && commander === game.playerFactionId);
  const region = $derived(army ? regionDef(baseContent, army.regionId) : null);

  /** Adjacent regions first, then (with a navy) coastal regions by sea, quickest first. */
  const destinations = $derived.by(() => {
    if (!army || !region || !ours || army.move) return [];
    const ids = new Set(region.neighbors);
    if (army.navy && region.coastal) for (const r of baseContent.regions) if (r.coastal) ids.add(r.id);
    const out: { id: string; name: string; nation: string; check: MoveCheck & { ok: true } }[] = [];
    for (const id of ids) {
      const check = checkMove(world, baseContent, army, id);
      const r = regionDef(baseContent, id);
      if (check.ok) out.push({ id, name: r.name, nation: nationDef(baseContent, regionOwner(world, r.id)).name, check });
    }
    return out.sort((a, b) => Number(a.check.naval) - Number(b.check.naval) || a.check.days - b.check.days);
  });
  const airlift = $derived(army && ours ? checkAirlift(world, baseContent, army) : null);
  /** Annex Region, offered while the army stands in a region of a nation we are at war with. */
  const annex = $derived(army && ours && !army.annex && atWar(world, army.nationId, regionOwner(world, army.regionId)) ? checkAnnex(world, baseContent, army) : null);

  function annexRegion() {
    if (!army || !game.playerFactionId) return;
    void game.command({ type: "annexRegion", factionId: game.playerFactionId, armyId: army.id });
  }

  /** Time left on the current move, at the worker's clock. */
  const eta = $derived.by(() => {
    if (!army?.move) return "";
    const days = (army.move.arriveAt - (world.dayIndex + game.dayFraction) * MINUTES_PER_DAY) / MINUTES_PER_DAY;
    return days >= 1 ? `${days.toFixed(1)} days` : `${Math.max(0, Math.round(days * 24))} h`;
  });

  function send(regionId: string | null) {
    if (!army || !game.playerFactionId) return;
    void game.command({ type: "moveArmy", factionId: game.playerFactionId, armyId: army.id, regionId });
    game.armyMoveMode = false;
  }

  function flyHome() {
    if (!army || !game.playerFactionId) return;
    void game.command({ type: "airliftArmy", factionId: game.playerFactionId, armyId: army.id });
  }

  function close() {
    game.selectedArmyId = null;
    game.armyMoveMode = false;
  }

  const healthColor = (h: number) => (h > 0.6 ? "var(--good)" : h > 0.3 ? "#e8c84a" : "var(--bad)");
</script>

{#if army && region}
  <section class="panel army">
    <header class="section-title head">
      <span class="label"><Icon name="army" size={14} /> Army</span>
      <button class="icon-button close" title="Close" onclick={close}><Icon name="close" size={14} /></button>
    </header>

    <div class="summary">
      <Emblem faction={commander} size={34} title="Commanded by {commanderName(world, baseContent, army)}" />
      <div class="identity">
        <h2>{armyName(world, baseContent, army)}</h2>
        <div class="muted">Commanded by {commanderName(world, baseContent, army)}</div>
        <div class="small">{armyActivity(world, baseContent, army)}{#if army.move}, arriving in {eta}{/if}</div>
      </div>
    </div>

    <div class="stats cell">
      <div title="Remaining strength">
        <Icon name="army" size={14} />
        <span class="bar"><span style:width="{army.health * 100}%" style:background={healthColor(army.health)}></span></span>
        {Math.round(army.health * 100)}%
      </div>
      <div title="Attack Miltech here, after health, home ground and cohesion">
        <Icon name="miltech" size={14} color="var(--gold)" />Miltech {armyMiltech(world, baseContent, army, army.regionId, true).toFixed(2)}
      </div>
      <div><Icon name="home" size={14} />Based in {regionDef(baseContent, army.homeRegionId).name}</div>
      <div><Icon name="navy" size={14} color={army.navy ? "#5fb4ff" : undefined} />{army.navy ? "Has a navy: can sail between coasts" : "No navy"}</div>
    </div>

    {#if ours}
      <div class="actions">
        {#if army.move}
          <button onclick={() => send(null)}><Icon name="close" size={14} /> Call off the move</button>
        {:else}
          <button class:active={game.armyMoveMode} disabled={destinations.length === 0} onclick={() => (game.armyMoveMode = !game.armyMoveMode)}>
            <Icon name="move" size={14} /> {game.armyMoveMode ? "Choosing on the globe…" : "Deploy"}
          </button>
          <button disabled={!airlift?.ok} title={airlift && !airlift.ok ? airlift.reason : "Fly back to headquarters"} onclick={flyHome}>
            <Icon name="airlift" size={14} /> Airlift home{airlift?.ok ? ` (${airlift.days.toFixed(1)} d)` : ""}
          </button>
          {#if annex}
            <button
              disabled={!annex.ok}
              title={annex.ok
                ? annex.restores
                  ? `Free ${region.name} and restore ${nationDef(baseContent, annex.restores).name} there, as our ally`
                  : `Make ${region.name} part of ${nationDef(baseContent, army.nationId).name}`
                : annex.reason}
              onclick={annexRegion}
            >
              <Icon name="regions" size={14} /> Annex{annex.ok ? ` (${Math.round(annex.days)} d)` : ""}
            </button>
          {/if}
        {/if}
      </div>
      {#if destinations.length > 0}
        <ul class="destinations">
          {#each destinations as d (d.id)}
            <li>
              <button onclick={() => send(d.id)}>
                <span class="name">{d.name} <span class="muted">· {d.nation}</span></span>
                <span class="days">{#if d.check.naval}<Icon name="navy" size={12} />{/if}{d.check.days.toFixed(1)} d</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <div class="muted note">
        {commander ? "Another faction commands this army." : "No faction commands this army: its national government moves it. Take the control point it answers to, or the executive, to command it."}
      </div>
    {/if}
  </section>
{/if}

<style>
  .army {
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
    align-items: flex-start;
    margin: 6px;
  }
  .identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .identity h2 {
    margin: 0 0 2px;
    font-size: 1.05em;
    line-height: 1.2;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .small {
    font-size: 0.85em;
  }
  .stats {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0 4px;
    padding: 5px 8px;
  }
  .stats > div {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .bar {
    flex: 1;
    height: 6px;
    background: #1d2833;
  }
  .bar span {
    display: block;
    height: 100%;
  }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin: 4px;
  }
  .actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 4px;
  }
  .actions button:only-child {
    grid-column: span 2;
  }
  .active {
    border-color: var(--good);
    color: var(--good);
  }
  .destinations {
    list-style: none;
    margin: 0;
    padding: 0 4px 4px;
    max-height: 160px;
    overflow-y: auto;
  }
  .destinations button {
    display: flex;
    width: 100%;
    gap: 6px;
    margin-top: 2px;
    padding: 2px 6px;
    text-align: left;
    background: rgba(10, 16, 22, 0.75);
    border-color: var(--border-soft);
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .days {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.85em;
    color: var(--muted);
  }
  .note {
    margin: 6px;
    font-size: 0.88em;
  }
</style>
