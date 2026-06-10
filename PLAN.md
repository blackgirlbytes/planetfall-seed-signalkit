# Planetfall — Plan & Status

_Last updated: 2026-06-10_

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

## Level 2 design — "The Drone Bay" (agreed 2026-06-10, built 2026-06-10)

**Design rule (user, 2026-06-09): one new command per level, and it must
visibly show the value of checkpoints.** Level 2's command is
**`entire checkpoint explain`**. Nothing else is new.

After playtesting the built Archive level (below), Rizel stepped back to first
principles: ground each level in the day-to-day agentic workflow. The daily
arc is **delegate → review → accept**, and the game had no agent in it. So
Level 2 puts the player on the review side of delegation — the one part of
the loop only the human does.

### The fiction
The ship is broken into **5 systems**, each a damaged work site scattered
across the island: ignition coils, nav core, long-range antenna, life support
scrubbers, landing struts. The ship gives you a **drone bay with 5 drones**
(one per job — no economy, no earning). Drones fix things fast, but the ship
won't power up work nobody can account for.

### The loop (one countdown for the whole level)
1. **Assign**: walk to a broken site, press E → a drone flies out and works
   on it (visible work beam / sparks). You're free immediately.
2. **Player's choice**: babysit one drone at a time, or sprint site-to-site
   launching the whole fleet. Nothing forces parallelism — the clock makes it
   the obviously rational move (same principle as search: the tool isn't a
   gate, it's the rational choice). Five beams running at once while you do
   nothing is the level's money shot.
3. **Drone finishes** → the site seals under a checkpoint id. You weren't
   there; you don't know what it did.
4. **Review**: walk up to a finished site → the terminal opens **pre-filled**
   with `entire checkpoint explain <id>` — press Enter (no typing ids; you
   still SEE that real explain takes an id). A story card shows what was
   actually done: "replaced coolant pump · 3 attempts · 2 parts scavenged".
5. **Accept**: an **ADD TO SHIP** confirm appears (Y, matching L1's confirm
   beat) → that system comes online, ship meter +20%.
6. **Finish line**: the FIFTH accept keeps the terminal open — the next
   command happens at the prompt you're already at, like the real CLI. Type
   `entire dispatch` ("generate a dispatch summarizing recent agent work" —
   five drones just worked; the report writes itself from the checkpoints).
   `entire checkpoint list` still works there as an optional L1 callback and
   nudges you to dispatch. (Changed 2026-06-10 from "walk back to the console
   and run `list`" — Rizel couldn't find the console at the end; a final
   fetch-quest was friction, not tension, and dispatch is the truer end-of-day
   command. If the player wanders off, any online system or the bay console
   reopens the report prompt.)

Fail = clock hits 0:00 before all five are accepted → R to retry.

### Deliberately NOT in Level 2
No bad/botched drone work (no deduction, nothing to compare — explain is the
gate to the ADD TO SHIP button, not a puzzle), no drone management or upgrade
mechanics (more drones = parallelism, never new mechanics), no typing
checkpoint ids, no values to extract from explanations. The "one drone did it
wrong — find it" twist is reserved as a possible later level once this loop
is proven.

### The upgrade table (drones don't repair — they IMPROVISE)
The transformation is what makes you *need* the explanation: you left a bent
dish, you come back to a lance pointed at the sky — "what did you DO?" is the
urge `explain` exists to satisfy.

| System (broken) | Becomes | Explain card flavor |
|---|---|---|
| Ignition coils (charred leaning stack) | **Plasma Ring** — floating gold torus | "coils beyond saving — rebuilt as a plasma ring from salvaged hull plate · 2 attempts" |
| Nav core (cracked dark gyro) | **Star Dome** — projected starfield + orbiting ring | "core unrecoverable — remapped from scratch; starfield calibrated to the lavender belt" |
| Long-range antenna (dish face-down in the dirt) | **Signal Spire** — lance firing a beam to orbit | "dish unsalvageable — respun the mast into a spire · 3 attempts · the first two fell over" |
| Life support scrubbers (rusty vent box) | **Garden Pod** — glass dome, glowing plants | "filters dead — replaced with a living filter; two vines scavenged from the crash" |
| Landing struts (collapsed leg) | **Grav Skid** — hover pad bobbing over a glow ring | "strut seized solid — swapped for grav skids; technically the ship floats now" |

Visual grammar (status readable from across the island via beam color):
amber beam = broken (blinking red warn bulb up close) → cyan pulsing beam +
hovering drone + work beam = drone at work → ice-blue beam + L1-style ice
seal + floating checkpoint id = finished, review me → no beam = accepted
(the upgrade itself is the landmark; ice melts, animations wake up).

### The teaching, felt not told
What the level actually shows (Rizel's framing, 2026-06-10 — keep it this
way): **you can have multiple agents working in parallel, see what work each
one did, and get a summary at the end.** Sending a drone (E) is one button —
delegation is demonstrated as spectacle, not taught; ADD TO SHIP is just the
gate that makes reading the explanation non-skippable. The two things the
player genuinely learns are the commands: `entire checkpoint explain` (see
what an agent did while you weren't watching — the level's one taught
mechanic) and `entire dispatch` (the day, summarized — a ceremonial closer
with nothing to learn, the role `list` played in L1). Arc: L1 — bank it.
L2 — agents work, you can always see and summarize what they did.
Search/rewind/recap reserved for later levels, by which point the checkpoint
history will have grown naturally.

### Implementation (2026-06-10)
Lives in `src/droneBayView.js`; HUD block `#db-hud` in `index.html`; styles
share L1's countdown/briefing/fail selectors. The shelved Archive level stays
fully playable at `?view=archive`; `?view=level2` / `?level=2` and the
post-L1 glitching pin now route to the Drone Bay. Specifics:
- 5 sites + 5 parked drones by the console (bay row at z=50, heights
  node-verified). Drones arc to the site (~26 u/s), hover-orbit while
  working (`WORK_TIME` 18s), then fly home. Work continues while the player
  is elsewhere — that's the point.
- One 150s clock (`TOTAL_TIME`); serial play (~35s/system × 5) can't beat it,
  the fleet can. Same panic-sky as L1.
- Fleet status panel (top-left): BROKEN / DRONE AT WORK / READY TO REVIEW /
  ONLINE per system.
- Review terminal auto-opens at a sealed site, pre-filled with
  `entire checkpoint explain <id>` — Enter runs it (no id typing), card rows
  print, then a green **ADD TO SHIP** button (clickable; Y also works).
- Finish line: the fifth accept rolls the same terminal into report mode;
  typed `entire dispatch` prints the day report (5 upgrades, "crew: 1 human,
  5 drones"), then the win screen. `entire checkpoint list` optional there.
- Fail at 0:00 → R resets everything (sites, drones, clock).
- Bird's-eye map (M, `src/overhead.js`) on all island levels — top-down
  camera + you-are-here arrow, walking still works, terminals open over it.

## Level 3 design — "Launch Clearance" (agreed + built 2026-06-10 — name TBD, pending playtest)

The final level. Designed across two sessions on 2026-06-10 (the morning
session's "anomaly squashing" draft evolved into this; rejected on the way:
"The Other Ship" dead-crew mystery — "good story but far too many details",
raw search box-checking — "eh", and symptom-matching — "how would they know").
Simplicity bar (Rizel): GitHub's Bug Bash — "all they do is squash bugs and
pick up lifepoints. simplicity."

**The aha to deliver** (modeled on a real moment: Claude answered "what were
the level 3 plans?" from this repo's own checkpoint transcripts): you're asked
a question you provably can't answer from memory, and the record answers it.
L2 already manufactured the situation — the subagents worked while you weren't
watching. **Arc: L1 — bank your work. L2 — subagents work while you don't
watch. L3 — someone asks about that work; you weren't there, the record was.**

### The fiction
The ship is repaired — now it has to fly. The player is **inside the ship,
in the pilot's chair** (first time aboard; alone signals "finale"). The launch
computer won't arm on work nobody can account for — the same rule the ship
enforced in L2, escalated to takeoff. The questioner is the **ship's AI: the
amnesiac from Level 1**, verifying against the memory the player banked for
it. First scene and last scene are the same character, before and after.
Briefing line (approved verbatim, keep it):

> "I can read the record. Protocol says you have to be the one to confirm it."

### The loop (whole level at one console — no walking)
~5 questions under one clock, constant shape, two clicks each:
1. A question appears in plain words — answerable **only from the record**:
   "The antenna repair — how many attempts did it take?"
2. The terminal offers **~3 tools as multiple choice** (click / number key) —
   e.g. `entire checkpoint explain <id>` / Skill: *what-happened* /
   `entire dispatch`.
3. It runs **visibly**, answering in that tool's voice: raw command → the full
   record card; a skill → visibly runs the command, then one plain sentence
   (the skills pitch, demonstrated not explained).
4. **Answer chips** ([2] [3] [5]) — the answer is on screen in the output.
   Zero typing, zero keyword guessing, zero memory.
5. Correct → a **launch-code segment locks** (▣ ▣ □ □ □), the system audibly
   arms in the cabin, the matching upgrade flares out on the island. Wrong →
   the card stays up, the clock keeps eating, click again.
6. 5/5 → code complete → countdown → **liftoff = the game's ending** (planet
   falls away, the labeled upgrades shrinking below). Win screen carries
   `npx skills add https://github.com/entireio/skills`.

Fail = launch window missed at 0:00 → R to retry.

### Tool-menu rules (Rizel's locked preferences)
- **Mostly ALL VALID, occasional dead end.** Usually 2 of 3 options genuinely
  answer it in different voices; one is a polite dead end that prints
  real-but-unhelpful output and costs only clock seconds (e.g. picking
  `explain` when you don't know *which* checkpoint — the fizzle teaches the
  search-vs-explain boundary). Never a fail state at the menu.
- **Menus ROTATE by question type** (never the same trio twice): what
  happened at one site → `explain` / Skill: *what-happened*; don't-know-where
  → `search` (the keyword comes from the question, never guessed — redeems
  the shelved Archive); order/when → `list` / `activity`; handoff flavor →
  Skill: *session-handoff* / *teach*; finale → `dispatch` (ceremonial closer,
  maybe no menu at all).
- **Small cast:** ~2–3 skills + 3–4 commands across the whole level — "we
  dont have to use every skill"; 11 skills would be a product tour.
- Possible easing: auto-run the tool on Q1–2, introduce the menu on Q3–5.

### Deliberately NOT in Level 3
No typed search words, no free-text answers, no remembering things seen once
(every answer is on screen at the moment of choice), no fault-finding/blame
mechanic, no new mechanics past the two-click beat. Skills repo lives at
`~/Documents/work/skills` (11 skills) — only a few appear.

### Open knobs (decide at build/playtest)
- Level name ("Launch Clearance" is a placeholder).
- Question count (~5) and which question types make the cut.
- The "discrepancy" question — one answer that surprises the player (grav
  skids: "torque spec: vibes") — safe cousin of the reserved "one drone did
  it wrong" twist. In or out?
- Trade-off to playtest: this is the least game-bodied level (terminal +
  cabin, island as backdrop) — fits the operator→delegator graduation, but
  compare against a variant with one short walk per question if it feels flat
  after the Drone Bay.
- How the cabin/console is staged in 3D (new interior view vs. dressed-up
  terminal overlay).

### Implementation (2026-06-10)
Lives in `src/launchView.js`; HUD block `#lc-hud` in `index.html`; styles
share the countdown/briefing/win/fail selector groups. `?view=level3` /
`?level=3` dev shortcut; L2's `entire dispatch` (onComplete) opens the launch
window — the orbit pin then boards the ship. Build decisions on the knobs:
- **Staging:** fixed cockpit rig above the bay (eye height 19, node-verified
  sightlines to all five upgrades), simple slab window frame + glowing dash
  glued to the camera, idle sway. The L2 upgrades stand on the island, alive
  (exported `SYSTEMS` + `UPGRADE_BUILDERS` from droneBayView).
- **5 questions:** antenna attempts (explain / what-happened / dispatch dead
  end), hull plate (search / recall / explain dead end), record count (list /
  recall / search dead end), why-the-ship-floats — the discrepancy question
  IS in (explain / what-happened / list dead end), then `entire dispatch`
  files the flight log (single pre-filled Enter, ceremonial).
- Confirm → gold beam flare at that system + a launch-code segment locks
  (shows the checkpoint's first hex). Wrong chip: dimmed, clock keeps eating.
  Dead-end tool: output prints, option struck through, try another.
- Liftoff: ~9s climb-out — island falls away, sky lerps to space, stars fade
  in — then the LIFTOFF win screen with the `npx skills add` line.
- One 150s window (`TOTAL_TIME`), same low/critical/panic-sky grammar as
  L1/L2; fail = LAUNCH WINDOW MISSED → R resets everything.

## Level ? design — "The Archive" (built 2026-06-09, SHELVED for a later level)

Built as Level 2, then shelved 2026-06-10 after a playtest: the story carried
too much weight ("meh, it just feels like too much") and search is a
weeks-later pain, not a day-to-day one. The implementation is kept intact in
`src/archiveView.js`, playable at `?view=archive` — it should return as a
later search level, by which point the player's checkpoint history (incl.
drone work) will have grown enough that search needs no lore-dump. Its
command was **`entire checkpoint search`**.

Rejected on the way here (kept for the record so we don't re-tread):
- An elaborate "corruption" level teaching search + explain + rewind with
  clue-hunting, decoy checkpoints, and a spreading corruption zone — **too many
  variables to consume at once**.
- `rewind` as the L2 command — in the simple framings it kept mis-modeling the
  tool (reading as "restore from backup" when real rewind means "take my
  *current* state back to a save point; the bank itself is never at risk").
- `recap` — L1's three collected items don't warrant a recap; manufacturing the
  need (more items, mixed states, a blackout) was creeping back toward
  variable-overload.

### The fiction
Level 1's win restored the ship's memory — side effect: the ship's **entire
pre-crash checkpoint archive surfaces**. The island is now dotted with ~20
identical dark frozen memories (ice blocks, no beams, unreadable from a
distance). Most were never grabbed by the player — the corpus is deliberately
**bigger than your head**, because that's the situation search exists for.
The player's 3 L1 checkpoints can appear in the archive as a continuity touch.

### The loop (×3, one countdown clock for tension)
1. **The ship asks** for a memory in a plain sentence that contains the
   keyword: *"I need the memory of the **ignition sequence**."* (No clue
   hunting — the search word is right there in the request.)
2. **Player types** `entire checkpoint search "ignition"` at the terminal.
3. **The matching block's beam lights up** across the island — the money shot:
   a dark field, one typed word, one light. (In L1 the game lit the beams for
   you; in L2 nothing lights until YOU search.)
4. **Sprint over, press E** → memory transmits to the ship, power meter
   climbs, next request.

Wrong/misspelled word → 0 results, no penalty except the ticking clock (which
is exactly the real-world cost of bad search terms). Searching by walking the
field and inspecting blocks one-by-one stays *possible* but ruinously slow —
the tool isn't a gate, it's the obviously rational move.

The teaching, felt not told: **your history quickly outgrows your memory;
you remember a *word*, not a place — search turns the word into the moment.**
Arc so far: L1 — bank it. L2 — search it. (recap / dispatch / resume / rewind
reserved for later levels.)

### Deliberately NOT in Level 2
No clue collection, no decoy results, no timestamps, no `explain`, no rewind
browser, no new artifact states. The ~20 archive blocks are set dressing, not
state to track. Retrieval is a plain E-grab — the level's typing effort lives
in the search command itself (leaning: keep it that simple rather than rerun
L1's add/commit beat per item; revisit after a playtest).

### Implementation (2026-06-09)
Lives in `src/archiveView.js` (the abandoned corruption level was stripped;
kept from that work: `src/memoryProps.js`, the `onComplete` hook in
`islandView.js`, the `#fp-shared` HUD split, the glitching-pin entry after L1
completes, and the `?view=level2` / `?level=2` dev shortcuts). Specifics:
- **21 archive blocks** (3 targets + 15 old-crew checkpoints + the 3 L1
  recoveries with the dev-scaffold ids), scattered deterministically on dry
  land (seeded RNG, min spacing, never in the sea or on the console).
- Blocks are dark and anonymous; an id sprite appears only when lit, grabbed,
  or walked up close (~18u) — browsing on foot stays possible but slow.
- The ship's request panel (top-left, under the clock) holds the keyword in a
  plain sentence. Terminal (gold beam, auto-opens like L1) accepts
  `entire checkpoint search "<word>"` and `entire checkpoint list` (prints all
  21 — "too many to read" — the why-search-exists beat).
- Search lights every match's cyan beam (previous search goes dark); E on the
  requested block transmits it (warm gold); E on a lit-but-wrong block costs
  only the re-read. 0 results cost only clock.
- One 90s countdown (tunable `TOTAL_TIME`), same panic-sky as L1, fail = R to
  retry, win = "ARCHIVE LINKED" + B to orbit.

## Architecture / where things live

```
index.html         # canvas + HUD + crossfade overlay + FP prompt + panel + loader
src/style.css      # HUD / panel / loader / fade / crosshair / FP-prompt styling
src/main.js        # VIEW MANAGER: owns renderer + resize + shared panel + the
                   #   render loop; crossfades between the two views.
                   #   ?view=island jumps straight onto the island (dev aid).
src/planetView.js  # orbit view: scene/lighting/stars/planet/clouds/atmo/ring +
                   #   the clickable gold landing hotspot. onIslandClick callback.
src/islandView.js  # LEVEL 1: sky/light, terrain+water, the memories, terminal
                   #   loop, countdown. enter()/exit()/onExit/onComplete.
src/droneBayView.js# LEVEL 2 ("The Drone Bay"): 5 broken systems, 5 drones,
                   #   pre-filled `entire checkpoint explain` + ADD TO SHIP.
                   #   Exports SYSTEMS + UPGRADE_BUILDERS for Level 3.
src/launchView.js  # LEVEL 3 ("Launch Clearance"): cockpit finale at one
                   #   console — ship AI asks, pick the tool (1/2/3), confirm
                   #   the answer, launch code fills, liftoff = the ending.
src/archiveView.js # SHELVED search level ("The Archive"), at ?view=archive:
                   #   ~21 dark blocks, ship requests, checkpoint search beat.
src/memoryProps.js # shared props: beam texture, ice block, id sprite, id gen
src/overhead.js    # bird's-eye map toggle (M) for all island levels: fixed
                   #   top-down camera + gold you-are-here arrow; walking
                   #   still works while overhead (fp alwaysMove flag)
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
