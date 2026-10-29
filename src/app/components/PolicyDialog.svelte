<script lang="ts">
  // Terra Invicta's "Select policy" window: opens once one of our Set National Policy missions
  // succeeds, and the clock waits until we pick a policy or none (refunding the mission).
  import { baseContent } from "../../content/index";
  import { checkPolicy, consolidationDaysLeft, nationDef, nationState, policyLabel, policyOptions, regionOwner, type Policy } from "../../sim/index";
  import { game } from "../game.svelte";
  import Flag from "../ui/Flag.svelte";
  import Icon from "../ui/Icon.svelte";

  const world = $derived(game.state!);
  const choice = $derived(world.policyChoices.find((c) => c.factionId === game.playerFactionId) ?? null);
  const nationName = $derived(choice ? nationDef(baseContent, choice.nationId).name : "");
  /** Days until our executive control here is consolidated, unlocking the bigger policies. */
  const daysLeft = $derived(choice ? consolidationDaysLeft(world, baseContent, nationState(world, choice.nationId)) : 0);

  /** The policy kinds as Terra Invicta groups them; joining an ally's war comes under Declare War. */
  const GROUPS: { name: string; kinds: Policy["kind"][]; text: string }[] = [
    { name: "Declare War", kinds: ["declareWar", "joinWar"], text: "Declare war on a rival and on its allies with armies or nuclear weapons; our allies are drawn in too. Requires this nation to have an army or nuclear weapons. We may also join a war on an ally's side." },
    { name: "Seek Peace", kinds: ["seekPeace"], text: "Try to end a war against a nation and its allies. It ends outright only if the other side isn't winning." },
    { name: "Federation", kinds: ["federate"], text: "Join the targeted nation's federation, bring it into ours, or found one together. Federated nations are in permanent alliance and share space funding and boost. One side needs a claim on a region of the other." },
    { name: "Leave Federation", kinds: ["leaveFederation"], text: "Exit our federation. We stay allied with its members for now but suffer a GDP decrease and no longer share their space program resources. Not allowed for the federation's leader." },
    { name: "Unification", kinds: ["unify"], text: "Peacefully absorb a fellow federation member on whose capital we have a peaceful claim, or settle a breakaway with its parent. Requires every control point of the joining nation and our executive in both." },
    { name: "Grant Independence", kinds: ["grantIndependence"], text: "Free a breakaway, or recreate a lost nation in its home capital that we hold. Only the capital is released, and we keep all its control points." },
    { name: "Demand Claim", kinds: ["demandTerritory"], text: "Ask a nation at peace to hand over a non-capital region we have a peaceful claim on. Ends any rivalry between the two and starts a diplomatic cooldown." },
    { name: "Disband Army", kinds: ["disbandArmy"], text: "Disband one of our faction's armies in this nation, freeing up resources for other use." },
    { name: "Disarm Warheads", kinds: ["disarm"], text: `Disarm up to ${baseContent.rules.diplomacy.disarmNukes} nuclear weapons. If weapons are reduced to 0, also cancel all progress on the Nuclear Weapons priority in this nation.` },
    { name: "Declare Independence", kinds: ["declareIndependence"], text: "Declare full independence from this breakaway's parent nation, which will declare war in response." },
  ];

  /** The group whose targets are listed. */
  let open = $state<string | null>(null);
  // A new choice starts closed.
  $effect(() => {
    void choice;
    open = null;
  });

  const groups = $derived.by(() => {
    if (!choice || !game.playerFactionId) return [];
    const all = policyOptions(world, baseContent, choice.nationId).map((policy) => ({ policy, check: checkPolicy(world, baseContent, game.playerFactionId!, choice.nationId, policy) }));
    return GROUPS.map((g) => {
      const options = all.filter((o) => g.kinds.includes(o.policy.kind)).sort((a, b) => Number(b.check.ok) - Number(a.check.ok) || label(a.policy).localeCompare(label(b.policy)));
      const valid = options.filter((o) => o.check.ok).length;
      const firstReason = options.find((o) => !o.check.ok)?.check;
      const why = valid > 0 ? null : firstReason && !firstReason.ok ? firstReason.reason : "Nothing to choose from";
      return { ...g, options, valid, why };
    });
  });

  /** A policy without the "Nation: " prefix, e.g. "Declare war on Peru". */
  function label(policy: Policy): string {
    const text = policyLabel(world, baseContent, choice!.nationId, policy).replace(`${nationName}: `, "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /** The other nation a policy is aimed at, for its flag. */
  function targetOf(policy: Policy): string | null {
    if ("targetId" in policy) return policy.targetId;
    if (policy.kind === "demandTerritory") return regionOwner(world, policy.regionId);
    return null;
  }

  /** Policies with no target (leaving, independence) are set straight from their button. */
  const untargeted = (g: { kinds: Policy["kind"][] }) => g.kinds.every((k) => k === "leaveFederation" || k === "declareIndependence" || k === "disarm");

  function pick(g: (typeof groups)[number]) {
    if (untargeted(g)) choose(g.options.find((o) => o.check.ok)!.policy);
    else open = open === g.name ? null : g.name;
  }

  function choose(policy: Policy | null) {
    if (!choice || !game.playerFactionId) return;
    void game.command({ type: "choosePolicy", factionId: game.playerFactionId, nationId: choice.nationId, policy }).then((result) => {
      if (!result.ok) game.error = result.reason;
    });
  }

  const refund = $derived(baseContent.rules.missions.costs.setPolicy);
</script>

{#if choice}
  <div class="overlay">
    <section class="panel sheet" aria-label="Select policy for {nationName}">
      <header>
        <Flag nationId={choice.nationId} height={30} />
        <h2>Select policy for {nationName}</h2>
      </header>
      <p class="status small" class:good={daysLeft === 0}>
        {#if daysLeft === 0}Executive control consolidated.{:else}Executive control consolidates in {daysLeft} day{daysLeft === 1 ? "" : "s"}: until then only war and peace{#if world.breakaways[choice.nationId]} and independence{/if} can be set.{/if}
      </p>
      <div class="rows">
        {#each groups as g (g.name)}
          <button class="kind" disabled={g.valid === 0} class:open={open === g.name} title={g.why ?? undefined} onclick={() => pick(g)}>{g.name}</button>
          <div class="text">
            {g.text}
            {#if g.valid === 0 && g.why}<span class="why">{g.why}.</span>{/if}
          </div>
          {#if open === g.name}
            <ul class="targets">
              {#each g.options as o (JSON.stringify(o.policy))}
                {@const target = targetOf(o.policy)}
                <li>
                  <button class="target" disabled={!o.check.ok} onclick={() => choose(o.policy)}>
                    {#if target}<Flag nationId={target} height={14} />{/if}
                    <span class="name">{label(o.policy)}</span>
                    {#if !o.check.ok}<span class="small bad">{o.check.reason}</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
        <button class="kind" onclick={() => choose(null)}>Cancel</button>
        <div class="text">Do nothing.{#if refund?.fixed}{" "}<span class="refund">{refund.fixed} <Icon name={refund.resource} size={14} title={refund.resource} /></span> will be refunded.{/if}</div>
      </div>
    </section>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 42px 6px 6px;
    z-index: 30;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 6vh;
    pointer-events: none;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    width: min(900px, 100%);
    max-height: 100%;
    overflow-y: auto;
    pointer-events: auto;
    background: var(--panel-solid);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 12px;
    background: var(--header);
    border-bottom: 1px solid var(--border);
  }
  h2 {
    flex: 1;
    margin: 0;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 1.35em;
    font-weight: 500;
    color: var(--header-text);
  }
  .status {
    margin: 0;
    padding: 6px 12px 0;
    color: var(--muted);
    text-align: center;
  }
  .status.good {
    color: var(--good);
  }
  .rows {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 6px 10px;
    padding: 8px;
  }
  .kind {
    align-self: start;
    min-height: 38px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .kind.open {
    border-color: var(--accent);
    color: var(--accent);
  }
  .text {
    align-self: center;
    font-size: 0.88em;
    line-height: 1.35;
  }
  .why {
    margin-left: 4px;
    color: var(--muted);
    font-style: italic;
  }
  .refund {
    white-space: nowrap;
  }
  .targets {
    grid-column: 2;
    list-style: none;
    margin: -2px 0 4px;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
  }
  .target {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-top: 2px;
    padding: 3px 8px;
    text-align: left;
    background: var(--cell);
    border-color: var(--border-soft);
  }
  .target:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .name {
    flex: 1;
  }
</style>
