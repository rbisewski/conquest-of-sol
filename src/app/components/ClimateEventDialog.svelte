<script lang="ts">
  // Terra Invicta's climate events that need an answer: Environmental Degradation and Wet Bulb
  // Disasters go to the faction running the struck nation, Global Crop Failures to everyone.
  // The clock waits until we answer.
  import { baseContent } from "../../content/index";
  import { climateOptions, nationDef, populationShare, regionDef, type ClimateOption, type ClimateOptionState } from "../../sim/index";
  import { game } from "../game.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";

  const world = $derived(game.state!);
  const choice = $derived(world.climateChoices.find((c) => c.factionId === game.playerFactionId) ?? null);
  const region = $derived(choice?.regionId ? regionDef(baseContent, choice.regionId) : null);
  const nationName = $derived(choice?.nationId ? nationDef(baseContent, choice.nationId).name : "");
  const options = $derived(choice && game.playerFactionId ? climateOptions(world, baseContent, game.playerFactionId, choice) : []);
  const r = baseContent.rules.climate.choices;
  const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;
  /** People the region holds now, in millions. */
  const millions = $derived(choice?.regionId && choice.nationId ? world.nations.find((n) => n.id === choice.nationId)!.population * populationShare(world, baseContent, choice.regionId) : 0);

  const TITLES = { degradation: "Environmental Degradation", wetBulb: "Wet Bulb Disaster", cropFailures: "Global Crop Failures" };

  const story = $derived.by(() => {
    if (!choice || !region) return "The drop in global temperature has ruined harvests the world over. Famine grips every nation, and the networks that move food are breaking down.";
    if (choice.event === "wetBulb")
      return `A long heat wave with crushing humidity has settled over ${region.name}, ${nationName}. It is too hot and humid for sweat to cool the body: only those with air conditioning are safe, and people are dying.`;
    return `The environment of ${region.name}, ${nationName}, has passed a tipping point. Soils wash away and growing seasons shorten; farming is failing, and with it the livelihoods of millions and the economy of ${nationName}.`;
  });

  /** What each answer is and does, in Terra Invicta's words where it has them. */
  function describe(option: ClimateOption): { name: string; text: string } {
    const place = region?.name ?? "";
    if (choice?.event === "cropFailures")
      return { name: "Endure", text: `This is beyond our means to address. Every nation has lost ${pct(r.cropFailures.gdp)} of its GDP and ${r.cropFailures.cohesion} cohesion, and up to ${pct(r.cropFailures.population)} of its people (fewer in rich nations).` };
    if (choice?.event === "wetBulb") {
      if (option === "assist")
        return { name: "Send aid", text: `Send teams in with air conditioners and other help. Deaths in ${place} are halved (${pct(r.wetBulb.assist.population)} of its people, fewer in rich nations), and our support in ${nationName} grows.` };
      return { name: "Do nothing", text: `Victims of climate change. ${pct(r.wetBulb.population)} of the people of ${place} die (fewer in rich nations).` };
    }
    const d = r.degradation;
    switch (option) {
      case "subsidize":
        return { name: "Subsidize", text: `Fund subsidies to aid and relocate the people affected. ${place} loses ${pct(d.subsidize.recession)} of its economy, and our support in ${nationName} grows.` };
      case "recruit":
        return { name: "Recruit", text: `People with few prospects make ripe targets for recruitment. ${place} loses ${pct(d.recruit.recession)} of its economy, but ${nationName} grows more cohesive and our support there grows a lot. Extremist factions only.` };
      case "loot":
        return { name: "Loot", text: `Loot them for everything they've got. ${place} loses ${pct(d.loot.recession)} of its economy; ${nationName} gains ${d.loot.unrest} unrest and inequality, and loses education. Factions out for profit only.` };
      default:
        return { name: "Let them cope", text: `They'll just have to deal with it the best they can. ${place} loses ${pct(d.ignore.recession)} of its economy, ${nationName} gains ${d.ignore.unrest} unrest, and our support there falls.` };
    }
  }

  const RESOURCES = ["money", "influence", "ops"] as const;
  const bill = (o: ClimateOptionState) => RESOURCES.filter((k) => o.cost[k]).map((k) => ({ resource: k, amount: o.cost[k]! }));

  function answer(option: ClimateOption) {
    if (!choice || !game.playerFactionId) return;
    void game.command({ type: "chooseClimateOption", factionId: game.playerFactionId, choiceId: choice.id, option });
  }
</script>

{#if choice}
  <div class="overlay">
    <section class="panel sheet" aria-label={TITLES[choice.event]}>
      <header>
        {#if choice.nationId}<Flag nationId={choice.nationId} height={30} />{:else}<Icon name="climate" size={26} color="#6fb6e8" />{/if}
        <h2>{TITLES[choice.event]}</h2>
        <Icon name="climate" size={22} color={choice.event === "cropFailures" ? "#6fb6e8" : "#ff9a5a"} />
      </header>
      <p class="story">
        {story}
        {#if region}<span class="muted small">{region.name}: about {millions.toFixed(1)} million people.</span>{/if}
      </p>
      <div class="rows">
        {#each options as o (o.option)}
          {@const info = describe(o.option)}
          <button class="kind" disabled={!o.check.ok} title={o.check.ok ? undefined : o.check.reason} onclick={() => answer(o.option)}>{info.name}</button>
          <div class="text">
            {info.text}
            {#if bill(o).length > 0}
              <span class="bill">
                {#each bill(o) as b (b.resource)}
                  <span class={b.amount < 0 ? "good" : ""}>{b.amount < 0 ? `+${-b.amount}` : b.amount} <Icon name={b.resource} size={14} title={b.resource} /></span>
                {/each}
              </span>
            {/if}
            {#if !o.check.ok}<span class="why">{o.check.reason}.</span>{/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 42px 6px 6px;
    z-index: 31;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 8vh;
    pointer-events: none;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    width: min(760px, 100%);
    max-height: 100%;
    overflow-y: auto;
    pointer-events: auto;
    background: var(--panel-solid);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 12px;
    background: var(--header);
    border-bottom: 1px solid var(--border);
  }
  h2 {
    flex: 1;
    margin: 0;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 1.35em;
    font-weight: 500;
    color: var(--header-text);
  }
  .story {
    margin: 0;
    padding: 10px 14px 4px;
    line-height: 1.45;
  }
  .story .small {
    display: block;
    margin-top: 4px;
  }
  .rows {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 6px 10px;
    padding: 8px;
  }
  .kind {
    align-self: start;
    min-height: 38px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .text {
    align-self: center;
    font-size: 0.88em;
    line-height: 1.35;
  }
  .bill {
    display: inline-flex;
    gap: 10px;
    margin-left: 6px;
    white-space: nowrap;
    font-weight: 600;
  }
  .why {
    margin-left: 4px;
    color: var(--muted);
    font-style: italic;
  }
</style>
