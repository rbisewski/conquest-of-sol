<script lang="ts">
  // Nation panel (upper left), after Terra Invicta's: shown only while a nation is selected.
  // Title row, control point tiles, OVERVIEW / MILITARY / DEVELOPMENT / PEOPLE sections and
  // tabs for priorities, regions, public opinion and relations (with diplomacy).
  import { baseContent } from "../../content/index";
  import {
    alliesOf,
    nationClimate,
    checkExecutive,
    consolidationDaysLeft,
    federationOf,
    sharedOutputs,
    annualGdpGrowth,
    claimHeld,
    claimHostile,
    claimsOn,
    homeCapital,
    hostileClaim,
    isExtant,
    nationClaims,
    projectDef,
    nationRegions,
    regionDef,
    regionOwner,
    nationResearch,
    nationArmies,
    navyCount,
    nukeTargets,
    occupiedShare,
    rivalsOf,
    sideOf,
    warName,
    warsOf,
    controlPointCapacityCost,
    controlPointType,
    corruption,
    factionDef,
    gdpPerCapita,
    isDefended,
    isDisabled,
    monthlyInvestment,
    nationDef,
    priorityAvailable,
    priorityFlows,
    UNDECIDED,
    unrestBand,
    unrestTarget,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import Emblem from "../ui/Emblem.svelte";
  import FederationFlag from "../ui/FederationFlag.svelte";
  import Flag from "../ui/Flag.svelte";
  import { cohesionLabel, compact, educationLabel, governmentLabel, grouped, inequalityLabel, sustainabilityLabel } from "../ui/format";
  import Icon from "../ui/Icon.svelte";
  import Num from "./Num.svelte";

  const world = $derived(game.state!);
  const nation = $derived(world.nations.find((n) => n.id === game.selectedNationId) ?? null);
  const def = $derived(nation ? nationDef(baseContent, nation.id) : null);
  const regions = $derived(nation ? nationRegions(world, baseContent, nation.id) : []);
  const extant = $derived(!!nation && isExtant(nation));
  /** The capital city, or the region's name once the nation has had to move its capital. */
  const capitalName = $derived.by(() => {
    if (!nation || !def || !nation.capitalId) return "";
    return nation.capitalId === homeCapital(baseContent, nation.id).id ? def.capital.name : regionDef(baseContent, nation.capitalId).name;
  });
  const breakawayOf = $derived(nation ? (world.breakaways[nation.id] ?? null) : null);
  const breakaways = $derived(nation ? Object.entries(world.breakaways).filter(([, parent]) => parent === nation.id).map(([child]) => child) : []);
  const me = $derived(game.playerFactionId);

  /** Regions the nation claims but doesn't hold, grouped by the nation that holds them now. */
  const claimed = $derived.by(() => {
    if (!nation) return [];
    const out = nationClaims(world, baseContent, nation.id)
      .filter((c) => regionOwner(world, c.region) !== nation.id && claimHeld(world, c))
      .map((c) => ({ region: regionDef(baseContent, c.region), holder: regionOwner(world, c.region), hostile: claimHostile(world, baseContent, c) }));
    const seen = new Set<string>();
    return out.filter((c) => !seen.has(c.region.id) && seen.add(c.region.id)).sort((a, b) => nationName(a.holder).localeCompare(nationName(b.holder)));
  });

  type Tab = "priorities" | "regions" | "opinion" | "relations" | null;
  let tab = $state<Tab>(null);

  const color = (id: string | null) => (id === null || id === UNDECIDED ? "#566573" : factionDef(baseContent, id).color);
  /** How far the executive's holder is from consolidated control (Terra Invicta). */
  function consolidated(n: NonNullable<typeof nation>): string {
    const left = consolidationDaysLeft(world, baseContent, n);
    return left === 0 ? "consolidated" : `consolidates in ${left} day${left === 1 ? "" : "s"}`;
  }
  const name = (id: string) => (id === UNDECIDED ? "Undecided" : factionDef(baseContent, id).name);

  const opinion = $derived(
    nation
      ? Object.entries(nation.publicOpinion)
          .map(([id, share]) => ({ id, share, name: name(id), color: color(id) }))
          .sort((a, b) => b.share - a.share)
      : [],
  );

  /** Donut segments: [offset, length] along a circle of circumference 1. */
  const donut = $derived.by(() => {
    let start = 0;
    return opinion.map((o) => {
      const seg = { ...o, start };
      start += o.share;
      return seg;
    });
  });

  /** Our share of the nation's outputs: the fraction of its CPs we hold and that work. */
  const myShare = $derived(
    nation && me ? nation.controlPoints.filter((cp, i) => cp.owner === me && !isDisabled(world, nation, i)).length / nation.controlPoints.length : 0,
  );
  const executive = $derived(nation?.controlPoints[0]?.owner ?? null);

  const flows = $derived(nation ? priorityFlows(world, baseContent, nation) : {});
  /** Only the priorities the nation can invest in now: Boost appears once it has a space program, and so on. */
  const priorities = $derived(nation ? baseContent.priorities.filter((p) => priorityAvailable(world, baseContent, nation, p.id)) : []);
  const holdsCp = $derived(!!nation && !!me && nation.controlPoints.some((cp) => cp.owner === me));
  const ourWeights = $derived.by(() => {
    if (!nation || !me) return {};
    const custom = world.factions.find((f) => f.id === me)?.priorityWeights[nation.id];
    return custom && Object.values(custom).some((w) => w > 0) ? custom : baseContent.rules.defaultPriorities;
  });

  function setWeight(id: string, value: number) {
    if (!nation || !me) return;
    const weights = { ...ourWeights, [id]: Math.max(0, Math.min(3, Math.round(value))) };
    void game.command({ type: "setPriorityWeights", factionId: me, nationId: nation.id, weights });
  }

  function abandon(index: number) {
    if (!nation || !me) return;
    void game.command({ type: "abandonControlPoint", factionId: me, nationId: nation.id, cpIndex: index });
  }

  const days = (until: number) => Math.max(0, Math.round(until - world.dayIndex));

  const armies = $derived(nation ? nationArmies(world, nation.id) : []);
  const climate = $derived(nation && isExtant(nation) ? nationClimate(world, baseContent, nation) : null);
  /** Yearly GDP change, climate damage included. */
  const growth = $derived(nation ? annualGdpGrowth(world, baseContent, nation) : null);
  const wars = $derived(nation ? warsOf(world, nation.id) : []);
  const nationName = (id: string) => nationDef(baseContent, id).name;
  const allies = $derived(nation ? alliesOf(world, nation.id) : []);
  const federation = $derived(nation ? federationOf(world, nation.id) : undefined);
  const federationTitle = $derived(
    federation && nation
      ? federation.leaderId === nation.id
        ? `${nationName(nation.id)} leads the ${federation.name}`
        : `${nationName(nation.id)} is a member of the ${federation.name}, led by ${nationName(federation.leaderId)}`
      : "",
  );
  const outputs = $derived(nation ? sharedOutputs(world, baseContent, nation) : { annualFunding: 0, annualBoost: 0 });
  const rivals = $derived(nation ? rivalsOf(world, nation.id) : []);
  const enemies = $derived(
    nation
      ? wars.flatMap((w) => {
          const side = sideOf(w, nation.id)!;
          return w[side === "attackers" ? "defenders" : "attackers"];
        })
      : [],
  );

  /** Foreign Relations opens for a nation whose working executive we hold. */
  const manage = $derived(nation && me ? checkExecutive(world, baseContent, me, nation.id) : { ok: false as const, reason: "We don't hold its executive" });

  /** Nuclear weapons we can fire: the nation's, while we hold its working executive. */
  const nukeControl = $derived(!!nation && extant && nation.nukes > 0 && manage.ok);
  const strikeTargets = $derived(nukeControl && nation ? nukeTargets(world, baseContent, nation.id) : []);
  const nukeTitle = $derived.by(() => {
    if (!nation) return "";
    const warheads = `${nation.nukes} nuclear weapon${nation.nukes === 1 ? "" : "s"}`;
    if (enemies.length === 0) return `Nuclear strike (${warheads}): only possible at war`;
    if (strikeTargets.length === 0) return `Nuclear strike (${warheads}): no enemy region in reach`;
    return `Nuclear strike (${warheads}): choose a region of a nation we are at war with`;
  });

  function aimNukes() {
    if (!nation || strikeTargets.length === 0) return;
    game.globePick = null;
    game.armyMoveMode = false;
    game.nukePick = game.nukePick?.nationId === nation.id ? null : { nationId: nation.id, targets: new Set(strikeTargets) };
  }

  function cpTitle(index: number): string {
    if (!nation) return "";
    const cp = nation.controlPoints[index]!;
    const parts = [controlPointType(nation, index), cp.owner ? factionDef(baseContent, cp.owner).name : "Uncontrolled"];
    if (isDisabled(world, nation, index)) parts.push(`cracked down for ${days(cp.disabledUntil)} days`);
    if (isDefended(world, nation, index)) parts.push(`defended for ${days(cp.defendedUntil)} days`);
    parts.push(`capacity cost ${controlPointCapacityCost(baseContent, nation).toFixed(1)}`);
    return parts.join(" · ");
  }
</script>

{#snippet flagLink(id: string)}
  <button class="link" title={nationName(id)} onclick={() => (game.selectedNationId = id)}><Flag nationId={id} height={14} /></button>
{/snippet}

{#if nation && def}
  <section class="panel nation">
    <header class="title">
      <Flag nationId={def.id} height={18} />
      <h2>{def.name}</h2>
      {#if nukeControl}
        <button class="nuke-button" class:armed={game.nukePick?.nationId === nation.id} disabled={strikeTargets.length === 0} title={nukeTitle} aria-label="Nuclear strike" onclick={aimNukes}>
          <Icon name="nuke" size={16} color="#ff4a3a" />
        </button>
      {/if}
      <Emblem faction={executive} size={26} title={executive ? `Executive: ${name(executive)} (${consolidated(nation)})` : "No faction holds the executive"} />
      <button class="icon-button" title="Close" onclick={() => (game.selectedNationId = null)}><Icon name="close" size={16} /></button>
    </header>
    {#if extant}
    <div class="capital">
      {#if breakawayOf}<span class="breakaway small">Broke away from {@render flagLink(breakawayOf)} {nationName(breakawayOf)}</span>
      {:else if federation}<span class="federation small" title={federationTitle}><FederationFlag name={federation.name} height={12} /> {federation.name}{#if federation.leaderId === nation.id} <Icon name="leader" size={12} color="var(--gold)" />{/if}</span>{/if}
      <span class="capital-name">{capitalName.toUpperCase()} <Icon name="democracy" size={14} /></span>
    </div>

    <div class="cps">
      {#each nation.controlPoints as cp, i (i)}
        <div class="cp cell" class:disabled={isDisabled(world, nation, i)} class:mine={cp.owner !== null && cp.owner === me} title={cpTitle(i)}>
          <Emblem faction={cp.owner} size={40} title={cpTitle(i)} />
          <span class="badges">
            {#if i === 0}<span class="badge gold"><Icon name="executive" size={12} /></span>{/if}
            {#if isDefended(world, nation, i)}<span class="badge"><Icon name="defended" size={12} color="#8fd18a" /></span>{/if}
            {#if isDisabled(world, nation, i)}<span class="badge"><Icon name="crackdown" size={12} color="#ff6a5a" /></span>{/if}
          </span>
          <span class="type">{controlPointType(nation, i)}</span>
          {#if cp.owner !== null && cp.owner === me}
            <button class="abandon" title="Abandon this control point to free capacity" onclick={() => abandon(i)}>×</button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="grid">
      <div class="block">
        <h3 class="section-title">Overview</h3>
        <div class="rows cell">
          <div>
            <Icon name="democracy" />{governmentLabel(nation.democracy)} ({nation.democracy.toFixed(1)})
            <span class="muted small" title="Corruption: the share of IP the elites want in Spoils"><Icon name="corruption" size={12} color="#cfd9e2" /> <Num breakdown={corruption(baseContent, nation)} digits={2} /></span>
          </div>
          <div>
            <Icon name="unrest" color={nation.unrest >= 4.5 ? "#ff6a5a" : undefined} />{unrestBand(nation.unrest)} ({nation.unrest.toFixed(1)})
            <span class="muted small">→ <Num breakdown={unrestTarget(world, baseContent, nation)} digits={1} /></span>
          </div>
          <div>
            <Icon name="gdp" />GDP: ${grouped(nation.gdp)} Bn
            {#if growth}<span class="small" class:good={growth.value >= 0} class:bad={growth.value < 0}><Num breakdown={growth} digits={2} signed percent suffix="/yr" /></span>{/if}
          </div>
        </div>
      </div>
      <div class="block">
        <h3 class="section-title">
          Military
          <span class="title-icons">
            {#if enemies.length > 0}
              <Icon name="war" color="#ff6a5a" title="At war with {[...new Set(enemies)].map(nationName).join(', ')}" />
            {:else}
              <Icon name="peace" color="#e8f0f4" title="At peace" />
            {/if}
            {#if nation.spaceProgram}
              <Icon name="space" color="var(--accent)" title="Space program ({nation.launchSites.length} launch complex{nation.launchSites.length === 1 ? "" : "es"})" />
            {:else}
              <Icon name="space" color="var(--muted)" title="No space program" />
            {/if}
          </span>
        </h3>
        <div class="rows cell">
          <div><Icon name="miltech" color="var(--gold)" />Miltech ({nation.militaryTech.toFixed(2)})</div>
          <div>
            <Icon name="army" />{armies.length} armies <Icon name="navy" />{navyCount(world, nation.id)} navies
          </div>
          <div>
            <Icon name="nuke" color={nation.nukes > 0 ? "#f0c040" : undefined} />{nation.nukes}
          </div>
        </div>
      </div>
      <div class="block">
        <h3 class="section-title">Development</h3>
        <table class="dev cell">
          <thead>
            <tr>
              <th></th>
              <th title="Nation"><Icon name="nation" size={14} /></th>
              <th title="Our share">{#if me}<Emblem faction={me} size={18} />{/if}</th>
            </tr>
          </thead>
          <tbody>
            <tr title="Investment points per month">
              <td><Icon name="investment" color="#cfd9e2" /></td>
              <td><Num breakdown={monthlyInvestment(world, baseContent, nation)} /></td>
              <td>{(monthlyInvestment(world, baseContent, nation).value * myShare).toFixed(1)}</td>
            </tr>
            <tr title={federation ? `Funding: money per year, this nation's share of the ${federation.name}'s pool (its own: ${compact(nation.annualFunding)})` : "Funding: money per year"}>
              <td><Icon name="money" /></td>
              <td>{compact(outputs.annualFunding)}</td>
              <td>{compact(outputs.annualFunding * myShare)}</td>
            </tr>
            <tr title={federation ? `Boost per year, this nation's share of the ${federation.name}'s pool (its own: ${nation.annualBoost.toFixed(2)})` : "Boost per year"}>
              <td><Icon name="boost" /></td>
              <td>{outputs.annualBoost.toFixed(2)}</td>
              <td>{(outputs.annualBoost * myShare).toFixed(2)}</td>
            </tr>
            <tr title="Research per month, shared between the holders of the control points">
              <td><Icon name="research" /></td>
              <td><Num breakdown={nationResearch(baseContent, nation)} digits={0} /></td>
              <td>{Math.round(nationResearch(baseContent, nation).value * myShare)}</td>
            </tr>
            <tr title="Mission Control">
              <td><Icon name="missionControl" /></td>
              <td>{nation.missionControl}</td>
              <td>{(nation.missionControl * myShare).toFixed(1)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="block">
        <h3 class="section-title">People <span class="pop"><Icon name="population" size={14} color="var(--gold)" />{nation.population.toFixed(1)} Mn</span></h3>
        <div class="people cell">
          <div class="rows">
            <div title="GDP per capita"><Icon name="person" />${grouped(gdpPerCapita(nation) * 1000)}</div>
            <div title="Education"><Icon name="education" color="#6fb6e8" />{educationLabel(nation.education)} ({nation.education.toFixed(1)})</div>
            <div title="Inequality"><Icon name="inequality" color="#e8d36f" />{inequalityLabel(nation.inequality)} ({nation.inequality.toFixed(1)})</div>
            <div title="Cohesion"><Icon name="cohesion" color="#e88f6f" />{cohesionLabel(nation.cohesion)} ({nation.cohesion.toFixed(1)})</div>
            {#if climate}
              <div title="Sustainability {climate.sustainability.toFixed(2)}: Pollution Multiplier {nation.pollution.toFixed(3)}, emitting {(climate.emissions / 1e6).toFixed(0)} Mt CO₂ a year. Ecological vulnerability ×{climate.vulnerability.economy.toFixed(2)}.">
                <Icon name="sustainability" color="var(--good)" />{sustainabilityLabel(climate.sustainability)} ({climate.sustainability.toFixed(2)})
              </div>
            {/if}
          </div>
          <button class="donut" title="Public opinion" onclick={() => (tab = tab === "opinion" ? null : "opinion")}>
            <svg viewBox="0 0 80 80" width="64" height="64">
              {#each donut as seg (seg.id)}
                <circle
                  cx="40"
                  cy="40"
                  r="30"
                  fill="none"
                  stroke={seg.color}
                  stroke-width="12"
                  pathLength="1"
                  stroke-dasharray="{seg.share} 1"
                  stroke-dashoffset={-seg.start}
                  transform="rotate(-90 40 40)"
                />
              {/each}
            </svg>
            <span>Public<br />Opinion</span>
          </button>
        </div>
      </div>
    </div>

    <nav class="tabs">
      <button class:active={tab === "priorities"} onclick={() => (tab = tab === "priorities" ? null : "priorities")}>Priorities</button>
      <button class:active={tab === "regions"} onclick={() => (tab = tab === "regions" ? null : "regions")}>{regions.length} Region{regions.length === 1 ? "" : "s"}</button>
      <button class:active={tab === "opinion"} onclick={() => (tab = tab === "opinion" ? null : "opinion")}>Opinion</button>
      <button class:active={tab === "relations"} class:alert={wars.length > 0} onclick={() => (tab = tab === "relations" ? null : "relations")}>Relations</button>
    </nav>

    {#if tab === "priorities"}
      <div class="tab-body">
        <table class="priorities">
          <thead>
            <tr><th>Priority</th><th>IP/mo</th><th>Progress</th>{#if holdsCp}<th>Spending</th>{/if}</tr>
          </thead>
          <tbody>
            {#each priorities as p (p.id)}
              <tr>
                <td>{p.name}</td>
                <td>{(flows[p.id] ?? 0).toFixed(2)}</td>
                <td>
                  <span class="progress"><span style:width="{Math.min(1, (nation.ipProgress[p.id] ?? 0) / p.cost) * 100}%"></span></span>
                  {(nation.ipProgress[p.id] ?? 0).toFixed(1)}/{p.cost}
                </td>
                {#if holdsCp}
                  <td>
                    <span class="pips">
                      {#each [1, 2, 3] as level (level)}
                        <button
                          class="pip"
                          class:on={(ourWeights[p.id] ?? 0) >= level}
                          title="{level} pip{level > 1 ? 's' : ''}"
                          onclick={() => setWeight(p.id, (ourWeights[p.id] ?? 0) === level ? level - 1 : level)}
                          aria-label="Set {p.name} to {level}"
                        ></button>
                      {/each}
                    </span>
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if tab === "regions"}
      <div class="tab-body">
        <table class="regions">
          <tbody>
            {#each regions as r (r.id)}
              {@const occupied = occupiedShare(world, r.id)}
              {@const eco = baseContent.climate.regions[r.id]}
              {@const here = world.armies.filter((a) => !a.move && a.regionId === r.id).length}
              {@const site = nation.launchSites.find((s) => s.regionId === r.id)}
              <tr>
                <td class="name">{r.name}</td>
                <td class="occupied bad small" title={occupied > 0 ? `${Math.round(occupied * 100)}% occupied` : undefined}>{#if occupied > 0}{Math.round(occupied * 100)}%{/if}</td>
                <td>
                  {#if r.id === nation.capitalId}<Icon name="executive" size={12} color="var(--gold)" title="Capital" />{/if}
                  {#if eco?.vulnerable}<Icon name="climate" size={12} color="#ff9a5a" title="Ecologically vulnerable ({Math.round(eco.vulnerable * 100)}% of its people): twice the economic harm from climate change" />{/if}
                  {#if eco?.protected}<Icon name="sustainability" size={12} color="var(--good)" title="Ecologically protected ({Math.round(eco.protected * 100)}% of its people): no economic harm from climate change" />{/if}
                  {#if eco?.oil}<Icon name="oil" size={12} color="#c9a86a" title="Oil{eco.oil > 1 ? ` (${eco.oil} fields)` : ""}: more emissions, and more pollution from Spoils" />{/if}
                  {#if eco?.mining}<Icon name="mining" size={12} color="#a8b4bd" title="Mining{eco.mining > 1 ? ` (${eco.mining} areas)` : ""}: more pollution from Spoils" />{/if}
                  {#if hostileClaim(world, baseContent, nation.id, r.id)}<Icon name="hostile" size={12} color="var(--bad)" title="Held under a hostile claim: its people don't want to belong to {def.name}. It adds unrest and holds cohesion down until Government and Unity investment reconciles it." />{/if}
                </td>
                <td>{#if site}<Icon name="launchComplex" size={13} color="var(--accent)" title={site.name} />{/if}</td>
                <td>{#if here > 0}<Icon name="army" size={12} /> {here}{/if}</td>
                <td>
                  <span class="claimants">
                    {#each claimsOn(world, baseContent, r.id) as c (c.nation)}
                      {@const hostile = claimHostile(world, baseContent, c)}
                      <button class="claimant" class:hostile title="Claimed by {nationName(c.nation)}{hostile ? ' (hostile)' : ''}" onclick={() => (game.selectedNationId = c.nation)}><Flag nationId={c.nation} height={11} /></button>
                    {/each}
                  </span>
                </td>
                <td class="num muted">{r.population.toFixed(1)} Mn</td>
              </tr>
            {/each}
            {#each claimed as c (c.region.id)}
              {@const here = world.armies.filter((a) => !a.move && a.regionId === c.region.id).length}
              <tr
                class="claimed"
                class:hostile-claim={c.hostile}
                title="Claim: {def.name} claims {c.region.name}, held by {nationName(c.holder)}.{c.hostile ? ` The claim is hostile: its people don't want to belong to ${def.name}.` : ''}"
              >
                <td class="name">{c.region.name}</td>
                <td class="occupied"></td>
                <td>{#if c.hostile}<Icon name="hostile" size={12} color="#e98f86" />{/if}</td>
                <td></td>
                <td>{#if here > 0}<Icon name="army" size={12} /> {here}{/if}</td>
                <td>
                  <span class="claimants">
                    <button class="claimant" title="Held by {nationName(c.holder)}" onclick={() => (game.selectedNationId = c.holder)}><Flag nationId={c.holder} height={11} /></button>
                  </span>
                </td>
                <td class="num">{c.region.population.toFixed(1)} Mn</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if tab === "relations"}
      <div class="tab-body relations">
        {#each wars as w (w.id)}
          <div class="war">
            <strong><Icon name="war" size={13} color="#ff6a5a" /> {warName(baseContent, w)}</strong>
            <div class="sides small">
              <span>Attackers</span><span class="side">{#each w.attackers as id (id)}{@render flagLink(id)}{/each}</span>
              <span>Defenders</span><span class="side">{#each w.defenders as id (id)}{@render flagLink(id)}{/each}</span>
            </div>
          </div>
        {/each}
        <h4 class="section-title">
          <span class="rel-title"><Icon name="alliance" size={14} color="var(--good)" />Allies</span>
          <button class="manage" disabled={!manage.ok} title={manage.ok ? `Propose alliances, neutrality or rivalries for ${def.name}` : manage.reason} onclick={() => (game.foreignRelationsNationId = nation.id)}>Manage Relations</button>
        </h4>
        <div class="rel">
          {#each allies as id (id)}{@render flagLink(id)}{:else}<span class="muted small">None</span>{/each}
        </div>
        <h4 class="section-title"><span class="rel-title"><Icon name="rival" size={14} color="#ff9a5a" />Rivals</span></h4>
        <div class="rel">
          {#each rivals as id (id)}{@render flagLink(id)}{:else}<span class="muted small">None</span>{/each}
        </div>
        {#if breakawayOf}
          <h4 class="section-title"><span class="rel-title"><Icon name="nation" size={14} color="#ff9a5a" />Breakaway of</span></h4>
          <div class="rel">{@render flagLink(breakawayOf)} <span class="small">{nationName(breakawayOf)}</span></div>
        {/if}
        {#if breakaways.length > 0}
          <h4 class="section-title"><span class="rel-title"><Icon name="nation" size={14} color="#ff9a5a" />Breakaways</span></h4>
          <div class="rel">{#each breakaways as id (id)}{@render flagLink(id)}{/each}</div>
        {/if}
      </div>
    {:else if tab === "opinion"}
      <div class="tab-body">
        {#each opinion as o (o.id)}
          <div class="bar-row">
            <span class="label"><span class="swatch" style:background={o.color}></span>{o.name}</span>
            <span class="bar"><span style:width="{o.share * 100}%" style:background={o.color}></span></span>
            <span class="pct">{(o.share * 100).toFixed(1)}%</span>
          </div>
        {/each}
      </div>
    {/if}
    {:else}
      {@const home = homeCapital(baseContent, nation.id)}
      {@const holder = regionOwner(world, home.id)}
      {@const homeClaim = nationClaims(world, baseContent, nation.id).find((c) => c.region === home.id)}
      {@const waiting = homeClaim?.project && !claimHeld(world, homeClaim) ? projectDef(baseContent, homeClaim.project).name : null}
      <div class="gone">
        {#if def.breakaway}
          <p>{def.name} has no state of its own: its people want independence for {home.name}, now held by <button class="inline-link" onclick={() => (game.selectedNationId = holder)}><Flag nationId={holder} height={12} /> {nationName(holder)}</button>.</p>
        {:else}
          <p>{def.name} no longer exists. Its home, {home.name}, is held by <button class="inline-link" onclick={() => (game.selectedNationId = holder)}><Flag nationId={holder} height={12} /> {nationName(holder)}</button>.</p>
        {/if}
        {#if waiting}
          <p class="muted small">Its cause has no hold yet: it takes the {waiting} project, completed by any faction, to give {def.name} its claim on {home.name}.</p>
        {:else}
          <p class="muted small">It can {def.breakaway ? "win independence" : "return"} if {nationName(holder)} grants it, if unrest there lets it break away (Increase Unrest helps), or if an army at war with {nationName(holder)} annexes {home.name} to {def.breakaway ? "free" : "restore"} it.</p>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .nation {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    overflow-y: auto;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border-soft);
  }
  /* Red and round, beside the Executive emblem, as a warning of what it does. */
  .nuke-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1.5px solid #ff4a3a;
    border-radius: 50%;
    background: rgba(255, 74, 58, 0.12);
  }
  .nuke-button:hover:not(:disabled),
  .nuke-button.armed {
    background: rgba(255, 74, 58, 0.32);
    box-shadow: 0 0 6px rgba(255, 74, 58, 0.7);
  }
  .nuke-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .title h2 {
    flex: 1;
    margin: 0;
    font-size: 1.3em;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gone {
    padding: 10px 12px;
  }
  .gone p {
    margin: 0 0 8px;
  }
  .breakaway {
    color: #ff9a5a;
  }
  .federation {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .capital {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 10px;
    font-size: 0.95em;
    color: var(--header-text);
    background: rgba(56, 72, 88, 0.35);
  }
  .capital-name {
    margin-left: auto;
  }
  .cps {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 6px;
  }
  .cp {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 2px 2px;
    min-width: 0;
  }
  .cp.mine {
    border-color: var(--border-strong);
  }
  .cp.disabled :global(.emblem) {
    opacity: 0.4;
  }
  .badges {
    position: absolute;
    top: 2px;
    right: 2px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .badge {
    display: inline-flex;
    padding: 1px;
    background: rgba(10, 16, 22, 0.85);
    border: 1px solid var(--border-soft);
  }
  .gold {
    color: var(--gold);
  }
  .type {
    font-size: 0.68em;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .abandon {
    position: absolute;
    top: 1px;
    left: 2px;
    display: none;
    padding: 0 4px;
    line-height: 1.1;
    font-size: 0.85em;
  }
  .cp:hover .abandon {
    display: block;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 0 6px 6px;
  }
  .block {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    flex: 1;
  }
  .rows > div {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }
  .small {
    font-size: 0.82em;
  }
  .dev {
    width: 100%;
    border-collapse: collapse;
    flex: 1;
  }
  .dev th,
  .dev td {
    padding: 2px 6px;
    border: 1px solid var(--border-soft);
    text-align: center;
  }
  .dev th {
    font-weight: 400;
  }
  .pop {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    text-transform: none;
  }
  .people {
    display: flex;
    flex: 1;
  }
  .people .rows {
    flex: 1;
    min-width: 0;
    gap: 5px;
  }
  .people .rows > div {
    flex-wrap: nowrap;
    white-space: nowrap;
    overflow: hidden;
  }
  .donut {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px;
    font-size: 0.8em;
    text-align: center;
    line-height: 1.1;
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid var(--border-soft);
  }
  .tabs button {
    border: none;
    border-right: 1px solid var(--border-soft);
    background: rgba(48, 64, 80, 0.55);
    padding: 5px 4px;
  }
  .tabs button.alert {
    color: #ff8a7a;
  }
  .tabs button.active {
    background: var(--button-hover);
    color: var(--accent);
  }
  .tab-body {
    padding: 6px 8px;
    border-top: 1px solid var(--border-soft);
  }
  .priorities {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92em;
  }
  .priorities th {
    font-weight: 400;
    color: var(--accent);
    text-align: right;
  }
  .priorities th:first-child,
  .priorities td:first-child {
    text-align: left;
  }
  .priorities td {
    text-align: right;
    padding: 1px 0 1px 6px;
    white-space: nowrap;
  }
  .progress {
    display: inline-block;
    width: 34px;
    height: 5px;
    margin-right: 4px;
    background: #24323f;
    vertical-align: middle;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .pips {
    display: inline-flex;
    gap: 2px;
  }
  .pip {
    width: 14px;
    height: 10px;
    padding: 0;
    background: #24323f;
    border: 1px solid var(--border);
  }
  .pip.on {
    background: var(--good);
    border-color: var(--good);
  }
  .regions {
    width: 100%;
    border-collapse: collapse;
  }
  .regions td {
    padding: 1px 4px;
    text-align: center;
    vertical-align: middle;
    white-space: nowrap;
  }
  .regions .name {
    width: 100%;
    text-align: left;
    white-space: normal;
  }
  .regions .num {
    text-align: right;
  }
  /* Its own column, right-aligned, so the percentages line up. */
  .regions .occupied {
    min-width: 3em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .title-icons {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  /* A wrapper, so the cell stays a table cell and centres the flags in the row. */
  .claimants {
    display: flex;
    gap: 2px;
    align-items: center;
    justify-content: flex-end;
  }
  .claimant {
    all: unset;
    cursor: pointer;
    line-height: 0;
    outline: 1px solid transparent;
  }
  .claimant.hostile {
    outline-color: var(--bad);
  }
  .claimed {
    color: #9aa6b2;
  }
  .claimed.hostile-claim {
    color: #e98f86;
  }
  .relations {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .war {
    display: flex;
    flex-direction: column;
    padding: 3px 6px;
    border: 1px solid #6a3a36;
    background: rgba(90, 30, 28, 0.25);
  }
  .war strong {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 400;
    color: #ffb0a4;
  }
  .rel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 0 6px 4px;
  }
  .rel-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* Label column, then flags, so both sides' flags start in line. */
  .sides {
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: center;
    column-gap: 8px;
    row-gap: 2px;
  }
  .side {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .manage {
    padding: 0 8px;
    font-size: 0.85em;
    text-transform: uppercase;
  }
  .link {
    display: inline-flex;
    padding: 2px;
    background: transparent;
    border-color: transparent;
  }
  .link:hover {
    border-color: var(--accent);
  }
  /* A nation named in running text: inline, so its flag centres on the text like an icon. */
  .inline-link {
    display: inline;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-decoration: underline dotted var(--muted);
    text-underline-offset: 3px;
  }
  .inline-link:hover {
    color: var(--accent);
  }
  .inline-link :global(.flag) {
    margin-left: 2px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 11em 1fr 3.5em;
    gap: 6px;
    align-items: center;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .swatch {
    flex: none;
    width: 9px;
    height: 9px;
  }
  .bar {
    height: 7px;
    background: #1d2833;
  }
  .bar span {
    display: block;
    height: 100%;
  }
  .pct {
    text-align: right;
  }
</style>
