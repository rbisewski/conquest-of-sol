<script lang="ts">
  // Hab Details (Station Details), after Terra Invicta's Habs screen, over the map: the hab's
  // picture large (HabScene) with its name, grade, place, crew, power and mission control over
  // it, arrows to the faction's other habs, and its monthly resource summary below; beside it,
  // Installed Modules (what is in each slot; the picked one can be switched on or off, or
  // scrapped) and Build Modules (what can go in the picked slot, or what its module upgrades to,
  // filtered by tier and name, paid in space resources or sent up with boost). Hovering any module
  // shows its card (ModuleTooltip).
  import { untrack } from "svelte";
  import { baseContent } from "../../content/index";
  import {
    checkBuildModule,
    checkSetModulePower,
    dateOfDay,
    formatLongDate,
    habBodyId,
    habCrew,
    habLedger,
    habMissionControl,
    habModuleDef,
    habOperation,
    isBuilt,
    MINING_SLOT,
    moduleOrder,
    spaceBody,
    factionDef,
    type HabModuleDef,
    type Payment,
    type ResourceAmounts,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { habGrade, habPlace, moduleFacts, slotProgress } from "../moduleInfo";
  import { bodyColor } from "../solar/bodyArt";
  import { sectorOf } from "../ui/habLayout";
  import Icon from "../ui/Icon.svelte";
  import type { IconName } from "../ui/icons";
  import ModuleIcon from "../ui/ModuleIcon.svelte";
  import HabScene from "./HabScene.svelte";
  import ModuleTooltip from "./ModuleTooltip.svelte";

  const world = $derived(game.state!);
  const hab = $derived(world.habs.find((h) => h.id === game.selectedHabId) ?? null);
  const ours = $derived(hab?.factionId === game.playerFactionId);
  const color = $derived(hab ? factionDef(baseContent, hab.factionId).color : "#888");
  const body = $derived(hab ? spaceBody(baseContent, habBodyId(baseContent, hab)) : null);
  const operation = $derived(hab ? habOperation(world, baseContent, hab) : null);
  const slot = $derived(game.habSlot);
  const picked = $derived(hab && slot !== null ? (hab.modules[slot] ?? null) : null);
  /** The faction's habs, to step through with the arrows. */
  const siblings = $derived(hab ? world.habs.filter((h) => h.factionId === hab.factionId) : []);
  const onDay = (day: number) => formatLongDate(dateOfDay(baseContent.rules.startYear, day));
  const amount = (v: number) => (Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(0));

  /** Every resource the hab makes or costs a month, net. */
  const summary = $derived.by(() => {
    if (!hab) return [];
    const ledger = habLedger(world, baseContent, hab);
    const keys = [...new Set([...Object.keys(ledger.income), ...Object.keys(ledger.upkeep)])] as (keyof ResourceAmounts)[];
    return keys.map((r) => [r, (ledger.income[r] ?? 0) - (ledger.upkeep[r] ?? 0)] as [IconName, number]).filter(([, v]) => Math.abs(v) > 0.005);
  });

  // Opened on an empty slot, it starts on Build Modules.
  let tab = $state<"installed" | "build">(untrack(() => (hab && slot !== null && !hab.modules[slot] ? "build" : "installed")));
  let tier = $state<0 | 1 | 2 | 3>(0);
  let query = $state("");

  /** What could go in the picked slot: an upgrade of its module, or, if empty, any module we have the project for there. */
  const options = $derived.by(() => {
    if (!hab || !ours || slot === null) return [];
    const faction = world.factions.find((f) => f.id === hab.factionId)!;
    const current = hab.modules[slot];
    const kind = hab.siteId ? "base" : "station";
    const mining = !!hab.siteId && slot === MINING_SLOT;
    const q = query.trim().toLowerCase();
    return baseContent.habModules
      .filter((m) => faction.research.completed[m.project] && !!m.mine === mining && (m.type === "any" || m.type === kind))
      .filter((m) => (slot === 0 ? m.core && m.upgradesFrom === current?.moduleId : !m.core && (current ? m.upgradesFrom === current.moduleId : true)))
      .filter((m) => (tier === 0 || m.tier === tier) && (q === "" || m.name.toLowerCase().includes(q)))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
      .map((m) => ({
        module: m,
        order: moduleOrder(world, baseContent, faction.id, hab, slot, m.id),
        resources: checkBuildModule(world, baseContent, faction.id, hab.id, slot, m.id, "resources"),
        boost: checkBuildModule(world, baseContent, faction.id, hab.id, slot, m.id, "boost"),
      }));
  });
  const costs = (r: ResourceAmounts) => Object.entries(r).filter(([, v]) => v! > 0.005) as [IconName, number][];

  let tip = $state<{ module: HabModuleDef; slot: number | null; x: number; y: number } | null>(null);
  function hoverSlot(i: number | null, x: number, y: number) {
    const m = i !== null ? hab?.modules[i] : null;
    tip = m && i !== null ? { module: habModuleDef(baseContent, m.moduleId), slot: i, x, y } : null;
  }

  function pick(i: number) {
    game.habSlot = i;
    if (!hab?.modules[i]) tab = "build";
  }
  function step(by: number) {
    if (!hab || siblings.length < 2) return;
    game.selectedHabId = siblings[(siblings.indexOf(hab) + by + siblings.length) % siblings.length]!.id;
  }
  function order(moduleId: string, payWith: Payment) {
    if (hab && slot !== null) void game.command({ type: "buildModule", factionId: hab.factionId, habId: hab.id, slot, moduleId, payWith });
  }
  function scrap() {
    if (hab && slot !== null) void game.command({ type: "scrapModule", factionId: hab.factionId, habId: hab.id, slot });
  }
  function setPower(on: boolean) {
    if (hab && slot !== null) void game.command({ type: "setModulePower", factionId: hab.factionId, habId: hab.id, slot, on });
  }
  const close = () => (game.habDetailsOpen = false);
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
</script>

<svelte:window onkeydown={onKey} />

{#if hab && body && operation}
  <div class="overlay">
    <section class="panel sheet">
      <h3 class="section-title">
        <span></span>
        Habs
        <button class="icon-button flat" title="Close (Esc)" onclick={close}><Icon name="close" size={14} /></button>
      </h3>
      <div class="body">
        <div class="view">
          <div class="scene">
            <HabScene {hab} picked={slot} clearLeft={360} onpick={pick} onhover={hoverSlot} />
          </div>
          <div class="heading">
            <h2>{hab.name}</h2>
            <div class="grade">{habGrade(hab)} <span class="swatch" style:background={bodyColor(body.id, body.type)}></span> {habPlace(hab)}</div>
            <div class="stats">
              <span title="Crew of its working modules"><Icon name="crew" size={14} />{habCrew(world, baseContent, hab).toLocaleString("en-US")}</span>
              <span title="Power its generators make / what its modules switched on want" class:short={operation.made + 1e-9 < operation.wanted}><Icon name="power" size={14} />{Math.round(operation.made)}/{Math.round(operation.wanted)}</span>
              <span title="Mission control it uses"><Icon name="missionControl" size={14} />{habMissionControl(world, baseContent, hab)}</span>
            </div>
            <button class="back" onclick={close}>Return to list</button>
          </div>
          {#if siblings.length > 1}
            <button class="arrow left" title="Our previous hab" onclick={() => step(-1)}><Icon name="previous" size={22} /></button>
            <button class="arrow right" title="Our next hab" onclick={() => step(1)}><Icon name="next" size={22} /></button>
          {/if}
          <div class="summary">
            <div class="summary-title">Monthly hab resource summary</div>
            <div class="summary-row">
              {#each summary as [r, v] (r)}<span class:loss={v < 0}><Icon name={r} size={14} />{v > 0 ? "" : "−"}{amount(v)}</span>{:else}<span class="muted">Nothing yet</span>{/each}
            </div>
          </div>
        </div>

        <aside class="side">
          <div class="tabs">
            <button class:active={tab === "installed"} onclick={() => (tab = "installed")}>Installed modules</button>
            <button class:active={tab === "build"} onclick={() => (tab = "build")}>Build modules</button>
          </div>
          <div class="picked">
            {#if slot === null}
              <div class="prompt">Select a module</div>
            {:else if picked}
              {@const def = habModuleDef(baseContent, picked.moduleId)}
              <ModuleIcon moduleId={def.id} size={64} {color} />
              <div class="picked-info">
                <div class="name">{def.name}</div>
                <div class="muted small">{slotProgress(world, picked, operation.status[slot] ?? null)}</div>
                {#if ours && slot > 0}
                  <div class="actions">
                    {#if checkSetModulePower(world, baseContent, hab.factionId, hab.id, slot).ok}
                      <button title={picked.off ? "Switch it on" : "Switch it off: it uses no power, mission control or upkeep, and does nothing"} onclick={() => setPower(picked.off)}>
                        <Icon name={picked.off ? "power" : "powerOff"} size={12} />{picked.off ? "Switch on" : "Switch off"}
                      </button>
                    {/if}
                    <button title="Scrap it: nothing is refunded" onclick={scrap}><Icon name="close" size={12} /> Scrap</button>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="prompt">{hab.siteId && slot === MINING_SLOT ? "Mining slot: a mine here works the site" : "Empty slot"}</div>
            {/if}
          </div>

          {#if tab === "installed"}
            <div class="list">
              {#each hab.modules as m, i (i)}
                {#if i === 0 || sectorOf(i) !== sectorOf(i - 1)}<div class="sector">Sector {sectorOf(i) + 1}</div>{/if}
                <button
                  class="row"
                  class:active={slot === i}
                  class:dim={!m || operation.status[i] !== "working"}
                  onclick={() => pick(i)}
                  onmouseenter={(e) => hoverSlot(i, e.clientX, e.clientY)}
                  onmousemove={(e) => hoverSlot(i, e.clientX, e.clientY)}
                  onmouseleave={() => (tip = null)}
                >
                  {#if m}
                    <ModuleIcon moduleId={m.moduleId} size={32} {color} />
                    <span class="row-name">{habModuleDef(baseContent, m.moduleId).name}</span>
                    {#if operation.status[i] !== "working"}<span class="muted small">{slotProgress(world, m, operation.status[i] ?? null).split(",")[0]}</span>{/if}
                  {:else}
                    <span class="empty-icon"></span>
                    <span class="row-name muted">{hab.siteId && i === MINING_SLOT ? "Empty mining slot" : "Empty slot"}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {:else}
            <div class="filters">
              <input type="search" placeholder="Search modules" bind:value={query} />
              {#each [0, 1, 2, 3] as const as t (t)}<button class:active={tier === t} onclick={() => (tier = t)}>{t === 0 ? "All" : t}</button>{/each}
            </div>
            <div class="list">
              {#if !ours}
                <div class="hint muted">Only its faction can build here.</div>
              {:else if !isBuilt(world, hab.modules[0]!)}
                <div class="hint muted">Modules can be built once the core is.</div>
              {:else if slot === null}
                <div class="hint muted">Pick an empty slot, or a module to upgrade, in the picture or in Installed Modules.</div>
              {:else if options.length === 0}
                <div class="hint muted">{picked ? "No upgrade we can build for it yet." : "No module we can build here yet: their projects unlock them."}</div>
              {/if}
              {#each options as o (o.module.id)}
                <div class="option" role="listitem" onmouseenter={(e) => (tip = { module: o.module, slot: null, x: e.clientX, y: e.clientY })} onmousemove={(e) => (tip = { module: o.module, slot: null, x: e.clientX, y: e.clientY })} onmouseleave={() => (tip = null)}>
                  <div class="option-head">
                    <ModuleIcon moduleId={o.module.id} size={32} {color} />
                    <span class="row-name">{o.module.name}{#if o.order.upgrade}<span class="upgrade"> Upgrade</span>{/if}</span>
                    <span class="muted small">T{o.module.tier} · {o.order.buildDays} d</span>
                  </div>
                  <div class="pay">
                    <button disabled={!o.resources.ok} title={o.resources.ok ? `Build it from our space resources, done ${onDay(o.order.doneDayWithResources)}` : o.resources.reason} onclick={() => order(o.module.id, "resources")}>
                      {#each costs(o.order.resources) as [r, v] (r)}<span class="cost"><Icon name={r} size={12} />{v < 10 ? v.toFixed(2) : v.toFixed(0)}</span>{/each}
                    </button>
                    <button disabled={!o.boost.ok} title={o.boost.ok ? `Send it up from the Earth with boost, done ${onDay(o.order.doneDayWithBoost!)}` : o.boost.reason} onclick={() => order(o.module.id, "boost")}>
                      <span class="cost"><Icon name="boost" size={12} />{o.order.boost ? o.order.boost.value.toFixed(1) : "–"}</span>
                    </button>
                  </div>
                  {#if !o.resources.ok && !o.boost.ok}<div class="why small">{o.boost.reason}</div>{/if}
                </div>
              {/each}
            </div>
          {/if}
        </aside>
      </div>
    </section>
  </div>
  {#if tip}
    {@const m = tip.slot !== null ? hab.modules[tip.slot] : null}
    <ModuleTooltip facts={moduleFacts(world, tip.module, hab)} x={tip.x} y={tip.y} status={m && tip.slot !== null ? slotProgress(world, m, operation.status[tip.slot] ?? null) : null} />
  {/if}
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
    width: min(1440px, 100%);
    height: min(900px, 100%);
    pointer-events: auto;
    background: rgba(14, 20, 28, 0.98);
  }
  .section-title {
    justify-content: space-between;
  }
  .flat {
    background: transparent;
    border-color: transparent;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 4px;
    padding: 4px;
  }
  .view {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .scene {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--border-soft);
  }
  .heading {
    position: absolute;
    top: 10px;
    left: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    pointer-events: none;
  }
  .heading > * {
    text-shadow:
      0 0 3px #000,
      0 0 6px #000;
  }
  h2 {
    margin: 0;
    font-size: 2em;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .grade {
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
    font-size: 0.95em;
  }
  .swatch {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    box-shadow: inset -3px -3px 4px rgba(0, 0, 0, 0.55);
  }
  .stats {
    display: flex;
    gap: 6px;
  }
  .stats span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    background: rgba(5, 8, 13, 0.75);
    text-shadow: none;
  }
  .back {
    margin-top: 4px;
    pointer-events: auto;
    text-shadow: none;
  }
  .arrow {
    position: absolute;
    top: 45%;
    width: 34px;
    height: 34px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 8, 13, 0.7);
  }
  .arrow.left {
    left: 12px;
  }
  .arrow.right {
    right: 12px;
  }
  .summary {
    flex: none;
    margin-top: 4px;
    border: 1px solid var(--border-soft);
  }
  .summary-title {
    padding: 2px;
    text-align: center;
    color: var(--muted);
    font-size: 0.85em;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .summary-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 16px;
    padding: 4px 8px 6px;
  }
  .summary-row span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .short,
  .loss {
    color: var(--bad);
  }
  .side {
    flex: none;
    width: 400px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid var(--border-soft);
  }
  .tabs {
    display: flex;
  }
  .tabs button,
  .filters button {
    border-radius: 0;
  }
  .tabs button {
    flex: 1;
    padding: 5px;
    text-transform: uppercase;
    font-size: 0.85em;
    letter-spacing: 0.04em;
  }
  .tabs button.active,
  .filters button.active {
    background: var(--button-hover);
    border-color: var(--accent);
  }
  .picked {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 92px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border-soft);
  }
  .prompt {
    font-size: 1.15em;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .picked-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .name {
    font-size: 1.05em;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.85em;
  }
  .small {
    font-size: 0.85em;
  }
  .filters {
    display: flex;
    gap: 3px;
    padding: 6px;
    border-bottom: 1px solid var(--border-soft);
  }
  .filters input {
    flex: 1;
    min-width: 0;
  }
  .filters button {
    min-width: 30px;
    padding: 2px 6px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px;
  }
  .sector {
    padding: 4px 6px 2px;
    color: var(--muted);
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 2px 6px;
    border: 1px solid transparent;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  .row:hover {
    background: rgba(143, 224, 230, 0.08);
  }
  .row.active {
    border-color: var(--accent);
    background: rgba(143, 224, 230, 0.12);
  }
  .row.dim .row-name {
    opacity: 0.75;
  }
  .row-name {
    flex: 1;
    min-width: 0;
  }
  .empty-icon {
    width: 32px;
    height: 32px;
    flex: none;
    border: 1px dashed rgba(220, 230, 240, 0.3);
  }
  .hint {
    padding: 8px;
  }
  .option {
    padding: 4px 6px;
    border-bottom: 1px solid var(--border-soft);
  }
  .option-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .upgrade {
    color: var(--gold);
    font-size: 0.85em;
  }
  .pay {
    display: flex;
    gap: 4px;
    margin: 3px 0 0 40px;
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
    margin: 2px 0 0 40px;
    color: var(--muted);
  }
</style>
