<script lang="ts">
  // A federation's flag, at the size of a nation's (see Flag.svelte).
  import { federationFlagUrl } from "./federationFlags";

  let { name, height = 14 }: { name: string; height?: number } = $props();

  const url = $derived(federationFlagUrl(name));
</script>

<img class="flag" src={url} alt={name} title={name} width={Math.round((height * 4) / 3)} {height} />

<style>
  .flag {
    display: inline-block;
    flex: none;
    vertical-align: middle;
    object-fit: cover;
    box-shadow: 0 0 0 1px var(--border);
  }
</style>
