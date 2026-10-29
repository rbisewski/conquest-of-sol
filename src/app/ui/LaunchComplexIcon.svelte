<script lang="ts">
  // A launch complex in Lucide's line style (Lucide has none): a lattice service structure
  // with its swing arms out to a rocket. Takes Lucide's size, colour and strokeWidth props
  // so it fits the icon tables in icons.ts.
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
  <!-- Service structure: two legs, lattice bracing, a mast on top. -->
  <path d="M4 21V5M9 21V5M4 5h5M6.5 5V2" />
  <path d="M4 9l5 3-5 3 5 3" />
  <!-- Swing arms. -->
  <path d="M9 7h5M9 12h5" />
  <!-- Rocket. -->
  <path d="M16.5 3c1.4 1.3 2 3 2 5v10h-4V8c0-2 .6-3.7 2-5Z" />
  <path d="M14.5 15l-1.5 3h1.5M18.5 15l1.5 3h-1.5" />
  <path d="M2 21h20" />
</svg>
