<script lang="ts">
  // Event alerts after Terra Invicta: diamonds down the left side of the screen, newest at
  // the top, for our own events and public news. Hovering shows the event, clicking selects
  // its nation and right-clicking dismisses it. While a nation (or a rival councilor) is open
  // the column shrinks to the four newest, at the bottom.
  import { SvelteSet } from "svelte/reactivity";
  import { baseContent } from "../../content/index";
  import { dateOfDay, formatDate, formatTimeOfDay, MINUTES_PER_DAY, type LogEntry } from "../../sim/index";
  import { game } from "../game.svelte";
  import { entryKind } from "../logKinds";
  import { logIcons, missionIcons } from "../ui/icons";
  import X from "@lucide/svelte/icons/x";

  /** Height of one diamond plus the gap below it. */
  const STEP = 44;
  const COMPACT = 4;

  const dismissed = new SvelteSet<string>();
  const key = (e: LogEntry) => `${e.dayIndex}:${e.minuteOfDay}:${e.text}`;

  let height = $state(0);
  const compact = $derived(game.selectedNationId !== null || game.rivalCouncilorId !== null);
  const room = $derived(compact ? COMPACT : Math.max(1, Math.floor((height - STEP) / STEP)));
  const entries = $derived.by(() => {
    const log = game.state?.log ?? [];
    const out: LogEntry[] = [];
    for (let i = log.length - 1; i >= 0 && out.length < room; i--) {
      const e = log[i]!;
      if ((e.factionId === undefined || e.factionId === game.playerFactionId) && !dismissed.has(key(e))) out.push(e);
    }
    return out;
  });

  const when = (e: LogEntry) => `${formatDate(dateOfDay(baseContent.rules.startYear, e.dayIndex))} ${formatTimeOfDay(e.minuteOfDay / MINUTES_PER_DAY).slice(0, 5)}`;
  function glyph(e: LogEntry) {
    const k = entryKind(e);
    return k.mission ? missionIcons[k.mission] : logIcons[k.kind];
  }
  const tone = (e: LogEntry) => entryKind(e).tone ?? (e.factionId ? "mine" : "public");

  function open(e: LogEntry) {
    if (!e.nationId) return;
    game.selectedNationId = e.nationId;
    // The nation panel takes the upper left back from a rival councilor's.
    game.rivalCouncilorId = null;
  }
  function dismiss(event: MouseEvent, e: LogEntry) {
    event.preventDefault();
    dismissed.add(key(e));
  }
</script>

<div class="feed" class:compact bind:clientHeight={height}>
  {#if entries.length > 0}
    <button class="clear" title="Dismiss all" aria-label="Dismiss all events" onclick={() => entries.forEach((e) => dismissed.add(key(e)))}><X size={14} /></button>
  {/if}
  {#each entries as e (key(e))}
    {@const Glyph = glyph(e)}
    <div class="item">
      <button class="event {tone(e)}" aria-label={e.text} onclick={() => open(e)} oncontextmenu={(event) => dismiss(event, e)}>
        <Glyph size={16} strokeWidth={2.2} />
      </button>
      <div class="tip panel" role="tooltip">
        <div class="when">{when(e)}</div>
        <div>{e.text}</div>
        <div class="hint">{e.nationId ? "Click to open the nation · " : ""}Right-click to dismiss</div>
      </div>
    </div>
  {/each}
</div>

<style>
  .feed {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    pointer-events: none;
  }
  .feed.compact {
    justify-content: flex-end;
  }
  .feed > * {
    pointer-events: auto;
  }
  .clear {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    padding: 0;
    border-radius: 50%;
    color: var(--muted);
  }
  /* The button itself is the diamond (a square turned 45°), so its hover and click area match
     the shape; the glyph is turned back upright. */
  .item {
    position: relative;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
  }
  .event {
    --edge: var(--border-strong);
    width: 24px;
    height: 24px;
    padding: 0;
    border: 2px solid var(--edge);
    border-radius: 0;
    background: var(--panel-solid);
    box-shadow: 0 0 8px color-mix(in srgb, var(--edge) 45%, transparent);
    transform: rotate(45deg);
    display: grid;
    place-items: center;
    color: var(--edge);
    cursor: pointer;
  }
  .event :global(svg) {
    transform: rotate(-45deg);
  }
  .event:hover:not(:disabled) {
    background: var(--button-hover);
    border-color: var(--edge);
  }
  .event.good {
    --edge: var(--good);
  }
  .event.bad {
    --edge: var(--bad);
  }
  .event.mine {
    --edge: var(--accent);
  }
  .tip {
    display: none;
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    width: 280px;
    padding: 6px 9px;
    font-size: 0.88em;
    z-index: 20;
  }
  .event:hover + .tip,
  .event:focus-visible + .tip {
    display: block;
  }
  .when,
  .hint {
    color: var(--muted);
  }
  .hint {
    margin-top: 4px;
    font-size: 0.85em;
  }
</style>
