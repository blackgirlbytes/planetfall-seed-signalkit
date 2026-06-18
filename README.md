# Planetfall

Planetfall is a 3D browser game about a downed pilot whose ship records were
scattered across a lavender ocean planet. To get home, the player recovers and
reviews those records while learning the real [Entire](https://docs.entire.io)
checkpoint workflow through play.

Current arc:

1. **First Memories** - shoot falling ship records, then bank each one with
   `git add`, `git commit`, and the checkpoint link prompt. Finish by running
   `entire checkpoint list`.
2. **The Drone Bay** - dispatch subagents, review their sealed work with
   `entire checkpoint explain`, drag each repair to the right ship bay, then
   file the day with `entire dispatch`.
3. **Launch Clearance** - from the cockpit, answer pre-flight questions only
   the record can answer. Choose a command or skill, confirm the answer, lock
   the launch code, and lift off.

The thread through all three: work you did not watch is not a mystery if it was
checkpointed. You were not there; the record was.

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

Useful commands:

```bash
npm run build
npm run preview
npm run dev -- --host 127.0.0.1
```

Leaderboard development:

```bash
npm run dev:vercel
```

The leaderboard API uses the Vercel function in `api/leaderboard.js` and a
Neon-compatible Postgres connection from `DATABASE_URL` or `POSTGRES_URL`.
Plain `npm run dev` intentionally disables remote leaderboard writes, so the
game still runs but leaderboard panels can report that the board is unavailable.

Development shortcuts:

- `?view=island` - straight to Level 1.
- `?view=level2` or `?level=2` - Level 2.
- `?view=level3` or `?level=3` - Level 3.
- `?view=archive` - the shelved search level, still playable.
- `?level=1&end=success` / `?level=1&end=fail` - jump to Level 1's end state.
- `?level=2&end=success` / `?level=2&end=fail` - jump to Level 2's end state.
- `?level=3&end=success` / `?level=3&end=fail` - jump to Level 3's end state.
- `?skip=level2-fail` also works; `end`, `result`, or `outcome` can be
  `success`, `win`, `pass`, `fail`, or `failure`.

## How To Play

The game boots to an arcade title screen over the live orbit view. Start Game
plays a three-beat rebellion transmission, Leaderboard opens the top scores,
and Options controls music, sound effects, volume, and the TV effect
(scanlines plus vignette, on by default and remembered between visits).

Orbit view:

- Drag to orbit the planet.
- Scroll to zoom.
- Click the landing pin to enter the next available level.

**Level 1 - First Memories.** Aim with the mouse and click to fire the salvage
cannon. Shoot the gold-ringed ship records and avoid dark wreckage, which costs
time. Each recovered record opens the terminal: type `git add`, type
`git commit`, then press `Y` to link the checkpoint. The tutorial banks one
practice record with the clock off; the timed run asks you to recover at least
four more before the 48-second clock reaches `0:00`. If you clear the minimum,
run `entire checkpoint list` to review the haul and wake the drone bay.

**Level 2 - The Drone Bay.** You stand at a command pass, not a walkable island.
Click lit dispatch pips to send available drones. Finished work rides up the
conveyor as sealed ice blocks; click a block to run
`entire checkpoint explain <id>`, read the report, then drag the still-sealed
block into the matching ship square. The live build has 12 repair jobs routed
into six familiar bays: Engine, Air, Battery, Radio, Steering, and Lights.
Waiting pips heat up and drain the launch window faster; belt blocks also have
a melting patience timer and return to the board if ignored. Once all blocks
are placed, type `entire dispatch` to file the report and start Level 3.

**Level 3 - Launch Clearance.** No walking: you are in the pilot's chair. The
launch computer asks three questions from the ship record. Pick a lookup tool
with `1`-`3` or a click, then confirm the answer with `A`/`B`/`C` or a click.
Some tools are valid commands, some are skills that run the right command for
you, and occasional dead ends cost time without ending the run. Three correct
answers complete the launch code, trigger the 3-2-1 ignition, and end with
liftoff.

Failures and the final Level 3 completion open the leaderboard panel. Saving
scores requires the Vercel/Neon API path described above; without it, the panel
falls back to an unavailable message.

## Current Features

- Procedural Three.js planet: lavender ocean, metallic gold islands, clouds,
  atmosphere, stars, and a Saturn-style ring.
- Orbit hub with landing pin, crossfade transitions, and direct level chaining.
- Title menu with rebellion intro, options, local music, sound effects, and a
  remembered TV effect.
- Level 1 salvage-cannon score attack with falling records, wreckage penalties,
  terminal banking, checkpoint list review, and bonus recovery scoring.
- Level 2 command-pass rush with six drones, 12 repair jobs, dispatch pips,
  explain reports, drag-to-match ship squares, melting sealed work, and final
  dispatch.
- Level 3 cockpit finale with command/skill tool choices, answer chips, launch
  code segments, ignition, fireworks, and liftoff.
- Shared countdown grammar across levels: urgent/critical clock states and a
  panic-red sky.
- Leaderboard scoring, save panel, title-screen board, and Vercel serverless
  API backed by Postgres.
- Shelved Archive search level still available at `?view=archive`.

## How It's Built

- **Three.js + Vite** power the app.
- `index.html` defines the canvas, title screen, shared HUDs, terminals,
  countdowns, fail/win screens, leaderboard mount points, and audio controls.
- `src/main.js` owns the renderer, view switching, level progression,
  shortcuts, title leaderboard, resizing, and render loop.
- `src/titleScreen.js` owns the arcade menu, rebellion intro, options, TV
  effect, music controls, and sound-effect toggle.
- `src/planetView.js` builds the orbit scene: planet, clouds, atmosphere, ring,
  stars, controls, and landing pin.
- `src/islandView.js` is Level 1: the salvage cannon, falling records/wreckage,
  terminal banking state machine, countdown, failure, and Level 2 handoff.
- `src/fallingProps.js` and `src/levelOneRecords.js` define Level 1 record
  visuals and record summaries.
- `src/droneBayView.js` is Level 2: dispatch board, six drones, conveyor,
  sealed repair blocks, explain reports, ship squares, dispatch report, and
  exported hero repair data for Level 3.
- `src/launchView.js` is Level 3: cockpit rig, question/tool/answer console,
  launch-code state, liftoff sequence, and final leaderboard entry.
- `src/archiveView.js` is the shelved search level, kept playable.
- `src/leaderboard.js`, `src/leaderboardPanel.js`, and `api/leaderboard.js`
  implement local score calculation, the score UI, and the remote API.
- `src/memoryProps.js`, `src/debris.js`, `src/terrain.js`, `src/planet.js`,
  `src/noise.js`, `src/atmosphere.js`, and `src/ring.js` provide shared props
  and procedural world generation.

Most visual assets are generated at runtime; the music is bundled locally in
`public/audio/asteroid-circuit.mp3`.

## Project History

This repo started as `signalkit`, a Python telemetry CLI. On June 5, 2026 it
pivoted into Planetfall: a procedural Three.js game for teaching Entire through
play. The old code and the design evolution are recoverable through git history
and Entire checkpoints.
