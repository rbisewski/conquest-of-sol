<script lang="ts">
  // A hab module's hover card, after Terra Invicta's: name; tier, crew and mass; monthly incomes
  // and bonuses; monthly support costs; monthly crew support; its description. Follows the
  // pointer, kept on screen.
  import type { ModuleFacts } from "../moduleInfo";
  import Icon from "../ui/Icon.svelte";

  let { facts, x, y, status = null }: { facts: ModuleFacts; x: number; y: number; status?: string | null } = $props();
  let cardWidth = $state(0);
  let cardHeight = $state(0);
  const left = $derived(x + 16 + cardWidth > window.innerWidth ? x - 12 - cardWidth : x + 16);
  const top = $derived(Math.max(4, Math.min(window.innerHeight - cardHeight - 4, y + 14)));
  const amount = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : +v.toFixed(3) + "");
</script>

<div class="card panel" bind:clientWidth={cardWidth} bind:clientHeight={cardHeight} style:left="{left}px" style:top="{top}px" role="tooltip">
  <div class="name">{facts.name}</div>
  <div class="muted">Tier {facts.tier} module, {facts.crew.toLocaleString("en-US")} crew, {facts.massTons.toLocaleString("en-US")} tons · {facts.buildDays} days to build</div>
  {#if status}<div class="status">{status}</div>{/if}
  {#if facts.incomes.length > 0 || facts.bonuses.length > 0}
    <div class="head">Monthly incomes and bonuses</div>
    {#if facts.incomes.length > 0}<div class="row">{#each facts.incomes as [r, v] (r)}<span><Icon name={r} size={13} />{amount(v)}</span>{/each}</div>{/if}
    {#each facts.bonuses as line (line)}<div class="bonus">{line}</div>{/each}
  {/if}
  {#if facts.support.length > 0}
    <div class="head">Monthly support costs</div>
    <div class="row">{#each facts.support as [r, v] (r)}<span><Icon name={r} size={13} />{amount(v)}</span>{/each}</div>
  {/if}
  {#if facts.crewSupport.length > 0}
    <div class="head">Monthly crew support</div>
    <div class="row">{#each facts.crewSupport as [r, v] (r)}<span><Icon name={r} size={13} />{amount(v)}</span>{/each}</div>
  {/if}
  {#if facts.summary}<p class="summary">{facts.summary}</p>{/if}
</div>

<style>
  .card {
    position: fixed;
    z-index: 200;
    max-width: 340px;
    padding: 6px 9px 7px;
    font-size: 0.85em;
    line-height: 1.35;
    pointer-events: none;
    background: rgba(12, 18, 26, 0.97);
  }
  .name {
    font-size: 1.08em;
  }
  .status {
    color: var(--accent);
  }
  .head {
    margin-top: 4px;
    color: var(--muted);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }
  .row span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .bonus {
    color: #b9e7a5;
  }
  .summary {
    margin: 6px 0 0;
    color: var(--muted);
  }
</style>
