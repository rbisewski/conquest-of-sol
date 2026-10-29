<script lang="ts">
  // A councilor's pixel-art portrait (src/app/portraits). "head" is a hexagonal head crop for
  // lists; "full" is the bust used in the councilor panel.
  import { baseContent } from "../../content/index";
  import type { Councilor } from "../../sim/index";
  import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "../portraits/portrait";
  import { portraitUrl } from "../portraits/portraitUrl";

  let {
    councilor,
    factionId,
    variant = "head",
    size = 26,
    scale = 2,
  }: {
    councilor: Pick<Councilor, "portraitSeed" | "gender" | "professionId" | "name" | "skinTone" | "hairSeed">;
    factionId: string;
    variant?: "head" | "full";
    /** Head crop: its size in px. */
    size?: number;
    /** Full portrait: a whole-number scale so the pixels stay crisp. */
    scale?: number;
  } = $props();

  const color = $derived(baseContent.factions.find((f) => f.id === factionId)?.color ?? "#8a9aa8");
  const url = $derived(portraitUrl(councilor.portraitSeed, councilor.gender, councilor.professionId, color, variant, councilor.skinTone, councilor.hairSeed));
</script>

{#if variant === "head"}
  <span class="portrait-hex" style:width="{size}px" style:height="{size}px" style:background={color}>
    <img src={url} alt="" width={size - 2} height={size - 2} />
  </span>
{:else}
  <img class="full" src={url} alt="Portrait of {councilor.name}" width={PORTRAIT_WIDTH * scale} height={PORTRAIT_HEIGHT * scale} />
{/if}

<style>
  .portrait-hex {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    vertical-align: middle;
  }
  .portrait-hex img {
    clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
    /* The 64 px head crop is shown smaller than native, so let it filter smoothly. */
    image-rendering: auto;
  }
  .full {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
    image-rendering: pixelated;
  }
</style>
