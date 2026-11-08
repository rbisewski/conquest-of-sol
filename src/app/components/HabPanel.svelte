<script lang="ts">
  // Hab panel (lower right, in place of the councilor panel), after Terra Invicta's hab screen:
  // the hab's pixel-art look by tier in its faction's colour, where it is and how its core is
  // coming on, its crew, power and mission control, what it makes and costs a month, then its
  // slots (the core first; a base's mining slot next). Picking a slot shows its module (switched
  // on or off here) and, for our habs, what can be built there or what it upgrades to, with the
  // cost in space resources or in boost to send it up from the Earth, and why not if it can't.
  import { baseContent } from "../../content/index";
  import {
    checkBuildModule,
    checkSetModulePower,
    dateOfDay,
    factionDef,
    formatLongDate,
    habBodyId,
    habCrew,
    habLedger,
    habMissionControl,
    habModuleDef,
    EARTH_ORBIT_PRIORITIES,
    habOperation,
    habTier,
    isBuilt,
    MINING_SLOT,
    mineRate,
    missionControlUsed,
    moduleOrder,
    spaceBody,
    type HabModuleDef,
    type HabModuleState,
    type Payment,
    type SpaceResource,
    type ResourceAmounts,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import HabSprite from "../ui/HabSprite.svelte";
  import Icon from "../ui/Icon.svelte";
  import type { IconName } from "../ui/icons";
  import { SPACE_RESOURCE_NAMES } from "../ui/resourceNames";
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
  const operation = $derived(hab ? habOperation(world, baseContent, hab) : null);
  const ledger = $derived(hab ? habLedger(world, baseContent, hab) : null);
  /** Each resource's net monthly change from the hab, income less upkeep. */
  const net = $derived.by(() => {
    if (!ledger) return [];
    const keys = [...new Set([...Object.keys(ledger.income), ...Object.keys(ledger.upkeep)])] as (keyof ResourceAmounts)[];
    return keys.map((r) => [r, (ledger.income[r] ?? 0) - (ledger.upkeep[r] ?? 0)] as [IconName, number]).filter(([, v]) => Math.abs(v) > 0.005);
  });
  const overMissionControl = $derived(hab ? missionControlUsed(world, baseContent, hab.factionId) > world.factions.find((f) => f.id === hab.factionId)!.resources.missionControl : false);
  const mining = (i: number) => !!hab?.siteId && i === MINING_SLOT;
  const onDay = (day: number) => formatLongDate(dateOfDay(baseContent.rules.startYear, day));
  const amount = (v: number) => (Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(0));

  /** The slot picked below; the core at first. */
  let slot = $state(0);
  $effect(() => {
    void game.selectedHabId;
    slot = 0;
  });

  /** How a module in a slot is coming on, or whether it works. */
  function progress(m: HabModuleState, i: number): string {
    if (m.upgrade) return m.upgrade.arrivesDay > world.dayIndex ? `Upgrade to ${habModuleDef(baseContent, m.upgrade.moduleId).name} on its way, arriving ${onDay(m.upgrade.arrivesDay)}` : `Upgrading to ${habModuleDef(baseContent, m.upgrade.moduleId).name}, done ${onDay(m.upgrade.doneDay)}`;
    if (isBuilt(world, m)) return operation?.status[i] === "off" ? "Switched off" : operation?.status[i] === "unpowered" ? "Idle: not enough power" : "Working";
    if (m.arrivesDay > world.dayIndex) return `On its way from the Earth, arriving ${onDay(m.arrivesDay)}`;
    return `Being built, done ${onDay(m.doneDay)}`;
  }

  /** What could go in the picked slot: an upgrade of the module there, or, if empty, any module we have the project for (a mine in a base's mining slot, and only there). */
  const options = $derived.by(() => {
    if (!hab || !ours) return [];
    const faction = world.factions.find((f) => f.id === hab.factionId)!;
    const current = hab.modules[slot];
    const kind = hab.siteId ? "base" : "station";
    return baseContent.habModules
      .filter((m) => faction.research.completed[m.project] && !!m.mine === mining(slot) && (m.type === "any" || m.type === kind))
      .filter((m) => (slot === 0 ? m.core && m.upgradesFrom === current?.moduleId : !m.core && (current ? m.upgradesFrom === current.moduleId : true)))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
      .map((m) => ({
        module: m,
        order: moduleOrder(world, baseContent, faction.id, hab, slot, m.id),
        resources: checkBuildModule(world, baseContent, faction.id, hab.id, slot, m.id, "resources"),
        boost: checkBuildModule(world, baseContent, faction.id, hab.id, slot, m.id, "boost"),
      }));
  });

  const costs = (r: ResourceAmounts) => Object.entries(r).filter(([, v]) => v! > 0.005) as [IconName, number][];
  /** What a mine would yield a month in this base. */
  const yields = (m: HabModuleDef) => (hab?.siteId ? costs(mineRate(world, baseContent, hab.factionId, hab.siteId, m)) : []);
  /** The module's lasting figures, for its tooltip. */
  function describe(m: HabModuleDef): string {
    const parts = [m.summary, `Tier ${m.tier} · ${m.massTons} t · ${m.buildDays} days to build`];
    if (m.mineOutput) parts.push(`Yields ${m.mineOutput} × its site's resources a month; its cost and power go with the body's mining modifier`);
    if (m.power) parts.push(`Power ${m.power > 0 ? "+" : ""}${m.power}${m.rules?.includes("Solar_Power_Variable_Output") ? " in full sunlight" : ""}`);
    if (m.crew) parts.push(`Crew ${m.crew}`);
    if (m.missionControl) parts.push(m.missionControl > 0 ? `Provides ${m.missionControl} mission control` : `Uses ${-m.missionControl} mission control`);
    const income = Object.entries(m.income).map(([r, v]) => `${v} ${r === "research" ? "research" : (SPACE_RESOURCE_NAMES[r as SpaceResource] ?? r).toLowerCase()}`);
    if (income.length > 0) parts.push(`Income a month: ${income.join(", ")}`);
    const upkeep = Object.entries(m.support).map(([r, v]) => `${v} ${(SPACE_RESOURCE_NAMES[r as SpaceResource] ?? r).toLowerCase()}`);
    if (upkeep.length > 0) parts.push(`Upkeep a month: ${upkeep.join(", ")}`);
    for (const [field, v] of Object.entries(m.researchBonuses ?? {})) parts.push(`+${+(v * 100).toFixed(1)}% to our ${field} research (less above 50% in all)`);
    if (m.projectSlots) parts.push(`${m.projectSlots} project income: opens our third project slot; more speeds projects`);
    for (const rule of m.rules ?? []) {
      const priority = EARTH_ORBIT_PRIORITIES[rule];
      if (priority) parts.push(`In low Earth orbit: +${Math.round((m.ruleValue ?? 0) * 100)}% to our CPs' ${baseContent.priorities.find((p) => p.id === priority)!.name} priority (at most +30% from all our habs)`);
    }
    if (m.rules?.includes("LEOBonusPropagandaStrength")) parts.push(`In low Earth orbit: +${m.ruleValue} strength to our public campaigns (at most +9)`);
    if (m.rules?.includes("LEOBonusHumanDetection")) parts.push(`In low Earth orbit: +${m.tier} to spotting enemy councilors on Earth (at most +9)`);
    if (m.rules?.includes("LEOBonusArmyCombatValue")) parts.push(`In low Earth orbit: +${m.ruleValue} Miltech to the armies we command (at most +0.3)`);
    if (m.controlPointCapacity) parts.push(`In low Earth orbit: +${m.controlPointCapacity} control point capacity`);
    if (m.rules?.includes("Efficiency")) parts.push(`+${Math.round((m.ruleValue ?? 0) * 100)}% to everything this hab makes`);
    if (m.rules?.includes("SolarMirror")) parts.push(`+${m.ruleValue} power × tier to our solar modules on the body it orbits (or below its Lagrange point); costs more the farther from the Sun`);
    if (m.rules?.includes("HarvestHelium3")) parts.push("Our helium-3 fusion modules take water instead of fissiles");
    if (m.rules?.includes("HarvestAntimatter")) parts.push(`Harvests ${Math.round((m.ruleValue ?? 0) * 100)}% of the orbit's natural antimatter`);
    if (m.rules?.includes("Stability")) parts.push("Its crew cost no money");
    if (m.rules?.includes("Farm")) parts.push(`Feeds ${m.ruleValue} crew: no water or volatiles for them`);
    if (m.rules?.includes("PowerFirst")) parts.push("Takes power first, and can't be switched off");
    return parts.join("\n");
  }

  function order(moduleId: string, payWith: Payment) {
    if (hab) void game.command({ type: "buildModule", factionId: hab.factionId, habId: hab.id, slot, moduleId, payWith });
  }
  function scrap() {
    if (hab) void game.command({ type: "scrapModule", factionId: hab.factionId, habId: hab.id, slot });
  }
  function setPower(on: boolean) {
    if (hab) void game.command({ type: "setModulePower", factionId: hab.factionId, habId: hab.id, slot, on });
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
        <div class="small">{habModuleDef(baseContent, core.moduleId).name} · {progress(core, 0)}</div>
        {#if !ours}<div class="muted small">{factionDef(baseContent, hab.factionId).name}</div>{/if}
      </div>
    </div>

    <div class="stats">
      <span title="Crew of its working modules"><Icon name="crew" size={14} />{habCrew(world, baseContent, hab)}</span>
      <span title="Power its generators make (solar by its sunlight) / what its modules switched on want; those it can't run stand idle" class:short={operation!.made + 1e-9 < operation!.wanted}><Icon name="power" size={14} />{Math.round(operation!.made)}/{Math.round(operation!.wanted)}</span>
      <span title="Mission control it uses"><Icon name="missionControl" size={14} />{habMissionControl(world, baseContent, hab)}</span>
    </div>

    {#if net.length > 0}
      <div class="ledger" title="What it makes and costs a month: its mine, its modules' income and upkeep, and its crew's life support">
        <span class="muted small">A month</span>
        {#each net as [r, v] (r)}<span class="cost" class:loss={v < 0}><Icon name={r} size={12} />{v > 0 ? "+" : "−"}{amount(v)}</span>{/each}
      </div>
    {/if}
    {#if hab.unsupplied}
      <div class="warning small"><Icon name="warning" size={13} /> Unsupplied: its upkeep went unpaid, and it risks malfunctions.</div>
    {/if}
    {#if overMissionControl}
      <div class="warning small"><Icon name="warning" size={13} /> {ours ? "We use" : "Its faction uses"} more mission control than {ours ? "we have" : "it has"}: its habs risk malfunctions.</div>
    {/if}

    <div class="slots">
      {#each hab.modules as m, i (i)}
        {@const status = operation!.status[i]}
        <button
          class="slot"
          class:core={i === 0}
          class:mining={mining(i)}
          class:picked={i === slot}
          class:pending={status === "building"}
          class:idle={status === "off" || status === "unpowered"}
          title={m ? `${habModuleDef(baseContent, m.moduleId).name}: ${progress(m, i)}` : mining(i) ? "Mining slot: only a mine goes here" : "Empty slot"}
          onclick={() => (slot = i)}
        >
          {#if m}<ModuleIcon moduleId={m.moduleId} size={64} {color} />{:else if mining(i)}<Icon name="mining" size={22} color="#5d6f80" />{/if}
          {#if m?.upgrade}<span class="upgrading" title="Upgrading">▲</span>{/if}
          {#if status === "off" || status === "unpowered"}<span class="badge" class:unpowered={status === "unpowered"}><Icon name="powerOff" size={13} /></span>{/if}
        </button>
      {/each}
    </div>

    <div class="detail">
      {#if picked}
        {@const def = habModuleDef(baseContent, picked.moduleId)}
        <div class="picked" title={describe(def)}>
          <ModuleIcon moduleId={def.id} size={128} {color} />
          <div class="picked-info">
            <div>{def.name}</div>
            <div class="muted small">{progress(picked, slot)}</div>
            {#if def.mine && hab.siteId && isBuilt(world, picked)}
              <div class="yields small" title="What it yields a month while it works">{#each yields(def) as [r, v] (r)}<span class="cost"><Icon name={r} size={12} />{amount(v)}</span>{/each}</div>
            {/if}
            {#if ours && slot > 0}
              <div class="actions">
                {#if checkSetModulePower(world, baseContent, hab.factionId, hab.id, slot).ok}
                  <button class="scrap" title={picked.off ? "Switch it on" : "Switch it off: it uses no power, mission control or upkeep, and does nothing"} onclick={() => setPower(picked.off)}>
                    <Icon name={picked.off ? "power" : "powerOff"} size={12} />{picked.off ? "Switch on" : "Switch off"}
                  </button>
                {/if}
                <button class="scrap" title="Scrap it: nothing is refunded" onclick={scrap}><Icon name="close" size={12} /> Scrap</button>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="muted small">{mining(slot) ? "The mining slot: a mine here works the site." : "An empty slot."}</div>
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
                {#if o.module.mine}
                  <div class="yields small" title="What it would yield a month">{#each yields(o.module) as [r, v] (r)}<span class="cost"><Icon name={r} size={12} />{amount(v)}</span>{/each}</div>
                {/if}
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
  .short,
  .loss {
    color: var(--bad);
  }
  .ledger {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin: 0 8px 6px;
    font-size: 0.85em;
  }
  .warning {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 8px 6px;
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
  .slot.mining {
    border-style: dashed;
  }
  .slot.picked {
    border-color: var(--accent);
    background: rgba(143, 224, 230, 0.08);
  }
  .slot.pending :global(canvas) {
    opacity: 0.45;
  }
  .slot.idle :global(canvas) {
    opacity: 0.35;
    filter: grayscale(0.8);
  }
  .badge {
    position: absolute;
    left: 2px;
    bottom: 1px;
    display: inline-flex;
    color: var(--muted);
  }
  .badge.unpowered {
    color: var(--bad);
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
    align-items: flex-start;
    gap: 8px;
  }
  .picked-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
  }
  .scrap {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.85em;
  }
  .actions,
  .yields {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  .yields {
    margin-top: 2px;
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
