<script lang="ts">
  // Hab panel (upper left, in place of the nation or body panel), after Terra Invicta's hab
  // summary: its faction and kind; its picture (HabScene) on its body's ground or over its body,
  // its name across it; its grade and where it is (a link to the body); crew, power, mission
  // control and what it makes and costs a month; then its modules, sector by sector. Picking a
  // module (in the picture or the list) opens the Hab Details screen on it; hovering one shows
  // its card (ModuleTooltip).
  import { baseContent } from "../../content/index";
  import {
    factionDef,
    habBodyId,
    habCrew,
    habLedger,
    habMissionControl,
    habModuleDef,
    habOperation,
    MINING_SLOT,
    missionControlUsed,
    spaceBody,
    type ResourceAmounts,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { habGrade, habPlace, moduleFacts, slotProgress } from "../moduleInfo";
  import { bodyColor } from "../solar/bodyArt";
  import Emblem from "../ui/Emblem.svelte";
  import { sectorOf } from "../ui/habLayout";
  import Icon from "../ui/Icon.svelte";
  import type { IconName } from "../ui/icons";
  import HabScene from "./HabScene.svelte";
  import ModuleTooltip from "./ModuleTooltip.svelte";

  const world = $derived(game.state!);
  const hab = $derived(world.habs.find((h) => h.id === game.selectedHabId) ?? null);
  const ours = $derived(hab?.factionId === game.playerFactionId);
  const body = $derived(hab ? spaceBody(baseContent, habBodyId(baseContent, hab)) : null);
  const operation = $derived(hab ? habOperation(world, baseContent, hab) : null);
  const ledger = $derived(hab ? habLedger(world, baseContent, hab) : null);
  /** Each resource's net monthly change from the hab, income less upkeep. */
  const net = $derived.by(() => {
    if (!ledger) return [];
    const keys = [...new Set([...Object.keys(ledger.income), ...Object.keys(ledger.upkeep)])] as (keyof ResourceAmounts)[];
    return keys.map((r) => [r, (ledger.income[r] ?? 0) - (ledger.upkeep[r] ?? 0)] as [IconName, number]).filter(([, v]) => Math.abs(v) > 0.005);
  });
  const overMissionControl = $derived(hab ? missionControlUsed(world, baseContent, hab.factionId) > world.factions.find((f) => f.id === hab.factionId)!.resources.missionControl : false);
  const modules = $derived(hab ? hab.modules.filter((m) => m !== null).length : 0);
  /** The slots sector by sector: a sector's heading, then its slots (empty ones only for our habs). */
  const sectors = $derived.by(() => {
    if (!hab) return [];
    const out: { sector: number; slots: number[] }[] = [];
    hab.modules.forEach((m, i) => {
      if (!m && !ours) return;
      const s = sectorOf(i);
      if (out.at(-1)?.sector !== s) out.push({ sector: s, slots: [] });
      out.at(-1)!.slots.push(i);
    });
    return out;
  });
  const amount = (v: number) => (Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(0));

  let tip = $state<{ slot: number; x: number; y: number } | null>(null);
  function hover(slot: number | null, x: number, y: number) {
    tip = slot !== null && hab?.modules[slot] ? { slot, x, y } : null;
  }
  function open(slot: number | null) {
    game.habSlot = slot;
    game.habDetailsOpen = true;
  }
  /** Where the hab is: a base's body, a station's orbit (the view turned to the body). */
  function toPlace() {
    if (!body || !hab) return;
    // Opening the body closes this panel, so read the hab first.
    const orbitId = hab.orbitId;
    game.view = "solar";
    game.selectedBodyId = body.id;
    if (orbitId) game.selectedOrbitId = orbitId;
  }
</script>

{#if hab && body && operation}
  {@const faction = factionDef(baseContent, hab.factionId)}
  <section class="panel hab">
    <header class="section-title head">
      <span class="label"><Emblem faction={hab.factionId} size={16} /> {faction.name} {hab.siteId ? "Base" : "Station"}</span>
      <span class="buttons">
        <button class="icon-button" title="Hab details: its modules, and building" onclick={() => open(game.habSlot)}><Icon name="expand" size={13} /></button>
        <button class="icon-button" title="Close" onclick={() => (game.selectedHabId = null)}><Icon name="close" size={14} /></button>
      </span>
    </header>

    <div class="banner">
      <HabScene {hab} maxModule={32} shift={0.16} picked={game.habSlot} onpick={(i) => open(i)} onhover={hover} />
      <div class="badges">
        <span title="Crew of its working modules"><Icon name="crew" size={13} />{habCrew(world, baseContent, hab).toLocaleString("en-US")}</span>
        <span title="Power its generators make / what its modules switched on want" class:short={operation.made + 1e-9 < operation.wanted}><Icon name="power" size={13} />{Math.round(operation.made)}/{Math.round(operation.wanted)}</span>
        <span title="Mission control it uses"><Icon name="missionControl" size={13} />{habMissionControl(world, baseContent, hab)}</span>
      </div>
      <div class="banner-name">{hab.name}</div>
    </div>

    <div class="where">
      <span>{habGrade(hab)}</span>
      <button class="link" title={hab.orbitId ? "Open the orbit" : `Open ${body.name}`} onclick={toPlace}>{habPlace(hab)}<span class="swatch" style:background={bodyColor(body.id, body.type)}></span></button>
    </div>

    {#if net.length > 0}
      <div class="ledger" title="What it makes and costs a month: its mine, its modules' income and upkeep, and its crew's life support">
        <span class="muted">A month</span>
        {#each net as [r, v] (r)}<span class="cost" class:loss={v < 0}><Icon name={r} size={12} />{v > 0 ? "+" : "−"}{amount(v)}</span>{/each}
      </div>
    {/if}
    {#if hab.unsupplied}<div class="warning"><Icon name="warning" size={13} /> Unsupplied: its upkeep went unpaid, and it risks malfunctions.</div>{/if}
    {#if overMissionControl}<div class="warning"><Icon name="warning" size={13} /> {ours ? "We use" : "Its faction uses"} more mission control than {ours ? "we have" : "it has"}: its habs risk malfunctions.</div>{/if}

    <div class="count">{modules} Module{modules === 1 ? "" : "s"}</div>
    <div class="list">
      <div class="list-head">Sector name</div>
      {#each sectors as s (s.sector)}
        <div class="sector"><Emblem faction={hab.factionId} size={13} /> Sector {s.sector + 1}</div>
        {#each s.slots as i (i)}
          {@const m = hab.modules[i]}
          <button
            class="module"
            class:picked={game.habSlot === i}
            class:dim={!m || operation.status[i] !== "working"}
            onclick={() => open(i)}
            onmouseenter={(e) => hover(i, e.clientX, e.clientY)}
            onmousemove={(e) => hover(i, e.clientX, e.clientY)}
            onmouseleave={() => (tip = null)}
          >
            {#if m}
              <span>{habModuleDef(baseContent, m.moduleId).name}</span>
              {#if operation.status[i] !== "working"}<span class="state">{slotProgress(world, m, operation.status[i] ?? null).split(",")[0]}</span>{/if}
            {:else}
              <span class="muted">{hab.siteId && i === MINING_SLOT ? "Empty mining slot" : "Empty slot"}</span>
            {/if}
          </button>
        {/each}
      {/each}
    </div>
  </section>
  {#if tip && hab.modules[tip.slot]}
    {@const m = hab.modules[tip.slot]!}
    <ModuleTooltip facts={moduleFacts(world, habModuleDef(baseContent, m.moduleId), hab)} x={tip.x} y={tip.y} status={slotProgress(world, m, operation.status[tip.slot] ?? null)} />
  {/if}
{/if}

<style>
  .hab {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 100%;
  }
  .head {
    padding-right: 3px;
  }
  .label,
  .buttons {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .buttons {
    gap: 2px;
  }
  .icon-button {
    min-width: 20px;
    min-height: 20px;
    padding: 1px;
  }
  .banner {
    position: relative;
    flex: none;
    height: 170px;
    margin: 4px;
    border: 1px solid var(--border-soft);
  }
  .badges {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    pointer-events: none;
  }
  .badges span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    font-size: 0.85em;
    background: rgba(5, 8, 13, 0.7);
  }
  .banner-name {
    position: absolute;
    left: 8px;
    bottom: 4px;
    max-width: 60%;
    font-size: 1.8em;
    line-height: 1.05;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: rgba(240, 244, 248, 0.92);
    text-shadow:
      0 0 3px #000,
      0 0 6px #000;
    pointer-events: none;
  }
  .where {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin: 0 8px 4px;
    font-size: 0.9em;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    text-align: right;
  }
  .link:hover {
    color: var(--accent);
  }
  .swatch {
    flex: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset -3px -3px 4px rgba(0, 0, 0, 0.55);
  }
  .ledger {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 8px;
    margin: 0 8px 4px;
    font-size: 0.85em;
  }
  .cost {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .short,
  .loss,
  .warning {
    color: var(--bad);
  }
  .warning {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 8px 4px;
    font-size: 0.85em;
  }
  .count {
    padding: 3px;
    margin: 2px 4px 0;
    text-align: center;
    background: var(--header);
    color: var(--header-text);
  }
  .list {
    flex: 1 1 auto;
    min-height: 60px;
    overflow-y: auto;
    margin: 2px 4px 4px;
  }
  .list-head {
    padding: 2px 8px 2px 34px;
    color: var(--muted);
    font-size: 0.9em;
    border-bottom: 1px solid var(--border-soft);
  }
  .sector {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.04);
  }
  .module {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 2px 8px 2px 34px;
    border: none;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.92em;
    text-align: left;
  }
  .module:hover {
    background: rgba(143, 224, 230, 0.08);
  }
  .module.picked {
    background: rgba(143, 224, 230, 0.14);
  }
  .module.dim > :first-child {
    opacity: 0.75;
  }
  .state {
    color: var(--muted);
    font-size: 0.9em;
    white-space: nowrap;
  }
</style>
