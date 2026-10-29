<script lang="ts">
  // Research, after Terra Invicta's Research & Development screen: the three global techs that
  // every faction researches together, then our own project slots. Pips split our research
  // between the slots. When we contributed most to a finished tech we pick the next one, and
  // the clock waits for us (the panel opens by itself); so it does when one of our projects is
  // done. Picking a tech or a project opens the Select Research sheet: the choices on the left,
  // the highlighted one's details on the right. The archives of completed global research and
  // projects use the same sheet.
  import { baseContent } from "../../content/index";
  import {
    availableTechs,
    factionDef,
    projectChoices,
    projectCost,
    projectDef,
    projectSlotCount,
    techCost,
    techDef,
    topContributor,
    type ProjectDef,
    type ResearchCategory,
    type TechDef,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { describe } from "../researchEffects";
  import { compact } from "../ui/format";
  import Emblem from "../ui/Emblem.svelte";
  import Icon from "../ui/Icon.svelte";
  import { researchCategoryIcons } from "../ui/icons";

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const rules = baseContent.rules.research;
  const techSlots = $derived(world.research.slots.length);
  const openProjectSlots = $derived(faction ? projectSlotCount(baseContent, faction) : 0);
  const choices = $derived([...availableTechs(world, baseContent)].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)));
  /** The techs and projects each tech or project leads to, listed in the sheet. */
  const leadsTo = $derived.by(() => {
    const out = new Map<string, (TechDef | ProjectDef)[]>();
    for (const item of [...baseContent.techs, ...baseContent.projects]) for (const p of item.prereqs) out.set(p, [...(out.get(p) ?? []), item]);
    return out;
  });

  const CATEGORY: Record<ResearchCategory, { name: string; color: string; about: string }> = {
    energy: { name: "Energy", color: "#f0c040", about: "Energy research covers power generation, from fission and fusion to antimatter, and the drives that run on it." },
    information: { name: "Information", color: "#5fb4ff", about: "Information research covers computing, communications, artificial intelligence and cryptography." },
    life: { name: "Life Science", color: "#7ad35f", about: "Life Science covers medicine, genetics, agriculture and keeping people alive in space." },
    materials: { name: "Materials", color: "#c79a6b", about: "Materials research covers chemistry, construction, metallurgy and nanotechnology." },
    military: { name: "Military", color: "#ff6a5a", about: "Military research covers doctrine, weapons and the armies and fleets that use them." },
    social: { name: "Social Science", color: "#c48af0", about: "Social Science covers law, economics, governance and how people come to agree." },
    space: { name: "Space Science", color: "#8fe0e6", about: "Space Science covers astronomy, launch, orbital mechanics and building beyond Earth." },
    xenology: { name: "Xenology", color: "#e07ad3", about: "Xenology is the study of the aliens: their biology, their technology and their aims." },
  };

  const factionName = (id: string) => factionDef(baseContent, id).name;
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

  /** Clicking a pip fills the bar up to it; clicking the top filled pip takes that one away. */
  function clickPip(index: number, pip: number) {
    if (!faction) return;
    // Older saves may hold more pips than the rules now allow.
    const pips = faction.research.pips.map((p) => Math.min(rules.maxPips, p));
    pips[index] = pips[index] === pip + 1 ? pip : pip + 1;
    void game.command({ type: "setResearchPips", factionId: faction.id, pips });
  }

  function choose(slot: number, techId: string) {
    if (faction) void game.command({ type: "chooseTech", factionId: faction.id, slot, techId });
  }

  function setProject(slot: number, projectId: string | null) {
    if (faction) void game.command({ type: "setProject", factionId: faction.id, slot, projectId });
  }

  /** The sheet over the panel: picking a tech or project for a slot, or browsing the completed ones. */
  type Sheet = { mode: "select"; kind: "tech" | "project"; slot: number } | { mode: "archive"; kind: "tech" | "project" };
  let sheet = $state<Sheet | null>(null);
  let highlighted = $state<string | null>(null);
  const categoryOrder = Object.keys(CATEGORY) as ResearchCategory[];
  interface Row {
    item: TechDef | ProjectDef;
    cost: number;
    progress: number;
    /** Times completed (archive only). */
    times: number;
  }
  /** The sheet's list, grouped by field and cheapest first. */
  const rows = $derived.by((): Row[] => {
    if (!sheet || !faction) return [];
    let out: Row[];
    if (sheet.mode === "archive") {
      out =
        sheet.kind === "tech"
          ? world.research.completed.map((id) => techDef(baseContent, id)).map((t) => ({ item: t, cost: t.cost, progress: t.cost, times: 1 }))
          : Object.entries(faction.research.completed).map(([id, times]) => {
              const p = projectDef(baseContent, id);
              return { item: p, cost: p.cost, progress: p.cost, times };
            });
    } else if (sheet.kind === "tech") {
      out = choices.map((t) => ({ item: t, cost: techCost(world, baseContent, t.id), progress: 0, times: 0 }));
    } else {
      const slot = sheet.slot;
      out = faction.research.available
        .filter((id) => !faction.research.projectSlots.some((other, k) => other === id && k !== slot))
        .map((id) => ({ item: projectDef(baseContent, id), cost: projectCost(world, baseContent, faction, id), progress: faction.research.progress[id] ?? 0, times: 0 }));
    }
    return out.sort((a, b) => categoryOrder.indexOf(a.item.category) - categoryOrder.indexOf(b.item.category) || a.cost - b.cost || a.item.name.localeCompare(b.item.name));
  });
  const shown = $derived(rows.find((o) => o.item.id === highlighted) ?? rows[0] ?? null);

  function openSelect(kind: "tech" | "project", slot: number) {
    sheet = { mode: "select", kind, slot };
    highlighted = kind === "project" ? (faction?.research.projectSlots[slot] ?? null) : null;
  }

  const archiveOpen = (kind: "tech" | "project") => sheet?.mode === "archive" && sheet.kind === kind;
  function toggleArchive(kind: "tech" | "project") {
    sheet = archiveOpen(kind) ? null : { mode: "archive", kind };
    highlighted = null;
  }

  function confirmSelect(id: string) {
    if (sheet?.mode !== "select") return;
    if (sheet.kind === "tech") choose(sheet.slot, id);
    else setProject(sheet.slot, id);
    sheet = null;
  }

  const close = () => (game.researchOpen = false);
  // Esc closes the sheet first, then the panel.
  const onKey = (e: KeyboardEvent) => e.key === "Escape" && (sheet ? (sheet = null) : close());
</script>

<svelte:window onkeydown={onKey} />

{#snippet pips(index: number)}
  {@const n = faction!.research.pips[index]!}
  <div class="pips" title="Share of our research this slot gets">
    {#each Array.from({ length: rules.maxPips }, (_, i) => i) as i (i)}
      <button class="pip" class:on={i < n} aria-label="{i + 1} pip{i === 0 ? '' : 's'}" onclick={() => clickPip(index, i)}></button>
    {/each}
  </div>
{/snippet}

{#snippet effects(item: TechDef | ProjectDef, withSummary = true)}
  {@const lines = describe(item)}
  {#if withSummary && !("grants" in item) && item.summary}<div class="small muted">{item.summary}</div>{/if}
  {#if lines.length > 0}
    <ul class="effects">{#each lines as line, k (k)}<li>{line}</li>{/each}</ul>
  {:else if "grants" in item}
    <div class="effects none">No effect in the game yet; leads to other projects.</div>
  {/if}
{/snippet}

{#snippet category(id: ResearchCategory)}
  <span class="category" style:color={CATEGORY[id].color}>{CATEGORY[id].name}</span>
{/snippet}

{#snippet glyph(id: ResearchCategory, size: number)}
  {@const Glyph = researchCategoryIcons[id]}
  <span class="glyph" style:color={CATEGORY[id].color} title={CATEGORY[id].name}><Glyph {size} strokeWidth={1.75} /></span>
{/snippet}

{#snippet heading(item: TechDef | ProjectDef, extra: string)}
  <div class="heading">
    {@render glyph(item.category, 30)}
    <div>
      <div class="name" title={item.summary}>{item.name}{#if extra}{" "}<span class="muted small">{extra}</span>{/if}</div>
      {@render category(item.category)}
    </div>
  </div>
{/snippet}

{#snippet contributions(slot: (typeof world.research.slots)[number], cost: number)}
  <div class="bar stacked" title="Research put in by each faction">
    {#each baseContent.factions as f (f.id)}
      {@const share = Math.min(100, ((slot.contributions[f.id] ?? 0) / Math.max(1, cost)) * 100)}
      {#if share > 0}<span style:width="{share}%" style:background={f.color} title="{f.name}: {compact(slot.contributions[f.id]!, 0)}"></span>{/if}
    {/each}
  </div>
  <div class="contributors">
    {#each baseContent.factions as f (f.id)}
      <span class="contributor" class:ours={f.id === faction!.id} title="{f.name} has put in {compact(slot.contributions[f.id] ?? 0, 0)}">
        <Emblem faction={f.id} size={18} />{compact(slot.contributions[f.id] ?? 0, 0)}
      </span>
    {/each}
  </div>
{/snippet}

{#if faction}
  <div class="overlay">
    <section class="panel sheet">
      <h3 class="section-title">
        Global Research
        <span class="buttons">
          <button class="icon-button flat" class:active={archiveOpen("tech")} title="Completed global research ({world.research.completed.length})" onclick={() => toggleArchive("tech")}>
            <Icon name="archive" size={14} />
          </button>
          <button class="icon-button flat" title="Close (Esc)" onclick={close}><Icon name="close" size={14} /></button>
        </span>
      </h3>
      <div class="slots">
        {#each world.research.slots as slot, i (i)}
          <div class="slot cell">
            {#if slot.techId}
              {@const tech = techDef(baseContent, slot.techId)}
              {@const cost = techCost(world, baseContent, slot.techId)}
              {@const leader = topContributor(world, slot)}
              {@render heading(tech, "")}
              {@render effects(tech)}
              <div class="small muted progress">{compact(slot.progress, 0)} / {compact(cost, 0)}</div>
              {@render contributions(slot, cost)}
              <div class="small centered">
                Our share {pct(slot.contributions[faction.id] ?? 0, slot.progress)}%{#if leader}{" · "}Leading: <span class:good={leader === faction.id}>{factionName(leader)}</span>{/if}
              </div>
              {@render pips(i)}
            {:else if slot.chooser === faction.id}
              <div class="name good">We pick the next tech</div>
              <div class="small muted">We contributed most to the last one. The clock waits for our choice.</div>
              <button class="select" onclick={() => openSelect("tech", i)}>Select</button>
            {:else if slot.chooser}
              <div class="muted">{factionName(slot.chooser)} is choosing the next tech.</div>
            {:else}
              <div class="muted">Nothing left to research here.</div>
            {/if}
          </div>
        {/each}
      </div>

      <h3 class="section-title">
        Projects
        <button class="icon-button flat" class:active={archiveOpen("project")} title="Completed projects ({Object.keys(faction.research.completed).length})" onclick={() => toggleArchive("project")}>
          <Icon name="archive" size={14} />
        </button>
      </h3>
      <div class="slots">
        {#each faction.research.projectSlots as projectId, j (j)}
          <div class="slot cell" class:locked={j >= openProjectSlots}>
            {#if j >= openProjectSlots}
              <div class="muted">
                {j === 1 ? "Opens when one of our councilors holds an org with research income." : "Opens with a research hab module (not in the game yet)."}
              </div>
            {:else if projectId}
              {@const p = projectDef(baseContent, projectId)}
              {@const cost = projectCost(world, baseContent, faction, projectId)}
              {@const progress = faction.research.progress[projectId] ?? 0}
              <div class="head-row">
                {@render heading(p, faction.research.completed[projectId] ? `×${faction.research.completed[projectId]! + 1}` : "")}
                <button class="small" onclick={() => openSelect("project", j)}>Change</button>
              </div>
              <div class="small muted">{p.summary}</div>
              {@render effects(p)}
              <div class="bar"><span style:width="{Math.min(100, pct(progress, cost))}%" style:background={CATEGORY[p.category].color}></span></div>
              <div class="small muted">{compact(progress, 0)} / {compact(cost, 0)}</div>
              {@render pips(techSlots + j)}
            {:else}
              {#if projectChoices(baseContent, faction).includes(j)}
                <div class="name good">Project complete</div>
                <div class="small muted">Pick the next one. The clock waits for our choice.</div>
              {:else}
                <div class="name muted">No project under way</div>
              {/if}
              {#if faction.research.available.some((id) => !faction.research.projectSlots.includes(id))}
                <button class="select" onclick={() => openSelect("project", j)}>Select</button>
              {:else}
                <div class="muted small">No projects available. New techs bring new ideas.</div>
              {/if}
              {#if Object.keys(faction.research.pending).length > 0}
                <div class="small muted" title={Object.keys(faction.research.pending).map((id) => projectDef(baseContent, id).name).join(", ")}>
                  {Object.keys(faction.research.pending).length} more idea{Object.keys(faction.research.pending).length === 1 ? "" : "s"} still being worked up; a chance each month to become available.
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

    </section>
    {#if sheet}
      <section class="panel sheet archive select-sheet">
        <h3 class="section-title">
          {#if sheet.mode === "select"}
            {sheet.kind === "tech" ? "Select Global Research" : "Select Project"}
          {:else}
            {sheet.kind === "tech" ? "Completed Global Research" : "Completed Projects"} ({rows.length})
          {/if}
          <button class="icon-button flat" title="Close (Esc)" onclick={() => (sheet = null)}><Icon name="close" size={14} /></button>
        </h3>
        <div class="select-body">
          <ul class="option-list">
            {#each rows as o (o.item.id)}
              <li>
                <button
                  class="option"
                  class:on={shown?.item.id === o.item.id}
                  onclick={() => (highlighted = o.item.id)}
                  ondblclick={() => confirmSelect(o.item.id)}
                >
                  {@render glyph(o.item.category, 16)}
                  <span class="option-name">{o.item.name}{#if o.times > 1}{" "}<span class="muted small">×{o.times}</span>{/if}</span>
                  {#if sheet.mode === "archive"}
                    <span class="small muted">{compact(o.cost, 0)}</span>
                    <Icon name="done" size={12} color="var(--good)" />
                  {:else}
                    <span class="small muted">{compact(o.progress, 0)} / {compact(o.cost, 0)}</span>
                    <Icon name="research" size={12} />
                  {/if}
                </button>
              </li>
            {:else}
              <li class="muted small">{sheet.mode === "select" ? "Nothing to choose from." : sheet.kind === "tech" ? "No global research completed yet." : "No projects completed yet."}</li>
            {/each}
          </ul>
          {#if shown}
            {@const item = shown.item}
            {@const next = leadsTo.get(item.id) ?? []}
            <div class="details cell">
              <div class="detail-head">
                {@render glyph(item.category, 64)}
                <div class="detail-name">{item.name}</div>
                {@render category(item.category)}
                <div class="small muted">{item.summary}</div>
              </div>
              <div class="detail-body">
                {@render effects(item, false)}
                <div class="small">
                  {#if sheet.mode === "archive"}
                    <span class="good">Completed{shown.times > 1 ? ` ${shown.times} times` : ""}</span> · cost {compact(shown.cost, 0)}
                  {:else}
                    Cost {compact(shown.cost, 0)}{#if shown.progress > 0} · {compact(shown.progress, 0)} put in so far{/if}
                  {/if}
                </div>
                {#if next.length > 0}
                  <div class="leads">
                    <div class="small muted">Leads to</div>
                    <ul>
                      {#each next as n (n.id)}
                        {@const isProject = "grants" in n}
                        <li title={n.summary}>
                          {@render glyph(n.category, 14)}
                          <span>{n.name}</span>
                          {#if isProject}<span class="tag">Project</span>{/if}
                          {#if isProject ? faction.research.completed[n.id] : world.research.completed.includes(n.id)}<Icon name="done" size={12} color="var(--good)" />{/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
              <div class="detail-about small">
                {@render glyph(item.category, 28)}
                <span class="muted">{CATEGORY[item.category].about}</span>
              </div>
              {#if sheet.mode === "select"}
                <button class="select confirm" onclick={() => confirmSelect(item.id)}>{sheet.kind === "tech" ? "Select Research" : "Select Project"}</button>
              {/if}
            </div>
          {/if}
        </div>
      </section>
    {/if}
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
    width: min(1100px, 100%);
    max-height: 100%;
    overflow-y: auto;
    pointer-events: auto;
    background: var(--panel-solid);
  }
  .buttons {
    display: inline-flex;
    gap: 2px;
  }
  .archive {
    position: absolute;
    top: 40px;
    width: min(760px, calc(100% - 40px));
    max-height: calc(100% - 60px);
    z-index: 1;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 6px;
    padding: 6px;
  }
  .slot {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 120px;
    padding: 6px 8px;
  }
  .slot.locked {
    justify-content: center;
    opacity: 0.6;
  }
  .name {
    font-size: 1.05em;
  }
  .category {
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .bar {
    height: 6px;
    margin-top: 3px;
    background: #1d2833;
  }
  .bar span {
    display: block;
    height: 100%;
  }
  .pips {
    display: flex;
    justify-content: center;
    gap: 4px;
    margin-top: auto;
    padding-top: 4px;
  }
  .pip {
    width: 52px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border);
    background: #1d2833;
  }
  .pip.on {
    background: #6fae45;
    border-color: #9be35b;
  }
  .pip.on:hover {
    background: #82c454;
  }
  .centered {
    text-align: center;
  }
  .head-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 6px;
  }
  .heading {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .glyph {
    display: inline-flex;
    flex: none;
  }
  .progress {
    margin-top: 3px;
    text-align: right;
  }
  .bar.stacked {
    display: flex;
    height: 10px;
    margin-top: 0;
  }
  .contributors {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    font-size: 0.85em;
  }
  .contributor {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .contributor.ours {
    color: var(--accent);
  }
  .select {
    align-self: center;
    min-width: 140px;
    margin-top: auto;
    padding: 6px 16px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .select-sheet {
    width: min(1060px, calc(100% - 40px));
    height: calc(100% - 60px);
    overflow: hidden;
  }
  .select-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 6px;
    flex: 1;
    min-height: 0;
    padding: 6px;
  }
  .option-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 3px 6px;
    border-color: transparent;
    background: transparent;
    text-align: left;
  }
  .option-list li:nth-child(odd) .option {
    background: var(--cell);
  }
  .option.on {
    background: var(--button-hover);
    border-color: var(--border-strong);
  }
  .option-name {
    flex: 1;
  }
  .details {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    padding: 10px;
  }
  .detail-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-soft);
    text-align: center;
  }
  .detail-name {
    font-size: 1.3em;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .detail-body {
    flex: 1;
  }
  .leads {
    margin-top: 10px;
  }
  .leads ul {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
  }
  .leads li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
  }
  .tag {
    padding: 0 4px;
    border: 1px solid var(--border-soft);
    color: var(--muted);
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .detail-about {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-soft);
  }
  .confirm {
    align-self: center;
    margin-top: 0;
  }
  .effects {
    margin: 2px 0;
    padding: 0;
    list-style: none;
    font-size: 0.85em;
    color: var(--good);
  }
  .effects.none {
    color: var(--muted);
  }
  .section-title .active {
    color: var(--accent);
  }
  .small {
    font-size: 0.85em;
  }
</style>
