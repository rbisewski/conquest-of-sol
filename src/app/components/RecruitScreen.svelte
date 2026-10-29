<script lang="ts">
  // Recruiting, after Terra Invicta's: this month's candidates (refreshed on the 1st) with their
  // profession, traits, attributes and missions. Hiring costs influence and needs a free seat.
  import { baseContent } from "../../content/index";
  import {
    ATTRIBUTES,
    availableMissions,
    checkHire,
    councilorAge,
    councilSize,
    MISSION_NAMES,
    MISSION_TYPES,
    nationDef,
    professionDef,
    traitDef,
  } from "../../sim/index";
  import { effects, titleCase } from "../councilorEffects";
  import { game } from "../game.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";
  import { attributeColor, attributeIcons, missionIcons } from "../ui/icons";
  import Portrait from "../ui/Portrait.svelte";

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const rules = baseContent.rules;

  function hire(id: string) {
    if (!faction) return;
    void game.command({ type: "hireCouncilor", factionId: faction.id, recruitId: id }).then((r) => {
      // Close once the council is full; the Faction Assets button disappears with it.
      if (r.ok && faction && faction.councilors.length + 1 >= councilSize(world, baseContent, faction)) game.recruitingOpen = false;
    });
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && (game.recruitingOpen = false)} />

{#if faction}
  <div class="overlay">
    <section class="panel sheet">
      <header class="sheet-title">
        <span>Recruiting</span>
        <button class="icon-button flat" title="Close (Esc)" onclick={() => (game.recruitingOpen = false)}><Icon name="close" size={16} /></button>
      </header>
      <p class="summary">
        Council seats: <strong>{faction.councilors.length} / {councilSize(world, baseContent, faction)}</strong> · Hiring costs
        <Icon name="influence" size={14} /><strong>{rules.councilors.hireCost}</strong> influence · New candidates arrive on the 1st of each month.
      </p>
      <div class="cards">
        {#each faction.recruits as c (c.id)}
          {@const check = checkHire(world, baseContent, faction, c.id)}
          {@const missions = availableMissions(baseContent, c)}
          <article class="card">
            <div class="top">
              <Portrait councilor={c} factionId={faction.id} variant="full" scale={1} />
              <div class="who">
                <strong class="name">{c.name}</strong>
                <span class="profession">{professionDef(baseContent, c.professionId).name}</span>
                <span class="muted">Age {councilorAge(world, baseContent, c)}</span>
                <span class="muted"><Flag nationId={c.nationId} height={11} /> {nationDef(baseContent, c.nationId).name}</span>
              </div>
            </div>
            <table class="attributes">
              <tbody>
                <tr>
                  {#each ATTRIBUTES as attr (attr)}
                    {@const Glyph = attributeIcons[attr]}
                    <td title={titleCase(attr)}><span style:color={attributeColor[attr]}><Glyph size={13} strokeWidth={2} /></span></td>
                  {/each}
                </tr>
                <tr class="values">
                  {#each ATTRIBUTES as attr (attr)}<td>{attr === "loyalty" ? c.apparentLoyalty : c.attributes[attr]}</td>{/each}
                </tr>
              </tbody>
            </table>
            <ul class="traits">
              {#each c.traits as id (id)}
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
                <li class="muted none">No notable traits</li>
              {/each}
            </ul>
            <div class="missions">
              {#each MISSION_TYPES.filter((t) => missions.has(t)) as t (t)}
                {@const Glyph = missionIcons[t]}
                <span title={MISSION_NAMES[t]}><Glyph size={14} strokeWidth={1.75} /></span>
              {/each}
            </div>
            <button class="hire" disabled={!check.ok} title={check.ok ? `Hire ${c.name} for ${rules.councilors.hireCost} influence` : check.reason} onclick={() => hire(c.id)}>Hire</button>
          </article>
        {:else}
          <p class="muted">No candidates this month. More arrive on the 1st.</p>
        {/each}
      </div>
    </section>
  </div>
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
    width: min(1300px, 100%);
    max-height: 100%;
    pointer-events: auto;
    background: var(--panel-solid);
  }
  .sheet-title {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
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
  .summary {
    margin: 0;
    padding: 6px 10px;
    color: var(--muted);
  }
  .summary strong {
    color: var(--text);
    font-weight: 400;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 6px;
    padding: 0 6px 6px;
    overflow-y: auto;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--border-soft);
    background: var(--cell);
  }
  .top {
    display: flex;
    gap: 8px;
  }
  .top :global(.full) {
    margin: 0;
    border: 1px solid var(--border);
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name {
    font-weight: 400;
    font-size: 1.1em;
    text-transform: uppercase;
  }
  .profession {
    color: var(--accent);
  }
  .attributes {
    width: 100%;
    border-collapse: collapse;
    text-align: center;
  }
  .attributes td {
    padding: 1px 0;
  }
  .values td {
    font-size: 0.95em;
  }
  .traits {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .trait {
    position: relative;
    padding: 1px 6px;
    border: 1px solid var(--border-soft);
    font-size: 0.85em;
    cursor: help;
  }
  .trait.negative {
    color: #ffb0a4;
  }
  .trait.mixed {
    color: #f0d9a0;
  }
  .none {
    font-size: 0.85em;
  }
  .tip {
    display: none;
    position: absolute;
    left: 0;
    top: 100%;
    z-index: 5;
    width: 240px;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
    padding: 6px 8px;
    color: var(--text);
    background: var(--panel-solid);
  }
  .trait:hover .tip {
    display: flex;
  }
  .missions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--muted);
  }
  .hire {
    margin-top: auto;
    padding: 5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .good {
    color: var(--good);
  }
  .bad {
    color: #ff8a7a;
  }
</style>
