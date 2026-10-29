<script lang="ts">
  // Faction logos. As in Terra Invicta, a faction's logo stands for it wherever control points
  // appear (tiles, capacity, executive). Each sits in a ring of the faction's colour; an empty
  // slot (no faction) draws as a dim ring.
  import { baseContent } from "../../content/index";

  let { faction = null, size = 28, title }: { faction?: string | null; size?: number; title?: string } = $props();

  const def = $derived(faction ? baseContent.factions.find((f) => f.id === faction) : undefined);
  const color = $derived(def?.color ?? null);
  const label = $derived(title ?? def?.name);
</script>

<svg class="emblem" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label={label}>
  {#if label}<title>{label}</title>{/if}
  <circle cx="16" cy="16" r="14.75" fill="#17221f" stroke={color ?? "#3b4a56"} stroke-width="1.5" opacity={color ? 1 : 0.6} />
  {#if color}
    <circle cx="16" cy="16" r="12.6" fill="none" stroke={color} stroke-width="0.8" stroke-dasharray="1.2 1.4" opacity="0.55" />
    <g fill={color} stroke={color} stroke-linecap="round" stroke-linejoin="round">
      {#if faction === "aegis"}
        <!-- Aegis Coalition: a kite shield bearing a star. -->
        <path d="M16 5.5 L24.5 8.5 V15.5 C24.5 21 20.8 24.6 16 26.5 C11.2 24.6 7.5 21 7.5 15.5 V8.5 Z" stroke="none" />
        <path d="M16 10 L17.3 14.3 L21.6 15.6 L17.3 16.9 L16 21.2 L14.7 16.9 L10.4 15.6 L14.7 14.3 Z" fill="#17221f" stroke="none" />
      {:else if faction === "iron-dawn"}
        <!-- Iron Dawn: a sun rising over a spear point. -->
        <path d="M9.5 17.5 A6.5 6.5 0 0 1 22.5 17.5 Z" stroke="none" />
        <g stroke-width="1.6" fill="none">
          <path d="M16 6.5 V9" />
          <path d="M9.6 9.1 L11.3 10.8" />
          <path d="M22.4 9.1 L20.7 10.8" />
          <path d="M6.5 14.2 H8.8" />
          <path d="M25.5 14.2 H23.2" />
          <path d="M7 17.5 H25" />
        </g>
        <path d="M11.5 20 L16 26.5 L20.5 20 L16 22.2 Z" stroke="none" />
      {:else if faction === "lumen"}
        <!-- Lumen Institute: an open eye radiating light. -->
        <path d="M6 17 Q16 7.5 26 17 Q16 26.5 6 17 Z" fill="none" stroke-width="1.7" />
        <circle cx="16" cy="17" r="3.6" stroke="none" />
        <circle cx="17.2" cy="15.8" r="1.1" fill="#fff" stroke="none" opacity="0.8" />
        <g stroke-width="1.5" fill="none">
          <path d="M16 5.5 V8.5" />
          <path d="M10.2 7.4 L11.6 10" />
          <path d="M21.8 7.4 L20.4 10" />
        </g>
      {:else if faction === "meridian"}
        <!-- Meridian Consortium: a globe of meridians under a rising chevron. -->
        <g fill="none" stroke-width="1.5">
          <circle cx="16" cy="17.5" r="8" />
          <ellipse cx="16" cy="17.5" rx="3.6" ry="8" />
          <path d="M8 17.5 H24" />
          <path d="M9.4 13.3 H22.6" opacity="0.7" />
          <path d="M9.4 21.7 H22.6" opacity="0.7" />
        </g>
        <path d="M11 9 L16 4.5 L21 9 L16 7.2 Z" stroke="none" />
      {:else if faction === "ark"}
        <!-- Ark Covenant: a ship leaving through an orbit. -->
        <path d="M16 5 C19.2 8.6 20.2 12.6 20 18.5 H12 C11.8 12.6 12.8 8.6 16 5 Z" stroke="none" />
        <path d="M12 15.5 L9 20.5 H12 Z M20 15.5 L23 20.5 H20 Z" stroke="none" />
        <path d="M13.8 20.5 L16 26 L18.2 20.5 Z" stroke="none" opacity="0.75" />
        <circle cx="16" cy="11.8" r="1.6" fill="#17221f" stroke="none" />
        <ellipse cx="16" cy="17" rx="10.5" ry="3.6" fill="none" stroke-width="1.3" transform="rotate(-18 16 17)" opacity="0.85" />
      {:else if faction === "concord"}
        <!-- The Concord: two rings bound together. -->
        <g fill="none" stroke-width="2.2">
          <circle cx="12.6" cy="16" r="6" />
          <circle cx="19.4" cy="16" r="6" />
        </g>
        <circle cx="16" cy="16" r="1.6" stroke="none" />
      {:else if faction === "choir"}
        <!-- Choir of the Descent: a beam descending from above, ringing as it lands. -->
        <path d="M9.5 6.5 H22.5 L16 18.5 Z" stroke="none" />
        <circle cx="16" cy="10" r="1.7" fill="#17221f" stroke="none" />
        <g fill="none" stroke-width="1.5">
          <path d="M11.5 21 Q16 24 20.5 21" />
          <path d="M8.5 23.3 Q16 28.2 23.5 23.3" opacity="0.7" />
        </g>
      {:else}
        <!-- Unknown faction id: a plain four-pointed star. -->
        <path d="M16 5 L18.2 13.8 L27 16 L18.2 18.2 L16 27 L13.8 18.2 L5 16 L13.8 13.8 Z" stroke="none" />
      {/if}
    </g>
  {/if}
</svg>

<style>
  .emblem {
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
</style>
