<script lang="ts">
  // Settings, opened from the top bar's menu.
  import { game } from "../game.svelte";
  import Icon from "../ui/Icon.svelte";

  const close = () => (game.settingsOpen = false);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && close()} />

<div class="overlay">
  <section class="sheet panel" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="icon-button flat" title="Close" onclick={close}><Icon name="close" size={16} /></button>
    </header>
    <label class="option">
      <input
        type="checkbox"
        checked={game.settings.hideObjectsWhenUnpaused}
        onchange={(e) => game.updateSettings({ hideObjectsWhenUnpaused: e.currentTarget.checked })}
      />
      <span>
        Hide Objects in 3D View When Unpaused
        <small>While the game runs and you are zoomed into a celestial body, only that body and the stars are shown, as others racing past can cause motion sickness.</small>
      </span>
    </label>
    <label class="option">
      <input
        type="checkbox"
        checked={game.settings.blurStars}
        onchange={(e) => game.updateSettings({ blurStars: e.currentTarget.checked })}
      />
      <span>
        Blur Stars in 3D view
        <small>While the game runs, the stars behind the Earth stretch into soft streaks, the longer the faster it goes. Turned off, they stay points.</small>
      </span>
    </label>
  </section>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 42px 6px 6px;
    z-index: 61;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 8vh;
    pointer-events: none;
  }
  .sheet {
    width: min(460px, 100%);
    pointer-events: auto;
    background: var(--panel-solid);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  }
  header {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--header);
    border-bottom: 1px solid var(--border);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 1em;
  }
  .flat {
    background: transparent;
    border-color: transparent;
  }
  .option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    cursor: pointer;
  }
  .option input {
    margin-top: 3px;
  }
  small {
    display: block;
    margin-top: 3px;
    color: var(--muted);
  }
</style>
