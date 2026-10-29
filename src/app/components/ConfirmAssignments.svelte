<script lang="ts">
  // The wide "Confirm Assignments" button at the top centre during a council phase, as in
  // Terra Invicta. Ending the phase schedules every mission through the run phase.
  import { game } from "../game.svelte";

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const free = $derived(faction ? faction.councilors.filter((c) => c.detainedPhases === 0) : []);
  const assigned = $derived(free.filter((c) => c.mission !== null).length);

  /** Open while we ask whether to end the phase with councilors left idle. */
  let asking = $state(false);

  function confirm() {
    if (assigned < free.length) asking = true;
    else end();
  }

  function end() {
    asking = false;
    if (faction) void game.command({ type: "endCouncilPhase", factionId: faction.id });
  }
</script>

<svelte:window onkeydown={(e) => asking && e.key === "Escape" && (asking = false)} />

{#if world.phase === "council" && faction}
  {#if !faction.councilDone}
    <button class="confirm" onclick={confirm}>
      <span class="label">Confirm Assignments</span>
      <span class="sub">{assigned} of {free.length} councilors assigned</span>
    </button>
    {#if asking}
      <div class="ask panel" role="alertdialog" aria-label="Unassigned councilors">
        <p>Some councilors are unassigned. Are you sure?</p>
        <div class="buttons">
          <button onclick={end}>Yes</button>
          <button onclick={() => (asking = false)}>No</button>
        </div>
      </div>
    {/if}
  {:else}
    <div class="confirm waiting">Waiting for other factions…</div>
  {/if}
{/if}

<style>
  .confirm {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 420px;
    padding: 6px 28px 5px;
    background: rgba(46, 62, 76, 0.94);
    border: 1px solid var(--border-strong);
    box-shadow: 0 2px 14px rgba(0, 0, 0, 0.55);
  }
  .confirm:hover {
    background: rgba(70, 94, 114, 0.96);
    border-color: var(--accent);
  }
  .label {
    font-size: 1.8em;
    font-weight: 400;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #e8f1f7;
  }
  .sub {
    font-size: 0.8em;
    color: var(--muted);
  }
  .ask {
    margin-top: 6px;
    padding: 10px 16px;
    text-align: center;
    background: var(--panel-solid);
    border-color: var(--accent);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
  }
  .ask p {
    margin: 0 0 10px;
  }
  .buttons {
    display: flex;
    justify-content: center;
    gap: 12px;
  }
  .buttons button {
    min-width: 90px;
  }
  .waiting {
    color: var(--muted);
    font-size: 1.1em;
    padding: 10px 28px;
  }
</style>
