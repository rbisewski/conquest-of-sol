<script lang="ts">
  // Behind the menus: the Earth close up, slowly turning in daylight.
  import { baseContent } from "../../content/index";
  import { Globe } from "../globe/Globe";

  let container: HTMLDivElement;

  $effect(() => {
    let globe: Globe;
    try {
      globe = new Globe(container, baseContent.regions.length, () => {}, () => {});
    } catch {
      // No WebGL: the plain background colour will do.
      return;
    }
    globe.attract();
    return () => globe.dispose();
  });
</script>

<div class="background" bind:this={container}></div>
<div class="shade"></div>

<style>
  .background,
  .shade {
    position: absolute;
    inset: 0;
  }
  .background :global(canvas) {
    display: block;
    pointer-events: none;
  }
  /* Darken the edges so the menu reads against the bright day side. */
  .shade {
    background: radial-gradient(ellipse at center, rgba(5, 6, 13, 0.2) 0%, rgba(5, 6, 13, 0.55) 80%);
    pointer-events: none;
  }
</style>
