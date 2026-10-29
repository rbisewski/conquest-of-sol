<script lang="ts">
  // A number with its formula on hover (SPEC 2.13: every number has a tooltip breakdown).
  import type { Breakdown } from "../../sim/index";
  import { compact as compactFormat } from "../ui/format";

  let {
    breakdown,
    digits = 1,
    suffix = "",
    signed = false,
    compact = false,
    percent = false,
  }: { breakdown: Breakdown; digits?: number; suffix?: string; signed?: boolean; compact?: boolean; percent?: boolean } = $props();

  const fmt = (n: number) => {
    const v = percent ? n * 100 : n;
    const text = compact ? compactFormat(v, digits) : v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
    return percent ? `${text}%` : text;
  };
</script>

<button type="button" class="num">{signed && breakdown.value >= 0 ? "+" : ""}{fmt(breakdown.value)}{suffix}<span class="tip">
    {#each breakdown.terms as term, i (i)}
      <span class="row">
        <span>{term.label}</span>
        <span>{term.op === "mul" ? `×${term.value.toFixed(3)}` : `${term.value >= 0 && i > 0 ? "+" : ""}${fmt(term.value)}`}</span>
      </span>
    {/each}
    {#if breakdown.clamped}
      <span class="row note"><span>Limited to</span><span>{breakdown.clamped.min}–{breakdown.clamped.max}</span></span>
    {/if}
    <span class="row total"><span>Total</span><span>{fmt(breakdown.value)}{suffix}</span></span>
  </span>
</button>

<style>
  .num {
    all: unset;
    position: relative;
    cursor: help;
    border-bottom: 1px dotted rgba(139, 156, 171, 0.6);
  }
  .tip {
    display: none;
    position: absolute;
    left: 0;
    top: 1.5em;
    z-index: 50;
    min-width: 230px;
    padding: 6px 8px;
    background: var(--panel-solid);
    border: 1px solid var(--border-strong);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    color: var(--text);
    font-size: 13px;
    text-transform: none;
    letter-spacing: 0;
  }
  .num:focus-visible {
    outline: 1px solid var(--accent);
  }
  .num:hover .tip,
  .num:focus .tip {
    display: block;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    white-space: nowrap;
  }
  .note {
    color: var(--muted);
  }
  .total {
    margin-top: 3px;
    padding-top: 3px;
    border-top: 1px solid var(--border-soft);
    color: var(--accent);
  }
</style>
