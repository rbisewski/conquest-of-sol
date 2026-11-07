<script lang="ts">
  // A flame in a droplet for Volatiles, after Terra Invicta's, in Lucide's line style (Lucide
  // has none). Takes Lucide's size, colour and strokeWidth props so it fits the icon tables in
  // icons.ts.
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
  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z" />
  <path d="M12 19a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1-2.3-1.6-3.6-.5 1-1.1 1.4-1.8 2a2.6 2.6 0 0 0-1.6 1.6A2.5 2.5 0 0 0 12 19Z" />
</svg>
