<script lang="ts">
  // A nation's current flag, or its code if it has none.
  import { baseContent } from "../../content/index";
  import { flagUrl } from "./flags";

  let { nationId, height = 14 }: { nationId: string; height?: number } = $props();

  const url = $derived(flagUrl(nationId));
  const name = $derived(baseContent.nations.find((n) => n.id === nationId)?.name ?? nationId.toUpperCase());
</script>

{#if url}
  <img class="flag" src={url} alt={name} title={name} width={Math.round((height * 4) / 3)} {height} />
{:else}
  <span class="flag code" title={name} style:height="{height}px" style:font-size="{Math.round(height * 0.7)}px">{nationId.toUpperCase()}</span>
{/if}

<style>
  .flag {
    display: inline-block;
    flex: none;
    vertical-align: middle;
    object-fit: cover;
    box-shadow: 0 0 0 1px var(--border);
  }
  .code {
    display: inline-flex;
    align-items: center;
    padding: 0 3px;
    color: var(--accent);
    background: var(--cell);
  }
</style>
