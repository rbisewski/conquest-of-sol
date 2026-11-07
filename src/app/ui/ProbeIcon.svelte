<script lang="ts">
  // The prospecting probe in pixel art (pixelArt.ts), as an icon: its outline in the icon's colour,
  // the dish and boom a darker shade of it, the foil gold. Takes Lucide's size and colour props (and
  // its strokeWidth, unused) so it fits the icon tables in icons.ts.
  import { PROBE, spriteRuns } from "./pixelArt";

  let { size = 24, color = "currentColor" }: { size?: number | string; color?: string; strokeWidth?: number | string } = $props();
  const runs = spriteRuns(PROBE);
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
  {#each runs as run, i (i)}
    <rect x={run.x} y={run.y} width={run.width} height="1" fill={run.key === "c" ? "#e3b765" : color} fill-opacity={run.key === "b" ? 0.5 : undefined} />
  {/each}
</svg>
