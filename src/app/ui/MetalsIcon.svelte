<script lang="ts">
  // A stack of ingots for Base Metals, after Terra Invicta's, in Lucide's line style (Lucide has
  // none). Takes Lucide's size, colour and strokeWidth props so it fits the icon tables in
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
  <path d="M2 18.5l1.8-6.5h6.4l1.8 6.5Z" />
  <path d="M12 18.5l1.8-6.5h6.4l1.8 6.5Z" />
  <path d="M7 12l1.8-6.5h6.4l1.8 6.5Z" />
</svg>
