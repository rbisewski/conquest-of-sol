<script lang="ts">
  // A hab's picture, after Terra Invicta's hab screen: its modules laid out by sector (habLayout.ts)
  // on the ground of its body (a base) or against the stars over its body (a station), joined by
  // corridors or trusses, in pixel art (habGround.ts, moduleArt.ts). Modules are drawn at the
  // largest of 128, 64, 32 or 16 pixels that lets the whole layout fit; empty slots show as pads
  // (a base) or docking rings (a station), the mining slot with a pick. Slots can be picked and
  // hovered.
  import { baseContent } from "../../content/index";
  import { factionDef, habBodyId, habOperation, MINING_SLOT, spaceBody, type HabState } from "../../sim/index";
  import { game } from "../game.svelte";
  import { bodyColor, bodyMap, type MapImage } from "../solar/bodyArt";
  import { paintBackdrop, seedFrom } from "../ui/habGround";
  import { habLayout, type Point } from "../ui/habLayout";
  import Icon from "../ui/Icon.svelte";
  import ModuleIcon from "../ui/ModuleIcon.svelte";

  let {
    hab,
    picked = null,
    maxModule = 128,
    shift = 0,
    clearLeft = 0,
    onpick,
    onhover,
  }: {
    hab: HabState;
    picked?: number | null;
    /** The largest the modules are drawn, CSS pixels. */
    maxModule?: number;
    /** Moves the layout's centre right by this share of the width. */
    shift?: number;
    /** Keeps the layout right of this many CSS pixels from the left, where it fits (room for a heading). */
    clearLeft?: number;
    onpick?: (slot: number) => void;
    onhover?: (slot: number | null, x: number, y: number) => void;
  } = $props();

  /** CSS pixels per art pixel of the ground. */
  const PIXEL = 2;

  const world = $derived(game.state!);
  const kind = $derived(hab.siteId ? "base" : "station");
  const layout = $derived(habLayout(kind, hab.modules.length));
  const body = $derived(spaceBody(baseContent, habBodyId(baseContent, hab)));
  const site = $derived(hab.siteId ? baseContent.habSites.find((s) => s.id === hab.siteId)! : null);
  const color = $derived(factionDef(baseContent, hab.factionId).color);
  const status = $derived(habOperation(world, baseContent, hab).status);

  let width = $state(0);
  let height = $state(0);
  let ground: HTMLCanvasElement;
  let map = $state.raw<MapImage | null>(null);

  $effect(() => {
    map = null;
    let live = true;
    void bodyMap(body.id)?.then((m) => live && (map = m));
    return () => (live = false);
  });

  /** The module size and cell spacing that fit, and where the layout's origin goes. */
  const fit = $derived.by(() => {
    const spanX = layout.max.x - layout.min.x;
    const spanY = layout.max.y - layout.min.y;
    const room = { x: width * (1 - Math.abs(shift)) * 0.94, y: height * 0.9 };
    const size = [128, 64, 32, 16].find((s) => s <= maxModule && spanX * s * 1.3 <= room.x && spanY * s * 1.3 <= room.y) ?? 16;
    const cell = Math.round((size * 1.3) / PIXEL) * PIXEL;
    const centred = width / 2 + shift * width - ((layout.min.x + layout.max.x) / 2) * cell;
    // Clear of the heading on the left, if the right side has room for it.
    const ox = Math.max(centred, Math.min(clearLeft - layout.min.x * cell, width - layout.max.x * cell - 8));
    const oy = height / 2 - ((layout.min.y + layout.max.y) / 2) * cell;
    return { size, cell, ox, oy };
  });
  const at = (p: Point) => ({ x: Math.round((fit.ox + p.x * fit.cell) / PIXEL) * PIXEL, y: Math.round((fit.oy + p.y * fit.cell) / PIXEL) * PIXEL });

  $effect(() => {
    if (!ground || width < 4 || height < 4) return;
    const w = Math.ceil(width / PIXEL);
    const h = Math.ceil(height / PIXEL);
    ground.width = w;
    ground.height = h;
    const ctx = ground.getContext("2d")!;
    const image = ctx.createImageData(w, h);
    paintBackdrop(image, {
      kind,
      color: bodyColor(body.id, body.type),
      map,
      lat: site?.lat ?? null,
      lon: site?.lon ?? null,
      glow: body.atmosphere && body.atmosphere !== "trace" ? "#9cc0ff" : null,
      seed: seedFrom(hab.id),
    });
    ctx.putImageData(image, 0, 0);
    drawLinks(ctx);
  });

  /** A square brush along a line, in art pixels: crisp, as pixel art. */
  function line(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, width: number, fill: string) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    ctx.fillStyle = fill;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps - width / 2);
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps - width / 2);
      ctx.fillRect(x, y, width, width);
    }
  }

  function drawLinks(ctx: CanvasRenderingContext2D) {
    const art = (p: Point) => ({ x: (fit.ox + p.x * fit.cell) / PIXEL, y: (fit.oy + p.y * fit.cell) / PIXEL });
    const thick = Math.max(2, Math.round(fit.cell / PIXEL / 8));
    // Shadow, body, then a lit edge on the upper left.
    const pass = (dx: number, dy: number, w: number, fill: string) => {
      for (const poly of layout.links) for (let i = 1; i < poly.length; i++) {
        const a = art(poly[i - 1]!);
        const b = art(poly[i]!);
        line(ctx, { x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, w, fill);
      }
      for (const arc of layout.arcs) {
        const steps = Math.ceil(((arc.to - arc.from) * arc.r * fit.cell) / PIXEL);
        for (let i = 0; i < steps; i++) {
          const t0 = arc.from + ((arc.to - arc.from) * i) / steps;
          const t1 = arc.from + ((arc.to - arc.from) * (i + 1)) / steps;
          const a = art({ x: arc.r * Math.cos(t0), y: arc.r * Math.sin(t0) });
          const b = art({ x: arc.r * Math.cos(t1), y: arc.r * Math.sin(t1) });
          line(ctx, { x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }, w, fill);
        }
      }
    };
    const station = kind === "station";
    // A station's links are pressurised tubes in the modules' hull colours (pixelKit's hull ramp), a base's corridors darker (its dark ramp).
    pass(1, 1, thick + 1, "rgba(0, 0, 0, 0.45)");
    pass(0, 0, thick, station ? "#929cd6" : "#40456f");
    pass(-Math.floor(thick / 3), -Math.floor(thick / 3), Math.max(1, Math.floor(thick / 3)), station ? "#e9edfb" : "#7f8bb4");
  }

  function hover(slot: number | null, event: MouseEvent) {
    onhover?.(slot, event.clientX, event.clientY);
  }
</script>

<div class="scene" bind:clientWidth={width} bind:clientHeight={height} role="presentation" onmouseleave={(e) => hover(null, e)}>
  <canvas bind:this={ground} class="ground"></canvas>
  {#if width > 0}
    {#each layout.slots as p, i (i)}
      {@const m = hab.modules[i] ?? null}
      {@const pos = at(p)}
      {@const s = status[i]}
      <button
        class="slot"
        class:empty={!m}
        class:station={kind === "station"}
        class:picked={picked === i}
        class:pending={s === "building"}
        class:idle={s === "off" || s === "unpowered"}
        class:clickable={!!onpick}
        style:left="{pos.x - fit.size / 2}px"
        style:top="{pos.y - fit.size / 2}px"
        style:width="{fit.size}px"
        style:height="{fit.size}px"
        aria-label={m ? m.moduleId : "Empty slot"}
        onclick={() => onpick?.(i)}
        onmouseenter={(e) => hover(i, e)}
        onmousemove={(e) => hover(i, e)}
      >
        {#if m}
          <ModuleIcon moduleId={m.moduleId} size={fit.size} {color} />
          {#if s === "off" || s === "unpowered"}<span class="badge" class:bad={s === "unpowered"}><Icon name="powerOff" size={Math.max(10, fit.size / 6)} /></span>{/if}
          {#if m.upgrade}<span class="upgrading">▲</span>{/if}
        {:else if kind === "base" && i === MINING_SLOT}
          <Icon name="mining" size={Math.max(10, fit.size / 3)} color="rgba(220, 230, 240, 0.55)" />
        {/if}
      </button>
    {/each}
  {/if}
</div>

<style>
  .scene {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 100%;
    background: #05080d;
  }
  .ground {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .slot {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0;
    background: none;
    cursor: default;
  }
  .slot.clickable {
    cursor: pointer;
  }
  .slot.empty {
    border: 1px dashed rgba(220, 230, 240, 0.35);
    background: rgba(5, 8, 13, 0.25);
  }
  .slot.empty.station {
    border: 2px solid rgba(200, 210, 222, 0.45);
    border-radius: 50%;
  }
  .slot.clickable:hover {
    border-color: rgba(143, 224, 230, 0.7);
  }
  .slot.picked {
    border: 1px solid var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 0 10px rgba(143, 224, 230, 0.55);
  }
  .slot.pending :global(canvas) {
    opacity: 0.45;
  }
  .slot.idle :global(canvas) {
    opacity: 0.45;
    filter: grayscale(0.8);
  }
  .badge {
    position: absolute;
    left: 1px;
    bottom: 1px;
    display: inline-flex;
    color: var(--muted);
  }
  .badge.bad {
    color: var(--bad);
  }
  .upgrading {
    position: absolute;
    right: 2px;
    top: 0;
    font-size: 10px;
    color: var(--accent);
  }
</style>
