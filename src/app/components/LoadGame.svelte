<script lang="ts">
  // The save list: newest first; click one to load it.
  import { game } from "../game.svelte";
  import { deleteSave, isDesktop, listSaves, readSave, type SaveInfo } from "../saves";
  import Icon from "../ui/Icon.svelte";

  let saves = $state<SaveInfo[] | null>(null);
  let failed = $state<string | null>(null);

  async function refresh() {
    try {
      saves = await listSaves();
    } catch (error) {
      failed = String(error);
      saves = [];
    }
  }
  void refresh();

  async function load(name: string) {
    try {
      game.load(await readSave(name));
    } catch (error) {
      game.error = `Could not load "${name}": ${String(error)}`;
    }
  }

  async function remove(name: string) {
    if (!confirm(`Delete the save "${name}"?`)) return;
    try {
      await deleteSave(name);
    } catch (error) {
      game.error = `Could not delete "${name}": ${String(error)}`;
    }
    await refresh();
  }

  const when = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
</script>

<div class="screen">
  <div class="panel box">
    <h1>Load Game</h1>
    {#if saves === null}
      <p class="muted">Looking for saves…</p>
    {:else if saves.length === 0}
      <p class="muted">{failed ?? (isDesktop ? "No saved games yet." : "No saved games in this browser yet.")}</p>
    {:else}
      <ul>
        {#each saves as s (s.name)}
          <li>
            <button class="save" onclick={() => void load(s.name)}>
              <span class="name">{s.name}</span>
              <span class="muted when">{when(s.savedAt)}</span>
            </button>
            <button class="icon-button" title="Delete" onclick={() => void remove(s.name)}><Icon name="close" size={14} /></button>
          </li>
        {/each}
      </ul>
    {/if}
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
  }
  .box {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: min(440px, 100%);
    max-height: 80vh;
    padding: 18px 20px;
    text-align: center;
    background: rgba(17, 25, 32, 0.88);
  }
  h1 {
    margin: 0 0 12px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  li {
    display: flex;
    gap: 4px;
  }
  .save {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    padding: 5px 8px;
  }
  .name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    font-size: 0.8em;
  }
  .back {
    margin-top: 14px;
    width: 100%;
    padding: 7px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
