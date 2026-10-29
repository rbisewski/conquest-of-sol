<script lang="ts">
  import { baseContent } from "../../content/index";
  import type { DifficultyId } from "../../sim/index";
  import { game } from "../game.svelte";
  import Emblem from "../ui/Emblem.svelte";

  let factionId = $state(baseContent.factions[0]!.id);
  let difficulty = $state<DifficultyId>("normal");
  let seed = $state(Math.floor(Math.random() * 1_000_000));

  const DIFFICULTIES: { id: DifficultyId; name: string; length: string }[] = [
    { id: "easy", name: "Easy", length: "~15–20 h" },
    { id: "normal", name: "Normal", length: "~30–40 h" },
    { id: "hard", name: "Hard", length: "~60–80 h" },
  ];

  function start() {
    game.newGame({ seed, difficulty, playerFactions: [factionId] });
  }
</script>

<div class="screen">
  <div class="panel box">
    <h1>Conquest of Sol</h1>
    <p class="muted subtitle">2030 Arrival</p>
    <h3>Faction</h3>
    <div class="menu">
      {#each baseContent.factions as f (f.id)}
        <button class="faction" class:selected={f.id === factionId} style:--faction={f.color} onclick={() => (factionId = f.id)}>
          <Emblem faction={f.id} size={30} />
          <span class="text">
            <strong style:color={f.color}>{f.name}</strong>
            <span class="muted">{f.ideology}</span>
          </span>
        </button>
      {/each}
    </div>
    <h3>Difficulty</h3>
    <div class="choices">
      {#each DIFFICULTIES as d (d.id)}
        <button class:selected={d.id === difficulty} onclick={() => (difficulty = d.id)}>
          {d.name}
          <span class="muted">{d.length}</span>
        </button>
      {/each}
    </div>
    <h3>Seed</h3>
    <input class="seed" type="number" bind:value={seed} />
    <button class="start" onclick={start}>Begin</button>
    <button class="back" onclick={() => (game.screen = "title")}>Back</button>
  </div>
</div>

<style>
  .screen {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    padding: 16px;
    overflow-y: auto;
  }
  .box {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(420px, 100%);
    padding: 18px 20px;
    text-align: center;
    background: rgba(17, 25, 32, 0.88);
  }
  h1 {
    margin: 0;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .subtitle {
    margin: 2px 0 0;
  }
  h3 {
    margin: 16px 0 6px;
    font-size: 0.95em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .faction {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 5px 8px;
    border-color: var(--border-soft);
  }
  .faction .text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 17em;
    text-align: left;
  }
  .faction .text span {
    font-size: 0.85em;
  }
  .faction.selected {
    background: rgba(60, 90, 115, 0.6);
    border-color: var(--faction);
    box-shadow: inset 0 0 0 1px var(--faction);
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    width: 100%;
  }
  .choices button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 4px;
    border-color: var(--border-soft);
  }
  .choices button span {
    font-size: 0.8em;
  }
  .choices button.selected {
    background: rgba(60, 90, 115, 0.6);
    border-color: var(--accent);
  }
  .seed {
    width: 10em;
    text-align: center;
  }
  .start {
    margin-top: 18px;
    width: 100%;
    padding: 8px;
    font-size: 1.2em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: rgba(70, 94, 114, 0.95);
    border-color: var(--border-strong);
  }
  .back {
    margin-top: 6px;
    width: 100%;
    padding: 6px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
