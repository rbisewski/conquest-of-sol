<script lang="ts">
  // A trefoil in a ring for Fissiles, after Terra Invicta's, in Lucide's line style. Lucide's
  // bare Radiation glyph already stands for nuclear weapons. Takes Lucide's size, colour and
  // strokeWidth props so it fits the icon tables in icons.ts.
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
  <circle cx="12" cy="12" r="10" />
  <circle cx="12" cy="12" r="1" fill={color} />
  <path
    fill={color}
    d="M13.3 9.75 15.5 5.94A7 7 0 0 1 19 12h-4.4a2.6 2.6 0 0 0-1.3-2.25ZM9.4 12H5a7 7 0 0 1 3.5-6.06l2.2 3.81A2.6 2.6 0 0 0 9.4 12Zm3.9 2.25 2.2 3.81a7 7 0 0 1-7 0l2.2-3.81a2.6 2.6 0 0 0 2.6 0Z"
  />
</svg>
