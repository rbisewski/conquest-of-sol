<script lang="ts">
  // A hab's look at its tier (habArt.ts) in its faction's colours, scale CSS pixels per sprite pixel.
  import { CORE_SPRITES, corePalette, type HabKind } from "./habArt";
  import { spriteRuns } from "./pixelArt";

  let { kind, tier, color, scale = 2 }: { kind: HabKind; tier: 1 | 2 | 3; color: string; scale?: number } = $props();
  const runs = $derived(spriteRuns(CORE_SPRITES[kind][tier - 1]!));
  const palette = $derived(corePalette(color));
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={32 * scale} height={32 * scale} viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
  {#each runs as run, i (i)}
    <rect x={run.x} y={run.y} width={run.width} height="1" fill={palette[run.key]} />
  {/each}
</svg>
