# Conquest of Sol

Strategy game inspired by *Terra Invicta*. The design is in [SPEC.md](SPEC.md)

## Stack

Three.js, TypeScript, Svelte 5 and Vite, packaged with Tauri (SPEC 2.3).

| Path | What it is |
|---|---|
| `src/sim/` | The deterministic simulation. Pure TypeScript with no DOM or Node dependencies (checked by `tsconfig.sim.json`). |
| `src/content/` | Base game content as JSON: factions, nations, priorities, professions, rules. |
| `src/worker/` | Runs the simulation in a Web Worker and streams snapshots to the UI. |
| `src/app/` | Svelte UI and the Three.js globe. |
| `tools/selfplay.ts` | Headless all-AI runs for balance testing. |
| `src-tauri/` | The desktop shell. |
| `docs/formulas.md` | Every derived formula and its tunables. |
| `tools/data/` | Fetches real-world data and generates nations, regions and the pixel-art map (`docs/data-sources.md`). |
| `public/map/` | Generated map textures: pixel-art Earth, region id map, borders. |

## Commands

```sh
pnpm install
pnpm dev                 # browser at http://localhost:1420
pnpm test                # simulation tests
pnpm typecheck
pnpm selfplay --seed 42 --years 10 --difficulty normal
pnpm tauri dev           # desktop app (needs the Tauri system packages, below)

# Regenerate nations, regions and map textures (needs Python with numpy and Pillow).
python3 tools/data/fetch.py
python3 -I tools/data/build_breakaways.py <game StreamingAssets>
python3 tools/data/build_world.py
python3 -I tools/data/build_claims.py <game StreamingAssets> src/content
python3 -I tools/data/build_research.py <game StreamingAssets> src/content
```

On Arch Linux, Tauri needs:

```sh
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool
```
