<script lang="ts" module>
  import { paintModule } from "./moduleArt";

  const cache = new Map<string, HTMLCanvasElement>();

  /** A module's picture on a canvas, `size` pixels square, cached. */
  function drawModule(moduleId: string, factionColor: string, size: 32 | 64 | 128): HTMLCanvasElement {
    const key = `${moduleId}|${factionColor}|${size}`;
    let canvas = cache.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d")!.putImageData(new ImageData(paintModule(moduleId, factionColor, size), size, size), 0, 0);
      cache.set(key, canvas);
    }
    return canvas;
  }
</script>

<script lang="ts">
  // A hab module's structure in pixel art (moduleArt.ts), its trim in the faction's colour, with
  // its tier pips and automated light. Drawn at the smallest of 32, 64 or 128 pixels that is at
  // least `size`, shown at `size` CSS pixels with nearest-neighbour scaling.

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
