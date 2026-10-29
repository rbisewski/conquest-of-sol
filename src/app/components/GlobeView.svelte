<script lang="ts">
  import { baseContent } from "../../content/index";
  import {
    armyCommander,
    atWar,
    checkMove,
    dateOfDay,
    dayOfDate,
    gdpPerCapita,
    intelOn,
    MINUTES_PER_DAY,
    MISSION_NAMES,
    missionRegion,
    occupiedShare,
    regionDef,
    type GameState,
    type MoveCheck,
  } from "../../sim/index";
  import { game } from "../game.svelte";
  import { Globe, slotOffset, type ArmyMarker, type CouncilorMarker, type Flight, type RegionTint } from "../globe/Globe";
  import { handoff } from "../solar/handoff";

  let container: HTMLDivElement;
  let globe = $state<Globe | null>(null);
  /** Where the camera glides in to after flying home from the Solar System view, in Earth radii. */
  const GLIDE_TO = 3.3;
  let hovered = $state<number | null>(null);

  const regions = baseContent.regions;
  const factionColor = new Map(baseContent.factions.map((f) => [f.id, f.color]));
  const nationName = new Map(baseContent.nations.map((n) => [n.id, n.name]));
  const regionIndex = new Map(regions.map((r, i) => [r.id, i]));
  const nationIndex = new Map(baseContent.nations.map((n, i) => [n.id, i]));
  /** The nation holding a region now (regions change hands through war, policy and secession). */
  const ownerOf = (index: number) => game.state?.regionOwners[regions[index]!.id] ?? regions[index]!.nationId;
  /** Armies no faction commands answer to their national government: neutral grey. */
  const NATIONAL_ARMY = "#aab3bb";
  const OCCUPIER = "#d0463a";

  const selectedArmy = $derived(game.state?.armies.find((a) => a.id === game.selectedArmyId) ?? null);
  /** Where the selected army can go, by region index, while choosing a destination. */
  const destinations = $derived.by(() => {
    const out = new Map<number, MoveCheck & { ok: true }>();
    const state = game.state;
    const army = selectedArmy;
    if (!state || !army || !game.armyMoveMode) return out;
    const here = regionDef(baseContent, army.regionId);
    const candidates = army.navy && here.coastal ? regions.filter((r) => r.coastal || here.neighbors.includes(r.id)) : here.neighbors.map((id) => regionDef(baseContent, id));
    for (const r of candidates) {
      const check = checkMove(state, baseContent, army, r.id);
      if (check.ok) out.set(regionIndex.get(r.id)!, check);
    }
    return out;
  });

  /** The region picked for a nuclear strike, waiting for the player to confirm it. */
  let nukeTarget = $state<string | null>(null);
  $effect(() => {
    if (!game.nukePick) nukeTarget = null;
  });

  function launchNuke() {
    const pick = game.nukePick;
    if (!pick || !nukeTarget || !game.playerFactionId) return;
    void game.command({ type: "nuclearStrike", factionId: game.playerFactionId, nationId: pick.nationId, regionId: nukeTarget }).then((result) => {
      if (result.ok) game.nukePick = null;
    });
  }

  /** The mission target under a region while aiming on the globe, if it is a valid one. */
  function pickTarget(index: number) {
    const pick = game.globePick;
    if (!pick) return undefined;
    const region = regions[index]!;
    return pick.targets.get(pick.scope === "region" ? region.id : ownerOf(index));
  }

  function clickRegion(index: number | null) {
    // Aiming a councilor's mission: a click on a valid target assigns it.
    const pick = game.globePick;
    if (pick && game.playerFactionId && game.selectedCouncilorId) {
      const target = index === null ? undefined : pickTarget(index);
      if (!target) return;
      void game.command({ type: "assignMission", factionId: game.playerFactionId, councilorId: game.selectedCouncilorId, mission: target.mission }).then((result) => {
        if (result.ok) game.globePick = null;
      });
      return;
    }
    // Aiming nuclear weapons: a click on a target asks to confirm.
    if (game.nukePick) {
      const id = index === null ? null : regions[index]!.id;
      if (id && game.nukePick.targets.has(id)) nukeTarget = id;
      return;
    }
    const army = selectedArmy;
    if (game.armyMoveMode && army && game.playerFactionId) {
      if (index === null) return;
      void game.command({ type: "moveArmy", factionId: game.playerFactionId, armyId: army.id, regionId: regions[index]!.id }).then((result) => {
        if (result.ok) game.armyMoveMode = false;
      });
      return;
    }
    game.selectedNationId = index === null ? null : ownerOf(index);
    // The nation panel takes the upper left back from a rival councilor's.
    game.rivalCouncilorId = null;
  }

  /** Our councilor opens in Faction Assets; another faction's in the Rival Councilor panel. */
  function clickCouncilor(id: string) {
    const ours = game.state?.factions.find((f) => f.id === game.playerFactionId)?.councilors.some((c) => c.id === id);
    if (ours) {
      game.selectedCouncilorId = id;
      game.selectedArmyId = null;
      game.armyMoveMode = false;
    } else game.rivalCouncilorId = id;
  }

  /** Set when the browser can't give us WebGL (e.g. hardware acceleration is off). */
  let webglError = $state(false);

  $effect(() => {
    let g: Globe;
    try {
      g = new Globe(
        container,
        regions.length,
        clickRegion,
        (index) => (hovered = index),
      );
      g.onSelectArmy = (id) => {
        game.selectedArmyId = id;
        game.selectedCouncilorId = null;
        game.armyMoveMode = false;
      };
      g.onSelectCouncilor = clickCouncilor;
      // Drawn over the Solar System view, which follows the globe's camera.
      g.overlay();
      g.onFrame = (camera) => handoff.solar?.followGlobe(camera);
      g.onZoomOut = (direction, distance) => {
        hovered = null;
        handoff.direction.copy(direction);
        handoff.distance = distance;
        game.view = "solar";
      };
    } catch (error) {
      console.error(error);
      webglError = true;
      return;
    }
    globe = g;
    return () => {
      g.dispose();
      globe = null;
    };
  });

  // The globe rests while the Solar System view has the camera, and takes it back where that view left it.
  let shownView: typeof game.view = "earth";
  $effect(() => {
    if (!globe) return;
    const earth = game.view === "earth";
    if (earth && shownView !== "earth") globe.setCamera(handoff.direction, handoff.distance, handoff.glide ? GLIDE_TO : undefined);
    shownView = game.view;
    globe.setActive(earth);
  });

  // The sun follows the game clock.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    const start = baseContent.rules.startYear;
    const year = dateOfDay(start, state.dayIndex).year;
    globe.setTime(state.dayIndex - dayOfDate(start, { year, month: 1, day: 1 }), game.dayFraction);
    globe.setGameMinute((state.dayIndex + game.dayFraction) * MINUTES_PER_DAY);
  });

  // Stratospheric aerosols grey the atmosphere. A volcano (~0.01 ppm) barely shows; a dozen
  // nuclear strikes (~0.1 ppm, about −2.5 °C) make a heavy ashen veil.
  $effect(() => {
    const aerosols = game.state?.climate.aerosols ?? 0;
    globe?.setHaze(1 - Math.exp(-aerosols / 0.12));
  });

  // Turn toward whatever asked for the camera (e.g. an army picked from Faction Assets).
  $effect(() => {
    const target = game.focus;
    if (!target || !globe) return;
    globe.lookAt(target);
    game.focus = null;
  });

  /** Strikes already flown (or there when the game loaded), so each missile flies once. */
  let seenStrikes: Set<string> | null = null;
  /** The markers last shown, by army id, with the region each stood in. */
  let shownArmies = new Map<string, { regionId: string; marker: ArmyMarker }>();
  /** Armies a missile in flight is about to hit keep their old markers until it lands (performance.now() ms). */
  let held: { until: number; markers: ArmyMarker[] }[] = [];
  /** Bumped when a held marker's missile lands, to redraw the armies. */
  let landed = $state(0);

  /** Flies a missile for each new strike, holding the armies it hits on the map until impact. */
  function flyStrikes(state: GameState, g: Globe) {
    if (!seenStrikes) {
      seenStrikes = new Set(state.strikes.map((s) => s.id));
      return;
    }
    for (const strike of state.strikes) {
      if (seenStrikes.has(strike.id)) continue;
      seenStrikes.add(strike.id);
      const from = regionDef(baseContent, strike.fromRegionId);
      const to = regionDef(baseContent, strike.regionId);
      const seconds = g.launchMissile({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }, factionColor.get(strike.factionId) ?? "#ffffff");
      const markers = [...shownArmies.values()].filter((a) => a.regionId === strike.regionId).map((a) => a.marker);
      if (markers.length === 0) continue;
      held.push({ until: performance.now() + seconds * 1000, markers });
      setTimeout(() => (landed += 1), seconds * 1000 + 20);
    }
  }

  // Armies on their regions, side by side where several stand together.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    void landed;
    flyStrikes(state, globe);
    const stacked = new Map<string, number>();
    // Slots first, so each army in a battle can face the enemies standing beside it.
    const slots = new Map<string, number>();
    for (const a of state.armies) {
      if (a.move) continue;
      const slot = stacked.get(a.regionId) ?? 0;
      slots.set(a.id, slot);
      stacked.set(a.regionId, slot + 1);
    }
    const fightingFacing = (a: (typeof state.armies)[number]): 1 | -1 | null => {
      if (a.move) return null;
      const foes = state.armies.filter((b) => !b.move && b.regionId === a.regionId && atWar(state, a.nationId, b.nationId));
      if (foes.length === 0) return null;
      const mean = foes.reduce((sum, b) => sum + slotOffset(slots.get(b.id)!), 0) / foes.length;
      return mean < slotOffset(slots.get(a.id)!) ? -1 : 1;
    };
    const markers: ArmyMarker[] = state.armies.map((a) => {
      const region = regionDef(baseContent, a.regionId);
      const to = a.move ? regionDef(baseContent, a.move.toRegionId) : null;
      const slot = slots.get(a.id) ?? 0;
      const facing = fightingFacing(a);
      const commander = armyCommander(state, a);
      return {
        id: a.id,
        at: { lat: region.lat, lon: region.lon },
        move: a.move && to ? { to: { lat: to.lat, lon: to.lon }, departAt: a.move.departAt, arriveAt: a.move.arriveAt, naval: a.move.naval, airlift: a.move.airlift ?? false } : null,
        color: commander ? (factionColor.get(commander) ?? NATIONAL_ARMY) : NATIONAL_ARMY,
        health: a.health,
        navy: a.navy,
        selected: a.id === game.selectedArmyId,
        slot,
        fighting: facing ? { facing } : null,
      };
    });
    shownArmies = new Map(markers.map((m, i) => [m.id, { regionId: state.armies[i]!.move ? "" : state.armies[i]!.regionId, marker: m }]));
    // Struck armies stay as they were until the missile lands.
    const now = performance.now();
    held = held.filter((h) => h.until > now);
    const stand = new Map(held.flatMap((h) => h.markers.map((m) => [m.id, m] as const)));
    for (const [id] of stand) shownArmies.set(id, { regionId: "", marker: stand.get(id)! });
    globe.setArmies([...markers.filter((m) => !stand.has(m.id)), ...stand.values()]);
  });

  // Occupied regions, hatched in the colour of the main occupier's executive faction.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    const byNation = new Map(state.nations.map((n) => [n.id, n]));
    globe.setOccupation(
      regions.map((r) => {
        const shares = Object.entries(state.occupation[r.id] ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        if (shares.length === 0) return { color: null, strength: 0 };
        const exec = byNation.get(shares[0]![0])?.controlPoints[0]?.owner;
        return { color: (exec && factionColor.get(exec)) || OCCUPIER, strength: occupiedShare(state, r.id) };
      }),
    );
  });

  // Our councilors flying from the region they are in to their mission's region, until the
  // mission resolves and they stay there.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    const faction = state.factions.find((f) => f.id === game.playerFactionId);
    const color = factionColor.get(game.playerFactionId ?? "") ?? "#ffffff";
    const flights: Flight[] = [];
    for (const c of faction?.councilors ?? []) {
      if (!c.mission) continue;
      const to = regionDef(baseContent, missionRegion(state, baseContent, c, c.mission));
      if (to.id === c.regionId) continue;
      const from = regionDef(baseContent, c.regionId);
      // Keyed by destination too, so choosing a different target starts a new flight.
      flights.push({ id: `${c.id}:${to.id}`, from: { lat: from.lat, lon: from.lon }, to: { lat: to.lat, lon: to.lon }, color });
    }
    globe.setFlights(flights);
  });

  // Councilors on the map. Ours always stand where they are, or at their mission's region once
  // their airplane lands (see the flights above), and stay there after the mission. Another
  // faction's councilor on a mission shows once we have located them (grey until identified),
  // where they are now, or at their mission's region once our intel reveals their mission.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    const rules = baseContent.rules.missions;
    const stacked = new Map<string, number>();
    const markers: CouncilorMarker[] = [];
    const place = (id: string, regionId: string, color: string | null, flightId: string | null) => {
      const region = regionDef(baseContent, regionId);
      const slot = stacked.get(regionId) ?? 0;
      stacked.set(regionId, slot + 1);
      markers.push({ id, at: { lat: region.lat, lon: region.lon }, color, selected: id === game.selectedCouncilorId || id === game.rivalCouncilorId, slot, flightId });
    };
    const ours = state.factions.find((f) => f.id === game.playerFactionId);
    for (const c of ours?.councilors ?? []) {
      const to = c.mission ? missionRegion(state, baseContent, c, c.mission) : c.regionId;
      place(c.id, to, factionColor.get(ours!.id) ?? null, to === c.regionId ? null : `${c.id}:${to}`);
    }
    for (const f of state.factions) {
      if (f === ours || !ours) continue;
      for (const c of f.councilors) {
        const intel = intelOn(state, ours.id, c.id);
        if (!c.mission || intel < rules.intelToLocate || state.hidden.includes(c.id)) continue;
        const regionId = intel >= 0.75 ? missionRegion(state, baseContent, c, c.mission) : c.regionId;
        place(c.id, regionId, intel >= rules.intelToTarget ? (factionColor.get(f.id) ?? null) : null, null);
      }
    }
    globe.setCouncilors(markers);
  });

  // City lights: brighter where people are dense, dimmer where they are poor.
  // 1 person/km² gives none, 1000/km² full density; GDP per capita of $20K+ lights fully.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    const byNation = new Map(state.nations.map((n) => [n.id, n]));
    globe.setLights(
      regions.map((r) => {
        const nation = byNation.get(state.regionOwners[r.id]!)!;
        const perKm2 = (r.population * 1e6) / Math.max(r.areaKm2, 1);
        const crowding = Math.min(1, Math.max(0, Math.log10(Math.max(perKm2, 1)) / 3));
        const wealth = Math.sqrt(Math.min(1, gdpPerCapita(nation) / 20));
        return crowding * (0.15 + 0.85 * wealth);
      }),
    );
  });

  // The nation under the mouse glows to show it can be clicked; while aiming nuclear weapons, only a target region does; while choosing a destination,
  // only the hovered region does, and only if the army can go there.
  $effect(() => {
    if (!globe) return;
    const index = hovered;
    if (index === null) globe.setHover([]);
    else if (game.nukePick) globe.setHover(game.nukePick.targets.has(regions[index]!.id) ? [index] : []);
    else if (game.globePick) {
      const pick = game.globePick;
      const nationId = ownerOf(index);
      if (!pickTarget(index)) globe.setHover([]);
      else if (pick.scope === "region") globe.setHover([index]);
      else globe.setHover(regions.flatMap((_, i) => (ownerOf(i) === nationId ? [i] : [])));
    }
    else if (game.armyMoveMode && selectedArmy) globe.setHover(destinations.has(index) ? [index] : []);
    else {
      const nationId = ownerOf(index);
      globe.setHover(regions.flatMap((_, i) => (ownerOf(i) === nationId ? [i] : [])));
    }
  });

  // Regions take the colour of whoever holds their nation's executive CP; nations where
  // factions hold CPs but nobody holds the executive get a faint tint of the largest holder.
  $effect(() => {
    const state = game.state;
    if (!state || !globe) return;
    const selected = game.selectedNationId;
    const byNation = new Map<string, RegionTint>();
    for (const nation of state.nations) {
      const exec = nation.controlPoints[0]?.owner ?? null;
      let color: string | null = exec ? (factionColor.get(exec) ?? null) : null;
      let strength = exec ? 0.45 : 0;
      if (!exec) {
        const counts = new Map<string, number>();
        for (const cp of nation.controlPoints) if (cp.owner) counts.set(cp.owner, (counts.get(cp.owner) ?? 0) + 1);
        const top = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        if (top) {
          color = factionColor.get(top[0]) ?? null;
          strength = 0.18;
        }
      }
      if (nation.id === selected) {
        color = color ?? "#ffffff";
        strength = Math.max(strength + 0.2, 0.3);
      }
      byNation.set(nation.id, { color, strength });
    }
    // Choosing a destination: the regions the army can reach light up; aiming nuclear weapons, the targets glow red.
    const reachable = destinations;
    const nukeTargets = game.nukePick?.targets;
    globe.setTints(
      regions.map((r, i) =>
        r.id === nukeTarget
          ? { color: "#ff3a2a", strength: 0.85 }
          : nukeTargets?.has(r.id)
            ? { color: "#ff4a3a", strength: 0.5 }
            : reachable.has(i)
              ? { color: "#7cf07a", strength: 0.55 }
              : (byNation.get(state.regionOwners[r.id]!) ?? { color: null, strength: 0 }),
      ),
    );
  });

  // National borders follow who holds each region.
  $effect(() => {
    const owners = game.state?.regionOwners;
    if (!owners || !globe) return;
    globe.setOwners(regions.map((r) => nationIndex.get(owners[r.id]!)!));
  });
</script>

<div class="globe" class:resting={game.view !== "earth"} bind:this={container}></div>
{#if webglError}
  <div class="webgl-error panel">
    <strong>The globe needs WebGL, which this browser isn't providing.</strong>
    <span class="muted">Turn on hardware acceleration in the browser settings, or restart the browser if its graphics process has crashed (see chrome://gpu or brave://gpu).</span>
  </div>
{/if}
<svelte:window
  onkeydown={(e) => {
    if (e.key !== "Escape") return;
    if (game.globePick) game.globePick = null;
    if (game.nukePick) game.nukePick = null;
  }}
/>
{#if game.nukePick}
  {@const launcher = nationName.get(game.nukePick.nationId)}
  <div class="mode panel nuke">
    {#if nukeTarget}
      {@const region = regionDef(baseContent, nukeTarget)}
      Launch a nuclear strike from {launcher} on {region.name}, {nationName.get(game.state?.regionOwners[nukeTarget] ?? region.nationId)}?
      <button class="launch" onclick={launchNuke}>Launch</button>
      <button onclick={() => (nukeTarget = null)}>Back</button>
    {:else}
      Nuclear strike from {launcher}: click a target region (red). Esc cancels.
      <button onclick={() => (game.nukePick = null)}>Cancel</button>
    {/if}
  </div>
{/if}
{#if game.globePick}
  <div class="mode panel">
    {MISSION_NAMES[game.globePick.type]}: click {game.globePick.scope === "region" ? "a region" : "a country"} on the globe. Esc cancels.
    <button onclick={() => (game.globePick = null)}>Cancel</button>
  </div>
{/if}
{#if game.armyMoveMode && selectedArmy}
  <div class="mode panel">
    Choose where to send the army: the green regions are in reach.
    <button onclick={() => (game.armyMoveMode = false)}>Cancel</button>
  </div>
{/if}
{#if hovered !== null}
  {@const region = regions[hovered]!}
  {@const occupied = game.state ? occupiedShare(game.state, region.id) : 0}
  {@const trip = destinations.get(hovered)}
  <div class="hover panel" class:above-bar={game.state?.phase === "council"}>
    <strong>{region.name}</strong>
    <span class="muted">{nationName.get(ownerOf(hovered))}</span>
    {#if occupied > 0}<span class="bad">{Math.round(occupied * 100)}% occupied</span>{/if}
    {#if trip}<span class="good">{trip.naval ? "By sea" : "Overland"}: {trip.days.toFixed(1)} days</span>{/if}
    {#if game.nukePick}
      {#if game.nukePick.targets.has(region.id)}<span class="bad">Nuclear target</span>{:else}<span class="muted">Out of reach</span>{/if}
    {/if}
    {#if game.globePick}
      {@const target = pickTarget(hovered)}
      {#if target}
        <span class={target.chance === null || target.chance >= 0.7 ? "good" : target.chance >= 0.4 ? "" : "bad"}>
          {MISSION_NAMES[game.globePick.type]}: {target.chance === null ? "100%" : `${Math.round(target.chance * 100)}%`}
        </span>
      {:else}
        <span class="muted">Not a valid target</span>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .globe {
    position: absolute;
    inset: 0;
  }
  /* The Solar System view beneath has the camera, and the mouse. */
  .globe.resting {
    pointer-events: none;
  }
  .webgl-error {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: 420px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: center;
  }
  .mode {
    position: absolute;
    top: 122px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 6px 5px 12px;
    border-color: var(--good);
    z-index: 6;
  }
  .mode.nuke {
    border-color: var(--bad);
  }
  .mode .launch {
    border-color: var(--bad);
    color: #ff8a7a;
  }
  .hover {
    position: absolute;
    left: 50%;
    bottom: 12px;
    z-index: 6;
    transform: translateX(-50%);
    padding: 3px 10px;
    pointer-events: none;
    display: flex;
    gap: 8px;
  }
  /* Clear of the mission hexes during a council phase. */
  .hover.above-bar {
    bottom: 84px;
  }
</style>
