<script lang="ts">
  // Top bar after Terra Invicta's: menu and faction emblem, then the faction's resources as
  // icon + amount + daily rate (what today's tick pays), and the date, time and speed controls on the right.
  // Money, influence and ops show what is left after this council phase's missions.
  import { baseContent } from "../../content/index";
  import {
    committedResources,
    controlCap,
    controlledPoints,
    controlUpkeep,
    dateOfDay,
    factionDef,
    factionMonthlyIncome,
    formatTimeOfDay,
    monthlyInfluence,
    monthlyResearch,
    mustChooseResearch,
    perDay,
    temperatureAnomaly,
  } from "../../sim/index";
  import { SPEED_LABELS, type Speed } from "../../worker/protocol";
  import { game } from "../game.svelte";
  import { QUICKSAVE, readSave, saveName, writeSave } from "../saves";
  import Emblem from "../ui/Emblem.svelte";
  import { compact } from "../ui/format";
  import Icon from "../ui/Icon.svelte";
  import Num from "./Num.svelte";

  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

  const world = $derived(game.state!);
  const faction = $derived(world.factions.find((f) => f.id === game.playerFactionId) ?? null);
  const def = $derived(faction ? factionDef(baseContent, faction.id) : null);
  const monthly = $derived(faction ? factionMonthlyIncome(world, baseContent, faction.id) : null);
  /** Each resource's change per day: the monthly rates spread over the days of this month. */
  const income = $derived(
    faction && monthly
      ? {
          money: perDay(world, baseContent, monthly.money),
          influence: perDay(world, baseContent, monthlyInfluence(world, baseContent, faction)),
          ops: perDay(world, baseContent, monthly.ops),
          boost: perDay(world, baseContent, monthly.boost),
          research: perDay(world, baseContent, monthlyResearch(world, baseContent, faction)),
        }
      : null,
  );
  const upkeep = $derived(faction ? controlUpkeep(world, baseContent, faction.id) : 0);
  const cap = $derived(faction ? controlCap(world, baseContent, faction) : null);
  /** Resources committed to missions not yet paid for (paid when the council phase closes). */
  const committed = $derived(faction && world.phase === "council" ? committedResources(baseContent, faction) : { money: 0, influence: 0, ops: 0 });
  const mustChoose = $derived(faction ? mustChooseResearch(world, baseContent, faction.id) : false);
  const tip = (name: string, amount: number) => (amount > 0 ? `${name} (${amount} committed to missions)` : name);
  const date = $derived.by(() => {
    const d = dateOfDay(baseContent.rules.startYear, world.dayIndex);
    return `${String(d.day).padStart(2, "0")} ${MONTHS[d.month - 1]} ${d.year}`;
  });
  const time = $derived(formatTimeOfDay(game.dayFraction));
  /** The Global Temperature Anomaly, in °C. */
  const anomaly = $derived(temperatureAnomaly(baseContent, world.climate));

  let menuOpen = $state(false);
  /** The speed Play resumes at. */
  let lastSpeed = $state<Speed>(1);
  const maxSpeed = (SPEED_LABELS.length - 1) as Speed;

  function setSpeed(speed: Speed) {
    if (speed > 0) lastSpeed = speed;
    game.setSpeed(speed);
  }
  const togglePause = () => setSpeed(game.speed === 0 ? lastSpeed : 0);
  const faster = () => setSpeed(Math.min(maxSpeed, Math.max(1, game.speed + 1)) as Speed);
  const slower = () => setSpeed(Math.max(1, game.speed - 1) as Speed);

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
    } else if (event.key === "+" || event.key === "=") faster();
    else if (event.key === "-") slower();
    else if (/^[1-5]$/.test(event.key)) setSpeed(Number(event.key) as Speed);
  }

  /** Saves under `name`: the quicksave slot, or a new save named after the faction and date. */
  async function save(name: string) {
    menuOpen = false;
    const text = await game.save();
    try {
      await writeSave(name, text);
    } catch (error) {
      game.error = `Could not save the game: ${String(error)}`;
    }
  }

  async function quickload() {
    menuOpen = false;
    try {
      game.load(await readSave(QUICKSAVE));
    } catch {
      game.error = "No quicksave found";
    }
  }

  function mainMenu() {
    menuOpen = false;
    game.toTitle();
  }
</script>

<svelte:window onkeydown={onKey} />

<header class="bar">
  <div class="menu">
    <button class="icon-button flat" title="Menu" onclick={() => (menuOpen = !menuOpen)}><Icon name="menu" size={18} /></button>
    {#if menuOpen}
      <div class="dropdown panel">
        <button onclick={() => void save(saveName(`${def?.name ?? "Save"}, ${date}`))}>Save Game</button>
        <button onclick={() => void save(QUICKSAVE)}>Quicksave</button>
        <button onclick={() => void quickload()}>Quickload</button>
        <button onclick={() => { menuOpen = false; game.settingsOpen = true; }}>Settings</button>
        <button onclick={mainMenu}>Main Menu</button>
      </div>
    {/if}
  </div>

  {#if faction && def && income && cap}
    <span class="cell-item" title={def.name}><Emblem faction={faction.id} size={26} /></span>
    <span class="cell-item" title={tip("Money", committed.money)}>
      <Icon name="money" size={18} />
      <span>{compact(faction.resources.money - committed.money)} <span class="rate"><Num breakdown={income.money} signed digits={1} suffix="/day" /></span></span>
    </span>
    <span class="cell-item" title={tip("Influence", committed.influence)}>
      <Icon name="influence" size={18} />
      <span>{compact(faction.resources.influence - committed.influence)} <span class="rate"><Num breakdown={income.influence} signed digits={2} suffix="/day" /></span></span>
    </span>
    <span class="cell-item" title={tip("Operations", committed.ops)}>
      <Icon name="ops" size={18} />
      <span>{compact(faction.resources.ops - committed.ops)} <span class="rate"><Num breakdown={income.ops} signed digits={2} suffix="/day" /></span></span>
    </span>
    <span class="cell-item" title="Boost">
      <Icon name="boost" size={18} />
      <span>{compact(faction.resources.boost)} <span class="rate"><Num breakdown={income.boost} signed digits={3} suffix="/day" /></span></span>
    </span>
    <span class="cell-item" title="Mission Control: used / available">
      <Icon name="missionControl" size={18} />
      <span><span class="mc">0</span>/{compact(faction.resources.missionControl)}</span>
    </span>
    <button class="cell-item research" class:alert={mustChoose} title={mustChoose ? "Research: pick the next global tech or project" : "Research (open the Research panel)"} onclick={() => (game.researchOpen = !game.researchOpen)}>
      <Icon name="research" size={18} />
      <span><Num breakdown={income.research} digits={1} /><span class="rate">/day</span></span>
    </button>
    <span class="cell-item" class:over={upkeep > cap.value} title="Control Point Capacity: used / available ({controlledPoints(world, faction.id)} CPs held)">
      <span class="cp-dot" style:background={def.color}></span>
      <span>{compact(upkeep, 0)}/<Num breakdown={cap} digits={0} /></span>
    </span>
  {/if}

  <span class="spacer"></span>

  <button class="cell-item research climate" class:hot={anomaly >= 2} title="Global Temperature Anomaly (open the Climate panel)" onclick={() => (game.climateOpen = !game.climateOpen)}>
    <Icon name="climate" size={18} color={anomaly >= 2 ? "var(--bad)" : anomaly >= 1.5 ? "#ff9a5a" : "var(--accent)"} />
    <span>{anomaly >= 0 ? "+" : ""}{anomaly.toFixed(2)}°C</span>
  </button>

  {#if world.phase === "council"}
    <span class="cell-item phase">Council phase</span>
  {/if}
  <span class="cell-item date">{date}</span>
  <span class="cell-item time">{time}</span>
  <div class="speed">
    <div class="status" class:paused={game.speed === 0}>
      <span>{game.speed === 0 ? "PAUSED" : `${SPEED_LABELS[game.speed]} / SEC`}</span>
      <span class="pips">
        {#each { length: maxSpeed } as _, i (i)}
          <span class="pip" class:on={game.speed > i} class:off={game.speed === 0 && i === 0}></span>
        {/each}
      </span>
    </div>
    <button class="icon-button flat" title="Slower (−)" onclick={slower}><Icon name="slower" size={16} /></button>
    <button class="icon-button flat" title={game.speed === 0 ? "Play (Space)" : "Pause (Space)"} onclick={togglePause}>
      <Icon name={game.speed === 0 ? "play" : "pause"} size={16} />
    </button>
    <button class="icon-button flat" title="Faster (+)" onclick={faster}><Icon name="faster" size={16} /></button>
  </div>
</header>

<style>
  .bar {
    display: flex;
    align-items: stretch;
    height: 36px;
    background: rgba(16, 24, 33, 0.94);
    border-bottom: 1px solid var(--border);
    font-size: 15px;
    white-space: nowrap;
  }
  /* Control Point Capacity: a dot in the faction's colour. */
  .cp-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.35);
    flex: none;
  }
  .cell-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border-right: 1px solid var(--border-soft);
  }
  button.research {
    height: 100%;
    border-width: 0 1px 0 0;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
  }
  .climate {
    border-left: 1px solid var(--border-soft) !important;
  }
  .climate.hot {
    color: #ffb0a4;
  }
  .research.alert {
    color: var(--good);
    background: rgba(122, 211, 95, 0.15);
  }
  .rate {
    font-size: 0.85em;
    color: var(--muted);
  }
  .mc {
    color: #ffb347;
  }
  .over {
    color: var(--bad);
  }
  .spacer {
    flex: 1;
  }
  .phase {
    color: #10161d;
    background: var(--gold);
    text-transform: uppercase;
    font-size: 0.85em;
    letter-spacing: 0.05em;
  }
  .date,
  .time {
    border-left: 1px solid var(--border-soft);
    min-width: 7.5em;
    justify-content: center;
    letter-spacing: 0.04em;
  }
  .time {
    min-width: 6em;
  }
  .menu {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0 4px;
    border-right: 1px solid var(--border-soft);
  }
  .dropdown {
    position: absolute;
    top: 34px;
    left: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    min-width: 140px;
  }
  .dropdown button {
    text-align: left;
    border: none;
    background: transparent;
    padding: 6px 10px;
  }
  .dropdown button:hover {
    background: var(--button-hover);
  }
  .flat {
    background: transparent;
    border-color: transparent;
  }
  .speed {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    border-left: 1px solid var(--border-soft);
  }
  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    height: 100%;
    padding: 0 6px;
    font-size: 0.78em;
    letter-spacing: 0.06em;
    color: var(--accent);
  }
  .status.paused {
    color: #ff8a7a;
    outline: 1px solid #b4483c;
    outline-offset: -3px;
  }
  .pips {
    display: flex;
    gap: 3px;
    margin-top: 2px;
  }
  .pip {
    width: 14px;
    height: 5px;
    background: #2f4152;
  }
  .pip.on {
    background: var(--accent);
  }
  .pip.off {
    background: #c25a4e;
  }
</style>
