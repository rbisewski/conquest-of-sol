<script lang="ts">
  // A disc split into matter and its mirror image for Antimatter, after Terra Invicta's, in
  // Lucide's line style (Lucide has none). Takes Lucide's size, colour and strokeWidth props so
  // it fits the icon tables in icons.ts.
  let { size = 24, color = "currentColor", strokeWidth = 2 }: { size?: number | string; color?: string; strokeWidth?: number | string } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="8" />
  <path d="M17.66 6.34A8 8 0 0 0 6.34 17.66Z" fill={color} />
  <path d="M3.5 20.5 20.5 3.5" />
</svg>
