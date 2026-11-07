<script lang="ts">
  // Power in pixel art (habArt.ts): a lightning bolt in the icon's colour, its trailing edge a
  // fainter shade. Takes Lucide's size and colour props (and its strokeWidth, unused) so it fits
  // the icon tables in icons.ts.
  import { POWER } from "./habArt";
  import { spriteRuns } from "./pixelArt";

  let { size = 24, color = "currentColor" }: { size?: number | string; color?: string; strokeWidth?: number | string } = $props();
  const runs = spriteRuns(POWER);
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">
  {#each runs as run, i (i)}
    <rect x={run.x} y={run.y} width={run.width} height="1" fill={color} fill-opacity={run.key === "b" ? 0.5 : undefined} />
  {/each}
</svg>
