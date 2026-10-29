<script lang="ts">
  // Councilor summary, after Terra Invicta's full council page: portrait and identity with
  // Augment / Customize / Dismiss; traits; attributes and monthly incomes; the missions the
  // councilor can run (or, while augmenting, the attributes XP can raise); and the orgs they
  // hold above the faction's org market.
  // Another faction's councilor opens read-only, showing only what our intel reveals (Terra
  // Invicta's levels): identity at 25%, stats, traits, orgs and missions at 50%, the current
  // mission at 75% and true Loyalty at 100%. Who has spotted our councilors isn't shown here.
  import { baseContent } from "../../content/index";
  import {
    ATTRIBUTES,
    attributeBreakdown,
    augmentCost,
    availableMissions,
    checkAugment,
    checkBuyOrg,
    councilorAge,
    councilorIncome,
    effectiveAttributes,
    factionDef,
    findAnyCouncilor,
    intelOn,
    INCOME_KEYS,
    MISSION_NAMES,
    missionSource,
    nationDef,
    orgAllowed,
    orgCapacity,
    orgDef,
    orgLoad,
    professionDef,
    regionDef,
    traitDef,
    type Attribute,
    type Councilor,
    type Gender,
    type MissionType,
    type OrgDef,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { effects, INCOME_LABELS } from "../councilorEffects";
  import { describeTarget, shownLocation } from "../missionTargets";
  import { keepHairSeed, SKIN } from "../portraits/portrait";
  import Emblem from "../ui/Emblem.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";
  import { attributeColor, attributeIcons, missionIcons, type IconName } from "../ui/icons";
  import Portrait from "../ui/Portrait.svelte";
  import Num from "./Num.svelte";

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const found = $derived(game.summaryCouncilorId ? findAnyCouncilor(world, game.summaryCouncilorId) : null);
  const ownerId = $derived(found?.factionId ?? "");
  const ours = $derived(faction !== null && ownerId === faction.id);
  const intel = $derived(found && faction ? intelOn(world, faction.id, found.councilor.id) : 0);
  const reveal = $derived({ stats: ours || intel >= 0.5, mission: ours || intel >= 0.75, loyalty: ours || intel >= 1 });
  /** Nothing to show for a councilor we haven't identified (or who has left play). */
  const councilor = $derived(found && (ours || intel >= baseContent.rules.missions.intelToTarget) ? found.councilor : null);
  // Our own councilors show where their mission takes them; others show where they are.
  const location = $derived(councilor ? (ours ? shownLocation(world, councilor) : { nationId: councilor.locationId, regionId: councilor.regionId }) : null);

  let mode = $state<"missions" | "augment">("missions");
  // A different councilor starts on the mission list, with Customize closed.
  $effect(() => {
    void game.summaryCouncilorId;
    mode = "missions";
    draft = null;
  });
  let enlarged = $state(false);
  /** The Customize form's values while it is open. */
  let draft = $state<{ name: string; gender: Gender; skinTone: number | null; portraitSeed: number; hairSeed: number | null } | null>(null);
  const randomSeed = () => Math.floor(Math.random() * 0x7fffffff);

  const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const effective = $derived(councilor ? effectiveAttributes(baseContent, councilor) : null);
  const income = $derived(councilor ? councilorIncome(baseContent, councilor) : null);
  const available = $derived(councilor ? availableMissions(baseContent, councilor) : new Set<MissionType>());
  const underway = $derived(councilor ? world.scheduledMissions.some((s) => s.councilorId === councilor.id) : false);

  /** Missions grouped by the attribute that drives them, as in Terra Invicta. */
  const GROUPS: { label: string; attr: Attribute | null; types: MissionType[] }[] = [
    { label: "Uncontested", attr: null, types: ["defendInterests", "protectTarget", "advise"] },
    { label: "Persuasion", attr: "persuasion", types: ["controlNation", "publicCampaign", "inspire"] },
    { label: "Investigation", attr: "investigation", types: ["crackdown", "investigateCouncilor"] },
    { label: "Espionage", attr: "espionage", types: ["purge", "assassinate"] },
    { label: "Command", attr: "command", types: ["coup", "stabilizeNation", "increaseUnrest"] },
    { label: "Common", attr: null, types: ["setPolicy"] },
  ];

  const ORG_TYPES: Record<OrgDef["type"], string> = {
    government: "Government",
    research: "Research",
    space: "Space",
    corporate: "Corporate",
    media: "Media",
    ngo: "Non-profit",
    security: "Security",
    criminal: "Criminal",
  };

  function stars(tier: number): string {
    return "★".repeat(tier);
  }

  function command(cmd: Parameters<typeof game.command>[0]) {
    void game.command(cmd);
  }

  function step(delta: number) {
    if (!faction || !councilor) return;
    const list = faction.councilors;
    const i = list.findIndex((c) => c.id === councilor.id);
    game.summaryCouncilorId = list[(i + delta + list.length) % list.length]!.id;
    draft = null;
  }

  function close() {
    game.summaryCouncilorId = null;
    draft = null;
    mode = "missions";
  }

  function startCustomize(c: Councilor) {
    draft = { name: c.name, gender: c.gender, skinTone: c.skinTone, portraitSeed: c.portraitSeed, hairSeed: c.hairSeed };
  }

  /** A new face that keeps the current hair. */
  function changeFace(c: Councilor) {
    if (!draft) return;
    draft.hairSeed = keepHairSeed(draft.portraitSeed, draft.gender, c.professionId, draft.hairSeed);
    draft.portraitSeed = randomSeed();
  }

  function saveCustomize(c: Councilor) {
    if (!draft || !faction) return;
    command({ type: "customizeCouncilor", factionId: faction.id, councilorId: c.id, ...draft });
    draft = null;
  }

  function dismiss(c: Councilor) {
    if (!faction) return;
    const orgs = c.orgs.length > 0 ? ` Their ${c.orgs.length} org${c.orgs.length > 1 ? "s" : ""} will be lost.` : "";
    if (!confirm(`Dismiss ${c.name} from the council?${orgs}`)) return;
    void game.command({ type: "dismissCouncilor", factionId: faction.id, councilorId: c.id }).then((r) => {
      if (r.ok) close();
    });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape" || !councilor) return;
    if (enlarged) enlarged = false;
    else if (draft) draft = null;
    else if (mode === "augment") mode = "missions";
    else close();
  }

  const status = (c: Councilor) => {
    if (!reveal.mission) return "Unknown (needs 75% intel)";
    if (c.detainedPhases > 0) return `Detained (${c.detainedPhases} phase${c.detainedPhases > 1 ? "s" : ""})`;
    if (c.mission) return `${MISSION_NAMES[c.mission.type]} (${describeTarget(world, c.mission)})${underway ? ", under way" : ""}`;
    return "Idle";
  };
</script>

<svelte:window onkeydown={onKey} />

{#if councilor && faction && effective && income}
  {@const profession = professionDef(baseContent, councilor.professionId)}
  {@const preview = draft ? { ...councilor, ...draft } : councilor}
  <div class="overlay">
    <section class="panel sheet">
      <header class="sheet-title">
        <span>{ours ? "Councilor Summary" : `Intelligence File · ${factionDef(baseContent, ownerId).name}`}</span>
        <button class="icon-button flat" title="Close (Esc)" onclick={close}><Icon name="close" size={16} /></button>
      </header>

      <div class="grid">
        <!-- Identity -->
        <div class="portrait-col">
          <button class="portrait" title="Enlarge portrait" onclick={() => (enlarged = true)}>
            <Portrait councilor={preview} factionId={ownerId} variant="full" scale={2} />
          </button>
          {#if ours}
            <div class="cycle">
              <button title="Previous councilor" onclick={() => step(-1)}>‹</button>
              <span class="muted small">{faction.councilors.indexOf(councilor) + 1} / {faction.councilors.length}</span>
              <button title="Next councilor" onclick={() => step(1)}>›</button>
            </div>
          {:else}
            <div class="intel-bar" title="Our intel on {councilor.name}">
              <span>Intel</span>
              <span class="bar"><span style:width="{intel * 100}%"></span></span>
              <span>{Math.round(intel * 100)}%</span>
            </div>
          {/if}
        </div>

        <div class="identity">
          {#if draft}
            <div class="customize">
              <label>Name <input bind:value={draft.name} maxlength="40" /></label>
              <span class="label">Skin tone</span>
              <div class="swatches">
                <button class="swatch auto" class:selected={draft.skinTone === null} title="As generated" onclick={() => draft && (draft.skinTone = null)}>Auto</button>
                {#each SKIN as color, i (color)}
                  <button class="swatch" class:selected={draft.skinTone === i} style:background={color} title="Skin tone {i + 1}" aria-label="Skin tone {i + 1}" onclick={() => draft && (draft.skinTone = i)}></button>
                {/each}
              </div>
              <span class="label">Gender</span>
              <div class="pair">
                <button class:selected={draft.gender === "female"} onclick={() => draft && (draft.gender = "female")}>Female</button>
                <button class:selected={draft.gender === "male"} onclick={() => draft && (draft.gender = "male")}>Male</button>
              </div>
              <div class="pair">
                <button onclick={() => changeFace(councilor)}>Change Face</button>
                <button onclick={() => draft && (draft.hairSeed = randomSeed())}>Change Hair</button>
              </div>
              <div class="actions">
                <button class="primary" disabled={draft.name.trim().length === 0} onclick={() => saveCustomize(councilor)}>Save</button>
                <button onclick={() => (draft = null)}>Cancel</button>
              </div>
            </div>
          {:else}
            <div class="name-row">
              <Emblem faction={ownerId} size={40} />
              <div>
                <h2>{councilor.name}</h2>
                <div class="profession">{profession.name}</div>
              </div>
            </div>
            <dl>
              <dt>Status</dt><dd class:bad={councilor.detainedPhases > 0}>{status(councilor)}</dd>
              <dt>Age</dt><dd>{councilorAge(world, baseContent, councilor)}</dd>
              <dt>Hometown</dt><dd><Flag nationId={councilor.nationId} height={12} /> {nationDef(baseContent, councilor.nationId).capital.name}, {nationDef(baseContent, councilor.nationId).name}</dd>
              <dt>XP</dt><dd class="gold">{reveal.stats ? councilor.xp : "?"}</dd>
              {#if location}<dt>Location</dt><dd><Flag nationId={location.nationId} height={12} /> {regionDef(baseContent, location.regionId).name}, {nationDef(baseContent, location.nationId).name}</dd>{/if}
            </dl>
            {#if ours}<div class="buttons">
              <button class:active={mode === "augment"} onclick={() => (mode = mode === "augment" ? "missions" : "augment")}>Augment</button>
              <button onclick={() => startCustomize(councilor)}>Customize</button>
              <button class="danger" disabled={faction.councilors.length <= 1} title={faction.councilors.length <= 1 ? "The last councilor can't be dismissed" : "Fire this councilor"} onclick={() => dismiss(councilor)}>Dismiss</button>
            </div>{/if}
          {/if}
        </div>

        <!-- Traits -->
        <div class="block traits">
          <h3 class="section-title">Traits and Augmentations</h3>
          {#if !reveal.stats}<p class="muted small locked">Needs 50% intel.</p>{:else}
          <ul class="list">
            {#each councilor.traits as id (id)}
              {@const t = traitDef(baseContent, id)}
              <li class="trait {t.kind}">
                {t.name}
                <span class="tip panel">
                  <strong>{t.name}</strong>
                  <span class="muted">{t.description}</span>
                  {#each effects(t) as e (e.text)}<span class:good={e.good} class:bad={!e.good}>{e.text}</span>{/each}
                </span>
              </li>
            {:else}
              <li class="muted">No notable traits</li>
            {/each}
          </ul>
          {/if}
        </div>

        <!-- Attributes and incomes -->
        <div class="block stats">
          <h3 class="section-title">Attributes</h3>
          {#if !reveal.stats}<p class="muted small locked">Needs 50% intel.</p>{:else}
          <ul class="list">
            {#each ATTRIBUTES as attr (attr)}
              {@const Glyph = attributeIcons[attr]}
              <li class="row">
                <span class="label"><span style:color={attributeColor[attr]}><Glyph size={15} strokeWidth={2} /></span>{title(attr)}</span>
                {#if attr === "loyalty" && ours}
                  <span title="Loyalty as it appears to us">{councilor.apparentLoyalty}</span>
                {:else if attr === "loyalty"}
                  <span title={reveal.loyalty ? "Their true Loyalty" : "Needs 100% intel"}>{reveal.loyalty ? effective[attr] : "?"}</span>
                {:else}
                  <Num breakdown={attributeBreakdown(baseContent, councilor, attr)} digits={0} />
                {/if}
              </li>
            {/each}
          </ul>
          <h3 class="section-title">Monthly Incomes</h3>
          <ul class="list">
            {#each INCOME_KEYS as key (key)}
              <li class="row" title={key === "research" ? "Research isn't simulated yet" : undefined}>
                <span class="label"><Icon name={key as IconName} size={15} />{INCOME_LABELS[key]}</span>
                <Num breakdown={income[key]} digits={1} signed />
              </li>
            {/each}
          </ul>
          {/if}
        </div>

        <!-- Missions, or the augment menu -->
        <div class="block missions">
          {#if mode === "augment"}
            {@const cost = augmentCost(baseContent, councilor)}
            <h3 class="section-title">Augment <span class="muted">{councilor.xp} XP · {cost} XP per point</span></h3>
            <p class="muted small hint">Spend XP to raise an attribute by one point, up to {baseContent.rules.attribute.max}. Loyalty can't be augmented. Values shown are before trait and org bonuses.</p>
            <ul class="list">
              {#each ATTRIBUTES.filter((a) => a !== "loyalty") as attr (attr)}
                {@const Glyph = attributeIcons[attr]}
                {@const check = checkAugment(baseContent, councilor, attr)}
                <li class="row">
                  <span class="label"><span style:color={attributeColor[attr]}><Glyph size={15} strokeWidth={2} /></span>{title(attr)}</span>
                  <span class="augment">
                    <span>{councilor.attributes[attr]}</span>
                    <button disabled={!check.ok} title={check.ok ? `Spend ${cost} XP for +1 ${title(attr)}` : check.reason} onclick={() => command({ type: "augmentAttribute", factionId: faction.id, councilorId: councilor.id, attribute: attr })}>+1</button>
                  </span>
                </li>
              {/each}
            </ul>
            <button class="back" onclick={() => (mode = "missions")}>Back to missions</button>
          {:else if !reveal.stats}
            <h3 class="section-title">Missions</h3>
            <p class="muted small locked">Needs 50% intel.</p>
          {:else}
            <h3 class="section-title">Missions</h3>
            <ul class="list">
              {#each GROUPS as g (g.label)}
                {@const shown = g.types.filter((t) => available.has(t))}
                {#if shown.length > 0}
                  <li class="group">
                    {#if g.attr}{@const Glyph = attributeIcons[g.attr]}<span style:color={attributeColor[g.attr]}><Glyph size={14} strokeWidth={2} /></span>{/if}
                    {g.label}
                  </li>
                  {#each shown as t (t)}
                    {@const Glyph = missionIcons[t]}
                    <li class="row" title={missionSource(baseContent, councilor, t)}>
                      <span class="label"><Glyph size={14} strokeWidth={1.75} />{MISSION_NAMES[t]}</span>
                      <span>{g.attr ? effective[g.attr] : ""}</span>
                    </li>
                  {/each}
                {/if}
              {/each}
            </ul>
            <p class="muted small hint">A councilor's missions come from their profession, traits and orgs. Hover a mission to see which.</p>
          {/if}
        </div>

        <!-- Orgs -->
        <div class="block orgs">
          <h3 class="section-title">Orgs <span class="muted">Capacity from Administration ({orgLoad(baseContent, councilor)}/{orgCapacity(baseContent, councilor)})</span></h3>
          {#if !reveal.stats}<p class="muted small locked">Needs 50% intel.</p>{:else}
          <div class="cards">
            {#each councilor.orgs as id (id)}
              {@const org = orgDef(baseContent, id)}
              {@render orgCard(org, "held")}
            {:else}
              <p class="muted small">{councilor.name} holds no orgs{ours ? " yet. Buy them from the market below" : ""}.</p>
            {/each}
          </div>
          {/if}
          {#if ours}
          <h3 class="section-title">Org Marketplace</h3>
          <div class="cards">
            {#each faction.orgMarket as id (id)}
              {@render orgCard(orgDef(baseContent, id), "market")}
            {:else}
              <p class="muted small">The market is empty until it refreshes on the 15th.</p>
            {/each}
          </div>
          {/if}
        </div>
      </div>
    </section>
  </div>

  {#snippet orgCard(org: OrgDef, where: "held" | "market")}
    {@const allowed = orgAllowed(world, baseContent, faction.id, councilor, org)}
    {@const buy = where === "market" ? checkBuyOrg(world, baseContent, faction, councilor, org.id) : null}
    <div class="card" class:unavailable={where === "market" && !allowed.ok}>
      <div class="card-head">
        <span class="stars">{stars(org.tier)}</span>
        {#if org.nationId}<Flag nationId={org.nationId} height={11} />{/if}
        <span class="muted small">{ORG_TYPES[org.type]}</span>
      </div>
      <strong class="org-name">{org.name}</strong>
      <ul class="effects">
        {#each effects(org) as e (e.text)}<li class:good={e.good} class:bad={!e.good}>{e.text}</li>{/each}
      </ul>
      {#if org.professions?.length || org.traits?.length}
        <span class="muted small">For {[...(org.professions ?? []).map((p) => professionDef(baseContent, p).name), ...(org.traits ?? []).map((t) => traitDef(baseContent, t).name)].join(", ")}</span>
      {/if}
      {#if where === "market"}
        <div class="cost">
          {#each ["money", "influence", "ops", "boost"] as const as k (k)}
            {#if org.cost[k]}<span><Icon name={k} size={13} />{org.cost[k]}</span>{/if}
          {/each}
        </div>
        <button disabled={!buy?.ok} title={buy?.ok ? `Buy for ${councilor.name}` : buy?.reason} onclick={() => command({ type: "buyOrg", factionId: faction.id, councilorId: councilor.id, orgId: org.id })}>Buy</button>
      {:else if ours}
        <button
          title="Sell back for {Math.round((org.cost.money ?? 0) * baseContent.rules.councilors.orgSellRefund)} money"
          onclick={() => confirm(`Sell ${org.name}?`) && command({ type: "sellOrg", factionId: faction.id, councilorId: councilor.id, orgId: org.id })}>Sell</button>
      {/if}
    </div>
  {/snippet}

  {#if enlarged}
    <button class="lightbox" title="Close" onclick={() => (enlarged = false)}>
      <span class="large">
        <Portrait councilor={preview} factionId={ownerId} variant="full" scale={4} />
        <span class="caption">{councilor.name} · {profession.name}</span>
      </span>
    </button>
  {/if}
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 42px 6px 6px;
    z-index: 20;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    width: min(1500px, 100%);
    max-height: 100%;
    pointer-events: auto;
    background: var(--panel-solid);
  }
  .sheet-title {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 5px 8px;
    background: var(--header);
    color: var(--header-text);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .sheet-title button {
    position: absolute;
    right: 6px;
  }
  .grid {
    display: grid;
    grid-template-columns: 290px 300px minmax(240px, 300px) minmax(320px, 1fr);
    grid-template-rows: auto 1fr;
    gap: 6px;
    min-height: 0;
    padding: 6px;
    overflow: auto;
  }
  .portrait-col {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .portrait {
    padding: 0;
    border-color: var(--border);
    background: transparent;
    cursor: zoom-in;
  }
  .cycle {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cycle button {
    width: 3em;
    font-size: 1.2em;
  }
  .identity {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--border-soft);
    background: var(--cell);
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h2 {
    margin: 0;
    font-weight: 400;
    font-size: 1.35em;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .profession {
    color: var(--accent);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 10px;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    text-align: right;
  }
  .gold {
    color: var(--gold);
  }
  .buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: auto;
  }
  .buttons button {
    padding: 5px 2px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .buttons .active {
    border-color: var(--accent);
    background: var(--button-hover);
  }
  .danger:not(:disabled):hover {
    border-color: var(--bad);
  }
  .customize {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .customize label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--muted);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .swatch {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 2px solid var(--border-soft);
  }
  .swatch.auto {
    width: auto;
    padding: 0 6px;
    font-size: 0.8em;
  }
  .swatch.selected {
    border-color: var(--accent);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }
  .pair .selected {
    border-color: var(--accent);
    background: var(--button-hover);
  }
  .actions {
    display: flex;
    gap: 4px;
  }
  .actions button {
    flex: 1;
  }
  .primary {
    border-color: var(--border-strong);
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  .traits {
    grid-column: 1;
    grid-row: 2;
  }
  .stats {
    grid-column: 2;
    grid-row: 2;
  }
  .missions {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
  .orgs {
    grid-column: 4;
    grid-row: 1 / span 2;
    overflow-y: auto;
  }
  .section-title {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin: 0;
    font-size: 0.95em;
    font-weight: 400;
    text-transform: uppercase;
  }
  .section-title .muted {
    text-transform: none;
    font-size: 0.85em;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .list > li {
    padding: 4px 8px;
    background: var(--cell);
    border: 1px solid var(--border-soft);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--header) !important;
    color: var(--header-text);
  }
  .trait {
    position: relative;
    cursor: help;
  }
  .trait.negative {
    color: #ffb0a4;
  }
  .trait.mixed {
    color: #f0d9a0;
  }
  .tip {
    display: none;
    position: absolute;
    left: 100%;
    top: 0;
    z-index: 5;
    width: 260px;
    flex-direction: column;
    gap: 3px;
    margin-left: 6px;
    padding: 6px 8px;
    color: var(--text);
    background: var(--panel-solid);
  }
  .trait:hover .tip {
    display: flex;
  }
  .locked {
    margin: 2px 0 8px;
  }
  .intel-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85em;
    color: var(--muted);
  }
  .intel-bar .bar {
    flex: 1;
    height: 6px;
    background: #1d2833;
  }
  .intel-bar .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .augment {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .augment button {
    padding: 0 8px;
  }
  .hint {
    margin: 0 0 4px;
  }
  .back {
    margin-top: 4px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 4px;
    margin-bottom: 8px;
  }
  .cards > p {
    grid-column: 1 / -1;
    margin: 4px 0;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px;
    border: 1px solid var(--border-soft);
    background: var(--cell);
  }
  .card.unavailable {
    opacity: 0.55;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .stars {
    color: var(--gold);
    letter-spacing: -0.05em;
  }
  .org-name {
    font-weight: 400;
    line-height: 1.2;
  }
  .effects {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.8em;
  }
  .cost {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 0.85em;
  }
  .cost span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .card button {
    margin-top: auto;
    padding: 2px;
  }
  .good {
    color: var(--good);
  }
  .bad {
    color: #ff8a7a;
  }
  .small {
    font-size: 0.85em;
  }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: rgba(4, 7, 11, 0.82);
    cursor: zoom-out;
  }
  .lightbox:hover {
    background: rgba(4, 7, 11, 0.82);
  }
  .large {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* 4× the 128 px sprite: crisp whole-number scaling. */
    width: 512px;
    max-width: 95vw;
    border: 1px solid var(--border-strong);
    background: var(--panel-solid);
    box-shadow: 0 6px 30px rgba(0, 0, 0, 0.7);
  }
  .caption {
    padding: 0 0 8px;
    text-align: center;
    font-size: 1.2em;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
</style>
