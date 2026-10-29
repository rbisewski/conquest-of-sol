# Formulas

SPEC 2.6.1 asks for every derived number to be documented here and broken down in an in-game tooltip.
The code builds each one as a `Breakdown` (`src/sim/formula.ts`), and the UI's `Num` component shows its terms on hover.

**Reference version.** Control points, missions, the roll and base unrest follow the latest release of Terra Invicta (SPEC D11, D13). The national economy (investment points, priorities and their effects) does too.
The source is the official Terra Invicta wiki (wiki.hoodedhorse.com) as archived in October 2026; its codex quotes cite version 1.0.28.
The IP base formula comes from the [seventh-councilor](https://github.com/mahaniok/seventh-councilor) mechanics notes, which were checked against the game's code and tooltips for version 1.0.39.
A few values are inferred and are marked **inferred** below.

All tunables live in `src/content/rules.json`. Names like `missions.rollBase` refer to keys in that file.

## Determinism rule

Simulation code uses only `+ − × ÷`, `Math.sqrt`, `Math.floor`, `Math.round`, `Math.min`/`Math.max`, comparisons, and `detLn` / `detExp` / `detPow` / `detSin` / `detCos` from `src/sim/detmath.ts`.
Those helpers are built from basic arithmetic, so a game in WebKitGTK and the same seed under Node produce identical states.
Never use `Math.pow`, `exp`, `log` or trigonometry in `src/sim/`.

## Control points (Terra Invicta) — `src/sim/nation.ts`, `src/sim/monthly.ts`

| Value | Formula |
|---|---|
| Number of CPs | `max(1, min(round(GDP^0.18 / 1.09), 6))`, GDP in $B. Thresholds: 15.4, 263, 1701, 6869, 20944. |
| CP growth/shrink | A new CP takes the next position and goes to the executive's faction; a shrinking nation loses its last position. |
| Capacity cost | Total `GDP^0.6 / 2` per nation, split evenly between its CPs. Cracked-down CPs cost nothing. |
| Control Point Capacity | `Σ (Administration + Persuasion + Command)` of the faction's non-detained councilors (+1 per point of each, per the wiki's attribute pages). |
| Over cap | Influence penalty of `overcap²` per year (charged as `/12` per month), and `overcap / 3` bonus attack for Crackdown and Purge against the faction. Terra Invicta averages the overcap over 32 days; we use the current value. |
| Executive | Index 0. Control Nation can take it only as the nation's last free CP, and only by a faction that already holds a CP there (unless it is the only CP). |

**CP types by position** (Terra Invicta counts from the right; position 1 is our index 0):

| Index | Type (first matching condition) |
|---|---|
| 0 | Executive |
| 1 | Legislature (Government ≥ 5) · Party (Education ≥ 6, Cohesion ≥ 7) · Oligarchs (Education ≥ 6) · Aristocracy |
| 2 | Security Apparatus (Government < 5) · Mass Media (Education ≥ 7) · Religion |
| 3 | National Industries (Government < 4) · Trade Unions (Inequality < 3.5, GDPPC > $10K, Education > 7) · Corporations |
| 4 | Bureaucracy (Cohesion > 6) · Regional Authorities (Cohesion > 3) · Identity Blocs (Cohesion > 1 or Unrest < 7) · Warlords |
| 5 | Knowledge Sector (Government > 9, Education > 9) · Financial Sector (Government > 6, Education > 7) · Agricultural Sector |

Defense Sector and Extractive Sector are skipped until rivalries and resource regions exist. Type bonuses implemented so far: Legislature, Party, Oligarchs, Security Apparatus and Bureaucracy, each worth `missions.cpTypeBonus` (3).

## The roll — `src/sim/missions.ts`

- `diff = attack − defense`
- `chance = 1 − 0.5 × 0.775^diff` when `diff ≥ 0`, else `0.5 × 0.775^|diff|`
- Roll `r` in [0, 1): success when `r ≤ chance`. Critical success when `r < chance / 10`. Critical failure when `r > 1 − (1 − chance) / 10`.

Missions resolve in Terra Invicta's order: resolution order (Defend Interests 0, Protect Target 0, Advise 0, Inspire 0, Set National Policy 1, Public Campaign 1, Investigate Councilor 1, Assassinate 1, Stabilize Nation 2, Increase Unrest 2, Crackdown 2, Coup 2, Control Nation 4, Purge 4), uncontested before contested, then highest odds first. The sequence is fixed when the council phase ends. The missions then resolve one at a time through the run phase, at random minutes before the next council phase (`src/sim/council.ts`), and odds are re-checked as each one resolves. A successful coup aborts other coups still scheduled against that nation.

## Mission costs — `src/sim/missions.ts` (`missionCost`, `payForMissions`)

Each mission's cost is in `missions.costs`. A contested mission lets the faction spend one resource on its odds. The slider steps are 0, 1, 2, 4, 8, 16, 32 and 64:

| Resource | Missions |
|---|---|
| Influence | Control Nation, Crackdown, Purge, Inspire |
| Ops | Coup d'État, Assassinate, Investigate Councilor, Stabilize Nation, Increase Unrest |
| Money | Public Campaign |

- **Resource types:** from the wiki's Missions table (its cost-column icons).
- **Fixed costs:** Defend Interests 16 influence, Advise 8 and Set National Policy 8, per the current game. The wiki still lists 20, 10 and 10.
- **Set National Policy:** the mission targets a nation whose working executive we hold. The policy is picked when it succeeds: a player picks it in the Select Policy window while the clock waits, and choosing none refunds the 8 influence; the AI picks its best valid policy then. This is how Terra Invicta does it.
- **Consolidated executive control:** the faction has held the executive CP for 90 days (`rules.diplomacy.consolidationDays`), or took it by a coup or War Conquest, which consolidates at once. Changing hands restarts the clock. Federation, Leave Federation, Unification, Grant Independence, Demand Claim, Disband Army and Disarm Warheads need it in the nation setting the policy. They also need it in the joining nation (Federation), in the other nation (Unification) and in the nation asked, if a faction holds its executive (Demand Claim). Declare War, Seek Peace and Declare Independence don't need it. Terra Invicta hardcodes the duration; 90 days is our choice. Saves from before this rule count every executive already held as consolidated.
- **Free missions:** Surveil Location, Go To Ground and Protect Target.
- **Attack bonus:** "Resources spent", `missions.spend.bonusPerDoubling × log2(1 + spent)`, so +1 for 1, +2.3 for 4, +4.1 for 16 and +6 for 64. The wiki only says the bonus "scales logarithmically". Our curve is **inferred**, from one reported case where 16 influence took a Control Nation from 42% to 82% (about +4.7).
- **When it's paid:** costs are committed when assigned and paid when the council phase closes, whatever the outcome. A faction can't commit more than it holds across its councilors. If it spent resources after assigning (hiring, buying orgs), spends drop to the largest step it can still pay, and missions whose fixed cost it can't pay are called off.
- **AI:** spends the smallest step that lifts a mission to 75%, using at most a third of its uncommitted resource. **Ours.**

## Mission modifiers

Shared terms:

- **Popular support:** `(10 + Government) × faction's share of public opinion`.
- **Size of national economy:** `(GDP in $B / missions.gdpScalingFactor)^(1/3)`, with the factor at **1**. That is Terra Invicta's value: the wiki's Missions page gives the term as "(Target Nation's GDP in Billions) ^ 0.33333334", so its "Scenario GDP Scaling Factor" only converts dollars to billions. At the start this puts USA ≈ 34, China ≈ 29.5, Germany ≈ 18, India ≈ 17.6, Russia ≈ 15.2, Brazil ≈ 13.7, a $500B economy ≈ 7.9 and a $50B one ≈ 3.7. A starting Politician or Activist (Persuasion 6–8, so attack ≈ 7 before popular support) has about 0.1% odds of Control Nation against the USA, 0.2% against China, 3% against India, 6% against Russia, 9% against Brazil and 40% against a $500B nation. (Before 2026-10-26 councilors rolled our own, higher attributes, and the same councilor had attack ≈ 11.5.) Spending influence on the roll (see "Mission costs") adds up to +6, and popular support (tripled for Control Nation), neighbouring CPs and higher Persuasion do the rest of the work of opening up the big nations. Before 2026-10-25 we divided by 100, which put the USA at ≈ 7.4.
- **Council stat:** sum of that attribute over the target faction's non-detained councilors, `/ 12`.
- **Control points in neighbors:** `6 × fraction of land neighbors' CPs held (and not disabled) by the attacker`.
- **Control in larger allies / federation:** `6 × fraction of the CPs held (and not disabled) by the attacker in allies with more GDP than the target, or in its federation`.
- **Ideological distance:** Euclidean distance on the two ideology axes, divided by its maximum (√72), so 0–1. Terra Invicta's ideology model differs; this is our mapping.

| Mission | Attack | Defense | Success |
|---|---|---|---|
| Control Nation | Persuasion, 3 × popular support, Bureaucracy CP, CPs in neighbors, CPs in larger allies / federation | Size of economy | Take the free CP furthest from the executive |
| Public Campaign | Persuasion; free | Size of population `(population in millions)^(1/3)` (China ≈ 11, USA ≈ 7, 5M people ≈ 1.7) | Propaganda of strength Persuasion (0.4% of the population per point); twice that on a critical success |
| Investigate Councilor | Investigation, our CPs in the target's nation (6 × share), target detained +4 | Target's Espionage, protectors' Security, their CPs there (6 × share) | Intel +25% + 0.5% × Investigation (double on a critical). Needs 10% intel to target |
| Assassinate | Espionage, Security Apparatus CP, intel (+1 at 50%, +3 at 75%, +5 at 100%), target detained +4 | Difficulty 12, target's Security, protectors' Security, their CPs there | Kill the target. Needs 25% intel. Critical failure: detained 3 phases unless protected or the target is detained; killed if the target is a Hard Target |
| Protect Target | Uncontested; another of our councilors | – | Adds the protector's Security to the target's defense until the next council phase |
| Inspire | Persuasion; another of our councilors who isn't detained | Difficulty 8 | Loyalty +1 to +3 and Apparent Loyalty +2 (critical: +2 to +4 and +3). Failure: Loyalty −1 to +1, Apparent unchanged. Critical failure: Loyalty −3 to −1 and Apparent −2. Both stay within 1–25 |
| Stabilize Nation | Command, popular support, cohesion | Size of population | Unrest −1 (−2 on a critical), halved when unrest is under half its resting level |
| Increase Unrest (a region) | Command, popular support, Identity Blocs and Warlords CPs, resources spent | Cohesion, size of population, the executive faction's popular support | Unrest +1 (+2 on a critical), halved when unrest is over twice its resting level; the success is recorded for the faction. In a non-capital region that is the home capital of a nation that no longer exists, it may set off a breakaway (see "Instability"). Rebels, Operatives, Fixers, Spies, Kingpins, Activists, Journalists, Commandos, Evangelists and Hackers can run it, as can holders of the CIA or Mossad and Demagogues. Psyops, Networked Psyops and Guerrilla Warfare give +2. The Protect Target defence bonus doesn't apply here |
| Advise | Uncontested; 8 influence | – | Until the next council phase: IP × (1 + Administration %), Miltech + Command / 100; the x-th advisor in a nation counts 1/x |
| Surveil Location | Uncontested; every profession; targets a region | – | Until the next council phase, our spotting rolls get +12 in the region and its neighbouring regions |
| Go To Ground | Uncontested; every profession; targets a region | – | Hidden until the next council phase (can't be spotted or targeted); each faction with intel on the councilor loses it with a chance of 50% + 3% × Espionage; the councilor forgets who had spotted them |
| Defend Interests | Uncontested; 16 influence | – | Every working CP we hold there is defended; `90 × CPs + 360` days shared so expiries line up |
| Crackdown | Investigation, popular support, Security Apparatus CP, target over cap / 3 | Target council Administration / 12, size of economy, defender's popular support, Defend Interests +10 | CP disabled for 1 month (2 on a critical), defenses removed |
| Purge | Espionage, popular support, CPs in neighbors, CPs in larger allies / federation, Legislature CP (vs executive) or Party CP (vs others), target over cap / 3 | Difficulty 3, target council Administration / 12 (if not disabled), size of economy, 2 × ideological distance, disabled −10 (−5 per other disabled CP of theirs there), Defend Interests +10, Legislature/Party CP, defender's popular support | Take the CP |
| Coup d'État | Command, popular support, unrest, elite dissatisfaction `15 × (corruption − spoils share)` | Difficulty 8, executive's council Command / 12, cohesion, elite satisfaction `10 × (spoils share − corruption)`, Government, size of economy, defended CPs, Oligarchs CP, executive's popular support | See below |

**Coup d'État success:** every CP not held by the plotters is emptied. They take the free CP furthest from the executive (two on a critical success; on a critical success with exactly one free CP, the executive and next CP). Every CP closer to the executive than an empty CP is then emptied. Government changes by U(−2, +1), unrest by U(−3, 0), cohesion by U(−1, +1), and GDP by −U(0, 10%). Other coups planned against the nation that phase abort. Terra Invicta also hands CPs to factions that raised unrest with Increase Unrest missions; that waits for that mission.

**Critical failures:** Control Nation, Crackdown, Purge and Public Campaign apply propaganda of strength `clamp(Persuasion − 11, −11, −1)`. A failed coup picks a random CP: if it is empty, propaganda −5; if another faction holds it, the councilor is detained for 3 council phases.

**Control Nation and public opinion** (our change): popular support counts triple (`missions.controlNation.supportWeight`), so 10% support in a Government-5 nation adds 4.5 to the attack rather than 1.5. Public Campaign is our simple version of Terra Invicta's mission, without a cost. The AI runs it only with councilors that have nothing better to do.

**Critical successes** of Control Nation and Purge apply propaganda +5.

**Propaganda** (our approximation): each point of strength moves `propaganda.opinionPerStrength` (0.4%) of the population. Positive strength draws from the undecided first, then other factions; negative strength sends supporters back to undecided. The Unity and Spoils priorities use the same conversion. With it, a faction that holds a whole nation and keeps a Unity pip there empties that nation's undecided share within about 5 years. Terra Invicta's real conversion (on its Public Opinion page) is the next thing to check.

**Corruption:** `50% − 2.65515% × Government − 0.57342% × Cohesion − 0.824624% per $3000 GDPPC`, minimum 5%. **Spoils share** is the average share of each CP's pips, counting only priorities the nation can use, that goes to Spoils.

## Nations — `src/sim/nation.ts`, `src/sim/monthly.ts`

| Value | Formula | Status |
|---|---|---|
| Base unrest | `10.5 − GDPPC / $10K − Cohesion` and the armies term (see "Armies and war"), clamped 0–10. Unrest moves 0.25 per month toward it. | Terra Invicta (hostile regions not modelled yet) |
| Unrest bands | Peaceful < 1.5 · Subversion < 3 · Strife < 4.5 · Insurgency < 6 · Guerilla War < 7.5 · Insurrection < 9 · Civil War | Terra Invicta |
| GDP per capita | `GDP ($B) / population (M)` = thousands of USD | – |

## National economy (Terra Invicta) — `src/sim/economy.ts`

### Investment points

| Value | Formula | Source |
|---|---|---|
| Monthly IP | `GDP^0.35` ($B), then × `(1 − min(0.8, max(0, (unrest − 2) × 0.1)))`, then `− 0.5` per army at its headquarters (`− 1` deployed) and `− 0.5` per navy, minimum 0 | Base: `economyScore = (GDP/1e9)^controlPointIPScaling`, with `controlPointIPScaling = 0.35` (seventh-councilor, game code 1.0.39). Unrest: wiki ("every 0.1 Unrest above 2 removes 1% IP, capping at 80%"). Upkeep: seventh-councilor's tooltip decomposition ("−0.5 per army safe at home"); the deployed cost is **inferred**. |
| CP share | Each CP spends `IP / CPs` by its holder's pips. A CP nobody holds uses `defaultPriorities`. Pips in priorities the nation can't use are ignored. | Wiki |
| Diversity bonus | Each nation-building priority gives every *other* priority of the same CP `diversity × its pips / the CP's total pips`. Diversity is 50% for Economy and 20% for Welfare, Environment, Knowledge, Government, Unity and Military. The IP put in is multiplied by `1 + bonus`. | Wiki |

One seventh-councilor tooltip read −15% at unrest 3.75, where the wiki formula gives −17.5%. We use the wiki formula.

### Population scaling (**inferred**)

The wiki gives most priority effects "in a nation with 50 million Population" and says other sizes are "sped up or slowed down". Its Population Scaling section wasn't reachable, so we use **`× (50 / population in millions)^0.35`**.

The exponent is inferred from the wiki's Direct Investment cost table. Those costs divide or multiply by `(Population / 50 million)^0.35` exactly where a scaled effect would cancel out. The wiki also says the Environment priority's scaling "inverts" to `× (Population / 50M)^0.35` once a nation reaches 10 Sustainability.

### Priorities

Costs are Terra Invicta's IP costs. "Scaled" effects are multiplied by the population scale above.

| Priority | IP | Requirement | Effect per completion |
|---|---|---|---|
| Economy | 1 | – | GDP per capita `+ (3 + 0.5 × Government + Education)` USD, scaled. Inequality `+0.00015`, scaled. Resource and core-economic region bonuses wait for those region types. |
| Welfare | 1 | – | Inequality `−0.005`, scaled |
| Environment | 1 | – | No effect until climate exists (SPEC 2.6.5) |
| Knowledge | 1 | – | Education `+0.005`, scaled, × `8.5 / Education` below 8.5 or × `12 / Education` above 12. Cohesion moves `0.01` toward 5, scaled. |
| Government | 1 | – | Government `+0.001 × Education`, scaled. At 10 Government it gives the Knowledge effect instead. |
| Unity | 2 | – | Cohesion `+max(0.025, 0.1 − 0.005 × Education − 0.005 × Government)`, scaled. Education `−0.001`, scaled. Every faction holding CPs gets propaganda of `5 × CPs held`, scaled, with a Religion CP counting as 4. |
| Military | 1 | Military founded | Miltech `+ 0.00125 / Miltech × best nation's Miltech` (not scaled) |
| Oppression | 1 | Military founded | Government `−0.0025`, Unrest `−(0.1 − Government / 100) × 3`, and above 5 Government Cohesion `−0.025 × (Government − 5)`, all scaled |
| Spoils | 1 | – | Inequality `+0.0025` and Government `−0.0005`, scaled. Each holder of a working CP gets money `(5 × monthly IP + 2.5 × (10 − Government)) × its share of the CPs` (+20% with the Aristocracy CP). Each holder gets propaganda `−0.125 × (Education + Government) × its share of the CPs`. |
| Funding | 1 | – | Annual funding `+ (10 + CPs)`, capped at `5 × GDP` ($B), i.e. 0.5% of GDP |
| Boost | 2 | Space program | Annual Boost `+ (0.4 − |latitude| / 250)` at the launch complex nearest the equator (or the region nearest it if there's none) |
| Mission Control | 25 | Space program | Mission Control `+1` |
| Found Space Program | 50 | No space program | Founds it; annual Boost `+0.1`; builds a launch complex at a real launch site in the nation if there is one (Starbase in Mexico's data), else in a random region (**ours**) |
| Found Military | 40 | No military | Founds it; Miltech is set to `max(2, worst Miltech among nations with a military)` |
| Build Army | 60 | Military, population > `5 + 25 × armies` (millions), more regions than armies | `+1` army |
| Build Navy | 100 | Military, more armies than navies, a coastal region, and ≥ 4 CPs (or 3 CPs, GDPPC ≥ $40K and no navy yet) | `+1` navy |
| Develop Atomic Bomb | 80 | No bomb yet | `+1` nuke. Terra Invicta also counts an atrocity for each holder; atrocities don't exist yet. |
| Nuclear Weapons | 40 | Bomb developed | `+1` nuke |

Space Defenses and Build Exofighter need techs and come with research.
Terra Invicta's Direct Investment (buying IP with money, influence or ops) isn't implemented yet.

**Bounds.** Inequality stays within 1–9. Any excess above 9 comes off Cohesion and goes onto Unrest, as in Terra Invicta. Education has a minimum of 1. Government, Cohesion and Unrest stay within 0–10. Terra Invicta's cohesion underflow effects aren't modelled.

### National outputs and growth

| Value | Formula | Status |
|---|---|---|
| Funding, Boost, Mission Control | Split equally between a nation's CPs. The holder of a working CP receives its share every day: Funding and Boost as `/12 / days in the month` of the annual amount, and Mission Control as capacity, recomputed daily. A cracked-down CP's share is lost. The Financial Sector CP gives +5% Funding. | Terra Invicta |
| GDP | Changes only through Economy completions and population. Population grows at its real-world rate, and GDP per capita stays the same as it does. | Terra Invicta (its population growth formula isn't implemented; we use real growth rates) |
| Expected GDP growth (tooltip) | `Economy IP/month × 12 × GDPPC gain / GDPPC + population growth` | – |
| Starting Funding | `GDP ($M) × 0.05%` for nations with a space program, `× 0.01%` otherwise | **Heuristic**: the scenario values aren't published |
| Starting Boost / Mission Control | Space-program nations: `0.1 + one Boost completion per launch site`, and 1 MC per launch site | **Heuristic** |

**Money units.** One money is $1M. That follows from the wiki's Economy direct-investment cost, which is `GDPPC gain × population (millions)`, and from the Funding cap of 0.5% of GDP.

## Armies and war (Terra Invicta) — `src/sim/military.ts`, `src/sim/diplomacy.ts`

Sources: the wiki's Terrestrial Warfare and Foreign Relations pages (Wayback capture of 2026-10-13) and the Nations page. The wiki's Army page (costs, control and the army cap) could not be reached, so the values marked **inferred** are ours. All values are in `rules.json` under `military` and `diplomacy`.

### Armies

| Value | Rule | Status |
|---|---|---|
| Units | Each army is a unit with a headquarters region, a location, health 0–1 and an optional navy. Nations start with the armies and navies of the starting data, headquartered capital first, then by region population; navies go to armies based on the coast. | Terra Invicta (HQ order **inferred**) |
| Command | A nation's armies answer to its CPs in turn, starting with the Executive. The faction holding that CP commands the army; with no holder, the nation's AI moves it. | Terra Invicta (armies are attached to CPs); round-robin order **inferred** |
| Upkeep | `−0.5` IP/month per army at its headquarters, `−1` when anywhere else, `−0.5` per navy | 0.5 at home: seventh-councilor tooltips. Deployed value **inferred** |
| Build Army | New army at the region with the fewest armies headquartered (capital first) | **inferred** |
| Base unrest | `−0.5 × health × (10 − Government) / regions^0.65` per friendly (own or allied) army standing in the nation | Terra Invicta (Nations page) |
| Strength | regions not fully occupied × Miltech × 0.7 + Σ army health × Miltech × 3 + navies − unrest + (100 + 5 × nukes if any nukes) | Terra Invicta's Estimated Military Strength |

### Movement

| Value | Rule | Status |
|---|---|---|
| Where | Armies may be in their own nation, allied nations, and nations at war with theirs | Terra Invicta |
| Land | Adjacent regions: `distance / 300 km/day × 4 / Miltech` days | Terra Invicta |
| Slowdowns | Hostile origin (not friendly, or enemy armies there): `× 5^e`; hostile destination: `× 5^e`; friendly region with unrest > 5: `× (1 + (unrest − 5) / 6.5)^e`. `e` is 0.5, or 0.2/0.8 when only one end is a small (< 150,000 km²) region, so the larger region carries the slowdown | Terra Invicta (rugged terrain and colonies not modelled) |
| Sea | Armies with a navy and naval freedom sail between any two coastal regions: `(14 + distance / 792 km/day) × 4 / Miltech` days | Terra Invicta's formula; distance is great-circle, not a sea route, and canals and straits are not modelled |
| Naval freedom | In each war, a side whose navies' summed Miltech is lower than the other side's is blockaded | Terra Invicta |
| Airlift home | Peacetime only: `(3 + distance / 792) × 4 / Miltech` days back to headquarters | Operation from Terra Invicta; duration **inferred** |
| Distance | Great circle between region centres, `2·asin(chord / 2)` by Taylor series from the precomputed unit vectors in `regions.json` (determinism rule) | – |

### Combat (daily, region by region)

| Value | Rule | Status |
|---|---|---|
| Hit chance | `50% × 0.775^(1.5 × (defense − attack))` when outmatched, `100% − 50% × 0.775^(1.5 × (attack − defense))` otherwise | Terra Invicta |
| Army Miltech | nation Miltech, +0.2 at home, −0.2 if its CP is cracked down, attacking adds +0.05 × the host nation's Cohesion in own or allied land, then × (1 − 0.5 × lost health) | Terra Invicta (Advise, habs and doctrines not modelled) |
| Region Miltech | 0 without Found Military; else Miltech + 0.05 × Cohesion − 0.05 × Unrest + calm same-nation neighbours' share × Miltech × 0.1 × (1 − 0.05 × Unrest), then × (1 − occupation / 3) | Terra Invicta |
| Army vs army | Each army fires at a random enemy army in the region. A hit takes `attack Miltech × 0.02 × (0.8–1.2) × crit` of the target's health. Crit ×3 with (armies fighting)²% chance, or always for a full-health army over untouched ground (ambush) | Shape from Terra Invicta. The wiki gives `Miltech × 0.1` with unclear units; **0.02 is our calibration**: two equal armies take about a month to destroy each other |
| Region vs army | Region defenses fire at every invader. A hit takes `region Miltech × 0.000225 × (0.8–1.2) × crit`, crit 40× with (defenders × invaders²)% chance, 100× on a fresh army over untouched ground, else 5×; less when invaders outnumber defenders: `× (1 − (H − F) / (H − F + 2))` | Terra Invicta, reading the wiki's figure as a percentage (the opening 100× shock costs about 7%) |
| Occupation | An invader that fired at no army and wasn't hit takes ground: `(Miltech + max(0, Miltech − defender's base Miltech)) × 0.003 × (0.8–1.2) × action multiplier × crit`, at most 10% per day. Action multiplier `2 / ((pop / mean pop)^0.75 + √(area / median area))`; crowding beyond one army per 100,000 km² slows it by 2% per army (to half at most) | Terra Invicta's shape. **The rate is our calibration** (the wiki's 0.0225 took a region in about two weeks as a fraction, or years as a percentage): an average region now takes three to four months |
| Liberation | With no invaders left, the owner's and allies' armies win back `region Miltech × 0.003 × (0.8–1.2)` each per day; with no armies there, a partial occupation fades by 1% a day; a full one stays | **inferred** (the wiki marks this as a TODO) |
| Healing | Per day, in a friendly unoccupied region with no fighting: 0.5% + 0.5% in its own nation + 0.5% at headquarters | Terra Invicta (Defense Sector and projects not modelled) |
| Losses | Destroyed in a democracy (Government ≥ 5): Cohesion −Government / 10, and propaganda of −Government for the commanding faction. Refund into Build Army: 30–50% of its cost at home, 15–25% abroad; navies 70–90% at home, 60–80% abroad, 10–30% when blockaded | Terra Invicta (refund bands simplified) |

### Diplomacy and wars

| Value | Rule | Status |
|---|---|---|
| Actions | The executive's faction pays 10 influence to propose an alliance, end one, declare a rivalry or propose ending one. Allies can't be rivals; rejected proposals give a 60-day cooldown, others 90 | Terra Invicta |
| Reach | Either nation has more than 2 CPs, they share a border, or either has a navy | Terra Invicta |
| Answers | A faction agrees with itself. AI factions ally within ideological distance 0.5; uncontrolled governments ally with neighbours and larger nations. Ending a rivalry is accepted unless the other nation is twice as strong. Offers to players are declined, since there is no prompt yet | **ours** |
| Declare War | Set National Policy mission (uncontested, order 1) in a nation whose working executive we hold. Needs rivals, a war-capable attacker (armies or nukes), no war-capable nation allied to both, and a border or a navy. Cohesion: attacker −0.5 × (1 − days of rivalry / 90) × Government if the rivalry is under 90 days old, else +1 if Unrest < 8, Cohesion > 2 and either Government < 7; defender +3; defender's allies +1. The defender's war-capable allies join; the attacker's join only if the same faction holds their executive | Terra Invicta (hate not modelled; attacker's allies are asked in Terra Invicta) |
| Join War | Set National Policy: needs an ally on that side and none on the other; +0.5 Cohesion when joining the attackers from peace | Terra Invicta |
| Seek Peace | Set National Policy. The other side's leader (its strongest nation) accepts unless its side is winning by more than 0.1 of war score (population-weighted occupation) within the first year. A leader making peace ends the war for its whole side; otherwise only it leaves. Everyone involved returns to rivals | Mechanics from Terra Invicta; the acceptance rule is **ours** |
| Disband Army | Set National Policy: removes one of the nation's armies that our faction commands. Unlike an army destroyed in battle, it costs no Cohesion or support and nothing goes back into the Build Army priority | Terra Invicta's description; the missing refund is **inferred** |
| Disarm Warheads | Set National Policy: removes up to 5 nuclear weapons (`rules.diplomacy.disarmNukes`). At 0, progress on the Nuclear Weapons priority is cleared | Terra Invicta |
| Conquest | When a capital is fully occupied, the alliance that occupied most of it wins. Its leader's executive faction takes every CP; without one, the faction whose armies in the nation score highest (Miltech × health) does; else the CPs are emptied. The nation leaves its wars, ends alliances with the leader's enemies and rivalries with the victors and the leader's allies, and allies with the victors. Unrest `+ (4 + armies left − 6 × share of regions fully occupied) × (1 − victor's support)` + (−1…1); Cohesion −(0–3); Government −(0–0.5), and above 5 it moves 25–75% of the way down toward a less democratic victor's | Terra Invicta's War Conquest. First the victors take what they claim (see Claims below), and these effects apply to what is left |
| AI | Armies no player commands: in peacetime, fly home; at war, hold while fighting or taking a region, fall back below 35% health, defend own and allied regions under attack, otherwise march on the nearest enemy capital (one army stays to guard the capital). AI factions declare war on a rival only with twice the strength of it and its war-capable allies, and seek peace after 60 days of losing by 0.15 | **ours** |

### Nuclear strikes — `src/sim/military.ts` (`nukeTargets`, `launchNuclearStrike`)

Source: the wiki's Terrestrial Warfare page ("Nuclear Warfare", saved in the wiki cache). Values are under `military.nukes` in `rules.json`. Ranges are drawn uniformly. A strike on the launcher's own or an ally's region is "defensive" and uses the second figure.

| Value | Rule | Status |
|---|---|---|
| Who fires | The faction holding the nation's working executive, from the Country panel's red button beside the Executive emblem, while the nation has nuclear weapons and is at war. One weapon per strike, launched from the capital | Terra Invicta; launching from the capital is **ours** (for the globe's missile) |
| Targets | Every region of a nation at war with the launcher; without a space program, only those bordering it, or on a coast while it has naval freedom. Plus its own and its allies' regions holding an enemy army. Space Defenses aren't modelled, so they protect nothing | Terra Invicta |
| Region | GDP −52.5–87.5% (defensive 15–25%) and people −18.75–31.25% (defensive 1.875–3.125%) of the region's share; Pollution Multiplier + 0.075–0.125 (defensive 0.00375–0.00625) × that share | Terra Invicta. A region's share of its nation's population stands in for its GDP share |
| World | Every nation's GDP −(25% + 0–2%) × the region's share of world GDP (defensive 5%) | Terra Invicta; reading its "+ (0% to −2%)" as part of the multiplier is **ours** (read as a flat 0–2% it would cost the world 1% of GDP per strike) |
| Target nation | Offensive: progress on every priority but Spoils, Unity and Oppression is lost. On another nation's ground: its launch complex there is destroyed and its Funding falls 50% × the region's share | Terra Invicta (Boost, Mission Control and Space Defenses per region aren't modelled) |
| Armies | Hostile armies (not the launcher's, its allies' or the launching faction's): the strongest (health × Miltech) dies; each other has a 50% chance to die, else loses 100% − (1–5%) × max(0, Miltech − 3.79) of its health. Friendly armies lose 1/(48–52). Armies killed refund no Build Army progress | Terra Invicta (Army Nuclear Hardening isn't modelled) |
| Councilors | Each councilor in the region dies with 50% chance, unless they have the Survivor trait | Terra Invicta |
| Aerosols | +0.00777 ppm each strike | Terra Invicta (the reduction for small islands isn't modelled) |

Not modelled yet: atrocities (and the public opinion they cost), nuclear fallout, loss of core economic, oil and mining status, and AI use of nuclear weapons.

### Claims — `src/sim/claims.ts`, `tools/data/build_claims.py`

A claim says a nation may take a region (Terra Invicta, Foreign Relations: "Claims" and "Methods for Transferring Regions"). The nation panel's Regions tab shows the flags of each region's claimants, marks regions held under a hostile claim with a fist, and lists the regions the nation claims abroad as extra rows: light grey, or light red for hostile claims, with a tooltip saying who holds them. The Research panel describes the claims a project unlocks.

- **Data:** Terra Invicta's 2022-start claims (`TIBilateralTemplate`). 1,927 claims: every nation on its own regions, 154 on other nations' regions from the start (France's on the EU members, Russia's on the former Soviet states, Serbia's on the former Yugoslavia, the two Koreas', China's on Taiwan, Scotland's on Glasgow…) and the rest from 55 projects. Left out: the 2026 and 2070 scenarios, and the alien and Protectorate claims.
- **Breakaway nations** (`tools/data/build_breakaways.py`): Terra Invicta's 119 nations that hold no regions at the start (Scotland, Catalonia, Quebec, Texas, Kurdistan, Tibet, the Caliphate…), each with its desired capital (the claim marked `capitalClaim`) inside a parent nation. They start out not existing (`NationDef.breakaway`), with zero stats, and take their parent's when they break away. A breakaway whose claim on its capital comes from a project (the End of America, Dissolution of Russia…) can't appear until a faction completes it; about 30 hold theirs from the start. Councilors never come from them. Ids are the game's codes in lower case, renamed where one is an ISO code we use (Arewa `arw`, Crimea `crm`, Mordovia `mrd`, the Republic of Vietnam `rvn`). Their flags are drawn in `src/app/ui/breakawayFlags.ts`, simplified from the real ones where they exist, original where Terra Invicta invents the nation, and neutral where the real flag is a puppet state's, an armed group's or a party's to a current war (Manchuria, the Caliphate, Donetsk).
- **Matching the maps:** Terra Invicta's nations match ours by name, with a short list for the names that differ (its "Congo" is DR Congo). Each of our regions is matched to the nearest Terra Invicta region (by the latitude and longitude of its map region) owned by the same nation, and inherits the claims on it. Our nations that Terra Invicta folds into another (Burundi, Bahrain, Luxembourg, Malta, Solomon Islands, Trinidad and Tobago) match that nation's regions. Cyprus has no Terra Invicta region, so only Cyprus claims it. A nation's claims on its own starting regions don't carry over onto another nation's regions here, since Terra Invicta merges some of our nations. Where several Terra Invicta claims land on one of our regions, the easiest one wins: held from the start over a project, non-hostile over hostile. A breakaway claims the region pinned as its capital (see `docs/data-sources.md`), and for each other claim the nearest of our regions in the nation holding that Terra Invicta region.
- **Projects:** a claim from a project holds once any faction completes the project (they are all one-time global projects). The 41 claim projects that did nothing here before are now kept in `projects.json`.
- **Hostile:** a claim is hostile if Terra Invicta marks it so (historical), or if the claimant's Government is at least 1.5 below that of the region's nation (`claims.hostileGovernmentGap`). Hostile claims are shown in red.
- **Hostility settled in play** (`GameState.claimStatus`): a region taken under a hostile claim stays hostile to its new nation, even once the Government gap closes. A nation that absorbs another (unification, or War Conquest that leaves nothing) gains its held claims, hostile ones staying hostile.

#### Region ownership — `src/sim/territory.ts`

| Rule | Value | Source |
|---|---|---|
| Ownership | `GameState.regionOwners`, region → nation. The record is replaced on every change, which invalidates the cached per-nation region lists and neighbour sets | Ours |
| What moves with a region | Its share of the old owner's population, GDP and Funding, weighted by the regions' content populations. Education, inequality and public opinion mix by population. A launch complex goes along if the new owner has a space program (one Boost completion and 1 Mission Control with it), else it is lost. Armies based in the region are disbanded; its occupation and any annexation end | **Inferred**: Terra Invicta keeps per-region population; we only have the nation's, so content populations set the shares |
| Capital | If a nation loses its capital, the most populous region left becomes the capital | **Inferred** |
| A nation with no regions | Ceases to exist (`capitalId` null): no people, CPs, armies, nukes, wars, alliances or rivalries; its breakaways become independent. It keeps its place and can come back in its home capital (its content capital), taking the stats of the nation it leaves | Terra Invicta's "nations with no regions" |
| Map | National borders are drawn in the shader from the region id map and an owner texture, so they follow ownership | Ours |

#### Taking regions

| Method | Rule | Source |
|---|---|---|
| War Conquest | When a capital falls, the occupying alliance's leader, then its other members by their share of the capital's occupation (ties to the stronger), each take every region of the fallen nation they claim, hostile claims included. With nothing left, the nation is absorbed by whoever took the capital (it gains the fallen nation's claims). Victors that broke away from the fallen nation become independent | Terra Invicta |
| Annex Region (army) | The army: ≥80% health, not fighting, not moving; its nation at war with the region's; its side fully occupies the region; not the enemy capital; no other army annexing there; its nation claims the region (hostile or not), or a nation that no longer exists has it as its home capital. Days = `45 × ((population / mean)^0.75 + (area / median)^0.5)`, clamped 45–270, `× their Miltech / ours`. It continues while the army stays and its side holds the region. With a claim, the region joins the army's nation. Otherwise the fallen nation is restored there: allied to the army's nation, a breakaway of the old owner, at war with it, its CPs to the army's commander, and founding effects (below) | Terra Invicta's War Annexation. Rugged terrain (×1.25) is not modelled |
| Demand Territory (policy) | The faction runs X's executive; X has a peaceful claim on R; R isn't Y's capital; Y's executive is empty or working; Y is at no war; no diplomatic cooldown; not a breakaway pair. R goes to X, any rivalry ends, 90-day cooldown (`claims.demandCooldownDays`) | Terra Invicta |
| Peaceful Unification (policy) | X and Y are in the same federation, X has a peaceful claim on Y's home capital, no cooldown, the faction runs Y's executive and holds all its CPs. Or Y is X's breakaway (not at war, all Y's CPs); set in the breakaway, the parent absorbs it (also needs the parent's executive). All of Y goes to X: X gets Y's nukes if either has the bomb, else half of Y's Atomic Bomb progress (to 1 IP short); a space program or military if Y had one, else half of Y's progress on founding one; half of every other priority's progress; Y's armies and claims. If X's Government is more than 1 below Y's, X's unrest rises by half the gap (to at most 9.8) | Terra Invicta |
| Grant Independence (policy) | A nation with no regions whose home capital X holds (and isn't X's capital) is recreated there: it gets X's military and space program if X has them, and X's stats. If X's cohesion < 5, X's unrest −(0–3) × share given and the new nation's −(0–3). X's cohesion +(0–2) × share, the new nation's +(1–3). It takes X's rivals and allies, allies with X; 180-day cooldown. Or X recognises its breakaway | Terra Invicta, without the public-opinion randomisation. The new nation's CPs start empty |
| Declare Independence (policy) | A breakaway stops being one; its parent declares war on it | Terra Invicta |

#### Instability — `src/sim/secession.ts`

| Rule | Value | Source |
|---|---|---|
| Unstable | Cohesion ≤ 3 and unrest ≥ 6 (`claims.secession`) | Terra Invicta |
| Breakaway (daily) | A nation with no regions may break away in its home capital, if its holder is unstable and it isn't the holder's capital. P% = `unrest/2 − cohesion/4 − Government`, ×3 if the holder's claim on the region is hostile, ÷ (20 × armies there) if there are armies and Government < 8, ÷ 75. Each other non-capital region it peacefully claims, with no armies, follows with Q% = `unrest × 6 − cohesion × 3 − Government × 3`. It becomes a breakaway (rivals with its parent), and rivals anyway if the parent's Government < 7. Founding effects apply | Terra Invicta. Its CPs go to nobody, since no faction raises unrest yet |
| Secession to neighbours (every 4 days) | Each non-capital region of an unstable nation may go over to a neighbouring, non-allied nation with a peaceful claim on it, the most democratic first: P% = `unrest − cohesion/2 − Government`, with the same hostile and army factors, ÷ 75. The gaining nation's cohesion +(0–2); the loser's unrest −(0–6) × share lost and cohesion +(1–3) × share; rivals if the loser's Government < 7 | Terra Invicta. Revolutions and organic coups aren't checked first |
| Founding effects | The new nation's CPs go to the given faction; cohesion +(0–3); unrest set to 0–4; Government +(−2 … Education / 2.25); Miltech −(0–0.5); inequality ±1. The old owner: unrest −(0–6) × share lost, cohesion +(1–3) × share lost | Terra Invicta |
| Hostile regions | Share of the population in regions held under a hostile claim × 1.6 × (10 − Government) adds to Base Unrest ("Hostile regions"), and × 1.6 × Government caps cohesion at 10 minus that: above the cap, cohesion falls by the monthly unrest step (`claims.hostilePenalty`) | Terra Invicta's penalties. **Inferred**: we have no resting cohesion, so the cohesion penalty is a cap |
| Reconciliation | Every 200 Government and Unity completions together (`claims.integration`) make one hostile region peaceful: one next to a peaceful region of the nation if possible, the most populous | Terra Invicta |
| Breakaway after Increase Unrest | A successful Increase Unrest in a non-capital region that is the home capital of a nation that no longer exists: P% = `1000` (× 10 on a critical) / council phases a month (× 3 if the faction's project gave that nation the claim) × (unrest − cohesion/2) − Government, × 3 if the holder's claim is hostile, ÷ (20 × armies) if there are armies and Government < 8, ÷ 300 (`claims.unrestSecession`). Each other non-capital region it peacefully claims, with no armies, follows with Q% = the same scale × (unrest × 2 − cohesion − Government), or 100 if the holder's claim is hostile. The nation's CPs go to the faction that ran the mission; it becomes a breakaway and a rival; founding effects apply | Terra Invicta. Freedom Fighters (× 1.5) isn't in the project list |
| Who raised unrest | Successful Increase Unrest missions per faction and nation (`GameState.unrestRaised`). The faction with the most takes the CPs of daily breakaways; any record makes the parent a rival of the breakaway or the gaining neighbour. War Conquest's unrest: −3 for each of Psyops and Networked Psyops the new faction completed, +3 if the old executive's faction completed Guerrilla Warfare, −0.25 per success of the new faction there; then the record is cleared (`claims.conquestUnrest`) | Terra Invicta |
| Left out | Revolutions and the alien nation | |

#### Federations — `src/sim/federation.ts`, `src/sim/diplomacy.ts`

| Rule | Value | Source |
|---|---|---|
| Start | European Union (France leading, 27 members) and Eurasian Union (Russia leading; Armenia, Belarus, Kazakhstan, Kyrgyzstan), from `relations.json`. Members are allied with one another | Terra Invicta's 2026 start, with today's EU members |
| Effects | Members stay allied (an alliance inside a federation can't be ended). They pool Funding and Boost: each takes a share ∝ CPs³ (`diplomacy.federation.shareExponent`). A member may invest in Boost and Mission Control if any member has a space program. Economy investment gets `round((other members' GDP $B)^0.25 / 2)`% more IP. Control Nation and Purge get `6 × fraction of CPs held (not disabled) in allies with more GDP or in the same federation` (`missions.allyWeight`) | Terra Invicta |
| Federate (policy) | X and Y aren't breakaways; each is outside any federation or leads its own, not both in one. The outsider (X if Y leads a federation, else Y) must be allied, off cooldown, with a member of the other side; at war or rivals with none of them; able to ally (no war, rivalry or cooldown) with those it isn't allied to; and tied to one of them by a claim either way. A Y that joins needs a faction running its working executive. Y's executive decides: as with alliances, a faction agrees with itself, AI factions within ideological distance 0.5, uncontrolled nations always, players never (no prompt yet). Accepted: the outsider joins (two independents found a federation) and allies with every member, 360-day cooldown with each; rejected: 60 days | Terra Invicta; who accepts is **ours** |
| Leader and name | The member with the most foreign claims (then most CPs) leads a new federation, and again whenever the leader is lost. A new federation takes its leader's union name (`relations.federationNames`: Nordic Federation, Eurasian Union…), else "<Leader> Federation" | Terra Invicta |
| Leave Federation (policy) | Not the leader. A leader with Government under 4 vetoes it unless the same faction runs both (60-day cooldown). Otherwise the nation leaves, keeps its alliances, loses 2% of GDP (`leaveGdpLoss`), 720-day cooldown with every member | Terra Invicta; the GDP loss is **ours** (Terra Invicta names no figure) |
| Leaving otherwise | A nation leaves its federation after a coup, when its government falls to War Conquest, or when it ceases to exist. A federation left with one member is disbanded | Terra Invicta (coups and revolutions); War Conquest is **ours** |
| Defection | When a coup takes a member out of a federation whose leader has Government under 4, the leader may declare war on it at once, unless the same faction runs both: it ends the defector's alliances with the federation, and a rivalry dated 90 days back spares the early-rivalry cohesion loss. AI and uncontrolled leaders decide on the spot: war if at least twice as strong as the defector and its allies outside the federation. A player-run leader gets a free diplomatic action, "Declare war for leaving the federation", for 30 days (`federation.defectionWarDays`, `GameState.defections`) | Terra Invicta; the AI rule and the 30-day window are **ours** (Terra Invicta asks at once) |
| Flags | `src/app/ui/federationFlags.ts`: flag-icons' EU, Arab League, ASEAN and East African Community flags; simplified historical flags for the Central American Confederation, Gran Colombia and Tamazgha (Amazigh); original designs for Terra Invicta's other union names; any other federation gets a generic flag (a field, a band and a ring of stars, coloured by its name) | Ours |
| Left out | The Federations map mode | |

#### AI

- Federates nations whose governments its faction runs on both sides (the road to unification), unifies with fellow members its faction runs outright (weighted like a war on them), and demands claimed regions only from nations with under half the military strength of its own (otherwise two nations can trade a region back and forth every cooldown). Armies stay to annex claimed (or restorable) regions they hold. Councilors stir up unrest in regions where a fallen nation could break away, but not against a government their faction runs or one with armies to crush the breakaway, and a little against governments run by factions on the other side of the alien question.

## Climate (Terra Invicta) — `src/sim/climate.ts`

Sources: the wiki's Climate Change page (Wayback, saved in the wiki cache) and Nations page (Sustainability), and Terra Invicta's game files (TIStartTimeTemplate, TIRegionTemplate, TIEffectTemplate). All values are in `rules.json` under `climate`.

| What | Rule | Source |
|---|---|---|
| Start | The 2030 start: CO₂ 443 ppm, CH₄ 1.98, N₂O 0.3386, no aerosols, sea level +28 cm (an anomaly of +1.54 °C). Ice whose threshold is already below that starts collapsed, with no extra sea rise (Larsen A–C and Thwaites) | Terra Invicta; starting the early melts as done is **ours** (Larsen A and B really collapsed in 1995 and 2002) |
| Temperature anomaly | `max(0, (CO₂ − 325.68) / 94.5) + max(0, (CH₄ − 1.3) × 21 / 94.5) + max(0, (N₂O − 0.29) × 289 / 94.5) + clamp(−aerosols / 0.03885, −40, 0)` °C | Terra Invicta |
| Nation emissions | Each month, `Pollution Multiplier / 12 × (GDP in $B × 275000 + people × 2.41 × min(1, GDPPC / 15000)² × min(1, GDPPC / 7500)² + min(oil regions × 2.5e8, GDP in $B × 27500))` tonnes; the world total adds `× 0.3292 / 7820557000` ppm CO₂, `× 0.115 / 59856468000` CH₄ and `× 0.062 / 2260300790000` N₂O | Terra Invicta |
| Natural removal | Each month CO₂ loses CO₂ / 90000, CH₄ loses CH₄ / 144, N₂O loses N₂O / 14641; aerosols become `max(aerosols × 0.935 − 0.001, 0)` | Terra Invicta |
| Pollution Multiplier | 0–10. Spoils adds `(0.0005 + 0.0005 per oil or mining region) / (Population / 50M)^0.35`. Environment removes `0.005 / (Population / 50M)^0.35`, × multiplier / 2 above 2, × max(0.25, multiplier / 0.5) below 0.5, never below the floor: 0.3325, less 0.05 each for Arrival International Development, Designer Lifeforms and Integrated Earth-Space Economy and 0.1 each for Clean Energy and Climate Change Mitigation. Sustainability = 1 / multiplier (10 at 0). Nuclear fallout's slowdown isn't modelled | Terra Invicta (Nations page) |
| Starting multiplier | Each nation's real annual CO₂ (Our World in Data / Global Carbon Project, latest year) over its emissions bracket above, clamped to 0.3325–10; nations without data get the world's emission-weighted value (0.73). World emissions at the start: 38.3 Gt a year | **Ours**: Terra Invicta's starting values are in its compiled scenario |
| Spoils | Each completion adds `multiplier × GDP^0.35 × (1 + 0.5 per oil or mining region) / (Population / 50M)^0.35 / 10⁶` × 6.124 ppm CO₂, 0.832 CH₄ and 0.2 N₂O | Terra Invicta |
| Environment at 10 Sustainability | Each completion takes `(Population / 50M)^0.35 / 10000` × 4.758 ppm CO₂, 0.0333 CH₄ and 0.0303 N₂O out of the air (the wiki's values, which already include the four techs needed to get there) | Terra Invicta |
| GDP damage | Yearly loss at anomaly C: 0 up to 0.25 °C; then `(0.14577% × (C − 0.25)² + 0.31839% × (C − 0.25)) × 1.14^Inequality`, × `min((C − 0.25 + Inequality) / 10, 1.5)` from `max(5.25, 10.25 − Inequality)` °C; cooling costs 4.032% per degree below 0, again below −7 °C and 40.32% per degree below −10.5 °C. × the ecological vulnerability multiplier, capped at 99%, taken monthly | Terra Invicta |
| Ecological vulnerability | 0–2: the population share of the nation's regions not protected, plus the share vulnerable (protected regions take no harm, vulnerable ones double). Population losses use protection at half strength | Terra Invicta. Our regions take the shares of the Terra Invicta regions nearest them (`tools/data/build_climate.py`) |
| Inequality | +1/5 of each month's GDP loss (5% → +0.01) | Terra Invicta |
| Extreme climate | CO₂ above 945 ppm: nations above 9.45 Education lose `min((CO₂ − 945) × 0.005, 0.1)` a month. Anomaly beyond ±8 °C: population falls 1% a year per degree beyond, × vulnerability | Terra Invicta |
| Sea level | +0.017 cm × C a month while C > 0; never falls. Ice collapses once C reaches: Larsen A 0.4 °C, Larsen B 0.55, Larsen C 0.94 (+5 cm), Thwaites 1.35 (+10), Pine Island 1.8 (+20), Greenland 2.2 (+120), Totten 2.7 (+10), Aurora 3.8 (+20), Wilkes 4.2 (+120), West Antarctic 4.8 (+50) | Terra Invicta; collapsing as soon as the threshold is reached is **inferred** |
| Events | Arctic methane eruption above +1.25 °C: +0.04–0.06 ppm CH₄, at most every 8 months. Volcanoes: +0.008–0.012 ppm aerosols at most every 6 years, major +0.016–0.024 every 50, colossal +0.04–0.06 once. Monthly odds once off cooldown: 20%, 3%, 0.3%, 0.05% | Amounts and cooldowns from Terra Invicta; the odds are **ours** |
| Nuclear weapons | Each one built adds 0.0000777 ppm aerosols; each strike 0.00777 (see Nuclear strikes) | Terra Invicta |

### Climate events with a choice

Sources: Terra Invicta's TINarrativeEventTemplate and TIEffectTemplate (event_EnvironmentalDegradation, event_WetBulb, event_GlobalCropFailures). Values are under `climate.choices` in `rules.json`. The event goes to the faction holding the struck nation's executive: a player gets a dialog and the clock waits for the answer (`GameState.climateChoices`, the `chooseClimateOption` command); an AI faction answers at once; with no faction there, the first answer applies. "PopScaled" effects are divided by (Population / 50M)^0.35. A "recession" of X takes X × the region's share of its nation's population off the nation's GDP, and adds a fifth of that loss to Inequality, as climate damage does.

| Event | Rule | Status |
|---|---|---|
| Environmental Degradation | While \|anomaly\| > 1.5 °C, 25% a month (12.5% with Climate Change Mitigation), at most every 3 months and every 12 months per region. Strikes a region less than half protected, weighted ×20 if at least half vulnerable and ×10 if its nation puts under 10% of its IP into Welfare | Conditions, cooldowns and weights from Terra Invicta (weights read as multipliers); the monthly odds are **ours** |
| — Let them cope | Recession 20%, Unrest +3, propaganda −10 for the deciding faction | Terra Invicta |
| — Subsidize | Recession 10%, propaganda +10. Costs 10 money + 2 per million people in the region | Effects from Terra Invicta; the cost is **ours** (Terra Invicta's 1000 money per million doesn't fit our money scale) |
| — Recruit | Extremist factions only (Iron Dawn, Choir of the Descent): recession 20%, Cohesion +1 (PopScaled), propaganda +25. Costs 0.2 money and 0.004 influence per million people (rounded up) | Terra Invicta's effects, and its costs at the same 1/500 scale as Subsidize; which factions count as extremist is **ours** |
| — Loot | Profit-minded factions only (Meridian, after Terra Invicta's Exploit ideology): recession 50%, Unrest +3, Education −1 and Inequality +1 (PopScaled). Gains 1 money per million people | As Recruit |
| Wet Bulb Disaster | While the anomaly > 1.5 °C, May–October, 10% a month, at most every 8 months and every 48 months per region. Strikes one of the 49 regions holding Terra Invicta's possible targets (`wetBulb` in climate.json) | Targets, months and cooldowns from Terra Invicta; the odds are **ours** |
| — Do nothing | 0.5% of the region's people die, ÷ (1 + GDP per capita / $25,000) | Terra Invicta; the wealth mitigation's form is **ours** |
| — Send aid | 0.25% die (same mitigation), propaganda +10. Costs 100 money and 50 ops, and earns 50 influence | Terra Invicta (its cost lists −50 influence, read as income) |
| Global Crop Failures | Once the anomaly falls below −4 °C, at most every 120 months: every nation loses 50% of its GDP, 6 Cohesion and 33% of its people ÷ (1 + GDP per capita / $25,000). Players are told and acknowledge it | Terra Invicta |
| AI answers | Extremists recruit and profit-minded factions loot whenever they can; others subsidize or send aid when it costs at most a quarter of their money, and otherwise let the region cope | **ours**, after Terra Invicta's AI preferences |

Not yet built: the Arctic methane eruption's research offer, effects of a sea level above +60 cm, and ocean travel effects.

## Research (Terra Invicta) — `src/sim/research.ts`

Sources: the wiki's Technology page and Nations page (Wayback captures of 2026-10-26). Tunables are under `research` in `rules.json`.

**National research.** This is Terra Invicta's `research_month`, quoted from the game code on the Nations page:

```
(population (M) × W × Education × min(Education, 12) × max(Government, 1)^(1/6) × 0.0075
 + min(population / 5000, CPs + Education + Government / 2))
 × (1.25 − |Cohesion − 5| / 10) × (1 − Unrest² / 100)
```

`W` is a wealth factor from GDP per capita (GDPPC):

- `(GDPPC / $15K)^0.6` up to $30K
- `2^0.6 × (1 + 0.6 × ln(GDPPC / $30K))` above that

At the start this gives the USA about 1,560 a month, China 980, Japan 435 and Germany 375, about 10,000 for the world.

**Faction research.** Paid daily, like Funding, from three sources:

- **Nations:** each working CP takes `nation research / CPs`. The Knowledge Sector CP gives +5%.
- **Base:** 30 a month (**inferred**; the wiki only says factions start with "a small amount of passive research income").
- **Councilors:** research from traits and orgs, × (1 + 1% per point of Science).

**Spending.** Each faction puts pips (0–3, starting at 1) on the three global tech slots and its project slots. A slot with pips gets `research × (1 + 5% × slots with pips) × its pips / total pips` (Terra Invicta's distribution bonus). Research category bonuses (from traits, orgs and habs) aren't modelled yet.

**Global techs** (`src/content/techs.json`): 142 techs from Terra Invicta's game files, with names, categories, costs, prerequisites, summaries and effects.

- **Slots:** three are researched at once. The campaign starts with We Are Not Alone, Skywatch and Mission To Space, as in Terra Invicta's 2022/2026 scenarios.
- **Completion:** when a tech completes, the faction that contributed most picks the next one (ties go to the first in faction order).
- **Player choice:** if that's a player, the clock stops until they choose (`awaitingTechChoice`).
- **AI choice:** the AI picks the available tech that leads to the most others per point of cost.
- **Not included:** the seven Future Tech techs (repeatable, needing their whole category) and Xenology.
- **Cost:** × the difficulty's `researchCost`.
- **Effects:**
  - **Miltech cap:** eight techs raise the highest Miltech any nation can reach by 0.5. It starts at 5 (`research.startingMaxMiltech`, the best starting Miltech; **inferred**). The Military priority stops raising Miltech at the cap.
  - **Economy growth:** eight techs multiply the Economy priority's GDP growth for every nation.

**Projects** (`src/content/projects.json`): each faction researches its own, built from Terra Invicta's game files by `tools/data/build_research.py`.

- **Which projects:** a project is kept if at least one of its effects or one-time grants works in our simulation, or it unlocks claims, along with every project on its prerequisite chains. That gives 136 projects: 87 with an effect here and 44 unlocking claims.
- **Left out:** projects for the alien faction, projects that need campaign objectives, and those whose effects all act on systems we don't have yet (space, habs, ships, claims, alien missions).
- **Faction projects:** these go to our faction in the same ideological place:

| Terra Invicta | Ours |
|---|---|
| Resistance | Aegis |
| Humanity First | Iron Dawn |
| Academy | Lumen |
| Initiative | Meridian |
| Project Exodus | Ark |
| Protectorate | Concord |
| Servants | Choir |

**Unlocking a project:**

- **The idea:** once a faction meets the prerequisites (techs, or its own projects; an alternative prerequisite can stand in for the first), it rolls the project's unlock chance once. It always succeeds if the project is guaranteed for that faction.
- **Availability:** with the idea, the project rolls its initial availability chance. If that fails, it waits and rolls on the 1st of each month at `initial + monthly × months waited`, up to its maximum. Terra Invicta rolls daily against a monthly chance.
- **Project Review:** re-rolls failed unlocks.
- **Not modelled:** the contribution and Science bonuses to these chances.

**Other project rules:**

- **Progress:** research put into a project is kept if it is set aside.
- **Player choice:** when a player's project completes (or another faction takes a one-per-world project from its slot), the clock stops until the player picks the next project for that slot (`awaitingProjectChoice`), as long as one is available.
- **Repeatables:** a repeatable project costs `cost × (1 + times completed)`.
- **One per world:** the first faction to complete such a project removes it from everyone else, and their progress is lost.
- **Slots:** one is free. A second opens while a free councilor holds an org with research income (Terra Invicta uses the org's Projects income, which we don't have). The third, from a hab module, waits for habs.

**Project effects.** These are the game's own values, in `src/sim/research.ts` (`activeEffects`, `modifierSum`, `modifierProduct`, `priorityBonus`, `missionBonus`). Lasting effects apply to the faction that completed the project, or to everyone when the game says so. They are summed once per completion (`research.version`).

| Effect | Where it applies |
|---|---|
| Priority bonus (e.g. Boost +10%) | IP the faction's CPs put into that priority goes further: `× (1 + diversity bonus + project bonus)` |
| Mission attack / defense | Added to the attack of missions the faction runs, or to the defense of missions aimed at its CPs or councilors (the executive's faction for a coup) |
| Control point maintenance (e.g. −120 for Transnational Management) | Control point upkeep `× (1 + Σ / 100)`, at least 10% |
| Control point capacity (+5 per Management Research) | Added to the faction's control point capacity |
| Council size | Extra council seats |
| Mission slider steps | Each adds a doubling to the spend slider (128, then 256) |
| Recruit attributes / XP | New candidates in the faction's recruiting pool |
| Control point research | Research from nations × the product |
| Public Campaign strength | Propaganda × the product |
| Defend Interests value | Added to Defend Interests' +10 defense |
| Org purchase cost | That resource's cost of orgs × the product |
| Orgs on the market | Added to the market size at each refresh |
| Spoils output | Spoils money × the product |
| Diplomatic cooldown | Cooldowns after the faction's diplomacy × the product |
| One-time | Resources granted, attribute points or a trait for every councilor, XP, propaganda in every nation, re-rolling failed unlocks |

For example, Audience, Commercial and Operations Research grant 25 influence, 100 money and 20 ops each time, and Management Research adds 5 control point capacity. (In Terra Invicta it takes 5% off upkeep; we changed it.)

**AI.** AI factions put 2 pips on each project slot (1 on each tech). They fill a slot with the project worth most per point of cost:

- **Seats and upkeep:** projects that add council seats, add control point capacity or cut control point upkeep weigh most (three times as much near the control cap).
- **Roles:** other projects weigh by Terra Invicta's AI role.
- **Repeatables:** count half.
- **No effect here:** projects with no effect yet count only for what they lead to.

## Councilors, traits and orgs (Terra Invicta) — `src/sim/councilors.ts`

Source: the wiki's Councilors and Orgs pages (copies in the wiki cache).

- **Missions by profession:** each profession has Terra Invicta's mission list, cut down to the missions we have (`src/content/professions.json`). Set National Policy is open to everyone. Traits and orgs grant missions, and some traits forbid them.
- **Professions:** the 25 human professions of Terra Invicta's `TICouncilorTypeTemplate`, with its names, mission lists (cut down to ours), key stats (`primary`) and odds: weight 10 for most, 5 for Kingpin and 1 for Astronaut, so about 0.4% of councilors are Astronauts. Evangelist has only Persuasion as a key stat there, so Administration (its next-highest base) is its second. Starting attributes are TI's: `base + random 0–rand` per profession (e.g. Commando Security always 6, Loyalty 6–16), within 0–25. Agent, Detective and Crime Boss were renamed Spy, Inspector and Kingpin on 2026-10-26; Spy gained Control Nation and Inspector Control Nation and Defend Interests, as in TI.
- **The Executive CP** can only be taken (Control Nation or Purge) by a faction that already holds a CP in the nation, unless the nation has only one CP (Terra Invicta's rule). Control Nation also takes it last. A coup can still hand it over, since the plotters always hold a CP when they get it. Save version 17 renames them in older saves.
- **Trait odds for the 11 professions added on 2026-10-26** (Rebel, Operative, Fixer, Judge, Evangelist, Investigator, Celebrity, Tech Mogul, Professor, Attorney, Engineer): half of TI's class chance for each trait TI gives them at 10% or more, kept only where that beats the trait's general chance. Senior Researcher and Chief Scientist stand in for TI's field-scientist, Innovative and Project Manager traits, so Engineer, Professor and Tech Mogul get them by hand. The older 14 keep their hand-tuned odds.
- **Inspire** (Terra Invicta's game files): Activist, Officer, Journalist and Astronaut run it (TI's Celebrity, Evangelist and Professor don't exist here). National Hero and Beloved grant it, as do the UNESCO org (tier 3, Government councilors only, from TI's template) and Loyalty Training (+2 attack). Paranoid, Awkward Genius and Lone Wolf forbid it. TI's Hexahedron org is one of its fictional companies and isn't included. TI's Inspire can also bring back a turned councilor (a roll of 0–15 under their new Loyalty); that waits for Turn Councilor.
- **Traits** (`src/content/traits.json`): 46 of Terra Invicta's, chosen where the effect is unconditional. Traits that only apply in some nations, or that depend on missions we don't have, aren't used yet. A new councilor rolls each trait in turn at its per-profession chance, at most one per group (e.g. one wealth level), up to 4 traits.
- **Effective attributes** = base + trait bonuses + org bonuses, at least 0. Missions, council stats and the control cap all use them. Orgs give nothing while the councilor is detained.
- **Augment:** 20 XP for +1 to a base attribute, up to 25. Quick Learner (−20%), Striver (−30%) and Inflexible (+10%) change the cost. Loyalty can't be augmented; Inspire raises it.
- **Incomes:** traits and orgs pay Money, Influence, Ops and Boost monthly, a day at a time. Research is shown but isn't simulated yet.
- **Orgs** (`src/content/orgs.json`): 58 orgs, tier 1–3. Real government agencies, labs and criminal syndicates are used as in Terra Invicta; the companies are fictional. A councilor holds org tiers up to their effective Administration. An org lists the professions and traits that may hold it (any one of them is enough). A national org also needs a CP in its nation, or a councilor from there. Selling refunds a third of the Money cost.
- **Org market:** each faction has its own market, refreshed on the 15th. Each offered org stays with a chance of 25% per star. The market then fills to 3–5 orgs from those nobody holds or offers. This is Terra Invicta's refresh without randomly generated orgs, so the market is smaller (TI: 5–10). AI factions buy at most one org a month, keeping 40 Money and Influence in reserve.
- **Dismiss:** the councilor's orgs leave the game, and the last councilor can't be dismissed.
- **Intel and detection** (`src/sim/missions.ts`): each faction rates its intel (0–1) on other factions' councilors. Whenever a councilor finishes a mission, every other faction rolls to spot them: attack = Σ Investigation of its free councilors × 1/6 in the mission's region, 1/12 elsewhere in its nation, or 1/24 in a neighbouring region (Terra Invicta's weights), + 2 × its CP share in the nation, + 12 if it is surveilling the region or a neighbouring one; defense = the councilor's Espionage − the mission's noise (Go To Ground −8, Surveil Location −4, Inspire −4, Investigate Councilor −2, Coup +2). Success gives 10% intel (they can be investigated), a critical success 25% (they can be targeted).
- **What intel reveals** (Terra Invicta's levels): 25% identity and faction; 50% attributes, traits, orgs and missions; 75% the current mission; 100% true Loyalty. Identified councilors are listed on the Faction Assets "known councilors" tab.
- **Intel fades** (our rate): each council phase a faction loses 2.5 points of intel on every councilor it didn't aim a mission at since the last one, so a 10% sighting lasts about two months.
- **Spotted by** (Terra Invicta's detection awareness): when a faction spots or investigates one of our councilors, the councilor rolls Investigation against that faction's council Espionage / 6. On a success they know that faction has intel on them, shown as its logo on their portrait in Faction Assets, until Go To Ground.
- **Recruiting** (Terra Invicta's): on the 1st of each month each candidate leaves with a chance of 1% per year of age, and new ones fill the pool to 6–9. Hiring costs 60 influence and needs a free seat (4). Profession affinities aren't used. AI factions fill empty seats with the candidate with the highest attribute total, keeping 20 influence spare.

## Factions — `src/sim/monthly.ts`

| Value | Formula | Status |
|---|---|---|
| Monthly influence | `(influence.base + billions of supporters worldwide × perBillionSupporters) × (1 + aiBonus for AI) − overcap² / 12` | Income placeholder; penalty from Terra Invicta |

## Time — `src/sim/simulation.ts`, `src/sim/monthly.ts`

The simulation advances in whole minutes. At midnight the daily tick spends `1 / days in the month` of every monthly rate: IP, influence, population growth and the 0.25-per-month unrest step. All monthly figures in this file are therefore paid out evenly over the month. However real time is sliced, the same seed reaches the same state.

## Starting data — `tools/data/build_world.py`

Real data, converted to game scales:

| Stat | Source | Conversion |
|---|---|---|
| Population (2030) | World Bank / UN projection | millions |
| GDP (2030) | World Bank, latest year | grown to 2030 at the country's own nominal growth over the previous ~8 years, clamped to −1%…8% a year |
| Democracy | V-Dem electoral democracy index (OWID) | × 10 |
| Education | Mean years of schooling (OWID, Barro-Lee/UNDP) | as is |
| Inequality | World Bank Gini, latest | `(Gini − 18) / 4.5`, clamped 1–9 |
| Unrest | WGI political stability | `3.2 − 2.2 × stability`, clamped 0–9.5 |
| Cohesion | WGI stability, democracy, inequality | `5 + 0.8 × stability + 0.3 × (5 − democracy) − 0.15 × (inequality − 4)`, clamped 1–9 (heuristic) |
| Military tech | GDP per capita | `2 + 0.5 × log2(GDPPC / $2K)`, clamped 2–5 (heuristic) |
| Armies | World Bank military spending | `round(√$B / 2.9)`, at least 1; none below 6M people or $2B of spending. In Europe (not Russia) about half: `round(√$B / 5)` and none below $9B (86 armies in 50 nations) |
| Navies | – | half the armies, for coastal nations with ≥ 3 CPs |
| Nuclear barrages | SIPRI Yearbook 2025 warhead estimates | warheads / 100, rounded up |
| Space program | Nations with an orbital launch capability in 2025 | – |
| Relations | `src/content/relations.json` (hand-written) | 13 rivalries and 7 alliances drawn from 2025 tensions and mutual-defence treaties; **ours**, not Terra Invicta's 2022 start. Two federations (European Union, Eurasian Union) after Terra Invicta's start, whose members are allied |
| Region centres | Province-weighted centroid | also stored as a unit vector (`xyz`) for trig-free distances |

Missing values are filled with the median of all nations; the generator prints how many.
