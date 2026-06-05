# Planetfall — Plan & Status

_Last updated: 2026-06-05_

## The pitch

You're a stranded astronaut. Your ship's AI has **amnesia** — it lost all its
context about what happened. To escape, you explore a 3D planet, find debris,
and each piece hides a small puzzle solved by **recovering lost context**.

The hook: reconstructing the ship's memory in-fiction **is the same act** as
recovering a real codebase's history with [Entire](https://docs.entire.io).
Each puzzle teaches a real `entire` command.

> Note: `entire explain` does **not** exist (it was an early guess). The real
> context-recovery commands are `recap`, `checkpoint`, `activity`, `dispatch`.

## Locked decisions

- **3D, web-based.** Three.js + Vite, no downloaded assets — the planet is
  generated procedurally at load.
- **Planet look (approved):** a dreamy **lavender ocean world** with a few
  **gold metallic islands** that shimmer, wrapped in a **Saturn-style ring**.
  Soft, minimal, calm.
  - NOT earthlike. NOT the glowing-magenta-"neural"-vein look (tried it; it
    looked "itchy" — busy land texture fighting bright veins. Removed.)
  - Keep lighting (sun / ambient / env) **low** — the lavender sea washes out
    white if over-lit.
- **Build order:** get the world feeling right **first** (done), then puzzles,
  then the command engine + win/lose.
- **Two-level structure (approved 2026-06-05):** the game is two views, not one.
  - **Orbit view** — bird's-eye planet; click a marked **island hotspot** to land.
  - **Island view** — a **walkable, first-person** landscape (WASD + mouse-look);
    artifacts are embedded **in the terrain**, not floating on the globe. Walk up
    to one and press **E** to inspect; **B** leaves back to orbit.
  - Transition is a **crossfade cut** into a dedicated island scene (not a
    seamless dive onto the sphere).
  - Starting with **one island holding all the artifacts/puzzles**; more later.

## Status

### Done ✅ — the 3D world (user-approved)
- Procedural planet: lavender ocean, gold **metallic** islands (PBR
  metalness + low roughness + `RoomEnvironment` IBL → shimmer), soft frost
  poles, drifting clouds.
- Saturn-style banded ring (tilted, two gaps, transparent).
- Soft lavender fresnel atmosphere, violet-tinted starfield.
- Orbit + zoom controls; slow auto-rotation.
- Verified rendering in headless Chrome (WebGL2), no console errors.

### Done ✅ — the two-level flow (2026-06-05)
- **Orbit view** (`planetView.js`): the planet plus a clean **HTML map pin**
  ("LANDING SITE") that tracks the island in screen space — no glow/beam. On
  hover a thin **outline ring** fades in on the surface and the pin lifts; click
  (pin or island) → crossfade → island. The island is found via a shared
  elevation sampler, and the **camera frames it front-and-centre on load**. Pin
  hides when the island rotates to the far side.
- **Island view** (`islandView.js`): a procedural **walkable terrain** island
  (radial-falloff heightmap, gold highlands, surrounded by lavender sea),
  lavender-dusk sky, soft warm sun. **First-person** controller (`firstPerson.js`,
  PointerLockControls + WASD, glued to the terrain, clamped to the island).
- The 4 artifacts (reusing the `debris.js` prop builders) sit **in the terrain**
  with tall findable light-beams; walk within range → "Press E to inspect" →
  opens the shared fragment panel. **B** returns to orbit.
- Verified both views render in headless Chrome (WebGL2), no console errors.

### Not built yet ⏳
- Puzzle mechanics (panels are still lore stubs only).
- The command engine (see open questions).
- Win/lose + checkpoint-collection state.
- More islands (only one is built; orbit view shows a single pin).
- Polish backlog: bloom on gold glints, ring shadow cast on planet; island
  pass — props/landmarks so the terrain reads less like empty dunes, water
  shader, a proper skybox, third-person option if wanted; tune the in-terrain
  artifact beam tint (reads pink over the lavender sky).

## Puzzle design (PROPOSED — not yet reviewed/built)

Arc: **orient → restore → understand → escape**. Each puzzle is small: run a
command → read the recovered context → use one detail from it.

| # | Fragment | Command | What's lost | Puzzle |
|---|----------|-----------|-------------|--------|
| 1 | 🪖 EVA Helmet | `recap` | "What was I doing before the crash?" | Run `recap`; read the summary of recent log entries; pick out the mission. |
| 2 | 📖 Torn Logbook | `checkpoint` | A setting got corrupted in the crash | Search checkpoints, find the last good one before the corruption, rewind to it. |
| 3 | 🖥️ Nav Panel | `activity` | "*When* did it go wrong?" | Read the activity timeline; find when the anomaly started. |
| 4 | 📡 Signal Beacon | `dispatch` | No way to call for help | Generate a dispatch summarizing all recovered context, broadcast it → **win**. |

- **#4 is the ending**: you can only send a complete dispatch after recovering
  the other three. This quietly answers "how do you win / how do checkpoints
  accumulate."

### Open questions (decide before/while building puzzles)
1. **Does the arc + mapping feel right?** (e.g. helmet → recap)
2. **Command engine:** simulated in-game terminal (portable, shareable web demo)
   vs. real CLI execution (authentic, needs a local backend) vs. hybrid.
   _Leaning simulated for a shareable demo; not yet decided._
3. **How literal is the command output?** Real-ish `entire` output vs. softened
   ship-AI flavor text.
4. **Win/lose model:** currently leaning "restore the ship's log" (collect all
   fragments, no hard lose state). Oxygen/timer and branching endings were
   other options.

### Next step
Fully design **#1 (EVA Helmet / `recap`)** end-to-end as the template, then
clone the pattern to the other three.

## Architecture / where things live

```
index.html         # canvas + HUD + crossfade overlay + FP prompt + panel + loader
src/style.css      # HUD / panel / loader / fade / crosshair / FP-prompt styling
src/main.js        # VIEW MANAGER: owns renderer + resize + shared panel + the
                   #   render loop; crossfades between the two views.
                   #   ?view=island jumps straight onto the island (dev aid).
src/planetView.js  # orbit view: scene/lighting/stars/planet/clouds/atmo/ring +
                   #   the clickable gold landing hotspot. onIslandClick callback.
src/islandView.js  # island level: sky/light, terrain+water, the artifacts, the
                   #   proximity "press E" interaction. enter()/exit()/onExit.
src/terrain.js     # procedural island heightmap mesh + water + heightAt(x,z)
src/firstPerson.js # PointerLockControls + WASD walker, glued to the terrain
src/noise.js       # seedable 3D simplex + fBm (sphere-sampled → seamless)
src/planet.js      # bakes planet maps; createElevationSampler() finds land for
                   #   the hotspot. Palette constants (DEEP/SHALLOW/SNOW) here.
src/atmosphere.js  # fresnel limb-glow shell shader (orbit view)
src/ring.js        # procedural banded ring (radial-remapped UVs)
src/debris.js      # FRAGMENTS[] (lore + command) + exported prop BUILDERS,
                   #   reused as the island artifacts. createDebris() is now
                   #   unused (kept for reference / git history).
```

Run: `npm install` then `npm run dev` → http://localhost:5173
Controls: orbit = drag/scroll, click the gold marker to land. Island = click to
capture mouse, WASD to walk, E to inspect a glowing artifact, B to leave.

## History
Repo started as `signalkit` (a Python telemetry CLI), then pivoted to Planetfall
on 2026-06-05. The old code is recoverable via git history + Entire checkpoints.
