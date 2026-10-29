<script lang="ts">
  // Terra Invicta's Foreign Relations window for a nation whose executive we hold: every other
  // nation, grouped by the faction running it, with Ally / Normal / Rival boxes. Changes are
  // drafted, then sent as diplomatic actions on Confirm (each costs influence; proposals need
  // the other government's consent).
  import { baseContent } from "../../content/index";
  import {
    areAllies,
    areRivals,
    atWar,
    checkDiplomacy,
    cooldownUntil,
    dateOfDay,
    diplomacyCost,
    formatDate,
    isExtant,
    nationArmies,
    nationDef,
    navyCount,
    type Check,
    type DiplomaticAction,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import Emblem from "../ui/Emblem.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";

  type Relation = "ally" | "normal" | "rival";
  const RELATIONS: Relation[] = ["ally", "normal", "rival"];
  const LABEL: Record<Relation, string> = { ally: "Ally", normal: "Normal", rival: "Rival" };
  /** The action that moves a pair one step: Ally ↔ Normal ↔ Rival. */
  const STEP: Record<string, DiplomaticAction> = {
    "normal>ally": "proposeAlliance",
    "ally>normal": "endAlliance",
    "normal>rival": "declareRivalry",
    "rival>normal": "proposeEndRivalry",
  };
  /** Actions the other government can turn down. */
  const NEEDS_CONSENT: DiplomaticAction[] = ["proposeAlliance", "proposeEndRivalry"];

  const world = $derived(game.state!);
  const me = $derived(game.playerFactionId);
  const x = $derived(game.foreignRelationsNationId);
  const xName = $derived(x ? nationDef(baseContent, x).name : "");

  /** Our faction first, then the others, then the nations no faction runs. */
  const tabs = $derived<(string | null)[]>([me, ...baseContent.factions.map((f) => f.id).filter((id) => id !== me), null]);
  let tab = $state<string | null>(null);
  /** Relations changed but not yet confirmed, by nation id. */
  let draft = $state<Record<string, Relation>>({});
  let sending = $state(false);

  // A fresh window opens on our own faction's nations with nothing drafted.
  $effect(() => {
    void x;
    tab = game.playerFactionId;
    draft = {};
  });

  const current = (y: string): Relation => (areAllies(world, x!, y) ? "ally" : areRivals(world, x!, y) ? "rival" : "normal");
  const shown = (y: string): Relation => draft[y] ?? current(y);

  /** Whether the pair can move from its current relation to `to`, and the action that does it. */
  function option(y: string, to: Relation): { action: DiplomaticAction | null; check: Check } {
    const from = current(y);
    if (from === to) return { action: null, check: { ok: true } };
    if (atWar(world, x!, y)) return { action: null, check: { ok: false, reason: "They are at war" } };
    const action = STEP[`${from}>${to}`];
    if (!action) return { action: null, check: { ok: false, reason: "Change one step at a time, through Normal" } };
    return { action, check: checkDiplomacy(world, baseContent, me!, action, x!, y) };
  }

  const rowsByTab = $derived.by(() => {
    const out = new Map<string | null, string[]>(tabs.map((t) => [t, []]));
    if (!x) return out;
    for (const n of world.nations) {
      if (n.id === x || !isExtant(n)) continue;
      out.get(n.controlPoints[0]?.owner ?? null)?.push(n.id);
    }
    for (const list of out.values()) list.sort((a, b) => nationDef(baseContent, a).name.localeCompare(nationDef(baseContent, b).name));
    return out;
  });
  const rows = $derived(rowsByTab.get(tab) ?? []);

  /** The drafted changes, as the actions Confirm will send. */
  const changes = $derived(
    Object.entries(draft)
      .map(([y, to]) => ({ y, action: option(y, to).action }))
      .filter((c): c is { y: string; action: DiplomaticAction } => c.action !== null),
  );
  const cost = $derived(changes.reduce((sum, c) => sum + diplomacyCost(baseContent, c.action), 0));
  const influence = $derived(world.factions.find((f) => f.id === me)?.resources.influence ?? 0);

  function set(y: string, to: Relation) {
    if (to === current(y)) {
      const { [y]: _, ...rest } = draft;
      draft = rest;
    } else if (option(y, to).check.ok) draft = { ...draft, [y]: to };
  }

  /** "Set All Eligible Nations To": every nation on this tab that can make the change. */
  function setAll(to: Relation) {
    for (const y of rows) if (option(y, to).check.ok) set(y, to);
  }

  async function confirm() {
    if (!me || !x) return;
    sending = true;
    for (const c of changes) {
      const result = await game.command({ type: "diplomacy", factionId: me, action: c.action, nationId: x, targetId: c.y });
      if (!result.ok) game.error = `${nationDef(baseContent, c.y).name}: ${result.reason}`;
    }
    sending = false;
    close();
  }

  function close() {
    game.foreignRelationsNationId = null;
  }

  const factionName = (id: string | null) => (id ? baseContent.factions.find((f) => f.id === id)!.name : "Unaligned");
  const cooldownDate = (y: string) => {
    const day = cooldownUntil(world, x!, y);
    return day === null ? "" : formatDate(dateOfDay(baseContent.rules.startYear, day));
  };
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && x && close()} />

{#if x && me}
  <div class="overlay">
    <section class="panel sheet" aria-label="{xName} foreign relations">
      <header class="head">
        <Flag nationId={x} height={18} />
        <h2>{xName} Foreign Relations</h2>
        <button class="icon-button" title="Close (Esc)" onclick={close}><Icon name="close" size={16} /></button>
      </header>

      <nav class="tabs">
        {#each tabs as t (t ?? "unaligned")}
          {@const count = rowsByTab.get(t)?.length ?? 0}
          <button class="tab" class:active={tab === t} title="{factionName(t)} ({count} nation{count === 1 ? '' : 's'})" onclick={() => (tab = t)}>
            {#if t}<Emblem faction={t} size={26} />{:else}Unaligned{/if}
            <span class="count small">{count}</span>
          </button>
        {/each}
      </nav>

      <div class="grid header">
        <span class="set-all">Set All Eligible Nations To:</span>
        {#each RELATIONS as r (r)}
          <span class="col-head">
            {LABEL[r]}
            <button class="box" title="Set every eligible nation here to {LABEL[r]}" aria-label="Set all to {LABEL[r]}" onclick={() => setAll(r)} disabled={rows.length === 0}></button>
          </span>
        {/each}
        <span class="col-head">War</span>
        <span class="col-head"><Icon name="army" size={14} title="Armies" /></span>
        <span class="col-head"><Icon name="navy" size={14} title="Navies" /></span>
        <span class="col-head">May improve relations after</span>
      </div>

      <div class="list">
        {#each rows as y (y)}
          {@const war = atWar(world, x, y)}
          {@const navies = navyCount(world, y)}
          <div class="grid row" class:changed={draft[y] !== undefined}>
            <button class="nation link" title="Open {nationDef(baseContent, y).name}" onclick={() => (game.selectedNationId = y)}>
              <Flag nationId={y} height={16} />
              <span>{nationDef(baseContent, y).name}</span>
            </button>
            {#each RELATIONS as r (r)}
              {@const o = option(y, r)}
              {@const on = shown(y) === r}
              <button
                class="box"
                class:on
                disabled={!on && !o.check.ok}
                title={on ? LABEL[r] : o.check.ok ? `${LABEL[r]}: ${diplomacyCost(baseContent, o.action!)} influence${NEEDS_CONSENT.includes(o.action!) ? ", if they accept" : ""}` : o.check.reason}
                aria-label="{LABEL[r]} with {nationDef(baseContent, y).name}"
                aria-pressed={on}
                onclick={() => set(y, r)}
              >
                {#if on}<Icon name="done" size={16} />{/if}
              </button>
            {/each}
            <span class="col">{#if war}<Icon name="war" size={15} color="#ff6a5a" title="At war" />{/if}</span>
            <span class="col">{nationArmies(world, y).length || "–"}</span>
            <span class="col">{navies || "–"}</span>
            <span class="col muted small">{cooldownDate(y)}</span>
          </div>
        {:else}
          <p class="muted empty">{tab ? `${factionName(tab)} runs no other nation.` : "Every nation has a faction at its head."}</p>
        {/each}
      </div>

      <footer>
        <span class="small" class:bad={cost > influence}>
          {#if changes.length > 0}
            {changes.length} change{changes.length === 1 ? "" : "s"}: {cost} <Icon name="influence" size={13} title="influence" /> · alliances and ending rivalries need the other government's consent.
          {:else}
            Each change costs {baseContent.rules.diplomacy.influenceCost} <Icon name="influence" size={13} title="influence" />.
          {/if}
        </span>
        <div class="buttons">
          <button disabled={changes.length === 0 || cost > influence || sending} onclick={confirm}>Confirm</button>
          <button disabled={changes.length === 0 || sending} onclick={() => (draft = {})}>Reset</button>
          <button onclick={close}>Cancel</button>
        </div>
      </footer>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 42px 6px 6px;
    z-index: 25;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 9vh;
    pointer-events: none;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    width: min(860px, 100%);
    max-height: 80vh;
    pointer-events: auto;
    background: var(--panel-solid);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 6px 4px 10px;
    background: var(--header);
  }
  h2 {
    flex: 1;
    margin: 0;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 1.05em;
    font-weight: 500;
    color: var(--header-text);
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 4px 4px 0;
  }
  .tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    background: var(--cell);
    border-color: var(--border-soft);
  }
  .tab.active {
    background: var(--button-hover);
    border-color: var(--accent);
  }
  .count {
    color: var(--muted);
  }
  /* Nation | Ally | Normal | Rival | War | Armies | Navies | Cooldown */
  .grid {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) repeat(3, 56px) 44px 44px 44px 170px;
    align-items: center;
    column-gap: 4px;
    padding: 0 10px;
  }
  .header {
    padding-top: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-soft);
  }
  .set-all {
    justify-self: end;
    align-self: end;
    padding-bottom: 3px;
    font-size: 0.9em;
  }
  .col-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    align-self: end;
    font-size: 0.9em;
  }
  .list {
    flex: 1;
    min-height: 120px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .row {
    min-height: 30px;
  }
  .row:nth-child(odd) {
    background: rgba(255, 255, 255, 0.03);
  }
  .row.changed {
    background: rgba(159, 215, 255, 0.08);
  }
  .nation {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 2px 0;
    text-align: left;
    background: transparent;
    border-color: transparent;
  }
  .nation span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col {
    display: flex;
    justify-content: center;
    font-variant-numeric: tabular-nums;
  }
  .box {
    justify-self: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: #0b1219;
    border-color: var(--border);
  }
  .box.on {
    color: #fff;
    border-color: var(--border-strong);
  }
  .box:disabled {
    opacity: 0.3;
  }
  .empty {
    padding: 10px;
    text-align: center;
  }
  footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid var(--border-soft);
  }
  .buttons {
    display: flex;
    gap: 12px;
  }
  .buttons button {
    min-width: 130px;
    padding: 5px 12px;
    text-transform: uppercase;
  }
</style>
