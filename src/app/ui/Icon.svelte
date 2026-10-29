<script lang="ts">
  import { icons, resourceColor, type IconName } from "./icons";

  let { name, size = 16, color, title }: { name: IconName; size?: number; color?: string; title?: string } = $props();
  const Glyph = $derived(icons[name]);
</script>

<span class="icon" {title} style:color={color ?? resourceColor[name] ?? "currentColor"}>
  <Glyph {size} strokeWidth={1.75} />
</span>

<style>
  .icon {
    display: inline-flex;
    flex: none;
    vertical-align: -0.2em;
  }
</style>
