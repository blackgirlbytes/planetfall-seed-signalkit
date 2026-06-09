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

## Level 1 design — "First Memories" (agreed 2026-06-09)

Framing inspiration: **Diner Dash**. The fun isn't the task, it's that every
action feeds a clear goal, each task is a short chain, a timer pushes you, and
you juggle toward a target. The three workflow beats map onto a Diner Dash
table:

- **Do (recover/fix)** = take the order + cook
- **Freeze (commit)** = serve the food — locked in, but not scored yet
- **Checkpoint** = collect the check — *this is the step that banks progress*

Key teaching point: in Diner Dash you can serve every table and score nothing if
you never collect. Same here — a frozen-but-not-checkpointed fix is a served
plate you never got paid for. **Freeze keeps it; checkpoint banks it.** The ship
rebuilds from checkpoints, not bare commits, so checkpoints literally ARE
forward progress.

What a checkpoint shows (middle-ground detail — not the full real anatomy): a
real **12-char hex ID** (e.g. `711044b1fe29`, like real Entire checkpoints),
the commit **trailer** it's stamped with (`Entire-Checkpoint: <id>`), a
**one-line summary** of the fix, and a tiny
**who-did-what bar** (ship % / you %). Stands in for the real
transcript/prompts/token-usage/line-attribution without a spreadsheet. The ID
also appears stamped on the commit (ice block) so the link is visible.

### Pressure: one level countdown (not per-memory)
A single **countdown clock** (top-left HUD, `TIME m:ss`) runs for the whole run
— tuned **scary-tight** (`TOTAL_TIME`, currently **45s** for 3 memories;
one-line tune in `islandView.js`). Bank every memory before it hits `0:00` or
the run **fails**: every un-banked memory **melts away** (sinks + fades, ice
included) and a "MEMORIES MELTED" screen offers **press R to try again** (full
reset). The clock escalates: **urgent** (red, pulsing) under 22s → **critical**
(frantic fast pulse + shake + glowing red digits) under 8s; it pauses while
you're in orbit. The **whole sky panics** too — starting at `PANIC_TIME` (22s)
the lavender dusk, fog, dome and sun lerp toward an angry **crimson**, eased so
it's barely perceptible at first and only fully reads in the last ~10s, with a
**throb** once critical (and held full-red behind the fail screen). One knob
(`PANIC_TIME` in `islandView.js`) moves the sky independently of the clock. The clock keeps running through the **final
`entire checkpoint list`** — that command is the real finish line, so banking
the last memory does NOT stop the clock; you still have to type the list before
`0:00` (and you can't Esc out of that final prompt). Time out there and the
whole run melts. This replaced the old per-memory ~14s fade — the user wanted
ONE clock and real pressure across the whole level, not individual items melting.

### The loop (one memory at a time — calm tutorial, no juggling yet)
The player types the **real commands** into the ship's terminal (not abstract
keys). Walking up to a memory auto-opens an in-world command line (movement
freezes; keystrokes feed the terminal; Esc backs out; B returns to orbit).
Each step shows the exact command to type as a scaffold.

1. A memory **surfaces** — light beam on the terrain.
2. Walk up → the **ship terminal opens** (`crashlog:~$`), hinting `git add`.
3. Type **`git add`** → memory is staged/recovered.
4. Type **`git commit`** → encased in **ice** (commit).
5. Entire then **offers to link a checkpoint** — `Link this commit to a
   checkpoint? [y/n]`. Press **`y`** → ice lights up, a floating real
   **12-char hex ID** (e.g. `711044b1fe29`) appears, the record card pops,
   **ship power ticks up**. (Decline with `n`
   and it stays an un-tracked commit — re-approach to link it later.)
6. Walk to the next memory.
7. When all are linked → **the clock is still ticking** → race to type
   **`entire checkpoint list`** before `0:00` to see every checkpoint you
   collected → ship fully restored (win). Miss it and the whole run melts.

IMPORTANT accuracy note (user corrected this): you do NOT type `entire
checkpoint` to save — in real Entire, linking a checkpoint is a yes/no offer
made after a commit. `entire checkpoint list` is the real command, used at the
end to review what you've banked.

~3 memories; tutorial scaffolds the first of each action, near-silent after.
Wrong commands get a "command not recognized — try: <cmd>" nudge.

The make-it-click beats, taught via the countdown + the meter:
- the level **clock** is the pressure — anything not banked before `0:00` melts.
- `git commit` freezes it but **doesn't move the meter** — only linking the
  checkpoint (`y`) banks it. Teaches commit-vs-checkpoint, no "go back" mechanic.

### Out of scope for L1 (later levels)
Juggling multiple memories / tighter timers; the "go back / reapply a checkpoint"
payoff; recap / activity / dispatch; win/lose beyond the power meter.

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
