# Conquest of Sol: Game Design & Implementation Spec

**Status:** Draft v0.3 (engine switched to Three.js, see 2.21) · **Date:** 2026-10-19 · **Working title:** *Conquest of Sol*

> A grand-strategy 4X game about a secret, ideology-driven struggle to control Earth and then the Solar System as an alien presence arrives. It is inspired by *Terra Invicta* (Pavonis Interactive, 2022).

---

## Part 1: Reference Research: *Terra Invicta*

This section summarizes what *Terra Invicta* does. It is our baseline for which features to keep, change, or drop.

### 1.1 Overview
- Developer: Pavonis Interactive (makers of the XCOM 2 *Long War* mods). Publisher: Hooded Horse.
- Early Access began September 2022. **Version 1.0 released January 5, 2026** on Steam, GOG, Epic, Microsoft Store and PC Game Pass.
- Genre: a 4X grand-strategy hybrid. It blends a Paradox-style Earth layer with hard-science space colonization and Newtonian tactical combat.
- Premise: an alien probe arrives and humanity splits into **seven ideological factions**. They fight a secret war for control of Earth's governments while preparing to fight, appease, flee from, or serve the aliens.

### 1.2 Factions (player and AI)
Seven factions, each with its own ideology, objectives and victory condition:

| Faction | Stance |
|---|---|
| The Resistance | Fight the aliens and drive them out |
| Humanity First | Exterminate the aliens at any cost, xenophobic and authoritarian |
| The Academy | Understand the aliens and cooperate peacefully, science-driven |
| The Initiative | Profit from the situation, cynical and corporate |
| Project Exodus | Flee the Solar System in a colony ship |
| The Protectorate | Negotiate humanity's survival as an alien vassal |
| The Servants | Worship the aliens and assist the takeover |

- Each faction has rotating **objectives**, and some victory conditions overlap.
- Faction relations and AI behavior depend on ideology. For example, the anti-alien factions gang up on the pro-alien ones.
- **Public opinion**: every nation has a population split by support for each faction's ideology. That split drives control-point costs and how hard missions are.

### 1.3 Earth layer: nations and regions
- About 200 real-world nations (some small ones are grouped), divided into **regions**. Version 1.0 added more regions and more formable nations.
- **Scenarios**: a 2026 start (it replaced the old 2022 start) and a **2070 mid-game start** in which colonies already exist and the aliens are active.
- Nation stats include population, GDP, GDP per capita, **education**, **inequality**, **cohesion**, **democracy/government score**, **unrest** (0–10, with bands from *Peaceful* through *Civil War*), **sustainability/climate**, research output, military tech level, armies, navies, nuclear weapons, **space launch facilities**, and **Boost** and **Mission Control** output.
- **Control Points (CPs)**: each nation has several CPs, more for bigger economies. These stand for the nation's political, economic and military leadership. A faction that holds CPs directs that nation's investments. Holding the **executive CP** grants foreign-policy control. Holding many CPs costs more, through a **control cap** and influence upkeep.
- **National priorities ("investment points")**: every month a nation produces IP from its GDP. CP holders assign that IP to priorities:
  - National characteristics: Economy, Welfare, Knowledge, Environment, Government, Unity, Oppression
  - Faction resources: Funding (money), Spoils (money, with harm to the nation), Boost, Mission Control
  - Military and space: Found Military, Military (tech), Build Army, Build Navy, Develop Atomic Bomb, Nuclear Weapons, Found Space Program, Space Defenses
- **Diplomacy and war**: nations can be rivals or allies, can form **federations**, and can **unify** into larger nations when they hold claims, usually unlocked by tech ("great nations" formables). Only rivals can go to war. Armies move between regions and **invade**, which captures capitals and installs friendly governments. **Nuclear war** is possible and causes nuclear winter.
- **Climate** shifts with emissions and environment policy.

### 1.4 Councilors (agents)
- Each faction recruits a small council of agents. The number grows with tech and objectives.
- **Professions** (e.g. Activist, Spy, Commander, Executive, Scientist, Journalist, Politician, Inspector, Diplomat, Tycoon, Hacker, Operative, Kingpin, Astronaut and others) set stat ranges, available missions and possible traits.
- **8 attributes**: Persuasion, Investigation, Espionage, Command, Administration, Science, Security, Loyalty.
- **Traits**: positive, negative and hidden (e.g. a vice that makes the councilor vulnerable to turning).
- **XP** pays for attribute increases or new traits, or for removing bad traits.
- **Orgs**: governments, companies and criminal syndicates, bought from a rotating per-faction market with Money/Influence/Ops/Boost. Each is assigned to a councilor and gives stat bonuses and resource income. Org capacity is capped by Administration.
- **Missions** run once per turn-phase (two per month). Contested missions resolve by stat versus resistance:
  - Control & politics: Control Nation (seize CP), Purge, Coup, Crackdown, Defend Interests, Public Campaign, Stabilize, Unrest/Riot, Set National Policy, Advise (boosts the nation through Admin/Science/Command)
  - Intelligence: Investigate Councilor, Detect Councilor Activity, Gain Intel, Inspect / Turn Councilor (defect), Detain, Assassinate
  - Economic: Steal Project, Sabotage Facilities, Sabotage Project/Hab, Hostile Takeover (steal org)
  - Alien-facing: Investigate/Assault Alien Asset, Detain Alien
  - Space: Transfer to hab/ship, Command a fleet, Orbital Defense
- **Detection and security**: an exposed councilor becomes a target. Security reduces the chance of being turned or assassinated.

### 1.5 Resources & economy
- **Money**, **Influence** (spent on CPs and missions), **Operations/Ops** (spent on mission boosts and covert work), **Boost** (the ability to lift mass to orbit), **Mission Control (MC)** (the cap on space assets), **Research** (shared and private).
- **Space resources**: Water, Volatiles, Metals, Noble Metals, Fissiles, and later **Antimatter** and **Exotics**, the last mostly from aliens.
- Resources mined in space can be sold back on Earth, and space-built things avoid Boost costs.

### 1.6 Research
- **Global research**: all factions add points to shared technology. The biggest contributors get first pick of the **projects** each tech unlocks, and the faction that contributes most chooses the next global tech. Factions can compete for discoveries or cooperate on them.
- **Faction projects**: private research in three slots, covering ship modules, hab modules, mission upgrades, orgs and engines.
- The tech tree spans Earth politics, materials, energy, propulsion (from chemical up to fusion and antimatter drives), weapons, life science, information science, social science and xenology.

### 1.7 Space layer
- A real 3D Solar System with Keplerian orbits. Planets, moons, asteroids, comets and Lagrange points all have **mining sites** that must be **prospected**.
- **Habs** come in two classes: **Bases** (surface) and **Stations** (orbital). Tiers go **Outpost → Settlement/Platform → Colony/Ring**, giving 4 / 12 / 20 module slots plus the core. Modules include power (solar, fission, fusion, antimatter), mines, farms, habitation, science labs, shipyards, defense batteries, marine barracks, administration, Mission Control, tourism/casinos and alien-tech modules.
- New habs are founded by launching a core from Earth with Boost, by ships carrying construction kits, or from an existing hab's construction module in the same system.
- **Orbital transfers** use realistic Hohmann/Lambert trajectories with launch windows, delta-v, acceleration and travel time.
- **Mission Control** caps how many space assets a faction can hold. Exceeding it brings penalties.

### 1.8 Ships & space combat
- **Ship designer**: hull class (gunship, corvette, frigate, destroyer, cruiser, battleship, dreadnought, monitor, titan…), drive (thrust, exhaust velocity, propellant type), power plant, radiators (heat management), armor by facing (nose/lateral/tail) and material, utility modules, propellant tanks, and weapons in nose and hull hardpoints.
- **Weapons**: lasers (range falls off, beats armor up close), particle beams, kinetic guns, railguns and coilguns, plasma weapons, and missiles/torpedoes against point defense.
- **Strategic fleet ops**: transfer, intercept, prospect, found hab, bombard Earth targets, land marines/assault hab, resupply/refuel/repair at a hab.
- **Tactical combat**: optional real-time-with-pause Newtonian 3D battles (or auto-resolve). Ships manage delta-v, heat, facing and acceleration. Version 1.0 reworked combat and added new ship classes and Earth "exo fighters".
- Common criticisms: combat feels unintuitive and finicky, and players can go a dozen or more hours before their first fleet battle.

### 1.9 The aliens
- The aliens grow from the edges of the Solar System toward the core.
- **Alien Threat Level** (0–5, with hidden "hate" behind it) rises when factions hit alien assets. At high levels the aliens attack habs and fleets.
- Earth activity: **abductions**, **xenoforming** that spreads over regions and brings **megafauna**, alien councilors and agents, and crashed UFOs.
- Pro-alien factions gain from the aliens' activity. The endgame is a military escalation in which the aliens land on Earth.

### 1.10 Presentation and pacing
- One continuous 3D view from the Earth's globe out to the whole Solar System: zooming out, the globe fades into a pixel-art Earth among the other bodies, with time controls (pause, multiple speeds).
- Turn structure: mission phases run twice a month, everything else runs in real-time-with-pause.
- Strengths: depth, ideological factions and scientific grounding. Weaknesses: a punishing learning curve, slow pacing, UI density and late-game micromanagement.

### Sources
- [Steam store page](https://store.steampowered.com/app/1176470/)
- [Hooded Horse Terra Invicta wiki: Nations](https://wiki.hoodedhorse.com/Terra_Invicta/Nations), [Mission Control](https://wiki.hoodedhorse.com/Terra_Invicta/Mission_Control), [Habs](https://wiki.hoodedhorse.com/Terra_Invicta/Habs), [Space Combat](https://wiki.hoodedhorse.com/Terra_Invicta/Space_Combat), [Alien threat level](https://wiki.hoodedhorse.com/Terra_Invicta/Alien_threat_level), [Councilor](https://wiki.hoodedhorse.com/Terra_Invicta/Councilor), [Orgs](https://wiki.hoodedhorse.com/Terra_Invicta/Orgs), [Public Support](https://wiki.hoodedhorse.com/Terra_Invicta/Public_Support)
- [Pavonis Dev Diary #2: Factions](https://pavonisinteractive.com/phpBB3/viewtopic.php?p=56199), [Dev Diary #5: Nations Part 2](https://www.pavonisinteractive.com/phpBB3/viewtopic.php?p=53711)
- [Space4Games: Terra Invicta hits 1.0](https://space4games.com/en/games-en/terra-invicta-hits-1-0-the-deepest-sci-fi-strategy-game-leaves-early-access/), [CogConnected 1.0 launch](https://cogconnected.com/2026/01/terra-invicta-finally-launches-out-of-early-access/)
- [Fingerguns EA review](https://fingerguns.net/games/2022/09/22/terra-invicta-early-access-review-pc-a-brave-new-world/), [Vaporlens review summary](https://vaporlens.app/app/1176470/terra_invicta), [Startmenu review](https://www.startmenu.co.uk/home/review-terra-invicta)

*Note: some numbers come from community wikis or forums and may predate 1.0. In Part 2 we set our own values regardless.*

---

## Part 2: Conquest of Sol Design Spec

### 2.1 Vision & pillars
1. **Shadow politics with a human face.** Councilors are characters with expressive portraits, relationships and personal stories, not just stat blocks.
2. **Readable depth.** Keep Terra Invicta's systemic depth and fix its legibility: show the formula behind every number and introduce systems gradually.
3. **Grounded space, approachable combat.** Use real orbital mechanics at the strategic level. Tactical combat follows Newtonian rules but plays at a readable, cinematic pace.
4. **A long campaign.** A Normal campaign runs about 30–40 hours, Easy about half that and Hard about double (see 2.16).
5. **Earth and space management come first.** Running nations, colonies and later the fleet is the core of the game, as in the reference. Character and story systems support that core but never replace it.

### 2.2 Comparison with Terra Invicta (summary)
| Area | Terra Invicta | Conquest of Sol |
|---|---|---|
| Visuals | Realistic 3D globe and solar system, static portraits | HD-2D: stylized 3D scenes with pixel-art textures and anime-style pixel sprites (see 2.12) |
| Characters | Stat cards with static portraits | Stat cards plus portraits with expression variants, light bonds and short story events (see 2.7) |
| Engine | Unity (C#) | Three.js (TypeScript) (see 2.3) |
| Earth map | 3D globe | Stylized 3D globe with pixel-art textures |
| Combat | 3D Newtonian RTwP, often auto-resolved | Same model, optional with auto-resolve always available, pixel-textured ships and clearer combat feedback (see 2.11.3) |
| Pacing | Very slow early game | Similar overall pace, but systems unlock gradually (Pillar 2) |
| Factions | 7 fixed | 7 original factions (see 2.4), modular so more can be added |

### 2.3 Platform, engine & tech stack
- **Target**: PC (Windows/Linux). Consoles are out of scope for v1 (see 2.19).
- **Engine**: Three.js for rendering, written in **TypeScript** and bundled with Vite.
- **Desktop shell**: **Tauri**. The game runs in the system webview.
  - Risk: on Linux, Tauri uses WebKitGTK, whose WebGL performance lags behind Chromium. An early Three.js benchmark on Linux should check that the HD-2D post-processing (2.12.1) holds frame rate.
- **Architecture**: the simulation is a plain TypeScript module (`sim`) that has no rendering, DOM or wrapper dependencies.
  - It advances on a fixed daily tick and uses a seeded random number generator, so the same seed and inputs always give the same result.
  - In the game it runs in a Web Worker and sends state snapshots and events to the renderer.
  - Under Node it runs headless for automated tests and the `selfplay` balance harness (see 2.15).
- **UI**: a DOM UI layer built with **Svelte 5** over the WebGL canvas, which suits the tooltip-heavy interface in 2.13. Svelte's fine-grained reactivity updates only the numbers that changed when the simulation sends new state, and its small runtime keeps the bundle light.
- **Data & saves**: content definitions, mods and save files are JSON, validated against schemas. Saves are versioned so old saves can be migrated.

### 2.4 Factions (original)
Seven ideological factions mirror the strategic spread of the reference without copying its names or lore. **These names are final** (decision D6):

| ID | Name | Ideology | Victory condition |
|---|---|---|---|
| F1 | **Aegis Coalition** | Defend humanity, expel the visitors | Destroy all alien presence in the inner system and hold 25% of Earth CPs (Normal; scaled by difficulty, see 2.16) |
| F2 | **Iron Dawn** | Total war, human supremacy | Exterminate the aliens *and* defeat every pro-alien faction |
| F3 | **Lumen Institute** | Understanding and contact | Complete the *First Accord* research chain and reach peace with the aliens |
| F4 | **Meridian Consortium** | Profit and power | Control X% of the world economy plus Y space assets by the deadline (values and deadline TBD, see 2.20) |
| F5 | **Ark Covenant** | Escape | Build and launch the generation ship |
| F6 | **The Concord** | Negotiated vassalage | Earth is pacified under an alien-sanctioned government that the Concord controls |
| F7 | **Choir of the Descent** | Devotion to the visitors | The aliens win, with the Choir as their chosen intermediaries |

- Each faction gets a **leader character** (a hero sprite), a color/emblem palette, an HQ diorama, unique starting bonuses, 1–2 unique missions and a unique tech-project branch.
- **Ideology axes** (internal): Alien Stance (−3 to +3) and Means (−3 Order to +3 Freedom). AI diplomacy and public-opinion affinity derive from these axes. A faction with a positive Alien Stance counts as **pro-alien** (e.g. for Iron Dawn's victory condition).

### 2.5 Game loop & time
- **Time model**: real-time-with-pause. The simulation runs in whole game minutes, with a daily tick at midnight. The clock shows the date and the time of day (HH:MM:SS). Speeds are labelled, as in Terra Invicta, by the game time one real second covers: pause, 30m, 1h, 2h, 4h, 8h.
- **Council phase**: **twice per month** time stops and the player assigns councilor missions.
- **Daily tick**: national IP allocation, upkeep, population and GDP growth, and unrest drift. Rates are quoted per month, as in Terra Invicta, and paid out a day at a time, so priority completions and income arrive throughout the month.
- **Missions resolve during the run phase**, as in Terra Invicta ("in a sequence over the next few days or weeks"). When a council phase ends, the resolution sequence is fixed, and each mission gets a random minute before the next council phase. A mission's odds are re-checked when it resolves. The log records the time of each result.
- **Globe**: the sun follows the game clock (taken as UTC) and the seasons, so there is a moving day/night terminator. The night side is dark, with sparse pixel city lights (small round dots) scaled by population density and wealth. A thin atmosphere glows on the lit limb.
- **Event system**: scripted and procedural events with choices. Minor events appear as a pop-up with choices, and story events play as dialogue scenes with portraits (see 2.12.2).

### 2.6 Earth layer
#### 2.6.1 Nations & regions
- **Real-world nations, no real leaders**. Nations, borders, capitals and regions are based on the real world at the scenario start date.
- 178 nations and about 360 regions, generated from real-world data (decision D14; see `docs/data-sources.md`). Dependencies belong to their sovereign, European microstates are folded into their neighbours, and island microstates form two groups.
- **Region stats**: population, urbanization, resources (e.g. oil, rare earths), launch complex (the real sites at the start; Found Space Program builds one at the nation's real site if its data has one, else in a random region), alien xenoforming level, nuclear contamination, a core/claimed flag, and which nation owns it.
- **Nation stats**: GDP, GDP/cap, Education (1 and up), Inequality (1–9), Cohesion (0–10), Democracy (0–10), Unrest (0–10, banded), Sustainability, Research output, Military Tech level, Armies and Navies, Nukes, Space Program, Boost/MC output, **Public Opinion** (a share per faction ideology, plus *Undecided*).
- **Derived formulas** are documented in `docs/formulas.md`, and each one has an in-game tooltip that breaks the number down.

#### 2.6.2 Control Points
- The CP count scales with GDP (1–6). The **Executive CP** controls policy and war.
- To capture a CP, the mission's success chance compares councilor Persuasion plus support from that faction's public opinion against existing defenders.
- **Control Points work exactly as in Terra Invicta** (decision D11). That includes the control cap, Defend Interests, Crackdown, Purge and Coup. Terra Invicta's current rules are the reference for every detail not written here.
  - Going over the control cap reduces influence income and gives Crackdown and Purge a bonus against the faction. Cracked-down or abandoned CPs don't count against the cap.
  - A successful Crackdown on a CP makes a later Purge easier.

#### 2.6.3 National priorities
- **National priorities work as in Terra Invicta** (decision D15). Each month a nation earns IP from its GDP (reduced by unrest and army upkeep). Each CP spends an equal share by its holder's pips (0–3 per priority), with Terra Invicta's diversity bonus. The priorities are:
  Economy, Welfare, Environment, Knowledge, Government, Unity, Military, Oppression, Spoils, Funding, Boost, Mission Control, Found Space Program, Found Military, Build Army, Build Navy, Develop Atomic Bomb, Nuclear Weapons.
  Space Defenses and Build Exofighter arrive with the techs that unlock them.
- Priority effects are population-scaled, so large nations change slowly. GDP grows through the Economy priority and population. Funding, Boost and Mission Control are split between the CP holders.
- **UI**: each priority is a "dial" on a diorama of the nation's capital building, with a hover breakdown. It also has a compact table mode for experienced players.

#### 2.6.4 Diplomacy, war & unification
- Relations: Neutral → Rival → War. Neutral → Ally → **Federation** → **Unification** (requires a claim, usually from a "Formable Nation" tech).
- **Earth military works as in Terra Invicta** (decision D11): armies, navies, war, invasion, occupation, capital capture, and fighting alien ground forces. `docs/formulas.md` ("Armies and war") has every rule.
  - **Armies are units in regions.** Each has a headquarters region, health and optionally a navy. A nation's armies answer to its control points in turn, starting with the Executive, and the faction holding that CP commands the army. Armies nobody commands are moved by the nation's own AI.
  - **Where armies may go**: their own nation, allied nations, and nations they are at war with. They move to adjacent regions over land; an army with a navy can sail between any two coastal regions unless its side is blockaded (outscored at sea). In peacetime an army abroad can be airlifted home.
  - **Combat is daily**: armies in the same region trade fire, region defenses fire at invaders, and an invader that isn't held up takes ground. A region is occupied when its occupation reaches 100%. Armies heal on friendly, quiet ground; destroyed armies refund part of their cost into Build Army.
  - **Capturing the capital** ends the war for that nation and changes its government: every CP goes to the faction holding the lead occupier's executive (or, failing that, to the faction whose armies there are strongest). The fallen nation joins the victors' alliance. First the victors take every region they claim; a nation left with none is absorbed by whoever took the capital.
  - Deployed armies cost more upkeep than armies at headquarters.
- **Relations**: nations are allies, rivals or neither, and rivals can go to war. The executive's faction proposes or ends alliances and declares or ends rivalries for 10 influence. Wars are declared, joined and ended with a councilor's **Set National Policy** mission. When war is declared, the defender's allies join, and the attacker's allies join if the same faction holds their executive. A peace offer goes to the other side's leader. The campaign starts with a short list of real-world rivalries and alliances (`src/content/relations.json`).
- **Nuclear weapons work as in Terra Invicta** (decision D11). Strikes destroy armies in the target region and damage its economy and population. They also feed nuclear winter (2.6.5). Nuclear use counts as an atrocity, which costs the faction that ordered it public opinion. Building a new nuclear program costs public opinion too.

#### 2.6.5 Climate
- **Climate change works as in Terra Invicta** (built 2026-10-27; `src/sim/climate.ts`, rules in docs/formulas.md under "Climate"). CO₂, methane and nitrous oxide above their baselines warm the Earth and stratospheric aerosols cool it; the sum is the Global Temperature Anomaly. Each nation emits in proportion to its Pollution Multiplier (Sustainability is its inverse). The Spoils priority adds pollution and gases, and the Environment priority cuts pollution and, at 10 Sustainability, takes gases back out. Warming costs every nation GDP and adds Inequality, scaled by inequality and by how many of its people live in ecologically vulnerable or protected regions. The sea rises and ice shelves collapse. Volcanoes and Arctic methane eruptions happen at random.
- Environmental Degradation, Wet Bulb Disasters and Global Crop Failures ask the faction running the struck nation what to do (built 2026-10-27). A player answers in a dialog while the clock waits. Nuclear strikes add aerosols.
- The globe has a thin shining atmosphere and a handful of drifting pixel clouds; stratospheric aerosols grey it all toward an ashen veil, as in Terra Invicta (built 2026-10-27).
- Still to build: the effects of a sea level above +60 cm, ocean travel effects, and melting ice shown on the globe.

### 2.7 Councilors
- **Council size**: starts at 4 and grows to 8 or more through techs and objectives.
- **Recruitment pool**: 3 candidates each month, generated procedurally from professions, nationality, traits and a **sprite composer** (see 2.12.3).
- **Attributes**: Persuasion, Investigation, Espionage, Command, Administration, Science, Security, Loyalty (1–25).
- **Loyalty and Apparent Loyalty work exactly as in Terra Invicta** (decision D11). The faction sees only Apparent Loyalty, and the true value stays hidden until Investigate Councilor checks it. Loyalty resists Turn Councilor and interrogation. A turned councilor stays in the council but secretly works for the other faction as well. Inspire raises a councilor's loyalty and can bring a turned councilor back (implemented without the un-turning, which waits for Turn Councilor; see docs/formulas.md).
- **Professions** (25, Terra Invicta's human professions): Activist, Spy, Officer, Executive, Scientist, Journalist, Politician, Inspector, Diplomat, Tycoon, Hacker, Commando, Kingpin, Astronaut, Rebel, Operative, Fixer, Judge, Evangelist, Investigator, Celebrity, Tech Mogul, Professor, Attorney, Engineer. Each has Terra Invicta's odds of turning up and its starting attribute ranges.
- **Traits**: about 60 at launch, including hidden "secret" traits revealed by Investigate.
- **New: Bonds (lightweight, decision D4).** The system is deliberately simple and stays secondary to nation and colony management:
  - Each pair of councilors has one **bond value** (−3 Rival … +3 Close). Romance is a flag that only some pairs can unlock at +3.
  - Bonds shift from shared successful missions, opposing traits, and choices made in events.
  - The effects are small: a +5% success chance when bonded councilors work the same target, and a small loyalty change. The detailed rules are deferred and will be designed later (see 2.20).
  - **Story events** are short dialogue scenes (2–4 exchanges with portraits and 1–3 choices) that fire at bond thresholds or after notable missions. Expect about 2–3 per councilor across a campaign.
  - There is no dating sim, gift system or separate relationship screen. Bonds appear on the councilor card.
- **XP** buys attribute increases, new traits or trait removal. **Orgs** slot into a councilor (capacity = Administration).
- **Missions**: a mission is a councilor's current assignment. Each councilor takes one mission per council phase (2.5), as in Terra Invicta.
  - Councilors are named for their home nation: given name first, from one of about 60 cultural name pools (`src/content/names.json`), with female family-name forms where a language has them (Kowalski → Kowalska, Ivanov → Ivanova).
  - Councilors have a location: a region, starting in their home nation's capital region. A mission takes them to its region: the region it targets (Surveil Location, Go To Ground), the region of the councilor it targets, their current region for a mission in the nation they are already in, or else the nation's capital region. While a mission in another region is pending, the globe shows them flying there as a tiny pixel airplane on a dotted arc. Missions aimed at a whole country (Control Nation, Defend Interests, Coup d'État, Public Campaign, Stabilize Nation, Advise) or a region (Surveil Location, Go To Ground, Increase Unrest) are aimed on the globe rather than from a list: hovering lights up a valid country (or a single region) and shows the odds, and a click assigns the mission. Missions with other targets (a control point, a councilor, a policy) keep the target list.
  - The launch set is Terra Invicta's current mission list (1.4), plus *Infiltrate Hab* and *Propaganda Broadcast*.
  - Missions are data-driven, with a target type, a key stat, a cost, a resistance formula and outcome tables.
- **Mission visuals**: each mission type has a short HD-2D vignette (≤5 s, skippable and batchable) set in one of about 12 reusable dioramas: an office, a street protest, a server room, a rooftop, a launch pad, a hab corridor, and so on.

### 2.8 Resources
| Resource | Source | Use |
|---|---|---|
| Money | Funding, Spoils, orgs, hab modules, resource sales | Everything |
| Influence | Public opinion, orgs, traits | CP upkeep, missions |
| Ops | Orgs, traits, Oppression | Mission boosts, covert actions |
| Boost | Space programs, launch sites | Lift mass from Earth |
| Mission Control | MC priority, hab modules | Cap on space assets |
| Research | National Knowledge, labs | Global and faction research |
| Water / Volatiles / Metals / Noble Metals / Fissiles | Space mining | Construction, propellant, power |
| Antimatter | Late-game facilities | Drives, weapons |
| Exotics | Alien wrecks and sites | Alien-derived tech |

### 2.9 Research
- **Research production**: nations produce research by Terra Invicta's formula (population, wealth, Education, Government, Cohesion and Unrest), paid to the holders of their control points. Factions also have a small base income, and councilors add research from traits and orgs.
- **Global tech tree**: Terra Invicta's 142 techs (names, categories, costs, prerequisites and the effects we simulate, such as the Miltech cap), three researched at once with shared contribution. The top contributor picks the next tech in that slot; a player's pick stops the clock. Ties go to the first faction in order.
- **Faction projects**: each faction researches its own, in up to three slots (one free, one from a research org, one from habs later). Projects unlock with a roll once their prerequisites are done, then wait to become available (a chance each month). The set comes from Terra Invicta's game files: the 136 projects whose effects act on systems we have, that unlock claims, or that lead to them. Their effects cover priority bonuses, mission bonuses, control point upkeep and capacity (Management Research adds 5 capacity per completion, where Terra Invicta cuts upkeep 5%), council seats, the mission spend slider, recruits, research, orgs, diplomacy, claims and one-time grants. Some are faction-specific, and some can be completed only once in the world. Stealing and sabotage come with those missions.
- **Research panel**: opened from the top bar's research figure, and on its own when we must pick a tech or, after one of our projects completes, the next project (the clock waits for both). It has no title bar of its own; Global Research's title bar holds the close button. It shows the global techs with their descriptions and effects, progress, each faction's contribution (a bar in the factions' colours), our share, the leader and our pips, then our project slots with each project's effects. Picking a tech or project opens the Select Research sheet: the choices on the left, the highlighted one's details (effects, cost, what it leads to) on the right. An archive button on each title bar opens the same sheet listing the completed global research or projects. The nation panel's Development table has a research row.
- **Categories**: Social Science, Military Science, Information Science, Life Science, Materials, Energy, Propulsion, Space Science, Xenology.
- **UI**: a pannable "constellation" tree. Each node has pixel-art iconography and a short flavor line.

### 2.10 Space layer
#### 2.10.1 The Solar System
- Keplerian orbits for 8 planets, the major moons, the dwarf planets, about 150 named asteroids and comets, and the Earth–Moon/Sun–Earth Lagrange points.
- **Built so far (the System View)**: 485 bodies from Terra Invicta's space-body data (`src/content/solarSystem.json`, made by `tools/data/build_solar.py`): the Sun, 8 planets, 19 major moons, 125 asteroidal moons (that show once zoomed in on their planet, like the moons), 47 dwarf planets, 269 asteroids and 16 comets, each on its real orbit (Keplerian elements at an epoch, `src/sim/orbits.ts`), placed at the game's date and moving with the clock. Orbits are to scale in AU; bodies keep a fixed size on screen. The globe zooms out to 12 Earth radii; zooming on carries straight into the System View at the same distance and angle, where the Earth is drawn from the globe's map at its true size, turned and lit the same way (bodies are drawn at their true size whenever that is bigger than their usual icon). Scrolling back in on the Earth, double-clicking it or "Return to Earth" hands back the same way. Clicking a body makes the camera follow it and opens the **Celestial Body panel** at the upper left (the event alerts shrink to the four newest, as for the nation panel), after Terra Invicta's: the body's class (Terrestrial Planet, Gas Giant, Planetary Moon…), a large pixel portrait (every body drawn from its map as below; a comet's nucleus streams a few animated tail pixels away from the Sun), surface gravity and name, the next Earth launch window (a Hohmann estimate) with the transfer time, its distance from its parent, orbital period, escape velocity and diameter, then orbital speed, eccentricity, inclination, distance from the Earth now (with the light delay), mass, and below it Terra Invicta's four lists: Moons (planetary and asteroidal, innermost first, with Terra Invicta's Type, the mining profile most of the moon's hab sites have; clicking a name opens that moon in the panel and swings the camera to it), then Orbits, Stations and Fleets (not built yet); the Sun's list is its Bodies. A small body's orbit, otherwise not drawn, shows while its panel is open; so do the orbits of Saturn's small moons (named, too, only when focused, so they don't crowd Saturn's system) and of the far dwarf planets Pluto, Eris, Haumea and Makemake, whose long orbits would cross the whole view; the lesser dwarf planets, Nereid, Hiʻiaka, Himalia, Galatea, Despina, Namaka, Sycorax, Portia, Juliet, Belinda and the other small moons drawn this way are also named only when focused. Mercury, Venus, Luna, Mars, Ceres, Jupiter, Io, Europa, Ganymede, Callisto, Saturn, Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus, Uranus, Miranda, Ariel, Umbriel, Titania, Oberon, Neptune, Triton, Pluto, Charon, Vesta, Eris, Haumea, Makemake, Phobos, Deimos and the asteroids 1951 Lick, 3753 Cruithne and 52762 Khonsu can be zoomed down to 1.35 of their radii, where each is a turning, lit pixel-art globe drawn from a map (`tools/data/build_body_maps.py`) at up to 512 art pixels across: Mercury's from MESSENGER's colour mosaic and topography, Luna's from LRO (its near side kept towards the Earth), Mars's from Viking and MOLA, Phobos's and Deimos's from Viking (drawn as the ellipsoids they are, long axes towards Mars, and as moons on their orbits rather than small sprites; Deimos's unseen parts made up), the three asteroids made up whole as lumpy, cratered shapes ray-cast from relief maps, their lumps shadowing themselves, turning at their measured rates, 24 more small bodies the same way (Eros, Lutetia, Tempel 1, Phoebe, Hyperion and Saturn's other small moons from their published shape models; Mathilde, Halley, Amalthea, Thebe, Proteus, Larissa, Puck, Nix and Hydra at their measured sizes, their relief made up; and eight asteroids with no data at all, 2 Pallas, 391 Ingeborg, 1866 Sisyphus, 2099 Öpik, 4954 Eric, 5731 Zeus, 7096 Napier and 514041, made up at their measured sizes, named and their orbits drawn only when selected, and three hundred and fifty-eight more the same way, at their published dimensions where measured: Hygiea, Hektor, Sylvia, 52 Europa, Nanabohzo, Nzambi, Eunomia, Davida, Interamnia, Camilla, Nereid, 1996 TL66, Chariklo, Pylenor, Anguta, Pisenor, Juno, Hiʻiaka, Cybele, Diomedes, Psyche, Medon, Doris, Kleopatra, Eurytion, Hermione, Euphrosyne, Thisbe, Bamberga, Viracocha, Ripheus, Iris, Daphne, Kalliope, Patientia, Eugenia, Demeleon, Hippasus, Fortuna, Aurora, Herculina, Metis, Leleākūhonua, Laetitia, Chiron, Egeria, Ursula, Elektra, Deucalion, Diotima, Bienor, Himalia, Hebe, Galatea, Alauda, Sanape, Ephesos, Chicago, Themis, Agrius, Aletheia, Pholus, Palma, Nemesis, Bertha, Lachesis, Freia, Despina, 85 Io, Ismene, Gyptis, Aspasia, Juewa, Winchester, Hilda, Pretoria, Namaka, Melpomene, Nemausa, Germania, 106 Dione, Prokne, Stereoskopia, Aegle, Astraea, Irene, Albion, Agamemnon, Siegena, Sycorax, Loreley, Elpis, Myrina, Klymene, Kreusa, Dictys, Zelinda, Massalia, Alexandra, Dido, Scheila, Eunike, Portia, Minerva, Eleonora, Merapi, Parthenope, Berbericia, Julia, Juliet, Pales, Lomia, Hypatia, Sibylla, Meliboea, Myrleia, Aneas, Aglaja, Bononia, Polyxo, Dembowska, Pulcova, Philomela, Arethusa, Flora, Achilles, Hesperia, Arawn, Lucina, Liguria, Lamberta, Aurelia, Belinda, Thule, Undina, Mentor, Anchises, Odysseus, Penthesilea, Hestia, Euterpe, Gudrun, Leto, Johanna, Bettina, Bellona, Antigone, Paris, Deiphobus, Rhaecus, Amphitrite, Ausonia, Veritas, Leda, Melete, Circe, Mnemosyne, Nysa, Patroclus, Victoria, Urania, Pyraethus, Pelion, Asterope, Athamantis, Fides, Thalassa, Harmonia, Thalia, Atalante, Eos, Nausikaa, Leukothea, Otrera, Isis, Dryalos, Amycus, Klotho, Aegea, Kassandra, Naiad, Erato, Ariadne, Proserpina, Cressida, Desdemona, Thetis, Thereus, Lydia, Elara, Phocaea, Lykas, Weywot, Hertha, Asbolus, Caeneus, Heidelberga, Helops, Hylonome, Rosalind, Caliban, Cyllarus, 2010 TH, Lacadiera, Schubart, Lykidas, 55 Pandora, Cineos, Bianca, Bromos, Halimede, Schwassmann-Wachmann, Asporina, Metis, Neso, Nessus, Crantor, Exadius, Echeclus, Pyretos, Pasiphae, Elatus, Ophelia, Cordelia, Prospero, Okyrhoe, Setebos, Glaukos, Carme, Sao, Aethra, Laomedeia, Psamathe, Siarnaq, Kiviuq, Sinope, Hidalgo, Brucia, Lysithea, Ganymed, Pons-Brooks, Albiorix, Stephano, Ione, Latreus, Perdita, Ananke, Lyyli, Hela, Swift-Tuttle, Mab, Ocllo, Taurinensis, Paaliaq, Francisco, Neujmin, Protho, Adrastea, Margaret, Ferdinand, Ymir, Kerberos, Don Quixote, Cupid, Trinculo, Hippocamp, Erriapus, Leda, Styx, Tarvos, Thomsen, Loneos, Ijiraq, Napir, Siva, Levy, Hungaria, Saggar, Gunn, Jarvis, Ivar, Kowal, Beatrice, Hero, Nancita, Callirrhoe, Kodaira, Furusho, Erbisbuhl, Themisto, Bulan, Avatea, Leetsungdao, Betulia, Mokosh, Skathi, Hyrrokkin, Thrymr, Janesick, Praxidike, Tarqeq, Mundilfari, Narvi, Suttungr, Bestla, Thoth, Beckman, Kalyke, Ayyur, Kari, Machholz, James, Cadmus, Lovas 2, Phaethon, Megaclite, Bebhionn, Skoll, Greip, Jarnsaxa, Hati, Eggther, Aegir, Hefring, Surtur, Loge, Fornjot, Hephaistos, Stephengould, Changxi, Cuyo, Asahina, Khalfu, Bendis, Bergelmir, Coniraya, Iocaste, Pons-Winnecke, Mayari, Taygete, Pallene, Akna, Pinga, Ulfrun, Vali, Kolga, Fenja, Farbauti, Thiazi, Alvaldi, Encke, Amarok, Gridr, Skrymir, Grendel, Gunnlod, Beli and Menja, Chariklo with its two rings), and the comet Arend-Rigaux likewise: far away it is the small sprite with its tails, close up its lumpy, coal-black nucleus with a dithered coma, jets erupting from vents as they turn into sunlight and swept back, and pixel-by-pixel ion and dust tails streaming away from the Sun, as active as its distance from the Sun makes it, Ceres's from Dawn, Jupiter's from Cassini, the Galilean moons' (which keep their near sides towards Jupiter) from Voyager and Galileo, Saturn's moons' (facing Saturn) from Cassini, Uranus's moons' (facing Uranus) from Voyager 2, their unseen northern halves made up from their own imaged terrain, Triton's from Voyager 2 (facing Neptune, its pole swinging with its orbit), Pluto's and Charon's (facing Pluto, Mordor's reddish cap at its north pole) from New Horizons, the unseen parts made up the same way, Vesta's from Dawn, ray-cast from its real shape model (the Rheasilvia basin flattening its south), Titan's surface faint under its orange haze and glowing atmosphere; Saturn's clouds are made up after Cassini's views, and its rings are drawn in their true plane at their real radii (C, B, the Cassini Division, A with the Encke Gap), Saturn's shadow on them and theirs on it; Uranus's clouds are made up after Voyager 2's, Hubble's and JWST's views (the bright north polar cap that faces the Sun in the game's years), with its faint dark rings drawn the same way; Neptune's clouds are made up too, in true colour, with a dark spot and bright methane clouds, and its faint rings; Eris, Haumea and Makemake, which no spacecraft has seen, are made up after their colours and light curves, Haumea drawn as its stretched ellipsoid with its ring, and fifty-five lesser dwarf planets and large trans-Neptunian objects (Gonggong, Quaoar, Achlys, Orcus, Sedna, Salacia, Máni, Aya, Chiminigagua, Varda, Goibniu, Ritona, Varuna, Izanagi, Uni, Farout, Gǃkúnǁʼhòmdímà, DeeDee, 2015 RR245, Ixion, Veles, Marduk, Huracan, Chaos, 2008 ST291, Nareau, Olorun, Xewioso, Luison, Chernobog, Meng Po, Volturnus, Tagaloa, Enki, Mbombo, Anansi, Xolas, Coatlicue, Unkulunkulu, Agudar, Kuterastan, Katonda, Eskeri, Tawa, Nuwa, Whiro, 2012 VP113, Ankou, Xargi, Cagn, Numbakulla, Huya, Maximon, Shingon and Erlik) likewise, Quaoar, Achlys, Varda, Varuna and Veles as ellipsoids; Venus shows its cloud tops after Mariner 10's view, turning in four days, with a faint glowing atmosphere at the limb. The Sun can be zoomed down to the same way (`bodyArt.ts` drawSun): a turning pixel-art globe on the IAU's pole and Carrington's 25.4-day turn, its granulation churning, darker and redder at the limb, with sunspot groups (a big leading spot, a smaller follower and pores, bright faculae round them towards the limb) that live 8 to 50 game days, drift at their latitude's own rate (the equator turns faster than the poles), and come as often as the 11-year cycle has them (cycle 25 from December 2019), appearing nearer the equator as each cycle goes on; flares flash in the active regions and throw the limb's flames high when near it, and prominences arch off the limb, all in the Sun's eight-colour palette with ordered dithering. Only the planets and great moons keep their maps in memory; the other bodies show a plain colour from afar and load theirs when selected or zoomed in on, the 32 most recently wanted staying loaded. Regions on them are still to come. Lagrange points, mining sites and transfers are still to come.
- Each body has **mining sites** with randomized yields, revealed by **prospecting**.
- **Transfers**: a Lambert solver with a porkchop-style "launch window" chooser that is simplified into a slider from Fast/Expensive to Slow/Cheap.

#### 2.10.2 Habs
- **Bases** (surface) and **Stations** (orbit). Tiers 1/2/3 give 4/12/20 slots plus the core.
- **Module catalog** (about 70): power, mining, farms, habitation, labs, shipyards, defense, barracks, admin, MC, commerce and alien-tech modules.
- Founding: launch a core from Earth, deploy a kit from a ship, or build from a construction module in the same planetary system (e.g. anywhere around Jupiter and its moons).

#### 2.10.3 Mission Control & upkeep
- Each hab and ship costs MC. Going over the cap brings scaling penalties, as in Terra Invicta.

### 2.11 Ships & combat
#### 2.11.1 Ship designer
- Hull classes: Gunship, Escort, Frigate, Destroyer, Cruiser, Battlecruiser, Battleship, Dreadnought, Monitor (stationary), Titan.
- Slots: drive (with propellant), power plant, radiator, nose/lateral/tail armor, utility modules, weapon hardpoints (nose and hull).
- Derived values are shown live: wet/dry mass, Δv, acceleration (g), cruise and combat burn, heat budget, crew, cost and build time.
- **Visual**: each hull has a hand-pixelled **side-view sprite** for UI and a **low-poly 3D model with a pixel-art texture** in the world. Modules visibly change the sprite: guns, radiators, armor plating layers.

#### 2.11.2 Strategic fleet ops
Transfer, Intercept, Prospect, Found Hab, Resupply/Refuel/Repair, Bombard, Land Marines / Assault Hab, Escort, Blockade, Orbital Patrol.

#### 2.11.3 Tactical combat
- **Optional** (decision D3). Each engagement offers **Fight** (tactical) or **Auto-resolve**. Players can set a default, such as always auto-resolve or ask each time. The game is fully playable and balanced without ever entering tactical combat.
- **Model**: Newtonian 3D physics. Velocity, facing, Δv spend and heat are all tracked.
- **Presentation**: a **tilted tactical plane** with altitude layered by height markers and drop-lines, keeping the HD-2D look readable. Ships are pixel-textured models with sprite-based VFX (laser beams, flak bursts, explosions in pixel style) plus bloom.
- **Controls**: RTwP. Orders include move-to, keep-range, approach, flee, focus target, point-defense mode and missile salvo. Formation presets.
- **Clarity features** that address reference criticisms: predicted trajectory arcs, range-band rings for every weapon, a damage-expectation tooltip, and a combat log with "why did I lose" summaries.
- **Weapon families**: Lasers, Particle Beams, Kinetic Cannons, Railguns/Coilguns, Plasma, Missiles/Torpedoes, Point Defense, and later Alien-derived weapons.
- **Damage**: armor ablation by facing, then component hits and crew casualties, with drive and radiator loss leading to disabled ships.
- **Auto-resolve**: always available, using the same simulation run headless at accelerated speed so results are consistent.

#### 2.11.4 Hab assaults
Marines resolve as a short vignette with sprites fighting in hab corridors. The outcome uses marine strength, defense modules and the Command of the councilor leading the fleet, if there is one. Ground combat on Earth, including alien landings, follows Terra Invicta (see 2.6.4).

### 2.12 Visual direction: HD-2D
#### 2.12.1 Core look
- **Characters and units**: anime-style pixel art. Map sprites are about 48–64 px tall and use 4/8-direction walk, idle and action cycles. **Portraits** are high-detail pixel busts (~256 px) with expression variants (neutral, happy, angry, shocked, smug, hurt).
  - **Procedural councilor portraits (current)**: until hand-drawn busts exist, each councilor gets a generated pixel bust in a JRPG anime style, after the reference sheet `docs/screenshots/conquest_of_sol_sample_portraits.png`. It is 128×150 pixels, shown at its native 1× beside the name in the councilor panel and 4× (512×600) when clicked; lists use a head crop.
    - **Stored data:** the sim keeps only a gender and a portrait seed; the UI draws everything else from reusable parts. Shapes are defined resolution-independently, so the sprite size can grow again.
    - **Rendering:** every pixel records a material (skin, hair, cloth…) and a light level from a simple 3D model (a sphere for the head, cylinders for hair locks, a rounded torso) lit from the upper left. Each material has a hue-shifted colour ramp (cool or rosy shadows, warm highlights), so shading falls into clean cel bands. Line art is drawn in each material's own darkest colour where a part overlaps one behind it, and a dark outline surrounds the figure. `pnpm tsx tools/portrait-sheet.ts` writes a contact sheet for checking the art.
    - **Framing:** head and shoulders on a dark card, with a stepped glow and a border in the faction's colour.
    - **Face:** semi-realistic anime proportions (an oval face, softer for women, squarer for men), 3 face shapes and 3 almond eye styles per gender. Eyes have a heavy upper lash line (winged for some women), an iris shaded dark to light with a rim, a pupil and two highlights. A shaded nose, 4 mouths, lips and a soft cheek blush.
    - **Colours:** 7 skin tones, 13 hair colours (including crimson, lavender, sky blue, navy and violet) and 8 eye colours.
    - **Hair:** 9 styles for women (long, wavy, ringlet curls, bob, ponytail, bun, box braids, pixie, side-swept) and 8 for men (short, spiky, side part, slicked back, curly, buzz, shaggy, tied). The crown is split into glossy clumps fanning from the crown, with a jagged outline; pointed fringe locks, face-framing locks and long curtains fall over it, and an anime shine ring in a sheen colour of its own crosses the crown.
    - **Extras:** freckles, beauty marks, earrings, scars, glasses with a glare, stubble, beards and moustaches.
    - **Clothes and headgear:** chosen by profession: suit, trench coat, lab coat (with a stethoscope or badge), service uniform with gold epaulettes, combat fatigues, flight suit with a neck ring, turtleneck (with a blazer for men) and casual jacket, with details and a faction-colour accent. Some professions add a beanie, beret, headset, earpiece or headphones.
    - **Names:** a councilor's name follows their gender.
- **Environments**: 3D geometry with pixel-art textures at a consistent texel density (e.g. 32 px per world meter), point-filtered.
- **Lighting**: dynamic point and directional lights. Sprites cast and receive shadows (two-sided lit billboards with normal maps), plus rim lighting.
- **Post-process**: **tilt-shift depth of field** (the signature diorama look), bloom, light shafts, vignette, color grading LUTs per location and mood, and subtle chromatic aberration in space scenes.
- **Camera**: angled 3/4 view at fixed pitch and limited rotation for dioramas. A free orbit camera is used for the Solar System and globe views.

#### 2.12.2 Scene types
| Scene | Purpose | Notes |
|---|---|---|
| **Globe View** | Strategic Earth map | Stylized 3D globe with pixel-textured terrain, region borders as glowing lines, and miniature city/launch-site props at zoom |
| **System View** | Strategic space map | Pixel-art planets with orbit lines, sprite-icon fleets and habs. Built: the Sun, planets, moons and the larger dwarf planets are pixel-art discs drawn pixel by pixel (bands, storms, ice caps, Saturn's rings; the Earth from the globe's own map) and lit in a few steps from the Sun's real direction, so they show phases; smaller bodies are pixel dots. A moon appears once its orbit is wide enough on screen, and a planet's name once it is clear of the Sun |
| **Tactical Combat** | Space battles | Tilted plane, pixel VFX |
| **Dioramas** | Faction HQs (2.4), the national-priority capital view (2.6.3), mission vignettes (2.7), hab assaults (2.11.4) | About 12 reusable sets with walking map sprites, shown with the fixed 3/4 camera |
| **Event/Dialogue** | Events and story | A pop-up with choices for minor events. Story events and milestones play as dialogue scenes with full portraits (2.5, 2.14) |
| **Cutscenes** | Faction endings (2.14) | Authored HD-2D sequences |

#### 2.12.3 Sprite pipeline
- **Councilor composer**: a layered paper-doll system (body, outfit by profession and faction, hair, face, accessory, palette swap) to produce thousands of unique councilors. Hero characters such as faction leaders and key aliens are hand-authored.
- **Tools**: Aseprite for authoring, with an automated import into the engine that reads sprite-sheet JSON and generates normal maps (e.g. Laigter or SpriteIlluminator).
- **Aliens**: distinct, unsettling silhouettes that break the anime palette rules on purpose, using iridescent or limited palettes and non-human animation timing.

#### 2.12.4 References
- [Wikipedia: HD-2D](https://en.wikipedia.org/wiki/HD-2D), [Unreal Engine: Octopath Traveler II HD-2D](https://www.unrealengine.com/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style)

### 2.13 UI/UX
- **UI skin after Terra Invicta's strategy layer**: translucent slate panels with thin steel borders, light uppercase section headers, a geometric sans (Exo 2, bundled), and small line glyphs (Lucide) beside numbers. Pixel art stays in the world (globe, sprites, portraits). Supports UI scale from 75% to 200%.
- **Strategy layout**, as in Terra Invicta:
  - A top bar with the faction's resources as icon, amount and monthly rate (money, influence, ops, boost, Mission Control, research a month (click to open the Research panel), control point capacity), then the date, time and speed controls.
  - The nation panel opens at the upper left only while a nation is selected. It has the title, control point tiles, Overview, Military, Development and People sections, and Priorities, Regions, Opinion and Relations tabs. The Military title bar has a space program icon at the right, lit when the nation has one. The Regions tab is a borderless table without headers: name (with any occupation), a capital marker, a service structure icon for a launch complex (its name on hover), armies present and population. Relations lists wars, allies and rivals, and offers diplomacy from the nations whose executive we hold.
  - Faction Assets runs down the right side: councilors (each row with the flag of the country they are in, or heading to once a mission is assigned; the councilor panel and Councilor Summary show that location too, though the councilor only arrives when the mission resolves), then the armies we command. (Held nations show on the globe and in the nation panel.) Picking an army turns the globe to it and opens the army panel in place of the councilor panel: commander, health, Miltech, headquarters and what it is doing, with Deploy (choose a destination from the list, or click a green region on the globe) and Airlift Home.
  - Armies stand on the globe as small pixel tanks in their commander's colour (grey when no faction commands them), with a health bar and a blue stripe for a navy. Moving armies slide along a dotted route. Occupied regions are hatched in the occupier's colour.
  - Councilors stand on the globe as small pixel people in their faction's colour, just above the armies. Ours always show where they are; on a mission they appear at its region once their airplane lands, and stay there afterwards. Another faction's councilor on a mission shows once we have located them (10% intel): grey until identified (25%), where they are now, or at their mission's region once our intel reveals the mission (75%). Clicking one of ours opens their councilor panel in Faction Assets; clicking another faction's opens the Rival Councilor panel at the upper left (in place of the nation panel), with what our intel reveals and, once identified, a button to the full intelligence file; the event alerts shrink to the four newest while it is open, as for the nation panel.
  - Picking a councilor shrinks Faction Assets and opens the councilor panel below it, at the lower right. It shows the portrait with the faction logo and XP, name, profession, current location, the attribute row, and the current mission with its target country and odds. Once the mission is under way it reads "Under way – 41%", with the odds as they stand now. Until the faction ends its council phase, a slider spends 0, 1, 2, 4, 8, 16, 32 or 64 of the mission's resource on its odds (influence, ops or money; see `docs/formulas.md`, "Mission costs"), and fixed costs are shown. The top bar's money, influence and ops leave out what is committed to missions.
  - Clicking the councilor's portrait opens the **Councilor Summary** over the map, after Terra Invicta's council page. It has the portrait (click to enlarge, arrows to step through the council); name, profession, status, age, hometown, XP and location; Augment, Customize and Dismiss; traits with their effects on hover; attributes and monthly incomes; the missions the councilor can run, grouped by attribute; and the orgs they hold above the faction's org market. Augment swaps the mission list for the attribute menu (20 XP per point; Loyalty can't be augmented). Customize changes the name, gender, skin tone, face, and hair. Another faction's councilor (from the Faction Assets "known councilors" tab) opens read-only, showing only what our intel reveals. With a free council seat, a recruit button in the Faction Assets header opens Recruiting: this month's candidates with their profession, age, home, attributes, traits and missions, and a Hire button.
  - During a council phase a row of hexagonal mission buttons appears at the bottom centre for the selected councilor. A hex opens that mission's targets with their odds.
  - A wide "Confirm Assignments" button sits at the top centre during a council phase.
  - Events float down the left side as diamond alerts, as in Terra Invicta, newest first. They cover our own events and public news (techs, wars, new space programs), not other factions' private results. The symbol is the mission's icon or the kind of event (intel, council, research, war, nation, diplomacy). The border is green for a success, red for a setback, blue for our other events and grey for public news. Hovering shows the date and text, clicking opens the event's nation, right-clicking dismisses it, and ✕ dismisses them all. While a nation panel is open, the column shrinks to the four newest, below the panel.
- **Keys**: Space pauses and resumes, + and − change speed, and 1–5 pick a speed.
- **Faction logos**: each faction has its own logo in its colour. As in Terra Invicta, the logo stands for the faction wherever control points appear: control point tiles, the executive, control point capacity and held nations. The logos are Aegis, a shield with a star; Iron Dawn, a rising sun over a spear point; Lumen, an open eye; Meridian, a globe of meridians; Ark, a ship leaving orbit; Concord, two bound rings; and Choir, a descending beam.
- **Information layers**: every number has a tooltip breakdown, nested tooltips are lockable, and a searchable **Codex** covers every mechanic.
- **Notifications**: a priority-sorted feed with filters. An "advisor" councilor sprite comments on major events.
- **Accessibility**: colorblind palettes, a text-size option, rebindable keys, controller support, and options to reduce motion and disable DoF.

### 2.14 Aliens & narrative
- **Alien faction** with its own goals, simulated as a non-player strategic actor.
- **Alien Threat** (visible level 0–5 backed by a hidden hate value) rises when factions strike alien assets, as in the reference.
- **Escalation phases**: Arrival → Infiltration (abductions, alien councilors) → Xenoforming (regional growth, megafauna) → Expansion (outer-system bases) → Invasion (Earth landings).
- **Story arc**: authored milestone events with full-portrait dialogue scenes reveal the aliens' nature. Each faction has a distinct ending cutscene in HD-2D.

### 2.15 AI
- **Faction AI**: utility-based planner that weighs ideology goals, threat, opportunity and resource state. It has separate planners for council missions, national priorities, research, space expansion and fleets.
- **Alien AI**: a scripted escalation director plus a utility layer for targeting.
- **Difficulty**: see 2.16 for every setting that difficulty changes.
- **Headless self-play**: the `selfplay` harness runs the deterministic `sim` module under Node (see 2.3) with AI-only factions for balance testing.

### 2.16 Scenarios & setup
- **Scenario**: *2030 Arrival* is the only launch scenario.
- **Difficulty sets campaign length** (decision D7). Difficulty scales research cost, alien escalation pacing, victory thresholds, AI resource bonuses and mission resistance:

| Difficulty | Typical length | Research cost | Alien pacing | AI bonuses | Mission resistance |
|---|---|---|---|---|---|
| Easy | ~15–20 h | 0.6× | slow, forgiving threat decay | −25% | lower (TBD) |
| **Normal (default)** | **~30–40 h** | 1.0× | standard | none | standard |
| Hard | ~60–80 h | 1.8× | relentless, faster escalation | +25% | higher (TBD) |

- These targets are verified with `selfplay` runs measured in game-months, plus playtests that measure real hours.
- **Other options**: faction choice, an alien aggression override, and toggles for ironman, random councilors and random faction names.

### 2.17 Audio
- Synth-orchestral soundtrack with chiptune motifs (a nod to HD-2D's retro roots). Each faction has a leitmotif, and the score shifts dynamically as alien threat rises.

### 2.18 Modding
- All content definitions are exposed as JSON data files with published schemas (see 2.3). A mod loader handles load order and overrides. Sprite packs can add councilor parts.

### 2.19 Out of scope (v1)
Multiplayer, consoles, voice acting, procedurally generated star systems, and anything beyond the Solar System except the Ark Covenant's launch.

### 2.20 Open questions
- **Tauri on Linux**: confirm WebKitGTK's WebGL performance with an early benchmark (see 2.3).
- **Victory and defeat**:
  - Meridian Consortium's X%, Y and deadline.
  - What "the aliens win" means for the Choir of the Descent.
  - How the player loses, including what happens when another faction wins.
- **Bonds** (deferred): what counts as "bonded", whether negative bonds give a penalty, and the exact effects.
- **Terra Invicta parity** (D11, D13): `docs/formulas.md` lists the rules copied so far and marks the rest as placeholders. Still to confirm against the game:
  - the "Resource Spent" curve: Terra Invicta's bonus for resources spent on a mission "scales logarithmically"; we use `log2(1 + spent)`, inferred from one reported case (`docs/formulas.md`, "Mission costs");
  - whether Persuasion and Command add to Control Point Capacity alongside Administration;
  - whether Coup d'État has any prerequisite, such as minimum unrest.
- **Earth military parity** (D11): to confirm against the game (Terra Invicta's Army wiki page was unreachable):
  - the deployed army upkeep (we use 1 IP a month, against 0.5 at headquarters);
  - the units of the wiki's army damage and occupation rates, which we calibrated (`docs/formulas.md`);
  - how armies are assigned to control points, and where new armies are headquartered;
  - Terra Invicta's starting alliances and rivalries (ours are a hand-written 2025 list).
- **Claims** (from Terra Invicta's data): every nation claims its own regions, some claim other nations' regions from the start, and 44 projects unlock more once any faction completes them. A claim is hostile by history or when the claimant's Government is 1.5 below the region's nation's. The nation panel's Regions tab lists the nation's regions with the flags of their claimants (a fist marks a region held under a hostile claim), followed by the regions it claims abroad in light grey, or light red where the claim is hostile. Regions change hands through War Conquest, the Annex Region army operation, the Demand Territory, Peaceful Unification and independence policies, and secession from unstable nations. A nation that loses every region ceases to exist until it breaks away again, is granted independence or is restored by an army. Terra Invicta's 119 breakaway nations (Scotland, Catalonia, Quebec, Texas, Kurdistan, Tibet…) start out this way, each with a homeland region of its own inside its parent; some wait for a project to unlock their claim. Increase Unrest raises a nation's unrest and can bring a fallen nation back in its home region, under the agitating faction. Regions held under a hostile claim add unrest and cap cohesion until Government and Unity investment reconciles them (see docs/formulas.md, "Claims").
- **Nuclear strikes** (built 2026-10-27): the faction holding a nation's executive fires its nuclear weapons from a red button beside the Executive emblem in the Country panel, at a region of a nation it is at war with. A pixel missile flies from the capital and a mushroom cloud rises where it lands. Rules are in docs/formulas.md under "Nuclear strikes".
- **War still to build**: atrocities, nuclear fallout, AI use of nuclear weapons, the Raze Region operation, rugged terrain, real sea routes with canals and straits, and a prompt for players to answer alliance and peace offers.
- **National economy parity** (D15): to confirm against the game:
  - the population-scaling exponent (we infer `(50M / population)^0.35` from the wiki's Direct Investment costs);
  - the unrest IP penalty (the wiki says 1% per 0.1 above 2, but one tooltip reading suggests coarser steps);
  - the starting Funding, Boost and Mission Control of each nation, and Terra Invicta's population growth formula;
  - how strongly Unity and Spoils propaganda move public opinion.

### 2.21 Decision log
| ID | Decision |
|---|---|
| D3 | Tactical combat is optional, and auto-resolve is always available (2.11.3). |
| D4 | Bonds and romance stay lightweight and secondary (2.7). |
| D6 | The faction names in 2.4 are final. |
| D7 | Difficulty sets campaign length: Normal ~30–40 h, Easy about half, Hard about double (2.16). |
| D8 | The engine is Three.js with TypeScript, replacing the earlier Rust/Bevy plan (2.3). Decided 2026-10-19. |
| D9 | Nations are real-world, with no real leaders (2.6.1). |
| D10 | There is no voice acting in v1 (2.19). |
| D11 | These systems copy Terra Invicta's current rules: Control Points and their missions (Crackdown, Defend Interests, Purge, Coup), Earth military and war, nuclear weapons, and councilor Loyalty/Apparent Loyalty (2.6.2, 2.6.4, 2.7). Decided 2026-10-19. |
| D12 | The desktop shell is Tauri and the UI framework is Svelte 5 (2.3). Decided 2026-10-19. |
| D13 | "Terra Invicta" rules means its latest release (1.0; wiki captured October 2026, codex citing 1.0.28) (2.6.2). Decided 2026-10-20. |
| D14 | Nations are every sovereign country from Natural Earth (178 after folding), not a hand-picked ~80 (2.6.1). Decided 2026-10-20. |
| D15 | The national economy (investment points, priorities, their costs, requirements and population-scaled effects) also follows Terra Invicta's latest release (2.6.3). Decided 2026-10-20. |
| D16 | Armies are units in regions, commanded through the control points they answer to; wars come from rivalries via Set National Policy, and capturing a capital hands the nation's CPs to the victor's faction, after Terra Invicta's Terrestrial Warfare and Foreign Relations rules (2.6.4). Decided 2026-10-21. |

