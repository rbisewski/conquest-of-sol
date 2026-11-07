<script lang="ts">
  // Crew in pixel art (habArt.ts): a figure in a spacesuit in the icon's colour, its visor gold.
  // Takes Lucide's size and colour props (and its strokeWidth, unused) so it fits the icon tables
  // in icons.ts.
  import { CREW } from "./habArt";
  import { spriteRuns } from "./pixelArt";

  let { size = 24, color = "currentColor" }: { size?: number | string; color?: string; strokeWidth?: number | string } = $props();
  const runs = spriteRuns(CREW);
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
  {#each runs as run, i (i)}
    <rect x={run.x} y={run.y} width={run.width} height="1" fill={run.key === "c" ? "#e3b765" : color} fill-opacity={run.key === "b" ? 0.5 : undefined} />
  {/each}
</svg>
