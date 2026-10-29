<script lang="ts">
  // Strategy layout after Terra Invicta (SPEC 2.13): top bar; nation panel upper left while a
  // nation is selected; Faction Assets on the right, shrinking to make room for the councilor
  // panel (or the army panel) below it while a councilor (or army) is selected; Confirm
  // Assignments at the top centre and
  // the mission hexes at the bottom centre during a council phase; event alerts down the left.
  import ArmyPanel from "./components/ArmyPanel.svelte";
  import ClimateEventDialog from "./components/ClimateEventDialog.svelte";
  import ClimatePanel from "./components/ClimatePanel.svelte";
  import ConfirmAssignments from "./components/ConfirmAssignments.svelte";
  import CouncilorPanel from "./components/CouncilorPanel.svelte";
  import CouncilorSummary from "./components/CouncilorSummary.svelte";
  import EventFeed from "./components/EventFeed.svelte";
  import FactionAssets from "./components/FactionAssets.svelte";
  import ForeignRelations from "./components/ForeignRelations.svelte";
  import GlobeView from "./components/GlobeView.svelte";
  import LoadGame from "./components/LoadGame.svelte";
    import MenuBackground from "./components/MenuBackground.svelte";
  import MissionBar from "./components/MissionBar.svelte";
  import NationPanel from "./components/NationPanel.svelte";
  import NewGame from "./components/NewGame.svelte";
  import PolicyDialog from "./components/PolicyDialog.svelte";
  import RecruitScreen from "./components/RecruitScreen.svelte";
  import ResearchPanel from "./components/ResearchPanel.svelte";
  import TitleMenu from "./components/TitleMenu.svelte";
  import TopBar from "./components/TopBar.svelte";
  import { game } from "./game.svelte";
  import { baseContent } from "../content/index";
  import { mustChooseResearch } from "../sim/index";

  /** We must pick the next global tech or project: the clock waits, so the Research panel opens by itself. */
  const mustChoose = $derived(game.state && game.playerFactionId ? mustChooseResearch(game.state, baseContent, game.playerFactionId) : false);
</script>

{#if game.screen === "game" && game.state}
  <div class="layout">
    <GlobeView />
    <div class="top"><TopBar /></div>
    <div class="center"><ConfirmAssignments /></div>
    {#if game.selectedNationId}
      <div class="nation"><NationPanel /></div>
    {/if}
    <div class="right">
      <FactionAssets />
      {#if game.selectedCouncilorId}<CouncilorPanel />{:else if game.selectedArmyId}<ArmyPanel />{/if}
    </div>
    <div class="missions"><MissionBar /></div>
    <div class="events"><EventFeed /></div>
    <ClimatePanel />
    <ForeignRelations />
    <PolicyDialog />
    <ClimateEventDialog />
    {#if game.summaryCouncilorId}<CouncilorSummary />{:else if game.researchOpen || mustChoose}<ResearchPanel />{:else if game.recruitingOpen}<RecruitScreen />{/if}
  </div>
{:else}
  <div class="menus">
    <MenuBackground />
    {#if game.screen === "newGame"}<NewGame />{:else if game.screen === "load"}<LoadGame />{:else}<TitleMenu />{/if}
  </div>
{/if}

{#if game.error}
  <button class="toast panel" onclick={() => (game.error = null)}>{game.error} (dismiss)</button>
{/if}

<style>
  .menus {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .layout {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .layout > div:not(:first-child) {
    position: absolute;
    display: flex;
    flex-direction: column;
  }
  .layout > div > :global(*) {
    min-height: 0;
  }
  .top {
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
  }
  .center {
    top: 48px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
  }
  /* Leaves room below for the four newest event alerts. */
  .nation {
    top: 42px;
    left: 6px;
    width: 470px;
    bottom: 222px;
  }
  .right {
    top: 42px;
    right: 6px;
    width: 300px;
    bottom: 6px;
    gap: 6px;
    pointer-events: none;
  }
  .right > :global(*) {
    pointer-events: auto;
  }
  .right > :global(.assets) {
    flex: 0 1 auto;
    min-height: 120px;
  }
  .right > :global(.councilor),
  .right > :global(.army) {
    flex: none;
    max-height: 75%;
  }
  .missions {
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    z-index: 5;
  }
  .events {
    top: 50px;
    left: 10px;
    width: 36px;
    bottom: 10px;
    pointer-events: none;
  }
  .toast {
    position: fixed;
    bottom: 180px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 12px;
    border-color: var(--bad);
  }
</style>
