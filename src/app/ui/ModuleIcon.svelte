<script lang="ts">
  // A hab module's structure in pixel art (habArt.ts), its trim in the faction's colour, with its
  // tier as gold pips in the bottom-right corner and, for automated modules, a cyan light in the
  // top-left one. Both sit on a dark backing so they read over the sprite. The sprite is 32
  // pixels, so it stays crisp at multiples of 32.
  import { baseContent } from "../../content/index";
  import { moduleGlyph, modulePalette } from "./habArt";
  import { spriteRuns } from "./pixelArt";

  let { moduleId, size = 64, color }: { moduleId: string; size?: number; color?: string } = $props();
  const runs = $derived(spriteRuns(moduleGlyph(moduleId)));
  const palette = $derived(modulePalette(color && color !== "currentColor" ? color : "#8fa4b8"));
  const def = $derived(baseContent.habModules.find((m) => m.id === moduleId)!);
  const BACKING = "rgba(11, 15, 21, 0.85)";
</script>

<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true">
  {#each runs as run, i (i)}
    <rect x={run.x} y={run.y} width={run.width} height="1" fill={palette[run.key]} />
  {/each}
  <rect x={31 - 3 * def.tier} y="28" width={3 * def.tier + 1} height="4" fill={BACKING} />
  {#each { length: def.tier }, i (i)}
    <rect x={29 - 3 * i} y="29" width="2" height="2" fill="#e3b765" />
  {/each}
  {#if def.automated}
    <rect x="0" y="0" width="5" height="5" fill={BACKING} />
    <rect x="1" y="1" width="3" height="3" fill="#8fe0e6" />
  {/if}
</svg>
