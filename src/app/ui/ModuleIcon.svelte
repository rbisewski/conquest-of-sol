<script lang="ts">
  // A hab module's structure in pixel art (moduleArt.ts), its trim in the faction's colour, with
  // its tier pips and automated light. Drawn at the smallest of 32, 64 or 128 pixels that is at
  // least `size`, shown at `size` CSS pixels with nearest-neighbour scaling.
  import { drawModule } from "./moduleArt";

  let { moduleId, size = 64, color }: { moduleId: string; size?: number; color?: string } = $props();
  const resolution = $derived(size <= 32 ? 32 : size <= 64 ? 64 : 128);
  const faction = $derived(color && color !== "currentColor" ? color : "#8fa4b8");
  let canvas: HTMLCanvasElement;

  $effect(() => {
    const art = drawModule(moduleId, faction, resolution);
    canvas.width = canvas.height = resolution;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, resolution, resolution);
    ctx.drawImage(art, 0, 0);
  });
</script>

<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px" aria-hidden="true"></canvas>

<style>
  canvas {
    image-rendering: pixelated;
    flex: none;
  }
</style>
