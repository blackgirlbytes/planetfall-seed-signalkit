# Planetfall - Plan & Status

_Last updated: 2026-06-19_

## Current Status

Planetfall is now a playable four-level browser game, plus a shelved archive
level and a Vercel/Neon leaderboard path.

The current game is no longer the early "walk around one island collecting
artifacts" prototype. The shipped arc is:

1. **Level 1 - First Memories:** fixed-camera salvage cannon, falling records,
   terminal banking, checkpoint list review.
2. **Level 2 - The Drone Bay:** command-pass/order-ticket rush with dispatch
   pips, drones, conveyor blocks, `entire checkpoint explain`, drag-to-match,
   and `entire dispatch`.
3. **Level 3 - Launch Clearance:** cockpit launch with command/skill tool
   choices, record-backed answers, launch code, ignition, and liftoff.
4. **Level 4 - Trail Relay:** orbital relay that packages the work into a
   reviewable trail by locking branch, intent, evidence, and PR handoff packets.

The title screen, rebellion intro, TV effect, music/SFX options, score saving
UI, and top-10 leaderboard screen are also built.

## Pitch

You are a downed pilot. Your ship survived the crash, but its records are
scattered across the planet. Recovering those records in-fiction is the same
act as recovering useful context from a real project history with Entire.

Teaching arc:

- **Level 1:** bank your own work. A commit freezes it; a checkpoint is what
  the ship can remember.
- **Level 2:** agents can work while you do not watch. `explain` lets you
  account for what each one did, and `dispatch` summarizes the day.
- **Level 3:** someone asks about work you did not witness. The record answers.
- **Level 4:** someone needs to review the whole trip. The trail carries the
  intent and evidence together.

Core line to preserve: **You were not there; the record was.**

## Shipped Flow

### Title And Orbit

- Clean boot shows an arcade title screen over the live orbit view.
- Menu items: Start Game, Leaderboard, Options.
- Options: Controls, Sound, Display.
- Sound controls music on/off, volume, and sound effects.
- Display controls the TV effect, a CSS scanline/vignette overlay on by default
  and remembered in `localStorage` as `pf-tv-effect`.
- Start Game plays a three-beat radio transmission from the rebellion:
  crash survived, records scattered, click the landing marker, "rebel" signoff.
- Dev URLs with `?view=` or `?level=` skip the title screen.
- Orbit stays the hub: drag/scroll/click pin. The pin routes to Level 1, then
  Level 2 after L1 completion, Level 3 after L2 completion, and Level 4 after
  liftoff.

### Level 1 - First Memories

Current implementation: `src/islandView.js`, `src/fallingProps.js`,
`src/levelOneRecords.js`.

Loop:

1. Gold-ringed ship records and dark wreckage fall through a vertical field.
2. Player aims with the mouse and clicks the salvage cannon.
3. Hitting a record opens the terminal.
4. Type `git add`.
5. Type `git commit`.
6. Press `Y` to link the checkpoint.
7. Repeat until time expires.
8. If at least 5 records are banked, run `entire checkpoint list` to review the
   haul and complete the level.

Current tuning:

- `TOTAL_TIME = 48`.
- `MIN_TO_PASS = 5`.
- Tutorial banks one freebie with the clock off; the timed run asks for at
  least four more.
- Shooting wreckage costs 4 seconds and counts as a mistake for scoring.
- Extra recovered records above the minimum are bonus score.
- Falling records continue while the player types, so the cost of banking is
  time and missed opportunities.

Teaching:

- `git commit` freezes the recovered record.
- The `Y` checkpoint link is what actually banks it.
- `entire checkpoint list` is the finish-line review command.

Important change from older docs: Level 1 is not currently first-person
walking around terrain. It uses the terrain as a backdrop for a salvage-cannon
score attack.

### Level 2 - The Drone Bay

Current implementation: `src/droneBayView.js`.

Loop:

1. White dispatch pips appear on the right-side board.
2. Click a lit pip to send an available drone/subagent.
3. The drone works for that hidden job and returns a sealed ice block on the
   conveyor.
4. Click the sealed block to run `entire checkpoint explain <id>`.
5. Read the Prompt/Subagent report and deduce the bay.
6. Drag the reviewed block into a matching ship square.
7. Repeat until all repair jobs are placed.
8. Type `entire dispatch` to file the day and complete the level.

Current tuning:

- `TOTAL_TIME = 195`.
- `TOTAL_JOBS = 12`.
- `N_DRONES = 6`.
- Six bay labels: Engine, Air, Battery, Radio, Steering, Lights.
- Each bay has two repair jobs/squares in the 12-job board.
- Dispatch pips arrive over time, start pale, and heat toward amber/red if
  ignored.
- Hot waiting pips increase the clock drain.
- Conveyor blocks have `PATIENCE = 18` seconds.
- A block that melts is lost, increments mistakes, and returns its pip to the
  dispatch board for re-dispatch.
- Wrong bay drops bounce immediately and increment mistakes; dispatch is not a
  deferred grading reveal.
- `entire checkpoint list` still works at the final prompt as an optional raw
  log, but the required finisher is `entire dispatch`.

Teaching:

- Dispatch demonstrates parallel agent work.
- `entire checkpoint explain` makes sealed, unattended work legible.
- Drag-to-match forces reading the explanation without turning it into a
  blame/fault-finding puzzle.
- `entire dispatch` is the end-of-day summary.

Important change from older docs: Level 2 is no longer a first-person walk to
five broken sites. It is a fixed command-pass rush with 12 repair jobs.

### Level 3 - Launch Clearance

Current implementation: `src/launchView.js`.

Loop:

1. The player sits in the cockpit. No walking.
2. A launch question appears.
3. Pick a lookup tool with `1`-`3` or click.
4. Tool output appears in the terminal voice. Commands and skills can both be
   valid lenses on the same record.
5. Confirm the answer with `A`/`B`/`C` or click.
6. Correct answer locks one launch-code segment.
7. Three segments trigger 3-2-1 ignition, fireworks, liftoff, and the Level 4
   relay handoff.

Current tuning:

- `TOTAL_TIME = 90`.
- Three questions:
  - antenna repair attempts: answer 3.
  - steering stars mapped: answer 412.
  - total records recovered: answer 8.
- Dead-end tools do not fail the level; they cost time and count as mistakes.
- Wrong answer chips stay marked wrong; the player can reread and try again.
- Success opens the Level 4 trail relay instead of the final leaderboard.

Teaching:

- The player is asked for facts they did not personally watch.
- Raw commands and skills are presented as different routes to the same record.
- The record, not memory, carries the launch.

Known continuity issue to decide: Level 3 still quizzes the five exported hero
repair records from the earlier Drone Bay model plus three Level 1 records
(8 total), while current Level 2 gameplay now has 12 repair jobs and its own
dispatch report says 12. This is playable, but the story/math should be
standardized before treating the game as demo-ready.

### Level 4 - Trail Relay

Current implementation: `src/trailRelayView.js`.

Loop:

1. The player reaches orbit and opens a relay packet.
2. Each packet prints a trail/workflow command and a small output record.
3. Pick the correct answer with `1`-`3` or a click.
4. Correct packets lock one relay node: Branch, Intent, Evidence, Handoff.
5. Wrong packets cost time and count as mistakes.
6. Four locked packets transmit the trail and open the final leaderboard.

Current tuning:

- `TOTAL_TIME = 120`.
- Four packets, one answer each.
- Wrong answers cost 8 seconds.
- The completed Level 4 run is the only new `completedGame` win.

Teaching:

- A trail is keyed to one branch.
- The description should carry why/what, not raw transcripts.
- Checkpoints attach by branch evidence, not manual paste.
- A PR from the same branch reuses the trail and provides the review handoff.

### Archive - Shelved Search Level

Current implementation: `src/archiveView.js`, reachable at `?view=archive`.

This was once Level 2 and is intentionally shelved. It teaches
`entire checkpoint search` with a field of dark archive blocks and keyword
requests. It remains playable for later use, but it is not in the main
four-level path.

Reason shelved: search is a "history has outgrown your memory" pain, and the
game did not yet have enough accumulated history for search to feel necessary.
Drone Bay became the better second level because it matches the daily
agentic loop: delegate, review, accept, summarize.

## Leaderboard

Current implementation:

- Client scoring: `src/leaderboard.js`.
- UI panel: `src/leaderboardPanel.js`.
- API route: `api/leaderboard.js`.
- Title-screen board: `src/main.js` plus title menu wiring.

Behavior:

- Level 1 and Level 2 failures can be saved as loss scores.
- Level 3 failure can be saved as a loss score.
- Level 4 failure can be saved as a loss score.
- Level 4 success is the only new `completedGame` win.
- Scores use level base points, progress points, extra progress, final clear
  bonus, final speed bonus, mistake penalties, and duration penalties for
  incomplete runs.
- Top 10 are ordered by score first, then level/progress/time tie-breakers.

Local development:

- Plain `npm run dev` disables the remote API unless
  `VITE_USE_REMOTE_LEADERBOARD=1` is set.
- `npm run dev:vercel` runs through Vercel dev and is the intended local path
  for exercising `api/leaderboard.js`.
- The API needs `DATABASE_URL` or `POSTGRES_URL`.
- `.env*` and `.vercel` are ignored.

## Locked Decisions

- **3D web game:** Three.js + Vite.
- **Planet look:** lavender ocean world, metallic gold islands, soft atmosphere,
  clouds, stars, and a Saturn-style ring. Do not drift back to Earthlike,
  noisy-magenta, or over-lit white.
- **Opening fiction:** the radio speaker is the rebellion, not a generic
  narrator. It gives the player a mission without naming specific mechanics.
- **Vocabulary:** "records" is the current best lead word. Older "memory"
  language still appears in a few places, mostly where it describes the ship's
  restored context.
- **Player memory is fine:** the premise is not player amnesia. The player did
  not witness all work; the record did.
- **Failure model:** the clock is the enemy. Wrong actions cost time/score, not
  hard failure, until the clock hits zero.
- **Level design bar:** each level should make one workflow value obvious by
  doing it, not by explaining it.
- **Title texture:** TV effect is the one approved global overlay. Earlier bezel,
  RGB grille, and rolling bright band treatments were rejected.

## Known Follow-Ups

- Standardize Level 3 continuity with the current 12-job Drone Bay, or
  explicitly frame Level 3 as querying the five major systems rather than every
  Level 2 job.
- Update the in-game Options > Controls panel. It still lists older walking
  island controls even though Level 1 and Level 2 are now fixed interfaces.
- Sweep old source comments and UI copy for "amnesia", "ship AI", "memory",
  and older five-site Level 2 framing where they no longer match the shipped
  fiction.
- Decide whether the leaderboard should support local mock storage for plain
  Vite dev, or keep the current "unavailable without API" behavior.
- Revisit the Archive search level after the main arc has enough accumulated
  record content to make search feel motivated.

## Architecture

```
index.html              # canvas, title screen, HUDs, terminals, end screens
src/style.css           # all UI/HUD/title/terminal/leaderboard/TV styling
src/main.js             # renderer, view manager, shortcuts, level progression
src/titleScreen.js      # title menu, rebellion intro, options, TV/SFX/music
src/planetView.js       # orbit view, planet, ring, stars, landing pin
src/islandView.js       # Level 1 salvage-cannon records and terminal banking
src/fallingProps.js     # Level 1 falling record and wreckage meshes
src/levelOneRecords.js  # Level 1 record summaries and archive continuity rows
src/droneBayView.js     # Level 2 command pass, drones, explain, matching
src/launchView.js       # Level 3 cockpit questions, launch code, liftoff
src/trailRelayView.js   # Level 4 trail relay packets and final leaderboard
src/archiveView.js      # shelved checkpoint search level
src/leaderboard.js      # score calculation and client API helpers
src/leaderboardPanel.js # save-score and top-10 UI
api/leaderboard.js      # Vercel serverless leaderboard API
src/memoryProps.js      # shared beams, ice blocks, checkpoint id helpers
src/debris.js           # older artifact props, still kept for reuse/history
src/terrain.js          # procedural island terrain and water
src/firstPerson.js      # pointer-lock walker used by archived/walkable views
src/overhead.js         # bird's-eye map used by archived/walkable views
src/noise.js            # seeded noise helpers
src/planet.js           # procedural planet maps and land sampling
src/atmosphere.js       # orbit atmosphere shader shell
src/ring.js             # procedural planet ring
src/sfx.js              # sound effects and music ducking hook
```

## Runbook

```bash
npm install
npm run dev
npm run build
```

Main local URL: <http://localhost:5173>.

Shortcuts:

- `?view=island`
- `?view=level2` / `?level=2`
- `?view=level3` / `?level=3`
- `?view=archive`
- `?level=1&end=success` / `?level=1&end=fail`
- `?level=2&end=success` / `?level=2&end=fail`
- `?level=3&end=success` / `?level=3&end=fail`

## History

Repo started as `signalkit`, a Python telemetry CLI, then pivoted to
Planetfall on 2026-06-05. The old code and the design evolution are
recoverable through git history and Entire checkpoints.
