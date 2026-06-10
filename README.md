# Planetfall

Planetfall is a 3D browser game about a stranded astronaut whose ship AI has
lost its memory. To get home, the player restores the ship's memory while
learning the real [Entire](https://docs.entire.io) checkpoint workflow — three
levels, one arc:

1. **First Memories** — bank your own work: commit it, then link the
   checkpoint. Freeze keeps it; checkpoint banks it.
2. **The Drone Bay** — five subagents repair the ship in parallel while you
   can only be in one place. `entire checkpoint explain` shows you what each
   one did; `entire dispatch` turns the day into a report.
3. **Launch Clearance** — the finale. From the pilot's chair, the ship's AI
   asks questions only the record can answer. Pick the tool — a command, or a
   skill that runs it for you — confirm the answers, complete the launch code,
   and lift off.

The thread through all three: work you didn't watch is never a mystery if it
was checkpointed. You weren't there — your checkpoints were.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

Useful commands:

```bash
npm run build
npm run dev -- --host 127.0.0.1
```

Development shortcuts:

- `?view=island` — straight to Level 1.
- `?view=level2` (or `?level=2`) — Level 2 with Level 1 checkpoints preloaded.
- `?view=level3` (or `?level=3`) — Level 3, the cockpit finale.
- `?view=archive` — a shelved search level kept playable for later.

## How To Play

Orbit view:

- Drag to orbit the planet, scroll to zoom, click the island pin to land.

On the island (Levels 1–2):

- Click to capture the mouse; move with WASD or the arrow keys.
- `M` toggles a bird's-eye map (you can keep walking), `Esc` releases the
  mouse or closes finished terminal output, `B` returns to orbit.

**Level 1 — First Memories.** Walk to a glowing memory; the ship terminal
opens. Type `git add`, then `git commit` to freeze it in ice. When Entire
offers to link the commit, press `y` — only linked checkpoints fill the ship
memory meter. Bank all three, then run `entire checkpoint list` before the
countdown hits `0:00`.

**Level 2 — The Drone Bay.** Five systems are dark and the clock can't be
beaten alone. Press `E` at a broken system and a subagent takes the job while
you move on — running all five at once is the whole point. When a beam turns
ice-blue, walk up: `entire checkpoint explain` comes pre-filled; press `Enter`,
read what the subagent actually did, then ADD TO SHIP (`Y`). After the fifth
accept, type `entire dispatch` to file the day's report.

**Level 3 — Launch Clearance.** No walking — you're in the pilot's chair, and
the launch computer won't arm on work nobody can account for. The ship asks
five questions about work you never watched. Pick a way to look each one up
(`1`–`3`): a raw command, a skill that runs it for you, or — occasionally — a
dead end that costs only seconds. The answer lands on screen; confirm it to
lock a launch-code segment. Five segments, then `entire dispatch` files the
flight log: ignition, fireworks, liftoff.

Winning a level offers `Enter` to carry you straight into the next. Failing
only ever offers `R` to retry — the clock is the only enemy.

## Current Features

- Procedural lavender ocean planet with metallic gold islands, atmosphere,
  clouds, stars, and a Saturn-style ring.
- Orbit-to-island flow with a tracked landing pin and crossfade transitions;
  wins chain levels directly with `Enter`.
- Walkable first-person island terrain, plus a bird's-eye map toggle.
- Diegetic terminals that accept the real workflow: `git add`, `git commit`,
  checkpoint linking, `entire checkpoint list` / `explain` / `search`, and
  `entire dispatch` — pre-filled where typing ids would be friction.
- Five worker subagents that improvise upgrades in parallel (a bent dish comes
  back as a signal spire), each job sealed under a checkpoint to review.
- A cockpit finale: rotating tool menus (commands and skills as different
  lenses on the same record), answer confirms, a filling launch code, and a
  3-2-1 ignition with fireworks on the climb out.
- Ice-block commit metaphor, checkpoint record cards, and in-world
  `Entire-Checkpoint: <id>` trailer labels matching the real shape.
- One countdown per level with urgent/critical clock states and a panic sky;
  fail screens with instant retry.
- Local background music with play, mute, and volume controls.

## How It's Built

- **Three.js + Vite** power the app.
- `index.html` defines the canvas, per-level HUD blocks, terminals, briefings,
  countdowns, win/fail screens, loader, and audio controls.
- `src/main.js` owns the renderer, view switching and level progression,
  resizing, and the render loop.
- `src/planetView.js` builds the orbit scene: planet, clouds, atmosphere,
  ring, stars, controls, and the landable island pin.
- `src/islandView.js` is Level 1: terrain, memory artifacts, the terminal
  state machine, countdown, checkpoint logic, failure, and reset.
- `src/droneBayView.js` is Level 2: five broken systems, five subagents,
  pre-filled explain reviews, and the dispatch finish line.
- `src/launchView.js` is Level 3: the cockpit rig, question/tool/answer
  console, launch code, and the liftoff sequence.
- `src/archiveView.js` is the shelved search level, kept playable.
- `src/overhead.js` adds the bird's-eye map; `src/firstPerson.js` wraps
  `PointerLockControls` for terrain-glued walking.
- `src/memoryProps.js` holds the shared beam/ice/checkpoint-id props;
  `src/debris.js` defines the memory artifacts.
- `src/terrain.js`, `src/planet.js`, `src/noise.js`, `src/atmosphere.js`, and
  `src/ring.js` generate the procedural terrain and planet visuals.

Most visual assets are generated at runtime; the music is bundled locally in
`public/audio/asteroid-circuit.mp3`.

## Project History

This repo started as `signalkit`, a Python telemetry CLI. On June 5, 2026 it
pivoted into Planetfall: a procedural Three.js game for teaching Entire through
play. The old code and the design evolution are recoverable through git history
and Entire checkpoints.
