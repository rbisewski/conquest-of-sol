<script lang="ts">
  // Crossed orbits around a four-pointed core for Exotics, after Terra Invicta's, in Lucide's
  // line style. Lucide's Atom already stands for Energy research. Takes Lucide's size, colour
  // and strokeWidth props so it fits the icon tables in icons.ts.
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
  <ellipse cx="12" cy="12" rx="10.5" ry="4.5" transform="rotate(45 12 12)" />
  <ellipse cx="12" cy="12" rx="10.5" ry="4.5" transform="rotate(-45 12 12)" />
  <path d="M12 9.5 12.8 11.2 14.5 12 12.8 12.8 12 14.5 11.2 12.8 9.5 12 11.2 11.2Z" fill={color} />
</svg>
