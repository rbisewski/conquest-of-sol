<script lang="ts">
  // Hab panel (lower right, in place of the councilor panel), after Terra Invicta's hab screen:
  // the hab's pixel-art look by tier in its faction's colour, where it is and how its core is
  // coming on, its crew, power and mission control, then its slots (the core first). Picking a
  // slot shows its module and, for our habs, what can be built there or what it upgrades to, with
  // the cost in space resources or in boost to send it up from the Earth, and why not if it can't.
  import { baseContent } from "../../content/index";
  import {
    checkBuildModule,
    dateOfDay,
    factionDef,
    formatLongDate,
    habBodyId,
    habCrew,
    habMissionControl,
    habModuleDef,
    habPower,
    habTier,
    isBuilt,
    moduleOrder,
    spaceBody,
    type HabModuleDef,
    type HabModuleState,
    type Payment,
    type ResourceAmounts,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import HabSprite from "../ui/HabSprite.svelte";
  import Icon from "../ui/Icon.svelte";
  import type { IconName } from "../ui/icons";
  import ModuleIcon from "../ui/ModuleIcon.svelte";

  const world = $derived(game.state!);
  const hab = $derived(world.habs.find((h) => h.id === game.selectedHabId) ?? null);
  const ours = $derived(hab?.factionId === game.playerFactionId);
  const color = $derived(hab ? factionDef(baseContent, hab.factionId).color : "#888");
  const body = $derived(hab ? spaceBody(baseContent, habBodyId(baseContent, hab)) : null);
  const where = $derived.by(() => {
    if (!hab || !body) return "";
    if (hab.siteId) return `${baseContent.habSites.find((s) => s.id === hab.siteId)!.name}, ${body.name}`;
    return baseContent.orbits.find((o) => o.id === hab.orbitId)!.name;
  });
  const power = $derived(hab ? habPower(world, baseContent, hab) : { made: 0, used: 0 });
  const onDay = (day: number) => formatLongDate(dateOfDay(baseContent.rules.startYear, day));

  /** The slot picked below; the core at first. */
  let slot = $state(0);
  $effect(() => {
    void game.selectedHabId;
    slot = 0;
  });

  /** How a module in a slot is coming on. */
  function progress(m: HabModuleState): string {
    if (m.upgrade) return m.upgrade.arrivesDay > world.dayIndex ? `Upgrade to ${habModuleDef(baseContent, m.upgrade.moduleId).name} on its way, arriving ${onDay(m.upgrade.arrivesDay)}` : `Upgrading to ${habModuleDef(baseContent, m.upgrade.moduleId).name}, done ${onDay(m.upgrade.doneDay)}`;
    if (isBuilt(world, m)) return "Working";
    if (m.arrivesDay > world.dayIndex) return `On its way from the Earth, arriving ${onDay(m.arrivesDay)}`;
    return `Being built, done ${onDay(m.doneDay)}`;
  }

  /** What could go in the picked slot: an upgrade of the module there, or, if empty, any module we have the project for. */
  const options = $derived.by(() => {
    if (!hab || !ours) return [];
    const faction = world.factions.find((f) => f.id === hab.factionId)!;
    const current = hab.modules[slot];
    const kind = hab.siteId ? "base" : "station";
    return baseContent.habModules
      .filter((m) => faction.research.completed[m.project] && !m.mine && (m.type === "any" || m.type === kind))
      .filter((m) => (slot === 0 ? m.core && m.upgradesFrom === current?.moduleId : !m.core && (current ? m.upgradesFrom === current.moduleId : true)))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
      .map((m) => ({
        module: m,
        order: moduleOrder(world, baseContent, faction.id, hab, slot, m.id),
        resources: checkBuildModule(world, baseContent, faction.id, hab.id, slot, m.id, "resources"),
        boost: checkBuildModule(world, baseContent, faction.id, hab.id, slot, m.id, "boost"),
      }));
  });

  const costs = (r: ResourceAmounts) => Object.entries(r).filter(([, v]) => v! > 0) as [IconName, number][];
  /** The module's lasting figures, for its tooltip. */
  function describe(m: HabModuleDef): string {
    const parts = [m.summary, `Tier ${m.tier} · ${m.massTons} t · ${m.buildDays} days to build`];
    if (m.power) parts.push(`Power ${m.power > 0 ? "+" : ""}${m.power}${m.rules?.includes("Solar_Power_Variable_Output") ? " in full sunlight" : ""}`);
    if (m.crew) parts.push(`Crew ${m.crew}`);
    if (m.missionControl) parts.push(`Mission control ${m.missionControl > 0 ? "+" : ""}${m.missionControl}`);
    return parts.join("\n");
  }

  function order(moduleId: string, payWith: Payment) {
    if (hab) void game.command({ type: "buildModule", factionId: hab.factionId, habId: hab.id, slot, moduleId, payWith });
  }
  function scrap() {
    if (hab) void game.command({ type: "scrapModule", factionId: hab.factionId, habId: hab.id, slot });
  }
  const close = () => (game.selectedHabId = null);
</script>

{#if hab && body}
  {@const core = hab.modules[0]!}
  {@const picked = hab.modules[slot] ?? null}
  <section class="panel hab">
    <header class="section-title head">
      <span class="label"><Icon name="habitat" size={14} /> {hab.siteId ? "Base" : "Station"}</span>
      <button class="icon-button close" title="Close" onclick={close}><Icon name="close" size={14} /></button>
    </header>

    <div class="summary">
      <HabSprite kind={hab.siteId ? "base" : "station"} tier={habTier(baseContent, hab)} {color} scale={2} />
      <div class="identity">
        <h2>{hab.name}</h2>
        <div class="muted small">{where}</div>
        <div class="small">{habModuleDef(baseContent, core.moduleId).name} · {progress(core)}</div>
        {#if !ours}<div class="muted small">{factionDef(baseContent, hab.factionId).name}</div>{/if}
      </div>
    </div>

    <div class="stats">
      <span title="Crew of its built modules"><Icon name="crew" size={14} />{habCrew(world, baseContent, hab)}</span>
      <span title="Power made by its built modules (solar by its sunlight) / power they use" class:short={power.made < power.used}><Icon name="power" size={14} />{Math.round(power.made)}/{Math.round(power.used)}</span>
      <span title="Mission control it uses"><Icon name="missionControl" size={14} />{habMissionControl(baseContent, hab)}</span>
    </div>

    <div class="slots">
      {#each hab.modules as m, i (i)}
        <button class="slot" class:core={i === 0} class:picked={i === slot} class:pending={m && !isBuilt(world, m)} title={m ? `${habModuleDef(baseContent, m.moduleId).name}: ${progress(m)}` : "Empty slot"} onclick={() => (slot = i)}>
          {#if m}<ModuleIcon moduleId={m.moduleId} size={64} {color} />{/if}
          {#if m?.upgrade}<span class="upgrading" title="Upgrading">▲</span>{/if}
        </button>
      {/each}
    </div>

    <div class="detail">
      {#if picked}
        {@const def = habModuleDef(baseContent, picked.moduleId)}
        <div class="picked" title={describe(def)}>
          <ModuleIcon moduleId={def.id} size={64} {color} />
          <div>
            <div>{def.name}</div>
            <div class="muted small">{progress(picked)}</div>
          </div>
          {#if ours && slot > 0}<button class="scrap" title="Scrap it: nothing is refunded" onclick={scrap}><Icon name="close" size={12} /> Scrap</button>{/if}
        </div>
      {:else}
        <div class="muted small">An empty slot.</div>
      {/if}

      {#if ours && isBuilt(world, core)}
        {#if options.length > 0}
          <div class="options-title">{picked ? "Upgrade" : "Build"}</div>
          <ul class="options">
            {#each options as o (o.module.id)}
              <li title={describe(o.module)}>
                <div class="option-head">
                  <ModuleIcon moduleId={o.module.id} size={32} {color} />
                  <span class="name">{o.module.name}</span>
                  <span class="muted small">{o.order.buildDays} d</span>
                </div>
                <div class="pay">
                  <button disabled={!o.resources.ok} title={o.resources.ok ? `Build it from our space resources, done ${onDay(o.order.doneDayWithResources)}` : o.resources.reason} onclick={() => order(o.module.id, "resources")}>
                    {#each costs(o.order.resources) as [r, v] (r)}<span class="cost"><Icon name={r} size={12} />{v < 10 ? v.toFixed(2) : v.toFixed(0)}</span>{/each}
                  </button>
                  <button
                    disabled={!o.boost.ok}
                    title={o.boost.ok ? `Send it up from the Earth with boost, done ${onDay(o.order.doneDayWithBoost!)}` : o.boost.reason}
                    onclick={() => order(o.module.id, "boost")}
                  >
                    <span class="cost"><Icon name="boost" size={12} />{o.order.boost ? o.order.boost.value.toFixed(1) : "–"}</span>
                  </button>
                </div>
                {#if !o.resources.ok && !o.boost.ok}<div class="why small">{o.boost.reason}</div>{/if}
              </li>
            {/each}
          </ul>
        {:else}
          <div class="muted small">{picked ? "No upgrade we can build for it yet." : "No module we can build here yet: their projects unlock them."}</div>
        {/if}
      {:else if ours}
        <div class="muted small">Modules can be built once the core is.</div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .hab {
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
    align-items: center;
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
    gap: 12px;
    margin: 0 8px 6px;
    font-size: 0.9em;
  }
  .stats span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .short {
    color: var(--bad);
  }
  .slots {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    margin: 0 6px 6px;
  }
  .slot {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 70px;
    padding: 0;
    border: 1px solid var(--border-soft);
    background: rgba(8, 12, 18, 0.6);
  }
  .slot.core {
    border-color: var(--border);
  }
  .slot.picked {
    border-color: var(--accent);
    background: rgba(143, 224, 230, 0.08);
  }
  .slot.pending :global(svg) {
    opacity: 0.45;
  }
  .upgrading {
    position: absolute;
    right: 2px;
    top: 1px;
    font-size: 9px;
    color: var(--accent);
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 6px 8px;
  }
  .picked {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .scrap {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.85em;
  }
  .options-title {
    color: var(--muted);
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .options {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .options li {
    padding: 4px;
    border: 1px solid var(--border-soft);
  }
  .option-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .option-head .name {
    flex: 1;
    min-width: 0;
  }
  .pay {
    display: flex;
    gap: 4px;
    margin-top: 3px;
  }
  .pay button {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    font-size: 0.85em;
  }
  .cost {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .why {
    margin-top: 2px;
    color: var(--muted);
  }
</style>
