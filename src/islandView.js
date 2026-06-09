import * as THREE from "three";
import { createTerrain } from "./terrain.js";
import { createFirstPerson } from "./firstPerson.js";
import { FRAGMENTS, BUILDERS } from "./debris.js";

// The walkable island level — LEVEL 1 ("First Memories").
//
// A Diner-Dash-style loop, one memory at a time, driven by the REAL workflow
// typed into the ship's terminal:
//   walk up → terminal opens → `git add` (stage) → `git commit` (freeze in ice)
//   → Entire offers to link a checkpoint → press y → ship power ticks up.
// When every memory is linked → run `entire checkpoint list` to review them all.
//
// PRESSURE: a single level countdown runs the whole time. Bank every memory
// before it hits zero, or the un-banked memories melt away and the run fails
// (press R to retry). One clock for the whole level — not per-memory.
//
// Teaching: a commit just freezes the change; linking a CHECKPOINT (the y/n
// offer Entire makes after a commit) is what banks it toward the ship's power.

const INTERACT_DIST = 8;    // how close (XZ) to open a memory's terminal
const TOTAL_TIME = 45;      // seconds to recover & bank EVERY memory (tunable — scary-tight)
const MELT_DUR = 1.8;       // seconds the lost memories take to melt away
const LOW_TIME = 22;        // clock turns urgent (red, pulsing) under this many seconds
const CRIT_TIME = 8;        // clock goes CRITICAL (fast pulse) under this many seconds
const PANIC_TIME = 22;      // the SKY starts shifting toward panic-red under this many seconds
const MEMORY_COUNT = 3;     // calm tutorial: three memories
const BEAM_COLOR = 0xffd27a;

// Sky panic palette — the whole world reddens as the clock runs out.
const SKY_CALM  = new THREE.Color(0x2a2350);  // lavender dusk (the resting sky/fog)
const SKY_PANIC = new THREE.Color(0x6e0f16);  // angry crimson
const FOG_PANIC = new THREE.Color(0x4a0a0e);  // deep blood fog closing in
const DOME_CALM = new THREE.Color(0x3a3168);
const DOME_PANIC = new THREE.Color(0x7a141c);
const SUN_CALM  = new THREE.Color(0xfff1dc);  // warm sun
const SUN_PANIC = new THREE.Color(0xff5a3c);  // hot red alarm light

// Where each memory surfaces on the island (world XZ).
const PLACEMENTS = [
  { x: -34, z: -28 },
  { x: 40, z: -18 },
  { x: 28, z: 38 },
  { x: -30, z: 36 },
];

// What the terminal asks for at each stage of a memory's recovery.
const STEPS = {
  dormant:   { type: "command", cmd: "git add",    accept: ["git add"],    hint: "Stage the recovered memory" },
  recovered: { type: "command", cmd: "git commit", accept: ["git commit"], hint: "Commit it before the clock runs out" },
  frozen:    { type: "confirm", question: "Link this commit to a checkpoint?",
               hint: "Entire offers to capture the session behind this commit" },
};
// After every memory is linked, the player reviews them with this command.
const REVIEW_STEP = {
  type: "command", cmd: "entire checkpoint list", accept: ["entire checkpoint list"],
  hint: "All memories recovered — review what you've banked",
};

function normalizeCmd(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function cmdMatches(input, accepts) {
  const n = normalizeCmd(input);
  return accepts.some((a) => n === a || n.startsWith(a + " "));
}

function makeBeamTexture() {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,210,122,0)");
  g.addColorStop(1, "rgba(255,210,122,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Translucent crystal that encases a memory once it's committed.
function makeIceBlock() {
  const geo = new THREE.IcosahedronGeometry(3.4, 0);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xbfe9ff,
    metalness: 0,
    roughness: 0.06,
    transmission: 0.5,
    thickness: 2.6,
    ior: 1.3,
    transparent: true,
    opacity: 0.62,
    emissive: 0x0a2230,
    emissiveIntensity: 0.35,
    flatShading: true,
  });
  return new THREE.Mesh(geo, mat);
}

// Floating label above a frozen block — the commit trailer Entire stamps on:
//   "Entire-Checkpoint: <12-char hash>" (dim key + bright hash).
function makeIdSprite(id) {
  const c = document.createElement("canvas");
  c.width = 768; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.font = "bold 28px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(111,227,255,0.9)";
  ctx.shadowBlur = 14;

  const key = "Entire-Checkpoint: ";
  const keyW = ctx.measureText(key).width;
  const idW = ctx.measureText(id).width;
  let x = (c.width - (keyW + idW)) / 2;       // center the whole trailer
  ctx.textAlign = "left";
  ctx.fillStyle = "#8fc4dc";                    // dim trailer key
  ctx.fillText(key, x, 34);
  ctx.fillStyle = "#dff3ff";                    // bright hash
  ctx.fillText(id, x + keyW, 34);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  }));
  spr.scale.set(30, 2.5, 1);                    // 12:1 canvas → keep text height
  return spr;
}

// Entire checkpoints get a 12-character hex id (e.g. 711044b1fe29).
function genCheckpointId() {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 12; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

export function createIslandView(renderer, { onExit } = {}) {
  const canvas = renderer.domElement;

  // ---------- scene & sky ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2350); // lavender dusk sky
  scene.fog = new THREE.Fog(0x2a2350, 90, 320);

  const camera = new THREE.PerspectiveCamera(
    62, window.innerWidth / window.innerHeight, 0.1, 2000
  );

  // ---------- lighting (soft, warm sun in a lavender sky) ----------
  scene.add(new THREE.HemisphereLight(0xcdbcff, 0x3a2f5e, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a5a92, 0.3));

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x3a3168, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // ---------- terrain ----------
  const terrain = createTerrain({ size: 200, segments: 220, maxHeight: 26, seed: 1337 });
  scene.add(terrain.mesh, terrain.water);

  // ---------- memories ----------
  const beamTex = makeBeamTexture();
  const artifacts = [];
  FRAGMENTS.slice(0, MEMORY_COUNT).forEach((frag, idx) => {
    const place = PLACEMENTS[idx % PLACEMENTS.length];
    const groundY = terrain.heightAt(place.x, place.z);
    const anchor = new THREE.Group();
    anchor.position.set(place.x, groundY, place.z);

    const model = BUILDERS[frag.kind]();
    model.scale.setScalar(14);
    model.position.y = 1.4;
    anchor.add(model);

    // A tall light beam so the memory is findable from across the island.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        map: beamTex, color: BEAM_COLOR, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        fog: false,
      })
    );
    beam.position.y = 30;
    anchor.add(beam);

    const glow = new THREE.PointLight(BEAM_COLOR, 8, 40, 2);
    glow.position.y = 3;
    anchor.add(glow);

    scene.add(anchor);
    artifacts.push({
      anchor, model, beam, glow, fragment: frag,
      state: "dormant",   // dormant → recovered (staged) → frozen (committed) → checkpointed
      ice: null, idSprite: null, core: null, id: null, iceY: 0,
      melting: false, meltT: 0,   // melt-away animation when the level times out
      bobOff: Math.random() * 10,
    });
  });

  // ---------- first-person controller ----------
  const fp = createFirstPerson(camera, canvas, {
    heightAt: terrain.heightAt,
    radius: terrain.radius * 0.96,
    eyeHeight: 2.6,
    speed: 24,
  });
  scene.add(fp.controls.object);

  // ---------- HUD elements ----------
  const promptEl = document.getElementById("fp-prompt");
  const controlsEl = document.getElementById("fp-controls");
  const crosshair = document.getElementById("crosshair");
  const islandHud = document.getElementById("island-hud");
  const tutorialEl = document.getElementById("tutorial");
  const actionBar = document.getElementById("action-bar");
  const actionBarFill = document.getElementById("action-bar-fill");
  const shipMeter = document.getElementById("ship-meter");
  const shipMeterFill = document.getElementById("ship-meter-fill");
  const shipMeterPct = document.getElementById("ship-meter-pct");
  const ckptCard = document.getElementById("ckpt-card");
  const ccId = document.getElementById("cc-id");
  const ccSummary = document.getElementById("cc-summary");
  const ccAttrFill = document.getElementById("cc-attr-fill");
  const ccAttrText = document.getElementById("cc-attr-text");
  const termEl = document.getElementById("terminal");
  const termHint = document.getElementById("term-hint");
  const termInput = document.getElementById("term-input");
  const termList = document.getElementById("term-list");
  const termMsg = document.getElementById("term-msg");
  const countdownEl = document.getElementById("countdown");
  const countdownTime = document.getElementById("countdown-time");
  const levelFail = document.getElementById("level-fail");

  let target = null;            // nearest memory in range
  let active = false;           // is this view being shown?
  let promptText = null;
  let controlsLocked = null;
  const taught = new Set();
  let tutorialTimer = null;
  let cardTimer = null;
  let msgTimer = null;

  // Terminal state
  let terminalOpen = false;
  let termTarget = null;        // the memory whose terminal is open
  let buffer = "";              // what the player has typed
  let dismissedMemory = null;   // memory the player Esc'd out of (until they leave)
  let reviewMode = false;       // all linked → review with `entire checkpoint list`
  let listShown = false;        // the list has been printed

  // Level countdown — the single source of pressure for the whole run.
  let timeLeft = TOTAL_TIME;
  let timerRunning = false;
  let failed = false;

  const checkpointedCount = () =>
    artifacts.filter((a) => a.state === "checkpointed").length;
  const allLinked = () => checkpointedCount() >= artifacts.length;

  // ---------- HUD helpers ----------
  function setPrompt(text) {
    if (!promptEl || text === promptText) return;
    promptText = text;
    if (text) { promptEl.textContent = text; promptEl.classList.remove("hidden"); }
    else promptEl.classList.add("hidden");
  }
  function hideActionBar() { actionBar.classList.add("hidden"); }

  // ---------- level countdown ----------
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function updateClock() {
    if (countdownTime) countdownTime.textContent = fmtTime(timeLeft);
    countdownEl?.classList.toggle("is-low", timerRunning && timeLeft <= LOW_TIME);
    countdownEl?.classList.toggle("is-critical", timerRunning && timeLeft <= CRIT_TIME);
  }

  // How hard the sky is panicking right now: 0 = calm lavender, 1 = full crimson throb.
  function panicFactor() {
    if (failed) return 1;                         // hold the dread behind the fail screen
    if (!timerRunning || timeLeft > PANIC_TIME) return 0;
    let p = (PANIC_TIME - timeLeft) / PANIC_TIME; // 0 at PANIC_TIME → 1 at 0:00
    p *= p;                                        // eased: barely there early, harsh late
    if (timeLeft <= CRIT_TIME) {                   // throb once it's critical
      const throb = 0.5 + 0.5 * Math.sin(performance.now() / 85);
      p += 0.14 * throb;
    }
    return Math.min(1, p);
  }
  function applyPanicSky() {
    const p = panicFactor();
    scene.background.copy(SKY_CALM).lerp(SKY_PANIC, p);
    scene.fog.color.copy(SKY_CALM).lerp(FOG_PANIC, p);
    dome.material.color.copy(DOME_CALM).lerp(DOME_PANIC, p);
    sun.color.copy(SUN_CALM).lerp(SUN_PANIC, p * 0.85);
  }
  function failLevel() {
    if (failed) return;
    failed = true;
    timerRunning = false;
    closeTerminal(false);
    fp.detach();                  // freeze the player behind the fail screen
    // Un-banked memories always melt; if they ran out the clock on the final
    // `entire checkpoint list` (all banked, not yet reviewed), the whole run melts.
    for (const a of artifacts) {
      if (reviewMode || a.state !== "checkpointed") { a.melting = true; a.meltT = MELT_DUR; }
    }
    countdownEl?.classList.remove("is-low", "is-critical");
    tutorialEl?.classList.add("hidden");
    levelFail?.classList.remove("hidden");
  }
  function resetLevel() {
    failed = false;
    levelFail?.classList.add("hidden");
    if (active) fp.attach();      // movement resumes for the new run
    for (const a of artifacts) {
      if (a.ice) { a.anchor.remove(a.ice); a.ice = null; }
      if (a.idSprite) { a.anchor.remove(a.idSprite); a.idSprite = null; }
      if (a.core) { a.anchor.remove(a.core); a.core = null; }
      a.state = "dormant";
      a.id = null;
      a.melting = false; a.meltT = 0;
      a.model.position.y = 1.4;
      setModelOpacity(a.model, 1);
    }
    reviewMode = false;
    listShown = false;
    dismissedMemory = null;
    shipMeter?.classList.remove("is-full");
    setPower();
    timeLeft = TOTAL_TIME;
    timerRunning = true;
    updateClock();
    showTutorial("New attempt — bank all three memories before the clock hits zero.", 4500);
  }

  function showTutorial(text, ms = 5500) {
    if (!tutorialEl) return;
    clearTimeout(tutorialTimer);
    tutorialEl.textContent = text;
    tutorialEl.classList.remove("hidden");
    if (ms > 0) tutorialTimer = setTimeout(() => tutorialEl.classList.add("hidden"), ms);
  }
  function teachOnce(key, text, ms) {
    if (taught.has(key)) return;
    taught.add(key);
    showTutorial(text, ms);
  }

  function setPower() {
    const pct = Math.round((checkpointedCount() / artifacts.length) * 100);
    if (shipMeterFill) shipMeterFill.style.width = pct + "%";
    if (shipMeterPct) shipMeterPct.textContent = pct + "%";
  }
  function showCard(a, shipPct) {
    if (!ckptCard) return;
    ccId.textContent = a.id;
    ccSummary.textContent = `Recovered: ${a.fragment.title}`;
    ccAttrFill.style.width = shipPct + "%";
    ccAttrText.textContent = `ship ${shipPct}% · you ${100 - shipPct}%`;
    ckptCard.classList.remove("hidden");
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => ckptCard.classList.add("hidden"), 3800);
  }

  function setControls(locked) {
    if (!controlsEl) return;
    if (locked === controlsLocked && !controlsEl.classList.contains("hidden")) return;
    controlsLocked = locked;
    controlsEl.innerHTML = `
      <span class="control-item">
        <span class="control-label">To move</span>
        <span class="arrow-keys" aria-label="Arrow keys">
          <span class="key key-up">↑</span>
          <span class="key key-left">←</span>
          <span class="key key-down">↓</span>
          <span class="key key-right">→</span>
        </span>
      </span>
      ${locked ? `
        <span class="control-item">
          <span class="control-label">To look around</span>
          <span class="mouse-hint">
            <span class="mouse-icon" aria-hidden="true"></span>
            <span>move mouse</span>
          </span>
        </span>
      ` : ""}
      <span class="control-item">
        <span class="control-label">Return to orbit</span>
        <span class="key">B</span>
      </span>
    `;
    controlsEl.classList.remove("hidden");
  }
  function hideControls() {
    controlsLocked = null;
    controlsEl?.classList.add("hidden");
  }

  function setModelOpacity(model, o) {
    model.traverse((n) => {
      if (n.material) { n.material.transparent = o < 1; n.material.opacity = o; }
    });
  }

  // ---------- terminal ----------
  function currentStep() {
    if (reviewMode) return REVIEW_STEP;
    if (!termTarget) return null;
    return STEPS[termTarget.state] || null;
  }
  function renderTerminal() {
    const step = currentStep();
    if (!step) return;

    if (reviewMode && listShown) {
      termHint.textContent = "# entire checkpoint list";
      termInput.textContent = "entire checkpoint list";
      termInput.classList.remove("is-dim");
      termList?.classList.remove("hidden");
      return;
    }
    termList?.classList.add("hidden");

    const tail = step.type === "command" ? `type:  ${step.cmd}` : "press y / n";
    termHint.textContent = step.hint ? `# ${step.hint}   ·   ${tail}` : "";
    if (step.type === "confirm") {
      termInput.textContent = `${step.question}  [y/n]`;
      termInput.classList.add("is-dim");
    } else {
      termInput.textContent = buffer;
      termInput.classList.remove("is-dim");
    }
  }
  function flashTerminal(text, ok) {
    if (!termMsg) return;
    clearTimeout(msgTimer);
    termMsg.textContent = text;
    termMsg.classList.remove("show-ok", "show-err");
    termMsg.classList.add(ok ? "show-ok" : "show-err");
    msgTimer = setTimeout(() => termMsg.classList.remove("show-ok", "show-err"), 2400);
  }
  function openTerminal(a) {
    if (terminalOpen) return;
    terminalOpen = true;
    termTarget = a;
    buffer = "";
    fp.detach();                      // freeze movement; keystrokes feed the terminal
    termMsg?.classList.remove("show-ok", "show-err");
    termList?.classList.add("hidden");
    termEl?.classList.remove("hidden");
    renderTerminal();
  }
  function closeTerminal(dismiss) {
    if (!terminalOpen) return;
    if (dismiss && termTarget) dismissedMemory = termTarget;
    terminalOpen = false;
    termTarget = null;
    buffer = "";
    termEl?.classList.add("hidden");
    if (active) fp.attach();          // resume walking (addEventListener dedupes)
  }
  function submitCommand() {
    const step = currentStep();
    if (!step || step.type !== "command" || listShown) return;
    if (cmdMatches(buffer, step.accept)) {
      buffer = "";
      if (reviewMode) { showCheckpointList(); return; }
      runStep(termTarget);            // dormant → stage, recovered → commit
      flashTerminal("✓ ok", true);
      renderTerminal();
    } else {
      flashTerminal(`command not recognized — try:  ${step.cmd}`, false);
      buffer = "";
      renderTerminal();
    }
  }
  function showCheckpointList() {
    listShown = true;
    timerRunning = false;            // the run is complete — NOW the clock stops
    countdownEl?.classList.remove("is-low", "is-critical");
    if (termList) {
      termList.innerHTML = artifacts.map((a) =>
        `<div class="term-list-row"><span class="tl-id">` +
        `<span class="tl-key">Entire-Checkpoint:</span> ${a.id}</span>` +
        `<span class="tl-title">recovered: ${a.fragment.title}</span></div>`
      ).join("");
    }
    flashTerminal(`${artifacts.length} checkpoints linked · ship fully restored`, true);
    showTutorial("Ship fully restored. Press Esc to close the terminal, then B to return to orbit.", 0);
    renderTerminal();
  }

  // ---------- state transitions ----------
  function runStep(a) {
    if (a.state === "dormant") stage(a);
    else if (a.state === "recovered") commit(a);
  }
  function stage(a) {
    a.state = "recovered";
    teachOnce("staged",
      "Recovered and staged. Run `git commit` to freeze it — the clock is ticking.");
  }
  function commit(a) {
    a.state = "frozen";
    setModelOpacity(a.model, 1);
    const ice = makeIceBlock();
    ice.position.y = a.model.position.y + 0.6;
    a.iceY = ice.position.y;
    a.anchor.add(ice);
    a.ice = ice;
    teachOnce("committed",
      "Committed and frozen — locked in. Now Entire offers to link a checkpoint: press y to capture the session behind this commit.");
  }
  function confirmCheckpoint(yes) {
    const a = termTarget;
    if (!a || a.state !== "frozen") return;
    if (!yes) {
      flashTerminal("declined — without a checkpoint the ship can't track this commit. re-approach to link it.", false);
      closeTerminal(true);
      return;
    }
    checkpoint(a);
    if (allLinked()) {
      reviewMode = true;             // clock KEEPS running — the list is the finish line
      shipMeter?.classList.add("is-full");
      showTutorial("All banked! Now type `entire checkpoint list` before the clock hits 0:00 — hurry!", 0);
      renderTerminal();              // stay open → review step
    } else {
      closeTerminal(false);
    }
  }
  function checkpoint(a) {
    a.state = "checkpointed";
    a.id = genCheckpointId();
    const shipPct = 62 + Math.floor(Math.random() * 23); // 62–84%

    if (a.ice) {
      a.ice.material.emissive.setHex(0x2a6c8a);
      a.ice.material.emissiveIntensity = 1.1;
      const core = new THREE.PointLight(0x8fe3ff, 6, 26, 2);
      core.position.copy(a.ice.position);
      a.anchor.add(core);
      a.core = core;
    }
    const spr = makeIdSprite(a.id);
    spr.position.y = a.iceY + 5;
    a.anchor.add(spr);
    a.idSprite = spr;

    showCard(a, shipPct);
    setPower();
    teachOnce("checkpointed",
      "Checkpoint linked — Entire stamps it onto the commit via an `Entire-Checkpoint` trailer, and ship power rose.");
  }

  // ---------- input ----------
  function onCanvasClick() {
    if (active && !fp.isLocked) fp.lock();
  }
  function onKeyDown(e) {
    if (!active) return;

    // The run failed — only R (retry) does anything.
    if (failed) {
      if (e.code === "KeyR") { resetLevel(); e.preventDefault(); }
      return;
    }

    // While the terminal is open, all keys feed it.
    if (terminalOpen) {
      if (e.code === "Escape") {
        // No bailing on the final review — the clock is still ticking.
        if (reviewMode && !listShown) { e.preventDefault(); return; }
        closeTerminal(true); e.preventDefault(); return;
      }
      if (reviewMode && listShown) { e.preventDefault(); return; } // only Esc closes the list

      const step = currentStep();
      if (step?.type === "confirm") {
        if (e.key === "y" || e.key === "Y") { confirmCheckpoint(true); e.preventDefault(); return; }
        if (e.key === "n" || e.key === "N") { confirmCheckpoint(false); e.preventDefault(); return; }
        e.preventDefault();
        return;
      }
      // command mode
      if (e.code === "Enter") { submitCommand(); e.preventDefault(); return; }
      if (e.code === "Backspace") { buffer = buffer.slice(0, -1); renderTerminal(); e.preventDefault(); return; }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
        renderTerminal();
        e.preventDefault();
      }
      return;
    }

    // Walking around (terminal closed).
    if (e.code === "Escape" && fp.isLocked) fp.unlock();
    if (e.code === "KeyB") onExit?.();
  }
  fp.controls.addEventListener("lock", () => crosshair?.classList.remove("hidden"));
  fp.controls.addEventListener("unlock", () => crosshair?.classList.add("hidden"));

  // ---------- HUD per-frame ----------
  function refreshHud() {
    if (terminalOpen) {
      setPrompt(null);
      hideControls();
      hideActionBar();
      return;
    }
    setControls(fp.isLocked);
    hideActionBar();
    if (!fp.isLocked) { setPrompt("Click to look around"); return; }
    if (listShown) { setPrompt("Ship fully restored — press B to return to orbit"); return; }
    setPrompt("Find the surfacing memory");
  }

  // ---------- per-frame ----------
  function update(dt, t) {
    fp.update(dt);

    // Level countdown — one clock for the whole run.
    if (active && timerRunning && !failed) {
      timeLeft = Math.max(0, timeLeft - dt);
      updateClock();
      if (timeLeft <= 0) failLevel();
    }
    applyPanicSky();   // the sky reacts to the clock every frame

    // Nearest memory within reach (ignoring height).
    let nearest = null, nd = Infinity;
    for (const a of artifacts) {
      const dx = camera.position.x - a.anchor.position.x;
      const dz = camera.position.z - a.anchor.position.z;
      const d = Math.hypot(dx, dz);
      if (d < nd) { nd = d; nearest = a; }
    }
    target = nd <= INTERACT_DIST ? nearest : null;

    // Auto open/close the ship's terminal as you reach a memory.
    // (In review mode the terminal is driven manually, so leave it alone.)
    if (active && !reviewMode && !failed) {
      if (dismissedMemory && target !== dismissedMemory) dismissedMemory = null;
      const canOpen = target && target.state !== "checkpointed" && target !== dismissedMemory;
      if (canOpen && !terminalOpen) openTerminal(target);
      else if (!canOpen && terminalOpen) closeTerminal(false);
    }

    for (const a of artifacts) {
      // Melting away after a time-out — sink and fade, then disappear.
      if (a.melting) {
        a.meltT = Math.max(0, a.meltT - dt);
        const k = a.meltT / MELT_DUR;
        setModelOpacity(a.model, k);
        a.model.position.y -= dt * 2.4;
        if (a.ice) a.ice.material.opacity = 0.62 * k;
        a.beam.visible = false;
        a.glow.visible = false;
        continue;
      }

      const encased = a.state === "frozen" || a.state === "checkpointed";

      // Idle spin/bob until the memory is encased in ice.
      if (!encased) {
        a.model.rotation.y += dt * 0.6;
        a.model.position.y = 1.4 + Math.sin((t + a.bobOff) * 1.5) * 0.4;
        setModelOpacity(a.model, 1);
      }

      // Beam + glow: bright while findable, gone once frozen.
      const lit = a.state === "dormant" || a.state === "recovered";
      let o = 0;
      if (a.state === "dormant") o = 0.4 + Math.sin(t * 2) * 0.12;
      else if (a.state === "recovered") o = 0.22;
      a.beam.material.opacity = o;
      a.beam.visible = o > 0.01;
      a.glow.visible = lit;
    }

    if (terminalOpen) renderTerminal(); // reflect fade-driven state changes
    if (active) refreshHud();
  }

  // ---------- lifecycle ----------
  function enter() {
    active = true;
    fp.attach();
    fp.groundAt(0, terrain.radius * 0.75);
    camera.lookAt(0, terrain.heightAt(0, 0) + 6, 0);
    canvas.addEventListener("click", onCanvasClick);
    window.addEventListener("keydown", onKeyDown);
    islandHud?.classList.remove("hidden");
    setControls(false);
    crosshair?.classList.add("hidden");
    setPower();
    if (listShown) {                // truly done — the list has been run
      timerRunning = false;
      showTutorial("Ship fully restored — press B to return to orbit.", 0);
    } else if (failed) {
      resetLevel();                 // came back after a wipe → fresh run
    } else {
      timerRunning = true;          // start (or resume) the level clock
      if (reviewMode) {             // resume the timed final review
        openTerminal(artifacts[0]); // termTarget unused in review; reopens the prompt
        showTutorial("Type `entire checkpoint list` before the clock hits 0:00!", 0);
      } else {
        showTutorial("Memories are surfacing — the clock's short. Bank all three before 0:00!", 6500);
      }
    }
    updateClock();
    applyPanicSky();   // start on the right sky (calm unless we resumed low on time)
  }
  function exit() {
    active = false;
    timerRunning = false;           // pause the clock while in orbit
    closeTerminal(false);
    fp.unlock();
    fp.detach();
    canvas.removeEventListener("click", onCanvasClick);
    window.removeEventListener("keydown", onKeyDown);
    setPrompt(null);
    hideControls();
    hideActionBar();
    tutorialEl?.classList.add("hidden");
    ckptCard?.classList.add("hidden");
    termEl?.classList.add("hidden");
    levelFail?.classList.add("hidden");
    islandHud?.classList.add("hidden");
    crosshair?.classList.add("hidden");
  }
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { scene, camera, update, enter, exit, resize };
}
