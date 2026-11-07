<script lang="ts">
  // A stack of ingots with glints for Noble Metals, after Terra Invicta's, in Lucide's line
  // style (Lucide has none). Takes Lucide's size, colour and strokeWidth props so it fits the
  // icon tables in icons.ts.
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
  <path d="M2 21l1.5-5h7l1.5 5Z" />
  <path d="M12 21l1.5-5h7l1.5 5Z" />
  <path d="M7 16l1.5-5h7l1.5 5Z" />
  <path d="M12 1.5Q12.4 4.6 14.5 5 12.4 5.4 12 8.5 11.6 5.4 9.5 5 11.6 4.6 12 1.5Z" fill={color} stroke-width="1" />
  <path d="M4.5 6.5Q4.8 8.7 6 9 4.8 9.3 4.5 11.5 4.2 9.3 3 9 4.2 8.7 4.5 6.5Z" fill={color} stroke-width="1" />
  <path d="M19.5 6.5Q19.8 8.7 21 9 19.8 9.3 19.5 11.5 19.2 9.3 18 9 19.2 8.7 19.5 6.5Z" fill={color} stroke-width="1" />
</svg>
