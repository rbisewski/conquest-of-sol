<script lang="ts">
  // The title menu: New Game, Load Game, Quit (desktop only; a browser tab can't close itself).
  import { game } from "../game.svelte";
  import { isDesktop, quitApp } from "../saves";
</script>

<div class="screen">
  <div class="panel box">
    <h1>Conquest of Sol</h1>
    <p class="muted subtitle">2030 Arrival</p>
    <nav>
      <button onclick={() => (game.screen = "newGame")}>New Game</button>
      <button onclick={() => (game.screen = "load")}>Load Game</button>
      {#if isDesktop}<button onclick={() => void quitApp()}>Quit</button>{/if}
    </nav>
  </div>
</div>

<style>
  .screen {
    position: relative;
    display: grid;
    place-items: center;
    height: 100%;
    padding: 16px;
  }
  .box {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(360px, 100%);
    padding: 22px 24px;
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
    margin: 2px 0 18px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }
  nav button {
    padding: 9px;
    font-size: 1.15em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
