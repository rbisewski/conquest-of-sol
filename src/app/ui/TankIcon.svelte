<script lang="ts">
  // A tank in Lucide's line style (Lucide has none), for armies. Takes Lucide's size,
  // colour and strokeWidth props so it fits the icon tables in icons.ts.
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
  <rect x="2" y="14" width="20" height="6" rx="3" />
  <path d="M4.5 14 6 10.5h12l1.5 3.5" />
  <path d="M8.5 10.5V8.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1v2" />
  <path d="M15 9 22 7.5" />
  <circle cx="7" cy="17" r="0.6" />
  <circle cx="12" cy="17" r="0.6" />
  <circle cx="17" cy="17" r="0.6" />
</svg>
